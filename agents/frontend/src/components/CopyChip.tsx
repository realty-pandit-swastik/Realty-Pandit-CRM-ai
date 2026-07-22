import { useState } from 'react';

/**
 * CopyChip — a compact, click-to-copy code pill (#1, 2026-07-01).
 * Shows an inventory display_id (e.g. RP-DEL-RES-20431); one click copies it to
 * the clipboard so the member can paste it into the inventory search. Stops row
 * click-through so it never opens the underlying card.
 */
export function CopyChip({ text, size = 'sm' }: { text?: string | null; size?: 'sm' | 'xs' }) {
    const [copied, setCopied] = useState(false);
    if (!text) return null;
    const fs = size === 'xs' ? 10 : 11;
    const copy = (e: React.MouseEvent) => {
        e.stopPropagation();
        const write = navigator.clipboard?.writeText?.(text);
        if (write) write.then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {});
        else { setCopied(true); setTimeout(() => setCopied(false), 1200); }
    };
    return (
        <button
            type="button"
            onClick={copy}
            title={`Copy ${text}`}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                border: '1px solid var(--border-secondary)', borderRadius: 6, padding: '1px 7px',
                backgroundColor: copied ? '#16a34a22' : 'var(--bg-secondary)',
                color: copied ? '#16a34a' : 'var(--text-secondary)',
                fontSize: fs, fontWeight: 700, fontFamily: 'monospace', lineHeight: 1.7, letterSpacing: '0.2px',
            }}
        >
            {copied ? '✓ Copied' : <>{text}&nbsp;📋</>}
        </button>
    );
}
