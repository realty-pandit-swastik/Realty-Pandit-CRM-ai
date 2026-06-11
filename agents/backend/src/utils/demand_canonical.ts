/**
 * Demand-side unification — shared "fold legacy → canonical" helper.
 *
 * Phase 1 of the unification (2026-05-29) introduces two new columns on Contact,
 * Lead, Transaction: `demand_taxonomy_node_id` + `demand_schema_values` (JSONB).
 * They mirror the inventory side's `taxonomy_node_id` + `specs`, so the matching
 * engine can compare key-by-key (Phase 3).
 *
 * Every write site (admin POST/PATCH, webhook ingestion, voice, chat) calls
 * `foldLegacyDemand(legacyValues)` and spreads the result alongside the legacy
 * field writes — dual-write transitional. Reads keep using the legacy fields
 * until Phase 3 cuts over.
 *
 * No DB calls — pure transformation. Taxonomy_node_id resolution from
 * (category_id, sub_category_id, type_id) lives in the one-shot backfill script;
 * for new writes the upstream form/webhook should pass it explicitly when known.
 */

const BHK_INT_TO_LABEL: Record<number, string> = {
    1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8+',
};

/** "1BHK" / "Studio" / "1 RK" → canonical taxonomy bhk option string ("1"/"1 RK"/...) */
export function bhkFromString(s: unknown): string | null {
    if (!s) return null;
    const lower = String(s).toLowerCase().trim();
    if (!lower) return null;
    if (lower === 'studio' || lower === '1rk' || lower === '1 rk') return '1 RK';
    const m = lower.match(/^(\d+)/);
    if (m) {
        const n = parseInt(m[1], 10);
        if (n >= 1 && n <= 8) return BHK_INT_TO_LABEL[n] || String(n);
        if (n > 8) return '8+';
    }
    return null;
}

/** Normalize a legacy amenities value into a clean array of label strings. */
function normalizeAmenitiesValue(raw: unknown): string[] | null {
    if (!Array.isArray(raw)) return null;
    const clean = raw.filter(x => typeof x === 'string' && x.trim()).map(x => String(x).trim());
    return clean.length ? clean : null;
}

export interface LegacyDemandInput {
    // Lead/Contact shape (Int) — overridden by demand_bedrooms (String) for Transaction
    demand_bhk?: number | null;
    /** Transaction-only String form like "1BHK", "Studio" */
    demand_bedrooms?: string | null;
    /** Array of amenity labels (legacy) */
    demand_amenities?: unknown;
    /** Pass-through if upstream already set the new canonical field */
    demand_taxonomy_node_id?: string | null;
    /** Pass-through; merged onto computed values (caller's keys win) */
    demand_schema_values?: unknown;
}

export interface DemandCanonical {
    demand_taxonomy_node_id: string | null | undefined;
    demand_schema_values: Record<string, any> | null;
}

/**
 * Build {demand_taxonomy_node_id, demand_schema_values} from a row's legacy
 * fields. Idempotent: if `demand_schema_values` is already populated with the
 * canonical keys, those win over derived values from `demand_bhk` / etc.
 */
export function foldLegacyDemand(legacy: LegacyDemandInput): DemandCanonical {
    const incoming = (legacy.demand_schema_values && typeof legacy.demand_schema_values === 'object' && !Array.isArray(legacy.demand_schema_values))
        ? { ...(legacy.demand_schema_values as Record<string, any>) } : {};
    const sv: Record<string, any> = incoming;

    // bhk: derive from demand_bhk (Int) or demand_bedrooms (String) only if not
    // already set in incoming demand_schema_values.
    if (sv.bhk == null) {
        if (typeof legacy.demand_bhk === 'number' && legacy.demand_bhk > 0) {
            sv.bhk = BHK_INT_TO_LABEL[legacy.demand_bhk] || String(legacy.demand_bhk);
        } else if (legacy.demand_bedrooms) {
            const lbl = bhkFromString(legacy.demand_bedrooms);
            if (lbl) sv.bhk = lbl;
        }
    }

    // amenities: copy verbatim if it's already an array of strings and not set in incoming.
    if (!Array.isArray(sv.amenities)) {
        const am = normalizeAmenitiesValue(legacy.demand_amenities);
        if (am) sv.amenities = am;
    }

    return {
        demand_taxonomy_node_id: legacy.demand_taxonomy_node_id ?? null,
        demand_schema_values: Object.keys(sv).length ? sv : null,
    };
}

/**
 * Deep-merge incoming demand_schema_values onto an existing one. Used by PATCH
 * routes to prevent unknown taxonomy keys getting silently dropped when a client
 * sends only a partial schema_values object.
 */
export function mergeDemandSchemaValues(
    existing: unknown,
    incoming: unknown,
): Record<string, any> | null {
    const base = (existing && typeof existing === 'object' && !Array.isArray(existing))
        ? { ...(existing as Record<string, any>) } : {};
    const inc = (incoming && typeof incoming === 'object' && !Array.isArray(incoming))
        ? (incoming as Record<string, any>) : null;
    if (!inc) return Object.keys(base).length ? base : null;
    return { ...base, ...inc };
}
