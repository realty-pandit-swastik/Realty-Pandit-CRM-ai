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
 * BHK filter over the canonical specs chain (bhk → rooms → bedrooms), matching number OR string
 * storage. Returns a Prisma `{ OR: [...] }` group, or null when nothing is selected. Fixes the old
 * filter that only checked `specs.bedrooms` and missed `specs.bhk` listings.
 */
export function bhkSpecsFilter(bhkValues: number[]): { OR: any[] } | null {
    if (!bhkValues || !bhkValues.length) return null;
    const keys = ['bhk', 'rooms', 'bedrooms'];
    const or: any[] = [];
    for (const v of bhkValues) {
        for (const k of keys) {
            or.push({ specs: { path: [k], equals: v } });
            or.push({ specs: { path: [k], equals: String(v) } });
        }
    }
    return { OR: or };
}
