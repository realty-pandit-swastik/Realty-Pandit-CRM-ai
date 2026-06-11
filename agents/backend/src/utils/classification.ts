/**
 * Resolve classification UUIDs (category_id / sub_category_id / type_id) to the
 * slug strings the Deal pipeline + matching read (`demand_*`).
 *
 * Manual-add (`POST /api/leads`) and the admin form store the classification
 * as UUIDs (master_categories / master_sub_categories / master_property_types)
 * but the Transaction + deal UI read `demand_category` / `demand_type_slug`
 * STRINGS. Without this resolution the deal shows "CATEGORY —" even though the
 * lead captured it. See docs/plans/2026-05-17-deal-sync-and-welcome-investigation.md
 */

export interface DemandSlugs {
    demand_main_category: string | null; // category slug, e.g. "residential"
    demand_category: string | null;      // same as main (deal card "CATEGORY")
    demand_sub_category: string | null;  // sub-category slug, e.g. "apartment"
    demand_type_slug: string | null;     // type slug || sub slug, e.g. "2_bhk"
}

type PrismaLike = {
    propertyCategory: { findUnique: (a: any) => Promise<{ slug: string } | null> };
    propertySubCategory: { findUnique: (a: any) => Promise<{ slug: string } | null> };
    propertyType: { findUnique: (a: any) => Promise<{ slug: string } | null> };
};

export async function resolveDemandSlugs(
    prisma: PrismaLike,
    ids: { category_id?: string | null; sub_category_id?: string | null; type_id?: string | null }
): Promise<DemandSlugs> {
    const out: DemandSlugs = {
        demand_main_category: null,
        demand_category: null,
        demand_sub_category: null,
        demand_type_slug: null,
    };

    const [cat, sub, typ] = await Promise.all([
        ids.category_id
            ? prisma.propertyCategory.findUnique({ where: { id: ids.category_id }, select: { slug: true } }).catch(() => null)
            : Promise.resolve(null),
        ids.sub_category_id
            ? prisma.propertySubCategory.findUnique({ where: { id: ids.sub_category_id }, select: { slug: true } }).catch(() => null)
            : Promise.resolve(null),
        ids.type_id
            ? prisma.propertyType.findUnique({ where: { id: ids.type_id }, select: { slug: true } }).catch(() => null)
            : Promise.resolve(null),
    ]);

    if (cat?.slug) {
        out.demand_main_category = cat.slug;
        out.demand_category = cat.slug;
    }
    if (sub?.slug) out.demand_sub_category = sub.slug;
    // Type is the most specific; fall back to the sub-category slug.
    out.demand_type_slug = typ?.slug ?? sub?.slug ?? null;

    return out;
}
