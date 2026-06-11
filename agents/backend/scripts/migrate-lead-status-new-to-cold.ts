/**
 * One-shot data migration: flip Contact rows with the bogus `lead_status='NEW'`
 * to the schema default `'cold'`.
 *
 * Why: 'NEW' is a lifecycle_stage value, NOT a lead_status value. The workflow
 * engine accidentally wrote it during LANDLORD/PARTNER_AGENT creation for ~12
 * records. Bug D fixed the writer; this flushes the residue.
 *
 * Idempotent: re-running on a clean DB transfers 0 rows.
 *
 * Run:
 *   node -r ts-node/register/transpile-only scripts/migrate-lead-status-new-to-cold.ts
 */

import prisma from '../src/db';

(async () => {
    const before = await prisma.contact.count({ where: { lead_status: 'NEW' } });
    console.log(`[migrate] found ${before} contacts with lead_status='NEW'`);

    if (before === 0) {
        console.log('[migrate] nothing to do');
        await prisma.$disconnect();
        process.exit(0);
    }

    const sample = await prisma.contact.findMany({
        where: { lead_status: 'NEW' },
        select: { phone_number: true, name: true, contact_type: true, source: true },
        take: 20,
    });
    console.log('[migrate] sample rows:');
    for (const c of sample) {
        console.log(`  ${(c.name || '(unnamed)').padEnd(28)} | ${c.contact_type.padEnd(15)} | ${c.source.padEnd(15)} | ${c.phone_number}`);
    }

    const r = await prisma.contact.updateMany({
        where: { lead_status: 'NEW' },
        data: { lead_status: 'cold' },
    });
    console.log(`[migrate] flipped ${r.count} rows: 'NEW' -> 'cold'`);

    const after = await prisma.contact.count({ where: { lead_status: 'NEW' } });
    console.log(`[migrate] verification — remaining 'NEW' rows: ${after}`);
    await prisma.$disconnect();
})();
