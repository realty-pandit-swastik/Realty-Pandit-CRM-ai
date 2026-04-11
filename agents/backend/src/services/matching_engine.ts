/**
 * Matching Engine Service
 *
 * Core property matching logic. Ranks inventory by:
 * 1. Budget fit (within range or close)
 * 2. Location match (exact or city-level)
 * 3. Property type match (flat, house, plot, etc.)
 * 4. Subscription priority (Internal > ADVANCE_PRO > PRO > FREE)
 * 5. Freshness (recently listed preferred)
 *
 * Used by the Matching Agent. Does NOT import agents — pure service logic.
 */

import prisma from '../db';
import logger from '../utils/logger';

export interface MatchCriteria {
    intent?: string | null;         // buy, rent
    property_type?: string | null;  // flat, house, plot (legacy string)
    type_id?: string | null;        // Classification ID (preferred)
    category_id?: string | null;    // Classification ID
    budget_min?: number | null;
    budget_max?: number | null;
    preferred_location?: string | null;
    preferred_lat?: number | null;  // Latitude from Google Maps
    preferred_lng?: number | null;  // Longitude from Google Maps
    bhk?: number | null;            // bedrooms
    area_min?: number | null;       // Min area requirement
    area_max?: number | null;       // Max area requirement
    area_unit?: string | null;      // "sqft" or "sqmtr"
    demand_amenities?: string[] | null; // ["parking", "lift", "gym"]
}

/**
 * Convert area between sqft and sqmtr.
 */
function normalizeArea(area: number, fromUnit: string | undefined, toUnit: string | null | undefined): number {
    if (!toUnit || !fromUnit || fromUnit === toUnit) return area;
    if (fromUnit === 'sqmtr' && toUnit === 'sqft') return area * 10.764;
    if (fromUnit === 'sqft' && toUnit === 'sqmtr') return area / 10.764;
    return area;
}

/**
 * Haversine distance between two lat/lng points in kilometres.
 */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface MatchedProperty {
    id: string;
    type: string;
    category: string;
    location: string | null;
    price: number | null;
    price_unit: string | null;
    intent: string;
    specs: any;
    features: any;
    furnishing: string | null;
    floor_number: number | null;
    total_floors: number | null;
    media_urls: string[];
    owner_phone: string;
    owner_name?: string;
    match_score: number;       // 0-100 composite score
    priority_tier: string;     // INTERNAL, ADVANCE_PRO, PRO, FREE
    created_at: Date;
}

/**
 * Priority scores for subscription tiers.
 * Higher = shown first when match scores are equal.
 */
const TIER_PRIORITY: Record<string, number> = {
    'INTERNAL': 100,
    'PREMIUM': 90,
    'PRO': 70,
    'BASIC': 50,
    'FREE': 30,
};

export class MatchingEngine {

