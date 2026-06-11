/**
 * Backfill missed callback/visit-request tasks.
 *
 * Until 2026-05-12, property_card_reply_handler.ts logged callback/visit
 * button taps as `interactions` rows but never created a follow-up `tasks`
 * row. Lead managers had no actionable surface and 11+ leads went cold.
 *
 * This script scans the last 30 days for `property_card_callback_request`
 * and `property_card_visit_request` interactions that lack a corresponding
 * task, and creates fresh tasks dated today so agents can triage now.
 *
 * Idempotent. Run with --dry-run first to preview.
 *
 *   npx ts-node --project tsconfig.json scripts/backfill-missed-callback-tasks.ts --dry-run
 *   npx ts-node --project tsconfig.json scripts/backfill-missed-callback-tasks.ts --execute
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import prisma from '../src/db';
import { createLeadActionTask, LEAD_ACTION_TASK_TYPES, LeadActionType } from '../src/services/workflow_task_service';

const DRY_RUN = !process.argv.includes('--execute');
const LOOKBACK_DAYS = 30;

const EVENT_TO_ACTION: Record<string, LeadActionType> = {
    property_card_callback_request: LEAD_ACTION_TASK_TYPES.CALLBACK_REQUEST,
    property_card_visit_request: LEAD_ACTION_TASK_TYPES.VISIT_REQUEST,
};

async function main() {
    console.log(`\n=== Backfill missed callback/visit tasks ===`);
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'EXECUTE'}`);
    console.log(`Lookback: ${LOOKBACK_DAYS} days\n`);

    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const tenant = await prisma.tenant.findFirst({ select: { id: true } });
    if (!tenant) {
        console.error('No tenant found — aborting');
        process.exit(1);
    }

    const events = await prisma.interaction.findMany({
        where: {
            event_type: { in: Object.keys(EVENT_TO_ACTION) },
            created_at: { gte: since },
        },
        orderBy: { created_at: 'asc' },
        select: { id: true, phone_number: true, event_type: true, metadata: true, created_at: true },
    });

    console.log(`Found ${events.length} callback/visit interactions in last ${LOOKBACK_DAYS} days\n`);

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const ev of events) {
        const action = EVENT_TO_ACTION[ev.event_type];
        const phone = ev.phone_number;
        const meta = (ev.metadata as any) || {};

        // Skip if a task of same type already exists for this phone (any age)
        const existing = await prisma.task.findFirst({
            where: { contact_phone: phone, task_type: action },
            select: { id: true, created_at: true, status: true },
        });
        if (existing) {
            console.log(`  SKIP   ${phone} ${action} — task ${existing.id.slice(0, 8)} already exists (${existing.status}, ${existing.created_at.toISOString().slice(0, 10)})`);
            skipped++;
            continue;
        }

        const contact = await prisma.contact.findUnique({
            where: { phone_number: phone },
            select: { name: true, assigned_agent_id: true },
        });

        const summary = `${ev.created_at.toISOString().slice(0, 10)} → ${action} | ${phone} | ${contact?.name || '(unnamed)'} | agent=${contact?.assigned_agent_id?.slice(0, 8) || 'NONE→super_boss'}`;

        if (DRY_RUN) {
            console.log(`  WOULD  ${summary}`);
            created++;
            continue;
        }

        const task = await createLeadActionTask({
            phone,
            action,
            tenantId: tenant.id,
            propertyId: meta.inventory_id,
            dealId: meta.deal_id,
            sourceChannel: 'backfill',
            rawNote: `Backfilled from ${ev.created_at.toISOString().slice(0, 10)} ${ev.event_type} — original signal predated task-routing fix. Call lead to recover.`,
        });
        if (task) {
            console.log(`  OK     ${summary} → task ${task.id.slice(0, 8)}`);
            created++;
        } else {
            console.log(`  FAIL   ${summary}`);
            failed++;
        }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Total events:    ${events.length}`);
    console.log(`Tasks ${DRY_RUN ? 'would create' : 'created'}: ${created}`);
    console.log(`Skipped (dupe):  ${skipped}`);
    console.log(`Failed:          ${failed}`);
    console.log();
    if (DRY_RUN) console.log('Re-run with --execute to apply.\n');

    await prisma.$disconnect();
}

main().catch(async err => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
});
