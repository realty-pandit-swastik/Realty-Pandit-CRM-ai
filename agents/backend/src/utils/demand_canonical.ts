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

// ─── Multi-value demand (2026-09-28) ───────────────────────────────────────────
// A client can accept several property options at once ("2 BHK and 3 BHK",
// "Flat or Villa"). We deliberately do NOT turn the existing scalar `bhk` /
// demand_taxonomy_node_id into arrays: ~11 read sites (incl. customer-facing
// WhatsApp greetings and `_parseRooms`, which would silently read "2,3" as 2)
// assume a scalar. Instead the set is stored as parallel keys inside the same
// demand_schema_values JSONB:
//
//   bhk_list:       ["2", "3"]     — OR set of BHK/Rooms values
//   type_node_list: ["<uuid>", …]  — OR set of taxonomy TYPE node ids
//
// Both keys are written ONLY when the user picks 2+ options, so a single-select
// lead serialises exactly as it did before (no migration, no backfill). The
// scalar keys keep the primary value for every legacy reader.
export const DEMAND_BHK_LIST_KEY = 'bhk_list';
export const DEMAND_TYPE_NODE_LIST_KEY = 'type_node_list';

/** Coerce one stored BHK option ("2" | "2 BHK" | 2 | "8+") → integer, or null. */
function coerceBhkInt(raw: unknown): number | null {
    if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null;
    if (typeof raw !== 'string') return null;
    const cleaned = raw.toLowerCase().replace(/rk/, '').replace('+', '').trim();
    const n = parseInt(cleaned, 10);
    return Number.isNaN(n) || n <= 0 ? null : n;
}

/**
 * BHK set for a demand schema.
 * Prefers the explicit multi-value list; falls back to the scalar `bhk`, then
 * `rooms` (commercial stores rooms where residential stores bhk) so existing
 * single-value leads keep working with zero change.
 */
export function bhkListFromDemand(schema: unknown): number[] {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return [];
    const sv = schema as Record<string, any>;

    const out = new Set<number>();
    const list = sv[DEMAND_BHK_LIST_KEY];
    if (Array.isArray(list)) {
        for (const v of list) {
            const n = coerceBhkInt(v);
            if (n !== null) out.add(n);
        }
    }
    if (!out.size) {
        const scalar = coerceBhkInt(sv.bhk) ?? coerceBhkInt(sv.rooms);
        if (scalar !== null) out.add(scalar);
    }
    return [...out].sort((a, b) => a - b);
}

/** Strip a stored type_node_list down to unique non-empty ids, order preserved. */
function coerceNodeIds(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const v of raw) {
        const id = typeof v === 'string' ? v.trim() : '';
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

/**
 * TYPE node set for a demand.
 * Prefers `type_node_list`; falls back to the scalar `demand_taxonomy_node_id`
 * passed in by the caller (kept separate so this stays a pure schema reader).
 */
export function typeNodeListFromDemand(schema: unknown, scalarNodeId?: string | null): string[] {
    if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
        const ids = coerceNodeIds((schema as Record<string, any>)[DEMAND_TYPE_NODE_LIST_KEY]);
        if (ids.length) return ids;
    }
    const scalar = typeof scalarNodeId === 'string' ? scalarNodeId.trim() : '';
    return scalar ? [scalar] : [];
}

/**
 * Choose the primary value to persist into the legacy scalar keys when a set is
 * being saved. Keeps the value that was already stored when it is still part of
 * the selection (so re-saving a multi-select lead doesn't churn the WhatsApp
 * greeting text and audit history), otherwise takes the first of the set.
 */
export function pickPrimaryFromList(selected: string[], previous?: string | null): string | null {
    if (!selected.length) return null;
    const prev = typeof previous === 'string' ? previous.trim() : '';
    if (prev && selected.includes(prev)) return prev;
    return selected[0];
}

export interface MultiValueDemandPatch {
    /** Keys to merge into demand_schema_values (only the applicable ones). */
    schema: Record<string, any>;
    /** Primary BHK label for the scalar `bhk`, or null when nothing is selected. */
    primaryBhk: string | null;
    /** Primary TYPE node id, or null when nothing is selected. */
    primaryTypeNodeId: string | null;
}

/** Canonical BHK option labels, mirroring FieldDefinition(bhk).options_json. */
const BHK_OPTION_LABELS = ['1 RK', '1', '2', '3', '4', '5', '6', '7', '8+'];

/** Map an integer 1-8 to its canonical option label ('8' → '8+', 0/1-rk → '1 RK'). */
function bhkLabelFromInt(n: number): string | null {
    if (n === 0) return '1 RK';
    if (n < 1 || n > 8) return null;
    return n === 8 ? '8+' : String(n);
}

/** Normalise one user-supplied BHK option to its canonical label, or null if unusable. */
function normalizeBhkOption(raw: unknown): string | null {
    if (typeof raw === 'number') return bhkLabelFromInt(raw);
    if (typeof raw !== 'string') return null;
    const v = raw.trim();
    if (!v) return null;
    const lower = v.toLowerCase();
    if (lower === 'studio' || lower === '1rk' || lower === '1 rk') return '1 RK';
    const m = lower.match(/^(\d+)/);
    if (m) {
        const n = parseInt(m[1], 10);
        if (n > 8) return '8+';
        return bhkLabelFromInt(n);
    }
    // Already a canonical label (e.g. "1 RK", "8+").
    const exact = BHK_OPTION_LABELS.find(o => o.toLowerCase() === lower);
    return exact ?? null;
}

