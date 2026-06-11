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
        throw new Error(
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

    return updated;
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
