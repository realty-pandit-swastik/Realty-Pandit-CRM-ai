import { useState } from 'react';
import { shareToClient } from '../api/client';
import ShareContentPicker, { DEFAULT_SHARE_CONTENT } from './ShareContentPicker';

interface ShareToClientModalProps {
    item: any;
    onClose: () => void;
    onShared: () => void;
}

export default function ShareToClientModal({ item, onClose, onShared }: ShareToClientModalProps) {
    const [phone, setPhone] = useState('');
    const [clientName, setClientName] = useState('');
    const [content, setContent] = useState(DEFAULT_SHARE_CONTENT);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<{ share_link: string; whatsapp_sent: boolean; media_pending?: number; pdf_requested?: boolean; pdf_sent?: boolean; already_shared?: boolean; previously_shared_at?: string | null } | null>(null);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    const isMobile = window.innerWidth < 768;

    const handleSubmit = async () => {
        if (!phone || phone.length < 10) {
            setError('Enter a valid phone number');
            return;
        }
        setSending(true);
        setError('');
        try {
            const res = await shareToClient(item.id, { client_phone: phone, client_name: clientName || undefined, content });
            setResult(res);
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Failed to share property');
        } finally {
            setSending(false);
        }
    };

    const handleCopy = async () => {
        if (result?.share_link) {
            await navigator.clipboard.writeText(result.share_link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const specs = item.specs as any;
    const price = item.display_price || item.price;
    const typeName = item.flat_property_type?.name || item.type?.toUpperCase() || 'Property';

    const s = {
        overlay: {
            position: 'fixed' as const, inset: 0, backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        },
        modal: {
            backgroundColor: 'var(--bg-secondary)', borderRadius: isMobile ? '12px 12px 0 0' : '12px',
            padding: isMobile ? '20px 16px' : '28px',
            width: isMobile ? '100%' : '440px', maxWidth: '90vw',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            maxHeight: isMobile ? '90vh' : undefined, overflowY: 'auto' as const,
        },
        title: { color: 'var(--text-primary)', fontSize: '18px', fontWeight: 700, margin: '0 0 16px' },
        label: { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px', display: 'block' },
        input: {
            width: '100%', padding: '8px 12px', borderRadius: '6px',
            border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)', fontSize: '14px', marginBottom: '12px',
            boxSizing: 'border-box' as const,
        },
        btnPrimary: {
            backgroundColor: '#22c55e', color: '#fff', border: 'none',
            padding: '10px 20px', borderRadius: '8px', cursor: 'pointer',
            fontSize: '14px', fontWeight: 600, width: '100%',
        },
        btnRow: { display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' },
        cancelBtn: {
            background: 'var(--border-secondary)', border: 'none', color: 'var(--text-secondary)',
            padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
        },
        propertyPreview: {
            backgroundColor: 'var(--bg-primary)', borderRadius: '8px', padding: '12px',
            marginBottom: '16px', border: '1px solid var(--border-secondary)',
        },
        resultBox: {
            backgroundColor: 'var(--bg-primary)', borderRadius: '8px', padding: '16px',
            border: '1px solid var(--border-secondary)', marginTop: '12px',
        },
        copyRow: {
            display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px',
        },
        linkInput: {
            flex: 1, padding: '8px 12px', borderRadius: '6px',
            border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-link)', fontSize: '13px',
        },
        copyBtn: {
            backgroundColor: '#3b82f6', color: '#fff', border: 'none',
            padding: '8px 14px', borderRadius: '6px', cursor: 'pointer',
            fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap' as const,
        },
    };

    return (
        <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
            <div style={s.modal}>
                <h3 style={s.title}>Share Property to Client</h3>

                {/* Property Preview */}
                <div style={s.propertyPreview}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                        {typeName}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {item.full_address || item.location || 'Location N/A'}
                        {specs?.bedrooms ? ` | ${specs.bedrooms} BHK` : ''}
                        {price ? ` | ₹${Number(price) >= 10000000 ? (Number(price) / 10000000).toFixed(1) + ' Cr' : Number(price) >= 100000 ? (Number(price) / 100000).toFixed(1) + ' Lakh' : Number(price).toLocaleString('en-IN')}` : ''}
                    </div>
                    {item.display_id && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            ID: {item.display_id}
                        </div>
                    )}
                </div>

                {!result ? (
                    <>
                        <label style={s.label}>Client Phone Number *</label>
                        <input
                            style={s.input}
                            type="tel"
                            placeholder="Enter 10-digit phone number"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            maxLength={13}
                            autoFocus
                        />

                        <label style={s.label}>Client Name (optional)</label>
                        <input
                            style={s.input}
                            type="text"
                            placeholder="Client name"
                            value={clientName}
                            onChange={e => setClientName(e.target.value)}
                        />

                        <ShareContentPicker value={content} onChange={setContent} disabled={sending} />

                        {error && (
                            <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '12px' }}>
                                {error}
                            </div>
                        )}

                        <div style={s.btnRow}>
                            <button style={s.cancelBtn} onClick={onClose}>Cancel</button>
                            <button
                                style={{ ...s.btnPrimary, width: 'auto', opacity: sending ? 0.6 : 1 }}
                                disabled={sending}
                                onClick={handleSubmit}
                            >
                                {sending ? 'Sending...' : 'Send via WhatsApp'}
                            </button>
                        </div>
                    </>
                ) : (
                    <div style={s.resultBox}>
                        {/* WhatsApp Status */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            <span style={{ fontSize: '20px' }}>{result.whatsapp_sent ? '✅' : '⚠️'}</span>
                            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                                {result.whatsapp_sent
                                    ? 'Property sent via WhatsApp!'
                                    : 'WhatsApp delivery pending (client may need to message first)'}
                            </span>
                        </div>

                        {!!result.media_pending && (
                            <div style={{ color: '#f59e0b', marginBottom: '12px' }}>
                                {result.media_pending} attachment(s) pending. They will retry when the client messages us.
                                <button disabled={sending} onClick={async () => {
                                    setSending(true); setError('');
                                    try { setResult(await shareToClient(item.id, { client_phone: phone, retry_media: true })); }
                                    catch { setError('Could not retry attachments'); }
                                    finally { setSending(false); }
                                }}>{sending ? 'Retrying…' : 'Retry pending attachments'}</button>
                            </div>
                        )}
                        {error && <div role="alert">{error}</div>}
                        {result.pdf_requested && !result.pdf_sent && (
                            <div style={{ fontSize: '12px', color: '#f59e0b', marginBottom: '12px' }}>
                                ⚠ PDF could not be delivered — try sharing again with PDF ticked.
                            </div>
                        )}

                        {/* Non-blocking re-share notice (the send still went out). */}
                        {result.already_shared && (
                            <div style={{ fontSize: '12px', color: '#f59e0b', marginBottom: '12px' }}>
                                ⚠ Previously shared with this client{result.previously_shared_at ? ` on ${new Date(result.previously_shared_at).toLocaleDateString('en-IN')}` : ''} — re-sent now.
                            </div>
                        )}

                        {/* Copyable Link */}
                        <label style={s.label}>Property Link — share via any channel</label>
                        <div style={s.copyRow}>
                            <input
                                style={s.linkInput}
                                value={result.share_link}
                                readOnly
                                onClick={e => (e.target as HTMLInputElement).select()}
                            />
                            <button style={s.copyBtn} onClick={handleCopy}>
                                {copied ? 'Copied!' : 'Copy'}
                            </button>
                        </div>

                        <div style={{ ...s.btnRow, marginTop: '20px' }}>
                            <button style={s.cancelBtn} onClick={() => { onShared(); }}>Done</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
