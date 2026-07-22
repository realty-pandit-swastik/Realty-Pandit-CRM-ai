// src/utils/inventory_math.ts
//
// Pure inventory math for the Property Analytics dashboard. No Prisma, no I/O —
// everything here is unit-tested (src/__tests__/inventory_math.test.ts) so the
// query-orchestration layer (services/property_analytics.ts) can stay thin.

/** ±15% band around a bucket median before a listing is "over"/"under"-priced. */
export const OVERPRICE_TOL = 0.15;
/** A (sub_category+locality) bucket needs at least this many priced listings before we judge price. */
export const MIN_BUCKET_SAMPLE = 5;

/**
 * Normalize a listing price to absolute rupees using its `price_unit`.
 * `price` is stored alongside a unit ("Lakh"/"Crore"/"Cr"), so raw numbers mix
 * magnitudes — always normalize before comparing or taking a median.
 * Returns null for a missing/zero price (0 = unpriced, not free).
 */
export function normalizePriceToRupees(
  price: number | null | undefined,
  unit: string | null | undefined,
): number | null {
  if (price == null || !isFinite(price) || price <= 0) return null;
  const u = (unit || '').toLowerCase();
  if (/crore|cr\b/.test(u)) return price * 1e7;
  if (/lakh|lac/.test(u)) return price * 1e5;
  return price; // already absolute rupees
}

export function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const AGE_ORDER = ['0-7d', '8-15d', '16-30d', '31-60d', '61-90d', '90d+'] as const;
export type AgeBucketKey = (typeof AGE_ORDER)[number];
export const AGE_BUCKETS: readonly AgeBucketKey[] = AGE_ORDER;

export function ageBucket(days: number): AgeBucketKey {
  if (days <= 7) return '0-7d';
  if (days <= 15) return '8-15d';
  if (days <= 30) return '16-30d';
  if (days <= 60) return '31-60d';
  if (days <= 90) return '61-90d';
  return '90d+';
}

export type PriceBand = 'under' | 'at' | 'over';
/** Band a listing's (already-normalized) price against its bucket median, ± tolerance. */
export function classifyPrice(price: number | null, med: number | null, tol: number): PriceBand | null {
  if (price == null || med == null || med <= 0) return null;
  if (price > med * (1 + tol)) return 'over';
  if (price < med * (1 - tol)) return 'under';
  return 'at';
}

export interface GapRow {
  sub_category: string;
  supply: number;
  demand: number;
  gap: number; // demand - supply (positive = under-supplied)
}

/** Merge supply + demand count maps into gap rows, sorted by |gap| descending. */
export function computeSupplyDemandGap(
  supply: Map<string, number>,
  demand: Map<string, number>,
): GapRow[] {
  const keys = new Set([...supply.keys(), ...demand.keys()]);
  const rows: GapRow[] = [];
  for (const k of keys) {
    const s = supply.get(k) || 0;
    const d = demand.get(k) || 0;
    rows.push({ sub_category: k, supply: s, demand: d, gap: d - s });
  }
  return rows.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
}