    /**
     * Find and rank properties matching buyer/tenant criteria.
     *
     * If the lead has lat/lng (from Google Maps), uses Haversine radius expansion:
     *   Pass 1: 2km  → Pass 2: 5km  → Pass 3: 10km  → Pass 4: 20km
     *   Pass 5: text-based fallback for properties without coordinates
     *
     * If no lat/lng, falls back to the original text-matching chain.
     */
    async findMatches(criteria: MatchCriteria, limit: number = 3): Promise<MatchedProperty[]> {
        logger.info(`[MatchingEngine] Searching with criteria: ${JSON.stringify(criteria)}`);

        const hasGeo = criteria.preferred_lat != null && criteria.preferred_lng != null;

        if (hasGeo) {
            const radii = [2, 5, 10, 20];
            for (const radius of radii) {
                const results = await this.searchPropertiesByRadius(criteria, radius, limit);
                if (results.length > 0) {
                    logger.info(`[MatchingEngine] Geo match found at ${radius}km radius — ${results.length} results`);
                    return results;
                }
                logger.info(`[MatchingEngine] No results within ${radius}km — expanding radius`);
            }

            // Pass 5: text fallback for properties without coordinates
            logger.info(`[MatchingEngine] Geo passes exhausted — falling back to text search for non-geocoded properties`);
            const textResults = await this.searchPropertiesNoGeo(criteria, limit);
            if (textResults.length > 0) return textResults;

            // Final fallback: any property matching intent/type without location
            return this.searchProperties({ ...criteria, preferred_location: null, budget_min: null, budget_max: null }, limit);
        }

        // No geo — use original text-based fallback chain
        let results = await this.searchProperties(criteria, limit);

        if (results.length === 0 && criteria.preferred_location) {
            logger.info(`[MatchingEngine] No exact match — broadening location search`);
            const broadLocation = this.broadenLocation(criteria.preferred_location);
            if (broadLocation !== criteria.preferred_location) {
                results = await this.searchProperties({ ...criteria, preferred_location: broadLocation }, limit);
            }
        }

        if (results.length === 0 && criteria.preferred_location) {
            logger.info(`[MatchingEngine] No nearby match — searching entire city/region`);
            results = await this.searchProperties({ ...criteria, preferred_location: null }, limit);
        }

        if (results.length === 0 && (criteria.budget_min || criteria.budget_max)) {
            logger.info(`[MatchingEngine] No budget match — searching without budget filter`);
            results = await this.searchProperties({ ...criteria, preferred_location: null, budget_min: null, budget_max: null }, limit);
        }

        return results;
    }

    /**
     * Radius-based geo search using Haversine distance.
     * Fetches properties WITH lat/lng, filters in Node.js (no PostGIS required).
     * Capped at 500 candidates to protect memory at current scale.
     */
    private async searchPropertiesByRadius(criteria: MatchCriteria, radiusKm: number, limit: number): Promise<MatchedProperty[]> {
        const where: any = { status: 'active', latitude: { not: null }, longitude: { not: null } };

        if (criteria.intent) {
            const intentMap: Record<string, string> = { 'buy': 'sell', 'BUYER': 'sell', 'rent': 'rent', 'TENANT': 'rent' };
            where.intent = intentMap[criteria.intent] || criteria.intent;
        }
        if (criteria.type_id) where.type_id = criteria.type_id;
        else if (criteria.category_id) where.category_id = criteria.category_id;
        // Hard filter by BHK — never show wrong bedroom count
        if (criteria.bhk) {
            where.specs = { path: ['bedrooms'], equals: criteria.bhk };
        }
        if (criteria.budget_min || criteria.budget_max) {
            where.price = {};
            if (criteria.budget_min) where.price.gte = criteria.budget_min * 0.7;
            if (criteria.budget_max) where.price.lte = criteria.budget_max * 1.3;
        }

        const properties = await prisma.inventory.findMany({
            where,
            include: { owner: { include: { subscription: true } }, contact: { select: { name: true } } },
            take: 500, // Memory cap — migrate to PostGIS if dataset grows beyond this
            orderBy: { created_at: 'desc' },
        });

        const lat = criteria.preferred_lat!;
        const lng = criteria.preferred_lng!;

        // Filter by Haversine distance
        const nearby = properties
            .map(prop => ({
                prop,
                distance: haversineDistance(lat, lng, prop.latitude!, prop.longitude!),
            }))
            .filter(({ distance }) => distance <= radiusKm);

        if (nearby.length === 0) return [];

        // Post-fetch area filter (specs.area is JSON, can't filter in Prisma)
        let filtered = nearby;
        if (criteria.area_min || criteria.area_max) {
            filtered = filtered.filter(({ prop }) => {
                const specs = typeof prop.specs === 'string' ? JSON.parse(prop.specs) : prop.specs;
                const area = specs?.area;
                if (!area) return true; // don't exclude properties without area data
                const norm = normalizeArea(area, specs?.unit || specs?.area_unit, criteria.area_unit);
                if (criteria.area_min && norm < criteria.area_min * 0.8) return false;
                if (criteria.area_max && norm > criteria.area_max * 1.2) return false;
                return true;
            });
        }
        // Amenities filter — at least 50% must match
        if (criteria.demand_amenities?.length) {
            filtered = filtered.filter(({ prop }) => {
                if (!prop.features || typeof prop.features !== 'object') return true;
                const matched = criteria.demand_amenities!.filter(a => (prop.features as any)[a] === true);
                return matched.length >= Math.ceil(criteria.demand_amenities!.length * 0.5);
            });
        }

        if (filtered.length === 0) return [];

        const scored = filtered.map(({ prop, distance }) => {
            const baseScore = this.calculateMatchScore(criteria, prop);
            const tier = this.getPropertyTier(prop);
            const tierBonus = (TIER_PRIORITY[tier] || 30) * 0.2;
            return {
                id: prop.id,
                type: prop.type,
                category: prop.category,
                location: prop.location,
                price: prop.price ? Number(prop.price) : null,
                price_unit: prop.price_unit,
                intent: prop.intent,
                specs: prop.specs,
                features: prop.features || null,
                furnishing: prop.furnishing || null,
                floor_number: prop.floor_number || null,
                total_floors: prop.total_floors || null,
                media_urls: prop.media_urls || [],
                owner_phone: prop.owner_phone,
                owner_name: prop.contact?.name || undefined,
                match_score: Math.min(100, baseScore + tierBonus),
                priority_tier: tier,
                created_at: prop.created_at,
                distance_km: distance,
            } as MatchedProperty & { distance_km: number };
        });

        scored.sort((a: any, b: any) => {
            if (Math.abs(b.match_score - a.match_score) > 5) return b.match_score - a.match_score;
            return a.distance_km - b.distance_km; // Tiebreak: closer first
        });

        return scored.slice(0, limit);
    }

