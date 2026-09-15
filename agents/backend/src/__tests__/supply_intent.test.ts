import { describe, it, expect } from 'vitest';
import { isSupplyIntent } from '../utils/intent_signals';

/**
 * Phase 5 (2026-07-28): lock in the supply-vs-demand classifier that drives every
 * property-capture channel (WhatsApp routing, chatbox redirect, buyer-session re-route,
 * disambiguation). Regressions here silently misfile landlords as buyers (the Nilin bug).
 */
describe('isSupplyIntent — supply (owner/seller offering a property) MUST match', () => {
    const SUPPLY = [
        // English
        'I want to sell my flat',
        'Property for sale in Rachna Vaishali',
        'I have a flat in Sector 3A',
        'I want to rent out my 2BHK',
        'Please list my property on your portal',
        "I'm offering my apartment",
        'This is a pre-leased office',
        'resale property available',
        'available for lease',
        'I want to lease out the shop',
        // The exact phrasings Phase 1 added (previously missed)
        'I want to put it on rent',       // Nilin root-cause phrase
        'put my flat on rent',
        'give it on rent',
        "I'm having a property in Noida",
        // Hindi / Hinglish
        'flat kiraye pe dena hai',
        'makan bechna hai',
        'rent pe dena hai',
        'property list karni hai',
        'kiraye pe de do',
        'sale karni hai',
    ];
    for (const t of SUPPLY) {
        it(`matches: "${t}"`, () => expect(isSupplyIntent(t)).toBe(true));
    }
});

describe('isSupplyIntent — demand (buyer/tenant seeking) MUST NOT match', () => {
    const DEMAND = [
        'I want to buy a flat',
        'Looking for a 2 BHK in Vaishali',
        'flat chahiye',
        'I want to rent a flat',          // tenant renting — NOT "rent out"; the key distinction
        'need a house urgently',
        'What is the rent for this?',
        'kiraya kitna hai',               // "what's the rent" — not "kiraye pe dena"
        'Hi',
        'Hello, how are you?',
    ];
    for (const t of DEMAND) {
        it(`does not match: "${t}"`, () => expect(isSupplyIntent(t)).toBe(false));
    }
});

describe('isSupplyIntent — empty / nullish input is safe', () => {
    it('empty string → false', () => expect(isSupplyIntent('')).toBe(false));
    it('null → false', () => expect(isSupplyIntent(null)).toBe(false));
    it('undefined → false', () => expect(isSupplyIntent(undefined)).toBe(false));
});

describe('isSupplyIntent — Nilin regression guard (explicit)', () => {
    it('"want to put it on rent" is supply, not demand', () => {
        expect(isSupplyIntent('I am having a property and want to put it on rent')).toBe(true);
    });
});
