// src/services/analytics_scope.ts
//
// Role-based visibility scope for the ANALYTICS / DASHBOARD layer.
//
// Companion to middleware/contact_visibility.ts (which scopes contact *lists*).
// This module returns the SET of agent IDs whose data the requester may see in
// aggregated dashboards, and provides WHERE-clause helpers for both Prisma query
// objects and raw SQL ($queryRaw) so every analytics query scopes consistently.
//
// Rules (match the documented business requirement):
//   super_boss  -> sees ALL data            (resolver returns null = "no restriction")
//   manager     -> sees self + FULL recursive reporting subtree (manager-of-managers)
//   employee    -> sees only their own data ([self])
//   unknown/null -> sees NOTHING ([]). Never falls back to "all".
//
// See docs/plans/2026-06-14-dashboard-rbac-analytics-plan.md (Phase 0).

import { Prisma } from '@prisma/client';
import prisma from '../db';

const SUBTREE_TTL_MS = 5 * 60 * 1000; // hierarchy rarely changes; 5-min cache
const subtreeCache = new Map<string, { ids: string[]; expires: number }>();

/**
 * Resolve the set of agent IDs visible to the requester for analytics.
 * @returns `null` for super_boss (no restriction — caller skips the filter),
 *          otherwise the explicit list of visible agent IDs (possibly `[]`).
 */
export async function resolveVisibleAgentIds(
  agentId: string | undefined,
  role: string | undefined,
  tenantId: string | undefined
): Promise<string[] | null> {
  if (!agentId || !tenantId) return []; // unauthenticated / malformed -> no data
  if (role === 'super_boss') return null; // no restriction
  if (role === 'employee') return [agentId]; // self only
  if (role === 'manager') return getManagerSubtree(agentId, tenantId);
  return [agentId]; // unknown role -> self only (safe default, never "all")
}

