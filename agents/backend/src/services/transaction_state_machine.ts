/**
 * Transaction State Machine
 *
 * Enforces strict state transitions for property deal lifecycle.
 * No illegal status jumps allowed — every transition must be validated.
 *
 * Flow: NEW → QUALIFIED → VISIT_SCHEDULED → VISITED → NEGOTIATION → CLOSED_WON/CLOSED_LOST
 * Pipeline loop: VISITED can exit to NEGOTIATION, VISIT_SCHEDULED (re-visit), or QUALIFIED (re-match)
 * Special: ON_HOLD can pause any active state — lead manager picks revival destination.
 *          CLOSED_LOST can be reopened to NEW by admin.
 * MATCHING_APPOINTMENT: Legacy stage — existing deals only, no new deals enter this state.
 */

import { TransactionStatus, TransactionLogAction } from '@prisma/client';
import prisma from '../db';
import logger from '../utils/logger';
import { ValidationError } from '../middleware/error_handler';

// ─── Valid Transitions Map ──────────────────────────────────────

const VALID_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
    NEW: [
        TransactionStatus.QUALIFIED,
        TransactionStatus.CLOSED_LOST,
        TransactionStatus.ON_HOLD,
    ],
    QUALIFIED: [
        TransactionStatus.VISIT_SCHEDULED,   // Direct — appointment booked in deal workspace
        TransactionStatus.CLOSED_LOST,
        TransactionStatus.ON_HOLD,
    ],
    MATCHING_APPOINTMENT: [
        // Legacy — existing deals only. No new deals enter this state.
        TransactionStatus.VISIT_SCHEDULED,
        TransactionStatus.QUALIFIED,
        TransactionStatus.CLOSED_LOST,
        TransactionStatus.ON_HOLD,
    ],
    VISIT_SCHEDULED: [
        TransactionStatus.VISITED,
        TransactionStatus.QUALIFIED,         // Visit cancelled — back to matching
        TransactionStatus.CLOSED_LOST,
        TransactionStatus.ON_HOLD,
    ],
    VISITED: [
        TransactionStatus.NEGOTIATION,       // Property Liked
        TransactionStatus.VISIT_SCHEDULED,   // Want More Properties (same shortlist)
        TransactionStatus.QUALIFIED,         // Re-match Required (full re-match)
        TransactionStatus.CLOSED_LOST,
        TransactionStatus.ON_HOLD,
    ],
    NEGOTIATION: [
        TransactionStatus.CLOSED_WON,
        TransactionStatus.CLOSED_LOST,
        TransactionStatus.ON_HOLD,
        TransactionStatus.QUALIFIED,         // Customer backs out, wants more properties
    ],
    CLOSED_WON: [], // Terminal — no transitions
    CLOSED_LOST: [
        TransactionStatus.NEW, // Reopen (admin only)
    ],
    ON_HOLD: [
        // Lead manager / super admin picks any destination on Revive
        TransactionStatus.NEW,
        TransactionStatus.QUALIFIED,
        TransactionStatus.VISIT_SCHEDULED,
        TransactionStatus.VISITED,
        TransactionStatus.NEGOTIATION,
        TransactionStatus.CLOSED_LOST,
    ],
    MATCHED: [], // @deprecated — no new transitions allowed
};

// ─── Public Functions ──────────────────────────────────────────

/**
 * Check if a status transition is valid
 */
export function canTransition(from: TransactionStatus, to: TransactionStatus): boolean {
    const allowed = VALID_TRANSITIONS[from];
    if (!allowed) return false;
    return allowed.includes(to);
}

/**
 * Get all valid next statuses from current status
 */
export function getValidNextStatuses(current: TransactionStatus): TransactionStatus[] {
    return VALID_TRANSITIONS[current] || [];
}

/**
 * Transition a transaction to a new status.
 * Validates the transition, updates the record, and logs the change.
 *
 * @throws Error if transition is invalid
 */
