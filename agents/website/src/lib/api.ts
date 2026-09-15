import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
if (!API_URL) throw new Error('NEXT_PUBLIC_API_URL is not set — add it to .env.local');
const baseURL = API_URL;

const api = axios.create({
    baseURL,
    withCredentials: true,
});

function getCsrfToken(): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/(?:^|;\s*)rp_csrf=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

const CSRF_SAFE = new Set(['get', 'head', 'options']);
api.interceptors.request.use((config) => {
    const method = (config.method ?? 'get').toLowerCase();
    if (!CSRF_SAFE.has(method)) {
        const csrf = getCsrfToken();
        if (csrf) {
            config.headers = config.headers ?? {};
            config.headers['X-CSRF-Token'] = csrf;
        }
    }
    return config;
});

/** Returns true if the JWT stored in token string is expired or malformed */
export function isTokenExpired(token: string | null): boolean {
    if (!token) return true;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return Date.now() >= payload.exp * 1000;
    } catch {
        return true;
    }
}

// Redirect to login with ?expired=1 when backend returns 401.
// Guards:
//   1. Never redirect from the login page itself (would thrash ?expired=1 in a loop).
//   2. Only treat the 401 as auth-failure if the FAILING request targets the same auth
//      system as the current page. A /user/me 401 from an agent-portal page should NOT
//      kick the partner to /agent/login — that endpoint uses a different JWT (user_token)
//      and its failures are independent of partner auth.
if (typeof window !== 'undefined') {
    api.interceptors.response.use(
        (response) => response,
        (error) => {
            if (error.response?.status === 401) {
                const path = window.location.pathname;
                // Extract the failing request URL (relative to baseURL)
                const failedUrl: string = error.config?.url || '';
                const agentAuthScope = /^\/?(agent|api|auth)\b/;
                const builderAuthScope = /^\/?(builder|api|auth)\b/;

                const onAgentLogin = path === '/agent/login';
                const onBuilderLogin = path === '/builder/login';

                if (path.startsWith('/agent') && !onAgentLogin && agentAuthScope.test(failedUrl)) {
                    window.location.href = `/agent/login?expired=1`;
                } else if (path.startsWith('/builder') && !onBuilderLogin && builderAuthScope.test(failedUrl)) {
                    window.location.href = `/builder/login?expired=1`;
                }
            }
            return Promise.reject(error);
        }
    );
}

/** Prepend API base URL to relative media paths (uploads/...) */
export function getMediaUrl(path: string | undefined | null): string {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const clean = path.startsWith('/') ? path : `/${path}`;
    return `${baseURL}${clean}`;
}

/** Check if a media URL is a video file */
export function isVideoUrl(url: string | undefined | null): boolean {
    if (!url) return false;
    return /\.(mp4|webm|ogg|mov|avi|mkv)(\?|$)/i.test(url);
}

/** Filter media_urls to only return image URLs (skip videos) */
export function getImageUrls(mediaUrls: string[] | undefined | null): string[] {
    if (!mediaUrls) return [];
    return mediaUrls.filter(url => !isVideoUrl(url));
}

export interface ClassificationItem {
    id: string;
    name: string;
    slug: string;
    icon?: string | null;
    display_order?: number;
    is_active?: boolean;
    labels_json?: Record<string, string> | null;
    validation_rules?: Record<string, boolean> | null;
}

export interface CategoryWithChildren extends ClassificationItem {
    sub_categories: SubCategoryWithChildren[];
    _count?: { inventory: number };
}

export interface SubCategoryWithChildren extends ClassificationItem {
    category_id: string;
    property_types: ClassificationItem[];
    _count?: { inventory: number };
}

export interface ClassificationTree {
    categories: CategoryWithChildren[];
    configurations: ClassificationItem[];
    usage_types: ClassificationItem[];
    investment_types: ClassificationItem[];
}