    /**
     * Text-based search specifically for properties that have NO lat/lng.
     * Used as Pass 5 when the lead has geo but some properties aren't geocoded.
     */
    private async searchPropertiesNoGeo(criteria: MatchCriteria, limit: number): Promise<MatchedProperty[]> {
        return this.searchProperties(
            { ...criteria },
            limit,
            { latitude: null }  // Only properties without coordinates
        );
    }

    /**
     * Core text-based search with scoring — used by the text fallback chain.
     * extraWhere allows callers to restrict to geo/non-geo properties.
     */
    private async searchProperties(criteria: MatchCriteria, limit: number, extraWhere: any = {}): Promise<MatchedProperty[]> {
        // Build Prisma where clause
        const where: any = { status: 'active', ...extraWhere };

        // Intent filter (sell = buyer, rent = tenant)
        if (criteria.intent) {
            const intentMap: Record<string, string> = {
                'buy': 'sell', 'BUYER': 'sell',
                'rent': 'rent', 'TENANT': 'rent',
            };
            const inventoryIntent = intentMap[criteria.intent] || criteria.intent;
            where.intent = inventoryIntent;
        }

        // Property type filter (hybrid: prefer ID, fallback to string)
        if (criteria.type_id) {
            where.type_id = criteria.type_id;
        } else if (criteria.property_type) {
            where.OR = [
                ...(where.OR || []),
                { type: { contains: criteria.property_type, mode: 'insensitive' } },
                { property_type_link: { name: { contains: criteria.property_type, mode: 'insensitive' } } },
            ];
        }

        // Category filter (if provided)
        if (criteria.category_id) {
            where.category_id = criteria.category_id;
        }

        // Hard filter by BHK — never show wrong bedroom count
        if (criteria.bhk) {
            where.specs = { path: ['bedrooms'], equals: criteria.bhk };
        }

        // Location filter (broad match)
        if (criteria.preferred_location) {
            where.location = { contains: criteria.preferred_location, mode: 'insensitive' };
        }

        // Budget filter (with 30% tolerance)
        if (criteria.budget_min || criteria.budget_max) {
            where.price = {};
            if (criteria.budget_min) {
                where.price.gte = criteria.budget_min * 0.7; // 30% below min
            }
            if (criteria.budget_max) {
                where.price.lte = criteria.budget_max * 1.3; // 30% above max
            }
        }

        // Fetch candidate properties
        const properties = await prisma.inventory.findMany({
            where,
            include: {
                owner: {
                    include: {
                        subscription: true,
                    },
                },
                contact: {
                    select: { name: true },
                },
            },
            take: limit * 4, // Fetch more, then rank and trim
            orderBy: { created_at: 'desc' },
        });

        logger.info(`[MatchingEngine] Found ${properties.length} candidate properties`);

        if (properties.length === 0) return [];

        // Post-fetch area filter
        let candidates = properties;
        if (criteria.area_min || criteria.area_max) {
            candidates = candidates.filter(prop => {
                const specs = typeof prop.specs === 'string' ? JSON.parse(prop.specs) : prop.specs;
                const area = specs?.area;
                if (!area) return true;
                const norm = normalizeArea(area, specs?.unit || specs?.area_unit, criteria.area_unit);
                if (criteria.area_min && norm < criteria.area_min * 0.8) return false;
                if (criteria.area_max && norm > criteria.area_max * 1.2) return false;
                return true;
            });
        }
        // Amenities filter — at least 50% must match
        if (criteria.demand_amenities?.length) {
            candidates = candidates.filter(prop => {
                if (!prop.features || typeof prop.features !== 'object') return true;
                const matched = criteria.demand_amenities!.filter(a => (prop.features as any)[a] === true);
                return matched.length >= Math.ceil(criteria.demand_amenities!.length * 0.5);
            });
        }

        if (candidates.length === 0) return [];

        // Score and rank each property
        const scored = candidates.map(prop => {
            const score = this.calculateMatchScore(criteria, prop);
            const tier = this.getPropertyTier(prop);
            const tierBonus = TIER_PRIORITY[tier] || 30;

            return {
                id: prop.id,
                type: prop.type,
                category: prop.category,
                location: prop.location,
                price: prop.price ? Number(prop.price) : null,
                price_unit: prop.price_unit,
                intent: prop.intent,
                specs: prop.specs,
                features: prop.features || null,
                furnishing: prop.furnishing || null,
                floor_number: prop.floor_number || null,
                total_floors: prop.total_floors || null,
                media_urls: prop.media_urls || [],
                owner_phone: prop.owner_phone,
                owner_name: prop.contact?.name || undefined,
                match_score: score + (tierBonus * 0.2), // Tier adds up to 20 points
                priority_tier: tier,
                created_at: prop.created_at,
            } as MatchedProperty;
        });

        // Sort by composite score (descending)
        scored.sort((a, b) => b.match_score - a.match_score);

        // Return top N
        const results = scored.slice(0, limit);
        logger.info(`[MatchingEngine] Returning top ${results.length} matches (scores: ${results.map(r => r.match_score.toFixed(1)).join(', ')})`);

        return results;
    }

