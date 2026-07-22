// src/services/scoring.ts
//
// Phase 2 — Performance scoring engine (pure, deterministic, unit-tested).
//
// USER PRODUCTIVITY SCORE (0–100): a weighted blend of the activity signals we can
// measure reliably today. Each component is normalised against a target and clamped
// to [0,1], so the score is absolute (not just a ranking) and degrades gracefully.
//
//   score = 100 * ( 0.30·leads + 0.30·conversion + 0.20·appointments + 0.20·inventory )
//
// Targets are DEFAULTS (monthly) and meant to be tuned by the business; the endpoint
// scales them to the selected date range via scaleTargets(). Components whose target is
// 0 contribute 0. Follow-up discipline, inventory-quality and compliance are intentionally
// NOT folded in yet — their inputs land in Phase 3; adding them with 0 data would deflate
// every score. See docs/plans/2026-06-14-dashboard-rbac-analytics-plan.md (Phase 2).

export type ScoreCategory = 'Excellent' | 'Good' | 'Average' | 'Needs Improvement';

export interface ProductivityTargets {
  leads: number; // leads handled in the period
  appointments: number; // appointments completed in the period
  inventory: number; // inventory added in the period
  conversionRate: number; // deals/leads rate (0..1) that earns full conversion marks
}

/** Default MONTHLY targets — tunable by the business (not yet confirmed). */
export const DEFAULT_MONTHLY_TARGETS: ProductivityTargets = {
  leads: 30,
  appointments: 15,
  inventory: 10,
  conversionRate: 0.2,
};

const WEIGHTS = { leads: 0.3, conversion: 0.3, appointments: 0.2, inventory: 0.2 };

export interface ProductivityInput {
  leads: number;
  deals_closed: number;
  appointments_completed: number;
  inventory_added: number;
}

export function categorize(score: number): ScoreCategory {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Average';
  return 'Needs Improvement';
}

/** Scale count-based monthly targets to an arbitrary period length (rate target is unscaled). */
export function scaleTargets(base: ProductivityTargets, days: number): ProductivityTargets {
  const f = Math.max(days, 1) / 30;
  return {
    leads: base.leads * f,
    appointments: base.appointments * f,
    inventory: base.inventory * f,
    conversionRate: base.conversionRate,
  };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** The 4 sub-scores (each 0..100) that blend into the productivity score — shown on the scorecard. */
export interface ScoreComponents { leads: number; conversion: number; appointments: number; inventory: number; }

export function productivityScore(
  m: ProductivityInput,
  targets: ProductivityTargets = DEFAULT_MONTHLY_TARGETS
): { score: number; category: ScoreCategory; components: ScoreComponents } {
  const leadComp = targets.leads > 0 ? clamp01(m.leads / targets.leads) : 0;
  const convRate = m.leads > 0 ? m.deals_closed / m.leads : 0;
  const convComp = targets.conversionRate > 0 ? clamp01(convRate / targets.conversionRate) : 0;
  const apptComp = targets.appointments > 0 ? clamp01(m.appointments_completed / targets.appointments) : 0;
  const invComp = targets.inventory > 0 ? clamp01(m.inventory_added / targets.inventory) : 0;

  const raw =
    WEIGHTS.leads * leadComp +
    WEIGHTS.conversion * convComp +
    WEIGHTS.appointments * apptComp +
    WEIGHTS.inventory * invComp;

  const score = Math.round(raw * 100);
  return {
    score,
    category: categorize(score),
    components: {
      leads: Math.round(leadComp * 100),
      conversion: Math.round(convComp * 100),
      appointments: Math.round(apptComp * 100),
      inventory: Math.round(invComp * 100),
    },
  };
}
