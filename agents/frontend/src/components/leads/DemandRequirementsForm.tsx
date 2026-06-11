/**
 * DemandRequirementsForm — single source-of-truth form for capturing buyer/tenant
 * requirements (Lead detail panel + Deal Edit + Quick-Edit during Log Call).
 *
 * Phase 2 of the demand-side unification (2026-05-29). Replaces the three separate
 * inline forms that previously diverged on field shape (Lead used demand_bhk Int,
 * Deal used demand_bedrooms String, hardcoded category cascades and amenity lists
 * across all of them). Now: ONE form, taxonomy-picker + dynamic per-type panel
 * (BHK for residential, Rooms for commercial, FAR for plots, etc.), feeding the
 * canonical { demand_taxonomy_node_id, demand_schema_values } shape that mirrors
 * inventory.specs.
 *
 * Layout (matches Add Inventory's classification step + Edit Inventory Specs tab):
 *   - Universal top row: Intent / Budget min-max / Area min-max + unit / Timeline / Location
 *   - Taxonomy cascade: Category → Sub-Category → Type → leaf node (Any at each level)
 *   - Below: dynamic NodeField renderer driven by the picked node, prefilled from
 *     demand_schema_values. Same pattern as InventoryList.tsx:1973-2005.
 *
 * The form is presentational: state lives inside, parent gets the canonical payload
 * via onSubmit. Two backend endpoints (PATCH /api/leads/:phone/requirements and
 * /api/deals/:id/requirements) already accept the canonical fields after Phase 1.
 */
import React, { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { getTaxonomyTree, getNodeFields } from '../../api/client';
import ParkingListField from '../ParkingListField';
import { loadGoogleMaps } from '../../lib/loadGoogleMaps';

// ── Taxonomy tree shape (from GET /public/taxonomy/tree) ──────────────────────
interface TaxonomyTreeNode {
    id: string;
    name: string;
    slug: string;
    node_kind: string;            // 'category' | 'sub_category' | 'type' | 'leaf'
    children?: TaxonomyTreeNode[];
}

// ── NodeField shape (from GET /public/taxonomy/nodes/:id/fields) ──────────────
interface NodeField {
    key: string;                  // FieldDefinition.key — also the specs key
    label: string;
    input_type: 'select' | 'number' | 'text' | 'multiselect' | 'parking_list';
    options: string[] | null;
    unit: string | null;
    required: boolean;
}

// ── The canonical demand payload this form emits ──────────────────────────────
export interface DemandPayload {
    intent: string;
    budget_min: number | null;
    budget_max: number | null;
    area_min: number | null;
    area_max: number | null;
    area_unit: string;
    timeline: string;
    preferred_location: string;
    preferred_lat: number | null;
    preferred_lng: number | null;
    demand_taxonomy_node_id: string | null;
    demand_schema_values: Record<string, any>;
}

export interface DemandRequirementsFormProps {
    initial: Partial<DemandPayload>;
    onSubmit: (payload: DemandPayload) => Promise<void> | void;
    onCancel?: () => void;
    submitLabel?: string;
    submitting?: boolean;
    // When the parent supplies its own save button (and drives submit via the
    // imperative ref below), hide this form's internal footer Save/Cancel row so
    // there's exactly ONE save action. Defaults false → existing callers unchanged.
    hideSubmitButton?: boolean;
}

// Imperative handle so a parent can trigger the form's submit from its own button
// (e.g. RequirementsTab's top-bar "Save & Close"). Keeps the form's internal state
// encapsulated while letting the parent own the primary action + post-save flow.
export interface DemandRequirementsFormHandle {
    submit: () => void;
}

const TIMELINE_OPTIONS = [
    { value: '', label: 'Not set' },
    { value: 'immediate', label: 'Immediate (< 1 month)' },
    { value: '1-3_months', label: '1–3 months' },
    { value: '3-6_months', label: '3–6 months' },
    { value: '6-12_months', label: '6–12 months' },
];

const labelStyle: React.CSSProperties = {
    fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', display: 'block',
};
const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: '6px',
    border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box',
};

