# Dashboard Redesign — Phase 1: Property Analytics Rebuild

> **For agentic workers:** implement task-by-task; steps use `- [ ]` checkboxes. The **backend** has
> vitest (`backend/src/__tests__/`), so pure helpers are TDD'd (write failing test → implement → green).
> The **frontend** has no test runner, so frontend tasks verify with `npm run build` + live Playwright,
> the pattern proven in Phase 0. Ships in three checkpointed waves (Backend data → Frontend panels →
> Drill-through).

**Goal:** Rebuild Property Analytics from 4 flat counts into an inventory-intelligence dashboard —
needs-action backlog, richer pulse, supply-vs-demand gap, ageing, price positioning, by-location, and
top-performing listings — with every number clickable through to the filtered inventory list.

**Architecture:** Extend the existing `GET /api/analytics/property-trends` (additively — existing fields
stay) to return the new panels, computed in a new `services/property_analytics.ts` that delegates its
pure math (price-unit normalization, median, age-bucketing, price banding, supply/demand gap merge) to a
TDD'd `utils/inventory_math.ts`. The frontend `PropertyAnalyticsDashboard` (already on the Phase-0
async-state kit) renders the new panels with the existing clay components. Drill-through is completed by
wiring an `onDrill` listener in `App.tsx` (mirroring the existing `deepLinkDealId → initialDealId`
pattern) and an `initialFilter` prop on `InventoryList`.

**Tech Stack:** Node/TS + Prisma/PostgreSQL (backend, vitest), React/Vite (frontend), existing clay kit
(`components/dashboard/analytics/`), existing `drill.ts` (Phase 0).

**Spec:** [`docs/design/2026-07-16-dashboard-redesign-spec.md`](../design/2026-07-16-dashboard-redesign-spec.md) ·
**Phase 0:** [`docs/plans/2026-07-16-dashboard-phase0.md`](2026-07-16-dashboard-phase0.md)

---

## Scope decisions & data-gap honesty (read first)

Grounded in a backend map (2026-07-16). These are deliberate v1 choices — each is surfaced in the UI
rather than faked:

1. **Price is stored as `inventory.price` (Decimal) + `inventory.price_unit` ("Lakh"/"Crore/Cr").** Any
   median MUST normalize by unit first or lakhs and crores mix. v1 uses the `price` column normalized by
   `price_unit`; `display_price`/`customer_price` refinement deferred.
2. **No reverse matcher exists** (only demand→inventory). So **supply-vs-demand gap** is computed by
   comparing inventory `groupBy(sub_category_id)` against active-demand `Contact groupBy(sub_category_id)`
   — an aggregate gap, not a per-listing match. **"No-matched-buyer"** is therefore **approximated**: an
   active listing whose `sub_category_id` has **zero active demand** in scope. (Precise per-listing
   matching is a later refinement.)
3. **No `PropertyView` table exists** — raw views are untracked (`/advanced` hardcodes `0 as views`). So
   **Top-performing listings ranks on shares (`PropertyShare`) + visits (`Appointment.property_id`) +
   enquiries (proxy: distinct `Transaction.demand_contact_id` per `inventory_id`)**. Views are shown as
   "not tracked", not zero.
4. **No listed/activated timestamp** — `created_at` is the only basis for **days-on-market / ageing**
   (most listings are created directly `active`, so it's a good approximation; `updated_at` is unusable
   — it bumps on every edit).
5. **Status set is `active / pending_approval / sold / rented / withdrawn`** (no `inactive`).
6. **Role scope:** supply uses `inventoryScopeOR`, demand uses `contactScopeOR` (both from
   `resolveVisibleAgentIds`) — so each role sees their own supply vs their own demand pipeline;
   super_boss sees org-wide.

---

## Response contract (backend ↔ frontend agreement)

`GET /api/analytics/property-trends` returns (existing fields **kept**, new fields added):

```ts
{
  // ---- existing (unchanged) ----
  status_breakdown: { status: string; count: number }[];
  intent_breakdown: { intent: string; count: number }[];
  type_breakdown:   { type: string;   count: number }[];
  recent_additions: number;
  // ---- new ----
  pulse: {
    total: number; active: number; added: number;
    pct_with_photos: number;        // 0..100, active listings with media_urls non-empty
    avg_days_on_market: number;     // active, now - created_at, whole days
    pct_shareable: number;          // 0..100, active with a price AND >=1 photo
  };
  needs_action: {
    missing_photos: number;         // active, media_urls empty
    stale_60d: number;              // active, created_at older than 60d
    pending_approval: number;       // status = pending_approval
    overpriced: number;             // active, price > bucket-median * (1+TOL)
    no_matched_buyer: number;       // active, sub_category has 0 active demand in scope
  };
  ageing: { bucket: string; count: number }[];          // 0-7d,8-15d,16-30d,31-60d,61-90d,90d+
  price_positioning: { under: number; at: number; over: number; unpriced: number; sample: number };
  supply_demand: { sub_category: string; supply: number; demand: number; gap: number }[]; // gap=demand-supply
  by_location: { locality: string; count: number }[];   // active, top 8 localities
  top_listings: { inventory_id: string; title: string; shares: number; visits: number; enquiries: number; score: number }[];
}
```

