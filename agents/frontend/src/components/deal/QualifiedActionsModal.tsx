/**
 * QualifiedActionsModal — QUALIFIED-stage guided actions (deal-workflow, 2026-06-29).
 *
 *  mode='share'    → ShareStep (match & share) → mandatory FollowUpReminderStep
 *  mode='reminder' → set the next self-task (date + note + reason). On No-answer ×4+
 *                    it also offers Reassign / Put on hold (same N=4 gate as NEW).
 *
 * Reuses the proven ShareStep + FollowUpReminderStep from LogCallOverlay.
 */
import { useState } from 'react';
import client, { setDealReminder, updateDealStatus, type Deal } from '../../api/client';
import { FollowUpReminderStep } from './LogCallOverlay';
import { MatchShareTab } from './MatchShareTab';
import { defaultReminderLocal } from '../../lib/defaultReminder';

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
    fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', display: 'block',
};

export type QualifiedActionMode = 'reminder' | 'share';

interface Props {
    dealId: string;
    /** Full deal — powers the rich Match & Share surface (images, BHK, code, filters). */
    deal: Deal;
    contactName: string;
    noAnswerCount?: number;
    agents?: { id: string; name: string }[];
    mode: QualifiedActionMode;
    isMobile?: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function QualifiedActionsModal({ dealId, deal, contactName, noAnswerCount = 0, agents = [], mode, isMobile, onClose, onSuccess }: Props) {
    const [shareStep, setShareStep] = useState<'share' | 'reminder'>('share');
    const title = mode === 'share' ? '📤 Share inventory' : '⏰ Set reminder';
    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 200, backdropFilter: 'blur(2px)' }} />
            <div style={{
                position: 'fixed', top: isMobile ? 0 : '50%', left: isMobile ? 0 : '50%', right: isMobile ? 0 : 'auto', bottom: isMobile ? 0 : 'auto',
                transform: isMobile ? 'none' : 'translate(-50%, -50%)', backgroundColor: 'var(--bg-primary)', borderRadius: isMobile ? 0 : '16px',
                width: isMobile ? '100%' : '480px', maxWidth: isMobile ? '100%' : '94vw', maxHeight: isMobile ? '100%' : '90vh',
                overflow: 'hidden', zIndex: 201, boxShadow: '0 25px 60px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column',
            }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title} — {contactName}</h3>
                    <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: 'var(--text-secondary)', minWidth: '44px', minHeight: '44px' }}>×</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
                    {mode === 'share' && shareStep === 'share' && (
                        // Rich Match & Share (images, BHK, copyable code, filter bar) — the same proven
                        // surface as the deal workspace. Negative margin cancels the modal body padding so
                        // MatchShareTab's own padding governs. onShared (company-WA send) auto-advances to
                        // the mandatory reminder; the footer covers the personal-WA / no-share paths.
                        <div style={{ margin: '-16px -18px 0' }}>
                            <MatchShareTab deal={deal} onShared={() => setShareStep('reminder')} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border-secondary)' }}>
                                <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}>Cancel</button>
                                <button type="button" onClick={() => setShareStep('reminder')} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}>Continue → set reminder</button>
                            </div>
                        </div>
                    )}
                    {mode === 'share' && shareStep === 'reminder' && (
                        <FollowUpReminderStep dealId={dealId} contactName={contactName} onDone={onSuccess} onCancel={onClose} />
                    )}
                    {mode === 'reminder' && (
                        <ReminderWithReason dealId={dealId} contactName={contactName} noAnswerCount={noAnswerCount} agents={agents} onDone={onSuccess} onCancel={onClose} />
                    )}
                </div>
            </div>
        </>
    );
}

