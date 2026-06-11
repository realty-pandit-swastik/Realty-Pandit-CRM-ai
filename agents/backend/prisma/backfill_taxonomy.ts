/**
 * Phase 1b — backfill existing inventory onto the canonical TaxonomyNode tree.
 * Source: flat_property_type (100% populated). Sets inventory.taxonomy_node_id +
 * needs_taxonomy_review. Legacy classification columns are NOT touched. Idempotent.
 *
 *   DRY RUN (no writes): npx ts-node prisma/backfill_taxonomy.ts --dry-run
 *   APPLY:               npx ts-node prisma/backfill_taxonomy.ts
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry-run');

// flat_property_type.name -> { type: leaf TYPE node name, cat: root category, confident }
const MAP: Record<string, { type: string; cat: string; confident: boolean }> = {
    'Apartment / Gated Society':    { type: 'Flat',                      cat: 'Residential', confident: false },
    'Builder Floor':                { type: 'Independent Floor',         cat: 'Residential', confident: true },
    'Builder Flat Front Facing':    { type: 'Builder Flat (Front)',      cat: 'Residential', confident: true },
    'Builder Flat Back Facing':     { type: 'Builder Flat (Back)',       cat: 'Residential', confident: true },
    'Land / Plot':                  { type: 'Authority Plot',            cat: 'Residential', confident: false },
    'Independent House / Villa':    { type: 'Villa',                     cat: 'Residential', confident: false },
    'Commercial Shops':             { type: 'Open Market Shop',          cat: 'Commercial',  confident: false },
    'Commercial Office / Space':    { type: 'Commercial Complex office', cat: 'Commercial',  confident: true },
    'Ready to Move Office Space':   { type: 'Commercial Complex office', cat: 'Commercial',  confident: true },
    'Co-working Office Space':      { type: 'Co working Office',         cat: 'Commercial',  confident: true },
    'Factory':                      { type: 'Factory',                   cat: 'Commercial',  confident: true },
    'Commercial Land / Inst. Land': { type: 'Commercial Land',           cat: 'Commercial',  confident: true },
    'Industrial Lands / Plots':     { type: 'Industrial Land/Plot',      cat: 'Commercial',  confident: true },
    'Commercial Showrooms':         { type: 'Open Market Showroom',      cat: 'Commercial',  confident: false },
    'Guest-House / Banquet-Halls':  { type: 'Guest House',               cat: 'Commercial',  confident: false },
    'Agricultural Land':            { type: 'Agriculture Land/Orchard',  cat: 'Commercial',  confident: true },
    'WareHouse':                    { type: 'ware House',                cat: 'Commercial',  confident: true },
    'Hotel / Resorts':              { type: 'Hotel',                     cat: 'Commercial',  confident: false },
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
    const resolved: Record<string, { id: string | null; confident: boolean }> = {};
    for (const [fptName, m] of Object.entries(MAP)) {
        resolved[fptName] = { id: await nodeIdFor(m.type, m.cat), confident: m.confident };
        if (!resolved[fptName].id) console.log(`!! NO NODE for "${m.type}" (${m.cat}) — mapped from "${fptName}"`);
    }

    const fpts = await prisma.flatPropertyType.findMany({ select: { id: true, name: true } });
    const fptName: Record<string, string> = Object.fromEntries(fpts.map((f) => [f.id, f.name]));

    const invs = await prisma.inventory.findMany({ select: { id: true, flat_property_type_id: true } });
    const stats: Record<string, { mapped: number; flagged: number }> = {};
    let unmapped = 0, willWrite = 0;
    for (const inv of invs) {
        const name = inv.flat_property_type_id ? fptName[inv.flat_property_type_id] : null;
        const r = name ? resolved[name] : undefined;
        if (!r || !r.id) { unmapped++; continue; }
        const flagged = !r.confident;
        stats[name!] = stats[name!] || { mapped: 0, flagged: 0 };
        stats[name!].mapped++; if (flagged) stats[name!].flagged++;
        willWrite++;
        if (!DRY) {
            await prisma.inventory.update({
                where: { id: inv.id },
                data: { taxonomy_node_id: r.id, needs_taxonomy_review: flagged },
            });
        }
    }
    console.log(DRY ? '--- DRY RUN (no writes) ---' : '--- APPLIED ---');
    Object.entries(stats).sort((a, b) => b[1].mapped - a[1].mapped)
        .forEach(([k, v]) => console.log(String(v.mapped).padStart(4), k, v.flagged ? `(flagged ${v.flagged})` : ''));
    const flaggedTotal = Object.values(stats).reduce((s, v) => s + v.flagged, 0);
    console.log(`TOTAL inventory=${invs.length} willWrite=${willWrite} unmapped=${unmapped} flaggedTotal=${flaggedTotal}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
