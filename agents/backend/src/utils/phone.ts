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

    // Return with + prefix if it was stripped, or as-is for non-Indian numbers
    return phone.startsWith('+') ? phone : `+${clean}`;
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
