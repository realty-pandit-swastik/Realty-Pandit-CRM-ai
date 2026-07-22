import React, { useMemo, useState } from 'react';
import { getPropertyTrends } from '../../api/client';
import { useIsMobile } from '../../hooks/useIsMobile';
import { ClayCard, SectionLabel, KpiCard, formatNum } from './analytics/clay';
import { RangeBar, defaultRange, type DateRange } from './analytics/FilterBar';
import { CategoryDonut, ValueBars, RankedBars } from './analytics/charts';
import { useAsyncData, LoadingState, ErrorState, EmptyState } from './analytics/AsyncState';
import { drillTo } from '../../lib/drill';

interface Pulse {
  total: number; active: number; added: number;
  pct_with_photos: number; avg_days_on_market: number; pct_shareable: number;
}
interface NeedsAction {
  missing_photos: number; stale_60d: number; pending_approval: number;
  overpriced: number; no_matched_buyer: number;
}
interface PricePositioning { under: number; at: number; over: number; unpriced: number; sample: number; }
interface GapRow { sub_category: string; supply: number; demand: number; gap: number; }
interface TopListing { inventory_id: string; title: string; shares: number; visits: number; enquiries: number; score: number; }

interface PropertyTrends {
  status_breakdown?: Array<{ status: string; count: number }>;
  intent_breakdown?: Array<{ intent: string; count: number }>;
  type_breakdown?: Array<{ type: string; count: number }>;
  recent_additions?: number;
  pulse?: Pulse;
  needs_action?: NeedsAction;
  ageing?: Array<{ bucket: string; count: number }>;
  price_positioning?: PricePositioning;
  supply_demand?: GapRow[];
  by_location?: Array<{ locality: string; count: number }>;
  top_listings?: TopListing[];
}

