import type { Property } from './api';
import { formatPrice } from './api';

/** Normalize raw DB strings: "vaishali sector 1" → "Vaishali Sector 1", "BUILDER" → "Builder" */
function toTitleCase(str: string): string {
    return str.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

/** Extract bedroom count from slug when specs.bedrooms is missing, e.g. "3bhk-apartment-..." → 3 */
export function extractBedroomsFromSlug(slug: string | null | undefined): number | null {
    if (!slug) return null;
    const match = slug.match(/^(\d+)bhk/i);
    return match ? parseInt(match[1], 10) : null;
}

/**
 * Room/BHK count — specs.bhk (residential) ?? rooms (commercial) ?? legacy bedrooms ?? bhk_count,
 * falling back to slug extraction. The dedicated bedrooms column never existed for inventory;
 * the new taxonomy stores the count in specs keyed by FieldDefinition.key.
 */
export function getRoomCount(property: Pick<Property, 'specs' | 'slug'>): number | null {
    const s = property.specs || {};
    const raw = s.bhk ?? s.rooms ?? s.bedrooms ?? s.bhk_count;
    const n = raw != null ? parseInt(String(raw), 10) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
    return extractBedroomsFromSlug((property as any).slug);
}

/** Whether this property is counted in BHK (residential) or Rooms (commercial). */
export function getRoomLabel(property: Pick<Property, 'specs' | 'category'>): 'BHK' | 'Rooms' {
    const s = property.specs || {};
    if (s.bhk != null || s.bedrooms != null || s.bhk_count != null) return 'BHK';
    if (s.rooms != null) return 'Rooms';
    return (property.category || '').toLowerCase() === 'commercial' ? 'Rooms' : 'BHK';
}

/** Resolve bedrooms (back-compat alias) — now uses the full BHK/Rooms chain. */
export function resolveBedroomCount(property: Pick<Property, 'specs' | 'slug'>): number | null {
    return getRoomCount(property);
}

/**
 * Display type label. A CONFIDENT taxonomy node wins (e.g. "Shopping Mall Showroom"). But the
 * 2026-05-31 BHK-heuristic backfill assigned the GENERIC "Flat" node to many residential records
 * (flagged needs_taxonomy_review) — for those the legacy specific type ("Apartment / Gated Society")
 * is more accurate, so prefer it. Falls back to the node name / legacy link / formatted slug.
 */
export function getTypeLabel(
    property: Pick<Property, 'property_type_link' | 'type'> & {
        taxonomy_node?: { name?: string | null } | null;
        flat_property_type?: { name?: string | null } | null;
        needs_taxonomy_review?: boolean | null;
    },
): string {
    if (property.taxonomy_node?.name && !property.needs_taxonomy_review) return property.taxonomy_node.name;
    return property.flat_property_type?.name
        ?? property.property_type_link?.name
        ?? property.taxonomy_node?.name
        ?? formatType(property.type);
}

/** Furnishing / facing / age / total-floors now live in specs (columns dropped 2026-05-28). */
export function getFurnishing(property: Pick<Property, 'specs'>): string | null {
    return (property.specs?.furnishing as string) ?? null;
}
export function getFacing(property: Pick<Property, 'specs'>): string | null {
    return (property.specs?.facing as string) ?? null;
}
export function getConstructionAge(property: Pick<Property, 'specs'>): string | null {
    return (property.specs?.['age-of-construction'] as string) ?? (property.specs?.property_age as string) ?? null;
}
export function getTotalFloors(property: Pick<Property, 'specs'>): number | null {
    const f = property.specs?.floors ?? property.specs?.total_floors;
    const n = f != null ? parseInt(String(f), 10) : NaN;
    return Number.isFinite(n) ? n : null;
}

/** Normalize an amenity slug/label to a clean Title Case label ("power_backup" → "Power Backup"). */
export function humanizeAmenity(a: string): string {
    return String(a).trim().replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Map an amenity label back to a lookup slug for icon maps ("Power Backup" → "power_backup"). */
export function amenitySlug(a: string): string {
    return String(a).trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** Curated labels for known taxonomy spec keys; unknown keys fall back to a humanized key. */
const SPEC_LABELS: Record<string, string> = {
    furnishing: 'Furnishing', facing: 'Facing', 'age-of-construction': 'Age of Construction',
    floors: 'Total Floors', 'plot-area': 'Plot Area', 'plot-area-unit': 'Plot Area Unit',
    'road-facing': 'Road Facing', 'road-width': 'Road Width', 'ownership-tenure': 'Ownership',
    'area-type': 'Area Type', status: 'Construction Status', balconies: 'Balconies',
    'additional-rooms': 'Additional Rooms', 'sides-open': 'Sides Open', carpet_area: 'Carpet Area',
};
// Keys already shown in the top stats row / handled elsewhere — don't repeat in the details grid.
const SPEC_HIDE = new Set([
    'bhk', 'rooms', 'bedrooms', 'bhk_count', 'bathrooms', 'area', 'unit', 'area_unit',
    'amenities', 'parking_list',
]);

/**
 * Format a scalar spec value for display: Title-case word starts and turn "_" into spaces
 * ("fully_furnished" → "Fully Furnished", "unfurnished" → "Unfurnished"), while preserving
 * hyphens and numeric ranges ("Semi-Furnished" stays, "5-10 years" stays).
 */
function formatSpecValue(v: unknown): string {
    const str = String(v).trim();
    if (!str || /^\d/.test(str)) return str;
    return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Every type-specific spec worth displaying on the detail page, as {label, value} pairs — driven
 * purely by what's in specs (so commercial Rooms-adjacent fields, plot-area, facing, age, parking,
 * road-facing, ownership, etc. all surface per type). Scalars only; arrays/objects are handled
 * separately (amenities, parking_list). Excludes the keys already shown in the top stats row.
 */
export function getDisplaySpecs(property: Pick<Property, 'specs'>): Array<{ key: string; label: string; value: string }> {
    const s = property.specs || {};
    return Object.entries(s)
        .filter(([k, v]) => !SPEC_HIDE.has(k) && v != null && v !== '' && typeof v !== 'object')
        .map(([k, v]) => ({ key: k, label: SPEC_LABELS[k] ?? humanizeAmenity(k), value: formatSpecValue(v) }));
}

/**
 * Amenities as humanized label strings. Prefers the new specs.amenities array; falls back to the
 * legacy features {gym:true,…} object (column dropped 2026-05-28, kept only for old cached shapes).
 */
export function getAmenities(property: Pick<Property, 'specs' | 'features'>): string[] {
    const s = property.specs || {};
    if (Array.isArray(s.amenities)) {
        return s.amenities.map((a: any) => humanizeAmenity(String(a))).filter(Boolean);
    }
    const f = (property as any).features;
    if (f && typeof f === 'object') {
        return Object.entries(f).filter(([, v]) => v === true).map(([k]) => humanizeAmenity(k));
    }
    return [];
}

export function formatType(type: string): string {
    const map: Record<string, string> = {
        builder_floor: 'Builder Floor',
        builder_flat: 'Builder Flat',
        flat: 'Apartment/Flat',
        apartment: 'Apartment',
        house: 'Independent House',
        villa: 'Villa',
        plot: 'Plot/Land',
        land: 'Land',
        office: 'Office Space',
        shop: 'Shop/Showroom',
        showroom: 'Shop/Showroom',
        warehouse: 'Warehouse',
        industrial: 'Industrial Space',
        farmhouse: 'Farmhouse',
        pg: 'PG/Co-living',
        studio: 'Studio Apartment',
        penthouse: 'Penthouse',
    };
    return map[type?.toLowerCase()] ?? (type ? type.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Property');
}

export function formatAddress(property: Property): string {
    // Show sub-locality → locality → city (all three), not just one (owner request 2026-07-25).
    // Exact-dedupe (case-insensitive) so identical parts don't repeat.
    const raw = [
        property.apartment_name,
        property.sub_locality,
        property.locality,
        property.city || property.district,
    ].filter(Boolean).map(p => toTitleCase(p as string));
    const seen = new Set<string>();
    const parts = raw.filter(p => { const k = p.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    return parts.join(', ') || (property.location ? toTitleCase(property.location) : '');
}

export function formatPropertyTitle(property: Property, mode: 'short' | 'long' = 'short'): string {
    const rooms = getRoomCount(property);
    const bhk = rooms && rooms > 0 ? `${rooms} ${getRoomLabel(property)} ` : '';
    const type = getTypeLabel(property);
    if (mode === 'short') return `${bhk}${type}`;
    const intent = property.intent === 'rent' ? 'for Rent' : 'for Sale';
    const address = formatAddress(property);
    return address ? `${bhk}${type} ${intent} in ${address}` : `${bhk}${type} ${intent}`;
}

export function formatPageTitle(property: Property): string {
    const title = formatPropertyTitle(property, 'long');
    const price = formatPrice(property.price, property.price_unit);
    return `${title} — ${price} | Realty Pandit`;
}
