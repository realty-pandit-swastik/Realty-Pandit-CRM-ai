import { Property, getMediaUrl, getImageUrls } from '@/lib/api';
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
    const bhk = property.property_configuration?.name || '';
    const area = property.specs?.area_sqft || property.specs?.built_area || property.specs?.super_built_up_area || '';

    return {
        id: property.id,
        title: [bhk, property.type].filter(Boolean).join(' ') || 'Property',
        type: property.type || '',
        bhk,
        location: property.location || '',
        price: property.price,
        priceFormatted: formatPrice(property.price),
        area: area ? `${area} sqft` : '',
        furnishing: property.specs?.furnishing || '',
        floor: property.specs?.floor ? `${property.specs.floor}${property.specs.total_floors ? `/${property.specs.total_floors}` : ''}` : '',
        amenities: [],
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
