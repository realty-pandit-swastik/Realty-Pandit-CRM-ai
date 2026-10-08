
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import PhoneInput from './PhoneInput';
import CallerDossier from './CallerDossier';
import client, { getPartnerAssignable, assignLeadToTeammate, shareLead, rosterForPickers, updateContactProfile, getDealMatchCounts } from '../api/client';
import { isPlaceholderPhone, isValidPhoneInput, toDialablePhone, normalizePhoneInput } from '../lib/phone';
import { drillTo } from '../lib/drill';
import { bhkLabel as bhkLabelFor, stageInfo, dealerFallback, clientRoleLabel, clientRoleColor } from '../lib/leadDisplay';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import LeadCard from './leads/LeadCard';
import { WhatsAppChatTab } from './WhatsAppChatTab';
import { ConvertToPartnerModal } from './ConvertToPartnerModal';
import MatchedPropertiesSection from './leads/MatchedPropertiesSection';
import DemandRequirementsForm, { type DemandPayload, type DemandRequirementsFormHandle } from './leads/DemandRequirementsForm';
import MultiSelectTeam from './leads/MultiSelectTeam';
import { loadGoogleMaps } from '../lib/loadGoogleMaps';
import {
    FilterSection,
    FilterTaxonomySection,
    FilterLocationSection,
    StalenessSection,
} from './filters/FilterSheetShared';
import type { TaxonomySelection, LocationSelection } from './filters/FilterSheetShared';

// ─── Constants ───────────────────────────────────────────────────────────────

// AMENITIES_LIST removed Phase 2 demand-side unification (2026-05-29).
// Amenities now come from the taxonomy 'amenities' FieldDefinition.options_json
// rendered inside <DemandRequirementsForm>'s dynamic by-type panel.

// ─── Type Definitions ────────────────────────────────────────────────────────


interface Lead {
    phone_number: string;
    name: string | null;
    email: string | null;
    source: string;
    lead_status: string;
    contact_type: string | null;
    intent: string | null;
    property_type: string | null;
    preferred_location: string | null;
    preferred_lat: number | null;
    preferred_lng: number | null;
    lifecycle_stage: string | null;
    created_at: string;
    notes: string | null;
    assigned_agent_id: string | null;
    // 2026-08-09: agent IDs this lead is shared with — powers the "Shared" badge.
    shared_with_ids?: string[] | null;
    budget_min: string | null;
    budget_max: string | null;
    demand_bhk: number | null;
    category_id: string | null;
    sub_category_id: string | null;
    type_id: string | null;
    lead_score: { total_score: number } | null;
    timeline: string | null;
    area_min: number | null;
    area_max: number | null;
    area_unit: string | null;
    demand_amenities: string[] | null;
    // Phase 2 demand-side unification (2026-05-29) — canonical SoT.
    demand_taxonomy_node_id?: string | null;
    demand_schema_values?: Record<string, any> | null;
    lead_type: string | null;
    referral_partner_id: string | null;
    referral_partner_name: string | null;
    referral_partner_phone: string | null;
    // Primary client role (CLIENT | AGENT | BUILDER | FINANCER | CHOKIDAR…) — standing identity.
    client_role?: string | null;
    // One contact → many leads: the enquiries (deals) on this contact that the viewer may see.
    demand_transactions?: LeadDeal[];
}

interface LeadDeal {
    id: string; source: string; source_ref: string | null; status: string; created_at: string;
    // Temporary per-enquiry client role — overrides Contact.client_role on that row.
    client_role_override?: string | null;
    coordinator: { id: string; name: string | null } | null;
}

/** A list row = one enquiry. `_deal` is set when the contact has visible deals. */
type LeadRow = Lead & { _deal?: LeadDeal };

interface AppointmentEntry {
    id: string;
    type: string;
    title: string;
    scheduled_at: string;
    status: string;
    property_id: string | null;
    property: { id: string; type: string; location: string | null } | null;
}

interface LeadDetail extends Lead {
    /** Every enquiry (lead) on this contact, newest first — summary only. */
    lead_history?: Array<LeadDeal & { coordinator_agent_id: string | null }>;
    /** Everyone who has handled this contact: owner, each lead's assignee, explicit shares. */
    associated_users?: Array<{ id: string; name: string | null }>;
    recent_interactions: Array<{
        id: string;
        channel: string;
        direction: string;
        event_type: string;
        content: string | null;
        created_at: string;
        metadata?: Record<string, any> | null;
    }>;
}

interface MatchedProperty {
    id: string;
    type: string;
    category: string;
    location: string | null;
    price: number | null;
    price_unit: string | null;
    intent: string;
    match_score: number;
    priority_tier: string;
    specs: any;
    media_urls: string[];
}

interface TeamMember { id: string; name: string; role: string; }


// ─── Constants ────────────────────────────────────────────────────────────────

