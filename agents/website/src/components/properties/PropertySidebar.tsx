'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, ChevronLeft } from 'lucide-react';
import Accordion from '@/components/ui/Accordion';
import { getTaxonomyTree, getNodeFields, type TaxonomyTreeNode, type TaxonomyNodeField } from '@/lib/api';

// Static amenity fallback (used only when no taxonomy type is selected). Values match specs labels
// loosely; the backend variant-matches slug↔label so either resolves.
const AMENITY_OPTIONS = [
    { key: 'parking', label: 'Parking' }, { key: 'lift', label: 'Lift' },
    { key: 'garden', label: 'Garden' }, { key: 'pool', label: 'Pool' },
    { key: 'gym', label: 'Gym' }, { key: 'security', label: 'Security' },
    { key: 'power_backup', label: 'Power Backup' }, { key: 'water_supply', label: '24x7 Water' },
    { key: 'club_house', label: 'Club House' }, { key: 'gas_pipeline', label: 'Gas Pipeline' },
    { key: 'park', label: 'Park' },
];
const FURNISHING_OPTIONS = [
    { label: 'Furnished', value: 'fully_furnished' },
    { label: 'Semi-Furnished', value: 'semi_furnished' },
    { label: 'Unfurnished', value: 'unfurnished' },
];

// taxonomy FieldDefinition.key → the /public/properties query param it maps to.
const FIELD_TO_PARAM: Record<string, string> = {
    bhk: 'bhk', rooms: 'rooms', facing: 'facing', 'age-of-construction': 'age',
    furnishing: 'furnishing', amenities: 'amenities',
};

const RENT_STEPS = [0, 5000, 10000, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000, 150000, 200000];
const SALE_STEPS = [0, 1000000, 2000000, 3000000, 5000000, 7500000, 10000000, 15000000, 20000000, 25000000, 30000000, 50000000];

function formatRupees(val: number): string {
    if (val === 0) return '₹0';
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(val % 10000000 === 0 ? 0 : 1)} Cr`;
    if (val >= 100000) return `₹${(val / 100000).toFixed(val % 100000 === 0 ? 0 : 1)} L`;
    if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
    return `₹${val}`;
}
function valToStep(val: number, steps: number[]): number {
    for (let i = steps.length - 1; i >= 0; i--) if (steps[i] <= val) return i;
    return 0;
}
function stepToVal(step: number, steps: number[]): number {
    return steps[Math.min(step, steps.length - 1)] || 0;
}

interface FilterState {
    location: string;
    taxonomy_node_id: string;
    intent: string;
    price_min: string;
    price_max: string;
    furnishing: string;
    amenities: string;
    bhk: string;
    rooms: string;
    facing: string;
    age: string;
    sort: string;
    page: number;
    [k: string]: string | number;
}

interface PropertySidebarProps {
    filters: FilterState;
    onFilterChange: (key: string, value: string) => void;
    onToggleMultiFilter: (key: string, value: string) => void;
    onClearFilters: () => void;
    hasActiveFilters: boolean;
    activeTab: 'rent' | 'resale' | 'projects';
}

function isMultiActive(filterValue: string, id: string): boolean {
    return !!filterValue && filterValue.split(',').includes(id);
}

function PillButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                active
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-500'
            }`}
        >
            {label}
        </button>
    );
}

