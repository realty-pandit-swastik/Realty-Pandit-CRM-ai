/**
 * BuyerRequirementsForm — Reusable buyer/tenant requirements capture.
 *
 * Used by:
 *   - LogCallOverlay (Stage 1 NEW qualify path) — requireAll=true
 *   - ExternalLeads (free-form edit) — requireAll=false  [future migration]
 *
 * Categories/sub-cats/types come from a single nested endpoint:
 *   GET /public/master/categories → [{slug, name, sub_categories:[{slug, name, property_types:[{slug, name}]}]}]
 *
 * Save logic stays in the caller via the onSubmit prop.
 */

import { useState, useEffect, useMemo } from 'react';
import client from '../../api/client';

export interface RequirementsValues {
    intent: string;
    demand_main_category: string;
    demand_category: string | null;
    demand_type_slug: string;
    demand_bhk: number | null;
    area_min: number | null;
    area_max: number | null;
    area_unit: string;
    demand_amenities: string[];
    budget_min: number | null;
    budget_max: number | null;
    timeline: string;
    preferred_location: string;
}

export interface BuyerRequirementsFormProps {
    initialValues: Partial<RequirementsValues>;
    requireAll: boolean;
    onSubmit: (values: RequirementsValues) => Promise<void> | void;
    onCancel: () => void;
    submitLabel?: string;
    submitting?: boolean;
}

interface CategoryNode {
    slug: string;
    name: string;
    sub_categories: SubCategoryNode[];
}
interface SubCategoryNode {
    slug: string;
    name: string;
    property_types?: TypeNode[];
}
interface TypeNode {
    slug: string;
    name: string;
}

const AMENITIES = [
    'Parking', 'Lift', 'Gym', 'Security', 'Power Backup', 'Garden',
    'Swimming Pool', 'Water Supply', 'Club House', 'Intercom', 'Gas Pipeline', 'Park',
];

const TIMELINES = [
    { value: '', label: 'Not set' },
    { value: 'immediate', label: 'Immediate (< 1 month)' },
    { value: '1-3_months', label: '1–3 months' },
    { value: '3-6_months', label: '3–6 months' },
    { value: '6-12_months', label: '6–12 months' },
];

const REQUIRED_FIELDS: (keyof RequirementsValues)[] = [
    'intent', 'demand_main_category', 'demand_type_slug', 'demand_bhk',
    'budget_min', 'budget_max', 'preferred_location', 'timeline',
];

const REQUIRED_LABELS: Record<string, string> = {
    intent: 'Intent', demand_main_category: 'Category', demand_type_slug: 'Property Type',
    demand_bhk: 'BHK', budget_min: 'Budget Min', budget_max: 'Budget Max',
    preferred_location: 'Preferred Location', timeline: 'Timeline',
};

const labelStyle: React.CSSProperties = {
    fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', display: 'block',
};

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box',
};

