import React, { useMemo, useState } from 'react';
import { getUserPerformance, getDistribution, getManagementAlerts, getSpeedToLead } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { ClayCard, SectionLabel, KpiCard, formatNum, formatINR, formatMins } from './analytics/clay';
import { RangeBar, defaultRange, type DateRange } from './analytics/FilterBar';
import { Leaderboard, RankedBars, type LeaderRow } from './analytics/charts';
import { useAsyncData, LoadingState, ErrorState, EmptyState } from './analytics/AsyncState';
import { TargetsEditor } from './analytics/TargetsEditor';
import { drillTo } from '../../lib/drill';

interface PerfRow extends LeaderRow {
  role: string;
  hot_leads: number;
  appointments_scheduled: number;
  appointments_completed: number;
  inventory_added: number;
  components?: { leads: number; conversion: number; appointments: number; inventory: number };
  commission?: number;
}

type SortKey = 'score' | 'deals' | 'revenue' | 'leads';

const catColor = (cat: string): string =>
  cat === 'Excellent' ? '#22c55e' : cat === 'Good' ? '#3b82f6' : cat === 'Average' ? '#f59e0b' : '#ef4444';

export const UserPerformanceDashboard: React.FC = () => {
  const { agent, hasPermission } = useAuth();
  const isMobile = useIsMobile();
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [sortBy, setSortBy] = useState<SortKey>('score');

  const heading = agent?.role === 'employee'
    ? { title: 'My Performance', sub: 'Your metrics for the selected period' }
    : agent?.role === 'manager'
    ? { title: 'Team Performance', sub: "Your team's productivity and conversion" }
    : { title: 'User Performance', sub: 'Per-agent productivity across the org' };

  const { status, data, reload } = useAsyncData(
    () => {
      const fromTo = { from: range.from.toISOString(), to: range.to.toISOString() };
      const span = range.to.getTime() - range.from.getTime();
      const prev = { from: new Date(range.from.getTime() - span).toISOString(), to: new Date(range.from.getTime() - 1).toISOString() };
      return Promise.all([
        getUserPerformance(fromTo),
        getUserPerformance(prev),
        getDistribution(fromTo).catch(() => ({ load: [] })),
        getManagementAlerts().catch(() => ({ alerts: [] })),
        getSpeedToLead(fromTo).catch(() => ({ by_agent: [] })),
      ]).then(([cur, prv, dist, alertsRes, stlRes]) => ({
        cur: (cur?.performance || []) as PerfRow[],
        prv: (prv?.performance || []) as PerfRow[],
        load: (dist?.load || []) as Array<{ agent_id: string; agent_name: string; active_leads: number }>,
        inactive: ((((alertsRes?.alerts || []) as any[]).find((a) => a.type === 'inactive_agents'))?.count) || 0,
        stlByAgent: (stlRes?.by_agent || []) as Array<{ agent_id: string; avg_minutes: number; n: number }>,
      }));
    },
    [range.from, range.to],
    (d) => d.cur.length === 0,
  );
  const rows = useMemo<PerfRow[]>(() => data?.cur ?? [], [data]);
  const prevRows = useMemo<PerfRow[]>(() => data?.prv ?? [], [data]);
  const load = useMemo(() => data?.load ?? [], [data]);
  const inactiveCount = data?.inactive ?? 0;
  const belowTarget = useMemo(() => rows.filter((r) => r.productivity_category === 'Needs Improvement').length, [rows]);
  const overloaded = useMemo(() => load.filter((l) => l.active_leads > 150).length, [load]);
  const stlMap = useMemo(() => new Map((data?.stlByAgent ?? []).map((s) => [s.agent_id, s.avg_minutes])), [data]);
  const slowResponders = useMemo(() => (data?.stlByAgent ?? []).filter((s) => s.avg_minutes > 60).length, [data]);
  const composition = useMemo(() => {
    const withComp = rows.filter((r) => r.components);
    const n = withComp.length || 1;
    const s = (f: (c: NonNullable<PerfRow['components']>) => number) => Math.round(withComp.reduce((a, r) => a + f(r.components!), 0) / n);
    return [
      { label: 'Leads', count: s((c) => c.leads) },
      { label: 'Conversion', count: s((c) => c.conversion) },
      { label: 'Appointments', count: s((c) => c.appointments) },
      { label: 'Inventory', count: s((c) => c.inventory) },
    ];
  }, [rows]);

  const sum = (rs: PerfRow[], f: (r: PerfRow) => number) => rs.reduce((s, r) => s + (f(r) || 0), 0);
  const avg = (rs: PerfRow[], f: (r: PerfRow) => number) => (rs.length ? sum(rs, f) / rs.length : 0);
  const delta = (cur: number, prev: number): number | null => (prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : null);

  const totals = useMemo(() => ({
    leads: sum(rows, (r) => r.leads_assigned),
    hot: sum(rows, (r) => r.hot_leads),
    appts: sum(rows, (r) => r.appointments_completed),
    deals: sum(rows, (r) => r.deals_closed),
    revenue: sum(rows, (r) => r.revenue_generated),
    score: avg(rows, (r) => r.productivity_score),
  }), [rows]);
  const prevTotals = useMemo(() => ({
    leads: sum(prevRows, (r) => r.leads_assigned),
    deals: sum(prevRows, (r) => r.deals_closed),
    revenue: sum(prevRows, (r) => r.revenue_generated),
    score: avg(prevRows, (r) => r.productivity_score),
  }), [prevRows]);

  const dist = useMemo(() => {
    const d: Record<string, number> = { Excellent: 0, Good: 0, Average: 0, 'Needs Improvement': 0 };
    rows.forEach((r) => { d[r.productivity_category] = (d[r.productivity_category] || 0) + 1; });
    return d;
  }, [rows]);

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    switch (sortBy) {
      case 'deals': return b.deals_closed - a.deals_closed;
      case 'revenue': return b.revenue_generated - a.revenue_generated;
      case 'leads': return b.leads_assigned - a.leads_assigned;
      default: return (b.productivity_score ?? 0) - (a.productivity_score ?? 0);
    }
  }), [rows, sortBy]);

  if (status === 'loading') return <LoadingState label="Loading performance…" />;
  if (status === 'error') return <ErrorState onRetry={reload} />;
  if (status === 'empty') return <EmptyState icon="👥" title="No performance data yet" hint="Scores appear once agents in your view have activity in the selected period." />;

  const pad = isMobile ? 16 : '24px 32px';
  const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '11px 12px', fontSize: 13, color: 'var(--text-primary)', textAlign: 'right', whiteSpace: 'nowrap' };
  const SORTS: Array<{ k: SortKey; label: string }> = [
    { k: 'score', label: 'Productivity' }, { k: 'deals', label: 'Deals' }, { k: 'revenue', label: 'Revenue' }, { k: 'leads', label: 'Leads' },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: pad, backgroundColor: 'var(--bg-primary)' }}>
      <div>
        <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>👥 {heading.title}</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>{heading.sub}</p>
      </div>

      <RangeBar range={range} onRange={setRange} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 14 }}>
        {/* Per-manager targets editor (Phase 5B) — only for users who can manage a team */}
        {hasPermission('manage_team') && <TargetsEditor onSaved={reload} />}

        {/* Coaching signals */}
        <div>
          <SectionLabel icon="⚡">Coaching Signals</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--bento-gap)' }}>
            <KpiCard label="Below Target" value={formatNum(belowTarget)} accent="#ef4444" icon="📉" />
            <KpiCard label="Inactive Agents" value={formatNum(inactiveCount)} accent="#f59e0b" icon="😴" />
            <KpiCard label="Overloaded (150+)" value={formatNum(overloaded)} accent="#8b5cf6" icon="🥵" />
            <KpiCard label="Slow Responders (>1h)" value={formatNum(slowResponders)} accent="#f43f5e" icon="🐌" />
          </div>
        </div>

        {/* KPI strip */}
        <div>
          <SectionLabel icon="📊">Team Totals</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--bento-gap)' }}>
            <KpiCard label="Leads" value={formatNum(totals.leads)} delta={delta(totals.leads, prevTotals.leads)} accent="#3b82f6" icon="👥" />
            <KpiCard label="Deals Closed" value={formatNum(totals.deals)} delta={delta(totals.deals, prevTotals.deals)} accent="#22c55e" icon="✅" />
            <KpiCard label="Revenue" value={formatINR(totals.revenue)} delta={delta(totals.revenue, prevTotals.revenue)} accent="#f59e0b" icon="₹" />
            <KpiCard label="Appts Done" value={formatNum(totals.appts)} accent="#06b6d4" icon="📅" />
            <KpiCard label="Hot Leads" value={formatNum(totals.hot)} accent="#ef4444" icon="🔥" />
            <KpiCard label="Avg Score" value={Math.round(totals.score)} delta={totals.score - prevTotals.score} deltaSuffix="pt" accent="#8b5cf6" icon="⭐" />
          </div>
        </div>

        {/* Score composition */}
        <ClayCard title="Score Composition" subtitle="Workforce-average of the 4 score components (0–100 each)">
          <RankedBars rows={composition} color="#8b5cf6" emptyIcon="⭐" emptyText="No scored agents in scope" />
        </ClayCard>

        {/* Distribution + Leaderboard */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(260px, 340px) 1fr', gap: 14 }}>
          <ClayCard title="Productivity Mix" subtitle="How the team is distributed">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(dist).map(([cat, n]) => {
                const total = rows.length || 1;
                return (
                  <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 120, fontSize: 12.5, color: 'var(--text-secondary)', flexShrink: 0 }}>{cat}</span>
                    <div style={{ flex: 1, height: 16, borderRadius: 5, backgroundColor: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                      <div style={{ width: `${(n / total) * 100}%`, height: '100%', backgroundColor: catColor(cat), borderRadius: 5, transition: 'width 600ms ease' }} />
                    </div>
                    <span style={{ width: 28, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' }}>{n}</span>
                  </div>
                );
              })}
            </div>
          </ClayCard>
          <ClayCard title="Leaderboard" subtitle="Ranked by productivity score">
            <Leaderboard rows={sorted} />
          </ClayCard>
        </div>

        {/* Detailed table */}
        <ClayCard
          title="All Agents"
          subtitle="Full per-agent breakdown"
          right={
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {SORTS.map((s) => (
                <button key={s.k} onClick={() => setSortBy(s.k)} className={`chip ${sortBy === s.k ? 'chip-active' : 'chip-inactive'}`} style={{ minHeight: 30, fontSize: 12, padding: '4px 10px' }}>{s.label}</button>
              ))}
            </div>
          }
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <th style={{ ...th, textAlign: 'left' }}>Agent</th>
                  <th style={th}>Leads</th>
                  <th style={th}>Hot</th>
                  <th style={th}>Appts</th>
                  <th style={th}>Done</th>
                  <th style={th}>Deals</th>
                  <th style={th}>Revenue</th>
                  <th style={th}>Commission</th>
                  <th style={th}>Inventory</th>
                  <th style={th}>Response</th>
                  <th style={th}>Score</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr key={p.agent_id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: '#3b82f6', cursor: 'pointer' }} title="View this agent's leads →" onClick={() => drillTo({ entity: 'leads', filter: { agent_id: p.agent_id } })}>{p.agent_name}</td>
                    <td style={td}>{formatNum(p.leads_assigned)}</td>
                    <td style={{ ...td, color: '#ef4444' }}>{formatNum(p.hot_leads)}</td>
                    <td style={td}>{formatNum(p.appointments_scheduled)}</td>
                    <td style={{ ...td, color: '#22c55e' }}>{formatNum(p.appointments_completed)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{formatNum(p.deals_closed)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{formatINR(p.revenue_generated)}</td>
                    <td style={{ ...td, fontWeight: 700, color: '#f59e0b' }}>{formatINR(p.commission || 0)}</td>
                    <td style={td}>{formatNum(p.inventory_added)}</td>
                    <td style={td}>{formatMins(stlMap.get(p.agent_id))}</td>
                    <td style={td}>
                      <span style={{ fontWeight: 800, marginRight: 6 }}>{Math.round(p.productivity_score ?? 0)}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: catColor(p.productivity_category), backgroundColor: catColor(p.productivity_category) + '1a', borderRadius: 7, padding: '2px 7px' }}>{p.productivity_category}</span>
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr><td colSpan={11} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No performance data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </ClayCard>
      </div>
    </div>
  );
};
