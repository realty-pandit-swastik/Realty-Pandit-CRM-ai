import React, { useState } from 'react';
import { convertLeadToPartner } from '../api/client';
import { useToast } from '../contexts/ToastContext';

interface Props {
    phone: string;
    defaultName?: string;
    /** Contact type of the lead. Drives the live-lead warning — see DEMAND_TYPES below. */
    contactType?: string | null;
    /** cold/warm/hot — shown in the warning so the cost of the mistake is obvious. */
    leadStatus?: string | null;
    onClose: () => void;
    onConverted: () => void;
}

// Converting one of these is almost always the accident: a real buyer/tenant being turned into a
// partner agent. 16 such contacts were found on prod on 2026-08-10, one of them a HOT buyer.
// Brokers and landlords convert legitimately, so they get no extra friction.
const DEMAND_TYPES = ['BUYER', 'TENANT'];

export function ConvertToPartnerModal({ phone, defaultName, contactType, leadStatus, onClose, onConverted }: Props) {
    const { showToast } = useToast();
    const [name, setName] = useState(defaultName || '');
    const [category, setCategory] = useState<'INDIVIDUAL' | 'COMPANY'>('INDIVIDUAL');
    const [companyName, setCompanyName] = useState('');
    const [saving, setSaving] = useState(false);
    const isLiveLead = DEMAND_TYPES.includes(String(contactType || '').toUpperCase());
    const [acknowledged, setAcknowledged] = useState(false);

    const submit = async () => {
        if (!name.trim()) { showToast('Name is required', 'error'); return; }
        if (isLiveLead && !acknowledged) { showToast('Please confirm you want to convert this live lead', 'error'); return; }
        setSaving(true);
        try {
            await convertLeadToPartner(phone, {
                name: name.trim(),
                partner_category: category,
                company_name: category === 'COMPANY' ? companyName.trim() : undefined,
            });
            showToast('Converted to Partner Agent', 'success');
            onConverted();
            onClose();
        } catch {
            showToast('Convert failed', 'error');
        } finally {
            setSaving(false);
        }
    };

    const input: React.CSSProperties = {
        padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-secondary)',
        backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13,
        outline: 'none', width: '100%', boxSizing: 'border-box',
    };

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 400 }} />
            <div style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                backgroundColor: 'var(--bg-primary)', borderRadius: 14, width: 420, maxWidth: '94vw',
                zIndex: 401, boxShadow: '0 20px 60px rgba(0,0,0,0.35)', padding: 20,
            }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🤝 Convert to Partner Agent</div>
                {/* Spell out what happens. The old copy was one grey line, and the form arrives
                    pre-filled and valid — so Convert was a single click away with no stated cost. */}
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>This will:</div>
                <ul style={{ margin: '0 0 14px', paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    <li>Register this contact as a <strong>partner agent</strong></li>
                    <li>Re-tag their <strong>open deals</strong> as partner deals</li>
                    <li><strong>Send them a WhatsApp</strong> welcoming them as a partner</li>
                </ul>

                {isLiveLead && (
                    <div style={{
                        border: '1px solid #ef4444', backgroundColor: 'rgba(239,68,68,0.08)',
                        borderRadius: 10, padding: '10px 12px', marginBottom: 14,
                    }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>
                            ⚠ This is a live {String(contactType).toUpperCase()} lead{leadStatus ? ` (status: ${String(leadStatus).toLowerCase()})` : ''}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 8 }}>
                            They are a customer, not a broker. Converting moves them out of your leads and
                            messages them as a partner — and the WhatsApp cannot be unsent.
                        </div>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--text-primary)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)}
                                style={{ marginTop: 2, cursor: 'pointer' }} />
                            <span>Yes, I'm sure — this contact really is a partner agent</span>
                        </label>
                    </div>
                )}

                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Name</label>
                <input style={{ ...input, margin: '4px 0 12px' }} value={name} onChange={e => setName(e.target.value)} placeholder="Partner agent name" />

                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Phone</label>
                <input style={{ ...input, margin: '4px 0 12px', opacity: 0.7 }} value={phone} readOnly />

                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    {(['INDIVIDUAL', 'COMPANY'] as const).map(c => (
                        <button key={c} type="button" onClick={() => setCategory(c)} style={{
                            flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            border: `1.5px solid ${category === c ? 'var(--accent-primary)' : 'var(--border-secondary)'}`,
                            backgroundColor: category === c ? 'rgba(37,99,235,0.08)' : 'transparent',
                            color: category === c ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        }}>{c === 'INDIVIDUAL' ? 'Individual' : 'Company'}</button>
                    ))}
                </div>

                {category === 'COMPANY' && (
                    <input style={{ ...input, marginBottom: 12 }} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Company name (optional)" />
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                    <button type="button" onClick={onClose} disabled={saving} style={{
                        padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        border: '1px solid var(--border-secondary)', backgroundColor: 'transparent', color: 'var(--text-secondary)',
                    }}>Cancel</button>
                    <button type="button" onClick={submit} disabled={saving || (isLiveLead && !acknowledged)} style={{
                        padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                        cursor: (isLiveLead && !acknowledged) ? 'not-allowed' : 'pointer',
                        border: 'none', backgroundColor: '#10b981', color: '#fff',
                        opacity: (saving || (isLiveLead && !acknowledged)) ? 0.5 : 1,
                    }}>{saving ? 'Converting…' : 'Convert'}</button>
                </div>
            </div>
        </>
    );
}
