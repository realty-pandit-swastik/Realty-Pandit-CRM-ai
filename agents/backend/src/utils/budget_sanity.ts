/**
 * Budget sanity — Fix D (2026-06-12).
 *
 * The 40-deal survey found 17/40 NEW/QUALIFIED deals with intent=buy but a
 * budget of ₹16k–35k — i.e. a monthly-rent figure (or parse error) saved on a
 * BUY deal. The matching engine then hunts for a flat to *buy* at ₹16k → 0
 * matches → the customer dead-ends. This pure helper detects that case so the
 * conversational layer can re-ask once ("Is ₹16,000 your monthly rent budget,
 * or did you mean ₹16 lakh?") and, if still unclear, flag the assigned agent.
 *
 * Pure + dependency-free → unit-tested directly.
 */

export type BudgetIntent = 'buy' | 'rent';

/** Normalize a loose lead/deal intent to buy|rent. Defaults to 'buy'. */
export function normalizeBudgetIntent(intent?: string | null): BudgetIntent {
    const v = String(intent ?? '').toLowerCase();
    if (/rent|lease|kiray/.test(v)) return 'rent';
    return 'buy';
}

export type BudgetIssue = 'buy_tiny_budget' | 'rent_huge_budget' | null;

export interface BudgetSanity {
    implausible: boolean;
    issue: BudgetIssue;
}

// A "buy" budget below this is almost certainly a monthly-rent figure or a parse error.
export const BUY_MIN_REALISTIC = 500_000; // ₹5 lakh
// A "rent" (monthly) budget above this is almost certainly a sale price on a rent deal.
export const RENT_MAX_REALISTIC = 1_000_000; // ₹10 lakh / month

/**
 * Classify whether (intent, budget_max) is implausible. A null/zero/negative
 * budget is NOT flagged here (missing-budget is handled separately) — this only
 * catches a present-but-wrong-magnitude budget.
 */
export function checkBudgetSanity(
    intent: string | null | undefined,
    budgetMax: number | null | undefined,
): BudgetSanity {
    const kind = normalizeBudgetIntent(intent);
    const b = budgetMax == null ? null : Number(budgetMax);
    if (b == null || !isFinite(b) || b <= 0) return { implausible: false, issue: null };
    if (kind === 'buy' && b < BUY_MIN_REALISTIC) return { implausible: true, issue: 'buy_tiny_budget' };
    if (kind === 'rent' && b > RENT_MAX_REALISTIC) return { implausible: true, issue: 'rent_huge_budget' };
    return { implausible: false, issue: null };
}

/** The one-line clarification to send the buyer when the budget looks implausible. */
export function budgetReaskPrompt(issue: BudgetIssue, budgetMax: number): string | null {
    const lakh = (n: number) => `₹${(n / 100000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} lakh`;
    if (issue === 'buy_tiny_budget') {
        return `Just to confirm 🙏 — is ₹${budgetMax.toLocaleString('en-IN')} your *monthly rent* budget, or did you mean ${lakh(budgetMax * 100)} to *buy*? Reply *rent* or *buy*.`;
    }
    if (issue === 'rent_huge_budget') {
        return `Just to confirm 🙏 — is ₹${budgetMax.toLocaleString('en-IN')} your *purchase* budget, or your monthly rent? Reply *buy* or *rent*.`;
    }
    return null;
}
