/**
 * resolveDemandTaxonomy — map a lead/client's requirement signals (from ANY source:
 * 99acres, MagicBricks, WhatsApp/web buyer bot, voice, website, manual) into the SAME
 * canonical shape inventory uses: a taxonomy node id + `demand_schema_values` keyed by
 * `FieldDefinition.key`. This is what makes demand↔inventory matching key-by-key +
 * taxonomy-node-distance (see services/matching_engine.ts).
 *
 * Node resolution reuses the inventory mapping links on TaxonomyNode:
 *   legacy_sub_category_id / legacy_type_id  and  legacy_flat_property_type_id.
 * One sub-category / flat-type maps to several leaf nodes → pick the generic one +
 * flag needs_review (mirrors the inventory Phase-1b auto-map+flag approach).
 *
 * Added 2026-05-31 — Stage 2 of docs/plans/2026-05-31-demand-taxonomy-capture.md.
 */
import prisma from '../db';
import { foldLegacyDemand } from './demand_canonical';

export interface DemandTaxonomyInput {
    demand_taxonomy_node_id?: string | null; // precise canonical node id — fast-path via byNodeId (resolver L202)
    main_category?: string | null;          // 'residential' | 'commercial' | 'agricultural'
    property_type?: string | null;          // legacy type string/slug: 'flat','apartment','villa','plot','office','shop',…
    category_id?: string | null;            // legacy master_categories id (optional)
    sub_category_id?: string | null;        // legacy master_sub_categories id
    type_id?: string | null;                // legacy master_property_types id
    bhk?: number | string | null;
    amenities?: string[] | null;
    furnishing?: string | null;
    facing?: string | null;
    age_of_construction?: string | null;
}

export interface DemandTaxonomyResult {
    demand_taxonomy_node_id: string | null;
    demand_schema_values: Record<string, any> | null;
    needs_review: boolean;
    // Legacy classification IDs derived from the resolved node — persist these
    // alongside the node so column-reading paths (matching hard filter, filters,
    // analytics) stay correct without a second resolution step.
    sub_category_id: string | null;
    category_id: string | null;
    type_id: string | null;
}

interface NodeRow {
    id: string; name: string; slug: string; display_order: number;
    legacy_sub_category_id: string | null; legacy_type_id: string | null; legacy_flat_property_type_id: string | null;
}

let cache: {
    bySub: Map<string, NodeRow[]>;       // legacy_sub_category_id -> nodes
    byTypeSlug: Map<string, NodeRow[]>;  // flat-type legacy_type_slug -> nodes (aggregated across flat types)
    byFlatSlug: Map<string, NodeRow[]>;  // flat-type slug -> nodes
    byNodeId: Map<string, NodeRow>;      // node id -> node row (for node -> classification lookup)
    subToCat: Map<string, string>;       // legacy_sub_category_id -> legacy category_id (PropertySubCategory.category_id)
} | null = null;

/** Reset the in-process lookup cache (taxonomy is near-static; refreshed on restart / call after edits). */
export function clearDemandTaxonomyCache(): void { cache = null; }

async function loadMaps() {
    if (cache) return cache;
    const nodes = await prisma.taxonomyNode.findMany({
        where: { node_kind: 'TYPE' },
        select: { id: true, name: true, slug: true, display_order: true, legacy_sub_category_id: true, legacy_type_id: true, legacy_flat_property_type_id: true },
    });
    const fts = await prisma.flatPropertyType.findMany({ select: { id: true, slug: true, legacy_type_slug: true } });

    const bySub = new Map<string, NodeRow[]>();
    const byFlatId = new Map<string, NodeRow[]>();
    const byNodeId = new Map<string, NodeRow>();
    const push = (m: Map<string, NodeRow[]>, k: string | null, v: NodeRow) => { if (!k) return; const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };
    for (const n of nodes as any[]) { push(bySub, n.legacy_sub_category_id, n); push(byFlatId, n.legacy_flat_property_type_id, n); byNodeId.set(n.id, n); }

    // legacy_sub_category_id -> legacy category_id, from the source PropertySubCategory table
    // (used for the category-tier scoring + the category fallback hard filter).
    const subToCat = new Map<string, string>();
    const subRows = await prisma.propertySubCategory.findMany({ select: { id: true, category_id: true } });
    for (const s of subRows as any[]) { if (s.id && s.category_id) subToCat.set(s.id, s.category_id); }

    // Aggregate nodes by flat-type slug AND by legacy_type_slug (multiple flat types can share a
    // legacy_type_slug, e.g. builder_floor / independent_builder_floor — gather both their nodes).
    const byTypeSlug = new Map<string, NodeRow[]>();
    const byFlatSlug = new Map<string, NodeRow[]>();
    const append = (m: Map<string, NodeRow[]>, k: string, arr: NodeRow[]) => { const cur = m.get(k); if (cur) cur.push(...arr); else m.set(k, [...arr]); };
    for (const f of fts as any[]) {
        const ns = byFlatId.get(f.id) || [];
        if (!ns.length) continue;
        if (f.slug) append(byFlatSlug, String(f.slug).toLowerCase(), ns);
        if (f.legacy_type_slug) append(byTypeSlug, String(f.legacy_type_slug).toLowerCase(), ns);
    }
    cache = { bySub, byTypeSlug, byFlatSlug, byNodeId, subToCat };
    return cache;
}