/** Manager + everyone reporting (transitively) under them, via one recursive CTE. */
async function getManagerSubtree(managerId: string, tenantId: string): Promise<string[]> {
  const key = `${tenantId}:${managerId}`;
  const now = Date.now();
  const cached = subtreeCache.get(key);
  if (cached && cached.expires > now) return cached.ids;

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE subtree AS (
      SELECT id FROM agents WHERE id = ${managerId} AND tenant_id = ${tenantId}
      UNION ALL
      SELECT a.id FROM agents a
      INNER JOIN subtree s ON a.reports_to_id = s.id
      WHERE a.tenant_id = ${tenantId}
    )
    SELECT id FROM subtree
  `;
  const ids = rows.map((r) => r.id);
  if (!ids.includes(managerId)) ids.push(managerId); // always include self
  subtreeCache.set(key, { ids, expires: now + SUBTREE_TTL_MS });
  return ids;
}

/**
 * Invalidate the subtree cache after a hierarchy change (reports_to edit,
 * agent create/deactivate). Call with a tenantId to clear just that tenant,
 * or no args to clear everything.
 */
export function invalidateSubtreeCache(tenantId?: string): void {
  if (!tenantId) {
    subtreeCache.clear();
    return;
  }
  for (const k of subtreeCache.keys()) {
    if (k.startsWith(`${tenantId}:`)) subtreeCache.delete(k);
  }
}

// ───────────────────────── Prisma query-object helpers ─────────────────────────

/**
 * Scope a single agent-FK field (e.g. assigned_to_agent_id, executive_agent_id,
 * uploaded_by_agent_id) to the visible set.
 * Returns `{}` for super_boss (no restriction). Merge into an existing `where`
 * with object spread; it adds at most one key so it never clobbers an `OR`.
 */
export function scopeByAgentField(field: string, ids: string[] | null): Record<string, unknown> {
  if (ids === null) return {};
  return { [field]: { in: ids } };
}

/**
 * Contact attribution OR-clause: a contact is in-scope if it is assigned to,
 * created by, or owned-by-manager within the visible set.
 * Returns `null` for super_boss. The returned array MUST be combined via the
 * AND-wrap pattern (see docs/precautions/prisma-where-or-pattern.md) so it does
 * not clobber other ORs:
 *   const or = contactScopeOR(ids);
 *   if (or) where.AND = [...(where.AND ?? []), { OR: or }];
 */
export function contactScopeOR(ids: string[] | null): Prisma.ContactWhereInput[] | null {
  if (ids === null) return null;
  return [
    { assigned_agent_id: { in: ids } },
    { created_by: { in: ids } },
    { owning_manager_id: { in: ids } },
  ];
}

/**
 * Inventory attribution OR-clause: in-scope if uploaded by, assigned to, or
 * owned-by-manager within the visible set. Combine via the AND-wrap pattern.
 * Returns `null` for super_boss.
 */
export function inventoryScopeOR(ids: string[] | null): Prisma.InventoryWhereInput[] | null {
  if (ids === null) return null;
  return [
    { uploaded_by_agent_id: { in: ids } },
    { assigned_agent_id: { in: ids } },
    { owning_manager_id: { in: ids } },
  ];
}

// ───────────────────────── raw SQL ($queryRaw) helpers ─────────────────────────
// Column names are caller-controlled literals (never user input) -> Prisma.raw is safe.
// Values are always parameterized via Prisma.join.

/** ` AND <column> IN (...)` fragment, or empty for super_boss, or ` AND false` for empty set. */
export function rawAgentFilter(column: string, ids: string[] | null): Prisma.Sql {
  if (ids === null) return Prisma.empty;
  if (ids.length === 0) return Prisma.sql` AND false`;
  return Prisma.sql` AND ${Prisma.raw(column)} IN (${Prisma.join(ids)})`;
}

/**
 * ` AND (assigned_agent_id IN (...) OR created_by IN (...) OR owning_manager_id IN (...))`.
 * @param alias optional table alias/prefix WITHOUT trailing dot (e.g. "c").
 */
export function rawContactFilter(ids: string[] | null, alias = ''): Prisma.Sql {
  if (ids === null) return Prisma.empty;
  if (ids.length === 0) return Prisma.sql` AND false`;
  const p = alias ? `${alias}.` : '';
  return Prisma.sql` AND (${Prisma.raw(p + 'assigned_agent_id')} IN (${Prisma.join(ids)})
    OR ${Prisma.raw(p + 'created_by')} IN (${Prisma.join(ids)})
    OR ${Prisma.raw(p + 'owning_manager_id')} IN (${Prisma.join(ids)}))`;
}

/**
 * ` AND (uploaded_by_agent_id IN (...) OR assigned_agent_id IN (...) OR owning_manager_id IN (...))`.
 * @param alias optional table alias/prefix WITHOUT trailing dot (e.g. "i").
 */
export function rawInventoryFilter(ids: string[] | null, alias = ''): Prisma.Sql {
  if (ids === null) return Prisma.empty;
  if (ids.length === 0) return Prisma.sql` AND false`;
  const p = alias ? `${alias}.` : '';
  return Prisma.sql` AND (${Prisma.raw(p + 'uploaded_by_agent_id')} IN (${Prisma.join(ids)})
    OR ${Prisma.raw(p + 'assigned_agent_id')} IN (${Prisma.join(ids)})
    OR ${Prisma.raw(p + 'owning_manager_id')} IN (${Prisma.join(ids)}))`;
}

/**
 * Scope a table that links to a contact only by `phone_number` (e.g. interactions,
 * whatsapp_messages) via the contact's attribution. Emits a correlated subquery.
 * @param alias optional alias of the phone-bearing table WITHOUT trailing dot.
 */
export function rawContactJoinFilter(ids: string[] | null, tenantId: string, alias = ''): Prisma.Sql {
  if (ids === null) return Prisma.empty;
  if (ids.length === 0) return Prisma.sql` AND false`;
  const col = alias ? `${alias}.phone_number` : 'phone_number';
  return Prisma.sql` AND ${Prisma.raw(col)} IN (SELECT phone_number FROM contacts WHERE tenant_id = ${tenantId}${rawContactFilter(ids)})`;
}
