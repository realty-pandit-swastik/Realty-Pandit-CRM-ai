import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { SERIES, useChartColors, formatNum, formatINR, pct } from './clay';
import type { SourceRow, FunnelRow, AgeRow, HealthRow, RankRow, Insight } from './leadData';

export const Empty: React.FC<{ icon?: string; text: string }> = ({ icon = '∅', text }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', gap: 8, color: 'var(--text-muted)', textAlign: 'center' }}>
    <span style={{ fontSize: 28, opacity: 0.5 }}>{icon}</span>
    <span style={{ fontSize: 13 }}>{text}</span>
  </div>
);

// ── Source donut + ranked quality bars ───────────────────────────────────────

export const SourceDonut: React.FC<{ sources: SourceRow[] }> = ({ sources }) => {
  const c = useChartColors();
  const total = sources.reduce((s, x) => s + x.count, 0);
  if (!total) return <Empty icon="🎯" text="No leads in this period" />;
  const data = sources.slice(0, 8).map((s) => ({ name: s.source, value: s.count }));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 240px) 1fr', gap: 18, alignItems: 'center' }}>
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
          const convColor = conv >= 10 ? '#22c55e' : conv >= 5 ? '#f59e0b' : '#94a3b8';
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

const FUNNEL_COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#22c55e'];

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
                <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{formatNum(f.count)}</span>
              </div>
            </div>
            <span style={{ width: 64, fontSize: 11, color: f.dropFromPrev != null && f.dropFromPrev > 0 ? '#ef4444' : 'var(--text-muted)', textAlign: 'left', flexShrink: 0 }}>
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
  if (!total) return <Empty icon="🌡️" text="No active leads to score" />;
  const segs = [
    { label: 'Hot', value: hot, color: '#ef4444', icon: '🔥' },
    { label: 'Warm', value: warm, color: '#f59e0b', icon: '🟠' },
    { label: 'Cold', value: cold, color: '#3b82f6', icon: '❄️' },
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
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{formatNum(s.value)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{s.icon} {s.label} · {pct(s.value, total).toFixed(0)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Ageing buckets (color-graded urgency) ─────────────────────────────────────

const AGE_COLORS: Record<string, string> = {
  '0–7d': '#22c55e', '8–15d': '#84cc16', '16–30d': '#eab308',
  '31–60d': '#f59e0b', '61–90d': '#f97316', '90d+': '#ef4444',
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
          <div style={{ width: '100%', maxWidth: 42, height: `${(a.count / max) * 100}%`, minHeight: a.count > 0 ? 4 : 0, backgroundColor: AGE_COLORS[a.label] || '#3b82f6', borderRadius: '6px 6px 0 0', transition: 'height 600ms ease' }} />
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{a.label}</span>
        </div>
      ))}
    </div>
  );
};

// ── Ranked bars (generic — lost reasons, areas) ───────────────────────────────

export const RankedBars: React.FC<{ rows: RankRow[]; color?: string; emptyIcon?: string; emptyText?: string }> = ({ rows, color = '#8b5cf6', emptyIcon, emptyText }) => {
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
    case 'Excellent': return '#22c55e';
    case 'Good': return '#3b82f6';
    case 'Average': return '#f59e0b';
    default: return '#ef4444';
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

const MEDALS = ['🥇', '🥈', '🥉'];

export const Leaderboard: React.FC<{ rows: LeaderRow[] }> = ({ rows }) => {
  if (!rows.length) return <Empty icon="🏆" text="No agents in scope" />;
  const ranked = [...rows].sort((a, b) => b.productivity_score - a.productivity_score);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ranked.map((r, i) => (
        <div key={r.agent_id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 12px', borderRadius: 12,
          backgroundColor: i < 3 ? catColor(r.productivity_category) + '0f' : 'var(--bg-tertiary)',
          border: `1px solid ${i < 3 ? catColor(r.productivity_category) + '33' : 'transparent'}`,
        }}>
          <span style={{ width: 24, textAlign: 'center', fontSize: i < 3 ? 18 : 13, fontWeight: 700, color: 'var(--text-muted)' }}>{MEDALS[i] || i + 1}</span>
          <ScoreRing score={r.productivity_score} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.agent_name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {formatNum(r.leads_assigned)} leads · {formatNum(r.deals_closed)} deals · {formatINR(r.revenue_generated)}
            </div>
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: catColor(r.productivity_category), backgroundColor: catColor(r.productivity_category) + '1a', borderRadius: 8, padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {r.productivity_category}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── AI insight cards ──────────────────────────────────────────────────────────

const TONE: Record<string, { bg: string; border: string; fg: string }> = {
  good: { bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.35)', fg: '#22c55e' },
  warn: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.35)', fg: '#f59e0b' },
  info: { bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.30)', fg: '#3b82f6' },
};

export const InsightCards: React.FC<{ insights: Insight[] }> = ({ insights }) => {
  if (!insights.length) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
      {insights.map((ins, i) => {
        const t = TONE[ins.tone] || TONE.info;
        return (
          <div key={i} style={{ backgroundColor: t.bg, border: `1px solid ${t.border}`, borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 16 }}>{ins.icon}</span>
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
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 220px) 1fr', gap: 18, alignItems: 'center' }}>
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
