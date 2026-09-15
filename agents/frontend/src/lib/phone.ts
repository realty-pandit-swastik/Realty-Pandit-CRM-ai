/**
 * Placeholder (non-dialable) phone ids used as the Contact id for leads with no real number —
 * partner referrals where the partner won't share the client's phone.
 *   TEMP_…            — legacy
 *   PENDING-<key>-<…> — current (see backend POST /api/leads partner branch)
 * Leads with these must show "No phone" and must NEVER render a tel:/wa.me call link
 * (the dialer strips the letters and misreads the digits, e.g. PENDING-8171822219-… → +81718222192868).
 */
export function isPlaceholderPhone(phone?: string | null): boolean {
    return !!phone && (phone.startsWith('TEMP_') || phone.startsWith('PENDING-'));
}

/**
 * True only for a value we can safely put in a `tel:`/`wa.me` link. Strips spaces/dashes/parens
 * first (dialers ignore them — e.g. legacy "+91-9654118097" IS dialable), then requires an E.164
 * shape: optional +, 8–15 digits, nothing else. Rejects placeholders (PENDING-/TEMP_) AND junk keys
 * like "+ChiragWadhwa" / "+1" / "+" that the older `!isPlaceholderPhone` check let through and that
 * the dialer mis-reads into a wrong number. Use this — NOT `!isPlaceholderPhone` — to gate call links.
 */
export function isDialablePhone(phone?: string | null): boolean {
    if (!phone) return false;
    const cleaned = phone.replace(/[\s\-()]/g, '');
    return /^\+?\d{8,15}$/.test(cleaned);
}

/**
 * Format a phone for use AS the value inside a `tel:`/`wa.me` href. Returns a canonical, country-coded
 * E.164 string (`+91…` for Indian mobiles, `+<intl>` otherwise) or `null` when the value must NOT become
 * a link (placeholder PENDING-/TEMP_ keys, names, partials, empty).
 *
 * This is the fix for two bug classes:
 *   1. Placeholder leak — `PENDING-8383044390-…`.replace(/\D/g,'') produced a garbage WhatsApp number
 *      (e.g. 83830443903016494). Placeholders now return null → no link is built.
 *   2. Missing country code — `referral_partner_phone` is stored raw (bare 10-digit, sometimes with
 *      spaces), so `tel:9818766565` had no +91 and the dialer mis-handled it. Bare Indian mobiles now
 *      gain +91 here.
 *
 * Always render the href from THIS, never from the raw field. For `wa.me`, use `.slice(1)` to drop the +.
 * `isDialablePhone` remains the boolean gate; this is the formatter that also canonicalises.
 */
export function toDialablePhone(phone?: string | null): string | null {
    if (!phone || isPlaceholderPhone(phone)) return null;
    const c = phone.replace(/[\s\-()]/g, '');
    if (/^[6-9]\d{9}$/.test(c)) return `+91${c}`;                        // bare Indian mobile → add +91
    if (/^91[6-9]\d{9}$/.test(c)) return `+${c}`;                        // 91XXXXXXXXXX
    if (/^\+?\d{8,15}$/.test(c)) return c.startsWith('+') ? c : `+${c}`; // already E.164 / plausible intl
    return null;                                                         // names / partials → no link
}

/**
 * Client-side gate for phone INPUT before we POST it — mirrors the backend `normalizePhone` accept
 * rule so the form rejects names/partials ("ChiragWadhwa", "1", "+") up front instead of letting the
 * server mint a junk contact. Accepts a 10-digit Indian mobile (6-9 start), 91+10, or a plausible
 * international 10–15 digit number. Empty is NOT valid here — callers decide if blank is allowed.
 */
export function isValidPhoneInput(raw?: string | null): boolean {
    if (!raw) return false;
    const cleaned = raw.replace(/[\s\-()]/g, '').replace(/^\+/, '').replace(/^0+/, '');
    if (/^[6-9]\d{9}$/.test(cleaned)) return true;       // 10-digit Indian mobile
    if (/^91[6-9]\d{9}$/.test(cleaned)) return true;     // +91 prefixed
    return /^\d{10,15}$/.test(cleaned);                  // plausible international
}

/**
 * Normalize a pasted/typed phone into the accepted form. Handles every format the team pastes:
 * "+91 995886 0411", "+919958860411", "919958860411", "0091-9958860411", "(0)99588 60411" ->
 * "9958860411". Strips spaces/dashes/parens/leading +, leading zeros, and a leading 91 when the
 * rest is a 10-digit Indian mobile. Genuine international numbers keep their full digits. Partial
 * input while typing is returned as digits-only so it never fights the user.
 */
export function normalizePhoneInput(raw?: string | null): string {
    if (!raw) return '';
    const hadPlus = String(raw).trimStart().startsWith('+');
    let d = String(raw).replace(/\D/g, '').replace(/^0+/, '');
    if (/^91[6-9]\d{9}$/.test(d)) d = d.slice(2);   // 91 + Indian mobile -> drop the 91
    if (/^[6-9]\d{9}$/.test(d)) return d;           // clean 10-digit Indian mobile
    if (hadPlus || d.length > 10) return d;          // international -> keep full digits
    return d;                                        // partial (while typing) -> digits as-is
}
