// src/services/alerts.ts
//
// Phase 3 — Management Alerts engine (pure classification; the route supplies the
// already-scoped raw numbers and this turns them into prioritised alert cards).
//
// All inputs are produced under the requester's visibility scope (see analytics_scope),
// so a manager's alerts cover only their team. No schema change — everything is derived
// from existing data. See docs/plans/2026-06-14-dashboard-rbac-analytics-plan.md (Phase 3).

export type AlertSeverity = 'high' | 'medium' | 'low';

export interface AlertInputs {
  /** Visible agents with zero leads + appointments + inventory in the recent window. */
  inactiveAgents: string[];
  inventoryMissingPhotos: number;
  inventoryMissingPrice: number;
  /** Active leads not touched within the stale threshold. */
  staleLeads: number;
  /** Visible agents who have not connected Google Calendar/Tasks. */
  googleNotConnected: string[];
  /** Window labels for human-readable detail text. */
  recentDays: number;
  staleDays: number;
}

export interface Alert {
  type: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  count: number;
  names?: string[];
}

const SEV_ORDER: Record<AlertSeverity, number> = { high: 0, medium: 1, low: 2 };

/** Build the prioritised alert list. Alerts with count 0 are omitted. */
export function buildAlerts(i: AlertInputs): Alert[] {
  const out: Alert[] = [];

  if (i.inactiveAgents.length > 0) {
    out.push({
      type: 'inactive_agents',
      severity: i.inactiveAgents.length >= 3 ? 'high' : 'medium',
      title: 'Inactive team members',
      detail: `${i.inactiveAgents.length} member(s) had no leads, appointments or inventory in the last ${i.recentDays} days`,
      count: i.inactiveAgents.length,
      names: i.inactiveAgents,
    });
  }

  if (i.staleLeads > 0) {
    out.push({
      type: 'stale_leads',
      severity: i.staleLeads >= 10 ? 'high' : 'medium',
      title: 'Neglected active leads',
      detail: `${i.staleLeads} active lead(s) not contacted in over ${i.staleDays} days`,
      count: i.staleLeads,
    });
  }

  if (i.inventoryMissingPrice > 0) {
    out.push({
      type: 'inventory_missing_price',
      severity: i.inventoryMissingPrice >= 10 ? 'high' : 'medium',
      title: 'Listings missing price',
      detail: `${i.inventoryMissingPrice} active listing(s) have no price set`,
      count: i.inventoryMissingPrice,
    });
  }

  if (i.inventoryMissingPhotos > 0) {
    out.push({
      type: 'inventory_missing_photos',
      severity: i.inventoryMissingPhotos >= 10 ? 'high' : 'medium',
      title: 'Listings missing photos',
      detail: `${i.inventoryMissingPhotos} active listing(s) have no photos`,
      count: i.inventoryMissingPhotos,
    });
  }

  if (i.googleNotConnected.length > 0) {
    out.push({
      type: 'google_not_connected',
      severity: 'low',
      title: 'Google Calendar not connected',
      detail: `${i.googleNotConnected.length} member(s) have not connected Google Calendar/Tasks`,
      count: i.googleNotConnected.length,
      names: i.googleNotConnected,
    });
  }

  out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.count - a.count);
  return out;
}
