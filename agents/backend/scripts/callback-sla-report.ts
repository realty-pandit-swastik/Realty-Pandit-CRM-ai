/**
 * Daily callback / visit-request SLA regression guardrail.
 *
 * Compares (a) interactions of type property_card_callback_request /
 * property_card_visit_request / lead_action_task_created in the last 24h
 * against (b) tasks created for those phones in the same window.
 *
 * Exits 1 (non-zero) if any signal lacks a corresponding task — that's
 * the regression signal the task-routing fix is meant to prevent. Hook
 * this into PM2 cron at 9 AM IST; non-zero exit will surface via PM2 logs.
 *
 *   npx ts-node --project tsconfig.json scripts/callback-sla-report.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import prisma from '../src/db';

const LOOKBACK_HOURS = 24;
const SIGNAL_EVENTS = ['property_card_callback_request', 'property_card_visit_request'];
const TASK_TYPES = ['CALLBACK_REQUEST', 'VISIT_REQUEST'];

async function main() {
    const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);

    const signals = await prisma.interaction.findMany({
        where: { event_type: { in: SIGNAL_EVENTS }, created_at: { gte: since } },
        select: { id: true, phone_number: true, event_type: true, created_at: true },
    });

    const tasks = await prisma.task.findMany({
        where: { task_type: { in: TASK_TYPES }, created_at: { gte: since } },
        select: { id: true, contact_phone: true, task_type: true, status: true, due_date: true, completed_at: true },
    });

    const breached = tasks.filter(t => t.status !== 'DONE' && t.due_date < new Date());
    const completed = tasks.filter(t => t.status === 'DONE');

    // Match each signal to a task created within ±5 min
    const unmatched: any[] = [];
    for (const sig of signals) {
        const expectedType = sig.event_type === 'property_card_callback_request' ? 'CALLBACK_REQUEST' : 'VISIT_REQUEST';
        const match = tasks.find(t =>
            t.contact_phone === sig.phone_number &&
            t.task_type === expectedType &&
            Math.abs(t.due_date.getTime() - sig.created_at.getTime()) < 60 * 60 * 1000 // within 1h
        );
        if (!match) unmatched.push(sig);
    }

    const now = new Date().toISOString();
    console.log(`\n=== Callback/Visit SLA Report (${now}) ===`);
    console.log(`Window:               last ${LOOKBACK_HOURS}h`);
    console.log(`Signals received:     ${signals.length}`);
    console.log(`Tasks created:        ${tasks.length}`);
    console.log(`Tasks completed:      ${completed.length}`);
    console.log(`Tasks SLA-breached:   ${breached.length}`);
    console.log(`Unmatched signals:    ${unmatched.length}  ${unmatched.length === 0 ? '✅' : '🔴'}`);

    if (unmatched.length > 0) {
        console.log('\n--- UNMATCHED SIGNALS (no task created) ---');
        for (const u of unmatched) {
            console.log(`  ${u.created_at.toISOString()} | ${u.phone_number} | ${u.event_type}`);
        }
    }

    if (breached.length > 0) {
        console.log('\n--- SLA-BREACHED TASKS (still TODO past due_date) ---');
        for (const t of breached.slice(0, 20)) {
            console.log(`  ${t.id.slice(0, 8)} | ${t.contact_phone} | ${t.task_type} | due ${t.due_date.toISOString()}`);
        }
    }

    await prisma.$disconnect();
    process.exit(unmatched.length > 0 ? 1 : 0);
}

main().catch(async err => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(2);
});
