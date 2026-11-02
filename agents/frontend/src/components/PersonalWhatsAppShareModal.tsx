import { useEffect, useRef, useState } from 'react';
import client from '../api/client';
import { toDialablePhone } from '../lib/phone';
import { buildWhatsAppShareText } from '../lib/buildWhatsAppShareText';
import {
    propertyAttachments, orderedPropertyAttachments,
    EMPTY_ATTACHMENT_SELECTION, MAX_PERSONAL_SHARE_BYTES,
    isAndroidDevice, validatePersonalWhatsAppFile,
    type AttachmentSelection, type PropertyAttachment
} from '../lib/personalWhatsAppFiles';
import { ContactSearchField } from './ContactSearchField';
import './PersonalWhatsAppShareModal.css';

interface ShareInventory {
    id: string;
    display_id?: string;
    media_urls?: string[];
    video_urls?: string[];
    locality?: string;
    location?: string;
    type?: string;
    intent?: string;
    price?: number | string;
    display_price?: number | string;
    flat_property_type?: { name: string };
    specs?: Record<string, any>;
    city?: string;
    apartment_name?: string;
}

interface Props {
    inventoryIds: string[];
    initialPhone?: string | null;
    initialName?: string | null;
    onClose: () => void;
    onSent?: () => void;
}

