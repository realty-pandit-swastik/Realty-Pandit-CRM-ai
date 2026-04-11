'use client';

import { useMemo } from 'react';
import { X } from 'lucide-react';
import Accordion from '@/components/ui/Accordion';
import type { PropertyCategory, PropertyConfiguration, PropertySubCategory, PropertyType } from '@/lib/useMasterData';

const FURNISHING_OPTIONS = [
    { label: 'Furnished', value: 'fully_furnished' },
    { label: 'Semi-Furnished', value: 'semi_furnished' },
    { label: 'Unfurnished', value: 'unfurnished' },
];

const AMENITY_OPTIONS = [
    { key: 'parking', label: 'Parking' },
    { key: 'lift', label: 'Lift' },
    { key: 'garden', label: 'Garden' },
    { key: 'pool', label: 'Pool' },
    { key: 'gym', label: 'Gym' },
    { key: 'security', label: 'Security' },
    { key: 'power_backup', label: 'Power Backup' },
    { key: 'water_supply', label: '24x7 Water' },
    { key: 'club_house', label: 'Club House' },
    { key: 'gas_pipeline', label: 'Gas Pipeline' },
    { key: 'park', label: 'Park' },
];

// Slider steps in actual rupees — different for rent vs sale
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
    for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i] <= val) return i;
    }
    return 0;
}

function stepToVal(step: number, steps: number[]): number {
    return steps[Math.min(step, steps.length - 1)] || 0;
}

interface FilterState {
    location: string;
    category_id: string;
    sub_category_id: string;
    type_id: string;
    configuration_id: string;
    usage_type_id: string;
    investment_type_id: string;
    intent: string;
    price_min: string;
    price_max: string;
    furnishing: string;
    ownership_type: string;
    amenities: string;
    sort: string;
    page: number;
}

interface PropertySidebarProps {
    filters: FilterState;
    onFilterChange: (key: string, value: string) => void;
    onToggleMultiFilter: (key: string, value: string) => void;
    onClearFilters: () => void;
    categories: PropertyCategory[];
    configurations: PropertyConfiguration[];
    subCategories: PropertySubCategory[];
    types: PropertyType[];
    hasActiveFilters: boolean;
    activeTab: 'rent' | 'resale' | 'projects';
}