export type MultiValueValidation =
    | { ok: true; schema: Record<string, any> }
    | { ok: false; error: string };

/**
 * Validate + normalise the multi-value keys inside an incoming
 * demand_schema_values object. This is the one DB-aware helper in this module —
 * it takes the Prisma client as an argument rather than importing it, so the
 * module itself stays import-safe for pure callers.
 *
 * Rules (deliberately strict — a silently-ignored bad node id would widen or
 * narrow matching unpredictably):
 *  - `bhk_list` must be an array; each entry must normalise to a canonical BHK label
 *  - `type_node_list` must be an array of strings; every id must exist AND be a TYPE node
 *  - either key absent → left untouched (partial PATCH stays a partial PATCH)
 */
export async function validateMultiValueDemand(
    incoming: unknown,
    prisma: { taxonomyNode: { findMany: (args: any) => Promise<any[]> } },
): Promise<MultiValueValidation> {
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
        return { ok: true, schema: {} };
    }
    const src = incoming as Record<string, any>;
    const out: Record<string, any> = {};

    if (DEMAND_BHK_LIST_KEY in src) {
        const list = src[DEMAND_BHK_LIST_KEY];
        if (list === null) {
            // explicit clear → drop the key entirely
        } else if (!Array.isArray(list)) {
            return { ok: false, error: `${DEMAND_BHK_LIST_KEY} must be an array of BHK values` };
        } else {
            const labels: string[] = [];
            for (const raw of list) {
                const label = normalizeBhkOption(raw);
                if (!label) return { ok: false, error: `Invalid BHK value: ${String(raw)}` };
                if (!labels.includes(label)) labels.push(label);
            }
            if (!labels.length) return { ok: false, error: `${DEMAND_BHK_LIST_KEY} must contain at least one valid BHK value` };
            out[DEMAND_BHK_LIST_KEY] = labels;
        }
    }

    if (DEMAND_TYPE_NODE_LIST_KEY in src) {
        const list = src[DEMAND_TYPE_NODE_LIST_KEY];
        if (list === null) {
            // explicit clear
        } else if (!Array.isArray(list) || list.some(v => typeof v !== 'string')) {
            return { ok: false, error: `${DEMAND_TYPE_NODE_LIST_KEY} must be an array of taxonomy node ids` };
        } else {
            const ids = coerceNodeIds(list);
            if (!ids.length) return { ok: false, error: `${DEMAND_TYPE_NODE_LIST_KEY} must contain at least one node id` };
            const rows = await prisma.taxonomyNode.findMany({
                where: { id: { in: ids } },
                select: { id: true, node_kind: true },
            });
            const kindById = new Map(rows.map((r: any) => [r.id, String(r.node_kind || '').toUpperCase()]));
            const bad = ids.filter(id => !kindById.has(id));
            if (bad.length) return { ok: false, error: `Unknown property type: ${bad.join(', ')}` };
            const notType = ids.filter(id => kindById.get(id) !== 'TYPE');
            if (notType.length) return { ok: false, error: `Not a property type: ${notType.join(', ')}` };
            out[DEMAND_TYPE_NODE_LIST_KEY] = ids;
        }
    }

    return { ok: true, schema: out };
}

/**
 * Build the `{ bhk, bhk_list, type_node_list }` patch for a multi-value save.
 *
 * Contract (keeps every single-value lead byte-identical to the old behaviour):
 *  - a scalar key is omitted entirely when no value is selected
 *  - `bhk` is omitted when only ONE option is chosen
 *  - `bhk_list` / `type_node_list` appear only when 2+ options are chosen
 *
 * `demand_taxonomy_node_id` is a column rather than a JSON key, so the caller
 * applies `primaryTypeNodeId` itself.
 */
export function buildMultiValueDemandPatch(options: {
    /** Selected BHK/Rooms option labels, e.g. ['2','3']. */
    bhkOptions?: string[];
    /** Currently stored scalar value, used to keep the primary stable. */
    previousBhk?: string | null;
    /** Selected TYPE node ids. */
    typeNodeIds?: string[];
}): MultiValueDemandPatch {
    const { bhkOptions = [], previousBhk = null, typeNodeIds = [] } = options;

    const schema: Record<string, any> = {};

    const cleanBhk = bhkOptions.map(b => String(b).trim()).filter(Boolean);
    if (cleanBhk.length === 1) {
        schema.bhk = cleanBhk[0];
    } else if (cleanBhk.length > 1) {
        schema.bhk = pickPrimaryFromList(cleanBhk, previousBhk);
        schema[DEMAND_BHK_LIST_KEY] = cleanBhk;
    }

    const cleanNodes = coerceNodeIds(typeNodeIds);
    const primaryTypeNodeId = cleanNodes.length ? pickPrimaryFromList(cleanNodes, null) : null;
    if (cleanNodes.length > 1) schema[DEMAND_TYPE_NODE_LIST_KEY] = cleanNodes;

    return { schema, primaryBhk: schema.bhk ?? null, primaryTypeNodeId };
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
