import { useState } from 'react';
import { shareToClient } from '../../api/client';

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
    leadPhone, leadName, scoreColor,
}: MatchedPropertiesSectionProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [sharing, setSharing] = useState(false);
    const [shareResults, setShareResults] = useState<Record<string, 'success' | 'failed' | 'pending'>>({});

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
        if (selectedIds.size === 0) return;
        setSharing(true);
        const cleanPhone = leadPhone.replace(/\D/g, '');

        for (const id of selectedIds) {
            setShareResults(prev => ({ ...prev, [id]: 'pending' }));
            try {
                await shareToClient(id, { client_phone: cleanPhone, client_name: leadName || undefined });
                setShareResults(prev => ({ ...prev, [id]: 'success' }));
            } catch {
                setShareResults(prev => ({ ...prev, [id]: 'failed' }));
            }
        }
        setSharing(false);
    };

    const handleShareLink = () => {
        if (selectedIds.size === 0) return;
        const urls = Array.from(selectedIds).map(id =>
            `https://www.realtypandit.in/properties/${id}`
        );
        const cleanPhone = leadPhone.replace(/\D/g, '');
        const name = leadName || '';
        const text = `Hi ${name}, here are some properties for you from Realty Pandit:\n\n${urls.map((u, i) => `${i + 1}. ${u}`).join('\n')}`;
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');
    };

    return (
        <div style={{ marginBottom: '16px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary, #f1f5f9)' }}>
                    Property Matches
                </span>
                <button
                    onClick={onFindMatches}
                    disabled={matchLoading}
                    style={{
                        padding: '5px 12px', borderRadius: '8px', border: 'none',
                        backgroundColor: '#3b82f6', color: '#fff', fontSize: '12px',
                        fontWeight: 600, cursor: matchLoading ? 'wait' : 'pointer',
                        opacity: matchLoading ? 0.6 : 1,
                    }}
                >
                    {matchLoading ? 'Matching...' : '🔍 Find Matches'}
                </button>
            </div>

            {/* Error */}
            {matchError && (
                <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', marginBottom: '8px' }}>
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
                            backgroundColor: 'var(--bg-tertiary, #334155)', color: 'var(--text-secondary, #cbd5e1)',
                            border: '1px solid var(--border-secondary, #475569)', cursor: 'pointer',
                        }}
                    >
                        {selectedIds.size === matches.length ? 'Deselect All' : 'Select All'}
                    </button>

                    {selectedIds.size > 0 && (
                        <>
                            <button
                                onClick={handleSendWhatsApp}
                                disabled={sharing}
                                style={{
                                    padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                                    backgroundColor: '#25d366', color: '#fff', border: 'none',
                                    cursor: sharing ? 'wait' : 'pointer', opacity: sharing ? 0.6 : 1,
                                    display: 'flex', alignItems: 'center', gap: '4px',
                                }}
                            >
                                💬 Send WhatsApp ({selectedIds.size})
                            </button>
                            <button
                                onClick={handleShareLink}
                                style={{
                                    padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                                    backgroundColor: 'rgba(59,130,246,0.15)', color: '#3b82f6',
                                    border: '1px solid #3b82f6', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '4px',
                                }}
                            >
                                🔗 Share Link ({selectedIds.size})
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
                                backgroundColor: isSelected ? 'rgba(59,130,246,0.08)' : 'var(--bg-tertiary, #1e293b)',
                                border: isSelected ? '1px solid #3b82f6' : '1px solid var(--border-secondary, #334155)',
                                borderRadius: '10px', padding: '10px 12px',
                                position: 'relative', transition: 'border-color 0.15s',
                            }}
                        >
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                {/* Checkbox */}
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelect(m.id)}
                                    style={{ marginTop: '4px', accentColor: '#3b82f6', cursor: 'pointer', flexShrink: 0 }}
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
                                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary, #f1f5f9)', textTransform: 'capitalize' }}>
                                            {m.type} · {m.category}
                                            {specs.bedrooms ? ` · ${specs.bedrooms} BHK` : ''}
                                        </span>
                                        <span style={{
                                            backgroundColor: `${scoreColor(m.match_score)}22`,
                                            color: scoreColor(m.match_score),
                                            padding: '1px 6px', borderRadius: '8px',
                                            fontSize: '10px', fontWeight: 700,
                                        }}>
                                            {m.match_score.toFixed(0)}%
                                        </span>
                                    </div>

                                    <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {m.location || 'Location N/A'}
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#60a5fa' }}>
                                            {formatPrice(m.price, m.price_unit)}
                                        </span>
                                        <span style={{ fontSize: '9px', color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', fontWeight: 600 }}>
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
                                    {result === 'success' ? '✅' : result === 'failed' ? '❌' : '⏳'}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
