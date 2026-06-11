/**
 * One-time migration: merge duplicate Contact records created by the unnormalized
 * savePipecatCallRecord bug (voice calls before the normalizePhone fix on 2026-04-20).
 *
 * Strategy:
 *   1. Find all Contacts whose phone_number does NOT start with "+".
 *   2. For each such duplicate:
 *      a. Compute canonical "+91XXX..." via normalizePhone().
 *      b. If canonical exists → MERGE: relink dependents, delete duplicate.
 *      c. If canonical does NOT exist → RENAME: create canonical with dup's data,
 *         relink dependents, delete duplicate. (Contact.phone_number is a PK,
 *         cannot be updated in place.)
 *   3. Log everything. Default: dry-run (no writes).
 *
 * Usage (run from /var/www/realty-pandit/backend on prod):
 *   npx ts-node scripts/merge_duplicate_contacts.ts           # dry-run
 *   npx ts-node scripts/merge_duplicate_contacts.ts --commit  # apply
 */

import prisma from '../src/db';
import { normalizePhone } from '../src/utils/phone';

const COMMIT = process.argv.includes('--commit');

/**
 * Move every FK that points at Contact.phone_number from `from` to `to`.
 * Uses dynamic FK discovery against information_schema so any table that FKs to
 * contacts.phone_number gets updated — even ones added in future migrations.
 * Handles Owner specially because its contact_phone is @unique AND Inventory.owner_id
 * also points at Owner.id, so we need a coordinated move.
 */
async function relinkAllDependents(tx: any, from: string, to: string): Promise<void> {
    // Special case 1 — Owner. contact_phone is @unique. If canonical already has an
    // Owner, we must move Inventory.owner_id to the canonical's Owner, then delete
    // dup's Owner row. Otherwise we just rename dup's Owner.contact_phone.
    try {
        const dupOwner = await tx.owner.findUnique({ where: { contact_phone: from } });
        if (dupOwner) {
            const canonicalOwner = await tx.owner.findUnique({ where: { contact_phone: to } });
            if (canonicalOwner) {
                await tx.inventory.updateMany({ where: { owner_id: dupOwner.id }, data: { owner_id: canonicalOwner.id } });
                await tx.owner.delete({ where: { id: dupOwner.id } });
            } else {
                await tx.owner.update({ where: { id: dupOwner.id }, data: { contact_phone: to } });
            }
        }
    } catch (e) {
        console.warn(`  owner handling: ${(e as Error).message}`);
    }

    // Dynamic FK discovery: every table that FKs to contacts.phone_number
    const fks: Array<{ table_name: string; column_name: string }> = await tx.$queryRawUnsafe(
        `SELECT tc.table_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
         JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
         WHERE tc.constraint_type = $$FOREIGN KEY$$
           AND ccu.table_name = $$contacts$$
           AND ccu.column_name = $$phone_number$$`
    );

    for (const { table_name, column_name } of fks) {
        if (table_name === 'owners') continue; // handled above

        try {
            await tx.$executeRawUnsafe(
                `UPDATE "${table_name}" SET "${column_name}" = $1 WHERE "${column_name}" = $2`,
                to, from,
            );
        } catch (e: any) {
            const msg = String(e?.message ?? '');
            const isUnique = msg.includes('unique') || msg.includes('23505') || e?.meta?.code === '23505';
            if (isUnique) {
                console.warn(`  ${table_name}.${column_name}: unique collision → deleting dup's row`);
                try {
                    await tx.$executeRawUnsafe(
                        `DELETE FROM "${table_name}" WHERE "${column_name}" = $1`, from,
                    );
                } catch (e2: any) {
                    console.warn(`    delete fallback failed: ${(e2 as Error).message}`);
                }
            } else {
                console.warn(`  ${table_name}.${column_name}: ${msg}`);
            }
        }
    }
}

