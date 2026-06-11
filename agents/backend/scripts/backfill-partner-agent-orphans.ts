/**
 * Backfill: create PartnerAgent rows for Contact rows that are
 * `contact_type='PARTNER_AGENT'` but missing from the `partner_agents` table.
 *
 * 2026-05-14: workflow_engine.ts auto-registered external key-holders as
 * PARTNER_AGENT contacts since 2026-03-13 but never created the matching
 * `partner_agents` row — so the admin Partner Agents page silently hid
 * 13 real partners (dealers like "Sachin khanna boulward", "Anuj Bhatnagar",
 * "Saurav Roy" etc.). Upstream code in `workflows/workflow_engine.ts` is now
 * fixed; this script repairs the historical orphans.
 *
 *   npx ts-node --transpile-only scripts/backfill-partner-agent-orphans.ts --dry-run
 *   npx ts-node --transpile-only scripts/backfill-partner-agent-orphans.ts --execute
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import prisma from '../src/db';
import { ensurePartnerAgent } from '../src/services/partner_auto_create';

const DRY_RUN = !process.argv.includes('--execute');

async function main() {
    console.log(`\n=== PartnerAgent orphan backfill ===\nMode: ${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}\n`);

    // Find a super_boss to set as the managing_agent_id for the new partner rows
    const superBoss = await prisma.agent.findFirst({
        where: { role: 'super_boss', status: 'active' },
        select: { id: true, name: true },
        orderBy: { created_at: 'asc' },
    });
    if (!superBoss) {
        console.error('No active super_boss found — cannot set managing_agent_id. Aborting.');
        process.exit(1);
    }
    console.log(`Managing agent (for missing assignments): ${superBoss.name} (${superBoss.id})\n`);

    // Find PARTNER_AGENT contacts NOT in partner_agents
    const orphans = await prisma.$queryRaw<Array<{
        phone_number: string; name: string | null; source: string; created_at: Date;
    }>>`
        SELECT c.phone_number, c.name, c.source, c.created_at
        FROM contacts c
        LEFT JOIN partner_agents pa ON pa.phone_number = c.phone_number
        WHERE c.contact_type = 'PARTNER_AGENT' AND pa.id IS NULL
        ORDER BY c.created_at DESC;
    `;

    console.log(`Found ${orphans.length} PARTNER_AGENT contacts missing from partner_agents.\n`);

    if (orphans.length === 0) {
        await prisma.$disconnect();
        return;
    }

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const o of orphans) {
        const date = o.created_at.toISOString().slice(0, 10);
        const summary = `${o.phone_number} | ${o.name || '(unnamed)'} | source=${o.source} | first_seen=${date}`;
        if (DRY_RUN) {
            console.log(`  WOULD  ${summary}`);
            created++;
            continue;
        }
        try {
            const r = await ensurePartnerAgent(
                o.phone_number,
                o.name || 'External Dealer',
                'default', // single-tenant CRM
                superBoss.id,
            );
            console.log(`  ${r.wasCreated ? 'OK    ' : 'SKIP  '} ${summary} → ${r.partnerId.slice(0, 8)}`);
            if (r.wasCreated) created++;
            else skipped++;
        } catch (err: any) {
            console.log(`  FAIL  ${summary} — ${err.message}`);
            failed++;
        }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Total orphans:    ${orphans.length}`);
    console.log(`${DRY_RUN ? 'Would create' : 'Created'}:       ${created}`);
    console.log(`Already existed (race):  ${skipped}`);
    console.log(`Failed:           ${failed}`);

    if (!DRY_RUN) {
        // Verify remaining count
        const remaining = await prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*)::bigint AS count
            FROM contacts c
            LEFT JOIN partner_agents pa ON pa.phone_number = c.phone_number
            WHERE c.contact_type = 'PARTNER_AGENT' AND pa.id IS NULL;
        `;
        console.log(`Remaining orphans after backfill: ${remaining[0]?.count}`);
    }

    await prisma.$disconnect();
}

main().catch(async (err) => { console.error(err); await prisma.$disconnect(); process.exit(1); });
