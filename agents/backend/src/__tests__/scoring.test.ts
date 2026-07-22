import { describe, it, expect } from 'vitest';
import {
  productivityScore,
  categorize,
  scaleTargets,
  DEFAULT_MONTHLY_TARGETS,
  type ProductivityTargets,
} from '../services/scoring';

const T: ProductivityTargets = { leads: 30, appointments: 15, inventory: 10, conversionRate: 0.2 };

describe('categorize', () => {
  it('maps score bands', () => {
    expect(categorize(85)).toBe('Excellent');
    expect(categorize(80)).toBe('Excellent');
    expect(categorize(70)).toBe('Good');
    expect(categorize(60)).toBe('Good');
    expect(categorize(50)).toBe('Average');
    expect(categorize(40)).toBe('Average');
    expect(categorize(39)).toBe('Needs Improvement');
    expect(categorize(0)).toBe('Needs Improvement');
  });
});

describe('productivityScore', () => {
  it('zero activity -> 0 / Needs Improvement', () => {
    const r = productivityScore({ leads: 0, deals_closed: 0, appointments_completed: 0, inventory_added: 0 }, T);
    expect(r.score).toBe(0);
    expect(r.category).toBe('Needs Improvement');
  });

  it('all targets met exactly -> 100 / Excellent', () => {
    const r = productivityScore({ leads: 30, deals_closed: 6, appointments_completed: 15, inventory_added: 10 }, T);
    // conversion 6/30 = 0.2 == target -> full
    expect(r.score).toBe(100);
    expect(r.category).toBe('Excellent');
    expect(r.components).toEqual({ leads: 100, conversion: 100, appointments: 100, inventory: 100 });
  });

  it('over-target is clamped (no score > 100)', () => {
    const r = productivityScore({ leads: 300, deals_closed: 300, appointments_completed: 150, inventory_added: 100 }, T);
    expect(r.score).toBe(100);
  });

  it('weights components correctly (only leads target met -> 30)', () => {
    const r = productivityScore({ leads: 30, deals_closed: 0, appointments_completed: 0, inventory_added: 0 }, T);
    expect(r.score).toBe(30); // leads weight 0.30
  });

  it('only appointments met -> 20; only inventory met -> 20', () => {
    expect(productivityScore({ leads: 0, deals_closed: 0, appointments_completed: 15, inventory_added: 0 }, T).score).toBe(20);
    expect(productivityScore({ leads: 0, deals_closed: 0, appointments_completed: 0, inventory_added: 10 }, T).score).toBe(20);
  });

  it('conversion needs leads present (deals with 0 leads contributes 0)', () => {
    const r = productivityScore({ leads: 0, deals_closed: 5, appointments_completed: 0, inventory_added: 0 }, T);
    expect(r.score).toBe(0);
  });
});

describe('scaleTargets', () => {
  it('scales count targets by days/30 but not the conversion rate', () => {
    const wk = scaleTargets(DEFAULT_MONTHLY_TARGETS, 7);
    expect(wk.leads).toBeCloseTo(30 * 7 / 30);
    expect(wk.appointments).toBeCloseTo(15 * 7 / 30);
    expect(wk.conversionRate).toBe(0.2);
  });

  it('floors days at 1 to avoid zero/negative targets', () => {
    const t = scaleTargets(DEFAULT_MONTHLY_TARGETS, 0);
    expect(t.leads).toBeGreaterThan(0);
  });
});
