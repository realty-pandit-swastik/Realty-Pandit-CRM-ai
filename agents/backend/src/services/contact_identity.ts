import { Prisma } from '@prisma/client';

/**
 * Rename a person everywhere their name is stored, in one transaction:
 *   - contacts.name (PK = phone_number)
 *   - partner_agents.name (same phone)
 *   - denormalized inventory snapshots: uploader_name / key_holder_name
 *
 * Denormalized copies are overwritten ONLY where they still equal the OLD name,
 * so a legitimately different uploader/key-holder name is never clobbered.
 *
 * Added 2026-05-30 — see docs/plans/2026-05-30-editable-contact-partner-names.md
 */
export async function syncContactName(
    tx: Prisma.TransactionClient,
    phone: string,
    oldName: string | null,
    newName: string | null,
): Promise<void> {
    await tx.contact.updateMany({
        where: { phone_number: phone },
        data: { name: newName, updated_at: new Date() },
    });
    await tx.partnerAgent.updateMany({
        where: { phone_number: phone },
        data: { name: newName ?? '' },
    });
    if (oldName) {
        await tx.inventory.updateMany({
            where: { owner_phone: phone, uploader_name: oldName },
            data: { uploader_name: newName },
        });
        await tx.inventory.updateMany({
            where: { owner_phone: phone, key_holder_name: oldName },
            data: { key_holder_name: newName },
        });
    }
}
