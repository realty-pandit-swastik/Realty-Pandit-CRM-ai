import React, { useState, useEffect, useCallback } from 'react';
import type { Deal } from '../../api/client';
import { getDealTimeline, logDealAction } from '../../api/client';
import { toDialablePhone } from '../../lib/phone';
import { RequirementsTab } from './RequirementsTab';
import { MatchShareTab } from './MatchShareTab';
import { SharedTab } from './SharedTab';
import { TimelineTab } from './TimelineTab';
import { WhatsAppChatTab } from '../WhatsAppChatTab';
import { ReassignModal } from './ReassignModal';
import { ConvertToPartnerModal } from '../ConvertToPartnerModal';
import { ReminderModal } from './ReminderModal';
import { useToast } from '../../contexts/ToastContext';

// These constants are exported from DealPipeline and re-imported here.
// They are defined inline to avoid circular deps during initial render.
export interface DealWorkspaceProps {
    deal: Deal;
    stageColors: Record<string, string>;
    stageLabels: Record<string, string>;
    scenarioLabels: Record<string, string>;
    onClose: () => void;
    onRefresh: () => void;
    // Re-fetch the open deal (used after an in-session requirements edit so Match & Share reflects it).
    onDealUpdated?: () => void;
    onLogCall?: (deal: Deal) => void;
    onVisitOutcome?: (deal: Deal) => void;
    onRevive?: (deal: Deal) => void;
    onTransfer?: (deal: Deal) => void;
}

type Tab = 'detail' | 'match' | 'shared' | 'chat' | 'timeline';

