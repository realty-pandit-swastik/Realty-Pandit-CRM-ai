/**
 * De-duplicate the Configuration (schema_fields) screen vs the dedicated workflow steps.
 * Per approved plan (2026-05-24):
 *   - Detach `status` (Construction Status) from ALL TYPE nodes — the dedicated
 *     Construction step owns construction status/age.
 *   - Detach `area-type` (Super/Built-up/Carpet) from ALL TYPE nodes — the dedicated
 *     Area step owns the area (number + unit).
 *   - Detach `plot-area` from NON-land/plot types — keep it only where it makes sense
 *     (land/plots + independent houses/villas/farmhouses that sit on a plot).
 *
 * Detaches = delete the NodeField rows (FieldDefinition kept; reversible by re-seed).
 * Snapshot tables (node_fields_bak_*) already exist from the earlier cleanup. Idempotent.
 *
 *   DRY RUN: npx ts-node --transpile-only prisma/dedup_config_fields.ts --dry-run
 *   APPLY:   npx ts-node --transpile-only prisma/dedup_config_fields.ts
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry-run');
// Land/Plot subcategories + independent dwellings on a plot. Avoids matching the bare
// word "house" (which wrongly caught Penthouse / Guest House / Warehouse).
const LAND_RE = /land|plot|independent house|villa|kothi|banglow|bunglow|farm|orchard/i;

async function ancestorNames(nodeId: string): Promise<string[]> {
    const names: string[] = [];
    let cur = await prisma.taxonomyNode.findUnique({ where: { id: nodeId }, select: { name: true, parent_id: true } });
    while (cur) { names.push(cur.name); cur = cur.parent_id ? await prisma.taxonomyNode.findUnique({ where: { id: cur.parent_id }, select: { name: true, parent_id: true } }) : null; }
    return names;
}

async function main() {
    const fields = await prisma.fieldDefinition.findMany({ where: { key: { in: ['status', 'area-type', 'plot-area'] } }, select: { id: true, key: true } });
    const idByKey: Record<string, string> = Object.fromEntries(fields.map((f) => [f.key, f.id]));

    // status + area-type → detach from ALL nodes
    let statusDel = 0, areaTypeDel = 0;
    if (idByKey['status']) {
        const c = await prisma.nodeField.count({ where: { field_id: idByKey['status'] } });
        statusDel = c; if (!DRY) await prisma.nodeField.deleteMany({ where: { field_id: idByKey['status'] } });
    }
    if (idByKey['area-type']) {
        const c = await prisma.nodeField.count({ where: { field_id: idByKey['area-type'] } });
        areaTypeDel = c; if (!DRY) await prisma.nodeField.deleteMany({ where: { field_id: idByKey['area-type'] } });
    }

    // plot-area → detach from NON-land types only
    let plotKept: string[] = [], plotDetached: string[] = [];
    if (idByKey['plot-area']) {
        const rows = await prisma.nodeField.findMany({ where: { field_id: idByKey['plot-area'] }, select: { id: true, taxonomy_node_id: true } });
        for (const r of rows) {
            const names = await ancestorNames(r.taxonomy_node_id);
            const isLand = names.some((n) => LAND_RE.test(n));
            if (isLand) { plotKept.push(names[0]); }
            else { plotDetached.push(names[0]); if (!DRY) await prisma.nodeField.delete({ where: { id: r.id } }); }
        }
    }

    console.log(DRY ? '--- DRY RUN ---' : '--- APPLIED ---');
    console.log(`status detached=${statusDel} | area-type detached=${areaTypeDel}`);
    console.log(`plot-area KEPT (${plotKept.length}): ${[...new Set(plotKept)].join(', ')}`);
    console.log(`plot-area DETACHED (${plotDetached.length}): ${[...new Set(plotDetached)].join(', ')}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