export default function PersonalWhatsAppShareModal({ inventoryIds, initialPhone, initialName, onClose, onSent }: Props) {
    const idsKey = inventoryIds.join(',');
    const [inventories, setInventories] = useState<ShareInventory[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [phone, setPhone] = useState(initialPhone || '');
    const [recipientName, setRecipientName] = useState(initialName || '');

    // Per-inventory media selections: urls[], firstPhoto, pdf boolean, pdfVariant
    const [selections, setSelections] = useState<Record<string, AttachmentSelection>>({});
    const [pdfVariants, setPdfVariants] = useState<Record<string, 'brandless' | 'branded'>>({});

    const [detailsSent, setDetailsSent] = useState(false);
    const [preparingMedia, setPreparingMedia] = useState(false);
    const [progressText, setProgressText] = useState('');
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const panel = useRef<HTMLDivElement>(null);
    const active = useRef(true);
    const apiBase = client.defaults.baseURL || window.location.origin;
    const isAndroid = typeof navigator !== 'undefined' && isAndroidDevice(navigator.userAgent);
    const hasWebShareFiles = typeof navigator !== 'undefined' && !!navigator.share && !!navigator.canShare;

    useEffect(() => {
        let alive = true;
        setLoading(true);
        setLoadError('');

        Promise.all(idsKey.split(',').filter(Boolean).map(async id => {
            const response = await client.get(`/api/inventory/${encodeURIComponent(id)}`);
            return (response.data?.data ?? response.data) as ShareInventory;
        })).then(items => {
            if (!alive) return;
            setInventories(items);

            // Initialize selections: select all media by default for convenience
            const initSelections: Record<string, AttachmentSelection> = {};
            const initVariants: Record<string, 'brandless' | 'branded'> = {};
            items.forEach(inv => {
                const attachments = propertyAttachments(inv, apiBase);
                const allUrls = attachments.map(a => a.url);
                const firstImg = attachments.find(a => a.kind === 'image')?.url || '';
                initSelections[inv.id] = {
                    urls: allUrls,
                    firstPhoto: firstImg,
                    pdf: true,
                };
                initVariants[inv.id] = 'brandless';
            });
            setSelections(initSelections);
            setPdfVariants(initVariants);
            setLoading(false);
        }).catch(err => {
            if (!alive) return;
            setLoadError(err?.response?.data?.error || 'Could not load property details. Close and retry.');
            setLoading(false);
        });

        return () => { alive = false; };
    }, [idsKey, apiBase]);

    useEffect(() => {
        active.current = true;
        panel.current?.focus();
        return () => { active.current = false; };
    }, []);

    // Toggle specific media file
    const toggleMediaUrl = (invId: string, url: string, attachments: PropertyAttachment[]) => {
        const cur = selections[invId] || EMPTY_ATTACHMENT_SELECTION;
        const exists = cur.urls.includes(url);
        const nextUrls = exists ? cur.urls.filter(u => u !== url) : [...cur.urls, url];
        const nextFirst = nextUrls.includes(cur.firstPhoto)
            ? cur.firstPhoto
            : attachments.find(a => a.kind === 'image' && nextUrls.includes(a.url))?.url || '';

        setSelections(prev => ({
            ...prev,
            [invId]: { ...cur, urls: nextUrls, firstPhoto: nextFirst }
        }));
    };

    // Select all / none for a property
    const toggleSelectAllMedia = (invId: string, attachments: PropertyAttachment[]) => {
        const cur = selections[invId] || EMPTY_ATTACHMENT_SELECTION;
        const allUrls = attachments.map(a => a.url);
        const shouldSelectAll = cur.urls.length < allUrls.length;

        setSelections(prev => ({
            ...prev,
            [invId]: {
                ...cur,
                urls: shouldSelectAll ? allUrls : [],
                firstPhoto: shouldSelectAll ? (attachments.find(a => a.kind === 'image')?.url || '') : ''
            }
        }));
    };

    // Toggle PDF
    const togglePdf = (invId: string, checked: boolean) => {
        const cur = selections[invId] || EMPTY_ATTACHMENT_SELECTION;
        setSelections(prev => ({
            ...prev,
            [invId]: { ...cur, pdf: checked }
        }));
    };

    // Build the share text
    const getFormattedShareText = () => {
        if (!inventories.length) return '';
        const items = inventories.map(inv => ({ inv, link: '' }));
        return buildWhatsAppShareText(items, 'dealer').replace(/https?:\/\/\S+/gi, '').trim();
    };

    // Normalize phone number for wa.me
    const getCleanPhone = () => {
        if (!phone) return null;
        let clean = toDialablePhone(phone)?.replace(/^\+/, '') || phone.replace(/\D/g, '');
        if (clean.length === 10) clean = '91' + clean;
        return clean;
    };

    // Total selected count
    const totalMediaSelected = Object.values(selections).reduce((acc, s) => acc + s.urls.length, 0);
    const totalPdfSelected = Object.values(selections).filter(s => s.pdf).length;

    // ─────────────────────────────────────────────────────────────
    // BUTTON 1: Just send property details to the person on WhatsApp
    // ─────────────────────────────────────────────────────────────
    const handleSendDetails = () => {
        setError('');
        const cleanPhone = getCleanPhone();
        if (!cleanPhone) {
            setError('Please enter or select a recipient phone number first.');
            return;
        }

        const text = getFormattedShareText();
        if (!text) {
            setError('No property details available to send.');
            return;
        }

        const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
        window.open(waUrl, '_blank');
        setDetailsSent(true);
        setSuccessMessage(`✓ Property details opened in WhatsApp for +${cleanPhone}! Tap Send inside WhatsApp, then tap Button 2 below to send media.`);
    };

    // ─────────────────────────────────────────────────────────────
    // BUTTON 2: Send selected media, videos, or property PDF via Android Share Sheet
    // ─────────────────────────────────────────────────────────────
    const handleShareMediaSheet = async () => {
        setError('');
        setSuccessMessage('');

        if (totalMediaSelected === 0 && totalPdfSelected === 0) {
            setError('Please select at least one photo, video, or the PDF brochure to share.');
            return;
        }

        setPreparingMedia(true);
        setProgressText('Preparing files for Android Share Sheet…');

        try {
            const filesToShare: File[] = [];
            let totalBytes = 0;

            for (const inv of inventories) {
                const sel = selections[inv.id] || EMPTY_ATTACHMENT_SELECTION;
                const attachments = propertyAttachments(inv, apiBase);
                const ordered = orderedPropertyAttachments(attachments, sel);
                const namePrefix = `property-${(inv.display_id || inv.id).replace(/[^a-zA-Z0-9-]/g, '')}`;

                // 1. Download selected images & videos
                for (let i = 0; i < ordered.length; i++) {
                    const item = ordered[i];
                    setProgressText(`Downloading ${item.label} (${i + 1}/${ordered.length})…`);

                    const resp = await fetch(item.url, {
                        credentials: new URL(item.url, window.location.href).origin === window.location.origin ? 'include' : 'omit',
                        signal: AbortSignal.timeout(60_000)
                    });

                    if (!resp.ok) throw new Error(`Could not load ${item.label}. Nothing was shared.`);
                    const blob = await resp.blob();
                    totalBytes += blob.size;
                    if (totalBytes > MAX_PERSONAL_SHARE_BYTES) {
                        throw new Error('Selected media exceeds 40 MB total limit. Please deselect a few files.');
                    }
                    validatePersonalWhatsAppFile(blob, item.kind, item.label);

                    const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg').replace('quicktime', 'mov') || (item.kind === 'video' ? 'mp4' : 'jpg');
                    const file = new File([blob], `${namePrefix}-${i + 1}.${ext}`, { type: blob.type || (item.kind === 'video' ? 'video/mp4' : 'image/jpeg') });
                    filesToShare.push(file);
                }

                // 2. Generate PDF if selected
                if (sel.pdf) {
                    setProgressText('Generating property brochure PDF…');
                    const variant = pdfVariants[inv.id] || 'brandless';
                    const pdfResp = await client.post('/api/inventory/share-pdf', {
                        inventory_ids: [inv.id],
                        variant
                    }, { responseType: 'blob' });

                    const pdfBlob = new Blob([pdfResp.data], { type: 'application/pdf' });
                    totalBytes += pdfBlob.size;
                    if (totalBytes > MAX_PERSONAL_SHARE_BYTES) {
                        throw new Error('Selected files with PDF exceed 40 MB. Please deselect some photos.');
                    }
                    validatePersonalWhatsAppFile(pdfBlob, 'document', 'brochure.pdf');
                    const pdfFile = new File([pdfBlob], `${namePrefix}-brochure.pdf`, { type: 'application/pdf' });
                    filesToShare.push(pdfFile);
                }
            }

            if (!filesToShare.length) {
                throw new Error('No files ready to share.');
            }

            setProgressText('Opening Android Share Sheet…');

            // Check Web Share API with files support
            if (navigator.share && navigator.canShare && navigator.canShare({ files: filesToShare })) {
                await navigator.share({
                    files: filesToShare,
                    title: inventories[0]?.display_id ? `Property ${inventories[0].display_id}` : 'Property Media',
                });
                setSuccessMessage('✓ Handed off to Share Sheet! Select WhatsApp and tap the contact you previously sent details to.');
                onSent?.();
            } else if (navigator.share) {
                // Device supports share but not this specific batch of files — try sharing media first
                await navigator.share({
                    files: filesToShare.slice(0, 10),
                    title: 'Property Media',
                });
                setSuccessMessage('✓ Handed off to Share Sheet!');
                onSent?.();
            } else {
                // Fallback for desktop or browsers without navigator.share
                // Download the files for the user
                filesToShare.forEach(f => {
                    const url = URL.createObjectURL(f);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = f.name;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                });
                setSuccessMessage(`✓ Downloaded ${filesToShare.length} file(s). You can attach them directly in WhatsApp Web.`);
            }
        } catch (err: any) {
            if (err?.name === 'AbortError') {
                setProgressText('Share cancelled. Files remain ready.');
            } else {
                setError(err?.message || 'Failed to prepare or share media.');
            }
        } finally {
            setPreparingMedia(false);
            setProgressText('');
        }
    };

    const handleCopyDetails = async () => {
        try {
            await navigator.clipboard.writeText(getFormattedShareText());
            setSuccessMessage('✓ Property details copied to clipboard!');
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch {
            setError('Failed to copy to clipboard.');
        }
    };

    return (
        <div className="personal-wa-overlay" onClick={e => e.target === e.currentTarget && !preparingMedia && onClose()}>
            <div
                className="personal-wa-panel"
                ref={panel}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="personal-wa-title"
                style={{
                    maxWidth: '680px',
                    width: '100%',
                    backgroundColor: 'var(--bg-primary, #0f172a)',
                    border: '1px solid var(--border-secondary, #334155)',
                    borderRadius: '16px',
                    boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '92vh',
                    overflow: 'hidden',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border-secondary, #334155)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexShrink: 0,
                    backgroundColor: 'var(--bg-secondary, #1e293b)'
                }}>
                    <div>
                        <h2 id="personal-wa-title" style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>📱</span> My WhatsApp Share
                        </h2>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', marginTop: '2px' }}>
                            Send property details first, then share photos, videos & PDF via Android Share Sheet
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={preparingMedia}
                        style={{
                            background: 'none', border: 'none', color: 'var(--text-muted, #94a3b8)',
                            fontSize: '22px', cursor: 'pointer', padding: '4px 8px', lineHeight: 1
                        }}
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                {/* Body (scrollable) */}
                <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    {/* Recipient Section */}
                    <div style={{
                        backgroundColor: 'var(--bg-secondary, #1e293b)',
                        borderRadius: '12px',
                        padding: '14px 16px',
                        border: '1px solid var(--border-secondary, #334155)'
                    }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>👤</span> Recipient Contact
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div>
                                <label style={{ fontSize: '12px', color: 'var(--text-secondary, #cbd5e1)', display: 'block', marginBottom: '4px' }}>
                                    WhatsApp Phone Number
                                </label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={e => { setPhone(e.target.value); setDetailsSent(false); }}
                                    placeholder="e.g. 9876543210 or +91 98765 43210"
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-secondary, #334155)',
                                        backgroundColor: 'var(--bg-primary, #0f172a)',
                                        color: 'var(--text-primary)',
                                        fontSize: '14px',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            <ContactSearchField
                                label="Or search CRM Contacts / Leads"
                                allowCreate={false}
                                onContactSelected={contact => {
                                    setPhone(contact.phone || contact.sourceId || '');
                                    setRecipientName(contact.name || '');
                                    setDetailsSent(false);
                                }}
                            />

                            {recipientName && (
                                <div style={{ fontSize: '12px', color: '#60a5fa', fontWeight: 600 }}>
                                    Selected: {recipientName} ({phone})
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Loading or Error states */}
                    {loading && (
                        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                            Loading property media…
                        </div>
                    )}

                    {loadError && (
                        <div style={{ padding: '12px 14px', borderRadius: '8px', backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: '13px' }}>
                            {loadError}
                        </div>
                    )}

                    {/* Properties & Media Selection */}
                    {!loading && inventories.map(inv => {
                        const attachments = propertyAttachments(inv, apiBase);
                        const sel = selections[inv.id] || EMPTY_ATTACHMENT_SELECTION;
                        const allSelected = attachments.length > 0 && sel.urls.length === attachments.length;

                        return (
                            <div key={inv.id} style={{
                                backgroundColor: 'var(--bg-secondary, #1e293b)',
                                borderRadius: '12px',
                                padding: '16px',
                                border: '1px solid var(--border-secondary, #334155)'
                            }}>
                                {/* Property title + select all */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>
                                            {inv.display_id || inv.locality || 'Property'} {inv.type ? `(${inv.type})` : ''}
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                            {[inv.apartment_name, inv.locality, inv.city].filter(Boolean).join(', ') || 'Address not specified'}
                                        </div>
                                    </div>

                                    {attachments.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => toggleSelectAllMedia(inv.id, attachments)}
                                            style={{
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                border: '1px solid var(--border-secondary)',
                                                backgroundColor: 'var(--bg-tertiary, #334155)',
                                                color: 'var(--text-primary)',
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {allSelected ? '✕ Deselect All' : '✓ Select All Photos'}
                                        </button>
                                    )}
                                </div>

                                {/* Media Grid */}
                                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Select Photos & Videos ({sel.urls.length}/{attachments.length} selected):</span>
                                </div>

                                {attachments.length === 0 ? (
                                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', border: '1px dashed var(--border-secondary)', borderRadius: '8px' }}>
                                        No media available for this listing.
                                    </div>
                                ) : (
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                                        gap: '10px',
                                        maxHeight: '260px',
                                        overflowY: 'auto',
                                        padding: '4px 2px',
                                    }}>
                                        {attachments.map(att => {
                                            const isSelected = sel.urls.includes(att.url);
                                            return (
                                                <div
                                                    key={att.url}
                                                    onClick={() => toggleMediaUrl(inv.id, att.url, attachments)}
                                                    style={{
                                                        position: 'relative',
                                                        borderRadius: '8px',
                                                        overflow: 'hidden',
                                                        border: isSelected ? '2px solid #3b82f6' : '1px solid var(--border-secondary, #475569)',
                                                        backgroundColor: 'var(--bg-primary, #0f172a)',
                                                        cursor: 'pointer',
                                                        boxShadow: isSelected ? '0 0 0 1px #3b82f6' : 'none',
                                                        transition: 'border-color 0.15s, transform 0.1s',
                                                    }}
                                                >
                                                    {att.kind === 'image' ? (
                                                        <img
                                                            src={att.url}
                                                            alt={att.label}
                                                            loading="lazy"
                                                            style={{ width: '100%', height: '80px', objectFit: 'cover', display: 'block' }}
                                                        />
                                                    ) : (
                                                        <div style={{ width: '100%', height: '80px', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '20px' }}>
                                                            ▶️
                                                        </div>
                                                    )}

                                                    {/* Selection badge */}
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: '4px',
                                                        left: '4px',
                                                        width: '20px',
                                                        height: '20px',
                                                        borderRadius: '4px',
                                                        backgroundColor: isSelected ? '#3b82f6' : 'rgba(0,0,0,0.6)',
                                                        border: isSelected ? 'none' : '1px solid rgba(255,255,255,0.8)',
                                                        color: '#fff',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '12px',
                                                        fontWeight: 700,
                                                    }}>
                                                        {isSelected ? '✓' : ''}
                                                    </div>

                                                    <div style={{
                                                        padding: '3px 6px',
                                                        fontSize: '10px',
                                                        fontWeight: 600,
                                                        color: isSelected ? '#3b82f6' : 'var(--text-muted)',
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        textAlign: 'center'
                                                    }}>
                                                        {att.label}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* PDF Brochure Selection */}
                                <div style={{
                                    marginTop: '14px',
                                    paddingTop: '12px',
                                    borderTop: '1px solid var(--border-secondary)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '8px'
                                }}>
                                    <label style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                        userSelect: 'none'
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={sel.pdf}
                                            onChange={e => togglePdf(inv.id, e.target.checked)}
                                            style={{ width: '16px', height: '16px', accentColor: '#3b82f6' }}
                                        />
                                        <span>📄 Include Property PDF Brochure</span>
                                    </label>

                                    {sel.pdf && (
                                        <div style={{ display: 'flex', gap: '8px', marginLeft: '24px', alignItems: 'center' }}>
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Brochure variant:</span>
                                            <button
                                                type="button"
                                                onClick={() => setPdfVariants(p => ({ ...p, [inv.id]: 'brandless' }))}
                                                style={{
                                                    padding: '3px 8px',
                                                    borderRadius: '6px',
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    border: pdfVariants[inv.id] === 'brandless' ? '1px solid #3b82f6' : '1px solid var(--border-secondary)',
                                                    backgroundColor: pdfVariants[inv.id] === 'brandless' ? 'rgba(59,130,246,0.15)' : 'transparent',
                                                    color: pdfVariants[inv.id] === 'brandless' ? '#60a5fa' : 'var(--text-muted)',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                🕶️ No Branding
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPdfVariants(p => ({ ...p, [inv.id]: 'branded' }))}
                                                style={{
                                                    padding: '3px 8px',
                                                    borderRadius: '6px',
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    border: pdfVariants[inv.id] === 'branded' ? '1px solid #3b82f6' : '1px solid var(--border-secondary)',
                                                    backgroundColor: pdfVariants[inv.id] === 'branded' ? 'rgba(59,130,246,0.15)' : 'transparent',
                                                    color: pdfVariants[inv.id] === 'branded' ? '#60a5fa' : 'var(--text-muted)',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                🏢 With RP Branding
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {/* Preview of Property Details Text (Collapsible) */}
                    <div style={{
                        backgroundColor: 'var(--bg-secondary, #1e293b)',
                        borderRadius: '12px',
                        padding: '12px 16px',
                        border: '1px solid var(--border-secondary, #334155)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                📝 Property Details Message (Sent in Step 1)
                            </div>
                            <button
                                type="button"
                                onClick={handleCopyDetails}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#60a5fa',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    padding: '2px 6px'
                                }}
                            >
                                📋 Copy Text
                            </button>
                        </div>
                        <pre style={{
                            margin: 0,
                            padding: '10px',
                            borderRadius: '8px',
                            backgroundColor: 'var(--bg-primary, #0f172a)',
                            color: 'var(--text-primary)',
                            fontSize: '12px',
                            lineHeight: 1.4,
                            maxHeight: '120px',
                            overflowY: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            border: '1px solid var(--border-secondary)'
                        }}>
                            {getFormattedShareText() || 'Loading details…'}
                        </pre>
                    </div>

                    {/* Feedback and Errors */}
                    {error && (
                        <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '13px' }}>
                            {error}
                        </div>
                    )}
                    {successMessage && (
                        <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', fontSize: '13px' }}>
                            {successMessage}
                        </div>
                    )}
                    {progressText && (
                        <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa', fontSize: '13px', textAlign: 'center' }}>
                            ⏳ {progressText}
                        </div>
                    )}
                </div>

                {/* Footer with THE TWO BUTTONS */}
                <div style={{
                    padding: '16px 20px',
                    borderTop: '1px solid var(--border-secondary, #334155)',
                    backgroundColor: 'var(--bg-secondary, #1e293b)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    flexShrink: 0
                }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
                        {/* BUTTON 1: Just send property details to the person */}
                        <button
                            type="button"
                            onClick={handleSendDetails}
                            disabled={preparingMedia || loading}
                            style={{
                                padding: '12px 16px',
                                borderRadius: '10px',
                                border: 'none',
                                backgroundColor: '#25D366',
                                color: '#ffffff',
                                fontSize: '14px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                boxShadow: '0 2px 8px rgba(37,211,102,0.3)',
                                opacity: (preparingMedia || loading) ? 0.6 : 1,
                                transition: 'transform 0.1s, opacity 0.15s'
                            }}
                        >
                            <span style={{ fontSize: '18px' }}>💬</span>
                            <span>{detailsSent ? '✓ Details Sent — Open WhatsApp Again' : '1. Send Property Details to Person'}</span>
                        </button>

                        {/* BUTTON 2: Send selected media, videos, or PDF via Android Share Sheet */}
                        <button
                            type="button"
                            onClick={handleShareMediaSheet}
                            disabled={preparingMedia || loading || (totalMediaSelected === 0 && totalPdfSelected === 0)}
                            style={{
                                padding: '12px 16px',
                                borderRadius: '10px',
                                border: 'none',
                                backgroundColor: '#3b82f6',
                                color: '#ffffff',
                                fontSize: '14px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
                                opacity: (preparingMedia || loading || (totalMediaSelected === 0 && totalPdfSelected === 0)) ? 0.6 : 1,
                                transition: 'transform 0.1s, opacity 0.15s'
                            }}
                        >
                            <span style={{ fontSize: '18px' }}>📤</span>
                            <span>
                                {preparingMedia ? 'Preparing…' : `2. Share Media (${totalMediaSelected}${totalPdfSelected ? ' + PDF' : ''}) via Share Sheet`}
                            </span>
                        </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {isAndroid ? '🤖 Android Share Sheet targets WhatsApp recent contacts' : hasWebShareFiles ? '📱 Web Share supported' : '💻 Desktop / Web Mode'}
                        </span>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={preparingMedia}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted)',
                                fontSize: '13px',
                                cursor: 'pointer',
                                padding: '4px 8px'
                            }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
