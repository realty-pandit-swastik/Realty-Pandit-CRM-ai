/**
 * SEO-friendly slug generator for property URLs.
 *
 * Generates slugs like: 3bhk-builder-flat-for-sale-in-sector-5-vaishali-ghaziabad-88d2f7f0b30d
 * Uses full_address for detailed location, falls back to locality/city.
 */

import prisma from '../db';

function toSlug(text: string): string {
    return text
        .toLowerCase()
        .replace(/['']/g, '')           // Remove apostrophes
        .replace(/[^a-z0-9\s-]/g, ' ') // Replace special chars with space
        .replace(/\s+/g, '-')           // Spaces to hyphens
        .replace(/-+/g, '-')            // Collapse multiple hyphens
        .replace(/^-|-$/g, '')          // Trim leading/trailing hyphens
        .substring(0, 120);             // Max 120 chars for slug base
}

/**
 * Extract meaningful address parts from full_address.
 * Strips country ("India"), state, and pincode — keeps sector/locality/sub-area/city.
 *
 * Example: "Sector 5, Vaishali, Ghaziabad, Uttar Pradesh, India"
 * Returns: ["Sector 5", "Vaishali", "Ghaziabad"]
 */
function extractAddressParts(fullAddress: string, city?: string | null): string[] {
    const stripped = fullAddress
        .replace(/,?\s*India$/i, '')                  // Remove country
        .replace(/,?\s*\d{6}\s*/g, '')                // Remove pincode
        .replace(/,?\s*(Uttar Pradesh|Maharashtra|Karnataka|Tamil Nadu|Telangana|Haryana|Delhi|Rajasthan|Gujarat|West Bengal|Madhya Pradesh|Bihar|Punjab|Andhra Pradesh|Kerala|Jharkhand|Chhattisgarh|Uttarakhand|Odisha|Goa|Assam|Himachal Pradesh|Jammu and Kashmir|Tripura|Meghalaya|Manipur|Nagaland|Arunachal Pradesh|Mizoram|Sikkim)\s*$/i, '');

    const parts = stripped.split(',').map(p => p.trim()).filter(Boolean);

    // Remove parts that are just the city repeated at the end
    if (city && parts.length > 1) {
        const lastPart = parts[parts.length - 1];
        if (lastPart.toLowerCase() === city.toLowerCase() && parts.slice(0, -1).some(p => p.toLowerCase().includes(city.toLowerCase()))) {
            parts.pop();
        }
    }

    return parts;
}

// A leading address segment that starts with one of these is a real geo term, never a unit
// (so "Sector 4" / "Phase 1" are always kept even though they end in a number).
const GEO_KEYWORD = /^(sector|sec|phase|block|pocket|gali|ward|zone|extn|extension|colony|nagar|vihar|enclave|garden|greens?|city|road|marg|chowk|khand|mohalla)\b/i;
// Explicit unit identifiers anywhere in a segment: "Plot No 11", "H.No 42", "Flat 5", "Shop 3".
const UNIT_LABEL = /\b(flat|plot|unit|shop|house|h|gala|khasra|kh)\.?\s*(no\.?)?\s*[-:]?\s*\w*\d/i;
// A bare unit token like "FF1", "G4", "102", "325/4", "4/498", "16a".
const BARE_UNIT = /^[a-z]{0,4}[-\s/]?\d+([-/]\d+)?[a-z]?$/i;

/**
 * Privacy: remove flat/plot/unit identifiers from address parts so they never reach the
 * public SEO slug, while keeping sector/locality/society (good for SEO). Drops a part when:
 *  1. it exactly equals the structured flat_no/plot_no (part-level — "Sector 6" survives plot_no "6");
 *  2. it is an explicit unit label ("Plot No 11", "H.No 42");
 *  3. it's a leading (first two) bare unit token ("FF1","325/4","102") and not a geo term —
 *     this catches legacy rows where flat_no/plot_no columns are empty but full_address embeds the unit.
 * If everything would be stripped, returns [] (an address-less slug beats leaking the unit).
 */
