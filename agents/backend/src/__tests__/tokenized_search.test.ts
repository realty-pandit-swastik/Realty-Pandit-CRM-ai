import { describe, it, expect } from 'vitest';
import { tokenizedTextSearch } from '../utils/search';

// Regression guard for the "complete address doesn't come up" bug: search used to match the WHOLE
// query as one `contains` substring per field, so "Ganga tower, Ghaziabad" (skip locality) or a
// no-comma address returned 0. Tokenizing requires EACH term to match SOME field (AND of terms,
// OR of fields), so any word order / punctuation / subset works.
describe('tokenizedTextSearch', () => {
    it('makes each term its own OR-group across fields (multi-word address)', () => {
        const r = tokenizedTextSearch('Ganga tower Ghaziabad', ['apartment_name', 'city', 'full_address']);
        expect(r).toHaveLength(3); // 3 terms → 3 AND-ed groups
        expect(r[0].OR).toEqual(expect.arrayContaining([{ apartment_name: { contains: 'Ganga', mode: 'insensitive' } }]));
        expect(r[2].OR).toEqual(expect.arrayContaining([{ city: { contains: 'Ghaziabad', mode: 'insensitive' } }]));
    });

    it('splits on commas AND whitespace, dropping empties', () => {
        const r = tokenizedTextSearch('Ganga tower,  Ghaziabad', ['city']);
        expect(r).toHaveLength(3); // Ganga | tower | Ghaziabad
    });

    it('adds phone-field matches for digit terms', () => {
        const r = tokenizedTextSearch('9958', ['city'], ['owner_phone', 'key_holder_phone']);
        expect(r).toHaveLength(1);
        const fields = r[0].OR as any[];
        expect(fields.some(f => f.owner_phone)).toBe(true);
        expect(fields.some(f => f.key_holder_phone)).toBe(true);
    });

    it('a single term reproduces the old single-group shape (backward compatible)', () => {
        const r = tokenizedTextSearch('Vaishali', ['city', 'locality']);
        expect(r).toHaveLength(1);
        expect(r[0].OR).toEqual([
            { city: { contains: 'Vaishali', mode: 'insensitive' } },
            { locality: { contains: 'Vaishali', mode: 'insensitive' } },
        ]);
    });

    it('adds relation-field matches (e.g. the owner contact name)', () => {
        const r = tokenizedTextSearch('Rahul', ['apartment_name'], [], [{ relation: 'contact', field: 'name' }]);
        expect(r).toHaveLength(1);
        expect(r[0].OR).toEqual(expect.arrayContaining([
            { contact: { name: { contains: 'Rahul', mode: 'insensitive' } } },
        ]));
    });

    it('empty / whitespace query yields no terms', () => {
        expect(tokenizedTextSearch('   ', ['city'])).toHaveLength(0);
        expect(tokenizedTextSearch('', ['city'])).toHaveLength(0);
    });
});
