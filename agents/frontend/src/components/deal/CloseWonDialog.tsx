import { useState } from 'react';

/**
 * Close-Won dialog (NEG-2, 2026-06-22). Prompts for the agreed final price when a deal is marked
 * CLOSED_WON, so revenue reports (which read Transaction.final_price) reflect reality instead of ₹0.
 * Price is optional — leaving it blank closes the deal without a price (same as the old behaviour),
 * but the field makes capturing it the default. Shared by the board (drag + card button) and the
 * deal workspace Stage Actions.
 */
export default function CloseWonDialog({ open, dealLabel, submitting, onConfirm, onClose }: {
    open: boolean;
    dealLabel?: string;
    submitting?: boolean;
    onConfirm: (finalPrice?: number) => void;
    onClose: () => void;
}) {
    const [price, setPrice] = useState('');
    if (!open) return null;

    const cleaned = price.replace(/[,\s₹]/g, '');
    const parsed = cleaned === '' ? undefined : Number(cleaned);
    const invalid = parsed !== undefined && (!isFinite(parsed) || parsed <= 0);

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseDown={e => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
            <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: '14px', padding: '24px', width: '420px', maxWidth: '90vw' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>✅ Close Deal as Won</div>
                {dealLabel && (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '18px' }}>{dealLabel}</div>
                )}

                <div style={{ marginBottom: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                        Agreed price (₹)
                    </label>
                    <input
                        type="number" inputMode="numeric" autoFocus
                        value={price} onChange={e => setPrice(e.target.value)}
                        placeholder="e.g. 5000000"
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', border: `1px solid ${invalid ? '#ef4444' : 'var(--border-secondary)'}`, backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}
                    />
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 18px' }}>
                    {invalid ? 'Enter a positive amount, or leave blank.' : 'Recorded as the deal’s final price for revenue reporting. Leave blank if not known yet.'}
                </p>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={onClose} disabled={submitting}
                        style={{ flex: 1, padding: '10px', borderRadius: '8px', fontWeight: 600, border: '1px solid var(--border-secondary)', backgroundColor: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        Cancel
                    </button>
                    <button onClick={() => onConfirm(parsed)} disabled={submitting || invalid}
                        style={{ flex: 1, padding: '10px', borderRadius: '8px', fontWeight: 700, backgroundColor: (submitting || invalid) ? 'var(--bg-secondary)' : '#22c55e', color: (submitting || invalid) ? 'var(--text-muted)' : '#fff', border: 'none', cursor: (submitting || invalid) ? 'not-allowed' : 'pointer' }}>
                        {submitting ? 'Saving…' : 'Mark Won'}
                    </button>
                </div>
            </div>
        </div>
    );
}
