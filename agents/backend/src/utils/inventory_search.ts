/**
 * Word-aware inventory address search.
 *
 * Replaces the old `tokenizedTextSearch` "contains-anywhere, any field, incl. phone" matching, which was
 * wrong in both directions:
 *   - TOO LOOSE: a short number like "4" was matched as a phone fragment (every phone has a 4) and as a
 *     loose substring (hits 201014, 1400 sqft…) → "Vaishali sector 4" returned Sectors 5/6 too.
 *   - TOO STRICT: AND-of-every-word over fields that omitted pincode/sub_locality/state/flat_no → a complete
 *     address (with its pincode) matched nothing → zero results.
 *
 * Strategy: classify each token by shape and match it accordingly against ALL address columns (+ owner name):
 *   - text  ("vaishali", "ganga", "S4")  → substring  (so partial words still match)
 *   - numeric ("4", "150", "201310")     → WORD-BOUNDARY (so "4" matches "Sector 4", NOT "201014"/"Sector 40")
 *   - phone (≥7 digits)                  → matched against owner/key-holder phone (digits-stripped)
 * AND of all tokens. Returns matching inventory ids; the caller ANDs `{ id: { in: ids } }` into the Prisma
 * `where` (mirrors the proximity-filter pattern), so role-visibility/BHK/taxonomy filters still apply.
 */

import { Prisma } from '@prisma/client';
import prisma from '../db';

export type TokenClass = 'text' | 'numeric' | 'phone';

/** Split a query into terms on whitespace/commas. */
export function tokenizeSearch(q: string): string[] {
    if (!q) return [];
    return q.split(/[\s,]+/).map(t => t.trim()).filter(Boolean);
}

/**
 * Classify a token by shape:
 *   - pure digits (optional leading +), ≥7 digits → 'phone'
 *   - pure digits (optional leading +), <7 digits → 'numeric'
 *   - anything containing a letter/other char     → 'text'
 */
export function classifyToken(token: string): TokenClass {
    if (/^\+?\d+$/.test(token)) {
        const digits = token.replace(/\D/g, '');
        return digits.length >= 7 ? 'phone' : 'numeric';
    }
    return 'text';
}

/** Escape LIKE/ILIKE wildcards so a user term is matched literally (Postgres default '\' escape char). */
function escapeLike(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Escape POSIX-regex metacharacters in a user term (defence-in-depth; tokens are usually plain). */
function escapeRegex(s: string): string {
    return s.replace(/[.^$*+?()[\]{}|\\\-]/g, '\\$&');
}

// The full address haystack: every address column + display id + uploader/key-holder names + the owner
// contact's name (joined). Lowercased; `~*`/ILIKE are case-insensitive regardless.
const ADDR_EXPR = Prisma.sql`lower(concat_ws(' ',
    i.full_address, i.location, i.locality, i.sub_locality, i.city, i.district, i.state, i.pincode,
    i.apartment_name, i.flat_no, i.plot_no, i.display_id, i.uploader_name, i.key_holder_name,
    i.description, oc.name))`;

/** Build the SQL condition for one token. */
function conditionForToken(token: string, includePhone: boolean): Prisma.Sql {
    const cls = classifyToken(token);

    if (cls === 'phone' && includePhone) {
        const digits = token.replace(/\D/g, '');
        const like = `%${digits}%`;
        const wb = `\\y${escapeRegex(digits)}\\y`;
        return Prisma.sql`(
            regexp_replace(coalesce(i.owner_phone,''), '\\D', '', 'g') LIKE ${like}
            OR regexp_replace(coalesce(i.key_holder_phone,''), '\\D', '', 'g') LIKE ${like}
            OR ${ADDR_EXPR} ~* ${wb}
        )`;
    }

    if (cls === 'numeric' || cls === 'phone') {
        // numeric, OR a phone-length number in the Location filter (includePhone=false): match the address
        // number on a WORD BOUNDARY so "4" → "Sector 4" but not "201014"/"Sector 40".
        const digits = token.replace(/\D/g, '');
        const wb = `\\y${escapeRegex(digits)}\\y`;
        return Prisma.sql`${ADDR_EXPR} ~* ${wb}`;
    }

    // text → substring (partial words match: "vaish" → "vaishali")
    const like = `%${escapeLike(token.toLowerCase())}%`;
    return Prisma.sql`${ADDR_EXPR} ILIKE ${like}`;
}

/**
 * Resolve a free-text address/owner/phone query to the set of matching inventory ids.
 * @param query        the raw search string
 * @param includePhone true for the top search bar (also match owner/key-holder phone); false for the
 *                     Location filter (address only).
 */
export async function findInventoryIdsByAddress(
    query: string,
    { includePhone }: { includePhone: boolean },
): Promise<string[]> {
    const tokens = tokenizeSearch(query);
    if (tokens.length === 0) return [];

    const conditions = tokens.map(t => conditionForToken(t, includePhone));
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT i.id
        FROM inventory i
        LEFT JOIN contacts oc ON oc.phone_number = i.owner_phone
        WHERE ${Prisma.join(conditions, ' AND ')}
    `);
    return rows.map(r => r.id);
}
