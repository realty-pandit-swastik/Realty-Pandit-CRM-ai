interface AIStatusBadgeProps {
    status: 'active' | 'waiting' | 'paused';
    className?: string;
}

export function AIStatusBadge({ status, className = '' }: AIStatusBadgeProps) {
    const config = {
        active:  { dot: '#22c55e', label: 'AI Active',          bg: 'rgba(34,197,94,0.12)'  },
        waiting: { dot: '#f59e0b', label: 'Waiting for team',   bg: 'rgba(245,158,11,0.12)' },
        paused:  { dot: '#6b7280', label: 'AI Paused',          bg: 'rgba(107,114,128,0.12)'},
    }[status];

    return (
        <span
            className={className}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: config.bg, borderRadius: 12,
                padding: '2px 8px', fontSize: 11, fontWeight: 500,
                color: status === 'active' ? '#16a34a' : status === 'waiting' ? '#d97706' : '#4b5563',
            }}
        >
            <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: config.dot,
                boxShadow: status === 'active' ? `0 0 6px ${config.dot}` : undefined,
            }} />
            {config.label}
        </span>
    );
}
