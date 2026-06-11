import { useState, useEffect } from 'react';
import client from '../api/client';

export type LogActionType =
    | 'CALLED'
    | 'SCHEDULED_VISIT'
    | 'CONFIRMED_VISIT'
    | 'REMINDER_GIVEN'
    | 'VISIT_RESCHEDULED'
    | 'LOGGED_NOTE'
    | 'MEETING_BOOKED'
    | 'PAUSED_AI'
    | 'RESUMED_AI';

interface LogActionModalProps {
    dealId: string;
    stage: string;
    actionType: LogActionType;
    onClose: () => void;
    onSuccess: () => void;
}

const OUTCOME_LABELS: Record<string, string[]> = {
    CALLED: ['no_answer', 'busy', 'connected', 'qualified', 'scheduled'],
};

const OUTCOME_DISPLAY: Record<string, string> = {
    no_answer:     'No Answer',
    busy:          'Busy / Call Back Later',
    connected:     'Connected — taking notes',
    qualified:     'Connected — Lead Qualified',
    scheduled:     'Connected — Visit Scheduled',
    reminder_given:'Reminder given',
};

const MEETING_TYPES = [
    { value: 'MEETING_BOOKED',  label: 'Meeting held' },
    { value: 'LOGGED_NOTE',     label: 'Offer made by buyer' },
    { value: 'LOGGED_NOTE',     label: 'Counter offer from owner' },
    { value: 'LOGGED_NOTE',     label: 'Verbal agreement reached' },
    { value: 'LOGGED_NOTE',     label: 'Called / WhatsApped customer' },
];

