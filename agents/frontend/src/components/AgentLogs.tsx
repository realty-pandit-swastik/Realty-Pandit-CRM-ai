
import { useEffect, useState } from 'react';
import { getAgentLogs, getQALogs } from '../api/client';

type Tab = 'actions' | 'qa';

interface ActionLog {
    id: string;
    agent_name: string;
    task_type: string;
    phone_number: string | null;
    input_summary: string | null;
    output_summary: string | null;
    quality_score: number | null;
    duration_ms: number | null;
    status: string;
    error_message: string | null;
    created_at: string;
}

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

const PAGE_SIZE = 25;

const STATUS_COLORS: Record<string, string> = {
    success: '#22c55e',
    failed: '#ef4444',
    escalated: '#f59e0b',
};

const SENTIMENT_COLORS: Record<string, string> = {
    positive: '#22c55e',
    neutral: '#f59e0b',
    negative: '#ef4444',
    frustrated: '#dc2626',
};

export function AgentLogs() {
    const [tab, setTab] = useState<Tab>('actions');

    // Action log state
    const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);
    const [actionTotal, setActionTotal] = useState(0);
    const [actionPage, setActionPage] = useState(0);
    const [actionFilter, setActionFilter] = useState({ agent_name: '', status: '', phone_number: '' });
    const [actionLoading, setActionLoading] = useState(true);

    // QA log state
    const [qaLogs, setQALogs] = useState<QALog[]>([]);
    const [qaTotal, setQATotal] = useState(0);
    const [qaPage, setQAPage] = useState(0);
    const [qaFilter, setQAFilter] = useState({ agent_name: '', flagged_only: false });
    const [qaLoading, setQALoading] = useState(true);

    // Expanded row
    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    useEffect(() => {
        loadActionLogs();
    }, [actionPage, actionFilter]);

    useEffect(() => {
        loadQALogs();
    }, [qaPage, qaFilter]);

    const loadActionLogs = async () => {
        setActionLoading(true);
        try {
            const res = await getAgentLogs({
                agent_name: actionFilter.agent_name || undefined,
                status: actionFilter.status || undefined,
                phone_number: actionFilter.phone_number || undefined,
                limit: PAGE_SIZE,
                offset: actionPage * PAGE_SIZE,
            });
            setActionLogs(res.data);
            setActionTotal(res.total);
        } catch (err) {
            console.error('Failed to load action logs', err);
        } finally {
            setActionLoading(false);
        }
    };

    const loadQALogs = async () => {
        setQALoading(true);
        try {
            const res = await getQALogs({
                agent_name: qaFilter.agent_name || undefined,
                flagged_only: qaFilter.flagged_only || undefined,
                limit: PAGE_SIZE,
                offset: qaPage * PAGE_SIZE,
            });
            setQALogs(res.data);
            setQATotal(res.total);
        } catch (err) {
            console.error('Failed to load QA logs', err);
        } finally {
            setQALoading(false);
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

    const totalPages = (total: number) => Math.ceil(total / PAGE_SIZE);

    return (
        <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>Agent Logs</h2>
                    <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '13px' }}>Action logs & QA quality checks</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button style={tabStyle(tab === 'actions')} onClick={() => setTab('actions')}>
                        Action Logs
                    </button>
                    <button style={tabStyle(tab === 'qa')} onClick={() => setTab('qa')}>
                        QA Logs
                    </button>
                </div>
            </div>

            {tab === 'actions' ? (
                <>
                    {/* Action Log Filters */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        <input
                            placeholder="Agent name..."
                            value={actionFilter.agent_name}
                            onChange={e => { setActionFilter(f => ({ ...f, agent_name: e.target.value })); setActionPage(0); }}
                            style={inputStyle}
                        />
                        <select
                            value={actionFilter.status}
                            onChange={e => { setActionFilter(f => ({ ...f, status: e.target.value })); setActionPage(0); }}
                            style={inputStyle}
                        >
                            <option value="">All Status</option>
                            <option value="success">Success</option>
                            <option value="failed">Failed</option>
                            <option value="escalated">Escalated</option>
                        </select>
                        <input
                            placeholder="Phone number..."
                            value={actionFilter.phone_number}
                            onChange={e => { setActionFilter(f => ({ ...f, phone_number: e.target.value })); setActionPage(0); }}
                            style={inputStyle}
                        />
                        <button
                            onClick={() => { setActionFilter({ agent_name: '', status: '', phone_number: '' }); setActionPage(0); }}
                            style={{ ...inputStyle, cursor: 'pointer', color: 'var(--text-secondary)' }}
                        >
                            Clear
                        </button>
                        <span style={{ color: 'var(--text-muted)', fontSize: '13px', alignSelf: 'center', marginLeft: 'auto' }}>
                            {actionTotal} total
                        </span>
                    </div>

                    {/* Action Log Table */}
                    {actionLoading ? (
                        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>Loading...</div>
                    ) : (
                        <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-secondary)', overflow: 'hidden', overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                                        {['Time', 'Agent', 'Task', 'Phone', 'Status', 'Duration', 'Quality', ''].map(h => (
                                            <th key={h} style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '12px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {actionLogs.map(log => (
                                        <>
                                            <tr
                                                key={log.id}
                                                onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                                                style={{ borderBottom: '1px solid var(--bg-secondary)', cursor: 'pointer' }}
                                                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                                                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                                            >
                                                <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                                                    {formatTime(log.created_at)}
                                                </td>
                                                <td style={{ padding: '8px 12px', color: 'var(--text-bright)', fontSize: '13px', fontWeight: 600 }}>
                                                    {log.agent_name}
                                                </td>
                                                <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                                                    {log.task_type}
                                                </td>
                                                <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                                                    {log.phone_number || '-'}
                                                </td>
                                                <td style={{ padding: '8px 12px' }}>
                                                    <span style={{
                                                        color: STATUS_COLORS[log.status] || 'var(--text-secondary)',
                                                        fontSize: '12px', fontWeight: 600,
                                                        backgroundColor: `${STATUS_COLORS[log.status] || 'var(--text-secondary)'}20`,
                                                        padding: '2px 8px', borderRadius: '10px',
                                                    }}>
                                                        {log.status}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                                    {log.duration_ms ? `${log.duration_ms}ms` : '-'}
                                                </td>
                                                <td style={{ padding: '8px 12px' }}>
                                                    {log.quality_score !== null ? (
                                                        <span style={{
                                                            color: log.quality_score >= 7 ? '#22c55e' : log.quality_score >= 5 ? '#f59e0b' : '#ef4444',
                                                            fontSize: '13px', fontWeight: 600,
                                                        }}>
                                                            {log.quality_score}
                                                        </span>
                                                    ) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                                                </td>
                                                <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '14px' }}>
                                                    {expandedRow === log.id ? '▼' : '▶'}
                                                </td>
                                            </tr>
                                            {expandedRow === log.id && (
                                                <tr key={`${log.id}-detail`}>
                                                    <td colSpan={8} style={{ padding: '12px 24px', backgroundColor: 'var(--bg-primary)' }}>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                                            {log.input_summary && (
                                                                <div>
                                                                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>INPUT</div>
                                                                    <div style={{ color: 'var(--text-secondary)', fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{log.input_summary}</div>
                                                                </div>
                                                            )}
                                                            {log.output_summary && (
                                                                <div>
                                                                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>OUTPUT</div>
                                                                    <div style={{ color: 'var(--text-secondary)', fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{log.output_summary}</div>
                                                                </div>
                                                            )}
                                                            {log.error_message && (
                                                                <div style={{ gridColumn: 'span 2' }}>
                                                                    <div style={{ color: '#ef4444', fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>ERROR</div>
                                                                    <div style={{ color: 'var(--error-text)', fontSize: '13px', whiteSpace: 'pre-wrap' }}>{log.error_message}</div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    ))}
                                    {actionLogs.length === 0 && (
                                        <tr>
                                            <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                No action logs found
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages(actionTotal) > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
                            <button
                                disabled={actionPage === 0}
                                onClick={() => setActionPage(p => p - 1)}
                                style={{ ...inputStyle, cursor: actionPage === 0 ? 'default' : 'pointer', opacity: actionPage === 0 ? 0.5 : 1 }}
                            >
                                Previous
                            </button>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', alignSelf: 'center' }}>
                                Page {actionPage + 1} of {totalPages(actionTotal)}
                            </span>
                            <button
                                disabled={actionPage >= totalPages(actionTotal) - 1}
                                onClick={() => setActionPage(p => p + 1)}
                                style={{ ...inputStyle, cursor: actionPage >= totalPages(actionTotal) - 1 ? 'default' : 'pointer', opacity: actionPage >= totalPages(actionTotal) - 1 ? 0.5 : 1 }}
                            >
                                Next
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <>
                    {/* QA Log Filters */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        <input
                            placeholder="Agent name..."
                            value={qaFilter.agent_name}
                            onChange={e => { setQAFilter(f => ({ ...f, agent_name: e.target.value })); setQAPage(0); }}
                            style={inputStyle}
                        />
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={qaFilter.flagged_only}
                                onChange={e => { setQAFilter(f => ({ ...f, flagged_only: e.target.checked })); setQAPage(0); }}
                            />
                            Flagged only
                        </label>
                        <button
                            onClick={() => { setQAFilter({ agent_name: '', flagged_only: false }); setQAPage(0); }}
                            style={{ ...inputStyle, cursor: 'pointer', color: 'var(--text-secondary)' }}
                        >
                            Clear
                        </button>
                        <span style={{ color: 'var(--text-muted)', fontSize: '13px', alignSelf: 'center', marginLeft: 'auto' }}>
                            {qaTotal} total
                        </span>
                    </div>

                    {/* QA Log Table */}
                    {qaLoading ? (
                        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>Loading...</div>
                    ) : (
                        <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-secondary)', overflow: 'hidden', overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                                        {['Time', 'Agent', 'Phone', 'Score', 'Sentiment', 'Flagged', 'Reviewed', ''].map(h => (
                                            <th key={h} style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '12px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {qaLogs.map(log => (
                                        <>
                                            <tr
                                                key={log.id}
                                                onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                                                style={{
                                                    borderBottom: '1px solid var(--bg-secondary)', cursor: 'pointer',
                                                    backgroundColor: log.flagged ? '#7f1d1d15' : 'transparent',
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.backgroundColor = log.flagged ? '#7f1d1d25' : '#253345')}
                                                onMouseLeave={e => (e.currentTarget.style.backgroundColor = log.flagged ? '#7f1d1d15' : 'transparent')}
                                            >
                                                <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                                                    {formatTime(log.created_at)}
                                                </td>
                                                <td style={{ padding: '8px 12px', color: 'var(--text-bright)', fontSize: '13px', fontWeight: 600 }}>
                                                    {log.agent_name}
                                                </td>
                                                <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                                                    {log.phone_number}
                                                </td>
                                                <td style={{ padding: '8px 12px' }}>
                                                    <span style={{
                                                        color: log.quality_score >= 7 ? '#22c55e' : log.quality_score >= 5 ? '#f59e0b' : '#ef4444',
                                                        fontSize: '14px', fontWeight: 700,
                                                    }}>
                                                        {log.quality_score}
                                                    </span>
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>/10</span>
                                                </td>
                                                <td style={{ padding: '8px 12px' }}>
                                                    {log.sentiment ? (
                                                        <span style={{
                                                            color: SENTIMENT_COLORS[log.sentiment] || 'var(--text-secondary)',
                                                            fontSize: '12px', fontWeight: 600,
                                                            backgroundColor: `${SENTIMENT_COLORS[log.sentiment] || 'var(--text-secondary)'}20`,
                                                            padding: '2px 8px', borderRadius: '10px',
                                                            textTransform: 'capitalize',
                                                        }}>
                                                            {log.sentiment}
                                                        </span>
                                                    ) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                                                </td>
                                                <td style={{ padding: '8px 12px', fontSize: '16px' }}>
                                                    {log.flagged ? <span title="Flagged for review" style={{ color: '#ef4444' }}>!</span> : <span style={{ color: 'var(--border-secondary)' }}>-</span>}
                                                </td>
                                                <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                                    {log.reviewed_by || '-'}
                                                </td>
                                                <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '14px' }}>
                                                    {expandedRow === log.id ? '▼' : '▶'}
                                                </td>
                                            </tr>
                                            {expandedRow === log.id && (
                                                <tr key={`${log.id}-detail`}>
                                                    <td colSpan={8} style={{ padding: '12px 24px', backgroundColor: 'var(--bg-primary)' }}>
                                                        {log.issues && Array.isArray(log.issues) && log.issues.length > 0 ? (
                                                            <div>
                                                                <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, marginBottom: '8px' }}>ISSUES FOUND</div>
                                                                {log.issues.map((issue: any, i: number) => (
                                                                    <div key={i} style={{
                                                                        backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', padding: '10px 14px',
                                                                        marginBottom: '6px', border: '1px solid var(--border-secondary)',
                                                                    }}>
                                                                        <span style={{ color: '#ef4444', fontSize: '12px', fontWeight: 600, marginRight: '8px' }}>
                                                                            {issue.type || 'Issue'}
                                                                        </span>
                                                                        <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                                                                            {issue.detail || JSON.stringify(issue)}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No issues recorded</div>
                                                        )}
                                                        {log.interaction_id && (
                                                            <div style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
                                                                Interaction: {log.interaction_id}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    ))}
                                    {qaLogs.length === 0 && (
                                        <tr>
                                            <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                No QA logs found
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages(qaTotal) > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
                            <button
                                disabled={qaPage === 0}
                                onClick={() => setQAPage(p => p - 1)}
                                style={{ ...inputStyle, cursor: qaPage === 0 ? 'default' : 'pointer', opacity: qaPage === 0 ? 0.5 : 1 }}
                            >
                                Previous
                            </button>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', alignSelf: 'center' }}>
                                Page {qaPage + 1} of {totalPages(qaTotal)}
                            </span>
                            <button
                                disabled={qaPage >= totalPages(qaTotal) - 1}
                                onClick={() => setQAPage(p => p + 1)}
                                style={{ ...inputStyle, cursor: qaPage >= totalPages(qaTotal) - 1 ? 'default' : 'pointer', opacity: qaPage >= totalPages(qaTotal) - 1 ? 0.5 : 1 }}
                            >
                                Next
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
