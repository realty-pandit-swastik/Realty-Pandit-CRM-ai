import { useEffect, useState, useCallback, useRef } from 'react';
import { getDeals, getDealPipeline, updateDealStatus, getTeamMembersList, getDeal, getDealMatchCounts, getPartnerAssignable, assignDealToTeammate, type Deal, type DealPipelineStats } from '../api/client';
import client from '../api/client';
import { FilterSection, FilterTaxonomySection } from './filters/FilterSheetShared';
import type { TaxonomySelection } from './filters/FilterSheetShared';
import { useIsMobile } from '../hooks/useIsMobile';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { DealCloseCommissionDialog } from './DealCloseCommissionDialog';
import LogCallOverlay, { type CallOutcome, type CallEntryMode } from './deal/LogCallOverlay';
import QualifiedActionsModal, { type QualifiedActionMode } from './deal/QualifiedActionsModal';
import { DealWorkspace } from './deal/DealWorkspace';
import { AIStatusBadge } from './AIStatusBadge';
import { QuickCallStrip } from './QuickCallStrip';
import { toDialablePhone } from '../lib/phone';
import { InventoryQuickView } from './InventoryQuickView';
import { LogActionModal, type LogActionType } from './LogActionModal';
import CloseWonDialog from './deal/CloseWonDialog';

export const STAGES = ['NEW', 'QUALIFIED', 'VISIT_SCHEDULED', 'VISITED', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST', 'ON_HOLD'] as const;

export const STAGE_COLORS: Record<string, string> = {
    NEW: '#3b82f6',
    QUALIFIED: '#8b5cf6',
    VISIT_SCHEDULED: '#f59e0b',
    VISITED: '#06b6d4',
    NEGOTIATION: '#f97316',
    CLOSED_WON: '#22c55e',
    CLOSED_LOST: '#ef4444',
    ON_HOLD: '#6b7280',
    MATCHED: '#8b5cf6', // legacy
    MATCHING_APPOINTMENT: '#ec4899', // legacy
};

export const STAGE_LABELS: Record<string, string> = {
    NEW: 'New',
    QUALIFIED: 'Qualified',
    VISIT_SCHEDULED: 'Visit Scheduled',
    VISITED: 'Visited',
    NEGOTIATION: 'Negotiation',
    CLOSED_WON: 'Won',
    CLOSED_LOST: 'Lost',
    ON_HOLD: 'On Hold',
    MATCHED: 'Matched (Legacy)',
    MATCHING_APPOINTMENT: 'Booking Appt (Legacy)',
};

export const SCENARIO_LABELS: Record<string, string> = {
    PARTNER_INTERNAL: 'Partner + Internal',
    PARTNER_PARTNER: 'Partner + Partner',
    DIRECT_INTERNAL: 'Direct + Internal',
};

const SOURCE_BADGE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
    '99acres':        { label: '99acres',     bg: 'var(--tag-99acres-bg)',        text: 'var(--tag-99acres-text)' },
    'magicbricks':    { label: 'MagicBricks', bg: 'var(--tag-magicbricks-bg)',    text: 'var(--tag-magicbricks-text)' },
    'housing':        { label: 'Housing.com', bg: 'var(--tag-housing-bg)',         text: 'var(--tag-housing-text)' },
    'facebook':       { label: 'Facebook',    bg: 'var(--tag-facebook-bg)',        text: 'var(--tag-facebook-text)' },
    'website':        { label: 'Website',     bg: 'var(--tag-website-bg)',         text: 'var(--tag-website-text)' },
    'whatsapp':       { label: 'WhatsApp',    bg: 'var(--tag-whatsapp-bg)',        text: 'var(--tag-whatsapp-text)' },
    'manual':         { label: 'Manual',      bg: 'var(--tag-source-default-bg)', text: 'var(--tag-source-default-text)' },
    'other':          { label: 'Other',       bg: 'var(--tag-source-default-bg)', text: 'var(--tag-source-default-text)' },
    'partner_portal': { label: 'Partner',     bg: 'var(--tag-facebook-bg)',        text: 'var(--tag-facebook-text)' },
};

const renderSourceBadge = (source?: string) => {
    if (!source) return null;
    const cfg = SOURCE_BADGE_CONFIG[source.toLowerCase()] ?? {
        label: source, bg: 'var(--tag-source-default-bg)', text: 'var(--tag-source-default-text)',
    };
    return (
        <span style={{
            fontSize: '10px', padding: '2px 7px', borderRadius: '4px', fontWeight: 600,
            backgroundColor: cfg.bg, color: cfg.text, whiteSpace: 'nowrap',
        }}>
            {cfg.label}
        </span>
    );
};

interface DealPipelineProps {
    /** Deep link target (from ?deal=<id> in the URL, e.g. a Google Calendar/Task
     *  reminder link, or a lead-tile drill). When set, the matching deal detail
     *  opens automatically. One-shot: the owner must clear it via
     *  onInitialDealConsumed, otherwise every later mount re-opens the deal. */
    initialDealId?: string | null;
    /** Fired once the deep link has been acted on (deal opened or fetch failed),
     *  so the owner can clear it. */
    onInitialDealConsumed?: () => void;
}

