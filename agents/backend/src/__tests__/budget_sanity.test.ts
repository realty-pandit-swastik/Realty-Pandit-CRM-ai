import { describe, it, expect } from 'vitest';
import { checkBudgetSanity, normalizeBudgetIntent, budgetReaskPrompt } from '../utils/budget_sanity';

describe('checkBudgetSanity (Fix D)', () => {
    it('flags a buy deal with a rent-sized budget (the 17/40 survey case)', () => {
        expect(checkBudgetSanity('buy', 16000)).toEqual({ implausible: true, issue: 'buy_tiny_budget' });
        expect(checkBudgetSanity('buy', 35000)).toEqual({ implausible: true, issue: 'buy_tiny_budget' });
        expect(checkBudgetSanity('sell', 20000)).toEqual({ implausible: true, issue: 'buy_tiny_budget' });
    });

    it('accepts a realistic buy budget', () => {
        expect(checkBudgetSanity('buy', 16000000)).toEqual({ implausible: false, issue: null }); // ₹1.6 cr
        expect(checkBudgetSanity('buy', 500000)).toEqual({ implausible: false, issue: null });   // exactly ₹5L
    });

    it('flags a rent deal with a sale-sized budget', () => {
        expect(checkBudgetSanity('rent', 5000000)).toEqual({ implausible: true, issue: 'rent_huge_budget' }); // ₹50L/mo
        expect(checkBudgetSanity('rent_lease', 2000000)).toEqual({ implausible: true, issue: 'rent_huge_budget' });
    });

    it('accepts a realistic rent budget (₹16k/mo on a rent deal is fine)', () => {
        expect(checkBudgetSanity('rent', 16000)).toEqual({ implausible: false, issue: null });
        expect(checkBudgetSanity('rent', 50000)).toEqual({ implausible: false, issue: null });
    });

    it('does NOT flag missing/zero/negative budgets (handled elsewhere)', () => {
        expect(checkBudgetSanity('buy', null)).toEqual({ implausible: false, issue: null });
        expect(checkBudgetSanity('buy', 0)).toEqual({ implausible: false, issue: null });
        expect(checkBudgetSanity('buy', undefined)).toEqual({ implausible: false, issue: null });
    });

    it('normalizes intent', () => {
        expect(normalizeBudgetIntent('rent_lease')).toBe('rent');
        expect(normalizeBudgetIntent('Lease')).toBe('rent');
        expect(normalizeBudgetIntent('buy')).toBe('buy');
        expect(normalizeBudgetIntent(null)).toBe('buy');
    });

    it('produces a re-ask prompt naming both interpretations', () => {
        const p = budgetReaskPrompt('buy_tiny_budget', 16000);
        expect(p).toContain('16,000');
        expect(p).toMatch(/rent/i);
        expect(p).toMatch(/buy/i);
        expect(budgetReaskPrompt(null, 16000)).toBeNull();
    });
});