export interface Property {
    id: string;
    slug?: string | null;
    display_id?: string;
    category: string;
    type: string;
    specs: Record<string, any> | null;
    features: Record<string, any> | null;
    location: string | null;
    price: number | null;
    price_unit: string | null;
    status: string;
    intent: string;
    media_urls: string[];
    video_urls?: string[];
    created_at: string;
    updated_at?: string;
    owner_name?: string;
    // Detail fields (returned by /properties/:id)
    description?: string | null;
    furnishing?: string | null;
    floor_number?: number | null;
    floor_label?: string | null;
    display_floor?: string | null;
    total_floors?: number | null;
    facing?: string | null;
    property_age?: string | null;
    city?: string | null;
    locality?: string | null;
    state?: string | null;
    pincode?: string | null;
    apartment_name?: string | null;
    is_enriched?: boolean;
    renovated?: boolean;
    roof_rights?: boolean;
    pre_rented?: boolean;
    pre_rented_monthly_rent?: number | string | null;
    district?: string | null;
    ownership_type?: string | null;
    save_count?: number;
    // Classification labels
    property_category?: { name: string; slug: string; icon?: string } | null;
    property_sub_category?: { name: string; slug: string; icon?: string } | null;
    property_type_link?: { name: string; slug: string } | null;
    property_configuration?: { name: string; slug: string } | null;
    usage_type?: { name: string; slug: string } | null;
    investment_type?: { name: string; slug: string } | null;
    // Canonical taxonomy (2026-06-04) — the SoT for the property's type label.
    taxonomy_node?: { id: string; name: string; slug: string } | null;
    needs_taxonomy_review?: boolean;
    flat_property_type?: { name: string; main_category?: string } | null;
    // New fields added in Phase 1
    sub_locality?: string | null;
    listed_by?: string | null;
    uploader_name?: string | null;
    assigned_agent?: { name: string; phone?: string } | null;
}

export interface PublicStats {
    totalProperties: number;
    totalLocations: number;
    totalClients: number;
}

export interface ContactFormData {
    name: string;
    phone: string;
    email?: string;
    message?: string;
    property_id?: string;
    intent?: string;
}

export interface LeadData {
    name?: string;
    phone?: string;
    email?: string;
    interest?: string;
    source?: string;
    page_url?: string;
    user_agent?: string;
    cookie_consent?: boolean;
}

// PHASE 7: Lead Requirements (standardized capture)
export interface LeadRequirementsData {
    intent: 'buy' | 'rent_lease';
    taxonomy_node_id?: string;                                  // canonical node (preferred)
    category?: 'residential' | 'commercial' | 'agricultural';   // legacy fallback
    type_slug?: string;                                         // legacy fallback
    budget_min?: number;
    budget_max?: number;
    budget_type?: 'one_time' | 'per_month';
    location: string;
    name?: string;
    phone?: string;
    email?: string;
    amenities?: string[];
    source?: string;
}

export interface LeadRequirementsResponse {
    success: boolean;
    contact_created: boolean;
    contact_phone?: string;
    matches: any[];
    total_matches?: number;
    message: string;
}

export interface FlatPropertyType {
    id: string;
    name: string;
    slug: string;
    main_category: string;
    icon?: string | null;
    display_order: number;
    bhk_required: boolean;
    floor_required: boolean;
    plot_area_required: boolean;
}

export interface NewsletterData {
    email: string;
    name?: string;
    source?: string;
}

export interface ScheduleVisitData {
    property_id: string;
    name: string;
    phone: string;
    email?: string;
    preferred_date?: string;
    preferred_time?: string;
    message?: string;
}

export interface Testimonial {
    id: string;
    name: string;
    location: string;
    rating: number;
    text: string;
    date: string;
}

export interface LocationItem {
    name: string;
    count: number;
}

// Classification
export const getClassificationTree = async (): Promise<ClassificationTree> => {
    const res = await api.get('/public/master/tree');
    return res.data;
};

export const getCategories = async (): Promise<CategoryWithChildren[]> => {
    const res = await api.get('/public/master/categories');
    return res.data;
};

export const getSubcategories = async (categoryId: string): Promise<SubCategoryWithChildren[]> => {
    const res = await api.get(`/public/master/categories/${categoryId}/subcategories`);
    return res.data;
};

export const getPropertyTypes = async (subCategoryId: string): Promise<ClassificationItem[]> => {
    const res = await api.get(`/public/master/subcategories/${subCategoryId}/types`);
    return res.data;
};

export const getConfigurations = async (): Promise<ClassificationItem[]> => {
    const res = await api.get('/public/master/configurations');
    return res.data;
};

export const getUsageTypes = async (): Promise<ClassificationItem[]> => {
    const res = await api.get('/public/master/usage-types');
    return res.data;
};

export const getInvestmentTypes = async (): Promise<ClassificationItem[]> => {
    const res = await api.get('/public/master/investment-types');
    return res.data;
};

