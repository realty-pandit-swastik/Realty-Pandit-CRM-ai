/**
 * Parse a free-form WhatsApp visit-availability reply (Hinglish) into a concrete
 * { dateISO, slot } that slotToScheduledAt() can turn into an appointment time.
 *
 * Fix B (2026-06-12): tapping "Schedule Visit" sends rp_visit_availability asking
 * for a date/time in free text. That reply previously hit the coordination menu
 * and was ignored (no Appointment ever created → the menu then contradicted
 * itself). This parser lets the bot book the visit when the buyer's reply is
 * clear, and (caller) ask again / escalate when it isn't.
 *
 * Pure + dependency-light → unit-tested directly. Dates are IST calendar dates
 * (slotToScheduledAt interprets them as IST).
 */
import type { VisitSlot } from './visit_schedule';

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** A Date whose UTC fields equal the IST wall-clock (so getUTC* = IST calendar). */
function toIst(now: Date): Date {
    return new Date(now.getTime() + IST_OFFSET_MS);
}
function isoDate(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export interface ParsedAvailability {
    dateISO: string;
    slot: VisitSlot;
}

/**
 * @param message the buyer's free-text availability reply
 * @param now     reference time (UTC) — pass new Date() at runtime
 * @returns { dateISO, slot } if a date and/or time could be read, else null
 */
export function parseVisitAvailability(message: string, now: Date): ParsedAvailability | null {
    const m = (message || '').toLowerCase();

    // ── slot (word first, else a clock time) ──
    let slot: VisitSlot | null = null;
    if (/\b(morning|subah|sawere|saver)\b/.test(m)) slot = 'morning';
    else if (/\b(after\s?noon|noon|dopahar|dupahar|lunch)\b/.test(m)) slot = 'afternoon';
    else if (/\b(evening|shaam|sham|sandhya|night|raat)\b/.test(m)) slot = 'evening';
    if (!slot) {
        const tm = m.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|baje|bje)?\b/);
        if (tm) {
            let h = parseInt(tm[1], 10);
            const ap = tm[3];
            if (ap === 'pm' && h < 12) h += 12;
            else if (ap === 'am' && h === 12) h = 0;
            else if (!ap && h >= 1 && h <= 7) h += 12; // "milte hain 5" → 5 PM in a visit context
            if (h >= 5 && h < 12) slot = 'morning';
            else if (h >= 12 && h < 16) slot = 'afternoon';
            else if (h >= 16 && h < 22) slot = 'evening';
        }
    }

    // ── date ──
    const ist = toIst(now);
    let date: Date | null = null;
    if (/\b(today|aaj|abhi|turant)\b/.test(m)) {
        date = new Date(ist);
    } else if (/\b(tomorrow|tomm?orrow|tommorow|kal)\b/.test(m)) {
        date = new Date(ist); date.setUTCDate(date.getUTCDate() + 1);
    } else if (/\b(parso|day\s*after)\b/.test(m)) {
        date = new Date(ist); date.setUTCDate(date.getUTCDate() + 2);
    } else {
        for (let i = 0; i < 7; i++) {
            if (new RegExp(`\\b${DOW[i]}\\b`).test(m)) {
                date = new Date(ist);
                let add = (i - date.getUTCDay() + 7) % 7;
                if (add === 0) add = 7; // a bare weekday name means the NEXT one
                date.setUTCDate(date.getUTCDate() + add);
                break;
            }
        }
    }
    if (!date) {
        const dm = m.match(/\b(\d{1,2})[\/-](\d{1,2})\b/); // dd/mm or dd-mm
        if (dm) {
            const d = parseInt(dm[1], 10), mo = parseInt(dm[2], 10);
            if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
                const todayMid = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
                let cand = new Date(Date.UTC(ist.getUTCFullYear(), mo - 1, d));
                if (cand < todayMid) cand = new Date(Date.UTC(ist.getUTCFullYear() + 1, mo - 1, d));
                date = cand;
            }
        }
    }

    if (!date && !slot) return null;        // nothing usable → caller re-asks
    if (!date) date = new Date(ist);        // time given, no date → assume today
    if (!slot) slot = 'morning';            // date given, no time → default morning

    return { dateISO: isoDate(date), slot };
}
