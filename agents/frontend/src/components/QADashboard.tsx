
import { useEffect, useState } from 'react';
import { getAgentDashboardHealth } from '../api/client';

interface AgentMetric {
    agent_name: string;
    total_actions: number;
    successful: number;
    failed: number;
    escalated: number;
    error_rate: number;
    avg_duration_ms: number;
    avg_quality_score: number | null;
}

interface SystemHealth {
    uptime_seconds: number;
    total_contacts: number;
    total_interactions_today: number;
    active_properties: number;
    active_sessions: number;
    agent_metrics: AgentMetric[];
    conversion_funnel: Record<string, number>;
    quality_summary: {
        avg_score: number | null;
        total_checks: number;
        flagged: number;
        sentiment_breakdown: Record<string, number>;
    };
    security_summary: {
        total_events: number;
        high_severity: number;
        critical_severity: number;
    };
    campaign_summary: {
        total_campaigns: number;
        total_sent: number;
        active_campaigns: number;
    };
}

const FUNNEL_STAGES = [
    { key: 'NEW', label: 'New', color: 'var(--text-secondary)' },
    { key: 'QUALIFIED', label: 'Qualified', color: 'var(--text-link)' },
    { key: 'MATCHING_APPOINTMENT', label: 'Matching Appt.', color: '#ec4899' },
    { key: 'VISIT_SCHEDULED', label: 'Visit Scheduled', color: '#fbbf24' },
    { key: 'VISITED', label: 'Visited', color: '#f97316' },
    { key: 'NEGOTIATION', label: 'Negotiation', color: '#fb923c' },
    { key: 'CLOSED_WON', label: 'Closed Won', color: '#22c55e' },
    { key: 'CLOSED_LOST', label: 'Closed Lost', color: '#ef4444' },
    { key: 'ON_HOLD', label: 'On Hold', color: '#6b7280' },
];

const SENTIMENT_COLORS: Record<string, string> = {
    positive: '#22c55e',
    neutral: '#f59e0b',
    negative: '#ef4444',
    frustrated: '#dc2626',
};

function formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