export async function transitionTransaction(
    transactionId: string,
    newStatus: TransactionStatus,
    performedBy: string,
    channel: string = 'system',
    details?: Record<string, any>
) {
    const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
    });

    if (!transaction) {
        throw new Error(`Transaction ${transactionId} not found`);
    }

    const oldStatus = transaction.status;

    // Same-stage "transition" (e.g. dropping a deal back onto the column it's already in, or a
    // double-submit) is a harmless no-op, not an error — return the unchanged transaction without
    // throwing or logging a fake status change.
    if (oldStatus === newStatus) {
        return transaction;
    }

    // Validate transition
    if (!canTransition(oldStatus, newStatus)) {
        throw new ValidationError(
            `Invalid transition: ${oldStatus} → ${newStatus}. ` +
            `Valid next: [${getValidNextStatuses(oldStatus).join(', ')}]`
        );
    }

    // Build update data
    const updateData: any = {
        status: newStatus,
        updated_at: new Date(),
    };

    // Handle ON_HOLD: save previous status for recovery
    if (newStatus === TransactionStatus.ON_HOLD) {
        updateData.previous_status = oldStatus;
    }

    // Handle terminal states
    if (newStatus === TransactionStatus.CLOSED_WON || newStatus === TransactionStatus.CLOSED_LOST) {
        updateData.closed_at = new Date();
    }

    // Handle reopening from CLOSED_LOST
    if (oldStatus === TransactionStatus.CLOSED_LOST && newStatus === TransactionStatus.NEW) {
        updateData.closed_at = null;
        updateData.previous_status = null;
    }

    // Handle resuming from ON_HOLD — clear previous_status
    if (oldStatus === TransactionStatus.ON_HOLD) {
        updateData.previous_status = null;
    }

    // Execute transition + log in a single transaction
    const [updated] = await prisma.$transaction([
        prisma.transaction.update({
            where: { id: transactionId },
            data: updateData,
        }),
        prisma.transactionLog.create({
            data: {
                transaction_id: transactionId,
                action: newStatus === TransactionStatus.CLOSED_WON || newStatus === TransactionStatus.CLOSED_LOST
                    ? TransactionLogAction.CLOSED
                    : oldStatus === TransactionStatus.CLOSED_LOST && newStatus === TransactionStatus.NEW
                        ? TransactionLogAction.REOPENED
                        : TransactionLogAction.STATUS_CHANGED,
                old_status: oldStatus,
                new_status: newStatus,
                performed_by: performedBy,
                channel,
                details: details ?? undefined,
            },
        }),
    ]);

    // (NEG-1, 2026-06-22) Inventory lock — keep the property's availability in sync with the deal so a
    // property under offer (or sold/rented) is no longer matched/shared to OTHER buyers. The matcher and
    // public listing filter `status:'active'`, so any non-active value is auto-excluded. Best-effort: an
    // inventory write failure must NEVER fail the deal transition (the status change already committed).
    if (transaction.inventory_id) {
        try {
            if (newStatus === TransactionStatus.NEGOTIATION) {
                // Reserve, but only a still-available property — never override sold/rented/withdrawn.
                await prisma.inventory.updateMany({
                    where: { id: transaction.inventory_id, status: 'active' },
                    data: { status: 'under_offer' },
                });
            } else if (newStatus === TransactionStatus.CLOSED_WON) {
                await prisma.inventory.update({
                    where: { id: transaction.inventory_id },
                    data: { status: transaction.type === 'RENT' ? 'rented' : 'sold' },
                });
            } else if (newStatus === TransactionStatus.CLOSED_LOST || newStatus === TransactionStatus.QUALIFIED) {
                // Release a property reserved by this flow back to the market (only `under_offer` → never
                // touch a real sold/rented/withdrawn outcome).
                await prisma.inventory.updateMany({
                    where: { id: transaction.inventory_id, status: 'under_offer' },
                    data: { status: 'active' },
                });
            }
        } catch (invErr) {
            logger.warn(`[StateMachine] Inventory sync failed for deal ${transactionId} (${oldStatus}→${newStatus}): ${(invErr as Error).message}`);
        }
    }

    return updated;
}

/**
 * Advance a freshly-visited deal to its post-visit target. If the deal is still in VISIT_SCHEDULED,
 * first record VISITED — the ONLY valid gateway to NEGOTIATION (`canTransition(VISIT_SCHEDULED,
 * NEGOTIATION)` is false) and a measurable funnel fact — then transition onward. Idempotent: a deal
 * already at/after VISITED goes direct, and a same-status target is a no-op (returns unchanged).
 * Returns the final status.
 *
 * Single source of truth for "the visit happened → advance" so the visit-outcome endpoint AND the
 * legacy workflow engine record VISITED consistently and Liked/Select→NEGOTIATION never throws.
 */
export async function advanceVisitedDeal(
    transactionId: string,
    target: TransactionStatus,
    performedBy: string,
    channel: string = 'system',
    details?: Record<string, any>,
): Promise<TransactionStatus> {
    const txn = await prisma.transaction.findUnique({
        where: { id: transactionId },
        select: { status: true },
    });
    if (!txn) throw new Error(`Transaction ${transactionId} not found`);
    let current = txn.status as TransactionStatus;

    // Record VISITED first when leaving VISIT_SCHEDULED toward any post-visit state (NEGOTIATION /
    // QUALIFIED). A target of VISIT_SCHEDULED (Want-More / No-Show) skips the hop — no false "visited".
    if (current === TransactionStatus.VISIT_SCHEDULED && target !== TransactionStatus.VISIT_SCHEDULED) {
        await transitionTransaction(transactionId, TransactionStatus.VISITED, performedBy, channel,
            { reason: details?.reason ? `Visit completed → ${details.reason}` : 'Visit completed' });
        current = TransactionStatus.VISITED;
    }
    if (target !== current) {
        await transitionTransaction(transactionId, target, performedBy, channel, details);
        current = target;
    }
    return current;
}

/**
 * Check if a transaction is in a terminal state
 */
export function isTerminal(status: TransactionStatus): boolean {
    return status === TransactionStatus.CLOSED_WON;
}

/**
 * Check if a transaction is active (not closed)
 */
export function isActive(status: TransactionStatus): boolean {
    return status !== TransactionStatus.CLOSED_WON && status !== TransactionStatus.CLOSED_LOST;
}

/**
 * Get a human-readable label for a status
 */
export function getStatusLabel(status: TransactionStatus): string {
    const labels: Record<TransactionStatus, string> = {
        NEW: 'New Inquiry',
        QUALIFIED: 'Qualified',
        MATCHING_APPOINTMENT: 'Booking Appointment (Legacy)',
        VISIT_SCHEDULED: 'Visit Scheduled',
        VISITED: 'Visit Completed',
        NEGOTIATION: 'In Negotiation',
        CLOSED_WON: 'Deal Closed (Won)',
        CLOSED_LOST: 'Deal Closed (Lost)',
        ON_HOLD: 'On Hold',
        MATCHED: 'Property Matched (Legacy)',
    };
    return labels[status] || status;
}