export const getSubCategoryDetail = async (id: string): Promise<ClassificationItem> => {
    const res = await api.get(`/public/master/subcategories/${id}`);
    return res.data;
};

// Canonical taxonomy (Phase 1a) — used by the post-property chat type picker (Phase 1d v2)
export interface TaxonomyTreeNode {
    id: string;
    name: string;
    slug: string;
    node_kind: string;
    children: TaxonomyTreeNode[];
}
export const getTaxonomyTree = async (): Promise<TaxonomyTreeNode[]> => {
    const res = await api.get('/public/taxonomy/tree');
    return res.data?.tree ?? [];
};

// Per-type field schema (drives the dynamic sidebar filters for a selected taxonomy node).
export interface TaxonomyNodeField {
    key: string;
    label: string;
    input_type: string; // 'select' | 'multiselect' | 'number' | 'text' | 'parking_list' | ...
    required: boolean;
    options: string[] | null;
    unit: string | null;
}
export const getNodeFields = async (nodeId: string): Promise<TaxonomyNodeField[]> => {
    const res = await api.get(`/public/taxonomy/nodes/${nodeId}/fields`);
    return res.data?.fields ?? [];
};

// Properties
export const getProperties = async (params?: {
    location?: string;
    type?: string;
    category?: string;
    intent?: string;
    category_id?: string;
    sub_category_id?: string;
    type_id?: string;
    configuration_id?: string;
    taxonomy_node_id?: string;
    usage_type_id?: string;
    investment_type_id?: string;
    price_min?: number;
    price_max?: number;
    sort?: string;
    page?: number;
    limit?: number;
    furnishing?: string;
    ownership_type?: string;
    amenities?: string;
    bhk?: string;
    rooms?: string;
    facing?: string;
    age?: string;
}) => {
    const res = await api.get('/public/properties', { params });
    return res.data;
};

export const getPropertyById = async (id: string) => {
    const res = await api.get(`/public/properties/${id}`);
    return res.data;
};

export const getFeaturedProperties = async () => {
    const res = await api.get('/public/featured-properties');
    return res.data;
};

export const getSimilarProperties = async (id: string) => {
    const res = await api.get(`/public/similar-properties/${id}`);
    return res.data;
};

// Stats & Data
export const getPublicStats = async () => {
    const res = await api.get('/public/stats');
    return res.data;
};

export const getLocations = async (): Promise<{ locations: LocationItem[] }> => {
    const res = await api.get('/public/locations');
    return res.data;
};

export const getTestimonials = async (): Promise<{ testimonials: Testimonial[] }> => {
    const res = await api.get('/public/testimonials');
    return res.data;
};

// Forms & Leads (SSOT)
export const submitContactForm = async (data: ContactFormData) => {
    const res = await api.post('/public/contact', data);
    return res.data;
};

export const submitLead = async (data: LeadData) => {
    const res = await api.post('/public/lead', data);
    return res.data;
};

export const submitLeadRequirements = async (data: LeadRequirementsData): Promise<LeadRequirementsResponse> => {
    const res = await api.post('/public/lead-requirements', data);
    return res.data;
};

export const getFlatPropertyTypes = async (mainCategory?: string): Promise<FlatPropertyType[]> => {
    const params = mainCategory ? { main_category: mainCategory } : {};
    const res = await api.get('/public/master/flat-property-types', { params });
    return res.data.types;
};

export const subscribeNewsletter = async (data: NewsletterData) => {
    const res = await api.post('/public/newsletter', data);
    return res.data;
};

export const scheduleVisit = async (data: ScheduleVisitData) => {
    const res = await api.post('/public/schedule-visit', data);
    return res.data;
};

export interface SharePropertyData {
    phone: string;
    name: string;
    property_id: string;
}

export const sharePropertyWhatsApp = async (data: SharePropertyData) => {
    const res = await api.post('/public/share-property-whatsapp', data);
    return res.data;
};

export const saveProperty = async (data: { phone: string; name: string; property_id: string }) => {
    const res = await api.post('/public/save-property', data);
    return res.data;
};

export interface Landmark {
    name: string;
    type: string;
    distance_km: number;
    lat?: number;
    lng?: number;
}

export const getNearbyLandmarks = async (propertyId: string): Promise<{ landmarks: Landmark[] }> => {
    const res = await api.get(`/public/nearby-landmarks/${propertyId}`);
    return res.data;
};

