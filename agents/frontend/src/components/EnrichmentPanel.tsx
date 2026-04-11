import React, { useState, useEffect, useCallback } from 'react';
import { getInventoryEnrichment, enrichInventory } from '../api/client';

interface EnrichmentPanelProps {
    inventoryId: string;
    onDone: () => void;
    onAddNew: () => void;
}

interface EnrichmentSection {
    id: string;
    label: string;
    fields: EnrichmentField[];
}

interface EnrichmentField {
    key: string;
    label: string;
    type: 'number' | 'text' | 'select' | 'multi_select' | 'radio';
    options?: Array<{ value: string; label: string }>;
    placeholder?: string;
}

const ENRICHMENT_SECTIONS: EnrichmentSection[] = [
    {
        id: 'pricing',
        label: 'Pricing',
        fields: [
            { key: 'customer_price', label: 'Expected Price (INR)', type: 'number', placeholder: 'e.g., 5500000' },
            { key: 'price_negotiable', label: 'Negotiable?', type: 'radio', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
        ],
    },
    {
        id: 'amenities',
        label: 'Amenities',
        fields: [
            {
                key: 'features', label: 'Select amenities', type: 'multi_select', options: [
                    { value: 'parking', label: 'Parking' },
                    { value: 'lift', label: 'Lift' },
                    { value: 'gym', label: 'Gym' },
                    { value: 'security', label: 'Security' },
                    { value: 'power_backup', label: 'Power Backup' },
                    { value: 'garden', label: 'Garden' },
                    { value: 'pool', label: 'Swimming Pool' },
                    { value: 'water_supply', label: 'Water Supply' },
                    { value: 'club_house', label: 'Club House' },
                    { value: 'intercom', label: 'Intercom' },
                    { value: 'gas_pipeline', label: 'Gas Pipeline' },
                    { value: 'park', label: 'Park' },
                ],
            },
        ],
    },
    {
        id: 'area',
        label: 'Area',
        fields: [
            { key: 'area', label: 'Built-up Area (sq.ft)', type: 'number', placeholder: 'e.g., 1200' },
            { key: 'carpet_area', label: 'Carpet Area (sq.ft)', type: 'number', placeholder: 'e.g., 900' },
        ],
    },
    {
        id: 'details',
        label: 'Property Details',
        fields: [
            {
                key: 'facing', label: 'Facing', type: 'select', options: [
                    { value: 'north', label: 'North' }, { value: 'south', label: 'South' },
                    { value: 'east', label: 'East' }, { value: 'west', label: 'West' },
                    { value: 'north_east', label: 'North-East' }, { value: 'north_west', label: 'North-West' },
                    { value: 'south_east', label: 'South-East' }, { value: 'south_west', label: 'South-West' },
                ],
            },
            {
                key: 'furnishing', label: 'Furnishing', type: 'select', options: [
                    { value: 'unfurnished', label: 'Unfurnished' },
                    { value: 'semi_furnished', label: 'Semi-Furnished' },
                    { value: 'fully_furnished', label: 'Fully Furnished' },
                ],
            },
            { key: 'total_floors', label: 'Total Floors', type: 'number', placeholder: 'e.g., 12' },
            { key: 'bathrooms', label: 'Bathrooms', type: 'number', placeholder: 'e.g., 2' },
            {
                key: 'property_age', label: 'Property Age', type: 'select', options: [
                    { value: 'new_construction', label: 'New Construction' },
                    { value: '1-3_years', label: '1-3 Years' },
                    { value: '3-5_years', label: '3-5 Years' },
                    { value: '5-10_years', label: '5-10 Years' },
                    { value: '10+_years', label: '10+ Years' },
                ],
            },
            { key: 'description', label: 'Description', type: 'text', placeholder: 'Describe surroundings, highlights...' },
        ],
    },
];

export const EnrichmentPanel: React.FC<EnrichmentPanelProps> = ({ inventoryId, onDone, onAddNew }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<Record<string, any>>({});
    const [completionPct, setCompletionPct] = useState(0);
    const [savedSections, setSavedSections] = useState<Set<string>>(new Set());

    useEffect(() => {
        (async () => {
            try {
                const data = await getInventoryEnrichment(inventoryId);
                setEditValues(data.current || {});
                setCompletionPct(data.completion_pct || 0);
            } catch { /* ignore */ }
            setLoading(false);
        })();
    }, [inventoryId]);

    const saveSection = useCallback(async (sectionId: string) => {
        setSaving(sectionId);
        try {
            const section = ENRICHMENT_SECTIONS.find(s => s.id === sectionId);
            if (!section) return;

            const fields: Record<string, any> = {};
            for (const field of section.fields) {
                if (editValues[field.key] !== undefined) {
                    fields[field.key] = editValues[field.key];
                }
            }

            const result = await enrichInventory(inventoryId, fields);
            setCompletionPct(result.completion_pct || completionPct);
            setSavedSections(prev => new Set([...prev, sectionId]));
        } catch { /* ignore */ }
        setSaving(null);
    }, [inventoryId, editValues, completionPct]);

    const updateField = (key: string, value: any) => {
        setEditValues(prev => ({ ...prev, [key]: value }));
    };

    const toggleFeature = (feature: string) => {
        const currentFeatures = editValues.features || {};
        const updated = { ...currentFeatures, [feature]: !currentFeatures[feature] };
        setEditValues(prev => ({ ...prev, features: updated }));
    };

    if (loading) {
        return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading details...</div>;
    }

    return (
        <div style={{ padding: '20px' }}>
            {/* Completion bar */}
            <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Listing Completion</span>
                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: completionPct > 60 ? '#34d399' : '#f59e0b' }}>{completionPct}%</span>
                </div>
                <div style={{ height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${completionPct}%`, background: completionPct > 60 ? '#34d399' : '#f59e0b', borderRadius: '3px', transition: 'width 0.3s ease' }} />
                </div>
            </div>

            {/* Sections */}
            {ENRICHMENT_SECTIONS.map(section => (
                <div key={section.id} style={{
                    marginBottom: '20px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    padding: '16px',
                    background: savedSections.has(section.id) ? 'rgba(52, 211, 153, 0.05)' : 'var(--bg-primary)',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {savedSections.has(section.id) && <span style={{ color: '#34d399', marginRight: '6px' }}>&#10004;</span>}
                            {section.label}
                        </h4>
                        <button
                            style={{
                                padding: '6px 16px',
                                borderRadius: '6px',
                                border: 'none',
                                background: saving === section.id ? 'var(--bg-secondary)' : '#2563eb',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: '13px',
                            }}
                            onClick={() => saveSection(section.id)}
                            disabled={saving === section.id}
                        >
                            {saving === section.id ? 'Saving...' : 'Save'}
                        </button>
                    </div>

                    {section.fields.map(field => (
                        <div key={field.key} style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>{field.label}</label>

                            {field.type === 'number' && (
                                <input
                                    type="number"
                                    value={editValues[field.key] || ''}
                                    placeholder={field.placeholder}
                                    onChange={e => updateField(field.key, e.target.value)}
                                    style={inputStyle}
                                />
                            )}

                            {field.type === 'text' && (
                                <textarea
                                    value={editValues[field.key] || ''}
                                    placeholder={field.placeholder}
                                    onChange={e => updateField(field.key, e.target.value)}
                                    style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
                                />
                            )}

                            {field.type === 'select' && (
                                <select
                                    value={editValues[field.key] || ''}
                                    onChange={e => updateField(field.key, e.target.value)}
                                    style={inputStyle}
                                >
                                    <option value="">Select...</option>
                                    {field.options?.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            )}

                            {field.type === 'radio' && (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {field.options?.map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => updateField(field.key, opt.value)}
                                            style={{
                                                padding: '6px 16px',
                                                borderRadius: '6px',
                                                border: '1px solid',
                                                borderColor: editValues[field.key] === opt.value ? '#2563eb' : 'var(--border-color)',
                                                background: editValues[field.key] === opt.value ? 'rgba(37, 99, 235, 0.1)' : 'transparent',
                                                color: editValues[field.key] === opt.value ? '#2563eb' : 'var(--text-primary)',
                                                cursor: 'pointer',
                                                fontSize: '13px',
                                            }}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {field.type === 'multi_select' && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {field.options?.map(opt => {
                                        const isSelected = editValues.features?.[opt.value] === true;
                                        return (
                                            <button
                                                key={opt.value}
                                                onClick={() => toggleFeature(opt.value)}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '20px',
                                                    border: '1px solid',
                                                    borderColor: isSelected ? '#34d399' : 'var(--border-color)',
                                                    background: isSelected ? 'rgba(52, 211, 153, 0.1)' : 'transparent',
                                                    color: isSelected ? '#34d399' : 'var(--text-muted)',
                                                    cursor: 'pointer',
                                                    fontSize: '12px',
                                                }}
                                            >
                                                {isSelected ? '✓ ' : ''}{opt.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ))}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '24px' }}>
                <button
                    onClick={onAddNew}
                    style={{
                        padding: '10px 24px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#2563eb',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '14px',
                    }}
                >
                    Add New Inventory
                </button>
                <button
                    onClick={onDone}
                    style={{
                        padding: '10px 24px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        background: 'transparent',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: '14px',
                    }}
                >
                    Back to List
                </button>
            </div>
        </div>
    );
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
};
