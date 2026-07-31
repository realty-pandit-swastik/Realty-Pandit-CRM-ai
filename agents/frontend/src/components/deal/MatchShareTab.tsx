import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Deal } from '../../api/client';
import { getDealMatchedInventory, shareDealProperties, recordPersonalShare, getInventoryItem, getTaxonomyTree } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { toDialablePhone } from '../../lib/phone';
import { getDisplayFloor } from '../../lib/floor';
import { CopyChip } from '../CopyChip';
import { InventoryFilterCommandBar } from './InventoryFilterCommandBar';
import { bhkOf, societyOf, propertyTypeLabel } from '../../lib/specChips';

interface MatchedProperty {
    id: string;
    type: string;
    location: string;
    city: string;
    sub_locality?: string | null;
    locality?: string | null;
    state?: string | null;
    pincode?: string | null;
    description?: string | null;
    slug?: string | null;
    display_id?: string | null;
    price: number | null;
    display_price?: number | null;
    price_unit: string | null;
    facing?: string | null;
    property_age?: string | null;
    furnishing?: string | null;
    floor_number?: number | null;
    floor_label?: string | null;
    display_floor?: string | null;
    total_floors?: number | null;
    features?: Record<string, any> | string[] | null;
    match_score: number;
    match_reason?: string | null;
    distance_km?: number | null;
    already_shared: boolean;
    shared_by_name?: string | null; // Task 4: who already shared it on this deal
    media_urls?: string[];
    specs?: { society_name?: string; bhk_count?: number; bedrooms?: number; bathrooms?: number; area?: number; area_unit?: string };
    intent?: string;
}

// ── Canonical taxonomy tree (GET /public/taxonomy/tree) — same source the demand form uses ──
interface TaxonomyTreeNode { id: string; name: string; slug: string; node_kind: string; children?: TaxonomyTreeNode[] }

interface Props {
    deal: Deal;
    onShared: () => void;
}

function formatPrice(price: number | null, _unit?: string | null): string {
    if (!price) return '-';
    if (price >= 10000000) return `₹${(price / 10000000).toFixed(1)}Cr`;
    if (price >= 100000)   return `₹${(price / 100000).toFixed(1)}L`;
    if (price >= 1000)     return `₹${(price / 1000).toFixed(0)}K`;
    return `₹${price}`;
}