export const getAIDescription = async (propertyId: string, lang: 'english' | 'hindi' = 'english'): Promise<string | null> => {
    try {
        const res = await api.get(`/public/properties/${propertyId}/ai-description?lang=${lang}`);
        return res.data?.description || null;
    } catch {
        return null;
    }
};

// Utility
export const formatPrice = (price: number | null, unit: string | null): string => {
    if (!price) return 'Price on Request';
    const p = Number(price);
    if (unit === 'Crore' || unit === 'Cr') return `₹${p} Cr`;
    if (unit === 'Lakh') return `₹${p} Lakh`;
    if (p >= 10000000) return `₹${(p / 10000000).toFixed(2)} Cr`;
    if (p >= 100000) return `₹${(p / 100000).toFixed(2)} Lakh`;
    return `₹${p.toLocaleString('en-IN')}`;
};

export const timeAgo = (date: string): string => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
    const months = Math.floor(days / 30);
    return `${months} month${months > 1 ? 's' : ''} ago`;
};

export interface PostPropertyData {
    intent: string;
    category: string;
    type: string;
    category_id?: string;
    sub_category_id?: string;
    type_id?: string;
    configuration_id?: string;
    usage_type_id?: string;
    investment_type_id?: string;
    location: string;
    price: number;
    price_unit: string;
    specs?: {
        bhk?: string;
        area?: string;
        floor?: string;
        total_floors?: string;
        facing?: string;
        description?: string;
        furnishing?: string;
        [key: string]: any;
    };
    features: Record<string, boolean>;
    description?: string;
    furnishing?: string;
    owner_name: string;
    phone: string;
    email?: string;
}

export const submitProperty = async (data: PostPropertyData) => {
    const res = await api.post('/public/post-property', data);
    return res.data;
};

// =============================================
// PHASE 15: BUILDER PROJECTS API
// =============================================

export interface ProjectUnit {
    id: string;
    configuration: string;
    area_min: number;
    area_max: number | null;
    area_unit: string;
    price_min: number;
    price_max: number | null;
    price_unit: string;
    total_units: number | null;
    available_units: number | null;
    floor_plan_url: string | null;
    is_active: boolean;
}

export interface ProjectMedia {
    id: string;
    media_type: string;
    media_url: string;
    caption: string | null;
    display_order: number;
}

export interface Project {
    id: string;
    name: string;
    project_type: string;
    city: string;
    locality: string;
    google_map_link: string | null;
    rera_number: string | null;
    possession_date: string | null;
    project_status: string;
    short_description: string;
    long_description: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    owner: {
        contact: {
            name: string;
        };
    };
    units: ProjectUnit[];
    media: ProjectMedia[];
    _count?: {
        leads: number;
        appointments: number;
    };
}

export interface ProjectEnquiryData {
    name: string;
    phone: string;
    email?: string;
    projectId: string;
    configuration?: string;
    message?: string;
}

// Get paginated project listings
export const getProjects = async (params?: {
    city?: string;
    locality?: string;
    projectType?: string;
    budgetMin?: number;
    budgetMax?: number;
    configuration?: string;
    page?: number;
    limit?: number;
}) => {
    const res = await api.get('/public/projects', { params });
    return res.data;
};

// Get single project detail
export const getProjectDetail = async (id: string) => {
    const res = await api.get(`/public/projects/${id}`);
    return res.data as Project;
};

// Get featured projects for homepage
export const getFeaturedProjects = async (limit: number = 6) => {
    const res = await api.get('/public/featured-projects', { params: { limit } });
    return res.data as Project[];
};

// Get similar projects
export const getSimilarProjects = async (city: string, projectType: string, excludeId: string) => {
    const res = await api.get('/public/similar-projects', {
        params: { city, projectType, excludeId, limit: 6 }
    });
    return res.data as Project[];
};

// Submit project enquiry
export const submitProjectEnquiry = async (data: ProjectEnquiryData) => {
    const res = await api.post('/public/project-enquiry', data);
    return res.data;
};

// Get unified matches (resale + projects)
export const getMatches = async (params?: {
    intent?: string;
    propertyType?: string;
    budgetMin?: number;
    budgetMax?: number;
    location?: string;
    configuration?: string;
    city?: string;
    locality?: string;
}) => {
    const res = await api.get('/public/matches', { params });
    return res.data as {
        resale: Property[];
        projects: Project[];
        totalResale: number;
        totalProjects: number;
    };
};

// === USER AUTHENTICATION ===