function isMultiActive(filterValue: string, id: string): boolean {
    if (!filterValue) return false;
    return filterValue.split(',').includes(id);
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

function BudgetSlider({ priceMin, priceMax, onChange, isRent }: {
    priceMin: string;
    priceMax: string;
    onChange: (key: string, value: string) => void;
    isRent: boolean;
}) {
    const steps = isRent ? RENT_STEPS : SALE_STEPS;
    const maxIdx = steps.length - 1;
    const minVal = Number(priceMin) || 0;
    const maxVal = Number(priceMax) || steps[maxIdx];
    const minStep = valToStep(minVal, steps);
    const maxStep = valToStep(maxVal, steps);

    const leftPct = (minStep / maxIdx) * 100;
    const rightPct = (maxStep / maxIdx) * 100;

    return (
        <div className="space-y-3">
            {/* Labels showing current range */}
            <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-blue-600 dark:text-blue-400">{formatRupees(minVal)}</span>
                <span className="text-slate-400 dark:text-slate-500">to</span>
                <span className="text-blue-600 dark:text-blue-400">
                    {maxVal >= steps[maxIdx] ? `${formatRupees(maxVal)}+` : formatRupees(maxVal)}
                </span>
            </div>

            {/* Dual range slider */}
            <div className="relative h-6 flex items-center">
                <div className="absolute w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700" />
                <div
                    className="absolute h-1.5 rounded-full bg-blue-500"
                    style={{ left: `${leftPct}%`, width: `${Math.max(rightPct - leftPct, 0)}%` }}
                />
                {/* Min thumb */}
                <input
                    type="range"
                    min={0}
                    max={maxIdx}
                    value={minStep}
                    aria-label="Minimum budget"
                    onChange={(e) => {
                        const step = Number(e.target.value);
                        const val = stepToVal(step, steps);
                        if (val <= maxVal) onChange('price_min', String(val));
                    }}
                    className="absolute w-full h-6 appearance-none bg-transparent pointer-events-none z-10
                        [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none
                        [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full
                        [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-600
                        [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer
                        [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none
                        [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full
                        [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-blue-600
                        [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer"
                />
                {/* Max thumb */}
                <input
                    type="range"
                    min={0}
                    max={maxIdx}
                    value={maxStep}
                    aria-label="Maximum budget"
                    onChange={(e) => {
                        const step = Number(e.target.value);
                        const val = stepToVal(step, steps);
                        if (val >= minVal) onChange('price_max', String(val));
                    }}
                    className="absolute w-full h-6 appearance-none bg-transparent pointer-events-none z-20
                        [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none
                        [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full
                        [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-600
                        [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer
                        [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none
                        [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full
                        [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-blue-600
                        [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer"
                />
            </div>

            {/* Scale labels */}
            {isRent ? (
                <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 px-0.5">
                    <span>₹0</span>
                    <span>₹25K</span>
                    <span>₹50K</span>
                    <span>₹1L</span>
                    <span>₹2L+</span>
                </div>
            ) : (
                <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 px-0.5">
                    <span>₹0</span>
                    <span>₹50L</span>
                    <span>₹1Cr</span>
                    <span>₹3Cr</span>
                    <span>₹5Cr+</span>
                </div>
            )}

            {/* Number inputs for exact values */}
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-[10px] text-slate-400 dark:text-slate-500 mb-0.5 block">Min (₹)</label>
                    <input
                        type="number"
                        placeholder={isRent ? 'e.g. 15000' : 'e.g. 5000000'}
                        aria-label="Minimum budget in rupees"
                        value={priceMin}
                        onChange={(e) => onChange('price_min', e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                    />
                </div>
                <div>
                    <label className="text-[10px] text-slate-400 dark:text-slate-500 mb-0.5 block">Max (₹)</label>
                    <input
                        type="number"
                        placeholder={isRent ? 'e.g. 50000' : 'e.g. 20000000'}
                        aria-label="Maximum budget in rupees"
                        value={priceMax}
                        onChange={(e) => onChange('price_max', e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                    />
                </div>
            </div>
        </div>
    );
}

export default function PropertySidebar({
    filters,
    onFilterChange,
    onToggleMultiFilter,
    onClearFilters,
    categories,
    configurations,
    subCategories,
    types,
    hasActiveFilters,
    activeTab,
}: PropertySidebarProps) {
    const isResale = activeTab !== 'projects';
    const isRent = activeTab === 'rent';

    const accordionItems = useMemo(() => {
        const items: any[] = [];

        // 1. Property Type — FIRST (shows actual DB categories: Residential, Commercial, etc.)
        if (isResale && categories.length > 0) {
            items.push({
                id: 'property-type',
                title: 'Property Type',
                defaultOpen: true,
                content: (
                    <div className="space-y-3">
                        {/* Category pills */}
                        <div className="flex flex-wrap gap-2">
                            {categories.map(cat => (
                                <PillButton
                                    key={cat.id}
                                    label={cat.name}
                                    active={filters.category_id === cat.id}
                                    onClick={() => onFilterChange('category_id', filters.category_id === cat.id ? '' : cat.id)}
                                />
                            ))}
                        </div>

                        {/* Subcategory pills */}
                        {subCategories.length > 0 && (
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5 font-semibold">Sub Category</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {subCategories.map(sc => (
                                        <PillButton
                                            key={sc.id}
                                            label={sc.name}
                                            active={isMultiActive(filters.sub_category_id, sc.id)}
                                            onClick={() => onToggleMultiFilter('sub_category_id', sc.id)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Type pills */}
                        {types.length > 0 && (
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5 font-semibold">Type</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {types.map(t => (
                                        <PillButton
                                            key={t.id}
                                            label={t.name}
                                            active={isMultiActive(filters.type_id, t.id)}
                                            onClick={() => onToggleMultiFilter('type_id', t.id)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ),
            });
        }

        // 2. Budget — Slider + number inputs (tab-aware: rent vs sale ranges)
        items.push({
            id: 'budget',
            title: isRent ? 'Monthly Rent' : 'Budget',
            defaultOpen: true,
            content: (
                <BudgetSlider
                    priceMin={filters.price_min}
                    priceMax={filters.price_max}
                    onChange={onFilterChange}
                    isRent={isRent}
                />
            ),
        });

        // 4. Bedrooms (multi-select) — only show BHK/Studio configs, not commercial ones
        const COMMERCIAL_CONFIG_SLUGS = new Set(['furnished-office', 'bare-shell', 'serviced-office']);
        const bedroomConfigs = configurations.filter(c => !COMMERCIAL_CONFIG_SLUGS.has(c.slug));
        if (isResale && bedroomConfigs.length > 0) {
            items.push({
                id: 'bedrooms',
                title: 'No. of Bedrooms',
                defaultOpen: true,
                content: (
                    <div className="flex flex-wrap gap-2">
                        {bedroomConfigs.map(config => (
                            <PillButton
                                key={config.id}
                                label={config.name}
                                active={isMultiActive(filters.configuration_id, config.id)}
                                onClick={() => onToggleMultiFilter('configuration_id', config.id)}
                            />
                        ))}
                    </div>
                ),
            });
        }

        // 5. Furnishing (multi-select)
        if (isResale) {
            items.push({
                id: 'furnishing',
                title: 'Furnishing',
                defaultOpen: false,
                content: (
                    <div className="flex flex-wrap gap-2">
                        {FURNISHING_OPTIONS.map(opt => (
                            <PillButton
                                key={opt.value}
                                label={opt.label}
                                active={isMultiActive(filters.furnishing, opt.value)}
                                onClick={() => onToggleMultiFilter('furnishing', opt.value)}
                            />
                        ))}
                    </div>
                ),
            });
        }

        // 6. Amenities (multi-select)
        if (isResale) {
            items.push({
                id: 'amenities',
                title: 'Amenities',
                defaultOpen: false,
                content: (
                    <div className="flex flex-wrap gap-1.5">
                        {AMENITY_OPTIONS.map(opt => (
                            <PillButton
                                key={opt.key}
                                label={opt.label}
                                active={isMultiActive(filters.amenities, opt.key)}
                                onClick={() => onToggleMultiFilter('amenities', opt.key)}
                            />
                        ))}
                    </div>
                ),
            });
        }

        return items;
    }, [filters, isResale, isRent, categories, configurations, subCategories, types, onFilterChange, onToggleMultiFilter]);

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Filters</h3>
                {hasActiveFilters && (
                    <button
                        type="button"
                        onClick={onClearFilters}
                        className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                    >
                        <X className="w-3 h-3" /> Clear All
                    </button>
                )}
            </div>

            {/* Filter Accordion */}
            <Accordion items={accordionItems} allowMultiple className="space-y-2" />
        </div>
    );
}