// Readable label fallback for property type slugs in messages/result rows.
function prettyType(type: string): string {
    if (!type) return 'Property';
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Title-case a slug-ish value ("south_west" → "South West", "3-5_years" → "3-5 Years").
function prettyValue(s?: string | null): string {
    if (!s) return '';
    return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Most listings don't fill specs.bhk_count, but the slug encodes it ("3bhk-villa-…").
function bhkFromSlug(slug?: string | null): number | null {
    const m = (slug || '').match(/(\d+)\s*bhk/i);
    return m ? parseInt(m[1], 10) : null;
}

// Multi-word state → initials ("Uttar Pradesh" → "UP"); single-word kept as-is.
function abbrevState(state?: string | null): string {
    if (!state) return '';
    const words = state.trim().split(/\s+/);
    return words.length > 1 ? words.map(w => w[0].toUpperCase()).join('') : state;
}

// Price in compact Indian units, trimming trailing zeros (1.25Cr, 40 L, 18 K).
function priceForMsg(n?: number | null): string {
    if (!n || n <= 0) return 'Price on request';
    const trim = (x: number) => parseFloat(x.toFixed(2)).toString();
    if (n >= 1e7) return `₹${trim(n / 1e7)} Cr`;
    if (n >= 1e5) return `₹${trim(n / 1e5)} L`;
    if (n >= 1e3) return `₹${Math.round(n / 1e3)} K`;
    return `₹${n}`;
}

// Amenities from the saved `features` JSON (object of truthy flags, or array).
function featureList(features?: Record<string, any> | string[] | null): string {
    if (!features) return '';
    const list = Array.isArray(features) ? features : Object.keys(features).filter(k => (features as any)[k]);
    return list.slice(0, 6).map(f => prettyValue(String(f))).join(', ');
}

// ── Taxonomy helpers ──────────────────────────────────────────────────────────
// Path root→node (used to resolve the deal's category / sub-category / type).
function findPath(nodes: TaxonomyTreeNode[], targetId: string, anc: TaxonomyTreeNode[] = []): TaxonomyTreeNode[] | null {
    for (const n of nodes) {
        if (n.id === targetId) return [...anc, n];
        if (n.children?.length) {
            const r = findPath(n.children, targetId, [...anc, n]);
            if (r) return r;
        }
    }
    return null;
}
// All TYPE-level nodes under a category, grouped by their immediate sub-category for display.
// TYPE nodes are what inventory is actually classified by (legacy_sub_category_id), so these
// are the chips the "Type" multi-select offers. Default = the deal's own TYPE node.
function collectTypeGroups(category: TaxonomyTreeNode): { sub: string; types: TaxonomyTreeNode[] }[] {
    const groups: { sub: string; types: TaxonomyTreeNode[] }[] = [];
    for (const sub of category.children || []) {
        const types: TaxonomyTreeNode[] = [];
        const walk = (n: TaxonomyTreeNode) => {
            if (n.node_kind === 'TYPE') types.push(n);
            (n.children || []).forEach(walk);
        };
        (sub.children || []).forEach(walk);
        if (types.length) groups.push({ sub: sub.name, types });
    }
    return groups;
}

export function InventoryPreviewModal({ inventoryId, onClose }: { inventoryId: string; onClose: () => void }) {
    const [inv, setInv] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getInventoryItem(inventoryId)
            .then((data: any) => setInv(data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [inventoryId]);

    const API_BASE = 'https://api.realtypandit.in';
    const imageUrl = inv?.media_urls?.[0]
        ? (inv.media_urls[0].startsWith('http') ? inv.media_urls[0] : `${API_BASE}${inv.media_urls[0]}`)
        : null;

    const bhkVal = bhkOf(inv?.specs);
    const title = bhkVal
        ? `${bhkVal}BHK ${propertyTypeLabel(inv)}`
        : propertyTypeLabel(inv);
    const society = societyOf(inv);
    const price = inv ? formatPrice(inv.price, inv.price_unit) : '-';

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 300, backdropFilter: 'blur(2px)' }} />
            <div style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                backgroundColor: 'var(--bg-primary)', borderRadius: 14, width: 480, maxWidth: '95vw',
                maxHeight: '85vh', overflow: 'auto', zIndex: 301,
                boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border-secondary)' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Property Details</div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
                </div>

                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
                ) : !inv ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Property not found</div>
                ) : (
                    <div style={{ padding: 18 }}>
                        {/* Image */}
                        {imageUrl && (
                            <img src={imageUrl} alt="" style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 10, marginBottom: 14 }} />
                        )}

                        {/* Title + price */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                            <div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
                                {/* #1 (2026-07-01): click-to-copy inventory code so it's easy to paste into the inventory search. */}
                                {inv.display_id && <div style={{ marginTop: 4 }}><CopyChip text={inv.display_id} size="xs" /></div>}
                                {society && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{society}</div>}
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>📍 {[inv.locality, inv.city, inv.state].filter(Boolean).join(', ')}</div>
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-primary)', flexShrink: 0, marginLeft: 12 }}>{price}</div>
                        </div>

                        {/* Specs grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', marginBottom: 12 }}>
                            {bhkVal && <SpecRow label="BHK" value={`${bhkVal} BHK`} />}
                            {inv.specs?.area && <SpecRow label="Area" value={`${inv.specs.area} sq.ft`} />}
                            {(inv.specs?.floors ?? inv.specs?.floor) && <SpecRow label="Floor" value={String(inv.specs?.floors ?? inv.specs?.floor)} />}
                            {inv.specs?.furnishing && <SpecRow label="Furnishing" value={inv.specs.furnishing} />}
                            {inv.specs?.facing && <SpecRow label="Facing" value={inv.specs.facing} />}
                            {inv.intent && <SpecRow label="Intent" value={inv.intent === 'sell' ? 'For Sale' : inv.intent === 'rent' ? 'For Rent' : inv.intent} />}
                            {inv.status && <SpecRow label="Status" value={inv.status} />}
                            {inv.ownership_type && <SpecRow label="Listed by" value={inv.ownership_type} />}
                        </div>

                        {/* Classification */}
                        {(inv.property_category || inv.property_sub_category || inv.flat_property_type) && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                                {[inv.property_category?.name, inv.property_sub_category?.name, inv.flat_property_type?.name].filter(Boolean).join(' → ')}
                            </div>
                        )}

                        {/* Description */}
                        {inv.description && (
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, borderTop: '1px solid var(--border-secondary)', paddingTop: 10 }}>
                                {inv.description}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}

function SpecRow({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ fontSize: 11 }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{label}: </span>
            <span style={{ color: 'var(--text-primary)' }}>{value}</span>
        </div>
    );
}

