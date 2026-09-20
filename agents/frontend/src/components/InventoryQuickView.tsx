import { useEffect, useState, useRef } from 'react';
import client from '../api/client';
import { toDialablePhone } from '../lib/phone';

interface InventoryContacts {
    owner: { name: string | null; phone: string } | null;
    key_holder: { name: string | null; phone: string | null } | null;
    assigned_agent: { id: string; name: string; phone: string; role: string } | null;
}

interface InventoryDetail {
    id: string;
    type?: string;
    category?: string;
    location?: string;
    price?: number;
    specs?: any;
    media_urls?: string[];
    status?: string;
    key_holder_name?: string;
    key_holder_phone?: string;
    owner_phone?: string;
    contact?: { name: string };
}

interface InventoryQuickViewProps {
    inventoryId: string;
    onClose: () => void;
}

export function InventoryQuickView({ inventoryId, onClose }: InventoryQuickViewProps) {
    const [inv, setInv]           = useState<InventoryDetail | null>(null);
    const [contacts, setContacts] = useState<InventoryContacts | null>(null);
    const [loading, setLoading]   = useState(true);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        Promise.all([
            client.get(`/api/inventory/${inventoryId}`),
            client.get(`/api/inventory/${inventoryId}/contacts`),
        ]).then(([invRes, ctRes]) => {
            setInv(invRes.data?.data ?? invRes.data);
            setContacts(ctRes.data?.data ?? ctRes.data);
        }).catch(console.error).finally(() => setLoading(false));
    }, [inventoryId]);

    // Close on backdrop click
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    };

    const call = (phone: string | null | undefined) => {
        const d = toDialablePhone(phone); if (d) window.location.assign(`tel:${d}`);
    };
    const wa = (phone: string | null | undefined) => {
        const d = toDialablePhone(phone); if (d) window.open(`https://wa.me/${d.slice(1)}`, '_blank');
    };

    const formatPrice = (p?: number) => {
        if (!p) return '—';
        if (p >= 1e7) return `₹${(p / 1e7).toFixed(2)} Cr`;
        if (p >= 1e5) return `₹${(p / 1e5).toFixed(1)}L`;
        return `₹${p.toLocaleString('en-IN')}`;
    };

    return (
        <div
            onClick={handleBackdropClick}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
                zIndex: 1000, display: 'flex', alignItems: 'flex-end',
            }}
        >
            <div
                ref={panelRef}
                style={{
                    width: '100%', maxWidth: 540, margin: '0 auto',
                    background: '#1e2536', borderRadius: '16px 16px 0 0',
                    maxHeight: '85vh', overflowY: 'auto',
                    padding: '0 0 32px 0',
                }}
            >
                {/* Handle */}
                <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
                    <div style={{ width: 40, height: 4, borderRadius: 2, background: '#374151' }} />
                </div>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px 12px' }}>
                    <h3 style={{ margin: 0, fontSize: 16, color: '#f3f4f6' }}>Property Details</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 20, cursor: 'pointer' }}>✕</button>
                </div>

                {loading && (
                    <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Loading…</div>
                )}

                {!loading && inv && (
                    <>
                        {/* Photo strip */}
                        {inv.media_urls && inv.media_urls.length > 0 && (
                            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 20px 12px', scrollbarWidth: 'none' }}>
                                {inv.media_urls.slice(0, 6).map((url, i) => (
                                    <img
                                        key={i}
                                        src={url}
                                        alt=""
                                        style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Core details */}
                        <div style={{ padding: '0 20px' }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: '#f3f4f6', marginBottom: 2 }}>
                                {inv.specs?.bhk ? `${inv.specs.bhk} BHK` : inv.type || 'Property'}
                                {inv.category ? ` — ${inv.category}` : ''}
                            </div>
                            <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 12 }}>📍 {inv.location || '—'}</div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 16 }}>
                                {[
                                    ['Price', formatPrice(inv.price)],
                                    ['Status', inv.status || '—'],
                                    ['Area', inv.specs?.area ? `${inv.specs.area} sq ft` : '—'],
                                    ['Floor', inv.specs?.floor ?? '—'],
                                    ['Facing', inv.specs?.facing || '—'],
                                    ['Furnishing', inv.specs?.furnishing || '—'],
                                ].map(([label, val]) => (
                                    <div key={label}>
                                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{label}</div>
                                        <div style={{ fontSize: 13, color: '#d1d5db' }}>{val}</div>
                                    </div>
                                ))}
                            </div>

                            {/* People connected */}
                            <div style={{ borderTop: '1px solid #374151', paddingTop: 14, marginTop: 4 }}>
                                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    People Connected
                                </div>

                                {[
                                    { label: 'Owner',          p: contacts?.owner },
                                    { label: 'Key Holder',     p: contacts?.key_holder },
                                    { label: 'Assigned Agent', p: contacts?.assigned_agent },
                                ].filter(x => toDialablePhone(x.p?.phone)).map(({ label, p }) => (
                                    <div key={label} style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '8px 0', borderBottom: '1px solid #2d3748',
                                    }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
                                            <div style={{ fontSize: 13, color: '#e5e7eb', fontWeight: 500 }}>{p!.name || 'Unknown'}</div>
                                            <div style={{ fontSize: 11, color: '#9ca3af' }}>{p!.phone}</div>
                                        </div>
                                        <button
                                            onClick={() => call(p!.phone)}
                                            style={{
                                                background: 'rgba(34,197,94,0.15)', border: 'none', borderRadius: 8,
                                                color: '#22c55e', fontSize: 18, padding: '6px 10px', cursor: 'pointer',
                                            }}
                                        >📞</button>
                                        <button
                                            onClick={() => wa(p!.phone)}
                                            style={{
                                                background: 'rgba(37,211,102,0.12)', border: 'none', borderRadius: 8,
                                                color: '#25d366', fontSize: 18, padding: '6px 10px', cursor: 'pointer',
                                            }}
                                        >💬</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