// Feeds/bot store loose legacy type strings; normalize them to a FlatPropertyType
// `legacy_type_slug`. Bare categories carry NO specific type → don't guess a leaf.
const CATEGORY_ONLY = new Set(['residential', 'commercial', 'agricultural', 'agriculture']);
const TYPE_SYNONYMS: Record<string, string> = {
    flat: 'apartment', penthouse: 'apartment', duplex: 'apartment', simplex: 'apartment',
    house: 'villa', bungalow: 'villa', kothi: 'villa', independent_house: 'villa',
    land: 'plot',
    godown: 'warehouse',
    // exact legacy_type_slugs pass through (apartment, villa, plot, shop, office, builder_floor,
    // builder_flat, studio, showroom, warehouse, hotel, …)
};

// Prefer the most generic leaf when several nodes match: lowest display_order, then shortest name.
function pickGeneric(nodes: NodeRow[]): NodeRow {
    return [...nodes].sort((a, b) => (a.display_order - b.display_order) || (a.name.length - b.name.length))[0];
}

export async function resolveDemandTaxonomy(input: DemandTaxonomyInput): Promise<DemandTaxonomyResult> {
    const maps = await loadMaps();
    let node: NodeRow | null = null;
    let ambiguous = false;

    // 1. Legacy classification ids (most precise — set by manual form / feed slug-map)
    if (input.sub_category_id && maps.bySub.has(input.sub_category_id)) {
        let cands = maps.bySub.get(input.sub_category_id)!;
        if (input.type_id) { const exact = cands.filter(n => n.legacy_type_id === input.type_id); if (exact.length) cands = exact; }
        node = cands.length === 1 ? cands[0] : pickGeneric(cands);
        ambiguous = cands.length > 1;
    }

    // 2. property_type string → normalize/synonym → nodes. Skip bare category values.
    if (!node && input.property_type) {
        const raw = String(input.property_type).toLowerCase().trim().replace(/\s+/g, '_');
        if (!CATEGORY_ONLY.has(raw)) {
            const pt = TYPE_SYNONYMS[raw] ?? raw;
            let cands = maps.byTypeSlug.get(pt) ?? maps.byFlatSlug.get(pt) ?? null;
            if (!cands) {
                // contains-fallback: a known type-slug appearing inside a compound feed string,
                // e.g. "residential_plot"→plot, "commercial_office_space"→office, "retail_shop"→shop.
                const keys = [...maps.byTypeSlug.keys()].sort((a, b) => b.length - a.length);
                const hit = keys.find(k => k.length >= 4 && (raw.includes(k) || pt.includes(k)));
                if (hit) cands = maps.byTypeSlug.get(hit)!;
            }
            if (cands && cands.length) {
                node = cands.length === 1 ? cands[0] : pickGeneric(cands);
                ambiguous = cands.length > 1;
            }
        }
    }

    // schema_values — canonical, keyed by FieldDefinition.key (mirrors inventory.specs)
    const folded = foldLegacyDemand({
        demand_bhk: typeof input.bhk === 'number' ? input.bhk : (input.bhk ? parseInt(String(input.bhk), 10) : null),
        demand_amenities: input.amenities ?? null,
    });
    const sv: Record<string, any> = (folded.demand_schema_values && typeof folded.demand_schema_values === 'object')
        ? { ...(folded.demand_schema_values as Record<string, any>) } : {};
    if (input.furnishing) sv.furnishing = input.furnishing;
    if (input.facing) sv.facing = input.facing;
    if (input.age_of_construction) sv['age-of-construction'] = input.age_of_construction;
    const demand_schema_values = Object.keys(sv).length ? sv : null;

    const attempted = !!(input.sub_category_id || input.property_type);
    // Derive legacy classification IDs from the resolved node (so callers persist
    // node + columns together). Prefer the node's own legacy ids; fall back to the
    // input ids when no node resolved.
    const sub_category_id = node?.legacy_sub_category_id ?? input.sub_category_id ?? null;
    const category_id = (sub_category_id && maps.subToCat.get(sub_category_id)) ?? input.category_id ?? null;
    const type_id = node?.legacy_type_id ?? input.type_id ?? null;
    return {
        demand_taxonomy_node_id: node?.id ?? null,
        demand_schema_values,
        needs_review: ambiguous || (attempted && !node),
        sub_category_id,
        category_id,
        type_id,
    };
}

