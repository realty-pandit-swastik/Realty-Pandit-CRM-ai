
import { useState, useRef, useEffect } from 'react';

interface MobileChatViewProps {
    contact: any;
    interactions: any[];
    onReportNoShow: () => void;
    onMarkLeadLost?: () => void;
    onSetDelayReason?: () => void;
    onUpdateContactType: (phone: string, type: string) => void;
}

const TYPE_LABEL: Record<string, string> = {
    BUYER: 'Buyer', TENANT: 'Tenant', LANDLORD: 'Landlord', PARTNER_AGENT: 'Partner', REAL_ESTATE_BUILDER: 'Builder', MANAGEMENT: 'Team', UNKNOWN: 'Unknown',
};

export function MobileChatView({ contact, interactions, onReportNoShow, onMarkLeadLost, onSetDelayReason, onUpdateContactType }: MobileChatViewProps) {
    const [showActions, setShowActions] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [interactions]);

    const score = contact.lead_score?.total_score;
    const scoreColor = score >= 70 ? '#f87171' : score >= 40 ? '#4ade80' : '#94a3b8';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Contact Info Header */}
            <div style={{
                padding: '12px 16px', backgroundColor: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border-secondary)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <div>
                    <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>
                        {contact.name || contact.phone_number}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '8px', marginTop: '2px' }}>
                        <span>{contact.phone_number}</span>
                        <span style={{ backgroundColor: 'var(--bg-primary)', padding: '0 6px', borderRadius: '6px' }}>
                            {TYPE_LABEL[contact.contact_type] || '?'}
                        </span>
                        {score != null && (
                            <span style={{ color: scoreColor, fontWeight: 700 }}>Score: {score}</span>
                        )}
                    </div>
                </div>
                <button
                    onClick={() => setShowActions(!showActions)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--text-secondary)', padding: '4px' }}
                >
                    ⋮
                </button>
            </div>

            {/* Actions dropdown */}
            {showActions && (
                <div style={{
                    backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)',
                    borderRadius: '8px', margin: '4px 16px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px',
                }}>
                    <button onClick={() => { onReportNoShow(); setShowActions(false); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px', textAlign: 'left', color: '#f87171', fontSize: '13px', borderRadius: '6px' }}>
                        Report No-Show
                    </button>
                    {onSetDelayReason && contact.lead_status !== 'lost' && (
                        <button onClick={() => { onSetDelayReason(); setShowActions(false); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px', textAlign: 'left', color: '#fbbf24', fontSize: '13px', borderRadius: '6px', fontWeight: 600 }}>
                            ⏳ Set Delay Reason
                        </button>
                    )}
                    {onMarkLeadLost && contact.lead_status !== 'lost' && (
                        <button onClick={() => { onMarkLeadLost(); setShowActions(false); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px', textAlign: 'left', color: '#fca5a5', fontSize: '13px', borderRadius: '6px', fontWeight: 600 }}>
                            ❌ Mark Lead Lost
                        </button>
                    )}
                    {['BUYER', 'TENANT', 'LANDLORD', 'PARTNER_AGENT', 'MANAGEMENT'].map(type => (
                        <button key={type} onClick={() => { onUpdateContactType(contact.phone_number, type); setShowActions(false); }}
                            style={{
                                background: contact.contact_type === type ? 'var(--bg-active)' : 'none',
                                border: 'none', cursor: 'pointer', padding: '8px 12px', textAlign: 'left',
                                color: 'var(--text-secondary)', fontSize: '13px', borderRadius: '6px',
                            }}>
                            Set as {TYPE_LABEL[type]}
                        </button>
                    ))}
                </div>
            )}

            {/* Messages */}
            <div style={{ flex: 1, overflow: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {interactions.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0', fontSize: '14px' }}>
                        No messages yet
                    </div>
                ) : (
                    interactions.map((msg, i) => {
                        const isIncoming = msg.direction === 'incoming';
                        return (
                            <div key={msg.id || i} style={{
                                display: 'flex', justifyContent: isIncoming ? 'flex-start' : 'flex-end',
                            }}>
                                <div style={{
                                    maxWidth: '85%', padding: '10px 14px', borderRadius: '12px',
                                    backgroundColor: isIncoming ? 'var(--bg-secondary)' : '#4F46E5',
                                    color: isIncoming ? 'var(--text-primary)' : '#fff',
                                    border: isIncoming ? '1px solid var(--border-secondary)' : 'none',
                                }}>
                                    <div style={{ fontSize: '14px', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                        {msg.message_body || msg.content}
                                    </div>
                                    <div style={{
                                        fontSize: '10px', marginTop: '4px', textAlign: 'right',
                                        color: isIncoming ? 'var(--text-muted)' : 'rgba(255,255,255,0.7)',
                                    }}>
                                        {msg.channel && <span>{msg.channel} · </span>}
                                        {new Date(msg.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>
        </div>
    );
}
