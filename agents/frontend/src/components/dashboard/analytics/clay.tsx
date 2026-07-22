import React from 'react';
import { useTheme } from '../../../contexts/ThemeContext';

/**
 * Clay analytics kit — shared visual primitives for the redesigned dashboards.
 * Everything here extends the home-tab "clay + bento" language (soft shadows,
 * --radius-clay, token-driven colours) so analytics finally feels like one app.
 * Light + dark are both first-class: chart colours come from useChartColors(),
 * which switches axis/grid hues by the active theme.
 */

// Vivid series palette — legible on both light and dark backgrounds.
export const SERIES = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
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
    grid: isDark ? '#1e293b' : '#e2e8f0',
    axis: isDark ? '#94a3b8' : '#64748b',
    tooltipBg: isDark ? '#0f172a' : '#ffffff',
    tooltipBorder: isDark ? '#334155' : '#cbd5e1',
    up: '#22c55e',
    down: '#ef4444',
    series: SERIES,
  };
}

// ── Formatting helpers ─────────────────────────────────────────────────────

export function formatNum(n: number): string {
  if (!isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-IN');
}

/** Indian-style money: ₹4.2 Cr / ₹5.3 L / ₹8,400. */
export function formatINR(n: number): string {
  if (!n || !isFinite(n)) return '₹0';
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
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
    style={{
      backgroundColor: 'var(--bg-secondary)',
      borderRadius: 'var(--radius-clay)',
      boxShadow: 'var(--shadow-clay)',
      border: `1px solid ${accent ? accent + '40' : 'var(--border-primary)'}`,
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
          {title && <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{title}</h3>}
          {subtitle && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 14px' }}>{subtitle}</p>}
        </div>
        {right && <div style={{ flexShrink: 0 }}>{right}</div>}
      </div>
    )}
    {children}
  </div>
);

export const SectionLabel: React.FC<{ children: React.ReactNode; icon?: string }> = ({ children, icon }) => (
  <p style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
    {icon && <span>{icon}</span>}
    {children}
  </p>
);

// ── Delta badge ─────────────────────────────────────────────────────────────

export const DeltaBadge: React.FC<{ delta: number | null; suffix?: string }> = ({ delta, suffix = '%' }) => {
  if (delta === null || !isFinite(delta)) {
    return <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>—</span>;
  }
  const up = delta >= 0;
  const color = up ? '#22c55e' : '#ef4444';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      fontSize: 11, fontWeight: 800, color,
      backgroundColor: color + '1a', borderRadius: 8, padding: '2px 7px',
    }}>
      <span style={{ fontSize: 9 }}>{up ? '▲' : '▼'}</span>
      {Math.abs(delta).toFixed(1)}{suffix}
    </span>
  );
};

// ── Sparkline (tiny inline SVG) ──────────────────────────────────────────────

export const Sparkline: React.FC<{ data: number[]; color?: string; width?: number; height?: number }> = ({
  data, color = '#3b82f6', width = 96, height = 30,
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
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
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

export const KpiCard: React.FC<KpiCardProps> = ({ label, value, sub, delta, deltaSuffix, spark, accent = '#3b82f6', icon }) => (
  <div style={{
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: 'var(--radius-clay)',
    boxShadow: 'var(--shadow-clay)',
    border: `1px solid ${accent}33`,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    position: 'relative',
    overflow: 'hidden',
    minWidth: 0,
  }}>
    <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', backgroundColor: accent, opacity: 0.85 }} />
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {icon && <span style={{ marginRight: 5 }}>{icon}</span>}{label}
      </span>
      {delta !== undefined && <DeltaBadge delta={delta ?? null} suffix={deltaSuffix} />}
    </div>
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.05, letterSpacing: '-0.02em' }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      {spark && spark.length > 1 && <Sparkline data={spark} color={accent} />}
    </div>
  </div>
);