export interface User {
    id: string;
    phone: string;
    name: string | null;
    email: string | null;
    contact_type: string;
    intent?: string | null;
    preferred_location?: string | null;
    budget?: number | null;
    created_at: string;
}

export interface UserLoginOTPRequest {
    phone: string;
}

export interface UserVerifyOTPRequest {
    phone: string;
    otp: string;
}

export interface UserAuthResponse {
    success: boolean;
    message: string;
    token?: string;
    user?: User;
}

export interface UserProfileResponse {
    success: boolean;
    user: User;
    savedSearches: any[];
    scheduledVisits: any[];
    recentActivity: any[];
}

// Send OTP to user's phone
export const sendUserOTP = async (data: UserLoginOTPRequest): Promise<UserAuthResponse> => {
    const res = await api.post('/user/login-otp', data);
    return res.data;
};

// Verify OTP and get JWT token
export const verifyUserOTP = async (data: UserVerifyOTPRequest): Promise<UserAuthResponse> => {
    const res = await api.post('/user/verify-otp', data);
    return res.data;
};

// Get current user profile (requires authentication — uses HttpOnly cookie)
export const getUserProfile = async (): Promise<UserProfileResponse> => {
    const res = await api.get('/user/me');
    return res.data;
};

// Logout user — clears server-side session and cookies
export const logoutUser = async () => {
    const res = await api.post('/user/logout', {});
    return res.data;
};

// ==================== AI CHAT API ====================

export interface AIChatRequest {
    message: string;
    filters?: {
        city?: string;
        propertyType?: string;
        bhk?: string;
        budget?: { min: number; max: number };
        intent?: 'buy' | 'rent' | 'lease';
    };
    sessionId?: string;
    phone?: string; // FEATURE 3: For logging messages to Interaction table
}

export interface AIChatResponse {
    success: boolean;
    reply: string;
    properties: Property[];
    action: 'request_phone' | 'book_visit' | 'redirect_upload' | null;
    sessionId: string;
}

export interface BookVisitRequest {
    phone: string;
    propertyId: string;
    message?: string;
    sessionId?: string;
}

export interface BookVisitResponse {
    success: boolean;
    visitId?: string;
    message: string;
    error?: string;
}

// Send message to AI chat
export const sendAIChatMessage = async (data: AIChatRequest): Promise<AIChatResponse> => {
    const res = await api.post('/public/ai-chat', data);
    return res.data;
};

// Book property visit from chat
export const bookPropertyVisit = async (data: BookVisitRequest): Promise<BookVisitResponse> => {
    const res = await api.post('/public/ai-chat/book-visit', data);
    return res.data;
};

// ==================== UNIFIED WORKFLOW API ====================

export interface WorkflowStepDef {
    id: string;
    group: string;
    question: string;
    question_hi?: string;
    input_type: 'dropdown' | 'number' | 'text' | 'phone' | 'textarea' | 'radio' | 'multi_select' | 'media_upload' | 'video_upload' | 'document_upload' | 'confirm' | 'compound' | 'address_block' | 'owner_block' | 'uploader_block';
    field: string;
    placeholder?: string;
    secondary_field?: string;
    secondary_options?: Array<{ value: string; label: string }>;
    options_source?: 'static' | 'dynamic' | 'filtered';
    static_options?: Array<{ value: string; label: string; label_hi?: string }>;
    dynamic_endpoint?: string;
    filter_by?: string;
    show_when?: any[];
    skip_when?: any[];
    required?: boolean;
    validation?: { min?: number; max?: number; pattern?: string; message?: string };
    whatsapp_type?: string;
}

export interface WorkflowGroup {
    id: string;
    label: string;
    label_hi: string;
    icon: string;
}

export interface WorkflowStepOption {
    value: string;
    label: string;
    label_hi?: string;
}

export interface WorkflowDocType {
    value: string;
    label: string;
}

export const getWorkflowDefinition = async (): Promise<{
    steps: WorkflowStepDef[];
    groups: WorkflowGroup[];
    document_types: WorkflowDocType[];
}> => {
    const res = await api.get('/api/workflow/definition');
    return res.data;
};

export const getWorkflowNextStep = async (currentStepId: string | null, answers: Record<string, any>): Promise<{
    done: boolean;
    step: WorkflowStepDef | null;
    options: WorkflowStepOption[];
    metadata?: Record<string, any> | null;
}> => {
    const res = await api.post('/api/workflow/next-step', { current_step_id: currentStepId, answers });
    return res.data;
};