    /**
     * Broaden location by removing sector/phase numbers.
     * "vaishali sector 4" → "vaishali"
     * "DLF Phase 3" → "DLF"
     */
    private broadenLocation(location: string): string {
        return location
            .replace(/\b(sector|phase|block|pocket|extension)\s*\d+\b/gi, '')
            .replace(/\b\d+\b/g, '')
            .trim()
            .replace(/\s+/g, ' ');
    }

    /**
     * Calculate match score (0-100) based on criteria fit.
     */
    private calculateMatchScore(criteria: MatchCriteria, property: any): number {
        let score = 0;
        let maxScore = 0;

        // Budget fit (0-35 points)
        if (criteria.budget_min || criteria.budget_max) {
            maxScore += 35;
            const price = property.price ? Number(property.price) : null;
            if (price) {
                const min = criteria.budget_min || 0;
                const max = criteria.budget_max || Infinity;

                if (price >= min && price <= max) {
                    score += 35; // Perfect fit
                } else if (price < min) {
                    const ratio = price / min;
                    score += Math.max(0, 35 * ratio); // Proportional
                } else if (price > max && max !== Infinity) {
                    const ratio = max / price;
                    score += Math.max(0, 35 * ratio); // Proportional
                }
            }
        }

        // Location match (0-25 points)
        // If property has lat/lng and criteria has lat/lng, use Haversine distance scoring.
        // Otherwise fall back to text matching.
        if (criteria.preferred_lat != null && criteria.preferred_lng != null &&
            property.latitude != null && property.longitude != null) {
            maxScore += 25;
            const dist = haversineDistance(criteria.preferred_lat, criteria.preferred_lng, property.latitude, property.longitude);
            if (dist <= 2) score += 25;
            else if (dist <= 5) score += 20;
            else if (dist <= 10) score += 14;
            else if (dist <= 20) score += 8;
            // Beyond 20km: 0 pts
        } else if (criteria.preferred_location) {
            maxScore += 25;
            const propLocation = (property.location || '').toLowerCase();
            const targetLocation = criteria.preferred_location.toLowerCase();

            if (propLocation.includes(targetLocation) || targetLocation.includes(propLocation)) {
                score += 25;
            } else {
                const cityWords = targetLocation.split(/[,\s]+/);
                for (const word of cityWords) {
                    if (word.length > 2 && propLocation.includes(word)) {
                        score += 15;
                        break;
                    }
                }
            }
        }

        // Property type match (0-15 points)
        if (criteria.property_type) {
            maxScore += 15;
            const propType = (property.type || '').toLowerCase();
            if (propType.includes(criteria.property_type.toLowerCase())) {
                score += 15;
            }
        }

        // BHK match (0-10 points)
        if (criteria.bhk && property.specs) {
            maxScore += 10;
            const specs = typeof property.specs === 'string' ? JSON.parse(property.specs) : property.specs;
            if (specs.bedrooms === criteria.bhk) {
                score += 10;
            } else if (Math.abs((specs.bedrooms || 0) - criteria.bhk) === 1) {
                score += 5; // Close match
            }
        }

        // Area match (0-8 points)
        if (criteria.area_min || criteria.area_max) {
            maxScore += 8;
            const specs = typeof property.specs === 'string' ? JSON.parse(property.specs) : property.specs;
            const area = specs?.area;
            if (area) {
                const norm = normalizeArea(area, specs?.unit || specs?.area_unit, criteria.area_unit);
                const aMin = criteria.area_min || 0;
                const aMax = criteria.area_max || Infinity;
                if (norm >= aMin && norm <= aMax) {
                    score += 8; // Perfect fit
                } else {
                    // How far off?
                    const deviation = norm < aMin ? (aMin - norm) / aMin : (norm - aMax) / aMax;
                    if (deviation <= 0.1) score += 6;
                    else if (deviation <= 0.2) score += 4;
                    else if (deviation <= 0.3) score += 2;
                }
            } else {
                score += 4; // No area data — neutral
            }
        }

        // Amenities match (0-7 points)
        if (criteria.demand_amenities?.length) {
            maxScore += 7;
            if (property.features && typeof property.features === 'object') {
                const matched = criteria.demand_amenities.filter(a => (property.features as any)[a] === true);
                const ratio = matched.length / criteria.demand_amenities.length;
                if (ratio >= 1) score += 7;
                else if (ratio >= 0.75) score += 5;
                else if (ratio >= 0.5) score += 3;
                else score += 1;
            } else {
                score += 3; // No features data — neutral
            }
        }

        // Normalize to 0-100 if we have criteria
        if (maxScore > 0) {
            return (score / maxScore) * 100;
        }

        // No criteria specified — return base score (freshness bonus)
        return 50;
    }

