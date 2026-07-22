import { describe, it, expect } from 'vitest';
import {
  normalizePriceToRupees,
  median,
  ageBucket,
  classifyPrice,
  computeSupplyDemandGap,
} from '../utils/inventory_math';

describe('normalizePriceToRupees', () => {
  it('scales by unit; null-safe', () => {
    expect(normalizePriceToRupees(50, 'Lakh')).toBe(5_000_000);
    expect(normalizePriceToRupees(1.2, 'Crore')).toBe(12_000_000);
    expect(normalizePriceToRupees(2, 'Cr')).toBe(20_000_000);
    expect(normalizePriceToRupees(8_400_000, null)).toBe(8_400_000); // already absolute
    expect(normalizePriceToRupees(null, 'Lakh')).toBeNull();
    expect(normalizePriceToRupees(0, 'Lakh')).toBeNull(); // 0 = unpriced
  });
});

describe('median', () => {
  it('odd/even/empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('ageBucket', () => {
  it('maps days to buckets', () => {
    expect(ageBucket(0)).toBe('0-7d');
    expect(ageBucket(7)).toBe('0-7d');
    expect(ageBucket(8)).toBe('8-15d');
    expect(ageBucket(45)).toBe('31-60d');
    expect(ageBucket(500)).toBe('90d+');
  });
});

describe('classifyPrice', () => {
  it('bands against a median with tolerance', () => {
    expect(classifyPrice(130, 100, 0.15)).toBe('over');
    expect(classifyPrice(70, 100, 0.15)).toBe('under');
    expect(classifyPrice(100, 100, 0.15)).toBe('at');
    expect(classifyPrice(110, 100, 0.15)).toBe('at');
    expect(classifyPrice(null, 100, 0.15)).toBeNull();
    expect(classifyPrice(100, null, 0.15)).toBeNull();
  });
});

describe('computeSupplyDemandGap', () => {
  it('merges supply and demand maps, gap = demand - supply', () => {
    const rows = computeSupplyDemandGap(
      new Map([['flat', 10], ['shop', 2]]),
      new Map([['flat', 4], ['plot', 6]]),
    );
    const flat = rows.find((r) => r.sub_category === 'flat')!;
    expect(flat).toEqual({ sub_category: 'flat', supply: 10, demand: 4, gap: -6 });
    const plot = rows.find((r) => r.sub_category === 'plot')!;
    expect(plot).toEqual({ sub_category: 'plot', supply: 0, demand: 6, gap: 6 });
    // sorted by absolute gap desc
    expect(Math.abs(rows[0].gap)).toBeGreaterThanOrEqual(Math.abs(rows[rows.length - 1].gap));
  });
});