function ReminderWithReason({ dealId, contactName, noAnswerCount, agents, onDone, onCancel }: {
    dealId: string; contactName: string; noAnswerCount: number; agents: { id: string; name: string }[]; onDone: () => void; onCancel: () => void;
}) {
    const [remindAt, setRemindAt] = useState(() => defaultReminderLocal());
    const [note, setNote] = useState('');
    const [reason, setReason] = useState<'NONE' | 'NO_ANSWER' | 'BUSY' | 'OTHER'>('NONE');
    const [agentId, setAgentId] = useState('');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const gateOpen = reason === 'NO_ANSWER' && noAnswerCount >= 4; // N = 4
    const REASONS: { k: 'NO_ANSWER' | 'BUSY' | 'OTHER'; l: string }[] = [
        { k: 'NO_ANSWER', l: '📵 No answer' }, { k: 'BUSY', l: '⏳ Customer busy' }, { k: 'OTHER', l: '🗒 Other' },
    ];
    const chip = (active: boolean): React.CSSProperties => ({
        padding: '10px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', textAlign: 'left',
        border: active ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-secondary)',
        backgroundColor: active ? 'rgba(59,130,246,0.08)' : 'var(--bg-secondary)', color: 'var(--text-primary)',
    });
    const save = async () => {
        if (!remindAt) return;
        setSaving(true); setErr('');
        try {
            await setDealReminder(dealId, { remind_at: new Date(remindAt).toISOString(), note: note.trim() || `Follow up with ${contactName}`, reason: reason === 'NO_ANSWER' ? 'NO_ANSWER' : undefined });
            onDone();
        } catch (e: any) { setErr(e?.response?.data?.error || 'Failed to set reminder'); setSaving(false); }
    };
    const reassign = async () => {
        if (!agentId) return;
        setSaving(true); setErr('');
        try { await client.patch(`/api/deals/${dealId}/reassign`, { agent_id: agentId }); onDone(); }
        catch (e: any) { setErr(e?.response?.data?.error || 'Reassign failed'); setSaving(false); }
    };
    const hold = async () => {
        setSaving(true); setErr('');
        try { await updateDealStatus(dealId, 'ON_HOLD'); onDone(); }
        catch (e: any) { setErr(e?.response?.data?.error || 'Failed to put on hold'); setSaving(false); }
    };
    const blocked = saving || !remindAt;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Set your next task — when will you act on this deal, and why?</div>
            <div>
                <div style={labelStyle}>Reason (optional)</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {REASONS.map(r => <button key={r.k} type="button" onClick={() => setReason(reason === r.k ? 'NONE' : r.k)} style={chip(reason === r.k)}>{r.l}</button>)}
                </div>
            </div>
            {gateOpen && (
                <div style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: 'rgba(245,158,11,0.1)', fontSize: '12px', color: '#b45309', fontWeight: 600 }}>
                    ⚠ {noAnswerCount}× no answer — consider reassigning or putting on hold instead of another reminder.
                </div>
            )}
            <div><div style={labelStyle}>Follow up at *</div><input aria-label="Follow up date and time" type="datetime-local" value={remindAt} onChange={e => setRemindAt(e.target.value)} style={inputStyle} /></div>
            <div><div style={labelStyle}>Next action (optional)</div><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} style={inputStyle} placeholder="What will you do next?" /></div>
            {err && <div style={{ fontSize: '12px', color: '#ef4444' }}>{err}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={onCancel} disabled={saving} style={{ padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: '1px solid var(--border-secondary)', backgroundColor: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancel</button>
                <button type="button" onClick={save} disabled={blocked} style={{ padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, border: 'none', color: '#fff', backgroundColor: blocked ? '#94a3b8' : 'var(--accent-primary)', cursor: blocked ? 'not-allowed' : 'pointer' }}>{saving ? 'Saving…' : 'Set reminder'}</button>
            </div>
            {gateOpen && (
                <div style={{ borderTop: '1px solid var(--border-secondary)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={labelStyle}>Or escalate</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <select aria-label="Reassign to agent" value={agentId} onChange={e => setAgentId(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                            <option value="">Reassign to…</option>
                            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        <button type="button" onClick={reassign} disabled={saving || !agentId} style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, border: 'none', color: '#fff', backgroundColor: (saving || !agentId) ? '#94a3b8' : '#8b5cf6', cursor: (saving || !agentId) ? 'not-allowed' : 'pointer' }}>🔄</button>
                    </div>
                    <button type="button" onClick={hold} disabled={saving} style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, border: '1px solid var(--border-secondary)', backgroundColor: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>⏸ Put on hold</button>
                </div>
            )}
        </div>
    );
}
