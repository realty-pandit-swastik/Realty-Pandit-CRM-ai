/**
 * Indian Quiet Hours Utility.
 *
 * TRAI/WhatsApp Business guidelines: no automated outbound messages
 * between 9 PM and 8 AM IST to external users.
 *
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
 * Check if current time is within quiet hours (9 PM – 8 AM IST).
 * Returns true when automated messages to external users should be blocked.
 */
export function isQuietHours(): boolean {
    const hour = getISTHour();
    return hour >= 21 || hour < 8; // 21:00 – 07:59 IST
}

/**
 * Get milliseconds until quiet hours end (8:00 AM IST).
 * Useful for rescheduling deferred actions.
 */
export function msUntilQuietEnd(): number {
    const now = new Date();
    const istTime = new Date(now.getTime() + IST_OFFSET_MS);
    const istHour = istTime.getUTCHours();
    const istMin = istTime.getUTCMinutes();

    let hoursUntil8AM: number;
    if (istHour >= 21) {
        hoursUntil8AM = (24 - istHour) + 8;
    } else {
        hoursUntil8AM = 8 - istHour;
    }

    return (hoursUntil8AM * 60 - istMin) * 60 * 1000;
}