export default function DealPipeline({ initialDealId, onInitialDealConsumed }: DealPipelineProps) {
    const isMobile = useIsMobile();
    const { showToast } = useToast();
    const { isPartner, isPartnerOwner } = useAuth();
    const [deals, setDeals] = useState<Deal[]>([]);
    const [matchCounts, setMatchCounts] = useState<Record<string, number>>({}); // dealId → quick match count (tile badge)
    const [pipeline, setPipeline] = useState<DealPipelineStats>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [filterScenario, setFilterScenario] = useState<string>('');
    const [filterMinPriority, setFilterMinPriority] = useState<string>('');
    const [filterSource, setFilterSource] = useState<string>('');
    const [filterIntent, setFilterIntent] = useState<string>('');
    const [filterCoordinatorId, setFilterCoordinatorId] = useState<string>('');
    const [filterTaxonomy, setFilterTaxonomy] = useState<TaxonomySelection>({ nodeIds: [], bhk: [] });
    const [taxonomyTree, setTaxonomyTree] = useState<any[]>([]);
    const [showFilterSheet, setShowFilterSheet] = useState(false);
    const [agentsList, setAgentsList] = useState<{ id: string; name: string }[]>([]);

    // T5 (2026-05-16): on PWA, the phone Back button used to pop the whole route
    // and jump to the dashboard while the filter sheet was open. Push a history
    // entry when the sheet opens and intercept popstate to just close it.
    useEffect(() => {
        if (!showFilterSheet) return;
        window.history.pushState({ rpFilterSheet: true }, '');
        const onPop = () => setShowFilterSheet(false);
        window.addEventListener('popstate', onPop);
        return () => {
            window.removeEventListener('popstate', onPop);
            // If the sheet was closed via UI (not Back), consume the history entry
            // we pushed so the next Back press behaves normally.
            if (window.history.state?.rpFilterSheet) window.history.back();
        };
    }, [showFilterSheet]);
    const [searchInput, setSearchInput] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState<string>('');
    // 2026-05-13: hide CLOSED_WON + CLOSED_LOST kanban columns by default to declutter the
    // daily-work view. Toggle reveals them. Stage filter dropdown still lets you pick them explicitly.
    const [showClosedDeals, setShowClosedDeals] = useState(false);
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
    const [partnerRoster, setPartnerRoster] = useState<Array<{ id: string; name: string; is_owner: boolean }>>([]);
    // busyRef pauses the 30s background refresh while any modal/form is open (kept in sync by an effect below). (2026-07-09)
    const busyRef = useRef(false);
    const [logCallDeal, setLogCallDeal] = useState<Deal | null>(null);
    // Phase 4 (2026-06-27): when a NEW-stage tile button opens the overlay pre-jumped to an outcome.
    const [logCallInitialOutcome, setLogCallInitialOutcome] = useState<CallOutcome | null>(null);
    // Guided 2-button entry (deal-workflow, 2026-06-29)
    const [logCallEntryMode, setLogCallEntryMode] = useState<CallEntryMode | null>(null);
    // QUALIFIED-stage guided actions (Reminder / Share) modal
    const [qualifiedAction, setQualifiedAction] = useState<{ deal: Deal; mode: QualifiedActionMode } | null>(null);
    const [dragDealId, setDragDealId] = useState<string | null>(null);
    // Commission entry dialog (post-close capture — middleman model 2026-04-17)
    const [commissionDealId, setCommissionDealId] = useState<string | null>(null);
    const [closeWonTarget, setCloseWonTarget] = useState<{ id: string; label?: string } | null>(null);
    const [closingWon, setClosingWon] = useState(false);
    // masterCategories was used to resolve legacy category_id → slug strings
    // for LogCallOverlay prefill. Phase 5 (2026-05-29) reads from canonical
    // demand_schema_values instead, so the master tree fetch is no longer
    // needed here. State retained as `_` to keep the existing useEffect harmless.
    const [, setMasterCategories] = useState<any[]>([]);

    // Ownership transfer state
    const [ownershipTransferDeal, setOwnershipTransferDeal] = useState<Deal | null>(null);
    const [transferPhone, setTransferPhone] = useState('');
    const [transferName, setTransferName] = useState('');
    const [transferReason, setTransferReason] = useState('');
    const [transferring, setTransferring] = useState(false);
    const [transferError, setTransferError] = useState('');
    const [transferSuccess, setTransferSuccess] = useState(false);
    const [transferContactResults, setTransferContactResults] = useState<{ phone_number: string; name: string | null }[]>([]);
    const [transferContactSearch, setTransferContactSearch] = useState('');
    const [transferContactSearching, setTransferContactSearching] = useState(false);
    const transferSearchTimer = useRef<any>(null);
    const [filteredTotal, setFilteredTotal] = useState(0); // true server-side total for the CURRENT filters (#7)
    // 2026-07-22: ordering now runs SERVER-side across the WHOLE filtered set (see listDeals).
    // Default = 'lead_date:desc' (Newest lead first) — owner request 2026-07-25. Other modes:
    // 'next_action' work queue (overdue → soonest reminder → newest no-reminder), reminder sorts.
    // Deliberately NOT persisted — a refresh always returns to this default (matches Ext. Leads).
    const [sortMode, setSortMode] = useState<string>('lead_date:desc');
    // "Load more" grows the server-side page size; the 30s silent refresh then re-fetches
    // everything already on screen in one correctly-ordered call.
    const PAGE_SIZE = 500;
    const [pageCount, setPageCount] = useState(1);

    const fetchData = useCallback(async (opts?: { silent?: boolean }) => {
        try {
            // Silent = background 30s poll: update data WITHOUT flipping the page-level loading state
            // (which would unmount + remount the whole board and reset the user's scroll). (#8, 2026-06-28)
            if (!opts?.silent) setLoading(true);
            const params: any = {};
            if (filterStatus) params.status = filterStatus;
            if (filterScenario) params.deal_scenario = filterScenario;
            if (filterMinPriority) params.min_priority = filterMinPriority;
            if (filterSource) params.source = filterSource;
            if (filterIntent) params.demand_intent = filterIntent;
            if (filterCoordinatorId) params.coordinator_agent_id = filterCoordinatorId;
            if (filterTaxonomy.nodeIds.length > 0) params.taxonomy_node_ids = filterTaxonomy.nodeIds.join(',');
            if (filterTaxonomy.bhk.length > 0) params.bhk = filterTaxonomy.bhk.join(',');
            if (searchQuery.trim()) params.search = searchQuery.trim();
            // Send hide_closed flag (server-side default is true, this just makes intent explicit)
            params.hide_closed = showClosedDeals ? 'false' : 'true';

            // Ordering is server-side (2026-07-22). sortMode encodes "key" or "key:direction".
            const [sKey, sDir] = sortMode.split(':');
            params.sort = sKey;
            if (sDir) params.direction = sDir;

            const [dealsRes, pipelineRes] = await Promise.all([
                getDeals({ ...params, limit: PAGE_SIZE * pageCount }),
                getDealPipeline(),
            ]);
            const loadedDeals = dealsRes.deals || [];
            setDeals(loadedDeals);
            setFilteredTotal(dealsRes.pagination?.total ?? loadedDeals.length);
            setPipeline(pipelineRes.data || {});
            setError(null);
            // Tile match-count badges — fire-and-forget so it never blocks the pipeline render.
            getDealMatchCounts(loadedDeals.map((d: any) => d.id)).then(setMatchCounts).catch(() => {});
        } catch (err: any) {
            setError(err?.response?.data?.error || err.message);
        } finally {
            if (!opts?.silent) setLoading(false);
        }
    }, [filterStatus, filterScenario, filterMinPriority, filterSource, filterIntent, filterCoordinatorId, filterTaxonomy, searchQuery, showClosedDeals, sortMode, pageCount]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Any change to filters / search / sort restarts paging at the first page, so a
    // previously-grown limit isn't carried into an unrelated result set.
    useEffect(() => { setPageCount(1); }, [filterStatus, filterScenario, filterMinPriority, filterSource, filterIntent, filterCoordinatorId, filterTaxonomy, searchQuery, showClosedDeals, sortMode]);

    // Deep link (?deal=<id>): open that deal's detail straight away. Used by the
    // Google Calendar/Task "call the new lead" reminder links (and lead-tile drills)
    // so the member lands on the exact deal without searching. One-shot per distinct
    // initialDealId — onInitialDealConsumed clears it in the owner so a later manual
    // visit to Deals (remount) does NOT re-open the stale deal.
    const consumedRef = useRef<string | null>(null);
    useEffect(() => {
        if (!initialDealId || consumedRef.current === initialDealId) return;
        consumedRef.current = initialDealId;
        onInitialDealConsumed?.();
        let cancelled = false;
        getDeal(initialDealId)
            // GET /api/deals/:id returns { success, data: deal } — unwrap, else deal.id is undefined
            // and the workspace fetches /deals/undefined/matched-inventory. (2026-06-28)
            .then((res: any) => { const d = res?.data ?? res; if (!cancelled && d?.id) setSelectedDeal(d); })
            .catch(() => { /* deleted/forbidden deal — stay on the pipeline list */ });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialDealId]);

    useEffect(() => {
        client.get('/public/master/categories')
            .then(r => setMasterCategories(Array.isArray(r.data) ? r.data : []))
            .catch(() => {});
    }, []);

    useEffect(() => {
        client.get('/public/taxonomy/tree')
            .then(r => setTaxonomyTree(r.data.tree || []))
            .catch(() => {});
    }, []);

    useEffect(() => {
        // Partners must never load the internal roster (it 403s for them, and its ids are Agent ids —
        // Agent FK columns. Their own sub-agents live in partnerRoster, kept separate on purpose).
        if (!isPartner) {
            getTeamMembersList().then(data => {
                const members = Array.isArray(data) ? data : [];
                setAgentsList(members.map((m: any) => ({ id: m.id, name: m.name })));
            }).catch(() => {});
        } else if (isPartnerOwner) {
            getPartnerAssignable().then(r => setPartnerRoster(r.members || [])).catch(() => {});
        }
    }, [isPartner, isPartnerOwner]);

    /** Assign a deal to one of the owner's own sub-agents (or unassign). Writes partner_assignee_id only. */
    const handleAssignDealTeammate = async (dealId: string, partnerAgentId: string) => {
        try {
            await assignDealToTeammate(dealId, partnerAgentId || null);
            const who = partnerRoster.find(m => m.id === partnerAgentId)?.name;
            showToast(partnerAgentId ? `Assigned to ${who}.` : 'Unassigned.', 'success');
            fetchData();
        } catch (e: any) {
            showToast(e.response?.data?.error || 'Could not assign this deal.', 'error');
        }
    };

    // Debounced search — updates searchQuery (which triggers fetchData) 400ms after last keystroke
    const handleSearchChange = (value: string) => {
        setSearchInput(value);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => setSearchQuery(value), 400);
    };

    // Auto-refresh every 30s — SILENT so it never flips the page loading state / remounts the board.
    // Skips while the user is working (a modal/form open) or the tab isn't focused, so it never
    // refreshes mid-action. (2026-07-09)
    useEffect(() => {
        const interval = setInterval(() => {
            if (busyRef.current || document.hidden) return;
            fetchData({ silent: true });
        }, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    // Push a history entry when deal detail opens so the phone back button closes it
    // instead of navigating to the previous page.
    useEffect(() => {
        if (!selectedDeal) return;
        window.history.pushState({ dealModal: selectedDeal.id }, '');
        const handler = () => setSelectedDeal(null);
        window.addEventListener('popstate', handler, { once: true });
        return () => window.removeEventListener('popstate', handler);
    }, [selectedDeal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const closeSelectedDeal = () => {
        if (window.history.state?.dealModal) {
            window.history.back(); // popstate handler above sets selectedDeal(null)
        } else {
            setSelectedDeal(null);
        }
    };

    const handleDragStart = (dealId: string) => {
        setDragDealId(dealId);
    };

    const handleDrop = async (newStatus: string) => {
        if (!dragDealId) return;
        // (NEG-2) Dropping into Won opens the price dialog so the agreed final_price is captured.
        if (newStatus === 'CLOSED_WON') {
            setCloseWonTarget({ id: dragDealId });
            setDragDealId(null);
            return;
        }
        try {
            await updateDealStatus(dragDealId, newStatus);
            await fetchData();
        } catch (err: any) {
            showToast(err?.response?.data?.error || 'Status change failed', 'error');
        }
        setDragDealId(null);
    };

    const confirmCloseWon = async (finalPrice?: number) => {
        if (!closeWonTarget) return;
        setClosingWon(true);
        try {
            await updateDealStatus(closeWonTarget.id, 'CLOSED_WON', undefined, finalPrice);
            await fetchData();
            setCloseWonTarget(null);
        } catch (err: any) {
            showToast(err?.response?.data?.error || 'Close failed', 'error');
        } finally { setClosingWon(false); }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    // Visit outcome form state
    const [visitOutcomeDeal, setVisitOutcomeDeal] = useState<Deal | null>(null);
    const [visitOutcome, setVisitOutcome] = useState('');
    const [visitInterestLevel, setVisitInterestLevel] = useState('');
    const [visitFeedback, setVisitFeedback] = useState('');
    const [visitUpdatedReqs, setVisitUpdatedReqs] = useState('');
    const [visitNotes, setVisitNotes] = useState('');
    const [visitSubmitting, setVisitSubmitting] = useState(false);

    // ON_HOLD revive state
    const [reviveDeal, setReviveDeal] = useState<Deal | null>(null);
    const [reviveStage, setReviveStage] = useState('');
    const [reviving, setReviving] = useState(false);

    // AI coordination — inventory quick view + manual action modal
    const [quickViewInventoryId, setQuickViewInventoryId] = useState<string | null>(null);
    const [logActionDeal, setLogActionDeal] = useState<Deal | null>(null);
    // Keep busyRef in sync — the 30s background poll skips while any of these modals/forms is open.
    useEffect(() => {
        busyRef.current = !!(selectedDeal || logCallDeal || qualifiedAction || commissionDealId || ownershipTransferDeal || visitOutcomeDeal || reviveDeal || logActionDeal);
    }, [selectedDeal, logCallDeal, qualifiedAction, commissionDealId, ownershipTransferDeal, visitOutcomeDeal, reviveDeal, logActionDeal]);
    const [logActionType, setLogActionType] = useState<LogActionType>('CALLED');

    const openLogAction = (deal: Deal, type: LogActionType, e: React.MouseEvent) => {
        e.stopPropagation();
        setLogActionDeal(deal);
        setLogActionType(type);
    };

    // Guided 2-button entry: open the overlay at the Answered / Not-answered sub-step.
    const openLogCallEntry = (deal: Deal, mode: CallEntryMode) => {
        setLogCallInitialOutcome(null);
        setLogCallEntryMode(mode);
        setLogCallDeal(deal);
    };

    // P7 (2026-07-01): guided loop for the later stages (VISIT_SCHEDULED / VISITED / NEGOTIATION) —
    // advance the deal's status, then immediately open the reminder modal so the member sets their
    // next self-task and the self-perpetuating chain keeps running (same pattern as NEW/QUALIFIED).
    const advanceAndRemind = async (deal: Deal, newStatus: string) => {
        try {
            await updateDealStatus(deal.id, newStatus as any);
            setQualifiedAction({ deal: { ...deal, status: newStatus } as Deal, mode: 'reminder' });
        } catch (err: any) {
            alert(err?.response?.data?.error || err.message);
        }
    };

    // Phase 4: NEW-stage tile action bar — 📞 Call + the 6 outcomes inline (replaces "Log My Call").
    // No-answer fires in one tap; the rest open the overlay pre-jumped to that outcome (Not-interested
    // & Wrong/spam require a note there and CLOSE the deal; Callback books a Google-synced reminder).
    const renderNewCallActions = (deal: Deal) => {
        const dial = toDialablePhone(deal.demand_contact?.phone_number);
        const cell = (label: string, color: 'blue'|'purple'|'amber'|'cyan'|'green'|'orange'|'gray'|'red', onClick: () => void) => (
            <button type="button" onClick={e => { e.stopPropagation(); onClick(); }}
                style={{ ...actionBtnStyle(color), fontSize: '11px', padding: '7px 6px', width: '100%' }}>
                {label}
            </button>
        );
        return (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {dial && (
                    <a href={`tel:${dial}`} onClick={e => e.stopPropagation()}
                        style={{ ...actionBtnStyle('blue'), width: '100%', textAlign: 'center', textDecoration: 'none', display: 'block', boxSizing: 'border-box' }}>
                        📞 Call {deal.demand_contact?.name || ''}
                    </a>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {cell('📞 Answered', 'green', () => openLogCallEntry(deal, 'answered'))}
                    {cell('📵 Not answered', 'gray', () => openLogCallEntry(deal, 'not_answered'))}
                </div>
            </div>
        );
    };

    const totalDeals = Object.values(pipeline).reduce((a, b) => a + b, 0);
    // #7 (2026-06-28): when a filter/search is active, the header total + per-stage counts come from the
    // FILTERED result so they reflect the filter; otherwise use the full (unfiltered) pipeline stats.
    const anyFilterActive = !!(searchQuery || filterStatus || filterTaxonomy.nodeIds.length || filterTaxonomy.bhk.length || filterScenario || filterMinPriority || filterSource || filterIntent || filterCoordinatorId);
    const stageCounts: Record<string, number> = anyFilterActive
        ? deals.reduce((acc: Record<string, number>, d: any) => { acc[d.status] = (acc[d.status] || 0) + 1; return acc; }, {})
        : pipeline;
    const displayTotal = anyFilterActive ? filteredTotal : totalDeals;
    // 2026-05-13: kanban columns. CLOSED_WON / CLOSED_LOST / ON_HOLD hidden by
    // default; toggling showClosedDeals reveals CLOSED_WON + CLOSED_LOST so the team
    // can review past outcomes without losing focus on active work.
    const activeStages = showClosedDeals
        ? STAGES.filter(s => s !== 'ON_HOLD')
        : STAGES.filter(s => s !== 'CLOSED_WON' && s !== 'CLOSED_LOST' && s !== 'ON_HOLD');

    // Ordering is SERVER-side as of 2026-07-22 (listDeals ranks the WHOLE filtered set, then pages).
    // The board used to re-sort here, but it could only ever reorder the rows already fetched — which
    // is why 86% of deals holding a reminder never appeared at all. Render in the order received.
    const getDealsForStage = (stage: string) => deals.filter(d => d.status === stage);

    // Flat Mobile + List views render every fetched row, so apply the same stage visibility the
    // kanban columns use — otherwise ON_HOLD / closed deals leak into them. When an explicit stage
    // filter is set the server already scoped the result, so pass it straight through.
    const visibleDeals = filterStatus ? deals : deals.filter(d => activeStages.includes(d.status as any));

    const formatBudget = (min?: number | null, max?: number | null) => {
        if (!min && !max) return '-';
        const fmt = (v: number) => v >= 10000000 ? `${(v / 10000000).toFixed(1)}Cr` : v >= 100000 ? `${(v / 100000).toFixed(1)}L` : `${(v / 1000).toFixed(0)}K`;
        if (min && max) return `${fmt(min)} - ${fmt(max)}`;
        if (max) return `Up to ${fmt(max)}`;
        return `${fmt(min!)}+`;
    };

    const getStageInfoLine = (deal: any): string | null => {
        const timeAgo = (d: string | Date) => {
            const ms = Date.now() - new Date(d).getTime();
            if (ms < 60000) return 'just now';
            if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
            if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`;
            return `${Math.floor(ms / 86400000)}d ago`;
        };
        switch (deal.status) {
            case 'NEW':
                return `🤖 AI calling... ${timeAgo(deal.updated_at)}`;
            case 'QUALIFIED':
                return deal.inventory
                    ? `🏘️ Matched: ${deal.inventory.type || 'Property'} · ${deal.inventory.location || ''}`
                    : `🏘️ Searching for match`;
            case 'VISIT_SCHEDULED': {
                const appt = deal.appointments?.[0];
                // A provisional 'requested' appointment carries a placeholder slot — show "awaiting slot",
                // not the placeholder time. A real booking (scheduled/confirmed) shows the date/time. (QUALIFIED-1)
                if (appt?.status === 'requested') return `🗓️ Visit requested · awaiting slot`;
                if (appt?.scheduled_at) {
                    const d = new Date(appt.scheduled_at);
                    return `✅ Visit booked: ${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
                }
                return `📅 Visit scheduled`;
            }
            case 'VISITED':
                return `🏠 Visit done — submit outcome`;
            case 'NEGOTIATION': {
                const days = Math.floor((Date.now() - new Date(deal.last_team_action_at ?? deal.updated_at).getTime()) / 86400000);
                const daysLeft = Math.max(0, 14 - days);
                return `⏱️ Last activity: ${days}d ago · ON_HOLD in ${daysLeft}d`;
            }
            default:
                return null;
        }
    };

    // Deal age (2026-06-26) — how long since the deal was created (created_at). Stale deals stand out
    // via colour: muted <7d, amber 7–13d, red ≥14d. Tooltip shows the exact creation date.
    const dealAge = (created: string | Date | undefined | null): { label: string; color: string; title: string } | null => {
        if (!created) return null;
        const t = new Date(created).getTime();
        if (Number.isNaN(t)) return null;
        const days = Math.floor((Date.now() - t) / 86400000);
        const label = days <= 0 ? 'today' : `${days}d`;
        const color = days >= 14 ? '#ef4444' : days >= 7 ? '#f59e0b' : 'var(--text-muted)';
        const createdStr = new Date(created).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const title = `Created ${createdStr} · ${days <= 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} old`}`;
        return { label, color, title };
    };

    const renderAgeChip = (deal: any) => {
        const a = dealAge(deal?.created_at);
        if (!a) return null;
        return (
            <span title={a.title} style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '2px 7px', borderRadius: 999, fontSize: '10px', fontWeight: 700,
                whiteSpace: 'nowrap', flexShrink: 0,
                backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)',
                color: a.color,
            }}>🕐 {a.label}</span>
        );
    };

    // Last REAL human action (from team_actions[0], the actual logged action) + stage-derived next action. (2026-06-26)
    const LAST_ACTION_LABEL: Record<string, string> = {
        CALL_LOGGED: '📞 Called', TRANSFER: '🔁 Reassigned',
        REMINDER_SET: '⏰ Reminder', REMINDER_GIVEN: '⏰ Reminder',
        SCHEDULED_VISIT: '🗓️ Visit set', CONFIRMED_VISIT: '🗓️ Visit set', VISIT_RESCHEDULED: '🗓️ Visit moved',
        MEETING_BOOKED: '🗓️ Meeting', WHATSAPPED: '💬 WhatsApp', LOGGED_NOTE: '📝 Note',
        PAUSED_AI: '⏯️ AI paused', RESUMED_AI: '⏯️ AI resumed',
    };
    const lastActionText = (deal: any): string | null => {
        const ta = deal?.team_actions?.[0];
        if (!ta) return null;
        const label = LAST_ACTION_LABEL[ta.action_type] || `📝 ${String(ta.action_type).replace(/_/g, ' ').toLowerCase()}`;
        const who = (ta.agent?.name || '').trim().split(' ')[0];
        const outcome = ta.outcome ? ` (${String(ta.outcome).replace(/_/g, ' ').toLowerCase()})` : '';
        // Exact date + time of the last action (user asked for date/time on the tile). e.g. "9 Jul, 2:30 pm"
        const when = new Date(ta.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
        return `👤 ${who ? who + ' · ' : ''}${label}${outcome} · ${when}`;
    };
    const nextActionText = (deal: any): string | null => {
        // Deal-workflow Phase 1 (2026-06-29): the member's own open follow-up reminder drives
        // "Next" when set — turning the pipeline into a self-driving worklist.
        if (deal?.next_reminder?.due_date) {
            const due = new Date(deal.next_reminder.due_date);
            const when = due.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
            return `Follow up · ${when}`;
        }
        switch (deal?.status) {
            case 'NEW': return 'Call & qualify';
            case 'QUALIFIED': return deal.inventory ? 'Schedule visit' : 'Share property';
            case 'MATCHING_APPOINTMENT': return 'Set appointment';
            case 'VISIT_SCHEDULED': return deal.appointments?.[0]?.status === 'requested' ? 'Confirm slot' : 'Remind & confirm visit';
            case 'VISITED': return 'Submit visit outcome';
            case 'NEGOTIATION': return 'Follow up to close';
            case 'ON_HOLD': return 'Revive / review';
            default: return null;
        }
    };
    const renderActivityLine = (deal: any) => {
        const last = lastActionText(deal);
        const next = nextActionText(deal);
        const noAns = Number(deal?.no_answer_count || 0);
        if (!last && !next && !noAns) return null;
        return (
            <div style={{ display: 'flex', justifyContent: last ? 'space-between' : 'flex-start', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '11px', marginBottom: '6px', lineHeight: 1.4 }}>
                {last && <span style={{ color: 'var(--text-secondary)' }}>{last}</span>}
                {noAns > 0 && <span style={{ color: noAns >= 4 ? '#f87171' : 'var(--text-muted)', whiteSpace: 'nowrap', fontWeight: 600 }} title={`${noAns} no-answer call${noAns === 1 ? '' : 's'} logged`}>📵 {noAns}× no answer</span>}
                {next && <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>➡️ Next: {next}</span>}
            </div>
        );
    };

    const actionBtnStyle = (variant: 'blue'|'purple'|'amber'|'cyan'|'green'|'orange'|'gray'|'red'): React.CSSProperties => {
        // 'red' variant added 2026-05-12 for the Close-as-Lost button. The other variants
        // map to design tokens; 'red' uses explicit colors because no --btn-red-* tokens exist.
        if (variant === 'red') {
            return {
                padding: '6px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 700,
                backgroundColor: 'rgba(239,68,68,0.10)',
                border: '1.5px solid rgba(239,68,68,0.45)',
                color: '#fca5a5',
                cursor: 'pointer', flex: 1,
                transition: 'background-color 150ms ease, border-color 150ms ease',
            };
        }
        return {
            padding: '6px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 700,
            backgroundColor: `var(--btn-${variant}-bg)`,
            border: `1.5px solid var(--btn-${variant}-border)`,
            color: `var(--btn-${variant}-text)`,
            cursor: 'pointer', flex: 1,
            transition: 'background-color 150ms ease, border-color 150ms ease',
        };
    };

    // Contact search for transfer modal
    useEffect(() => {
        if (transferContactSearch.trim().length < 2) { setTransferContactResults([]); return; }
        if (transferSearchTimer.current) clearTimeout(transferSearchTimer.current);
        transferSearchTimer.current = setTimeout(async () => {
            setTransferContactSearching(true);
            try {
                const res = await client.get('/api/leads/search', { params: { q: transferContactSearch.trim() } });
                setTransferContactResults(res.data || []);
            } catch { setTransferContactResults([]); }
            finally { setTransferContactSearching(false); }
        }, 400);
        return () => { if (transferSearchTimer.current) clearTimeout(transferSearchTimer.current); };
    }, [transferContactSearch]);

    const handleOwnershipTransfer = async () => {
        if (!ownershipTransferDeal || !transferPhone.trim()) return;
        setTransferring(true);
        setTransferError('');
        try {
            await client.post(`/inventory/${ownershipTransferDeal.inventory_id}/transfer-ownership`, {
                new_owner_phone: transferPhone,
                new_owner_name: transferName || undefined,
                reason: transferReason || undefined,
                transaction_id: ownershipTransferDeal.id,
            });
            setTransferSuccess(true);
        } catch (err: any) {
            setTransferError(err?.response?.data?.error || 'Failed to transfer ownership');
        } finally {
            setTransferring(false);
        }
    };

    const openTransferModal = (deal: Deal) => {
        setOwnershipTransferDeal(deal);
        setTransferPhone('');
        setTransferName('');
        setTransferReason('');
        setTransferError('');
        setTransferSuccess(false);
        setTransferContactSearch('');
        setTransferContactResults([]);
    };

    const openVisitOutcomeModal = (deal: Deal) => {
        setVisitOutcomeDeal(deal);
        setVisitOutcome('');
        setVisitInterestLevel('');
        setVisitFeedback('');
        setVisitUpdatedReqs('');
        setVisitNotes('');
    };

    const handleVisitOutcomeSubmit = async () => {
        if (!visitOutcomeDeal || !visitOutcome || !visitInterestLevel) return;
        setVisitSubmitting(true);
        try {
            await client.post(`/api/deals/${visitOutcomeDeal.id}/visit-outcome`, {
                outcome: visitOutcome,
                interest_level: visitInterestLevel,
                feedback: visitFeedback || undefined,
                updated_requirements: visitUpdatedReqs || undefined,
                notes: visitNotes || undefined,
            });
            showToast('Visit outcome submitted', 'success');
            setVisitOutcomeDeal(null);
            fetchData();
        } catch (err: any) {
            showToast(err?.response?.data?.error || 'Failed to submit visit outcome', 'error');
        } finally {
            setVisitSubmitting(false);
        }
    };

    const handleRevive = async () => {
        if (!reviveDeal || !reviveStage) return;
        setReviving(true);
        try {
            await updateDealStatus(reviveDeal.id, reviveStage);
            showToast('Deal revived', 'success');
            setReviveDeal(null);
            fetchData();
        } catch (err: any) {
            showToast(err?.response?.data?.error || 'Failed to revive deal', 'error');
        } finally {
            setReviving(false);
        }
    };

    const handleDispose = async (deal: Deal) => {
        if (!window.confirm('Close this deal as lost? This cannot be undone.')) return;
        try {
            await updateDealStatus(deal.id, 'CLOSED_LOST');
            showToast('Deal closed as lost', 'success');
            setReviveDeal(null);
            fetchData();
        } catch (err: any) {
            showToast(err?.response?.data?.error || 'Failed to close deal', 'error');
        }
    };

    return (
        <div style={{ padding: isMobile ? '16px' : '24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header — Row 1: Title + View Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: isMobile ? '18px' : '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Deal Pipeline</h2>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {searchQuery || filterStatus || filterTaxonomy.nodeIds.length > 0 || [filterScenario, filterMinPriority, filterSource, filterIntent, filterCoordinatorId].some(Boolean)
                            ? `${deals.length} result${deals.length !== 1 ? 's' : ''} (of ${displayTotal})`
                            : `${displayTotal} total deals`}
                    </p>
                </div>
                {/* View toggle — desktop only */}
                {!isMobile && (
                    <div style={{ display: 'flex', borderRadius: '8px', border: '1px solid var(--border-secondary)', overflow: 'hidden' }}>
                        <button onClick={() => setViewMode('kanban')} style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600, border: 'none', cursor: 'pointer', backgroundColor: viewMode === 'kanban' ? 'var(--accent-primary)' : 'var(--bg-secondary)', color: viewMode === 'kanban' ? '#fff' : 'var(--text-secondary)' }}>Kanban</button>
                        <button onClick={() => setViewMode('list')} style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600, border: 'none', cursor: 'pointer', backgroundColor: viewMode === 'list' ? 'var(--accent-primary)' : 'var(--bg-secondary)', color: viewMode === 'list' ? '#fff' : 'var(--text-secondary)' }}>List</button>
                    </div>
                )}
            </div>

            {/* Header — Row 2: Search + Stage + Filters */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '20px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                {/* Search bar */}
                <div style={{ position: 'relative', flex: 1, minWidth: isMobile ? '100%' : '220px' }}>
                    <span style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: 'var(--text-muted)', pointerEvents: 'none' }}>🔍</span>
                    <input
                        type="text"
                        placeholder="Search by name, phone, or address..."
                        value={searchInput}
                        onChange={e => handleSearchChange(e.target.value)}
                        style={{
                            width: '100%', padding: '9px 32px 9px 34px', borderRadius: '10px', fontSize: '13px',
                            border: searchQuery ? '1.5px solid var(--text-link)' : '1px solid var(--border-secondary)',
                            backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)',
                            outline: 'none', boxSizing: 'border-box',
                        }}
                    />
                    {searchInput && (
                        <button
                            type="button"
                            onClick={() => { setSearchInput(''); setSearchQuery(''); }}
                            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '16px', padding: '2px', lineHeight: 1 }}
                        >×</button>
                    )}
                </div>

                {/* Stage dropdown */}
                <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    style={{
                        padding: '9px 10px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, flexShrink: 0,
                        border: filterStatus ? `1.5px solid ${STAGE_COLORS[filterStatus]}` : '1px solid var(--border-secondary)',
                        backgroundColor: filterStatus ? STAGE_COLORS[filterStatus] + '15' : 'var(--bg-secondary)',
                        color: filterStatus ? STAGE_COLORS[filterStatus] : 'var(--text-primary)',
                        cursor: 'pointer',
                    }}
                >
                    <option value="">All Stages ({displayTotal})</option>
                    {STAGES.map(stage => (
                        <option key={stage} value={stage}>
                            {STAGE_LABELS[stage]} ({stageCounts[stage] || 0})
                        </option>
                    ))}
                </select>

                {/* Sort control (2026-07-22) — server-side ordering across ALL matching deals */}
                <select
                    value={sortMode}
                    onChange={e => setSortMode(e.target.value)}
                    title="Sort deals"
                    style={{
                        padding: '9px 12px', borderRadius: '10px', cursor: 'pointer', flexShrink: 0,
                        border: sortMode !== 'next_action' ? '1.5px solid var(--text-link)' : '1px solid var(--border-secondary)',
                        backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                        fontWeight: 600, fontSize: '13px', outline: 'none',
                    }}
                >
                    <option value="next_action">⚡ Work queue (default)</option>
                    <option value="lead_date:desc">🆕 Newest lead first</option>
                    <option value="lead_date:asc">🕰 Oldest lead first</option>
                    <option value="reminder_date:asc">⏰ Oldest reminder first</option>
                    <option value="reminder_date:desc">⏳ Latest reminder first</option>
                </select>

                {/* Filters button */}
                {(() => {
                    const activeCount = [filterScenario, filterMinPriority, filterSource, filterIntent, filterCoordinatorId].filter(Boolean).length + (filterTaxonomy.nodeIds.length || filterTaxonomy.bhk.length ? 1 : 0);
                    return (
                        <button
                            type="button"
                            onClick={() => setShowFilterSheet(true)}
                            style={{
                                padding: '9px 14px', borderRadius: '10px', cursor: 'pointer', flexShrink: 0,
                                border: activeCount > 0 ? '1.5px solid var(--text-link)' : '1px solid var(--border-secondary)',
                                backgroundColor: activeCount > 0 ? 'var(--text-link)' : 'var(--bg-secondary)',
                                color: activeCount > 0 ? '#fff' : 'var(--text-secondary)',
                                fontWeight: 600, fontSize: '13px',
                                display: 'flex', alignItems: 'center', gap: '6px',
                            }}
                        >
                            <span>⚙</span>
                            <span>Filters{activeCount > 0 ? ` (${activeCount})` : ''}</span>
                            {activeCount > 0 && (
                                <span style={{
                                    marginLeft: 2, padding: '1px 7px', borderRadius: 999,
                                    backgroundColor: 'rgba(255,255,255,0.25)', fontWeight: 700,
                                    fontSize: '12px',
                                }}>
                                    {deals.length} result{deals.length !== 1 ? 's' : ''}
                                </span>
                            )}
                        </button>
                    );
                })()}

                {/* 2026-05-13: show/hide Won + Lost columns */}
                <button
                    type="button"
                    onClick={() => setShowClosedDeals(v => !v)}
                    title={showClosedDeals ? 'Hide Won/Lost columns' : 'Show Won/Lost columns'}
                    style={{
                        padding: '9px 12px', borderRadius: '10px', cursor: 'pointer', flexShrink: 0,
                        border: '1px solid var(--border-secondary)',
                        backgroundColor: showClosedDeals ? 'var(--bg-tertiary, #1f2937)' : 'var(--bg-secondary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600, fontSize: '12px',
                        display: 'flex', alignItems: 'center', gap: '4px',
                    }}
                >
                    {showClosedDeals ? '👁 Hide closed' : '🗂 Show closed'}
                </button>
            </div>

            {error && (
                <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#fef2f2', color: '#dc2626', marginBottom: '12px', fontSize: '13px' }}>
                    {error}
                </div>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading deals...</div>
            ) : isMobile ? (
                /* Mobile Card List View */
                <div style={{ flex: 1, overflowY: 'auto' }}>
                        {/* Deal Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {deals.length === 0 ? (
                            <div className="empty-state">
                                <span className="empty-state__icon">🎯</span>
                                <p className="empty-state__title">No deals yet</p>
                                <p className="empty-state__body">Create your first deal to track it through the pipeline.</p>
                            </div>
                        ) : visibleDeals.map(deal => (
                            <div
                                key={deal.id}
                                onClick={() => setSelectedDeal(deal)}
                                style={{
                                    borderRadius: '12px', cursor: 'pointer',
                                    backgroundColor: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-secondary)',
                                    boxShadow: 'var(--card-shadow)',
                                    overflow: 'hidden',
                                }}
                            >
                                <div style={{ padding: '14px' }}>
                                {/* Top row: name + call button + stage badge + AI badge */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', flex: 1, marginRight: '8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span>{deal.demand_contact?.name || 'Unknown'}</span>
                                        {toDialablePhone(deal.demand_contact?.phone_number) && (
                                            <a
                                                href={`tel:${toDialablePhone(deal.demand_contact?.phone_number)}`}
                                                onClick={e => e.stopPropagation()}
                                                title={`Call ${toDialablePhone(deal.demand_contact?.phone_number)}`}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                    width: 22, height: 22, borderRadius: '50%',
                                                    backgroundColor: '#22c55e22', color: '#16a34a',
                                                    textDecoration: 'none', fontSize: 12, flexShrink: 0,
                                                }}
                                            >📞</a>
                                        )}
                                        {/* #6 (2026-07-01): call the referral partner directly from the tile (partner-referral
                                            deals have a PENDING placeholder customer phone, so the green call above is hidden). */}
                                        {toDialablePhone((deal.demand_contact as any)?.referral_partner_phone) && (
                                            <a
                                                href={`tel:${toDialablePhone((deal.demand_contact as any)?.referral_partner_phone)}`}
                                                onClick={e => e.stopPropagation()}
                                                title={`Call partner ${(deal.demand_contact as any)?.referral_partner_name || ''}`.trim()}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 3, height: 22, borderRadius: 11, padding: '0 8px', backgroundColor: '#8b5cf622', color: '#7c3aed', textDecoration: 'none', fontSize: 11, fontWeight: 600, flexShrink: 0 }}
                                            >🤝📞 {((deal.demand_contact as any)?.referral_partner_name || 'Partner').split(' ')[0]}</a>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                                        {renderAgeChip(deal)}
                                        {(deal as any).ai_status && <AIStatusBadge status={(deal as any).ai_status} />}
                                        <span style={{
                                            padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600,
                                            backgroundColor: STAGE_COLORS[deal.status] + '15',
                                            color: STAGE_COLORS[deal.status],
                                        }}>
                                            {STAGE_LABELS[deal.status] || deal.status}
                                        </span>
                                    </div>
                                </div>

                                {/* Intent + property type + location. Phase 5: legacy
                                    demand_property_type / demand_type_slug columns dropped —
                                    pull a label from canonical demand_schema_values when present. */}
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                    {(() => {
                                        const intentRaw = deal.demand_intent || (deal.type === 'RENT' ? 'rent' : 'buy');
                                        const intentLabel = intentRaw === 'rent' ? 'Rent' : 'Buy';
                                        const sv = ((deal as any).demand_schema_values
                                            ?? (deal.demand_contact as any)?.demand_schema_values
                                            ?? {}) as Record<string, any>;
                                        const propLabel = (typeof sv.property_type === 'string' && sv.property_type)
                                            || (typeof sv.type === 'string' && sv.type)
                                            || '';
                                        const loc = deal.demand_location || 'No location';
                                        return `${intentLabel}${propLabel ? ` · ${propLabel}` : ''} · ${loc}`;
                                    })()}
                                </div>

                                {/* Budget + quick match count */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: '6px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {formatBudget(deal.demand_budget_min, deal.demand_budget_max)}
                                    </span>
                                    {matchCounts[deal.id] != null && (
                                        <span title="Properties matching this budget & type (location not applied)" style={{
                                            fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap',
                                            backgroundColor: matchCounts[deal.id] > 0 ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.12)',
                                            color: matchCounts[deal.id] > 0 ? '#16a34a' : 'var(--text-muted)',
                                        }}>🏠 {matchCounts[deal.id]} match{matchCounts[deal.id] === 1 ? '' : 'es'}</span>
                                    )}
                                </div>

                                {/* Stage info line (AI activity) */}
                                {getStageInfoLine(deal) && (
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                        {getStageInfoLine(deal)}
                                    </div>
                                )}
                                {/* Last human action + next action */}
                                {renderActivityLine(deal)}

                                {/* Tags */}
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: 6 }}>
                                    {renderSourceBadge((deal as any).source)}
                                    {deal.deal_scenario && (
                                        <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', backgroundColor: 'var(--tag-blue-bg)', color: 'var(--tag-blue-text)', fontWeight: 600 }}>
                                            {SCENARIO_LABELS[deal.deal_scenario] || deal.deal_scenario}
                                        </span>
                                    )}
                                    {deal.coordinator?.name && (
                                        <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', backgroundColor: 'var(--tag-green-bg)', color: 'var(--tag-green-text)', fontWeight: 600 }}>
                                            {deal.coordinator.name}
                                        </span>
                                    )}
                                </div>

                                {/* PARTNER COMPANY OWNER — assign this deal to one of THEIR OWN sub-agents.
                                    stopPropagation: the card itself opens the deal workspace on click. */}
                                {isPartnerOwner && (
                                    <div style={{ marginBottom: 6 }} onClick={e => e.stopPropagation()}>
                                        <select
                                            value={(deal as any).partner_assignee_id || ''}
                                            onChange={e => handleAssignDealTeammate(deal.id, e.target.value)}
                                            style={{ width: '100%', fontSize: '11px', padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }}
                                            title="Assign to one of your team members"
                                        >
                                            <option value="">👤 Assign to teammate…</option>
                                            {partnerRoster.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                        </select>
                                    </div>
                                )}

                                {/* Tappable inventory preview */}
                                {deal.inventory && (
                                    <div
                                        style={{ marginBottom: 8, cursor: 'pointer' }}
                                        onClick={e => { e.stopPropagation(); setQuickViewInventoryId(deal.inventory!.id); }}
                                    >
                                        <div style={{ fontSize: '11px', color: '#60a5fa', textDecoration: 'underline' }}>
                                            📋 {(deal.inventory as any).type || 'Property'} · {(deal.inventory as any).location || ''} →
                                        </div>
                                    </div>
                                )}

                                {/* Action buttons — stage specific */}
                                {deal.status === 'NEW' && renderNewCallActions(deal)}
                                {deal.status === 'QUALIFIED' && (
                                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                                            <button type="button" onClick={e => { e.stopPropagation(); setQualifiedAction({ deal, mode: 'reminder' }); }} style={actionBtnStyle('cyan')}>⏰ Reminder</button>
                                            <button type="button" onClick={e => openLogAction(deal, 'SCHEDULED_VISIT', e)} style={actionBtnStyle('amber')}>📅 Visit</button>
                                            <button type="button" onClick={e => { e.stopPropagation(); setQualifiedAction({ deal, mode: 'share' }); }} style={actionBtnStyle('purple')}>📤 Share</button>
                                        </div>
                                        <button type="button" onClick={e => { e.stopPropagation(); handleDispose(deal); }}
                                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', alignSelf: 'flex-start', textDecoration: 'underline', padding: '2px 0' }}>
                                            Close as lost
                                        </button>
                                    </div>
                                )}
                                {/* P7 (2026-07-01): guided VISIT_SCHEDULED — advance→Visited / reschedule / next reminder. */}
                                {deal.status === 'VISIT_SCHEDULED' && (
                                    <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                                        <button type="button" onClick={e => { e.stopPropagation(); advanceAndRemind(deal, 'VISITED'); }} style={actionBtnStyle('green')}>✅ Visited</button>
                                        <button type="button" onClick={e => openLogAction(deal, 'SCHEDULED_VISIT', e)} style={actionBtnStyle('amber')}>📅 Reschedule</button>
                                        <button type="button" onClick={e => { e.stopPropagation(); setQualifiedAction({ deal, mode: 'reminder' }); }} style={actionBtnStyle('cyan')}>⏰ Reminder</button>
                                    </div>
                                )}
                                {/* P7: guided VISITED — move to negotiation / book a revisit / next reminder. */}
                                {deal.status === 'VISITED' && (
                                    <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                                        <button type="button" onClick={e => { e.stopPropagation(); advanceAndRemind(deal, 'NEGOTIATION'); }} style={actionBtnStyle('green')}>👍 Negotiate</button>
                                        <button type="button" onClick={e => openLogAction(deal, 'SCHEDULED_VISIT', e)} style={actionBtnStyle('amber')}>🔁 Revisit</button>
                                        <button type="button" onClick={e => { e.stopPropagation(); setQualifiedAction({ deal, mode: 'reminder' }); }} style={actionBtnStyle('cyan')}>⏰ Reminder</button>
                                    </div>
                                )}
                                {deal.status === 'NEGOTIATION' && (
                                    <>
                                        <button type="button" onClick={e => openLogAction(deal, 'MEETING_BOOKED', e)}
                                            style={{ ...actionBtnStyle('orange'), marginTop: 6, width: '100%' }}>
                                            📝 Log Update
                                        </button>
                                        <button type="button" onClick={e => { e.stopPropagation(); setQualifiedAction({ deal, mode: 'reminder' }); }}
                                            style={{ ...actionBtnStyle('cyan'), marginTop: 6, width: '100%' }}>
                                            ⏰ Set Reminder
                                        </button>
                                        <button type="button" onClick={e => { e.stopPropagation(); setCloseWonTarget({ id: deal.id, label: `${deal.demand_contact?.name ? deal.demand_contact.name + ' · ' : ''}Deal #${deal.id.slice(0, 8)}` }); }}
                                            style={{ ...actionBtnStyle('green'), marginTop: 6, width: '100%' }}>
                                            🏆 Close Won
                                        </button>
                                    </>
                                )}
                                {deal.status === 'ON_HOLD' && (
                                    <button type="button" onClick={e => { e.stopPropagation(); setReviveStage(''); setReviveDeal(deal); }}
                                        style={{ ...actionBtnStyle('gray'), marginTop: 6, width: '100%' }}>
                                        🔄 Review / Revive
                                    </button>
                                )}
                                {/* 2026-05-12: Close-as-Lost shortcut on every ACTIVE deal card.
                                    Previously the only way to lose a deal was drag-and-drop into
                                    a hidden LOST column or via the ON_HOLD revive modal — invisible
                                    affordance. Now: one click on the active card. */}
                                {(deal.status === 'VISIT_SCHEDULED' || deal.status === 'VISITED' ||
                                  deal.status === 'NEGOTIATION') && (
                                    <button type="button"
                                        onClick={e => { e.stopPropagation(); handleDispose(deal); }}
                                        style={{
                                            ...actionBtnStyle('red'), marginTop: 6, width: '100%',
                                            fontSize: '11px',
                                        }}
                                        title="Close this deal as Lost. Captures the reason in the deal timeline."
                                    >
                                        ❌ Close as Lost
                                    </button>
                                )}
                                {deal.status === 'CLOSED_WON' && (
                                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                        {deal.inventory_id && (
                                            <button type="button" onClick={e => { e.stopPropagation(); openTransferModal(deal); }}
                                                style={actionBtnStyle('green')}>
                                                🏠 Transfer
                                            </button>
                                        )}
                                        <button type="button" onClick={e => { e.stopPropagation(); setCommissionDealId(deal.id); }}
                                            style={actionBtnStyle('amber')}>
                                            ₹ Commissions
                                        </button>
                                    </div>
                                )}
                                </div>

                                {/* Quick call strip */}
                                <QuickCallStrip
                                    lead={deal.demand_contact ? { name: deal.demand_contact.name || '', phone: deal.demand_contact.phone_number || '' } : undefined}
                                    coordinator={deal.coordinator ? { name: deal.coordinator.name || '', phone: (deal.coordinator as any).phone || '' } : undefined}
                                    owner={deal.inventory ? { name: (deal.inventory as any).contact?.name || '', phone: (deal.inventory as any).owner_phone || '' } : undefined}
                                    keyHolder={deal.inventory ? { name: (deal.inventory as any).key_holder_name || '', phone: (deal.inventory as any).key_holder_phone || '' } : undefined}
                                    stage={deal.status}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            ) : viewMode === 'kanban' ? (
                /* Kanban View (desktop only) */
                <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', flex: 1, paddingBottom: '8px' }}>
                    {activeStages.map(stage => {
                        const stageDeals = getDealsForStage(stage);
                        return (
                            <div
                                key={stage}
                                onDrop={() => handleDrop(stage)}
                                onDragOver={handleDragOver}
                                style={{
                                    minWidth: '280px', width: '280px', flexShrink: 0,
                                    backgroundColor: 'var(--bg-secondary)', borderRadius: '12px',
                                    display: 'flex', flexDirection: 'column', maxHeight: '100%',
                                    border: '1px solid var(--column-border)',
                                }}
                            >
                                {/* Column Header */}
                                <div style={{
                                    padding: '12px 14px', borderBottom: `2px solid ${STAGE_COLORS[stage]}`,
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                }}>
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {STAGE_LABELS[stage]}
                                    </span>
                                    <span style={{
                                        fontSize: '11px', fontWeight: 600, color: STAGE_COLORS[stage],
                                        backgroundColor: STAGE_COLORS[stage] + '15', padding: '2px 8px', borderRadius: '10px',
                                    }}>
                                        {stageCounts[stage] || 0}
                                    </span>
                                </div>

                                {/* Cards */}
                                <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                                    {stageDeals.length === 0 && (
                                        <div className="empty-state" style={{ padding: '20px' }}>
                                            <span className="empty-state__icon" style={{ fontSize: '24px' }}>📋</span>
                                            <p className="empty-state__body">No deals in this stage</p>
                                        </div>
                                    )}
                                    {stageDeals.map(deal => (
                                        <div
                                            key={deal.id}
                                            draggable
                                            onDragStart={() => handleDragStart(deal.id)}
                                            onClick={() => setSelectedDeal(deal)}
                                            style={{
                                                marginBottom: '8px', borderRadius: '8px',
                                                backgroundColor: 'var(--bg-primary)', cursor: 'grab',
                                                border: '1px solid var(--border-secondary)',
                                                transition: 'box-shadow 0.2s', overflow: 'hidden',
                                                boxShadow: 'var(--card-shadow)',
                                            }}
                                            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = 'var(--card-shadow-hover)')}
                                            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'var(--card-shadow)')}

                                        >
                                            <div style={{ padding: '12px' }}>
                                            {/* Header row: name + call button + AI badge */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span>{deal.demand_contact?.name || 'Unknown'}</span>
                                                    {toDialablePhone(deal.demand_contact?.phone_number) && (
                                                        <a
                                                            href={`tel:${toDialablePhone(deal.demand_contact?.phone_number)}`}
                                                            onClick={e => e.stopPropagation()}
                                                            title={`Call ${toDialablePhone(deal.demand_contact?.phone_number)}`}
                                                            style={{
                                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                                width: 20, height: 20, borderRadius: '50%',
                                                                backgroundColor: '#22c55e22', color: '#16a34a',
                                                                textDecoration: 'none', fontSize: 11, flexShrink: 0,
                                                            }}
                                                        >📞</a>
                                                    )}
                                                    {/* #6 (2026-07-01): call the referral partner directly from the tile (mobile). */}
                                                    {toDialablePhone((deal.demand_contact as any)?.referral_partner_phone) && (
                                                        <a
                                                            href={`tel:${toDialablePhone((deal.demand_contact as any)?.referral_partner_phone)}`}
                                                            onClick={e => e.stopPropagation()}
                                                            title={`Call partner ${(deal.demand_contact as any)?.referral_partner_name || ''}`.trim()}
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, height: 20, borderRadius: 10, padding: '0 7px', backgroundColor: '#8b5cf622', color: '#7c3aed', textDecoration: 'none', fontSize: 10, fontWeight: 600, flexShrink: 0 }}
                                                        >🤝📞 {((deal.demand_contact as any)?.referral_partner_name || 'Partner').split(' ')[0]}</a>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                                                    {renderAgeChip(deal)}
                                                    {(deal as any).ai_status && (
                                                        <AIStatusBadge status={(deal as any).ai_status} />
                                                    )}
                                                </div>
                                            </div>

                                            {/* Property Type + Location. Phase 5: derive
                                                from canonical demand_schema_values; fall back
                                                to Transaction type if no label yet. */}
                                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                                {(() => {
                                                    const sv = ((deal as any).demand_schema_values
                                                        ?? (deal.demand_contact as any)?.demand_schema_values
                                                        ?? {}) as Record<string, any>;
                                                    const label = (typeof sv.property_type === 'string' && sv.property_type)
                                                        || (typeof sv.type === 'string' && sv.type)
                                                        || deal.type;
                                                    return `${label} · ${deal.demand_location || 'No location'}`;
                                                })()}
                                            </div>

                                            {/* Budget + quick match count */}
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: '6px' }}>
                                                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
                                                    {formatBudget(deal.demand_budget_min, deal.demand_budget_max)}
                                                </span>
                                                {matchCounts[deal.id] != null && (
                                                    <span title="Properties matching this budget & type (location not applied)" style={{
                                                        fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap',
                                                        backgroundColor: matchCounts[deal.id] > 0 ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.12)',
                                                        color: matchCounts[deal.id] > 0 ? '#16a34a' : 'var(--text-muted)',
                                                    }}>🏠 {matchCounts[deal.id]} match{matchCounts[deal.id] === 1 ? '' : 'es'}</span>
                                                )}
                                            </div>

                                            {/* Stage-specific info line (AI activity) */}
                                            {getStageInfoLine(deal) && (
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', lineHeight: 1.4 }}>
                                                    {getStageInfoLine(deal)}
                                                </div>
                                            )}
                                            {/* Last human action + next action */}
                                            {renderActivityLine(deal)}

                                            {/* Tags Row */}
                                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                {renderSourceBadge((deal as any).source)}
                                                {deal.deal_scenario && (
                                                    <span style={{
                                                        fontSize: '10px', padding: '2px 7px', borderRadius: '4px',
                                                        backgroundColor: 'var(--tag-blue-bg)', color: 'var(--tag-blue-text)', fontWeight: 600,
                                                    }}>
                                                        {SCENARIO_LABELS[deal.deal_scenario] || deal.deal_scenario}
                                                    </span>
                                                )}
                                                {deal.coordinator?.name && (
                                                    <span style={{
                                                        fontSize: '10px', padding: '2px 7px', borderRadius: '4px',
                                                        backgroundColor: 'var(--tag-green-bg)', color: 'var(--tag-green-text)', fontWeight: 600,
                                                    }}>
                                                        {deal.coordinator.name}
                                                    </span>
                                                )}
                                            </div>

                                            {/* PARTNER COMPANY OWNER — assign to one of THEIR OWN sub-agents.
                                                stopPropagation: the tile itself opens the deal workspace. */}
                                            {isPartnerOwner && (
                                                <div style={{ marginBottom: 6 }} onClick={e => e.stopPropagation()}>
                                                    <select
                                                        value={(deal as any).partner_assignee_id || ''}
                                                        onChange={e => handleAssignDealTeammate(deal.id, e.target.value)}
                                                        style={{ width: '100%', fontSize: '11px', padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }}
                                                        title="Assign to one of your team members"
                                                    >
                                                        <option value="">👤 Assign to teammate…</option>
                                                        {partnerRoster.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                                    </select>
                                                </div>
                                            )}

                                            {/* Tappable property preview */}
                                            {deal.inventory && (
                                                <div
                                                    style={{ marginTop: '8px', cursor: 'pointer' }}
                                                    onClick={e => { e.stopPropagation(); setQuickViewInventoryId(deal.inventory!.id); }}
                                                    title="Tap to view property details"
                                                >
                                                    {deal.inventory.media_urls?.[0] && (
                                                        <div style={{ borderRadius: '6px', overflow: 'hidden', height: '60px', marginBottom: 4 }}>
                                                            <img src={deal.inventory.media_urls[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        </div>
                                                    )}
                                                    <div style={{ fontSize: '11px', color: '#60a5fa', textDecoration: 'underline' }}>
                                                        📋 {(deal.inventory as any).type || 'Property'} · {(deal.inventory as any).location || ''} →
                                                    </div>
                                                </div>
                                            )}

                                            {/* Action buttons */}
                                            {deal.status === 'NEW' && renderNewCallActions(deal)}
                                            {deal.status === 'QUALIFIED' && (
                                                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                                                        <button type="button" onClick={e => { e.stopPropagation(); setQualifiedAction({ deal, mode: 'reminder' }); }} style={actionBtnStyle('cyan')}>⏰ Reminder</button>
                                                        <button type="button" onClick={e => openLogAction(deal, 'SCHEDULED_VISIT', e)} style={actionBtnStyle('amber')}>📅 Visit</button>
                                                        <button type="button" onClick={e => { e.stopPropagation(); setQualifiedAction({ deal, mode: 'share' }); }} style={actionBtnStyle('purple')}>📤 Share</button>
                                                    </div>
                                                    <button type="button" onClick={e => { e.stopPropagation(); handleDispose(deal); }}
                                                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', alignSelf: 'flex-start', textDecoration: 'underline', padding: '2px 0' }}>
                                                        Close as lost
                                                    </button>
                                                </div>
                                            )}
                                            {/* P7 (2026-07-01): guided VISIT_SCHEDULED (mobile). */}
                                            {deal.status === 'VISIT_SCHEDULED' && (
                                                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                                                    <button type="button" onClick={e => { e.stopPropagation(); advanceAndRemind(deal, 'VISITED'); }} style={actionBtnStyle('green')}>✅ Visited</button>
                                                    <button type="button" onClick={e => openLogAction(deal, 'SCHEDULED_VISIT', e)} style={actionBtnStyle('amber')}>📅 Reschedule</button>
                                                    <button type="button" onClick={e => { e.stopPropagation(); setQualifiedAction({ deal, mode: 'reminder' }); }} style={actionBtnStyle('cyan')}>⏰ Reminder</button>
                                                </div>
                                            )}
                                            {/* P7: guided VISITED (mobile). */}
                                            {deal.status === 'VISITED' && (
                                                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                                                    <button type="button" onClick={e => { e.stopPropagation(); advanceAndRemind(deal, 'NEGOTIATION'); }} style={actionBtnStyle('green')}>👍 Negotiate</button>
                                                    <button type="button" onClick={e => openLogAction(deal, 'SCHEDULED_VISIT', e)} style={actionBtnStyle('amber')}>🔁 Revisit</button>
                                                    <button type="button" onClick={e => { e.stopPropagation(); setQualifiedAction({ deal, mode: 'reminder' }); }} style={actionBtnStyle('cyan')}>⏰ Reminder</button>
                                                </div>
                                            )}
                                            {deal.status === 'NEGOTIATION' && (
                                                <>
                                                    <button type="button" onClick={e => openLogAction(deal, 'MEETING_BOOKED', e)}
                                                        style={{ ...actionBtnStyle('orange'), marginTop: 8, width: '100%' }}>
                                                        📝 Log Update
                                                    </button>
                                                    <button type="button" onClick={e => { e.stopPropagation(); setQualifiedAction({ deal, mode: 'reminder' }); }}
                                                        style={{ ...actionBtnStyle('cyan'), marginTop: 8, width: '100%' }}>
                                                        ⏰ Set Reminder
                                                    </button>
                                                    <button type="button" onClick={e => { e.stopPropagation(); setCloseWonTarget({ id: deal.id, label: `${deal.demand_contact?.name ? deal.demand_contact.name + ' · ' : ''}Deal #${deal.id.slice(0, 8)}` }); }}
                                                        style={{ ...actionBtnStyle('green'), marginTop: 8, width: '100%' }}>
                                                        🏆 Close Won
                                                    </button>
                                                </>
                                            )}
                                            {deal.status === 'ON_HOLD' && (
                                                <button type="button" onClick={e => { e.stopPropagation(); setReviveStage(''); setReviveDeal(deal); }}
                                                    style={{ ...actionBtnStyle('gray'), marginTop: 8, width: '100%' }}>
                                                    🔄 Review / Revive
                                                </button>
                                            )}
                                            {deal.status === 'CLOSED_WON' && (
                                                <button type="button" onClick={e => { e.stopPropagation(); setCommissionDealId(deal.id); }}
                                                    style={{ ...actionBtnStyle('amber'), marginTop: 8, width: '100%' }}>
                                                    ₹ Record Commissions
                                                </button>
                                            )}
                                            {(deal.status === 'VISIT_SCHEDULED' || deal.status === 'VISITED' ||
                                              deal.status === 'NEGOTIATION') && (
                                                <button type="button"
                                                    onClick={e => { e.stopPropagation(); handleDispose(deal); }}
                                                    style={{ ...actionBtnStyle('red'), marginTop: 8, width: '100%', fontSize: '11px' }}
                                                    title="Close this deal as Lost. Captures the reason in the deal timeline."
                                                >
                                                    ❌ Close as Lost
                                                </button>
                                            )}
                                            </div>

                                            {/* Quick call strip — outside padding div so it goes full width */}
                                            <QuickCallStrip
                                                lead={deal.demand_contact ? { name: deal.demand_contact.name || '', phone: deal.demand_contact.phone_number || '' } : undefined}
                                                coordinator={deal.coordinator ? { name: deal.coordinator.name || '', phone: (deal.coordinator as any).phone || '' } : undefined}
                                                owner={deal.inventory ? { name: (deal.inventory as any).contact?.name || '', phone: (deal.inventory as any).owner_phone || '' } : undefined}
                                                keyHolder={deal.inventory ? { name: (deal.inventory as any).key_holder_name || '', phone: (deal.inventory as any).key_holder_phone || '' } : undefined}
                                                stage={deal.status}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* List View (desktop only) */
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border-secondary)' }}>
                                {['Customer', 'Type', 'Location', 'Budget', 'Status', 'Scenario', 'Coordinator', 'Updated'].map(h => (
                                    <th key={h} style={{ padding: '10px 8px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {visibleDeals.map(deal => (
                                <tr
                                    key={deal.id}
                                    onClick={() => setSelectedDeal(deal)}
                                    style={{ borderBottom: '1px solid var(--border-secondary)', cursor: 'pointer' }}
                                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                >
                                    <td style={{ padding: '10px 8px', fontWeight: 500 }}>{deal.demand_contact?.name || 'Unknown'}</td>
                                    <td style={{ padding: '10px 8px' }}>{deal.type}</td>
                                    <td style={{ padding: '10px 8px' }}>{deal.demand_location || '-'}</td>
                                    <td style={{ padding: '10px 8px' }}>{formatBudget(deal.demand_budget_min, deal.demand_budget_max)}</td>
                                    <td style={{ padding: '10px 8px' }}>
                                        <span style={{
                                            padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                                            backgroundColor: STAGE_COLORS[deal.status] + '15',
                                            color: STAGE_COLORS[deal.status],
                                        }}>
                                            {STAGE_LABELS[deal.status] || deal.status}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 8px', fontSize: '11px' }}>
                                        {SCENARIO_LABELS[deal.deal_scenario || ''] || '-'}
                                    </td>
                                    <td style={{ padding: '10px 8px' }}>{deal.coordinator?.name || '-'}</td>
                                    <td style={{ padding: '10px 8px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                                        {new Date(deal.updated_at).toLocaleDateString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {deals.length === 0 && (
                        <div className="empty-state">
                            <span className="empty-state__icon">🎯</span>
                            <p className="empty-state__title">No deals found</p>
                            <p className="empty-state__body">Create your first deal to track it through the pipeline.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Load more (2026-07-22): the server ranks ALL matching deals; this grows the window. */}
            {!loading && deals.length > 0 && deals.length < filteredTotal && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '14px 0' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Showing {deals.length} of {filteredTotal}
                    </span>
                    <button
                        type="button"
                        onClick={() => setPageCount(c => c + 1)}
                        style={{
                            padding: '9px 18px', borderRadius: '10px', cursor: 'pointer',
                            border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
                            color: 'var(--text-primary)', fontWeight: 600, fontSize: '13px',
                        }}
                    >
                        Load more (+{Math.min(PAGE_SIZE, filteredTotal - deals.length)})
                    </button>
                </div>
            )}

            {/* Deal Workspace */}
            {selectedDeal && (
                <DealWorkspace
                    deal={selectedDeal}
                    stageColors={STAGE_COLORS}
                    stageLabels={STAGE_LABELS}
                    scenarioLabels={SCENARIO_LABELS}
                    onClose={closeSelectedDeal}
                    onRefresh={fetchData}
                    onDealUpdated={async () => {
                        // After an in-session requirements edit, re-fetch the open deal so sibling
                        // tabs (Match & Share remounts on switch) read the fresh requirements.
                        // GET /api/deals/:id returns { success, data: deal } — unwrap to the deal.
                        if (!selectedDeal) return;
                        const res: any = await getDeal(selectedDeal.id).catch(() => null);
                        const fresh = res?.data ?? res;
                        if (fresh?.id) setSelectedDeal(fresh);
                    }}
                    onLogCall={d => setLogCallDeal(d)}
                    onVisitOutcome={openVisitOutcomeModal}
                    onRevive={d => { setReviveStage(''); setReviveDeal(d); }}
                    onTransfer={() => { /* future: open transfer dialog */ }}
                />
            )}

            {/* Inventory Quick View slide-up panel */}
            {quickViewInventoryId && (
                <InventoryQuickView
                    inventoryId={quickViewInventoryId}
                    onClose={() => setQuickViewInventoryId(null)}
                />
            )}

            {/* Log Manual Action Modal */}
            {logActionDeal && (
                <LogActionModal
                    dealId={logActionDeal.id}
                    stage={logActionDeal.status}
                    actionType={logActionType}
                    deal={logActionDeal}
                    onClose={() => setLogActionDeal(null)}
                    onSuccess={() => { setLogActionDeal(null); fetchData(); }}
                />
            )}

            {/* Stage 1 NEW — Log Call workflow (the only path to QUALIFIED) */}
            {logCallDeal && (
                <LogCallOverlay
                    dealId={logCallDeal.id}
                    deal={logCallDeal}
                    contactName={logCallDeal.demand_contact?.name || ''}
                    contactPhone={logCallDeal.demand_contact?.phone_number || ''}
                    isMobile={isMobile}
                    initialRequirements={(() => {
                        // Phase 5 (2026-05-29): legacy demand_bedrooms /
                        // demand_type_slug / demand_property_type / demand_main_category
                        // / demand_category / demand_amenities columns dropped.
                        // Derive BHK + amenities from canonical demand_schema_values
                        // so the LogCallOverlay's form pre-fills correctly.
                        const dc = logCallDeal.demand_contact as any;
                        const canonicalSV = ((logCallDeal as any).demand_schema_values
                            ?? dc?.demand_schema_values ?? {}) as Record<string, any>;
                        const bhkRaw = canonicalSV.bhk;
                        const demandBhkInt: number | null = (() => {
                            if (typeof bhkRaw === 'string') {
                                const m = bhkRaw.match(/\d+/);
                                return m ? parseInt(m[0], 10) : null;
                            }
                            if (typeof bhkRaw === 'number') return bhkRaw;
                            return null;
                        })();
                        const canonicalAmenities = Array.isArray(canonicalSV.amenities)
                            ? canonicalSV.amenities as string[] : [];
                        return {
                            intent: logCallDeal.demand_intent || 'buy',
                            preferred_location: logCallDeal.demand_location || '',
                            budget_min: logCallDeal.demand_budget_min ?? dc?.budget_min ?? null,
                            budget_max: logCallDeal.demand_budget_max ?? dc?.budget_max ?? null,
                            demand_bhk: demandBhkInt,
                            demand_type_slug: '',
                            demand_main_category: '',
                            demand_category: null,
                            demand_amenities: canonicalAmenities,
                            timeline: dc?.timeline || '',
                            area_min: (logCallDeal as any).area_min ?? dc?.area_min ?? null,
                            area_max: (logCallDeal as any).area_max ?? dc?.area_max ?? null,
                            area_unit: dc?.area_unit || 'sqft',
                            // Carry canonical SoT through so the form opens pre-selected
                            // on the right taxonomy node + dynamic field values.
                            demand_taxonomy_node_id: (logCallDeal as any).demand_taxonomy_node_id
                                ?? dc?.demand_taxonomy_node_id ?? null,
                            demand_schema_values: canonicalSV,
                        };
                    })()}
                    initialOutcome={logCallInitialOutcome}
                    entryMode={logCallEntryMode}
                    noAnswerCount={(logCallDeal as any).no_answer_count || 0}
                    agents={agentsList}
                    onClose={() => { setLogCallDeal(null); setLogCallInitialOutcome(null); setLogCallEntryMode(null); }}
                    onSuccess={() => { setLogCallDeal(null); setLogCallInitialOutcome(null); setLogCallEntryMode(null); fetchData(); showToast('Saved', 'success'); }}
                />
            )}

            {/* QUALIFIED-stage guided actions (Reminder / Share) */}
            {qualifiedAction && (
                <QualifiedActionsModal
                    dealId={qualifiedAction.deal.id}
                    deal={qualifiedAction.deal}
                    contactName={qualifiedAction.deal.demand_contact?.name || qualifiedAction.deal.demand_contact?.phone_number || 'the client'}
                    noAnswerCount={(qualifiedAction.deal as any).no_answer_count || 0}
                    agents={agentsList}
                    mode={qualifiedAction.mode}
                    onClose={() => setQualifiedAction(null)}
                    onSuccess={() => { setQualifiedAction(null); fetchData(); showToast('Saved', 'success'); }}
                />
            )}

            {/* Commission entry dialog (post-close manual capture) */}
            {commissionDealId && (
                <DealCloseCommissionDialog
                    dealId={commissionDealId}
                    onClose={() => setCommissionDealId(null)}
                    onSuccess={() => fetchData()}
                />
            )}

            <CloseWonDialog
                open={!!closeWonTarget}
                dealLabel={closeWonTarget?.label}
                submitting={closingWon}
                onConfirm={confirmCloseWon}
                onClose={() => setCloseWonTarget(null)}
            />

            {/* Ownership Transfer Modal */}
            {ownershipTransferDeal && (
                <div
                    style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseDown={e => { if (e.target === e.currentTarget && !transferring) setOwnershipTransferDeal(null); }}
                >
                    <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: '14px', padding: '24px', width: '440px', maxWidth: '90vw' }}>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                            🏠 Transfer Property Ownership
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                            Deal #{ownershipTransferDeal.id.slice(0, 8)} · Inventory {ownershipTransferDeal.inventory_id?.slice(0, 8)}
                        </div>

                        {transferSuccess ? (
                            <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
                                <div style={{ fontSize: '15px', fontWeight: 700, color: '#22c55e', marginBottom: '8px' }}>Ownership Transferred!</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                                    Property now belongs to {transferName || transferPhone}. Audit log created.
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setOwnershipTransferDeal(null)}
                                    style={{ padding: '10px 24px', borderRadius: '8px', fontWeight: 700, backgroundColor: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer' }}
                                >Done</button>
                            </div>
                        ) : (
                            <>
                                <div style={{ marginBottom: '14px' }}>
                                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                                        New Owner — Search Contact
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Search by name or phone..."
                                        value={transferContactSearch}
                                        onChange={e => setTransferContactSearch(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                    {transferContactSearching && <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '4px 0' }}>Searching...</div>}
                                    {transferContactResults.map(c => (
                                        <div
                                            key={c.phone_number}
                                            onClick={() => { setTransferPhone(c.phone_number); setTransferName(c.name || ''); setTransferContactSearch(''); setTransferContactResults([]); }}
                                            style={{ padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', margin: '4px 0', backgroundColor: 'var(--bg-secondary)', display: 'flex', gap: '10px', alignItems: 'center' }}
                                        >
                                            <div style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: 'rgba(34,197,94,0.12)', color: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', flexShrink: 0 }}>
                                                {(c.name || c.phone_number)[0].toUpperCase()}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '13px', fontWeight: 600 }}>{c.name || 'Unknown'}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.phone_number}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>New Owner Phone *</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. 9876543210"
                                        value={transferPhone}
                                        onChange={e => setTransferPhone(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', border: transferPhone ? '1.5px solid #22c55e' : '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                </div>

                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>New Owner Name (optional)</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Rajesh Kumar"
                                        value={transferName}
                                        onChange={e => setTransferName(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                </div>

                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Reason (optional)</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Sold via Realty Pandit, Deal #12"
                                        value={transferReason}
                                        onChange={e => setTransferReason(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                </div>

                                <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', marginBottom: '16px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                                    <strong style={{ color: '#3b82f6' }}>What happens:</strong> The inventory ownership will be reassigned to the new contact. The previous owner's record is preserved. An audit log entry is created. The new contact will appear as BUYER in the system.
                                </div>

                                {transferError && (
                                    <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '12px', marginBottom: '12px' }}>
                                        {transferError}
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setOwnershipTransferDeal(null)}
                                        disabled={transferring}
                                        style={{ flex: 1, padding: '10px', borderRadius: '8px', fontWeight: 600, border: '1px solid var(--border-secondary)', backgroundColor: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
                                    >Cancel</button>
                                    <button
                                        type="button"
                                        onClick={handleOwnershipTransfer}
                                        disabled={transferring || !transferPhone.trim()}
                                        style={{ flex: 2, padding: '10px', borderRadius: '8px', fontWeight: 700, backgroundColor: !transferPhone.trim() ? 'var(--bg-secondary)' : '#22c55e', color: !transferPhone.trim() ? 'var(--text-muted)' : '#fff', border: 'none', cursor: !transferPhone.trim() ? 'not-allowed' : 'pointer', opacity: transferring ? 0.7 : 1 }}
                                    >{transferring ? 'Transferring...' : '🏠 Confirm Transfer'}</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
            {/* Visit Outcome Modal — shown when lead manager submits visit result */}
            {visitOutcomeDeal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseDown={e => { if (e.target === e.currentTarget && !visitSubmitting) setVisitOutcomeDeal(null); }}>
                    <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: '14px', padding: '24px', width: '460px', maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto' }}>
                        <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>Submit Visit Outcome</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                            {visitOutcomeDeal.demand_contact?.name} · Deal #{visitOutcomeDeal.id.slice(0, 8)}
                        </div>

                        <div style={{ marginBottom: '14px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Outcome *</label>
                            <select value={visitOutcome} onChange={e => setVisitOutcome(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}>
                                <option value="">Select outcome</option>
                                <option value="Property Liked">Property Liked</option>
                                <option value="Want More Properties">Want More Properties</option>
                                <option value="Re-match Required">Re-match Required</option>
                                <option value="No Show">No Show</option>
                            </select>
                        </div>

                        <div style={{ marginBottom: '14px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Client Interest Level *</label>
                            <select value={visitInterestLevel} onChange={e => setVisitInterestLevel(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}>
                                <option value="">Select level</option>
                                <option value="Hot">Hot</option>
                                <option value="Warm">Warm</option>
                                <option value="Cold">Cold</option>
                            </select>
                        </div>

                        <div style={{ marginBottom: '14px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Property Feedback (optional)</label>
                            <textarea value={visitFeedback} onChange={e => setVisitFeedback(e.target.value)} placeholder="What did client say about the property..."
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', resize: 'vertical', minHeight: '70px', boxSizing: 'border-box' }} />
                        </div>

                        <div style={{ marginBottom: '14px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Updated Requirements (optional)</label>
                            <textarea value={visitUpdatedReqs} onChange={e => setVisitUpdatedReqs(e.target.value)} placeholder="Any change in location, BHK, budget..."
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', resize: 'vertical', minHeight: '60px', boxSizing: 'border-box' }} />
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Follow-up Notes (optional)</label>
                            <textarea value={visitNotes} onChange={e => setVisitNotes(e.target.value)} placeholder="Instructions for AI next steps..."
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', resize: 'vertical', minHeight: '60px', boxSizing: 'border-box' }} />
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => setVisitOutcomeDeal(null)} disabled={visitSubmitting}
                                style={{ flex: 1, padding: '10px', borderRadius: '8px', fontWeight: 600, border: '1px solid var(--border-secondary)', backgroundColor: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button onClick={handleVisitOutcomeSubmit} disabled={visitSubmitting || !visitOutcome || !visitInterestLevel}
                                style={{ flex: 2, padding: '10px', borderRadius: '8px', fontWeight: 700, backgroundColor: (!visitOutcome || !visitInterestLevel) ? 'var(--bg-secondary)' : '#06b6d4', color: (!visitOutcome || !visitInterestLevel) ? 'var(--text-muted)' : '#fff', border: 'none', cursor: (!visitOutcome || !visitInterestLevel) ? 'not-allowed' : 'pointer', opacity: visitSubmitting ? 0.7 : 1 }}>
                                {visitSubmitting ? 'Submitting...' : 'Submit Outcome'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ON_HOLD Revive / Dispose Modal */}
            {reviveDeal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseDown={e => { if (e.target === e.currentTarget && !reviving) setReviveDeal(null); }}>
                    <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: '14px', padding: '24px', width: '420px', maxWidth: '90vw' }}>
                        <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>Deal on Hold</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                            {reviveDeal.demand_contact?.name} · Deal #{reviveDeal.id.slice(0, 8)}
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>Revive — Move to Stage</label>
                            <select value={reviveStage} onChange={e => setReviveStage(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}>
                                <option value="">Select destination stage</option>
                                <option value="NEW">New</option>
                                <option value="QUALIFIED">Qualified</option>
                                <option value="VISIT_SCHEDULED">Visit Scheduled</option>
                                <option value="VISITED">Visited</option>
                                <option value="NEGOTIATION">Negotiation</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => setReviveDeal(null)} disabled={reviving}
                                style={{ flex: 1, padding: '10px', borderRadius: '8px', fontWeight: 600, border: '1px solid var(--border-secondary)', backgroundColor: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button onClick={() => handleDispose(reviveDeal)} disabled={reviving}
                                style={{ flex: 1, padding: '10px', borderRadius: '8px', fontWeight: 700, backgroundColor: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', cursor: 'pointer' }}>
                                Dispose (Lost)
                            </button>
                            <button onClick={handleRevive} disabled={reviving || !reviveStage}
                                style={{ flex: 1, padding: '10px', borderRadius: '8px', fontWeight: 700, backgroundColor: !reviveStage ? 'var(--bg-secondary)' : '#22c55e', color: !reviveStage ? 'var(--text-muted)' : '#fff', border: 'none', cursor: !reviveStage ? 'not-allowed' : 'pointer', opacity: reviving ? 0.7 : 1 }}>
                                {reviving ? 'Moving...' : 'Revive'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Deal Filter Panel (right slide-over on desktop, bottom sheet on mobile) ── */}
            {showFilterSheet && (
                <div
                    style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--sheet-backdrop)', zIndex: 900 }}
                    onClick={() => setShowFilterSheet(false)}
                >
                    <div
                        style={!isMobile ? {
                            position: 'absolute', top: 0, right: 0, bottom: 0,
                            width: '360px',
                            backgroundColor: 'var(--bg-secondary)',
                            overflowY: 'auto',
                            padding: '0 0 32px',
                            boxShadow: '-8px 0 40px rgba(0,0,0,0.25)',
                            animation: 'slide-in-right 250ms cubic-bezier(0.34,1.2,0.64,1) forwards',
                        } : {
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            backgroundColor: 'var(--bg-secondary)',
                            borderRadius: '20px 20px 0 0',
                            maxHeight: '85vh', overflowY: 'auto',
                            WebkitOverflowScrolling: 'touch',
                            padding: '0 0 32px',
                            boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
                            animation: 'slide-up-in 250ms cubic-bezier(0.34,1.2,0.64,1) forwards',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Drag handle */}
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
                            <div style={{ width: '40px', height: '4px', borderRadius: '2px', backgroundColor: 'var(--border-secondary)' }} />
                        </div>

                        {/* Header */}
                        <div style={{ padding: '0 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)' }}>Filters</span>
                            <button type="button" onClick={() => {
                                setFilterStatus('');
                                setFilterScenario('');
                                setFilterMinPriority('');
                                setFilterSource('');
                                setFilterIntent('');
                                setFilterCoordinatorId('');
                                setFilterTaxonomy({ nodeIds: [], bhk: [] });
                                setSearchInput('');
                                setSearchQuery('');
                            }} style={{ background: 'none', border: 'none', color: 'var(--text-link)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                                Clear All
                            </button>
                        </div>

                        {/* Stage */}
                        <FilterSection title="Stage" defaultOpen badge={filterStatus ? 1 : 0}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {STAGES.map(stage => (
                                    <button key={stage} type="button"
                                        onClick={() => setFilterStatus(filterStatus === stage ? '' : stage)}
                                        className={`chip ${filterStatus === stage ? 'chip-active' : 'chip-inactive'}`}
                                        style={filterStatus === stage ? { borderColor: STAGE_COLORS[stage], backgroundColor: STAGE_COLORS[stage] + '20', color: STAGE_COLORS[stage] } : {}}>
                                        {STAGE_LABELS[stage]} ({stageCounts[stage] || 0})
                                    </button>
                                ))}
                            </div>
                        </FilterSection>

                        {/* Property Type (new taxonomy) */}
                        <FilterTaxonomySection tree={taxonomyTree} value={filterTaxonomy} onChange={setFilterTaxonomy} />

                        {/* Coordinator / Teammate */}
                        {agentsList.length > 0 && (
                            <FilterSection title="Teammate / Coordinator" defaultOpen badge={filterCoordinatorId ? 1 : 0}>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {agentsList.map(ag => (
                                        <button key={ag.id} type="button"
                                            onClick={() => setFilterCoordinatorId(filterCoordinatorId === ag.id ? '' : ag.id)}
                                            className={`chip ${filterCoordinatorId === ag.id ? 'chip-active' : 'chip-inactive'}`}>
                                            {ag.name}
                                        </button>
                                    ))}
                                </div>
                            </FilterSection>
                        )}

                        {/* Lead Source */}
                        <FilterSection title="Lead Source" defaultOpen={false} badge={filterSource ? 1 : 0}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {[
                                    { label: '99acres', value: '99acres' },
                                    { label: 'MagicBricks', value: 'magicbricks' },
                                    { label: 'Housing.com', value: 'housing' },
                                    { label: 'Facebook', value: 'facebook' },
                                    { label: 'Website', value: 'website' },
                                    { label: 'WhatsApp', value: 'whatsapp' },
                                    { label: 'Manual', value: 'manual' },
                                ].map(opt => (
                                    <button key={opt.value} type="button"
                                        onClick={() => setFilterSource(filterSource === opt.value ? '' : opt.value)}
                                        className={`chip ${filterSource === opt.value ? 'chip-active' : 'chip-inactive'}`}>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </FilterSection>

                        {/* Intent */}
                        <FilterSection title="Intent" defaultOpen={false} badge={filterIntent ? 1 : 0}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {[{ label: 'Buy', value: 'buy' }, { label: 'Rent', value: 'rent' }].map(opt => (
                                    <button key={opt.value} type="button"
                                        onClick={() => setFilterIntent(filterIntent === opt.value ? '' : opt.value)}
                                        className={`chip ${filterIntent === opt.value ? 'chip-active' : 'chip-inactive'}`}>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </FilterSection>

                        {/* Scenario */}
                        <FilterSection title="Deal Scenario" defaultOpen={false} badge={filterScenario ? 1 : 0}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {[
                                    { label: 'Partner + Internal', value: 'PARTNER_INTERNAL' },
                                    { label: 'Partner + Partner', value: 'PARTNER_PARTNER' },
                                    { label: 'Direct + Internal', value: 'DIRECT_INTERNAL' },
                                ].map(opt => (
                                    <button key={opt.value} type="button"
                                        onClick={() => setFilterScenario(filterScenario === opt.value ? '' : opt.value)}
                                        className={`chip ${filterScenario === opt.value ? 'chip-active' : 'chip-inactive'}`}>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </FilterSection>

                        {/* Priority */}
                        <FilterSection title="Priority" defaultOpen={false} badge={filterMinPriority ? 1 : 0}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {[
                                    { label: '🔥 Hot (≥7)', value: '7' },
                                    { label: '🟡 Medium (≥4)', value: '4' },
                                    { label: '🔵 Any (≥1)', value: '1' },
                                ].map(opt => (
                                    <button key={opt.value} type="button"
                                        onClick={() => setFilterMinPriority(filterMinPriority === opt.value ? '' : opt.value)}
                                        className={`chip ${filterMinPriority === opt.value ? 'chip-active' : 'chip-inactive'}`}>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </FilterSection>

                        {/* Apply button */}
                        <div style={{ padding: '16px 20px 0' }}>
                            <button type="button"
                                onClick={() => setShowFilterSheet(false)}
                                style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: 'var(--text-link)', color: '#fff', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}
                            >
                                {(() => {
                                    const count = [filterStatus, filterScenario, filterMinPriority, filterSource, filterIntent, filterCoordinatorId].filter(Boolean).length + (filterTaxonomy.nodeIds.length || filterTaxonomy.bhk.length ? 1 : 0);
                                    return count > 0 ? `Show Results (${count} active)` : 'Show Results';
                                })()}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
