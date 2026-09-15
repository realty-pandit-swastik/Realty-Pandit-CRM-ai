import { useState, useRef, useEffect, useCallback } from 'react';
import { loadGoogleMaps } from '../../lib/loadGoogleMaps';

const MAPS_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LocationSelection {
    label: string;
    lat: number | null;
    lng: number | null;
    radiusKm: number;
}

// ─── FilterSection accordion ─────────────────────────────────────────────────

export function FilterSection({
    title,
    children,
    defaultOpen = true,
    badge,
}: {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    badge?: number;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div style={{ borderBottom: '1px solid var(--border-primary)', padding: '12px 20px' }}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
            >
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {title}
                    {badge != null && badge > 0 && (
                        <span style={{
                            background: 'var(--text-link)', color: '#fff', borderRadius: '10px',
                            fontSize: '11px', fontWeight: 700, padding: '1px 7px',
                        }}>{badge}</span>
                    )}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '18px', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }}>⌄</span>
            </button>
            {open && <div style={{ marginTop: '12px' }}>{children}</div>}
        </div>
    );
}

// ─── Shared chip styles (used by all filter sections) ────────────────────────

const CHIP_STYLE_ACTIVE: React.CSSProperties = {
    padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
    cursor: 'pointer', border: '1.5px solid var(--text-link)',
    backgroundColor: 'rgba(59,130,246,0.12)', color: 'var(--text-link)',
};
const CHIP_STYLE_INACTIVE: React.CSSProperties = {
    padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500,
    cursor: 'pointer', border: '1px solid var(--border-secondary)',
    backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)',
};

// ─── FilterTaxonomySection (new TaxonomyNode tree) ────────────────────────────
// Drives filters from GET /public/taxonomy/tree (the same tree the add/edit forms use), instead of
// the legacy /public/classification-tree. Generic drill (any depth) + multi-select at leaf TYPE
// nodes; emits the selected node ids (the backend expands each to its descendants).

export interface TaxNode { id: string; name: string; children?: TaxNode[]; }
export interface TaxonomySelection { nodeIds: string[]; bhk: number[]; }

// Walk the tree to find a node by id, returning the ancestor chain (root → node) or null.
// Used to rebuild the drill path from an already-applied selection (e.g. after the sheet
// is closed & reopened, which remounts this section with empty local state).
function findChain(nodes: TaxNode[], id: string, trail: TaxNode[] = []): TaxNode[] | null {
    for (const n of nodes) {
        const next = [...trail, n];
        if (n.id === id) return next;
        if (n.children?.length) {
            const found = findChain(n.children, id, next);
            if (found) return found;
        }
    }
    return null;
}

