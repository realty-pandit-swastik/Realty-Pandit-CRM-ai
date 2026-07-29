import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * InventoryFilterCommandBar — a command-menu style filter (2026-07-08).
 *
 * One compact search bar holds the active filters as removable tokens. Click it
 * (or type) and it expands into a facet dropdown: pick BHK / Type / Budget /
 * Location / Radius / Roof-rights and each applied choice becomes a token inside
 * the bar. Typing fuzzy-matches across every facet value (⏎ applies the top hit);
 * a trailing "Search location" row turns free text into a location filter.
 *
 * Replaces the old sprawling chip-wall in MatchShareTab — same search params, far
 * less screen. Dependency-free (no cmdk/Tailwind); styled with the app's CSS vars.
 * All filter STATE + the actual matched-inventory search stay in MatchShareTab;
 * this component is presentational + callbacks.
 */

export interface TypeFacetGroup { sub: string; types: { id: string; name: string }[] }

interface Props {
    bhkSet: Set<number>;
    typeNodeSet: Set<string>;
    budgetMin: string;
    budgetMax: string;
    radiusKm: number | null;
    location: string;
    roofRights: boolean;
    specMode: 'bhk' | 'rooms' | 'none';
    specLabel: string;              // "BHK" | "Rooms"
    bhkChoices: number[];
    radiusChoices: number[];
    typeGroups: TypeFacetGroup[];
    hasGeo: boolean;
    categoryName?: string | null;   // read-only scope context (e.g. "Residential")
    formatPrice: (n: number | null) => string;
    onToggleBhk: (n: number) => void;
    onToggleType: (id: string) => void;
    onSetBudget: (min: string, max: string) => void;
    onChangeRadius: (km: number | null) => void;
    onSetLocation: (loc: string) => void;
    onToggleRoof: () => void;
    areaMin: string;
    areaMax: string;
    areaUnit: string;
    floorMin: string;
    floorMax: string;
    renovated: boolean;
    preLeased: boolean;
    commercialUse: boolean;
    onSetArea: (min: string, max: string, unit: string) => void;
    onSetFloor: (min: string, max: string) => void;
    onToggleRenovated: () => void;
    onTogglePreLeased: () => void;
    onToggleCommercialUse: () => void;
}

type CatKey = 'bhk' | 'type' | 'budget' | 'location' | 'radius' | 'size' | 'floor';
interface Item { key: string; label: string; sub?: string; checked?: boolean; arrow?: boolean; run: () => void }