export function LogActionModal({ dealId, stage: _stage, actionType, onClose, onSuccess }: LogActionModalProps) {
    const [outcome, setOutcome]         = useState('');
    const [notes, setNotes]             = useState('');
    const [visitDate, setVisitDate]     = useState('');
    const [visitTime, setVisitTime]     = useState('');
    const [meetingType, setMeetingType] = useState(MEETING_TYPES[0].value);
    const [submitting, setSubmitting]   = useState(false);
    const [error, setError]             = useState('');

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const handleSubmit = async () => {
        setSubmitting(true);
        setError('');
        try {
            let resolvedActionType: string = actionType;
            let resolvedNewStatus: string | undefined;

            // Resolve action type and new status from outcome
            if (actionType === 'CALLED') {
                if (!outcome) { setError('Please select an outcome'); setSubmitting(false); return; }
                if (outcome === 'qualified')  resolvedNewStatus = 'QUALIFIED';
                if (outcome === 'scheduled')  resolvedNewStatus = 'VISIT_SCHEDULED';
            }
            if (actionType === 'SCHEDULED_VISIT') {
                if (!visitDate || !visitTime) { setError('Please select date and time'); setSubmitting(false); return; }
                resolvedNewStatus = 'VISIT_SCHEDULED';
            }
            if (actionType === 'CONFIRMED_VISIT') {
                if (!visitDate || !visitTime) { setError('Please select date and time'); setSubmitting(false); return; }
                resolvedNewStatus = 'VISIT_SCHEDULED';
            }
            if (actionType === 'VISIT_RESCHEDULED') {
                if (!visitDate || !visitTime) { setError('Please select date and time'); setSubmitting(false); return; }
            }
            if (actionType === 'MEETING_BOOKED') {
                resolvedActionType = meetingType;
            }

            const payload: any = {
                action_type: resolvedActionType,
                notes: [
                    notes,
                    visitDate && visitTime ? `Visit: ${visitDate} ${visitTime}` : '',
                ].filter(Boolean).join('\n') || undefined,
            };
            if (outcome)         payload.outcome    = outcome;
            if (resolvedNewStatus) payload.new_status = resolvedNewStatus;

            await client.post(`/api/deals/${dealId}/log-action`, payload);
            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err?.response?.data?.error || err.message || 'Failed to log action');
        } finally {
            setSubmitting(false);
        }
    };

    const title: Record<LogActionType, string> = {
        CALLED:           'Log Manual Call',
        SCHEDULED_VISIT:  'I Scheduled a Visit',
        CONFIRMED_VISIT:  'Confirm Appointment',
        REMINDER_GIVEN:   'Log Reminder Call',
        VISIT_RESCHEDULED:'Reschedule Visit',
        LOGGED_NOTE:      'Log Update',
        MEETING_BOOKED:   'Log Negotiation Update',
        PAUSED_AI:        'Pause AI',
        RESUMED_AI:       'Resume AI',
    };

    return (
        <div
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
                zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}
        >
            <div style={{
                background: '#1e2536', borderRadius: 14, width: '100%', maxWidth: 460,
                padding: '20px 20px 24px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                    <h3 style={{ margin: 0, fontSize: 16, color: '#f3f4f6' }}>{title[actionType]}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 20, cursor: 'pointer' }}>✕</button>
                </div>

                {/* CALLED — outcome selector */}
                {actionType === 'CALLED' && (
                    <div style={{ marginBottom: 14 }}>
                        <label style={labelStyle}>Outcome</label>
                        {OUTCOME_LABELS.CALLED.map(o => (
                            <label key={o} style={radioRowStyle}>
                                <input type="radio" name="outcome" value={o} checked={outcome === o} onChange={() => setOutcome(o)} />
                                <span style={{ marginLeft: 8, color: '#d1d5db', fontSize: 14 }}>{OUTCOME_DISPLAY[o]}</span>
                            </label>
                        ))}
                    </div>
                )}

                {/* MEETING_BOOKED — meeting type selector */}
                {actionType === 'MEETING_BOOKED' && (
                    <div style={{ marginBottom: 14 }}>
                        <label style={labelStyle}>What happened?</label>
                        {MEETING_TYPES.map((m, i) => (
                            <label key={i} style={radioRowStyle}>
                                <input
                                    type="radio" name="meeting_type" value={`${m.value}:${i}`}
                                    checked={meetingType === `${m.value}:${i}`}
                                    onChange={() => setMeetingType(m.value)}
                                />
                                <span style={{ marginLeft: 8, color: '#d1d5db', fontSize: 14 }}>{m.label}</span>
                            </label>
                        ))}
                    </div>
                )}

                {/* Date + Time picker for visit actions */}
                {['SCHEDULED_VISIT', 'CONFIRMED_VISIT', 'VISIT_RESCHEDULED'].includes(actionType) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                        <div>
                            <label style={labelStyle}>Date</label>
                            <input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>Time</label>
                            <input type="time" value={visitTime} onChange={e => setVisitTime(e.target.value)} style={inputStyle} />
                        </div>
                    </div>
                )}

                {/* Notes */}
                <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>
                        {actionType === 'CALLED' ? 'Notes (AI will read these)' :
                         actionType === 'CONFIRMED_VISIT' ? 'Special Instructions for Key Holder' :
                         actionType === 'VISIT_RESCHEDULED' ? 'Reason for reschedule' :
                         actionType === 'MEETING_BOOKED' ? 'Notes' : 'Notes'}
                    </label>
                    <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Add notes here…"
                        rows={3}
                        style={{ ...inputStyle, resize: 'vertical' }}
                    />
                </div>

                {error && (
                    <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
                    <button onClick={handleSubmit} disabled={submitting} style={submitBtnStyle}>
                        {submitting ? 'Saving…' : 'Submit'}
                    </button>
                </div>
            </div>
        </div>
    );
}

const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, color: '#9ca3af',
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
};
const radioRowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', padding: '5px 0', cursor: 'pointer',
};
const inputStyle: React.CSSProperties = {
    width: '100%', background: '#111827', border: '1px solid #374151',
    borderRadius: 8, color: '#f3f4f6', fontSize: 14, padding: '8px 10px',
    outline: 'none', boxSizing: 'border-box',
};
const cancelBtnStyle: React.CSSProperties = {
    background: 'transparent', border: '1px solid #374151', borderRadius: 8,
    color: '#9ca3af', fontSize: 14, padding: '8px 18px', cursor: 'pointer',
};
const submitBtnStyle: React.CSSProperties = {
    background: '#3b82f6', border: 'none', borderRadius: 8,
    color: '#fff', fontSize: 14, padding: '8px 20px', cursor: 'pointer', fontWeight: 600,
};
