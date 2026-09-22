/**
 * ContactShare dual-write helpers (2026-08-09 — phase 4a of the lead-sharing work).
 *
 * `contact_shares` is a real per-person share record: it knows WHEN a teammate received a
 * lead and WHO sent it, neither of which `Contact.shared_with_ids` (a bare string[]) can
 * express. That is what blocks "shared with me, newest first" and any audit of sharing.
 *
 * 🔴 Every caller here writes BOTH the array and this table, and must keep doing so.
 * As of phase 4b the visibility filter and the lead filters READ this table
 * (middleware/contact_visibility.ts, routes/leads.ts), so a lead whose array is updated
 * without a matching row here becomes INVISIBLE to the person it was shared with.
 *
 * Contact.shared_with_ids is still maintained as a synchronised mirror — the list endpoint
 * returns it for the "Shared" badge, and it makes 4b a one-line revert with no data
 * migration. Dropping it is a separate cleanup once 4b has soaked in production.
 *
 * Both helpers are called INSIDE the same `prisma.$transaction` as the array write, so the
 * two representations can never disagree.
 */
import type { Prisma } from '@prisma/client';

/** Accepts either the base client or a transaction client. */
type Tx = Prisma.TransactionClient;

/**
 * REPLACE semantics — make `contact_shares` match `next` exactly for one lead.
 * Mirrors the share endpoint, which posts the whole array rather than a delta.
 *
 * ⚠ `skipDuplicates` is load-bearing, not an optimisation: it leaves an already-shared
 * teammate's row untouched, so their original `shared_at` survives. Without it, re-saving a
 * lead would reset everyone's "received on" date to now and the 4c sort would be meaningless.
 */
export async function syncContactShares(tx: Tx, opts: {
    tenantId: string;
    phone: string;
    next: string[];
    sharedBy?: string | null;
}): Promise<void> {
    const desired = Array.from(new Set((opts.next || []).filter(Boolean)));

    // Un-shared teammates lose the row. Guard the empty case: `notIn: []` matches nothing in
    // Prisma, which would silently keep every row when a lead is un-shared with everyone.
    await tx.contactShare.deleteMany({
        where: {
            phone_number: opts.phone,
            ...(desired.length ? { agent_id: { notIn: desired } } : {}),
        },
    });

    if (!desired.length) return;

    await tx.contactShare.createMany({
        data: desired.map((agent_id) => ({
            tenant_id: opts.tenantId,
            phone_number: opts.phone,
            agent_id,
            shared_by: opts.sharedBy ?? null,
        })),
        skipDuplicates: true,
    });
}

/**
 * APPEND semantics — add one share without disturbing the others.
 * Used by portal re-ingest, which pushes a single agent onto the array.
 *
 * `sharedBy` is null here by design: the sharer is the portal attribution, not a person.
 */
export async function addContactShare(tx: Tx, opts: {
    tenantId: string;
    phone: string;
    agentId: string;
    sharedBy?: string | null;
}): Promise<void> {
    if (!opts.agentId) return;
    await tx.contactShare.createMany({
        data: [{
            tenant_id: opts.tenantId,
            phone_number: opts.phone,
            agent_id: opts.agentId,
            shared_by: opts.sharedBy ?? null,
        }],
        skipDuplicates: true,
    });
}
