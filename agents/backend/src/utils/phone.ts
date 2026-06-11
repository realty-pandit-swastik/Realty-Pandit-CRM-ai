/**
 * Centralized Phone Number Utility — Realty Pandit
 *
 * Indian phone numbers come in 3 formats:
 *   "+919958804559"  — E.164 (canonical, stored in DB)
 *   "919958804559"   — WhatsApp sends this
 *   "9958804559"     — bare 10-digit from user forms
 *
 * normalizePhone() → always returns "+91XXXXXXXXXX"
 * phoneVariants()  → returns all 3 formats for DB lookups
 */

/**
 * Placeholder (non-dialable) phone ids used as the Contact PK for leads with no real
 * number — partner referrals where the partner won't share the client's phone.
 *   TEMP_…            — legacy
 *   PENDING-<key>-<…> — current (see POST /api/leads partner branch)
 * These must NEVER be normalized (normalizePhone mangles them) and must NEVER be dialed.
 */
export function isPlaceholderPhone(phone?: string | null): boolean {
    return !!phone && (phone.startsWith('TEMP_') || phone.startsWith('PENDING-'));
}

/**
 * Normalize any Indian phone number to E.164 format (+91XXXXXXXXXX).
 *
 * Handles: "+919958804559", "919958804559", "9958804559", "09958804559",
 *          " +91-995-880-4559 " (spaces, dashes, parens stripped)
 *
 * Returns empty string for invalid input.
 */
export function normalizePhone(phone: string): string {
    if (!phone) return '';

    // Strip whitespace, dashes, parentheses
    let clean = phone.replace(/[\s\-()]/g, '');

    // Strip leading + for uniform processing
    if (clean.startsWith('+')) clean = clean.slice(1);

    // Strip leading zeros (some formats: 09958804559)
    if (clean.startsWith('0')) clean = clean.replace(/^0+/, '');

    // Now we have either "919958804559" (12 digits) or "9958804559" (10 digits)
    // Strip country code 91 if present (must result in 10 digits)
    if (clean.startsWith('91') && clean.length === 12) {
        clean = clean.slice(2);
    }

    // At this point, clean should be 10 digits
    if (clean.length === 10 && /^[6-9]\d{9}$/.test(clean)) {
        return `+91${clean}`;
    }

    // Fallback: if it already looks like a full number with country code, add +
    if (clean.length === 12 && clean.startsWith('91')) {
        return `+${clean}`;
    }

    // Honour the contract: anything left that isn't a plausible E.164 number — names, single
    // characters, partials ("ChiragWadhwa", "1", "+") — is INVALID and returns ''. Previously this
    // fell through to `+${clean}`, minting junk contact keys like "+ChiragWadhwa"/"+1"/"+" that
    // rendered as broken tel: links. `clean` has already had +, spaces, dashes and parens stripped,
    // so a valid international number here is all-digits, 8–15 long (E.164).
    if (!/^\d{8,15}$/.test(clean)) return '';
    return `+${clean}`;
}

/**
 * Strip everything non-numeric from a search query and return the longest
 * trailing digit run. Used for partial phone-number search where the user may
 * type "9958", "9958804559", "+91 99588 04559", "919958-804559", etc.
 *
 * Returns "" if no digits found.
 *
 * Examples:
 *   "9958804559"           → "9958804559"
 *   "+91 9958-804-559"     → "9958804559" (91 stripped if it makes a 10-digit Indian number)
 *   "919958804559"         → "9958804559"
 *   "abc 9958 def"         → "9958"
 *   "John Smith"           → ""
 */
export function extractSearchDigits(query: string): string {
    if (!query) return '';
    const digits = query.replace(/\D/g, '');
    if (!digits) return '';
    // If exactly 12 digits starting with 91, treat as Indian E.164 without +
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    // If 11 digits starting with 0, drop the leading zero
    if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
    return digits;
}

/**
 * Resolve any phone-shaped input to the ACTUAL stored Contact primary key,
 * regardless of how that row was written (`+919…`, `919…`, `9…`, or the
 * historical 99acres dash form `+91-99…`).
 *
 * A plain normalized `findUnique` misses non-canonical rows (that is the
 * "Could Not Load Lead" bug). A clean `phoneVariants` IN-match still misses
 * dash-stored rows. So we match on the trailing 10 digits of the
 * digit-stripped column, preferring an exact-canonical row when duplicates
 * exist. Read-only: mutates nothing.
 *
 * See docs/plans/2026-05-17-website-phone-normalization-fix.md
 *
 * @param raw    phone from a route param / client
 * @param prisma the Prisma client (passed in to avoid a circular import)
 * @returns the stored phone_number PK, or null if no contact matches
 */
export async function resolveStoredContactPhone(
    raw: string,
    prisma: { $queryRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<unknown> }
): Promise<string | null> {
    if (!raw) return null;
    // Preserve placeholder phones (TEMP_ legacy + PENDING- current) — exact-match, never normalize.
    if (isPlaceholderPhone(raw)) return raw;

    const canonical = normalizePhone(raw);             // best-effort E.164
    const digits = raw.replace(/\D/g, '');
    // Indian mobile = last 10 digits starting 6-9; bail to exact match otherwise
    const last10 = digits.length >= 10 ? digits.slice(-10) : '';

    let rows: Array<{ phone_number: string }>;
    if (!/^[6-9]\d{9}$/.test(last10)) {
        rows = await prisma.$queryRaw`
            SELECT phone_number FROM contacts WHERE phone_number = ${canonical} LIMIT 1` as Array<{ phone_number: string }>;
    } else {
        rows = await prisma.$queryRaw`
            SELECT phone_number FROM contacts
            WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') LIKE ${'%' + last10}
            ORDER BY (phone_number = ${canonical}) DESC, length(phone_number) ASC
            LIMIT 1` as Array<{ phone_number: string }>;
    }
    return rows[0]?.phone_number ?? null;
}

/**
 * Generate all 3 phone format variants for DB lookups.
 * Use this when querying tables that may store phones in any format.
 *
 * Input: any format → Output: ["+919958804559", "919958804559", "9958804559"]
 */
export function phoneVariants(phone: string): string[] {
    const normalized = normalizePhone(phone);
    if (!normalized || !normalized.startsWith('+91') || normalized.length !== 13) {
        // Can't generate variants — return original + with/without +
        const variants = [phone];
        if (phone.startsWith('+')) variants.push(phone.slice(1));
        else variants.push(`+${phone}`);
        return [...new Set(variants)];
    }

    const bare10 = normalized.slice(3); // "9958804559"
    return [
        normalized,           // "+919958804559"
        `91${bare10}`,        // "919958804559"
        bare10,               // "9958804559"
    ];
}
