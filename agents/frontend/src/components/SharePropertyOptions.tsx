import { useState } from 'react';
import client from '../api/client';

interface ShareableItem {
    id: string;
    display_id?: string | null;
    location?: string | null;
    locality?: string | null;
    type?: string | null;
}

interface Props {
    item: ShareableItem;
    onClose: () => void;
    onWhatsAppChosen: () => void; // open existing ShareToClientModal
}

/**
 * 3-option share popover for Inventory + Deal cards.
 *  📄 PDF      → reveals {With branding / Without branding} sub-row → downloads PDF
 *  💬 WhatsApp → close popover + open existing ShareToClientModal
 *  🔗 Link     → fetch share link, copy to clipboard
 *
 * Minimal UI: single horizontal row of icon buttons, PDF expands a small sub-row.
 */
export default function SharePropertyOptions({ item, onClose, onWhatsAppChosen }: Props) {
    const [pdfMode, setPdfMode] = useState<'idle' | 'choose' | 'generating'>('idle');
    const [linkBusy, setLinkBusy] = useState(false);
    const [copiedLink, setCopiedLink] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const propertyLabel = item.display_id || item.locality || item.location || 'this property';

    const downloadPdf = async (variant: 'branded' | 'brandless') => {
        try {
            setPdfMode('generating');
            setError(null);
            const res = await client.post('/api/inventory/share-pdf',
                { inventory_ids: [item.id], variant },
                { responseType: 'blob' }
            );
            const blob = new Blob([res.data], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `realty-pandit-${variant}-${item.display_id || item.id.slice(0, 8)}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setTimeout(onClose, 300);
        } catch (err: any) {
            setError(err?.response?.data?.error || err.message || 'Failed to generate PDF');
            setPdfMode('choose');
        }
    };

    const copyLink = async () => {
        try {
            setLinkBusy(true);
            setError(null);
            const res = await client.get(`/api/inventory/${item.id}/share-link`);
            const link = res.data?.share_link;
            if (!link) throw new Error('No link returned');
            await navigator.clipboard.writeText(link);
            setCopiedLink(link);
            setTimeout(onClose, 1500);
        } catch (err: any) {
            setError(err?.response?.data?.error || err.message || 'Failed to copy link');
        } finally {
            setLinkBusy(false);
        }
    };

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                backgroundColor: 'rgba(0,0,0,0.55)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}
            onClick={onClose}
        >
            <div
                role="dialog"
                onClick={e => e.stopPropagation()}
                style={{
                    width: '100%', maxWidth: 380,
                    backgroundColor: 'var(--bg-primary, #0f172a)',
                    border: '1px solid var(--border-secondary, #334155)',
                    borderRadius: 14, padding: 18,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Share property</div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{propertyLabel}</div>

                {/* Main 3-option row */}
                {pdfMode === 'idle' && !copiedLink && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                        <ShareOption
                            icon="📄" label="PDF"
                            onClick={() => setPdfMode('choose')}
                        />
                        <ShareOption
                            icon="💬" label="WhatsApp"
                            onClick={() => { onWhatsAppChosen(); onClose(); }}
                        />
                        <ShareOption
                            icon="🔗" label={linkBusy ? '...' : 'Link'}
                            disabled={linkBusy}
                            onClick={copyLink}
                        />
                    </div>
                )}

                {/* PDF branding sub-row */}
                {pdfMode === 'choose' && (
                    <div style={{ marginTop: 6 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Generate as:</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <ShareOption icon="🏢" label="With branding" sublabel="RP logo + your contact"
                                onClick={() => downloadPdf('branded')} />
                            <ShareOption icon="🕶️" label="No branding" sublabel="Locality only, no contact"
                                onClick={() => downloadPdf('brandless')} />
                        </div>
                        <button onClick={() => setPdfMode('idle')}
                            style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            ← back
                        </button>
                    </div>
                )}

                {pdfMode === 'generating' && (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                        Generating PDF…
                    </div>
                )}

                {copiedLink && (
                    <div style={{
                        padding: '12px 14px', borderRadius: 10,
                        backgroundColor: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
                        color: '#22c55e', fontSize: 12, textAlign: 'center',
                    }}>
                        ✓ Link copied to clipboard
                        <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-muted)', wordBreak: 'break-all' }}>{copiedLink}</div>
                    </div>
                )}

                {error && (
                    <div style={{
                        marginTop: 10, padding: '8px 12px', borderRadius: 8,
                        backgroundColor: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                        color: '#ef4444', fontSize: 12,
                    }}>{error}</div>
                )}
            </div>
        </div>
    );
}

function ShareOption({ icon, label, sublabel, onClick, disabled }: {
    icon: string; label: string; sublabel?: string; onClick: () => void; disabled?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            style={{
                padding: '14px 8px',
                borderRadius: 10,
                border: '1px solid var(--border-secondary, #334155)',
                backgroundColor: 'var(--bg-secondary, #1e293b)',
                color: 'var(--text-primary)',
                cursor: disabled ? 'wait' : 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                opacity: disabled ? 0.5 : 1,
                transition: 'border-color 0.15s, background-color 0.15s',
            }}
            onMouseEnter={e => { if (!disabled) e.currentTarget.style.borderColor = 'var(--text-link, #3b82f6)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-secondary, #334155)'; }}
        >
            <span style={{ fontSize: 22 }}>{icon}</span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
            {sublabel && <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.3 }}>{sublabel}</span>}
        </button>
    );
}
