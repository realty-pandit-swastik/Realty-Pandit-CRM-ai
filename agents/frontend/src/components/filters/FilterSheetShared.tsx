import { useState, useRef, useEffect, useCallback } from 'react';
import { loadGoogleMaps } from '../../lib/loadGoogleMaps';

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PropertyTypeDef { id: string; name: string; slug: string; }
export interface SubCategory { id: string; name: string; slug: string; types: PropertyTypeDef[]; }
export interface Category { id: string; name: string; slug: string; subcategories: SubCategory[]; }

export interface CategorySelection {
    categoryId: string;
    subCategoryId: string;
    typeId: string;
    bhk: number[];
}

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

// ─── FilterCategorySection ────────────────────────────────────────────────────
// Cascading: Category → SubCategory → Type, plus BHK for Residential

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

export function FilterCategorySection({
    tree,
    value,
    onChange,
}: {
    tree: Category[];
    value: CategorySelection;
    onChange: (v: CategorySelection) => void;
}) {
    const selectedCategory = tree.find(c => c.id === value.categoryId);
    const selectedSubCategory = selectedCategory?.subcategories.find(s => s.id === value.subCategoryId);
    const isResidential = selectedCategory?.slug === 'residential';

    const setCategory = (id: string) => {
        if (value.categoryId === id) {
            onChange({ categoryId: '', subCategoryId: '', typeId: '', bhk: [] });
        } else {
            onChange({ categoryId: id, subCategoryId: '', typeId: '', bhk: [] });
        }
    };

    const setSubCategory = (id: string) => {
        if (value.subCategoryId === id) {
            onChange({ ...value, subCategoryId: '', typeId: '' });
        } else {
            onChange({ ...value, subCategoryId: id, typeId: '' });
        }
    };

    const setType = (id: string) => {
        onChange({ ...value, typeId: value.typeId === id ? '' : id });
    };

    const toggleBhk = (n: number) => {
        const next = value.bhk.includes(n) ? value.bhk.filter(x => x !== n) : [...value.bhk, n];
        onChange({ ...value, bhk: next });
    };

    return (
        <FilterSection title="Property Category" defaultOpen={false} badge={
            (value.categoryId ? 1 : 0) + (value.subCategoryId ? 1 : 0) + (value.typeId ? 1 : 0) + (value.bhk.length > 0 ? 1 : 0)
        }>
            {/* Level 1: Main category */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {tree.map(cat => (
                    <button key={cat.id} type="button"
                        onClick={() => setCategory(cat.id)}
                        style={value.categoryId === cat.id ? CHIP_STYLE_ACTIVE : CHIP_STYLE_INACTIVE}>
                        {cat.name}
                    </button>
                ))}
            </div>

            {/* Level 2: Sub-categories */}
            {selectedCategory && selectedCategory.subcategories.length > 0 && (
                <div style={{ marginLeft: '8px', borderLeft: '2px solid var(--border-secondary)', paddingLeft: '12px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase' }}>Sub-category</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {selectedCategory.subcategories.map(sub => (
                            <button key={sub.id} type="button"
                                onClick={() => setSubCategory(sub.id)}
                                style={value.subCategoryId === sub.id ? CHIP_STYLE_ACTIVE : CHIP_STYLE_INACTIVE}>
                                {sub.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Level 3: Types */}
            {selectedSubCategory && selectedSubCategory.types.length > 0 && (
                <div style={{ marginLeft: '20px', borderLeft: '2px solid var(--border-secondary)', paddingLeft: '12px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase' }}>Type</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {selectedSubCategory.types.map(t => (
                            <button key={t.id} type="button"
                                onClick={() => setType(t.id)}
                                style={value.typeId === t.id ? CHIP_STYLE_ACTIVE : CHIP_STYLE_INACTIVE}>
                                {t.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* BHK — only for Residential */}
            {isResidential && (
                <div style={{ marginLeft: '8px', marginTop: '6px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase' }}>BHK</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {[1, 2, 3, 4, 5].map(n => (
                            <button key={n} type="button"
                                onClick={() => toggleBhk(n)}
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
}: {
    value: LocationSelection;
    onChange: (v: LocationSelection) => void;
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

    return (
        <FilterSection title="Location" defaultOpen={false} badge={hasLocation ? 1 : 0}>
            <div style={{ position: 'relative', marginBottom: hasLocation ? '10px' : 0 }}>
                <input
                    ref={inputRef}
                    defaultValue={value.label}
                    placeholder="Search area, locality, city..."
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
