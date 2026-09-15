
import React, { useState } from 'react';

interface LeadScore {
    total_score: number;
    intent_score: number;
    engagement_score: number;
    reliability_score: number;
}

interface Contact {
    phone_number: string;
    name?: string;
    lead_status: string;
    contact_type: string;
    updated_at: string;
    lead_score?: LeadScore;
}

interface Props {
    contacts: Contact[];
    selectedPhone: string | null;
    onSelect: (phone: string) => void;
}

const TYPE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
    'BUYER':               { label: 'Buyer',    color: '#1d4ed8', bg: '#dbeafe' },
    'TENANT':              { label: 'Tenant',   color: '#6d28d9', bg: '#ede9fe' },
    'LANDLORD':            { label: 'Landlord', color: '#15803d', bg: '#dcfce7' },
    'PARTNER_AGENT':       { label: 'Partner',  color: '#a16207', bg: '#fef9c3' },
    'REAL_ESTATE_BUILDER': { label: 'Builder',  color: '#b91c1c', bg: '#fee2e2' },
    'MANAGEMENT':          { label: 'Team',     color: '#475569', bg: '#f1f5f9' },
    'UNKNOWN':             { label: 'Unknown',  color: '#6b7280', bg: '#f3f4f6' },
};

const getScoreBadge = (score?: LeadScore) => {
    if (!score) return null;
    const s = score.total_score;
    if (s >= 70) return { emoji: '🔥', label: `HOT ${s}`, bg: 'var(--error-bg)', color: 'var(--error-text)' };
    if (s >= 40) return { emoji: '🟢', label: `WARM ${s}`, bg: 'var(--success-bg)', color: 'var(--success-text)' };
    return { emoji: '❄️', label: `COLD ${s}`, bg: '#1e3a5f', color: '#93c5fd' };
};

const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export const ContactList: React.FC<Props> = ({ contacts, selectedPhone, onSelect }) => {
    const [search, setSearch] = useState('');

    const filtered = contacts.filter(c => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (c.name?.toLowerCase().includes(q) || c.phone_number.includes(q));
    });

    const hotCount = contacts.filter(c => (c.lead_score?.total_score ?? 0) >= 70).length;

    return (
        <div style={{
            width: '300px', flexShrink: 0,
            borderRight: '1px solid var(--bg-secondary)',
            height: '100vh', display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--bg-tertiary)',
        }}>
            {/* Header */}
            <div style={{ padding: '16px', borderBottom: '1px solid var(--bg-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '15px' }}>Contacts</span>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {hotCount > 0 && (
                            <span style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error-text)', fontSize: '11px', padding: '2px 7px', borderRadius: '10px', fontWeight: 600 }}>
                                🔥 {hotCount} hot
                            </span>
                        )}
                        <span style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: '11px', padding: '2px 7px', borderRadius: '10px' }}>
                            {contacts.length}
                        </span>
                    </div>
                </div>
                <input
                    placeholder="🔍  Search by name or phone..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                        width: '100%', padding: '10px 14px',
                        backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)',
                        borderRadius: '8px', color: 'var(--text-primary)', fontSize: '16px',
                        outline: 'none', boxSizing: 'border-box', minHeight: '44px',
                    }}
                />
            </div>

            {/* Contact List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {filtered.length === 0 && (
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                        {search ? 'No contacts match your search' : 'No contacts yet'}
                    </div>
                )}
                {filtered.map((c) => {
                    const typeBadge = TYPE_BADGE[c.contact_type] || TYPE_BADGE['UNKNOWN'];
                    const scoreBadge = getScoreBadge(c.lead_score);
                    const isSelected = selectedPhone === c.phone_number;

                    return (
                        <div
                            key={c.phone_number}
                            onClick={() => onSelect(c.phone_number)}
                            style={{
                                padding: '12px 16px',
                                borderBottom: '1px solid var(--border-secondary)',
                                cursor: 'pointer',
                                backgroundColor: isSelected ? 'var(--bg-active)' : 'transparent',
                                borderLeft: isSelected ? '3px solid #3b82f6' : '3px solid transparent',
                                transition: 'background-color 0.15s',
                            }}
                            onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--bg-secondary)'; }}
                            onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
                        >
                            {/* Row 1: Name + date */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px', lineHeight: 1.3 }}>
                                    {c.name || c.phone_number}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: '8px', flexShrink: 0 }}>
                                    {formatDate(c.updated_at)}
                                </div>
                            </div>
                            {/* Row 2: Phone (only if name is shown) */}
                            {c.name && (
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                    {c.phone_number}
                                </div>
                            )}
                            {/* Row 3: Badges */}
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{
                                    fontSize: '10px', fontWeight: 600,
                                    backgroundColor: typeBadge.bg, color: typeBadge.color,
                                    padding: '2px 7px', borderRadius: '4px',
                                }}>
                                    {typeBadge.label}
                                </span>
                                {scoreBadge && (
                                    <span style={{
                                        fontSize: '10px', fontWeight: 600,
                                        backgroundColor: scoreBadge.bg, color: scoreBadge.color,
                                        padding: '2px 7px', borderRadius: '4px',
                                    }}>
                                        {scoreBadge.emoji} {scoreBadge.label}
                                    </span>
                                )}
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                                    {c.lead_status}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
