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
 * Tile/timeline label for a TeamAction.outcome value.
 *
 * The backend writes a no-answer as "<BASE_OUTCOME>:<REASON>" (e.g. "NO_ANSWER:BUSY") so the base
 * outcome survives and cannot collide with another writer of that free-text column (WRONG_OR_SPAM
 * already writes a bare "WRONG_NUMBER"). A bare reason code is also accepted so rows written before
 * the prefix existed still read correctly.
 *
 * Anything else — legacy outcomes ("no answer", "qualified"), the reminder service's
 * "Reminder for 8 Oct, 10:49 pm", or the Deal Workspace quick-log's free text — falls back to its
 * readable raw form.
 */
export function noAnswerReasonLabel(raw?: string | null): string | null {
    if (!raw) return null;
    const value = String(raw);
    const suffix = value.includes(':') ? value.slice(value.indexOf(':') + 1) : value;
    const code = suffix.trim().toUpperCase() as NoAnswerReason;
    if (Object.prototype.hasOwnProperty.call(NO_ANSWER_REASON_LABEL, code)) {
        return NO_ANSWER_REASON_LABEL[code];
    }
    return value.replace(/_/g, ' ').toLowerCase();
}