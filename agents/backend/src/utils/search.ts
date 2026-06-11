import { extractSearchDigits, phoneVariants } from './phone';

/**
 * Build a tokenized "match all terms, each in any field" search.
 *
 * The query is split into terms on whitespace/commas; EACH term becomes its own `{ OR: [...] }`
 * group across all `textFields` (+ phone fields if the term has digits). The caller spreads the
 * returned groups into `where.AND`, so a row must match EVERY term (in any field, any order).
 *
 * This fixes complete/multi-part address search: the address is split across
 * apartment_name/locality/city/state/full_address, so a single `field CONTAINS "<whole query>"`
 * only matched a verbatim substring of one field. Tokenizing makes "Ganga tower Ghaziabad",
 * "Ganga tower, Ghaziabad", or any order/punctuation find the property.
 *
 * A single-term query yields exactly one group identical to the old single-OR behavior.
 */
export function tokenizedTextSearch(
    q: string,
    textFields: string[],
    phoneFields: string[] = [],
    relationFields: Array<{ relation: string; field: string }> = [],
): Array<{ OR: any[] }> {
    const terms = q.split(/[\s,]+/).map(t => t.trim()).filter(Boolean);
    return terms.map(term => {
        const or: any[] = textFields.map(f => ({ [f]: { contains: term, mode: 'insensitive' as const } }));
        // Relation fields (e.g. the owner contact's name): { contact: { name: { contains } } }
        for (const { relation, field } of relationFields) {
            or.push({ [relation]: { [field]: { contains: term, mode: 'insensitive' as const } } });
        }
        const digits = extractSearchDigits(term);
        if (digits && phoneFields.length) {
            for (const variant of [...phoneVariants(digits), digits]) {
                for (const pf of phoneFields) or.push({ [pf]: { contains: variant } });
            }
        }
        return { OR: or };
    });
}
