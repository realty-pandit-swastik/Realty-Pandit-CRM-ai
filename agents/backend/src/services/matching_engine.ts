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
import { sanitizationService, Viewer } from './sanitization_service';
import { resolveTypeFilter } from '../utils/demand_taxonomy';
import { expandTaxonomyNodeIds } from '../utils/taxonomy_filter';

/**
 * Map a lead/deal intent to the inventory `intent` column ('sell' | 'rent') — robustly.
 * Case-insensitive + complete, so a non-canonical value (e.g. "buyer", "TENANT", "Lease")
 * never silently yields 0 matches (the old case-sensitive map had 'BUYER' but not 'buyer').
 * Rent-side aliases → 'rent'; everything else (buy / buyer / purchase / sell / seller and
 * the empty default) → 'sell'.
 */
export function toInventoryIntent(intent?: string | null): 'sell' | 'rent' {
    const v = String(intent ?? '').trim().toLowerCase();
    if (['rent', 'tenant', 'lease', 'rent_lease', 'rental'].includes(v)) return 'rent';
    return 'sell';
}

export interface MatchCriteria {
    intent?: string | null;         // buy, rent
    property_type?: string | null;  // flat, house, plot (legacy string)
    type_id?: string | null;        // [LEGACY] Classification ID (most specific)
    sub_category_id?: string | null; // [LEGACY] Classification ID (middle tier — see B, 2026-05-16)
    category_id?: string | null;    // [LEGACY] Classification ID (coarsest)
    budget_min?: number | null;
    budget_max?: number | null;
    preferred_location?: string | null;
    preferred_lat?: number | null;  // Latitude from Google Maps
    preferred_lng?: number | null;  // Longitude from Google Maps
    bhk?: number | null;            // [LEGACY] integer bedrooms — replaced by demand_schema_values.bhk
    area_min?: number | null;       // Min area requirement
    area_max?: number | null;       // Max area requirement
    area_unit?: string | null;      // "sqft" or "sqmtr"
    demand_amenities?: string[] | null; // [LEGACY] — replaced by demand_schema_values.amenities

    // Phase 3 demand-side unification (2026-05-29) — canonical SoT fields.
    // demand_schema_values mirrors inventory.specs shape (bhk / rooms / furnishing /
    // facing / age-of-construction / amenities / etc. keyed by FieldDefinition.key).
    // The scorer does a key-by-key compare with type-aware fuzzy matching.
    demand_taxonomy_node_id?: string | null;
    demand_schema_values?: Record<string, any> | null;

    // Deal Match & Share multi-select + hard-cap (2026-06-01). All optional/additive —
    // other callers (website auto-match, sales agent, bot) are unaffected.
    bhk_list?: number[] | null;            // OR set of BHK counts → hard filter (e.g. [2,3])
    // OR set of (legacy) sub_category_ids → hard `sub_category_id IN (...)`. Sub-category is the
    // 100%-populated classification tier on inventory (type_id is only ~26% set), so the deal
    // "Type" multi-select resolves to sub-categories (Flat/Apartment, Builder Floor, Villa, Plot).
    sub_category_id_list?: string[] | null;
    // Category-aware fallback hard filter: when the demand is classified only at CATEGORY/SUBCATEGORY level
    // (no legacy sub_category_id/category_id resolve — e.g. a "Commercial" CATEGORY node), this holds the node
    // expanded to self + all descendant nodes → `taxonomy_node_id IN (...)`. Keeps a commercial deal from
    // matching residential inventory. (inventory.taxonomy_node_id is 100% populated.)
    taxonomy_node_id_list?: string[] | null;
    radius_km?: number | null;             // pin the geo search to ONE radius instead of escalating 2→20
    budget_hard?: boolean;                 // true → exact budget bounds (no ±30% tolerance band)
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

/**
 * Extract an integer BHK/room count from an inventory.specs object, mirroring the
 * scorer's fallback chain + parsing ("1 RK" → 1, "8+" → 8, "2" → 2, 2 → 2).
 * Shared so the multi-BHK hard filter and the BHK score read the SAME value.
 */
function extractBhkInt(specs: any): number | null {
    const raw = specs?.bhk ?? specs?.rooms ?? specs?.bedrooms ?? specs?.bhk_count;
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') {
        const cleaned = raw.toLowerCase().replace('rk', '').replace('+', '').trim();
        const n = parseInt(cleaned, 10);
        return Number.isNaN(n) ? null : n;
    }
    return null;
}

/**
 * Infer the inventory CATEGORY ('residential' | 'commercial') a demand implies from its shape,
 * for the fallback where the demand has NO precise classification (no sub_category / category /
 * taxonomy node). Residential requirements carry demand_schema_values.bhk; commercial carry .rooms.
 * Used to stop a residential BHK client from seeing shops/showrooms (and vice-versa). (2026-07-08)
 * Returns null when the shape gives no clear signal → no category filter is applied.
 */
