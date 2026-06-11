/**
 * Phase 1d — populate TaxonomyNode.legacy_* by inverting the 1b mapping.
 * For each flat_property_type that 1b mapped onto a leaf TYPE node, store that
 * flat_property_type_id on the node, plus the sub_category_id / type_id that
 * existing inventory of that flat type actually uses (most-common, data-true).
 * The add-inventory commit (Phase 1d) reads node.legacy_flat_property_type_id to
 * re-use the existing flat-type → legacy classification machinery for back-compat.
 *
 *   DRY RUN (no writes): npx ts-node prisma/backfill_node_legacy.ts --dry-run
 *   APPLY:               npx ts-node prisma/backfill_node_legacy.ts
 *
 * Idempotent. Mirrors the MAP in backfill_taxonomy.ts (1b).
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry-run');

// flat_property_type.name -> { type: leaf TYPE node name, cat: root category } (same as 1b)
const MAP: Record<string, { type: string; cat: string }> = {
    'Apartment / Gated Society':    { type: 'Flat',                      cat: 'Residential' },
    'Builder Floor':                { type: 'Independent Floor',         cat: 'Residential' },
    'Builder Flat Front Facing':    { type: 'Builder Flat (Front)',      cat: 'Residential' },
    'Builder Flat Back Facing':     { type: 'Builder Flat (Back)',       cat: 'Residential' },
    'Land / Plot':                  { type: 'Authority Plot',            cat: 'Residential' },
    'Independent House / Villa':    { type: 'Villa',                     cat: 'Residential' },
    'Commercial Shops':             { type: 'Open Market Shop',          cat: 'Commercial' },
    'Commercial Office / Space':    { type: 'Commercial Complex office', cat: 'Commercial' },
    'Ready to Move Office Space':   { type: 'Commercial Complex office', cat: 'Commercial' },
    'Co-working Office Space':      { type: 'Co working Office',         cat: 'Commercial' },
    'Factory':                      { type: 'Factory',                   cat: 'Commercial' },
    'Commercial Land / Inst. Land': { type: 'Commercial Land',           cat: 'Commercial' },
    'Industrial Lands / Plots':     { type: 'Industrial Land/Plot',      cat: 'Commercial' },
    'Commercial Showrooms':         { type: 'Open Market Showroom',      cat: 'Commercial' },
    'Guest-House / Banquet-Halls':  { type: 'Guest House',               cat: 'Commercial' },
    'Agricultural Land':            { type: 'Agriculture Land/Orchard',  cat: 'Commercial' },
    'WareHouse':                    { type: 'ware House',                cat: 'Commercial' },
    'Hotel / Resorts':              { type: 'Hotel',                     cat: 'Commercial' },
};

async function rootCategory(nodeId: string): Promise<string> {
    let cur = await prisma.taxonomyNode.findUnique({ where: { id: nodeId }, select: { name: true, parent_id: true } });
    while (cur && cur.parent_id) {
        cur = await prisma.taxonomyNode.findUnique({ where: { id: cur.parent_id }, select: { name: true, parent_id: true } });
    }
    return cur?.name ?? '';
}

async function main() {
    const typeNodes = await prisma.taxonomyNode.findMany({ where: { node_kind: 'TYPE' }, select: { id: true, name: true } });
    const nodeIdFor = async (typeName: string, cat: string): Promise<string | null> => {
        const cands = typeNodes.filter((n) => n.name === typeName);
        for (const c of cands) { if ((await rootCategory(c.id)) === cat) return c.id; }
        return cands[0]?.id ?? null;
    };

    const fpts = await prisma.flatPropertyType.findMany({ select: { id: true, name: true } });
    let set = 0, skipped = 0;
    for (const [fptName, m] of Object.entries(MAP)) {
        const fpt = fpts.find((f) => f.name === fptName);
        if (!fpt) { console.log(`-- no flat_property_type "${fptName}"`); skipped++; continue; }
        const nodeId = await nodeIdFor(m.type, m.cat);
        if (!nodeId) { console.log(`!! NO NODE for "${m.type}" (${m.cat}) <- "${fptName}"`); skipped++; continue; }

        // Derive legacy sub_category_id / type_id from existing inventory of this flat type.
        const inv = await prisma.inventory.findFirst({
            where: { flat_property_type_id: fpt.id, sub_category_id: { not: null } },
            select: { sub_category_id: true, type_id: true },
        });

        console.log(`${set + 1}. ${fptName} -> node ${nodeId.slice(0, 8)} (${m.type}) fpt=${fpt.id.slice(0, 8)} sub=${inv?.sub_category_id?.slice(0, 8) ?? '-'} type=${inv?.type_id?.slice(0, 8) ?? '-'}`);
        if (!DRY) {
            await prisma.taxonomyNode.update({
                where: { id: nodeId },
                data: {
                    legacy_flat_property_type_id: fpt.id,
                    legacy_sub_category_id: inv?.sub_category_id ?? undefined,
                    legacy_type_id: inv?.type_id ?? undefined,
                },
            });
        }
        set++;
    }
    console.log(DRY ? '--- DRY RUN (no writes) ---' : '--- APPLIED ---');
    console.log(`NODE_LEGACY_BACKFILL_DONE set=${set} skipped=${skipped}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
