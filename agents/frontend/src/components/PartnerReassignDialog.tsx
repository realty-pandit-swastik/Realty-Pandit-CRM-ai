import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:7071';

interface Agent {
    id: string;
    name: string;
    role?: string;
    email?: string;
}

interface ReassignResult {
    partnerId: string;
    fromAgentId: string | null;
    toAgentId: string;
    counts: { inventory: number; contacts: number; transactions: number };
}

interface Props {
    partnerId: string;
    partnerName: string;
    currentManagerId?: string | null;
    currentManagerName?: string | null;
    onClose: () => void;
    onSuccess: (result: ReassignResult) => void;
}

/**
 * PartnerReassignDialog — super_boss only UI.
 *
 * Transfers a partner agent AND all derived assets (inventory, contacts, transactions)
 * to a new internal manager. Backed by POST /api/partners/:id/reassign.
 *
 * Operational note: reassignment is atomic on the backend. Old manager loses visibility
 * of everything tied to this partner; new manager gains it. Action is logged to
 * partner_reassignment_logs for audit.
 */
export const PartnerReassignDialog: React.FC<Props> = ({
    partnerId,
    partnerName,
    currentManagerId,
    currentManagerName,
    onClose,
    onSuccess,
}) => {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [toAgentId, setToAgentId] = useState('');
    const [reason, setReason] = useState('');
    const [loadingAgents, setLoadingAgents] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await axios.get(`${API_BASE_URL}/api/team/members-list`, { withCredentials: true });
                if (!cancelled) setAgents(res.data || []);
            } catch (err: any) {
                if (!cancelled) setError(err?.response?.data?.error || 'Failed to load team members');
            } finally {
                if (!cancelled) setLoadingAgents(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const selectable = agents.filter((a) => a.id !== currentManagerId);

    const submit = async () => {
        if (!toAgentId) {
            setError('Please select the new manager');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            const res = await axios.post(
                `${API_BASE_URL}/api/partners/${partnerId}/reassign`,
                { to_agent_id: toAgentId, reason: reason.trim() || undefined },
                { withCredentials: true },
            );
            onSuccess(res.data as ReassignResult);
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Reassignment failed');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                <h3 style={styles.title}>Reassign partner</h3>
                <p style={styles.subtitle}>
                    Move <b style={{ color: 'var(--text-primary)' }}>{partnerName}</b>
                    {currentManagerName ? (
                        <> from <b style={{ color: 'var(--text-primary)' }}>{currentManagerName}</b></>
                    ) : null}
                    {' '}to a new internal manager. All their inventory, contacts, and deals will transfer.
                </p>

                <label style={styles.label}>New manager *</label>
                {loadingAgents ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading team members…</div>
                ) : (
                    <select
                        value={toAgentId}
                        onChange={(e) => setToAgentId(e.target.value)}
                        style={styles.select}
                    >
                        <option value="">Choose new manager…</option>
                        {selectable.map((a) => (
                            <option key={a.id} value={a.id}>
                                {a.name}{a.role ? ` (${a.role})` : ''}
                            </option>
                        ))}
                    </select>
                )}

                <label style={{ ...styles.label, marginTop: 12 }}>Reason (optional)</label>
                <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Restructuring the Gurgaon desk"
                    style={styles.textarea}
                />

                {error && <div style={styles.error}>{error}</div>}

                <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                    <button
                        type="button"
                        onClick={submit}
                        disabled={submitting || !toAgentId}
                        style={{
                            ...styles.primaryBtn,
                            opacity: submitting || !toAgentId ? 0.6 : 1,
                            cursor: submitting || !toAgentId ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {submitting ? 'Reassigning…' : 'Reassign'}
                    </button>
                    <button type="button" onClick={onClose} disabled={submitting} style={styles.secondaryBtn}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, padding: 16,
    },
    modal: {
        backgroundColor: 'var(--bg-primary)', borderRadius: 12, padding: 24,
        width: '100%', maxWidth: 480, border: '1px solid var(--border-secondary)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
    },
    title: {
        margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)',
    },
    subtitle: {
        margin: '0 0 18px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5,
    },
    label: {
        display: 'block', fontSize: 12, fontWeight: 600,
        color: 'var(--text-muted)', marginBottom: 6,
    },
    select: {
        width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14,
        backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)',
        border: '1px solid var(--border-secondary)', outline: 'none',
    },
    textarea: {
        width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14,
        backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)',
        border: '1px solid var(--border-secondary)', outline: 'none',
        minHeight: 70, resize: 'vertical', boxSizing: 'border-box',
    },
    error: {
        marginTop: 12, padding: '8px 12px', borderRadius: 6, fontSize: 13,
        backgroundColor: 'rgba(239,68,68,0.1)', color: '#fca5a5',
        border: '1px solid rgba(239,68,68,0.3)',
    },
    primaryBtn: {
        flex: 1, padding: '10px 16px', borderRadius: 8,
        backgroundColor: '#3b82f6', color: '#fff', border: 'none',
        fontSize: 14, fontWeight: 600, cursor: 'pointer',
    },
    secondaryBtn: {
        padding: '10px 16px', borderRadius: 8,
        backgroundColor: 'transparent', color: 'var(--text-secondary)',
        border: '1px solid var(--border-secondary)',
        fontSize: 14, fontWeight: 600, cursor: 'pointer',
    },
};
