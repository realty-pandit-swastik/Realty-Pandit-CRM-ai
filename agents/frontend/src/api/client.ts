
import axios from 'axios';

// Use environment variable for API base URL (production) or fallback to localhost
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:7071';

const client = axios.create({
    baseURL: API_BASE_URL
});

// Set auth header from localStorage on init
const savedToken = localStorage.getItem('token');
if (savedToken) {
    client.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
}

// Token refresh interceptor — on 401, try refreshing before giving up
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];

const processQueue = (error: any, token: string | null = null) => {
    failedQueue.forEach(prom => {
        if (token) prom.resolve(token);
        else prom.reject(error);
    });
    failedQueue = [];
};

client.interceptors.response.use(
    response => response,
    async error => {
        const originalRequest = error.config;

        // 403 — permission denied, don't retry
        if (error.response?.status === 403) {
            console.warn('Permission denied:', originalRequest?.url);
            return Promise.reject(error);
        }

        if (error.response?.status === 401 && !originalRequest._retry) {
            const refreshToken = localStorage.getItem('refreshToken');
            if (!refreshToken) return Promise.reject(error);

            if (isRefreshing) {
                return new Promise<string>((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(token => {
                    originalRequest.headers['Authorization'] = `Bearer ${token}`;
                    return client(originalRequest);
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
                const { token: newToken, refreshToken: newRefreshToken } = res.data;
                localStorage.setItem('token', newToken);
                if (newRefreshToken) localStorage.setItem('refreshToken', newRefreshToken);
                client.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
                processQueue(null, newToken);
                originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
                return client(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError, null);
                localStorage.removeItem('token');
                localStorage.removeItem('refreshToken');
                delete client.defaults.headers.common['Authorization'];
                window.location.href = '/';
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    }
);

export const getContacts = async () => {
    const res = await client.get('/api/contacts');
    return res.data;
};

export const getInteractions = async (phoneNumber: string) => {
    const res = await client.get(`/api/contacts/${phoneNumber}/interactions`);
    return res.data;
};

export const getInventory = async (params?: Record<string, any>) => {
    const res = await client.get('/api/inventory', { params });
    return res.data;
};

export const updateInventory = async (id: string, data: Record<string, any>) => {
    const res = await client.patch(`/api/inventory/${id}`, data);
    return res.data;
};

export const deleteInventory = async (id: string) => {
    const res = await client.delete(`/api/inventory/${id}`);
    return res.data;
};

export const shareInventory = async (id: string, agent_ids: string[], action: 'add' | 'remove') => {
    const res = await client.post(`/api/inventory/${id}/share`, { agent_ids, action });
    return res.data;
};

// Share property to client via WhatsApp + generate link
export const shareToClient = async (inventoryId: string, data: {
    client_phone: string;
    client_name?: string;
}) => {
    const res = await client.post(`/api/inventory/${inventoryId}/share-to-client`, data);
    return res.data;
};

// Search contact by phone number
export const searchContactByPhone = async (phone: string) => {
    const res = await client.get('/api/contacts/search', { params: { phone } });
    return res.data;
};

// Ensure contact exists (upsert by phone)
export const ensureContact = async (phone: string, name?: string, contact_type?: string) => {
    const res = await client.post('/api/contacts/ensure', { phone, name, contact_type });
    return res.data;
};

// Identify contact by phone — returns contact record + detected role
export const identifyContactByPhone = async (phone: string) => {
    const res = await client.get('/api/contacts/identify', { params: { phone } });
    return res.data;
};

// Get recently updated contacts
export const getRecentContacts = async (limit = 10) => {
    const res = await client.get('/api/contacts/recent', { params: { limit } });
    return res.data;
};

// Get team activity feed (shares + visits)
export const getTeamActivity = async (params?: {
    agent_id?: string;
    from?: string;
    to?: string;
    limit?: number;
}) => {
    const res = await client.get('/api/activity/team', { params });
    return res.data;
};

export const transferInventory = async (id: string, to_agent_id: string) => {
    const res = await client.post(`/api/inventory/${id}/transfer`, { to_agent_id });
    return res.data;
};

export const approveInventory = async (id: string) => {
    const res = await client.post(`/api/inventory/${id}/approve`);
    return res.data;
};

export const rejectInventory = async (id: string, reason?: string) => {
    const res = await client.post(`/api/inventory/${id}/reject`, { reason });
    return res.data;
};

export const createInventory = async (data: Record<string, any>) => {
    const res = await client.post('/api/inventory', data);
    return res.data;
};

export const getInventoryItem = async (id: string) => {
    const res = await client.get(`/api/inventory/${id}`);
    return res.data;
};

export const getCategoryTree = async () => {
    const res = await client.get('/public/classification-tree');
    return res.data;
};

export const getStates = async () => {
    const res = await client.get('/public/geo/states');
    return res.data;
};

export const getTeamMembers = async () => {
    const res = await client.get('/api/team/members');
    return res.data;
};

export const getTeamMembersList = async () => {
    const res = await client.get('/api/team/members-list');
    return res.data;
};

export const reportNoShow = async (phoneNumber: string) => {
    const res = await client.post(`/api/leads/${phoneNumber}/no-show`);
    return res.data;
};

export const updateContactType = async (phoneNumber: string, contactType: string) => {
    const res = await client.patch(`/api/contacts/${phoneNumber}`, { contact_type: contactType });
    return res.data;
};

export const getPartners = async () => {
    const res = await client.get('/api/partners');
    return res.data;
};

export const createPartner = async (data: {
    phone_number: string;
    name: string;
    email: string;
    partner_category: string;
    business_name: string;
    business_address: string;
    registration_number: string;
    agency_name?: string;
    partner_type?: string;
    package_type?: string;
}) => {
    const res = await client.post('/api/partners', data);
    return res.data;
};

export const verifyPartner = async (id: string, verify: boolean) => {
    const res = await client.patch(`/api/partners/${id}/verify`, { verify });
    return res.data;
};

export const updatePartnerStatus = async (id: string, status: string) => {
    const res = await client.patch(`/api/partners/${id}/status`, { status });
    return res.data;
};

export const updatePartnerPackage = async (id: string, package_type: string) => {
    const res = await client.patch(`/api/partners/${id}/package`, { package_type });
    return res.data;
};

export const updatePartnerCommission = async (id: string, rate: number) => {
    const res = await client.patch(`/api/partners/${id}/commission`, { rate });
    return res.data;
};

export const getCommissions = async () => {
    const res = await client.get('/api/commissions');
    return res.data;
};

// Calendar API
export const getAppointments = async (params?: {
    startDate?: string;
    endDate?: string;
    status?: string;
    type?: string;
}) => {
    const res = await client.get('/api/calendar/appointments', { params });
    return res.data;
};

export const getAppointment = async (id: string) => {
    const res = await client.get(`/api/calendar/appointments/${id}`);
    return res.data;
};

export const createAppointment = async (data: {
    contact_id: string;
    title: string;
    description?: string;
    type: string;
    scheduled_at: string;
    duration?: number;
    assigned_to_agent_id?: string;
    property_id?: string;
    location?: string;
    source?: string;
    channel?: string;
}) => {
    const res = await client.post('/api/calendar/appointments', data);
    return res.data;
};

export const updateAppointment = async (id: string, data: {
    status?: string;
    scheduled_at?: string;
    duration?: number;
    description?: string;
    notes?: string;
    assigned_to_agent_id?: string;
}) => {
    const res = await client.patch(`/api/calendar/appointments/${id}`, data);
    return res.data;
};

export const cancelAppointment = async (id: string) => {
    const res = await client.delete(`/api/calendar/appointments/${id}`);
    return res.data;
};

export const getCalendarSummary = async () => {
    const res = await client.get('/api/calendar/summary');
    return res.data;
};

// Agent Dashboard API
export const getAgentDashboardHealth = async () => {
    const res = await client.get('/api/agent-dashboard/health');
    return res.data;
};

export const getAgentMetrics = async () => {
    const res = await client.get('/api/agent-dashboard/metrics');
    return res.data;
};

export const getConversionFunnel = async () => {
    const res = await client.get('/api/agent-dashboard/funnel');
    return res.data;
};

export const getAgentLogs = async (params?: {
    agent_name?: string;
    status?: string;
    phone_number?: string;
    limit?: number;
    offset?: number;
}) => {
    const res = await client.get('/api/agent-dashboard/logs', { params });
    return res.data;
};

export const getQALogs = async (params?: {
    flagged_only?: boolean;
    agent_name?: string;
    limit?: number;
    offset?: number;
}) => {
    const res = await client.get('/api/agent-dashboard/qa-logs', { params });
    return res.data;
};

export const getCampaigns = async (params?: { status?: string; limit?: number }) => {
    const res = await client.get('/api/agent-dashboard/campaigns', { params });
    return res.data;
};

export const createCampaign = async (data: {
    name: string;
    type?: string;
    channel?: string;
    message: string;
    subject?: string;
    audience: Record<string, any>;
}) => {
    const res = await client.post('/api/agent-dashboard/campaigns', data);
    return res.data;
};

export const executeCampaign = async (id: string) => {
    const res = await client.post(`/api/agent-dashboard/campaigns/${id}/execute`);
    return res.data;
};

export const cancelCampaign = async (id: string) => {
    const res = await client.post(`/api/agent-dashboard/campaigns/${id}/cancel`);
    return res.data;
};

export const getCampaignAnalytics = async () => {
    const res = await client.get('/api/agent-dashboard/campaigns/analytics');
    return res.data;
};

// Human Override Controls
export const reviewQALog = async (id: string) => {
    const res = await client.patch(`/api/agent-dashboard/qa-logs/${id}/review`);
    return res.data;
};

export const toggleQAFlag = async (id: string, flagged: boolean) => {
    const res = await client.patch(`/api/agent-dashboard/qa-logs/${id}/flag`, { flagged });
    return res.data;
};

export const getWinningTemplates = async (params?: { agent_name?: string; limit?: number }) => {
    const res = await client.get('/api/agent-dashboard/winning-templates', { params });
    return res.data;
};

// Resend OTP (public — no auth required)
export const resendOtp = async (phone: string) => {
    const res = await axios.post(`${API_BASE_URL}/auth/resend-otp`, { phone });
    return res.data;
};

// Set password for team member (boss only)
export const setMemberPassword = async (id: string, password: string) => {
    const res = await client.patch(`/api/team/members/${id}/set-password`, { password });
    return res.data;
};

// Resend setup link for team member (sends WhatsApp with new setup token)
export const resendSetupLink = async (id: string) => {
    const res = await client.post(`/api/team/members/${id}/resend-setup`);
    return res.data;
};

// Setup Password (public — no auth required)
export const validateSetupToken = async (token: string) => {
    const res = await axios.get(`${API_BASE_URL}/auth/validate-setup-token`, { params: { token } });
    return res.data;
};

export const setupPassword = async (token: string, password: string) => {
    const res = await axios.post(`${API_BASE_URL}/auth/setup-password`, { token, password });
    return res.data;
};

// ==================== UNIFIED WORKFLOW API ====================

export const getWorkflowDefinition = async () => {
    const res = await client.get('/api/workflow/definition');
    return res.data;
};

export const getWorkflowNextStep = async (currentStepId: string | null, answers: Record<string, any>, source?: string) => {
    const res = await client.post('/api/workflow/next-step', { current_step_id: currentStepId, answers, source });
    return res.data;
};

export const getWorkflowPreviousStep = async (currentStepId: string, answers: Record<string, any>, source?: string) => {
    const res = await client.post('/api/workflow/previous-step', { current_step_id: currentStepId, answers, source });
    return res.data;
};

export const validateWorkflowStep = async (stepId: string, value: any, answers: Record<string, any>) => {
    const res = await client.post('/api/workflow/validate', { step_id: stepId, value, answers });
    return res.data;
};

export const getWorkflowOptions = async (stepId: string, answers: Record<string, any>) => {
    const res = await client.post('/api/workflow/options', { step_id: stepId, answers });
    return res.data;
};

export const getWorkflowSummary = async (answers: Record<string, any>) => {
    const res = await client.post('/api/workflow/summary', { answers });
    return res.data;
};

export const commitWorkflow = async (answers: Record<string, any>, source: string) => {
    const res = await client.post('/api/workflow/commit', { answers, source });
    return res.data;
};

export const uploadInventoryImages = async (id: string, files: File[]) => {
    const formData = new FormData();
    files.forEach(f => formData.append('images', f));
    const res = await client.post(`/api/inventory/${id}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
};

export const deleteInventoryMedia = async (id: string, filename: string) => {
    const res = await client.delete(`/api/inventory/${id}/media/${filename}`);
    return res.data;
};

// ==================== INVENTORY DOCUMENT MANAGEMENT ====================

export const uploadInventoryDocument = async (inventoryId: string, file: File, docType: string, title: string) => {
    const formData = new FormData();
    formData.append('document', file);
    formData.append('doc_type', docType);
    formData.append('title', title);
    const res = await client.post(`/api/inventory/${inventoryId}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
};

export const deleteInventoryDocument = async (inventoryId: string, documentId: string) => {
    const res = await client.delete(`/api/inventory/${inventoryId}/documents/${documentId}`);
    return res.data;
};

export const uploadWorkflowMedia = async (files: File[]) => {
    const formData = new FormData();
    files.forEach(f => formData.append('photos', f));
    const res = await client.post('/api/workflow/upload-media', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
};

export const uploadWorkflowVideo = async (files: File[]) => {
    const formData = new FormData();
    files.forEach(f => formData.append('videos', f));
    const res = await client.post('/api/workflow/upload-video', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
};

export const uploadWorkflowDocument = async (file: File, docType: string, title: string) => {
    const formData = new FormData();
    formData.append('document', file);
    formData.append('doc_type', docType);
    formData.append('title', title);
    const res = await client.post('/api/workflow/upload-document', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
};

// ==================== ENRICHMENT API (v3 - Post-save details) ====================

export const getInventoryEnrichment = async (id: string) => {
    const res = await client.get(`/api/inventory/${id}/enrichment`);
    return res.data;
};

export const enrichInventory = async (id: string, fields: Record<string, any>) => {
    const res = await client.patch(`/api/inventory/${id}/enrich`, { fields });
    return res.data;
};

// ==================== ANALYTICS API (Dashboard Tabs) ====================

export const getMarketTrends = async (params?: { from?: string; to?: string }) => {
    const res = await client.get('/api/analytics/market-trends', { params });
    return res.data;
};

export const getUserPerformance = async (params?: { from?: string; to?: string }) => {
    const res = await client.get('/api/analytics/user-performance', { params });
    return res.data;
};

export const getLeadSources = async (params?: { from?: string; to?: string }) => {
    const res = await client.get('/api/analytics/lead-sources', { params });
    return res.data;
};

export const getPropertyTrends = async (params?: { from?: string; to?: string }) => {
    const res = await client.get('/api/analytics/property-trends', { params });
    return res.data;
};

export const getFinancialSummary = async (params?: { from?: string; to?: string }) => {
    const res = await client.get('/api/analytics/financial-summary', { params });
    return res.data;
};

// ==================== REPORTS API (Comprehensive Reporting System) ====================

// Account Reports
export const getCustomerOutstanding = async (params?: { from?: string; to?: string }) => {
    const res = await client.get('/api/reports/account/customer-outstanding', { params });
    return res.data;
};

export const getVendorOutstanding = async (params?: { from?: string; to?: string }) => {
    const res = await client.get('/api/reports/account/vendor-outstanding', { params });
    return res.data;
};

export const getMonthlySales = async (params?: { from?: string; to?: string }) => {
    const res = await client.get('/api/reports/account/monthly-sales', { params });
    return res.data;
};

export const getMonthlyPurchase = async (params?: { from?: string; to?: string }) => {
    const res = await client.get('/api/reports/account/monthly-purchase', { params });
    return res.data;
};

// User Reports
export const getUserPerformanceReport = async (params?: { from?: string; to?: string }) => {
    const res = await client.get('/api/reports/user/performance', { params });
    return res.data;
};

export const getUserTaskCompletion = async (params?: { from?: string; to?: string }) => {
    const res = await client.get('/api/reports/user/task-completion', { params });
    return res.data;
};

// Call Reports
export const getAllCallLogs = async (params?: { from?: string; to?: string; type?: string }) => {
    const res = await client.get('/api/reports/call/all-logs', { params });
    return res.data;
};

export const getCallsByDate = async (params?: { from?: string; to?: string }) => {
    const res = await client.get('/api/reports/call/by-date', { params });
    return res.data;
};

export const getCallsByMonth = async (params?: { from?: string; to?: string }) => {
    const res = await client.get('/api/reports/call/by-month', { params });
    return res.data;
};

// Lead Reports
export const getAllLeadsReport = async (params?: { from?: string; to?: string; status?: string; source?: string }) => {
    const res = await client.get('/api/reports/lead/all-leads', { params });
    return res.data;
};

export const getLeadLastContact = async () => {
    const res = await client.get('/api/reports/lead/last-contact');
    return res.data;
};

export const getLeadSummary = async (params?: { from?: string; to?: string }) => {
    const res = await client.get('/api/reports/lead/summary', { params });
    return res.data;
};

export const getLeadCancelledReasons = async (params?: { from?: string; to?: string }) => {
    const res = await client.get('/api/reports/lead/cancelled-reasons', { params });
    return res.data;
};

// Sold Reports
export const getSoldByProperty = async (params?: { from?: string; to?: string }) => {
    const res = await client.get('/api/reports/sold/by-property', { params });
    return res.data;
};

export const getSoldByArea = async (params?: { from?: string; to?: string }) => {
    const res = await client.get('/api/reports/sold/by-area', { params });
    return res.data;
};

export const getSoldByUnitType = async (params?: { from?: string; to?: string }) => {
    const res = await client.get('/api/reports/sold/by-unit-type', { params });
    return res.data;
};

// Visit Reports
export const getAllVisitsReport = async (params?: { from?: string; to?: string; status?: string }) => {
    const res = await client.get('/api/reports/visit/all-visits', { params });
    return res.data;
};

export const getPropertyVisitCount = async (params?: { from?: string; to?: string }) => {
    const res = await client.get('/api/reports/visit/property-count', { params });
    return res.data;
};

// Customer Reports
export const getConvertedNotSold = async () => {
    const res = await client.get('/api/reports/customer/converted-not-sold');
    return res.data;
};

// Property Reports
export const getAllPropertiesReport = async (params?: { status?: string; type?: string; intent?: string }) => {
    const res = await client.get('/api/reports/property/all-properties', { params });
    return res.data;
};

export const getPropertiesOnHold = async () => {
    const res = await client.get('/api/reports/property/on-hold');
    return res.data;
};

export const getPropertyAvailabilitySummary = async () => {
    const res = await client.get('/api/reports/property/availability-summary');
    return res.data;
};

// ─── Chat Workflow API ────────────────────────────────────────────────────────

export interface ChatQuickReply { label: string; value: string }

export interface ChatMessage {
    id: string;
    role: 'assistant' | 'user';
    content: string;
    timestamp: string;
    type: 'text' | 'question' | 'summary' | 'success' | 'error' | 'system' | 'property_card';
    step_id?: string;
    input_type?: string;
    quick_replies?: ChatQuickReply[];
    metadata?: {
        options?: Array<{ value: string; label: string }>;
        secondary_options?: Array<{ value: string; label: string }>;
        summary?: Record<string, string>;
        media_count?: number;
        doc_count?: number;
        inventory_id?: string;
        display_id?: string;
        progress?: { current: number; total: number; group: string };
        address_config?: any;
        document_types?: Array<{ value: string; label: string }>;
        property?: any;
        match_index?: number;
        total_available?: number;
    };
}

export interface ChatStartResponse { session_id: string; messages: ChatMessage[] }
export interface ChatMessageResponse { messages: ChatMessage[]; session_active: boolean; progress?: { current: number; total: number; group: string } }
export interface ChatUploadResponse { messages: ChatMessage[]; urls: string[] }
export interface ChatSessionStatus { active: boolean; state?: string; step_id?: string; progress?: { current: number; total: number; group: string } }

export const chatStart = async (sessionId?: string): Promise<ChatStartResponse> => {
    const res = await client.post('/api/chat/start', { session_id: sessionId, source: 'admin' });
    return res.data;
};

export const chatSendMessage = async (sessionId: string, text?: string, quickReplyValue?: string): Promise<ChatMessageResponse> => {
    const res = await client.post('/api/chat/message', { session_id: sessionId, text, quick_reply_value: quickReplyValue, source: 'admin' });
    return res.data;
};

export const chatUploadMedia = async (sessionId: string, files: File[], type: 'photo' | 'video' | 'document'): Promise<ChatUploadResponse> => {
    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('type', type);
    files.forEach(f => formData.append('files', f));
    const res = await client.post('/api/chat/upload-media', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    return res.data;
};

export const chatConfirm = async (sessionId: string, confirmed: boolean): Promise<ChatMessageResponse> => {
    const res = await client.post('/api/chat/confirm', { session_id: sessionId, confirmed });
    return res.data;
};

export const chatGetSession = async (sessionId: string): Promise<ChatSessionStatus> => {
    const res = await client.get(`/api/chat/session/${sessionId}`);
    return res.data;
};

// ─── Buyer Chat Workflow API ─────────────────────────────────────────────────

export const buyerChatStart = async (sessionId?: string): Promise<any> => {
    const res = await client.post('/api/chat/start', {
        session_id: sessionId,
        workflow_type: 'buyer_intake',
        source: 'admin',
    });
    return res.data;
};

export const buyerChatSendMessage = async (sessionId: string, text?: string, quickReplyValue?: string): Promise<any> => {
    const res = await client.post('/api/chat/message', {
        session_id: sessionId,
        text,
        quick_reply_value: quickReplyValue,
        workflow_type: 'buyer_intake',
        source: 'admin',
    });
    return res.data;
};

export const buyerChatAction = async (sessionId: string, action: string): Promise<any> => {
    const res = await client.post('/api/chat/buyer/action', {
        session_id: sessionId,
        action,
        source: 'admin',
    });
    return res.data;
};

export const buyerChatBook = async (sessionId: string, propertyId: string, date?: string, time?: string): Promise<any> => {
    const res = await client.post('/api/chat/buyer/book', {
        session_id: sessionId,
        property_id: propertyId,
        preferred_date: date,
        preferred_time: time,
        source: 'admin',
    });
    return res.data;
};

export const buyerChatGetSession = async (sessionId: string): Promise<any> => {
    const res = await client.get(`/api/chat/session/${sessionId}`, {
        params: { workflow_type: 'buyer_intake' },
    });
    return res.data;
};

// ─── Deal Management API (Phase 7) ──────────────────────────────────────────

export interface Deal {
    id: string;
    type: string;
    status: string;
    deal_scenario: string | null;
    demand_contact_id: string;
    supply_contact_id: string | null;
    coordinator_agent_id: string | null;
    demand_handler_type: string | null;
    demand_handler_id: string | null;
    supply_handler_type: string | null;
    supply_handler_id: string | null;
    inventory_id: string | null;
    demand_property_type: string | null;
    demand_type_slug: string | null;
    demand_location: string | null;
    demand_budget_min: number | null;
    demand_budget_max: number | null;
    demand_contact?: { phone_number?: string; name?: string; email?: string; contact_type?: string };
    supply_contact?: { phone_number?: string; name?: string };
    coordinator?: { id: string; name: string; phone?: string };
    inventory?: { id: string; type: string; location: string; price: number | null; media_urls?: string[] };
    valid_next_statuses?: string[];
    created_at: string;
    updated_at: string;
}

export interface DealPipelineStats {
    [status: string]: number;
}

export const getDeals = async (params?: Record<string, any>) => {
    const res = await client.get('/api/deals', { params });
    return res.data;
};

export const getDeal = async (id: string) => {
    const res = await client.get(`/api/deals/${id}`);
    return res.data;
};

export const getDealPipeline = async () => {
    const res = await client.get('/api/deals/pipeline');
    return res.data;
};

export const createDeal = async (data: Record<string, any>) => {
    const res = await client.post('/api/deals', data);
    return res.data;
};

export const updateDealStatus = async (id: string, status: string, reason?: string) => {
    const res = await client.patch(`/api/deals/${id}/status`, { status, reason });
    return res.data;
};

export const matchPropertyToDeal = async (id: string, data: { inventory_id: string; supply_contact_id: string; supply_handler_type: string; supply_handler_id: string }) => {
    const res = await client.patch(`/api/deals/${id}/match`, data);
    return res.data;
};

export const getDealTimeline = async (id: string) => {
    const res = await client.get(`/api/deals/${id}/timeline`);
    return res.data;
};

export const getDealQueries = async (id: string) => {
    const res = await client.get(`/api/deals/${id}/queries`);
    return res.data;
};

export const createDealQuery = async (id: string, subject: string, message: string) => {
    const res = await client.post(`/api/deals/${id}/query`, { subject, message });
    return res.data;
};

export const answerDealQuery = async (dealId: string, queryId: string, answer: string) => {
    const res = await client.patch(`/api/deals/${dealId}/query/${queryId}`, { answer });
    return res.data;
};

// ─── Integration Sync ────────────────────────────────────────────────────────

export const getIntegrationSyncStatus = async () => {
    const res = await client.get('/api/integrations/sync-status');
    return res.data;
};

export const triggerNinetyNineAcresSync = async () => {
    const res = await client.post('/api/integrations/99acres/sync');
    return res.data;
};

export const getNinetyNineAcresHistory = async () => {
    const res = await client.get('/api/integrations/99acres/history');
    return res.data;
};

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────

export const getNotificationHistory = async (page = 1, limit = 20, category?: string) => {
    const params: Record<string, any> = { page, limit };
    if (category) params.category = category;
    const res = await client.get('/api/notifications/history', { params });
    return res.data;
};

export const getUnreadNotificationCount = async () => {
    const res = await client.get('/api/notifications/unread-count');
    return res.data;
};

export const markNotificationRead = async (id: string) => {
    const res = await client.post(`/api/notifications/${id}/read`);
    return res.data;
};

export const markAllNotificationsRead = async () => {
    const res = await client.post('/api/notifications/read-all');
    return res.data;
};

export const markNotificationClicked = async (id: string) => {
    const res = await client.post(`/api/notifications/${id}/click`);
    return res.data;
};

// ─── WORKFLOW TASKS (Guided Lead-to-Deal Engine) ─────────────────────────────

export const getWorkflowTaskQueue = async () => {
    const res = await client.get('/api/workflow-tasks/my-queue');
    return res.data;
};

export const getWorkflowTask = async (id: string) => {
    const res = await client.get(`/api/workflow-tasks/${id}`);
    return res.data;
};

export const getWorkflowChain = async (id: string) => {
    const res = await client.get(`/api/workflow-tasks/${id}/chain`);
    return res.data;
};

export const completeWorkflowTask = async (id: string, data: Record<string, any>) => {
    const res = await client.post(`/api/workflow-tasks/${id}/complete`, data);
    return res.data;
};

export const snoozeWorkflowTask = async (id: string, reason: string, snoozeMinutes?: number) => {
    const res = await client.post(`/api/workflow-tasks/${id}/snooze`, { reason, snooze_minutes: snoozeMinutes });
    return res.data;
};

export const sharePropertiesFromTask = async (taskId: string, propertyIds: string[], clientPhone?: string) => {
    const res = await client.post(`/api/workflow-tasks/${taskId}/share`, { property_ids: propertyIds, client_phone: clientPhone });
    return res.data;
};

export const scheduleVisitFromTask = async (taskId: string, data: { scheduled_at: string; duration?: number; property_ids: string[]; title?: string }) => {
    const res = await client.post(`/api/workflow-tasks/${taskId}/schedule-visit`, data);
    return res.data;
};

export const submitVisitFeedback = async (taskId: string, data: Record<string, any>) => {
    const res = await client.post(`/api/workflow-tasks/${taskId}/feedback`, data);
    return res.data;
};

export const getWorkflowStats = async (agentId?: string) => {
    const params: Record<string, any> = {};
    if (agentId) params.agent_id = agentId;
    const res = await client.get('/api/workflow-tasks/stats/summary', { params });
    return res.data;
};

export const getTeamWorkflowPipeline = async () => {
    const res = await client.get('/api/workflow-tasks/stats/team');
    return res.data;
};

export const getLeadShortlist = async (phone: string, dealId?: string) => {
    const params: Record<string, any> = {};
    if (dealId) params.deal_id = dealId;
    const res = await client.get(`/api/workflow-tasks/shortlist/${encodeURIComponent(phone)}`, { params });
    return res.data;
};

export const reassignWorkflowTask = async (id: string, assignedTo: string) => {
    const res = await client.patch(`/api/workflow-tasks/${id}/reassign`, { assigned_to: assignedTo });
    return res.data;
};

export default client;
