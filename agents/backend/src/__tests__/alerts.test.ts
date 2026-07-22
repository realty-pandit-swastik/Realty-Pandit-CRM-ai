import { describe, it, expect } from 'vitest';
import { buildAlerts, type AlertInputs } from '../services/alerts';

const base: AlertInputs = {
  inactiveAgents: [],
  inventoryMissingPhotos: 0,
  inventoryMissingPrice: 0,
  staleLeads: 0,
  googleNotConnected: [],
  recentDays: 7,
  staleDays: 14,
};

describe('buildAlerts', () => {
  it('returns nothing when everything is clean', () => {
    expect(buildAlerts(base)).toEqual([]);
  });

  it('omits zero-count alerts but includes non-zero ones', () => {
    const alerts = buildAlerts({ ...base, staleLeads: 4 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('stale_leads');
    expect(alerts[0].count).toBe(4);
  });

  it('escalates severity by threshold', () => {
    expect(buildAlerts({ ...base, staleLeads: 4 })[0].severity).toBe('medium');
    expect(buildAlerts({ ...base, staleLeads: 10 })[0].severity).toBe('high');
    expect(buildAlerts({ ...base, inactiveAgents: ['a', 'b'] })[0].severity).toBe('medium');
    expect(buildAlerts({ ...base, inactiveAgents: ['a', 'b', 'c'] })[0].severity).toBe('high');
  });

  it('google-not-connected is always low severity', () => {
    const a = buildAlerts({ ...base, googleNotConnected: ['x', 'y', 'z', 'w'] });
    expect(a[0].severity).toBe('low');
  });

  it('orders high severity before medium before low', () => {
    const alerts = buildAlerts({
      ...base,
      staleLeads: 12, // high
      inventoryMissingPhotos: 2, // medium
      googleNotConnected: ['x'], // low
    });
    expect(alerts.map((a) => a.severity)).toEqual(['high', 'medium', 'low']);
  });

  it('carries agent names through for actionable alerts', () => {
    const a = buildAlerts({ ...base, inactiveAgents: ['Ritu', 'Sonu'] });
    expect(a[0].names).toEqual(['Ritu', 'Sonu']);
  });
});
