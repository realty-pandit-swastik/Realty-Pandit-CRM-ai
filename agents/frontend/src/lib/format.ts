/**
 * Canonical formatting for Realty Pandit CRM.
 *
 * Before this module the app carried 14 divergent currency/date implementations
 * (see docs/design/ui-redesign-behaviour-baseline.md §E). The same property
 * rendered three ways depending on the screen:
 *
 *   InventoryList.tsx:38       ₹95.0 Cr   /month   "Price on request" on null
 *   InventoryDetailView.tsx:65 ₹95.00 Cr  /mo      — on null
 *   ExternalLeads.tsx:166      ₹95.0Cr    (none)   - on null
 *
 * This module is the single owner of number/date/currency presentation.
 * It is presentation-only: no network, no state, no business rules.
 *
 * Migration rule used throughout: the *number* format is unified, but each call
 * site keeps its own null/absent copy via an explicit option, so no screen
 * silently changes the words a user reads.
 */

const NBSP = ' ';

/** Indian digit grouping, e.g. 1234567 -> "12,34,567". */
export function groupIndian(n: number): string {
  return Math.round(n).toLocaleString('en-IN');
}

export interface InrOptions {
  /** Appended verbatim after the amount, e.g. '/month', '/mo'. Default none. */
  suffix?: string;
  /** Decimals for the Cr (crore) band. Default 1. */
  crDecimals?: 1 | 2;
  /** Decimals for the L / Lakh band. Default 1. */
  lakhDecimals?: 0 | 1;
  /** Label for the lakh band. 'L' is terse; 'Lakh' is spelled out. Default 'L'. */
  lakhLabel?: 'L' | 'Lakh';
  /** Space between the number and its unit. Default false. */
  spaced?: boolean;
  /** Returned when the value is null/NaN. Default '—'. */
  fallback?: string;
  /** Treat 0 as absent (property prices). Default true. */
  zeroIsAbsent?: boolean;
}

/**
 * Compact Indian rupees: ₹95.0 Cr / ₹95.0 L / ₹9,50,000.
 * Values below one lakh are never abbreviated so small rents stay readable.
 */
export function formatINR(
  value: number | string | null | undefined,
  opts: InrOptions = {},
): string {
  const {
    suffix = '',
    crDecimals = 1,
    lakhDecimals = 1,
    lakhLabel = 'L',
    spaced = false,
    fallback = '—',
    zeroIsAbsent = true,
  } = opts;

  if (value === null || value === undefined || value === '') return fallback;
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return fallback;
  if (zeroIsAbsent && n === 0) return fallback;

  const gap = spaced ? ' ' : '';
  // Sign placement follows the existing house convention (₹-45,000, not -₹45,000)
  // so every previously-rendered value stays byte-identical.
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);

  if (abs >= 1e7) return `₹${sign}${(abs / 1e7).toFixed(crDecimals)}${gap}Cr${suffix}`;
  if (abs >= 1e5) return `₹${sign}${(abs / 1e5).toFixed(lakhDecimals)}${gap}${lakhLabel}${suffix}`;
  return `₹${sign}${abs.toLocaleString('en-IN')}${suffix}`;
}

/**
 * Property price. `intent === 'rent'` appends a per-month suffix, matching the
 * behaviour every inventory screen already had — but with one spelling.
 */
export function formatPrice(
  price: number | string | null | undefined,
  intent?: string | null,
  fallback = '—',
): string {
  const suffix = intent === 'rent' ? '/mo' : '';
  return formatINR(price, { suffix, fallback });
}

/**
 * Dashboard money: ₹4.2 Cr / ₹5.3 L / ₹8,400.
 * Pins the legacy dashboard contract (2-decimal Cr, spaced, "₹0" when absent)
 * so analytics tiles render byte-identically to before consolidation.
 */
export function formatCurrency(
  value: number | string | null | undefined,
  opts: InrOptions = {},
): string {
  const numeric = value === null || value === undefined || value === '' ? NaN : Number(value);
  // Decide the band BEFORE rounding, as the original dashboard did. Otherwise
  // 99,999.70 crosses the lakh boundary and changes the displayed unit.
  if (Number.isFinite(numeric) && Math.abs(numeric) < 1e5) {
    return `₹${Math.round(numeric).toLocaleString('en-IN')}${opts.suffix ?? ''}`;
  }
  return formatINR(value, {
    crDecimals: 2,
    spaced: true,
    fallback: '₹0',
    zeroIsAbsent: false,
    ...opts,
  });
}

/**
 * Lead budget. Accepts either a single cap or a min/max pair.
 * Single value: `₹95.0Cr`. Pair: `₹95.0 – ₹1.2Cr` (range keeps each end compact).
 */
export function formatBudget(
  min?: number | string | null,
  max?: number | string | null,
  fallback = '—',
): string {
  // Mirrors the legacy guard (`if (!val) return '-'`): only null/undefined/empty
  // and zero count as absent. Negative budgets are rendered, not swallowed.
  const present = (v: number | string | null | undefined) =>
    v !== null && v !== undefined && v !== '' && Number(v) !== 0;
  const hasMin = present(min);
  const hasMax = present(max);
  if (!hasMin && !hasMax) return fallback;
  const fmt = (v: number | string) => formatINR(v, { zeroIsAbsent: false });
  if (hasMin && hasMax) return `${fmt(min as number)} – ${fmt(max as number)}`;
  return fmt((hasMin ? min : max) as number);
}

/** Plain integer count with Indian grouping. */
export function formatCount(n: number | null | undefined, fallback = '0'): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return fallback;
  return Math.round(n).toLocaleString('en-IN');
}

/** 12.4 — one decimal, no trailing noise. */
export function formatPercent(
  n: number | null | undefined,
  decimals = 1,
  fallback = '—',
): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return fallback;
  return `${n.toFixed(decimals)}`;
}

/** 2h · 6h · 2d — compact age from an ISO timestamp. */
export function formatAge(iso?: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

/** 17 Oct — the compact date used in dense table cells. */
export function formatDateShort(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

/** 17 Oct 2026 — with year, for detail headers and confirmations. */
export function formatDateLong(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** 17 Oct, 14:05 — IST-aware, matching the timeline surfaces. */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** '+91 99588 60411' — display form of an E.164 phone. Never used for dialling. */
export function formatPhone(phone?: string | null): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    const rest = digits.slice(2);
    return `+91 ${rest.slice(0, 5)} ${rest.slice(5)}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  return phone;
}

/** Margin between two prices, e.g. '+₹1.2 L (12.0%)'. */
export function formatMargin(base: number | null | undefined, display: number | null | undefined): string {
  if (!base || !display) return '—';
  const margin = display - base;
  const pct = base ? (margin / base) * 100 : 0;
  const sign = margin > 0 ? '+' : '';
  return `${sign}${formatINR(margin, { zeroIsAbsent: false })} (${pct.toFixed(1)}%)`;
}

/** Non-breaking space helper for units that must not wrap mid-value. */
export function keepTogether(value: string): string {
  return value.replace(/(\d)(Cr|L|Lakh)\b/, `$1${NBSP}$2`);
}
