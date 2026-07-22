// src/services/team_metrics.ts
//
// Pure team-rollup aggregation for the Team Performance dashboard (Phase 1).
//
// Team membership model (direct, no double-counting in nested orgs):
//   team_key(agent) = agent.id            if the agent IS a manager (they head their team)
//                   = agent.reports_to_id if they report to someone
//                   = 'unassigned'        otherwise
// So each manager heads exactly one team (themselves + their DIRECT reports); a
// sub-manager forms their own team rather than inflating their boss's numbers.
//
// This is intentionally separate from analytics_scope.ts: that module decides what
// a requester may SEE (recursive subtree); this one decides how visible agents roll
// UP into team units for display. See docs/plans/2026-06-14-dashboard-rbac-analytics-plan.md.

import { categorize, type ScoreCategory } from './scoring';

export interface AgentMetrics {
  id: string;
  name: string;
  role: string;
  reports_to_id: string | null;
  leads: number;
  hot_leads: number;
  appointments: number;
  appointments_completed: number;
  deals_closed: number;
  revenue: number;
  inventory_added: number;
  /** Per-agent productivity score (0–100), computed by the caller via scoring.ts. */
  productivity?: number;
}

export interface TeamRollup {
  team_id: string;
  team_name: string;
  member_count: number;
  leads: number;
  hot_leads: number;
  appointments: number;
  appointments_completed: number;
  deals_closed: number;
  revenue: number;
  inventory_added: number;
  conversion_rate: number; // deals_closed / leads * 100
  appointment_completion_rate: number; // completed / scheduled * 100
  team_score: number; // leads-weighted avg of member productivity (0–100)
  team_category: ScoreCategory;
}

const UNASSIGNED = 'unassigned';

function teamKey(a: AgentMetrics): string {
  if (a.role === 'manager') return a.id;
  return a.reports_to_id ?? UNASSIGNED;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Roll a flat list of per-agent metrics up into one row per team.
 * Returns teams sorted by deals_closed desc (callers may re-sort).
 */
export function aggregateTeams(agents: AgentMetrics[]): TeamRollup[] {
  const byKey = new Map<string, TeamRollup>();
  const nameById = new Map(agents.map((a) => [a.id, a.name]));
  // Per-team accumulators for the leads-weighted productivity average.
  const scoreAgg = new Map<string, { wSum: number; leadSum: number; simpleSum: number; n: number }>();

  for (const a of agents) {
    const key = teamKey(a);
    let t = byKey.get(key);
    if (!t) {
      t = {
        team_id: key,
        team_name: key === UNASSIGNED ? 'Unassigned' : nameById.get(key) ?? key,
        member_count: 0,
        leads: 0,
        hot_leads: 0,
        appointments: 0,
        appointments_completed: 0,
        deals_closed: 0,
        revenue: 0,
        inventory_added: 0,
        conversion_rate: 0,
        appointment_completion_rate: 0,
        team_score: 0,
        team_category: 'Needs Improvement',
      };
      byKey.set(key, t);
      scoreAgg.set(key, { wSum: 0, leadSum: 0, simpleSum: 0, n: 0 });
    }
    t.member_count += 1;
    t.leads += a.leads;
    t.hot_leads += a.hot_leads;
    t.appointments += a.appointments;
    t.appointments_completed += a.appointments_completed;
    t.deals_closed += a.deals_closed;
    t.revenue += a.revenue;
    t.inventory_added += a.inventory_added;

    const prod = a.productivity ?? 0;
    const agg = scoreAgg.get(key)!;
    agg.wSum += prod * a.leads;
    agg.leadSum += a.leads;
    agg.simpleSum += prod;
    agg.n += 1;
  }

  const teams = [...byKey.values()];
  for (const t of teams) {
    t.conversion_rate = t.leads > 0 ? round1((t.deals_closed / t.leads) * 100) : 0;
    t.appointment_completion_rate =
      t.appointments > 0 ? round1((t.appointments_completed / t.appointments) * 100) : 0;
    // Leads-weighted team productivity, falling back to a simple average when the
    // team has handled no leads (so a brand-new team still gets a fair number).
    const agg = scoreAgg.get(t.team_id)!;
    t.team_score = Math.round(agg.leadSum > 0 ? agg.wSum / agg.leadSum : agg.n > 0 ? agg.simpleSum / agg.n : 0);
    t.team_category = categorize(t.team_score);
  }
  teams.sort((a, b) => b.deals_closed - a.deals_closed || b.revenue - a.revenue);
  return teams;
}
