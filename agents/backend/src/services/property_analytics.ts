// src/services/property_analytics.ts
//
// Property Analytics dashboard data layer (Phase 1). Thin query-orchestration over
// the `inventory` table (+ shares/visits/deals/demand) that delegates all pure math
// to utils/inventory_math.ts. Every function receives the same role-scope wrappers
// the route already built (withInv / withContact), so scoping stays consistent with
// the rest of routes/analytics.ts (see precautions/prisma-where-or-pattern.md).

import prisma from '../db';
import {
  ageBucket,
  normalizePriceToRupees,
  median,
  classifyPrice,
  computeSupplyDemandGap,
  OVERPRICE_TOL,
  MIN_BUCKET_SAMPLE,
  AGE_BUCKETS,
  type GapRow,
} from '../utils/inventory_math';

export interface ScopeCtx {
  tenantId: string;
  /** AND-wraps the inventory OR-scope onto a where (same fn the route uses). */
  withInv: (w: any) => any;
  /** AND-wraps the contact OR-scope onto a where. */
  withContact: (w: any) => any;
  from: Date;
  to: Date;
}

const DAY = 86_400_000;
const daysBetween = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / DAY);
const toRupees = (price: unknown, unit: string | null) =>
  normalizePriceToRupees(price == null ? null : Number(price), unit);

// ── Pulse ─────────────────────────────────────────────────────────────────────

export async function getPulse(ctx: ScopeCtx) {
  const { tenantId, withInv, from, to } = ctx;
  const [total, active, added, withPhotos, shareable, activeRows] = await Promise.all([
    prisma.inventory.count({ where: withInv({ tenant_id: tenantId }) }),
    prisma.inventory.count({ where: withInv({ tenant_id: tenantId, status: 'active' }) }),
    prisma.inventory.count({ where: withInv({ tenant_id: tenantId, created_at: { gte: from, lte: to } }) }),
    prisma.inventory.count({ where: withInv({ tenant_id: tenantId, status: 'active', media_urls: { isEmpty: false } }) }),
    prisma.inventory.count({ where: withInv({ tenant_id: tenantId, status: 'active', media_urls: { isEmpty: false }, price: { not: null } }) }),
    prisma.inventory.findMany({ where: withInv({ tenant_id: tenantId, status: 'active' }), select: { created_at: true } }),
  ]);
  const now = new Date();
  const avgDom = activeRows.length
    ? Math.round(activeRows.reduce((s, r) => s + daysBetween(now, r.created_at), 0) / activeRows.length)
    : 0;
  return {
    total,
    active,
    added,
    pct_with_photos: active ? Math.round((withPhotos / active) * 100) : 0,
    avg_days_on_market: avgDom,
    pct_shareable: active ? Math.round((shareable / active) * 100) : 0,
  };
}

// ── Ageing ──────────────────────────────────────────────────────────────────

export async function getAgeing(ctx: ScopeCtx) {
  const { tenantId, withInv } = ctx;
  const rows = await prisma.inventory.findMany({
    where: withInv({ tenant_id: tenantId, status: 'active' }),
    select: { created_at: true },
  });
  const now = new Date();
  const counts: Record<string, number> = Object.fromEntries(AGE_BUCKETS.map((b) => [b, 0]));
  for (const r of rows) counts[ageBucket(daysBetween(now, r.created_at))]++;
  return AGE_BUCKETS.map((bucket) => ({ bucket, count: counts[bucket] }));
}

// ── Needs action ──────────────────────────────────────────────────────────────

export async function getNeedsAction(ctx: ScopeCtx, overpriced: number, noMatchedBuyer: number) {
  const { tenantId, withInv } = ctx;
  const sixtyAgo = new Date(Date.now() - 60 * DAY);
  const [missing_photos, stale_60d, pending_approval] = await Promise.all([
    prisma.inventory.count({ where: withInv({ tenant_id: tenantId, status: 'active', media_urls: { isEmpty: true } }) }),
    prisma.inventory.count({ where: withInv({ tenant_id: tenantId, status: 'active', created_at: { lt: sixtyAgo } }) }),
    prisma.inventory.count({ where: withInv({ tenant_id: tenantId, status: 'pending_approval' }) }),
  ]);
  return { missing_photos, stale_60d, pending_approval, overpriced, no_matched_buyer: noMatchedBuyer };
}

// ── Price positioning ─────────────────────────────────────────────────────────

export async function getPricePositioning(
  ctx: ScopeCtx,
): Promise<{ summary: { under: number; at: number; over: number; unpriced: number; sample: number }; overpriced: number }> {
  const { tenantId, withInv } = ctx;
  const rows = await prisma.inventory.findMany({
    where: withInv({ tenant_id: tenantId, status: 'active' }),
    select: { id: true, price: true, price_unit: true, sub_category_id: true, locality: true },
  });
  const norm = rows.map((r) => ({
    sub_category_id: r.sub_category_id,
    locality: r.locality,
    rupees: toRupees(r.price, r.price_unit),
  }));

  // Median per (sub_category + locality) bucket; only judge buckets with enough samples.
  const buckets = new Map<string, number[]>();
  for (const r of norm) {
    if (r.rupees == null) continue;
    const key = `${r.sub_category_id ?? '?'}|${r.locality ?? '?'}`;
    let arr = buckets.get(key);
    if (!arr) { arr = []; buckets.set(key, arr); }
    arr.push(r.rupees);
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
    // band === null → bucket too small to judge; counted only via `sample` below
  }
  return { summary: { under, at, over, unpriced, sample: under + at + over }, overpriced: over };
}

