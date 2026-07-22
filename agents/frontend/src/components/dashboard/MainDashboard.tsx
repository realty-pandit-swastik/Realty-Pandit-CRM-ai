import React, { useMemo, useState } from 'react';
import {
  getContacts, getManagementAlerts, getWorkflowTaskQueue, getMarketTrends,
  getFinancialSummary, getInventory, getDealPipeline, getTeamActivity, getSpeedToLead,
} from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { ClayCard, SectionLabel, KpiCard, formatNum, formatINR, formatMins } from './analytics/clay';
import { HealthBar } from './analytics/charts';
import { RangeBar, defaultRange, type DateRange } from './analytics/FilterBar';
import { useAsyncData, LoadingState, ErrorState } from './analytics/AsyncState';
import { drillTo, type DrillTarget } from '../../lib/drill';

// ── types ───────────────────────────────────────────────────────────────────
interface Alert { type: string; severity: string; title: string; detail: string; count: number; names?: string[]; }
interface Task {
  id: string; task_type: string; status: string; due_date: string; priority: string;
  deal_id?: string | null; contact?: { name?: string; phone_number?: string; lead_status?: string } | null;
}
interface Cockpit {
  alerts: Alert[];
  tasks: Task[];
  pulse: {
    leads: { cur: number; prev: number };
    visits: { cur: number; prev: number };
    deals: { cur: number; prev: number };
    commission: number;
    activeListings: number;
    openDeals: number;
    stl_median: number | null;
  };
  temperature: { hot: number; warm: number; cold: number; total: number };
  activity: Array<{ ts: number; icon: string; text: string }>;
}

const PRIORITY_RANK: Record<string, number> = { URGENT: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
const iso = (d: Date) => d.toISOString();
const inRange = (d: string, a: Date, b: Date) => { const t = new Date(d).getTime(); return t >= a.getTime() && t <= b.getTime(); };
const pctDelta = (cur: number, prev: number): number | null => (prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : null);

async function loadCockpit(range: DateRange): Promise<Cockpit> {
  const { from, to } = range;
  const span = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - span);
  const prevTo = new Date(from.getTime() - 1);

  // getContacts is the spine — NOT caught (auth failure → ErrorState). Others degrade gracefully.
  const contactsP = getContacts();
  const [alertsRes, queueRes, trends, fin, inv, pipeline, activity, stl] = await Promise.all([
    getManagementAlerts().catch(() => ({ alerts: [] as Alert[] })),
    getWorkflowTaskQueue().catch(() => ({ tasks: [] as Task[] })),
    getMarketTrends({ from: iso(prevFrom), to: iso(to) }).catch(() => ({ leads: [], visits: [], sales: [] })),
    getFinancialSummary({ from: iso(from), to: iso(to) }).catch(() => ({ total_commission: 0, total_deals: 0 })),
    getInventory({ status: 'active', limit: 1 }).catch(() => ({ total: 0 })),
    getDealPipeline().catch(() => ({} as Record<string, number>)),
    getTeamActivity({ from: iso(from), to: iso(to), limit: 20 }).catch(() => ({ shares: [], appointments: [] })),
    getSpeedToLead({ from: iso(from), to: iso(to) }).catch(() => ({ median_minutes: null })),
  ]);
  const contacts: any[] = await contactsP;

  // pulse deltas — bucket the market-trends daily series into current vs previous windows
  const bucket = (series: Array<{ date: string; count: number }>) => {
    let cur = 0, prev = 0;
    for (const p of series || []) {
      if (inRange(p.date, from, to)) cur += p.count;
      else if (inRange(p.date, prevFrom, prevTo)) prev += p.count;
    }
    return { cur, prev };
  };
  const CLOSED = new Set(['CLOSED_WON', 'CLOSED_LOST']);
  // /api/deals/pipeline returns { success, data: { [status]: count } } — counts are nested under .data.
  const pipelineCounts = ((pipeline as any).data || pipeline) as Record<string, number>;
  const openDeals = Object.entries(pipelineCounts)
    .filter(([s]) => !CLOSED.has(s)).reduce((n, [, c]) => n + (Number(c) || 0), 0);

  // lead temperature (client-side over role-scoped contacts)
  const LEAD_TYPES = new Set(['BUYER', 'TENANT', 'UNKNOWN']);
  const leads = contacts.filter((c) => !c.contact_type || LEAD_TYPES.has(c.contact_type));
  const t = { hot: 0, warm: 0, cold: 0, total: 0 };
  for (const c of leads) {
    if (c.lead_status === 'hot') t.hot++;
    else if (c.lead_status === 'warm') t.warm++;
    else if (c.lead_status === 'cold') t.cold++;
  }
  t.total = t.hot + t.warm + t.cold;

  // activity: merge shares + visits into one timeline
  const feed: Cockpit['activity'] = [];
  for (const s of (activity as any).shares || []) {
    const prop = s.inventory?.location || s.inventory?.display_id;
    feed.push({ ts: new Date(s.created_at).getTime(), icon: '📤',
      text: `${s.agent?.name || 'Someone'} shared${prop ? ` ${prop}` : ' a listing'}${s.contact?.name ? ` with ${s.contact.name}` : ''}` });
  }
  for (const a of (activity as any).appointments || []) {
    feed.push({ ts: new Date(a.scheduled_at).getTime(), icon: '📅',
      text: `Visit ${a.contact?.name ? `with ${a.contact.name}` : 'scheduled'}${a.property?.location ? ` · ${a.property.location}` : ''}` });
  }
  feed.sort((x, y) => y.ts - x.ts);

  return {
    alerts: (alertsRes as any).alerts || [],
    tasks: (queueRes as any).tasks || [],
    pulse: {
      leads: bucket((trends as any).leads),
      visits: bucket((trends as any).visits),
      deals: bucket((trends as any).sales),
      commission: (fin as any).total_commission || 0,
      activeListings: (inv as any).total || 0,
      openDeals,
      stl_median: (stl as any).median_minutes ?? null,
    },
    temperature: t,
    activity: feed.slice(0, 15),
  };
}

