import { normalizePhone, phoneVariants } from './phone';

/**
 * Search-query policy for Ext. Leads (`GET /api/leads/recent-external?search=`).
 *
 * Goals:
 * - preserve public behavior for ordinary names, emails and phone fragments;
 * - avoid sending digit fragments embedded in identifiers (for example
 *   `PENDING-1234`) to phone-number matching;
 * - prefer indexed exact phone equality for complete Indian mobile numbers;
 * - keep generated Prisma filters bounded for very long or multi-word input.
 */
export const LEAD_SEARCH_MAX_TERMS = 5;
export const LEAD_SEARCH_MIN_TEXT_LENGTH = 2;
export const LEAD_SEARCH_MIN_PHONE_DIGITS = 4;
export const LEAD_SEARCH_MAX_PHONE_DIGITS = 15;

/** A query chunk that participates in name/email/phone matching. */
export interface LeadSearchTerm {
    text: string;
    digits: string;
    phoneLike: boolean;
    exactPhoneVariants?: string[];
}

/** Split a query into at most LEAD_SEARCH_MAX_TERMS meaningful terms. */
export function splitLeadSearchTerms(search: unknown): string[] {
    const normalized = String(search ?? '')
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ');
    if (!normalized) return [];
    return normalized
        .split(' ')
        .filter(term => /[\p{L}\p{N}]/u.test(term))
        .slice(0, LEAD_SEARCH_MAX_TERMS);
}

/** Whether a term is phone-shaped (`+91…`, `(… )…`, `9958`, `099…`, etc.). */
export function isPhoneLikeTerm(term: string): boolean {
    return /^[+]?[\d\s\-().]+$/.test(term);
}

/**
 * Phone-number filters for one search term.
 *
 * - Full Indian mobile numbers use equality against all stored spellings.
 * - Other sufficiently long digit runs keep a contains fallback for historical
 *   non-canonical formats.
 * - Very short digit runs are ignored to avoid noisy full-table phone scans.
 */
export function phoneClausesForSearchTerm(term: string): Array<Record<string, unknown>> {
    const cleaned = term.replace(/[\s\-().]/g, '');
    const digits = cleaned.replace(/\D/g, '');
    if (!isPhoneLikeTerm(term) || digits.length < LEAD_SEARCH_MIN_PHONE_DIGITS) return [];
    // A 16+-digit numeric run is almost certainly an identifier, not a phone number.
    if (digits.length > LEAD_SEARCH_MAX_PHONE_DIGITS) return [];

    const withoutPlus = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
    let mobile = withoutPlus;
    if (mobile.length === 12 && mobile.startsWith('91')) mobile = mobile.slice(2);
    else if (mobile.length === 11 && mobile.startsWith('0')) mobile = mobile.slice(1);

    if (/^[6-9]\d{9}$/.test(mobile)) {
        const canonical = normalizePhone(mobile);
        const variants = Array.from(new Set([...phoneVariants(canonical || mobile), mobile]));
        return [
            { phone_number: { in: variants } },
            // Historical rows may include separators (`+91-…`), so retain one
            // digit-substring fallback after trying indexed equality.
            { phone_number: { contains: mobile } },
        ];
    }

    const variants = Array.from(new Set([...phoneVariants(digits), digits]));
    return variants.map(variant => ({ phone_number: { contains: variant } }));
}

/** One AND-group requiring every meaningful term to match name, email or phone. */
export function leadSearchTermFilter(term: string): Record<string, unknown> | null {
    if (term.length < LEAD_SEARCH_MIN_TEXT_LENGTH) return null;
    const or: Array<Record<string, unknown>> = [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        ...phoneClausesForSearchTerm(term),
    ];
    return { OR: or };
}

/**
 * Build an AND-group for a complete Ext. Leads search string, or null when it
 * contains no productive term. Callers merge the result into their own AND list
 * so visibility and active/archived filters remain authoritative.
 */
export function buildLeadSearchFilter(search: unknown): Record<string, unknown> | null {
    const terms = splitLeadSearchTerms(search)
        .map(term => leadSearchTermFilter(term))
        .filter((clause): clause is Record<string, unknown> => clause !== null);
    if (!terms.length) return null;
    return terms.length === 1 ? terms[0] : { AND: terms };
}
