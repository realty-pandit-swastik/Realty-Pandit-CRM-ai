import { useEffect, useState, useCallback, useRef } from 'react';
import { getDeals, getDealPipeline, updateDealStatus, type Deal, type DealPipelineStats } from '../api/client';
import client from '../api/client';
import { useIsMobile } from '../hooks/useIsMobile';

const STAGES = ['NEW', 'MATCHED', 'VISIT_SCHEDULED', 'VISITED', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST', 'ON_HOLD'] as const;

const STAGE_COLORS: Record<string, string> = {
    NEW: '#3b82f6',
    MATCHED: '#8b5cf6',
    VISIT_SCHEDULED: '#f59e0b',
    VISITED: '#06b6d4',
    NEGOTIATION: '#f97316',
    CLOSED_WON: '#22c55e',
    CLOSED_LOST: '#ef4444',
    ON_HOLD: '#6b7280',
};

const STAGE_LABELS: Record<string, string> = {
    NEW: 'New',
    MATCHED: 'Matched',
    VISIT_SCHEDULED: 'Visit Scheduled',
    VISITED: 'Visited',
    NEGOTIATION: 'Negotiation',
    CLOSED_WON: 'Won',
    CLOSED_LOST: 'Lost',
    ON_HOLD: 'On Hold',
};

const SCENARIO_LABELS: Record<string, string> = {
    PARTNER_INTERNAL: 'Partner + Internal',
    PARTNER_PARTNER: 'Partner + Partner',
    DIRECT_INTERNAL: 'Direct + Internal',
};

interface DealPipelineProps {}

export default function DealPipeline(_props: DealPipelineProps) {
    const isMobile = useIsMobile();
    const [deals, setDeals] = useState<Deal[]>([]);
    const [pipeline, setPipeline] = useState<DealPipelineStats>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [filterScenario, setFilterScenario] = useState<string>('');
    const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
    const [dragDealId, setDragDealId] = useState<string | null>(null);

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

            const [dealsRes, pipelineRes] = await Promise.all([
                getDeals(params),
                getDealPipeline(),
            ]);
            setDeals(dealsRes.deals || []);
            setPipeline(pipelineRes.data || {});
            setError(null);
        } catch (err: any) {
            setError(err?.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    }, [filterStatus, filterScenario]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Auto-refresh every 30s
    useEffect(() => {
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleDragStart = (dealId: string) => {
        setDragDealId(dealId);
    };

    const handleDrop = async (newStatus: string) => {
        if (!dragDealId) return;
        try {
            await updateDealStatus(dragDealId, newStatus);
            await fetchData();
        } catch (err: any) {
            alert(err?.response?.data?.error || 'Status change failed');
        }
        setDragDealId(null);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const totalDeals = Object.values(pipeline).reduce((a, b) => a + b, 0);
    const activeStages = STAGES.filter(s => s !== 'CLOSED_WON' && s !== 'CLOSED_LOST' && s !== 'ON_HOLD');

    const getDealsForStage = (stage: string) => deals.filter(d => d.status === stage);

    const formatBudget = (min?: number | null, max?: number | null) => {
        if (!min && !max) return '-';
        const fmt = (v: number) => v >= 10000000 ? `${(v / 10000000).toFixed(1)}Cr` : v >= 100000 ? `${(v / 100000).toFixed(1)}L` : `${(v / 1000).toFixed(0)}K`;
        if (min && max) return `${fmt(min)} - ${fmt(max)}`;
        if (max) return `Up to ${fmt(max)}`;
        return `${fmt(min!)}+`;
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

    return (
        <div style={{ padding: isMobile ? '16px' : '24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? '12px' : '0', marginBottom: '20px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: isMobile ? '18px' : '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Deal Pipeline</h2>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {totalDeals} total deals
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {/* Filters */}
                    <select
                        value={filterScenario}
                        onChange={(e) => setFilterScenario(e.target.value)}
                        title="Filter by scenario"
                        style={{
                            padding: '6px 10px', borderRadius: '8px', fontSize: '12px', flex: isMobile ? 1 : undefined,
                            border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
                            color: 'var(--text-primary)',
                        }}
                    >
                        <option value="">All Scenarios</option>
                        <option value="PARTNER_INTERNAL">Partner + Internal</option>
                        <option value="PARTNER_PARTNER">Partner + Partner</option>
                        <option value="DIRECT_INTERNAL">Direct + Internal</option>
                    </select>

                    {/* View Toggle — hidden on mobile */}
                    {!isMobile && (
                        <div style={{ display: 'flex', borderRadius: '8px', border: '1px solid var(--border-secondary)', overflow: 'hidden' }}>
                            <button
                                onClick={() => setViewMode('kanban')}
                                style={{
                                    padding: '6px 12px', fontSize: '12px', border: 'none', cursor: 'pointer',
                                    backgroundColor: viewMode === 'kanban' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                                    color: viewMode === 'kanban' ? '#fff' : 'var(--text-secondary)',
                                }}
                            >Kanban</button>
                            <button
                                onClick={() => setViewMode('list')}
                                style={{
                                    padding: '6px 12px', fontSize: '12px', border: 'none', cursor: 'pointer',
                                    backgroundColor: viewMode === 'list' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                                    color: viewMode === 'list' ? '#fff' : 'var(--text-secondary)',
                                }}
                            >List</button>
                        </div>
                    )}
                </div>
            </div>

            {/* Pipeline Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px', marginBottom: '16px' }}>
                {STAGES.map(stage => (
                    <div
                        key={stage}
                        onClick={() => setFilterStatus(filterStatus === stage ? '' : stage)}
                        style={{
                            padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                            backgroundColor: filterStatus === stage ? STAGE_COLORS[stage] + '20' : 'var(--bg-secondary)',
                            border: `1px solid ${filterStatus === stage ? STAGE_COLORS[stage] : 'var(--border-secondary)'}`,
                            textAlign: 'center', transition: 'all 0.2s',
                        }}
                    >
                        <div style={{ fontSize: '18px', fontWeight: 700, color: STAGE_COLORS[stage] }}>
                            {pipeline[stage] || 0}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                            {STAGE_LABELS[stage]}
                        </div>
                    </div>
                ))}
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
                    {/* Stage filter chips — horizontal scroll */}
                    <div style={{
                        display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '12px',
                        WebkitOverflowScrolling: 'touch', msOverflowStyle: 'none',
                    }}>
                        <button
                            onClick={() => setFilterStatus('')}
                            style={{
                                padding: '6px 12px', borderRadius: '16px', fontSize: '12px', fontWeight: 600,
                                border: '1px solid var(--border-secondary)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                                backgroundColor: filterStatus === '' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                                color: filterStatus === '' ? '#fff' : 'var(--text-secondary)',
                            }}
                        >All</button>
                        {STAGES.map(stage => (
                            <button
                                key={stage}
                                onClick={() => setFilterStatus(filterStatus === stage ? '' : stage)}
                                style={{
                                    padding: '6px 12px', borderRadius: '16px', fontSize: '12px', fontWeight: 600,
                                    border: `1px solid ${filterStatus === stage ? STAGE_COLORS[stage] : 'var(--border-secondary)'}`,
                                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                                    backgroundColor: filterStatus === stage ? STAGE_COLORS[stage] + '20' : 'var(--bg-secondary)',
                                    color: filterStatus === stage ? STAGE_COLORS[stage] : 'var(--text-secondary)',
                                }}
                            >
                                {STAGE_LABELS[stage]} ({pipeline[stage] || 0})
                            </button>
                        ))}
                    </div>

                    {/* Deal Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {deals.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                                No deals found
                            </div>
                        ) : deals.map(deal => (
                            <div
                                key={deal.id}
                                onClick={() => setSelectedDeal(deal)}
                                style={{
                                    padding: '14px', borderRadius: '12px', cursor: 'pointer',
                                    backgroundColor: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-secondary)',
                                }}
                            >
                                {/* Top row: name + status badge */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', flex: 1, marginRight: '8px' }}>
                                        {deal.demand_contact?.name || 'Unknown'}
                                    </div>
                                    <span style={{
                                        padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600, flexShrink: 0,
                                        backgroundColor: STAGE_COLORS[deal.status] + '15',
                                        color: STAGE_COLORS[deal.status],
                                    }}>
                                        {STAGE_LABELS[deal.status] || deal.status}
                                    </span>
                                </div>

                                {/* Property type + location */}
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                    {deal.demand_property_type || deal.demand_type_slug || deal.type} &middot; {deal.demand_location || 'No location'}
                                </div>

                                {/* Budget + Scenario row */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {formatBudget(deal.demand_budget_min, deal.demand_budget_max)}
                                    </div>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        {deal.deal_scenario && (
                                            <span style={{
                                                fontSize: '9px', padding: '2px 6px', borderRadius: '4px',
                                                backgroundColor: '#dbeafe', color: '#1d4ed8', fontWeight: 500,
                                            }}>
                                                {SCENARIO_LABELS[deal.deal_scenario] || deal.deal_scenario}
                                            </span>
                                        )}
                                        {deal.coordinator?.name && (
                                            <span style={{
                                                fontSize: '9px', padding: '2px 6px', borderRadius: '4px',
                                                backgroundColor: '#f0fdf4', color: '#15803d', fontWeight: 500,
                                            }}>
                                                {deal.coordinator.name}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {/* Transfer Ownership button for CLOSED_WON deals */}
                                {deal.status === 'CLOSED_WON' && deal.inventory_id && (
                                    <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); openTransferModal(deal); }}
                                        style={{
                                            marginTop: '8px', padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                                            backgroundColor: 'rgba(34,197,94,0.1)', border: '1.5px solid rgba(34,197,94,0.4)',
                                            color: '#22c55e', cursor: 'pointer', width: '100%',
                                        }}
                                    >🏠 Transfer Ownership</button>
                                )}
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
                                        {stageDeals.length}
                                    </span>
                                </div>

                                {/* Cards */}
                                <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                                    {stageDeals.length === 0 && (
                                        <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                            No deals
                                        </div>
                                    )}
                                    {stageDeals.map(deal => (
                                        <div
                                            key={deal.id}
                                            draggable
                                            onDragStart={() => handleDragStart(deal.id)}
                                            onClick={() => setSelectedDeal(deal)}
                                            style={{
                                                padding: '12px', marginBottom: '8px', borderRadius: '8px',
                                                backgroundColor: 'var(--bg-primary)', cursor: 'grab',
                                                border: '1px solid var(--border-secondary)',
                                                transition: 'box-shadow 0.2s',
                                            }}
                                            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)')}
                                            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
                                        >
                                            {/* Customer */}
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                                                {deal.demand_contact?.name || 'Unknown'}
                                            </div>

                                            {/* Property Type + Location */}
                                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                                {deal.demand_property_type || deal.demand_type_slug || deal.type} - {deal.demand_location || 'No location'}
                                            </div>

                                            {/* Budget */}
                                            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                                                {formatBudget(deal.demand_budget_min, deal.demand_budget_max)}
                                            </div>

                                            {/* Tags Row */}
                                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                {deal.deal_scenario && (
                                                    <span style={{
                                                        fontSize: '9px', padding: '2px 6px', borderRadius: '4px',
                                                        backgroundColor: '#dbeafe', color: '#1d4ed8', fontWeight: 500,
                                                    }}>
                                                        {SCENARIO_LABELS[deal.deal_scenario] || deal.deal_scenario}
                                                    </span>
                                                )}
                                                {deal.coordinator?.name && (
                                                    <span style={{
                                                        fontSize: '9px', padding: '2px 6px', borderRadius: '4px',
                                                        backgroundColor: '#f0fdf4', color: '#15803d', fontWeight: 500,
                                                    }}>
                                                        {deal.coordinator.name}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Property preview */}
                                            {deal.inventory && deal.inventory.media_urls?.[0] && (
                                                <div style={{ marginTop: '8px', borderRadius: '6px', overflow: 'hidden', height: '60px' }}>
                                                    <img
                                                        src={deal.inventory.media_urls[0]}
                                                        alt=""
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    />
                                                </div>
                                            )}
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
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                            No deals found
                        </div>
                    )}
                </div>
            )}

            {/* Deal Detail Modal */}
            {selectedDeal && (
                <DealDetailModal deal={selectedDeal} onClose={() => setSelectedDeal(null)} onRefresh={fetchData} />
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
                                    <strong style={{ color: '#3b82f6' }}>What happens:</strong> The inventory ownership will be reassigned to the new contact. The previous owner's record is preserved. An audit log entry is created. The new contact will appear as BUYER_TENANT in the system.
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
        </div>
    );
}

// ─── Deal Detail Modal ──────────────────────────────────────────────────────
interface DealDetailModalProps {
    deal: Deal;
    onClose: () => void;
    onRefresh: () => void;
}

function DealDetailModal({ deal, onClose, onRefresh }: DealDetailModalProps) {
    const [timeline, setTimeline] = useState<any[]>([]);
    const [queries, setQueries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'detail' | 'timeline' | 'queries'>('detail');
    const [statusChanging, setStatusChanging] = useState(false);
    const [queryForm, setQueryForm] = useState({ subject: '', message: '' });

    useEffect(() => {
        loadDetail();
    }, [deal.id]);

    const loadDetail = async () => {
        try {
            setLoading(true);
            const [timelineRes, queriesRes] = await Promise.all([
                getDealTimeline(deal.id),
                getDealQueries(deal.id),
            ]);
            setTimeline(timelineRes.data || []);
            setQueries(queriesRes.data || []);
        } catch {
            // Silently fail, show what we have
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (newStatus: string) => {
        if (!confirm(`Change deal status to ${STAGE_LABELS[newStatus] || newStatus}?`)) return;
        setStatusChanging(true);
        try {
            await updateDealStatus(deal.id, newStatus);
            onRefresh();
            onClose();
        } catch (err: any) {
            alert(err?.response?.data?.error || 'Status change failed');
        } finally {
            setStatusChanging(false);
        }
    };

    const handleSubmitQuery = async () => {
        if (!queryForm.subject || !queryForm.message) return;
        try {
            await createDealQuery(deal.id, queryForm.subject, queryForm.message);
            setQueryForm({ subject: '', message: '' });
            loadDetail();
        } catch (err: any) {
            alert(err?.response?.data?.error || 'Failed to submit query');
        }
    };

    const labelStyle: React.CSSProperties = {
        fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
        textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px',
    };

    const valueStyle: React.CSSProperties = {
        fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500,
    };

    return (
        <>
            {/* Backdrop */}
            <div onClick={onClose} style={{
                position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
                zIndex: 100, backdropFilter: 'blur(2px)',
            }} />

            {/* Modal */}
            <div style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                backgroundColor: 'var(--bg-primary)', borderRadius: '16px',
                width: '640px', maxWidth: '92vw', maxHeight: '85vh', overflow: 'hidden',
                zIndex: 101, boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
                display: 'flex', flexDirection: 'column',
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px', borderBottom: '1px solid var(--border-secondary)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {deal.demand_contact?.name || 'Deal Detail'}
                        </h3>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px', alignItems: 'center' }}>
                            <span style={{
                                padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                                backgroundColor: STAGE_COLORS[deal.status] + '15', color: STAGE_COLORS[deal.status],
                            }}>
                                {STAGE_LABELS[deal.status]}
                            </span>
                            {deal.deal_scenario && (
                                <span style={{
                                    padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 500,
                                    backgroundColor: '#dbeafe', color: '#1d4ed8',
                                }}>
                                    {SCENARIO_LABELS[deal.deal_scenario] || deal.deal_scenario}
                                </span>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer',
                        color: 'var(--text-secondary)', padding: '4px 8px',
                    }}>x</button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border-secondary)', padding: '0 20px' }}>
                    {(['detail', 'timeline', 'queries'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '10px 16px', fontSize: '12px', fontWeight: 600, border: 'none', cursor: 'pointer',
                                backgroundColor: 'transparent', color: activeTab === tab ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                borderBottom: activeTab === tab ? '2px solid var(--accent-primary)' : '2px solid transparent',
                                textTransform: 'capitalize',
                            }}
                        >
                            {tab} {tab === 'queries' && queries.length > 0 ? `(${queries.length})` : ''}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                    {activeTab === 'detail' && (
                        <div>
                            {/* Deal Info Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                <div><div style={labelStyle}>Type</div><div style={valueStyle}>{deal.type}</div></div>
                                <div><div style={labelStyle}>Location</div><div style={valueStyle}>{deal.demand_location || '-'}</div></div>
                                <div><div style={labelStyle}>Property Type</div><div style={valueStyle}>{deal.demand_property_type || deal.demand_type_slug || '-'}</div></div>
                                <div><div style={labelStyle}>Budget</div><div style={valueStyle}>{formatBudget(deal.demand_budget_min, deal.demand_budget_max)}</div></div>
                                <div><div style={labelStyle}>Coordinator</div><div style={valueStyle}>{deal.coordinator?.name || 'Unassigned'}</div></div>
                                <div><div style={labelStyle}>Created</div><div style={valueStyle}>{new Date(deal.created_at).toLocaleDateString()}</div></div>
                            </div>

                            {/* Customer Info */}
                            {deal.demand_contact && (
                                <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)' }}>
                                    <div style={labelStyle}>Customer</div>
                                    <div style={valueStyle}>{deal.demand_contact.name} {deal.demand_contact.phone_number ? `- ${deal.demand_contact.phone_number}` : ''}</div>
                                </div>
                            )}

                            {/* Property Info */}
                            {deal.inventory && (
                                <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)' }}>
                                    <div style={labelStyle}>Matched Property</div>
                                    <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                                        {deal.inventory.media_urls?.[0] && (
                                            <img src={deal.inventory.media_urls[0]} alt="" style={{ width: '80px', height: '60px', borderRadius: '6px', objectFit: 'cover' }} />
                                        )}
                                        <div>
                                            <div style={valueStyle}>{deal.inventory.type} - {deal.inventory.location}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{deal.inventory.price ? `Rs. ${deal.inventory.price.toLocaleString()}` : ''}</div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Status Actions */}
                            <div style={{ marginTop: '16px' }}>
                                <div style={labelStyle}>Change Status</div>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                                    {(deal.valid_next_statuses || []).map((s: string) => (
                                        <button
                                            key={s}
                                            disabled={statusChanging}
                                            onClick={() => handleStatusChange(s)}
                                            style={{
                                                padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                                                cursor: 'pointer', border: 'none',
                                                backgroundColor: STAGE_COLORS[s] + '15', color: STAGE_COLORS[s],
                                            }}
                                        >
                                            {STAGE_LABELS[s] || s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'timeline' && (
                        <div>
                            {loading ? (
                                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>Loading...</div>
                            ) : timeline.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>No timeline events</div>
                            ) : (
                                <div style={{ position: 'relative', paddingLeft: '20px' }}>
                                    {/* Vertical line */}
                                    <div style={{
                                        position: 'absolute', left: '6px', top: '4px', bottom: '4px',
                                        width: '2px', backgroundColor: 'var(--border-secondary)',
                                    }} />
                                    {timeline.map((event, i) => (
                                        <div key={event.id || i} style={{ marginBottom: '16px', position: 'relative' }}>
                                            {/* Dot */}
                                            <div style={{
                                                position: 'absolute', left: '-18px', top: '4px',
                                                width: '10px', height: '10px', borderRadius: '50%',
                                                backgroundColor: event.type === 'log' ? '#3b82f6'
                                                    : event.type === 'appointment' ? '#f59e0b' : '#8b5cf6',
                                                border: '2px solid var(--bg-primary)',
                                            }} />
                                            <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>
                                                {event.type === 'log' && (event.action || 'Activity')}
                                                {event.type === 'query' && `Query: ${event.subject}`}
                                                {event.type === 'appointment' && `${event.appointment_type}: ${event.status}`}
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                {new Date(event.created_at).toLocaleString()}
                                                {event.performed_by && ` - by ${event.performed_by}`}
                                            </div>
                                            {event.details && typeof event.details === 'object' && (
                                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontStyle: 'italic' }}>
                                                    {JSON.stringify(event.details).slice(0, 200)}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'queries' && (
                        <div>
                            {/* New Query Form */}
                            <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)' }}>
                                <input
                                    placeholder="Subject"
                                    value={queryForm.subject}
                                    onChange={(e) => setQueryForm({ ...queryForm, subject: e.target.value })}
                                    style={{
                                        width: '100%', padding: '8px 10px', borderRadius: '6px', fontSize: '12px',
                                        border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
                                        color: 'var(--text-primary)', marginBottom: '8px',
                                    }}
                                />
                                <textarea
                                    placeholder="Your question or note..."
                                    value={queryForm.message}
                                    onChange={(e) => setQueryForm({ ...queryForm, message: e.target.value })}
                                    rows={3}
                                    style={{
                                        width: '100%', padding: '8px 10px', borderRadius: '6px', fontSize: '12px',
                                        border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
                                        color: 'var(--text-primary)', resize: 'vertical', marginBottom: '8px',
                                    }}
                                />
                                <button
                                    onClick={handleSubmitQuery}
                                    disabled={!queryForm.subject || !queryForm.message}
                                    style={{
                                        padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                                        backgroundColor: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer',
                                        opacity: !queryForm.subject || !queryForm.message ? 0.5 : 1,
                                    }}
                                >
                                    Submit Query
                                </button>
                            </div>

                            {/* Existing Queries */}
                            {queries.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>No queries yet</div>
                            ) : queries.map(q => (
                                <div key={q.id} style={{
                                    marginBottom: '12px', padding: '12px', borderRadius: '8px',
                                    border: '1px solid var(--border-secondary)',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{q.subject}</span>
                                        <span style={{
                                            fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                                            backgroundColor: q.status === 'OPEN' ? '#fef3c7' : '#d1fae5',
                                            color: q.status === 'OPEN' ? '#92400e' : '#065f46',
                                            fontWeight: 600,
                                        }}>
                                            {q.status}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{q.message}</div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                        {q.raised_by_type} - {new Date(q.created_at).toLocaleString()}
                                    </div>
                                    {q.answer && (
                                        <div style={{
                                            marginTop: '8px', padding: '8px', borderRadius: '6px',
                                            backgroundColor: '#f0fdf4', fontSize: '12px', color: '#15803d',
                                        }}>
                                            <strong>Answer:</strong> {q.answer}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

// Helper to format budget (duplicated from above for modal scope)
function formatBudget(min?: number | null, max?: number | null) {
    if (!min && !max) return '-';
    const fmt = (v: number) => v >= 10000000 ? `${(v / 10000000).toFixed(1)}Cr` : v >= 100000 ? `${(v / 100000).toFixed(1)}L` : `${(v / 1000).toFixed(0)}K`;
    if (min && max) return `${fmt(min)} - ${fmt(max)}`;
    if (max) return `Up to ${fmt(max)}`;
    return `${fmt(min!)}+`;
}

// Inline API helpers (imported from client but defined here for convenience)
import { getDealTimeline, getDealQueries, createDealQuery } from '../api/client';