/** Recursive Category → Sub → (Group →) Type drill-down. Selecting a leaf sets taxonomy_node_id. */
function TaxonomyTypePicker({ tree, selectedNodeId, onSelect }: {
    tree: TaxonomyTreeNode[];
    selectedNodeId: string;
    onSelect: (nodeId: string) => void;
}) {
    const [path, setPath] = useState<TaxonomyTreeNode[]>([]);
    const level = path.length ? (path[path.length - 1].children || []) : tree;

    if (tree.length === 0) {
        return <p className="text-xs text-slate-400 dark:text-slate-500">Loading types…</p>;
    }

    return (
        <div className="space-y-2">
            {path.length > 0 && (
                <button
                    type="button"
                    onClick={() => setPath(p => p.slice(0, -1))}
                    className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                >
                    <ChevronLeft className="w-3 h-3" /> {path.map(n => n.name).join(' › ')}
                </button>
            )}
            <div className="flex flex-wrap gap-1.5">
                {level.map(node => {
                    const hasChildren = (node.children?.length ?? 0) > 0;
                    const active = !hasChildren && selectedNodeId === node.id;
                    return (
                        <PillButton
                            key={node.id}
                            label={hasChildren ? `${node.name} ›` : node.name}
                            active={active}
                            onClick={() => {
                                if (hasChildren) setPath(p => [...p, node]);
                                else onSelect(selectedNodeId === node.id ? '' : node.id);
                            }}
                        />
                    );
                })}
            </div>
        </div>
    );
}