export function FilterTaxonomySection({
    tree,
    value,
    onChange,
}: {
    tree: TaxNode[];
    value: TaxonomySelection;
    onChange: (v: TaxonomySelection) => void;
}) {
    const [path, setPath] = useState<TaxNode[]>([]);   // drilled branch nodes
    const [leafIds, setLeafIds] = useState<string[]>([]); // multi-selected leaf TYPE nodes

    // Reset internal drill when the parent clears the filter (e.g. "Clear all").
    useEffect(() => {
        if (value.nodeIds.length === 0 && value.bhk.length === 0 && (path.length || leafIds.length)) {
            setPath([]); setLeafIds([]);
        }
    }, [value.nodeIds.length, value.bhk.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // Self-heal: if there's an applied selection but no local drill (fresh mount — e.g. the
    // sheet was closed & reopened), rebuild the drill path + leaf picks from value.nodeIds so
    // the UI reflects the active filter. Guarded to never override an in-progress user drill.
    useEffect(() => {
        if (value.nodeIds.length === 0 || path.length || leafIds.length || tree.length === 0) return;
        const chain = findChain(tree, value.nodeIds[0]);
        if (!chain || chain.length === 0) return;
        const last = chain[chain.length - 1];
        if (!last.children || last.children.length === 0) {
            setPath(chain.slice(0, -1)); setLeafIds(value.nodeIds);  // leaf(s) → drill to parent, select leaves
        } else {
            setPath(chain); setLeafIds([]);                          // branch → drill into it, show its children
        }
    }, [tree.length, value.nodeIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

    const isLeaf = (n: TaxNode) => !n.children || n.children.length === 0;
    const effective = (leaves: string[], p: TaxNode[]) =>
        leaves.length ? leaves : (p.length ? [p[p.length - 1].id] : []);

    // Visible levels: roots, then children of each drilled node.
    const levels: TaxNode[][] = [];
    let opts: TaxNode[] = tree;
    for (let i = 0; i <= path.length; i++) {
        if (!opts || opts.length === 0) break;
        levels.push(opts);
        opts = path[i]?.children || [];
    }
    const isResidential = (path[0]?.name || '').toLowerCase().includes('resident');

    const clickNode = (node: TaxNode, level: number) => {
        if (isLeaf(node)) {
            const next = leafIds.includes(node.id) ? leafIds.filter(x => x !== node.id) : [...leafIds, node.id];
            setLeafIds(next);
            onChange({ nodeIds: effective(next, path), bhk: value.bhk });
        } else {
            // Toggle the drill at this level; changing branch clears leaf picks. A drilled branch with
            // no leaf selected filters the whole branch (backend expands to descendants).
            const np = path.slice(0, level);
            if (path[level]?.id !== node.id) np.push(node);
            setPath(np); setLeafIds([]);
            onChange({ nodeIds: effective([], np), bhk: value.bhk });
        }
    };

    const toggleBhk = (n: number) => {
        const next = value.bhk.includes(n) ? value.bhk.filter(x => x !== n) : [...value.bhk, n];
        onChange({ nodeIds: value.nodeIds, bhk: next });
    };

    return (
        <FilterSection title="Property Type" defaultOpen={false}
            badge={(value.nodeIds.length ? 1 : 0) + (value.bhk.length ? 1 : 0)}>
            {levels.map((lvl, i) => (
                <div key={i} style={{ marginLeft: i ? 8 : 0, borderLeft: i ? '2px solid var(--border-secondary)' : 'none', paddingLeft: i ? 12 : 0, marginBottom: 10 }}>
                    {i > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' }}>Refine</div>}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {lvl.map(n => {
                            const active = isLeaf(n) ? leafIds.includes(n.id) : path[i]?.id === n.id;
                            return (
                                <button key={n.id} type="button" onClick={() => clickNode(n, i)}
                                    style={active ? CHIP_STYLE_ACTIVE : CHIP_STYLE_INACTIVE}>
                                    {n.name}{isLeaf(n) ? '' : ' ›'}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
            {isResidential && (
                <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' }}>BHK</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {[1, 2, 3, 4, 5].map(n => (
                            <button key={n} type="button" onClick={() => toggleBhk(n)}
                                style={value.bhk.includes(n) ? CHIP_STYLE_ACTIVE : CHIP_STYLE_INACTIVE}>
                                {n === 5 ? '5+ BHK' : `${n} BHK`}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </FilterSection>
    );
}

// ─── FilterLocationSection ────────────────────────────────────────────────────
// Google Places Autocomplete + radius chips

const RADIUS_OPTIONS = [
    { label: '500m', value: 0.5 },
    { label: '1 km', value: 1 },
    { label: '2 km', value: 2 },
    { label: '5 km', value: 5 },
    { label: 'Any', value: 0 },
];

export function FilterLocationSection({
    value,
    onChange,
    bare = false,
}: {
    value: LocationSelection;
    onChange: (v: LocationSelection) => void;
    /** 2026-07-24: render inner only (no own FilterSection) so a caller can merge it into their own 'Location' section. */
    bare?: boolean;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const acRef = useRef<any>(null);

    const attachAutocomplete = useCallback(() => {
        if (!inputRef.current || !(window as any).google?.maps?.places) return;
        if (acRef.current) return;
        const ac = new (window as any).google.maps.places.Autocomplete(inputRef.current, {
            componentRestrictions: { country: 'in' },
            fields: ['formatted_address', 'geometry'],
        });
        acRef.current = ac;
        ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            if (!place.geometry?.location) return;
            const lat = place.geometry.location.lat();
            const lng = place.geometry.location.lng();
            const label = place.formatted_address || inputRef.current?.value || '';
            onChange({ label, lat, lng, radiusKm: value.radiusKm || 2 });
        });
    }, [onChange, value.radiusKm]);

    useEffect(() => {
        if (!MAPS_KEY) return;
        loadGoogleMaps().then(() => {
            setTimeout(attachAutocomplete, 100);
        });
        return () => {
            if (acRef.current) {
                (window as any).google?.maps?.event?.clearInstanceListeners(acRef.current);
                acRef.current = null;
            }
        };
    }, [attachAutocomplete]);

    const clear = () => {
        if (inputRef.current) inputRef.current.value = '';
        if (acRef.current) {
            (window as any).google?.maps?.event?.clearInstanceListeners(acRef.current);
            acRef.current = null;
        }
        onChange({ label: '', lat: null, lng: null, radiusKm: 2 });
        setTimeout(attachAutocomplete, 50);
    };

    const hasLocation = value.lat != null && value.lng != null;

    const inner = (
        <>
            <div style={{ position: 'relative', marginBottom: hasLocation ? '10px' : 0 }}>
                <input
                    ref={inputRef}
                    defaultValue={value.label}
                    placeholder="Search area, locality, city..."
                    autoComplete="off"
                    name="rp-filter-location"
                    style={{
                        width: '100%', padding: '9px 36px 9px 12px', borderRadius: '10px',
                        border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
                        color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box',
                    }}
                />
                {hasLocation && (
                    <button type="button" onClick={clear}
                        style={{
                            position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', fontSize: '16px', padding: '2px',
                        }}>×</button>
                )}
            </div>

            {/* Radius chips — only show after location selected */}
            {hasLocation && (
                <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase' }}>Radius</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {RADIUS_OPTIONS.map(opt => (
                            <button key={opt.value} type="button"
                                onClick={() => onChange({ ...value, radiusKm: opt.value })}
                                style={value.radiusKm === opt.value ? CHIP_STYLE_ACTIVE : CHIP_STYLE_INACTIVE}>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
    return bare ? inner : (
        <FilterSection title="Location" defaultOpen={false} badge={hasLocation ? 1 : 0}>{inner}</FilterSection>
    );
}

// ─── FilterFloorSection ───────────────────────────────────────────────────────
// Filter by the unit's floor_number. Multi-select chips; emits string tokens
// ('0'=Ground … '4', plus '5plus' meaning floor >= 5). Backend maps tokens → floor_number IN / >=5.

const FLOOR_OPTIONS = [
    { label: 'Ground', value: '0' },
    { label: '1st', value: '1' },
    { label: '2nd', value: '2' },
    { label: '3rd', value: '3' },
    { label: '4th', value: '4' },
    { label: '5+', value: '5plus' },
];

export function FilterFloorSection({
    value,
    onChange,
}: {
    value: string[];
    onChange: (v: string[]) => void;
}) {
    const toggle = (v: string) =>
        onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
    return (
        <FilterSection title="Floor" defaultOpen={false} badge={value.length ? 1 : 0}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {FLOOR_OPTIONS.map(opt => (
                    <button key={opt.value} type="button" onClick={() => toggle(opt.value)}
                        style={value.includes(opt.value) ? CHIP_STYLE_ACTIVE : CHIP_STYLE_INACTIVE}>
                        {opt.label}
                    </button>
                ))}
            </div>
        </FilterSection>
    );
}

// ─── StalenessSection ─────────────────────────────────────────────────────────

const STALENESS_PRESETS = [7, 15, 30];

export function StalenessSection({
    title,
    label1,
    label2,
    days1,
    days2,
    onDays1Change,
    onDays2Change,
    badge,
}: {
    title: string;
    label1: string;
    label2: string;
    days1: number;
    days2: number;
    onDays1Change: (v: number) => void;
    onDays2Change: (v: number) => void;
    badge?: number;
}) {
    return (
        <FilterSection title={title} defaultOpen={false} badge={badge}>
            {/* Row 1 */}
            <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '6px' }}>{label1}</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {STALENESS_PRESETS.map(d => (
                        <button key={d} type="button"
                            onClick={() => onDays1Change(days1 === d ? 0 : d)}
                            style={days1 === d ? CHIP_STYLE_ACTIVE : CHIP_STYLE_INACTIVE}>
                            {d}d+
                        </button>
                    ))}
                    <input
                        type="number" min={1} max={365}
                        value={days1 > 0 && !STALENESS_PRESETS.includes(days1) ? days1 : ''}
                        onChange={e => onDays1Change(Number(e.target.value) || 0)}
                        placeholder="Custom"
                        style={{
                            width: '70px', padding: '5px 8px', borderRadius: '8px',
                            border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
                            color: 'var(--text-primary)', fontSize: '12px',
                        }}
                    />
                </div>
            </div>

            {/* Row 2 */}
            <div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '6px' }}>{label2}</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {STALENESS_PRESETS.map(d => (
                        <button key={d} type="button"
                            onClick={() => onDays2Change(days2 === d ? 0 : d)}
                            style={days2 === d ? CHIP_STYLE_ACTIVE : CHIP_STYLE_INACTIVE}>
                            {d}d+
                        </button>
                    ))}
                    <input
                        type="number" min={1} max={365}
                        value={days2 > 0 && !STALENESS_PRESETS.includes(days2) ? days2 : ''}
                        onChange={e => onDays2Change(Number(e.target.value) || 0)}
                        placeholder="Custom"
                        style={{
                            width: '70px', padding: '5px 8px', borderRadius: '8px',
                            border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
                            color: 'var(--text-primary)', fontSize: '12px',
                        }}
                    />
                </div>
            </div>
        </FilterSection>
    );
}
