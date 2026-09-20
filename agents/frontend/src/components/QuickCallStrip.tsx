import { useState } from 'react';
import { toDialablePhone } from '../lib/phone';

interface Person {
    name: string;
    phone: string;
    role: string;
}

interface QuickCallStripProps {
    lead?: { name: string; phone: string } | null;
    coordinator?: { name: string; phone: string } | null;
    owner?: { name: string; phone: string } | null;
    keyHolder?: { name: string; phone: string } | null;
    stage: string;
}

// Stage rules: which contacts are relevant at each stage
const SHOW_OWNER_FROM = ['MATCHING_APPOINTMENT', 'VISIT_SCHEDULED', 'VISITED', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST', 'ON_HOLD'];
const SHOW_KEYHOLDER_IN = ['VISIT_SCHEDULED'];

export function QuickCallStrip({ lead, coordinator, owner, keyHolder, stage }: QuickCallStripProps) {
    const [expanded, setExpanded] = useState(false);

    const people: Person[] = [];
    if (lead?.phone)        people.push({ ...lead,        role: 'Lead' });
    if (coordinator?.phone) people.push({ ...coordinator, role: 'Manager' });
    if (owner?.phone && SHOW_OWNER_FROM.includes(stage))              people.push({ ...owner,      role: 'Owner' });
    if (keyHolder?.phone && SHOW_KEYHOLDER_IN.includes(stage))        people.push({ ...keyHolder,  role: 'Key Holder' });

    if (people.length === 0) return null;

    // Build links only from a canonical, country-coded number — never a raw/placeholder value.
    const handleCall = (phone: string) => { const d = toDialablePhone(phone); if (d) window.location.assign(`tel:${d}`); };
    const handleWA   = (phone: string) => { const d = toDialablePhone(phone); if (d) window.open(`https://wa.me/${d.slice(1)}`, '_blank'); };

    if (!expanded) {
        return (
            <div
                style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
                    borderTop: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                    flexWrap: 'wrap',
                }}
                onClick={() => setExpanded(true)}
                title="Tap to see contact numbers"
            >
                <span style={{ fontSize: 11, color: '#9ca3af', marginRight: 2 }}>📞</span>
                {people.map(p => (
                    <span key={p.phone} style={{
                        fontSize: 11, background: 'rgba(255,255,255,0.07)', borderRadius: 10,
                        padding: '2px 7px', color: '#d1d5db',
                    }}>{p.role}</span>
                ))}
                <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 'auto' }}>▾</span>
            </div>
        );
    }

    return (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '6px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>Contacts</span>
                <span
                    style={{ fontSize: 11, color: '#6b7280', cursor: 'pointer' }}
                    onClick={() => setExpanded(false)}
                >▴ collapse</span>
            </div>
            {people.map(p => {
                const dialable = !!toDialablePhone(p.phone);
                return (
                <div key={p.phone} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                    <span style={{ fontSize: 11, color: '#9ca3af', width: 64, flexShrink: 0 }}>{p.role}</span>
                    <span style={{ fontSize: 12, color: '#e5e7eb', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    {dialable ? (
                        <>
                            <button
                                onClick={() => handleCall(p.phone)}
                                style={{
                                    background: 'rgba(34,197,94,0.15)', border: 'none', borderRadius: 8,
                                    color: '#22c55e', fontSize: 13, padding: '3px 8px', cursor: 'pointer',
                                }}
                                title={`Call ${p.name}`}
                            >📞</button>
                            <button
                                onClick={() => handleWA(p.phone)}
                                style={{
                                    background: 'rgba(37,211,102,0.12)', border: 'none', borderRadius: 8,
                                    color: '#25d366', fontSize: 13, padding: '3px 8px', cursor: 'pointer',
                                }}
                                title={`WhatsApp ${p.name}`}
                            >💬</button>
                        </>
                    ) : (
                        <span style={{ fontSize: 10, color: '#6b7280', fontStyle: 'italic' }}>no phone</span>
                    )}
                </div>
                );
            })}
        </div>
    );
}
