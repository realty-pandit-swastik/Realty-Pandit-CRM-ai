
import axios from 'axios';
import * as SentrySDK from '@sentry/react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
if (!API_BASE_URL && import.meta.env.PROD) {
  throw new Error('[client] VITE_API_BASE_URL is required in production. Check your .env.production file.');
}
const baseURL = API_BASE_URL || 'http://localhost:7071';

/**
 * Read the CSRF token from the rp_csrf cookie (set by the server on login).
 * The cookie is intentionally NOT HttpOnly so JS can read it to attach as a header.
 */
function getCsrfFromCookie(): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/(?:^|;\s*)rp_csrf=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

const client = axios.create({
    baseURL,
    // withCredentials sends the HttpOnly auth cookies on every request
    withCredentials: true,
});

// CSRF request interceptor — attach rp_csrf cookie value as X-CSRF-Token header
// for all state-changing requests. GET/HEAD/OPTIONS are safe and exempt.
client.interceptors.request.use((config) => {
    const method = (config.method ?? '').toLowerCase();
    if (['post', 'put', 'patch', 'delete'].includes(method)) {
        const csrfToken = getCsrfFromCookie();
        if (csrfToken) {
            config.headers['X-CSRF-Token'] = csrfToken;
        }
    }
    return config;
});

// Token refresh interceptor — on 401, try refreshing the cookie before giving up
let isRefreshing = false;
let failedQueue: Array<{ resolve: () => void; reject: (err: any) => void }> = [];

const processQueue = (error: any, success = false) => {
    failedQueue.forEach(prom => {
        if (success) prom.resolve();
        else prom.reject(error);
    });
    failedQueue = [];
};