export function QADashboard() {
    const [health, setHealth] = useState<SystemHealth | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        loadHealth();
    }, []);

    const loadHealth = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await getAgentDashboardHealth();
            setHealth(res.data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to load system health');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>Loading system health...</div>;
    }

    if (error || !health) {
        return (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', gap: '12px' }}>
                <span>{error || 'Failed to load data'}</span>
                <button onClick={loadHealth} style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}>
                    Retry
                </button>
            </div>
        );
    }

    const funnelMax = Math.max(...Object.values(health.conversion_funnel), 1);

    return (
        <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>AI Agent Dashboard</h2>
                    <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '13px' }}>
                        System Health & Agent Performance Monitor
                    </p>
                </div>
                <button
                    onClick={loadHealth}
                    style={{
                        backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', color: 'var(--text-secondary)',
                        padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px'
                    }}
                >
                    Refresh
                </button>
            </div>

            {/* System Overview Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                {[
                    { label: 'Uptime', value: formatUptime(health.uptime_seconds), color: '#22c55e' },
                    { label: 'Total Contacts', value: health.total_contacts, color: '#3b82f6' },
                    { label: 'Interactions Today', value: health.total_interactions_today, color: '#f59e0b' },
                    { label: 'Active Properties', value: health.active_properties, color: '#8b5cf6' },
                    { label: 'Active Sessions', value: health.active_sessions, color: '#06b6d4' },
                    { label: 'QA Avg Score', value: health.quality_summary.avg_score ? `${health.quality_summary.avg_score}/10` : 'N/A', color: health.quality_summary.avg_score && health.quality_summary.avg_score >= 7 ? '#22c55e' : '#f59e0b' },
                ].map(card => (
                    <div key={card.label} style={{
                        backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: '16px',
                        border: '1px solid var(--border-secondary)'
                    }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '6px' }}>{card.label}</div>
                        <div style={{ color: card.color, fontSize: '24px', fontWeight: 700 }}>{card.value}</div>
                    </div>
                ))}
            </div>

            {/* Agent Metrics Table */}
            <div style={{
                backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px',
                border: '1px solid var(--border-secondary)', marginBottom: '24px'
            }}>
                <h3 style={{ color: 'var(--text-primary)', margin: '0 0 16px', fontSize: '16px' }}>Agent Performance (Today)</h3>
                {health.agent_metrics.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>No agent activity today</div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                                    {['Agent', 'Actions', 'Success', 'Failed', 'Escalated', 'Error Rate', 'Avg Time', 'Quality'].map(h => (
                                        <th key={h} style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '12px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {health.agent_metrics.map(agent => (
                                    <tr key={agent.agent_name} style={{ borderBottom: '1px solid var(--bg-secondary)' }}>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-bright)', fontSize: '13px', fontWeight: 600 }}>
                                            {agent.agent_name}
                                        </td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-bright)', fontSize: '13px' }}>{agent.total_actions}</td>
                                        <td style={{ padding: '10px 12px', color: '#22c55e', fontSize: '13px' }}>{agent.successful}</td>
                                        <td style={{ padding: '10px 12px', color: agent.failed > 0 ? '#ef4444' : 'var(--text-muted)', fontSize: '13px' }}>{agent.failed}</td>
                                        <td style={{ padding: '10px 12px', color: agent.escalated > 0 ? '#f59e0b' : 'var(--text-muted)', fontSize: '13px' }}>{agent.escalated}</td>
                                        <td style={{ padding: '10px 12px', fontSize: '13px' }}>
                                            <span style={{
                                                color: agent.error_rate > 10 ? '#ef4444' : agent.error_rate > 5 ? '#f59e0b' : '#22c55e',
                                                fontWeight: 600,
                                            }}>
                                                {agent.error_rate}%
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '13px' }}>{agent.avg_duration_ms}ms</td>
                                        <td style={{ padding: '10px 12px', fontSize: '13px' }}>
                                            {agent.avg_quality_score !== null ? (
                                                <span style={{
                                                    color: agent.avg_quality_score >= 7 ? '#22c55e' : agent.avg_quality_score >= 5 ? '#f59e0b' : '#ef4444',
                                                    fontWeight: 600,
                                                }}>
                                                    {agent.avg_quality_score}/10
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)' }}>-</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Conversion Funnel */}
            <div style={{
                backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px',
                border: '1px solid var(--border-secondary)', marginBottom: '24px'
            }}>
                <h3 style={{ color: 'var(--text-primary)', margin: '0 0 16px', fontSize: '16px' }}>Lead Conversion Funnel</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {FUNNEL_STAGES.map(stage => {
                        const count = health.conversion_funnel[stage.key] || 0;
                        const pct = Math.round((count / funnelMax) * 100);
                        return (
                            <div key={stage.key}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span style={{ color: 'var(--text-bright)', fontSize: '13px' }}>{stage.label}</span>
                                    <span style={{ color: stage.color, fontSize: '13px', fontWeight: 600 }}>{count}</span>
                                </div>
                                <div style={{ height: '8px', backgroundColor: 'var(--bg-primary)', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${pct}%`, height: '100%', minWidth: count > 0 ? '4px' : '0',
                                        backgroundColor: stage.color, borderRadius: '4px', transition: 'width 0.3s'
                                    }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Bottom Grid: Quality + Security + Campaigns */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                {/* Quality Summary */}
                <div style={{
                    backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px',
                    border: '1px solid var(--border-secondary)'
                }}>
                    <h3 style={{ color: 'var(--text-primary)', margin: '0 0 16px', fontSize: '15px' }}>QA Quality</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Checks Today</span>
                            <span style={{ color: 'var(--text-bright)', fontSize: '13px', fontWeight: 600 }}>{health.quality_summary.total_checks}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Flagged</span>
                            <span style={{ color: health.quality_summary.flagged > 0 ? '#ef4444' : '#22c55e', fontSize: '13px', fontWeight: 600 }}>
                                {health.quality_summary.flagged}
                            </span>
                        </div>
                        {Object.keys(health.quality_summary.sentiment_breakdown).length > 0 && (
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Sentiment</div>
                                {Object.entries(health.quality_summary.sentiment_breakdown).map(([sentiment, count]) => (
                                    <div key={sentiment} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span style={{ color: SENTIMENT_COLORS[sentiment] || 'var(--text-secondary)', fontSize: '13px', textTransform: 'capitalize' }}>{sentiment}</span>
                                        <span style={{ color: 'var(--text-bright)', fontSize: '13px' }}>{count}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Security Summary */}
                <div style={{
                    backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px',
                    border: '1px solid var(--border-secondary)'
                }}>
                    <h3 style={{ color: 'var(--text-primary)', margin: '0 0 16px', fontSize: '15px' }}>Security</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Events Today</span>
                            <span style={{ color: 'var(--text-bright)', fontSize: '13px', fontWeight: 600 }}>{health.security_summary.total_events}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>High Severity</span>
                            <span style={{ color: health.security_summary.high_severity > 0 ? '#f59e0b' : '#22c55e', fontSize: '13px', fontWeight: 600 }}>
                                {health.security_summary.high_severity}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Critical</span>
                            <span style={{ color: health.security_summary.critical_severity > 0 ? '#ef4444' : '#22c55e', fontSize: '13px', fontWeight: 600 }}>
                                {health.security_summary.critical_severity}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Campaign Summary */}
                <div style={{
                    backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px',
                    border: '1px solid var(--border-secondary)'
                }}>
                    <h3 style={{ color: 'var(--text-primary)', margin: '0 0 16px', fontSize: '15px' }}>Campaigns</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Total</span>
                            <span style={{ color: 'var(--text-bright)', fontSize: '13px', fontWeight: 600 }}>{health.campaign_summary.total_campaigns}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Messages Sent</span>
                            <span style={{ color: '#3b82f6', fontSize: '13px', fontWeight: 600 }}>{health.campaign_summary.total_sent}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Active</span>
                            <span style={{ color: '#22c55e', fontSize: '13px', fontWeight: 600 }}>{health.campaign_summary.active_campaigns}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
