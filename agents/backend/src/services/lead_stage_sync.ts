/**
 * Lead stage ← deal stage (2026-08-09).
 *
 * `contacts.lifecycle_stage` (what the Leads page shows) and `transactions.status` (what the Deal
 * Pipeline shows) were two independent fields with nothing connecting them, so moving a deal
 * NEW → QUALIFIED never reached the lead. 52% of single-deal leads disagreed on prod.
 *
 * The deal is the source of truth: it has a validated state machine, the lead's stage dropdown has
 * no validation at all. Every stage write now derives from the deal.
 *
 * 🔴 The two vocabularies are IDENTICAL, so this is a copy, not a translation:
 * frontend `LIFECYCLE_STAGES` == the 9 non-deprecated `TransactionStatus` values. `MATCHED` is the
 * deprecated 10th and only appears on legacy rows.
 */
import type { TransactionStatus } from '@prisma/client';

export type DealStageRow = { status: TransactionStatus; updated_at: Date };

/** Terminal states — a deal here is finished, not being worked. */
const CLOSED: string[] = ['CLOSED_WON', 'CLOSED_LOST'];

/**
 * How far along an OPEN deal is. Higher wins when a lead has several.
 * ON_HOLD sits at the bottom: it is paused work, so any genuinely active deal describes the lead
 * better. MATCHED is the deprecated alias of QUALIFIED and ranks with it.
 */
const OPEN_RANK: Record<string, number> = {
    ON_HOLD: 0,
    NEW: 1,
    QUALIFIED: 2,
    MATCHED: 2,
    MATCHING_APPOINTMENT: 2,
    VISIT_SCHEDULED: 3,
    VISITED: 4,
    NEGOTIATION: 5,
};

/**
 * The stage the lead SHOULD show, given all of its deals.
 *
 * Rule — the most-advanced OPEN deal wins; if every deal is closed, the most recently updated one.
 * Derived from the real data rather than invented: of the 14 leads on prod with more than one deal,
 * 13 are "one live deal + one older CLOSED_LOST", and in every case the live deal is the one that
 * describes where the lead actually is.
 *
 * Returns `null` when the lead has no deals — 399 contacts on prod, almost all LANDLORD or
 * PARTNER_AGENT (supply side). Callers must leave `lifecycle_stage` untouched for those rather
 * than defaulting it to anything.
 */
export function pickGoverningDeal<T extends DealStageRow>(deals: T[]): T | null {
    if (!deals || deals.length === 0) return null;

    const open = deals.filter((d) => !CLOSED.includes(String(d.status)));
    if (open.length > 0) {
        return open.reduce((best, d) =>
            (OPEN_RANK[String(d.status)] ?? 0) > (OPEN_RANK[String(best.status)] ?? 0) ? d : best
        );
    }

    return deals.reduce((best, d) => (d.updated_at > best.updated_at ? d : best));
}

export function deriveLeadStage(deals: DealStageRow[]): string | null {
    const governing = pickGoverningDeal(deals);
    return governing ? (governing.status as string) : null;
}

/**
 * Apply a stage edit made on the LEAD page.
 *
 * Phase 3 (2026-08-09). The lead's Lifecycle Stage dropdown used to write `lifecycle_stage`
 * directly, which meant a user could set a stage that instantly contradicted the deal — exactly
 * the divergence phases 1 and 2 removed. Now the edit drives the deal, and the sync hook inside
 * transitionTransaction writes the lead stage back.
 *
 * Returns `{ handled: false }` when the lead has no deal, and the caller should then write
 * `lifecycle_stage` itself — that is the only remaining direct writer, and it covers the 399
 * supply-side contacts (LANDLORD / PARTNER_AGENT) that legitimately have no pipeline.
 *
 * Throws ValidationError (400) for an illegal transition, carrying the state machine's own
 * "Valid next: [...]" message, so the lead page reports the same thing the Deal Pipeline does.
 */
export async function applyLeadStageEdit(opts: {
    phone: string;
    requestedStage: string;
    actorId: string;
    channel?: string;
}): Promise<{ handled: boolean }> {
    // Imported lazily: transaction_state_machine imports THIS module for the sync hook, so a
    // static import here would be a require cycle. Matches how the codebase already reaches the
    // state machine from routes/services.
    const prisma = (await import('../db')).default;

    const deals = await prisma.transaction.findMany({
        where: { demand_contact_id: opts.phone },
        select: { id: true, status: true, updated_at: true },
    });
    const governing = pickGoverningDeal(deals);
    if (!governing) return { handled: false };

    if (String(governing.status) === opts.requestedStage) return { handled: true }; // no-op

    const { transitionTransaction } = await import('./transaction_state_machine');
    await transitionTransaction(
        governing.id,
        opts.requestedStage as any,
        opts.actorId,
        opts.channel || 'admin',
        { reason: 'Stage changed from the lead page', source: 'lead_page' },
    );
    return { handled: true };
}

/**
 * Recompute and persist a lead's stage from ALL of its deals.
 *
 * Needed because deal CREATION is not a transition, so the hook inside
 * transitionTransaction never fires for it. Two creators can start a deal at a non-NEW
 * status — deal_service.ts opens TEAM_MEMBER-sourced deals straight at QUALIFIED, and
 * ensure_deal.ts takes the status as an argument — and those leads were left behind.
 * Found live on 2026-08-10, one day after the backfill: a deal born QUALIFIED sat against
 * a lead still showing NEW.
 *
 * Also correct for deals created at NEW: if the contact was CLOSED_LOST from an earlier
 * deal, a fresh open deal legitimately pulls the lead back to NEW.
 *
 * Pass the transaction client so the write is atomic with the create.
 */
export async function syncLeadStageForContact(
    phone: string,
    client?: { transaction: { findMany: Function }; contact: { update: Function } } | any,
): Promise<string | null> {
    const db = client || (await import('../db')).default;
    const deals = await db.transaction.findMany({
        where: { demand_contact_id: phone },
        select: { status: true, updated_at: true },
    });
    const stage = deriveLeadStage(deals);
    if (!stage) return null;
    await db.contact.update({ where: { phone_number: phone }, data: { lifecycle_stage: stage } });
    return stage;
}
