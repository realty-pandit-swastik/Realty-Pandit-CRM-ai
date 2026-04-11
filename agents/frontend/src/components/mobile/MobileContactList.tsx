
import { useState, useMemo } from 'react';

interface MobileContactListProps {
    contacts: any[];
    onSelect: (phone: string) => void;
}

const CARD_RADIUS = '12px';

const TYPE_ICON: Record<string, string> = {
    BUYER: '🏠', TENANT: '🛋️', LANDLORD: '🔑', PARTNER_AGENT: '🤝', REAL_ESTATE_BUILDER: '🏗️', MANAGEMENT: '👔', UNKNOWN: '👤',
};
const TYPE_LABEL: Record<string, string> = {
    BUYER: 'Buyer', TENANT: 'Tenant', LANDLORD: 'Landlord', PARTNER_AGENT: 'Partner', REAL_ESTATE_BUILDER: 'Builder', MANAGEMENT: 'Team', UNKNOWN: 'Unknown',
};

const FILTER_CHIPS = [
    { key: '', label: 'All' },
    { key: 'BUYER', label: 'Buyers' },
    { key: 'TENANT', label: 'Tenants' },
    { key: 'LANDLORD', label: 'Landlords' },
    { key: 'PARTNER_AGENT', label: 'Partners' },
    { key: 'hot', label: '🔥 Hot' },
];

export function MobileContactList({ contacts, onSelect }: MobileContactListProps) {
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('');

    const filtered = useMemo(() => {
        let list = contacts;
        if (filter === 'hot') {
            list = list.filter(c => (c.lead_score?.total_score ?? 0) >= 70);
        } else if (filter) {
            list = list.filter(c => c.contact_type === filter);
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(c =>
                (c.name || '').toLowerCase().includes(q) ||
                c.phone_number.includes(q)
            );
        }
        return list;
    }, [contacts, filter, search]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Search */}
            <div style={{ padding: '12px 16px 8px' }}>
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search contacts..."
                    style={{
                        width: '100%', padding: '10px 14px', borderRadius: CARD_RADIUS,
                        border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-primary)', fontSize: '14px', boxSizing: 'border-box',
                    }}
                />
            </div>

            {/* Filter Chips */}
            <div style={{ padding: '0 16px 8px', display: 'flex', gap: '8px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                {FILTER_CHIPS.map(chip => (
                    <button
                        key={chip.key}
                        onClick={() => setFilter(chip.key)}
                        style={{
                            flexShrink: 0, padding: '6px 14px', borderRadius: '20px',
                            border: filter === chip.key ? '1px solid #4F46E5' : '1px solid var(--border-secondary)',
                            backgroundColor: filter === chip.key ? '#4F46E5' : 'var(--bg-secondary)',
                            color: filter === chip.key ? '#fff' : 'var(--text-secondary)',
                            fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                    >
                        {chip.label}
                    </button>
                ))}
            </div>

            {/* Contact List */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px' }}>
                {filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0', fontSize: '14px' }}>
                        No contacts found
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {filtered.map(c => (
                            <div
                                key={c.phone_number}
                                onClick={() => onSelect(c.phone_number)}
                                style={{
                                    backgroundColor: 'var(--bg-secondary)', borderRadius: CARD_RADIUS,
                                    padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px',
                                    border: '1px solid var(--border-secondary)', cursor: 'pointer',
                                }}
                            >
                                <div style={{
                                    width: '44px', height: '44px', borderRadius: '50%',
                                    backgroundColor: 'var(--bg-primary)', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', fontSize: '20px', flexShrink: 0,
                                }}>
                                    {TYPE_ICON[c.contact_type] || '👤'}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {c.name || c.phone_number}
                                    </div>
                                    {c.name && <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{c.phone_number}</div>}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                        <span style={{
                                            backgroundColor: 'var(--bg-primary)', padding: '1px 8px', borderRadius: '8px',
                                            fontSize: '11px', color: 'var(--text-secondary)',
                                        }}>
                                            {TYPE_LABEL[c.contact_type] || '?'}
                                        </span>
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.lead_status}</span>
                                    </div>
                                </div>
                                {c.lead_score?.total_score != null && (
                                    <div style={{
                                        backgroundColor: c.lead_score.total_score >= 70 ? '#7f1d1d' : c.lead_score.total_score >= 40 ? '#14532d' : 'var(--bg-primary)',
                                        color: c.lead_score.total_score >= 70 ? '#f87171' : c.lead_score.total_score >= 40 ? '#4ade80' : 'var(--text-muted)',
                                        padding: '3px 10px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, flexShrink: 0,
                                    }}>
                                        {c.lead_score.total_score}
                                    </div>
                                )}
                                <span style={{ color: 'var(--text-muted)', fontSize: '18px' }}>›</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
