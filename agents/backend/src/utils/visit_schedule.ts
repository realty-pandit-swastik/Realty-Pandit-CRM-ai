/**
 * Visit time-slot → concrete appointment datetime.
 *
 * Date + time are mandatory for every client-facing visit booking, so the
 * appointment time is deterministic (no placeholders). Slots map to the START
 * of the window shown in the website UI:
 *   morning   09:00 IST  (UI: 9AM – 12PM)
 *   afternoon 12:00 IST  (UI: 12 – 4PM)
 *   evening   16:00 IST  (UI: 4 – 7PM)
 * India is UTC+5:30 year-round (no DST).
 *
 * See docs/plans/2026-05-17-website-visit-not-visible-in-crm.md
 */

export type VisitSlot = 'morning' | 'afternoon' | 'evening';

const SLOT_IST_HOUR: Record<VisitSlot, number> = {
    morning: 9,
    afternoon: 12,
    evening: 16,
};

export function isVisitSlot(v: unknown): v is VisitSlot {
    return v === 'morning' || v === 'afternoon' || v === 'evening';
}

/**
 * @param preferredDateISO  'YYYY-MM-DD' (interpreted as an IST calendar date)
 * @param slot              morning | afternoon | evening
 * @returns a Date at the slot's start hour in IST, expressed in UTC
 * @throws  if the date string or slot is invalid
 */
export function slotToScheduledAt(preferredDateISO: string, slot: VisitSlot): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(preferredDateISO)) {
        throw new Error(`Invalid preferred_date: ${preferredDateISO}`);
    }
    if (!isVisitSlot(slot)) {
        throw new Error(`Invalid preferred_time slot: ${slot}`);
    }
    const [y, m, d] = preferredDateISO.split('-').map(Number);
    const istHour = SLOT_IST_HOUR[slot];
    // IST = UTC + 5:30  →  UTC = IST − 5h30m. Date.UTC normalizes the −30 min.
    const dt = new Date(Date.UTC(y, m - 1, d, istHour - 5, -30, 0, 0));
    if (Number.isNaN(dt.getTime())) {
        throw new Error(`Invalid preferred_date: ${preferredDateISO}`);
    }
    return dt;
}
