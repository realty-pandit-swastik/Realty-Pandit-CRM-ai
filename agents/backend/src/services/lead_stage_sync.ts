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
export function deriveLeadStage(deals: DealStageRow[]): string | null {
    if (!deals || deals.length === 0) return null;

    const open = deals.filter((d) => !CLOSED.includes(String(d.status)));
    if (open.length > 0) {
        return open.reduce((best, d) =>
            (OPEN_RANK[String(d.status)] ?? 0) > (OPEN_RANK[String(best.status)] ?? 0) ? d : best
        ).status as string;
    }

    return deals.reduce((best, d) => (d.updated_at > best.updated_at ? d : best)).status as string;
}
