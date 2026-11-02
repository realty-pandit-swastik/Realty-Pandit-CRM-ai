import React from 'react';
import { CircleAlert, Plus, Search } from 'lucide-react';
import { PresentationIcon } from './PresentationIcon';

/**
 * Shared async-state primitives.
 *
 * Principle: a failure is never rendered as "no data". Each state says what
 * happened and, where the user can act, gives them the control.
 *
 * Extend, don't replace: dashboard/analytics/AsyncState.tsx keeps its own
 * useAsyncData() hook and delegates presentation here.
 */

const center: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  padding: 'var(--rp-s-8) var(--rp-s-4)',
  textAlign: 'center',
  color: 'var(--text-secondary)',
};

/** Shimmering placeholder. Set width/height to match the real content's box so
 *  nothing shifts when data lands (CLS). */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 6,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: React.CSSProperties;
}) {
  return <div aria-hidden="true" className="rp-skeleton" style={{ width, height, borderRadius: radius, ...style }} />;
}

/** A table-shaped skeleton: n rows x cols, mirroring the real grid. */
export function SkeletonRows({ rows = 5, cols = 5, label }: { rows?: number; cols?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" style={{ padding: 'var(--rp-s-2)' }}>
      <span className="sr-only">{label ?? 'Loading'}</span>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'flex', gap: 'var(--rp-s-4)', padding: '11px var(--rp-s-4)', borderBottom: '1px solid var(--border-primary)' }}>
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} width={c === 0 ? '22%' : c === 1 ? '16%' : '12%'} height={13} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * First-use vs no-results are genuinely different states and are worded
 * differently on purpose:
 *  - `firstUse` : nothing has been created yet → invite the primary action,
 *                 and say plainly that the list is empty rather than implying
 *                 something went wrong
 *  - otherwise  : the query/filters simply matched nothing → echo what was
 *                 searched and offer to clear it
 */
export function EmptyState({
  title,
  hint,
  action,
  firstUse = false,
  icon,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  firstUse?: boolean;
  icon?: string;
}) {
  return (
    <div
      className="rp-alert rp-alert--empty"
      style={{ ...center, border: '1px dashed var(--border-secondary)' }}
      role="status"
    >
      <span
        aria-hidden="true"
        style={{
          fontSize: 18,
          lineHeight: 1,
          width: 36,
          height: 36,
          display: 'grid',
          placeItems: 'center',
          borderRadius: 10,
          border: '1px solid var(--border-secondary)',
          background: 'var(--bg-primary)',
          color: 'var(--text-secondary)',
        }}
      >
        {icon ? <PresentationIcon value={icon} /> : firstUse ? <Plus size={18} strokeWidth={1.7} /> : <Search size={18} strokeWidth={1.7} />}
      </span>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h3>
      {hint && <p style={{ margin: 0, fontSize: 13, maxWidth: 420 }}>{hint}</p>}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  );
}

/**
 * Recoverable error. Never surfaces a status code or stack trace — states what
 * happened, that data is safe, and offers the retry.
 */
export function ErrorState({
  onRetry,
  title = "Couldn't load this",
  hint = 'A connection or session hiccup interrupted the request. Nothing was lost — try again.',
  retryLabel = 'Retry',
}: {
  onRetry?: () => void;
  title?: string;
  hint?: string;
  retryLabel?: string;
}) {
  return (
    <div className="rp-alert rp-alert--error" role="alert">
      <CircleAlert size={18} strokeWidth={1.7} aria-hidden="true" />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        <div style={{ fontSize: 12.5, marginTop: 2 }}>{hint}</div>
        {onRetry && (
          <button type="button" className="rp-btn rp-btn--ghost" style={{ marginTop: 10 }} onClick={onRetry}>
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
