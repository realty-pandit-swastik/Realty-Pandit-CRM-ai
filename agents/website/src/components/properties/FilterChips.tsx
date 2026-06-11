'use client';

import { X } from 'lucide-react';

const FURNISHING_LABELS: Record<string, string> = {
    fully_furnished: 'Furnished',
    semi_furnished: 'Semi-Furnished',
    unfurnished: 'Unfurnished',
};

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

interface FilterChipsProps {
    filters: FilterState;
    onRemoveFilter: (key: string, value: string) => void;
}

function humanize(v: string): string {
    return v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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

export default function FilterChips({ filters, onRemoveFilter }: FilterChipsProps) {
    const chips: { key: string; value: string; label: string }[] = [];

    if (filters.location) chips.push({ key: 'location', value: filters.location, label: filters.location });
    if (filters.taxonomy_node_id) chips.push({ key: 'taxonomy_node_id', value: filters.taxonomy_node_id, label: 'Property type' });

    if (filters.price_min || filters.price_max) {
        const min = filters.price_min ? `₹${filters.price_min}` : '₹0';
        const max = filters.price_max ? `₹${filters.price_max}` : 'Any';
        chips.push({ key: 'budget', value: 'budget', label: `${min} - ${max}` });
    }

    // Multi-value spec filters — one chip per selected value.
    const multi: Array<[keyof FilterState, (v: string) => string]> = [
        ['bhk', (v) => `${v} BHK`],
        ['rooms', (v) => `${v} Rooms`],
        ['furnishing', (v) => FURNISHING_LABELS[v] || humanize(v)],
        ['facing', (v) => humanize(v)],
        ['age', (v) => humanize(v)],
        ['amenities', (v) => humanize(v)],
    ];
    for (const [key, label] of multi) {
        const raw = String(filters[key] ?? '');
        raw.split(',').filter(Boolean).forEach(v => chips.push({ key: String(key), value: v, label: label(v) }));
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
