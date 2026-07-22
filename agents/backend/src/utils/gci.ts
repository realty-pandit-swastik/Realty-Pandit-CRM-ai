// src/utils/gci.ts
//
// Phase 5E — DIRECTIONAL weighted-pipeline GCI (gross commission income) estimate.
//
// HONESTY GATE (why this is an estimate, not a forecast): deals carry no expected-close-date, no
// win-probability, and no per-deal commission rate; the org has only 2 closed-won deals ever and an
// EMPTY commission ledger (0 DealCommissionEntry rows). So GCI cannot be measured or regressed. What IS
// real is the stated buyer budget on 88% of open leads. This computes, per OPEN deal,
//   budget_midpoint × ASSUMED commission rate × ASSUMED stage probability
// and sums it. Every assumption is returned to the client and surfaced in the UI. Present ONLY as a
// clearly-labelled directional number — never as a committed forecast.

// 2% — the Commission model's default rate (schema.prisma Commission.commission_rate default 2.0).
export const COMMISSION_RATE = 0.02;

// Assumed conditional close-probability per pipeline stage. NOT derived from this org's history (2
// closed-won deals is statistically meaningless) — transparent industry-style assumptions, surfaced in
// the API response so the viewer sees exactly what drives the number.
export const STAGE_PROBABILITY: Record<string, number> = {
  NEW: 0.05,
  QUALIFIED: 0.15,
  VISIT_SCHEDULED: 0.30,
  VISITED: 0.45,
  NEGOTIATION: 0.65,
  ON_HOLD: 0.10,
};

export const OPEN_STAGES = Object.keys(STAGE_PROBABILITY);

/** Budget midpoint from a deal's demand budget; falls back to whichever bound exists; null if neither. */
export function budgetMidpoint(min: number | null | undefined, max: number | null | undefined): number | null {
  const lo = min != null && min > 0 ? min : null;
  const hi = max != null && max > 0 ? max : null;
  if (lo != null && hi != null) return (lo + hi) / 2;
  return hi ?? lo ?? null;
}

export interface OpenDealBudget { status: string; budgetMin: number | null; budgetMax: number | null; }

export interface GciByStage {
  stage: string;
  count: number;         // open deals at this stage
  with_budget: number;   // of those, how many had a usable budget
  probability: number;   // the assumed stage probability applied
  weighted_gci: number;  // Σ mid × rate × prob for this stage
}

export interface GciResult {
  weighted_gci: number; // Σ mid × rate × prob (the headline directional estimate)
  raw_ceiling: number;  // Σ mid × rate (if EVERY open deal closed at the assumed rate — an upper bound)
  total_open: number;
  with_budget: number;
  commission_rate: number;
  by_stage: GciByStage[];
}

/** Pure: fold open deals into the weighted-pipeline GCI estimate + a by-stage breakdown. */
export function computeGci(deals: OpenDealBudget[]): GciResult {
  const rate = COMMISSION_RATE;
  const stages = new Map<string, { count: number; withB: number; weighted: number }>();
  let weighted = 0, ceiling = 0, withBudget = 0;
  for (const d of deals) {
    const prob = STAGE_PROBABILITY[d.status] ?? 0;
    const mid = budgetMidpoint(d.budgetMin, d.budgetMax);
    const s = stages.get(d.status) ?? { count: 0, withB: 0, weighted: 0 };
    s.count += 1;
    if (mid != null) {
      s.withB += 1;
      withBudget += 1;
      const w = mid * rate * prob;
      s.weighted += w;
      weighted += w;
      ceiling += mid * rate;
    }
    stages.set(d.status, s);
  }
  const by_stage = OPEN_STAGES
    .filter((st) => stages.has(st))
    .map((st) => {
      const s = stages.get(st)!;
      return { stage: st, count: s.count, with_budget: s.withB, probability: STAGE_PROBABILITY[st], weighted_gci: s.weighted };
    })
    .sort((a, b) => b.weighted_gci - a.weighted_gci);
  return { weighted_gci: weighted, raw_ceiling: ceiling, total_open: deals.length, with_budget: withBudget, commission_rate: rate, by_stage };
}
