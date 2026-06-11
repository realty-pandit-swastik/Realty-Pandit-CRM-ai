/**
 * Backfill: set inventory.assigned_agent_id = uploaded_by_agent_id where null.
 *
 * 2026-05-13: 99 of 341 inventories had no inventory manager assigned because
 * 5 ingestion paths (admin, public partner, AI sales agent, workflow engine,
 * team bulk import) wrote `uploaded_by_agent_id` but skipped
 * `assigned_agent_id`. The Prisma client extension in `src/db.ts` plugs the
 * leak for all future inserts; this script repairs existing orphans.
 *
 *   npx ts-node --project tsconfig.json --transpile-only scripts/backfill-inventory-orphans.ts --dry-run
 *   npx ts-node --project tsconfig.json --transpile-only scripts/backfill-inventory-orphans.ts --execute
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import prisma from '../src/db';

const DRY_RUN = !process.argv.includes('--execute');

async function main() {
    console.log(`\n=== Inventory orphan backfill ===\nMode: ${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}\n`);

    const orphans = await prisma.inventory.findMany({
        where: { assigned_agent_id: null, uploaded_by_agent_id: { not: null } },
        select: { id: true, display_id: true, uploaded_by_agent_id: true, upload_source: true, status: true },
    });

    console.log(`Found ${orphans.length} inventories with null assigned_agent_id but a known uploader.`);
    console.log();

    if (orphans.length === 0) {
        await prisma.$disconnect();
        return;
    }

    const sample = orphans.slice(0, 5);
    console.log('Sample:');
    for (const o of sample) {
        console.log(`  ${o.display_id || o.id.slice(0, 8)} | source=${o.upload_source} | status=${o.status} | uploader=${o.uploaded_by_agent_id?.slice(0, 8)}`);
    }

    if (DRY_RUN) {
        console.log(`\nWould update ${orphans.length} rows. Re-run with --execute.`);
        await prisma.$disconnect();
        return;
    }

    const result = await prisma.$executeRaw`
        UPDATE inventory
        SET assigned_agent_id = uploaded_by_agent_id, updated_at = NOW()
        WHERE assigned_agent_id IS NULL AND uploaded_by_agent_id IS NOT NULL
    `;
    console.log(`\nUpdated ${result} rows.`);

    // Verify
    const remaining = await prisma.inventory.count({ where: { assigned_agent_id: null } });
    console.log(`Remaining orphans: ${remaining}`);

    await prisma.$disconnect();
}

main().catch(async (err) => { console.error(err); await prisma.$disconnect(); process.exit(1); });
