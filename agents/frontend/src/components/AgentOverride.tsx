
import { useEffect, useState } from 'react';
import { getQALogs, reviewQALog, toggleQAFlag, getWinningTemplates } from '../api/client';

type Tab = 'flagged' | 'templates';

interface QALog {
    id: string;
    interaction_id: string | null;
    phone_number: string;
    agent_name: string;
    quality_score: number;
    issues: any;
    sentiment: string | null;
    flagged: boolean;
    reviewed_by: string | null;
    created_at: string;
}

interface WinningTemplate {
    id: string;
    agent_name: string;
    input_summary: string;
    output_summary: string;
    quality_score: number;
    created_at: string;
}

const SENTIMENT_COLORS: Record<string, string> = {
    positive: '#22c55e',
    neutral: '#f59e0b',
    negative: '#ef4444',
    frustrated: '#dc2626',
};

export function AgentOverride() {
    const [tab, setTab] = useState<Tab>('flagged');

    // Flagged logs
    const [flaggedLogs, setFlaggedLogs] = useState<QALog[]>([]);
    const [flaggedTotal, setFlaggedTotal] = useState(0);
    const [flaggedLoading, setFlaggedLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Winning templates
    const [templates, setTemplates] = useState<WinningTemplate[]>([]);
    const [templatesLoading, setTemplatesLoading] = useState(true);
    const [templateAgent, setTemplateAgent] = useState('');

    // Expanded row
    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    useEffect(() => {
        loadFlaggedLogs();
    }, []);

    useEffect(() => {
        if (tab === 'templates') loadTemplates();
    }, [tab, templateAgent]);

    const loadFlaggedLogs = async () => {
        setFlaggedLoading(true);
        try {
            const res = await getQALogs({ flagged_only: true, limit: 50 });
            setFlaggedLogs(res.data);
            setFlaggedTotal(res.total);
        } catch (err) {
            console.error('Failed to load flagged logs', err);
        } finally {
            setFlaggedLoading(false);
        }
    };

    const loadTemplates = async () => {
        setTemplatesLoading(true);
        try {
            const res = await getWinningTemplates({ agent_name: templateAgent || undefined, limit: 20 });
            setTemplates(res.data);
        } catch (err) {
            console.error('Failed to load templates', err);
        } finally {
            setTemplatesLoading(false);
        }
    };

    const handleReview = async (id: string) => {
        setActionLoading(id);
        try {
            await reviewQALog(id);
            setFlaggedLogs(logs => logs.filter(l => l.id !== id));
            setFlaggedTotal(t => t - 1);
        } catch (err) {
            console.error('Failed to review', err);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDismiss = async (id: string) => {
        setActionLoading(id);
        try {
            await toggleQAFlag(id, false);
            setFlaggedLogs(logs => logs.filter(l => l.id !== id));
            setFlaggedTotal(t => t - 1);
        } catch (err) {
            console.error('Failed to dismiss', err);
        } finally {
            setActionLoading(null);
        }
    };

    const formatTime = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const inputStyle: React.CSSProperties = {
        backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', color: 'var(--text-bright)',
        padding: '6px 10px', borderRadius: '6px', fontSize: '13px', outline: 'none',
    };

    const tabStyle = (active: boolean): React.CSSProperties => ({
        backgroundColor: active ? 'var(--border-secondary)' : 'transparent',
        border: active ? '1px solid var(--text-muted)' : '1px solid transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        padding: '8px 20px', borderRadius: '8px', cursor: 'pointer',
        fontSize: '14px', fontWeight: active ? 600 : 400,
    });

    const btnStyle = (color: string): React.CSSProperties => ({
        backgroundColor: `${color}20`, border: `1px solid ${color}40`,
        color, padding: '4px 12px', borderRadius: '6px', cursor: 'pointer',
        fontSize: '12px', fontWeight: 600,
    });

    return (
        <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>Human Override</h2>
                    <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '13px' }}>Review flagged conversations & AI templates</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button style={tabStyle(tab === 'flagged')} onClick={() => setTab('flagged')}>
                        Flagged ({flaggedTotal})
                    </button>
                    <button style={tabStyle(tab === 'templates')} onClick={() => setTab('templates')}>
                        Winning Templates
                    </button>
                </div>
            </div>

            {tab === 'flagged' ? (
                <>
                    {/* Info banner */}
                    <div style={{
                        backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', borderRadius: '10px',
                        padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px',
                    }}>
                        <span style={{ fontSize: '18px' }}>!</span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                            These conversations were flagged by the QA Agent (score &lt; 5 or frustrated sentiment). Review and take action.
                        </span>
                        <button
                            onClick={loadFlaggedLogs}
                            style={{ ...inputStyle, cursor: 'pointer', marginLeft: 'auto' }}
                        >
                            Refresh
                        </button>
                    </div>

                    {flaggedLoading ? (
                        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>Loading flagged conversations...</div>
                    ) : flaggedLogs.length === 0 ? (
                        <div style={{
                            backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-secondary)',
                            padding: '48px', textAlign: 'center',
                        }}>
                            <div style={{ fontSize: '32px', marginBottom: '12px' }}>+</div>
                            <div style={{ color: '#22c55e', fontSize: '16px', fontWeight: 600 }}>All Clear!</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>No flagged conversations need review.</div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {flaggedLogs.map(log => (
                                <div key={log.id} style={{
                                    backgroundColor: 'var(--bg-secondary)', borderRadius: '12px',
                                    border: `1px solid ${log.quality_score < 3 ? '#ef444440' : 'var(--border-secondary)'}`,
                                    overflow: 'hidden',
                                }}>
                                    {/* Header row */}
                                    <div
                                        style={{
                                            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '16px',
                                            cursor: 'pointer',
                                        }}
                                        onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                                    >
                                        {/* Score badge */}
                                        <div style={{
                                            width: '44px', height: '44px', borderRadius: '50%', display: 'flex',
                                            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                            backgroundColor: log.quality_score < 3 ? 'var(--error-bg)' : log.quality_score < 5 ? 'var(--warning-bg)' : 'var(--bg-active)',
                                            color: log.quality_score < 3 ? 'var(--error-text)' : log.quality_score < 5 ? '#fbbf24' : 'var(--text-link)',
                                            fontSize: '16px', fontWeight: 700,
                                        }}>
                                            {log.quality_score}
                                        </div>

                                        {/* Info */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ color: 'var(--text-bright)', fontSize: '14px', fontWeight: 600 }}>{log.agent_name}</span>
                                                {log.sentiment && (
                                                    <span style={{
                                                        color: SENTIMENT_COLORS[log.sentiment] || 'var(--text-secondary)',
                                                        fontSize: '11px', fontWeight: 600,
                                                        backgroundColor: `${SENTIMENT_COLORS[log.sentiment] || 'var(--text-secondary)'}20`,
                                                        padding: '1px 8px', borderRadius: '10px', textTransform: 'capitalize',
                                                    }}>
                                                        {log.sentiment}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
                                                {log.phone_number} &middot; {formatTime(log.created_at)}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleReview(log.id); }}
                                                disabled={actionLoading === log.id}
                                                style={btnStyle('#22c55e')}
                                            >
                                                {actionLoading === log.id ? '...' : 'Reviewed'}
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDismiss(log.id); }}
                                                disabled={actionLoading === log.id}
                                                style={btnStyle('var(--text-secondary)')}
                                            >
                                                Dismiss
                                            </button>
                                        </div>

                                        <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                                            {expandedRow === log.id ? '!' : '>'}
                                        </span>
                                    </div>

                                    {/* Expanded detail */}
                                    {expandedRow === log.id && (
                                        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border-secondary)' }}>
                                            {log.issues && Array.isArray(log.issues) && log.issues.length > 0 ? (
                                                <div style={{ marginTop: '12px' }}>
                                                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, marginBottom: '8px' }}>ISSUES DETECTED</div>
                                                    {log.issues.map((issue: any, i: number) => (
                                                        <div key={i} style={{
                                                            backgroundColor: 'var(--bg-primary)', borderRadius: '8px', padding: '8px 12px',
                                                            marginBottom: '6px',
                                                        }}>
                                                            <span style={{ color: '#ef4444', fontSize: '12px', fontWeight: 600, marginRight: '8px' }}>
                                                                {issue.type}
                                                            </span>
                                                            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{issue.detail}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div style={{ marginTop: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                                                    Flagged due to low quality score ({log.quality_score}/10)
                                                    {log.sentiment === 'frustrated' && ' and frustrated user sentiment'}.
                                                </div>
                                            )}
                                            {log.interaction_id && (
                                                <div style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
                                                    Interaction: {log.interaction_id}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                <>
                    {/* Templates tab */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
                        <input
                            placeholder="Filter by agent name..."
                            value={templateAgent}
                            onChange={e => setTemplateAgent(e.target.value)}
                            style={inputStyle}
                        />
                        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                            High-scoring AI responses (9+/10) saved as reference templates
                        </span>
                    </div>

                    {templatesLoading ? (
                        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>Loading templates...</div>
                    ) : templates.length === 0 ? (
                        <div style={{
                            backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-secondary)',
                            padding: '48px', textAlign: 'center',
                        }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No winning templates yet.</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                                Templates are auto-saved when the QA Agent scores a response 9/10 or higher.
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {templates.map(t => (
                                <div key={t.id} style={{
                                    backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-secondary)',
                                    padding: '16px',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ color: '#22c55e', fontSize: '16px', fontWeight: 700 }}>{t.quality_score}/10</span>
                                            <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{formatTime(t.created_at)}</span>
                                        </div>
                                    </div>
                                    {t.input_summary && (
                                        <div style={{ marginBottom: '8px' }}>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>USER INPUT</div>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                                {t.input_summary}
                                            </div>
                                        </div>
                                    )}
                                    {t.output_summary && (
                                        <div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>AI RESPONSE</div>
                                            <div style={{
                                                color: 'var(--text-bright)', fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                                backgroundColor: 'var(--bg-primary)', borderRadius: '8px', padding: '10px 12px',
                                            }}>
                                                {t.output_summary}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