export const getWorkflowPreviousStep = async (currentStepId: string, answers: Record<string, any>): Promise<{
    step: WorkflowStepDef | null;
    options: WorkflowStepOption[];
}> => {
    const res = await api.post('/api/workflow/previous-step', { current_step_id: currentStepId, answers });
    return res.data;
};

export const validateWorkflowStep = async (stepId: string, value: any, answers: Record<string, any>): Promise<{
    valid: boolean;
    error?: string;
}> => {
    const res = await api.post('/api/workflow/validate', { step_id: stepId, value, answers });
    return res.data;
};

export const getWorkflowOptions = async (stepId: string, answers: Record<string, any>): Promise<{
    options: WorkflowStepOption[];
}> => {
    const res = await api.post('/api/workflow/options', { step_id: stepId, answers });
    return res.data;
};

export const getWorkflowVisibleSteps = async (answers: Record<string, any>): Promise<{
    steps: WorkflowStepDef[];
    groups: WorkflowGroup[];
}> => {
    const res = await api.post('/api/workflow/visible-steps', { answers });
    return res.data;
};

export const getWorkflowSummary = async (answers: Record<string, any>): Promise<{
    summary: Record<string, string>;
}> => {
    const res = await api.post('/api/workflow/summary', { answers });
    return res.data;
};

export const commitWorkflow = async (answers: Record<string, any>, source: string): Promise<{
    success: boolean;
    inventory_id: string;
}> => {
    const res = await api.post('/api/workflow/commit', { answers, source });
    return res.data;
};

export const uploadWorkflowMedia = async (files: File[]): Promise<{ urls: string[]; count: number }> => {
    const formData = new FormData();
    files.forEach(f => formData.append('photos', f));
    const res = await api.post('/api/workflow/upload-media', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
};

export const uploadWorkflowVideo = async (files: File[]): Promise<{ urls: string[]; count: number }> => {
    const formData = new FormData();
    files.forEach(f => formData.append('videos', f));
    const res = await api.post('/api/workflow/upload-video', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
};

export const uploadWorkflowDocument = async (file: File, docType: string, title: string): Promise<{
    url: string;
    doc_type: string;
    title: string;
    file_name: string;
    mime_type: string;
    file_size: number;
}> => {
    const formData = new FormData();
    formData.append('document', file);
    formData.append('doc_type', docType);
    formData.append('title', title);
    const res = await api.post('/api/workflow/upload-document', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
};

export const getStates = async (): Promise<{ states: Array<{ code: string; name: string }> }> => {
    const res = await api.get('/public/geo/states');
    return res.data;
};

export const getDistricts = async (stateName: string): Promise<{ state: string; districts: string[] }> => {
    const res = await api.get('/public/geo/districts', { params: { state: stateName } });
    return res.data;
};

export const getCities = async (stateName: string) => {
    const res = await api.get('/public/geo/cities', { params: { state: stateName } });
    return res.data.cities || res.data.districts || [];
};

// ==================== BUYER WORKFLOW API ====================

export const startBuyerWorkflow = async (sessionId?: string, source: string = 'web', prefill?: { phone?: string; name?: string }) => {
    const res = await api.post('/api/chat/start', {
        session_id: sessionId,
        workflow_type: 'buyer_intake',
        source,
        prefill,
    });
    return res.data;
};

export const sendBuyerMessage = async (sessionId: string, text?: string, quickReplyValue?: string) => {
    const res = await api.post('/api/chat/message', {
        session_id: sessionId,
        text,
        quick_reply_value: quickReplyValue,
        workflow_type: 'buyer_intake',
    });
    return res.data;
};

export const buyerAction = async (sessionId: string, action: string, source: string = 'web') => {
    const res = await api.post('/api/chat/buyer/action', {
        session_id: sessionId,
        action,
        source,
    });
    return res.data;
};

export const bookBuyerVisit = async (
    sessionId: string,
    propertyId: string,
    date?: string,
    time?: string,
    source: string = 'web',
) => {
    const res = await api.post('/api/chat/buyer/book', {
        session_id: sessionId,
        property_id: propertyId,
        preferred_date: date,
        preferred_time: time,
        source,
    });
    return res.data;
};

export const getBuyerSession = async (sessionId: string) => {
    const res = await api.get(`/api/chat/session/${sessionId}`, {
        params: { workflow_type: 'buyer_intake' },
    });
    return res.data;
};

export default api;