const HouseRow: React.FC<{ label: string; count: number }> = ({ label, count }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 12px', borderRadius: 10, backgroundColor: 'var(--bg-tertiary)' }}>
    <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{label}</span>
    <span style={{ fontSize: 14, fontWeight: 800, color: count > 0 ? '#f59e0b' : 'var(--text-muted)' }}>{formatNum(count)}</span>
  </div>
);

// ── component ─────────────────────────────────────────────────────────────────
export const MainDashboard: React.FC = () => {
  const { agent } = useAuth();
  const isMobile = useIsMobile();
  const [range, setRange] = useState<DateRange>(defaultRange());

  const { status, data, reload } = useAsyncData<Cockpit>(
    () => loadCockpit(range),
    [range.from, range.to],
    () => false, // a cockpit is never "empty"
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = agent?.name?.split(' ')[0] || 'there';
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const alertBy = (type: string) => data?.alerts.find((a) => a.type === type)?.count ?? 0;
  const openByType = useMemo(() => {
    const now = Date.now();
    const c = { callbacks: 0, visits: 0, overdue: 0 };
    for (const tk of data?.tasks || []) {
      if (tk.task_type === 'CALLBACK_REQUEST') c.callbacks++;
      if (tk.task_type === 'VISIT_REQUEST') c.visits++;
      if (tk.due_date && new Date(tk.due_date).getTime() < now) c.overdue++;
    }
    return c;
  }, [data]);
  const nextActions = useMemo(() => [...(data?.tasks || [])]
    .sort((a, b) => (PRIORITY_RANK[b.priority] ?? 1) - (PRIORITY_RANK[a.priority] ?? 1)
      || new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    .slice(0, 8), [data]);

  if (status === 'loading') return <LoadingState label="Loading your dashboard…" />;
  if (status === 'error') return <ErrorState onRetry={reload} />;
  const d = data as Cockpit;

  const pad = isMobile ? 16 : '24px 32px';
  const kpiGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--bento-gap)' };
  const colTwo: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 };
  const Drill: React.FC<{ target: DrillTarget; children: React.ReactNode }> = ({ target, children }) => (
    <div role="button" tabIndex={0} title="Open list →" style={{ cursor: 'pointer' }}
      onClick={() => drillTo(target)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drillTo(target); } }}>
      {children}
    </div>
  );

  const actionTotal = openByType.callbacks + openByType.visits + openByType.overdue + alertBy('stale_leads') + alertBy('inventory_missing_photos');
  const stateLine = `${formatNum(d.pulse.leads.cur)} new leads · ${formatNum(d.pulse.visits.cur)} visits · ${formatNum(d.pulse.deals.cur)} deals closed this period — ${formatNum(actionTotal)} things need action.`;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: pad, backgroundColor: 'var(--bg-primary)' }}>
      <div>
        <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{greeting}, {firstName} 👋</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>{today} · {stateLine}</p>
      </div>

      <RangeBar range={range} onRange={setRange} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 14 }}>
        {/* Do This Now */}
        <div>
          <SectionLabel icon="⚡">Do This Now</SectionLabel>
          <div style={kpiGrid}>
            <Drill target={{ entity: 'tasks' }}><KpiCard label="Callbacks Now" value={formatNum(openByType.callbacks)} accent="#ef4444" icon="📞" /></Drill>
            <Drill target={{ entity: 'tasks' }}><KpiCard label="Visits ASAP" value={formatNum(openByType.visits)} accent="#f43f5e" icon="🏃" /></Drill>
            <Drill target={{ entity: 'tasks' }}><KpiCard label="Overdue Tasks" value={formatNum(openByType.overdue)} accent="#f59e0b" icon="⏰" /></Drill>
            <Drill target={{ entity: 'leads' }}><KpiCard label="Neglected Leads" value={formatNum(alertBy('stale_leads'))} accent="#8b5cf6" icon="😴" /></Drill>
            <Drill target={{ entity: 'inventory', filter: { status: 'active' } }}><KpiCard label="Missing Photos" value={formatNum(alertBy('inventory_missing_photos'))} accent="#ec4899" icon="📷" /></Drill>
          </div>
        </div>

        {/* Pulse */}
        <div>
          <SectionLabel icon="📊">Pulse</SectionLabel>
          <div style={kpiGrid}>
            <KpiCard label="New Leads" value={formatNum(d.pulse.leads.cur)} delta={pctDelta(d.pulse.leads.cur, d.pulse.leads.prev)} accent="#3b82f6" icon="👥" />
            <KpiCard label="Visits" value={formatNum(d.pulse.visits.cur)} delta={pctDelta(d.pulse.visits.cur, d.pulse.visits.prev)} accent="#06b6d4" icon="📅" />
            <KpiCard label="Deals Closed" value={formatNum(d.pulse.deals.cur)} delta={pctDelta(d.pulse.deals.cur, d.pulse.deals.prev)} accent="#22c55e" icon="✅" />
            <KpiCard label="Commission" value={formatINR(d.pulse.commission)} accent="#f59e0b" icon="₹" />
            <KpiCard label="Speed-to-Lead" value={formatMins(d.pulse.stl_median)} sub="median, 1st reply" accent="#ef4444" icon="⚡" />
            <Drill target={{ entity: 'inventory', filter: { status: 'active' } }}><KpiCard label="Active Listings" value={formatNum(d.pulse.activeListings)} accent="#14b8a6" icon="🏠" /></Drill>
            <Drill target={{ entity: 'deals' }}><KpiCard label="Open Deals" value={formatNum(d.pulse.openDeals)} accent="#6366f1" icon="🎯" /></Drill>
          </div>
        </div>

        {/* Temperature + Next actions */}
        <div style={colTwo}>
          <ClayCard title="Lead Temperature" subtitle="Open pipeline by warmth">
            <HealthBar health={d.temperature} />
          </ClayCard>
          <ClayCard title="Next Actions" subtitle="Your most urgent tasks">
            {nextActions.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>✅ All caught up</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {nextActions.map((tk) => {
                  const overdue = tk.due_date && new Date(tk.due_date).getTime() < Date.now();
                  return (
                    <div key={tk.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, backgroundColor: 'var(--bg-tertiary)' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: overdue ? '#ef4444' : 'var(--text-muted)', width: 58, flexShrink: 0 }}>{overdue ? 'OVERDUE' : (tk.priority || 'MEDIUM')}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tk.task_type.replace(/_/g, ' ')}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{tk.contact?.name || tk.contact?.phone_number || '—'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ClayCard>
        </div>

        {/* Activity + Housekeeping */}
        <div style={colTwo}>
          <ClayCard title="Live Activity" subtitle="Recent shares & visits">
            {d.activity.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No activity in this period</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {d.activity.map((e, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                    <span>{e.icon}</span><span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.text}</span>
                  </div>
                ))}
              </div>
            )}
          </ClayCard>
          <ClayCard title="Housekeeping" subtitle="Keep the data clean">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Drill target={{ entity: 'inventory', filter: { status: 'active' } }}><HouseRow label="Listings missing price" count={alertBy('inventory_missing_price')} /></Drill>
              <HouseRow label="Inactive team members" count={alertBy('inactive_agents')} />
              <HouseRow label="Google Calendar not connected" count={alertBy('google_not_connected')} />
            </div>
          </ClayCard>
        </div>
      </div>
    </div>
  );
};
