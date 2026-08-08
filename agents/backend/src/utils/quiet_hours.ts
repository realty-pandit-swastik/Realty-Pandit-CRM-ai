/**
 * Indian Quiet Hours Utility.
 *
 * No automated outbound/marketing messages between 10 PM and 6 AM IST.
 * Customer-initiated replies are allowed 24x7.
 * Internal management alerts are exempt — callers must check contact_type.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

/** Get current IST hour (0-23). */
export function getISTHour(): number {
    const now = new Date();
    const istTime = new Date(now.getTime() + IST_OFFSET_MS);
    return istTime.getUTCHours();
}

/**
 * Check if current time is within quiet hours (10 PM – 6 AM IST).
 * Returns true when proactive/marketing messages to external users should be blocked.
 * Note: AI replies to customer-initiated messages are ALWAYS allowed (24x7).
 */
export function isQuietHours(): boolean {
    const hour = getISTHour();
    return hour >= 22 || hour < 6; // 22:00 – 05:59 IST
}

/**
 * Notification-grade quiet hours: 9 PM – 8 AM IST — a NARROWER send window than
 * `isQuietHours()` above (which allows 6 AM – 10 PM).
 *
 * This 21/8 window was previously hand-rolled inside deal_notifications.ts. It is
 * lifted here so there is one home for it, but deliberately NOT merged into
 * `isQuietHours()`: doing that would *widen* deal notifications from 08:00–21:00 to
 * 06:00–22:00 — more proactive sends, the exact opposite of what the 131049
 * throttling work is trying to achieve. (2026-08-07)
 */
export function isNotificationQuietHours(): boolean {
    const hour = getISTHour();
    return hour >= 21 || hour < 8; // 21:00 – 07:59 IST
}

/**
 * Get milliseconds until quiet hours end (6:00 AM IST).
 * Useful for rescheduling deferred actions.
 */
export function msUntilQuietEnd(): number {
    const now = new Date();
    const istTime = new Date(now.getTime() + IST_OFFSET_MS);
    const istHour = istTime.getUTCHours();
    const istMin = istTime.getUTCMinutes();

    let hoursUntil6AM: number;
    if (istHour >= 22) {
        hoursUntil6AM = (24 - istHour) + 6;
    } else {
        hoursUntil6AM = 6 - istHour;
    }

    return (hoursUntil6AM * 60 - istMin) * 60 * 1000;
}

/**
 * Get milliseconds until 7 AM IST (safe morning send time).
 * Used for scheduling keep-alive and morning messages.
 */
export function msUntilMorningSend(): number {
    const now = new Date();
    const istTime = new Date(now.getTime() + IST_OFFSET_MS);
    const istHour = istTime.getUTCHours();
    const istMin = istTime.getUTCMinutes();

    let hoursUntil7AM: number;
    if (istHour >= 22) {
        hoursUntil7AM = (24 - istHour) + 7;
    } else if (istHour < 7) {
        hoursUntil7AM = 7 - istHour;
    } else {
        hoursUntil7AM = 0; // Already past 7 AM
    }

    return Math.max(0, (hoursUntil7AM * 60 - istMin) * 60 * 1000);
}