function inferDemandCategory(criteria: MatchCriteria): 'residential' | 'commercial' | null {
    const dsv = criteria.demand_schema_values;
    if (dsv && typeof dsv === 'object') {
        if (dsv.bhk != null && dsv.bhk !== '') return 'residential';
        if (dsv.rooms != null && dsv.rooms !== '') return 'commercial';
    }
    if (criteria.bhk != null) return 'residential'; // legacy single BHK implies residential
    return null;
}

/**
 * Commercial-use expansion (2026-07-29). A RESIDENTIAL property flagged `commercial_use` (of a given
 * type) must also surface for a COMMERCIAL demand of the SAME type — office↔office, shop↔shop,
 * showroom↔showroom (owner rule: type must match). Returns null for anything else, so normal matching
 * is untouched. Additive-only: it never removes matches.
 */
async function resolveCommercialDemandType(criteria: MatchCriteria): Promise<'office' | 'shop' | 'showroom' | null> {
    const kw = (v?: string | null): 'office' | 'shop' | 'showroom' | null => {
        const t = String(v || '').toLowerCase();
        if (/office/.test(t)) return 'office';
        if (/showroom/.test(t)) return 'showroom';
        if (/shop|retail|store/.test(t)) return 'shop';
        return null;
    };
    let t = kw(criteria.property_type);
    if (t) return t;
    if (criteria.demand_taxonomy_node_id) {
        try {
            const node = await prisma.taxonomyNode.findUnique({ where: { id: criteria.demand_taxonomy_node_id }, select: { name: true } });
            t = kw(node?.name);
            if (t) return t;
        } catch { /* non-fatal */ }
    }
    return null;
}

/**
 * OR the residential-commercial-use branch into the inventory WHERE — but ONLY when a real
 * classification barrier was set (else it would match everything). Nested under where.AND so it never
 * collides with a top-level where.OR (e.g. the text location filter). Preserves every other filter.
 */
function expandWhereForCommercialUse(where: any, type: 'office' | 'shop' | 'showroom'): void {
    const classKeys = ['sub_category_id', 'category_id', 'taxonomy_node_id', 'category'];
    const primary: any = {};
    for (const k of classKeys) if (k in where) { primary[k] = where[k]; delete where[k]; }
    if (!Object.keys(primary).length) return; // no barrier to loosen
    where.AND = [...(where.AND || []), { OR: [primary, { commercial_use: true, commercial_use_type: type }] }];
}

/**
 * Build a short, human-readable "why it matched" string for a result row, used by the
 * deal Match & Share UI. Pure display — derived from the same criteria/specs the scorer uses.
 */
function buildMatchReason(criteria: MatchCriteria, prop: any, distanceKm?: number): string {
    const bits: string[] = [];
    const specs = prop?.specs && typeof prop.specs === 'object' ? prop.specs : null;
    // BHK
    const wantBhk = (criteria.bhk_list?.length ? criteria.bhk_list : null)
        ?? (criteria.demand_schema_values?.bhk != null ? [extractBhkInt({ bhk: criteria.demand_schema_values.bhk })].filter((x): x is number => x != null) : null)
        ?? (criteria.bhk != null ? [criteria.bhk] : null);
    const haveBhk = extractBhkInt(specs);
    if (wantBhk?.length && haveBhk != null) bits.push(`${haveBhk}BHK ${wantBhk.includes(haveBhk) ? '✓' : '≈'}`);
    // Budget
    const price = prop?.price != null ? Number(prop.price) : null;
    if (price != null && (criteria.budget_min || criteria.budget_max)) {
        const within = (!criteria.budget_min || price >= criteria.budget_min) && (!criteria.budget_max || price <= criteria.budget_max);
        bits.push(within ? 'within budget ✓' : 'budget ≈');
    }
    // Distance
    if (distanceKm != null) bits.push(`${distanceKm.toFixed(1)} km`);
    // Type
    if (prop?.type) bits.push(String(prop.type).replace(/_/g, ' '));
    return bits.join(' · ');
}

