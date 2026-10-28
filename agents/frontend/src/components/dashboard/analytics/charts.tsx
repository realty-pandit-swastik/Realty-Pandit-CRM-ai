import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { SERIES, useChartColors, MetricIcon, formatNum, formatINR, pct } from './clay';
import type { SourceRow, FunnelRow, AgeRow, HealthRow, RankRow, Insight } from './leadData';

export const Empty: React.FC<{ icon?: string; text: string }> = ({ icon = '∅', text }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', gap: 8, color: 'var(--text-muted)', textAlign: 'center' }}>
    <MetricIcon value={icon} />
    <span style={{ fontSize: 13 }}>{text}</span>
  </div>
);

// ── Source donut + ranked quality bars ───────────────────────────────────────

export const SourceDonut: React.FC<{ sources: SourceRow[] }> = ({ sources }) => {
  const c = useChartColors();
  const total = sources.reduce((s, x) => s + x.count, 0);
  if (!total) return <Empty icon="target" text="No leads in this period" />;
  const data = sources.slice(0, 8).map((s) => ({ name: s.source, value: s.count }));
  return (
    <div className="rp-chart-pair">
      <div style={{ position: 'relative', height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={62} outerRadius={92} paddingAngle={2} dataKey="value" stroke="none">
              {data.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 10, color: 'var(--text-primary)', fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{formatNum(total)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>total leads</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sources.slice(0, 6).map((s, i) => {
          const share = pct(s.count, total);
          const conv = s.conversionRate;
          const convColor = conv >= 10 ? 'var(--rp-success-text)' : conv >= 5 ? 'var(--rp-warn-text)' : 'var(--text-muted)';
          return (
            <div key={s.source} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: SERIES[i % SERIES.length], flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.source}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatNum(s.count)} · {share.toFixed(0)}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 4, backgroundColor: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                  <div style={{ width: `${share}%`, height: '100%', backgroundColor: SERIES[i % SERIES.length], borderRadius: 4, transition: 'width 600ms ease' }} />
                </div>
              </div>
              <span title="conversion rate" style={{ fontSize: 11, fontWeight: 700, color: convColor, minWidth: 38, textAlign: 'right' }}>{conv.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Conversion funnel ─────────────────────────────────────────────────────────

const FUNNEL_COLORS = ['var(--blue-900)', 'var(--blue-800)', 'var(--blue-700)', 'var(--blue-600)', 'var(--blue-800)', 'var(--blue-700)'];

export const Funnel: React.FC<{ funnel: FunnelRow[] }> = ({ funnel }) => {
  const anyData = funnel.some((f) => f.count > 0);
  if (!anyData) return <Empty icon="🪜" text="No pipeline data in this period" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {funnel.map((f, i) => (
        <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 110, fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 600, flexShrink: 0, textAlign: 'right' }}>{f.label}</span>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 26, borderRadius: 7, backgroundColor: 'var(--bg-tertiary)', overflow: 'hidden', position: 'relative' }}>
              <div style={{ width: `${Math.max(f.ofTop, f.count > 0 ? 6 : 0)}%`, height: '100%', backgroundColor: FUNNEL_COLORS[i % FUNNEL_COLORS.length], borderRadius: 7, transition: 'width 600ms ease', display: 'flex', alignItems: 'center', paddingLeft: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--surface-white)' }}>{formatNum(f.count)}</span>
              </div>
            </div>
            <span style={{ width: 64, fontSize: 11, color: f.dropFromPrev != null && f.dropFromPrev > 0 ? 'var(--rp-danger-text)' : 'var(--text-muted)', textAlign: 'left', flexShrink: 0 }}>
              {f.dropFromPrev != null ? `▼ ${f.dropFromPrev.toFixed(0)}%` : '—'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Lead health (hot/warm/cold segmented bar) ─────────────────────────────────

export const HealthBar: React.FC<{ health: HealthRow }> = ({ health }) => {
  const { hot, warm, cold, total } = health;
  if (!total) return <Empty icon="thermometer" text="No active leads to score" />;
  const segs = [
    { label: 'Hot', value: hot, color: 'var(--blue-900)', icon: 'flame' },
    { label: 'Warm', value: warm, color: 'var(--blue-700)', icon: 'circle-alert' },
    { label: 'Cold', value: cold, color: 'var(--blue-500)', icon: 'snowflake' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', height: 30, borderRadius: 9, overflow: 'hidden', backgroundColor: 'var(--bg-tertiary)' }}>
        {segs.map((s) => s.value > 0 && (
          <div key={s.label} style={{ width: `${pct(s.value, total)}%`, backgroundColor: s.color, transition: 'width 600ms ease' }} title={`${s.label}: ${s.value}`} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {segs.map((s) => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>{formatNum(s.value)}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}><MetricIcon value={s.icon} /> {s.label} · {pct(s.value, total).toFixed(0)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Ageing buckets (color-graded urgency) ─────────────────────────────────────

const AGE_COLORS: Record<string, string> = {
  '0–7d': 'var(--blue-300)', '8–15d': 'var(--blue-400)', '16–30d': 'var(--blue-500)',
  '31–60d': 'var(--blue-600)', '61–90d': 'var(--blue-700)', '90d+': 'var(--blue-900)',
};

export const AgeingBars: React.FC<{ ageing: AgeRow[] }> = ({ ageing }) => {
  const max = Math.max(...ageing.map((a) => a.count), 1);
  const total = ageing.reduce((s, a) => s + a.count, 0);
  if (!total) return <Empty icon="📦" text="No active leads to age" />;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 170, paddingTop: 8 }}>
      {ageing.map((a) => (
        <div key={a.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>{formatNum(a.count)}</span>
          <div style={{ width: '100%', maxWidth: 42, height: `${(a.count / max) * 100}%`, minHeight: a.count > 0 ? 4 : 0, backgroundColor: AGE_COLORS[a.label] || 'var(--blue-600)', borderRadius: '6px 6px 0 0', transition: 'height 600ms ease' }} />
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{a.label}</span>
        </div>
      ))}
    </div>
  );
};

// ── Ranked bars (generic — lost reasons, areas) ───────────────────────────────

export const RankedBars: React.FC<{ rows: RankRow[]; color?: string; emptyIcon?: string; emptyText?: string }> = ({ rows, color = 'var(--blue-600)', emptyIcon, emptyText }) => {
  if (!rows.length) return <Empty icon={emptyIcon} text={emptyText || 'No data'} />;
  const max = Math.max(...rows.map((r) => r.count), 1);
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 130, fontSize: 12.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{r.label}</span>
          <div style={{ flex: 1, height: 16, borderRadius: 5, backgroundColor: 'var(--bg-tertiary)', overflow: 'hidden' }}>
            <div style={{ width: `${(r.count / max) * 100}%`, height: '100%', backgroundColor: color, borderRadius: 5, transition: 'width 600ms ease' }} />
          </div>
          <span style={{ width: 64, fontSize: 12, color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>{formatNum(r.count)} · {pct(r.count, total).toFixed(0)}%</span>
        </div>
      ))}
    </div>
  );
};

// ── Agent leaderboard ─────────────────────────────────────────────────────────

export interface LeaderRow {
  agent_id: string;
  agent_name: string;
  leads_assigned: number;
  deals_closed: number;
  revenue_generated: number;
  productivity_score: number;
  productivity_category: string;
}

const catColor = (cat: string): string => {
  switch (cat) {
    case 'Excellent': return 'var(--rp-success-text)';
    case 'Good': return 'var(--blue-700)';
    case 'Average': return 'var(--rp-warn-text)';
    default: return 'var(--rp-danger-text)';
  }
};

const ScoreRing: React.FC<{ score: number }> = ({ score }) => {
  const r = 18, circ = 2 * Math.PI * r;
  const color = catColor(score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Average' : 'x');
  return (
    <svg width={44} height={44} style={{ flexShrink: 0 }}>
      <circle cx={22} cy={22} r={r} fill="none" stroke="var(--bg-tertiary)" strokeWidth={4} />
      <circle cx={22} cy={22} r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round"
        strokeDasharray={`${(score / 100) * circ} ${circ}`} transform="rotate(-90 22 22)" style={{ transition: 'stroke-dasharray 600ms ease' }} />
      <text x={22} y={26} textAnchor="middle" fontSize={13} fontWeight={800} fill="var(--text-primary)">{Math.round(score)}</text>
    </svg>
  );
};

const MEDALS = ['1', '2', '3'];

export const Leaderboard: React.FC<{ rows: LeaderRow[] }> = ({ rows }) => {
  if (!rows.length) return <Empty icon="🏆" text="No agents in scope" />;
  const ranked = [...rows].sort((a, b) => b.productivity_score - a.productivity_score);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ranked.map((r, i) => (
        <div key={r.agent_id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px', borderRadius: 'var(--radius-control)',
          backgroundColor: i < 3 ? 'var(--blue-50)' : 'var(--bg-tertiary)',
          border: `1px solid ${i < 3 ? 'var(--blue-200)' : 'transparent'}`,
        }}>
          <span style={{ width: 24, textAlign: 'center', fontSize: i < 3 ? 18 : 13, fontWeight: 600, color: 'var(--text-muted)' }}>{MEDALS[i] ? <svg width={24} height={24} role="img"><title>{`Rank ${MEDALS[i]}`}</title><text x={12} y={17} textAnchor="middle" fill="currentColor" fontSize={14}>{MEDALS[i]}</text></svg> : i + 1}</span>
          <ScoreRing score={r.productivity_score} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.agent_name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {formatNum(r.leads_assigned)} leads · {formatNum(r.deals_closed)} deals · {formatINR(r.revenue_generated)}
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 500, color: catColor(r.productivity_category), backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-control)', padding: '4px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {r.productivity_category}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── AI insight cards ──────────────────────────────────────────────────────────

const TONE: Record<string, { bg: string; border: string; fg: string }> = {
  good: { bg: 'var(--rp-success-bg)', border: 'var(--rp-success-line)', fg: 'var(--rp-success-text)' },
  warn: { bg: 'var(--rp-warn-bg)', border: 'var(--rp-warn-line)', fg: 'var(--rp-warn-text)' },
  info: { bg: 'var(--rp-info-bg)', border: 'var(--rp-info-line)', fg: 'var(--rp-info-text)' },
};

export const InsightCards: React.FC<{ insights: Insight[] }> = ({ insights }) => {
  if (!insights.length) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
      {insights.map((ins, i) => {
        const t = TONE[ins.tone] || TONE.info;
        return (
          <div key={i} style={{ backgroundColor: t.bg, border: `1px solid ${t.border}`, borderRadius: 'var(--radius-card)', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <MetricIcon value={ins.icon} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: t.fg }}>{ins.title}</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{ins.detail}</div>
          </div>
        );
      })}
    </div>
  );
};

// ── Generic category donut (status / type breakdowns) ─────────────────────────

export const CategoryDonut: React.FC<{ data: Array<{ name: string; value: number }>; centerLabel?: string }> = ({ data, centerLabel = 'total' }) => {
  const c = useChartColors();
  const rows = data.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, x) => s + x.value, 0);
  if (!total) return <Empty icon="📦" text="No data in this period" />;
  return (
    <div className="rp-chart-pair">
      <div style={{ position: 'relative', height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} cx="50%" cy="50%" innerRadius={56} outerRadius={84} paddingAngle={2} dataKey="value" nameKey="name" stroke="none">
              {rows.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 10, color: 'var(--text-primary)', fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{formatNum(total)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{centerLabel}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {rows.slice(0, 7).map((r, i) => (
          <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: SERIES[i % SERIES.length], flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-primary)', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || '—'}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatNum(r.value)} · {pct(r.value, total).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Value bars (ranked, shows the raw value not a %) ──────────────────────────

export const ValueBars: React.FC<{
  rows: Array<{ label: string; value: number; color?: string }>;
  format?: (n: number) => string;
  color?: string;
  emptyIcon?: string;
  emptyText?: string;
}> = ({ rows, format = formatNum, color, emptyIcon, emptyText }) => {
  if (!rows.length) return <Empty icon={emptyIcon} text={emptyText || 'No data'} />;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {rows.map((r, i) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 130, fontSize: 12.5, color: 'var(--text-secondary)', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{r.label || '—'}</span>
          <div style={{ flex: 1, height: 18, borderRadius: 5, backgroundColor: 'var(--bg-tertiary)', overflow: 'hidden' }}>
            <div style={{ width: `${(r.value / max) * 100}%`, height: '100%', backgroundColor: r.color || color || SERIES[i % SERIES.length], borderRadius: 5, transition: 'width 600ms ease' }} />
          </div>
          <span style={{ width: 72, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right', flexShrink: 0 }}>{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
};
