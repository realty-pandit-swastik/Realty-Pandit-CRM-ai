import { describe, it, expect } from 'vitest';
import { extractReqSlots } from '../utils/requirement_slots';

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
});
