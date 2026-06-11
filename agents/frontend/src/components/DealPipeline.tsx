import { useEffect, useState, useCallback, useRef } from 'react';
import { getDeals, getDealPipeline, updateDealStatus, getTeamMembersList, getDeal, getDealMatchCounts, type Deal, type DealPipelineStats } from '../api/client';
import client from '../api/client';
import { FilterSection, FilterTaxonomySection } from './filters/FilterSheetShared';
import type { TaxonomySelection } from './filters/FilterSheetShared';
import { useIsMobile } from '../hooks/useIsMobile';
import { useToast } from '../contexts/ToastContext';
import { DealCloseCommissionDialog } from './DealCloseCommissionDialog';
import LogCallOverlay from './deal/LogCallOverlay';
import { DealWorkspace } from './deal/DealWorkspace';
import { AIStatusBadge } from './AIStatusBadge';
import { QuickCallStrip } from './QuickCallStrip';
import { toDialablePhone } from '../lib/phone';
import { InventoryQuickView } from './InventoryQuickView';
import { LogActionModal, type LogActionType } from './LogActionModal';

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
     *  reminder link). When set, the matching deal detail opens automatically on mount. */
    initialDealId?: string | null;
}

export default function DealPipeline({ initialDealId }: DealPipelineProps) {
    const isMobile = useIsMobile();
    const { showToast } = useToast();
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
    const [logCallDeal, setLogCallDeal] = useState<Deal | null>(null);
    const [dragDealId, setDragDealId] = useState<string | null>(null);
    // Commission entry dialog (post-close capture — middleman model 2026-04-17)
    const [commissionDealId, setCommissionDealId] = useState<string | null>(null);
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

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
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

            const [dealsRes, pipelineRes] = await Promise.all([
                getDeals({ ...params, limit: 500 }),
                getDealPipeline(),
            ]);
            const loadedDeals = dealsRes.deals || [];
            setDeals(loadedDeals);
            setPipeline(pipelineRes.data || {});
            setError(null);
            // Tile match-count badges — fire-and-forget so it never blocks the pipeline render.
            getDealMatchCounts(loadedDeals.map((d: any) => d.id)).then(setMatchCounts).catch(() => {});
        } catch (err: any) {
            setError(err?.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    }, [filterStatus, filterScenario, filterMinPriority, filterSource, filterIntent, filterCoordinatorId, filterTaxonomy, searchQuery, showClosedDeals]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Deep link (?deal=<id>): open that deal's detail straight away. Used by the
    // Google Calendar/Task "call the new lead" reminder links so the member lands
    // on the exact deal without searching. Runs once per distinct initialDealId.
    useEffect(() => {
        if (!initialDealId) return;
        let cancelled = false;
        getDeal(initialDealId)
            .then((deal) => { if (!cancelled && deal) setSelectedDeal(deal); })
            .catch(() => { /* deleted/forbidden deal — stay on the pipeline list */ });
        return () => { cancelled = true; };
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
        getTeamMembersList().then(data => {
            const members = Array.isArray(data) ? data : [];
            setAgentsList(members.map((m: any) => ({ id: m.id, name: m.name })));
        }).catch(() => {});
    }, []);

    // Debounced search — updates searchQuery (which triggers fetchData) 400ms after last keystroke
    const handleSearchChange = (value: string) => {
        setSearchInput(value);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => setSearchQuery(value), 400);
    };

    // Auto-refresh every 30s
    useEffect(() => {
        const interval = setInterval(fetchData, 30000);
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
        try {
            await updateDealStatus(dragDealId, newStatus);
            await fetchData();
        } catch (err: any) {
            showToast(err?.response?.data?.error || 'Status change failed', 'error');
        }
        setDragDealId(null);
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
    const [logActionType, setLogActionType] = useState<LogActionType>('CALLED');

    const openLogAction = (deal: Deal, type: LogActionType, e: React.MouseEvent) => {
        e.stopPropagation();
        setLogActionDeal(deal);
        setLogActionType(type);
    };

    const totalDeals = Object.values(pipeline).reduce((a, b) => a + b, 0);
    // 2026-05-13: kanban columns. CLOSED_WON / CLOSED_LOST / ON_HOLD hidden by
    // default; toggling showClosedDeals reveals CLOSED_WON + CLOSED_LOST so the team
    // can review past outcomes without losing focus on active work.
    const activeStages = showClosedDeals
        ? STAGES.filter(s => s !== 'ON_HOLD')
        : STAGES.filter(s => s !== 'CLOSED_WON' && s !== 'CLOSED_LOST' && s !== 'ON_HOLD');

    const getDealsForStage = (stage: string) => deals.filter(d => d.status === stage);

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
                if (appt?.scheduled_at) {
                    const d = new Date(appt.scheduled_at);
                    return `📅 ${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
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
                            ? `${deals.length} result${deals.length !== 1 ? 's' : ''} (of ${totalDeals})`
                            : `${totalDeals} total deals`}
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
                    <option value="">All Stages ({totalDeals})</option>
                    {STAGES.map(stage => (
                        <option key={stage} value={stage}>
                            {STAGE_LABELS[stage]} ({pipeline[stage] || 0})
                        </option>
                    ))}
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
                        ) : deals.map(deal => (
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
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
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

                                {/* Stage info line */}
                                {getStageInfoLine(deal) && (
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                        {getStageInfoLine(deal)}
                                    </div>
                                )}

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
                                {deal.status === 'NEW' && (
                                    <div style={{ marginTop: 6 }}>
                                        <button type="button"
                                            onClick={e => { e.stopPropagation(); setLogCallDeal(deal); }}
                                            style={{ ...actionBtnStyle('blue'), width: '100%' }}>
                                            📞 Log My Call
                                        </button>
                                    </div>
                                )}
                                {deal.status === 'QUALIFIED' && (
                                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                        <button type="button" onClick={async e => { e.stopPropagation(); try { const res: any = await client.post(`/api/deals/${deal.id}/share-next-property`); alert(res.data?.data?.sent ? 'Property card sent.' : 'No more matching properties.'); } catch (err: any) { alert(err?.response?.data?.error || err.message); } }}
                                            style={actionBtnStyle('purple')}>
                                            📤 Share Property
                                        </button>
                                        <button type="button" onClick={e => openLogAction(deal, 'SCHEDULED_VISIT', e)}
                                            style={actionBtnStyle('amber')}>
                                            📅 Schedule Visit
                                        </button>
                                    </div>
                                )}
                                {deal.status === 'VISIT_SCHEDULED' && (
                                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                        <button type="button" onClick={e => { e.stopPropagation(); openVisitOutcomeModal(deal); }}
                                            style={actionBtnStyle('amber')}>
                                            📝 Outcome
                                        </button>
                                        <button type="button" onClick={async e => { e.stopPropagation(); try { await client.post(`/api/deals/${deal.id}/log-action`, { action_type: 'REMINDER_GIVEN', outcome: 'reminder_given' }); showToast('Reminder logged', 'success'); } catch (err: any) { alert(err?.response?.data?.error || err.message); } }}
                                            style={actionBtnStyle('cyan')}>
                                            📞 I Reminded
                                        </button>
                                    </div>
                                )}
                                {deal.status === 'NEGOTIATION' && (
                                    <button type="button" onClick={e => openLogAction(deal, 'MEETING_BOOKED', e)}
                                        style={{ ...actionBtnStyle('orange'), marginTop: 6, width: '100%' }}>
                                        📝 Log Update
                                    </button>
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
                                {(deal.status === 'NEW' || deal.status === 'QUALIFIED' ||
                                  deal.status === 'VISIT_SCHEDULED' || deal.status === 'VISITED' ||
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
                                        {pipeline[stage] || 0}
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
                                                </div>
                                                {(deal as any).ai_status && (
                                                    <AIStatusBadge status={(deal as any).ai_status} />
                                                )}
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

                                            {/* Stage-specific info line */}
                                            {getStageInfoLine(deal) && (
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', lineHeight: 1.4 }}>
                                                    {getStageInfoLine(deal)}
                                                </div>
                                            )}

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
                                            {deal.status === 'NEW' && (
                                                <div style={{ marginTop: 8 }}>
                                                    <button type="button"
                                                        onClick={e => { e.stopPropagation(); setLogCallDeal(deal); }}
                                                        style={{ ...actionBtnStyle('blue'), width: '100%' }}>
                                                        📞 Log My Call
                                                    </button>
                                                </div>
                                            )}
                                            {deal.status === 'QUALIFIED' && (
                                                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                                    <button type="button" onClick={async e => { e.stopPropagation(); try { const res: any = await client.post(`/api/deals/${deal.id}/share-next-property`); alert(res.data?.data?.sent ? 'Property card sent.' : 'No more matching properties.'); } catch (err: any) { alert(err?.response?.data?.error || err.message); } }}
                                                        style={actionBtnStyle('purple')}>
                                                        📤 Share Property
                                                    </button>
                                                    <button type="button" onClick={e => openLogAction(deal, 'SCHEDULED_VISIT', e)}
                                                        style={actionBtnStyle('amber')}>
                                                        📅 Schedule Visit
                                                    </button>
                                                </div>
                                            )}
                                            {deal.status === 'VISIT_SCHEDULED' && (
                                                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                                    <button type="button" onClick={e => { e.stopPropagation(); openVisitOutcomeModal(deal); }}
                                                        style={actionBtnStyle('amber')}>
                                                        📝 Outcome
                                                    </button>
                                                    <button type="button" onClick={async e => { e.stopPropagation(); try { await client.post(`/api/deals/${deal.id}/log-action`, { action_type: 'REMINDER_GIVEN', outcome: 'reminder_given' }); showToast('Reminder logged — AI will skip next automated reminder', 'success'); } catch (err: any) { alert(err?.response?.data?.error || err.message); } }}
                                                        style={actionBtnStyle('cyan')}>
                                                        📞 I Reminded
                                                    </button>
                                                </div>
                                            )}
                                            {deal.status === 'NEGOTIATION' && (
                                                <button type="button" onClick={e => openLogAction(deal, 'MEETING_BOOKED', e)}
                                                    style={{ ...actionBtnStyle('orange'), marginTop: 8, width: '100%' }}>
                                                    📝 Log Update
                                                </button>
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
                                            {(deal.status === 'NEW' || deal.status === 'QUALIFIED' ||
                                              deal.status === 'VISIT_SCHEDULED' || deal.status === 'VISITED' ||
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
                            {deals.map(deal => (
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
                    onClose={() => setLogActionDeal(null)}
                    onSuccess={() => { setLogActionDeal(null); fetchData(); }}
                />
            )}

            {/* Stage 1 NEW — Log Call workflow (the only path to QUALIFIED) */}
            {logCallDeal && (
                <LogCallOverlay
                    dealId={logCallDeal.id}
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
                    onClose={() => setLogCallDeal(null)}
                    onSuccess={() => { setLogCallDeal(null); fetchData(); showToast('Lead qualified — AI taking over for property sharing', 'success'); }}
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
                                        {STAGE_LABELS[stage]} ({pipeline[stage] || 0})
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
