
import { useEffect, useState, useRef } from 'react';
import { getInventory, getTeamMembers, updateInventory } from '../../api/client';
import client from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import ShareToClientModal from '../ShareToClientModal';
import BookVisitModal from '../BookVisitModal';
import { toDialablePhone } from '../../lib/phone';
import {
    FilterSection,
    FilterTaxonomySection,
    FilterLocationSection,
    FilterFloorSection,
    StalenessSection,
} from '../filters/FilterSheetShared';
import type { TaxonomySelection, LocationSelection } from '../filters/FilterSheetShared';

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
    const { showToast } = useToast();
    const confirm = useConfirm();
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [filterIntent, setFilterIntent] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [search, setSearch] = useState('');
    const [showFilterSheet, setShowFilterSheet] = useState(false);
    const [filterTaxonomy, setFilterTaxonomy] = useState<TaxonomySelection>({ nodeIds: [], bhk: [] });
    const [filterLocationSelection, setFilterLocationSelection] = useState<LocationSelection>({ label: '', lat: null, lng: null, radiusKm: 2 });
    const [filterListingSource, setFilterListingSource] = useState('');
    const [filterDataSource, setFilterDataSource] = useState('');
    const [filterDaysInSystem, setFilterDaysInSystem] = useState(0);
    const [filterFloors, setFilterFloors] = useState<string[]>([]); // floor_number tokens ('0'..'4','5plus')
    const [filterDaysNoVisit, setFilterDaysNoVisit] = useState(0);
    const [taxonomyTree, setTaxonomyTree] = useState<any[]>([]);
    const [filterAgent, setFilterAgent] = useState('');
    const [agentsList, setAgentsList] = useState<any[]>([]);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [shareItem, setShareItem] = useState<any>(null);
    const [bookVisitItem, setBookVisitItem] = useState<any>(null);
    const [activeSheetItem, setActiveSheetItem] = useState<any>(null);

    useEffect(() => {
        client.get('/public/taxonomy/tree')
            .then((r: any) => setTaxonomyTree(r.data.tree || []))
            .catch(() => {});
        getTeamMembers().then(d => {
            if (Array.isArray(d)) setAgentsList(d);
            else if (d?.data) setAgentsList(d.data);
        }).catch(() => {});
    }, []);

    useEffect(() => { loadData(); }, [page, filterIntent, filterStatus, filterAgent, filterTaxonomy, filterLocationSelection, filterListingSource, filterDataSource, filterDaysInSystem, filterDaysNoVisit, filterFloors]);

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
            if (filterStatus) params.status = filterStatus;
            if (filterAgent) params.agent_id = filterAgent;
            if (search.trim()) params.search = search.trim();
            if (filterTaxonomy.nodeIds.length > 0) params.taxonomy_node_ids = filterTaxonomy.nodeIds.join(',');
            if (filterTaxonomy.bhk.length > 0) params.bhk = filterTaxonomy.bhk.join(',');
            if (filterListingSource) params.listing_source = filterListingSource;
            if (filterDataSource) params.data_source = filterDataSource;
            if (filterLocationSelection.lat !== null) params.lat = String(filterLocationSelection.lat);
            if (filterLocationSelection.lng !== null) params.lng = String(filterLocationSelection.lng);
            if (filterLocationSelection.lat !== null && filterLocationSelection.radiusKm > 0) params.radius_km = String(filterLocationSelection.radiusKm);
            if (filterDaysInSystem > 0) params.days_in_system = String(filterDaysInSystem);
            if (filterFloors.length > 0) params.floors = filterFloors.join(',');
            if (filterDaysNoVisit > 0) params.days_no_visit = String(filterDaysNoVisit);
            const res = await getInventory(params);
            if (res?.data && Array.isArray(res.data)) {
                setItems(res.data);
                setTotalPages(res.totalPages || 1);
                setTotalCount(res.total ?? res.data.length);
            } else if (Array.isArray(res)) {
                setItems(res);
                setTotalPages(1);
                setTotalCount(res.length);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const activeSheetFilterCount = (
        (filterLocationSelection.lat !== null ? 1 : 0) +
        (filterTaxonomy.nodeIds.length > 0 ? 1 : 0) +
        (filterTaxonomy.bhk.length > 0 ? 1 : 0) +
        (filterListingSource ? 1 : 0) +
        (filterDataSource ? 1 : 0) +
        (filterAgent ? 1 : 0) +
        (filterDaysInSystem > 0 ? 1 : 0) +
        (filterDaysNoVisit > 0 ? 1 : 0) +
        (filterFloors.length > 0 ? 1 : 0)
    );

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
                <button onClick={() => setShowFilterSheet(true)}
                    style={{
                        flexShrink: 0, padding: '6px 14px', borderRadius: '20px',
                        border: activeSheetFilterCount > 0 ? '1px solid #4F46E5' : '1px solid var(--border-secondary)',
                        backgroundColor: activeSheetFilterCount > 0 ? '#4F46E5' : 'var(--bg-secondary)',
                        color: activeSheetFilterCount > 0 ? '#fff' : 'var(--text-secondary)',
                        fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                    }}>
                    ⚙ Filters{activeSheetFilterCount > 0 ? ` (${activeSheetFilterCount})` : ''}
                    {activeSheetFilterCount > 0 && (
                        <span style={{
                            marginLeft: 6, padding: '1px 7px', borderRadius: 999,
                            backgroundColor: 'rgba(255,255,255,0.25)', fontWeight: 700, fontSize: '12px',
                        }}>
                            {totalCount}
                        </span>
                    )}
                </button>
            </div>


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
                                <div
                                    key={item.id}
                                    className="clay-card"
                                    onClick={() => setActiveSheetItem(item)}
                                    style={{
                                        marginBottom: '10px',
                                        padding: '14px 16px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px',
                                        border: '1px solid var(--border-primary)',
                                    }}
                                >
                                    {/* Top row: thumbnail + info */}
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        {/* Thumbnail */}
                                        <div style={{ width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, backgroundColor: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {item.media_urls?.[0] ? (
                                                <img src={item.media_urls[0]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                                            ) : (
                                                <span style={{ fontSize: '22px', color: 'var(--text-muted)', fontWeight: 700 }}>
                                                    {(item.taxonomy_node?.name || item.flat_property_type?.name || item.type || 'P')[0].toUpperCase()}
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
                                                {item.taxonomy_node?.name || item.flat_property_type?.name || item.property_type_link?.name || item.type?.replace(/_/g, ' ') || 'Property'}
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {location}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Dual Pricing */}
                                    <div style={{ display: 'flex', gap: '8px', fontSize: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
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
                                        <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                                            {specs.bedrooms && <span>{specs.bedrooms} BHK</span>}
                                            {specs.bathrooms && <span>{specs.bathrooms} Bath</span>}
                                            {specs.area && <span>{specs.area} {specs.area_unit || 'sqft'}</span>}
                                        </div>
                                    )}

                                    {/* Completion Bar */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', padding: '16px 0', alignItems: 'center' }}>
                        <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                            style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.4 : 1 }}>
                            Prev
                        </button>
                        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{page}/{totalPages}</span>
                        <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                            style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.4 : 1 }}>
                            Next
                        </button>
                    </div>
                )}
            </div>

            {/* FAB — Add Property */}
            {hasPermission('edit_inventory') && (
                <button type="button" onClick={onAddNew}
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

            {/* Action Bottom Sheet */}
            {activeSheetItem && (
                <div
                    style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--sheet-backdrop)', zIndex: 900 }}
                    onClick={() => setActiveSheetItem(null)}
                >
                    <div
                        style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            backgroundColor: 'var(--bg-secondary)',
                            borderRadius: '20px 20px 0 0',
                            padding: '12px 0 32px',
                            boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
                            animation: 'slide-up-in 250ms cubic-bezier(0.34,1.2,0.64,1) forwards',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Sheet handle */}
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '0 0 12px' }}>
                            <div style={{ width: '40px', height: '4px', borderRadius: '2px', backgroundColor: 'var(--border-secondary)' }} />
                        </div>

                        {/* Property title */}
                        <div style={{ padding: '0 20px 16px' }}>
                            <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>
                                {activeSheetItem.taxonomy_node?.name || activeSheetItem.flat_property_type?.name || activeSheetItem.property_type_link?.name || activeSheetItem.type?.replace(/_/g, ' ') || 'Property'}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {activeSheetItem.full_address || [activeSheetItem.locality, activeSheetItem.city || activeSheetItem.district, activeSheetItem.state].filter(Boolean).join(', ') || 'Location N/A'}
                            </div>
                        </div>

                        {/* Call Owner — shown only if phone numbers exist */}
                        {(toDialablePhone(activeSheetItem.uploader_phone) || toDialablePhone(activeSheetItem.owner_phone) || toDialablePhone(activeSheetItem.key_holder_phone)) && (
                            <>
                                {toDialablePhone(activeSheetItem.uploader_phone) && (
                                    <a
                                        href={`tel:${toDialablePhone(activeSheetItem.uploader_phone)}`}
                                        onClick={() => setActiveSheetItem(null)}
                                        style={{ display: 'block', width: '100%', padding: '16px 24px', backgroundColor: 'transparent', borderBottom: '1px solid var(--border-primary)', color: 'var(--text-primary)', fontSize: '15px', textAlign: 'left', cursor: 'pointer', fontWeight: 500, textDecoration: 'none', boxSizing: 'border-box' }}
                                    >
                                        &#9742; Call {activeSheetItem.ownership_type === 'OWNER' ? 'Owner' : 'Uploader'} — {activeSheetItem.uploader_name || activeSheetItem.uploader_phone}
                                    </a>
                                )}
                                {toDialablePhone(activeSheetItem.owner_phone) && activeSheetItem.owner_phone !== activeSheetItem.uploader_phone && (
                                    <a
                                        href={`tel:${toDialablePhone(activeSheetItem.owner_phone)}`}
                                        onClick={() => setActiveSheetItem(null)}
                                        style={{ display: 'block', width: '100%', padding: '16px 24px', backgroundColor: 'transparent', borderBottom: '1px solid var(--border-primary)', color: 'var(--text-primary)', fontSize: '15px', textAlign: 'left', cursor: 'pointer', fontWeight: 500, textDecoration: 'none', boxSizing: 'border-box' }}
                                    >
                                        &#9742; Call Owner — {activeSheetItem.owner_phone}
                                    </a>
                                )}
                                {activeSheetItem.key_holder_type === 'EXTERNAL' && toDialablePhone(activeSheetItem.key_holder_phone) && (
                                    <a
                                        href={`tel:${toDialablePhone(activeSheetItem.key_holder_phone)}`}
                                        onClick={() => setActiveSheetItem(null)}
                                        style={{ display: 'block', width: '100%', padding: '16px 24px', backgroundColor: 'transparent', borderBottom: '1px solid var(--border-primary)', color: 'var(--text-primary)', fontSize: '15px', textAlign: 'left', cursor: 'pointer', fontWeight: 500, textDecoration: 'none', boxSizing: 'border-box' }}
                                    >
                                        &#9742; Call Key Holder — {activeSheetItem.key_holder_name || activeSheetItem.key_holder_phone}
                                    </a>
                                )}
                            </>
                        )}

                        {/* Share Listing */}
                        <button
                            type="button"
                            onClick={() => { setShareItem(activeSheetItem); setActiveSheetItem(null); }}
                            style={{ display: 'block', width: '100%', padding: '16px 24px', backgroundColor: 'transparent', border: 'none', borderBottom: '1px solid var(--border-primary)', color: 'var(--text-primary)', fontSize: '15px', textAlign: 'left', cursor: 'pointer', fontWeight: 500 }}
                        >
                            📤 Share Listing
                        </button>

                        {/* Schedule Visit */}
                        <button
                            type="button"
                            onClick={() => { setBookVisitItem(activeSheetItem); setActiveSheetItem(null); }}
                            style={{ display: 'block', width: '100%', padding: '16px 24px', backgroundColor: 'transparent', border: 'none', borderBottom: '1px solid var(--border-primary)', color: 'var(--text-primary)', fontSize: '15px', textAlign: 'left', cursor: 'pointer', fontWeight: 500 }}
                        >
                            📍 Schedule Visit
                        </button>

                        {/* Edit */}
                        <button
                            type="button"
                            onClick={() => { onEditItem(activeSheetItem); setActiveSheetItem(null); }}
                            style={{ display: 'block', width: '100%', padding: '16px 24px', backgroundColor: 'transparent', border: 'none', borderBottom: '1px solid var(--border-primary)', color: 'var(--text-primary)', fontSize: '15px', textAlign: 'left', cursor: 'pointer', fontWeight: 500 }}
                        >
                            ✏️ Edit Property
                        </button>

                        {/* Deactivate — ownership guard from Task 4 */}
                        {hasPermission('edit_inventory') && (activeSheetItem.uploaded_by_agent?.id === agent?.id || agent?.role === 'super_boss' || agent?.role === 'manager') && (
                            <button
                                type="button"
                                onClick={async () => {
                                    const newStatus = activeSheetItem.status === 'active' ? 'inactive' : 'active';
                                    const ok = await confirm(`${newStatus === 'inactive' ? 'Deactivate' : 'Activate'}?`);
                                    if (!ok) return;
                                    try {
                                        await updateInventory(activeSheetItem.id, { status: newStatus });
                                        setActiveSheetItem(null);
                                        loadData();
                                    } catch (err: any) {
                                        showToast(err.response?.data?.error || 'Failed', 'error');
                                    }
                                }}
                                style={{ display: 'block', width: '100%', padding: '16px 24px', backgroundColor: 'transparent', border: 'none', color: '#ef4444', fontSize: '15px', textAlign: 'left', cursor: 'pointer', fontWeight: 500 }}
                            >
                                🚫 {activeSheetItem.status === 'active' ? 'Deactivate' : 'Activate'}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ── Inventory Filter Bottom Sheet ── */}
            {showFilterSheet && (
                <div
                    style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--sheet-backdrop)', zIndex: 950 }}
                    onClick={() => setShowFilterSheet(false)}
                >
                    <div
                        style={{
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
                                setFilterListingSource(''); setFilterDataSource('');
                                setFilterTaxonomy({ nodeIds: [], bhk: [] });
                                setFilterLocationSelection({ label: '', lat: null, lng: null, radiusKm: 2 });
                                setFilterDaysInSystem(0); setFilterDaysNoVisit(0);
                                setFilterFloors([]);
                                setFilterAgent('');
                            }} style={{ background: 'none', border: 'none', color: 'var(--text-link)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                                Clear All
                            </button>
                        </div>

                        <FilterLocationSection value={filterLocationSelection} onChange={setFilterLocationSelection} />

                        <FilterSection title="Listing Source" defaultOpen={false} badge={filterListingSource ? 1 : 0}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {[
                                    { label: 'Direct Owner', value: 'OWNER' },
                                    { label: 'Partner Agent', value: 'EXTERNAL_AGENT' },
                                    { label: 'Internal Agent', value: 'AGENT_OWNER' },
                                ].map(opt => (
                                    <button key={opt.value} type="button"
                                        onClick={() => setFilterListingSource(filterListingSource === opt.value ? '' : opt.value)}
                                        className={`chip ${filterListingSource === opt.value ? 'chip-active' : 'chip-inactive'}`}>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </FilterSection>

                        <FilterSection title="Purpose" defaultOpen badge={filterIntent ? 1 : 0}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {[{ label: 'Sale', value: 'sell' }, { label: 'Rent', value: 'rent' }].map(opt => (
                                    <button key={opt.value} type="button"
                                        onClick={() => setFilterIntent(filterIntent === opt.value ? '' : opt.value)}
                                        className={`chip ${filterIntent === opt.value ? 'chip-active' : 'chip-inactive'}`}>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </FilterSection>

                        <FilterTaxonomySection
                            tree={taxonomyTree}
                            value={filterTaxonomy}
                            onChange={setFilterTaxonomy}
                        />

                        <FilterFloorSection value={filterFloors} onChange={setFilterFloors} />

                        <FilterSection title="Listing Status" defaultOpen={false} badge={filterStatus ? 1 : 0}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {['active', 'sold', 'rented', 'withdrawn'].map(s => (
                                    <button key={s} type="button"
                                        onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
                                        className={`chip ${filterStatus === s ? 'chip-active' : 'chip-inactive'}`}>
                                        {s.charAt(0).toUpperCase() + s.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </FilterSection>

                        {agentsList.length > 0 && (
                            <FilterSection title="Agent" defaultOpen={false} badge={filterAgent ? 1 : 0}>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {agentsList.map((a: any) => (
                                        <button key={a.id} type="button"
                                            onClick={() => setFilterAgent(filterAgent === a.id ? '' : a.id)}
                                            className={`chip ${filterAgent === a.id ? 'chip-active' : 'chip-inactive'}`}>
                                            {a.name}
                                        </button>
                                    ))}
                                </div>
                            </FilterSection>
                        )}

                        <FilterSection title="Data Source" defaultOpen={false} badge={filterDataSource ? 1 : 0}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {[
                                    { label: 'WhatsApp', value: 'whatsapp' },
                                    { label: 'Website', value: 'website' },
                                    { label: 'Manual Entry', value: 'admin' },
                                    { label: 'Mobile App', value: 'mobile_app' },
                                    { label: 'Voice', value: 'voice' },
                                ].map(opt => (
                                    <button key={opt.value} type="button"
                                        onClick={() => setFilterDataSource(filterDataSource === opt.value ? '' : opt.value)}
                                        className={`chip ${filterDataSource === opt.value ? 'chip-active' : 'chip-inactive'}`}>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </FilterSection>

                        <StalenessSection
                            title="Inventory Staleness"
                            label1="Days in system (unsold)"
                            label2="Days since last visit"
                            days1={filterDaysInSystem}
                            days2={filterDaysNoVisit}
                            onDays1Change={setFilterDaysInSystem}
                            onDays2Change={setFilterDaysNoVisit}
                            badge={(filterDaysInSystem > 0 ? 1 : 0) + (filterDaysNoVisit > 0 ? 1 : 0)}
                        />

                        {/* Apply button */}
                        <div style={{ padding: '16px 20px 0' }}>
                            <button type="button"
                                onClick={() => setShowFilterSheet(false)}
                                style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: 'var(--text-link)', color: '#fff', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}
                            >
                                Apply Filters{activeSheetFilterCount > 0 ? ` (${activeSheetFilterCount} active)` : ''}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
