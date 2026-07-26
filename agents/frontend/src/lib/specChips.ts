import { getDisplayFloor } from './floor';

/**
 * Type-aware inventory spec chips (2026-06-11).
 *
 * The card spec row used to show {bedrooms} BHK · {bathrooms} Bath · {area} for EVERY
 * property type — so a Hotel rendered "26 Bath" and commercial showed irrelevant BHK/Bath.
 * pickSpecChips() returns the right chips per property bucket:
 *   - land/plot/agri  -> Area only (never BHK/Bath/Rooms)
 *   - hospitality     -> Rooms + Area (+ Washrooms; never "Bath"/"BHK")
 *   - commercial      -> Area + Floors + Washrooms (never BHK)
 *   - residential     -> BHK + Bath + Area
 * Area carries a `warn` flag when the value is implausibly small (data-entry error) so the
 * card can surface a ⚠ for the owner — we never edit the value.
 */

export interface SpecChip { value: string; warn?: boolean }

// Normalise an area to sqft for plausibility checks.
const AREA_TO_SQFT: Record<string, number> = {
    sqft: 1, sqm: 10.7639, sqyd: 9, acre: 43560, bigha: 27000, marla: 272.25, gaj: 9, katha: 720,
};

export function isImplausibleArea(area: unknown, unit?: string | null): boolean {
    const a = Number(area);
    if (!Number.isFinite(a) || a <= 0) return false; // absent/zero handled at capture, not flagged here
    const factor = AREA_TO_SQFT[String(unit || 'sqft').toLowerCase()] ?? 1;
    return a * factor < 100; // < 100 sqft normalised = clearly too small for any real property
}

type Bucket = 'land' | 'hospitality' | 'commercial' | 'residential';

function bucketOf(item: any): Bucket {
    const type = String(item?.type || '').toLowerCase();
    const main = String(item?.flat_property_type?.main_category || '').toLowerCase();
    const node = String(item?.taxonomy_node?.name || '').toLowerCase();
    if (/plot|land|orchard|agricultur/.test(type) || /plot|land|orchard/.test(node) || main === 'agricultural') return 'land';
    if (/hotel|guest|resort|banquet|cafe|restaurant|hospitality/.test(type) || /hotel|guest|resort|banquet|caf|hospitality/.test(node)) return 'hospitality';
    if (main === 'commercial' || /office|shop|showroom|warehouse|factory|retail|godown|industrial|cold[_\s]?storage|kiosk|complex|mall/.test(type)) return 'commercial';
    return 'residential';
}

function posNum(v: unknown): number | null {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
}

export function pickSpecChips(item: any): SpecChip[] {
    const specs = (item?.specs && typeof item.specs === 'object') ? item.specs : {};
    const chips: SpecChip[] = [];
    const areaChip = (): SpecChip | null => {
        if (specs.area == null || specs.area === '') return null;
        const unit = specs.area_unit || 'sqft';
        return { value: `${specs.area} ${unit}`, warn: isImplausibleArea(specs.area, unit) };
    };
    const pushArea = () => { const a = areaChip(); if (a) chips.push(a); };
    const rooms = posNum(specs.rooms);
    const wash = posNum(specs.bathrooms);
    const floors = posNum(specs.floors);

    switch (bucketOf(item)) {
        case 'land':
            pushArea();
            break;
        case 'hospitality':
            if (rooms) chips.push({ value: `${rooms} Rooms` });
            pushArea();
            if (wash) chips.push({ value: `${wash} Washroom${wash > 1 ? 's' : ''}` });
            break;
        case 'commercial':
            pushArea();
            if (floors) chips.push({ value: `${floors} Floor${floors > 1 ? 's' : ''}` });
            if (wash) chips.push({ value: `${wash} Washroom${wash > 1 ? 's' : ''}` });
            break;
        default: { // residential
            const bhkRaw = specs.bhk ?? specs.rooms ?? specs.bedrooms ?? specs.bhk_count;
            if (bhkRaw != null && bhkRaw !== '') {
                const n = parseInt(String(bhkRaw), 10);
                chips.push({ value: Number.isNaN(n) ? `${bhkRaw}` : `${n} BHK` });
            }
            if (wash) chips.push({ value: `${wash} Bath` });
            pushArea();
        }
    }
    // Floor (2026-07-25) — show the property's own floor on the tile for all but land/plot.
    if (bucketOf(item) !== 'land') {
        const fl = getDisplayFloor(item);
        if (fl) chips.push({ value: /^-?\d+$/.test(fl) ? `Floor ${fl}` : fl });
    }
    return chips;
}

/**
 * Canonical readers (2026-07-22). The 2026-05-28 Specs Unification moved type-specific fields
 * into `inventory.specs` under taxonomy keys. `specs.bhk_count`, `specs.society_name` and
 * `specs.floor` are LEGACY keys present on ZERO of 775 inventory rows — reading them rendered
 * the deal Share tab and the timeline property popup effectively blank. Read through these.
 */
export function bhkOf(specs: any): string | null {
    const raw = specs?.bhk ?? specs?.rooms ?? specs?.bedrooms ?? specs?.bhk_count;
    if (raw == null || raw === '') return null;
    const n = parseInt(String(raw), 10);
    return Number.isNaN(n) ? String(raw) : String(n);
}

/** Society / building. Canonical field is inventory.apartment_name (specs.society_name is dead). */
export function societyOf(inv: any): string {
    return inv?.apartment_name || inv?.specs?.society_name || inv?.locality || inv?.location || '';
}

/** Human property-type label — the taxonomy node name beats the raw enum slug ("builder_floor"). */
export function propertyTypeLabel(inv: any): string {
    return inv?.taxonomy_node?.name || inv?.flat_property_type?.name || inv?.type || 'Property';
}
