/**
 * Demand requirement defaults (2026-07-29).
 *
 * External-source leads (99acres, MagicBricks, etc.) often arrive with only a MAX budget and no
 * timeline. Owner rule: when the MIN budget is missing but a MAX is present, set MIN = 10% below MAX
 * (max * 0.9); and default the timeline to "0 to 1 month" (the `immediate` option) when not set.
 * Applied going-forward at ingestion + on requirement save (no bulk backfill of existing leads).
 */

/** Timeline value that renders as "Immediate (< 1 month)" ≈ 0–1 month. */
export const DEFAULT_TIMELINE = "immediate";

/** Returns the MIN budget to store: the given min if set, else 10% below max, else null. */
export function deriveBudgetMin(
    budgetMin: number | null | undefined,
    budgetMax: number | null | undefined,
): number | null {
    if (budgetMin != null && Number(budgetMin) > 0) return Number(budgetMin);
    if (budgetMax != null && Number(budgetMax) > 0) return Math.round(Number(budgetMax) * 0.9);
    return null;
}
