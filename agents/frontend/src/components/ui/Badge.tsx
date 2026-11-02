import React from 'react';

/**
 * Status pill. Colour is never the only signal: every pill renders a dot
 * *and* its text label, so it survives greyscale, low vision and screen readers.
 *
 * Tone maps to the --rp-{info,success,warn,danger,neutral}-* tokens, which have
 * light and dark pairs in index.css.
 */
export type BadgeTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger';

export interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  /** Overrides the dot colour when the semantic colour is misleading (e.g. legacy source tags). */
  dotColor?: string;
  title?: string;
  style?: React.CSSProperties;
  className?: string;
}

export function Badge({ children, tone = 'neutral', dotColor, title, style, className }: BadgeProps) {
  const cls = ['rp-pill', tone !== 'neutral' ? `rp-pill--${tone}` : '', className].filter(Boolean).join(' ');
  return (
    <span className={cls} title={title} style={style}>
      {dotColor ? (
        <span
          aria-hidden="true"
          style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: dotColor, display: 'inline-block',
          }}
        />
      ) : null}
      {children}
    </span>
  );
}

export default Badge;