import React from 'react';
import { CircleAlert } from 'lucide-react';
import { MetricIcon } from './clay';

/**
 * Honest async states for the analytics dashboards.
 *
 * The bug this fixes (2026-07-16): every dashboard used `getX().catch(() => null)`
 * (or `.catch(() => ({ empty }))`), so a failed request — a session blip, a CSRF
 * retry, a 5xx — rendered identically to "no data": a page of zeros. Users could
 * not tell "broken" from "empty".
 *
 * `useAsyncData` resolves a fetch into four distinct states — loading / error /
 * empty / ready — so the UI can say the right thing. A failure is `error`
 * (retryable), never collapsed into empty.
 */

export type AsyncStatus = 'loading' | 'error' | 'empty' | 'ready';

export interface AsyncResult<T> {
  status: AsyncStatus;
  data: T | null;
  reload: () => void;
}

/**
 * @param fetcher  runs the request; may reject
 * @param deps     re-fetch when these change (e.g. the date range)
 * @param isEmpty  given a successful payload, is it "empty in scope"?
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList,
  isEmpty: (data: T) => boolean,
): AsyncResult<T> {
  const [status, setStatus] = React.useState<AsyncStatus>('loading');
  const [data, setData] = React.useState<T | null>(null);
  const [nonce, setNonce] = React.useState(0);
  const reqId = React.useRef(0);

  React.useEffect(() => {
    const myId = ++reqId.current;
    setStatus('loading');
    fetcher()
      .then((d) => {
        if (myId !== reqId.current) return; // a newer request has superseded this one
        setData(d);
        setStatus(isEmpty(d) ? 'empty' : 'ready');
      })
      .catch((err) => {
        if (myId !== reqId.current) return;
        console.error('[dashboard] load failed', err);
        setStatus('error'); // the fix: error is NOT empty
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { status, data, reload: () => setNonce((n) => n + 1) };
}

const wrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  minHeight: 280,
  height: '100%',
  textAlign: 'center',
  padding: 24,
  color: 'var(--text-secondary)',
};

export const LoadingState: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div style={wrap} role="status" aria-live="polite" aria-busy="true">
    <div aria-hidden="true" className="rp-skeleton" style={{ width: 180, height: 12 }} />
    <div aria-hidden="true" className="rp-skeleton" style={{ width: 260, height: 12, opacity: 0.7 }} />
    <div>{label}</div>
  </div>
);

export const ErrorState: React.FC<{ onRetry: () => void; label?: string }> = ({
  onRetry,
  label = "Couldn't load this dashboard.",
}) => (
  <div style={wrap} role="alert">
    <CircleAlert size={24} strokeWidth={1.7} aria-hidden="true" style={{ color: 'var(--rp-danger-text)' }} />
    <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 15 }}>{label}</div>
    <div style={{ fontSize: 13, maxWidth: 360 }}>
      It&apos;s a connection or session hiccup — your data is safe. Try again.
    </div>
    <button
      type="button"
      onClick={onRetry}
      className="rp-btn rp-btn--primary"
      style={{ marginTop: 6 }}
    >
      Retry
    </button>
  </div>
);

export const EmptyState: React.FC<{ icon?: string; title?: string; hint?: string }> = ({
  icon = '📭',
  title = 'Nothing here yet',
  hint,
}) => (
  <div style={wrap} role="status">
    <div aria-hidden="true"><MetricIcon value={icon} /></div>
    <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 15 }}>{title}</div>
    {hint && <div style={{ fontSize: 13, maxWidth: 380 }}>{hint}</div>}
  </div>
);
