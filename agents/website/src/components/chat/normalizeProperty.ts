import { Property, getMediaUrl, getImageUrls } from '@/lib/api';
import { getRoomCount, getRoomLabel, getTypeLabel, getAmenities, getTotalFloors } from '@/lib/propertyUtils';
import { PropertyMatchData } from './PropertyMatchCard';

export interface NormalizedProperty {
    id: string;
    title: string;
    type: string;
    bhk: string;
    location: string;
    price: number | null;
    priceFormatted: string;
    area: string;
    furnishing: string;
    floor: string;
    amenities: string[];
    images: string[];
    videos: string[];
    intent: string;
    status: string;
    source: 'ai' | 'buyer';
    matchIndex?: number;
    totalAvailable?: number;
    detailUrl?: string;
}

export function formatPrice(price: number | null): string {
    if (!price) return 'Price on Request';
    if (price >= 10000000) {
        return `₹${(price / 10000000).toFixed(2)} Cr`;
    } else if (price >= 100000) {
        return `₹${(price / 100000).toFixed(0)} Lakh`;
    } else {
        return `₹${price.toLocaleString('en-IN')}`;
    }
}

export function normalizeFromAI(property: Property): NormalizedProperty {
    // Read from the taxonomy SoT (specs / taxonomy_node), not the dropped columns or legacy configuration.
    const rooms = getRoomCount(property);
    const bhk = rooms != null && rooms > 0 ? `${rooms} ${getRoomLabel(property)}` : '';
    const typeLabel = getTypeLabel(property);
    const area = property.specs?.area ?? property.specs?.area_sqft ?? property.specs?.built_area ?? '';
    const totalFloors = getTotalFloors(property);

    return {
        id: property.id,
        title: [bhk, typeLabel].filter(Boolean).join(' ') || 'Property',
        type: typeLabel,
        bhk,
        location: property.location || '',
        price: property.price,
        priceFormatted: formatPrice(property.price),
        area: area ? `${area} ${property.specs?.unit || 'sqft'}` : '',
        furnishing: (property.specs?.furnishing as string) || '',
        floor: property.floor_number != null ? `${property.floor_number}${totalFloors != null ? `/${totalFloors}` : ''}` : '',
        amenities: getAmenities(property),
        images: getImageUrls(property.media_urls).map(u => getMediaUrl(u)),
        videos: (property.video_urls || []).map(u => getMediaUrl(u)),
        intent: property.intent || '',
        status: property.status || '',
        source: 'ai',
        detailUrl: `/properties/${property.slug || property.id}`,
    };
}

export function normalizeFromBuyer(
    property: PropertyMatchData,
    matchIndex: number,
    totalAvailable: number,
): NormalizedProperty {
    return {
        id: property.property_id,
        title: [property.bhk, property.type].filter(Boolean).join(' ') || 'Property',
        type: property.type || '',
        bhk: property.bhk || '',
        location: property.location || '',
        price: property.display_price,
        priceFormatted: property.display_price_formatted || formatPrice(property.display_price),
        area: property.area || '',
        furnishing: property.furnishing || '',
        floor: property.floor || '',
        amenities: property.amenities || [],
        images: (property.images || []).map(u => getMediaUrl(u)),
        videos: (property.videos || []).map(u => getMediaUrl(u)),
        intent: property.intent || '',
        status: '',
        source: 'buyer',
        matchIndex,
        totalAvailable,
    };
}