// ── By location ───────────────────────────────────────────────────────────────

export async function getByLocation(ctx: ScopeCtx) {
  const { tenantId, withInv } = ctx;
  const grouped = await prisma.inventory.groupBy({
    by: ['locality'],
    where: withInv({ tenant_id: tenantId, status: 'active' }),
    _count: { id: true },
  });
  return grouped
    .filter((g) => g.locality)
    .map((g) => ({ locality: g.locality as string, count: g._count.id }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

// ── Supply vs demand + no-matched-buyer ─────────────────────────────────────────

export async function getSupplyDemand(ctx: ScopeCtx): Promise<{ rows: GapRow[]; noMatchedBuyer: number }> {
  const { tenantId, withInv, withContact } = ctx;
  const [supplyG, demandG] = await Promise.all([
    prisma.inventory.groupBy({
      by: ['sub_category_id'],
      where: withInv({ tenant_id: tenantId, status: 'active' }),
      _count: { id: true },
    }),
    prisma.contact.groupBy({
      by: ['sub_category_id'],
      where: withContact({
        tenant_id: tenantId,
        lifecycle_stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
        intent: { in: ['buy', 'rent'] },
      }),
      _count: { _all: true }, // Contact's PK is phone_number, not id → count rows via _all
    }),
  ]);

  const supply = new Map<string, number>();
  const demand = new Map<string, number>();
  for (const s of supplyG) if (s.sub_category_id) supply.set(s.sub_category_id, s._count.id);
  for (const d of demandG) if (d.sub_category_id) demand.set(d.sub_category_id, d._count._all);

  const ids = [...new Set([...supply.keys(), ...demand.keys()])];
  const cats = ids.length
    ? await prisma.propertySubCategory.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(cats.map((c) => [c.id, c.name]));

  const rows = computeSupplyDemandGap(supply, demand)
    .map((r) => ({ ...r, sub_category: nameById.get(r.sub_category) ?? r.sub_category }))
    .slice(0, 10);

  // No-matched-buyer approximation: active listings whose sub_category has 0 active demand in scope.
  const zeroDemandSubs = [...supply.keys()].filter((k) => (demand.get(k) ?? 0) === 0);
  const noMatchedBuyer = zeroDemandSubs.length
    ? await prisma.inventory.count({
        where: withInv({ tenant_id: tenantId, status: 'active', sub_category_id: { in: zeroDemandSubs } }),
      })
    : 0;

  return { rows, noMatchedBuyer };
}

// ── Top-performing listings ─────────────────────────────────────────────────────
// Views are NOT tracked (no PropertyView table) — rank on shares + visits + enquiries.

export async function getTopListings(ctx: ScopeCtx) {
  const { tenantId, withInv } = ctx;
  const active = await prisma.inventory.findMany({
    where: withInv({ tenant_id: tenantId, status: 'active' }),
    select: { id: true, apartment_name: true, locality: true },
  });
  if (!active.length) return [];
  const ids = active.map((a) => a.id);
  const [shares, visits, enquiries] = await Promise.all([
    prisma.propertyShare.groupBy({ by: ['inventory_id'], where: { inventory_id: { in: ids } }, _count: { id: true } }),
    prisma.appointment.groupBy({ by: ['property_id'], where: { property_id: { in: ids } }, _count: { id: true } }),
    prisma.transaction.groupBy({ by: ['inventory_id'], where: { inventory_id: { in: ids } }, _count: { id: true } }),
  ]);
  const sBy = new Map(shares.map((s) => [s.inventory_id, s._count.id]));
  const vBy = new Map(visits.map((v) => [v.property_id, v._count.id]));
  const eBy = new Map(enquiries.map((e) => [e.inventory_id, e._count.id]));

  return active
    .map((a) => {
      const sh = sBy.get(a.id) || 0;
      const vi = vBy.get(a.id) || 0;
      const en = eBy.get(a.id) || 0;
      return {
        inventory_id: a.id,
        title: a.apartment_name || a.locality || a.id.slice(0, 8),
        shares: sh,
        visits: vi,
        enquiries: en,
        score: sh + vi * 2 + en * 3,
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

// ── Orchestrator ────────────────────────────────────────────────────────────────

export async function buildPropertyAnalytics(ctx: ScopeCtx) {
  const [pulse, ageing, pricePos, supplyDemand, byLocation, topListings] = await Promise.all([
    getPulse(ctx),
    getAgeing(ctx),
    getPricePositioning(ctx),
    getSupplyDemand(ctx),
    getByLocation(ctx),
    getTopListings(ctx),
  ]);
  const needs_action = await getNeedsAction(ctx, pricePos.overpriced, supplyDemand.noMatchedBuyer);
  return {
    pulse,
    needs_action,
    ageing,
    price_positioning: pricePos.summary,
    supply_demand: supplyDemand.rows,
    by_location: byLocation,
    top_listings: topListings,
  };
}