export interface MatchedProperty {
    id: string;
    type: string;
    category: string;
    location: string | null;
    // Display + share fields (carried so the deal workspace can render location,
    // a description, and a public listing link in manual/personal shares).
    city: string | null;
    sub_locality: string | null;
    locality: string | null;
    state: string | null;
    pincode: string | null;
    description: string | null;
    slug: string | null;
    display_id: string | null;
    facing: string | null;
    property_age: string | null;
    display_price: number | null;
    price: number | null;
    price_unit: string | null;
    intent: string;
    specs: any;
    features: any;
    furnishing: string | null;
    floor_number: number | null;
    total_floors: number | null;
    media_urls: string[];
    // Owner/source fields — carried so SanitizationService can decide what to strip per
    // viewer. For foreign managers and partners these are removed before reaching the API.
    owner_phone?: string;
    owner_name?: string;
    owning_manager_id?: string | null;
    referral_partner_id?: string | null;
    match_score: number;       // 0-100 composite score
    priority_tier: string;     // INTERNAL, ADVANCE_PRO, PRO, FREE
    created_at: Date;
    distance_km?: number;      // set when geo radius search produced this row
    match_reason?: string;     // short "why it matched" string for the deal Match & Share UI
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
    async findMatches(criteria: MatchCriteria, limit: number = 3, viewer?: Viewer): Promise<MatchedProperty[]> {
        // ── Normalize the TYPE signal into the canonical hard filter (2026-05-31) ──
        // The buyer's property type may arrive as a canonical taxonomy node id (deal/lead
        // forms, feed capture), a loose `property_type` slug (WhatsApp bot, matching agent,
        // website), or pre-set legacy ids. Resolve whichever is present into the legacy
        // sub_category_id/category_id that join 1:1 to inventory — otherwise the type
        // never constrains results (a Flat-seeker would see shops). Cached; ~no cost.
        if (!criteria.sub_category_id && (criteria.demand_taxonomy_node_id || criteria.property_type || criteria.category_id)) {
            try {
                const tf = await resolveTypeFilter({
                    demand_taxonomy_node_id: criteria.demand_taxonomy_node_id,
                    property_type: criteria.property_type,
                    sub_category_id: criteria.sub_category_id,
                    category_id: criteria.category_id,
                    type_id: criteria.type_id,
                });
                if (tf.sub_category_id) criteria.sub_category_id = tf.sub_category_id;
                if (tf.category_id && !criteria.category_id) criteria.category_id = tf.category_id;
                if (tf.demand_taxonomy_node_id && !criteria.demand_taxonomy_node_id) criteria.demand_taxonomy_node_id = tf.demand_taxonomy_node_id;
            } catch (e) {
                logger.warn(`[MatchingEngine] resolveTypeFilter failed, falling back to raw criteria: ${(e as Error).message}`);
            }
        }

        // Category-aware fallback: if the legacy sub_category_id/category_id still didn't resolve (the demand
        // is classified only at CATEGORY/SUBCATEGORY level — e.g. a "Commercial" CATEGORY node, which
        // resolveTypeFilter can't map since it only knows TYPE nodes), expand the node to self + all
        // descendants so the where-clause can hard-filter `taxonomy_node_id IN (...)`. Without this a
        // commercial deal had NO classification filter and matched residential inventory. (2026-06-08)
        if (!criteria.sub_category_id && !criteria.category_id && criteria.demand_taxonomy_node_id) {
            try {
                const expanded = await expandTaxonomyNodeIds([criteria.demand_taxonomy_node_id]);
                if (expanded.length) criteria.taxonomy_node_id_list = expanded;
            } catch (e) {
                logger.warn(`[MatchingEngine] taxonomy node expansion failed: ${(e as Error).message}`);
            }
        }
        logger.info(`[MatchingEngine] Searching with criteria: ${JSON.stringify(criteria)}`);

        const hasGeo = criteria.preferred_lat != null && criteria.preferred_lng != null;
        const finalize = (rows: MatchedProperty[]) =>
            viewer ? (sanitizationService.sanitizeInventoryList(rows as any[], viewer) as MatchedProperty[]) : rows;

        if (hasGeo) {
            // Pin to a single radius when the caller (deal Match & Share) requested one;
            // otherwise escalate 2→5→10→20 km until the first non-empty pass.
            const radii = criteria.radius_km != null ? [criteria.radius_km] : [2, 5, 10, 20];
            for (const radius of radii) {
                const results = await this.searchPropertiesByRadius(criteria, radius, limit);
                if (results.length > 0) {
                    logger.info(`[MatchingEngine] Geo match found at ${radius}km radius — ${results.length} results`);
                    return finalize(results);
                }
                logger.info(`[MatchingEngine] No results within ${radius}km — expanding radius`);
            }

            // Pass 5: text fallback for properties without coordinates
            logger.info(`[MatchingEngine] Geo passes exhausted — falling back to text search for non-geocoded properties`);
            const textResults = await this.searchPropertiesNoGeo(criteria, limit);
            if (textResults.length > 0) return finalize(textResults);

            // No inventory found in buyer's area — return empty rather than serving wrong-city results
            logger.info(`[MatchingEngine] No inventory found near ${criteria.preferred_location || 'buyer location'} — returning empty`);
            return [];
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

        // Do NOT fall back to removing preferred_location — a buyer who said "East Delhi"
        // must never receive Ghaziabad results. Zero honest results > wrong-city results.

        return finalize(results);
    }

    /**
     * Radius-based geo search using Haversine distance.
     * Fetches properties WITH lat/lng, filters in Node.js (no PostGIS required).
     * Capped at 500 candidates to protect memory at current scale.
     */
    private async searchPropertiesByRadius(criteria: MatchCriteria, radiusKm: number, limit: number): Promise<MatchedProperty[]> {
        const where: any = { status: 'active', latitude: { not: null }, longitude: { not: null } };

        if (criteria.intent) {
            where.intent = toInventoryIntent(criteria.intent);
        }
        // Classification match (A1, 2026-05-16): sub_category_id is the shared,
        // 100%-populated tier on both inventory and leads — it is the HARD filter.
        // type_id is NOT hard-filtered: inventory never sets it (workflow maps flat
        // types to sub-categories, not property types), so a typed lead would match
        // zero inventory. type_id instead contributes a scoring boost (see
        // calculateMatchScore). Fall back to category only if no sub_category.
        // Type multi-select (deal Match & Share) takes precedence: match any of the chosen
        // sub-categories. Falls back to the single sub_category_id, then category.
        if (criteria.sub_category_id_list?.length) where.sub_category_id = { in: criteria.sub_category_id_list };
        else if (criteria.sub_category_id) where.sub_category_id = criteria.sub_category_id;
        else if (criteria.category_id) where.category_id = criteria.category_id;
        // Category-level demand (no legacy ids) → hard-filter by the expanded taxonomy node set so a
        // "Commercial" deal can't match residential inventory.
        else if (criteria.taxonomy_node_id_list?.length) where.taxonomy_node_id = { in: criteria.taxonomy_node_id_list };
        // Residential/commercial fallback (2026-07-08): no precise classification, but the demand shape
        // implies a category (bhk→residential, rooms→commercial) → constrain inventory.category so a
        // residential BHK client never sees shops/showrooms (and vice-versa).
        else { const c = inferDemandCategory(criteria); if (c) where.category = c; }
        // Commercial-use expansion (2026-07-29): a commercial demand of a known type ALSO surfaces
        // residential inventory flagged commercial_use of that SAME type. Residential demands unaffected.
        { const cuType = await resolveCommercialDemandType(criteria); if (cuType) expandWhereForCommercialUse(where, cuType); }
        // BHK is a scoring factor by default. budget tolerance is ±30% UNLESS budget_hard.
        // Fix D (2026-06-12): never surface ₹0 / missing-price inventory as a customer card — it
        // renders as "₹0" and looks broken (audit found ₹0 sends). Require price>0 ALWAYS; the
        // budget band (when present) layers on top of it.
        where.price = { gt: 0 };
        if (criteria.budget_min || criteria.budget_max) {
            const loF = criteria.budget_hard ? 1 : 0.7;
            const hiF = criteria.budget_hard ? 1 : 1.3;
            if (criteria.budget_min) where.price.gte = criteria.budget_min * loF;
            if (criteria.budget_max) where.price.lte = criteria.budget_max * hiF;
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
        // Amenities filter — at least 50% must match. Phase 4 dedup (2026-05-28):
        // reads specs.amenities (array of labels), demand_amenities are matched
        // case-insensitively against humanized labels (e.g. "Gym","Power Backup").
        if (criteria.demand_amenities?.length) {
            filtered = filtered.filter(({ prop }) => {
                const amenities = Array.isArray((prop.specs as any)?.amenities) ? (prop.specs as any).amenities as string[] : null;
                if (!amenities || amenities.length === 0) return true;
                const lower = new Set(amenities.map(a => String(a).toLowerCase()));
                const matched = criteria.demand_amenities!.filter(a => lower.has(String(a).toLowerCase()));
                return matched.length >= Math.ceil(criteria.demand_amenities!.length * 0.5);
            });
        }

        // BHK multi-select hard filter (deal Match & Share). Applied INSIDE this radius pass so
        // radius escalation still works (a radius that yields 0 in-BHK matches expands further).
        // Properties with no readable BHK are kept (don't penalise sparse specs).
        // Hard-filter by the requested BHK(s): the multi-select list (deal Match & Share) OR the
        // single demand BHK (chat/contact). Was list-only — a chat lead's single demand_bhk was a
        // scoring factor only, so a "3 BHK" seeker still got 1BHK cards (real-chat F2). Properties
        // with no readable BHK are kept (don't penalise sparse specs). (F2, 2026-06-21)
        const bhkFilter = criteria.bhk_list?.length ? criteria.bhk_list : (criteria.bhk ? [criteria.bhk] : null);
        if (bhkFilter?.length) {
            filtered = filtered.filter(({ prop }) => {
                const b = extractBhkInt(prop.specs);
                return b == null || bhkFilter!.includes(b);
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
                city: prop.city || null,
                sub_locality: prop.sub_locality || null,
                locality: prop.locality || null,
                state: prop.state || null,
                pincode: prop.pincode || null,
                description: prop.description || null,
                slug: prop.slug || null,
                display_id: prop.display_id || null,
                // specs.* is SOLE SoT (Phase 3 dedup, 2026-05-28) — column fallbacks dropped.
                facing: ((prop.specs as any)?.facing) ?? null,
                property_age: ((prop.specs as any)?.['age-of-construction']) ?? null,
                display_price: prop.display_price ? Number(prop.display_price) : null,
                price: prop.price ? Number(prop.price) : null,
                price_unit: prop.price_unit,
                intent: prop.intent,
                specs: prop.specs,
                // features dropped Phase 4 — amenities live in specs.amenities (array of labels)
                features: Array.isArray((prop.specs as any)?.amenities) ? (prop.specs as any).amenities : null,
                furnishing: ((prop.specs as any)?.furnishing) ?? null,
                floor_number: prop.floor_number || null,
                total_floors: (() => { const s = (prop.specs as any)?.floors; return s != null ? Number(s) : null; })(),
                media_urls: prop.media_urls || [],
                owner_phone: prop.owner_phone,
                owner_name: prop.contact?.name || undefined,
                // Ownership markers for SanitizationService (middleman model, 2026-04-17)
                owning_manager_id: (prop as any).owning_manager_id ?? null,
                referral_partner_id: (prop as any).referral_partner_id ?? null,
                match_score: Math.min(100, baseScore + tierBonus),
                priority_tier: tier,
                created_at: prop.created_at,
                distance_km: distance,
                match_reason: buildMatchReason(criteria, prop, distance),
            } as MatchedProperty & { distance_km: number };
        });

        // When a BHK filter is active, rank listings with no recorded BHK last (kept + flagged).
        const bhkActive = !!(criteria.bhk_list?.length || criteria.bhk);
        scored.sort((a: any, b: any) => {
            if (bhkActive) {
                const au = extractBhkInt(a.specs) == null ? 1 : 0;
                const bu = extractBhkInt(b.specs) == null ? 1 : 0;
                if (au !== bu) return au - bu;
            }
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
            where.intent = toInventoryIntent(criteria.intent);
        }

        // Classification filter (A1, 2026-05-16): sub_category_id is the shared
        // hard tier; type_id is a scoring boost only (inventory never sets it).
        // Fall back to category, then legacy string.
        if (criteria.sub_category_id_list?.length) {
            // Type multi-select (deal Match & Share) — match any of the chosen sub-categories.
            where.sub_category_id = { in: criteria.sub_category_id_list };
        } else if (criteria.sub_category_id) {
            where.sub_category_id = criteria.sub_category_id;
        } else if (criteria.category_id) {
            where.category_id = criteria.category_id;
        } else if (criteria.taxonomy_node_id_list?.length) {
            // Category-level demand (no legacy ids) → expanded taxonomy node set keeps a "Commercial" deal
            // from matching residential inventory.
            where.taxonomy_node_id = { in: criteria.taxonomy_node_id_list };
        } else if (criteria.property_type) {
            where.OR = [
                ...(where.OR || []),
                { type: { contains: criteria.property_type, mode: 'insensitive' } },
                { property_type_link: { name: { contains: criteria.property_type, mode: 'insensitive' } } },
                { category: { contains: criteria.property_type, mode: 'insensitive' } },
            ];
        } else {
            // Residential/commercial fallback (2026-07-08): no precise classification, but the demand
            // shape implies a category (bhk→residential, rooms→commercial) → constrain inventory.category
            // so a residential BHK client never sees shops/showrooms (and vice-versa).
            const c = inferDemandCategory(criteria);
            if (c) where.category = c;
        }
        // Commercial-use expansion (2026-07-29): mirror the radius path — commercial demand of a known
        // type ALSO surfaces residential inventory flagged commercial_use of that same type.
        { const cuType = await resolveCommercialDemandType(criteria); if (cuType) expandWhereForCommercialUse(where, cuType); }

        // BHK is a scoring factor only — not a hard WHERE filter (most inventory lacks specs.bedrooms)

        // Location filter — check all location columns (city, district, locality, location text)
        if (criteria.preferred_location) {
            const loc = criteria.preferred_location;
            where.OR = [
                ...(where.OR || []),
                { location: { contains: loc, mode: 'insensitive' } },
                { city: { contains: loc, mode: 'insensitive' } },
                { district: { contains: loc, mode: 'insensitive' } },
                { locality: { contains: loc, mode: 'insensitive' } },
            ];
        }

        // Budget filter — ±30% tolerance by default; exact bounds when budget_hard (Match & Share).
        if (criteria.budget_min || criteria.budget_max) {
            const loF = criteria.budget_hard ? 1 : 0.7;
            const hiF = criteria.budget_hard ? 1 : 1.3;
            where.price = {};
            if (criteria.budget_min) where.price.gte = criteria.budget_min * loF;
            if (criteria.budget_max) where.price.lte = criteria.budget_max * hiF;
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
        // Amenities filter — at least 50% must match. Phase 4 dedup (2026-05-28):
        // reads specs.amenities (array of labels).
        if (criteria.demand_amenities?.length) {
            candidates = candidates.filter(prop => {
                const amenities = Array.isArray((prop.specs as any)?.amenities) ? (prop.specs as any).amenities as string[] : null;
                if (!amenities || amenities.length === 0) return true;
                const lower = new Set(amenities.map(a => String(a).toLowerCase()));
                const matched = criteria.demand_amenities!.filter(a => lower.has(String(a).toLowerCase()));
                return matched.length >= Math.ceil(criteria.demand_amenities!.length * 0.5);
            });
        }

        // BHK hard filter (F2 + strict fix 2026-07-08): exclude listings whose BHK is
        // KNOWN-and-wrong. Applies to the multi-select list (deal Match & Share) OR the single
        // demand BHK (chat / contact / AI buyer / WhatsApp). The text path previously honored
        // ONLY bhk_list, so a no-geo buyer's stored BHK never constrained results — a 4-BHK
        // seeker got 1/2/3-BHK cards. Mirror the geo path (searchPropertiesByRadius). Listings
        // with no readable BHK are KEPT (ranked last below + flagged 'BHK not specified' in the UI).
        const bhkFilter = criteria.bhk_list?.length ? criteria.bhk_list : (criteria.bhk ? [criteria.bhk] : null);
        if (bhkFilter?.length) {
            candidates = candidates.filter(prop => {
                const b = extractBhkInt(prop.specs);
                return b == null || bhkFilter!.includes(b);
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
                city: prop.city || null,
                sub_locality: prop.sub_locality || null,
                locality: prop.locality || null,
                state: prop.state || null,
                pincode: prop.pincode || null,
                description: prop.description || null,
                slug: prop.slug || null,
                display_id: prop.display_id || null,
                // specs.* is SOLE SoT (Phase 4 dedup, 2026-05-28) — columns dropped from schema.
                facing: ((prop.specs as any)?.facing) ?? null,
                property_age: ((prop.specs as any)?.['age-of-construction']) ?? null,
                display_price: prop.display_price ? Number(prop.display_price) : null,
                price: prop.price ? Number(prop.price) : null,
                price_unit: prop.price_unit,
                intent: prop.intent,
                specs: prop.specs,
                features: Array.isArray((prop.specs as any)?.amenities) ? (prop.specs as any).amenities : null,
                furnishing: ((prop.specs as any)?.furnishing) ?? null,
                floor_number: prop.floor_number || null,
                total_floors: (() => { const s = (prop.specs as any)?.floors; return s != null ? Number(s) : null; })(),
                media_urls: prop.media_urls || [],
                owner_phone: prop.owner_phone,
                owner_name: prop.contact?.name || undefined,
                // Ownership markers for SanitizationService (middleman model, 2026-04-17)
                owning_manager_id: (prop as any).owning_manager_id ?? null,
                referral_partner_id: (prop as any).referral_partner_id ?? null,
                match_score: Math.min(100, score + (tierBonus * 0.2)), // Cap at 100%
                priority_tier: tier,
                created_at: prop.created_at,
                match_reason: buildMatchReason(criteria, prop),
            } as MatchedProperty;
        });

        // Sort by composite score (descending). When a BHK filter is active, push listings with
        // no recorded BHK BELOW the known-BHK matches (kept, but ranked last — 2026-07-08).
        const bhkActive = !!(criteria.bhk_list?.length || criteria.bhk);
        scored.sort((a, b) => {
            if (bhkActive) {
                const au = extractBhkInt(a.specs) == null ? 1 : 0;
                const bu = extractBhkInt(b.specs) == null ? 1 : 0;
                if (au !== bu) return au - bu;
            }
            return b.match_score - a.match_score;
        });

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
            .replace(/\b(sector|phase|block|pocket|extension)\s*-?\s*\d+\b/gi, '')
            .replace(/\b(sector|phase|block|pocket|extension)\b/gi, '')
            .replace(/\b\d+\b/g, '')
            .replace(/[^a-zA-Z0-9\s]/g, '')
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
            const propCategory = (property.category || '').toLowerCase();
            const needle = criteria.property_type.toLowerCase();
            if (propType.includes(needle) || propCategory.includes(needle)) {
                score += 15;
            }
        }

        // Taxonomy node distance (0-12 points) — Phase 3 demand-side unification
        // (2026-05-29). Replaces the legacy type_id/sub_category_id FK match. Exact
        // node = full points; "soft" match via shared ancestor would require a tree
        // walker — for now, fall back to the legacy classification IDs (Phase 1 still
        // populates them via the deal-sync block) when canonical IDs aren't equal.
        if (criteria.demand_taxonomy_node_id && (property as any).taxonomy_node_id) {
            maxScore += 12;
            if (criteria.demand_taxonomy_node_id === (property as any).taxonomy_node_id) {
                score += 12; // exact leaf match
            }
            // Sibling / same-root partial credit will be added in a follow-up once we
            // have a tree-distance helper. Today's data still has good legacy FK coverage
            // (Phase 1 backfill mapped most rows), so leaning on those for partial credit.
            else if (criteria.sub_category_id && (property as any).sub_category_id === criteria.sub_category_id) {
                score += 8;
            } else if (criteria.category_id && (property as any).category_id === criteria.category_id) {
                score += 4;
            }
        } else if (criteria.type_id || criteria.sub_category_id) {
            // Legacy fallback for leads/deals that haven't been edited via the new form.
            maxScore += 12;
            if (criteria.type_id && property.type_id && property.type_id === criteria.type_id) {
                score += 12;
            } else if (criteria.sub_category_id && property.sub_category_id &&
                       property.sub_category_id === criteria.sub_category_id) {
                score += 8;
            }
        }

        // ── Canonical key-by-key compare of demand_schema_values vs inventory.specs ──
        // Phase 3 (2026-05-29). Replaces the hardcoded BHK + amenities-only scoring with
        // a generic comparator that scales as Sunny adds new taxonomy fields (FAR,
        // road-width, ownership-tenure, etc.). Each key in the lead's demand carries
        // a small weight; matches earn full points, close-numeric earns half.
        const dsv = criteria.demand_schema_values;
        const specs = property.specs && typeof property.specs === 'object'
            ? (typeof property.specs === 'string' ? JSON.parse(property.specs) : property.specs)
            : null;
        if (dsv && specs) {
            // Room count (bhk / rooms): heavier weight (8 pts) since it's the dominant filter
            // for residential / commercial. We handle the canonical String options "1 RK", "1",
            // "8+", etc. as integers for fuzzy match. Falls back to legacy specs.bedrooms.
            if (dsv.bhk != null || dsv.rooms != null) {
                maxScore += 8;
                const demandStr = String(dsv.bhk ?? dsv.rooms);
                const supplyRaw = specs.bhk ?? specs.rooms ?? specs.bedrooms ?? specs.bhk_count;
                const toInt = (v: any): number | null => {
                    if (typeof v === 'number') return v;
                    if (typeof v === 'string') {
                        const cleaned = v.toLowerCase().replace('rk', '').replace('+', '').trim();
                        const n = parseInt(cleaned, 10);
                        return Number.isNaN(n) ? null : n;
                    }
                    return null;
                };
                const d = toInt(demandStr);
                const s = toInt(supplyRaw);
                if (d != null && s != null) {
                    if (d === s) score += 8;
                    else if (Math.abs(d - s) === 1) score += 4;
                }
            }

            // Amenities multiselect: 7 pts at ≥100% overlap, scaled down.
            // specs.amenities is array of taxonomy labels (Phase 4 inventory unification);
            // fall back to property.features array (set by result-builder).
            if (Array.isArray(dsv.amenities) && dsv.amenities.length) {
                maxScore += 7;
                const supply = Array.isArray(specs.amenities)
                    ? specs.amenities as string[]
                    : (Array.isArray(property.features) ? property.features as string[] : []);
                if (supply.length) {
                    const supplySet = new Set(supply.map(x => String(x).toLowerCase()));
                    const matched = (dsv.amenities as string[]).filter(a => supplySet.has(String(a).toLowerCase())).length;
                    const ratio = matched / dsv.amenities.length;
                    if (ratio >= 1) score += 7;
                    else if (ratio >= 0.75) score += 5;
                    else if (ratio >= 0.5) score += 3;
                    else if (ratio > 0) score += 1;
                }
            }

            // Generic scalar/enum fields (3 pts each, max ~15 total). String compare is
            // case-insensitive; supplied options come straight from the taxonomy so a
            // string equality is enough. Skipped if key not in demand.
            const SCALAR_KEYS = ['furnishing', 'facing', 'age-of-construction', 'ownership-tenure', 'road-facing'] as const;
            for (const k of SCALAR_KEYS) {
                if (dsv[k] != null && dsv[k] !== '') {
                    maxScore += 3;
                    if (specs[k] != null && String(specs[k]).toLowerCase() === String(dsv[k]).toLowerCase()) {
                        score += 3;
                    }
                }
            }
        } else if (criteria.bhk && property.specs) {
            // Legacy BHK-only fallback for leads that don't yet have demand_schema_values.
            // Mirrors the Phase 1 bhk scoring fix (read canonical taxonomy keys with
            // legacy fallback chain). Kept intact for back-compat; will be removed
            // along with criteria.bhk itself in Phase 4.
            maxScore += 10;
            const sLegacy = typeof property.specs === 'string' ? JSON.parse(property.specs) : property.specs;
            const roomRaw = sLegacy.bhk ?? sLegacy.rooms ?? sLegacy.bedrooms ?? sLegacy.bhk_count;
            let room: number | null = null;
            if (typeof roomRaw === 'number') {
                room = roomRaw;
            } else if (typeof roomRaw === 'string') {
                const cleaned = roomRaw.toLowerCase().replace('rk', '').replace('+', '').trim();
                const n = parseInt(cleaned, 10);
                if (!Number.isNaN(n)) room = n;
            }
            if (room === criteria.bhk) score += 10;
            else if (room != null && Math.abs(room - criteria.bhk) === 1) score += 5;
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

        // Legacy amenities-only fallback for leads that don't yet have
        // demand_schema_values.amenities populated. When dsv is present, the
        // canonical block above already handles this (with better scoring) so
        // we skip this to avoid double-counting.
        if (!dsv && criteria.demand_amenities?.length) {
            maxScore += 7;
            const amenities = Array.isArray(property.features) ? property.features as string[] : null;
            if (amenities && amenities.length) {
                const lower = new Set(amenities.map(a => String(a).toLowerCase()));
                const matched = criteria.demand_amenities.filter(a => lower.has(String(a).toLowerCase()));
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
     * Format matched properties into a WhatsApp-friendly TEXT message.
     *
     * ⚠️ NOT the customer/deal path anymore (2026-06-11). Deal & conversational property
     * suggestions now send category-correct v5 template CARDS via shareNextProperty()
     * (services/property_sharing.ts) — one at a time, with Call Back / Schedule Visit /
     * Next Option buttons and 24h-window-safe UTILITY delivery. This free-form text builder
     * remains only for non-customer surfaces (admin search command, voice-bot internal tools,
     * WhatsApp catalog fallback). Do NOT reintroduce it into the deal/AI buyer path.
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

/**
 * Build MatchCriteria from a Lead record (new normalized demand table).
 * Replaces building criteria from Contact demand fields.
 * Phase 3 (2026-05-29) — also carries demand_taxonomy_node_id + demand_schema_values
 * so the scorer can do canonical key-by-key compares vs inventory.specs.
 */
export function buildMatchCriteriaFromLead(lead: {
    intent?: string | null;
    demand_type_slug?: string | null;
    budget_min?: any;
    budget_max?: any;
    preferred_location?: string | null;
    demand_bhk?: number | null;
    preferred_lat?: number | null;
    preferred_lng?: number | null;
    type_id?: string | null;
    sub_category_id?: string | null;
    category_id?: string | null;
    // Phase 3 demand-side unification — canonical SoT fields.
    demand_taxonomy_node_id?: string | null;
    demand_schema_values?: Record<string, any> | null;
}): MatchCriteria {
    return {
        intent: lead.intent || undefined,
        property_type: lead.demand_type_slug || undefined,
        type_id: lead.type_id || undefined,
        sub_category_id: lead.sub_category_id || undefined,
        category_id: lead.category_id || undefined,
        budget_min: lead.budget_min ? Math.min(Number(lead.budget_min), Number(lead.budget_max || lead.budget_min)) : undefined,
        budget_max: lead.budget_max ? Math.max(Number(lead.budget_min || lead.budget_max), Number(lead.budget_max)) : undefined,
        preferred_location: lead.preferred_location || undefined,
        bhk: lead.demand_bhk || undefined,
        preferred_lat: lead.preferred_lat || undefined,
        preferred_lng: lead.preferred_lng || undefined,
        // Phase 3 — pass canonical fields through. If both are set on the lead, the
        // scorer prefers them over the legacy bhk/category cascade for type matching
        // and amenity matching.
        demand_taxonomy_node_id: lead.demand_taxonomy_node_id ?? null,
        demand_schema_values: lead.demand_schema_values ?? null,
    };
}
