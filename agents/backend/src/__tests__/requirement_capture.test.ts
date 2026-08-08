import { describe, it, expect } from 'vitest';
import { extractReqSlots, parseIndianSaleAmount } from '../utils/requirement_slots';

describe('extractReqSlots (P1 requirement capture)', () => {
    it('captures standalone intent', () => {
        expect(extractReqSlots('Rent')).toMatchObject({ intent: 'rent' });
        expect(extractReqSlots('on rent')).toMatchObject({ intent: 'rent' });
        expect(extractReqSlots('I want to buy')).toMatchObject({ intent: 'buy' });
        expect(extractReqSlots('kharidna hai')).toMatchObject({ intent: 'buy' });
    });

    it('captures standalone BHK', () => {
        expect(extractReqSlots('1 BHK')).toMatchObject({ bhk: 1 });
        expect(extractReqSlots('2bhk')).toMatchObject({ bhk: 2 });
        expect(extractReqSlots('2/3 bhk')).toMatchObject({ bhk: 2 }); // takes the lower
        expect(extractReqSlots('3 bedroom')).toMatchObject({ bhk: 3 });
    });

    it('captures location (known area + bare sector)', () => {
        expect(extractReqSlots('Vaishali')).toMatchObject({ location: 'vaishali' });
        expect(extractReqSlots('greater noida')).toMatchObject({ location: 'greater noida' });
        expect(extractReqSlots('sector 62')).toMatchObject({ location: 'sector 62' });
    });

    it('captures a combined requirement in one message', () => {
        expect(extractReqSlots('1bhk rent vaishali')).toMatchObject({
            bhk: 1,
            intent: 'rent',
            location: expect.stringContaining('vaishali'),
        });
    });

    it('returns empty for chit-chat (so generic auto-share still fires)', () => {
        expect(extractReqSlots('hello')).toEqual({});
        expect(extractReqSlots('ok')).toEqual({});
        expect(extractReqSlots('yes thanks')).toEqual({});
        expect(extractReqSlots('haan ji')).toEqual({});
    });

    it('does not false-fire on substrings (current/parent) or a bare number', () => {
        expect(extractReqSlots('what is the current status')).not.toHaveProperty('intent');
        expect(extractReqSlots('2')).not.toHaveProperty('bhk'); // bare number = property selection, not BHK
    });

    // 2026-08-07 regression: the old regex ended in `\b` right after `crore`, which sits
    // between two word chars in "crores", so every plural form silently failed. Lead
    // +91 87459 94545 said "1.25 crores ka budget hai maximum" and was asked for a budget
    // it had just given.
    it('captures PLURAL sale budgets (the +918745994545 regression)', () => {
        expect(extractReqSlots('Purani used property 1.25 crores ka budget hai maximum'))
            .toMatchObject({ budget: 12500000 });
        expect(extractReqSlots('50 lakhs')).toMatchObject({ budget: 5000000 });
        expect(extractReqSlots('50 lacs')).toMatchObject({ budget: 5000000 });
    });

    it('still captures singular and abbreviated sale budgets', () => {
        expect(extractReqSlots('1 cr')).toMatchObject({ budget: 10000000 });
        expect(extractReqSlots('1.25 crore')).toMatchObject({ budget: 12500000 });
        expect(extractReqSlots('50 lakh')).toMatchObject({ budget: 5000000 });
        expect(extractReqSlots('1.5 cr')).toMatchObject({ budget: 15000000 });
    });
});

describe('parseIndianSaleAmount (shared parser)', () => {
    it('parses every unit form, singular and plural', () => {
        expect(parseIndianSaleAmount('1 crore')).toBe(10000000);
        expect(parseIndianSaleAmount('1 crores')).toBe(10000000);
        expect(parseIndianSaleAmount('2 karod')).toBe(20000000);
        expect(parseIndianSaleAmount('1.5 cr')).toBe(15000000);
        expect(parseIndianSaleAmount('50 lakh')).toBe(5000000);
        expect(parseIndianSaleAmount('50 lakhs')).toBe(5000000);
        expect(parseIndianSaleAmount('50 lac')).toBe(5000000);
        expect(parseIndianSaleAmount('50 lacs')).toBe(5000000);
    });

    it('stays word-boundaried — no bare-substring false positives', () => {
        expect(parseIndianSaleAmount('2 crocodiles')).toBeNull();
        expect(parseIndianSaleAmount('crore')).toBeNull();       // no amount
        expect(parseIndianSaleAmount('sector 62')).toBeNull();
        expect(parseIndianSaleAmount('')).toBeNull();
    });

    it('rejects zero and non-finite amounts', () => {
        expect(parseIndianSaleAmount('0 crore')).toBeNull();
    });
});
