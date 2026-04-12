
import { useEffect, useState, useRef } from 'react';
import { getInventory, getStates, getTeamMembers, updateInventory } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import ShareToClientModal from '../ShareToClientModal';
import BookVisitModal from '../BookVisitModal';

interface MobileInventoryListProps {
    onEditItem: (item: any) => void;
    onAddNew: () => void;
}

const CARD_RADIUS = '12px';

function formatPrice(price: number | null, intent: string): string {
    if (!price || price === 0) return 'Price on request';
    const num = Number(price);
    if (intent === 'rent') return `₹${num.toLocaleString('en-IN')}/mo`;
    if (num >= 10000000) return `₹${(num / 10000000).toFixed(1)} Cr`;
    if (num >= 100000) return `₹${(num / 100000).toFixed(1)} L`;
    return `₹${num.toLocaleString('en-IN')}`;
}

const INTENT_COLORS: Record<string, { bg: string; color: string }> = {
    sell: { bg: '#4F46E533', color: '#818CF8' },
    rent: { bg: '#10B98133', color: '#34D399' },
    lease: { bg: '#F5900B33', color: '#FBBF24' },
};

export function MobileInventoryList({ onEditItem, onAddNew }: MobileInventoryListProps) {
    const { hasPermission, agent } = useAuth();
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [filterIntent, setFilterIntent] = useState('');
    const [filterType, setFilterType] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterState, setFilterState] = useState('');
    const [filterAgent, setFilterAgent] = useState('');
    const [search, setSearch] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [statesList, setStatesList] = useState<string[]>([]);
    const [agentsList, setAgentsList] = useState<any[]>([]);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [shareItem, setShareItem] = useState<any>(null);
    const [bookVisitItem, setBookVisitItem] = useState<any>(null);
    const [callDropdownId, setCallDropdownId] = useState<string | null>(null);

    // Close call dropdown on outside tap
    useEffect(() => {
        if (!callDropdownId) return;
        const handler = () => setCallDropdownId(null);
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, [callDropdownId]);

    useEffect(() => {
        getStates().then(d => {
            if (Array.isArray(d)) setStatesList(d.map((s: any) => s.name || s));
            else if (d?.states) setStatesList(d.states.map((s: any) => s.name || s));
        }).catch(() => {});
        getTeamMembers().then(d => {
            if (Array.isArray(d)) setAgentsList(d);
            else if (d?.data) setAgentsList(d.data);
        }).catch(() => {});
    }, []);

    useEffect(() => { loadData(); }, [page, filterIntent, filterType, filterStatus, filterState, filterAgent]);

    useEffect(() => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => { setPage(1); loadData(); }, 300);
        return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    }, [search]);

    const loadData = async () => {
        try {
            setLoading(true);
            const params: Record<string, any> = { page, limit: 15 };
            if (filterIntent) params.intent = filterIntent;
            if (filterType) params.category = filterType;
            if (filterStatus) params.status = filterStatus;
            if (filterState) params.state = filterState;
            if (filterAgent) params.agent_id = filterAgent;
            if (search.trim()) params.search = search.trim();
            const res = await getInventory(params);
            if (res?.data && Array.isArray(res.data)) {
                setItems(res.data);
                setTotalPages(res.totalPages || 1);
            } else if (Array.isArray(res)) {
                setItems(res);
                setTotalPages(1);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const chips = [
        { key: '', label: 'All' },
        { key: 'sell', label: 'Sale' },
        { key: 'rent', label: 'Rent' },
        { key: 'lease', label: 'Lease' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
            {/* Search */}
            <div style={{ padding: '12px 16px 8px' }}>
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search properties..."
                    style={{
                        width: '100%', padding: '10px 14px', borderRadius: CARD_RADIUS,
                        border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-primary)', fontSize: '14px', boxSizing: 'border-box',
                    }}
                />
            </div>

            {/* Filter Chips + Toggle */}
            <div style={{ padding: '0 16px 4px', display: 'flex', gap: '8px', overflowX: 'auto', alignItems: 'center' }}>
                {chips.map(chip => (
                    <button key={chip.key} onClick={() => { setFilterIntent(chip.key); setPage(1); }}
                        style={{
                            flexShrink: 0, padding: '6px 14px', borderRadius: '20px',
                            border: filterIntent === chip.key ? '1px solid #4F46E5' : '1px solid var(--border-secondary)',
                            backgroundColor: filterIntent === chip.key ? '#4F46E5' : 'var(--bg-secondary)',
                            color: filterIntent === chip.key ? '#fff' : 'var(--text-secondary)',
                            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                        }}>
                        {chip.label}
                    </button>
                ))}
                <button onClick={() => setShowFilters(p => !p)}
                    style={{
                        flexShrink: 0, padding: '6px 14px', borderRadius: '20px',
                        border: (filterState || filterAgent || filterType || filterStatus)
                            ? '1px solid #4F46E5' : '1px solid var(--border-secondary)',
                        backgroundColor: showFilters ? '#4F46E5' : 'var(--bg-secondary)',
                        color: showFilters ? '#fff' : 'var(--text-secondary)',
                        fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                    }}>
                    Filters {(filterState || filterAgent || filterType || filterStatus) ? '*' : ''}
                </button>
            </div>

            {/* Expanded Filters */}
            {showFilters && (
                <div style={{ padding: '8px 16px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}
                        style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px' }}>
                        <option value="">All Category</option>
                        <option value="residential">Residential</option>
                        <option value="commercial">Commercial</option>
                        <option value="agricultural_land">Agricultural Land</option>
                    </select>
                    <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
                        style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px' }}>
                        <option value="">All Status</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="sold">Sold</option>
                        <option value="rented">Rented</option>
                    </select>
                    <select value={filterState} onChange={e => { setFilterState(e.target.value); setPage(1); }}
                        style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px' }}>
                        <option value="">All States</option>
                        {statesList.map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                    <select value={filterAgent} onChange={e => { setFilterAgent(e.target.value); setPage(1); }}
                        style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px' }}>
                        <option value="">All Agents</option>
                        {agentsList.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <button onClick={() => { setFilterType(''); setFilterStatus(''); setFilterState(''); setFilterAgent(''); setPage(1); }}
                        style={{ gridColumn: 'span 2', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer' }}>
                        Clear All Filters
                    </button>
                </div>
            )}

            {/* Property Cards */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 80px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Loading...</div>
                ) : items.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>No properties found</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {items.map(item => {
                            const intentStyle = INTENT_COLORS[item.intent] || { bg: 'var(--bg-primary)', color: 'var(--text-muted)' };
                            const location = item.full_address || [item.locality, item.city || item.district, item.state].filter(Boolean).join(', ') || 'Location N/A';
                            const specs = item.specs || {};
                            return (
                                <div key={item.id} onClick={() => onEditItem(item)}
                                    style={{
                                        backgroundColor: 'var(--bg-secondary)', borderRadius: CARD_RADIUS,
                                        padding: '14px 16px', border: '1px solid var(--border-secondary)', cursor: 'pointer',
                                    }}>
                                    {/* Top row: thumbnail + info */}
                                    <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                                        {/* Thumbnail */}
                                        <div style={{ width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, backgroundColor: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {item.media_urls?.[0] ? (
                                                <img src={item.media_urls[0]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                                            ) : (
                                                <span style={{ fontSize: '22px', color: 'var(--text-muted)', fontWeight: 700 }}>
                                                    {(item.flat_property_type?.name || item.type || 'P')[0].toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '3px', flexWrap: 'wrap' }}>
                                                <span style={{
                                                    backgroundColor: intentStyle.bg, color: intentStyle.color,
                                                    padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                                                }}>
                                                    {item.intent}
                                                </span>
                                                <span style={{
                                                    backgroundColor: item.status === 'active' ? '#10B98133' : '#EF444433',
                                                    color: item.status === 'active' ? '#34D399' : '#F87171',
                                                    padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                                                }}>
                                                    {item.status}
                                                </span>
                                                {item.lead_reference?.startsWith('NEEDS_REVIEW') && (
                                                    <span style={{ fontSize: 10, background: 'rgba(239,68,68,0.15)', color: '#f87171', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>Needs Review</span>
                                                )}
                                            </div>
                                            <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {item.flat_property_type?.name || item.property_type_link?.name || item.type?.replace(/_/g, ' ') || 'Property'}
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {location}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Dual Pricing */}
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '6px', fontSize: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>
                                            Demand: <strong style={{ color: 'var(--text-secondary)' }}>{formatPrice(item.customer_price || item.price, item.intent)}</strong>
                                        </span>
                                        {item.display_price && (
                                            <span style={{ color: 'var(--text-muted)' }}>
                                                Display: <strong style={{ color: '#4F46E5' }}>{formatPrice(item.display_price, item.intent)}</strong>
                                            </span>
                                        )}
                                        {(() => {
                                            const demand = Number(item.customer_price || item.price || 0);
                                            const display = Number(item.display_price || 0);
                                            if (demand > 0 && display > 0 && display !== demand) {
                                                const margin = display - demand;
                                                const pct = ((margin / demand) * 100).toFixed(0);
                                                return (
                                                    <span style={{
                                                        fontSize: '11px', fontWeight: 600, padding: '1px 5px', borderRadius: '4px',
                                                        ...(margin > 0 ? { color: '#34d399', backgroundColor: '#34d39920' } : { color: '#f87171', backgroundColor: '#f8717120' })
                                                    }}>
                                                        {margin > 0 ? '+' : ''}{pct}%
                                                    </span>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </div>

                                    {/* Specs row */}
                                    {(specs.bedrooms || specs.area) && (
                                        <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                            {specs.bedrooms && <span>{specs.bedrooms} BHK</span>}
                                            {specs.bathrooms && <span>{specs.bathrooms} Bath</span>}
                                            {specs.area && <span>{specs.area} {specs.area_unit || 'sqft'}</span>}
                                        </div>
                                    )}

                                    {/* Completion Bar */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                        <div style={{ flex: 1, height: '4px', borderRadius: '2px', backgroundColor: 'var(--bg-primary)', maxWidth: '140px' }}>
                                            <div style={{
                                                height: '100%', borderRadius: '2px',
                                                width: `${item.completion_pct || 0}%`,
                                                backgroundColor: (item.completion_pct || 0) > 60 ? '#34d399' : (item.completion_pct || 0) > 30 ? '#fbbf24' : '#f87171',
                                            }} />
                                        </div>
                                        <span style={{
                                            fontSize: '10px', fontWeight: 700,
                                            color: (item.completion_pct || 0) > 60 ? '#34d399' : (item.completion_pct || 0) > 30 ? '#fbbf24' : '#f87171',
                                        }}>
                                            {item.completion_pct || 0}%
                                        </span>
                                        {item.uploaded_by_agent?.name && (
                                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                                by {item.uploaded_by_agent.name}
                                            </span>
                                        )}
                                    </div>

                                    {/* Action Buttons */}
                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                        {/* Call Button */}
                                        {(item.uploader_phone || item.owner_phone || item.key_holder_phone) && (
                                            <div style={{ position: 'relative', display: 'inline-block' }}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setCallDropdownId(callDropdownId === item.id ? null : item.id); }}
                                                    style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer', backgroundColor: '#22d3ee22', color: '#22d3ee' }}
                                                >&#9742; Call</button>
                                                {callDropdownId === item.id && (
                                                    <div onClick={e => e.stopPropagation()} style={{
                                                        position: 'absolute', bottom: '100%', right: 0, marginBottom: '4px',
                                                        backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)',
                                                        borderRadius: '8px', padding: '4px', minWidth: '180px', zIndex: 100,
                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                                    }}>
                                                        {item.uploader_phone && (
                                                            <a href={`tel:${item.uploader_phone}`} style={{ display: 'flex', flexDirection: 'column', padding: '8px 12px', borderRadius: '6px', textDecoration: 'none', color: 'inherit' }}>
                                                                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{item.ownership_type === 'OWNER' ? 'Owner' : 'Uploader'}</span>
                                                                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.uploader_name || 'Unknown'}</span>
                                                                <span style={{ fontSize: '12px', color: '#22d3ee' }}>{item.uploader_phone}</span>
                                                            </a>
                                                        )}
                                                        {item.owner_phone && item.owner_phone !== item.uploader_phone && (
                                                            <a href={`tel:${item.owner_phone}`} style={{ display: 'flex', flexDirection: 'column', padding: '8px 12px', borderRadius: '6px', textDecoration: 'none', color: 'inherit' }}>
                                                                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Owner</span>
                                                                <span style={{ fontSize: '12px', color: '#22d3ee' }}>{item.owner_phone}</span>
                                                            </a>
                                                        )}
                                                        {item.key_holder_type === 'EXTERNAL' && item.key_holder_phone && (
                                                            <a href={`tel:${item.key_holder_phone}`} style={{ display: 'flex', flexDirection: 'column', padding: '8px 12px', borderRadius: '6px', textDecoration: 'none', color: 'inherit' }}>
                                                                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Key Holder</span>
                                                                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.key_holder_name || 'Unknown'}</span>
                                                                <span style={{ fontSize: '12px', color: '#22d3ee' }}>{item.key_holder_phone}</span>
                                                            </a>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {hasPermission('edit_inventory') && (item.uploaded_by_agent?.id === agent?.id || agent?.role === 'super_boss' || agent?.role === 'manager') && (
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    const newStatus = item.status === 'active' ? 'inactive' : 'active';
                                                    if (!confirm(`${newStatus === 'inactive' ? 'Deactivate' : 'Activate'}?`)) return;
                                                    try { await updateInventory(item.id, { status: newStatus }); loadData(); }
                                                    catch (err: any) { alert(err.response?.data?.error || 'Failed'); }
                                                }}
                                                style={{
                                                    padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                                                    border: 'none', cursor: 'pointer',
                                                    backgroundColor: item.status === 'active' ? '#F59E0B22' : '#10B98122',
                                                    color: item.status === 'active' ? '#F59E0B' : '#10B981',
                                                }}
                                            >
                                                {item.status === 'active' ? 'Deactivate' : 'Activate'}
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setShareItem(item); }}
                                            style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer', backgroundColor: '#22c55e22', color: '#22c55e' }}
                                        >Share</button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setBookVisitItem(item); }}
                                            style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer', backgroundColor: '#8b5cf622', color: '#8b5cf6' }}
                                        >Visit</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', padding: '16px 0', alignItems: 'center' }}>
                        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                            style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.4 : 1 }}>
                            Prev
                        </button>
                        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{page}/{totalPages}</span>
                        <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                            style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.4 : 1 }}>
                            Next
                        </button>
                    </div>
                )}
            </div>

            {/* FAB — Add Property */}
            {hasPermission('edit_inventory') && (
                <button onClick={onAddNew}
                    style={{
                        position: 'absolute', bottom: '16px', right: '16px',
                        width: '56px', height: '56px', borderRadius: '28px',
                        backgroundColor: '#4F46E5', color: '#fff', border: 'none',
                        fontSize: '28px', fontWeight: 700, cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(79,70,229,0.4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    +
                </button>
            )}

            {shareItem && (
                <ShareToClientModal item={shareItem} onClose={() => setShareItem(null)} onShared={() => setShareItem(null)} />
            )}
            {bookVisitItem && (
                <BookVisitModal item={bookVisitItem} onClose={() => setBookVisitItem(null)} onBooked={() => setBookVisitItem(null)} />
            )}
        </div>
    );
}