// Supply vs demand per sub-category — supply bar (blue) over demand bar (amber) + a gap chip.
const SupplyDemand: React.FC<{ rows: GapRow[] }> = ({ rows }) => {
  if (!rows.length) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>📊 No supply/demand data in scope</div>;
  const max = Math.max(...rows.flatMap((r) => [r.supply, r.demand]), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {rows.map((r) => (
        <div key={r.sub_category}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sub_category}</span>
            <span style={{ fontSize: 11.5, fontWeight: 800, flexShrink: 0, color: r.gap > 0 ? '#ef4444' : r.gap < 0 ? '#3b82f6' : 'var(--text-muted)' }}>
              {r.gap > 0 ? `▲ ${formatNum(r.gap)} short` : r.gap < 0 ? `▼ ${formatNum(-r.gap)} surplus` : 'balanced'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ width: 52, fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0 }}>supply</span>
            <div style={{ flex: 1, height: 12, borderRadius: 4, backgroundColor: 'var(--bg-tertiary)', overflow: 'hidden' }}>
              <div style={{ width: `${(r.supply / max) * 100}%`, height: '100%', backgroundColor: '#3b82f6', borderRadius: 4, transition: 'width 600ms ease' }} />
            </div>
            <span style={{ width: 46, fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right', flexShrink: 0 }}>{formatNum(r.supply)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 52, fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0 }}>demand</span>
            <div style={{ flex: 1, height: 12, borderRadius: 4, backgroundColor: 'var(--bg-tertiary)', overflow: 'hidden' }}>
              <div style={{ width: `${(r.demand / max) * 100}%`, height: '100%', backgroundColor: '#f59e0b', borderRadius: 4, transition: 'width 600ms ease' }} />
            </div>
            <span style={{ width: 46, fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right', flexShrink: 0 }}>{formatNum(r.demand)}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

// Clickable KPI wrapper — opens the Inventory list pre-filtered via the drill-through event.
const Drill: React.FC<{ filter?: Record<string, string>; children: React.ReactNode }> = ({ filter, children }) => {
  const go = () => drillTo(filter ? { entity: 'inventory', filter } : { entity: 'inventory' });
  return (
    <div
      role="button"
      tabIndex={0}
      title="Open in Inventory →"
      style={{ cursor: 'pointer' }}
      onClick={go}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}
    >
      {children}
    </div>
  );
};

export const PropertyAnalyticsDashboard: React.FC = () => {
  const isMobile = useIsMobile();
  const [range, setRange] = useState<DateRange>(defaultRange());

  const { status, data, reload } = useAsyncData<PropertyTrends>(
    () => getPropertyTrends({ from: range.from.toISOString(), to: range.to.toISOString() }),
    [range.from, range.to],
    (d) => !(d?.status_breakdown?.length),
  );

  const statusDonut = useMemo(() => (data?.status_breakdown || []).map((s) => ({ name: s.status, value: s.count })), [data]);
  const intentBars = useMemo(() => (data?.intent_breakdown || []).map((s) => ({ label: s.intent, value: s.count })), [data]);
  const typeBars = useMemo(() => [...(data?.type_breakdown || [])].sort((a, b) => b.count - a.count).map((s) => ({ label: s.type, value: s.count })), [data]);

  if (status === 'loading') return <LoadingState label="Loading property analytics…" />;
  if (status === 'error') return <ErrorState onRetry={reload} />;
  if (status === 'empty') return <EmptyState icon="🏠" title="No inventory in your view yet" hint="As soon as listings are assigned to you — or added to the system — they'll appear here." />;

  const d = data as PropertyTrends;
  const pulse = d.pulse ?? { total: 0, active: 0, added: 0, pct_with_photos: 0, avg_days_on_market: 0, pct_shareable: 0 };
  const needs = d.needs_action ?? { missing_photos: 0, stale_60d: 0, pending_approval: 0, overpriced: 0, no_matched_buyer: 0 };
  const pp = d.price_positioning ?? { under: 0, at: 0, over: 0, unpriced: 0, sample: 0 };
  const ageingBars = (d.ageing ?? []).map((a) => ({ label: a.bucket, value: a.count }));
  const locationBars = (d.by_location ?? []).map((l) => ({ label: l.locality, count: l.count }));
  const topListings = d.top_listings ?? [];
  const supplyDemand = d.supply_demand ?? [];

  const pad = isMobile ? 16 : '24px 32px';
  const colTwo: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 };
  const kpiGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--bento-gap)' };
  const th: React.CSSProperties = { padding: '9px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: 'var(--text-primary)', textAlign: 'right', whiteSpace: 'nowrap' };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: pad, backgroundColor: 'var(--bg-primary)' }}>
      <div>
        <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>🏠 Property Analytics</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>Inventory health, demand, pricing & performance</p>
      </div>

      <RangeBar range={range} onRange={setRange} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 14 }}>
        {/* Needs action */}
        <div>
          <SectionLabel icon="⚡">Needs Action</SectionLabel>
          <div style={kpiGrid}>
            <KpiCard label="Missing Photos" value={formatNum(needs.missing_photos)} accent="#ef4444" icon="📷" />
            <Drill filter={{ days: '60' }}><KpiCard label="Stale 60d+" value={formatNum(needs.stale_60d)} accent="#f59e0b" icon="🕰️" /></Drill>
            <Drill filter={{ status: 'pending_approval' }}><KpiCard label="Pending Approval" value={formatNum(needs.pending_approval)} accent="#3b82f6" icon="⏳" /></Drill>
            <KpiCard label="Overpriced" value={formatNum(needs.overpriced)} accent="#ec4899" icon="💰" />
            <KpiCard label="No Matched Buyer" value={formatNum(needs.no_matched_buyer)} accent="#8b5cf6" icon="🔍" />
          </div>
        </div>

        {/* Pulse */}
        <div>
          <SectionLabel icon="📊">Inventory Pulse</SectionLabel>
          <div style={kpiGrid}>
            <Drill><KpiCard label="Total Properties" value={formatNum(pulse.total)} accent="#3b82f6" icon="🏢" /></Drill>
            <Drill filter={{ status: 'active' }}><KpiCard label="Active Listings" value={formatNum(pulse.active)} accent="#22c55e" icon="✅" /></Drill>
            <KpiCard label="Added (period)" value={formatNum(pulse.added)} accent="#8b5cf6" icon="🆕" />
            <KpiCard label="With Photos" value={`${pulse.pct_with_photos}%`} accent="#06b6d4" icon="📸" />
            <KpiCard label="Avg Days on Market" value={formatNum(pulse.avg_days_on_market)} accent="#f59e0b" icon="📅" />
            <KpiCard label="Shareable" value={`${pulse.pct_shareable}%`} accent="#14b8a6" icon="📤" />
          </div>
        </div>

        {/* Existing breakdowns (kept) */}
        <div style={colTwo}>
          <ClayCard title="Status Breakdown" subtitle="Where inventory sits in its lifecycle">
            <CategoryDonut data={statusDonut} centerLabel="properties" />
          </ClayCard>
          <ClayCard title="Intent Breakdown" subtitle="Sale vs rent vs other intents">
            <ValueBars rows={intentBars} emptyIcon="🏷️" emptyText="No active inventory in scope" />
          </ClayCard>
        </div>

        {/* Supply vs demand + ageing */}
        <div style={colTwo}>
          <ClayCard title="Supply vs Demand" subtitle="Where stock lags or exceeds buyer demand">
            <SupplyDemand rows={supplyDemand} />
          </ClayCard>
          <ClayCard title="Inventory Ageing" subtitle="How long active listings have been on the market">
            <ValueBars rows={ageingBars} color="#f59e0b" emptyIcon="🕰️" emptyText="No active listings" />
          </ClayCard>
        </div>

        {/* Price positioning */}
        <ClayCard title="Price Positioning" subtitle={`vs local median · ${formatNum(pp.sample)} judged, ${formatNum(pp.unpriced)} unpriced`}>
          <ValueBars
            rows={[
              { label: 'Below market', value: pp.under, color: '#22c55e' },
              { label: 'At market', value: pp.at, color: '#3b82f6' },
              { label: 'Above market', value: pp.over, color: '#ef4444' },
            ]}
            emptyIcon="💰"
            emptyText="Not enough priced listings to judge"
          />
        </ClayCard>

        {/* Type distribution (kept) */}
        <ClayCard title="Property Type Distribution" subtitle="Active listings by type">
          <ValueBars rows={typeBars} color="#10b981" emptyIcon="🏠" emptyText="No property type data" />
        </ClayCard>

        {/* By location + top listings */}
        <div style={colTwo}>
          <ClayCard title="By Location" subtitle="Active listings by locality">
            <RankedBars rows={locationBars} color="#14b8a6" emptyIcon="📍" emptyText="No location data" />
          </ClayCard>
          <ClayCard title="Top-Performing Listings" subtitle="By shares · visits · enquiries (views not tracked yet)">
            {topListings.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>🏆 No engagement yet in scope</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                      <th style={{ ...th, textAlign: 'left' }}>Listing</th>
                      <th style={th}>Shares</th>
                      <th style={th}>Visits</th>
                      <th style={th}>Enquiries</th>
                      <th style={th}>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topListings.map((t) => (
                      <tr key={t.inventory_id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                        <td style={{ ...td, textAlign: 'left', fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</td>
                        <td style={td}>{formatNum(t.shares)}</td>
                        <td style={td}>{formatNum(t.visits)}</td>
                        <td style={td}>{formatNum(t.enquiries)}</td>
                        <td style={{ ...td, fontWeight: 800 }}>{formatNum(t.score)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ClayCard>
        </div>
      </div>
    </div>
  );
};