const sourceColors: Record<string, string> = {
    '99acres': '#ef4444', 'magicbricks': '#f59e0b', 'housing': '#3b82f6',
    'website': '#22c55e', 'whatsapp': '#25d366', 'voice': '#8b5cf6', 'manual': '#6b7280',
    'admin_created': '#a855f7', 'inventory_workflow': '#06b6d4', 'website_popup': '#f97316',
    'agent_registration': '#ec4899',
};
const sourceLabels: Record<string, string> = {
    '99acres': '99acres', 'magicbricks': 'MagicBricks', 'housing': 'Housing.com',
    'website': 'Website', 'whatsapp': 'WhatsApp', 'voice': 'Voice Call', 'manual': 'Manual',
    'admin_created': 'Admin Created', 'inventory_workflow': 'Inventory Flow', 'website_popup': 'Website Popup',
    'agent_registration': 'Agent Reg.',
};
const LEAD_STATUSES = ['cold', 'warm', 'hot', 'closed', 'lost'];
// Pipeline stage display lives in lib/leadDisplay (shared with LeadCard).
// Contact.lifecycle_stage is auto-driven by the deal pipeline. Shown read-only. (2026-07-29)
const LIFECYCLE_STAGES = ['NEW', 'QUALIFIED', 'MATCHING_APPOINTMENT', 'VISIT_SCHEDULED', 'VISITED', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST', 'ON_HOLD'];
const SOURCES = ['99acres', 'magicbricks', 'housing', 'website', 'whatsapp', 'voice', 'manual', 'admin_created', 'inventory_workflow', 'website_popup', 'agent_registration'];
const PRIVILEGED_ROLES = ['super_boss', 'manager'];

// Lead-source roles for the Add-Lead wizard (Step 2 cards). Single source of truth —
// the rendered cards, step indicator and submit payload all derive from these keys.
// Visuals (icon/title/subtitle/accent) are part of the config so a future role is a
// one-row addition, not a new hardcoded card.
type LeadSourceRole = 'DIRECT_OWNER' | 'PARTNER_REFERRAL';
const LEAD_SOURCE_ROLES: Array<{ key: LeadSourceRole; icon: string; title: string; subtitle: string; accent: string; hoverBg: string }> = [
    { key: 'DIRECT_OWNER', icon: '👤', title: 'Client', subtitle: 'Client contacted directly', accent: '#3b82f6', hoverBg: 'rgba(59,130,246,0.06)' },
    { key: 'PARTNER_REFERRAL', icon: '🤝', title: 'Partner Agent', subtitle: 'Referred by a partner', accent: '#7c3aed', hoverBg: 'rgba(124,58,237,0.06)' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(s: number) { return s >= 80 ? '#ef4444' : s >= 60 ? '#f59e0b' : '#6b7280'; }

function formatBudget(val: string | null): string {
    if (!val) return '-';
    const n = Number(val);
    if (n >= 10000000) return `\u20b9${(n / 10000000).toFixed(1)}Cr`;
    if (n >= 100000) return `\u20b9${(n / 100000).toFixed(0)}L`;
    return `\u20b9${n.toLocaleString('en-IN')}`;
}

function channelIcon(ch: string) {
    return ({ whatsapp: '💬', voice: '📞', email: '📧', website: '🌐' } as any)[ch] || '📌';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExternalLeads({ isMobile: isMobileProp, initialFilter, onFilterConsumed }: { isMobile?: boolean; initialFilter?: Record<string, string> | null; onFilterConsumed?: () => void } = {}) {
    const { agent, hasPermission, isPartner, isPartnerOwner } = useAuth();
    const { showToast } = useToast();
    const isPrivileged = PRIVILEGED_ROLES.includes(agent?.role ?? '');
    const closingViaPopState = useRef(false);

    // ── Mobile detection ──
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);

    // ── Browser back button support (PWA mobile) ──
    useEffect(() => {
        const mobile = isMobileProp ?? isMobile;
        if (!mobile) return;
        const handler = (e: PopStateEvent) => {
            const s = e.state;
            if (s?.view === 'leads' && !s.detail && !s.modal) {
                closingViaPopState.current = true;
                setSelectedPhone(null);
                setLeadDetail(null);
                setMatches([]);
                setShowCreateModal(false);
                closingViaPopState.current = false;
            }
        };
        window.addEventListener('popstate', handler);
        return () => window.removeEventListener('popstate', handler);
    }, [isMobileProp, isMobile]);

    // ── Data state ──
    const [recentLeads, setRecentLeads] = useState<Lead[]>([]);
    // True total for the CURRENT filter set (from the server), and the page size we've loaded.
    // Fixes the counter mismatch: the header/badges used a by-source sum (ignored filters) while
    // the list is capped at `pageLimit`. recentTotal = the real filtered count; Load-more raises pageLimit.
    const [recentTotal, setRecentTotal] = useState(0);
    const [pageLimit, setPageLimit] = useState(500);
    // Column sorting (2026-07-22). Server-side — the list is capped at pageLimit, so sorting
    // client-side would only reorder the rows already loaded. Deliberately NOT persisted:
    // a refresh returns to the default "latest on top".
    const [leadSortKey, setLeadSortKey] = useState<string>('date');
    const [leadSortDir, setLeadSortDir] = useState<'asc' | 'desc'>('desc');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const pendingLeadsRequest = useRef<AbortController | null>(null);

    // ── Filters ──
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    useEffect(() => {
        const t = setTimeout(() => {
            setDebouncedSearch(searchQuery.trim());
            // A new query should start from the first page of results instead of
            // retaining a previously expanded Load-more limit.
            setPageLimit(500);
        }, 350);
        return () => clearTimeout(t);
    }, [searchQuery]);
    const [statusFilter, setStatusFilter] = useState(initialFilter?.status ?? '');
    const [sourceFilter, setSourceFilter] = useState(initialFilter?.source ?? '');
    const [agentFilter, setAgentFilter] = useState(initialFilter?.agent_id ?? '');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [showFilterSheet, setShowFilterSheet] = useState(false);
    // v2 filter state
    const [intentFilter, setIntentFilter] = useState<'BUYER' | 'TENANT' | ''>('');
    const [filterTaxonomy, setFilterTaxonomy] = useState<TaxonomySelection>({ nodeIds: [], bhk: [] });
    const [locationSelection, setLocationSelection] = useState<LocationSelection>({
        label: '', lat: null, lng: null, radiusKm: 2,
    });
    const [notContactedDays, setNotContactedDays] = useState(initialFilter?.not_contacted_days ? Number(initialFilter.not_contacted_days) : 0);
    const [noShowcaseDays, setNoShowcaseDays] = useState(0);
    const [budgetMinFilter, setBudgetMinFilter] = useState(''); // lead budget filter (#3, 2026-06-28)
    const [budgetMaxFilter, setBudgetMaxFilter] = useState('');
    // Bulk reassign (#4, 2026-06-28)
    const [leadSelectMode, setLeadSelectMode] = useState(false);
    const [selectedLeadPhones, setSelectedLeadPhones] = useState<Set<string>>(new Set());
    const [showLeadReassign, setShowLeadReassign] = useState(false);
    const [leadReassignTarget, setLeadReassignTarget] = useState('');
    const [leadReassigning, setLeadReassigning] = useState(false);
    const [leadReassignMsg, setLeadReassignMsg] = useState('');
    const toggleLeadSelect = (phone: string) => setSelectedLeadPhones(prev => {
        const selected = new Set(prev);
        if (selected.has(phone)) selected.delete(phone);
        else selected.add(phone);
        return selected;
    });
    // 2026-05-13: active / archived / all — default hides lost+closed so the team
    // only sees workable leads. Recovered via toggle at top of page.
    const [activeFilter, setActiveFilter] = useState<'active' | 'archived' | 'all'>((initialFilter?.active as 'active' | 'archived' | 'all') || 'active');

    // "Shared with me" (2026-08-09): leads someone else owns but shared with me. Without this they
    // are visible but unfindable — nothing marks them and the default sort is the lead's own age.
    const [sharedWithMe, setSharedWithMe] = useState(false);

    // Drill-through one-shot (2026-07-16): opened pre-filtered from a dashboard tile → the filter is
    // seeded into the useState above on mount; tell the parent to clear its one-shot state so a later
    // manual visit to Ext. Leads starts clean.
    useEffect(() => {
        if (initialFilter && onFilterConsumed) onFilterConsumed();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Taxonomy tree (new) ──
    const [taxonomyTree, setTaxonomyTree] = useState<any[]>([]);
    // Tile subtype labels: flatten the nested taxonomy tree (Category → Sub → [Group] → Type)
    // into an id → name map so each lead tile can show its property subtype
    // (e.g. "Builder Flat Front") without an extra lookup per row.
    const taxonomyNameById = useMemo(() => {
        const map = new Map<string, string>();
        const walk = (nodes: any[]) => {
            for (const n of nodes || []) {
                if (n?.id && n?.name) map.set(String(n.id), String(n.name));
                if (Array.isArray(n?.children) && n.children.length) walk(n.children);
            }
        };
        walk(taxonomyTree);
        return map;
    }, [taxonomyTree]);
    const subtypeLabelFor = useCallback((lead: Lead): string | null => {
        const nodeId = (lead as any).demand_taxonomy_node_id;
        if (nodeId && taxonomyNameById.has(String(nodeId))) return taxonomyNameById.get(String(nodeId))!;
        return null;
    }, [taxonomyNameById]);
    // "N Matches" badge for tiles: lightweight per-deal counts (budget+type+BHK, no geo),
    // same signal as the Deal Pipeline tiles. Keyed by deal id; missing = not loaded yet.
    const [tileMatchCounts, setTileMatchCounts] = useState<Record<string, number>>({});
    // ── Team members ──
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
    // PARTNER TEAMS: the owner's OWN sub-agents. Kept in its own state on purpose — teamMembers
    // feeds internal controls whose columns are Agent FKs; a PartnerAgent id there = 500.
    const [partnerRoster, setPartnerRoster] = useState<Array<{ id: string; name: string; is_owner: boolean }>>([]);

    // ── Status update ──
    const [updatingPhone, setUpdatingPhone] = useState<string | null>(null);

    // ── Create lead modal ──
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createForm, setCreateForm] = useState({
        name: '', phone: '', email: '', source: 'manual', intent: '', notes: '',
        preferred_location: '',
    });
    const [createAssignedAgentId, setCreateAssignedAgentId] = useState('');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState('');

    // ── Lead Detail Slide-Over ──
    const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
    const [leadDetail, setLeadDetail] = useState<LeadDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);

    // ── Matches ──
    const [matches, setMatches] = useState<MatchedProperty[]>([]);
    const [matchLoading, setMatchLoading] = useState(false);
    const [matchError, setMatchError] = useState('');

    // ── Slide-over edit state ──
    const [editNotes, setEditNotes] = useState('');
    const [savingNotes, setSavingNotes] = useState(false);
    const [editName, setEditName] = useState('');
    const [savingName, setSavingName] = useState(false);
    const [editPhone, setEditPhone] = useState('');
    const [savingPhone, setSavingPhone] = useState(false);
    const [editLifecycle, setEditLifecycle] = useState('');
    const [editAgent, setEditAgent] = useState('');
    const [sharedWith, setSharedWith] = useState<string[]>([]); // 2026-07-31 lead collaboration
    const demandFormRef = useRef<DemandRequirementsFormHandle>(null); // 2026-08-01 single-save
    // In-batch re-keyed phone: set during handleSaveAll so the requirements
    // sub-form (submitted via ref) uses the NEW key, not stale selectedPhone state.
    const saveKeyRef = useRef<string | null>(null);
    const [savingAll, setSavingAll] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [editPartnerAssignee, setEditPartnerAssignee] = useState('');   // PartnerAgent id — NOT an Agent id

    // Phase 2 (2026-05-29): inline-form state vars (editBudgetMin/Max, editBhk,
    // editCategoryId/SubCategoryId/TypeId, editIntent, editTimeline, editAreaMin/Max/Unit,
    // editAmenities) all removed — they lived in the now-deleted inline form. The new
    // <DemandRequirementsForm> manages its own state. Preferred lat/lng stay because they
    // still need to be carried alongside the canonical save (Google Places autocomplete
    // updates them when the user types a location, via the editLocationRef effect).
    const [editPreferredLat, setEditPreferredLat] = useState<number | null>(null);
    const [editPreferredLng, setEditPreferredLng] = useState<number | null>(null);
    const [savingReqs, setSavingReqs] = useState(false);
    const [sessionAnswers, setSessionAnswers] = useState<Record<string, any> | null>(null);

    // Convert to Deal
    const [convertingDeal, setConvertingDeal] = useState(false);
    const [dealError, setDealError] = useState('');

    // ── Create modal steps ──
    // DIRECT_OWNER:   1=source → 2=contact search → 3=details form
    // PARTNER_REFERRAL: 1=source → 2=details form (with partner search at top)
    const [createStep, setCreateStep] = useState<1 | 2 | 3 | 4>(1);
    const [suggestedLeadType, setSuggestedLeadType] = useState<string | null>(null);
    const roleCardRefs = useRef<(HTMLDivElement | null)[]>([]);
    const suggestSeq = useRef(0);
    const [identityNewPhone, setIdentityNewPhone] = useState<string | null>(null);

    // ── Client contact search (Step 2 for DIRECT_OWNER) ──
    const [clientSearchQuery, setClientSearchQuery] = useState('');
    const [clientSearchResults, setClientSearchResults] = useState<Array<{ phone_number: string; name: string | null; contact_type: string; lead_status: string | null }>>([]);
    const [clientSearching, setClientSearching] = useState(false);
    const clientSearchTimer = useRef<any>(null);
    const clientSearchSequence = useRef(0);
    useEffect(() => () => { clearTimeout(clientSearchTimer.current); ++clientSearchSequence.current; }, []);
    useEffect(() => {
        if (!showCreateModal) { ++clientSearchSequence.current; clearTimeout(clientSearchTimer.current); setClientSearchResults([]); setClientSearching(false); }
    }, [showCreateModal]);
    const [preselectedContact, setPreselectedContact] = useState<{ phone_number: string; name: string | null } | null>(null);
    // Pause the 30s auto-refresh while the user is working (a modal/detail open) or the tab is unfocused. (2026-07-09)
    const busyRef = useRef(false);
    useEffect(() => {
        busyRef.current = !!(showLeadReassign || showCreateModal || leadDetail || selectedPhone || preselectedContact);
    }, [showLeadReassign, showCreateModal, leadDetail, selectedPhone, preselectedContact]);
    // Partner-referral flow: if the entered client phone matches an existing client, we surface a notice
    // ("Add as Direct Client") — the backend attaches this requirement to that contact instead of 409-ing.
    const [partnerClientMatch, setPartnerClientMatch] = useState<{ phone_number: string; name: string | null } | null>(null);
    // Partner-claim approvals: partners who submitted a lead for one of our existing direct clients.
    const [pendingClaims, setPendingClaims] = useState<any[]>([]);
    const [claimBusy, setClaimBusy] = useState<string | null>(null);

    // ── Lead Type Toggle (create modal) ──
    const [createLeadType, setCreateLeadType] = useState<'DIRECT_OWNER' | 'PARTNER_REFERRAL'>('DIRECT_OWNER');
    const [createPartnerPhone, setCreatePartnerPhone] = useState('');
    const [createPartnerName, setCreatePartnerName] = useState('');

    // ── Partner Search (create modal) ──
    const [partnerSearchQuery, setPartnerSearchQuery] = useState('');
    const [partnerSearchResults, setPartnerSearchResults] = useState<Array<{ id: string; phone_number: string; name: string; email?: string; company_name?: string; city?: string; status: string; verified: boolean; package_type: string }>>([]);
    const [partnerSearching, setPartnerSearching] = useState(false);
    const [partnerSelected, setPartnerSelected] = useState<{ id: string; phone_number: string; name: string; email?: string; city?: string; status: string; verified: boolean } | null>(null);
    const [showPartnerRegister, setShowPartnerRegister] = useState(false);
    const [partnerSearchDone, setPartnerSearchDone] = useState(false);
    const [newPartnerForm, setNewPartnerForm] = useState({ phone: '', name: '', email: '', city: '' });
    const partnerSearchTimer = useRef<any>(null);

    // ── 99acres Sync Status ──
    const [syncStatus, setSyncStatus] = useState<any>(null);
    const [syncLoading, setSyncLoading] = useState(false);

    // ── Visits & Views tab (slide-over) ──
    const [sliderTab, setSliderTab] = useState<'activity' | 'chat' | 'visits'>('activity');
    const [showConvert, setShowConvert] = useState(false);
    const [leadAppointments, setLeadAppointments] = useState<AppointmentEntry[]>([]);
    const [appointmentsLoading, setAppointmentsLoading] = useState(false);

    // Google Maps refs for slide-over
    const editLocationRef = useRef<HTMLInputElement>(null);
    const editAcRef = useRef<any>(null);

    // ─── Data Loading ─────────────────────────────────────────────────────────

    const loadData = useCallback(async () => {
        // Cancel a previous list request before starting the next one. Without
        // this, a slower response to an older search can overwrite newer results.
        pendingLeadsRequest.current?.abort();
        const controller = new AbortController();
        pendingLeadsRequest.current = controller;
        try {
            setError(null);
            const recentRes = await client.get('/api/leads/recent-external', {
                    signal: controller.signal,
                    params: {
                        ...(sourceFilter ? { source: sourceFilter } : {}),
                        ...(statusFilter ? { status: statusFilter } : {}),
                        ...(agentFilter ? { agent_id: agentFilter } : {}),
                        ...(debouncedSearch ? { search: debouncedSearch } : {}),
                        active: activeFilter,
                        intent: intentFilter || undefined,
                        taxonomy_node_ids: filterTaxonomy.nodeIds.length > 0 ? filterTaxonomy.nodeIds.join(',') : undefined,
                        bhk: filterTaxonomy.bhk.length > 0 ? filterTaxonomy.bhk.join(',') : undefined,
                        lat: locationSelection.lat !== null ? String(locationSelection.lat) : undefined,
                        lng: locationSelection.lng !== null ? String(locationSelection.lng) : undefined,
                        radius_km: (locationSelection.lat !== null && locationSelection.radiusKm > 0) ? String(locationSelection.radiusKm) : undefined,
                        not_contacted_days: notContactedDays > 0 ? String(notContactedDays) : undefined,
                        no_showcase_days: noShowcaseDays > 0 ? String(noShowcaseDays) : undefined,
                        budget_min: budgetMinFilter.trim() || undefined,
                        budget_max: budgetMaxFilter.trim() || undefined,
                        ...(sharedWithMe ? { shared_with_me: 'true' } : {}),
                        limit: String(pageLimit),
                        sort: leadSortKey,
                        direction: leadSortDir,
                    },
                });
            // Support both new format { leads, total } and legacy flat array
            const recentData = recentRes.data;
            const loaded: Lead[] = Array.isArray(recentData) ? recentData : (recentData.leads || []);
            setRecentLeads(loaded);
            // Capture the server's TRUE filtered count (recent-external returns { leads, total }).
            setRecentTotal(Array.isArray(recentData) ? loaded.length : (recentData.total ?? loaded.length));
        } catch (err: any) {
            if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
            setError(err?.response?.data?.error || err.message || 'Failed to load leads');
        } finally {
            if (pendingLeadsRequest.current === controller) {
                pendingLeadsRequest.current = null;
                setLoading(false);
            }
        }
    }, [sourceFilter, statusFilter, agentFilter, intentFilter, filterTaxonomy, locationSelection, notContactedDays, noShowcaseDays, budgetMinFilter, budgetMaxFilter, debouncedSearch, activeFilter, sharedWithMe, pageLimit, leadSortKey, leadSortDir]);

    useEffect(() => { loadData(); }, [loadData]);
    useEffect(() => () => pendingLeadsRequest.current?.abort(), []);
    useEffect(() => {
        const interval = setInterval(() => { if (busyRef.current || document.hidden) return; loadData(); }, 30000);
        return () => clearInterval(interval);
    }, [loadData]);

    // ─── Partner-claim approvals queue ───────────────────────────────────────
    // NOTE: partners DO have edit_inventory — the permission alone does not exclude them.
    // The claims queue is ours (approving partner claims about their own leads = conflict of interest).
    const canApproveClaims = !isPartner && hasPermission('edit_inventory');
    const loadPendingClaims = useCallback(async () => {
        if (!canApproveClaims) return;
        try {
            const res = await client.get('/api/leads/pending-partner-claims');
            setPendingClaims(res.data || []);
        } catch { /* non-fatal */ }
    }, [canApproveClaims]);
    useEffect(() => { loadPendingClaims(); }, [loadPendingClaims]);

    const handleApproveClaim = async (phone: string) => {
        setClaimBusy(phone);
        try {
            await client.post(`/api/leads/${encodeURIComponent(phone)}/approve-partner-claim`);
            await Promise.all([loadPendingClaims(), loadData()]);
        } catch { /* surfaced via the row staying */ } finally { setClaimBusy(null); }
    };
    const handleRejectClaim = async (phone: string) => {
        setClaimBusy(phone);
        try {
            await client.post(`/api/leads/${encodeURIComponent(phone)}/reject-partner-claim`, {});
            await Promise.all([loadPendingClaims(), loadData()]);
        } catch { /* */ } finally { setClaimBusy(null); }
    };

    // Load sync status
    const loadSyncStatus = useCallback(async () => {
        if (isPartner) return;   // portal-sync is our ops; the endpoint 403s for partners
        try {
            const res = await client.get('/api/integrations/sync-status');
            const acres = res.data?.integrations?.find((i: any) => i.source === '99acres');
            setSyncStatus(acres || null);
        } catch { /* ignore */ }
    }, [isPartner]);

    useEffect(() => { loadSyncStatus(); }, [loadSyncStatus]);
    useEffect(() => {
        const interval = setInterval(loadSyncStatus, 60000);
        return () => clearInterval(interval);
    }, [loadSyncStatus]);

    const handleManualSync = async () => {
        setSyncLoading(true);
        try {
            await client.post('/api/integrations/99acres/sync');
            await Promise.all([loadData(), loadSyncStatus()]);
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Sync failed');
        } finally {
            setSyncLoading(false);
        }
    };

    // Load classification tree once
    useEffect(() => {
        client.get('/public/taxonomy/tree')
            .then(r => {
                setTaxonomyTree(r.data.tree || []);
            })
            .catch(() => {});
    }, []);

    // Load the roster once — INTERNAL team for staff, the partner's OWN sub-agents for a partner owner.
    // A partner must never see our team roster (the endpoint 403s them anyway), and a sub-agent gets
    // no roster at all because they cannot assign.
    useEffect(() => {
        if (!isPartner) {
            client.get('/api/team/members-list').then(r => setTeamMembers(rosterForPickers(r.data))).catch(() => {});
        } else if (isPartnerOwner) {
            getPartnerAssignable().then(r => setPartnerRoster(r.members || [])).catch(() => {});
        }
    }, [isPartner, isPartnerOwner]);

    /** Assign the open lead to one of the owner's own sub-agents (or unassign). */
    const handleAssignTeammate = async (phone: string, partnerAgentId: string) => {
        const prev = editPartnerAssignee;
        setEditPartnerAssignee(partnerAgentId);
        try {
            await assignLeadToTeammate(phone, partnerAgentId || null);
            const who = partnerRoster.find(m => m.id === partnerAgentId)?.name;
            showToast(partnerAgentId ? `Assigned to ${who}.` : 'Unassigned.', 'success');
            loadData();
        } catch (e: any) {
            setEditPartnerAssignee(prev);   // roll back the optimistic select
            showToast(e.response?.data?.error || 'Could not assign this lead.', 'error');
        }
    };

    // ─── Google Maps Autocomplete Setup ───────────────────────────────────────

    const MAPS_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';

    const attachEditAutocomplete = useCallback((onSelect: (location: string, lat: number, lng: number) => void) => {
        if (!editLocationRef.current || !(window as any).google?.maps?.places) return;
        if (editAcRef.current) {
            (window as any).google.maps.event.clearInstanceListeners(editAcRef.current);
        }
        const ac = new (window as any).google.maps.places.Autocomplete(editLocationRef.current, {
            componentRestrictions: { country: 'in' },
            fields: ['formatted_address', 'geometry'],
        });
        ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            const lat = place.geometry?.location?.lat() ?? 0;
            const lng = place.geometry?.location?.lng() ?? 0;
            onSelect(place.formatted_address || '', lat, lng);
        });
        editAcRef.current = ac;
    }, []);

    // ─── Partner Search (debounced) ──────────────────────────────────────────

    useEffect(() => {
        if (createLeadType !== 'PARTNER_REFERRAL') return;
        if (partnerSearchQuery.trim().length < 2) {
            setPartnerSearchResults([]);
            setPartnerSearchDone(false);
            return;
        }
        if (partnerSearchTimer.current) clearTimeout(partnerSearchTimer.current);
        partnerSearchTimer.current = setTimeout(async () => {
            setPartnerSearching(true);
            try {
                const res = await client.get('/api/partners/search', { params: { q: partnerSearchQuery.trim() } });
                setPartnerSearchResults(res.data || []);
                setPartnerSearchDone(true);
            } catch {
                setPartnerSearchResults([]);
                setPartnerSearchDone(true);
            } finally {
                setPartnerSearching(false);
            }
        }, 400);
        return () => { if (partnerSearchTimer.current) clearTimeout(partnerSearchTimer.current); };
    }, [partnerSearchQuery, createLeadType]);

    // Partner-referral: detect whether the typed client phone already belongs to a contact, so we can
    // tell the team it'll attach as a requirement to that client ("Add as Direct Client") rather than fail.
    useEffect(() => {
        if (createLeadType !== 'PARTNER_REFERRAL' || preselectedContact) { setPartnerClientMatch(null); return; }
        const digits = createForm.phone.replace(/\D/g, '').slice(-10);
        if (digits.length < 10 || !/^[6-9]/.test(digits)) { setPartnerClientMatch(null); return; }
        const t = setTimeout(async () => {
            try {
                const res = await client.get('/api/leads/search', { params: { q: digits } });
                const match = (res.data || []).find((c: any) => (c.phone_number || '').replace(/\D/g, '').slice(-10) === digits);
                setPartnerClientMatch(match ? { phone_number: match.phone_number, name: match.name ?? null } : null);
            } catch { setPartnerClientMatch(null); }
        }, 350);
        return () => clearTimeout(t);
    }, [createForm.phone, createLeadType, preselectedContact]);


    const selectPartner = (p: typeof partnerSearchResults[0]) => {
        setPartnerSelected(p);
        setCreatePartnerPhone(p.phone_number);
        setCreatePartnerName(p.name);
        setPartnerSearchQuery('');
        setPartnerSearchResults([]);
        setPartnerSearchDone(false);
        setShowPartnerRegister(false);
    };

    const clearPartnerSelection = () => {
        setPartnerSelected(null);
        setCreatePartnerPhone('');
        setCreatePartnerName('');
        setPartnerSearchQuery('');
        setShowPartnerRegister(false);
        setPartnerSearchDone(false);
        setNewPartnerForm({ phone: '', name: '', email: '', city: '' });
    };

    const confirmNewPartner = () => {
        if (!newPartnerForm.phone.trim()) return;
        // The partner's phone seeds referral_partner_phone AND the PENDING- contact key — reject junk
        // here so a name/partial can't become a broken partner number or a malformed key.
        if (!isValidPhoneInput(newPartnerForm.phone)) { setCreateError('Enter a valid partner phone number (10-digit mobile).'); return; }
        setCreateError('');
        setCreatePartnerPhone(newPartnerForm.phone.trim());
        setCreatePartnerName(newPartnerForm.name.trim());
        setShowPartnerRegister(false);
        setPartnerSearchDone(false);
        // partnerSelected stays null — backend will auto-create via ensurePartnerAgent
    };

    // ─── Lead Detail Slide-Over ───────────────────────────────────────────────

    const effectiveIsMobile = isMobileProp ?? isMobile;

    const openDetail = useCallback(async (phone: string) => {
        setSelectedPhone(phone);
        if (effectiveIsMobile) history.pushState({ view: 'leads', detail: phone }, '');
        setMatches([]);
        setMatchError('');
        setDealError('');
        setSliderTab('activity');
        setLeadAppointments([]);
        setDetailLoading(true);
        setDetailError(null);
        try {
            const res = await client.get(`/api/leads/${encodeURIComponent(phone)}`);
            const d: LeadDetail = res.data;
            setLeadDetail(d);
            setEditNotes(d.notes || '');
            setEditName(d.name || '');
            // Placeholders seed empty: PhoneInput strips letters on first keystroke,
            // so mounting "PENDING-…"/"TEMP_…" raw would visibly mutate under the user.
            setEditPhone(isPlaceholderPhone(d.phone_number) ? '' : (d.phone_number || ''));
            setEditLifecycle(d.lifecycle_stage || 'NEW');
            setEditAgent(d.assigned_agent_id || '');
            setSharedWith((d as any).shared_with_ids || []);
            setEditPartnerAssignee((d as any).partner_assignee_id || '');
            // Phase 2 (2026-05-29): the inline edit form state vars are gone — all
            // requirements now flow through <DemandRequirementsForm> which reads its
            // initial values directly from leadDetail. Preferred lat/lng still need
            // to round-trip through the canonical save handler.
            setEditPreferredLat(d.preferred_lat);
            setEditPreferredLng(d.preferred_lng);
            setSessionAnswers(null);
        } catch (err: any) {
            setLeadDetail(null);
            const status = err?.response?.status;
            setDetailError(
                status === 404
                    ? 'Lead details not found. The contact may have been deleted or the phone number format changed.'
                    : 'Failed to load lead details. Please try again.'
            );
        } finally {
            setDetailLoading(false);
        }

        // Fetch WhatsApp session answers (non-blocking)
        client.get(`/api/leads/${encodeURIComponent(phone)}/session`)
            .then(r => setSessionAnswers(r.data.answers || null))
            .catch(() => {});

        // Fetch appointments for visit history tab (non-blocking).
        // Not allow-listed for partners — skip the call rather than eat a 403.
        if (!isPartner) {
            setAppointmentsLoading(true);
            client.get('/api/calendar/appointments', { params: { contact_id: phone } })
                .then(r => setLeadAppointments(r.data.appointments || []))
                .catch(() => {})
                .finally(() => setAppointmentsLoading(false));
        }
    }, [isPartner]);

    // Attach autocomplete to slide-over location input after it renders
    useEffect(() => {
        if (!selectedPhone || !leadDetail || !MAPS_KEY) return;
        loadGoogleMaps().then(() => {
            setTimeout(() => {
                attachEditAutocomplete((location, lat, lng) => {
                    setLeadDetail(prev => prev ? { ...prev, preferred_location: location } : prev);
                    setEditPreferredLat(lat);
                    setEditPreferredLng(lng);
                });
            }, 200);
        });
    }, [selectedPhone, leadDetail?.phone_number, MAPS_KEY, attachEditAutocomplete]);

    const closeDetail = () => {
        if (editAcRef.current) {
            (window as any).google?.maps?.event?.clearInstanceListeners(editAcRef.current);
            editAcRef.current = null;
        }
        setSelectedPhone(null);
        setLeadDetail(null);
        setMatches([]);
        if (effectiveIsMobile && !closingViaPopState.current) {
            history.back();
        }
    };

    // ─── Universal Search Helpers ──────────────────────────────────────────────

    const _resetCreateModal = () => {
        setCreateStep(1);
        setCreateLeadType('DIRECT_OWNER');
        setCreateForm({ name: '', phone: '', email: '', source: 'manual', intent: '', notes: '', preferred_location: '' });
        setCreateAssignedAgentId('');
        setCreatePartnerPhone(''); setCreatePartnerName('');
        setPartnerSearchQuery(''); setPartnerSearchResults([]); setPartnerSelected(null); setShowPartnerRegister(false); setPartnerSearchDone(false);
        setNewPartnerForm({ phone: '', name: '', email: '', city: '' });
        setClientSearchQuery(''); setClientSearchResults([]); setClientSearching(false); setPreselectedContact(null);
        setSuggestedLeadType(null); suggestSeq.current++;
        setIdentityNewPhone(null);
        setCreateError('');
    };

    const openCreateModal = () => {
        _resetCreateModal();
        setShowCreateModal(true);
        if (effectiveIsMobile) history.pushState({ view: 'leads', modal: 'create' }, '');
    };
    const closeCreateModal = () => {
        setShowCreateModal(false);
        _resetCreateModal();
        if (effectiveIsMobile && !closingViaPopState.current) {
            history.back();
        }
    };

    const handleSourceTypeSelect = (type: 'DIRECT_OWNER' | 'PARTNER_REFERRAL') => {
        setCreateLeadType(type);
        if (type === 'DIRECT_OWNER') {
            clearPartnerSelection();
            setCreateStep(3); // → contact search step
        } else {
            setCreateStep(3); // → details form (partner search at top)
        }
    };

    const handleClientSearchChange = (val: string) => {
        // Allow alphanumeric: if text contains letters or spaces, preserve as string; else normalize phone
        const value = /[a-z]/i.test(val) ? val : normalizePhoneInput(val);
        const sequence = ++clientSearchSequence.current;
        setClientSearchResults([]);
        setPreselectedContact(null);
        setClientSearchQuery(value);
        if (clientSearchTimer.current) clearTimeout(clientSearchTimer.current);
        const trimmed = value.trim();
        if (trimmed.length < 2) {
            setClientSearchResults([]);
            setClientSearching(false);
            return;
        }
        setClientSearching(true);
        const digitsOnly = normalizePhoneInput(trimmed);
        if (digitsOnly.length === 10 && /^[6-9]/.test(digitsOnly)) {
            suggestLeadType(digitsOnly);
        } else {
            setSuggestedLeadType(null);
        }
        clientSearchTimer.current = setTimeout(async () => {
            try {
                const res = await client.get('/api/leads/search', { params: { q: trimmed } });
                if (sequence === clientSearchSequence.current) setClientSearchResults(res.data || []);
            } catch {
                if (sequence === clientSearchSequence.current) setClientSearchResults([]);
            } finally {
                if (sequence === clientSearchSequence.current) setClientSearching(false);
            }
        }, 250);
    };

    const handleSelectExistingClient = (contact: { phone_number: string; name: string | null }) => {
        ++clientSearchSequence.current;
        clearTimeout(clientSearchTimer.current);
        setClientSearching(false);
        setClientSearchResults([]);
        setPreselectedContact(contact);
        setCreateForm(p => ({ ...p, name: contact.name || '', phone: isPlaceholderPhone(contact.phone_number) ? '' : contact.phone_number }));
        setCreateStep(4);
    };

    const handleCreateNewClient = () => {
        const q = clientSearchQuery.trim();
        const digits = normalizePhoneInput(q);
        if (digits.length === 10) {
            setCreateForm(p => ({ ...p, phone: digits }));
        } else {
            setCreateForm(p => ({ ...p, name: q }));
        }
        setPreselectedContact(null);
        setCreateStep(4);
    };

    // ── Identity step (Step 1): phone-first with autocomplete ─────────────────
    // Reuses the same search state as the contact-search step, so whatever is typed
    // or picked here is already visible when the old search step renders (it acts as
    // confirmation, not a re-typing step). DB rule: an unknown number is NOT written
    // here — it rides createForm.phone into POST /api/leads at submit (backend
    // normalises via normalizePhone and 400s junk).
    const suggestTimer = useRef<number | null>(null);

    const suggestLeadType = (digits: string) => {
        if (suggestTimer.current) clearTimeout(suggestTimer.current);
        if (digits.length < 10 || !/^[6-9]/.test(digits)) { setSuggestedLeadType(null); return; }
        const seq = ++suggestSeq.current;
        suggestTimer.current = window.setTimeout(async () => {
            try {
                const res = await client.get('/api/partners/search', { params: { q: digits } });
                if (seq !== suggestSeq.current) return;
                const hits = res.data || [];
                setSuggestedLeadType(hits.length > 0 ? 'PARTNER_REFERRAL' : 'DIRECT_OWNER');
            } catch {
                if (seq === suggestSeq.current) setSuggestedLeadType('DIRECT_OWNER');
            }
        }, 350);
    };

    const handleIdentitySelectExisting = (contact: { phone_number: string; name: string | null }) => {
        setPreselectedContact(contact);
        setCreateForm(p => ({ ...p, name: contact.name || '', phone: isPlaceholderPhone(contact.phone_number) ? '' : contact.phone_number }));
        setIdentityNewPhone(null);
        setCreateError('');
        suggestLeadType(normalizePhoneInput(contact.phone_number));
    };

    const handleIdentityUseNew = () => {
        const q = clientSearchQuery.trim();
        const digits = normalizePhoneInput(q);
        setCreateForm(p => ({ ...p, phone: digits || q }));
        setPreselectedContact(null);
        setIdentityNewPhone(digits || q);
        setCreateError('');
        suggestLeadType(digits);
    };

    const handleIdentityClear = () => {
        setPreselectedContact(null);
        setIdentityNewPhone(null);
        setCreateForm(p => ({ ...p, name: '', phone: '' }));
        setSuggestedLeadType(null); suggestSeq.current++;
    };

    const handleIdentityContinue = () => {
        if (preselectedContact) {
            setCreateError('');
            setCreateStep(2);
            return;
        }
        const q = clientSearchQuery.trim();
        const digits = normalizePhoneInput(q);
        if (digits.length === 10 && isValidPhoneInput(digits)) {
            if (!createForm.phone) {
                setCreateForm(p => ({ ...p, phone: digits }));
                setIdentityNewPhone(digits);
            }
            setCreateError('');
            setCreateStep(2);
            return;
        }
        if (/[a-z]/i.test(q) && q.length >= 2) {
            setCreateForm(p => ({ ...p, name: q }));
            setCreateError('');
            setCreateStep(2);
            return;
        }
        setCreateError('Please select a contact or enter a valid 10-digit mobile number to continue.');
    };

    // ─── Handlers ─────────────────────────────────────────────────────────────

    const handleStatusChange = async (phone: string, newStatus: string) => {
        try {
            setUpdatingPhone(phone);
            await client.patch(`/api/leads/${encodeURIComponent(phone)}/status`, { lead_status: newStatus });
            setRecentLeads(prev => prev.map(l => l.phone_number === phone ? { ...l, lead_status: newStatus } : l));
        } catch (err: any) {
            showToast(err?.response?.data?.error || 'Failed to update status', 'error');
        } finally {
            setUpdatingPhone(null);
        }
    };

    const handleLifecycleChange = (newStage: string) => {
        setEditLifecycle(newStage); // staged — committed by Save changes
    };

    // handleToggleShare removed 2026-08-01 — sharing is now staged via <MultiSelectTeam> + committed by handleSaveAll.

    const handleAgentChange = (agentId: string) => {
        setEditAgent(agentId); // staged — committed by Save changes
    };

    const handleSaveNotes = async (phoneOverride?: string) => {
        const key = phoneOverride ?? selectedPhone;
        if (!key) return;
        setSavingNotes(true);
        try {
            await client.patch(`/api/leads/${encodeURIComponent(key)}/requirements`, { notes: editNotes });
            setRecentLeads(prev => prev.map(l => l.phone_number === key ? { ...l, notes: editNotes } : l));
        } catch (err) { console.error('[ExternalLeads] Operation failed:', err); } finally { setSavingNotes(false); }
    };

    const handleSaveName = async (phoneOverride?: string) => {
        const key = phoneOverride ?? selectedPhone;
        if (!key) return;
        const trimmed = editName.trim();
        setSavingName(true);
        try {
            await client.patch(`/api/leads/${encodeURIComponent(key)}`, { name: trimmed });
            setLeadDetail(prev => prev ? { ...prev, name: trimmed } : prev);
            setRecentLeads(prev => prev.map(l => l.phone_number === key ? { ...l, name: trimmed } : l));
        } catch (err: any) {
            alert(err?.response?.data?.error || 'Failed to update name');
        } finally { setSavingName(false); }
    };

    // Canonical phone equality: the input normalizes to bare digits ("9999000022")
    // while stored keys are E.164 ("+919999000022") — raw !== must not count as a change.
    const samePhone = (a: string, b: string): boolean => {
        if (a === b) return true;
        const ca = toDialablePhone(a);
        const cb = toDialablePhone(b);
        // Both placeholders (null) with different keys are NOT the same — but placeholders
        // are never valid new input (rejected below), so treating null/null as same only
        // skips a meaningless placeholder→placeholder "change".
        return ca !== null && ca === cb;
    };

    // Phone re-key (2026-09-28): a wrongly-entered or placeholder (PENDING-/TEMP_)
    // number can be corrected after submit. Reuses PATCH /api/contacts/:phone/profile
    // which cascades via ON UPDATE CASCADE to deals/inventory/interactions.
    // Returns the new phone when re-keyed, null when unchanged.
    const handleSavePhone = async (): Promise<string | null> => {
        if (!selectedPhone) return null;
        const trimmed = editPhone.trim();
        if (!trimmed || samePhone(trimmed, selectedPhone)) return null;
        if (!isValidPhoneInput(trimmed)) {
            throw new Error('Enter a valid 10-digit mobile number');
        }
        setSavingPhone(true);
        try {
            const res = await updateContactProfile(selectedPhone, { new_phone: trimmed });
            // Backend normalizes and no-ops when the number is unchanged (rekeyed:false)
            // — don't report a change or rewrite state in that case.
            if (!res.rekeyed) return null;
            const newPhone = res.new_phone || trimmed;
            setSelectedPhone(newPhone);
            setEditPhone(newPhone);
            setLeadDetail(prev => prev ? { ...prev, phone_number: newPhone } : prev);
            setRecentLeads(prev => prev.map(l => l.phone_number === selectedPhone ? { ...l, phone_number: newPhone } : l));
            return newPhone;
        } finally { setSavingPhone(false); }
    };

    // handleSaveRequirements (legacy inline-form save) removed Phase 2 demand-side
    // unification (2026-05-29). Replaced by handleSaveDemandCanonical below.

    // Phase 2 demand-side unification (2026-05-29). Canonical save handler used by
    // the new <DemandRequirementsForm>. Sends demand_taxonomy_node_id + demand_schema_values
    // alongside the legacy intent/budget/area/timeline/preferred_location fields. The
    // backend (Phase 1) deep-merges schema_values onto whatever was already there.
    const handleSaveDemandCanonical = async (payload: DemandPayload) => {
        // Prefer the in-batch re-keyed phone (saveKeyRef) over stale state:
        // after a number change, selectedPhone state hasn't flushed yet.
        const key = saveKeyRef.current ?? selectedPhone;
        if (!key) return;
        setSavingReqs(true);
        try {
            // Derive a single demand_bhk Int from canonical bhk for legacy mirror — keeps
            // the deal-sync block + matching engine criteria builder working until Phase 3.
            const bhkRaw = payload.demand_schema_values?.bhk;
            let demandBhk: number | null = null;
            if (typeof bhkRaw === 'string') {
                const cleaned = bhkRaw.toLowerCase().replace('rk', '').replace('+', '').trim();
                const n = parseInt(cleaned, 10);
                if (!Number.isNaN(n)) demandBhk = n;
            } else if (typeof bhkRaw === 'number') {
                demandBhk = bhkRaw;
            }
            const amenities = Array.isArray(payload.demand_schema_values?.amenities)
                ? payload.demand_schema_values.amenities as string[]
                : undefined;

            // Phase 5 (2026-05-29): Contact + Transaction legacy demand_bhk /
            // demand_amenities columns dropped. POST canonical SoT only —
            // including any legacy mirror keys causes the backend to attempt
            // Unknown-argument writes → 500.
            await client.patch(`/api/leads/${encodeURIComponent(key)}/requirements`, {
                intent: payload.intent || null,
                budget_min: payload.budget_min,
                budget_max: payload.budget_max,
                area_min: payload.area_min,
                area_max: payload.area_max,
                area_unit: payload.area_unit,
                timeline: payload.timeline || null,
                preferred_location: payload.preferred_location || null,
                // DemandRequirementsForm now captures lat/lng via Google Places; prefer it,
                // fall back to the slide-over's stored geo. (2026-06-01)
                preferred_lat: payload.preferred_lat ?? editPreferredLat,
                preferred_lng: payload.preferred_lng ?? editPreferredLng,
                demand_taxonomy_node_id: payload.demand_taxonomy_node_id,
                demand_schema_values: payload.demand_schema_values,
            });
            setRecentLeads(prev => prev.map(l => l.phone_number === key ? {
                ...l,
                budget_min: payload.budget_min != null ? String(payload.budget_min) : null,
                budget_max: payload.budget_max != null ? String(payload.budget_max) : null,
                demand_bhk: demandBhk,
                demand_taxonomy_node_id: payload.demand_taxonomy_node_id,
                demand_schema_values: payload.demand_schema_values,
            } : l));
            // Refresh leadDetail in-place so the form re-opens with fresh values next time.
            setLeadDetail(prev => prev ? {
                ...prev,
                intent: payload.intent,
                budget_min: payload.budget_min != null ? String(payload.budget_min) : null,
                budget_max: payload.budget_max != null ? String(payload.budget_max) : null,
                area_min: payload.area_min,
                area_max: payload.area_max,
                area_unit: payload.area_unit,
                timeline: payload.timeline,
                preferred_location: payload.preferred_location,
                demand_bhk: demandBhk,
                demand_amenities: amenities ?? null,
                demand_taxonomy_node_id: payload.demand_taxonomy_node_id,
                demand_schema_values: payload.demand_schema_values,
            } : prev);
        } catch (err) {
            console.error('[ExternalLeads] canonical save failed:', err);
            throw err;
        } finally {
            setSavingReqs(false);
        }
    };

    // Single unified save (2026-08-01) — commits every staged edit at once, reusing the
    // existing per-field endpoints so all backend permissions/logic stay intact.
    const handleSaveAll = async () => {
        if (!selectedPhone || !leadDetail) return;
        setSavingAll(true);
        setSaveError(null);
        const errs: string[] = [];
        // Stage now routes through the deal's state machine, which rejects illegal jumps with a
        // message naming the allowed next stages. Keep it verbatim instead of collapsing it to "stage".
        let stageError: string | null = null;
        // Local key: phone re-key changes the lead's identity mid-save, so every
        // subsequent call in this batch must use the NEW key, not stale state.
        let key = selectedPhone;
        saveKeyRef.current = selectedPhone;
        try {
            // Phone first: it re-keys the contact (cascade), so later saves use the new key.
            if (editPhone.trim() && !samePhone(editPhone.trim(), selectedPhone)) {
                try {
                    const newPhone = await handleSavePhone();
                    if (newPhone) { key = newPhone; saveKeyRef.current = newPhone; showToast('Phone number updated', 'success'); }
                } catch (e: any) {
                    const msg = e?.response?.data?.error || e?.message || 'Could not save phone number';
                    setSaveError(msg); showToast(msg, 'error');
                    return;
                }
            }
            if (editName.trim() !== (leadDetail.name || '')) { try { await handleSaveName(key); } catch { errs.push('name'); } }
            if (editNotes !== (leadDetail.notes || '')) { try { await handleSaveNotes(key); } catch { errs.push('notes'); } }
            if (editLifecycle !== (leadDetail.lifecycle_stage || 'NEW')) {
                try {
                    const resp = await client.patch(`/api/leads/${encodeURIComponent(key)}/requirements`, { lifecycle_stage: editLifecycle });
                    // Trust the server's value, not the requested one: when a lead has more than
                    // one deal the resulting stage is derived from all of them and can legitimately
                    // differ from the pick (e.g. another deal is further along).
                    const applied = (resp as any)?.data?.lifecycle_stage || editLifecycle;
                    if (applied !== editLifecycle) setEditLifecycle(applied);
                    setRecentLeads(prev => prev.map(l => l.phone_number === key ? { ...l, lifecycle_stage: applied } : l));
                } catch (e: any) {
                    stageError = e?.response?.data?.error || null;
                    errs.push('stage');
                }
            }
            if (editAgent !== (leadDetail.assigned_agent_id || '')) {
                try {
                    if (editAgent) await client.patch(`/api/leads/${encodeURIComponent(key)}/reassign`, { agent_id: editAgent });
                    else await client.patch(`/api/leads/${encodeURIComponent(key)}/assign`, { agent_id: null });
                    setRecentLeads(prev => prev.map(l => l.phone_number === key ? { ...l, assigned_agent_id: editAgent || null } : l));
                } catch { errs.push('assigned agent'); }
            }
            const origShared = ((leadDetail as any).shared_with_ids || []) as string[];
            const changedShared = origShared.length !== sharedWith.length || origShared.some(id => !sharedWith.includes(id));
            if (changedShared) {
                try {
                    const res = await shareLead(key, sharedWith);
                    setSharedWith(res.shared_with_ids || sharedWith);
                    setRecentLeads(pl => pl.map(l => l.phone_number === key ? ({ ...l, shared_with_ids: res.shared_with_ids || sharedWith } as any) : l));
                } catch { errs.push('shared-with'); }
            }
            // Buyer requirements — always commit via the sub-form (idempotent PATCH).
            try { await demandFormRef.current?.submit(); } catch { errs.push('requirements'); }

            if (errs.length) { setSaveError(stageError || ('Could not save: ' + errs.join(', '))); showToast(stageError || 'Some changes failed to save', 'error'); }
            else showToast('Lead saved', 'success');
        } finally {
            saveKeyRef.current = null;
            setSavingAll(false);
        }
    };

    const handleFindMatches = async () => {
        if (!selectedPhone) return;
        setMatchLoading(true);
        setMatchError('');
        setMatches([]);
        try {
            const res = await client.post(`/api/leads/${encodeURIComponent(selectedPhone)}/match`);
            const m = res.data.matches || [];
            setMatches(m);
            if (m.length === 0) setMatchError('No matching properties found. Try updating the requirements.');
        } catch (err: any) {
            setMatchError(err?.response?.data?.error || 'Matching failed');
        } finally {
            setMatchLoading(false);
        }
    };

    const handleConvertToDeal = async () => {
        if (!leadDetail) return;
        setConvertingDeal(true);
        setDealError('');
        try {
            const intentMap: Record<string, string> = { buy: 'SALE', rent: 'RENT' };
            const dealType = intentMap[leadDetail.intent ?? ''];
            if (!dealType) { setDealError('Lead needs a valid intent (buy or rent) to convert.'); return; }

            await client.post('/api/deals', {
                demand_contact_id: leadDetail.phone_number,
                demand_handler_type: 'DIRECT',
                type: dealType,
                demand_intent: leadDetail.intent,
                demand_location: leadDetail.preferred_location,
                demand_budget_min: leadDetail.budget_min ? Number(leadDetail.budget_min) : undefined,
                demand_budget_max: leadDetail.budget_max ? Number(leadDetail.budget_max) : undefined,
                demand_bedrooms: leadDetail.demand_bhk ? String(leadDetail.demand_bhk) : undefined,
            });
            showToast('Deal created successfully! View it in the Deal Pipeline.', 'success');
        } catch (err: any) {
            setDealError(err?.response?.data?.error || 'Failed to create deal');
        } finally {
            setConvertingDeal(false);
        }
    };

    const handleExportCSV = () => {
        const headers = ['Name', 'Phone', 'Email', 'Source', 'Status', 'Lifecycle', 'Intent', 'Budget Min', 'Budget Max', 'BHK', 'Location', 'Score', 'Agent', 'Date'];
        const rows = filteredLeads.map(l => [
            l.name || '', l.phone_number, l.email || '', l.source, l.lead_status,
            l.lifecycle_stage || '', l.intent || '', l.budget_min || '', l.budget_max || '',
            l.demand_bhk || '', l.preferred_location || '', l.lead_score?.total_score ?? '',
            l.assigned_agent_id || '', new Date(l.created_at).toLocaleDateString('en-IN'),
        ]);
        const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Submit handler — receives the canonical DemandPayload from <DemandRequirementsForm>
    // (taxonomy node + schema_values + intent/budget/area/timeline/location) and merges it
    // with the identity fields. Partner referrals: client name + phone are OPTIONAL (the
    // partner often won't share them — backend creates a placeholder-keyed contact).
    const handleCreateLead = async (demand: DemandPayload) => {
        if (createLeadType === 'PARTNER_REFERRAL') {
            if (!createPartnerPhone) { setCreateError('Please search and select a partner agent, or register a new one.'); return; }
        } else {
            if (!createForm.phone.trim() && !preselectedContact) { setCreateError('Phone number is required'); return; }
        }
        // Reject junk in the phone field up front (mirrors backend) so we never POST a name/partial
        // that would become a broken "+junk" contact. Blank is allowed only where checked above.
        const phoneRaw = createForm.phone.trim();
        if (phoneRaw && !isValidPhoneInput(phoneRaw)) {
            setCreateError('Enter a valid phone number (10-digit mobile)' + (createLeadType === 'PARTNER_REFERRAL' ? ', or leave it blank to attribute to the partner.' : '.'));
            return;
        }
        try {
            setCreating(true);
            setCreateError('');
            await client.post('/api/leads', {
                name: createForm.name || undefined,
                phone: createForm.phone || undefined,
                email: createForm.email || undefined,
                source: createForm.source,
                notes: createForm.notes || undefined,
                lead_type: createLeadType,
                // Canonical requirement (taxonomy node + schema_values + universal fields)
                intent: demand.intent || undefined,
                budget_min: demand.budget_min ?? undefined,
                budget_max: demand.budget_max ?? undefined,
                area_min: demand.area_min ?? undefined,
                area_max: demand.area_max ?? undefined,
                area_unit: demand.area_unit || undefined,
                timeline: demand.timeline || undefined,
                preferred_location: demand.preferred_location || undefined,
                preferred_lat: demand.preferred_lat ?? undefined,
                preferred_lng: demand.preferred_lng ?? undefined,
                demand_taxonomy_node_id: demand.demand_taxonomy_node_id ?? undefined,
                demand_schema_values: demand.demand_schema_values ?? undefined,
                ...(createLeadType === 'PARTNER_REFERRAL' && createPartnerPhone ? { referral_partner_phone: createPartnerPhone } : {}),
                ...(createLeadType === 'PARTNER_REFERRAL' && createPartnerName ? { referral_partner_name: createPartnerName } : {}),
                ...(isPrivileged && createAssignedAgentId ? { assigned_agent_id: createAssignedAgentId } : {}),
            });
            closeCreateModal();
            loadData();
        } catch (err: any) {
            setCreateError(err?.response?.data?.error || 'Failed to create lead');
        } finally {
            setCreating(false);
        }
    };

    // ─── Derived State ─────────────────────────────────────────────────────────

    const activeFilterCount = [
        statusFilter,
        sourceFilter,
        agentFilter,
        dateFrom,
        dateTo,
        intentFilter,
        locationSelection.lat !== null ? '1' : '',
        notContactedDays > 0 ? '1' : '',
        noShowcaseDays > 0 ? '1' : '',
        (budgetMinFilter.trim() || budgetMaxFilter.trim()) ? '1' : '',
        sharedWithMe ? '1' : '',
    ].filter(Boolean).length + (filterTaxonomy.nodeIds.length > 0 ? 1 : 0) + (filterTaxonomy.bhk.length > 0 ? 1 : 0);

    // 2026-05-13: Server now handles search + status + source + agent + activeFilter.
    // Client-side filtering retained only for date range (server doesn't filter by date yet)
    // and the existing source/status/agent filters which the Filters sheet still touches
    // locally (defensive). The phone-search bug was here: lead.phone_number stored as
    // "+91XXXXXXXXXX" while user types "9958..." — `.includes()` mismatched. Server now
    // handles phone variants via extractSearchDigits + phoneVariants.
    const filteredLeads = recentLeads.filter(lead => {
        if (dateFrom) {
            const leadDate = new Date(lead.created_at).toISOString().slice(0, 10);
            if (leadDate < dateFrom) return false;
        }
        if (dateTo) {
            const leadDate = new Date(lead.created_at).toISOString().slice(0, 10);
            if (leadDate > dateTo) return false;
        }
        return true;
    });

    // ── Select-all (header checkbox only) ──
    // Operates on currently loaded + filtered rows (not the server-side recentTotal).
    // One row per enquiry (deal): the same contact appears once per lead, each with its own source,
    // property, assignee and stage. A contact with no visible deals stays a single contact-level row.
    // Counts / select-all / filters remain contact-based (filteredLeads).
    const leadRows: LeadRow[] = filteredLeads.flatMap((l): LeadRow[] =>
        l.demand_transactions?.length
            ? l.demand_transactions.map(d => ({
                ...l, _deal: d, source: d.source, lifecycle_stage: d.status,
                assigned_agent: d.coordinator ?? (l as any).assigned_agent,
            } as LeadRow))
            : [l]);
    const allVisibleSelected = filteredLeads.length > 0 && filteredLeads.every(l => selectedLeadPhones.has(l.phone_number));
    const someVisibleSelected = filteredLeads.some(l => selectedLeadPhones.has(l.phone_number));
    const toggleSelectAllVisible = () => {
        setSelectedLeadPhones(prev => {
            const next = new Set(prev);
            if (allVisibleSelected) {
                filteredLeads.forEach(l => next.delete(l.phone_number));
            } else {
                filteredLeads.forEach(l => next.add(l.phone_number));
            }
            return next;
        });
    };

    // Tile "N Matches" counts — fetch once per visible deal set (capped; cheap endpoint).
    // Stable string key so the fetch runs only when the actual id set changes, not on
    // every render (leadRows is rebuilt per render and can't be a dep directly).
    const tileDealKey = Array.from(new Set(
        leadRows.flatMap(r => [r._deal?.id, ...(r.demand_transactions || []).map(d => d.id)]).filter((x): x is string => !!x),
    )).slice(0, 200).sort().join(',');
    useEffect(() => {
        if (!tileDealKey) return;
        let cancelled = false;
        getDealMatchCounts(tileDealKey.split(','))
            .then(counts => { if (!cancelled) setTileMatchCounts(counts); })
            .catch((e: any) => {
                // Partners lack act_on_deals so the call 403s for them: fail silent,
                // tiles show "Matching". Real failures still surface for diagnosis.
                if (e?.response?.status !== 403) console.warn('[ExternalLeads] match counts failed:', e?.message || e);
            });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tileDealKey]);

    // Row-deal count ONLY: never fall through to sibling deals on the same contact —
    // each per-deal tile must show its own count, else D2's tile shows D1's matches.
    const matchCountFor = useCallback((row: LeadRow): number | null => {
        const id = row._deal?.id;
        if (!id) return null;
        return tileMatchCounts[id] ?? null;
    }, [tileMatchCounts]);

    // Tile → Deal Pipeline: deep-focus the row's deal when known, else open the pipeline plain.
    // App.tsx turns filter.deal into DealPipeline's initialDealId (one-shot).
    const handleOpenPipeline = useCallback((row: LeadRow) => {
        const dealId = row._deal?.id ?? row.demand_transactions?.[0]?.id ?? null;
        drillTo(dealId ? { entity: 'deals', filter: { deal: dealId } } : { entity: 'deals' });
    }, []);

    // Tile → Matching: the detail slide-over is contact-level (same for every enquiry
    // row on that contact — matching runs per contact via POST /api/leads/:phone/match),
    // so the tile label intentionally shows the row deal's count but opens shared detail.
    const handleOpenMatches = useCallback((row: LeadRow) => {
        openDetail(row.phone_number);
    }, [openDetail]);


    // editSubCategories cascade removed Phase 2 demand-side unification (2026-05-29) —
    // the taxonomy cascade now lives inside <DemandRequirementsForm>.

    // ─── Loading State ────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>Loading leads...</div>
                    <div style={{ width: '40px', height: '40px', border: '3px solid var(--border-secondary)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div style={{ flex: 1, display: 'flex', overflowY: 'hidden', position: 'relative' }}>

            {/* ── Main Content ── */}
            <div style={{ flex: 1, padding: '12px 14px', overflowY: 'auto' }}>

                {/* Header — compact */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '17px' }}>Leads</h2>
                        <span style={{ color: '#3b82f6', fontSize: '14px', fontWeight: 700 }}>{recentTotal.toLocaleString('en-IN')}</span>
                        {/* 99acres sync status — inline dot */}
                        {syncStatus && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                                <div style={{
                                    width: '7px', height: '7px', borderRadius: '50%',
                                    backgroundColor: syncStatus.sync?.status === 'success' ? '#22c55e'
                                        : syncStatus.sync?.status === 'failed' ? '#ef4444'
                                        : syncStatus.sync?.status === 'running' ? '#f59e0b' : '#6b7280',
                                }} />
                                <span>99acres</span>
                                {isPrivileged && syncStatus.configured && (
                                    <button type="button" onClick={handleManualSync} disabled={syncLoading || syncStatus.sync?.status === 'running'}
                                        style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '11px', padding: 0 }}>
                                        {syncLoading ? '...' : 'Sync'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button type="button" onClick={handleExportCSV} style={{ ...outlineBtn, padding: '5px 10px', fontSize: '12px' }}>Export</button>
                        <button type="button" onClick={loadData} style={{ ...outlineBtn, padding: '5px 10px', fontSize: '12px' }}>Refresh</button>
                        <button type="button" onClick={openCreateModal} style={{ ...primaryBtn, padding: '5px 12px', fontSize: '12px' }}>+ Add Lead</button>
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div style={{ marginBottom: '8px', padding: '6px 12px', borderRadius: '6px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{error}</span>
                        <button type="button" onClick={loadData} style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid #dc2626', backgroundColor: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: '11px' }}>Retry</button>
                    </div>
                )}

                {/* 2026-05-13: Source filter chip row removed — team found the 12-source
                    chip strip noisy and confusing. Source filter still available inside
                    the Filters sheet for users who need it. */}

                {/* ── Filters — mobile: minimalist bar; desktop: full rows ── */}
                {isMobile ? (
                    <div style={{ padding: '4px 0 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {/* 2026-05-13: Active/Archived/All toggle */}
                        <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border-secondary)', borderRadius: 10, overflow: 'hidden', alignSelf: 'flex-start' }}>
                            {(['active', 'archived', 'all'] as const).map((opt) => (
                                <button
                                    key={opt}
                                    type="button"
                                    onClick={() => setActiveFilter(opt)}
                                    style={{
                                        padding: '6px 14px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                                        backgroundColor: activeFilter === opt ? 'var(--accent-primary, #3b82f6)' : 'var(--bg-secondary)',
                                        color: activeFilter === opt ? '#fff' : 'var(--text-secondary)',
                                    }}
                                >{opt === 'active' ? 'Active' : opt === 'archived' ? 'Closed/Lost' : 'All'}</button>
                            ))}
                        </div>
                        {/* Shared with me (2026-08-09): a lead shared with you is otherwise indistinguishable
                            from your own and sorts by the lead's age, so it can sit thousands of rows down. */}
                        <button
                            type="button"
                            title="Leads someone else owns but shared with you"
                            onClick={() => setSharedWithMe(v => {
                                const next = !v;
                                // "When was this shared with me" only means anything inside this filter, so the
                                // chip applies the order and hands the list back to date order when switched off.
                                if (next) { setLeadSortKey('shared_at'); setLeadSortDir('desc'); }
                                else if (leadSortKey === 'shared_at') { setLeadSortKey('date'); setLeadSortDir('desc'); }
                                return next;
                            })}
                            style={{
                                padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 10,
                                border: '1px solid ' + (sharedWithMe ? '#7c3aed' : 'var(--border-secondary)'),
                                backgroundColor: sharedWithMe ? '#7c3aed' : 'var(--bg-secondary)',
                                color: sharedWithMe ? '#fff' : 'var(--text-secondary)', whiteSpace: 'nowrap',
                            }}
                        >🤝 Shared with me</button>
                        {sharedWithMe && (
                            <button
                                type="button"
                                title="Order by when the lead was shared with you, not by the age of the lead"
                                onClick={() => { setLeadSortDir(leadSortKey === 'shared_at' && leadSortDir === 'desc' ? 'asc' : 'desc'); setLeadSortKey('shared_at'); }}
                                style={{
                                    padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 10,
                                    border: '1px solid ' + (leadSortKey === 'shared_at' ? '#7c3aed' : 'var(--border-secondary)'),
                                    backgroundColor: 'var(--bg-secondary)',
                                    color: leadSortKey === 'shared_at' ? '#7c3aed' : 'var(--text-secondary)', whiteSpace: 'nowrap',
                                }}
                            >{leadSortKey === 'shared_at' && leadSortDir === 'asc' ? '▲ Oldest share' : '▼ Newest share'}</button>
                        )}
                        {/* Row 1: Search + Filters button */}
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search name, phone, email..."
                                style={{
                                    flex: 1, padding: '10px 14px', borderRadius: '12px',
                                    border: '1px solid var(--border-secondary)',
                                    backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)',
                                    fontSize: '14px', outline: 'none',
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowFilterSheet(true)}
                                style={{
                                    padding: '10px 14px', borderRadius: '12px', cursor: 'pointer',
                                    border: activeFilterCount > 0 ? '1.5px solid var(--text-link)' : '1px solid var(--border-secondary)',
                                    backgroundColor: activeFilterCount > 0 ? 'var(--text-link)' : 'var(--bg-secondary)',
                                    color: activeFilterCount > 0 ? '#fff' : 'var(--text-secondary)',
                                    fontWeight: 600, fontSize: '13px', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                }}
                            >
                                <span>⚙</span>
                                <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
                                {activeFilterCount > 0 && (
                                    <span style={{
                                        marginLeft: 2, padding: '1px 7px', borderRadius: 999,
                                        backgroundColor: 'rgba(255,255,255,0.25)', fontWeight: 700, fontSize: '12px',
                                    }}>
                                        {recentTotal.toLocaleString('en-IN')} result{recentTotal !== 1 ? 's' : ''}
                                    </span>
                                )}
                            </button>
                            {!isPartner && <button
                                type="button"
                                onClick={() => { setLeadSelectMode(m => !m); setSelectedLeadPhones(new Set()); }}
                                style={{
                                    padding: '10px 14px', borderRadius: '12px', cursor: 'pointer', flexShrink: 0,
                                    border: leadSelectMode ? '1.5px solid #8b5cf6' : '1px solid var(--border-secondary)',
                                    backgroundColor: leadSelectMode ? 'rgba(139,92,246,0.12)' : 'var(--bg-secondary)',
                                    color: leadSelectMode ? '#8b5cf6' : 'var(--text-secondary)',
                                    fontWeight: 600, fontSize: '13px',
                                }}
                            >{leadSelectMode ? `✓ ${selectedLeadPhones.size} Selected` : '☐ Select'}</button>}
                        </div>

                        {/* Row 2: Active filter chips (dismissible) */}
                        {activeFilterCount > 0 && (
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {statusFilter && (
                                    <button type="button" onClick={() => setStatusFilter('')} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                                        {statusFilter} ×
                                    </button>
                                )}
                                {sourceFilter && (
                                    <button type="button" onClick={() => setSourceFilter('')} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                                        {sourceLabels[sourceFilter] || sourceFilter} ×
                                    </button>
                                )}
                                {agentFilter && (
                                    <button type="button" onClick={() => setAgentFilter('')} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                                        {teamMembers.find(m => m.id === agentFilter)?.name || 'Agent'} ×
                                    </button>
                                )}
                                {dateFrom && (
                                    <button type="button" onClick={() => setDateFrom('')} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                                        From {dateFrom} ×
                                    </button>
                                )}
                                {dateTo && (
                                    <button type="button" onClick={() => setDateTo('')} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                                        To {dateTo} ×
                                    </button>
                                )}
                                {intentFilter && (
                                    <button type="button" onClick={() => setIntentFilter('')} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                                        {intentFilter === 'BUYER' ? 'Buy' : 'Rent'} ×
                                    </button>
                                )}
                                {(filterTaxonomy.nodeIds.length > 0 || filterTaxonomy.bhk.length > 0) && (
                                    <button type="button" onClick={() => setFilterTaxonomy({ nodeIds: [], bhk: [] })} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                                        Property type{filterTaxonomy.bhk.length > 0 ? ` · ${filterTaxonomy.bhk.map(b => b === 5 ? '5+' : b).join('/')} BHK` : ''} ×
                                    </button>
                                )}
                                {locationSelection.lat !== null && (
                                    <button type="button" onClick={() => setLocationSelection({ label: '', lat: null, lng: null, radiusKm: 2 })} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                                        📍 {locationSelection.label.substring(0, 20)}{locationSelection.label.length > 20 ? '…' : ''}{locationSelection.radiusKm > 0 ? ` (${locationSelection.radiusKm}km)` : ''} ×
                                    </button>
                                )}
                                {notContactedDays > 0 && (
                                    <button type="button" onClick={() => setNotContactedDays(0)} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                                        No contact {notContactedDays}d+ ×
                                    </button>
                                )}
                                {noShowcaseDays > 0 && (
                                    <button type="button" onClick={() => setNoShowcaseDays(0)} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                                        No showcase {noShowcaseDays}d+ ×
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => { setStatusFilter(''); setSourceFilter(''); setAgentFilter(''); setDateFrom(''); setDateTo(''); setIntentFilter(''); setFilterTaxonomy({ nodeIds: [], bhk: [] }); setLocationSelection({ label: '', lat: null, lng: null, radiusKm: 2 }); setNotContactedDays(0); setNoShowcaseDays(0); setBudgetMinFilter(''); setBudgetMaxFilter(''); setSharedWithMe(false); if (leadSortKey === 'shared_at') { setLeadSortKey('date'); setLeadSortDir('desc'); } }}
                                    style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: 'transparent', border: '1px solid var(--border-secondary)', color: 'var(--text-muted)', cursor: 'pointer' }}
                                >
                                    Clear all
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        {/* 2026-05-13: Desktop filter row aligned with PWA pattern —
                            Active/Archived/All toggle + search + Filters sheet button.
                            All inline Status/Source/Agent/date dropdowns moved into the sheet. */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border-secondary)', borderRadius: 8, overflow: 'hidden' }}>
                                {(['active', 'archived', 'all'] as const).map((opt) => (
                                    <button
                                        key={opt}
                                        type="button"
                                        onClick={() => setActiveFilter(opt)}
                                        style={{
                                            padding: '6px 14px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                                            backgroundColor: activeFilter === opt ? 'var(--accent-primary, #3b82f6)' : 'var(--bg-secondary)',
                                            color: activeFilter === opt ? '#fff' : 'var(--text-secondary)',
                                            textTransform: 'capitalize',
                                        }}
                                    >{opt === 'active' ? 'Active' : opt === 'archived' ? 'Closed/Lost' : 'All'}</button>
                                ))}
                            </div>
                            {/* Shared with me (2026-08-09): a lead shared with you is otherwise indistinguishable
                                from your own and sorts by the lead's age, so it can sit thousands of rows down. */}
                            <button
                                type="button"
                                title="Leads someone else owns but shared with you"
                                onClick={() => setSharedWithMe(v => {
                                    const next = !v;
                                    // "When was this shared with me" only means anything inside this filter, so the
                                    // chip applies the order and hands the list back to date order when switched off.
                                    if (next) { setLeadSortKey('shared_at'); setLeadSortDir('desc'); }
                                    else if (leadSortKey === 'shared_at') { setLeadSortKey('date'); setLeadSortDir('desc'); }
                                    return next;
                                })}
                                style={{
                                    padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 8,
                                    border: '1px solid ' + (sharedWithMe ? '#7c3aed' : 'var(--border-secondary)'),
                                    backgroundColor: sharedWithMe ? '#7c3aed' : 'var(--bg-secondary)',
                                    color: sharedWithMe ? '#fff' : 'var(--text-secondary)', whiteSpace: 'nowrap',
                                }}
                            >🤝 Shared with me</button>
                            {sharedWithMe && (
                                <button
                                    type="button"
                                    title="Order by when the lead was shared with you, not by the age of the lead"
                                    onClick={() => { setLeadSortDir(leadSortKey === 'shared_at' && leadSortDir === 'desc' ? 'asc' : 'desc'); setLeadSortKey('shared_at'); }}
                                    style={{
                                        padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 8,
                                        border: '1px solid ' + (leadSortKey === 'shared_at' ? '#7c3aed' : 'var(--border-secondary)'),
                                        backgroundColor: 'var(--bg-secondary)',
                                        color: leadSortKey === 'shared_at' ? '#7c3aed' : 'var(--text-secondary)', whiteSpace: 'nowrap',
                                    }}
                                >{leadSortKey === 'shared_at' && leadSortDir === 'asc' ? '▲ Oldest share' : '▼ Newest share'}</button>
                            )}
                            <input type="text" placeholder="Search name, phone, email..." value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                style={{ flex: 1, minWidth: '200px', padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                            <button
                                type="button"
                                onClick={() => setShowFilterSheet(true)}
                                style={{
                                    padding: '7px 14px', borderRadius: 8, cursor: 'pointer', flexShrink: 0,
                                    border: activeFilterCount > 0 ? '1.5px solid var(--text-link)' : '1px solid var(--border-secondary)',
                                    backgroundColor: activeFilterCount > 0 ? 'var(--text-link)' : 'var(--bg-secondary)',
                                    color: activeFilterCount > 0 ? '#fff' : 'var(--text-secondary)',
                                    fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
                                }}
                            >
                                <span>⚙</span><span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
                            </button>
                            {!isPartner && <button
                                type="button"
                                onClick={() => { setLeadSelectMode(m => !m); setSelectedLeadPhones(new Set()); }}
                                style={{
                                    padding: '7px 14px', borderRadius: 8, cursor: 'pointer', flexShrink: 0, fontWeight: 600, fontSize: 13,
                                    border: leadSelectMode ? '1.5px solid #8b5cf6' : '1px solid var(--border-secondary)',
                                    backgroundColor: leadSelectMode ? 'rgba(139,92,246,0.12)' : 'var(--bg-secondary)',
                                    color: leadSelectMode ? '#8b5cf6' : 'var(--text-secondary)',
                                }}
                            >{leadSelectMode ? `✓ ${selectedLeadPhones.size} Selected` : '☐ Select'}</button>}
                            {(searchQuery || activeFilterCount > 0) && (
                                <button type="button" onClick={() => { setSearchQuery(''); setStatusFilter(''); setSourceFilter(''); setAgentFilter(''); setDateFrom(''); setDateTo(''); setIntentFilter(''); setFilterTaxonomy({ nodeIds: [], bhk: [] }); setLocationSelection({ label: '', lat: null, lng: null, radiusKm: 2 }); setNotContactedDays(0); setNoShowcaseDays(0); setBudgetMinFilter(''); setBudgetMaxFilter(''); setSharedWithMe(false); if (leadSortKey === 'shared_at') { setLeadSortKey('date'); setLeadSortDir('desc'); } }}
                                    style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-secondary)', backgroundColor: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                    Clear
                                </button>
                            )}
                        </div>

                    </>
                )}

                {/* Partner-claim approvals — a partner submitted a lead for one of our existing direct clients */}
                {canApproveClaims && pendingClaims.length > 0 && (
                    <div style={{ marginBottom: '12px', backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '8px', overflow: 'hidden' }}>
                        <div style={{ padding: '8px 12px', fontSize: '13px', fontWeight: 700, color: '#b45309', borderBottom: '1px solid rgba(245,158,11,0.25)' }}>
                            🤝 Partner Approvals ({pendingClaims.length}) — a partner referred an existing direct client
                        </div>
                        {pendingClaims.map((c: any) => (
                            <div key={c.phone_number} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderBottom: '1px solid rgba(245,158,11,0.15)', flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 180 }}>
                                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{c.name || 'Client'} · {isPlaceholderPhone(c.phone_number) ? 'No phone' : c.phone_number}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                        Partner: <strong>{c.partner?.name || 'Unknown'}</strong>
                                        {c.requirement_type ? ` · wants to ${c.requirement_type === 'RENT' ? 'rent' : 'buy'}` : ''}
                                        {c.preferred_location ? ` · ${c.preferred_location}` : ''}
                                    </div>
                                </div>
                                <button type="button" disabled={claimBusy === c.phone_number} onClick={() => handleApproveClaim(c.phone_number)} style={{
                                    fontSize: '12px', fontWeight: 700, color: '#fff', backgroundColor: '#16a34a', border: 'none',
                                    borderRadius: '6px', padding: '5px 12px', cursor: claimBusy === c.phone_number ? 'wait' : 'pointer', opacity: claimBusy === c.phone_number ? 0.6 : 1,
                                }}>✓ Approve (credit partner)</button>
                                <button type="button" disabled={claimBusy === c.phone_number} onClick={() => handleRejectClaim(c.phone_number)} style={{
                                    fontSize: '12px', fontWeight: 700, color: '#dc2626', backgroundColor: 'transparent', border: '1px solid #dc2626',
                                    borderRadius: '6px', padding: '5px 12px', cursor: claimBusy === c.phone_number ? 'wait' : 'pointer', opacity: claimBusy === c.phone_number ? 0.6 : 1,
                                }}>✕ Reject (keep direct)</button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Table */}
                <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-secondary)' }}>
                    <div style={{ padding: '8px 12px', borderBottom: isMobile ? 'none' : '1px solid var(--border-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {leadSelectMode && isMobile && (
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', cursor: filteredLeads.length === 0 ? 'not-allowed' : 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={allVisibleSelected}
                                        ref={el => { if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected; }}
                                        onChange={toggleSelectAllVisible}
                                        disabled={filteredLeads.length === 0}
                                        aria-label={allVisibleSelected ? 'Deselect all leads' : 'Select all leads'}
                                        style={{ width: 16, height: 16, cursor: filteredLeads.length === 0 ? 'not-allowed' : 'pointer', accentColor: '#8b5cf6' }}
                                    />
                                    All
                                </label>
                            )}
                            Showing {filteredLeads.length.toLocaleString('en-IN')}{recentTotal > recentLeads.length ? ` of ${recentTotal.toLocaleString('en-IN')}` : ''} leads
                        </span>
                        {recentLeads.length < recentTotal ? (
                            <button type="button" onClick={() => setPageLimit(l => l + 500)} disabled={loading} style={{
                                fontSize: '11px', fontWeight: 700, color: '#3b82f6', background: 'none',
                                border: '1px solid #3b82f6', borderRadius: '6px', padding: '3px 10px', cursor: loading ? 'wait' : 'pointer',
                            }}>{loading ? 'Loading…' : `Load more (+${Math.min(500, recentTotal - recentLeads.length).toLocaleString('en-IN')})`}</button>
                        ) : (!isMobile && selectedPhone && <span style={{ fontSize: '11px', color: '#3b82f6' }}>Click row for details</span>)}
                    </div>

                    {/* Mobile Card View */}
                    {isMobile ? (
                        <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {filteredLeads.length > 0 ? leadRows.map(lead => (
                                <LeadCard
                                    key={`${lead.phone_number}::${lead._deal?.id || 'contact'}`}
                                    lead={lead}
                                    currentAgentId={agent?.id}
                                    isSelected={leadSelectMode ? selectedLeadPhones.has(lead.phone_number) : selectedPhone === lead.phone_number}
                                    onSelect={(phone: string) => { if (leadSelectMode) toggleLeadSelect(phone); else openDetail(phone); }}
                                    onStatusChange={handleStatusChange}
                                    updatingPhone={updatingPhone}
                                    sourceColors={sourceColors}
                                    sourceLabels={sourceLabels}
                                    scoreColor={scoreColor}
                                    formatBudget={formatBudget}
                                    subtypeLabel={subtypeLabelFor(lead)}
                                    matchCount={matchCountFor(lead)}
                                    onOpenPipeline={() => handleOpenPipeline(lead)}
                                    onOpenMatches={() => handleOpenMatches(lead)}
                                />
                            )) : (
                                <div className="empty-state">
                                    <span className="empty-state__icon">{error ? '⚠️' : '📥'}</span>
                                    <p className="empty-state__title">{error ? 'Failed to load leads' : 'No leads yet'}</p>
                                    <p className="empty-state__body">{error ? 'Please try refreshing the page.' : 'Leads from portals will appear here.'}</p>
                                </div>
                            )}
                        </div>
                    ) : (

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                                    {leadSelectMode && (
                                        <th style={{ padding: '6px 10px', width: '34px' }}>
                                            <label title={allVisibleSelected ? 'Deselect all (visible)' : 'Select all (visible)'} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: filteredLeads.length === 0 ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={allVisibleSelected}
                                                    ref={el => { if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected; }}
                                                    onChange={toggleSelectAllVisible}
                                                    onClick={e => e.stopPropagation()}
                                                    disabled={filteredLeads.length === 0}
                                                    aria-label={allVisibleSelected ? 'Deselect all leads' : 'Select all leads'}
                                                    style={{ width: 16, height: 16, cursor: filteredLeads.length === 0 ? 'not-allowed' : 'pointer', accentColor: '#8b5cf6', margin: 0 }}
                                                />
                                                All
                                            </label>
                                        </th>
                                    )}
                                    {([['Name', 'name'], ['Phone', 'phone'], ['Client Type', 'client_type'], ['Source', 'source'], ['Status', 'status'], ['Stage', 'stage'], ['Assigned to', 'assigned_to'], ['Budget', 'budget'], ['Score', 'score'], ['Intent', 'intent'], ['Location', 'location'], ['Date', 'date'], ['', '']] as Array<[string, string]>).map(([h, key]) => {
                                        const active = !!key && leadSortKey === key;
                                        return (
                                            <th
                                                key={h || '__actions'}
                                                onClick={key ? () => {
                                                    if (leadSortKey === key) setLeadSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
                                                    else { setLeadSortKey(key); setLeadSortDir(key === 'date' || key === 'score' || key === 'budget' ? 'desc' : 'asc'); }
                                                } : undefined}
                                                title={key ? `Sort by ${h}` : undefined}
                                                style={{
                                                    textAlign: 'left', padding: '6px 10px', fontSize: '10px', fontWeight: 600,
                                                    textTransform: 'uppercase', whiteSpace: 'nowrap', userSelect: 'none',
                                                    color: active ? 'var(--text-link)' : 'var(--text-secondary)',
                                                    cursor: key ? 'pointer' : 'default',
                                                }}
                                            >
                                                {h}
                                                {key && <span style={{ marginLeft: 3, opacity: active ? 1 : 0.35 }}>{active ? (leadSortDir === 'asc' ? '\u25B2' : '\u25BC') : '\u21C5'}</span>}
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLeads.map(lead => {
                                    const score = lead.lead_score?.total_score ?? null;
                                    const isSelected = selectedPhone === lead.phone_number;
                                    // Shown identity: the client's own name/number, else the dealer's (placeholder
                                    // phone = "we don't know the client yet" — partner referrals). isDealer marks
                                    // the fallback so the row reads "Dealer", never a misattributed client.
                                    const identity = dealerFallback(lead, isPlaceholderPhone, toDialablePhone);
                                    const rowDialable = identity.phone;
                                    // Contact-level row: primary role ONLY. demand_transactions[0] belongs to
                                    // one specific enquiry and must not label the whole contact (the mobile
                                    // card is per-deal and correctly uses the override there).
                                    const rowRole = (lead as Lead).client_role || null;
                                    return (
                                        <tr key={lead.phone_number} onClick={() => { if (leadSelectMode) toggleLeadSelect(lead.phone_number); else openDetail(lead.phone_number); }}
                                            style={{ borderBottom: '1px solid var(--bg-primary)', cursor: 'pointer', backgroundColor: selectedLeadPhones.has(lead.phone_number) ? 'rgba(139,92,246,0.12)' : isSelected ? 'rgba(59,130,246,0.08)' : undefined }}>
                                            {leadSelectMode && (
                                                <td style={compactCell} onClick={e => { e.stopPropagation(); toggleLeadSelect(lead.phone_number); }}>
                                                    <div style={{ width: 18, height: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', border: selectedLeadPhones.has(lead.phone_number) ? '2px solid #8b5cf6' : '2px solid var(--border-secondary)', backgroundColor: selectedLeadPhones.has(lead.phone_number) ? '#8b5cf6' : 'transparent' }}>
                                                        {selectedLeadPhones.has(lead.phone_number) && <span style={{ color: '#fff', fontSize: 11, lineHeight: 1 }}>✓</span>}
                                                    </div>
                                                </td>
                                            )}
                                            <td style={compactCell}>
                                                <div>
                                                    <span style={{ fontWeight: 500 }}>{identity.name || <span style={{ color: 'var(--text-muted)' }}>—</span>}</span>
                                                    {identity.isDealer && (
                                                        <span title="Client unknown — showing the dealer who brought this lead"
                                                            style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#d97706', padding: '1px 5px', borderRadius: '8px', fontSize: '9px', fontWeight: 700, marginLeft: '4px', whiteSpace: 'nowrap' }}>
                                                            Dealer
                                                        </span>
                                                    )}
                                                    {lead.lead_type === 'PARTNER_REFERRAL' && (
                                                        <span style={{ backgroundColor: '#ede9fe', color: '#7c3aed', padding: '1px 5px', borderRadius: '8px', fontSize: '9px', fontWeight: 700, marginLeft: '4px', whiteSpace: 'nowrap' }}>
                                                            {lead.referral_partner_name || 'Partner'}
                                                        </span>
                                                    )}
                                                    {!!agent?.id && lead.shared_with_ids?.includes(agent.id) && (
                                                        <span title="Shared with you by a teammate — the owner is unchanged"
                                                            style={{ backgroundColor: '#ede9fe', color: '#7c3aed', padding: '1px 5px', borderRadius: '8px', fontSize: '9px', fontWeight: 700, marginLeft: '4px', whiteSpace: 'nowrap' }}>
                                                            🤝 Shared
                                                        </span>
                                                    )}
                                                    {bhkLabelFor(lead) ? <span style={{ color: 'var(--text-muted)', fontSize: '10px', marginLeft: '4px' }}>{bhkLabelFor(lead)}</span> : null}
                                                    {subtypeLabelFor(lead) ? (
                                                        <span title="Property subtype" style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#a78bfa', padding: '1px 5px', borderRadius: '8px', fontSize: '9px', fontWeight: 600, marginLeft: '4px', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                                                            {subtypeLabelFor(lead)}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </td>
                                            <td style={{ ...compactCell, color: 'var(--text-secondary)', fontSize: '11px' }}>{rowDialable || <span style={{ color: '#d97706', fontSize: '10px' }}>No phone</span>}</td>
                                            <td style={compactCell}>
                                                {rowRole ? (
                                                    <span title="Primary role" style={{ backgroundColor: (clientRoleColor(rowRole)) + '20', color: clientRoleColor(rowRole), padding: '1px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                                                        {clientRoleLabel(rowRole)}
                                                    </span>
                                                ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                            </td>
                                            <td style={compactCell}>
                                                <span style={{ backgroundColor: (sourceColors[lead.source] || '#6b7280') + '20', color: sourceColors[lead.source] || '#6b7280', padding: '1px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}>
                                                    {sourceLabels[lead.source] || lead.source}
                                                </span>
                                            </td>
                                            <td style={compactCell} onClick={e => e.stopPropagation()}>
                                                <select title="Lead status" value={lead.lead_status} disabled={updatingPhone === lead.phone_number}
                                                    onChange={e => handleStatusChange(lead.phone_number, e.target.value)}
                                                    style={{ padding: '2px 4px', borderRadius: '4px', fontSize: '11px', fontWeight: 500, border: '1px solid var(--border-secondary)', cursor: 'pointer', backgroundColor: lead.lead_status === 'hot' ? '#fef2f2' : lead.lead_status === 'warm' ? '#fffbeb' : 'var(--bg-primary)', color: lead.lead_status === 'hot' ? '#ef4444' : lead.lead_status === 'warm' ? '#f59e0b' : 'var(--text-primary)' }}>
                                                    {LEAD_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                                                </select>
                                            </td>
                                            <td style={compactCell}>
                                                {(() => { const si = stageInfo(lead.lifecycle_stage); return (
                                                    <span title="Pipeline stage" style={{ backgroundColor: si.color + '18', color: si.color, padding: '1px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap' }}>{si.label}</span>
                                                ); })()}
                                            </td>
                                            <td style={{ ...compactCell, fontSize: '11px' }}>
                                                {(lead as any).assigned_agent?.name
                                                    ? <span style={{ color: 'var(--text-primary)' }}>{(lead as any).assigned_agent.name}</span>
                                                    : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                            </td>
                                            <td style={{ ...compactCell, fontSize: '11px', whiteSpace: 'nowrap' }}>
                                                {lead.budget_min || lead.budget_max ? `${formatBudget(lead.budget_min)}–${formatBudget(lead.budget_max)}` : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                            </td>
                                            <td style={compactCell}>
                                                {score !== null ? (
                                                    <span style={{ backgroundColor: scoreColor(score) + '18', color: scoreColor(score), padding: '1px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 700 }}>
                                                        {score}
                                                    </span>
                                                ) : <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>}
                                            </td>
                                            <td style={{ ...compactCell, fontSize: '11px', textTransform: 'capitalize' }}>{lead.intent || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                                            <td style={{ ...compactCell, fontSize: '11px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.preferred_location || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                                            <td style={{ ...compactCell, color: 'var(--text-muted)', fontSize: '10px', whiteSpace: 'nowrap' }}>{new Date(lead.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                                            <td style={compactCell} onClick={e => e.stopPropagation()}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {rowDialable && (
                                                        <a href={`tel:${rowDialable}`}
                                                            style={{ color: '#22c55e', fontSize: '15px', textDecoration: 'none', lineHeight: 1 }}
                                                            title={`Call client ${rowDialable}`} aria-label={`Call client ${rowDialable}`}>📞</a>
                                                    )}
                                                    {rowDialable && (
                                                        <a href={`https://wa.me/${rowDialable.slice(1)}`} target="_blank" rel="noopener noreferrer"
                                                            style={{ color: '#25d366', fontSize: '15px', textDecoration: 'none', lineHeight: 1 }}
                                                            title="Chat on WhatsApp" aria-label="Chat on WhatsApp">💬</a>
                                                    )}
                                                    {!identity.isDealer && toDialablePhone(lead.referral_partner_phone) && (
                                                        <a href={`tel:${toDialablePhone(lead.referral_partner_phone)}`}
                                                            style={{ color: '#7c3aed', fontSize: '13px', textDecoration: 'none', lineHeight: 1, whiteSpace: 'nowrap' }}
                                                            title={`Call partner ${lead.referral_partner_name || ''} ${toDialablePhone(lead.referral_partner_phone)}`}>🤝📞</a>
                                                    )}
                                                    <button type="button" onClick={() => handleOpenPipeline(lead as LeadRow)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0 }}
                                                        title="Open in Deal Pipeline" aria-label="Open in Deal Pipeline">📊</button>
                                                    <button type="button" onClick={() => handleOpenMatches(lead as LeadRow)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0 }}
                                                        title="View matching properties" aria-label="View matching properties">🏠</button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredLeads.length === 0 && (
                                    <tr><td colSpan={12} style={{ ...compactCell, textAlign: 'center', color: 'var(--text-muted)', padding: '20px 10px' }}>
                                        {error ? 'Failed to load leads' : 'No leads found'}
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    )}
                </div>
            </div>

            {/* ── Lead Detail Slide-Over ── */}
            {selectedPhone && (
                <>
                    <div onClick={closeDetail} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 90 }} />
                    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: isMobile ? '100%' : '480px', maxWidth: isMobile ? '100%' : '95vw', backgroundColor: 'var(--bg-primary)', overflowY: 'auto', display: 'flex', flexDirection: 'column', zIndex: 91, boxShadow: '-4px 0 24px rgba(0,0,0,0.25)', borderLeft: isMobile ? 'none' : '1px solid var(--border-secondary)' }}>
                        {detailLoading ? (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>Loading...</div>
                        ) : detailError ? (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                                <div style={{ maxWidth: '300px', textAlign: 'center', padding: '24px', borderRadius: '12px', backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}>
                                    <div style={{ fontSize: '28px', marginBottom: '10px' }}>⚠️</div>
                                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#ef4444', marginBottom: '6px' }}>Could Not Load Lead</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5' }}>{detailError}</div>
                                    <button onClick={closeDetail} style={{ marginTop: '16px', padding: '8px 20px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Close</button>
                                </div>
                            </div>
                        ) : leadDetail ? (
                            <>
                                {/* Slide-over header */}
                                <div style={{ padding: '20px', borderBottom: '1px solid var(--border-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '17px', color: 'var(--text-primary)', marginBottom: '4px' }}>{leadDetail.name || 'Unknown'}</div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                            {leadDetail.phone_number}{leadDetail.email ? ` · ${leadDetail.email}` : ''}
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            <span style={{ backgroundColor: (sourceColors[leadDetail.source] || '#6b7280') + '20', color: sourceColors[leadDetail.source] || '#6b7280', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>{sourceLabels[leadDetail.source] || leadDetail.source}</span>
                                            <span style={{ backgroundColor: leadDetail.lead_status === 'hot' ? '#fef2f2' : leadDetail.lead_status === 'warm' ? '#fffbeb' : 'var(--bg-secondary)', color: leadDetail.lead_status === 'hot' ? '#ef4444' : leadDetail.lead_status === 'warm' ? '#f59e0b' : 'var(--text-secondary)', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>{leadDetail.lead_status.toUpperCase()}</span>
                                            {leadDetail.lead_score && (
                                                <span style={{ backgroundColor: scoreColor(leadDetail.lead_score.total_score) + '18', color: scoreColor(leadDetail.lead_score.total_score), padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>Score: {leadDetail.lead_score.total_score}</span>
                                            )}
                                            {(leadDetail.referral_partner_name || toDialablePhone(leadDetail.referral_partner_phone)) && (
                                                <span style={{ backgroundColor: '#ede9fe', color: '#7c3aed', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>🤝 {leadDetail.referral_partner_name || 'Partner'}</span>
                                            )}
                                            {toDialablePhone(leadDetail.referral_partner_phone) && (
                                                <a href={`tel:${toDialablePhone(leadDetail.referral_partner_phone)}`} title={`Call partner ${toDialablePhone(leadDetail.referral_partner_phone)}`}
                                                    style={{ backgroundColor: '#7c3aed', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}>📞 Call partner</a>
                                            )}
                                        </div>
                                    </div>
                                    <button onClick={closeDetail} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '20px', padding: '4px 8px' }}>✕</button>
                                </div>

                                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                                    {/* Edit Name (privileged) */}
                                    {isPrivileged && (
                                        <div>
                                            <label style={soLabel}>Name</label>
                                            <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Contact name" style={soInput} />
                                        </div>
                                    )}

                                    {/* Edit Phone (privileged) — correct a wrong number after submit.
                                        Placeholder PENDING-/TEMP_ leads show a hint to set the real number. */}
                                    {isPrivileged && (
                                        <div>
                                            <label style={soLabel}>Phone number</label>
                                            <PhoneInput value={editPhone} onChange={v => setEditPhone(v)} style={soInput} />
                                            {isPlaceholderPhone(leadDetail.phone_number) && (
                                                <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '4px' }}>
                                                    This lead has a placeholder number — enter the client's real mobile number.
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Lifecycle + Agent + collaboration — single column (2026-08-01) */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                                        <div>
                                            <label style={soLabel}>Lifecycle Stage</label>
                                            <select value={editLifecycle} onChange={e => handleLifecycleChange(e.target.value)} style={soInput}>
                                                {LIFECYCLE_STAGES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                                            </select>
                                        </div>
                                        {/* INTERNAL staff only — this writes assigned_agent_id (an Agent FK). Never for partners. */}
                                        {!isPartner && (isPrivileged || (agent?.id && editAgent === agent.id)) && (
                                            <div>
                                                <label style={soLabel}>Assigned Agent</label>
                                                <select value={editAgent} onChange={e => handleAgentChange(e.target.value)} style={soInput}>
                                                    {isPrivileged && <option value="">Unassigned</option>}
                                                    {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                                </select>
                                                {!isPrivileged && (
                                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>You can reassign this lead to another team member.</div>
                                                )}
                                            </div>
                                        )}

                                        {/* 2026-08-01: share via a searchable multi-select (was a chip wall). Gate on the ORIGINAL owner so staging a reassign doesn't hide it. */}
                                        {!isPartner && (isPrivileged || (agent?.id && (leadDetail.assigned_agent_id || '') === agent.id)) && (
                                            <div>
                                                <label style={soLabel}>Shared with (collaboration)</label>
                                                <MultiSelectTeam
                                                    options={teamMembers.filter(m => m.id !== editAgent)}
                                                    value={sharedWith}
                                                    onChange={setSharedWith}
                                                    isMobile={effectiveIsMobile}
                                                    placeholder="Add team members…"
                                                />
                                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>These members can also view &amp; work this lead; the assigned owner is unchanged.</div>
                                            </div>
                                        )}

                                        {/* PARTNER COMPANY OWNER — assign to one of THEIR OWN sub-agents (partner_assignee_id). */}
                                        {isPartnerOwner && selectedPhone && (
                                            <div>
                                                <label style={soLabel}>Assign to teammate</label>
                                                <select
                                                    value={editPartnerAssignee}
                                                    onChange={e => handleAssignTeammate(selectedPhone, e.target.value)}
                                                    style={soInput}
                                                >
                                                    <option value="">Unassigned</option>
                                                    {partnerRoster.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                                </select>
                                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                    Only your team members appear here. They'll see this lead and its deal.
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {!isPartner && selectedPhone && <CallerDossier phone={selectedPhone} />}

                                    {/* WhatsApp Conversation Answers */}
                                    {sessionAnswers && (
                                        <div style={{ padding: '10px 12px', backgroundColor: 'rgba(37,211,102,0.06)', borderRadius: '8px', border: '1px solid rgba(37,211,102,0.2)', marginBottom: '12px' }}>
                                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#25d366', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>WhatsApp Conversation Answers</div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                                {Object.entries(sessionAnswers).filter(([k]) => !k.startsWith('_') && k !== 'buyer_phone').map(([key, val]) => (
                                                    <div key={key} style={{ fontSize: '11px' }}>
                                                        <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{key.replace('buyer_', '').replace(/_/g, ' ')}: </span>
                                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{String(val)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Phase 2 demand-side unification (2026-05-29): the legacy
                                        inline form (Intent + Category/Sub-Category/Property Type cascade
                                        + hardcoded BHK 1-6 dropdown + 12 hardcoded amenity chips +
                                        area/budget/timeline/location) has been REPLACED by the shared
                                        <DemandRequirementsForm> which renders a taxonomy picker + a
                                        dynamic by-type panel driven from FieldDefinition rows. Labels
                                        and options now match whatever the property type actually uses
                                        (BHK for residential, Rooms for commercial, FAR/Side-Opens/
                                        Road-Width for plots, etc.) — same shape as inventory.specs. */}
                                    <div>
                                        <label style={{ ...soLabel, marginBottom: '10px' }}>Buyer Requirements</label>
                                        <DemandRequirementsForm
                                            initial={{
                                                intent: leadDetail.intent ?? 'buy',
                                                budget_min: leadDetail.budget_min != null ? Number(leadDetail.budget_min) : null,
                                                budget_max: leadDetail.budget_max != null ? Number(leadDetail.budget_max) : null,
                                                area_min: leadDetail.area_min ?? null,
                                                area_max: leadDetail.area_max ?? null,
                                                area_unit: leadDetail.area_unit ?? 'sqft',
                                                timeline: leadDetail.timeline ?? '',
                                                preferred_location: leadDetail.preferred_location ?? '',
                                                preferred_lat: leadDetail.preferred_lat ?? null,
                                                preferred_lng: leadDetail.preferred_lng ?? null,
                                                demand_taxonomy_node_id: leadDetail.demand_taxonomy_node_id ?? null,
                                                demand_schema_values: leadDetail.demand_schema_values ?? {},
                                            }}
                                            onSubmit={handleSaveDemandCanonical}
                                            submitting={savingReqs}
                                            ref={demandFormRef}
                                            hideSubmitButton
                                        />
                                    </div>

                                    {/* Find Matches + Multi-Select + WhatsApp Sharing */}
                                    <MatchedPropertiesSection
                                        matches={matches}
                                        matchLoading={matchLoading}
                                        matchError={matchError}
                                        onFindMatches={handleFindMatches}
                                        leadPhone={leadDetail.phone_number}
                                        leadName={leadDetail.name}
                                        leadPartnerPhone={leadDetail.referral_partner_phone}
                                        scoreColor={scoreColor}
                                    />

                                    {/* Convert to Deal */}
                                    {hasPermission('manage_deals') && (
                                        <div style={{ padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-secondary)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', marginBottom: '2px' }}>Convert to Deal</div>
                                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                                        {leadDetail.intent && (leadDetail.budget_min || leadDetail.budget_max) && leadDetail.preferred_location
                                                            ? 'Ready to convert — all requirements filled.'
                                                            : 'Fill intent, budget and location to convert.'}
                                                    </div>
                                                </div>
                                                <button onClick={handleConvertToDeal} disabled={convertingDeal || !leadDetail.intent || (!leadDetail.budget_min && !leadDetail.budget_max) || !leadDetail.preferred_location}
                                                    style={{ ...primaryBtn, backgroundColor: '#10b981', opacity: (!leadDetail.intent || (!leadDetail.budget_min && !leadDetail.budget_max) || !leadDetail.preferred_location) ? 0.5 : 1 }}>
                                                    {convertingDeal ? 'Converting...' : 'Convert'}
                                                </button>
                                            </div>
                                            {dealError && <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '6px' }}>{dealError}</div>}
                                        </div>
                                    )}

                                    {/* Notes */}
                                    <div>
                                        <label style={soLabel}>Notes</label>
                                        <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3}
                                            placeholder="Add notes about this lead..." style={{ ...soInput, resize: 'vertical' }} />
                                    </div>

                                    {/* Convert to Partner Agent — TEAM ONLY (backend already denies partners) */}
                                    {!isPartner && leadDetail.contact_type !== 'PARTNER_AGENT' && (
                                        <div>
                                            <button type="button" onClick={() => setShowConvert(true)} style={{
                                                padding: '7px 12px', fontSize: '12px', fontWeight: 700, borderRadius: 8, cursor: 'pointer',
                                                border: 'none', backgroundColor: '#10b981', color: '#fff',
                                            }}>🤝 Convert to Partner Agent</button>
                                        </div>
                                    )}

                                    {showConvert && selectedPhone && (
                                        <ConvertToPartnerModal
                                            phone={selectedPhone}
                                            defaultName={leadDetail?.name || ''}
                                            contactType={leadDetail?.contact_type}
                                            leadStatus={leadDetail?.lead_status}
                                            onClose={() => setShowConvert(false)}
                                            onConverted={() => {
                                                setRecentLeads(prev => prev.map(l => l.phone_number === selectedPhone ? { ...l, contact_type: 'PARTNER_AGENT' } : l));
                                                setShowConvert(false);
                                            }}
                                        />
                                    )}

                                    {/* Lead Info */}
                                    <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', padding: '14px', border: '1px solid var(--border-secondary)' }}>
                                        <label style={{ ...soLabel, marginBottom: '10px' }}>Lead Info</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                                            {[['Intent', leadDetail.intent], ['Type', leadDetail.contact_type], ['Source', sourceLabels[leadDetail.source] || leadDetail.source], ['Created', new Date(leadDetail.created_at).toLocaleDateString('en-IN')]].map(([k, v]) => (
                                                <div key={k}>
                                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>{k}</div>
                                                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', textTransform: 'capitalize' }}>{v || '—'}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* MagicBricks Source Details */}
                                    {leadDetail.source === 'magicbricks' && (() => {
                                        const meta = leadDetail.recent_interactions.find(i => i.channel === 'magicbricks')?.metadata as Record<string, any> | null | undefined;
                                        if (!meta) return null;
                                        const listingId = meta.listing_id ? String(meta.listing_id) : null;
                                        const subUser = meta.sub_user ? String(meta.sub_user) : null;
                                        if (!listingId && !subUser && !meta.project) return null;
                                        return (
                                            <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', padding: '14px', border: '1px solid var(--border-secondary)' }}>
                                                <label style={{ ...soLabel, marginBottom: '10px' }}>MagicBricks Source Details</label>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                                                    {meta.project && <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Project / Society</div><div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{meta.project}</div></div>}
                                                    {meta.city && <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>City</div><div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{meta.city}</div></div>}
                                                    {subUser && <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Listing Agent (sub-user)</div><div style={{ fontSize: '12px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{subUser}</div></div>}
                                                    {listingId && (
                                                        <div style={{ gridColumn: '1 / -1' }}>
                                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>MagicBricks Listing</div>
                                                            <a
                                                                href={`https://www.magicbricks.com/propertyDetails/-pdpid-${listingId}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                title="Open the MagicBricks listing this lead enquired on"
                                                                style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                                    padding: '5px 12px', borderRadius: '8px',
                                                                    backgroundColor: 'rgba(220,38,38,0.1)', color: '#dc2626',
                                                                    border: '1px solid rgba(220,38,38,0.3)',
                                                                    fontSize: '12px', fontWeight: 600, fontFamily: 'monospace',
                                                                    textDecoration: 'none',
                                                                }}
                                                            >🔗 Listing #{listingId}</a>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* 99acres Source Details */}
                                    {leadDetail.source === '99acres' && (() => {
                                        const meta = leadDetail.recent_interactions.find(i => i.channel === '99acres')?.metadata as Record<string, any> | null | undefined;
                                        if (!meta) return null;
                                        const resComLabel = meta.res_com === 'R' ? 'Residential' : meta.res_com === 'C' ? 'Commercial' : meta.res_com;
                                        const verifiedBadge = (val: string | undefined) => val?.toUpperCase() === 'VERIFIED'
                                            ? <span style={{ color: '#22c55e', fontWeight: 700, fontSize: '12px' }}>✓ VERIFIED</span>
                                            : <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{val || 'UNVALIDATED'}</span>;
                                        const priceFormatted = meta.price ? `₹${Number(meta.price).toLocaleString('en-IN')}` : null;
                                        return (
                                            <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', padding: '14px', border: '1px solid var(--border-secondary)' }}>
                                                <label style={{ ...soLabel, marginBottom: '10px' }}>99acres Source Details</label>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                                                    {meta.proj_name && <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Project / Society</div><div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{meta.proj_name}</div></div>}
                                                    {meta.city_name && <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>City</div><div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{meta.city_name}</div></div>}
                                                    {priceFormatted && <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Listed Price</div><div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{priceFormatted}</div></div>}
                                                    {meta.res_com && <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Property Type</div><div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{resComLabel}</div></div>}
                                                    {meta.identity && <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Buyer Type</div><div style={{ fontSize: '12px', fontWeight: 600, padding: '2px 8px', borderRadius: '12px', display: 'inline-block', backgroundColor: meta.identity === 'Dealer' ? '#fef3c7' : '#dbeafe', color: meta.identity === 'Dealer' ? '#92400e' : '#1e40af' }}>{meta.identity}</div></div>}
                                                    {meta.sub_user_name && <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Agent's 99acres Email</div><div style={{ fontSize: '12px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{meta.sub_user_name}</div></div>}
                                                    {meta.property_code && (
                                                        <div style={{ gridColumn: '1 / -1' }}>
                                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>99acres Listing</div>
                                                            <a
                                                                href={`https://www.99acres.com/${meta.property_code}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                                    padding: '5px 12px', borderRadius: '8px',
                                                                    backgroundColor: 'rgba(234,88,12,0.1)', color: '#ea580c',
                                                                    border: '1px solid rgba(234,88,12,0.3)',
                                                                    fontSize: '12px', fontWeight: 600, fontFamily: 'monospace',
                                                                    textDecoration: 'none', transition: 'background 0.15s',
                                                                }}
                                                                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(234,88,12,0.18)')}
                                                                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(234,88,12,0.1)')}
                                                            >
                                                                <span>🔗</span>
                                                                <span>{meta.property_code}</span>
                                                                <span style={{ fontSize: '10px', fontFamily: 'sans-serif', fontWeight: 400, opacity: 0.8 }}>View on 99acres ↗</span>
                                                            </a>
                                                        </div>
                                                    )}
                                                    <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Phone Verified</div>{verifiedBadge(meta.phone_verification_status)}</div>
                                                    <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Email Verified</div>{verifiedBadge(meta.email_verification_status)}</div>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* One contact → many leads: associated users + every enquiry on this contact */}
                                    {!!leadDetail.associated_users?.length && (
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Associated users </span>
                                            {leadDetail.associated_users.map(u => u.name || u.id).join(', ')}
                                        </div>
                                    )}
                                    {!!leadDetail.lead_history?.length && (
                                        <div>
                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>Lead history ({leadDetail.lead_history.length})</div>
                                            {leadDetail.lead_history.map(d => (
                                                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 8px', marginBottom: '4px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-secondary)' }}>
                                                    <span>{d.source_ref || '—'} · {d.source}</span>
                                                    <span>{d.coordinator?.name || 'Unassigned'} · {d.status}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Timeline Tabs */}
                                    <div>
                                        <div style={{ display: 'flex', gap: '0', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-secondary)', marginBottom: '10px' }}>
                                            {(['activity', 'chat', 'visits'] as const).map(tab => (
                                                <button key={tab} type="button"
                                                    onClick={() => setSliderTab(tab)}
                                                    style={{ flex: 1, padding: '7px 12px', fontSize: '12px', fontWeight: 600, border: 'none', cursor: 'pointer', backgroundColor: sliderTab === tab ? '#3b82f6' : 'var(--bg-secondary)', color: sliderTab === tab ? '#fff' : 'var(--text-secondary)', transition: 'all 0.15s' }}>
                                                    {tab === 'activity' ? '📋 Activity' : tab === 'chat' ? '💬 WhatsApp' : '🏠 Visits & Views'}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Activity Tab */}
                                        {sliderTab === 'activity' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                {leadDetail.recent_interactions.length === 0 && (
                                                    <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '16px' }}>No activity yet</div>
                                                )}
                                                {leadDetail.recent_interactions.map(i => (
                                                    <div key={i.id} style={{ display: 'flex', gap: '10px', padding: '8px 12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-secondary)' }}>
                                                        <span style={{ fontSize: '16px', flexShrink: 0 }}>{channelIcon(i.channel)}</span>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                                                                <span style={{ textTransform: 'capitalize' }}>{i.channel} · {i.direction} · {i.event_type}</span>
                                                                <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>{new Date(i.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                                                            </div>
                                                            {i.content && <div style={{ fontSize: '12px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4 }}>{i.content}</div>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* WhatsApp Chat Tab */}
                                        {sliderTab === 'chat' && (
                                            <WhatsAppChatTab phone={selectedPhone || ''} isMobile={effectiveIsMobile} />
                                        )}

                                        {/* Visits & Views Tab */}
                                        {sliderTab === 'visits' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {appointmentsLoading && <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '12px' }}>Loading visits...</div>}

                                                {/* Scheduled visits */}
                                                {leadAppointments.map(appt => (
                                                    <div key={appt.id} style={{ padding: '10px 14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-secondary)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                                📅 {appt.type.replace(/_/g, ' ')}
                                                            </span>
                                                            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600, backgroundColor: appt.status === 'completed' ? '#d1fae5' : appt.status === 'cancelled' ? '#fee2e2' : '#eff6ff', color: appt.status === 'completed' ? '#065f46' : appt.status === 'cancelled' ? '#dc2626' : '#1d4ed8' }}>
                                                                {appt.status}
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                                            {new Date(appt.scheduled_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                        {appt.property && (
                                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                                🏠 {appt.property.type} {appt.property.location ? `· ${appt.property.location}` : ''}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}

                                                {/* Property views from interactions */}
                                                {leadDetail.recent_interactions
                                                    .filter(i => i.event_type === 'property_view')
                                                    .map(i => (
                                                        <div key={i.id} style={{ padding: '8px 14px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '12px', color: '#065f46' }}>👁 {i.content || 'Viewed property'}</span>
                                                            <span style={{ fontSize: '11px', color: '#6b7280' }}>{new Date(i.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                                                        </div>
                                                    ))
                                                }

                                                {!appointmentsLoading && leadAppointments.length === 0 && leadDetail.recent_interactions.filter(i => i.event_type === 'property_view').length === 0 && (
                                                    <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '16px' }}>No visits or property views yet</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {/* 2026-08-01: single sticky Save-changes footer (replaces the per-field save buttons) */}
                                <div style={{ position: 'sticky', bottom: 0, marginTop: 'auto', padding: '12px 20px', borderTop: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', gap: '6px', zIndex: 6, boxShadow: '0 -4px 12px rgba(0,0,0,0.06)' }}>
                                    {saveError && <div style={{ fontSize: '12px', color: '#ef4444' }}>{saveError}</div>}
                                    <button onClick={handleSaveAll} disabled={savingAll || savingName || savingNotes || savingPhone} style={{ ...primaryBtn, width: '100%', opacity: savingAll ? 0.7 : 1 }}>
                                        {savingAll ? 'Saving…' : '💾 Save changes'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexDirection: 'column', gap: '8px' }}>
                                <div>Lead not found</div>
                                <button type="button" onClick={closeDetail} style={outlineBtn}>Close</button>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ── Create Lead Modal ── */}
            {showCreateModal && (
                <>
                    <div onClick={closeCreateModal} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100 }} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: 'var(--bg-primary)', borderRadius: '12px', padding: '24px', width: '520px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto', zIndex: 101, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                        <h3 style={{ margin: '0 0 16px', color: 'var(--text-primary)', fontSize: '18px' }}>Add New Lead</h3>

                        {/* Step Indicator */}
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
                            {(createLeadType === 'DIRECT_OWNER'
                                ? ['Identity', 'Source', 'Search', 'Details']
                                : ['Identity', 'Source', 'Details']
                            ).map((label, idx) => {
                                const stepNum = idx + 1;
                                const active = createStep >= stepNum;
                                const totalSteps = createLeadType === 'DIRECT_OWNER' ? 4 : 3;
                                return (
                                    <div key={label} style={{ display: 'flex', alignItems: 'center', flex: idx < totalSteps - 1 ? 1 : 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                            <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: active ? '#3b82f6' : 'var(--border-secondary)', color: active ? '#fff' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>{stepNum}</div>
                                            <span style={{ fontSize: '12px', color: active ? '#3b82f6' : 'var(--text-muted)', fontWeight: active ? 600 : 400 }}>{label}</span>
                                        </div>
                                        {idx < totalSteps - 1 && <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-secondary)', margin: '0 8px' }} />}
                                    </div>
                                );
                            })}
                        </div>

                        {createError && <div style={{ marginBottom: '12px', padding: '8px 12px', borderRadius: '6px', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '13px' }}>{createError}</div>}

                        {/* ── STEP 1: Identity — phone first + autocomplete ──
                            An existing contact autocompletes name/phone into the form;
                            an unknown number rides createForm.phone into POST /api/leads
                            at submit (nothing is written to the DB from this step). */}
                        {createStep === 1 && (
                            <div>
                                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>Who is this lead? Start with the mobile number.</div>
                                <div style={{ position: 'relative' }}>
                                    <input type="search"
                                        autoFocus
                                        value={clientSearchQuery}
                                        onChange={e => handleClientSearchChange(e.target.value)}
                                        placeholder="Enter name or phone number"
                                        style={{ ...inputStyle, fontSize: '14px', padding: '10px 14px' }}
                                    />
                                    {/^\d*$/.test(clientSearchQuery) && <span style={{
                                        position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                                        fontSize: '12px', fontWeight: 600,
                                        color: clientSearchQuery.length === 10 ? '#22c55e' : 'var(--text-muted)',
                                        pointerEvents: 'none',
                                    }}>
                                        {clientSearchQuery.length}/10
                                    </span>}
                                </div>
                                {clientSearchQuery.length > 0 && /^\d+$/.test(clientSearchQuery) && clientSearchQuery.length < 10 && (
                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '6px 0 0 4px' }}>
                                        {10 - clientSearchQuery.length} more digits needed
                                    </p>
                                )}
                                {clientSearching && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>Searching...</div>}

                                {/* Confirmed: existing contact picked */}
                                {preselectedContact && (
                                    <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(59,130,246,0.08)', borderRadius: '8px', padding: '10px 14px', border: '1px solid rgba(59,130,246,0.3)' }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{preselectedContact.name || 'Unknown'}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{isPlaceholderPhone(preselectedContact.phone_number) ? 'No phone on file — you will add it in Details' : preselectedContact.phone_number}</div>
                                        </div>
                                        <button type="button" onClick={handleIdentityClear} style={{ ...outlineBtn, padding: '4px 10px', fontSize: '12px' }}>Change</button>
                                    </div>
                                )}

                                {/* Confirmed: new number (nothing written yet — added at submit) */}
                                {!preselectedContact && identityNewPhone && identityNewPhone === clientSearchQuery.trim() && (
                                    <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: '8px', padding: '10px 14px', border: '1px solid rgba(34,197,94,0.3)' }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>✓ New number ready</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{identityNewPhone} — will be added when you create the lead</div>
                                        </div>
                                        <button type="button" onClick={handleIdentityClear} style={{ ...outlineBtn, padding: '4px 10px', fontSize: '12px' }}>Change</button>
                                    </div>
                                )}

                                {/* Results */}
                                {!preselectedContact && !(identityNewPhone && identityNewPhone === clientSearchQuery.trim()) && clientSearchQuery.trim().length >= 2 && !clientSearching && clientSearchResults.length > 0 && (
                                    <div style={{ marginTop: '8px', border: '1px solid var(--border-secondary)', borderRadius: '8px', overflow: 'hidden' }}>
                                        {clientSearchResults.map(r => {
                                            const isTemp = isPlaceholderPhone(r.phone_number);
                                            const statusColors: Record<string, string> = { cold: '#94a3b8', warm: '#f59e0b', hot: '#ef4444', closed: '#22c55e', lost: '#6b7280' };
                                            const sc = statusColors[r.lead_status || ''] || '#94a3b8';
                                            return (
                                                <div key={r.phone_number} onClick={() => handleIdentitySelectExisting(r)}
                                                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-secondary)', display: 'flex', alignItems: 'center', gap: '10px', transition: 'background 0.1s' }}
                                                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.06)')}
                                                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                                                    <div style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>
                                                        {(r.name || '?')[0].toUpperCase()}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{r.name || 'Unknown'}</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{isTemp ? 'No phone' : r.phone_number}</div>
                                                    </div>
                                                    {r.lead_status && (
                                                        <span style={{ backgroundColor: `${sc}22`, color: sc, padding: '2px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 600, flexShrink: 0 }}>{r.lead_status}</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Not found — confirm number or name */}
                                {!preselectedContact && !(identityNewPhone && identityNewPhone === clientSearchQuery.trim()) && clientSearchQuery.trim().length >= 2 && !clientSearching && clientSearchResults.length === 0 && (
                                    <div style={{ marginTop: '10px', padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-secondary)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>No existing contact found for "{clientSearchQuery}"</div>
                                        {/^\d{10}$/.test(normalizePhoneInput(clientSearchQuery.trim())) ? (
                                            <button type="button" onClick={handleIdentityUseNew} style={{ ...primaryBtn, padding: '7px 18px', fontSize: '13px' }}>
                                                + Use this number
                                            </button>
                                        ) : (
                                            <button type="button" onClick={() => { setCreateForm(p => ({ ...p, name: clientSearchQuery.trim() })); setCreateStep(2); }} style={{ ...primaryBtn, padding: '7px 18px', fontSize: '13px' }}>
                                                + Create lead for "{clientSearchQuery.trim()}"
                                            </button>
                                        )}
                                    </div>
                                )}

                                {suggestedLeadType && (preselectedContact || (identityNewPhone && identityNewPhone === clientSearchQuery.trim())) && (
                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '8px 0 0 4px' }}>
                                        Suggested role: {LEAD_SOURCE_ROLES.find(r => r.key === suggestedLeadType)?.title} — preselected on the next step, changeable.
                                    </p>
                                )}

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                                    <button type="button" onClick={closeCreateModal} style={outlineBtn}>Cancel</button>
                                    <button type="button" onClick={handleIdentityContinue} style={primaryBtn}>Continue →</button>
                                </div>
                            </div>
                        )}

                        {/* ── STEP 2: Source Selection (role cards) ── */}
                        {createStep === 2 && (
                            <div>
                                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Where is this lead coming from?</div>
                                <div role="radiogroup" aria-label="Lead source role" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    {LEAD_SOURCE_ROLES.map((r, i) => {
                                        const suggested = suggestedLeadType === r.key;
                                        return (
                                            <div key={r.key}
                                                ref={el => { roleCardRefs.current[i] = el; }}
                                                role="radio" aria-checked={suggested} tabIndex={0}
                                                autoFocus={i === 0}
                                                onClick={() => handleSourceTypeSelect(r.key)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSourceTypeSelect(r.key); }
                                                    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); roleCardRefs.current[(i + 1) % LEAD_SOURCE_ROLES.length]?.focus(); }
                                                    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); roleCardRefs.current[(i - 1 + LEAD_SOURCE_ROLES.length) % LEAD_SOURCE_ROLES.length]?.focus(); }
                                                }}
                                                style={{ padding: '20px 16px', borderRadius: '12px', border: `2px solid ${suggested ? r.accent : 'var(--border-secondary)'}`, backgroundColor: suggested ? r.hoverBg : 'var(--bg-secondary)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s', outline: 'none' }}
                                                onMouseEnter={e => { e.currentTarget.style.borderColor = r.accent; e.currentTarget.style.backgroundColor = r.hoverBg; }}
                                                onMouseLeave={e => { e.currentTarget.style.borderColor = suggested ? r.accent : 'var(--border-secondary)'; e.currentTarget.style.backgroundColor = suggested ? r.hoverBg : 'var(--bg-secondary)'; }}
                                                onFocus={e => { e.currentTarget.style.borderColor = r.accent; }}
                                                onBlur={e => { if (!suggested) e.currentTarget.style.borderColor = 'var(--border-secondary)'; }}>
                                                <div style={{ fontSize: '28px', marginBottom: '8px' }}>{r.icon}</div>
                                                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>{r.title}{suggested ? ' ✓' : ''}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{r.subtitle}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                                    <button type="button" onClick={() => setCreateStep(1)} style={{ ...outlineBtn, fontSize: '12px' }}>← Back</button>
                                    <button type="button" onClick={closeCreateModal} style={outlineBtn}>Cancel</button>
                                </div>
                            </div>
                        )}

                        {/* ── STEP 3 (DIRECT_OWNER): Contact Search (confirmation — Step 1 already searched) ── */}
                        {createStep === 3 && createLeadType === 'DIRECT_OWNER' && (
                            <div>
                                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>Search if this client already exists by name or phone</div>
                                <div style={{ position: 'relative' }}>
                                    <input type="search"
                                        autoFocus
                                        value={clientSearchQuery}
                                        onChange={e => handleClientSearchChange(e.target.value)}
                                        placeholder="Enter name or phone number"
                                        style={{ ...inputStyle, fontSize: '14px', padding: '10px 14px' }}
                                    />
                                    {/^\d*$/.test(clientSearchQuery) && <span style={{
                                        position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                                        fontSize: '12px', fontWeight: 600,
                                        color: clientSearchQuery.length === 10 ? '#22c55e' : 'var(--text-muted)',
                                        pointerEvents: 'none',
                                    }}>
                                        {clientSearchQuery.length}/10
                                    </span>}
                                </div>
                                {clientSearchQuery.length > 0 && /^\d+$/.test(clientSearchQuery) && clientSearchQuery.length < 10 && (
                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '6px 0 0 4px' }}>
                                        {10 - clientSearchQuery.length} more digits needed
                                    </p>
                                )}
                                {clientSearching && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>Searching...</div>}

                                {/* Results */}
                                {clientSearchQuery.trim().length >= 2 && !clientSearching && clientSearchResults.length > 0 && (
                                    <div style={{ marginTop: '8px', border: '1px solid var(--border-secondary)', borderRadius: '8px', overflow: 'hidden' }}>
                                        {clientSearchResults.map(r => {
                                            const isTemp = isPlaceholderPhone(r.phone_number);
                                            const statusColors: Record<string, string> = { cold: '#94a3b8', warm: '#f59e0b', hot: '#ef4444', closed: '#22c55e', lost: '#6b7280' };
                                            const sc = statusColors[r.lead_status || ''] || '#94a3b8';
                                            return (
                                                <div key={r.phone_number} onClick={() => handleSelectExistingClient(r)}
                                                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-secondary)', display: 'flex', alignItems: 'center', gap: '10px', transition: 'background 0.1s' }}
                                                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.06)')}
                                                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                                                    <div style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>
                                                        {(r.name || '?')[0].toUpperCase()}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{r.name || 'Unknown'}</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{isTemp ? 'No phone' : r.phone_number}</div>
                                                    </div>
                                                    {r.lead_status && (
                                                        <span style={{ backgroundColor: `${sc}22`, color: sc, padding: '2px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 600, flexShrink: 0 }}>{r.lead_status}</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Not found — offer to create */}
                                {clientSearchQuery.trim().length >= 2 && !clientSearching && clientSearchResults.length === 0 && (
                                    <div style={{ marginTop: '10px', padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-secondary)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>No contact found for "{clientSearchQuery}"</div>
                                        <button type="button" onClick={handleCreateNewClient} style={{ ...primaryBtn, padding: '7px 18px', fontSize: '13px' }}>
                                            + Create New Client
                                        </button>
                                    </div>
                                )}

                                {/* Skip search — go straight to new client form */}
                                {clientSearchQuery.trim().length < 10 && (
                                    <div style={{ marginTop: '10px', textAlign: 'center' }}>
                                        <button type="button" onClick={() => { setPreselectedContact(null); setCreateStep(4); }} style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                                            Skip — add new client directly
                                        </button>
                                    </div>
                                )}

                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                                    <button type="button" onClick={() => setCreateStep(2)} style={{ ...outlineBtn, fontSize: '12px' }}>← Back</button>
                                    <button type="button" onClick={closeCreateModal} style={outlineBtn}>Cancel</button>
                                </div>
                            </div>
                        )}

                        {/* ── STEP 3 (PARTNER_REFERRAL) or STEP 4 (DIRECT_OWNER): Details form ── */}
                        {((createStep === 3 && createLeadType === 'PARTNER_REFERRAL') || createStep === 4) && (
                        <div>
                            <div style={{ display: 'grid', gap: '12px' }}>

                                {/* Partner Agent Search — only for PARTNER_REFERRAL */}
                                {createLeadType === 'PARTNER_REFERRAL' && (
                                    <div style={{ backgroundColor: '#f5f3ff', borderRadius: '8px', padding: '12px', border: '1px solid #ede9fe' }}>
                                        <label style={labelStyle}>Partner Agent *</label>
                                        {partnerSelected ? (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ede9fe', borderRadius: '8px', padding: '10px 14px' }}>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#5b21b6' }}>{partnerSelected.name}</div>
                                                    <div style={{ fontSize: '12px', color: '#7c3aed' }}>{partnerSelected.phone_number}{partnerSelected.city ? ` | ${partnerSelected.city}` : ''}</div>
                                                    <div style={{ fontSize: '11px', color: partnerSelected.verified ? '#059669' : '#d97706', marginTop: '2px' }}>{partnerSelected.verified ? 'Verified' : `Status: ${partnerSelected.status}`}</div>
                                                </div>
                                                <button type="button" onClick={clearPartnerSelection} style={{ ...outlineBtn, padding: '4px 10px', fontSize: '12px' }}>Change</button>
                                            </div>
                                        ) : createPartnerPhone && !showPartnerRegister ? (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fef3c7', borderRadius: '8px', padding: '10px 14px' }}>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#92400e' }}>{createPartnerName || 'New Partner'}</div>
                                                    <div style={{ fontSize: '12px', color: '#b45309' }}>{createPartnerPhone}</div>
                                                    <div style={{ fontSize: '11px', color: '#d97706', marginTop: '2px' }}>Will be auto-registered on submit</div>
                                                </div>
                                                <button type="button" onClick={clearPartnerSelection} style={{ ...outlineBtn, padding: '4px 10px', fontSize: '12px' }}>Change</button>
                                            </div>
                                        ) : (
                                            <div style={{ position: 'relative' }}>
                                                <input type="text" value={partnerSearchQuery} autoFocus onChange={e => { setPartnerSearchQuery(e.target.value); setShowPartnerRegister(false); }} placeholder="Search partner by name or phone..." style={inputStyle} />
                                                {partnerSearching && <div style={{ fontSize: '11px', color: '#7c3aed', marginTop: '4px' }}>Searching...</div>}
                                                {partnerSearchResults.length > 0 && (
                                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: '8px', marginTop: '4px', maxHeight: '200px', overflowY: 'auto', zIndex: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
                                                        {partnerSearchResults.map(p => (
                                                            <div key={p.id} onClick={() => selectPartner(p)} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-secondary)' }}
                                                                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f5f3ff')}
                                                                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                                                                <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{p.name}</div>
                                                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{p.phone_number}{p.company_name ? ` | ${p.company_name}` : ''}{p.city ? ` | ${p.city}` : ''}</div>
                                                                <div style={{ fontSize: '11px', color: p.verified ? '#059669' : '#d97706', marginTop: '2px' }}>{p.verified ? 'Verified' : p.status} | {p.package_type}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {partnerSearchDone && partnerSearchResults.length === 0 && partnerSearchQuery.trim().length >= 2 && !partnerSearching && (
                                                    <div style={{ marginTop: '8px', padding: '10px 14px', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
                                                        <div style={{ fontSize: '13px', color: '#dc2626', fontWeight: 600 }}>Partner not registered</div>
                                                        <p style={{ margin: '4px 0 8px', fontSize: '12px', color: '#b91c1c' }}>No partner found matching "{partnerSearchQuery}". Register them now:</p>
                                                        <button type="button" onClick={() => { const isPhone = /\d{3,}/.test(partnerSearchQuery); setNewPartnerForm({ phone: isPhone ? partnerSearchQuery : '', name: isPhone ? '' : partnerSearchQuery, email: '', city: '' }); setShowPartnerRegister(true); }} style={{ ...primaryBtn, padding: '6px 14px', fontSize: '12px', backgroundColor: '#7c3aed' }}>+ Register New Partner</button>
                                                    </div>
                                                )}
                                                {showPartnerRegister && (
                                                    <div style={{ marginTop: '8px', padding: '12px', backgroundColor: '#fefce8', borderRadius: '8px', border: '1px solid #fde68a' }}>
                                                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#92400e', marginBottom: '10px' }}>Register New Partner Agent</div>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                            <div><label style={{ ...labelStyle, fontSize: '11px' }}>Phone *</label><PhoneInput value={newPartnerForm.phone} onChange={v => setNewPartnerForm(p => ({ ...p, phone: v }))} placeholder="+91 98765 43210" style={inputStyle} /></div>
                                                            <div><label style={{ ...labelStyle, fontSize: '11px' }}>Name *</label><input type="text" value={newPartnerForm.name} onChange={e => setNewPartnerForm(p => ({ ...p, name: e.target.value }))} placeholder="Partner name" style={inputStyle} /></div>
                                                            <div><label style={{ ...labelStyle, fontSize: '11px' }}>Email</label><input type="email" value={newPartnerForm.email} onChange={e => setNewPartnerForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" style={inputStyle} /></div>
                                                            <div><label style={{ ...labelStyle, fontSize: '11px' }}>City</label><input type="text" value={newPartnerForm.city} onChange={e => setNewPartnerForm(p => ({ ...p, city: e.target.value }))} placeholder="City" style={inputStyle} /></div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                                                            <button type="button" onClick={confirmNewPartner} disabled={!newPartnerForm.phone.trim()} style={{ ...primaryBtn, padding: '6px 14px', fontSize: '12px', backgroundColor: '#059669', opacity: newPartnerForm.phone.trim() ? 1 : 0.5 }}>Confirm Partner</button>
                                                            <button type="button" onClick={() => setShowPartnerRegister(false)} style={{ ...outlineBtn, padding: '6px 14px', fontSize: '12px' }}>Cancel</button>
                                                        </div>
                                                        <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#92400e' }}>Partner will be auto-created with Pending status and notified via WhatsApp + Email.</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Preselected contact banner */}
                                {preselectedContact && (
                                    <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)', fontSize: '13px', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Adding requirements for: <strong>{preselectedContact.name || 'Contact'}</strong> &nbsp;|&nbsp; {isPlaceholderPhone(preselectedContact.phone_number) ? 'No phone' : preselectedContact.phone_number}</span>
                                        <button type="button" onClick={() => { setPreselectedContact(null); setCreateForm(p => ({ ...p, name: '', phone: '' })); }} style={{ fontSize: '11px', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>Change</button>
                                    </div>
                                )}

                                {/* Client Name + Phone */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={labelStyle}>{createLeadType === 'PARTNER_REFERRAL' ? 'Client Name' : 'Name *'}</label>
                                        <input type="text" required={createLeadType === 'DIRECT_OWNER' && !preselectedContact} value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))} placeholder="Full Name" style={{ ...inputStyle, opacity: preselectedContact ? 0.6 : 1 }} disabled={!!preselectedContact} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>{createLeadType === 'PARTNER_REFERRAL' ? 'Client Phone (optional)' : 'Phone *'}</label>
                                        <PhoneInput required={createLeadType === 'DIRECT_OWNER' && !preselectedContact} value={createForm.phone} onChange={v => setCreateForm(p => ({ ...p, phone: v }))} placeholder="+918178491914" style={{ ...inputStyle, opacity: preselectedContact ? 0.6 : 1 }} disabled={!!preselectedContact} />
                                    </div>
                                </div>

                                {/* Existing-client notice (partner referral) — backend attaches this as a new requirement */}
                                {createLeadType === 'PARTNER_REFERRAL' && partnerClientMatch && (
                                    <div style={{ padding: '8px 12px', borderRadius: '8px', backgroundColor: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', fontSize: '12px', color: '#b45309' }}>
                                        ✓ <strong>{partnerClientMatch.name || 'This client'}</strong> is already registered with us — this requirement will be <strong>added to their profile</strong> (Add as Direct Client).
                                    </div>
                                )}

                                {/* Email + Source */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={labelStyle}>Email</label>
                                        <input type="email" value={createForm.email} onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Source</label>
                                        <select title="Lead source" value={createForm.source} onChange={e => setCreateForm(p => ({ ...p, source: e.target.value }))} style={inputStyle}>
                                            {SOURCES.map(s => <option key={s} value={s}>{sourceLabels[s] || s}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* Intent / Property-Type / Budget / Timeline / Location are now
                                    captured by <DemandRequirementsForm> below (the same taxonomy
                                    picker + dynamic per-type fields used in the lead-edit panel),
                                    so the manual Add-Lead path stores the canonical
                                    demand_taxonomy_node_id + demand_schema_values like every other
                                    source. (2026-05-31) */}

                                {/* Agent Assignment — only for privileged */}
                                {isPrivileged && (
                                    <div>
                                        <label style={labelStyle}>Assign to Agent</label>
                                        <select value={createAssignedAgentId} onChange={e => setCreateAssignedAgentId(e.target.value)} style={inputStyle}>
                                            <option value="">Auto-assign</option>
                                            {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
                                        </select>
                                    </div>
                                )}

                                {/* Notes */}
                                <div>
                                    <label style={labelStyle}>Notes</label>
                                    <textarea value={createForm.notes} onChange={e => setCreateForm(p => ({ ...p, notes: e.target.value }))} placeholder="Additional notes..." rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                                </div>
                            </div>

                            {/* Wizard back nav */}
                            <div style={{ marginTop: '16px', marginBottom: '8px' }}>
                                <button type="button" onClick={() => setCreateStep(createLeadType === 'DIRECT_OWNER' ? 3 : 2)} style={{ ...outlineBtn, fontSize: '12px' }}>← Back</button>
                            </div>

                            {/* Buyer Requirements — shared taxonomy picker + dynamic per-type fields.
                                Its submit button IS "Create Lead"; onSubmit emits the canonical
                                demand payload which handleCreateLead merges with the identity fields. */}
                            <div>
                                <label style={{ ...labelStyle, marginBottom: '10px', display: 'block' }}>Buyer Requirements</label>
                                <DemandRequirementsForm
                                    initial={{
                                        intent: createForm.intent || 'buy',
                                        budget_min: null, budget_max: null,
                                        area_min: null, area_max: null, area_unit: 'sqft',
                                        timeline: '', preferred_location: createForm.preferred_location || '',
                                        demand_taxonomy_node_id: null, demand_schema_values: {},
                                    }}
                                    onSubmit={handleCreateLead}
                                    onCancel={closeCreateModal}
                                    submitting={creating}
                                    submitLabel="Create Lead"
                                />
                            </div>
                        </div>
                        )}

                    </div>
                </>
            )}

            {/* ── Filter Bottom Sheet ── */}
            {/* Bulk reassign action bar (#4) */}
            {leadSelectMode && selectedLeadPhones.size > 0 && (
                <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: '12px', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', zIndex: 1000 }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{selectedLeadPhones.size} lead{selectedLeadPhones.size === 1 ? '' : 's'} selected</span>
                    <button onClick={() => { setShowLeadReassign(true); setLeadReassignTarget(''); setLeadReassignMsg(''); }}
                        style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', backgroundColor: '#8b5cf6', border: 'none', color: '#fff' }}>🔄 Reassign</button>
                    <button onClick={() => { setSelectedLeadPhones(new Set()); setLeadSelectMode(false); }}
                        style={{ padding: '8px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', border: '1px solid var(--border-secondary)', backgroundColor: 'transparent', color: 'var(--text-muted)' }}>Cancel</button>
                </div>
            )}

            {/* Bulk reassign modal (#4) → POST /api/leads/bulk-reassign */}
            {showLeadReassign && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseDown={e => { if (e.target === e.currentTarget && !leadReassigning) setShowLeadReassign(false); }}>
                    <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: '14px', padding: '24px', width: '400px', maxWidth: '90vw' }}>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>🔄 Reassign {selectedLeadPhones.size} lead{selectedLeadPhones.size === 1 ? '' : 's'}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>Transfer the selected lead{selectedLeadPhones.size === 1 ? '' : 's'} to another team member — they become the lead owner (and deal coordinator).</div>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Assign to</label>
                        <select value={leadReassignTarget} onChange={e => setLeadReassignTarget(e.target.value)} disabled={leadReassigning}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', marginTop: '6px', marginBottom: '16px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px' }}>
                            <option value="">Select an agent…</option>
                            {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}{(m as any).role ? ` (${(m as any).role})` : ''}</option>)}
                        </select>
                        {leadReassignMsg && <div style={{ fontSize: '12px', color: leadReassignMsg.startsWith('✅') ? '#22c55e' : '#ef4444', marginBottom: '12px' }}>{leadReassignMsg}</div>}
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button disabled={leadReassigning} onClick={() => setShowLeadReassign(false)}
                                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', border: '1px solid var(--border-secondary)', backgroundColor: 'transparent', color: 'var(--text-muted)' }}>Cancel</button>
                            <button disabled={leadReassigning || !leadReassignTarget} onClick={async () => {
                                if (!leadReassignTarget) return;
                                setLeadReassigning(true); setLeadReassignMsg('');
                                try {
                                    const res = await client.post('/api/leads/bulk-reassign', { phones: Array.from(selectedLeadPhones), agent_id: leadReassignTarget });
                                    const n = res.data?.reassigned ?? 0;
                                    setLeadReassignMsg(`✅ Reassigned ${n} lead${n === 1 ? '' : 's'}.`);
                                    await loadData();
                                    setTimeout(() => { setShowLeadReassign(false); setSelectedLeadPhones(new Set()); setLeadSelectMode(false); }, 1200);
                                } catch (err: any) {
                                    setLeadReassignMsg(`❌ ${err?.response?.data?.error || 'Reassign failed'}`);
                                } finally { setLeadReassigning(false); }
                            }}
                                style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: leadReassignTarget ? 'pointer' : 'not-allowed', backgroundColor: '#8b5cf6', border: 'none', color: '#fff', opacity: leadReassignTarget && !leadReassigning ? 1 : 0.5 }}>
                                {leadReassigning ? 'Reassigning…' : 'Confirm reassign'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showFilterSheet && (
                <div
                    style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--sheet-backdrop)', zIndex: 900 }}
                    onClick={() => setShowFilterSheet(false)}
                >
                    <div
                        style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            backgroundColor: 'var(--bg-secondary)',
                            borderRadius: '20px 20px 0 0',
                            maxHeight: '80vh',
                            overflowY: 'auto',
                            WebkitOverflowScrolling: 'touch',
                            padding: '0 0 32px',
                            boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
                            animation: 'slide-up-in 250ms cubic-bezier(0.34,1.2,0.64,1) forwards',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Sheet handle */}
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
                            <div style={{ width: '40px', height: '4px', borderRadius: '2px', backgroundColor: 'var(--border-secondary)' }} />
                        </div>

                        <div style={{ padding: '0 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)' }}>Filters</span>
                            <button type="button" onClick={() => {
                                setStatusFilter('');
                                setSourceFilter('');
                                setAgentFilter('');
                                setDateFrom('');
                                setDateTo('');
                                setIntentFilter('');
                                setFilterTaxonomy({ nodeIds: [], bhk: [] });
                                setLocationSelection({ label: '', lat: null, lng: null, radiusKm: 2 });
                                setNotContactedDays(0);
                                setNoShowcaseDays(0);
                            }} style={{ background: 'none', border: 'none', color: 'var(--text-link)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                                Clear All
                            </button>
                        </div>

                        {/* Intent */}
                        <FilterSection title="Intent" defaultOpen badge={intentFilter ? 1 : 0}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {[{ label: 'Buy', value: 'BUYER' }, { label: 'Rent', value: 'TENANT' }].map(opt => (
                                    <button key={opt.value} type="button"
                                        onClick={() => setIntentFilter(intentFilter === opt.value ? '' : opt.value as 'BUYER' | 'TENANT')}
                                        className={`chip ${intentFilter === opt.value ? 'chip-active' : 'chip-inactive'}`}>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </FilterSection>

                        {/* Budget — filters leads by their stated max budget (#3, 2026-06-28) → budget_min/budget_max */}
                        <FilterSection title="Budget (₹)" defaultOpen={false} badge={(budgetMinFilter.trim() || budgetMaxFilter.trim()) ? 1 : 0}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input type="number" inputMode="numeric" value={budgetMinFilter} onChange={e => setBudgetMinFilter(e.target.value)} placeholder="Min ₹"
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }} />
                                <input type="number" inputMode="numeric" value={budgetMaxFilter} onChange={e => setBudgetMaxFilter(e.target.value)} placeholder="Max ₹"
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }} />
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                Filters leads by their stated max budget (₹).
                            </div>
                        </FilterSection>

                        <FilterLocationSection value={locationSelection} onChange={setLocationSelection} />

                        <FilterTaxonomySection tree={taxonomyTree} value={filterTaxonomy} onChange={setFilterTaxonomy} />

                        {/* Source */}
                        <FilterSection title="Source" defaultOpen={false} badge={sourceFilter ? 1 : 0}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {SOURCES.map(s => (
                                    <button key={s} type="button"
                                        onClick={() => setSourceFilter(sourceFilter === s ? '' : s)}
                                        className={`chip ${sourceFilter === s ? 'chip-active' : 'chip-inactive'}`}>
                                        {sourceLabels[s] || s}
                                    </button>
                                ))}
                            </div>
                        </FilterSection>

                        {/* Agent (privileged only) */}
                        {isPrivileged && (
                            <FilterSection title="Agent" defaultOpen={false} badge={agentFilter ? 1 : 0}>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {teamMembers.map(m => (
                                        <button key={m.id} type="button"
                                            onClick={() => setAgentFilter(agentFilter === m.id ? '' : m.id)}
                                            className={`chip ${agentFilter === m.id ? 'chip-active' : 'chip-inactive'}`}>
                                            {m.name}
                                        </button>
                                    ))}
                                </div>
                            </FilterSection>
                        )}

                        {/* Status */}
                        <FilterSection title="Status" defaultOpen={false} badge={statusFilter ? 1 : 0}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {LEAD_STATUSES.map(s => (
                                    <button key={s} type="button"
                                        onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
                                        className={`chip ${statusFilter === s ? 'chip-active' : 'chip-inactive'}`}>
                                        {s.charAt(0).toUpperCase() + s.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </FilterSection>

                        {/* Date Range */}
                        <FilterSection title="Date Range" defaultOpen={false} badge={(dateFrom || dateTo) ? 1 : 0}>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                                    style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px' }} />
                                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                                    style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px' }} />
                            </div>
                        </FilterSection>

                        <StalenessSection
                            title="Lead Staleness"
                            label1="Not contacted in"
                            label2="No inventory showcased in"
                            days1={notContactedDays}
                            days2={noShowcaseDays}
                            onDays1Change={setNotContactedDays}
                            onDays2Change={setNoShowcaseDays}
                            badge={(notContactedDays > 0 ? 1 : 0) + (noShowcaseDays > 0 ? 1 : 0)}
                        />

                        {/* Apply button */}
                        <div style={{ padding: '16px 20px 0' }}>
                            <button type="button"
                                onClick={() => setShowFilterSheet(false)}
                                style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: 'var(--text-link)', color: '#fff', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}
                            >
                                Apply Filters{activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ''}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const compactCell: React.CSSProperties = {
    padding: '6px 10px', color: 'var(--text-bright)', fontSize: '12px',
};
// filterSelectStyle removed 2026-05-13 when desktop inline filter dropdowns
// were replaced by the unified Filters sheet button.
const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)',
    marginBottom: '4px', textTransform: 'uppercase',
};
const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: '8px',
    border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box',
};
const outlineBtn: React.CSSProperties = {
    padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border-secondary)',
    backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px',
};
const primaryBtn: React.CSSProperties = {
    padding: '8px 18px', borderRadius: '8px', border: 'none',
    backgroundColor: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
};
const soLabel: React.CSSProperties = {
    display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
    marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em',
};
const soInput: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: '7px',
    border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box',
};
