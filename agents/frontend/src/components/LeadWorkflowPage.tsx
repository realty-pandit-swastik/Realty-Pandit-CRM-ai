/**
 * LeadWorkflowPage — Guided Lead-to-Deal Workflow Engine
 *
 * Dedicated page for employees to manage their lead pipeline.
 * Shows task queue sorted: overdue → due today → upcoming.
 * Each task has a stage-specific card with different actions.
 * Super boss sees team-wide view with per-agent stats.
 */

import { useEffect, useState, useCallback } from 'react';
import { IconText, PresentationIcon } from './ui/PresentationIcon';
import { useAuth } from '../contexts/AuthContext';
import {
    getWorkflowTaskQueue,
    completeWorkflowTask,
    snoozeWorkflowTask,
    scheduleVisitFromTask,
    getWorkflowStats,
    getTeamWorkflowPipeline,
} from '../api/client';
import { toDialablePhone } from '../lib/phone';

// ── Types ───────────────────────────────────────────────────────

interface WorkflowTask {
    id: string;
    title: string;
    description: string;
    assigned_to: string;
    due_date: string;
    priority: string;
    status: string;
    task_type: string;
    workflow_stage: number;
    workflow_round: number;
    snooze_count: number;
    snoozed_until: string | null;
    deal_id: string | null;
    stage_metadata: any;
    contact_phone: string;
    contact?: {
        phone_number: string;
        name: string | null;
        email: string | null;
        source: string | null;
        intent: string | null;
        preferred_location: string | null;
        budget_min: number | null;
        budget_max: number | null;
        lead_status: string;
        lifecycle_stage: string;
        verification_status: string | null;
        demand_bhk: string | null;
    };
    completed_at: string | null;
    created_at: string;
}

// ── Constants ───────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
    QUALIFY_LEAD: 'Qualify Lead',
    SHARE_PROPERTIES: 'Share Properties',
    SCHEDULE_VISIT: 'Schedule Visit',
    VISIT_FEEDBACK: 'Visit Feedback',
    NEGOTIATE_DEAL: 'Negotiate Deal',
};

const STAGE_ICONS: Record<string, string> = {
    QUALIFY_LEAD: 'phone',
    SHARE_PROPERTIES: 'send',
    SCHEDULE_VISIT: 'calendar-days',
    VISIT_FEEDBACK: 'check-circle',
    NEGOTIATE_DEAL: 'handshake',
};

const REJECTION_REASONS = [
    { value: 'JUST_BROWSING', label: 'Just Browsing' },
    { value: 'BANKER_VALUER', label: 'Banker / Valuer' },
    { value: 'WRONG_NUMBER', label: 'Wrong Number' },
    { value: 'DUPLICATE', label: 'Duplicate Inquiry' },
    { value: 'SPAM', label: 'Spam' },
    { value: 'OTHER', label: 'Other' },
];

// ── Helpers ─────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

function isOverdue(task: WorkflowTask): boolean {
    return task.status !== 'DONE' && new Date(task.due_date) < new Date();
}

function isDueToday(task: WorkflowTask): boolean {
    const today = new Date();
    const due = new Date(task.due_date);
    return due.toDateString() === today.toDateString() && !isOverdue(task);
}

function formatBudget(min?: number | null, max?: number | null): string {
    const fmt = (n: number) => n >= 10000000 ? `₹${(n / 10000000).toFixed(1)} Cr` : n >= 100000 ? `₹${(n / 100000).toFixed(0)} L` : `₹${n.toLocaleString('en-IN')}`;
    if (min && max) return `${fmt(min)} - ${fmt(max)}`;
    if (max) return `Up to ${fmt(max)}`;
    if (min) return `From ${fmt(min)}`;
    return '';
}

// ── Main Component ──────────────────────────────────────────────

