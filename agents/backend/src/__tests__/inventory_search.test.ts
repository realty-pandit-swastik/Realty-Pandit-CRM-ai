import { describe, it, expect } from 'vitest';
import { classifyToken, tokenizeSearch } from '../utils/inventory_search';

// The inventory search must treat tokens by SHAPE so a short number ("4") narrows the address
// (Sector 4) instead of being matched as a phone fragment or a loose substring (the "Vaishali sector 4
// returns Sector 5/6" bug). Phones are matched only when the token is clearly phone-length.
describe('classifyToken — token shape drives how it is matched', () => {
    it('short pure-digit tokens are NUMERIC (word-boundary address match, never phone)', () => {
        expect(classifyToken('4')).toBe('numeric');
        expect(classifyToken('150')).toBe('numeric');
        expect(classifyToken('201310')).toBe('numeric'); // 6-digit pincode
    });

    it('long pure-digit tokens are PHONE', () => {
        expect(classifyToken('9958804559')).toBe('phone'); // 10-digit
        expect(classifyToken('8750550')).toBe('phone');    // 7-digit partial
        expect(classifyToken('+919958804559')).toBe('phone');
    });

    it('anything with a letter is TEXT (substring — so "vaish"→vaishali, "S4"/"GK1-180" match)', () => {
        expect(classifyToken('vaishali')).toBe('text');
        expect(classifyToken('vaish')).toBe('text');
        expect(classifyToken('ganga')).toBe('text');
        expect(classifyToken('S4')).toBe('text');
        expect(classifyToken('GK1-180')).toBe('text');
    });
});

describe('tokenizeSearch — split on whitespace/commas, drop blanks', () => {
    it('splits a multi-word query', () => {
        expect(tokenizeSearch('Vaishali sector 4')).toEqual(['Vaishali', 'sector', '4']);
    });
    it('handles commas + extra spaces', () => {
        expect(tokenizeSearch('Ganga tower,  Ghaziabad')).toEqual(['Ganga', 'tower', 'Ghaziabad']);
    });
    it('returns [] for blank input', () => {
        expect(tokenizeSearch('   ')).toEqual([]);
        expect(tokenizeSearch('')).toEqual([]);
    });
});