export function DealWorkspace({
    deal, stageColors, stageLabels, scenarioLabels,
    onClose, onRefresh, onDealUpdated, onLogCall, onVisitOutcome, onRevive, onTransfer,
}: DealWorkspaceProps) {
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<Tab>('detail');
    const [timeline, setTimeline] = useState<any[]>([]);
    const [loadingTimeline, setLoadingTimeline] = useState(true);
    const [showCallLog, setShowCallLog] = useState(false);
    const [callNotes, setCallNotes] = useState('');
    const [callOutcome, setCallOutcome] = useState('');
    const [savingCall, setSavingCall] = useState(false);
    const [showReassign, setShowReassign] = useState(false);
    const [showReminder, setShowReminder] = useState(false);
    const [showConvert, setShowConvert] = useState(false);

    const loadTimeline = useCallback(async () => {
        setLoadingTimeline(true);
        try {
            const res = await getDealTimeline(deal.id);
            // Backend returns { success, data: [...] } or just [...]
            setTimeline(Array.isArray(res.data) ? res.data : (res.data?.data || []));
        } catch { /* silent */ }
        finally { setLoadingTimeline(false); }
    }, [deal.id]);

    useEffect(() => { loadTimeline(); }, [loadTimeline]);

    const handleLogCallNote = async () => {
        if (!callNotes.trim()) { showToast('Please enter call notes', 'error'); return; }
        setSavingCall(true);
        try {
            await logDealAction(deal.id, { action_type: 'CALL_LOGGED', notes: callNotes.trim(), outcome: callOutcome || undefined });
            showToast('Call logged to timeline', 'success');
            setShowCallLog(false);
            setCallNotes('');
            setCallOutcome('');
            loadTimeline();
        } catch {
            showToast('Failed to log call', 'error');
        } finally { setSavingCall(false); }
    };

    const rawPhone = deal.demand_contact?.phone_number || '';
    // Placeholder ids (PENDING-/TEMP_) are non-dialable. `phone` still gates the action-row visibility
    // (Log Call / Reassign etc. stay available for placeholder leads); `customerTel` is the canonical,
    // country-coded value for the Call/WA links — null when not dialable, so those two links hide.
    const phone = rawPhone.replace(/\D/g, '');
    const customerTel = toDialablePhone(rawPhone);
    const coordinatorTel = toDialablePhone((deal.coordinator as any)?.phone);
    // Referral partner (the partner agent this lead was added on behalf of) — denormalized on the contact.
    const partnerTel = toDialablePhone((deal.demand_contact as any)?.referral_partner_phone);
    const partnerName = (deal.demand_contact as any)?.referral_partner_name as string | undefined;
    const stageColor = stageColors[deal.status] || '#6b7280';

    const tabs: { key: Tab; label: string }[] = [
        { key: 'detail',   label: 'Detail' },
        { key: 'match',    label: 'Match & Share' },
        { key: 'shared',   label: 'Shared' },
        { key: 'chat',     label: 'WhatsApp Chat' },
        { key: 'timeline', label: `Timeline${timeline.length ? ` (${timeline.length})` : ''}` },
    ];

    return (
        <>
            {/* Backdrop */}
            <div onClick={onClose} style={{
                position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)',
                zIndex: 100, backdropFilter: 'blur(2px)',
            }} />

            {/* Modal */}
            <div style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                backgroundColor: 'var(--bg-primary)', borderRadius: '16px',
                width: '720px', maxWidth: '96vw', maxHeight: '90vh',
                overflow: 'hidden', zIndex: 101,
                boxShadow: '0 25px 60px rgba(0,0,0,0.35)',
                display: 'flex', flexDirection: 'column',
            }}>

                {/* ── Header ── */}
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-secondary)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>

                        {/* Customer block */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {deal.demand_contact?.name || 'Unknown'}
                                </span>
                                <span style={{
                                    padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                                    backgroundColor: stageColor + '18', color: stageColor,
                                }}>
                                    {stageLabels[deal.status] || deal.status}
                                </span>
                                {deal.deal_scenario && (
                                    <span style={{
                                        padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500,
                                        backgroundColor: 'var(--tag-blue-bg)', color: 'var(--tag-blue-text)',
                                    }}>
                                        {scenarioLabels[deal.deal_scenario] || deal.deal_scenario}
                                    </span>
                                )}
                            </div>

                            {/* Quick action buttons */}
                            {phone && (
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {customerTel && <a href={`tel:${customerTel}`} style={quickBtnStyle('#22c55e')}>📞 Call</a>}
                                    {customerTel && <a href={`https://wa.me/${customerTel.slice(1)}`} target="_blank" rel="noreferrer" style={quickBtnStyle('#25d366')}>💬 WA</a>}
                                    {deal.status === 'NEW' ? (
                                        onLogCall && <button onClick={() => onLogCall(deal)} style={quickBtnStyle('var(--accent-primary)', true)}>📋 Log Call</button>
                                    ) : (
                                        <button onClick={() => setShowCallLog(true)} style={quickBtnStyle('var(--accent-primary)', true)}>📋 Log Call</button>
                                    )}
                                    {onTransfer && (
                                        <button onClick={() => onTransfer(deal)} style={quickBtnStyle('#f59e0b', true)}>🔄 Transfer</button>
                                    )}
                                    <button type="button" onClick={() => setShowReassign(true)} style={quickBtnStyle('#6366f1', true)}>👤 Reassign</button>
                                    <button type="button" onClick={() => setShowReminder(true)} style={quickBtnStyle('#0ea5e9', true)}>⏰ Reminder</button>
                                    {deal.demand_contact?.contact_type !== 'PARTNER_AGENT'
                                        && deal.status !== 'CLOSED_WON' && deal.status !== 'CLOSED_LOST' && (
                                        <button type="button" onClick={() => setShowConvert(true)} style={quickBtnStyle('#10b981', true)}>🤝 Convert to Partner</button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Coordinator block (top-right) */}
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            {deal.coordinator ? (
                                <>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Coordinator</div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{deal.coordinator.name}</div>
                                    {coordinatorTel && (
                                        <a href={`tel:${coordinatorTel}`} style={{ fontSize: 11, color: '#22c55e', textDecoration: 'none' }}>
                                            📞 {coordinatorTel}
                                        </a>
                                    )}
                                </>
                            ) : (
                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Unassigned</div>
                            )}
                        </div>

                        {/* Partner block (top-right) — call the partner agent this lead was added on behalf of */}
                        {partnerTel && (
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🤝 Partner</div>
                                {partnerName && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{partnerName}</div>}
                                <a href={`tel:${partnerTel}`} title={`Call partner ${partnerName || ''} ${partnerTel}`} style={{ fontSize: 11, color: '#7c3aed', textDecoration: 'none', fontWeight: 700 }}>
                                    📞 Call partner
                                </a>
                            </div>
                        )}

                        {/* Close */}
                        <button onClick={onClose} aria-label="Close" style={{
                            background: 'none', border: 'none', fontSize: 22, cursor: 'pointer',
                            color: 'var(--text-secondary)', padding: '0 0 0 8px', minWidth: 32, flexShrink: 0,
                        }}>×</button>
                    </div>
                </div>

                {/* ── Tabs ── */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border-secondary)', padding: '0 20px', overflowX: 'auto', flexShrink: 0 }}>
                    {tabs.map(t => (
                        <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                            padding: '10px 14px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                            backgroundColor: 'transparent',
                            color: activeTab === t.key ? 'var(--accent-primary)' : 'var(--text-secondary)',
                            borderBottom: activeTab === t.key ? '2px solid var(--accent-primary)' : '2px solid transparent',
                            whiteSpace: 'nowrap', flexShrink: 0,
                        }}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* ── Simple Call Log Modal (QUALIFIED+ stages) ── */}
                {showCallLog && (
                    <div style={{
                        position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
                        zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 16,
                    }}>
                        <div style={{
                            backgroundColor: 'var(--bg-primary)', borderRadius: 12, padding: 24,
                            width: 400, maxWidth: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                        }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
                                📋 Log Call — {deal.demand_contact?.name || 'Lead'}
                            </div>
                            <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase' }}>Outcome</div>
                                <select
                                    title="Call outcome"
                                    value={callOutcome}
                                    onChange={e => setCallOutcome(e.target.value)}
                                    style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12 }}
                                >
                                    <option value="">Select outcome…</option>
                                    <option value="Interested">Interested</option>
                                    <option value="Callback requested">Callback requested</option>
                                    <option value="Not interested">Not interested</option>
                                    <option value="No answer">No answer</option>
                                    <option value="Discussed requirements">Discussed requirements</option>
                                </select>
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase' }}>Notes *</div>
                                <textarea
                                    value={callNotes}
                                    onChange={e => setCallNotes(e.target.value)}
                                    placeholder="What was discussed? Any follow-up needed?"
                                    rows={4}
                                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={handleLogCallNote} disabled={savingCall || !callNotes.trim()} style={{
                                    flex: 1, padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 700,
                                    backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', cursor: 'pointer',
                                    opacity: (savingCall || !callNotes.trim()) ? 0.6 : 1,
                                }}>
                                    {savingCall ? 'Saving…' : '✅ Save to Timeline'}
                                </button>
                                <button onClick={() => { setShowCallLog(false); setCallNotes(''); setCallOutcome(''); }} style={{
                                    padding: '8px 16px', borderRadius: 7, fontSize: 13, cursor: 'pointer',
                                    backgroundColor: 'transparent', border: '1px solid var(--border-secondary)', color: 'var(--text-secondary)',
                                }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Reassign Modal ── */}
                {showReassign && (
                    <ReassignModal
                        deal={deal}
                        onClose={() => setShowReassign(false)}
                        onReassigned={() => {
                            setShowReassign(false);
                            onRefresh();
                            onClose();
                        }}
                    />
                )}

                {/* ── Reminder Modal (T8) ── */}
                {showReminder && (
                    <ReminderModal
                        deal={deal}
                        onClose={() => setShowReminder(false)}
                        onSaved={() => {
                            setShowReminder(false);
                            onRefresh();
                        }}
                    />
                )}

                {/* ── Convert to Partner Agent Modal ── */}
                {showConvert && deal.demand_contact?.phone_number && (
                    <ConvertToPartnerModal
                        phone={deal.demand_contact.phone_number}
                        defaultName={deal.demand_contact?.name || ''}
                        onClose={() => setShowConvert(false)}
                        onConverted={() => { onRefresh(); }}
                    />
                )}

                {/* ── Tab content ── */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {activeTab === 'detail' && (
                        <RequirementsTab
                            deal={deal}
                            stageLabels={stageLabels}
                            onRefresh={onRefresh}
                            onDealUpdated={onDealUpdated}
                            onVisitOutcome={onVisitOutcome}
                            onRevive={onRevive}
                        />
                    )}
                    {activeTab === 'match' && (
                        <MatchShareTab
                            deal={deal}
                            onShared={() => { loadTimeline(); setActiveTab('shared'); }}
                        />
                    )}
                    {activeTab === 'shared' && (
                        <SharedTab
                            deal={deal}
                            onAppointmentBooked={() => { onRefresh(); onClose(); }}
                        />
                    )}
                    {activeTab === 'chat' && (
                        <WhatsAppChatTab
                            phone={deal.demand_contact?.phone_number || ''}
                            isMobile={typeof window !== 'undefined' && window.innerWidth < 768}
                        />
                    )}
                    {activeTab === 'timeline' && (
                        <TimelineTab events={timeline} loading={loadingTimeline} />
                    )}
                </div>
            </div>
        </>
    );
}

function quickBtnStyle(color: string, isButton?: boolean): React.CSSProperties {
    return {
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '4px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600,
        backgroundColor: color + '18', border: `1.5px solid ${color}55`,
        color: color, textDecoration: 'none', cursor: 'pointer',
        background: isButton ? undefined : undefined,
    };
}
