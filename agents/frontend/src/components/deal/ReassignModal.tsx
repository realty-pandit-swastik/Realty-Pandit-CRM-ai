import React, { useState, useEffect } from 'react';
import type { Deal } from '../../api/client';
import { getTeamMembersList, reassignDeal } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';

interface TeamMember { id: string; name: string; role: string }

interface Props {
    deal: Deal;
    onClose: () => void;
    onReassigned: () => void;
}

const ROLE_LABELS: Record<string, string> = {
    super_boss: 'Super Boss', manager: 'Manager',
    employee: 'Employee', partner: 'Partner',
};

export function ReassignModal({ deal, onClose, onReassigned }: Props) {
    const { showToast } = useToast();
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<string>('');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');

    useEffect(() => {
        getTeamMembersList()
            .then(list => setMembers(list))
            .catch(() => showToast('Failed to load team members', 'error'))
            .finally(() => setLoading(false));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const filtered = members.filter(m =>
        !search || m.name.toLowerCase().includes(search.toLowerCase())
    );

    const currentCoordinator = deal.coordinator?.name || 'Unassigned';

    const handleReassign = async () => {
        if (!selected) { showToast('Select a team member', 'error'); return; }
        setSaving(true);
        try {
            await reassignDeal(deal.id, selected, reason || undefined);
            showToast('Deal and lead reassigned successfully', 'success');
            onReassigned();
        } catch (err: any) {
            showToast(err?.response?.data?.error || 'Reassignment failed', 'error');
        } finally {
            setSaving(false);
        }
    };

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '8px 10px', borderRadius: 7, fontSize: 12,
        border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
        color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
    };

    return (
        <>
            {/* Backdrop */}
            <div onClick={onClose} style={{
                position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 200,
            }} />

            {/* Modal — fixed header + footer, scrollable middle so action
                buttons are never clipped on short viewports (T1, 2026-05-16) */}
            <div style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                backgroundColor: 'var(--bg-primary)', borderRadius: 14,
                width: 420, maxWidth: '92vw', maxHeight: '88vh', overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)', zIndex: 201,
            }}>
                {/* Header (pinned) */}
                <div style={{
                    flexShrink: 0, display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', padding: '20px 24px 12px',
                }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                        Reassign Deal
                    </div>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', fontSize: 20, cursor: 'pointer',
                        color: 'var(--text-secondary)', padding: 0,
                    }}>×</button>
                </div>

                {/* Scrollable body */}
                <div style={{
                    flex: 1, minHeight: 0, overflowY: 'auto',
                    padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 16,
                }}>

                {/* Current coordinator */}
                <div style={{
                    padding: '8px 12px', borderRadius: 8, fontSize: 12,
                    backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                }}>
                    <strong>Currently assigned to:</strong> {currentCoordinator}
                </div>

                {/* Info note */}
                <div style={{
                    fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5,
                    padding: '6px 10px', borderRadius: 6,
                    backgroundColor: 'rgba(59,130,246,0.06)',
                    border: '1px solid rgba(59,130,246,0.2)',
                }}>
                    This will reassign both the deal coordinator and the lead contact to the selected employee.
                </div>

                {/* Search */}
                <input
                    style={inputStyle}
                    placeholder="Search team member…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />

                {/* Member list */}
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 120, maxHeight: 240 }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                            Loading…
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                            No members found
                        </div>
                    ) : (
                        filtered.map(m => {
                            const isSelected = selected === m.id;
                            const isCurrent = deal.coordinator?.id === m.id;
                            return (
                                <div
                                    key={m.id}
                                    onClick={() => !isCurrent && setSelected(m.id)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '8px 10px', borderRadius: 8, marginBottom: 4,
                                        cursor: isCurrent ? 'not-allowed' : 'pointer',
                                        backgroundColor: isSelected
                                            ? 'rgba(59,130,246,0.12)'
                                            : 'transparent',
                                        border: isSelected
                                            ? '1.5px solid rgba(59,130,246,0.4)'
                                            : '1.5px solid transparent',
                                        opacity: isCurrent ? 0.5 : 1,
                                    }}
                                >
                                    <div style={{
                                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                        backgroundColor: 'var(--bg-secondary)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 13, fontWeight: 700, color: 'var(--accent-primary)',
                                    }}>
                                        {(m.name || '?')[0].toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {m.name}
                                            {isCurrent && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>(current)</span>}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                            {ROLE_LABELS[m.role] || m.role}
                                        </div>
                                    </div>
                                    {isSelected && (
                                        <span style={{ fontSize: 16, color: 'var(--accent-primary)' }}>✓</span>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Reason */}
                <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase' }}>
                        Reason (optional)
                    </div>
                    <input
                        style={inputStyle}
                        placeholder="e.g. Language barrier, area specialist needed…"
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                    />
                </div>

                {/* end scrollable body */}
                </div>

                {/* Actions (pinned footer) */}
                <div style={{
                    flexShrink: 0, display: 'flex', gap: 8,
                    padding: '12px 24px 20px',
                    borderTop: '1px solid var(--border-secondary)',
                }}>
                    <button
                        onClick={handleReassign}
                        disabled={saving || !selected}
                        style={{
                            flex: 1, padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                            backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none',
                            cursor: saving || !selected ? 'not-allowed' : 'pointer',
                            opacity: saving || !selected ? 0.6 : 1,
                        }}
                    >
                        {saving ? 'Reassigning…' : 'Confirm Reassign'}
                    </button>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                            backgroundColor: 'transparent', border: '1px solid var(--border-secondary)',
                            color: 'var(--text-secondary)',
                        }}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </>
    );
}