const DemandRequirementsForm = forwardRef<DemandRequirementsFormHandle, DemandRequirementsFormProps>(function DemandRequirementsForm({
    initial, onSubmit, onCancel,
    submitLabel = 'Save Requirements', submitting = false, hideSubmitButton = false,
}, ref) {

    // ── Universal fields ──────────────────────────────────────────────────────
    // Normalize a non-canonical stored intent to a valid dropdown option so the form can't
    // silently re-save a bad value (e.g. "buyer", which broke matching). buy/rent/lease pass
    // through; tenant→rent; everything else (buyer/purchase/seller/unknown/empty) → buy.
    const normInitialIntent = (() => {
        const v = String(initial.intent || '').trim().toLowerCase();
        if (v === 'buy' || v === 'rent' || v === 'lease') return v;
        if (v === 'tenant' || v === 'rent_lease' || v === 'rental') return 'rent';
        return 'buy';
    })();
    const [intent, setIntent] = useState(normInitialIntent);
    const [budgetMin, setBudgetMin] = useState<string>(initial.budget_min != null ? String(initial.budget_min) : '');
    const [budgetMax, setBudgetMax] = useState<string>(initial.budget_max != null ? String(initial.budget_max) : '');
    const [areaMin, setAreaMin] = useState<string>(initial.area_min != null ? String(initial.area_min) : '');
    const [areaMax, setAreaMax] = useState<string>(initial.area_max != null ? String(initial.area_max) : '');
    const [areaUnit, setAreaUnit] = useState(initial.area_unit || 'sqft');
    const [timeline, setTimeline] = useState(initial.timeline || '');
    const [preferredLocation, setPreferredLocation] = useState(initial.preferred_location || '');
    const [preferredLat, setPreferredLat] = useState<number | null>(initial.preferred_lat ?? null);
    const [preferredLng, setPreferredLng] = useState<number | null>(initial.preferred_lng ?? null);
    const locationRef = useRef<HTMLInputElement>(null);
    const acRef = useRef<any>(null);

    // Google Places autocomplete on the location field — captures lat/lng so deal/lead
    // matching can do precise radius search (the engine falls back to text otherwise).
    // Uses the browser VITE key (same as the rest of the admin). 2026-06-01.
    useEffect(() => {
        const key = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';
        if (!key) return;
        let cancelled = false;
        loadGoogleMaps().then(() => {
            if (cancelled || !locationRef.current || acRef.current || !(window as any).google?.maps?.places) return;
            const ac = new (window as any).google.maps.places.Autocomplete(locationRef.current, {
                componentRestrictions: { country: 'in' },
                fields: ['formatted_address', 'geometry'],
            });
            ac.addListener('place_changed', () => {
                const place = ac.getPlace();
                setPreferredLocation(place.formatted_address || locationRef.current?.value || '');
                setPreferredLat(place.geometry?.location?.lat() ?? null);
                setPreferredLng(place.geometry?.location?.lng() ?? null);
            });
            acRef.current = ac;
        }).catch(() => {});
        return () => {
            cancelled = true;
            if (acRef.current && (window as any).google?.maps?.event) {
                (window as any).google.maps.event.clearInstanceListeners(acRef.current);
                acRef.current = null;
            }
        };
    }, []);

    // ── Taxonomy picker ───────────────────────────────────────────────────────
    const [tree, setTree] = useState<TaxonomyTreeNode[]>([]);
    const [nodeId, setNodeId] = useState<string | null>(initial.demand_taxonomy_node_id ?? null);
    // Cascade selections — derived from nodeId on load + on tree click
    const [catId, setCatId] = useState<string>('');
    const [subCatId, setSubCatId] = useState<string>('');
    const [typeId, setTypeId] = useState<string>('');

    // ── Per-type schema fields (the dynamic by-type panel) ────────────────────
    const [nodeFields, setNodeFields] = useState<NodeField[]>([]);
    const [schemaValues, setSchemaValues] = useState<Record<string, any>>(
        (initial.demand_schema_values && typeof initial.demand_schema_values === 'object' && !Array.isArray(initial.demand_schema_values))
            ? { ...initial.demand_schema_values } : {}
    );

    // Load the taxonomy tree once.
    useEffect(() => {
        let cancelled = false;
        getTaxonomyTree().then((data: any) => {
            if (cancelled) return;
            // /public/taxonomy/tree returns { success, tree: [...] } in current prod;
            // older versions returned { roots: [...] } or a bare array. Accept all three.
            const roots: TaxonomyTreeNode[] = Array.isArray(data)
                ? data
                : (data?.tree || data?.roots || []);
            setTree(roots);
        }).catch(() => {});
        return () => { cancelled = true; };
    }, []);

    // If we got an initial nodeId, walk the tree to populate the cascade dropdowns.
    useEffect(() => {
        if (!nodeId || !tree.length) return;
        // BFS to find the node and its ancestors.
        const path: string[] = [];
        function walk(nodes: TaxonomyTreeNode[], ancestors: string[]): boolean {
            for (const n of nodes) {
                if (n.id === nodeId) {
                    path.push(...ancestors, n.id);
                    return true;
                }
                if (n.children?.length && walk(n.children, [...ancestors, n.id])) return true;
            }
            return false;
        }
        walk(tree, []);
        // path = [catId, subCatId?, typeId?, leafId?] — set what we have
        if (path[0]) setCatId(path[0]);
        if (path[1]) setSubCatId(path[1]);
        if (path[2]) setTypeId(path[2]);
        // last element is the leaf == nodeId (already set)
    }, [tree, nodeId]);

    // Whenever the picked node changes, fetch its NodeField schema.
    useEffect(() => {
        if (!nodeId) { setNodeFields([]); return; }
        let cancelled = false;
        getNodeFields(nodeId).then((data: any) => {
            if (cancelled) return;
            const fields: NodeField[] = (data?.fields || []).filter((f: any) => f && f.key);
            setNodeFields(fields);
        }).catch(() => { if (!cancelled) setNodeFields([]); });
        return () => { cancelled = true; };
    }, [nodeId]);

    // ── Cascade dropdown options (derived from tree + selections) ─────────────
    const cats = useMemo(() => tree, [tree]);
    const subCats = useMemo(() => cats.find(c => c.id === catId)?.children || [], [cats, catId]);
    const types = useMemo(() => subCats.find(s => s.id === subCatId)?.children || [], [subCats, subCatId]);
    const leaves = useMemo(() => types.find(t => t.id === typeId)?.children || [], [types, typeId]);

    // When cascade selection changes, derive the effective nodeId (most-specific picked).
    const onPickCat = (id: string) => {
        setCatId(id); setSubCatId(''); setTypeId('');
        setNodeId(id || null);
    };
    const onPickSubCat = (id: string) => {
        setSubCatId(id); setTypeId('');
        setNodeId(id || catId || null);
    };
    const onPickType = (id: string) => {
        setTypeId(id);
        setNodeId(id || subCatId || catId || null);
    };
    const onPickLeaf = (id: string) => {
        setNodeId(id || typeId || subCatId || catId || null);
    };

    // ── Schema field setter helpers (mirror of InventoryList.tsx:1977-1999) ───
    const setKey = (key: string, v: any) => setSchemaValues({ ...schemaValues, [key]: v });
    const toggleKey = (key: string, opt: string) => {
        const cur: string[] = Array.isArray(schemaValues[key]) ? schemaValues[key] : [];
        setKey(key, cur.includes(opt) ? cur.filter(x => x !== opt) : [...cur, opt]);
    };

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = () => {
        // Clean schema_values — strip empty strings and empty arrays.
        const cleanSV: Record<string, any> = {};
        for (const [k, v] of Object.entries(schemaValues)) {
            if (v === '' || v == null) continue;
            if (Array.isArray(v) && v.length === 0) continue;
            cleanSV[k] = v;
        }
        const payload: DemandPayload = {
            intent,
            budget_min: budgetMin ? Number(budgetMin) : null,
            budget_max: budgetMax ? Number(budgetMax) : null,
            area_min: areaMin ? Number(areaMin) : null,
            area_max: areaMax ? Number(areaMax) : null,
            area_unit: areaUnit,
            timeline,
            preferred_location: preferredLocation,
            preferred_lat: preferredLat,
            preferred_lng: preferredLng,
            demand_taxonomy_node_id: nodeId,
            demand_schema_values: cleanSV,
        };
        onSubmit(payload);
    };

    // Expose submit() so a parent can drive the save from its own button.
    useImperativeHandle(ref, () => ({ submit: handleSubmit }));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {/* ── Universal: Intent ─────────────────────────────────────────── */}
            <div>
                <label style={labelStyle}>Intent (Buy / Rent)</label>
                <select style={inputStyle} value={intent} onChange={e => setIntent(e.target.value)}>
                    <option value="buy">Buy</option>
                    <option value="rent">Rent</option>
                    <option value="lease">Lease</option>
                </select>
            </div>

            {/* ── Budget ───────────────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                    <label style={labelStyle}>Budget Min (₹)</label>
                    <input style={inputStyle} type="number" value={budgetMin} onChange={e => setBudgetMin(e.target.value)} placeholder="e.g. 5000000" />
                </div>
                <div>
                    <label style={labelStyle}>Budget Max (₹)</label>
                    <input style={inputStyle} type="number" value={budgetMax} onChange={e => setBudgetMax(e.target.value)} placeholder="e.g. 8000000" />
                </div>
            </div>

            {/* ── Area ─────────────────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                    <label style={labelStyle}>Area Min</label>
                    <input style={inputStyle} type="number" value={areaMin} onChange={e => setAreaMin(e.target.value)} placeholder="500" />
                </div>
                <div>
                    <label style={labelStyle}>Area Max</label>
                    <input style={inputStyle} type="number" value={areaMax} onChange={e => setAreaMax(e.target.value)} placeholder="2000" />
                </div>
                <div>
                    <label style={labelStyle}>Unit</label>
                    <select style={inputStyle} value={areaUnit} onChange={e => setAreaUnit(e.target.value)}>
                        <option value="sqft">sqft</option>
                        <option value="sqmtr">sqmtr</option>
                        <option value="sqyd">sqyd</option>
                        <option value="acre">acre</option>
                    </select>
                </div>
            </div>

            {/* ── Timeline ─────────────────────────────────────────────────── */}
            <div>
                <label style={labelStyle}>Timeline</label>
                <select style={inputStyle} value={timeline} onChange={e => setTimeline(e.target.value)}>
                    {TIMELINE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
            </div>

            {/* ── Preferred Location (Google Places autocomplete → lat/lng) ──── */}
            <div>
                <label style={labelStyle}>Preferred Location</label>
                <input
                    ref={locationRef}
                    style={preferredLat != null ? { ...inputStyle, backgroundColor: 'rgba(34,197,94,0.08)' } : inputStyle}
                    type="text"
                    value={preferredLocation}
                    onChange={e => { setPreferredLocation(e.target.value); setPreferredLat(null); setPreferredLng(null); }}
                    placeholder="Search area on Google Maps…"
                    autoComplete="off"
                    name="rp-demand-location-search"
                />
                {preferredLat != null && (
                    <div style={{ fontSize: '11px', color: '#22c55e', marginTop: '3px' }}>
                        📍 Geo-tagged: {preferredLat.toFixed(4)}, {preferredLng?.toFixed(4)}
                    </div>
                )}
            </div>

            {/* ── Property Type — taxonomy cascade ─────────────────────────── */}
            <div style={{ borderTop: '1px solid var(--border-secondary)', paddingTop: '12px' }}>
                <label style={{ ...labelStyle, marginBottom: '8px' }}>Property Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
                    <select style={inputStyle} value={catId} onChange={e => onPickCat(e.target.value)}>
                        <option value="">Category…</option>
                        {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select style={inputStyle} value={subCatId} onChange={e => onPickSubCat(e.target.value)} disabled={subCats.length === 0}>
                        <option value="">Any sub…</option>
                        {subCats.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select style={inputStyle} value={typeId} onChange={e => onPickType(e.target.value)} disabled={types.length === 0}>
                        <option value="">Any type…</option>
                        {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <select style={inputStyle} value={(leaves.find(l => l.id === nodeId)?.id) || ''} onChange={e => onPickLeaf(e.target.value)} disabled={leaves.length === 0}>
                        <option value="">Any specific…</option>
                        {leaves.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                </div>
            </div>

            {/* ── Dynamic per-type fields (BHK / Furnishing / Amenities / …) ─ */}
            {nodeFields.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border-secondary)', paddingTop: '12px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
                        Requirements (by type)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                        {nodeFields.map(f => (
                            <div key={f.key} style={{ gridColumn: (f.input_type === 'multiselect' || f.input_type === 'parking_list') ? '1 / -1' : 'auto' }}>
                                <label style={labelStyle}>{f.label}{f.unit ? ` (${f.unit})` : ''}</label>
                                {f.input_type === 'parking_list' ? (
                                    <ParkingListField value={schemaValues[f.key]} onChange={(v) => setKey(f.key, v)} />
                                ) : f.input_type === 'multiselect' && Array.isArray(f.options) && f.options.length > 0 ? (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {f.options.map(o => {
                                            const on = Array.isArray(schemaValues[f.key]) && schemaValues[f.key].includes(o);
                                            return (
                                                <button
                                                    key={o}
                                                    type="button"
                                                    onClick={() => toggleKey(f.key, o)}
                                                    style={{
                                                        padding: '6px 12px', borderRadius: '999px', fontSize: '12px', cursor: 'pointer',
                                                        border: on ? '1px solid var(--text-link)' : '1px solid var(--border-secondary)',
                                                        background: on ? 'var(--text-link)' : 'var(--bg-tertiary)',
                                                        color: on ? '#fff' : 'var(--text-primary)',
                                                    }}
                                                >
                                                    {o}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : Array.isArray(f.options) && f.options.length > 0 ? (
                                    <select style={inputStyle} value={schemaValues[f.key] ?? ''} onChange={e => setKey(f.key, e.target.value)}>
                                        <option value="">Select…</option>
                                        {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                ) : (
                                    <input style={inputStyle} type={f.input_type === 'number' ? 'number' : 'text'} value={schemaValues[f.key] ?? ''} onChange={e => setKey(f.key, e.target.value)} placeholder={f.unit || ''} />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Submit ───────────────────────────────────────────────────── */}
            {/* Hidden when the parent supplies its own save button (hideSubmitButton)
                and drives submit via the imperative ref. */}
            {!hideSubmitButton && (
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid var(--border-secondary)', paddingTop: '12px' }}>
                    {onCancel && (
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={submitting}
                            style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border-secondary)', background: 'transparent', color: 'var(--text-primary)', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                        >
                            Cancel
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting}
                        style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'var(--text-link)', color: '#fff', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600 }}
                    >
                        {submitting ? 'Saving…' : submitLabel}
                    </button>
                </div>
            )}
        </div>
    );
});

export default DemandRequirementsForm;
