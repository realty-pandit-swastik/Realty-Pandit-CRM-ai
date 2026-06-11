/**
 * Type-aware property spec chips for the public website (2026-06-11).
 *
 * Mirrors agents/frontend/src/lib/specChips.ts (separate app — can't import across).
 * Picks the right chips per property bucket so a Hotel doesn't render "26 Bath" and
 * commercial/land don't show irrelevant BHK/Bath:
 *   land/plot/agri -> Area only | hospitality -> Rooms + Area | commercial -> Area + Floors + Washroom
 *   residential -> BHK + Bath + Area
 * `kind` lets the card choose an icon; `warn` flags implausibly small area (data-entry error).
 */

export type SpecKind = 'bhk' | 'rooms' | 'bath' | 'washroom' | 'floors' | 'area';
export interface SpecChip { kind: SpecKind; value: string; warn?: boolean }

const AREA_TO_SQFT: Record<string, number> = {
    sqft: 1, sqm: 10.7639, sqyd: 9, acre: 43560, bigha: 27000, marla: 272.25, gaj: 9, katha: 720,
};

export function isImplausibleArea(area: unknown, unit?: string | null): boolean {
    const a = Number(area);
    if (!Number.isFinite(a) || a <= 0) return false;
    const factor = AREA_TO_SQFT[String(unit || 'sqft').toLowerCase()] ?? 1;
    return a * factor < 100;
}

type Bucket = 'land' | 'hospitality' | 'commercial' | 'residential';

function bucketOf(p: any): Bucket {
    const type = String(p?.type || '').toLowerCase();
    const main = String(p?.flat_property_type?.main_category || '').toLowerCase();
    const node = String(p?.taxonomy_node?.name || '').toLowerCase();
    if (/plot|land|orchard|agricultur/.test(type) || /plot|land|orchard/.test(node) || main === 'agricultural') return 'land';
    if (/hotel|guest|resort|banquet|cafe|restaurant|hospitality/.test(type) || /hotel|guest|resort|banquet|caf|hospitality/.test(node)) return 'hospitality';
    if (main === 'commercial' || /office|shop|showroom|warehouse|factory|retail|godown|industrial|cold[_\s]?storage|kiosk|complex|mall/.test(type)) return 'commercial';
    return 'residential';
}

function posNum(v: unknown): number | null {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
}

export function pickSpecChips(p: any): SpecChip[] {
    const specs = (p?.specs && typeof p.specs === 'object') ? p.specs : {};
    const chips: SpecChip[] = [];
    const areaChip = (): SpecChip | null => {
        if (specs.area == null || specs.area === '') return null;
        const unit = specs.area_unit || specs.unit || 'sqft';
        return { kind: 'area', value: `${specs.area} ${unit}`, warn: isImplausibleArea(specs.area, unit) };
    };
    const pushArea = () => { const a = areaChip(); if (a) chips.push(a); };
    const rooms = posNum(specs.rooms);
    const wash = posNum(specs.bathrooms);
    const floors = posNum(specs.floors);

    switch (bucketOf(p)) {
        case 'land':
            pushArea();
            break;
        case 'hospitality':
            if (rooms) chips.push({ kind: 'rooms', value: `${rooms} Rooms` });
            pushArea();
            if (wash) chips.push({ kind: 'washroom', value: `${wash} Washroom${wash > 1 ? 's' : ''}` });
            break;
        case 'commercial':
            pushArea();
            if (floors) chips.push({ kind: 'floors', value: `${floors} Floor${floors > 1 ? 's' : ''}` });
            if (wash) chips.push({ kind: 'washroom', value: `${wash} Washroom${wash > 1 ? 's' : ''}` });
            break;
        default: { // residential
            const bhkRaw = specs.bhk ?? specs.rooms ?? specs.bedrooms ?? specs.bhk_count;
            if (bhkRaw != null && bhkRaw !== '') {
                const n = parseInt(String(bhkRaw), 10);
                chips.push({ kind: 'bhk', value: Number.isNaN(n) ? `${bhkRaw}` : `${n} BHK` });
            }
            if (wash) chips.push({ kind: 'bath', value: `${wash} Bath` });
            pushArea();
        }
    }
    return chips;
}

/** True when price-per-area should be shown (area present and plausible). */
export function canShowPricePerArea(p: any): boolean {
    const specs = (p?.specs && typeof p.specs === 'object') ? p.specs : {};
    const a = Number(specs.area);
    return Number.isFinite(a) && a > 0 && !isImplausibleArea(specs.area, specs.area_unit || specs.unit);
}
