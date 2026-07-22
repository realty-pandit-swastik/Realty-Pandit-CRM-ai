import { describe, it, expect } from 'vitest';
import { computeGci, budgetMidpoint, COMMISSION_RATE, STAGE_PROBABILITY } from '../utils/gci';

describe('budgetMidpoint', () => {
  it('averages both bounds', () => expect(budgetMidpoint(1000000, 3000000)).toBe(2000000));
  it('falls back to the present bound', () => {
    expect(budgetMidpoint(null, 5000000)).toBe(5000000);
    expect(budgetMidpoint(4000000, null)).toBe(4000000);
  });
  it('ignores zero/negative and returns null when neither usable', () => {
    expect(budgetMidpoint(0, 0)).toBeNull();
    expect(budgetMidpoint(null, null)).toBeNull();
    expect(budgetMidpoint(-1, 6000000)).toBe(6000000);
  });
});

describe('computeGci', () => {
  it('weights each deal by budget-mid × rate × stage-probability', () => {
    const r = computeGci([
      { status: 'NEW', budgetMin: 1000000, budgetMax: 3000000 },       // mid 2,000,000 × .02 × .05 = 2,000
      { status: 'NEGOTIATION', budgetMin: null, budgetMax: 10000000 }, // mid 10,000,000 × .02 × .65 = 130,000
    ]);
    expect(r.weighted_gci).toBeCloseTo(2000 + 130000, 5);
    expect(r.raw_ceiling).toBeCloseTo(2000000 * 0.02 + 10000000 * 0.02, 5); // 40,000 + 200,000
    expect(r.total_open).toBe(2);
    expect(r.with_budget).toBe(2);
    // by_stage sorted by weighted desc → NEGOTIATION first
    expect(r.by_stage[0].stage).toBe('NEGOTIATION');
    expect(r.by_stage[0].probability).toBe(STAGE_PROBABILITY.NEGOTIATION);
  });

  it('counts budget-less deals but contributes 0 GCI for them', () => {
    const r = computeGci([
      { status: 'QUALIFIED', budgetMin: null, budgetMax: null },
      { status: 'QUALIFIED', budgetMin: null, budgetMax: 5000000 },
    ]);
    const stage = r.by_stage.find((s) => s.stage === 'QUALIFIED')!;
    expect(stage.count).toBe(2);
    expect(stage.with_budget).toBe(1);
    expect(r.weighted_gci).toBeCloseTo(5000000 * COMMISSION_RATE * STAGE_PROBABILITY.QUALIFIED, 5);
  });

  it('assigns 0 probability to unknown stages (no NaN)', () => {
    const r = computeGci([{ status: 'MYSTERY', budgetMin: 1000000, budgetMax: 1000000 }]);
    expect(r.weighted_gci).toBe(0);
    expect(Number.isNaN(r.weighted_gci)).toBe(false);
  });
});
