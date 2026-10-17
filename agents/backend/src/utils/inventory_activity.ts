/**
 * Per-tile activity for inventory rows (2026-10-09): when was anyone last in contact about
 * this listing, and is there a next action scheduled.
 *
 * - `last_contacted_at`: latest genuine contact with any of the row's people
 *   (owner / uploader / key holder / source), using only phones visible to this viewer.
 * - `next_action_at`: earliest open task or upcoming appointment pinned to the property.
 *
 * Both maps are built from three batched queries in the list route (never per-row), and this
 * pure merge keeps the route thin and the behaviour unit-testable.
 */

/**
 * Interaction event types that mean "a human actually reached out to (or was reached by) this
 * person". The `interactions` table also carries internal/system events (`session_keepalive`,
 * `auth_success`, `lead_recycled`, `property_view`, `property_posted`, …) which are NOT contact,
 * so they are deliberately excluded — otherwise an automated keepalive would make a dormant
 * listing look freshly contacted.
 */
import { isPlaceholderPhone, normalizePhone } from './phone';

export const CONTACT_EVENT_TYPES = [
    'message',            // WhatsApp / chat conversation
    'call',               // logged inbound call
    'call_initiate',      // outbound call dial
    'human_call_outcome', // call outcome recorded by staff
    'form_submit',        // website enquiry from that phone
    'project_enquiry',    // project enquiry from that phone
] as const;

/**
 * Match key for a phone number: the trailing 10 digits, digits only.
 *
 * Contact rows are stored in mixed formats (`+919…`, `919…`, `9…`, `+91-99…`), so exact-match
 * `IN` lookups silently miss. The DB side groups on the same `right(digits, 10)` expression,
 * which is what `resolveStoredContactPhone` already does for single-row lookups.
 * Non Indian / non 10-digit values yield '' and are skipped.
 */
export function phoneKey(phone?: string | null): string {
    if (!phone || isPlaceholderPhone(phone)) return '';
    const canonical = normalizePhone(phone);
    if (!/^\+91[6-9]\d{9}$/.test(canonical)) return '';
    return canonical.slice(3);
}

/** ISO timestamps keyed by trailing-10-digit phone key (see `phoneKey`). */
export type ContactedByPhoneKey = Record<string, string>;
/** ISO timestamps keyed by inventory id. */
export type NextActionByInventory = Record<string, string>;

export interface ActivityRow {
    id: string;
    owner_phone?: string | null;
    uploader_phone?: string | null;
    key_holder_phone?: string | null;
    source?: { phone?: string | null } | null;
}

function latestIso(a: string | null, b: string | null | undefined): string | null {
    if (a && b) return a >= b ? a : b;
    return a ?? b ?? null;
}

/** Merge the two batch maps onto rows as `last_contacted_at` / `next_action_at` (null when none). */
export function attachListingActivity<T extends ActivityRow>(
    rows: T[],
    contactedByPhoneKey: ContactedByPhoneKey,
    nextActionByInventory: NextActionByInventory,
): Array<T & { last_contacted_at: string | null; next_action_at: string | null }> {
    return rows.map(row => {
        let last: string | null = null;
        for (const phone of [row.owner_phone, row.uploader_phone, row.key_holder_phone, row.source?.phone]) {
            const key = phoneKey(phone);
            if (!key) continue;
            last = latestIso(last, contactedByPhoneKey[key] ?? null);
        }
        return {
            ...row,
            last_contacted_at: last,
            next_action_at: nextActionByInventory[row.id] ?? null,
        };
    });
}
