/**
 * Default reminder time (2026-07-22).
 *
 * When a team member books a follow-up we pre-fill NOW + 25 hours (1 day + 1 hour) so an
 * unanswered call naturally rolls to the next day at a slightly later time, instead of
 * stacking every follow-up at the same hour. The value is only a DEFAULT — every field
 * stays editable.
 *
 * Must be formatted in LOCAL time: <input type="datetime-local"> rejects a UTC ISO string,
 * and toISOString() would shift an IST user back by 5h30m (and could land in the past,
 * which the server rejects at routes/deals.ts).
 */
const pad = (n: number) => String(n).padStart(2, '0');

export const DEFAULT_REMINDER_HOURS = 25;

/** 'YYYY-MM-DDTHH:mm' in local time — for <input type="datetime-local">. */
export function defaultReminderLocal(hoursAhead: number = DEFAULT_REMINDER_HOURS): string {
    const d = new Date(Date.now() + hoursAhead * 3600 * 1000);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 'YYYY-MM-DD' in local time — for date-only <input type="date">. */
export function defaultReminderDate(hoursAhead: number = DEFAULT_REMINDER_HOURS): string {
    const d = new Date(Date.now() + hoursAhead * 3600 * 1000);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