---

## File structure

- **Create** `backend/src/utils/inventory_math.ts` — pure, TDD'd: `normalizePriceToRupees`, `median`,
  `ageBucket`, `classifyPrice`, `computeSupplyDemandGap`.
- **Create** `backend/src/__tests__/inventory_math.test.ts` — vitest for the above.
- **Create** `backend/src/services/property_analytics.ts` — query orchestration: `getPulse`,
  `getNeedsAction`, `getAgeing`, `getPricePositioning`, `getSupplyDemand`, `getByLocation`,
  `getTopListings`, and one `buildPropertyAnalytics()` that runs them.
- **Modify** `backend/src/routes/analytics.ts` — `/property-trends` calls `buildPropertyAnalytics()` and
  merges its result into the existing response.
- **Modify** `frontend/src/components/dashboard/PropertyAnalyticsDashboard.tsx` — extend the interface +
  render the new panels (keeps the Phase-0 async-state wrapper + existing breakdowns).
- **Modify** `frontend/src/components/dashboard/analytics/charts.tsx` — add `GapBars` (supply-vs-demand)
  if not expressible with existing components.
- **Modify** `frontend/src/App.tsx` — add the `onDrill` listener + `drillFilter` state + pass to lists.
- **Modify** `frontend/src/components/InventoryList.tsx` — accept `initialFilter` prop; add a client-side
  `no_photos` media filter; seed filter state from `initialFilter`.

---

# WAVE A — Backend data layer

## Task A1: Pure inventory-math helpers (TDD)

**Files:**
- Create: `backend/src/utils/inventory_math.ts`
- Test: `backend/src/__tests__/inventory_math.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { normalizePriceToRupees, median, ageBucket, classifyPrice, computeSupplyDemandGap } from '../utils/inventory_math';

describe('normalizePriceToRupees', () => {
  it('scales by unit; null-safe', () => {
    expect(normalizePriceToRupees(50, 'Lakh')).toBe(5_000_000);
    expect(normalizePriceToRupees(1.2, 'Crore')).toBe(12_000_000);
    expect(normalizePriceToRupees(2, 'Cr')).toBe(20_000_000);
    expect(normalizePriceToRupees(8400000, null)).toBe(8_400_000); // already absolute
    expect(normalizePriceToRupees(null, 'Lakh')).toBeNull();
    expect(normalizePriceToRupees(0, 'Lakh')).toBeNull();          // 0 = unpriced
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
    const flat = rows.find(r => r.sub_category === 'flat')!;
    expect(flat).toEqual({ sub_category: 'flat', supply: 10, demand: 4, gap: -6 });
    const plot = rows.find(r => r.sub_category === 'plot')!;
    expect(plot).toEqual({ sub_category: 'plot', supply: 0, demand: 6, gap: 6 });
    // sorted by absolute gap desc
    expect(Math.abs(rows[0].gap)).toBeGreaterThanOrEqual(Math.abs(rows[rows.length - 1].gap));
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd agents/backend && npx vitest run src/__tests__/inventory_math.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `inventory_math.ts`**

```ts
/** Pure inventory math for Property Analytics. No Prisma, no I/O — unit-tested. */