export default function BuyerRequirementsForm({
    initialValues, requireAll, onSubmit, onCancel,
    submitLabel = 'Save Requirements', submitting = false,
}: BuyerRequirementsFormProps) {
    const [v, setV] = useState<RequirementsValues>({
        intent: initialValues.intent || 'buy',
        demand_main_category: initialValues.demand_main_category || '',
        demand_category: initialValues.demand_category || null,
        demand_type_slug: initialValues.demand_type_slug || '',
        demand_bhk: initialValues.demand_bhk ?? null,
        area_min: initialValues.area_min ?? null,
        area_max: initialValues.area_max ?? null,
        area_unit: initialValues.area_unit || 'sqft',
        demand_amenities: Array.isArray(initialValues.demand_amenities)
            ? initialValues.demand_amenities
            : [],
        budget_min: initialValues.budget_min ?? null,
        budget_max: initialValues.budget_max ?? null,
        timeline: initialValues.timeline || '',
        preferred_location: initialValues.preferred_location || '',
    });

    const [categories, setCategories] = useState<CategoryNode[]>([]);

    useEffect(() => {
        client.get('/public/master/categories')
            .then((r) => setCategories(Array.isArray(r.data) ? r.data : []))
            .catch(() => setCategories([]));
    }, []);

    // Derive sub-categories from selected category
    const subCats: SubCategoryNode[] = useMemo(() => {
        const cat = categories.find((c) => c.slug === v.demand_main_category);
        return cat?.sub_categories || [];
    }, [categories, v.demand_main_category]);

    // Derive types from selected sub-category (or all types in the category if no sub selected)
    const types: TypeNode[] = useMemo(() => {
        if (v.demand_category) {
            const sub = subCats.find((s) => s.slug === v.demand_category);
            return sub?.property_types || [];
        }
        // Flatten across all subs in the category
        const all: TypeNode[] = [];
        for (const sub of subCats) {
            for (const t of sub.property_types || []) all.push(t);
        }
        return all;
    }, [subCats, v.demand_category]);

    const toggleAmenity = (a: string) => {
        setV((prev) => ({
            ...prev,
            demand_amenities: prev.demand_amenities.includes(a)
                ? prev.demand_amenities.filter((x) => x !== a)
                : [...prev.demand_amenities, a],
        }));
    };

    const missingRequired = requireAll
        ? REQUIRED_FIELDS.filter((f) => v[f] === null || v[f] === undefined || v[f] === '')
        : [];

    const canSubmit = !submitting && missingRequired.length === 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
                <label style={labelStyle}>Intent (Buy / Rent){requireAll ? ' *' : ''}</label>
                <select
                    style={inputStyle}
                    value={v.intent}
                    onChange={(e) => setV({ ...v, intent: e.target.value })}
                >
                    <option value="buy">Buy</option>
                    <option value="rent">Rent</option>
                </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                    <label style={labelStyle}>Category{requireAll ? ' *' : ''}</label>
                    <select
                        style={inputStyle}
                        value={v.demand_main_category}
                        onChange={(e) => setV({
                            ...v,
                            demand_main_category: e.target.value,
                            demand_category: null,
                            demand_type_slug: '',
                        })}
                    >
                        <option value="">Any</option>
                        {categories.map((c) => (
                            <option key={c.slug} value={c.slug}>{c.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label style={labelStyle}>Sub-Category</label>
                    <select
                        style={inputStyle}
                        value={v.demand_category || ''}
                        disabled={subCats.length === 0}
                        onChange={(e) => setV({
                            ...v,
                            demand_category: e.target.value || null,
                            demand_type_slug: '',
                        })}
                    >
                        <option value="">Any</option>
                        {subCats.map((s) => (
                            <option key={s.slug} value={s.slug}>{s.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label style={labelStyle}>Property Type{requireAll ? ' *' : ''}</label>
                    <select
                        style={inputStyle}
                        value={v.demand_type_slug}
                        disabled={types.length === 0}
                        onChange={(e) => setV({ ...v, demand_type_slug: e.target.value })}
                    >
                        <option value="">Any</option>
                        {types.map((t) => (
                            <option key={t.slug} value={t.slug}>{t.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div>
                <label style={labelStyle}>BHK{requireAll ? ' *' : ''}</label>
                <select
                    style={inputStyle}
                    value={v.demand_bhk ?? ''}
                    onChange={(e) => setV({ ...v, demand_bhk: e.target.value ? Number(e.target.value) : null })}
                >
                    <option value="">Any</option>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>{n} BHK</option>
                    ))}
                </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                    <label style={labelStyle}>Area Min</label>
                    <input
                        style={inputStyle}
                        type="number"
                        placeholder="500"
                        value={v.area_min ?? ''}
                        onChange={(e) => setV({ ...v, area_min: e.target.value ? Number(e.target.value) : null })}
                    />
                </div>
                <div>
                    <label style={labelStyle}>Area Max</label>
                    <input
                        style={inputStyle}
                        type="number"
                        placeholder="2000"
                        value={v.area_max ?? ''}
                        onChange={(e) => setV({ ...v, area_max: e.target.value ? Number(e.target.value) : null })}
                    />
                </div>
                <div>
                    <label style={labelStyle}>Unit</label>
                    <select
                        style={inputStyle}
                        value={v.area_unit}
                        onChange={(e) => setV({ ...v, area_unit: e.target.value })}
                    >
                        <option value="sqft">sqft</option>
                        <option value="sqyd">sqyd</option>
                        <option value="sqm">sqm</option>
                        <option value="acre">acre</option>
                    </select>
                </div>
            </div>

            <div>
                <label style={labelStyle}>Preferred Amenities</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                    {AMENITIES.map((a) => {
                        const on = v.demand_amenities.includes(a);
                        return (
                            <button
                                key={a}
                                type="button"
                                onClick={() => toggleAmenity(a)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '16px',
                                    fontSize: '12px',
                                    border: `1px solid ${on ? 'var(--accent-primary)' : 'var(--border-secondary)'}`,
                                    backgroundColor: on ? 'rgba(59,130,246,0.15)' : 'transparent',
                                    color: on ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                    cursor: 'pointer',
                                }}
                            >
                                {a}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                    <label style={labelStyle}>Budget Min (₹){requireAll ? ' *' : ''}</label>
                    <input
                        style={inputStyle}
                        type="number"
                        placeholder="5000000"
                        value={v.budget_min ?? ''}
                        onChange={(e) => setV({ ...v, budget_min: e.target.value ? Number(e.target.value) : null })}
                    />
                </div>
                <div>
                    <label style={labelStyle}>Budget Max (₹){requireAll ? ' *' : ''}</label>
                    <input
                        style={inputStyle}
                        type="number"
                        placeholder="10000000"
                        value={v.budget_max ?? ''}
                        onChange={(e) => setV({ ...v, budget_max: e.target.value ? Number(e.target.value) : null })}
                    />
                </div>
            </div>

            <div>
                <label style={labelStyle}>Timeline{requireAll ? ' *' : ''}</label>
                <select
                    style={inputStyle}
                    value={v.timeline}
                    onChange={(e) => setV({ ...v, timeline: e.target.value })}
                >
                    {TIMELINES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                </select>
            </div>

            <div>
                <label style={labelStyle}>Preferred Location{requireAll ? ' *' : ''}</label>
                <input
                    style={inputStyle}
                    type="text"
                    placeholder="e.g. Vaishali, Ghaziabad"
                    value={v.preferred_location}
                    onChange={(e) => setV({ ...v, preferred_location: e.target.value })}
                />
            </div>

            {requireAll && missingRequired.length > 0 && (
                <div style={{
                    padding: '8px 12px', borderRadius: '6px',
                    backgroundColor: 'rgba(245,158,11,0.1)',
                    border: '1px solid rgba(245,158,11,0.3)',
                    color: '#f59e0b', fontSize: '12px',
                }}>
                    Required: {missingRequired.map((f) => REQUIRED_LABELS[f] || f).join(', ')}
                </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={submitting}
                    style={{
                        padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                        border: '1px solid var(--border-secondary)', backgroundColor: 'transparent',
                        color: 'var(--text-secondary)', cursor: 'pointer',
                    }}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={() => onSubmit(v)}
                    disabled={!canSubmit}
                    style={{
                        padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                        border: 'none',
                        backgroundColor: canSubmit ? 'var(--accent-primary)' : '#94a3b8',
                        color: '#fff',
                        cursor: canSubmit ? 'pointer' : 'not-allowed',
                    }}
                >
                    {submitting ? 'Saving...' : submitLabel}
                </button>
            </div>
        </div>
    );
}