async function main() {
    const mode = COMMIT ? 'COMMIT' : 'DRY-RUN';
    console.log(`[merge] Running in ${mode} mode`);

    const duplicates = await prisma.contact.findMany({
        where: { NOT: { phone_number: { startsWith: '+' } } },
        select: {
            phone_number: true,
            name: true,
            contact_type: true,
            source: true,
            tenant_id: true,
            created_at: true,
        },
    });

    if (duplicates.length === 0) {
        console.log('[merge] No duplicates found. DB is clean.');
        await prisma.$disconnect();
        return;
    }

    console.log(`[merge] Found ${duplicates.length} contacts without "+" prefix\n`);

    let mergeCount = 0;
    let renameCount = 0;
    let skipCount = 0;

    for (const dup of duplicates) {
        // Skip non-numeric placeholders like "TEMP_1775366252868_d6skn1" — these
        // are from some other import pipeline that owns its own format. We only
        // want to clean up real Indian phone numbers that lost their "+" prefix.
        if (!/^\d/.test(dup.phone_number)) {
            console.warn(`[merge] SKIP: ${dup.phone_number} is not a numeric phone (placeholder/TEMP row)`);
            skipCount++;
            continue;
        }

        const canonical = normalizePhone(dup.phone_number);

        if (!canonical || canonical === dup.phone_number) {
            console.warn(`[merge] SKIP: ${dup.phone_number} could not normalize to a valid +91 form`);
            skipCount++;
            continue;
        }

        const canonicalContact = await prisma.contact.findUnique({
            where: { phone_number: canonical },
            select: { phone_number: true, name: true, contact_type: true },
        });

        // Per-contact stats for reporting
        const [vcCount, iCount, waCount, leadCount, apptCount, taskCount] = await Promise.all([
            prisma.voiceCall.count({ where: { phone_number: dup.phone_number } }),
            prisma.interaction.count({ where: { phone_number: dup.phone_number } }),
            prisma.whatsAppMessage.count({ where: { phone_number: dup.phone_number } }),
            prisma.lead.count({ where: { contact_phone: dup.phone_number } }),
            (prisma as any).appointment.count({ where: { contact_id: dup.phone_number } }),
            prisma.taskFollowup.count({ where: { phone_number: dup.phone_number } }),
        ]);
        let txCount = 0;
        try {
            txCount = await (prisma as any).transaction.count({ where: { demand_contact_id: dup.phone_number } });
        } catch {
            // Transaction model may not have this FK on older schemas; skip gracefully.
        }

        if (canonicalContact) {
            // MERGE
            mergeCount++;
            console.log(
                `[merge] MERGE ${dup.phone_number} → ${canonical}` +
                ` (into: ${canonicalContact.name ?? 'unnamed'}/${canonicalContact.contact_type}) ` +
                `[vc=${vcCount} i=${iCount} wa=${waCount} lead=${leadCount} appt=${apptCount} task=${taskCount} tx=${txCount}]`
            );

            if (COMMIT) {
                await prisma.$transaction(async (tx) => {
                    await relinkAllDependents(tx, dup.phone_number, canonical);
                    await tx.contact.delete({ where: { phone_number: dup.phone_number } });
                });
            }
        } else {
            // RENAME (no canonical twin)
            renameCount++;
            console.log(
                `[merge] RENAME ${dup.phone_number} → ${canonical}` +
                ` (no canonical twin, creating) ` +
                `[vc=${vcCount} i=${iCount} wa=${waCount} lead=${leadCount} appt=${apptCount} task=${taskCount} tx=${txCount}]`
            );

            if (COMMIT) {
                await prisma.$transaction(async (tx) => {
                    await tx.contact.create({
                        data: {
                            phone_number: canonical,
                            tenant_id: dup.tenant_id,
                            name: dup.name,
                            contact_type: dup.contact_type as any,
                            source: dup.source,
                        },
                    });
                    await relinkAllDependents(tx, dup.phone_number, canonical);
                    await tx.contact.delete({ where: { phone_number: dup.phone_number } });
                });
            }
        }
    }

    console.log(`\n[merge] Summary (${mode}):`);
    console.log(`  - merge-into-existing: ${mergeCount}`);
    console.log(`  - rename-in-place:     ${renameCount}`);
    console.log(`  - skipped:             ${skipCount}`);
    console.log(`  - total processed:     ${duplicates.length}`);

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error('[merge] FATAL:', e);
    process.exit(1);
});
