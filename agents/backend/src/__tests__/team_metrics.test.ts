import { describe, it, expect } from 'vitest';
import { aggregateTeams, type AgentMetrics } from '../services/team_metrics';

const mk = (over: Partial<AgentMetrics>): AgentMetrics => ({
  id: 'x',
  name: 'X',
  role: 'employee',
  reports_to_id: null,
  leads: 0,
  hot_leads: 0,
  appointments: 0,
  appointments_completed: 0,
  deals_closed: 0,
  revenue: 0,
  inventory_added: 0,
  ...over,
});

describe('aggregateTeams', () => {
  it('groups a manager + their direct reports into one team headed by the manager', () => {
    const agents = [
      mk({ id: 'm1', name: 'Ashwani', role: 'manager', leads: 10, deals_closed: 1, revenue: 100, appointments: 4, appointments_completed: 2 }),
      mk({ id: 'e1', name: 'Sahil', reports_to_id: 'm1', leads: 5, deals_closed: 2, revenue: 200, inventory_added: 3 }),
      mk({ id: 'e2', name: 'Ashish', reports_to_id: 'm1', leads: 5, deals_closed: 0, appointments: 2, appointments_completed: 1 }),
    ];
    const teams = aggregateTeams(agents);
    expect(teams).toHaveLength(1);
    const t = teams[0];
    expect(t.team_id).toBe('m1');
    expect(t.team_name).toBe('Ashwani');
    expect(t.member_count).toBe(3);
    expect(t.leads).toBe(20);
    expect(t.deals_closed).toBe(3);
    expect(t.revenue).toBe(300);
    expect(t.inventory_added).toBe(3);
    expect(t.conversion_rate).toBe(15); // 3/20*100
    expect(t.appointment_completion_rate).toBe(50); // 3/6*100
  });

  it('separates two managers into two teams (super_boss org view)', () => {
    const agents = [
      mk({ id: 'm1', name: 'A', role: 'manager', deals_closed: 1 }),
      mk({ id: 'e1', reports_to_id: 'm1', deals_closed: 2 }),
      mk({ id: 'm2', name: 'B', role: 'manager', deals_closed: 5 }),
      mk({ id: 'e2', reports_to_id: 'm2' }),
    ];
    const teams = aggregateTeams(agents);
    expect(teams).toHaveLength(2);
    // sorted by deals_closed desc -> B's team (5) first, A's team (3) second
    expect(teams[0].team_name).toBe('B');
    expect(teams[0].deals_closed).toBe(5);
    expect(teams[1].deals_closed).toBe(3);
  });

  it('buckets agents with no manager into "Unassigned"', () => {
    const agents = [
      mk({ id: 'e1', leads: 5 }), // employee, no reports_to_id
      mk({ id: 'e2', leads: 3 }),
    ];
    const teams = aggregateTeams(agents);
    expect(teams).toHaveLength(1);
    expect(teams[0].team_id).toBe('unassigned');
    expect(teams[0].team_name).toBe('Unassigned');
    expect(teams[0].leads).toBe(8);
  });

  it('a sub-manager forms their own team (no double-count up the chain)', () => {
    const agents = [
      mk({ id: 'top', name: 'Top', role: 'manager', deals_closed: 1 }),
      mk({ id: 'sub', name: 'Sub', role: 'manager', reports_to_id: 'top', deals_closed: 4 }),
      mk({ id: 'e1', reports_to_id: 'sub', deals_closed: 2 }),
    ];
    const teams = aggregateTeams(agents);
    // Top's team = {Top} only; Sub's team = {Sub, e1}. Sub's production NOT in Top's totals.
    const top = teams.find((t) => t.team_id === 'top')!;
    const sub = teams.find((t) => t.team_id === 'sub')!;
    expect(top.member_count).toBe(1);
    expect(top.deals_closed).toBe(1);
    expect(sub.member_count).toBe(2);
    expect(sub.deals_closed).toBe(6);
  });

  it('guards division by zero (no leads / no appointments -> 0 rates)', () => {
    const teams = aggregateTeams([mk({ id: 'm1', role: 'manager' })]);
    expect(teams[0].conversion_rate).toBe(0);
    expect(teams[0].appointment_completion_rate).toBe(0);
    expect(teams[0].team_score).toBe(0);
    expect(teams[0].team_category).toBe('Needs Improvement');
  });

  it('computes a leads-weighted team productivity score', () => {
    const agents = [
      mk({ id: 'm1', role: 'manager', leads: 10, productivity: 80 }),
      mk({ id: 'e1', reports_to_id: 'm1', leads: 30, productivity: 40 }),
    ];
    const [t] = aggregateTeams(agents);
    // (80*10 + 40*30) / 40 = 2000/40 = 50
    expect(t.team_score).toBe(50);
    expect(t.team_category).toBe('Average');
  });

  it('team score falls back to a simple average when the team has no leads', () => {
    const agents = [
      mk({ id: 'm1', role: 'manager', leads: 0, productivity: 60 }),
      mk({ id: 'e1', reports_to_id: 'm1', leads: 0, productivity: 80 }),
    ];
    const [t] = aggregateTeams(agents);
    expect(t.team_score).toBe(70); // (60+80)/2
  });
});
