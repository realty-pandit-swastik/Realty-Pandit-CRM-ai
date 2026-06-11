/**
 * Re-trigger AI cadence for stuck NEW deals and re-run shareNextProperty
 * for QUALIFIED deals that got NOMATCH before the matching engine fix.
 *
 * Run: npx ts-node --project tsconfig.json scripts/retrigger_stuck_deals.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import prisma from '../src/db';
import { shareNextProperty } from '../src/services/property_sharing';

// 4 NEW deals stuck with 0 call attempts
const NEW_DEAL_IDS = [
    '58460984-3268-423b-bc33-3ceb9ee3e29b',
    '29da285c-e785-4929-aa54-0c512e03ba60',
    '5a269ec3-508b-45b8-998f-fbcaa3f0a407',
    '8021f0e3-0560-446b-85e7-09d3c5698ea8',
];

// 2 QUALIFIED deals that were NOMATCH before the matching engine fix
// de83a070: "Sector 4 & 5 Vaisali" location — broadenLocation fix
// 1c68099e: NULL intent + 14K-20K budget — rent inference fix
const QUALIFIED_DEAL_IDS = [
    'de83a070-ac03-4032-979e-95a11adcd594',
    '1c68099e-f395-4065-b7fa-61c88a6437b5',
];

async function retriggerNewDeals() {
    console.log('\n=== Re-triggering AI call cadence for stuck NEW deals ===\n');

    for (const id of NEW_DEAL_IDS) {
        try {
            const deal = await prisma.transaction.findUnique({
                where: { id },
                select: { id: true, status: true, demand_contact: { select: { name: true, phone_number: true } } },
            });

            if (!deal) {
                console.log(`  SKIP   ${id.slice(0, 8)} — not found`);
                continue;
            }
            if (deal.status !== 'NEW') {
                console.log(`  SKIP   ${id.slice(0, 8)} — status is ${deal.status} (not NEW)`);
                continue;
            }

            const { scheduleQualificationCall } = await import('../src/services/lead_qualification_caller');
            await scheduleQualificationCall(id, 0);
            console.log(`  OK     ${id.slice(0, 8)} — cadence re-triggered for ${deal.demand_contact?.name || 'unknown'} (${deal.demand_contact?.phone_number})`);
        } catch (e: any) {
            console.error(`  ERROR  ${id.slice(0, 8)} — ${e.message}`);
        }
    }
}

async function retriggerQualifiedSharing() {
    console.log('\n=== Re-running shareNextProperty for NOMATCH QUALIFIED deals ===\n');

    for (const id of QUALIFIED_DEAL_IDS) {
        try {
            const deal = await prisma.transaction.findUnique({
                where: { id },
                select: { id: true, status: true, demand_contact: { select: { name: true, phone_number: true } } },
            });

            if (!deal) {
                console.log(`  SKIP   ${id.slice(0, 8)} — not found`);
                continue;
            }
            if (deal.status !== 'QUALIFIED') {
                console.log(`  SKIP   ${id.slice(0, 8)} — status is ${deal.status} (not QUALIFIED)`);
                continue;
            }

            const result = await shareNextProperty(id);
            if (result) {
                console.log(`  SHARED ${id.slice(0, 8)} — sent "${result}" to ${deal.demand_contact?.phone_number}`);
            } else {
                console.log(`  NOMATCH ${id.slice(0, 8)} — still no match for ${deal.demand_contact?.name} (${deal.demand_contact?.phone_number})`);
            }
        } catch (e: any) {
            console.error(`  ERROR  ${id.slice(0, 8)} — ${e.message}`);
        }
    }
}

async function main() {
    await retriggerNewDeals();
    await retriggerQualifiedSharing();
    await prisma.$disconnect();
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
