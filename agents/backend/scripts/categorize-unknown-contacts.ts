/**
 * One-shot: categorize the UNKNOWN contact bucket.
 *
 * Based on the 2026-05-12 deep-profile that confirmed all UNKNOWN contacts with
 * any real engagement are demand-side (zero key holders, zero owners, zero
 * sellers in the DB). Plan:
 *
 *   (A) Contacts with intent='rent'           → TENANT
 *   (B) Other contacts with activity          → BUYER
 *        (activity = interactions, leads, demand_transactions, scheduled_visits)
 *   (C) Named, no activity                    → left as UNKNOWN, listed for manual review
 *   (D) Anonymous, no activity                → backed up to JSON, then deleted
 *
 * Modes:
 *   --dry-run  (default)  list what would happen, no DB mutations
 *   --execute             actually perform mutations (with backup file for D)
 *
 * Backup file written to `agents/backend/scripts/.phase5-backup-<timestamp>.json`
 * before any deletion. Restoration is `prisma.contact.createMany(JSON.parse(backup))`.
 */

import * as fs from 'fs';
import * as path from 'path';
import prisma from '../src/db';

const EXECUTE = process.argv.includes('--execute');

(async () => {
    const all = await prisma.contact.findMany({
        where: { contact_type: 'UNKNOWN' },
        select: {
            phone_number: true,
            name: true,
            email: true,
            source: true,
            intent: true,
            lead_status: true,
            lifecycle_stage: true,
            assigned_agent_id: true,
            referral_partner_id: true,
            tenant_id: true,
            created_at: true,
            _count: {
                select: {
                    interactions: true,
                    leads: true,
                    demand_transactions: true,
                    scheduled_visits: true,
                    appointments: true,
                    key_holder_properties: true,
                    owned_properties: true,
                    supply_transactions: true,
                    builder_leads: true,
                },
            },
        },
    });

    console.log(`\n=== Phase 5: categorize-unknown-contacts (${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}) ===`);
    console.log(`Total UNKNOWN contacts: ${all.length}\n`);

    // Safety net: if ANY of these has a key_holder / owner / supply relationship, abort.
    // The 2026-05-12 deep-profile said 0 of each, but verify before mutating.
    const supplySide = all.filter((c) =>
        c._count.key_holder_properties > 0 ||
        c._count.owned_properties > 0 ||
        c._count.supply_transactions > 0 ||
        c._count.builder_leads > 0,
    );
    if (supplySide.length > 0) {
        console.error('!! ABORTING: found contacts with supply-side activity. They should not be auto-categorized as BUYER/TENANT.');
        for (const c of supplySide) {
            console.error(`   ${c.name ?? '(unnamed)'} (${c.phone_number}) — keys=${c._count.key_holder_properties} owned=${c._count.owned_properties} supply=${c._count.supply_transactions} builder=${c._count.builder_leads}`);
        }
        await prisma.$disconnect();
        process.exit(1);
    }

    const activity = (c: typeof all[number]) =>
        c._count.interactions > 0 ||
        c._count.leads > 0 ||
        c._count.demand_transactions > 0 ||
        c._count.scheduled_visits > 0 ||
        c._count.appointments > 0;

    const toTenant = all.filter((c) => c.intent === 'rent' && activity(c));
    // BUYER = activity AND intent != 'rent' (intent 'buy' or null/anything else)
    const toBuyer = all.filter((c) => c.intent !== 'rent' && activity(c));
    // Named-no-activity = has a name, no activity
    const namedNoActivity = all.filter((c) => c.name && c.name.trim().length > 0 && !activity(c));
    // Anonymous-no-activity = no name, no activity
    const anonymousNoActivity = all.filter((c) => (!c.name || c.name.trim().length === 0) && !activity(c));

    console.log(`Plan:`);
    console.log(`  → TENANT (intent=rent + activity):       ${toTenant.length}`);
    console.log(`  → BUYER  (activity, non-rent intent):    ${toBuyer.length}`);
    console.log(`  → KEEP as UNKNOWN (named, no activity):  ${namedNoActivity.length}  (manual review list emitted below)`);
    console.log(`  → DELETE (anonymous, no activity):       ${anonymousNoActivity.length}  (backup written before delete)`);
    console.log(`  Sum: ${toTenant.length + toBuyer.length + namedNoActivity.length + anonymousNoActivity.length} (must equal ${all.length})`);

    if (toTenant.length + toBuyer.length + namedNoActivity.length + anonymousNoActivity.length !== all.length) {
        console.error('!! Buckets do not sum to total. Inspect filter logic. Aborting.');
        await prisma.$disconnect();
        process.exit(1);
    }

    // Always emit the manual-review list so you can verify
    console.log(`\n--- Manual-review list (${namedNoActivity.length} named, no activity) ---`);
    for (const c of namedNoActivity) {
        console.log(`  ${(c.name ?? '').padEnd(32)} | ${c.source.padEnd(20)} | ${c.phone_number}${c.email ? ' | ' + c.email : ''}`);
    }

    console.log(`\n--- Anonymous junk preview (${anonymousNoActivity.length}) ---`);
    for (const c of anonymousNoActivity) {
        console.log(`  (unnamed) | ${c.source.padEnd(20)} | ${c.phone_number} | created ${c.created_at.toISOString()}`);
    }

    if (!EXECUTE) {
        console.log('\n[dry-run] no DB changes made. Re-run with --execute to apply.');
        await prisma.$disconnect();
        process.exit(0);
    }

    // ==== MUTATIONS (--execute) ====

    // 1. Backup the anonymous junk before delete
    const backupPath = path.join(__dirname, `.phase5-backup-${Date.now()}.json`);
    const backupRows = anonymousNoActivity.map((c) => ({
        phone_number: c.phone_number,
        name: c.name,
        email: c.email,
        source: c.source,
        intent: c.intent,
        lead_status: c.lead_status,
        lifecycle_stage: c.lifecycle_stage,
        assigned_agent_id: c.assigned_agent_id,
        tenant_id: c.tenant_id,
        created_at: c.created_at,
    }));
    fs.writeFileSync(backupPath, JSON.stringify(backupRows, null, 2));
    console.log(`\n[execute] wrote backup of ${backupRows.length} anonymous rows to ${backupPath}`);

    // 2. Apply categorizations
    const buyerPhones = toBuyer.map((c) => c.phone_number);
    const tenantPhones = toTenant.map((c) => c.phone_number);
    const deletePhones = anonymousNoActivity.map((c) => c.phone_number);

    const buyerResult = buyerPhones.length > 0
        ? await prisma.contact.updateMany({
            where: { phone_number: { in: buyerPhones } },
            data: { contact_type: 'BUYER' },
        })
        : { count: 0 };
    console.log(`[execute] BUYER updates: ${buyerResult.count}`);

    const tenantResult = tenantPhones.length > 0
        ? await prisma.contact.updateMany({
            where: { phone_number: { in: tenantPhones } },
            data: { contact_type: 'TENANT' },
        })
        : { count: 0 };
    console.log(`[execute] TENANT updates: ${tenantResult.count}`);

    // 3. Delete anonymous junk
    if (deletePhones.length > 0) {
        try {
            const deleted = await prisma.contact.deleteMany({ where: { phone_number: { in: deletePhones } } });
            console.log(`[execute] DELETED anonymous rows: ${deleted.count}`);
        } catch (e: any) {
            console.error(`[execute] delete failed (likely FK refs from elsewhere): ${e.message}`);
            console.error(`[execute] backup at ${backupPath} is intact. Categorization changes above are committed.`);
        }
    }

    // 4. Verify
    const remainingUnknown = await prisma.contact.count({ where: { contact_type: 'UNKNOWN' } });
    const buyerCount = await prisma.contact.count({ where: { contact_type: 'BUYER' } });
    const tenantCount = await prisma.contact.count({ where: { contact_type: 'TENANT' } });
    const totalContacts = await prisma.contact.count();
    console.log(`\n[verify] BUYER total now: ${buyerCount}`);
    console.log(`[verify] TENANT total now: ${tenantCount}`);
    console.log(`[verify] UNKNOWN remaining: ${remainingUnknown} (expected = ${namedNoActivity.length})`);
    console.log(`[verify] Total contacts: ${totalContacts}`);

    await prisma.$disconnect();
})();
