import { useState } from 'react';
import { toDialablePhone } from '../lib/phone';
import { PresentationIcon } from './ui/PresentationIcon';

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
                    borderTop: '1px solid var(--border-primary)', cursor: 'pointer',
                    flexWrap: 'wrap',
                }}
                onClick={() => setExpanded(true)}
                title="Tap to see contact numbers"
            >
                <span style={{ color: 'var(--text-secondary)', marginRight: 4 }}><PresentationIcon value="phone" /></span>
                {people.map(p => (
                    <span key={p.phone} style={{
                        fontSize: 12, background: 'var(--bg-primary)', borderRadius: 'var(--radius-control)',
                        padding: '4px 8px', color: 'var(--text-secondary)',
                    }}>{p.role}</span>
                ))}
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 'auto' }}>▾</span>
            </div>
        );
    }

    return (
        <div style={{ borderTop: '1px solid var(--border-primary)', padding: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Contacts</span>
                <span
                    style={{ fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}
                    onClick={() => setExpanded(false)}
                >▴ collapse</span>
            </div>
            {people.map(p => {
                const dialable = !!toDialablePhone(p.phone);
                return (
                <div key={p.phone} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 0', borderBottom: '1px solid var(--border-primary)',
                }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 64, flexShrink: 0 }}>{p.role}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    {dialable ? (
                        <>
                            <button
                                onClick={() => handleCall(p.phone)}
                                style={{
                                    background: 'var(--rp-info-bg)', border: '1px solid var(--control-line)', borderRadius: 'var(--radius-control)',
                                    color: 'var(--rp-info-text)', fontSize: 13, padding: '8px', minWidth: 44, minHeight: 44, cursor: 'pointer',
                                }}
                                title={`Call ${p.name}`}
                            ><PresentationIcon value="phone" /></button>
                            <button
                                onClick={() => handleWA(p.phone)}
                                style={{
                                    background: 'var(--rp-info-bg)', border: '1px solid var(--control-line)', borderRadius: 'var(--radius-control)',
                                    color: 'var(--rp-info-text)', fontSize: 13, padding: '8px', minWidth: 44, minHeight: 44, cursor: 'pointer',
                                }}
                                title={`WhatsApp ${p.name}`}
                            ><PresentationIcon value="message-circle" /></button>
                        </>
                    ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>no phone</span>
                    )}
                </div>
                );
            })}
        </div>
    );
}
