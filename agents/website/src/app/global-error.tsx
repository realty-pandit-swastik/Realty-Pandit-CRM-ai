'use client';

// Root error boundary (App Router). Renders when an error escapes the root layout itself —
// e.g. a ChunkLoadError / hydration crash. It must include <html>/<body> because it REPLACES
// the root layout. Kept fully self-contained (inline styles, no app imports/fonts) so it works
// even when the app bundle is the thing that broke. (2026-06-26 — defense-in-depth for the SW
// stale/empty-chunk class of crash; the real fix is in public/sw.js.)

import { useEffect } from 'react';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const blob = `${error?.name || ''} ${error?.message || ''}`;
    const isChunkError = /ChunkLoadError|Loading chunk|importing a module script failed|dynamically imported module|Failed to fetch dynamically/i.test(blob);
    // A chunk/version mismatch usually recovers with one fresh reload (which re-fetches assets;
    // with the SW fix they are no longer poisoned). Auto-reload ONCE, guarded against loops.
    if (isChunkError) {
      const KEY = 'rp_global_error_reloaded';
      try {
        if (!sessionStorage.getItem(KEY)) {
          sessionStorage.setItem(KEY, '1');
          window.location.reload();
        }
      } catch {
        /* sessionStorage unavailable — fall through to manual reload UI */
      }
    }
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', background: '#0f172a', color: '#e2e8f0' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', boxSizing: 'border-box' }}>
          <div style={{ maxWidth: 440 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏠</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 10px' }}>Something went wrong</h1>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: '#94a3b8', margin: '0 0 24px' }}>
              We couldn’t finish loading Realty Pandit. This is usually a temporary network hiccup — please reload to try again.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => window.location.reload()}
                style={{ padding: '11px 22px', borderRadius: 10, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
              >
                Reload page
              </button>
              <a
                href="https://wa.me/918178491914"
                style={{ padding: '11px 22px', borderRadius: 10, border: '1px solid #334155', background: 'transparent', color: '#e2e8f0', fontSize: 15, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}
              >
                Chat on WhatsApp
              </a>
            </div>
            {error?.digest ? (
              <p style={{ fontSize: 12, color: '#475569', marginTop: 20 }}>Ref: {error.digest}</p>
            ) : null}
          </div>
        </div>
      </body>
    </html>
  );
}