/** Filters specific to the selected taxonomy type, rendered from its FieldDefinition schema. */
function DynamicTypeFilters({ nodeId, filters, onToggleMultiFilter }: {
    nodeId: string;
    filters: FilterState;
    onToggleMultiFilter: (key: string, value: string) => void;
}) {
    const [fields, setFields] = useState<TaxonomyNodeField[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        getNodeFields(nodeId)
            .then(f => { if (!cancelled) setFields(f); })
            .catch(() => { if (!cancelled) setFields([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [nodeId]);

    const filterable = fields.filter(f =>
        FIELD_TO_PARAM[f.key] && Array.isArray(f.options) && f.options.length > 0,
    );

    if (loading) return <p className="text-xs text-slate-400 dark:text-slate-500">Loading filters…</p>;
    if (filterable.length === 0) return <p className="text-xs text-slate-400 dark:text-slate-500">No extra filters for this type.</p>;

    return (
        <div className="space-y-3">
            {filterable.map(field => {
                const param = FIELD_TO_PARAM[field.key];
                const current = String(filters[param] ?? '');
                return (
                    <div key={field.key}>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5 font-semibold">{field.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                            {field.options!.map(opt => (
                                <PillButton
                                    key={opt}
                                    label={opt}
                                    active={isMultiActive(current, opt)}
                                    onClick={() => onToggleMultiFilter(param, opt)}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function BudgetSlider({ priceMin, priceMax, onChange, isRent }: {
    priceMin: string; priceMax: string; onChange: (key: string, value: string) => void; isRent: boolean;
}) {
    const steps = isRent ? RENT_STEPS : SALE_STEPS;
    const maxIdx = steps.length - 1;
    const minVal = Number(priceMin) || 0;
    const maxVal = Number(priceMax) || steps[maxIdx];
    const minStep = valToStep(minVal, steps);
    const maxStep = valToStep(maxVal, steps);
    const leftPct = (minStep / maxIdx) * 100;
    const rightPct = (maxStep / maxIdx) * 100;
    const thumb = `[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-600 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-blue-600 [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer`;
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-blue-600 dark:text-blue-400">{formatRupees(minVal)}</span>
                <span className="text-slate-400 dark:text-slate-500">to</span>
                <span className="text-blue-600 dark:text-blue-400">{maxVal >= steps[maxIdx] ? `${formatRupees(maxVal)}+` : formatRupees(maxVal)}</span>
            </div>
            <div className="relative h-6 flex items-center">
                <div className="absolute w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700" />
                <div className="absolute h-1.5 rounded-full bg-blue-500" style={{ left: `${leftPct}%`, width: `${Math.max(rightPct - leftPct, 0)}%` }} />
                <input type="range" min={0} max={maxIdx} value={minStep} aria-label="Minimum budget"
                    onChange={(e) => { const v = stepToVal(Number(e.target.value), steps); if (v <= maxVal) onChange('price_min', String(v)); }}
                    className={`absolute w-full h-6 appearance-none bg-transparent pointer-events-none z-10 ${thumb}`} />
                <input type="range" min={0} max={maxIdx} value={maxStep} aria-label="Maximum budget"
                    onChange={(e) => { const v = stepToVal(Number(e.target.value), steps); if (v >= minVal) onChange('price_max', String(v)); }}
                    className={`absolute w-full h-6 appearance-none bg-transparent pointer-events-none z-20 ${thumb}`} />
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-[10px] text-slate-400 dark:text-slate-500 mb-0.5 block">Min (₹)</label>
                    <input type="number" placeholder={isRent ? 'e.g. 15000' : 'e.g. 5000000'} aria-label="Minimum budget in rupees"
                        value={priceMin} onChange={(e) => onChange('price_min', e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                </div>
                <div>
                    <label className="text-[10px] text-slate-400 dark:text-slate-500 mb-0.5 block">Max (₹)</label>
                    <input type="number" placeholder={isRent ? 'e.g. 50000' : 'e.g. 20000000'} aria-label="Maximum budget in rupees"
                        value={priceMax} onChange={(e) => onChange('price_max', e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                </div>
            </div>
        </div>
    );
}

export default function PropertySidebar({
    filters, onFilterChange, onToggleMultiFilter, onClearFilters, hasActiveFilters, activeTab,
}: PropertySidebarProps) {
    const isResale = activeTab !== 'projects';
    const isRent = activeTab === 'rent';

    const [tree, setTree] = useState<TaxonomyTreeNode[]>([]);
    useEffect(() => {
        let cancelled = false;
        getTaxonomyTree().then(t => { if (!cancelled) setTree(t); }).catch(() => {});
        return () => { cancelled = true; };
    }, []);

    const accordionItems = useMemo(() => {
        const items: any[] = [];

        if (isResale) {
            items.push({
                id: 'property-type',
                title: 'Property Type',
                defaultOpen: true,
                content: (
                    <TaxonomyTypePicker
                        tree={tree}
                        selectedNodeId={filters.taxonomy_node_id}
                        onSelect={(id) => onFilterChange('taxonomy_node_id', id)}
                    />
                ),
            });
        }

        items.push({
            id: 'budget',
            title: isRent ? 'Monthly Rent' : 'Budget',
            defaultOpen: true,
            content: <BudgetSlider priceMin={filters.price_min} priceMax={filters.price_max} onChange={onFilterChange} isRent={isRent} />,
        });

        // Per-type filters when a taxonomy type is selected; otherwise static furnishing + amenities.
        if (isResale && filters.taxonomy_node_id) {
            items.push({
                id: 'type-filters',
                title: 'Details',
                defaultOpen: true,
                content: <DynamicTypeFilters nodeId={filters.taxonomy_node_id} filters={filters} onToggleMultiFilter={onToggleMultiFilter} />,
            });
        } else if (isResale) {
            items.push({
                id: 'furnishing',
                title: 'Furnishing',
                defaultOpen: false,
                content: (
                    <div className="flex flex-wrap gap-2">
                        {FURNISHING_OPTIONS.map(opt => (
                            <PillButton key={opt.value} label={opt.label} active={isMultiActive(filters.furnishing, opt.value)} onClick={() => onToggleMultiFilter('furnishing', opt.value)} />
                        ))}
                    </div>
                ),
            });
            items.push({
                id: 'amenities',
                title: 'Amenities',
                defaultOpen: false,
                content: (
                    <div className="flex flex-wrap gap-1.5">
                        {AMENITY_OPTIONS.map(opt => (
                            <PillButton key={opt.key} label={opt.label} active={isMultiActive(filters.amenities, opt.key)} onClick={() => onToggleMultiFilter('amenities', opt.key)} />
                        ))}
                    </div>
                ),
            });
        }

        return items;
    }, [filters, isResale, isRent, tree, onFilterChange, onToggleMultiFilter]);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Filters</h3>
                {hasActiveFilters && (
                    <button type="button" onClick={onClearFilters} className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1">
                        <X className="w-3 h-3" /> Clear All
                    </button>
                )}
            </div>
            <Accordion items={accordionItems} allowMultiple className="space-y-2" />
        </div>
    );
}
