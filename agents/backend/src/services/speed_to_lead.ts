// src/services/speed_to_lead.ts
//
// Speed-to-lead (Phase 5A): time from lead-created to the FIRST outbound of any kind
// (incl. the bot's auto-reply, per the owner's definition). Computed from existing
// Interaction rows — the auto-reply logging blind spot was fixed 2026-07-13, so the
// dominant first-outbound is captured. Both interaction indexes support the MIN lookup.
// Residual: a slight OVER-estimate for the narrow set of leads whose true first touch was
// a raw WhatsAppService send / real Vapi call with no paired Interaction row (v1-acceptable).

import prisma from '../db';
import { rawContactFilter } from './analytics_scope';
import { median } from '../utils/inventory_math';

export const STL_BUCKETS = ['<5m', '5–30m', '30m–2h', '2–24h', '>24h'] as const;

/** Bucket a first-response latency (minutes) into a human band. Pure — unit-tested. */
export function stlBucket(minutes: number): string {
  if (minutes < 5) return '<5m';
  if (minutes < 30) return '5–30m';
  if (minutes < 120) return '30m–2h';
  if (minutes < 1440) return '2–24h';
  return '>24h';
}

export interface SpeedToLead {
  median_minutes: number | null;
  responded_pct: number;
  total: number;
  distribution: Array<{ bucket: string; count: number }>;
  by_agent: Array<{ agent_id: string; avg_minutes: number; n: number }>;
}

/**
 * Compute speed-to-lead over contacts created in [from,to], role-scoped.
 * @param ids visible-agent set from resolveVisibleAgentIds (null = super_boss / no restriction)
 */
export async function computeSpeedToLead(
  tenantId: string,
  ids: string[] | null,
  from: Date,
  to: Date,
): Promise<SpeedToLead> {
  const scope = rawContactFilter(ids, 'c');
  const rows = await prisma.$queryRaw<Array<{ created_at: Date; assigned_agent_id: string | null; first_out: Date | null }>>`
    SELECT c.created_at, c.assigned_agent_id,
      (SELECT MIN(i.created_at) FROM interactions i
         WHERE i.phone_number = c.phone_number AND i.direction = 'outbound' AND i.created_at >= c.created_at
      ) AS first_out
    FROM contacts c
    WHERE c.tenant_id = ${tenantId} AND c.created_at BETWEEN ${from} AND ${to}${scope}
  `;

  const total = rows.length;
  const respondedMinutes: number[] = [];
  const bucketCounts = new Map<string, number>(STL_BUCKETS.map((b) => [b, 0]));
  const byAgent = new Map<string, { sum: number; n: number }>();

  for (const r of rows) {
    if (!r.first_out) continue;
    const mins = (new Date(r.first_out).getTime() - new Date(r.created_at).getTime()) / 60000;
    if (mins < 0) continue;
    respondedMinutes.push(mins);
    const b = stlBucket(mins);
    bucketCounts.set(b, (bucketCounts.get(b) || 0) + 1);
    if (r.assigned_agent_id) {
      const e = byAgent.get(r.assigned_agent_id) || { sum: 0, n: 0 };
      e.sum += mins;
      e.n += 1;
      byAgent.set(r.assigned_agent_id, e);
    }
  }

  return {
    median_minutes: median(respondedMinutes),
    responded_pct: total ? Math.round((respondedMinutes.length / total) * 100) : 0,
    total,
    distribution: STL_BUCKETS.map((bucket) => ({ bucket, count: bucketCounts.get(bucket) || 0 })),
    by_agent: Array.from(byAgent.entries()).map(([agent_id, v]) => ({
      agent_id,
      avg_minutes: Math.round(v.sum / v.n),
      n: v.n,
    })),
  };
}
