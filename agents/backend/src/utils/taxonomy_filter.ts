import prisma from '../db';

/**
 * Connect the new TaxonomyNode tree to list filters. Inventory rows carry `taxonomy_node_id`
 * (a leaf TYPE node, 100% populated); demand contacts carry `demand_taxonomy_node_id`. When a user
 * filters by a CATEGORY/SUBCATEGORY node, we must match every descendant TYPE node — so the selected
 * node ids are expanded to self + all descendants, then used as `taxonomy_node_id IN (...)`.
 */

/** Pure tree walk — selected ids → self + all descendants. Unknown ids resolve to themselves. */
export function expandNodeIds(
    selectedIds: string[],
    allNodes: Array<{ id: string; parent_id: string | null }>,
): string[] {
    const childrenOf = new Map<string, string[]>();
    for (const n of allNodes) {
        if (!n.parent_id) continue;
        const arr = childrenOf.get(n.parent_id);
        if (arr) arr.push(n.id);
        else childrenOf.set(n.parent_id, [n.id]);
    }
    const result = new Set<string>();
    const stack = [...selectedIds];
    while (stack.length) {
        const id = stack.pop()!;
        if (result.has(id)) continue;
        result.add(id);
        for (const child of childrenOf.get(id) || []) stack.push(child);
    }
    return [...result];
}

// The tree is tiny (~76 nodes) and rarely changes — cache the flat list briefly.
let _treeCache: Array<{ id: string; parent_id: string | null }> | null = null;
let _treeCacheAt = 0;
const TREE_TTL_MS = 5 * 60 * 1000;

/** Async wrapper: load (cached) the TaxonomyNode tree and expand the selected ids. */
export async function expandTaxonomyNodeIds(selectedIds: string[]): Promise<string[]> {
    if (!selectedIds || !selectedIds.length) return [];
    if (!_treeCache || Date.now() - _treeCacheAt > TREE_TTL_MS) {
        _treeCache = (await prisma.taxonomyNode.findMany({ select: { id: true, parent_id: true } })) || [];
        _treeCacheAt = Date.now();
    }
    return expandNodeIds(selectedIds, _treeCache);
}

/**
 * BHK filter over the canonical specs chain, matching number OR string storage. Returns a Prisma
 * `{ OR: [...] }` group, or null when nothing is selected.
 *
 * 2026-06-11 hardening: include `bhk_count` (the canonical read-chain used by extractBhkInt /
 * shareNextProperty also reads it) and match common string-storage variants ("2", "2 BHK",
 * "2bhk", "2 bhk") so a non-numeric listing isn't silently dropped. Existing clean numeric/`"N"`
 * data is unaffected — this is pure OR-widening. (Slug-backfilled rows store a clean number, so
 * this is belt-and-suspenders for legacy/future messy entries.)
 */
export function bhkSpecsFilter(bhkValues: number[]): { OR: any[] } | null {
    if (!bhkValues || !bhkValues.length) return null;
    const keys = ['bhk', 'rooms', 'bedrooms', 'bhk_count'];
    const or: any[] = [];
    for (const v of bhkValues) {
        const variants: Array<number | string> = [v, String(v), `${v} BHK`, `${v}BHK`, `${v} bhk`, `${v}bhk`];
        for (const k of keys) {
            for (const val of variants) {
                or.push({ specs: { path: [k], equals: val } });
            }
        }
    }
    return { OR: or };
}
