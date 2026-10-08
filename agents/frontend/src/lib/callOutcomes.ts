/**
 * No-answer reasons — single source of truth for the 5 reasons a logged call
 * reached nobody. Shared by the Log Call overlay (dropdown) and the Deal
 * Pipeline tile (last-action label) so a reason can never read differently
 * in the two places.
 *
 * Stored as TeamAction.outcome (free-text String) and sent as
 * `payload.no_answer_reason` to POST /api/deals/:id/log-call. The backend
 * allowlists the same codes (VALID_NO_ANSWER_REASONS in routes/deals.ts).
 */

export const NO_ANSWER_REASON_CODES = [
    'SWITCHED_OFF',
    'NOT_REACHABLE',
    'BUSY',
    'DISCONNECTED',
    'WRONG_NUMBER',
] as const;

export type NoAnswerReason = typeof NO_ANSWER_REASON_CODES[number];

export const NO_ANSWER_REASON_LABEL: Record<NoAnswerReason, string> = {
    SWITCHED_OFF: 'Switched off',
    NOT_REACHABLE: 'Not reachable',
    BUSY: 'Busy / waiting',
    DISCONNECTED: 'Disconnected / hanged / cut',
    WRONG_NUMBER: 'Wrong number / doesn’t exist',
};

/** Dropdown-ready list, in the order shown to staff. */
export const NO_ANSWER_REASONS: { code: NoAnswerReason; label: string }[] =
    NO_ANSWER_REASON_CODES.map(code => ({ code, label: NO_ANSWER_REASON_LABEL[code] }));

/**
 * Tile/timeline label for a TeamAction.outcome value. Falls back to the raw
 * value's readable form so legacy rows (`no answer`, `qualified`, free text
 * written by the Deal Workspace quick-log) keep rendering as before.
 */
export function noAnswerReasonLabel(raw?: string | null): string | null {
    if (!raw) return null;
    const code = raw.toUpperCase() as NoAnswerReason;
    if (NO_ANSWER_REASON_LABEL[code]) return NO_ANSWER_REASON_LABEL[code];
    return raw.replace(/_/g, ' ').toLowerCase();
}