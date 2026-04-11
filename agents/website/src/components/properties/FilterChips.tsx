'use client';

import { X } from 'lucide-react';
import type { PropertyCategory, PropertyConfiguration } from '@/lib/useMasterData';

const FURNISHING_LABELS: Record<string, string> = {
    fully_furnished: 'Furnished',
    semi_furnished: 'Semi-Furnished',
    unfurnished: 'Unfurnished',
};

const OWNERSHIP_LABELS: Record<string, string> = {
    OWNER: 'Owner',
    EXTERNAL_AGENT: 'Agent',
    AGENT_OWNER: 'Builder',
};

const AMENITY_LABELS: Record<string, string> = {
    parking: 'Parking',
    lift: 'Lift',
    garden: 'Garden',
    pool: 'Pool',
    gym: 'Gym',
    security: 'Security',
    power_backup: 'Power Backup',
    water_supply: '24x7 Water',
    club_house: 'Club House',
    gas_pipeline: 'Gas Pipeline',
    park: 'Park',
};

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

interface FilterChipsProps {
    filters: FilterState;
    onRemoveFilter: (key: string, value: string) => void;
    categories: PropertyCategory[];
    configurations: PropertyConfiguration[];
}

function findLabel(categories: PropertyCategory[], filterId: string, level: 'category' | 'sub_category' | 'type'): string {
    for (const cat of categories) {
        if (level === 'category' && cat.id === filterId) return cat.name;
        for (const sub of cat.sub_categories) {
            if (level === 'sub_category' && sub.id === filterId) return sub.name;
            for (const t of sub.property_types) {
                if (level === 'type' && t.id === filterId) return t.name;
            }
        }
    }
    return filterId;
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
    return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            {label}
            <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${label} filter`}
                className="ml-0.5 p-0.5 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
            >
                <X className="w-3 h-3" />
            </button>
        </span>
    );
}

export default function FilterChips({ filters, onRemoveFilter, categories, configurations }: FilterChipsProps) {
    const chips: { key: string; value: string; label: string }[] = [];

    if (filters.location) {
        chips.push({ key: 'location', value: filters.location, label: filters.location });
    }

    if (filters.category_id) {
        filters.category_id.split(',').filter(Boolean).forEach(v => {
            chips.push({ key: 'category_id', value: v, label: findLabel(categories, v, 'category') });
        });
    }

    if (filters.sub_category_id) {
        filters.sub_category_id.split(',').filter(Boolean).forEach(v => {
            chips.push({ key: 'sub_category_id', value: v, label: findLabel(categories, v, 'sub_category') });
        });
    }

    if (filters.type_id) {
        filters.type_id.split(',').filter(Boolean).forEach(v => {
            chips.push({ key: 'type_id', value: v, label: findLabel(categories, v, 'type') });
        });
    }

    if (filters.configuration_id) {
        filters.configuration_id.split(',').filter(Boolean).forEach(v => {
            const cfg = configurations.find(c => c.id === v);
            chips.push({ key: 'configuration_id', value: v, label: cfg?.name || v });
        });
    }

    if (filters.price_min || filters.price_max) {
        const min = filters.price_min ? `₹${filters.price_min}` : '₹0';
        const max = filters.price_max ? `₹${filters.price_max}` : 'Any';
        chips.push({ key: 'budget', value: 'budget', label: `${min} - ${max}` });
    }

    if (filters.furnishing) {
        filters.furnishing.split(',').filter(Boolean).forEach(v => {
            chips.push({ key: 'furnishing', value: v, label: FURNISHING_LABELS[v] || v });
        });
    }

    if (filters.ownership_type) {
        filters.ownership_type.split(',').filter(Boolean).forEach(v => {
            chips.push({ key: 'ownership_type', value: v, label: OWNERSHIP_LABELS[v] || v });
        });
    }

    if (filters.amenities) {
        filters.amenities.split(',').filter(Boolean).forEach(v => {
            chips.push({ key: 'amenities', value: v, label: AMENITY_LABELS[v] || v });
        });
    }

    if (chips.length === 0) return null;

    return (
        <div className="flex flex-wrap items-center gap-2 pb-3">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Active:</span>
            {chips.map((chip, i) => (
                <Chip
                    key={`${chip.key}-${chip.value}-${i}`}
                    label={chip.label}
                    onRemove={() => onRemoveFilter(chip.key, chip.value)}
                />
            ))}
        </div>
    );
}
