import React, { useState } from 'react';
import { revertPartnerToCustomer } from '../api/client';
import { useToast } from '../contexts/ToastContext';

interface Props {
    partnerId: string;
    partnerName: string;
    phone: string;
    onClose: () => void;
    onReverted: () => void;
}

/**
 * Undo an accidental lead -> partner conversion (2026-08-10).
 *
 * Mirrors TeamDeactivateDialog: say plainly what will change, then confirm. The backend refuses with
 * 409 when the partner has referred inventory, commission entries or sub-agents — that message is
 * surfaced verbatim rather than collapsed into "failed", because it tells the user what to fix.
 */
export const RevertToCustomerDialog: React.FC<Props> = ({ partnerId, partnerName, phone, onClose, onReverted }) => {
    const { showToast } = useToast();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            const r = await revertPartnerToCustomer(partnerId);
            showToast(`${partnerName} is a customer again (${r?.restored_contact_type || 'restored'})`, 'success');
            onReverted();
            onClose();
        } catch (e: any) {
            // 409 = blocked by attached records. Keep the server's wording; it names the blocker.
            setError(e?.response?.data?.error || 'Could not revert this partner agent.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 400 }} />
            <div style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                backgroundColor: 'var(--bg-primary)', borderRadius: 14, width: 440, maxWidth: '94vw',
                zIndex: 401, boxShadow: '0 20px 60px rgba(0,0,0,0.35)', padding: 20,
            }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                    ↩ Revert to customer
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
                    <strong>{partnerName}</strong> · {phone}
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>This will:</div>
                <ul style={{ margin: '0 0 14px', paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    <li>Remove them from the <strong>Partner Agents</strong> list</li>
                    <li>Restore their contact type so they appear as a normal customer</li>
                    <li>Put their partner-tagged deals back to <strong>direct</strong> deals</li>
                    <li>Revoke partner login access</li>
                </ul>

                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 14 }}>
                    The record is kept for audit — it is deactivated, not deleted. The welcome WhatsApp
                    they already received cannot be recalled.
                </div>

                {error && (
                    <div style={{
                        border: '1px solid #ef4444', backgroundColor: 'rgba(239,68,68,0.08)',
                        borderRadius: 10, padding: '10px 12px', marginBottom: 14,
                        fontSize: 12, color: '#ef4444',
                    }}>{error}</div>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={onClose} disabled={busy} style={{
                        padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        border: '1px solid var(--border-secondary)', backgroundColor: 'transparent', color: 'var(--text-secondary)',
                    }}>Cancel</button>
                    <button type="button" onClick={submit} disabled={busy} style={{
                        padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        border: 'none', backgroundColor: '#f97316', color: '#fff', opacity: busy ? 0.5 : 1,
                    }}>{busy ? 'Reverting…' : 'Revert to customer'}</button>
                </div>
            </div>
        </>
    );
};
