import React, { useEffect, useMemo, useState } from 'react';
import { getContacts, getUserPerformance, getFinancialSummary, getSpeedToLead } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { ClayCard, SectionLabel, KpiCard, formatNum, formatINR, formatMins } from './analytics/clay';
import { FilterBar, defaultRange, type DateRange } from './analytics/FilterBar';
import { computeLead, type RawContact, type LeadFilters } from './analytics/leadData';
import { SourceDonut, Funnel, HealthBar, AgeingBars, RankedBars, Leaderboard, InsightCards, type LeaderRow } from './analytics/charts';
import { useAsyncData, LoadingState, ErrorState, EmptyState } from './analytics/AsyncState';
import { drillTo, type DrillTarget } from '../../lib/drill';

const MiniLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>{children}</p>
);

const fmtDate = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export const LeadIntelligenceDashboard: React.FC = () => {
  const { agent } = useAuth();
  const isMobile = useIsMobile();

  const [range, setRange] = useState<DateRange>(defaultRange());
  const [selectedAgents, setSelectedAgents] = useState<string[] | null>(null);
  const [selectedSources, setSelectedSources] = useState<string[] | null>(null);

  // Primary spine: role-scoped contacts (fetched once, filtered client-side by date).
  // Drives page-level loading/error/empty — a failed fetch is an error, not fake zeros.
  const { status, data: contactsData, reload } = useAsyncData<RawContact[]>(
    () => getContacts().then((d) => (Array.isArray(d) ? d : [])),
    [],
    (d) => d.length === 0,
  );
  const contacts = useMemo(() => contactsData ?? [], [contactsData]);

  // Secondary (ranged): leaderboard + revenue. A failure here softly degrades only
  // those two panels — it must not blank the whole page, so it stays a local effect.
  const [performance, setPerformance] = useState<LeaderRow[]>([]);
  const [revenue, setRevenue] = useState<number | null>(null);
  const [prevRevenue, setPrevRevenue] = useState<number | null>(null);
  const [stlMedian, setStlMedian] = useState<number | null>(null);

  // Date-scoped server data: leaderboard + revenue (current + previous window).
  useEffect(() => {
    const fromTo = { from: range.from.toISOString(), to: range.to.toISOString() };
    const span = range.to.getTime() - range.from.getTime();
    const prevFrom = new Date(range.from.getTime() - span).toISOString();
    const prevTo = new Date(range.from.getTime() - 1).toISOString();
    (async () => {
      try {
        const [perf, fin, prevFin, stl] = await Promise.all([
          getUserPerformance(fromTo).catch(() => ({ performance: [] })),
          getFinancialSummary(fromTo).catch(() => ({ total_revenue: 0 })),
          getFinancialSummary({ from: prevFrom, to: prevTo }).catch(() => ({ total_revenue: 0 })),
          getSpeedToLead(fromTo).catch(() => ({ median_minutes: null })),
        ]);
        setPerformance(perf?.performance || []);
        setRevenue(fin?.total_revenue ?? 0);
        setPrevRevenue(prevFin?.total_revenue ?? 0);
        setStlMedian((stl as any)?.median_minutes ?? null);
      } catch (e) {
        console.error('Lead Intelligence: ranged data load failed', e);
      }
    })();
  }, [range.from, range.to]);

  const filters: LeadFilters = useMemo(
    () => ({ from: range.from, to: range.to, agentIds: selectedAgents, sources: selectedSources }),
    [range.from, range.to, selectedAgents, selectedSources],
  );

  const c = useMemo(() => computeLead(contacts, filters), [contacts, filters]);

  const agentOptions = useMemo(
    () => performance.map((p) => ({ value: p.agent_id, label: p.agent_name })).sort((a, b) => a.label.localeCompare(b.label)),
    [performance],
  );
  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((x) => set.add(x.source || 'Unknown'));
    return Array.from(set).sort().map((s) => ({ value: s, label: s }));
  }, [contacts]);

  const leaderboard = useMemo(
    () => (selectedAgents ? performance.filter((p) => selectedAgents.includes(p.agent_id)) : performance),
    [performance, selectedAgents],
  );

  const revenueDelta = revenue != null && prevRevenue != null && prevRevenue > 0
    ? ((revenue - prevRevenue) / prevRevenue) * 100
    : null;

  const scopeNote = agent?.role === 'super_boss' ? 'Organization-wide'
    : agent?.role === 'manager' ? 'Your team' : 'Your leads';

  if (status === 'loading') return <LoadingState label="Loading lead intelligence…" />;
  if (status === 'error') return <ErrorState onRetry={reload} />;
  if (status === 'empty') return <EmptyState icon="🎯" title="No leads in your view yet" hint="Once leads are assigned to you, their sources, funnel, health and ageing show up here." />;

  const pad = isMobile ? 16 : '24px 32px';
  const colTwo: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 };
  const Drill: React.FC<{ filter?: Record<string, string>; children: React.ReactNode }> = ({ filter, children }) => {
    const target: DrillTarget = filter ? { entity: 'leads', filter } : { entity: 'leads' };
    return (
      <div role="button" tabIndex={0} title="Open in Ext. Leads →" style={{ cursor: 'pointer' }}
        onClick={() => drillTo(target)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drillTo(target); } }}>
        {children}
      </div>
    );
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: pad, backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>🎯 Lead Intelligence</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {scopeNote} · {fmtDate(range.from)} – {fmtDate(range.to)}
          </p>
        </div>
      </div>

      {/* Sticky filters */}
      <FilterBar
        range={range} onRange={setRange}
        agentOptions={agentOptions} selectedAgents={selectedAgents} onAgents={setSelectedAgents}
        sourceOptions={sourceOptions} selectedSources={selectedSources} onSources={setSelectedSources}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 14 }}>
        {/* AI insights */}
        {c.insights.length > 0 && (
          <div>
            <SectionLabel icon="✨">AI Insights</SectionLabel>
            <InsightCards insights={c.insights} />
          </div>
        )}

        {/* Lead actions */}
        <div>
          <SectionLabel icon="⚡">Lead Action</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--bento-gap)' }}>
            <Drill filter={{ not_contacted_days: '14' }}><KpiCard label="Neglected" value={formatNum(c.actions.neglected)} accent="#ef4444" icon="😴" /></Drill>
            <Drill filter={{ status: 'hot', not_contacted_days: '3' }}><KpiCard label="Hot, Uncontacted" value={formatNum(c.actions.hotUncontacted)} accent="#f43f5e" icon="🔥" /></Drill>
            <Drill><KpiCard label="Stagnant" value={formatNum(c.actions.stagnant)} accent="#f59e0b" icon="🧊" /></Drill>
            <Drill><KpiCard label="Unqualified New" value={formatNum(c.actions.unqualifiedNew)} accent="#8b5cf6" icon="❓" /></Drill>
          </div>
        </div>

        {/* KPI strip */}
        <div>
          <SectionLabel icon="📊">Key Metrics</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--bento-gap)' }}>
            <KpiCard label="Total Leads" value={formatNum(c.totalLeads)} delta={c.d_total} spark={c.dailyLeads} accent="#3b82f6" icon="👥" />
            <KpiCard label="Active" value={formatNum(c.activeLeads)} delta={c.d_active} accent="#06b6d4" icon="⚡" />
            <KpiCard label="Converted" value={formatNum(c.convertedLeads)} delta={c.d_converted} accent="#22c55e" icon="✅" />
            <KpiCard label="Lost" value={formatNum(c.lostLeads)} delta={c.d_lost != null ? -c.d_lost : null} accent="#ef4444" icon="❌" />
            <KpiCard label="Conversion" value={`${c.conversionRate.toFixed(1)}%`} delta={c.d_conv} deltaSuffix="pp" accent="#8b5cf6" icon="🎯" />
            <KpiCard label="Revenue" value={formatINR(revenue || 0)} delta={revenueDelta} accent="#f59e0b" icon="₹" />
            <KpiCard label="Speed-to-Lead" value={formatMins(stlMedian)} sub="median 1st reply" accent="#ef4444" icon="⚡" />
          </div>
        </div>

        {/* Source + Funnel */}
        <div style={colTwo}>
          <ClayCard title="Lead Sources" subtitle="Volume share + conversion quality">
            <SourceDonut sources={c.sources} />
          </ClayCard>
          <ClayCard title="Conversion Funnel" subtitle="Pipeline by stage, with drop-off">
            <Funnel funnel={c.funnel} />
          </ClayCard>
        </div>

        {/* Health + Ageing */}
        <div style={colTwo}>
          <ClayCard title="Lead Health" subtitle="Current open pipeline by temperature">
            <HealthBar health={c.health} />
          </ClayCard>
          <ClayCard title="Active Lead Ageing" subtitle="How long open leads have been waiting">
            <AgeingBars ageing={c.ageing} />
          </ClayCard>
        </div>

        {/* Lost reasons + Delay reasons */}
        <div style={colTwo}>
          <ClayCard title="Lost Lead Reasons" subtitle="Why deals are slipping away">
            <RankedBars rows={c.lostReasons} color="#ef4444" emptyIcon="📝"
              emptyText="No lost-reason data yet — pick a reason when marking a lead lost" />
          </ClayCard>
          <ClayCard title="Active Lead Delay Reasons" subtitle="Why open leads aren't converting">
            <RankedBars rows={c.delayReasons} color="#f59e0b" emptyIcon="⏳"
              emptyText="No delay-reason data yet — set one from a lead's actions" />
          </ClayCard>
        </div>

        {/* Top areas */}
        <ClayCard title="Top Demand Areas" subtitle="Where leads want to buy">
          <RankedBars rows={c.areas} color="#14b8a6" emptyIcon="📍" emptyText="No location data on leads in this period" />
        </ClayCard>

        {/* Demand profile */}
        <ClayCard title="What Buyers Want" subtitle="Demand profile of your open leads">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><MiniLabel>Preferred BHK</MiniLabel><RankedBars rows={c.demandProfile.bhk} color="#3b82f6" emptyIcon="🛏️" emptyText="No BHK preferences captured" /></div>
            <div><MiniLabel>Budget bands</MiniLabel><RankedBars rows={c.demandProfile.budget} color="#22c55e" emptyIcon="💰" emptyText="No budgets captured on open leads" /></div>
            <div><MiniLabel>Intent</MiniLabel><RankedBars rows={c.demandProfile.intent} color="#8b5cf6" emptyIcon="🎯" emptyText="No intent captured" /></div>
          </div>
        </ClayCard>

        {/* Leaderboard */}
        <ClayCard title="Agent Leaderboard" subtitle="Ranked by productivity score">
          <Leaderboard rows={leaderboard} />
        </ClayCard>
      </div>
    </div>
  );
};