client.interceptors.response.use(
    response => response,
    async error => {
        const originalRequest = error.config;

        // 403 — could be CSRF token expired. Auto-refresh CSRF and retry once.
        if (error.response?.status === 403 && !originalRequest._csrfRetry) {
            const isCsrfFailure = error.response?.data?.error?.includes?.('CSRF');
            if (isCsrfFailure) {
                originalRequest._csrfRetry = true;
                try {
                    // Fetch a fresh CSRF token — server sets new rp_csrf cookie
                    await axios.get(`${baseURL}/auth/csrf`, { withCredentials: true });
                    // Re-read the new cookie value and attach it
                    const newToken = getCsrfFromCookie();
                    if (newToken) originalRequest.headers['X-CSRF-Token'] = newToken;
                    return client(originalRequest);
                } catch {
                    // CSRF refresh failed — user is not authenticated, fall through
                }
            }
            console.warn('Permission denied:', originalRequest?.url);
            return Promise.reject(error);
        }

        if (error.response?.status === 401 && !originalRequest._retry) {
            // Don't retry the refresh endpoint itself to avoid loops
            if (originalRequest.url?.includes('/auth/refresh')) {
                window.dispatchEvent(new CustomEvent('session-expired'));
                return Promise.reject(error);
            }

            // Don't retry /auth/me — it's the initial session check.
            // A 401 here means "not logged in" (fresh visit), NOT "session expired".
            if (originalRequest.url?.includes('/auth/me')) {
                return Promise.reject(error);
            }

            // Don't retry /auth/login — 401 means wrong credentials, not an expired session.
            if (originalRequest.url?.includes('/auth/login')) {
                return Promise.reject(error);
            }

            if (isRefreshing) {
                return new Promise<void>((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(() => client(originalRequest));
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                // Cookie-based refresh: the rp_refresh_token HttpOnly cookie is sent
                // automatically via withCredentials — no token in the request body needed.
                await axios.post(`${baseURL}/auth/refresh`, {}, { withCredentials: true });
                processQueue(null, true);
                return client(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError, false);
                // Notify the app that the session has expired (show modal, not hard redirect)
                window.dispatchEvent(new CustomEvent('session-expired'));
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        // Report ONLY real server errors (5xx) to GlitchTip. 4xx are user/permission issues
        // (excluded above), and no-response network errors are transient offline/flaky-wifi
        // blips during PWA use (not actionable) — don't report them. (2026-06-01)
        const status = error.response?.status;
        if (status && status >= 500) {
            SentrySDK.captureException(error, {
                tags: { axios: 'true', status: String(status) },
                extra: {
                    url: originalRequest?.url,
                    method: originalRequest?.method,
                    response_data: error.response?.data,
                },
            });
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

export const markInventorySold = async (id: string, body: { new_owner_phone?: string; new_owner_name?: string; final_price?: string }) => {
    const res = await client.post(`/api/inventory/${id}/mark-sold`, body);
    return res.data;
};
export const markInventoryOnHold = async (id: string, body: { follow_up_at: string; note?: string }) => {
    const res = await client.post(`/api/inventory/${id}/mark-on-hold`, body);
    return res.data;
};
export const updateInventory = async (id: string, data: Record<string, any>) => {
    const res = await client.patch(`/api/inventory/${id}`, data);
    return res.data;
};

export const cloneInventory = async (id: string, body: { clear: string[]; copy_media: boolean }) => {
    const res = await client.post(`/api/inventory/${id}/clone`, body);
    return res.data as { inventory_id: string; display_id: string | null };
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
    client_phone?: string;   // omit when sharing to a redacted (other-agent) lead…
    client_name?: string;
    deal_id?: string;        // …and pass deal_id instead — backend resolves the phone server-side
}) => {
    const res = await client.post(`/api/inventory/${inventoryId}/share-to-client`, data);
    return res.data;
};

// Find OPEN deals whose demand matches this listing (for the "Match clients" tile button).
export interface MatchedClient {
    deal_id: string;
    contact_phone?: string;       // absent when redacted (lead assigned to another agent, viewer not super_boss)
    contact_redacted?: boolean;   // true → show name only, no number/call; Share still works via deal_id
    lead_manager?: string | null; // the agent who manages this lead (shown next to each match)
    contact_name: string | null;
    demand_intent: string | null;
    demand_budget_min: number | null;
    demand_budget_max: number | null;
    demand_location: string | null;
    status: string;
    score: number;
    match_reason: string;
}
export const getInventoryMatchingClients = async (id: string) => {
    const res = await client.get(`/api/inventory/${id}/matching-clients`);
    return res.data as { matches: MatchedClient[]; total_matched: number; inventory_manager?: string | null };
};

// Unified Contacts directory (Contacts page) — every contact tagged by type, role-scoped.
export interface DirectoryContact {
    phone_number: string;
    name: string | null;
    email?: string | null;
    contact_type: string;
    manager: string | null;
    last_interaction: string | null;
    inventory_count: number;
    demand: { intent: string | null; budget_min: number | null; budget_max: number | null; location: string | null } | null;
    is_partner: boolean;
}
export const getContactsDirectory = async (params?: Record<string, any>) => {
    const res = await client.get('/api/contacts/directory', { params });
    return res.data as { data: DirectoryContact[]; total: number; page: number; totalPages: number; type_counts: Record<string, number> };
};

// Edit a contact's name / phone / email from the Contacts page (cascades to deals + inventory).
export const updateContactProfile = async (phone: string, data: { name?: string; new_phone?: string; email?: string }) => {
    const res = await client.patch(`/api/contacts/${encodeURIComponent(phone)}/profile`, data);
    return res.data as { success: boolean; rekeyed: boolean; new_phone: string };
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

export const transferInventory = async (id: string, to_agent_id: string, reason?: string) => {
    const res = await client.post(`/api/inventory/${id}/transfer`, { to_agent_id, reason });
    return res.data;
};

export const reassignLead = async (phone: string, agent_id: string, reason?: string) => {
    const res = await client.patch(`/api/leads/${encodeURIComponent(phone)}/reassign`, { agent_id, reason });
    return res.data;
};

export const convertLeadToPartner = async (
    phone: string,
    payload: { name?: string; partner_category?: 'INDIVIDUAL' | 'COMPANY'; company_name?: string },
) => {
    const res = await client.post(`/api/leads/${encodeURIComponent(phone)}/convert-to-partner`, payload);
    return res.data;
};

// ── Taxonomy (Phase 1a read + 1c admin editor) ──
export const getTaxonomyTree = async () => (await client.get('/public/taxonomy/tree')).data;
export const getNodeFields = async (nodeId: string) => (await client.get(`/public/taxonomy/nodes/${nodeId}/fields`)).data;
export const getFieldCatalog = async () => (await client.get('/api/taxonomy/fields')).data;
export const updateNodeFields = async (nodeId: string, fields: any[]) =>
    (await client.patch(`/api/taxonomy/nodes/${nodeId}/fields`, { fields })).data;
export const getReviewQueue = async () => (await client.get('/api/taxonomy/review-queue')).data;
export const reassignInventoryNode = async (inventoryId: string, taxonomy_node_id: string) =>
    (await client.patch(`/api/taxonomy/inventory/${inventoryId}/node`, { taxonomy_node_id })).data;
export const bulkReassignReview = async (from_node_id: string | null, to_node_id: string) =>
    (await client.patch('/api/taxonomy/review/bulk', { from_node_id, to_node_id })).data;

export const approveInventory = async (id: string) => {
    const res = await client.post(`/api/inventory/${id}/approve`);
    return res.data;
};

export const rejectInventory = async (id: string, reason?: string) => {
    const res = await client.post(`/api/inventory/${id}/reject`, { reason });
    return res.data;
};

// Partner-claim approvals: a partner submitted (via their portal) a lead for one of our existing direct
// clients. The team approves (credits the partner) or rejects (stays our direct client).
export const getPendingPartnerClaims = async () =>
    (await client.get('/api/leads/pending-partner-claims')).data;

export const approvePartnerClaim = async (phone: string) =>
    (await client.post(`/api/leads/${encodeURIComponent(phone)}/approve-partner-claim`)).data;

export const rejectPartnerClaim = async (phone: string, reason?: string) =>
    (await client.post(`/api/leads/${encodeURIComponent(phone)}/reject-partner-claim`, { reason })).data;

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

export const getTeamMemberProfile = async (id: string) => {
    const res = await client.get(`/api/team/members/${id}`);
    return res.data;
};

export const updateTeamMemberManager = async (id: string, reports_to_id: string | null) => {
    const res = await client.patch(`/api/team/members/${id}`, { reports_to_id });
    return res.data;
};

export const reportNoShow = async (phoneNumber: string) => {
    const res = await client.post(`/api/leads/${phoneNumber}/no-show`);
    return res.data;
};

// 2026-05-12: Mark Lead Lost. Closes the contact + any active deals for it.
export const markLeadLost = async (phoneNumber: string, reason?: string, note?: string) => {
    const res = await client.patch(`/api/leads/${phoneNumber}/mark-lost`, { reason, note });
    return res.data as {
        success: boolean;
        contact: { phone_number: string; name: string | null; lead_status: string; lifecycle_stage: string };
        deals_closed: number;
        closed_deal_ids: string[];
    };
};

// 2026-06-15: Set Active-Lead Delay Reason. Persists stagnation_reason + stagnation_set_at.
// Non-destructive — the lead stays open.
export const setDelayReason = async (phoneNumber: string, reason: string, note?: string) => {
    const res = await client.patch(`/api/leads/${phoneNumber}/delay-reason`, { reason, note });
    return res.data as {
        success: boolean;
        contact: { phone_number: string; name: string | null; stagnation_reason: string | null; stagnation_set_at: string | null };
    };
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
    business_lat?: number | null;
    business_lng?: number | null;
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

// Undo an accidental lead -> partner conversion. 409 when the partner has referred inventory,
// commission entries or sub-agents — the caller shows that message verbatim.
export const revertPartnerToCustomer = async (id: string) => {
    const res = await client.post(`/api/partners/${id}/revert-to-customer`);
    return res.data;
};

export const updatePartnerStatus = async (id: string, status: string) => {
    const res = await client.patch(`/api/partners/${id}/status`, { status });
    return res.data;
};

// Promote a partner to COMPANY (gets "My Team") or back to INDIVIDUAL. Team-only endpoint.
export const updatePartnerCategory = async (id: string, partner_category: 'INDIVIDUAL' | 'COMPANY') => {
    const res = await client.patch(`/api/partners/${id}/category`, { partner_category });
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

export const updatePartner = async (id: string, data: {
    name?: string; email?: string; company_name?: string; city?: string; agency_name?: string;
    business_name?: string; business_address?: string; registration_number?: string;
    business_lat?: number | null; business_lng?: number | null;
    partner_type?: string; partner_category?: string;
    listing_limit?: number | string; priority_score?: number | string;
    commission_rate?: number | string | null; subscription_start?: string | null; subscription_end?: string | null;
}) => {
    const res = await client.patch(`/api/partners/${id}`, data);
    return res.data;
};

export const getPartner = async (id: string) => {
    const res = await client.get(`/api/partners/${id}`);
    return res.data;
};

export const getPartnerInventory = async (id: string) => {
    const res = await client.get(`/api/partners/${id}/inventory`);
    return res.data;
};

export const getPartnerLeads = async (id: string) => {
    const res = await client.get(`/api/partners/${id}/leads`);
    return res.data;
};

export const getPartnerCommissions = async (id: string) => {
    const res = await client.get(`/api/partners/${id}/commissions`);
    return res.data;
};

export const setPartnerPassword = async (id: string, password: string) => {
    const res = await client.post(`/api/partners/${id}/set-password`, { password });
    return res.data;
};

export const updateContactIdentity = async (phone: string, data: { name?: string; email?: string }) => {
    const res = await client.patch(`/api/leads/${encodeURIComponent(phone)}`, data);
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

// ─── PARTNER TEAMS (2026-07-13) — a partner company manages its OWN sub-agents. ────────────────
// Owner-only on the server (requirePartnerOwner). The roster returned here holds PartnerAgent ids —
// NEVER feed it into the internal-team dropdowns (assigned_agent_id etc. are Agent FKs → 500).
export interface PartnerTeamMember {
    id: string;
    name: string;
    phone_number: string;
    email: string | null;
    status: string;
    created_at: string;
    assigned_leads: number;
    assigned_deals: number;
    assigned_listings: number;
}

export const getPartnerTeam = async (): Promise<{ members: PartnerTeamMember[] }> => {
    const res = await client.get('/api/partner/team');
    return res.data;
};

export const addPartnerTeamMember = async (payload: { name: string; phone: string; email?: string }) => {
    const res = await client.post('/api/partner/team', payload);
    return res.data as PartnerTeamMember;
};

export const updatePartnerTeamMember = async (
    subId: string,
    payload: { status?: 'ACTIVE' | 'SUSPENDED'; name?: string; email?: string },
) => {
    const res = await client.patch(`/api/partner/team/${subId}`, payload);
    return res.data as PartnerTeamMember;
};

/** Roster for the "Assign to teammate" dropdowns: the owner + their ACTIVE sub-agents. */
export const getPartnerAssignable = async (): Promise<{ members: Array<{ id: string; name: string; is_owner: boolean }> }> => {
    const res = await client.get('/api/partner/team/assignable');
    return res.data;
};

// Assign one of the partner's OWN rows to one of their OWN sub-agents (null = unassign).
// These take a PartnerAgent id — NEVER pass one to the internal reassign/transfer endpoints, whose
// columns are Agent foreign keys.
export const assignLeadToTeammate = async (phone: string, partner_agent_id: string | null) => {
    const res = await client.post(`/api/leads/${encodeURIComponent(phone)}/partner-assign`, { partner_agent_id });
    return res.data;
};
export const assignDealToTeammate = async (dealId: string, partner_agent_id: string | null) => {
    const res = await client.post(`/api/deals/${dealId}/partner-assign`, { partner_agent_id });
    return res.data;
};
export const assignListingToTeammate = async (inventoryId: string, partner_agent_id: string | null) => {
    const res = await client.post(`/api/inventory/${inventoryId}/partner-assign`, { partner_agent_id });
    return res.data;
};

export const renameInventoryDocument = async (inventoryId: string, documentId: string, title: string) => {
    const res = await client.patch(`/api/inventory/${inventoryId}/documents/${documentId}`, { title });
    return res.data;
};

export const shareInventoryDocument = async (
    inventoryId: string,
    documentId: string,
    payload: { contact_phone?: string; email?: string; contact_name?: string; channels?: string[] },
) => {
    const res = await client.post(`/api/inventory/${inventoryId}/documents/${documentId}/share`, payload);
    return res.data as {
        success: boolean;
        whatsapp_sent: boolean; whatsapp_error: string | null;
        email_sent: boolean; email_error: string | null;
        link: string;
    };
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

export const getTeamPerformance = async (params?: { from?: string; to?: string }) => {
    const res = await client.get('/api/analytics/team-performance', { params });
    return res.data;
};

export const getManagementAlerts = async () => {
    const res = await client.get('/api/analytics/alerts');
    return res.data;
};

export const getDistribution = async (params?: { from?: string; to?: string }) => {
    const res = await client.get('/api/analytics/distribution', { params });
    return res.data;
};

export const getSpeedToLead = async (params?: { from?: string; to?: string }) => {
    const res = await client.get('/api/analytics/speed-to-lead', { params });
    return res.data;
};

// Directional weighted-pipeline GCI estimate (Phase 5E) — not a committed forecast; see /gci-forecast.
export const getGciForecast = async () => {
    const res = await client.get('/api/analytics/gci-forecast');
    return res.data;
};

// Per-manager productivity targets (Phase 5B). Gated server-side on manage_team.
export const getTeamTargets = async () => {
    const res = await client.get('/api/team/targets');
    return res.data;
};

export const updateTeamTargets = async (targets: { leads: number; appointments: number; inventory: number; conversion_rate: number }) => {
    const res = await client.put('/api/team/targets', targets);
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
    source?: string;
    demand_contact_id: string;
    supply_contact_id: string | null;
    coordinator_agent_id: string | null;
    demand_handler_type: string | null;
    demand_handler_id: string | null;
    supply_handler_type: string | null;
    supply_handler_id: string | null;
    inventory_id: string | null;
    demand_intent: string | null;
    demand_property_type: string | null;
    demand_type_slug: string | null;
    demand_category: string | null;
    demand_bedrooms: string | null;
    demand_location: string | null;
    demand_budget_min: number | null;
    demand_budget_max: number | null;
    demand_area_min: number | null;
    demand_area_max: number | null;
    demand_amenities: string[] | null;
    demand_notes: string | null;
    // Phase 2 demand-side unification (2026-05-29) — canonical SoT mirror on the Deal model.
    demand_taxonomy_node_id?: string | null;
    demand_schema_values?: Record<string, any> | null;
    demand_contact?: {
        phone_number?: string;
        name?: string;
        email?: string;
        contact_type?: string;
        // Referral partner (the partner agent a lead was added on behalf of) — denormalized on the contact.
        referral_partner_id?: string | null;
        referral_partner_name?: string | null;
        referral_partner_phone?: string | null;
        // Requirements fields (SSOT — fallback source for RequirementsTab)
        intent?: string | null;
        demand_main_category?: string | null;   // = demand_property_type on transaction
        demand_category?: string | null;
        demand_type_slug?: string | null;
        demand_bhk?: number | null;             // = demand_bedrooms as number
        budget_min?: number | null;             // = demand_budget_min
        budget_max?: number | null;             // = demand_budget_max
        preferred_location?: string | null;     // = demand_location
        area_min?: number | null;
        area_max?: number | null;
        demand_amenities?: string[] | null;
        // Phase 2 demand-side unification — canonical SoT.
        demand_taxonomy_node_id?: string | null;
        demand_schema_values?: Record<string, any> | null;
    };
    supply_contact?: { phone_number?: string; name?: string };
    coordinator?: { id: string; name: string; phone?: string };
    inventory?: { id: string; type: string; location: string; price: number | null; media_urls?: string[] };
    valid_next_statuses?: string[];
    ai_status?: string;
    ai_paused?: boolean;
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

export const updateDealStatus = async (id: string, status: string, reason?: string, final_price?: number) => {
    const res = await client.patch(`/api/deals/${id}/status`, { status, reason, final_price });
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

export const updateDealRequirements = async (dealId: string, fields: Partial<{
    demand_intent: string;
    demand_category: string;
    demand_type_slug: string;
    demand_property_type: string;
    demand_bedrooms: string;
    demand_location: string;
    demand_budget_min: number;
    demand_budget_max: number;
    demand_area_min: number;
    demand_area_max: number;
    demand_amenities: string[];
    demand_notes: string;
    // Phase 2 demand-side unification (2026-05-29) — canonical SoT mirror.
    demand_taxonomy_node_id: string | null;
    demand_schema_values: Record<string, any> | null;
}>) => {
    const res = await client.patch(`/api/deals/${dealId}/requirements`, fields);
    return res.data;
};

export const updateLeadRequirements = async (phone: string, fields: {
    intent?: string;
    demand_main_category?: string | null;
    demand_category?: string | null;
    demand_type_slug?: string | null;
    demand_bhk?: number | null;
    budget_min?: number | null;
    budget_max?: number | null;
    preferred_location?: string;
    preferred_lat?: number | null;
    preferred_lng?: number | null;
    area_min?: number | null;
    area_max?: number | null;
    area_unit?: string | null;
    timeline?: string | null;
    demand_amenities?: string[];
    category_id?: string | null;
    sub_category_id?: string | null;
    type_id?: string | null;
    // Phase 2 demand-side unification (2026-05-29) — canonical SoT mirror.
    demand_taxonomy_node_id?: string | null;
    demand_schema_values?: Record<string, any> | null;
}) => {
    const res = await client.patch(`/api/leads/${encodeURIComponent(phone)}/requirements`, fields);
    return res.data;
};

export const reassignDeal = async (dealId: string, agentId: string, reason?: string) => {
    const res = await client.patch(`/api/deals/${dealId}/reassign`, { agent_id: agentId, reason });
    return res.data;
};

export const setDealReminder = async (
    dealId: string,
    payload: { remind_at: string; note?: string; advance_minutes?: number; reason?: string },
) => {
    const res = await client.post(`/api/deals/${dealId}/reminder`, payload);
    return res.data;
};

export const getDealMatchedInventory = async (dealId: string, filters?: Record<string, string>) => {
    const res = await client.get(`/api/deals/${dealId}/matched-inventory`, { params: filters });
    return res.data;
};

// Quick "N matching properties" counts for pipeline tiles (lightweight; budget+type+BHK, no geo).
export const getDealMatchCounts = async (dealIds: string[]): Promise<Record<string, number>> => {
    if (!dealIds.length) return {};
    const res = await client.post('/api/deals/match-counts', { deal_ids: dealIds });
    return res.data?.data || {};
};

export const shareDealProperties = async (dealId: string, inventoryIds: string[]) => {
    const res = await client.post(`/api/deals/${dealId}/share-properties`, { inventory_ids: inventoryIds });
    return res.data;
};

// 2026-07-29: record a share sent from the agent's PERSONAL WhatsApp (wa.me) so it shows in Shared.
// 2026-07-31: share a LEAD with additional team members (collaboration).
export const shareLead = async (phone: string, agentIds: string[]) => {
    const res = await client.post(`/api/leads/${encodeURIComponent(phone)}/share`, { agent_ids: agentIds });
    return res.data as { success: boolean; shared_with_ids: string[] };
};

export const recordPersonalShare = async (dealId: string, inventoryIds: string[], toPartner: boolean) => {
    const res = await client.post(`/api/deals/${dealId}/record-personal-share`, { inventory_ids: inventoryIds, to_partner: toPartner });
    return res.data;
};

export const bookDealAppointment = async (dealId: string, payload: {
    inventory_id: string;
    date: string;
    time: string;
}) => {
    const res = await client.post(`/api/deals/${dealId}/book-appointment`, payload);
    return res.data;
};

export const getDealPropertyShares = async (dealId: string) => {
    const res = await client.get(`/api/deals/${dealId}/property-shares`);
    return res.data;
};

export const logDealAction = async (dealId: string, payload: {
    action_type: string;
    notes?: string;
    outcome?: string;
}) => {
    const res = await client.post(`/api/deals/${dealId}/log-action`, payload);
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
