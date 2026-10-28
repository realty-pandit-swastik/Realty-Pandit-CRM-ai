import { useState } from 'react';
import { shareToClient } from '../../api/client';
import { toDialablePhone } from '../../lib/phone';
import { IconText, PresentationIcon } from '../ui/PresentationIcon';

interface MatchedProperty {
    id: string;
    type: string;
    category: string;
    location: string | null;
    price: number | null;
    price_unit: string | null;
    intent: string;
    match_score: number;
    priority_tier: string;
    specs: any;
    media_urls: string[];
}

interface MatchedPropertiesSectionProps {
    matches: MatchedProperty[];
    matchLoading: boolean;
    matchError: string;
    onFindMatches: () => void;
    leadPhone: string;
    leadName: string | null;
    /** Partner's phone — used as the WhatsApp recipient when the lead has no real client phone
     *  (partner-referral leads carry a PENDING placeholder as phone_number). */
    leadPartnerPhone?: string | null;
    scoreColor: (s: number) => string;
}

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:7071';

function getMediaUrl(path: string): string {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

function formatPrice(price: number | null, unit: string | null): string {
    if (!price) return 'Price N/A';
    if (unit === 'Cr' || unit === 'Crore') return `\u20b9${price} Cr`;
    if (unit === 'Lakh') return `\u20b9${price} Lakh`;
    const n = Number(price);
    if (n >= 10000000) return `\u20b9${(n / 10000000).toFixed(1)}Cr`;
    if (n >= 100000) return `\u20b9${(n / 100000).toFixed(0)}L`;
    return `\u20b9${n.toLocaleString('en-IN')}`;
}

export default function MatchedPropertiesSection({
    matches, matchLoading, matchError, onFindMatches,
    leadPhone, leadName, leadPartnerPhone, scoreColor,
}: MatchedPropertiesSectionProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [sharing, setSharing] = useState(false);
    const [shareResults, setShareResults] = useState<Record<string, 'success' | 'failed' | 'pending'>>({});

    // Resolve the WhatsApp recipient as a clean, country-coded number. Prefer the lead's own number;
    // for partner-referral leads (phone_number is a PENDING placeholder → not dialable) fall back to the
    // partner, who relays the property to the client. Never digit-strip a raw/placeholder value into wa.me.
    const clientDial = toDialablePhone(leadPhone);
    const partnerDial = toDialablePhone(leadPartnerPhone);
    const recipient = clientDial ?? partnerDial;        // canonical +91… or null
    const recipientIsPartner = !clientDial && !!partnerDial;
    const canShare = !!recipient;

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (selectedIds.size === matches.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(matches.map(m => m.id)));
        }
    };

    const handleSendWhatsApp = async () => {
        if (selectedIds.size === 0 || !recipient) return;
        setSharing(true);

        for (const id of selectedIds) {
            setShareResults(prev => ({ ...prev, [id]: 'pending' }));
            try {
                const r = await shareToClient(id, { client_phone: recipient, client_name: leadName || undefined });
                // Backend returns the REAL outcome now. already_shared = previously delivered (ok);
                // whatsapp_sent === false = this send failed → show failed, not a false success.
                const ok = r?.already_shared || r?.whatsapp_sent !== false;
                setShareResults(prev => ({ ...prev, [id]: ok ? 'success' : 'failed' }));
            } catch {
                setShareResults(prev => ({ ...prev, [id]: 'failed' }));
            }
        }
        setSharing(false);
    };

    const handleShareLink = () => {
        if (selectedIds.size === 0 || !recipient) return;
        const urls = Array.from(selectedIds).map(id =>
            `https://www.realtypandit.in/properties/${id}`
        );
        const name = leadName || '';
        const text = `Hi ${name}, here are some properties for you from Realty Pandit:\n\n${urls.map((u, i) => `${i + 1}. ${u}`).join('\n')}`;
        window.open(`https://wa.me/${recipient.slice(1)}?text=${encodeURIComponent(text)}`, '_blank');
    };

    return (
        <div style={{ marginBottom: '16px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary, var(--bg-secondary))' }}>
                    Property Matches
                </span>
                <button
                    onClick={onFindMatches}
                    disabled={matchLoading}
                    style={{
                        padding: '5px 12px', borderRadius: '8px', border: 'none',
                        backgroundColor: 'var(--blue-600)', color: 'var(--surface-white)', fontSize: '12px',
                        fontWeight: 600, cursor: matchLoading ? 'wait' : 'pointer',
                        opacity: matchLoading ? 0.6 : 1,
                    }}
                >
                    {matchLoading ? 'Matching...' : 'Find Matches'}
                </button>
            </div>

            {/* Error */}
            {matchError && (
                <div style={{ backgroundColor: 'var(--rp-danger-bg)', color: 'var(--rp-danger-text)', padding: '8px 12px', borderRadius: 'var(--radius-control)', fontSize: '12px', marginBottom: '8px' }}>
                    {matchError}
                </div>
            )}

            {/* Action bar (visible when items selected) */}
            {matches.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    <button
                        onClick={toggleAll}
                        style={{
                            padding: '4px 10px', borderRadius: '6px', fontSize: '11px',
                            backgroundColor: 'var(--bg-tertiary, var(--text-secondary))', color: 'var(--text-secondary, var(--border-secondary))',
                            border: '1px solid var(--border-secondary, var(--text-secondary))', cursor: 'pointer',
                        }}
                    >
                        {selectedIds.size === matches.length ? 'Deselect All' : 'Select All'}
                    </button>

                    {selectedIds.size > 0 && !canShare && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted, var(--text-muted))', fontStyle: 'italic' }}>
                            No phone on file — can't share
                        </span>
                    )}
                    {selectedIds.size > 0 && canShare && (
                        <>
                            <button
                                onClick={handleSendWhatsApp}
                                disabled={sharing}
                                title={recipientIsPartner ? 'Lead has no client phone — sends to the referring partner' : undefined}
                                style={{
                                    padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                                    backgroundColor: 'var(--blue-600)', color: 'var(--surface-white)', border: 'none',
                                    cursor: sharing ? 'wait' : 'pointer', opacity: sharing ? 0.6 : 1,
                                    display: 'flex', alignItems: 'center', gap: '4px',
                                }}
                            >
                                <PresentationIcon value="message-circle" /> {recipientIsPartner ? 'Share with partner' : 'Send WhatsApp'} ({selectedIds.size})
                            </button>
                            <button
                                onClick={handleShareLink}
                                title={recipientIsPartner ? 'Lead has no client phone — sends to the referring partner' : undefined}
                                style={{
                                    padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                                    backgroundColor: 'var(--rp-info-bg)', color: 'var(--rp-info-text)',
                                    border: '1px solid var(--control-line)', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '4px',
                                }}
                            >
                                Share Link ({selectedIds.size})
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Match cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {matches.map((m) => {
                    const specs = m.specs || {};
                    const isSelected = selectedIds.has(m.id);
                    const result = shareResults[m.id];
                    const thumb = m.media_urls?.[0] ? getMediaUrl(m.media_urls[0]) : null;

                    return (
                        <div
                            key={m.id}
                            style={{
                                backgroundColor: isSelected ? 'var(--bg-active)' : 'var(--bg-primary)',
                                border: isSelected ? '1px solid var(--blue-600)' : '1px solid var(--border-primary)',
                                borderRadius: 'var(--radius-card)', padding: '12px',
                                position: 'relative', transition: 'border-color 0.15s',
                            }}
                        >
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                {/* Checkbox */}
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelect(m.id)}
                                    style={{ marginTop: '4px', accentColor: 'var(--blue-600)', cursor: 'pointer', flexShrink: 0 }}
                                />

                                {/* Thumbnail */}
                                {thumb && (
                                    <img
                                        src={thumb}
                                        alt=""
                                        style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }}
                                    />
                                )}

                                {/* Content */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary, var(--bg-secondary))', textTransform: 'capitalize' }}>
                                            {m.type} · {m.category}
                                            {specs.bedrooms ? ` · ${specs.bedrooms} BHK` : ''}
                                        </span>
                                        <span style={{
                                            backgroundColor: 'var(--bg-secondary)',
                                            color: scoreColor(m.match_score),
                                            padding: '1px 6px', borderRadius: '8px',
                                            fontSize: '10px', fontWeight: 700,
                                        }}>
                                            {m.match_score.toFixed(0)}%
                                        </span>
                                    </div>

                                    <div style={{ fontSize: '11px', color: 'var(--text-muted, var(--text-muted))', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {m.location || 'Location N/A'}
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {formatPrice(m.price, m.price_unit)}
                                        </span>
                                        <span style={{ fontSize: '9px', color: 'var(--text-muted, var(--control-line))', textTransform: 'uppercase', fontWeight: 600 }}>
                                            {m.priority_tier}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Share result indicator */}
                            {result && (
                                <div style={{
                                    position: 'absolute', top: '6px', right: '6px',
                                    fontSize: '14px',
                                }}>
                                    <IconText>{result === 'success' ? '✅' : result === 'failed' ? '❌' : '⏳'}</IconText>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