    /**
     * Determine the subscription tier of a property's owner.
     */
    private getPropertyTier(property: any): string {
        if (!property.owner) return 'FREE';

        // Internal properties get highest priority
        if (property.owner.scope === 'INTERNAL') return 'INTERNAL';

        // External — check subscription
        const sub = property.owner.subscription;
        if (!sub || sub.status !== 'ACTIVE') return 'FREE';

        return sub.plan_type || 'FREE';
    }

    /**
     * Check if a contact should see masked data (FREE tier agents).
     * FREE agents don't see buyer contact information.
     */
    async shouldMaskBuyerData(ownerPhone: string): Promise<boolean> {
        const owner = await prisma.owner.findUnique({
            where: { contact_phone: ownerPhone },
            include: { subscription: true },
        });

        if (!owner) return false; // Internal contact, no masking
        if (owner.scope === 'INTERNAL') return false;

        const sub = owner.subscription;
        if (!sub || sub.plan_type === 'FREE') return true;

        return false;
    }

    /**
     * Format matched properties into a WhatsApp-friendly message.
     */
    formatMatchesForWhatsApp(matches: MatchedProperty[], maskOwner: boolean = false): string {
        if (matches.length === 0) {
            return "I couldn't find any properties matching your criteria right now. Let me know if you'd like to adjust your preferences.";
        }

        let msg = `*🏠 ${matches.length} Properties Found:*\n`;

        matches.forEach((m, i) => {
            const specs = m.specs ? (typeof m.specs === 'string' ? JSON.parse(m.specs) : m.specs) : {};
            const bhk = specs.bedrooms ? `${specs.bedrooms} BHK` : '';
            const area = specs.area ? `${specs.area} ${specs.area_unit || 'sqft'}` : '';

            // Format price for both rent and sale
            let priceStr = 'Price on request';
            if (m.price) {
                if (m.intent === 'rent') {
                    priceStr = `₹${Number(m.price).toLocaleString('en-IN')}/month`;
                } else {
                    priceStr = m.price >= 10000000
                        ? `₹${(m.price / 10000000).toFixed(1)} Cr`
                        : `₹${(m.price / 100000).toFixed(1)} Lakh`;
                }
            }

            msg += `\n*${i + 1}. ${m.type.toUpperCase()}* ${bhk}`;
            msg += `\n   💰 ${priceStr}`;
            msg += `\n   📍 ${m.location || 'Location TBD'}`;
            if (area) msg += `\n   📐 ${area}`;
            if (m.furnishing) msg += `\n   🛋️ ${m.furnishing.replace(/_/g, ' ')}`;
            if (m.floor_number) msg += `\n   🏢 Floor ${m.floor_number}${m.total_floors ? '/' + m.total_floors : ''}`;

            // Show top amenities
            if (m.features && typeof m.features === 'object') {
                const amenities = Object.entries(m.features)
                    .filter(([, v]) => v)
                    .map(([k]) => k.replace(/_/g, ' '))
                    .slice(0, 4);
                if (amenities.length > 0) {
                    msg += `\n   ✨ ${amenities.join(', ')}`;
                }
            }

            msg += `\n   🏷️ For ${m.intent === 'sell' ? 'Sale' : 'Rent'} | Match: ${m.match_score.toFixed(0)}%`;

            // Show image hint (actual image sent separately via WhatsApp media API)
            if (m.media_urls && m.media_urls.length > 0) {
                msg += `\n   📷 Photo attached below`;
            }

            msg += `\n`;
        });

        msg += `\n📌 Reply *1*, *2*, or *3* for full details of any property.`;
        msg += `\nSay *"more"* to see the next batch.`;
        msg += `\nSay *"schedule visit"* to book a site visit.`;

        return msg;
    }
}
