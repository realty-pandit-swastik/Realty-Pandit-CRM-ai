import React, { useState, useEffect } from 'react';
import type { Deal } from '../../api/client';
import { getDealPropertyShares, bookDealAppointment } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';

interface PropertyShare {
    id: string;
    inventory_id: string;
    created_at: string;
    inventory?: {
        id: string;
        type: string;
        category?: string;
        location: string;
        price: number | null;
        media_urls?: string[];
        specs?: { society_name?: string; bhk_count?: number; area?: number; area_unit?: string };
        contact?: { name: string };
        key_holder_name?: string;
    };
}

interface Props {
    deal: Deal;
    onAppointmentBooked: () => void;
}

function formatPrice(price: number | null): string {
    if (!price) return '—';
    if (price >= 10000000) return `Rs.${(price / 10000000).toFixed(1)}Cr`;
    if (price >= 100000)   return `Rs.${(price / 100000).toFixed(1)}L`;
    return `Rs.${(price / 1000).toFixed(0)}K`;
}

export function SharedTab({ deal, onAppointmentBooked }: Props) {
    const { showToast } = useToast();
    const [shares, setShares] = useState<PropertyShare[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [bookingFor, setBookingFor] = useState<string | null>(null);
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [booking, setBooking] = useState(false);

    useEffect(() => {
        getDealPropertyShares(deal.id)
            .then(res => setShares(res.data || []))
            .catch(() => showToast('Failed to load shared properties', 'error'))
            .finally(() => setLoading(false));
    }, [deal.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleBook = async (inventoryId: string) => {
        if (!date || !time) { showToast('Please select date and time', 'error'); return; }
        setBooking(true);
        try {
            await bookDealAppointment(deal.id, { inventory_id: inventoryId, date, time });
            showToast('Appointment booked! Deal moved to Visit Scheduled.', 'success');
            onAppointmentBooked();
        } catch (err: any) {
            showToast(err?.response?.data?.error || 'Booking failed', 'error');
        } finally { setBooking(false); setBookingFor(null); }
    };

    const inputStyle: React.CSSProperties = {
        padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border-secondary)',
        backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12, outline: 'none',
    };

    if (loading) {
        return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading shared properties…</div>;
    }

    if (shares.length === 0) {
        return (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No properties shared yet. Use Match &amp; Share tab to send properties.
            </div>
        );
    }

    return (
        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {shares.map(share => {
                const inv = share.inventory;
                const bhk = inv?.specs?.bhk_count ? `${inv.specs.bhk_count}BHK ` : '';
                const label = `${bhk}${inv?.type || 'Property'}`;
                const society = inv?.specs?.society_name || inv?.location || '—';
                const area = inv?.specs?.area ? `${inv.specs.area} ${inv?.specs?.area_unit || 'sqft'}` : null;
                const sentAt = new Date(share.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
                const isExpanded = expandedId === share.id;
                const isBookingThis = bookingFor === share.inventory_id;

                return (
                    <div key={share.id} style={{
                        borderRadius: 10, border: '1px solid var(--border-secondary)',
                        backgroundColor: 'var(--bg-primary)', overflow: 'hidden',
                    }}>
                        {/* Main row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                            {/* Thumbnail */}
                            {inv?.media_urls?.[0] ? (
                                <img
                                    src={inv.media_urls[0]}
                                    alt={label}
                                    style={{ width: 64, height: 50, borderRadius: 7, objectFit: 'cover', flexShrink: 0, cursor: 'pointer' }}
                                    onClick={() => setExpandedId(isExpanded ? null : share.id)}
                                />
                            ) : (
                                <div
                                    onClick={() => setExpandedId(isExpanded ? null : share.id)}
                                    style={{ width: 64, height: 50, borderRadius: 7, backgroundColor: 'var(--bg-secondary)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, cursor: 'pointer' }}>
                                    🏡
                                </div>
                            )}

                            {/* Info */}
                            <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : share.id)}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {label} — {society}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>
                                    {formatPrice(inv?.price || null)}{area ? ` · ${area}` : ''} · {inv?.location || '—'}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>Sent {sentAt}</div>
                            </div>

                            {/* Expand + Book */}
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                <button
                                    onClick={() => setExpandedId(isExpanded ? null : share.id)}
                                    style={{
                                        padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                        backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', color: 'var(--text-secondary)',
                                    }}>
                                    {isExpanded ? 'Hide' : 'View'}
                                </button>
                                {!isBookingThis && (
                                    <button
                                        onClick={() => { setBookingFor(share.inventory_id); setDate(''); setTime(''); setExpandedId(null); }}
                                        style={{
                                            padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                            backgroundColor: 'rgba(34,197,94,0.1)', border: '1.5px solid rgba(34,197,94,0.4)', color: '#16a34a',
                                            whiteSpace: 'nowrap',
                                        }}>
                                        📅 Book
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Property detail panel */}
                        {isExpanded && inv && (
                            <div style={{ borderTop: '1px solid var(--border-secondary)', padding: '10px 12px', backgroundColor: 'var(--bg-secondary)' }}>
                                {/* Photo strip */}
                                {inv.media_urls && inv.media_urls.length > 0 && (
                                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10 }}>
                                        {inv.media_urls.slice(0, 6).map((url, i) => (
                                            <img key={i} src={url} alt="" style={{ height: 80, width: 110, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                                        ))}
                                    </div>
                                )}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 12 }}>
                                    <div><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Type: </span><span style={{ color: 'var(--text-primary)' }}>{bhk}{inv.type}</span></div>
                                    <div><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Price: </span><span style={{ color: 'var(--text-primary)' }}>{formatPrice(inv.price)}</span></div>
                                    <div><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Society: </span><span style={{ color: 'var(--text-primary)' }}>{inv.specs?.society_name || '—'}</span></div>
                                    <div><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Area: </span><span style={{ color: 'var(--text-primary)' }}>{area || '—'}</span></div>
                                    <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Location: </span><span style={{ color: 'var(--text-primary)' }}>{inv.location}</span></div>
                                    {inv.key_holder_name && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Key holder: </span><span style={{ color: 'var(--text-primary)' }}>{inv.key_holder_name}</span></div>}
                                    {inv.contact?.name && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Owner: </span><span style={{ color: 'var(--text-primary)' }}>{inv.contact.name}</span></div>}
                                </div>
                            </div>
                        )}

                        {/* Booking form */}
                        {isBookingThis && (
                            <div style={{ borderTop: '1px solid var(--border-secondary)', padding: '10px 12px', backgroundColor: 'var(--bg-secondary)' }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                                    Schedule visit — {label}
                                </div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <input type="date" style={inputStyle} value={date} onChange={e => setDate(e.target.value)}
                                        min={new Date().toISOString().split('T')[0]} />
                                    <input type="time" style={inputStyle} value={time} onChange={e => setTime(e.target.value)} />
                                    <button onClick={() => handleBook(share.inventory_id)} disabled={booking || !date || !time} style={{
                                        padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                        backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none',
                                        opacity: booking ? 0.7 : 1,
                                    }}>
                                        {booking ? 'Booking…' : '✅ Confirm'}
                                    </button>
                                    <button onClick={() => setBookingFor(null)} style={{
                                        padding: '6px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                                        backgroundColor: 'transparent', border: '1px solid var(--border-secondary)', color: 'var(--text-secondary)',
                                    }}>
                                        Cancel
                                    </button>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                                    Customer, coordinator &amp; key holder notified automatically on confirm.
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