/**
 * resolveTypeFilter — the single, cached "requirement type signal → inventory hard
 * filter" used by the MatchingEngine. Accepts ANY type signal a caller has (canonical
 * node id, a legacy property_type slug from the WhatsApp/agent paths, or pre-set legacy
 * ids) and returns the canonical node + the legacy `sub_category_id`/`category_id` that
 * join 1:1 to inventory. This is what lets the buyer's property type actually constrain
 * the inventory returned (was previously a no-op for node-only / slug-only leads).
 *
 * Resolution priority: explicit sub_category_id > demand_taxonomy_node_id > property_type slug.
 * Added 2026-05-31 — fix for "matching ignores the demand taxonomy node".
 */
export interface TypeFilterResult {
    demand_taxonomy_node_id: string | null;
    sub_category_id: string | null;
    category_id: string | null;
    type_id: string | null;
}
export async function resolveTypeFilter(input: {
    demand_taxonomy_node_id?: string | null;
    property_type?: string | null;
    sub_category_id?: string | null;
    category_id?: string | null;
    type_id?: string | null;
}): Promise<TypeFilterResult> {
    const maps = await loadMaps();
    const subToCat = (sub: string | null | undefined): string | null =>
        (sub && maps.subToCat.get(sub)) || null;

    // 1. Node id present → authoritative.
    if (input.demand_taxonomy_node_id && maps.byNodeId.has(input.demand_taxonomy_node_id)) {
        const n = maps.byNodeId.get(input.demand_taxonomy_node_id)!;
        const sub = n.legacy_sub_category_id ?? input.sub_category_id ?? null;
        return {
            demand_taxonomy_node_id: n.id,
            sub_category_id: sub,
            category_id: subToCat(sub) ?? input.category_id ?? null,
            type_id: n.legacy_type_id ?? input.type_id ?? null,
        };
    }

    // 2. Explicit legacy sub_category_id already given → keep it (still fill category).
    if (input.sub_category_id) {
        return {
            demand_taxonomy_node_id: input.demand_taxonomy_node_id ?? null,
            sub_category_id: input.sub_category_id,
            category_id: subToCat(input.sub_category_id) ?? input.category_id ?? null,
            type_id: input.type_id ?? null,
        };
    }

    // 3. Only a loose property_type slug (WhatsApp bot / matching agent / website) →
    //    resolve it to a node via the same logic capture uses, then derive the filter.
    if (input.property_type) {
        const r = await resolveDemandTaxonomy({ property_type: input.property_type });
        if (r.demand_taxonomy_node_id) {
            return {
                demand_taxonomy_node_id: r.demand_taxonomy_node_id,
                sub_category_id: r.sub_category_id,
                category_id: r.category_id,
                type_id: r.type_id,
            };
        }
    }

    // 4. Nothing resolvable (e.g. only category given, or no type signal at all).
    return {
        demand_taxonomy_node_id: input.demand_taxonomy_node_id ?? null,
        sub_category_id: null,
        category_id: input.category_id ?? null,
        type_id: input.type_id ?? null,
    };
}