export default function LeadWorkflowPage() {
    const { agent } = useAuth();
    const isBoss = agent?.role === 'super_boss' || agent?.role === 'manager';

    const [tasks, setTasks] = useState<WorkflowTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<any>(null);
    const [teamPipeline, setTeamPipeline] = useState<any[]>([]);
    const [viewMode, setViewMode] = useState<'my-tasks' | 'team'>('my-tasks');
    const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // ── Qualify form state ──
    const [qualifyOutcome, setQualifyOutcome] = useState<'VERIFIED' | 'REJECTED' | 'PARTNER_AGENT' | null>(null);
    const [qualifyName, setQualifyName] = useState('');
    const [qualifyBudgetMin, setQualifyBudgetMin] = useState('');
    const [qualifyBudgetMax, setQualifyBudgetMax] = useState('');
    const [qualifyLocation, setQualifyLocation] = useState('');
    const [qualifyIntent, setQualifyIntent] = useState('');
    const [qualifyBhk, setQualifyBhk] = useState('');
    const [rejectReason, setRejectReason] = useState('');
    const [rejectRemarks, setRejectRemarks] = useState('');

    // ── Visit feedback state ──
    const [feedbackEntries, setFeedbackEntries] = useState<Record<string, { result: string; reason: string }>>({});
    const [feedbackNextAction, setFeedbackNextAction] = useState('');

    // ── Schedule visit state ──
    const [visitDate, setVisitDate] = useState('');

    // ── Negotiate state ──
    const [negotiateOutcome, setNegotiateOutcome] = useState<'CLOSED_WON' | 'CLOSED_LOST' | null>(null);
    const [finalPrice, setFinalPrice] = useState('');
    const [closeReason, setCloseReason] = useState('');

    // ── Data Loading ──
    const fetchData = useCallback(async () => {
        try {
            const [queueRes, statsRes] = await Promise.all([
                getWorkflowTaskQueue(),
                getWorkflowStats(),
            ]);
            setTasks(queueRes.tasks || []);
            setStats(statsRes);
            if (isBoss) {
                const teamRes = await getTeamWorkflowPipeline();
                setTeamPipeline(teamRes.pipeline || []);
            }
        } catch (err) {
            console.error('Failed to load workflow data:', err);
        } finally {
            setLoading(false);
        }
    }, [isBoss]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Auto-refresh every 30s
    useEffect(() => {
        // Skip the background refresh when the tab isn't focused, so it never reloads mid-work. (2026-07-09)
        const interval = setInterval(() => { if (document.hidden) return; fetchData(); }, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    // ── Actions ──

    const showMessage = (type: 'success' | 'error', text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 4000);
    };

    const handleComplete = async (taskId: string, taskType: string, data: any) => {
        setActionLoading(taskId);
        try {
            await completeWorkflowTask(taskId, data);
            showMessage('success', `${STAGE_LABELS[taskType] || 'Task'} completed!`);
            setExpandedTaskId(null);
            resetFormState();
            await fetchData();
        } catch (err: any) {
            showMessage('error', err.response?.data?.error || err.message || 'Action failed');
        } finally {
            setActionLoading(null);
        }
    };

    const handleSnooze = async (taskId: string) => {
        setActionLoading(taskId);
        try {
            await snoozeWorkflowTask(taskId, 'No answer');
            showMessage('success', 'Task snoozed for 1 hour');
            await fetchData();
        } catch (err: any) {
            showMessage('error', err.response?.data?.error || 'Snooze failed');
        } finally {
            setActionLoading(null);
        }
    };

    const resetFormState = () => {
        setQualifyOutcome(null);
        setQualifyName(''); setQualifyBudgetMin(''); setQualifyBudgetMax('');
        setQualifyLocation(''); setQualifyIntent(''); setQualifyBhk('');
        setRejectReason(''); setRejectRemarks('');
        setFeedbackEntries({}); setFeedbackNextAction('');
        setVisitDate('');
        setNegotiateOutcome(null); setFinalPrice(''); setCloseReason('');
    };

    // ── Sort tasks: overdue → due today → upcoming ──
    const overdueTasks = tasks.filter(isOverdue);
    const todayTasks = tasks.filter(t => isDueToday(t));
    const upcomingTasks = tasks.filter(t => !isOverdue(t) && !isDueToday(t));

    // ── Styles ──
    const cardStyle = (task: WorkflowTask): React.CSSProperties => ({
        backgroundColor: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-clay)',
        padding: '14px 16px',
        marginBottom: '10px',
        border: task.task_type ? '1px solid var(--border-primary)' : '1px solid var(--border-secondary)',
        cursor: 'pointer',
        boxShadow: 'none',
        transition: 'box-shadow 150ms ease',
    });

    const badgeStyle = (color: string): React.CSSProperties => ({
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 600,
        backgroundColor: 'var(--rp-info-bg)',
        color: color ? 'var(--rp-info-text)' : 'var(--text-secondary)',
    });

    const btnStyle = (bg: string, color: string = 'var(--surface-white)'): React.CSSProperties => ({
        padding: '8px 16px',
        borderRadius: 'var(--radius-control)',
        border: 'none',
        backgroundColor: bg === 'var(--rp-danger-text)' ? 'var(--danger)' : bg === 'var(--text-muted)' || bg === 'var(--text-secondary)' ? 'var(--ink-secondary)' : 'var(--blue-600)',
        color: color === 'var(--text-muted)' ? 'var(--surface-white)' : color === 'var(--surface-white)' ? 'var(--surface-white)' : color,
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        marginRight: '8px',
        marginTop: '8px',
    });

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '8px 12px',
        borderRadius: '6px',
        border: '1px solid var(--border-secondary)',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontSize: '13px',
        marginTop: '4px',
    };

    // ── Render: Stats Bar ──
    const renderStatsBar = () => {
        if (!stats) return null;
        const stages = [
            { key: 'QUALIFY_LEAD',     icon: 'phone', color: 'var(--blue-500)' },
            { key: 'SHARE_PROPERTIES', icon: 'send', color: 'var(--chart-5)' },
            { key: 'SCHEDULE_VISIT',   icon: 'calendar-days', color: 'var(--rp-warn-text)' },
            { key: 'VISIT_FEEDBACK',   icon: 'check-circle', color: 'var(--chart-3)' },
            { key: 'NEGOTIATE_DEAL',   icon: 'handshake', color: 'var(--rp-warn-text)' },
        ];
        return (
            <div style={{
                display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px',
                marginBottom: '20px', WebkitOverflowScrolling: 'touch', flexShrink: 0,
            }}>
                {stages.map(s => {
                    const count = stats.by_stage?.[s.key] || 0;
                    return (
                        <div key={s.key} style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '7px 14px', borderRadius: 'var(--radius-chip)', flexShrink: 0,
                            backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)',
                            fontSize: '13px',
                        }}>
                            <PresentationIcon value={s.icon} />
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{count}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{STAGE_LABELS[s.key]}</span>
                        </div>
                    );
                })}
                {stats.overdue > 0 && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '7px 14px', borderRadius: 'var(--radius-chip)', flexShrink: 0,
                        backgroundColor: 'var(--rp-danger-bg)', border: '1px solid var(--rp-danger-line)',
                        fontSize: '13px',
                    }}>
                        <PresentationIcon value="circle-alert" />
                        <span style={{ fontWeight: 600, color: 'var(--rp-danger-text)' }}>{stats.overdue}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Overdue</span>
                    </div>
                )}
            </div>
        );
    };

    // ── Render: Qualify Task Actions ──
    const renderQualifyActions = (task: WorkflowTask) => {
        const isExpanded = expandedTaskId === task.id;
        return (
            <div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                    {toDialablePhone(task.contact_phone) && (
                        <a href={`tel:${toDialablePhone(task.contact_phone)}`} style={{ ...btnStyle('var(--rp-success-text)'), textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            Call Now
                        </a>
                    )}
                    <button onClick={() => handleSnooze(task.id)} style={btnStyle('var(--text-muted)')} disabled={actionLoading === task.id}>
                        Snooze ({task.snooze_count}/3)
                    </button>
                </div>

                {!isExpanded && (
                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button onClick={() => { setExpandedTaskId(task.id); setQualifyOutcome('VERIFIED'); }} style={btnStyle('var(--blue-500)')}>✓ Verified</button>
                        <button onClick={() => { setExpandedTaskId(task.id); setQualifyOutcome('REJECTED'); }} style={btnStyle('var(--rp-danger-text)')}>✗ Not Genuine</button>
                        <button onClick={() => { setExpandedTaskId(task.id); setQualifyOutcome('PARTNER_AGENT'); }} style={btnStyle('var(--chart-5)')}>Partner Agent</button>
                    </div>
                )}

                {isExpanded && qualifyOutcome === 'VERIFIED' && (
                    <div style={{ marginTop: '12px', backgroundColor: 'var(--bg-tertiary)', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ fontWeight: 600, marginBottom: '8px' }}>Verify & Update Lead Details</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div><label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Name</label><input value={qualifyName} onChange={e => setQualifyName(e.target.value)} placeholder={task.contact?.name || ''} style={inputStyle} /></div>
                            <div><label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Intent</label><select value={qualifyIntent} onChange={e => setQualifyIntent(e.target.value)} style={inputStyle}><option value="">Select</option><option value="buy">Buy</option><option value="rent">Rent</option></select></div>
                            <div><label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Budget Min</label><input type="number" value={qualifyBudgetMin} onChange={e => setQualifyBudgetMin(e.target.value)} style={inputStyle} /></div>
                            <div><label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Budget Max</label><input type="number" value={qualifyBudgetMax} onChange={e => setQualifyBudgetMax(e.target.value)} style={inputStyle} /></div>
                            <div><label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Location</label><input value={qualifyLocation} onChange={e => setQualifyLocation(e.target.value)} placeholder={task.contact?.preferred_location || ''} style={inputStyle} /></div>
                            <div><label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>BHK</label><select value={qualifyBhk} onChange={e => setQualifyBhk(e.target.value)} style={inputStyle}><option value="">Select</option>{['1','2','3','4','5'].map(b => <option key={b} value={b}>{b} BHK</option>)}</select></div>
                        </div>
                        <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                            <button onClick={() => handleComplete(task.id, task.task_type, { outcome: 'VERIFIED', contactData: { name: qualifyName || undefined, budget_min: qualifyBudgetMin ? Number(qualifyBudgetMin) : undefined, budget_max: qualifyBudgetMax ? Number(qualifyBudgetMax) : undefined, preferred_location: qualifyLocation || undefined, intent: qualifyIntent || undefined, demand_bhk: qualifyBhk || undefined } })} style={btnStyle('var(--rp-success-text)')} disabled={actionLoading === task.id}>Submit Verification</button>
                            <button onClick={() => { setExpandedTaskId(null); resetFormState(); }} style={btnStyle('var(--text-muted)')}>Cancel</button>
                        </div>
                    </div>
                )}

                {isExpanded && qualifyOutcome === 'REJECTED' && (
                    <div style={{ marginTop: '12px', backgroundColor: 'var(--rp-danger-bg)', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--rp-danger-text)' }}>Close Lead — Not Genuine</div>
                        <select value={rejectReason} onChange={e => setRejectReason(e.target.value)} style={inputStyle}>
                            <option value="">Select reason...</option>
                            {REJECTION_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        <textarea value={rejectRemarks} onChange={e => setRejectRemarks(e.target.value)} placeholder="Remarks (required)" rows={2} style={{ ...inputStyle, marginTop: '8px' }} />
                        <div style={{ marginTop: '8px' }}>
                            <button onClick={() => handleComplete(task.id, task.task_type, { outcome: 'REJECTED', rejectionReason: rejectReason, rejectionRemarks: rejectRemarks })} style={btnStyle('var(--rp-danger-text)')} disabled={!rejectReason || !rejectRemarks || actionLoading === task.id}>Close Lead</button>
                            <button onClick={() => { setExpandedTaskId(null); resetFormState(); }} style={btnStyle('var(--text-muted)')}>Cancel</button>
                        </div>
                    </div>
                )}

                {isExpanded && qualifyOutcome === 'PARTNER_AGENT' && (
                    <div style={{ marginTop: '12px', backgroundColor: 'var(--blue-50)', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--chart-5)' }}>Convert to Partner Agent</div>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 8px' }}>This will register the contact as a Partner Agent on the platform.</p>
                        <button onClick={() => handleComplete(task.id, task.task_type, { outcome: 'PARTNER_AGENT', partnerData: { name: task.contact?.name } })} style={btnStyle('var(--chart-5)')} disabled={actionLoading === task.id}>Convert to Partner</button>
                        <button onClick={() => { setExpandedTaskId(null); resetFormState(); }} style={btnStyle('var(--text-muted)')}>Cancel</button>
                    </div>
                )}
            </div>
        );
    };

    // ── Render: Share Properties Actions ──
    const renderShareActions = (task: WorkflowTask) => {
        const matches = task.stage_metadata?.matches || [];
        return (
            <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    {matches.length > 0 ? `${matches.length} matching properties found` : 'No pre-loaded matches — use "Find Matches" in lead detail'}
                </div>
                {matches.length > 0 && (
                    <div style={{ display: 'grid', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                        {matches.map((m: any) => (
                            <div key={m.id} style={{ padding: '8px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '6px', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>{m.type} — {m.location} — {m.price ? formatBudget(m.price) : 'N/A'}</span>
                                <span style={badgeStyle(m.match_score >= 70 ? 'var(--rp-success-text)' : m.match_score >= 40 ? 'var(--rp-warn-text)' : 'var(--text-muted)')}>{m.match_score}%</span>
                            </div>
                        ))}
                    </div>
                )}
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button onClick={() => handleComplete(task.id, task.task_type, { shortlistedPropertyIds: matches.map((m: any) => m.id) })} style={btnStyle('var(--chart-5)')} disabled={matches.length === 0 || actionLoading === task.id}>
                        Mark Shared & Shortlisted ({matches.length})
                    </button>
                </div>
            </div>
        );
    };

    // ── Render: Schedule Visit Actions ──
    const renderScheduleActions = (task: WorkflowTask) => {
        const props = task.stage_metadata?.shortlisted_property_ids || [];

        return (
            <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{props.length} properties to visit</div>
                <div style={{ marginTop: '8px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Visit Date & Time</label>
                    <input type="datetime-local" value={visitDate} onChange={e => setVisitDate(e.target.value)} style={inputStyle} />
                </div>
                <button onClick={async () => {
                    if (!visitDate) return;
                    setActionLoading(task.id);
                    try {
                        const aptRes = await scheduleVisitFromTask(task.id, { scheduled_at: new Date(visitDate).toISOString(), property_ids: props });
                        await handleComplete(task.id, task.task_type, { appointmentIds: aptRes.appointment_ids, propertyIds: props });
                    } catch (err: any) { showMessage('error', err.response?.data?.error || 'Failed'); setActionLoading(null); }
                }} style={{ ...btnStyle('var(--rp-warn-text)', 'var(--text-primary)'), marginTop: '12px' }} disabled={!visitDate || actionLoading === task.id}>
                    Book Visit
                </button>
            </div>
        );
    };

    // ── Render: Visit Feedback Actions ──
    const renderFeedbackActions = (task: WorkflowTask) => {
        const propIds: string[] = task.stage_metadata?.property_ids || [];
        return (
            <div style={{ marginTop: '12px' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>Per-Property Feedback</div>
                {propIds.map(pid => (
                    <div key={pid} style={{ padding: '8px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '6px', marginBottom: '8px' }}>
                        <div style={{ fontSize: '12px', marginBottom: '6px' }}>Property: {pid.slice(0, 8)}...</div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {(['INTERESTED', 'NOT_INTERESTED', 'REVISIT'] as const).map(r => (
                                <button key={r} onClick={() => setFeedbackEntries(prev => ({ ...prev, [pid]: { result: r, reason: prev[pid]?.reason || '' } }))}
                                    style={{ ...btnStyle(feedbackEntries[pid]?.result === r ? (r === 'INTERESTED' ? 'var(--rp-success-text)' : r === 'NOT_INTERESTED' ? 'var(--rp-danger-text)' : 'var(--rp-warn-text)') : 'var(--text-secondary)', feedbackEntries[pid]?.result === r ? 'var(--surface-white)' : 'var(--text-muted)'), fontSize: '11px', padding: '4px 10px' }}>
                                    {r === 'INTERESTED' ? 'Liked' : r === 'NOT_INTERESTED' ? 'Not Interested' : 'Revisit'}
                                </button>
                            ))}
                        </div>
                        {feedbackEntries[pid]?.result === 'NOT_INTERESTED' && (
                            <input placeholder="Reason..." value={feedbackEntries[pid]?.reason || ''} onChange={e => setFeedbackEntries(prev => ({ ...prev, [pid]: { ...prev[pid], reason: e.target.value } }))} style={{ ...inputStyle, marginTop: '4px' }} />
                        )}
                    </div>
                ))}

                <div style={{ fontWeight: 600, fontSize: '13px', marginTop: '12px', marginBottom: '8px' }}>What's Next?</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[
                        { val: 'MORE_OPTIONS', label: '🔍 Show More Properties', color: 'var(--chart-5)' },
                        { val: 'ANOTHER_VISIT', label: '📅 Schedule Another Visit', color: 'var(--rp-warn-text)' },
                        { val: 'SELECT_PROPERTY', label: '🏠 Client Picked One!', color: 'var(--rp-success-text)' },
                        { val: 'LOST', label: '❌ Lost Interest', color: 'var(--rp-danger-text)' },
                    ].map(a => (
                        <button key={a.val} onClick={() => setFeedbackNextAction(a.val)} style={btnStyle(feedbackNextAction === a.val ? a.color : 'var(--text-secondary)', feedbackNextAction === a.val ? 'var(--surface-white)' : 'var(--text-muted)')}>
                            <IconText>{a.label}</IconText>
                        </button>
                    ))}
                </div>

                {feedbackNextAction && (
                    <button onClick={() => {
                        const feedback = Object.entries(feedbackEntries).map(([invId, fb]) => ({ inventoryId: invId, result: fb.result, reason: fb.reason || undefined }));
                        const interestedIds = Object.entries(feedbackEntries).filter(([, fb]) => fb.result === 'INTERESTED').map(([id]) => id);
                        handleComplete(task.id, task.task_type, {
                            feedback,
                            nextAction: feedbackNextAction,
                            selectedPropertyId: feedbackNextAction === 'SELECT_PROPERTY' ? interestedIds[0] : undefined,
                        });
                    }} style={{ ...btnStyle('var(--rp-success-text)'), marginTop: '12px' }} disabled={actionLoading === task.id}>
                        Submit Feedback
                    </button>
                )}
            </div>
        );
    };

    // ── Render: Negotiate Deal Actions ──
    const renderNegotiateActions = (task: WorkflowTask) => (
        <div style={{ marginTop: '12px' }}>
            {!negotiateOutcome && (
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setNegotiateOutcome('CLOSED_WON')} style={btnStyle('var(--rp-success-text)')}>Deal Won</button>
                    <button onClick={() => setNegotiateOutcome('CLOSED_LOST')} style={btnStyle('var(--rp-danger-text)')}>Deal Lost</button>
                </div>
            )}
            {negotiateOutcome === 'CLOSED_WON' && (
                <div style={{ backgroundColor: 'var(--rp-success-wash)', padding: '12px', borderRadius: '8px', marginTop: '8px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--rp-success-text)', marginBottom: '8px' }}>Close Deal — Won!</div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Final Price (₹)</label>
                    <input type="number" value={finalPrice} onChange={e => setFinalPrice(e.target.value)} style={inputStyle} />
                    <button onClick={() => handleComplete(task.id, task.task_type, { outcome: 'CLOSED_WON', finalPrice: finalPrice ? Number(finalPrice) : undefined })} style={{ ...btnStyle('var(--rp-success-text)'), marginTop: '8px' }} disabled={actionLoading === task.id}>Close Won</button>
                    <button onClick={() => setNegotiateOutcome(null)} style={btnStyle('var(--text-muted)')}>Cancel</button>
                </div>
            )}
            {negotiateOutcome === 'CLOSED_LOST' && (
                <div style={{ backgroundColor: 'var(--rp-danger-bg)', padding: '12px', borderRadius: '8px', marginTop: '8px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--rp-danger-text)', marginBottom: '8px' }}>Close Deal — Lost</div>
                    <input value={closeReason} onChange={e => setCloseReason(e.target.value)} placeholder="Reason..." style={inputStyle} />
                    <button onClick={() => handleComplete(task.id, task.task_type, { outcome: 'CLOSED_LOST', closeReason })} style={{ ...btnStyle('var(--rp-danger-text)'), marginTop: '8px' }} disabled={actionLoading === task.id}>Close Lost</button>
                    <button onClick={() => setNegotiateOutcome(null)} style={btnStyle('var(--text-muted)')}>Cancel</button>
                </div>
            )}
        </div>
    );

    // ── Render: Single Task Card ──
    const renderTaskCard = (task: WorkflowTask) => (
        <div key={task.id} style={cardStyle(task)} onClick={() => expandedTaskId === task.id ? null : setExpandedTaskId(task.id)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <PresentationIcon value={STAGE_ICONS[task.task_type] || 'clipboard-list'} />
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>{task.title}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {task.contact?.name && <span>{task.contact.name}</span>}
                        <span>{task.contact_phone}</span>
                        {task.contact?.source && <span style={badgeStyle('var(--text-muted)')}>{task.contact.source}</span>}
                        {task.contact?.intent && <span>{task.contact.intent}</span>}
                        {(task.contact?.budget_min || task.contact?.budget_max) && <span>{formatBudget(task.contact.budget_min, task.contact.budget_max)}</span>}
                        {task.contact?.preferred_location && <span><PresentationIcon value="map-pin" /> {task.contact.preferred_location}</span>}
                    </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={badgeStyle(isOverdue(task) ? 'var(--rp-danger-text)' : isDueToday(task) ? 'var(--rp-warn-text)' : 'var(--text-muted)')}>
                        {isOverdue(task) ? `Overdue ${timeAgo(task.due_date)}` : isDueToday(task) ? 'Due Today' : timeAgo(task.created_at)}
                    </span>
                    {task.workflow_round > 1 && (
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>Round {task.workflow_round}</div>
                    )}
                </div>
            </div>

            {expandedTaskId === task.id && (
                <div style={{ marginTop: '8px', borderTop: '1px solid var(--border-secondary)', paddingTop: '8px' }}>
                    {task.task_type === 'QUALIFY_LEAD' && renderQualifyActions(task)}
                    {task.task_type === 'SHARE_PROPERTIES' && renderShareActions(task)}
                    {task.task_type === 'SCHEDULE_VISIT' && renderScheduleActions(task)}
                    {task.task_type === 'VISIT_FEEDBACK' && renderFeedbackActions(task)}
                    {task.task_type === 'NEGOTIATE_DEAL' && renderNegotiateActions(task)}
                </div>
            )}
        </div>
    );

    // ── Render: Task Section ──
    const renderTaskSection = (title: string, taskList: WorkflowTask[], color: string) => {
        if (taskList.length === 0) return null;
        return (
            <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, display: 'inline-block' }} />
                    {title} ({taskList.length})
                </div>
                {taskList.map(renderTaskCard)}
            </div>
        );
    };

    // ── Render: Team View ──
    const renderTeamView = () => (
        <div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid var(--border-secondary)' }}>
                            <th style={{ textAlign: 'left', padding: '8px' }}>Agent</th>
                            {Object.keys(STAGE_LABELS).map(s => <th key={s} style={{ textAlign: 'center', padding: '8px', color: 'var(--text-secondary)' }}><PresentationIcon value={STAGE_ICONS[s]} /> <span className="sr-only">{STAGE_LABELS[s]}</span></th>)}
                            <th style={{ textAlign: 'center', padding: '8px' }}>Overdue</th>
                            <th style={{ textAlign: 'center', padding: '8px' }}>Today</th>
                        </tr>
                    </thead>
                    <tbody>
                        {teamPipeline.map((agent: any) => {
                            const getCount = (type: string, status?: string) => {
                                return agent.tasks.filter((t: any) => t.task_type === type && (!status || t.status === status)).reduce((sum: number, t: any) => sum + t.count, 0);
                            };
                            return (
                                <tr key={agent.agent_id} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                                    <td style={{ padding: '8px', fontWeight: 500 }}>{agent.agent_name}</td>
                                    {Object.keys(STAGE_LABELS).map(s => <td key={s} style={{ textAlign: 'center', padding: '8px' }}>{getCount(s)}</td>)}
                                    <td style={{ textAlign: 'center', padding: '8px', color: agent.overdue > 0 ? 'var(--rp-danger-text)' : 'var(--text-muted)', fontWeight: agent.overdue > 0 ? 700 : 400 }}>{agent.overdue}</td>
                                    <td style={{ textAlign: 'center', padding: '8px', color: 'var(--rp-success-text)' }}>{agent.completed_today}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );

    // ── Main Render ──
    if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading workflow tasks...</div>;

    return (
        <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '20px' }}>Lead Tasks</h2>
                {isBoss && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => setViewMode('my-tasks')} style={{ ...btnStyle(viewMode === 'my-tasks' ? 'var(--blue-500)' : 'var(--text-secondary)'), fontSize: '12px', padding: '6px 12px' }}>My Tasks</button>
                        <button onClick={() => setViewMode('team')} style={{ ...btnStyle(viewMode === 'team' ? 'var(--blue-500)' : 'var(--text-secondary)'), fontSize: '12px', padding: '6px 12px' }}>Team View</button>
                    </div>
                )}
            </div>

            {/* Message */}
            {message && (
                <div style={{ padding: '10px 16px', borderRadius: '8px', marginBottom: '16px', backgroundColor: message.type === 'success' ? 'var(--rp-success-bg)' : 'var(--rp-danger-bg)', color: message.type === 'success' ? 'var(--rp-success-text)' : 'var(--rp-danger-text)', fontSize: '13px', fontWeight: 500 }}>
                    {message.text}
                </div>
            )}

            {/* Stats Bar */}
            {renderStatsBar()}

            {/* Content */}
            {viewMode === 'team' && isBoss ? renderTeamView() : (
                <>
                    {tasks.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <div style={{ marginBottom: '12px' }}><PresentationIcon value="lightbulb" size={24} /></div>
                            <div style={{ fontSize: '16px', fontWeight: 500 }}>All caught up!</div>
                            <div style={{ fontSize: '13px', marginTop: '4px' }}>No pending lead tasks right now.</div>
                        </div>
                    ) : (
                        <>
                            {renderTaskSection('Overdue', overdueTasks, 'var(--rp-danger-text)')}
                            {renderTaskSection('Due Today', todayTasks, 'var(--rp-warn-text)')}
                            {renderTaskSection('Upcoming', upcomingTasks, 'var(--text-muted)')}
                        </>
                    )}
                </>
            )}
        </div>
    );
}
