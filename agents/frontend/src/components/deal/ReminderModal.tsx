import React, { useState } from 'react';
import type { Deal } from '../../api/client';
import { setDealReminder } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { defaultReminderLocal } from '../../lib/defaultReminder';

interface Props {
    deal: Deal;
    onClose: () => void;
    onSaved: () => void;
}

const QUICK_OFFSETS: { label: string; minutes: number }[] = [
    { label: 'In 1 hour', minutes: 60 },
    { label: 'In 3 hours', minutes: 180 },
    { label: 'Tomorrow 10 AM', minutes: -1 }, // special-cased below
    { label: 'In 2 days', minutes: 2 * 24 * 60 },
];

function toLocalInputValue(d: Date): string {
    // datetime-local needs YYYY-MM-DDTHH:mm in local time
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ReminderModal({ deal, onClose, onSaved }: Props) {
    const { showToast } = useToast();
    const [remindAt, setRemindAt] = useState<string>(() => defaultReminderLocal());
    const [note, setNote] = useState('');
    const [advance, setAdvance] = useState(30);
    const [saving, setSaving] = useState(false);

    const applyQuick = (q: { label: string; minutes: number }) => {
        const d = new Date();
        if (q.label === 'Tomorrow 10 AM') {
            d.setDate(d.getDate() + 1);
            d.setHours(10, 0, 0, 0);
        } else {
            d.setMinutes(d.getMinutes() + q.minutes);
        }
        setRemindAt(toLocalInputValue(d));
    };

    const handleSave = async () => {
        if (!remindAt) { showToast('Pick a date & time', 'error'); return; }
        const due = new Date(remindAt);
        if (isNaN(due.getTime()) || due.getTime() < Date.now()) {
            showToast('Reminder time must be in the future', 'error');
            return;
        }
        setSaving(true);
        try {
            await setDealReminder(deal.id, {
                remind_at: due.toISOString(),
                note: note || undefined,
                advance_minutes: advance,
            });
            showToast('Reminder set — you will be alerted before and at the time', 'success');
            onSaved();
        } catch (err: any) {
            showToast(err?.response?.data?.error || 'Failed to set reminder', 'error');
        } finally {
            setSaving(false);
        }
    };

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '9px 10px', borderRadius: 7, fontSize: 13,
        border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
        color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
    };

    return (
        <>
            <div onClick={onClose} style={{
                position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 200,
            }} />
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
                        ⏰ Set Reminder
                    </div>
                    <button type="button" onClick={onClose} style={{
                        background: 'none', border: 'none', fontSize: 20, cursor: 'pointer',
                        color: 'var(--text-secondary)', padding: 0,
                    }}>×</button>
                </div>

                {/* Scrollable body */}
                <div style={{
                    flex: 1, minHeight: 0, overflowY: 'auto',
                    padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 16,
                }}>
                    <div style={{
                        fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5,
                        padding: '6px 10px', borderRadius: 6,
                        backgroundColor: 'rgba(59,130,246,0.06)',
                        border: '1px solid rgba(59,130,246,0.2)',
                    }}>
                        You will get a push alert before and at the time. The reminder is
                        recorded in this deal's timeline and the client's lead history.
                    </div>

                    {/* Quick presets */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {QUICK_OFFSETS.map(q => (
                            <button
                                key={q.label}
                                type="button"
                                onClick={() => applyQuick(q)}
                                style={{
                                    padding: '6px 10px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
                                    border: '1px solid var(--border-secondary)',
                                    backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                                }}
                            >
                                {q.label}
                            </button>
                        ))}
                    </div>

                    <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase' }}>
                            Date &amp; time
                        </div>
                        <input
                            type="datetime-local"
                            style={inputStyle}
                            value={remindAt}
                            onChange={e => setRemindAt(e.target.value)}
                        />
                    </div>

                    <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase' }}>
                            Alert me before
                        </div>
                        <select style={inputStyle} value={advance} onChange={e => setAdvance(Number(e.target.value))}>
                            <option value={10}>10 minutes before</option>
                            <option value={30}>30 minutes before</option>
                            <option value={60}>1 hour before</option>
                            <option value={120}>2 hours before</option>
                        </select>
                    </div>

                    <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase' }}>
                            Note
                        </div>
                        <input
                            style={inputStyle}
                            placeholder="e.g. Customer asked to call back after 4 PM"
                            value={note}
                            onChange={e => setNote(e.target.value)}
                        />
                    </div>
                </div>

                {/* Actions (pinned footer) */}
                <div style={{
                    flexShrink: 0, display: 'flex', gap: 8,
                    padding: '12px 24px 20px',
                    borderTop: '1px solid var(--border-secondary)',
                }}>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving || !remindAt}
                        style={{
                            flex: 1, padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                            backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none',
                            cursor: saving || !remindAt ? 'not-allowed' : 'pointer',
                            opacity: saving || !remindAt ? 0.6 : 1,
                        }}
                    >
                        {saving ? 'Saving…' : 'Set Reminder'}
                    </button>
                    <button
                        type="button"
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
