/**
 * Shared taxonomy-tree helpers for multi-value demand (2026-09-28).
 *
 * Extracted from MatchShareTab so the Lead/Deal/Log-Call demand form can offer the
 * same TYPE-node chip groups without importing a sibling component (which would pull
 * the whole deal workspace bundle into the lead panel).
 *
 * node_kind casing differs across API generations ('TYPE' vs 'type'), so every
 * comparison here is case-insensitive — the previous TYPE-only check silently
 * returned zero groups against a lowercase tree.
 */
export interface TaxonomyNodeLike {
    id: string;
    name: string;
    slug?: string;
    node_kind: string;
    children?: TaxonomyNodeLike[];
}

export type TypeGroup = { sub: string; types: TaxonomyNodeLike[] };

function kindIs(node: TaxonomyNodeLike, kind: string): boolean {
    return String(node.node_kind || '').toLowerCase() === kind.toLowerCase();
}

/** Path from a root down to `targetId` (inclusive), or null when not found. */
export function findPath(
    nodes: TaxonomyNodeLike[],
    targetId: string,
    anc: TaxonomyNodeLike[] = [],
): TaxonomyNodeLike[] | null {
    for (const n of nodes) {
        if (n.id === targetId) return [...anc, n];
        if (n.children?.length) {
            const r = findPath(n.children, targetId, [...anc, n]);
            if (r) return r;
        }
    }
    return null;
}

/**
 * All TYPE-level nodes under a category, grouped by their immediate sub-category.
 * TYPE nodes are what inventory is actually classified by, so these are the chips a
 * multi-select should offer.
 */
export function collectTypeGroups(category: TaxonomyNodeLike): TypeGroup[] {
    const groups: TypeGroup[] = [];
    for (const sub of category.children || []) {
        const types: TaxonomyNodeLike[] = [];
        const walk = (n: TaxonomyNodeLike) => {
            if (kindIs(n, 'type')) types.push(n);
            (n.children || []).forEach(walk);
        };
        (sub.children || []).forEach(walk);
        if (types.length) groups.push({ sub: sub.name, types });
    }
    return groups;
}