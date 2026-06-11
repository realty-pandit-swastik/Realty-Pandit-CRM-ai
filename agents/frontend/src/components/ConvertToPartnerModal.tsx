import React, { useState } from 'react';
import { convertLeadToPartner } from '../api/client';
import { useToast } from '../contexts/ToastContext';

interface Props {
    phone: string;
    defaultName?: string;
    onClose: () => void;
    onConverted: () => void;
}

export function ConvertToPartnerModal({ phone, defaultName, onClose, onConverted }: Props) {
    const { showToast } = useToast();
    const [name, setName] = useState(defaultName || '');
    const [category, setCategory] = useState<'INDIVIDUAL' | 'COMPANY'>('INDIVIDUAL');
    const [companyName, setCompanyName] = useState('');
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        if (!name.trim()) { showToast('Name is required', 'error'); return; }
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
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
                    Registers this contact as a partner agent and re-tags their open deal(s) as partner deals.
                </div>

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
                    <button type="button" onClick={submit} disabled={saving} style={{
                        padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        border: 'none', backgroundColor: '#10b981', color: '#fff',
                    }}>{saving ? 'Converting…' : 'Convert'}</button>
                </div>
            </div>
        </>
    );
}
