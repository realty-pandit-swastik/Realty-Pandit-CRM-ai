import { describe, expect, it } from 'vitest';
import {
    buildLeadSearchFilter,
    leadSearchTermFilter,
    phoneClausesForSearchTerm,
    splitLeadSearchTerms,
} from '../utils/lead_search';

describe('splitLeadSearchTerms', () => {
    it('normalizes whitespace and caps terms', () => {
        expect(splitLeadSearchTerms('  Rahul   Sharma  ')).toEqual(['Rahul', 'Sharma']);
        expect(splitLeadSearchTerms('a b c d e f g')).toEqual(['a', 'b', 'c', 'd', 'e']);
        expect(splitLeadSearchTerms('!!!')).toEqual([]);
    });
});

describe('phoneClausesForSearchTerm', () => {
    it('prefers indexed equality for complete Indian mobile numbers', () => {
        expect(phoneClausesForSearchTerm('+91 99588 04559')).toEqual([
            { phone_number: { in: ['+919958804559', '919958804559', '9958804559'] } },
            { phone_number: { contains: '9958804559' } },
        ]);
    });

    it('keeps partial digit fragments searchable without exploding variants', () => {
        expect(phoneClausesForSearchTerm('9958')).toEqual([
            { phone_number: { contains: '9958' } },
            { phone_number: { contains: '+9958' } },
        ]);
    });

    it('ignores identifiers and short/overlong digit runs', () => {
        expect(phoneClausesForSearchTerm('98')).toEqual([]);
        expect(phoneClausesForSearchTerm('PENDING-1234')).toEqual([]);
        expect(phoneClausesForSearchTerm('1234567890123456')).toEqual([]);
    });
});

describe('leadSearchTermFilter', () => {
    it('always searches names and emails', () => {
        expect(leadSearchTermFilter('Rahul')).toEqual({
            OR: [
                { name: { contains: 'Rahul', mode: 'insensitive' } },
                { email: { contains: 'Rahul', mode: 'insensitive' } },
            ],
        });
    });

    it('ignores single-character noise', () => {
        expect(leadSearchTermFilter('a')).toBeNull();
    });
});

describe('buildLeadSearchFilter', () => {
    it('ANDs multi-word queries across name, email and qualifying phone fragments', () => {
        expect(buildLeadSearchFilter('Rahul 9958')).toEqual({
            AND: [
                {
                    OR: [
                        { name: { contains: 'Rahul', mode: 'insensitive' } },
                        { email: { contains: 'Rahul', mode: 'insensitive' } },
                    ],
                },
                {
                    OR: [
                        { name: { contains: '9958', mode: 'insensitive' } },
                        { email: { contains: '9958', mode: 'insensitive' } },
                        { phone_number: { contains: '9958' } },
                        { phone_number: { contains: '+9958' } },
                    ],
                },
            ],
        });
    });

    it('returns no search filter for empty or unproductive input', () => {
        expect(buildLeadSearchFilter('   ')).toBeNull();
        expect(buildLeadSearchFilter('a')).toBeNull();
        expect(buildLeadSearchFilter('!!!')).toBeNull();
    });
});
