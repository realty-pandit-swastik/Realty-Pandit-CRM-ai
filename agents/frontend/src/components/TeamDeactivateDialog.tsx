import React, { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
// 2026-05-12: rewritten as a TWO-STEP wizard. Step 1 = drain the leaving agent's
// pipeline to a chosen successor (POST /api/team/members/:id/transfer-assets).
// Step 2 = once all counts are zero, flip the agent to inactive (PATCH .../deactivate).
// Backend now BLOCKS deactivation if any assets remain.
// See feedback_axios_shared_client.md.

interface OwnershipSummary {
    partners: number;
    inventory: number;
    contacts: number;
    leads: number;
    transactions: number;
}

interface TeamMember {
    id: string;
    name: string;
    role: string;
    status: string;
}

interface Props {
    agentId: string;
    agentName: string;
    onClose: () => void;
    onSuccess: (counts: OwnershipSummary) => void;
}

const ZERO: OwnershipSummary = { partners: 0, inventory: 0, contacts: 0, leads: 0, transactions: 0 };

export const TeamDeactivateDialog: React.FC<Props> = ({ agentId, agentName, onClose, onSuccess }) => {
    const [summary, setSummary] = useState<OwnershipSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    // Successor picker
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [targetId, setTargetId] = useState<string>('');

    const totalAssets = summary
        ? summary.partners + summary.inventory + summary.contacts + summary.leads + summary.transactions
        : 0;

    const reloadSummary = useCallback(async () => {
        try {
            const res = await client.get(`/api/team/members/${agentId}/ownership-summary`);
            setSummary(res.data);
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Failed to load ownership summary');
        }
    }, [agentId]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            await reloadSummary();
            try {
                const res = await client.get('/api/team/members');
                if (cancelled) return;
                const list: TeamMember[] = (res.data || [])
                    .filter((m: any) => m.id !== agentId && m.status === 'active');
                setMembers(list);
                // Default to super_boss if one is in the list
                const sb = list.find((m) => m.role === 'super_boss');
                setTargetId(sb?.id || list[0]?.id || '');
            } catch {
                // non-fatal
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [agentId, reloadSummary]);

    const transferAll = async () => {
        if (!targetId) {
            setError('Pick a successor first.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            await client.post(`/api/team/members/${agentId}/transfer-assets`, {
                to_agent_id: targetId,
                reason: `Reassignment before deactivating ${agentName}`,
            });
            await reloadSummary();
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Transfer failed');
        } finally {
            setBusy(false);
        }
    };

    const deactivate = async () => {
        setBusy(true);
        setError('');
        try {
            await client.patch(`/api/team/members/${agentId}/deactivate`, { status: 'inactive' });
            onSuccess(ZERO);
        } catch (err: any) {
            const data = err?.response?.data;
            if (data?.requires_transfer && data?.summary) {
                setSummary(data.summary);
                setError(data.error);
            } else {
                setError(data?.error || 'Deactivation failed');
            }
        } finally {
            setBusy(false);
        }
    };

    const targetName = members.find((m) => m.id === targetId)?.name || 'super boss';

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                <h3 style={styles.title}>Offboard {agentName}</h3>

                {loading && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 13, margin: '14px 0' }}>
                        Loading ownership summary…
                    </div>
                )}

                {!loading && summary && totalAssets > 0 && (
                    <>
                        <p style={styles.subtitle}>
                            <b style={{ color: 'var(--text-primary)' }}>Step 1 of 2:</b> Transfer their pipeline to a successor.
                            <br />Once all counts are zero, you can deactivate.
                        </p>

                        <div style={styles.counts}>
                            <Row label="Partner agents" value={summary.partners} />
                            <Row label="Inventory listings" value={summary.inventory} />
                            <Row label="Leads" value={summary.leads} />
                            <Row label="Contacts" value={summary.contacts} />
                            <Row label="Active deals" value={summary.transactions} />
                            <div style={styles.divider} />
                            <Row label="Total to transfer" value={totalAssets} bold />
                        </div>

                        <div style={{ marginTop: 18 }}>
                            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 }}>
                                Transfer all of {agentName}'s assets to:
                            </label>
                            <select
                                value={targetId}
                                onChange={(e) => setTargetId(e.target.value)}
                                disabled={busy}
                                style={styles.select}
                                aria-label={`Successor for ${agentName}'s assets`}
                                title={`Successor for ${agentName}'s assets`}
                            >
                                {members.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.name} ({m.role})
                                    </option>
                                ))}
                            </select>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                For finer per-record splits, cancel and reassign individual records first via Deal Pipeline / Inventory pages.
                            </div>
                        </div>

                        {error && <div style={styles.error}>{error}</div>}

                        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                            <button
                                type="button"
                                onClick={transferAll}
                                disabled={busy || !targetId}
                                style={{
                                    ...styles.primaryBtn,
                                    opacity: busy || !targetId ? 0.6 : 1,
                                    cursor: busy || !targetId ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {busy ? 'Transferring…' : `Transfer all → ${targetName}`}
                            </button>
                            <button type="button" onClick={onClose} disabled={busy} style={styles.secondaryBtn}>
                                Cancel
                            </button>
                        </div>
                    </>
                )}

                {!loading && summary && totalAssets === 0 && (
                    <>
                        <p style={styles.subtitle}>
                            <b style={{ color: 'var(--text-primary)' }}>Step 2 of 2:</b> {agentName} has no remaining assets.
                            They will lose all access on confirm.
                        </p>

                        <div style={styles.counts}>
                            <Row label="Total remaining assets" value={0} bold />
                        </div>

                        {error && <div style={styles.error}>{error}</div>}

                        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                            <button
                                type="button"
                                onClick={deactivate}
                                disabled={busy}
                                style={{
                                    ...styles.dangerBtn,
                                    opacity: busy ? 0.6 : 1,
                                    cursor: busy ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {busy ? 'Deactivating…' : `Deactivate ${agentName}`}
                            </button>
                            <button type="button" onClick={onClose} disabled={busy} style={styles.secondaryBtn}>
                                Cancel
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

const Row: React.FC<{ label: string; value: number; bold?: boolean }> = ({ label, value, bold }) => (
    <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 0', fontSize: 14,
        fontWeight: bold ? 700 : 500,
        color: bold ? 'var(--text-primary)' : 'var(--text-secondary)',
    }}>
        <span>{label}</span>
        <span style={{ color: bold ? '#f59e0b' : 'var(--text-primary)' }}>{value}</span>
    </div>
);

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
    counts: {
        backgroundColor: 'var(--bg-secondary)', borderRadius: 8, padding: '8px 14px',
        border: '1px solid var(--border-secondary)',
    },
    divider: {
        height: 1, backgroundColor: 'var(--border-secondary)', margin: '6px 0',
    },
    error: {
        marginTop: 12, padding: '8px 12px', borderRadius: 6, fontSize: 13,
        backgroundColor: 'rgba(239,68,68,0.1)', color: '#fca5a5',
        border: '1px solid rgba(239,68,68,0.3)',
    },
    select: {
        width: '100%', padding: '8px 10px', borderRadius: 6,
        backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)',
        border: '1px solid var(--border-secondary)', fontSize: 14,
    },
    primaryBtn: {
        flex: 1, padding: '10px 16px', borderRadius: 8,
        backgroundColor: '#2563eb', color: '#fff', border: 'none',
        fontSize: 14, fontWeight: 600,
    },
    dangerBtn: {
        flex: 1, padding: '10px 16px', borderRadius: 8,
        backgroundColor: '#ef4444', color: '#fff', border: 'none',
        fontSize: 14, fontWeight: 600,
    },
    secondaryBtn: {
        padding: '10px 16px', borderRadius: 8,
        backgroundColor: 'transparent', color: 'var(--text-secondary)',
        border: '1px solid var(--border-secondary)',
        fontSize: 14, fontWeight: 600, cursor: 'pointer',
    },
};
