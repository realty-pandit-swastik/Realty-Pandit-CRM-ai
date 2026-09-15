/**
 * Backfill specs.bhk from the inventory slug for active listings missing BHK.
 *
 * Audit 2026-06-11: 89% of active listings had no BHK in specs, so the inventory-page
 * BHK filter returned 0. The slug reliably encodes it ("2bhk-apartment-for-sale-…").
 * This sets specs.bhk (number) + a specs.bhk_source marker on the ~224 recoverable rows.
 *
 * Idempotent — only fills rows with NO existing bhk/rooms/bedrooms/bhk_count (never
 * overwrites a human-entered value). DEFAULT is dry-run; --execute snapshots the table
 * (inventory_bak_<ts>) BEFORE any write (prod backup rule).
 *
 *   npx ts-node --transpile-only scripts/backfill_bhk_from_slug.ts            # dry-run (no writes)
 *   npx ts-node --transpile-only scripts/backfill_bhk_from_slug.ts --execute  # snapshot + write
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import prisma from '../src/db';

const DRY_RUN = !process.argv.includes('--execute');
const SOURCE = 'slug_backfill_2026-06-11';

function norm(s: any): Record<string, any> {
    if (!s) return {};
    if (typeof s === 'string') { try { return JSON.parse(s); } catch { return {}; } }
    return s;
}
function hasBhk(specs: any): boolean {
    const o = norm(specs);
    const r = o.bhk ?? o.rooms ?? o.bedrooms ?? o.bhk_count;
    return r != null && r !== '';
}
function bhkFromSlug(slug?: string | null): number | null {
    const m = (slug || '').match(/(\d+)\s*bhk/i);
    return m ? parseInt(m[1], 10) : null;
}

async function main() {
    console.log(`\n=== Backfill specs.bhk from slug ===`);
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'EXECUTE'}\n`);

    const all = await prisma.inventory.findMany({
        where: { status: 'active' },
        select: { id: true, type: true, slug: true, specs: true },
    });
    const missing = all.filter(i => !hasBhk(i.specs));
    const recoverable = missing.filter(i => bhkFromSlug(i.slug) != null);
    const stuck = missing.filter(i => bhkFromSlug(i.slug) == null);
    const pct = (n: number) => (all.length ? Math.round((n / all.length) * 100) : 0);

    console.log(`active: ${all.length}`);
    console.log(`missing BHK: ${missing.length} (${pct(missing.length)}%)`);
    console.log(`recoverable from slug: ${recoverable.length}`);
    console.log(`not recoverable (left as-is): ${stuck.length}`);

    console.log(`\nSample recoveries (first 15):`);
    recoverable.slice(0, 15).forEach(i =>
        console.log(`  ${i.id.slice(0, 8)}  ${String(i.type || '').padEnd(24)}  ${(i.slug || '').slice(0, 46)}  ->  bhk ${bhkFromSlug(i.slug)}`));

    const byType: Record<string, number> = {};
    for (const i of stuck) byType[i.type || 'null'] = (byType[i.type || 'null'] || 0) + 1;
    console.log(`\nNon-recoverable by type (confirm plots/commercial, not stranded residential):`);
    Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([t, c]) => console.log(`  ${String(c).padStart(3)} x ${t}`));

    if (DRY_RUN) {
        console.log(`\nDRY RUN — would update ${recoverable.length} rows. Re-run with --execute (snapshots first).`);
        return;
    }

    // EXECUTE: snapshot the whole table BEFORE any write.
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12); // YYYYMMDDHHMM
    const snap = `inventory_bak_${ts}`;
    console.log(`\nSnapshotting inventory -> ${snap} ...`);
    await prisma.$executeRawUnsafe(`CREATE TABLE "${snap}" AS SELECT * FROM "inventory"`);
    const cnt = await prisma.$queryRawUnsafe<Array<{ count: number }>>(`SELECT COUNT(*)::int AS count FROM "${snap}"`);
    console.log(`Snapshot ${snap} created with ${cnt[0]?.count} rows.`);

    let updated = 0, failed = 0;
    for (const i of recoverable) {
        const bhk = bhkFromSlug(i.slug)!;
        const merged = { ...norm(i.specs), bhk, bhk_source: SOURCE };
        try {
            await prisma.inventory.update({ where: { id: i.id }, data: { specs: merged } });
            updated++;
        } catch (e) {
            failed++;
            console.error(`  update failed for ${i.id}: ${(e as Error).message}`);
        }
    }
    console.log(`\nEXECUTE complete — updated ${updated}, failed ${failed}. Snapshot: ${snap}.`);
    console.log(`Revert: UPDATE inventory SET specs = specs - 'bhk' - 'bhk_source' WHERE specs->>'bhk_source' = '${SOURCE}';  (or restore from ${snap})`);
}

main()
    .catch(e => { console.error('ERROR', e); process.exitCode = 1; })
    .finally(async () => { await prisma.$disconnect(); process.exit(process.exitCode || 0); });
