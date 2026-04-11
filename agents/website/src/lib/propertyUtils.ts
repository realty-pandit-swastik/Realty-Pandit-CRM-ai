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

/** Resolve bedrooms: prefer specs.bedrooms, fall back to slug extraction */
export function resolveBedroomCount(property: Pick<Property, 'specs' | 'slug'>): number | null {
    const fromSpecs = property.specs?.bedrooms ? Number(property.specs.bedrooms) : null;
    if (fromSpecs && fromSpecs > 0) return fromSpecs;
    return extractBedroomsFromSlug((property as any).slug);
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
    return map[type?.toLowerCase()] ?? (type ? type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Property');
}

export function formatAddress(property: Property): string {
    const parts = [
        property.apartment_name,
        property.locality || property.sub_locality,
        property.city || property.district,
    ].filter(Boolean).map(p => toTitleCase(p as string));
    return parts.join(', ') || (property.location ? toTitleCase(property.location) : '');
}

export function formatPropertyTitle(property: Property, mode: 'short' | 'long' = 'short'): string {
    const bedrooms = resolveBedroomCount(property);
    const bhk = bedrooms && bedrooms > 0 ? `${bedrooms} BHK ` : '';
    const type = formatType(property.type);
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

export function formatPropertyAge(age: string | null | undefined): string {
    if (!age) return '';
    return age.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
