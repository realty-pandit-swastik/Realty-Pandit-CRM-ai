import React, { useMemo, useState } from 'react';
import { getTeamPerformance, getDistribution, getGciForecast } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { ClayCard, SectionLabel, KpiCard, formatNum, formatINR } from './analytics/clay';
import { RangeBar, defaultRange, type DateRange } from './analytics/FilterBar';
import { ValueBars, RankedBars } from './analytics/charts';
import { useAsyncData, LoadingState, ErrorState, EmptyState } from './analytics/AsyncState';
import { drillTo } from '../../lib/drill';

interface TeamRow {
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
  conversion_rate: number;
  appointment_completion_rate: number;
  team_score: number;
  team_category: string;
}

type SortKey = 'score' | 'deals' | 'revenue' | 'conversion';

const catColor = (cat: string): string =>
  cat === 'Excellent' ? '#22c55e' : cat === 'Good' ? '#3b82f6' : cat === 'Average' ? '#f59e0b' : '#ef4444';

export const TeamPerformanceDashboard: React.FC = () => {
  const { agent } = useAuth();
  const isMobile = useIsMobile();
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [sortBy, setSortBy] = useState<SortKey>('deals');

  const { status, data, reload } = useAsyncData(
    () => {
      const fromTo = { from: range.from.toISOString(), to: range.to.toISOString() };
      return Promise.all([
        getTeamPerformance(fromTo),
        getDistribution(fromTo).catch(() => ({ load: [], unassigned_leads: 0, by_route: [], by_method: [] })),
        getGciForecast().catch(() => null),
      ]).then(([tp, dist, gciRes]) => ({
        teams: (tp?.teams || []) as TeamRow[],
        load: (dist?.load || []) as Array<{ agent_id: string; agent_name: string; active_leads: number }>,
        unassigned: (dist?.unassigned_leads || 0) as number,
        byRoute: (dist?.by_route || []) as Array<{ route: string; count: number }>,
        byMethod: (dist?.by_method || []) as Array<{ method: string; count: number }>,
        gci: (gciRes || null) as any,
      }));
    },
    [range.from, range.to],
    (d) => d.teams.length === 0,
  );
  const teams = useMemo<TeamRow[]>(() => data?.teams ?? [], [data]);
  const load = useMemo(() => data?.load ?? [], [data]);
  const unassignedLeads = data?.unassigned ?? 0;
  const byRoute = useMemo(() => data?.byRoute ?? [], [data]);
  const byMethod = useMemo(() => data?.byMethod ?? [], [data]);
  const gci = data?.gci ?? null;
  const unassignedAgents = useMemo(() => teams.find((t) => t.team_name === 'Unassigned')?.member_count ?? 0, [teams]);
  const teamsOffTarget = useMemo(() => teams.filter((t) => t.team_score < 40).length, [teams]);

  const sum = (f: (t: TeamRow) => number) => teams.reduce((s, t) => s + (f(t) || 0), 0);
  const totals = useMemo(() => {
    const leads = sum((t) => t.leads);
    const deals = sum((t) => t.deals_closed);
    return {
      teams: teams.length,
      leads,
      deals,
      revenue: sum((t) => t.revenue),
      conv: leads > 0 ? (deals / leads) * 100 : 0,
      topScore: teams.reduce((m, t) => Math.max(m, t.team_score), 0),
    };
  }, [teams]);

  const sorted = useMemo(() => [...teams].sort((a, b) => {
    switch (sortBy) {
      case 'score': return b.team_score - a.team_score;
      case 'revenue': return b.revenue - a.revenue;
      case 'conversion': return b.conversion_rate - a.conversion_rate;
      default: return b.deals_closed - a.deals_closed;
    }
  }), [teams, sortBy]);

  const scoreBars = useMemo(
    () => [...teams].sort((a, b) => b.team_score - a.team_score).map((t) => ({ label: t.team_name, value: t.team_score, color: catColor(t.team_category) })),
    [teams],
  );

  const scopeNote = agent?.role === 'super_boss' ? 'All teams across the org' : 'Your reporting line';

  if (status === 'loading') return <LoadingState label="Loading team performance…" />;
  if (status === 'error') return <ErrorState onRetry={reload} />;
  if (status === 'empty') return <EmptyState icon="🏆" title="No teams to show yet" hint="Teams appear once agents have a reporting manager set. Most agents are currently unassigned." />;

  const pad = isMobile ? 16 : '24px 32px';
  const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '11px 12px', fontSize: 13, color: 'var(--text-primary)', textAlign: 'right', whiteSpace: 'nowrap' };
  const SORTS: Array<{ k: SortKey; label: string }> = [
    { k: 'deals', label: 'Deals' }, { k: 'score', label: 'Score' }, { k: 'revenue', label: 'Revenue' }, { k: 'conversion', label: 'Conv%' },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: pad, backgroundColor: 'var(--bg-primary)' }}>
      <div>
        <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>🏆 Team Performance</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>{scopeNote}</p>
      </div>

      <RangeBar range={range} onRange={setRange} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 14 }}>
        {/* Structure & distribution action */}
        <div>
          <SectionLabel icon="⚡">Structure & Distribution</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--bento-gap)' }}>
            <KpiCard label="Unassigned Agents" value={formatNum(unassignedAgents)} accent="#f59e0b" icon="👤" />
            <div role="button" tabIndex={0} style={{ cursor: 'pointer' }} title="View unassigned leads →" onClick={() => drillTo({ entity: 'leads' })}>
              <KpiCard label="Unassigned Leads" value={formatNum(unassignedLeads)} accent="#ef4444" icon="📥" />
            </div>
            <KpiCard label="Teams Off-Target" value={formatNum(teamsOffTarget)} accent="#8b5cf6" icon="🎯" />
          </div>
        </div>

        <div>
          <SectionLabel icon="📊">Across All Teams</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--bento-gap)' }}>
            <KpiCard label="Teams" value={formatNum(totals.teams)} accent="#6366f1" icon="🏢" />
            <KpiCard label="Leads" value={formatNum(totals.leads)} accent="#3b82f6" icon="👥" />
            <KpiCard label="Deals" value={formatNum(totals.deals)} accent="#22c55e" icon="✅" />
            <KpiCard label="Revenue" value={formatINR(totals.revenue)} accent="#f59e0b" icon="₹" />
            <KpiCard label="Conversion" value={`${totals.conv.toFixed(1)}%`} accent="#8b5cf6" icon="🎯" />
            <KpiCard label="Top Score" value={Math.round(totals.topScore)} accent="#ec4899" icon="⭐" />
          </div>
        </div>

        <ClayCard title="Team Scores" subtitle="Leads-weighted productivity per team">
          <ValueBars rows={scoreBars} format={(n) => `${Math.round(n)}`} emptyIcon="🏆" emptyText="No teams in scope" />
        </ClayCard>

        {/* Distribution */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
          <ClayCard title="Lead Load per Agent" subtitle="Active leads assigned — surfaces imbalance">
            <RankedBars rows={load.slice(0, 12).map((l) => ({ label: l.agent_name, count: l.active_leads }))} color="#3b82f6" emptyIcon="⚖️" emptyText="No assigned load in scope" />
          </ClayCard>
          <ClayCard title="Lead Distribution by Channel" subtitle="How leads arrive (by acquisition channel)">
            <RankedBars rows={byRoute.map((r) => ({ label: r.route, count: r.count }))} color="#14b8a6" emptyIcon="🔀" emptyText="No distribution data" />
          </ClayCard>
          <ClayCard title="Lead Distribution by Routing Method" subtitle="How leads were assigned (fills forward; legacy rows unlabelled)">
            <RankedBars rows={byMethod.map((r) => ({ label: r.method, count: r.count }))} color="#8b5cf6" emptyIcon="🧭" emptyText="No routing-method data yet" />
          </ClayCard>
        </div>

        {/* Pipeline Outlook — directional weighted-GCI estimate (Phase 5E). Explicitly NOT a committed forecast. */}
        {gci && (
          <ClayCard
            title="🔭 Pipeline Outlook — directional GCI estimate"
            subtitle="A planning estimate, NOT a committed forecast — weighted by assumed stage-probabilities × 2% commission on stated buyer budgets"
            accent="#f59e0b"
          >
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{formatINR(gci.weighted_gci)}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 5 }}>Weighted GCI · directional</div>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-secondary)' }}>{formatINR(gci.raw_ceiling)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ceiling if all close @2%</div>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-secondary)' }}>{formatNum(gci.with_budget)} / {formatNum(gci.total_open)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Open deals with a budget</div>
              </div>
            </div>
            <SectionLabel icon="📶">Weighted contribution by stage (assumed close-probability)</SectionLabel>
            <ValueBars
              rows={(gci.by_stage || []).map((s: any) => ({ label: `${s.stage} · ${Math.round(s.probability * 100)}% · ${s.count} deals`, value: s.weighted_gci }))}
              format={formatINR}
              color="#f59e0b"
              emptyIcon="🔭"
              emptyText="No open deals with budgets"
            />
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 14, lineHeight: 1.5 }}>{gci.disclaimer}</p>
          </ClayCard>
        )}

        <ClayCard
          title="Team Breakdown"
          subtitle="Full per-team metrics"
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
                  <th style={{ ...th, textAlign: 'left' }}>Team</th>
                  <th style={th}>Members</th>
                  <th style={th}>Leads</th>
                  <th style={th}>Hot</th>
                  <th style={th}>Appts</th>
                  <th style={th}>Deals</th>
                  <th style={th}>Conv%</th>
                  <th style={th}>Revenue</th>
                  <th style={th}>Score</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((t) => (
                  <tr key={t.team_id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{t.team_name}</td>
                    <td style={td}>{formatNum(t.member_count)}</td>
                    <td style={td}>{formatNum(t.leads)}</td>
                    <td style={{ ...td, color: '#ef4444' }}>{formatNum(t.hot_leads)}</td>
                    <td style={td}>{formatNum(t.appointments_completed)}/{formatNum(t.appointments)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{formatNum(t.deals_closed)}</td>
                    <td style={td}>{t.conversion_rate.toFixed(1)}%</td>
                    <td style={{ ...td, fontWeight: 700 }}>{formatINR(t.revenue)}</td>
                    <td style={td}>
                      <span style={{ fontWeight: 800, marginRight: 6 }}>{Math.round(t.team_score)}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: catColor(t.team_category), backgroundColor: catColor(t.team_category) + '1a', borderRadius: 7, padding: '2px 7px' }}>{t.team_category}</span>
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No teams in scope</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </ClayCard>
      </div>
    </div>
  );
};