/** Normalize a listing price to absolute rupees using its price_unit. 0/null → null (unpriced). */
export function normalizePriceToRupees(price: number | null | undefined, unit: string | null | undefined): number | null {
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

export function ageBucket(days: number): string {
  if (days <= 7) return '0-7d';
  if (days <= 15) return '8-15d';
  if (days <= 30) return '16-30d';
  if (days <= 60) return '31-60d';
  if (days <= 90) return '61-90d';
  return '90d+';
}

export type PriceBand = 'under' | 'at' | 'over';
export function classifyPrice(price: number | null, med: number | null, tol: number): PriceBand | null {
  if (price == null || med == null || med <= 0) return null;
  if (price > med * (1 + tol)) return 'over';
  if (price < med * (1 - tol)) return 'under';
  return 'at';
}

export interface GapRow { sub_category: string; supply: number; demand: number; gap: number; }
export function computeSupplyDemandGap(supply: Map<string, number>, demand: Map<string, number>): GapRow[] {
  const keys = new Set([...supply.keys(), ...demand.keys()]);
  const rows: GapRow[] = [];
  for (const k of keys) {
    const s = supply.get(k) || 0;
    const d = demand.get(k) || 0;
    rows.push({ sub_category: k, supply: s, demand: d, gap: d - s });
  }
  return rows.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
}

export const OVERPRICE_TOL = 0.15;      // ±15% band around bucket median
export const MIN_BUCKET_SAMPLE = 5;      // a (sub_category+locality) bucket needs >=5 priced listings to judge
```

- [ ] **Step 4: Run tests, verify green**

Run: `cd agents/backend && npx vitest run src/__tests__/inventory_math.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Checkpoint** — helpers done, tested.

---

## Task A2: `property_analytics.ts` service — pulse, needs-action, ageing

**Files:**
- Create: `backend/src/services/property_analytics.ts`

- [ ] **Step 1: Scaffold the service with the scope contract + pulse/needs-action/ageing**

The route already resolves `ids = resolveVisibleAgentIds(...)`, `invScopeOR = inventoryScopeOR(ids)`,
`contactScopeOR = contactScopeOR(ids)`. The service receives a `withInvScope`/`withContactScope` wrapper
so it composes identically to the existing endpoint (per `precautions/prisma-where-or-pattern.md`).

```ts
import { PrismaClient } from '@prisma/client';
import { ageBucket, normalizePriceToRupees, median, classifyPrice, computeSupplyDemandGap,
  OVERPRICE_TOL, MIN_BUCKET_SAMPLE, type GapRow } from '../utils/inventory_math';

type Where = Record<string, any>;
export interface ScopeCtx {
  prisma: PrismaClient;
  tenantId: string;
  withInv: (w: Where) => Where;       // AND-wrap inventory OR-scope
  withContact: (w: Where) => Where;   // AND-wrap contact OR-scope
  from: Date; to: Date;
}

const DAY = 86400000;
const daysBetween = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / DAY);

export async function getPulse(ctx: ScopeCtx) {
  const { prisma, tenantId, withInv } = ctx;
  const [total, active, added, withPhotos, shareable, activeRows] = await Promise.all([
    prisma.inventory.count({ where: withInv({ tenant_id: tenantId }) }),
    prisma.inventory.count({ where: withInv({ tenant_id: tenantId, status: 'active' }) }),
    prisma.inventory.count({ where: withInv({ tenant_id: tenantId, created_at: { gte: ctx.from, lte: ctx.to } }) }),
    prisma.inventory.count({ where: withInv({ tenant_id: tenantId, status: 'active', media_urls: { isEmpty: false } }) }),
    prisma.inventory.count({ where: withInv({ tenant_id: tenantId, status: 'active', media_urls: { isEmpty: false }, price: { not: null } }) }),
    prisma.inventory.findMany({ where: withInv({ tenant_id: tenantId, status: 'active' }), select: { created_at: true } }),
  ]);
  const now = new Date();
  const avgDom = activeRows.length
    ? Math.round(activeRows.reduce((s, r) => s + daysBetween(now, r.created_at), 0) / activeRows.length)
    : 0;
  return {
    total, active, added,
    pct_with_photos: active ? Math.round((withPhotos / active) * 100) : 0,
    avg_days_on_market: avgDom,
    pct_shareable: active ? Math.round((shareable / active) * 100) : 0,
  };
}

export async function getAgeing(ctx: ScopeCtx) {
  const { prisma, tenantId, withInv } = ctx;
  const rows = await prisma.inventory.findMany({
    where: withInv({ tenant_id: tenantId, status: 'active' }), select: { created_at: true },
  });
  const now = new Date();
  const order = ['0-7d', '8-15d', '16-30d', '31-60d', '61-90d', '90d+'];
  const counts: Record<string, number> = Object.fromEntries(order.map((b) => [b, 0]));
  for (const r of rows) counts[ageBucket(daysBetween(now, r.created_at))]++;
  return order.map((bucket) => ({ bucket, count: counts[bucket] }));
}
```

- [ ] **Step 2: Add `getNeedsAction`** (depends on price-positioning + supply-demand from A3/A4; use their
  helpers — the sub-counts `overpriced` and `no_matched_buyer` are passed in so this function stays a
  single cheap pass):

```ts
export async function getNeedsAction(ctx: ScopeCtx, overpriced: number, noMatchedBuyer: number) {
  const { prisma, tenantId, withInv } = ctx;
  const sixtyAgo = new Date(Date.now() - 60 * DAY);
  const [missing_photos, stale_60d, pending_approval] = await Promise.all([
    prisma.inventory.count({ where: withInv({ tenant_id: tenantId, status: 'active', media_urls: { isEmpty: true } }) }),
    prisma.inventory.count({ where: withInv({ tenant_id: tenantId, status: 'active', created_at: { lt: sixtyAgo } }) }),
    prisma.inventory.count({ where: withInv({ tenant_id: tenantId, status: 'pending_approval' }) }),
  ]);
  return { missing_photos, stale_60d, pending_approval, overpriced, no_matched_buyer: noMatchedBuyer };
}
```

- [ ] **Step 3: Build** — `cd agents/backend && npx tsc --noEmit` → 0 new errors (baseline 380).
- [ ] **Step 4: Checkpoint.**

---

## Task A3: Price positioning + `getByLocation`

**Files:** Modify `backend/src/services/property_analytics.ts`

- [ ] **Step 1: `getPricePositioning`** — median per (sub_category_id + locality) bucket, then band each
  priced listing; returns counts + how many overpriced (fed to needs-action):

```ts
export async function getPricePositioning(ctx: ScopeCtx): Promise<{ summary: { under: number; at: number; over: number; unpriced: number; sample: number }; overpriced: number }> {
  const { prisma, tenantId, withInv } = ctx;
  const rows = await prisma.inventory.findMany({
    where: withInv({ tenant_id: tenantId, status: 'active' }),
    select: { id: true, price: true, price_unit: true, sub_category_id: true, locality: true },
  });
  // Bucket priced listings by sub_category+locality; compute each bucket's median.
  const buckets = new Map<string, number[]>();
  const norm = rows.map((r) => ({ ...r, rupees: normalizePriceToRupees(Number(r.price), r.price_unit) }));
  for (const r of norm) {
    if (r.rupees == null) continue;
    const key = `${r.sub_category_id ?? '?'}|${r.locality ?? '?'}`;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(r.rupees);
  }
  const medians = new Map<string, number | null>();
  for (const [k, vals] of buckets) medians.set(k, vals.length >= MIN_BUCKET_SAMPLE ? median(vals) : null);

  let under = 0, at = 0, over = 0, unpriced = 0;
  for (const r of norm) {
    if (r.rupees == null) { unpriced++; continue; }
    const med = medians.get(`${r.sub_category_id ?? '?'}|${r.locality ?? '?'}`) ?? null;
    const band = classifyPrice(r.rupees, med, OVERPRICE_TOL);
    if (band === 'under') under++;
    else if (band === 'over') over++;
    else if (band === 'at') at++;
    // band === null (bucket too small to judge) → counted only in `sample` denominator below
  }
  const sample = under + at + over;
  return { summary: { under, at, over, unpriced, sample }, overpriced: over };
}

export async function getByLocation(ctx: ScopeCtx) {
  const { prisma, tenantId, withInv } = ctx;
  const grouped = await prisma.inventory.groupBy({
    by: ['locality'], where: withInv({ tenant_id: tenantId, status: 'active' }), _count: { id: true },
  });
  return grouped
    .filter((g) => g.locality)
    .map((g) => ({ locality: g.locality as string, count: g._count.id }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}
```

- [ ] **Step 2: Build** — `npx tsc --noEmit` → clean.
- [ ] **Step 3: Checkpoint.**

---

## Task A4: Supply-vs-demand gap + `getTopListings`

**Files:** Modify `backend/src/services/property_analytics.ts`

- [ ] **Step 1: `getSupplyDemand`** — inventory supply vs active-demand, both by `sub_category_id`,
  resolve ids to human names; returns rows + `no_matched_buyer` count for needs-action:

```ts
export async function getSupplyDemand(ctx: ScopeCtx): Promise<{ rows: GapRow[]; noMatchedBuyer: number }> {
  const { prisma, tenantId, withInv, withContact } = ctx;
  const [supplyG, demandG] = await Promise.all([
    prisma.inventory.groupBy({ by: ['sub_category_id'], where: withInv({ tenant_id: tenantId, status: 'active' }), _count: { id: true } }),
    prisma.contact.groupBy({
      by: ['sub_category_id'],
      where: withContact({ tenant_id: tenantId, lifecycle_stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] }, intent: { in: ['buy', 'rent'] } }),
      _count: { id: true },
    }),
  ]);
  const supply = new Map<string, number>();
  const demand = new Map<string, number>();
  for (const s of supplyG) if (s.sub_category_id) supply.set(s.sub_category_id, s._count.id);
  for (const d of demandG) if (d.sub_category_id) demand.set(d.sub_category_id, d._count.id);

  // resolve sub_category_id -> name
  const ids = [...new Set([...supply.keys(), ...demand.keys()])];
  const cats = await prisma.propertySubCategory.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const nameById = new Map(cats.map((c) => [c.id, c.name]));

  const gapRows = computeSupplyDemandGap(supply, demand)
    .map((r) => ({ ...r, sub_category: nameById.get(r.sub_category) ?? r.sub_category }))
    .slice(0, 10);

  // no-matched-buyer approx: active listings whose sub_category has 0 active demand
  const zeroDemandSubs = [...supply.keys()].filter((k) => !(demand.get(k) > 0));
  const noMatchedBuyer = zeroDemandSubs.length
    ? await prisma.inventory.count({ where: withInv({ tenant_id: tenantId, status: 'active', sub_category_id: { in: zeroDemandSubs } }) })
    : 0;
  return { rows: gapRows, noMatchedBuyer };
}
```
> Confirm the model name for sub-categories is `propertySubCategory` (schema `PropertySubCategory`) and
> `Contact` has `sub_category_id` + `lifecycle_stage` + `intent` (verified in the backend map). If the
> Prisma delegate differs, adjust the delegate name only.

- [ ] **Step 2: `getTopListings`** — rank active listings by shares + visits + enquiries (views deferred):

```ts
export async function getTopListings(ctx: ScopeCtx) {
  const { prisma, tenantId, withInv } = ctx;
  const active = await prisma.inventory.findMany({
    where: withInv({ tenant_id: tenantId, status: 'active' }),
    select: { id: true, title: true, apartment_name: true, locality: true },
  });
  if (!active.length) return [];
  const ids = active.map((a) => a.id);
  const [shares, visits, enquiries] = await Promise.all([
    prisma.propertyShare.groupBy({ by: ['inventory_id'], where: { inventory_id: { in: ids } }, _count: { id: true } }),
    prisma.appointment.groupBy({ by: ['property_id'], where: { property_id: { in: ids } }, _count: { id: true } }),
    prisma.transaction.groupBy({ by: ['inventory_id'], where: { inventory_id: { in: ids } }, _count: { demand_contact_id: true } }),
  ]);
  const sBy = new Map(shares.map((s) => [s.inventory_id, s._count.id]));
  const vBy = new Map(visits.map((v) => [v.property_id, v._count.id]));
  const eBy = new Map(enquiries.map((e) => [e.inventory_id, e._count.demand_contact_id]));
  return active
    .map((a) => {
      const sh = sBy.get(a.id) || 0, vi = vBy.get(a.id) || 0, en = eBy.get(a.id) || 0;
      return { inventory_id: a.id, title: a.title || a.apartment_name || a.locality || a.id.slice(0, 8),
        shares: sh, visits: vi, enquiries: en, score: sh + vi * 2 + en * 3 };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}
```
> Confirm delegate/field names against schema: `propertyShare.inventory_id`, `appointment.property_id`,
> `transaction.inventory_id`+`demand_contact_id`, and `inventory.title` (else use `apartment_name`).
> All confirmed present in the backend map; fix only if a delegate name differs.

- [ ] **Step 3: Build** — `npx tsc --noEmit` → clean.
- [ ] **Step 4: Checkpoint.**

---

## Task A5: Compose + wire into `/property-trends`

**Files:** Modify `backend/src/services/property_analytics.ts`, `backend/src/routes/analytics.ts`

- [ ] **Step 1: `buildPropertyAnalytics()` orchestrator** (append to the service):

```ts
export async function buildPropertyAnalytics(ctx: ScopeCtx) {
  const [pulse, ageing, pricePos, supplyDemand, byLocation, topListings] = await Promise.all([
    getPulse(ctx), getAgeing(ctx), getPricePositioning(ctx), getSupplyDemand(ctx), getByLocation(ctx), getTopListings(ctx),
  ]);
  const needs_action = await getNeedsAction(ctx, pricePos.overpriced, supplyDemand.noMatchedBuyer);
  return {
    pulse, needs_action, ageing,
    price_positioning: pricePos.summary,
    supply_demand: supplyDemand.rows,
    by_location: byLocation,
    top_listings: topListings,
  };
}
```

- [ ] **Step 2: Merge into the route.** In `analytics.ts` `/property-trends` (after the existing
  breakdowns are built, before `res.json`), add the scope wrappers + call:

```ts
import { buildPropertyAnalytics } from '../services/property_analytics';
import { contactScopeOR } from '../services/analytics_scope';
// ...inside the handler, `ids` already resolved and `invScopeOR = inventoryScopeOR(ids)` exists:
const contactOR = contactScopeOR(ids);
const withContact = (w: any) => { if (contactOR) w.AND = [...(w.AND ?? []), { OR: contactOR }]; return w; };
const analytics = await buildPropertyAnalytics({
  prisma, tenantId, from: startDate, to: endDate,
  withInv: withInvScope, withContact,
});
res.json({
  status_breakdown: /* existing */,
  intent_breakdown: /* existing */,
  type_breakdown:   /* existing */,
  recent_additions: /* existing */,
  ...analytics,
});
```
> Keep the four existing fields exactly as they are — this is additive. `withInvScope` already exists in
> the handler; reuse it as `withInv`.

- [ ] **Step 3: Build** — `cd agents/backend && npx tsc --noEmit` → 0 new errors.
- [ ] **Step 4: Deploy backend + live-probe the payload per role**

Deploy: `cd agents && node deployment/deploy-agent.js backend --skip-verify`
Then mint a super_boss token and probe (reuse the session's minted-token pattern), asserting the new keys
exist and reconcile: `pulse.active` == the active count in `status_breakdown`; `needs_action.missing_photos`
matches the `/alerts` figure; `supply_demand` non-empty; `top_listings` present. Repeat for a manager and
an employee token (scope narrows, no 500s).

- [ ] **Step 5: Checkpoint — Wave A shippable** (backend richer, frontend still reads only the old fields,
  which are unchanged → no UI regression).

---

# WAVE B — Frontend panels

## Task B1: Extend the interface + richer Pulse

**Files:** Modify `frontend/src/components/dashboard/PropertyAnalyticsDashboard.tsx`

- [ ] **Step 1: Replace the `PropertyTrends` interface** with the full contract (the shape from
  "Response contract" above — add `pulse`, `needs_action`, `ageing`, `price_positioning`,
  `supply_demand`, `by_location`, `top_listings`; keep the existing four). The `useAsyncData` isEmpty
  check stays `(d) => !(d?.status_breakdown?.length)`.

- [ ] **Step 2: Expand the Pulse KPI row** — replace the current 4 KpiCards with 6 driven by `data.pulse`
  (keep Total/Active; replace the derived `availability`/`recent_additions` with the backend pulse):

```tsx
<KpiCard label="Total Properties" value={formatNum(data.pulse.total)} accent="#3b82f6" icon="🏢" />
<KpiCard label="Active Listings" value={formatNum(data.pulse.active)} accent="#22c55e" icon="✅" />
<KpiCard label="Added (period)" value={formatNum(data.pulse.added)} accent="#8b5cf6" icon="🆕" />
<KpiCard label="With Photos" value={`${data.pulse.pct_with_photos}%`} accent="#06b6d4" icon="📸" />
<KpiCard label="Avg Days on Market" value={formatNum(data.pulse.avg_days_on_market)} accent="#f59e0b" icon="📅" />
<KpiCard label="Shareable" value={`${data.pulse.pct_shareable}%`} accent="#14b8a6" icon="📤" />
```

- [ ] **Step 3: Build** — `cd agents/frontend && npm run build` → clean.
- [ ] **Step 4: Checkpoint.**

## Task B2: Needs-Action panel

**Files:** Modify `PropertyAnalyticsDashboard.tsx`

- [ ] **Step 1:** Add, directly under the header, a Needs-Action row of severity-accented KpiCards from
  `data.needs_action` (each will become clickable in Wave C):

```tsx
<div>
  <SectionLabel icon="⚡">Needs Action</SectionLabel>
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--bento-gap)' }}>
    <KpiCard label="Missing Photos" value={formatNum(data.needs_action.missing_photos)} accent="#ef4444" icon="📷" />
    <KpiCard label="Stale 60d+" value={formatNum(data.needs_action.stale_60d)} accent="#f59e0b" icon="🕰️" />
    <KpiCard label="Pending Approval" value={formatNum(data.needs_action.pending_approval)} accent="#3b82f6" icon="⏳" />
    <KpiCard label="Overpriced" value={formatNum(data.needs_action.overpriced)} accent="#ec4899" icon="💰" />
    <KpiCard label="No Matched Buyer" value={formatNum(data.needs_action.no_matched_buyer)} accent="#8b5cf6" icon="🔍" />
  </div>
</div>
```

- [ ] **Step 2: Build** → clean. **Step 3: Checkpoint.**

## Task B3: Supply-vs-Demand, Ageing, Price positioning

**Files:** Modify `PropertyAnalyticsDashboard.tsx`; add `GapBars` to `analytics/charts.tsx`

- [ ] **Step 1: Add `GapBars` to `charts.tsx`** (diverging supply vs demand per sub-category), following
  the existing `ValueBars`/`RankedBars` structure in that file (two-tone bar per row: supply left,
  demand right, gap label). Use the existing `Empty` component for the no-data case. Keep the module's
  visual conventions (theme tokens, `formatNum`).

- [ ] **Step 2: Render three cards** using `data.supply_demand`, `data.ageing`, `data.price_positioning`.
  Ageing reuses the existing `AgeingBars` (or `ValueBars` over `ageing`); price positioning is a small
  three-segment bar (under/at/over) with `unpriced`/`sample` as sub-text:

```tsx
<div style={colTwo}>
  <ClayCard title="Supply vs Demand" subtitle="Where stock lags or exceeds buyer demand">
    <GapBars rows={data.supply_demand} />
  </ClayCard>
  <ClayCard title="Inventory Ageing" subtitle="How long active listings have been on the market">
    <ValueBars rows={data.ageing.map(a => ({ label: a.bucket, value: a.count }))} color="#f59e0b" emptyIcon="🕰️" emptyText="No active listings" />
  </ClayCard>
</div>
<ClayCard title="Price Positioning" subtitle={`vs local median · ${data.price_positioning.sample} judged, ${data.price_positioning.unpriced} unpriced`}>
  <ValueBars rows={[
    { label: 'Below market', value: data.price_positioning.under },
    { label: 'At market', value: data.price_positioning.at },
    { label: 'Above market', value: data.price_positioning.over },
  ]} color="#8b5cf6" emptyIcon="💰" emptyText="Not enough priced listings to judge" />
</ClayCard>
```

- [ ] **Step 3: Build** → clean. **Step 4: Checkpoint.**

## Task B4: By-location + Top-performing listings

**Files:** Modify `PropertyAnalyticsDashboard.tsx`

- [ ] **Step 1: Two cards** from `data.by_location` (RankedBars) and `data.top_listings` (a compact table:
  title · shares · visits · enquiries · score), with a "Views not tracked yet" foot-note on Top Listings
  per the scope decision:

```tsx
<div style={colTwo}>
  <ClayCard title="By Location" subtitle="Active listings by locality">
    <RankedBars rows={data.by_location.map(l => ({ label: l.locality, value: l.count }))} color="#14b8a6" emptyIcon="📍" emptyText="No location data" />
  </ClayCard>
  <ClayCard title="Top-Performing Listings" subtitle="By shares · visits · enquiries (views not tracked yet)">
    {/* compact table over data.top_listings; reuse the th/td style pattern from UserPerformanceDashboard */}
  </ClayCard>
</div>
```

- [ ] **Step 2: Build** → clean.
- [ ] **Step 3: Deploy + live-verify Wave B** (deploy frontend w/ PWA stamp bump `v20260716b-property-analytics`;
  Playwright super_boss: all new panels render real data, empty panels show honest empties, per-role scope
  holds). **Checkpoint — Wave B shippable.**

---

# WAVE C — Drill-through (clickable numbers)

## Task C1: `InventoryList` accepts an initial filter

**Files:** Modify `frontend/src/components/InventoryList.tsx`

- [ ] **Step 1: Add the prop + client-side media filter.** Change the signature to
  `const InventoryList: React.FC<{ initialFilter?: Record<string, string> | null }> = ({ initialFilter }) => {`
  and seed the relevant `useState` initializers from `initialFilter` (only the ones that map cleanly):
  `filterStatus` ← `initialFilter?.status`, `filterIntent` ← `initialFilter?.intent`, `filterType` ←
  `initialFilter?.type`, `filterLocation` ← `initialFilter?.locality`, `filterDaysInSystem` ←
  `initialFilter?.days`. Add a new client-side `const [filterMedia, setFilterMedia] = useState(initialFilter?.media ?? 'all')`
  and, where the fetched list is rendered/filtered, drop items with photos when `filterMedia === 'no_photos'`
  (`(item.media_urls?.length ?? 0) === 0`). No backend change — media filtering is client-side over the
  already-fetched list.

- [ ] **Step 2: Pass it through where `<InventoryList />` is rendered** in `App.tsx` (desktop L644 +
  mobile `<MobileInventoryList />` L511 if it takes the same prop — otherwise desktop only for v1).

- [ ] **Step 3: Build** → clean. **Step 4: Checkpoint.**

## Task C2: `App.tsx` drill listener

**Files:** Modify `frontend/src/App.tsx`

- [ ] **Step 1: Add state + listener** (mirror the `deepLinkDealId` precedent at App.tsx:207/254):

```tsx
import { onDrill } from './lib/drill';
// near deepLinkDealId:
const [drillFilter, setDrillFilter] = useState<Record<string, string> | null>(null);
// one effect (onDrill returns its own unsubscribe):
useEffect(() => onDrill(({ entity, filter }) => {
  setDrillFilter(filter ?? null);
  setView(entity);           // entity ∈ 'inventory'|'leads'|'deals'|'tasks' maps 1:1 to a view string
}), []);
```

- [ ] **Step 2: Feed the filter to the inventory view** (the primary Phase-1 target):
  `<InventoryList initialFilter={drillFilter} />` (desktop L644). Leads/deals/tasks entities already
  navigate correctly (filter injection for those lists is deferred to their own phases).

- [ ] **Step 3: Build** → clean. **Step 4: Checkpoint.**

## Task C3: Wire Property Analytics tiles → `drillTo`

**Files:** Modify `PropertyAnalyticsDashboard.tsx`

- [ ] **Step 1: Make the KPIs clickable.** Wrap the drillable KpiCards in a clickable container calling
  `drillTo` with the right filter. Examples:
  - Active Listings → `drillTo({ entity: 'inventory', filter: { status: 'active' } })`
  - Missing Photos → `drillTo({ entity: 'inventory', filter: { status: 'active', media: 'no_photos' } })`
  - Pending Approval → `drillTo({ entity: 'inventory', filter: { status: 'pending_approval' } })`
  - Stale 60d+ → `drillTo({ entity: 'inventory', filter: { status: 'active', days: '60' } })`
  - A By-Location row → `drillTo({ entity: 'inventory', filter: { status: 'active', locality: row.label } })`

  Add `import { drillTo } from '../../lib/drill';` and wrap each drillable tile:
  `<div role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => drillTo({...})}>…KpiCard…</div>`
  (Overpriced / No-Matched-Buyer have no clean list filter yet → leave non-clickable for now, note in a
  follow-up.)

- [ ] **Step 2: Build** → clean.
- [ ] **Step 3: Deploy + live-verify the drill** (frontend redeploy, PWA stamp `v20260716c-property-drill`):
  Playwright super_boss on Property Analytics → click **Active Listings** → app navigates to Inventory with
  the active filter pre-applied and the list matches the KPI number; click **Missing Photos** → Inventory
  shows only photo-less listings; **Back** returns to the dashboard. Screenshot before/after.

- [ ] **Step 4: Checkpoint — Wave C shippable.**

---

## Final verification & docs

- [ ] `cd agents/backend && npx vitest run` → new `inventory_math` tests green, baseline intact.
- [ ] `cd agents/backend && npx tsc --noEmit` and `cd agents/frontend && npm run build` → 0 new errors.
- [ ] Full live role-matrix on Property Analytics (super_boss / manager / employee): every panel renders
  real scoped data or an honest empty; numbers reconcile against a direct endpoint/DB probe; drill opens
  the correct filtered inventory list; mobile + light/dark OK.
- [ ] `server_health` all-green; `glitchtip_digest` shows no new errors.
- [ ] Update [`docs/PROJECT_STATUS.md`](../PROJECT_STATUS.md) recent-deploys with the Phase 1 ship; mark
  Phase 1 done in the spec's status line.

---

## Self-review (against the spec's Property Analytics panels)

- **Needs-action** (missing photos, stale, overpriced, no-matched-buyer, pending) → Task A2/A3/A4 + B2. ✅
- **Pulse** (total, active, added, %photos, avg DOM, %shareable) → Task A2 + B1. ✅
- **Status/Intent/Type breakdowns (existing, kept)** → untouched in the response; still rendered. ✅
- **Supply-vs-demand gap** → Task A4 + B3 (aggregate-by-sub_category; per-listing deferred, stated). ✅
- **Ageing + price positioning** → Task A2/A3 + B3 (own-median per owner decision; `price_unit` normalized). ✅
- **By-location + top-performing** → Task A3/A4 + B4 (shares/visits/enquiries; **views deferred, shown as such**). ✅
- **Drill-through** (owner: every number clickable) → Wave C (inventory target wired + verified; leads/deals
  filter-injection deferred to their phases; overpriced/no-matched-buyer tiles noted as non-clickable v1). ✅
- **Role auto-detection + honest empty/error/loading** → inherited from Phase 0 (unchanged). ✅
- **Type consistency:** the response contract in the header is used identically by the backend orchestrator
  (Task A5) and the frontend interface (Task B1); helper signatures in A1 match their callers in A2–A4. ✅
- **No placeholders:** every backend function has full code; frontend panels reuse existing clay components
  with exact props/data; the two `GapBars`/top-listings-table pieces reference the file's existing patterns. ✅
