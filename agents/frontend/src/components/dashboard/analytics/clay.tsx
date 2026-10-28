import React from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import { formatCount, formatCurrency } from '../../../lib/format';
import { PresentationIcon as MetricIcon } from '../../ui/PresentationIcon';
export { PresentationIcon as MetricIcon } from '../../ui/PresentationIcon';

/**
 * Clay analytics kit — shared visual primitives for the redesigned dashboards.
 * Everything here extends the home-tab "clay + bento" language (soft shadows,
 * --radius-clay, token-driven colours) so analytics finally feels like one app.
 * Light + dark are both first-class: chart colours come from useChartColors(),
 * which switches axis/grid hues by the active theme.
 */

// One blue family plus neutrals. Labels and legend order carry series identity.
export const SERIES = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)',
  'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)', 'var(--chart-9)', 'var(--chart-10)',
];

export interface ChartColors {
  isDark: boolean;
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  up: string;
  down: string;
  series: string[];
}

export function useChartColors(): ChartColors {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  return {
    isDark,
    grid: 'var(--border-primary)',
    axis: 'var(--text-muted)',
    tooltipBg: 'var(--bg-primary)',
    tooltipBorder: 'var(--border-secondary)',
    up: 'var(--rp-success-text)',
    down: 'var(--rp-danger-text)',
    series: SERIES,
  };
}

// ── Formatting helpers ─────────────────────────────────────────────────────
// These delegate to lib/format.ts (the single formatting owner) with options
// pinned to preserve the exact output this dashboard has always rendered.

export function formatNum(n: number): string {
  return formatCount(n);
}

/** Dashboard money: ₹4.2 Cr / ₹5.3 L / ₹8,400 — unchanged from before. */
export function formatINR(n: number): string {
  return formatCurrency(n, { crDecimals: 2, spaced: true });
}

export function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return (part / whole) * 100;
}

/** Minutes → "45m" / "5h 31m" / "2d 3h". For speed-to-lead + durations. */
export function formatMins(m: number | null | undefined): string {
  if (m == null || !isFinite(m)) return '—';
  const mins = Math.round(m);
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) { const h = Math.floor(mins / 60); const r = mins % 60; return r ? `${h}h ${r}m` : `${h}h`; }
  const d = Math.floor(mins / 1440); const h = Math.floor((mins % 1440) / 60);
  return h ? `${d}d ${h}h` : `${d}d`;
}

// ── Clay shell ─────────────────────────────────────────────────────────────

interface ClayCardProps {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  /** subtle accent tint on the card edge */
  accent?: string;
  padding?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export const ClayCard: React.FC<ClayCardProps> = ({ title, subtitle, right, accent, padding = 20, style, children }) => (
  <div
    className="rp-dashboard-card"
    style={{
      backgroundColor: 'var(--bg-primary)',
      borderRadius: 'var(--rp-radius)',
      border: `1px solid ${accent ? 'var(--blue-200)' : 'var(--border-primary)'}`,
      padding,
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0,
      ...style,
    }}
  >
    {(title || right) && (
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: subtitle ? 2 : 14 }}>
        <div style={{ minWidth: 0 }}>
          {title && <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--text-primary)', textWrap: 'balance', letterSpacing: '-0.01em' }}>{title}</h3>}
          {subtitle && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 14px' }}>{subtitle}</p>}
        </div>
        {right && <div style={{ flexShrink: 0 }}>{right}</div>}
      </div>
    )}
    {children}
  </div>
);

export const SectionLabel: React.FC<{ children: React.ReactNode; icon?: string }> = ({ children, icon }) => (
  <p style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
    {icon && <MetricIcon value={icon} />}
    {children}
  </p>
);

// ── Delta badge ─────────────────────────────────────────────────────────────

export const DeltaBadge: React.FC<{ delta: number | null; suffix?: string }> = ({ delta, suffix = '%' }) => {
  if (delta === null || !isFinite(delta)) {
    return <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>—</span>;
  }
  const up = delta >= 0;
  const color = up ? 'var(--rp-success-text)' : 'var(--rp-danger-text)';
  const label = `${up ? 'Up' : 'Down'} ${Math.abs(delta).toFixed(1)}${suffix} versus previous period`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 11, fontWeight: 800, color,
        backgroundColor: up ? 'var(--rp-success-bg)' : 'var(--rp-danger-bg)', borderRadius: 8, padding: '2px 7px',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 9 }}>{up ? '▲' : '▼'}</span>
      {Math.abs(delta).toFixed(1)}{suffix}
    </span>
  );
};

// ── Sparkline (tiny inline SVG) ──────────────────────────────────────────────

export const Sparkline: React.FC<{ data: number[]; color?: string; width?: number; height?: number }> = ({
  data, color = 'var(--blue-600)', width = 96, height = 30,
}) => {
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => [i * stepX, height - ((v - min) / span) * (height - 4) - 2]);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const gid = `spark-${color.replace('#', '')}`;
  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <g id={gid}><path d={area} fill={color} fillOpacity={0.08} /></g>
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

// ── KPI tile ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  delta?: number | null;
  deltaSuffix?: string;
  spark?: number[];
  accent?: string;
  icon?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({ label, value, sub, delta, deltaSuffix, spark, accent = 'var(--blue-600)', icon }) => (
  <div style={{
    backgroundColor: 'var(--bg-primary)',
    borderRadius: 'var(--rp-radius)',
    border: '1px solid var(--border-primary)',
    padding: 'var(--rp-s-5)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    position: 'relative',
    overflow: 'hidden',
    minWidth: 0,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
        {icon && <span style={{ marginRight: 8 }}><MetricIcon value={icon} /></span>}{label}
      </span>
      {delta !== undefined && <DeltaBadge delta={delta ?? null} suffix={deltaSuffix} />}
    </div>
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.15, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{sub}</div>}
      </div>
      {spark && spark.length > 1 && <Sparkline data={spark} color={accent} />}
    </div>
  </div>
);