const BHK_CHOICES = [1, 2, 3, 4, 5];
const RADIUS_CHOICES = [2, 5, 10, 20];

export function MatchShareTab({ deal, onShared }: Props) {
    const { showToast } = useToast();
    const confirm = useConfirm();

    // ── Canonical demand off the deal (SoT) ───────────────────────────────────
    const dealSV = ((deal as any).demand_schema_values
        ?? (deal.demand_contact as any)?.demand_schema_values ?? {}) as Record<string, any>;
    const demandNodeId: string | null = (deal as any).demand_taxonomy_node_id
        ?? (deal.demand_contact as any)?.demand_taxonomy_node_id ?? null;
    const dealBhk: number | null = (() => {
        // residential stores `bhk`, commercial stores `rooms` — both ride the same selector + bhk_list filter.
        const v = dealSV.bhk ?? dealSV.rooms;
        if (typeof v === 'number') return v;
        if (typeof v === 'string') { const n = parseInt(v.replace(/\D/g, ''), 10); return Number.isNaN(n) ? null : n; }
        return null;
    })();
    const hasGeo = (deal.demand_contact as any)?.preferred_lat != null && (deal.demand_contact as any)?.preferred_lng != null;
    // Canonical, country-coded recipient for any WhatsApp send. null for placeholder/junk phones
    // (e.g. a partner-referral deal whose contact PK is a PENDING- key) → both send buttons disable.
    const customerTel = toDialablePhone(deal.demand_contact?.phone_number);
    // #6 (2026-06-28): if the buyer has no real phone yet (partner-referral deal with a PENDING- contact),
    // fall back to the partner agent's number → backend sends them the brandless brochure.
    const partnerTel = toDialablePhone((deal.demand_contact as any)?.referral_partner_phone);
    const partnerName = (deal.demand_contact as any)?.referral_partner_name as string | undefined;
    const shareTel = customerTel || partnerTel;
    // 2026-07-31: auto-detect the recipient's TYPE. A deal whose contact IS a partner agent (dealer) —
    // even with a real phone — must get the brandless partner content; a BUYER/TENANT gets branded content.
    // (Mirrors the backend resolveShareMode, which keys company sends off the ACTIVE PartnerAgent table.)
    const shareToPartner = (deal.demand_contact as any)?.contact_type === 'PARTNER_AGENT' || (!customerTel && !!partnerTel);

    // ── Filter state ───────────────────────────────────────────────────────────
    const [intent] = useState<string>(deal.demand_intent || 'buy');
    const [bhkSet, setBhkSet] = useState<Set<number>>(new Set(dealBhk != null ? [dealBhk] : []));
    const [typeNodeSet, setTypeNodeSet] = useState<Set<string>>(new Set());
    const [budgetMin, setBudgetMin] = useState<string>(deal.demand_budget_min?.toString() || '');
    const [budgetMax, setBudgetMax] = useState<string>(deal.demand_budget_max?.toString() || '');
    const [radiusKm, setRadiusKm] = useState<number | null>(null); // null = auto-escalate 2→20
    const [location, setLocation] = useState<string>(deal.demand_location || (deal.demand_contact as any)?.preferred_location || '');
    const [roofRights, setRoofRights] = useState<boolean>(false); // roof-rights match filter (2026-06-28)
    // Manual Match & Share filters (2026-07-24) — hard filters the agent toggles, not match signals.
    const [areaMin, setAreaMin] = useState<string>('');
    const [areaMax, setAreaMax] = useState<string>('');
    const [areaUnit, setAreaUnit] = useState<string>('sqft'); // sqft | sqyd | sqm
    const [floorMin, setFloorMin] = useState<string>('');
    const [floorMax, setFloorMax] = useState<string>('');
    const [renovated, setRenovated] = useState<boolean>(false);
    const [preLeased, setPreLeased] = useState<boolean>(false);
    const [commercialUse, setCommercialUse] = useState<boolean>(false); // 2026-07-29 residential-usable-as-commercial

    const [results, setResults] = useState<MatchedProperty[]>([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [sending, setSending] = useState(false);
    const [sendResults, setSendResults] = useState<Record<string, 'pending' | 'sent' | 'failed'>>({});
    const [previewId, setPreviewId] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<'score' | 'price' | 'distance'>('score');
    const [broadenNote, setBroadenNote] = useState<string>('');
    const [budgetRaised, setBudgetRaised] = useState(false);

    // ── Taxonomy tree + the deal's path / type options ─────────────────────────
    const [tree, setTree] = useState<TaxonomyTreeNode[]>([]);
    useEffect(() => {
        let cancelled = false;
        getTaxonomyTree().then((data: any) => {
            if (cancelled) return;
            const roots: TaxonomyTreeNode[] = Array.isArray(data) ? data : (data?.tree || data?.roots || []);
            setTree(roots);
        }).catch(() => { if (!cancelled) setTree([]); });
        return () => { cancelled = true; };
    }, []);

    const demandPath = useMemo(() => (demandNodeId && tree.length ? (findPath(tree, demandNodeId) || []) : []), [tree, demandNodeId]);
    const categoryNode = demandPath[0] || null;
    const subCatLabel = demandPath[1]?.name || null;
    const dealTypeNode = demandPath.length ? demandPath[demandPath.length - 1] : null;
    // Which spec selector fits this deal: residential→BHK, commercial→Rooms, plot/land/orchard→none.
    // Both BHK and Rooms send the same `bhk_list` param (the matcher filters the bhk→rooms→bedrooms chain).
    // Default to BHK when the category is unknown/still loading (preserves the residential default).
    const specMode: 'bhk' | 'rooms' | 'none' = useMemo(() => {
        const catSlug = (categoryNode?.slug || '').toLowerCase();
        const leaf = `${dealTypeNode?.slug || ''} ${subCatLabel || ''}`.toLowerCase();
        if (/plot|land|orchard/.test(leaf)) return 'none';
        if (catSlug === 'commercial') return 'rooms';
        return 'bhk';
    }, [categoryNode, dealTypeNode, subCatLabel]);
    const specLabel = specMode === 'rooms' ? 'Rooms' : 'BHK';
    const typeGroups = useMemo(() => (categoryNode ? collectTypeGroups(categoryNode) : []), [categoryNode]);

    // ── Search ─────────────────────────────────────────────────────────────────
    type Snapshot = { bhkSet: Set<number>; typeNodeSet: Set<string>; budgetMin: string; budgetMax: string; radiusKm: number | null; location: string; roofRights: boolean; areaMin: string; areaMax: string; areaUnit: string; floorMin: string; floorMax: string; renovated: boolean; preLeased: boolean; commercialUse: boolean };
    const buildParams = (s: Snapshot): Record<string, string> => {
        const p: Record<string, string> = {};
        if (intent) p.intent = intent;
        if (s.budgetMin) p.budget_min = s.budgetMin;
        if (s.budgetMax) p.budget_max = s.budgetMax;
        if (s.bhkSet.size) p.bhk_list = [...s.bhkSet].sort((a, b) => a - b).join(',');
        if (s.typeNodeSet.size) p.type_node_list = [...s.typeNodeSet].join(',');
        if (s.radiusKm != null) p.radius_km = String(s.radiusKm);
        if (s.roofRights) p.roof_rights = 'true';
        if (s.areaMin || s.areaMax) {
            if (s.areaMin) p.area_min = s.areaMin;
            if (s.areaMax) p.area_max = s.areaMax;
            p.area_unit = s.areaUnit; // unit set → backend routes to the unit-aware post-filter
        }
        if (s.floorMin) p.floor_min = s.floorMin;
        if (s.floorMax) p.floor_max = s.floorMax;
        if (s.renovated) p.renovated = 'true';
        if (s.preLeased) p.pre_leased = 'true';
        if (s.commercialUse) p.commercial_use = 'true';
        // Always send `location` (even empty) so clearing it actually drops the filter — the
        // endpoint only falls back to the deal's stored location when the param is ABSENT.
        p.location = s.location || '';
        return p;
    };

    const runSearch = useCallback(async (override?: Partial<Snapshot>) => {
        const snap: Snapshot = { bhkSet, typeNodeSet, budgetMin, budgetMax, radiusKm, location, roofRights, areaMin, areaMax, areaUnit, floorMin, floorMax, renovated, preLeased, commercialUse, ...override };
        setLoading(true);
        setSendResults({});
        try {
            const res = await getDealMatchedInventory(deal.id, buildParams(snap));
            setResults(res.data || []);
        } catch {
            showToast('Failed to load matches', 'error');
        } finally {
            setLoading(false);
        }
    }, [deal.id, bhkSet, typeNodeSet, budgetMin, budgetMax, radiusKm, location, roofRights, areaMin, areaMax, areaUnit, floorMin, floorMax, renovated, preLeased, commercialUse, intent, showToast]);

    // First load: once the tree resolves, default-select the deal's own TYPE node and search
    // with it EXPLICITLY (override) — avoids the stale-closure race where the auto-search would
    // otherwise fire before the setTypeNodeSet state update is applied.
    const firstSearchRef = useRef(false);
    useEffect(() => {
        if (firstSearchRef.current || tree.length === 0) return;
        firstSearchRef.current = true;
        const initialTypes = dealTypeNode?.node_kind === 'TYPE' ? new Set<string>([dealTypeNode.id]) : new Set<string>();
        if (initialTypes.size) setTypeNodeSet(initialTypes);
        runSearch({ typeNodeSet: initialTypes });
    }, [tree, dealTypeNode, runSearch]);

    // ── Filter toggles ─────────────────────────────────────────────────────────
    const toggleBhk = (n: number) => {
        const next = new Set(bhkSet);
        next.has(n) ? next.delete(n) : next.add(n);
        setBhkSet(next);
        runSearch({ bhkSet: next });
    };
    const toggleType = (id: string) => {
        const next = new Set(typeNodeSet);
        next.has(id) ? next.delete(id) : next.add(id);
        setTypeNodeSet(next);
        runSearch({ typeNodeSet: next });
    };
    const changeRadius = (km: number | null) => {
        setRadiusKm(km);
        runSearch({ radiusKm: km });
    };

    // ── Smart Broaden — relax one axis at a time, narrate each step ─────────────
    const broaden = async () => {
        // 0. No-geo deals with a text location are the #1 cause of zero results (brittle/typo text
        // that matches no inventory). Drop it first — geo deals skip this (radius drives location).
        if (!hasGeo && location) {
            setLocation('');
            setBroadenNote('Searched without the location text (this deal has no map pin)');
            runSearch({ location: '' });
            return;
        }
        // 1. Widen radius (only meaningful if a specific radius is pinned and < max)
        if (radiusKm != null && radiusKm < RADIUS_CHOICES[RADIUS_CHOICES.length - 1]) {
            const next = RADIUS_CHOICES.find(r => r > radiusKm)!;
            setRadiusKm(next);
            setBroadenNote(`Widened radius to ${next} km`);
            runSearch({ radiusKm: next });
            return;
        }
        // 2. Expand BHK ±1
        if (bhkSet.size) {
            const min = Math.min(...bhkSet), max = Math.max(...bhkSet);
            const next = new Set(bhkSet);
            if (min - 1 >= 1) next.add(min - 1);
            if (max + 1 <= 5) next.add(max + 1);
            if (next.size > bhkSet.size) {
                setBhkSet(next);
                setBroadenNote(`Expanded BHK to ${[...next].sort((a, b) => a - b).join(', ')}`);
                runSearch({ bhkSet: next });
                return;
            }
        }
        // 3. Raise the budget cap — never silently; agent confirms.
        if (!budgetRaised && budgetMax) {
            const cur = Number(budgetMax);
            const raised = Math.round(cur * 1.15);
            const ok = await confirm(`Raise max budget to ${formatPrice(raised)} (from ${formatPrice(cur)}) to see more?`);
            if (ok) {
                setBudgetMax(String(raised));
                setBudgetRaised(true);
                setBroadenNote(`Raised budget cap to ${formatPrice(raised)}`);
                runSearch({ budgetMax: String(raised) });
            }
            return;
        }
        // 4. Drop the Type filter (search the whole category/sub-category)
        if (typeNodeSet.size) {
            setTypeNodeSet(new Set());
            setBroadenNote('Dropped type filter — searching all property types');
            runSearch({ typeNodeSet: new Set() });
            return;
        }
        setBroadenNote('No further broadening available — try adjusting filters manually');
    };

    const toggleSelect = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        // Task 4: a property already shared on this deal (by anyone) is locked — must pick another.
        if (results.find(r => r.id === id)?.already_shared) return;
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const sortedResults = useMemo(() => {
        const r = [...results];
        if (sortBy === 'price') r.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
        else if (sortBy === 'distance') r.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
        else r.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
        // Keep already-shared at the bottom regardless of sort.
        r.sort((a, b) => Number(a.already_shared) - Number(b.already_shared));
        return r;
    }, [results, sortBy]);

    const sendViaCompanyWA = async () => {
        if (selected.size === 0) return;
        setSending(true);
        const ids = Array.from(selected);
        ids.forEach(id => setSendResults(p => ({ ...p, [id]: 'pending' })));
        try {
            const res = await shareDealProperties(deal.id, ids);
            const shareResults: any[] = res.data.results || [];
            shareResults.forEach((r: any) => {
                setSendResults(p => ({ ...p, [r.inventory_id]: r.sent ? 'sent' : 'failed' }));
            });
            const sentCount = shareResults.filter((r: any) => r.sent).length;
            showToast(`${sentCount} propert${sentCount === 1 ? 'y' : 'ies'} sent via WhatsApp`, 'success');
            setSelected(new Set());
            onShared();
        } catch {
            showToast('Send failed', 'error');
        } finally {
            setSending(false);
        }
    };

    const sendViaPersonalWA = () => {
        if (selected.size === 0) return;
        const selectedProps = results.filter(r => selected.has(r.id));
        const multi = selectedProps.length > 1;
        const isRent = (i?: string) => i === 'rent' || i === 'rent_lease' || i === 'lease';
        // 2026-07-29: a partner-referral deal (no client phone) shares to the PARTNER AGENT — send a
        // BRANDLESS message (no RP sign-off, no exact locality/unit, no RP link) so they present it as
        // their own to their buyer. A normal client deal keeps the full branded message.
        const brandless = shareToPartner;

        const blocks = selectedProps.map((p, i) => {
            const beds = p.specs?.bhk_count || p.specs?.bedrooms || bhkFromSlug(p.slug);
            const title = beds ? `${beds}BHK ${prettyType(p.type)}` : prettyType(p.type);
            const intentLabel = isRent(p.intent) ? 'For Rent' : 'For Sale';

            const seenLoc = new Set<string>();
            const locParts = (brandless
                ? [(p as any).apartment_name, p.locality, p.city, abbrevState(p.state)]
                : [p.sub_locality, p.locality, p.city, abbrevState(p.state)])
                .map(x => (x || '').trim())
                .filter(x => { const k = x.toLowerCase(); if (!x || seenLoc.has(k)) return false; seenLoc.add(k); return true; });
            let locLine = locParts.join(', ');
            if (!brandless && p.pincode) locLine += ` – ${p.pincode}`;

            const specBits: string[] = [];
            if (p.specs?.area) specBits.push(`📐 ${p.specs.area} ${p.specs.area_unit || 'sq.ft'}`);
            if (beds) specBits.push(`🛏 ${beds} Bed`);
            if (p.specs?.bathrooms) specBits.push(`🛁 ${p.specs.bathrooms} Bath`);

            const ffBits: string[] = [];
            { const _fl = getDisplayFloor(p); if (_fl && p.total_floors) ffBits.push(`🏢 Floor ${_fl} of ${p.total_floors}`); else if (_fl) ffBits.push(`🏢 Floor ${_fl}`); }
            if (p.facing) ffBits.push(`🧭 ${prettyValue(p.facing)}`);

            const amenities = featureList(p.features);
            const desc = p.description ? p.description.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
            const link = `https://www.realtypandit.in/properties/${p.slug || p.display_id || p.id}`;

            const lines: string[] = [`🏡 *${title}* — ${intentLabel}`];
            if (locLine) lines.push(`📍 ${locLine}`);
            lines.push('');
            lines.push(`💰 *${priceForMsg(p.display_price ?? p.price)}*${isRent(p.intent) ? '/month' : ''}`);
            if (specBits.length) lines.push(specBits.join('   '));
            if (ffBits.length) lines.push(ffBits.join('   '));
            if (p.property_age) lines.push(`🏗 Age: ${prettyValue(p.property_age)}`);
            if (p.furnishing) lines.push(`🛋 ${prettyValue(p.furnishing)}`);
            if (amenities) lines.push(`✨ ${amenities}`);
            if (desc) lines.push(`📝 ${desc}`);
            if (!brandless) {   // partner (brandless) → omit the Realty Pandit website link
                lines.push('');
                lines.push('🔗 Photos & full details:');
                lines.push(link);
            }

            const block = lines.join('\n');
            return multi ? `*${i + 1}.*\n${block}` : block;
        });

        const body = blocks.join('\n\n');
        const msg = encodeURIComponent(
            brandless
                ? body   // partner: brandless — no Realty Pandit sign-off
                : `Hi! Here are some properties for you:\n\n${body}\n\n— Realty Pandit Team`
        );
        if (!shareTel) return;
        window.open(`https://wa.me/${shareTel.slice(1)}?text=${msg}`, '_blank');

        // Record the personal-WhatsApp share so it appears in the Shared tab + timeline (owner-approved).
        const sharedIds = selectedProps.map(p => p.id);
        recordPersonalShare(deal.id, sharedIds, brandless).then(() => onShared()).catch(() => { /* non-fatal — wa.me already opened */ });
        showToast(brandless ? 'Opened personal WhatsApp (brandless, for partner) — recorded' : 'Opened personal WhatsApp — recorded', 'success');
        setSelected(new Set());
    };

    const inputStyle: React.CSSProperties = {
        padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border-secondary)',
        backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12,
        outline: 'none', width: '100%', boxSizing: 'border-box',
    };
    return (
        <div style={{ padding: '14px 20px' }}>
            {/* Command-menu filter bar (2026-07-08) — filters live as removable tokens inside one
                expandable search bar (click/type → facet dropdown). Replaces the old chip-wall;
                same underlying matched-inventory params. */}
            <InventoryFilterCommandBar
                bhkSet={bhkSet}
                typeNodeSet={typeNodeSet}
                budgetMin={budgetMin}
                budgetMax={budgetMax}
                radiusKm={radiusKm}
                location={location}
                roofRights={roofRights}
                specMode={specMode}
                specLabel={specLabel}
                bhkChoices={BHK_CHOICES}
                radiusChoices={RADIUS_CHOICES}
                typeGroups={typeGroups}
                hasGeo={hasGeo}
                categoryName={categoryNode?.name ?? subCatLabel}
                formatPrice={formatPrice}
                onToggleBhk={toggleBhk}
                onToggleType={toggleType}
                onSetBudget={(min, max) => { setBudgetMin(min); setBudgetMax(max); runSearch({ budgetMin: min, budgetMax: max }); }}
                onChangeRadius={changeRadius}
                onSetLocation={(loc) => { setLocation(loc); runSearch({ location: loc }); }}
                onToggleRoof={() => { const next = !roofRights; setRoofRights(next); runSearch({ roofRights: next }); }}
                areaMin={areaMin}
                areaMax={areaMax}
                areaUnit={areaUnit}
                floorMin={floorMin}
                floorMax={floorMax}
                renovated={renovated}
                preLeased={preLeased}
                commercialUse={commercialUse}
                onSetArea={(min, max, unit) => { setAreaMin(min); setAreaMax(max); setAreaUnit(unit); runSearch({ areaMin: min, areaMax: max, areaUnit: unit }); }}
                onSetFloor={(min, max) => { setFloorMin(min); setFloorMax(max); runSearch({ floorMin: min, floorMax: max }); }}
                onToggleRenovated={() => { const next = !renovated; setRenovated(next); runSearch({ renovated: next }); }}
                onTogglePreLeased={() => { const next = !preLeased; setPreLeased(next); runSearch({ preLeased: next }); }}
                onToggleCommercialUse={() => { const next = !commercialUse; setCommercialUse(next); runSearch({ commercialUse: next }); }}
            />

            {/* Slim action row — broaden + sort kept off the bar so it stays clean. */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '10px 0 14px' }}>
                <button onClick={broaden} disabled={loading} style={{
                    padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-secondary)',
                }}>➕ Broaden</button>
                {loading && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Searching…</span>}
                {broadenNote && <span style={{ fontSize: 11, color: 'var(--accent-primary)', fontWeight: 600 }}>↔ {broadenNote}</span>}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Sort</span>
                    <select aria-label="Sort results" style={{ ...inputStyle, width: 'auto', fontSize: 11, padding: '4px 8px' }} value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
                        <option value="score">Best match</option>
                        <option value="price">Price</option>
                        {hasGeo && <option value="distance">Distance</option>}
                    </select>
                </div>
            </div>

            {/* Action bar */}
            {selected.size > 0 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, padding: '8px 12px', borderRadius: 8, backgroundColor: 'var(--bg-secondary)' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, alignSelf: 'center' }}>
                        {selected.size} selected
                    </span>
                    {!shareTel && (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', alignSelf: 'center' }}>
                            No customer or partner phone on file — can't share
                        </span>
                    )}
                    {shareTel && (
                        <>
                            {shareToPartner && (
                                <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700, alignSelf: 'center' }}>
                                    🤝 To partner {partnerName || 'agent'} (brochure)
                                </span>
                            )}
                            <button onClick={sendViaCompanyWA} disabled={sending} style={{
                                padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                backgroundColor: 'rgba(37,211,102,0.12)', border: '1.5px solid rgba(37,211,102,0.5)', color: '#16a34a',
                            }}>
                                {sending ? '⏳ Sending…' : (shareToPartner ? '📤 Send brochure to partner' : '📤 Company WhatsApp')}
                            </button>
                            <button onClick={sendViaPersonalWA} style={{
                                padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                backgroundColor: 'rgba(59,130,246,0.1)', border: '1.5px solid rgba(59,130,246,0.4)', color: 'var(--btn-blue-text)',
                            }}>
                                💬 Personal WhatsApp
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Results */}
            {loading ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading matches…</div>
            ) : sortedResults.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No matching inventory found. Try ➕ Broaden or adjust filters.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sortedResults.map(prop => {
                        const isSelected = selected.has(prop.id);
                        const status = sendResults[prop.id];
                        // BHK from specs (bhk_count / bedrooms) or the slug ("3bhk-…"). When a BHK
                        // filter is active and none is readable, flag it — the backend keeps these but
                        // ranks them last (2026-07-08 strict-BHK fix). (Legacy specs.bhk also read.)
                        const beds = prop.specs?.bhk_count || prop.specs?.bedrooms || (prop.specs as any)?.bhk || bhkFromSlug(prop.slug);
                        const bhkUnknown = bhkSet.size > 0 && !beds;
                        const label = beds ? `${beds}BHK ${prettyType(prop.type)}` : prettyType(prop.type);
                        const society = prop.specs?.society_name || prop.location;
                        return (
                            <div key={prop.id} style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 12px', borderRadius: 8,
                                border: `1.5px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-secondary)'}`,
                                backgroundColor: isSelected ? 'rgba(37,99,235,0.06)' : 'var(--bg-primary)',
                                opacity: prop.already_shared ? 0.65 : 1,
                            }}>
                                <div onClick={() => setPreviewId(prop.id)} style={{ cursor: 'pointer', flexShrink: 0 }}>
                                    {prop.media_urls?.[0] ? (
                                        <img src={prop.media_urls[0]} alt="" style={{ width: 52, height: 40, borderRadius: 6, objectFit: 'cover' }} />
                                    ) : (
                                        <div style={{ width: 52, height: 40, borderRadius: 6, backgroundColor: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏡</div>
                                    )}
                                </div>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label} — {society}</div>
                                    {/* #1: click-to-copy inventory code on the tile so it's easy to paste into search. */}
                                    {prop.display_id && <div style={{ marginTop: 2 }}><CopyChip text={prop.display_id} size="xs" /></div>}
                                    {/* Strict-BHK flag (2026-07-08): this listing has no recorded BHK; kept but ranked last. */}
                                    {bhkUnknown && <div style={{ marginTop: 3, fontSize: 10, fontWeight: 700, color: '#b45309', display: 'inline-flex', alignItems: 'center', gap: 3 }}>⚠ BHK not specified</div>}
                                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>📍 {prop.city} · {formatPrice(prop.price, prop.price_unit)}</div>
                                    {prop.match_reason && (
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{prop.match_reason}</div>
                                    )}
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                                        Match: {Math.round((prop.match_score || 0))}%
                                        {prop.distance_km != null && <span> · {prop.distance_km.toFixed(1)} km</span>}
                                        {prop.already_shared && <span style={{ marginLeft: 6, color: '#f59e0b', fontWeight: 600 }}>✓ Already shared{prop.shared_by_name ? ` by ${prop.shared_by_name}` : ''}</span>}
                                        <button onClick={() => setPreviewId(prop.id)} style={{
                                            marginLeft: 8, background: 'none', border: 'none', color: 'var(--accent-primary)',
                                            fontSize: 10, cursor: 'pointer', padding: 0, fontWeight: 600,
                                        }}>👁 View</button>
                                    </div>
                                </div>

                                {status === 'pending' && <span style={{ fontSize: 14 }}>⏳</span>}
                                {status === 'sent'    && <span style={{ fontSize: 14 }}>✅</span>}
                                {status === 'failed'  && <span style={{ fontSize: 14 }}>❌</span>}

                                {prop.already_shared ? (
                                    <div title={`Already shared${prop.shared_by_name ? ` by ${prop.shared_by_name}` : ''} — pick another property`} style={{
                                        width: 18, height: 18, flexShrink: 0, display: 'flex', alignItems: 'center',
                                        justifyContent: 'center', fontSize: 12, opacity: 0.7, cursor: 'not-allowed',
                                    }}>🔒</div>
                                ) : (
                                <div onClick={e => toggleSelect(prop.id, e)} style={{
                                    width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
                                    border: `2px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-secondary)'}`,
                                    backgroundColor: isSelected ? 'var(--accent-primary)' : 'transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#fff', fontSize: 11,
                                }}>
                                    {isSelected ? '✓' : ''}
                                </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {previewId && (
                <InventoryPreviewModal inventoryId={previewId} onClose={() => setPreviewId(null)} />
            )}
        </div>
    );
}