function stripUnitParts(parts: string[], flatNo?: string | null, plotNo?: string | null): string[] {
    const priv = new Set([flatNo, plotNo].filter(Boolean).map(v => toSlug(String(v))).filter(Boolean));
    return parts.filter((p, i) => {
        const ps = toSlug(p);
        if (!ps) return false;
        if (priv.has(ps)) return false;                                        // 1
        if (UNIT_LABEL.test(p)) return false;                                  // 2
        if (i < 2 && BARE_UNIT.test(p.trim()) && !GEO_KEYWORD.test(p.trim())) return false; // 3
        return true;
    });
}

interface SlugInput {
    type?: string;
    category?: string;
    specs?: any;
    intent?: string;
    location?: string | null;
    city?: string | null;
    locality?: string | null;
    sub_locality?: string | null;
    apartment_name?: string | null;
    full_address?: string | null;
    flat_no?: string | null;   // private — never in the public slug
    plot_no?: string | null;   // private — never in the public slug
    configuration_name?: string | null; // e.g. "3 BHK", "2 BHK"
    id: string;
}

/**
 * Generate a unique SEO slug for a property.
 * Format: {bhk}bhk-{type}-for-{sale|rent}-in-{address-parts}-{short-id}
 *
 * Priority for address:
 * 1. full_address (parsed) — most detailed
 * 2. sub_locality + locality + city
 * 3. locality + city
 * 4. location field (first part before comma) + city
 */
export function generateSlugBase(property: SlugInput): string {
    const parts: string[] = [];

    // BHK prefix — check specs.bedrooms first, then configuration_name (e.g. "3 BHK")
    const specs = property.specs || {};
    let bhk = specs.bedrooms;
    if (!bhk && property.configuration_name) {
        const match = property.configuration_name.match(/^(\d+)\s*BHK/i);
        if (match) bhk = parseInt(match[1]);
    }
    if (bhk) {
        parts.push(`${bhk}bhk`);
    }

    // Property type (convert underscores to spaces so toSlug makes them hyphens)
    if (property.type) {
        parts.push(property.type.replace(/_/g, ' '));
    }

    // Intent: for-sale / for-rent
    if (property.intent === 'sell') {
        parts.push('for sale');
    } else if (property.intent === 'rent') {
        parts.push('for rent');
    }

    // Build address from best available source
    let addressParts: string[] = [];

    if (property.full_address && property.full_address.length > 10) {
        // Use full_address — richest source
        addressParts = extractAddressParts(property.full_address, property.city);
    } else {
        // Fallback: construct from individual fields
        if (property.sub_locality && property.sub_locality !== property.city) {
            addressParts.push(property.sub_locality);
        }
        if (property.locality && property.locality !== property.city && property.locality !== property.sub_locality) {
            addressParts.push(property.locality);
        } else if (!property.sub_locality && property.location) {
            const firstPart = property.location.split(',')[0]?.trim();
            if (firstPart && firstPart.toLowerCase() !== property.city?.toLowerCase()) {
                addressParts.push(firstPart);
            }
        }
        if (property.city) {
            addressParts.push(property.city);
        }
    }

    // Privacy: never expose the flat/plot/unit number in the public URL.
    addressParts = stripUnitParts(addressParts, property.flat_no, property.plot_no);

    if (addressParts.length > 0) {
        parts.push('in');
        parts.push(...addressParts);
    }

    const baseSlug = toSlug(parts.join(' '));

    // Add short ID suffix for uniqueness (last 12 chars of UUID)
    const shortId = property.id.split('-').pop() || property.id.substring(0, 8);

    return baseSlug ? `${baseSlug}-${shortId}` : shortId;
}

/**
 * Generate a slug and ensure it's unique in the database.
 */
export async function generateUniqueSlug(property: SlugInput): Promise<string> {
    const slug = generateSlugBase(property);

    // Check if slug already exists
    const existing = await prisma.inventory.findUnique({ where: { slug } });
    if (!existing || existing.id === property.id) {
        return slug;
    }

    // If collision, append extra characters
    const shortId = property.id.substring(0, 8);
    return `${slug}-${shortId}`;
}
