import React from 'react';

/**
 * Breadcrumbs. Each ancestor is a real button that calls back into the existing
 * view state — no router, no navigation library. The final crumb is the current
 * location and is marked aria-current="page".
 */
export interface Crumb {
  label: string;
  onClick?: () => void;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav className="rp-crumbs" aria-label="Breadcrumb">
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <React.Fragment key={`${c.label}-${i}`}>
            {i > 0 && (
              <span className="rp-crumbs__sep" aria-hidden="true">
                /
              </span>
            )}
            {last || !c.onClick ? (
              <span className="rp-crumbs__current" aria-current={last ? 'page' : undefined}>
                {c.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={c.onClick}
                style={{
                  background: 'none', border: 0, padding: 0, cursor: 'pointer',
                  font: 'inherit', fontSize: 12, color: 'var(--text-muted)',
                  textDecoration: 'underline', textUnderlineOffset: 2,
                }}
              >
                {c.label}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

export default Breadcrumbs;