export function InventoryFilterCommandBar(p: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeCat, setActiveCat] = useState<CatKey | null>(null);
    const [hi, setHi] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const budgetMinRef = useRef<HTMLInputElement>(null);
    const budgetMaxRef = useRef<HTMLInputElement>(null);
    const locRef = useRef<HTMLInputElement>(null);
    const areaMinRef = useRef<HTMLInputElement>(null);
    const areaMaxRef = useRef<HTMLInputElement>(null);
    const floorMinRef = useRef<HTMLInputElement>(null);
    const floorMaxRef = useRef<HTMLInputElement>(null);
    const [areaUnitDraft, setAreaUnitDraft] = useState(p.areaUnit || 'sqft');

    // id → { name, sub } so type tokens can render a readable label.
    const typeNameById = useMemo(() => {
        const m = new Map<string, { name: string; sub: string }>();
        p.typeGroups.forEach(g => g.types.forEach(t => m.set(t.id, { name: t.name, sub: g.sub })));
        return m;
    }, [p.typeGroups]);

    // Close on outside click / Escape.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close(); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const close = () => { setOpen(false); setActiveCat(null); setQuery(''); };
    const drill = (c: CatKey) => { if (c === 'size') setAreaUnitDraft(p.areaUnit || 'sqft'); setActiveCat(c); setQuery(''); setHi(0); };

    // ── Active tokens (order: scope context → filters) ──────────────────────────
    interface Token { key: string; label: string; removable: boolean; remove?: () => void }
    const tokens: Token[] = [];
    if (p.categoryName) tokens.push({ key: 'cat', label: p.categoryName, removable: false });
    [...p.bhkSet].sort((a, b) => a - b).forEach(n =>
        tokens.push({ key: 'bhk' + n, label: `${n} ${p.specLabel}`, removable: true, remove: () => p.onToggleBhk(n) }));
    [...p.typeNodeSet].forEach(id =>
        tokens.push({ key: 'type' + id, label: typeNameById.get(id)?.name || 'Type', removable: true, remove: () => p.onToggleType(id) }));
    if (p.budgetMin || p.budgetMax) {
        const lbl = p.budgetMin && p.budgetMax ? `${p.formatPrice(Number(p.budgetMin))} – ${p.formatPrice(Number(p.budgetMax))}`
            : p.budgetMax ? `≤ ${p.formatPrice(Number(p.budgetMax))}` : `≥ ${p.formatPrice(Number(p.budgetMin))}`;
        tokens.push({ key: 'budget', label: lbl, removable: true, remove: () => p.onSetBudget('', '') });
    }
    if (p.radiusKm != null) tokens.push({ key: 'radius', label: `${p.radiusKm} km`, removable: true, remove: () => p.onChangeRadius(null) });
    if (p.location) tokens.push({ key: 'loc', label: `📍 ${p.location}`, removable: true, remove: () => p.onSetLocation('') });
    if (p.roofRights) tokens.push({ key: 'roof', label: '🏠 Roof rights', removable: true, remove: () => p.onToggleRoof() });
    if (p.areaMin || p.areaMax) {
        const u = p.areaUnit === 'sqyd' ? 'sq.yd' : p.areaUnit === 'sqm' ? 'sq.m' : 'sq.ft';
        const lbl = p.areaMin && p.areaMax ? `${p.areaMin}–${p.areaMax} ${u}` : p.areaMax ? `≤ ${p.areaMax} ${u}` : `≥ ${p.areaMin} ${u}`;
        tokens.push({ key: 'area', label: `📐 ${lbl}`, removable: true, remove: () => p.onSetArea('', '', p.areaUnit) });
    }
    if (p.floorMin || p.floorMax) {
        const lbl = p.floorMin && p.floorMax ? `${p.floorMin}–${p.floorMax}` : p.floorMax ? `≤ ${p.floorMax}` : `≥ ${p.floorMin}`;
        tokens.push({ key: 'floor', label: `🏢 Floor ${lbl}`, removable: true, remove: () => p.onSetFloor('', '') });
    }
    if (p.renovated) tokens.push({ key: 'renov', label: '🔨 Renovated', removable: true, remove: () => p.onToggleRenovated() });
    if (p.preLeased) tokens.push({ key: 'prelease', label: '🏷️ Pre-leased', removable: true, remove: () => p.onTogglePreLeased() });
    if (p.commercialUse) tokens.push({ key: 'commuse', label: '🏢 Commercial-usable', removable: true, remove: () => p.onToggleCommercialUse() });

    // ── Dropdown items (list views only; budget/location render forms) ──────────
    const q = query.trim().toLowerCase();
    const items: Item[] = useMemo(() => {
        const out: Item[] = [];
        if (activeCat === 'bhk') {
            p.bhkChoices.forEach(n => out.push({ key: 'b' + n, label: `${n} ${p.specLabel}`, checked: p.bhkSet.has(n), run: () => p.onToggleBhk(n) }));
        } else if (activeCat === 'type') {
            p.typeGroups.forEach(g => g.types.forEach(t => out.push({ key: t.id, label: t.name, sub: g.sub, checked: p.typeNodeSet.has(t.id), run: () => p.onToggleType(t.id) })));
        } else if (activeCat === 'radius') {
            out.push({ key: 'auto', label: 'Auto (2 → 20 km)', checked: p.radiusKm == null, run: () => { p.onChangeRadius(null); setActiveCat(null); } });
            p.radiusChoices.forEach(km => out.push({ key: 'r' + km, label: `${km} km`, checked: p.radiusKm === km, run: () => { p.onChangeRadius(km); setActiveCat(null); } }));
        } else if (q) {
            // Flat fuzzy search across every facet value.
            if (p.specMode !== 'none') p.bhkChoices.filter(n => `${n} ${p.specLabel}`.toLowerCase().includes(q))
                .forEach(n => out.push({ key: 'b' + n, label: `${n} ${p.specLabel}`, checked: p.bhkSet.has(n), run: () => p.onToggleBhk(n) }));
            p.typeGroups.forEach(g => g.types.filter(t => t.name.toLowerCase().includes(q))
                .forEach(t => out.push({ key: t.id, label: t.name, sub: g.sub, checked: p.typeNodeSet.has(t.id), run: () => p.onToggleType(t.id) })));
            if ('roof rights'.includes(q)) out.push({ key: 'roof', label: '🏠 Roof rights only', checked: p.roofRights, run: () => p.onToggleRoof() });
            if ('renovated'.includes(q)) out.push({ key: 'renov', label: '🔨 Renovated only', checked: p.renovated, run: () => p.onToggleRenovated() });
            if ('pre-leased preleased pre leased'.includes(q)) out.push({ key: 'prelease', label: '🏷️ Pre-leased only', checked: p.preLeased, run: () => p.onTogglePreLeased() });
            if ('commercial commercial-use commercial usable'.includes(q)) out.push({ key: 'commuse', label: '🏢 Commercial-usable only', checked: p.commercialUse, run: () => p.onToggleCommercialUse() });
            if ('size area'.includes(q)) out.push({ key: 'c-size', label: '📐 Size (area)', arrow: true, run: () => drill('size') });
            if ('floor'.includes(q)) out.push({ key: 'c-floor', label: '🏢 Floor', arrow: true, run: () => drill('floor') });
            if (p.hasGeo) p.radiusChoices.filter(km => `${km} km`.includes(q)).forEach(km => out.push({ key: 'r' + km, label: `${km} km radius`, checked: p.radiusKm === km, run: () => { p.onChangeRadius(km); } }));
            out.push({ key: 'loc', label: `Search location “${query.trim()}”`, run: () => { p.onSetLocation(query.trim()); close(); } });
        } else {
            // Root: facet categories.
            if (p.specMode !== 'none') out.push({ key: 'c-bhk', label: p.specLabel, arrow: true, run: () => drill('bhk') });
            if (p.typeGroups.length) out.push({ key: 'c-type', label: 'Property Type', arrow: true, run: () => drill('type') });
            out.push({ key: 'c-budget', label: 'Budget', arrow: true, run: () => drill('budget') });
            out.push({ key: 'c-loc', label: 'Location', arrow: true, run: () => drill('location') });
            if (p.hasGeo) out.push({ key: 'c-radius', label: 'Radius', arrow: true, run: () => drill('radius') });
            out.push({ key: 'roof', label: '🏠 Roof rights only', checked: p.roofRights, run: () => p.onToggleRoof() });
            out.push({ key: 'c-size', label: '📐 Size (area)', arrow: true, run: () => drill('size') });
            out.push({ key: 'c-floor', label: '🏢 Floor', arrow: true, run: () => drill('floor') });
            out.push({ key: 'renov', label: '🔨 Renovated only', checked: p.renovated, run: () => p.onToggleRenovated() });
            out.push({ key: 'prelease', label: '🏷️ Pre-leased only', checked: p.preLeased, run: () => p.onTogglePreLeased() });
            out.push({ key: 'commuse', label: '🏢 Commercial-usable only', checked: p.commercialUse, run: () => p.onToggleCommercialUse() });
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeCat, q, p.bhkSet, p.typeNodeSet, p.radiusKm, p.roofRights, p.typeGroups, p.bhkChoices, p.specLabel, p.specMode, p.hasGeo, p.renovated, p.preLeased, p.commercialUse, p.areaMin, p.areaMax, p.floorMin, p.floorMax]);

    useEffect(() => { setHi(0); }, [activeCat, query]);

    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { close(); return; }
        if (e.key === 'Backspace' && !query) {
            const last = [...tokens].reverse().find(t => t.removable);
            if (last?.remove) { e.preventDefault(); last.remove(); }
            return;
        }
        if (activeCat === 'budget' || activeCat === 'location' || activeCat === 'size' || activeCat === 'floor') return; // forms handle their own keys
        if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, items.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); items[hi]?.run(); }
    };

    // ── styles ──────────────────────────────────────────────────────────────────
    const barStyle: React.CSSProperties = {
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '8px 10px',
        border: `1px solid ${open ? 'var(--accent-primary)' : 'var(--border-secondary)'}`, borderRadius: 10,
        backgroundColor: 'var(--bg-secondary)', cursor: 'text',
    };
    const tokenStyle = (removable: boolean): React.CSSProperties => ({
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999,
        fontSize: 12, fontWeight: 600,
        backgroundColor: removable ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
        color: removable ? '#fff' : 'var(--text-secondary)',
    });
    const dropStyle: React.CSSProperties = {
        position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 60,
        backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: 10,
        boxShadow: '0 14px 34px rgba(0,0,0,0.30)', maxHeight: 300, overflowY: 'auto', padding: 6,
    };
    const rowStyle = (active: boolean): React.CSSProperties => ({
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        padding: '9px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)',
        backgroundColor: active ? 'var(--bg-secondary)' : 'transparent',
    });
    const inputStyle: React.CSSProperties = {
        padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border-secondary)',
        backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, width: '100%', boxSizing: 'border-box',
    };
    const applyBtn: React.CSSProperties = {
        padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
        backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none',
    };
    const backRow: React.CSSProperties = { ...rowStyle(false), color: 'var(--text-muted)', fontWeight: 600 };

    return (
        <div ref={wrapRef} style={{ position: 'relative' }}>
            <div style={barStyle} onClick={() => { setOpen(true); inputRef.current?.focus(); }}>
                {tokens.map(t => (
                    <span key={t.key} style={tokenStyle(t.removable)}>
                        {t.label}
                        {t.removable && (
                            <span role="button" aria-label={`Remove ${t.label}`} title="Remove"
                                onClick={e => { e.stopPropagation(); t.remove?.(); }}
                                style={{ cursor: 'pointer', fontWeight: 800, opacity: 0.9, marginLeft: 1 }}>✕</span>
                        )}
                    </span>
                ))}
                <input
                    ref={inputRef}
                    value={query}
                    onChange={e => { setQuery(e.target.value); setOpen(true); if (activeCat && e.target.value) setActiveCat(null); }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={onKey}
                    placeholder={tokens.length ? 'Add filter…' : '🔎 Add filter or search inventory…'}
                    aria-label="Add filter or search inventory"
                    style={{ flex: 1, minWidth: 130, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: 13, padding: '3px 4px' }}
                />
            </div>

            {open && (
                <div style={dropStyle}>
                    {activeCat && (
                        <div style={backRow} onClick={() => { setActiveCat(null); inputRef.current?.focus(); }}>‹ Back</div>
                    )}

                    {activeCat === 'budget' ? (
                        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>MIN ₹ (HARD)</div>
                                    <input ref={budgetMinRef} type="number" defaultValue={p.budgetMin} placeholder="Min" style={inputStyle} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>MAX ₹ (HARD)</div>
                                    <input ref={budgetMaxRef} type="number" defaultValue={p.budgetMax} placeholder="Max" style={inputStyle} />
                                </div>
                            </div>
                            <button type="button" style={applyBtn} onClick={() => { p.onSetBudget(budgetMinRef.current?.value || '', budgetMaxRef.current?.value || ''); close(); }}>Apply budget</button>
                        </div>
                    ) : activeCat === 'location' ? (
                        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>{p.hasGeo ? 'LOCALITY / AREA (geo radius active)' : 'LOCALITY / AREA (text match)'}</div>
                            <input ref={locRef} defaultValue={p.location} placeholder="e.g. Vaishali, Ghaziabad" style={inputStyle}
                                onKeyDown={e => { if (e.key === 'Enter') { p.onSetLocation((e.target as HTMLInputElement).value); close(); } }} />
                            <button type="button" style={applyBtn} onClick={() => { p.onSetLocation(locRef.current?.value || ''); close(); }}>Apply location</button>
                        </div>
                    ) : activeCat === 'size' ? (
                        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>MIN</div>
                                    <input ref={areaMinRef} type="number" defaultValue={p.areaMin} placeholder="Min" style={inputStyle} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>MAX</div>
                                    <input ref={areaMaxRef} type="number" defaultValue={p.areaMax} placeholder="Max" style={inputStyle} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {[{ l: 'Sq.ft', v: 'sqft' }, { l: 'Sq.yd', v: 'sqyd' }, { l: 'Sq.m', v: 'sqm' }].map(u => (
                                    <button key={u.v} type="button" onClick={() => setAreaUnitDraft(u.v)}
                                        style={{ flex: 1, padding: '7px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: areaUnitDraft === u.v ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-secondary)', backgroundColor: areaUnitDraft === u.v ? 'var(--accent-primary)' : 'var(--bg-secondary)', color: areaUnitDraft === u.v ? '#fff' : 'var(--text-secondary)' }}>{u.l}</button>
                                ))}
                            </div>
                            <button type="button" style={applyBtn} onClick={() => { p.onSetArea(areaMinRef.current?.value || '', areaMaxRef.current?.value || '', areaUnitDraft); close(); }}>Apply size</button>
                        </div>
                    ) : activeCat === 'floor' ? (
                        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>MIN FLOOR</div>
                                    <input ref={floorMinRef} type="number" defaultValue={p.floorMin} placeholder="e.g. 0" style={inputStyle} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>MAX FLOOR</div>
                                    <input ref={floorMaxRef} type="number" defaultValue={p.floorMax} placeholder="e.g. 5" style={inputStyle} />
                                </div>
                            </div>
                            <button type="button" style={applyBtn} onClick={() => { p.onSetFloor(floorMinRef.current?.value || '', floorMaxRef.current?.value || ''); close(); }}>Apply floor</button>
                        </div>
                    ) : items.length === 0 ? (
                        <div style={{ padding: '14px 12px', fontSize: 12, color: 'var(--text-muted)' }}>No matching filters</div>
                    ) : (
                        items.map((it, i) => (
                            <div key={it.key} style={rowStyle(i === hi)}
                                onMouseEnter={() => setHi(i)}
                                onClick={() => it.run()}>
                                <span style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span>{it.checked ? '✓ ' : ''}{it.label}</span>
                                    {it.sub && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{it.sub}</span>}
                                </span>
                                {it.arrow && <span style={{ color: 'var(--text-muted)' }}>›</span>}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
