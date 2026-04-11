
import React from 'react';

interface Interaction {
    id: string;
    direction: string;
    content: string;
    created_at: string;
    channel: string;
}

interface LeadScore {
    total_score: number;
    intent_score: number;
    engagement_score: number;
    reliability_score: number;
    no_show_count: number;
}

interface Contact {
    phone_number: string;
    name?: string;
    contact_type: string;
    lead_score?: LeadScore;
}

interface Props {
    contact: Contact;
    interactions: Interaction[];
    onReportNoShow: () => void;
    onUpdateContactType?: (phone: string, type: string) => void;
}

const CHANNEL_ICON: Record<string, string> = {
    whatsapp: '💬', email: '📧', phone: '📞', sms: '📱', website: '🌐', admin: '🔧',
};

const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const formatDateSeparator = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
};

export const ChatView: React.FC<Props> = ({ contact, interactions, onReportNoShow, onUpdateContactType }) => {
    const score = contact.lead_score;
    const displayName = contact.name || contact.phone_number;

    // Group messages by date
    let lastDate = '';

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: 'var(--bg-primary)' }}>
            {/* Header */}
            <div style={{
                padding: '14px 20px',
                borderBottom: '1px solid var(--bg-secondary)',
                backgroundColor: 'var(--bg-secondary)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
                <div>
                    {/* Name + type selector */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)' }}>{displayName}</div>
                        <select
                            value={contact.contact_type || 'UNKNOWN'}
                            onChange={(e) => onUpdateContactType?.(contact.phone_number, e.target.value)}
                            style={{
                                fontSize: '11px', padding: '3px 6px', borderRadius: '6px',
                                border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
                                color: 'var(--text-secondary)', cursor: 'pointer', outline: 'none',
                            }}
                        >
                            <option value="UNKNOWN">Unknown</option>
                            <option value="BUYER_TENANT">Buyer/Tenant</option>
                            <option value="SELLER_LANDLORD">Seller/Landlord</option>
                            <option value="PARTNER_AGENT">Partner Agent</option>
                            <option value="MANAGEMENT">Management</option>
                        </select>
                    </div>
                    {/* Phone (secondary) */}
                    {contact.name && (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '3px' }}>
                            {contact.phone_number}
                        </div>
                    )}
                    {/* Score */}
                    {score && (
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <span>Score: <b style={{ color: score.total_score >= 70 ? 'var(--error-text)' : score.total_score >= 40 ? 'var(--success-text)' : '#93c5fd' }}>{score.total_score}</b></span>
                            <span style={{ color: 'var(--text-muted)' }}>Intent {score.intent_score}</span>
                            <span style={{ color: 'var(--text-muted)' }}>Eng {score.engagement_score}</span>
                            <span style={{ color: 'var(--text-muted)' }}>Rel {score.reliability_score}</span>
                            {score.no_show_count > 0 && (
                                <span style={{ color: '#ef4444', fontWeight: 600 }}>⚠️ {score.no_show_count} no-show{score.no_show_count > 1 ? 's' : ''}</span>
                            )}
                        </div>
                    )}
                </div>
                <button
                    onClick={onReportNoShow}
                    style={{
                        padding: '7px 14px',
                        backgroundColor: 'var(--error-bg)', color: 'var(--error-text)',
                        border: '1px solid #ef4444', borderRadius: '8px',
                        cursor: 'pointer', fontWeight: 600, fontSize: '12px',
                        whiteSpace: 'nowrap',
                    }}
                    title="Reduces reliability score by 20"
                >
                    🚨 No-Show
                </button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {interactions.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--border-secondary)', marginTop: '60px', fontSize: '14px' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>💬</div>
                        No interactions yet with {displayName}
                    </div>
                )}

                {interactions.map((msg) => {
                    const msgDate = formatDateSeparator(msg.created_at);
                    const showSeparator = msgDate !== lastDate;
                    lastDate = msgDate;
                    const isOut = msg.direction === 'outbound';

                    return (
                        <React.Fragment key={msg.id}>
                            {showSeparator && (
                                <div style={{ textAlign: 'center', margin: '12px 0 8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                    <span style={{ backgroundColor: 'var(--bg-secondary)', padding: '3px 12px', borderRadius: '10px' }}>
                                        {msgDate}
                                    </span>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start', marginBottom: '4px' }}>
                                <div style={{
                                    maxWidth: '65%',
                                    padding: '10px 14px',
                                    borderRadius: isOut ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                                    backgroundColor: isOut ? 'var(--bg-active)' : 'var(--bg-secondary)',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                }}>
                                    <div style={{ fontSize: '13px', color: 'var(--text-bright)', lineHeight: 1.5 }}>{msg.content}</div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '5px', textAlign: 'right', display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                        <span>{CHANNEL_ICON[msg.channel] || '📨'} {msg.channel}</span>
                                        <span>{formatTime(msg.created_at)}</span>
                                    </div>
                                </div>
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};
