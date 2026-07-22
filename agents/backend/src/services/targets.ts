// src/services/targets.ts
//
// Per-manager productivity targets (Phase 5B). Each manager sets monthly targets for their
// team; scoring falls back to DEFAULT_MONTHLY_TARGETS when a manager has no row.

import prisma from '../db';
import { DEFAULT_MONTHLY_TARGETS, type ProductivityTargets } from './scoring';

const KEY = (tenantId: string, managerId: string) => ({
  tenant_id_manager_agent_id_period: { tenant_id: tenantId, manager_agent_id: managerId, period: 'monthly' },
});

function toTargets(r: { leads: number; appointments: number; inventory: number; conversion_rate: number }): ProductivityTargets {
  return { leads: r.leads, appointments: r.appointments, inventory: r.inventory, conversionRate: r.conversion_rate };
}

/** One manager's monthly targets, or the defaults. */
export async function getTargetsForManager(tenantId: string, managerId: string): Promise<ProductivityTargets> {
  const row = await prisma.target.findUnique({ where: KEY(tenantId, managerId) }).catch(() => null);
  return row ? toTargets(row) : DEFAULT_MONTHLY_TARGETS;
}

/** Batch: Map(managerId → targets) for the given managers (missing ones simply absent). */
export async function getTargetsMap(tenantId: string, managerIds: string[]): Promise<Map<string, ProductivityTargets>> {
  const ids = [...new Set(managerIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await prisma.target.findMany({
    where: { tenant_id: tenantId, period: 'monthly', manager_agent_id: { in: ids } },
  }).catch(() => []);
  return new Map(rows.map((r) => [r.manager_agent_id, toTargets(r)]));
}

/** Upsert a manager's monthly targets. */
export async function upsertTargets(tenantId: string, managerId: string, t: ProductivityTargets) {
  return prisma.target.upsert({
    where: KEY(tenantId, managerId),
    update: { leads: t.leads, appointments: t.appointments, inventory: t.inventory, conversion_rate: t.conversionRate },
    create: {
      tenant_id: tenantId, manager_agent_id: managerId, period: 'monthly',
      leads: t.leads, appointments: t.appointments, inventory: t.inventory, conversion_rate: t.conversionRate,
    },
  });
}
