import axios from 'axios';

export interface GeoCoords {
    lat: number;
    lng: number;
}

/**
 * Geocode a free-text address string using Google Maps Geocoding API.
 * Returns null if API key is missing, address is empty, or no results found.
 * Non-throwing — always returns null on error.
 */
export async function geocodeAddress(address: string): Promise<GeoCoords | null> {
    // Prefer a dedicated server-side geocoding key (GOOGLE_MAPS_API_KEY is referrer-restricted for the browser).
    const key = process.env.GEOCODING_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    if (!key || !address?.trim()) return null;
    try {
        const res = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: { address: address.trim(), key },
            timeout: 5000,
        });
        if (res.data.status === 'OK' && res.data.results?.length > 0) {
            const loc = res.data.results[0].geometry.location;
            return { lat: loc.lat, lng: loc.lng };
        }
        return null;
    } catch {
        return null;
    }
}
