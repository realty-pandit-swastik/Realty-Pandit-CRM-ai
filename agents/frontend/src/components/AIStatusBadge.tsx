interface AIStatusBadgeProps {
    status: 'active' | 'waiting' | 'paused';
    className?: string;
}

export function AIStatusBadge({ status, className = '' }: AIStatusBadgeProps) {
    const config = {
        active:  { dot: 'var(--rp-success-text)', label: 'AI Active', bg: 'var(--rp-success-bg)' },
        waiting: { dot: 'var(--rp-warn-text)', label: 'Waiting for team', bg: 'var(--rp-warn-bg)' },
        paused:  { dot: 'var(--text-secondary)', label: 'AI Paused', bg: 'var(--bg-secondary)' },
    }[status];

    return (
        <span
            className={className}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: config.bg, borderRadius: 'var(--radius-control)',
                padding: '2px 8px', fontSize: 11, fontWeight: 500,
                color: config.dot,
            }}
        >
            <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: config.dot,
            }} />
            {config.label}
        </span>
    );
}
