import { useEffect, useRef, useState } from 'react';
import { formatInventoryAddress, formatUnitLabel } from '../lib/address';
import client from '../api/client';
import { toDialablePhone } from '../lib/phone';
import { getDisplayFloor } from '../lib/floor';
import { useAuth } from '../contexts/AuthContext';

/**
 * InventoryDetailView — read-first, role-gated property view for the admin panel.
 *
 * Click an inventory (desktop list card / mobile sheet) → this opens FIRST (instead
 * of jumping into edit), like the public website: playable videos + photos, full
 * specs, amenities, description. Edit is one click away (button), shown per role.
 *
 * Privacy rule (2026-06-12, owner-confirmed): only super_boss + manager see the
 * OWNER name/phone, KEY-HOLDER contact, and the exact FLAT/PLOT number. Everyone
 * else views the property freely but reaches the owner THROUGH their manager.
 *
 * Renders as a right slide-in side panel on desktop and a full-screen sheet on mobile.
 */

const isVideo = (url: string) => /\.(mp4|mov|webm|avi|mkv|m4v|3gp)(\?|#|$)/i.test(url || '');

interface Contacts {
    owner: { name: string | null; phone: string } | null;
    key_holder: { name: string | null; phone: string | null } | null;
    assigned_agent: { id: string; name: string; phone: string; role: string } | null;
}

interface Props {
    inventoryId: string;
    onClose: () => void;
    /** Opens the existing edit flow. Only rendered when the viewer may edit. */
    onEdit?: () => void;
}

export function InventoryDetailView({ inventoryId, onClose, onEdit }: Props) {
    const { agent, hasPermission } = useAuth();
    const fullAccess = agent?.role === 'super_boss' || agent?.role === 'manager';
    const canEdit = hasPermission('edit_inventory');

    const [inv, setInv] = useState<any>(null);
    const [contacts, setContacts] = useState<Contacts | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeIdx, setActiveIdx] = useState(0);

    useEffect(() => {
        let alive = true;
        Promise.all([
            client.get(`/api/inventory/${inventoryId}`),
            client.get(`/api/inventory/${inventoryId}/contacts`).catch(() => ({ data: null })),
        ]).then(([invRes, ctRes]) => {
            if (!alive) return;
            setInv(invRes.data?.data ?? invRes.data);
            setContacts(ctRes.data?.data ?? ctRes.data ?? null);
        }).catch(console.error).finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [inventoryId]);

    const call = (phone?: string | null) => { const d = toDialablePhone(phone); if (d) window.location.assign(`tel:${d}`); };
    const wa = (phone?: string | null) => { const d = toDialablePhone(phone); if (d) window.open(`https://wa.me/${d.slice(1)}`, '_blank'); };

    const formatPrice = (p?: number, intent?: string) => {
        if (!p) return '—';
        const suffix = intent === 'rent' ? '/mo' : '';
        if (p >= 1e7) return `₹${(p / 1e7).toFixed(2)} Cr${suffix}`;
        if (p >= 1e5) return `₹${(p / 1e5).toFixed(1)} L${suffix}`;
        return `₹${p.toLocaleString('en-IN')}${suffix}`;
    };

    // ── Media: images + videos (video_urls + any video files in media_urls) ──
    const specs = (inv?.specs && typeof inv.specs === 'object') ? inv.specs : {};
    const images: string[] = (inv?.media_urls || []).filter((u: string) => !isVideo(u));
    const videos: string[] = [...(inv?.video_urls || []), ...((inv?.media_urls || []).filter(isVideo))];
    const media = [
        ...images.map((url: string) => ({ type: 'image' as const, url })),
        ...videos.map((url: string) => ({ type: 'video' as const, url })),
    ];
    const current = media[activeIdx];

    // ── Gallery navigation: swipe (touch), arrow buttons, keyboard ← → (wraps) ──
    const touchStartX = useRef<number | null>(null);
    const go = (dir: number) => setActiveIdx(i => (media.length ? (i + dir + media.length) % media.length : 0));
    useEffect(() => {
        if (media.length < 2) return;
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [media.length]);

    // ── Type-aware specs grid (generic over specs keys; humanize) ──
    const HIDE_KEYS = new Set(['amenities', 'area_unit', 'plot-area-unit', 'bhk_source', 'parking']);
    const humanize = (k: string) => k.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const specRows: Array<[string, string]> = [];
    if (specs.rooms != null) specRows.push(['Rooms', String(specs.rooms)]);
    else if (specs.bhk != null) specRows.push(['Configuration', `${specs.bhk} BHK`]);
    if (specs.area) specRows.push(['Area', `${specs.area} ${specs.area_unit || 'sq ft'}`]);
    if (specs.bathrooms != null) specRows.push(['Bathrooms', String(specs.bathrooms)]);
    { const _fl = getDisplayFloor(inv); if (_fl) specRows.push(['Floor', `${_fl}${specs.floors ? ` of ${specs.floors}` : ''}`]); }
    for (const [k, v] of Object.entries(specs)) {
        if (HIDE_KEYS.has(k) || ['bhk', 'rooms', 'area', 'bathrooms', 'floors'].includes(k)) continue;
        if (v == null || v === '' || Array.isArray(v) || typeof v === 'object') continue;
        specRows.push([humanize(k), String(v)]);
    }
    const amenities: string[] = Array.isArray(specs.amenities) ? specs.amenities : [];

    const title = inv?.taxonomy_node?.name || inv?.flat_property_type?.name || inv?.type?.replace(/_/g, ' ') || 'Property';
    // Location: general area always; exact flat/plot number only for full access.
    const generalLoc = formatInventoryAddress(inv);
    // Shared with the inventory tiles since 2026-08-08 — one definition of the unit string.
    // The fullAccess gate stays: this view is fed by a different endpoint.
    const unitLine = fullAccess ? formatUnitLabel(inv) : '';

    const C = { panel: '#1e2536', line: '#374151', line2: '#2d3748', text: '#f3f4f6', sub: '#9ca3af', dim: '#6b7280', body: '#d1d5db' };

    return (
        <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1200, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: 'min(560px, 100%)', height: '100%', background: C.panel, overflowY: 'auto', boxShadow: '-8px 0 30px rgba(0,0,0,0.4)' }}>
                {/* Header */}
                <div style={{ position: 'sticky', top: 0, zIndex: 2, background: C.panel, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${C.line}` }}>
                    <h3 style={{ margin: 0, fontSize: 16, color: C.text }}>Property Details</h3>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {canEdit && inv?.can_edit && onEdit && (
                            <button onClick={onEdit} style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid #60a5fa', color: '#60a5fa', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>✏️ Edit</button>
                        )}
                        <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.sub, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
                    </div>
                </div>

                {loading && <div style={{ textAlign: 'center', padding: 48, color: C.dim }}>Loading…</div>}

                {!loading && inv && (
                    <div style={{ paddingBottom: 40 }}>
                        {/* ── Media viewer ── */}
                        {media.length > 0 ? (
                            <div style={{ background: '#0f1420' }}>
                                <div
                                    onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
                                    onTouchEnd={(e) => {
                                        if (touchStartX.current == null) return;
                                        const dx = e.changedTouches[0].clientX - touchStartX.current;
                                        touchStartX.current = null;
                                        if (media.length > 1 && Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
                                    }}
                                    style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'pan-y', userSelect: 'none' }}>
                                    {current?.type === 'video'
                                        ? <video key={current.url} src={current.url} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                        : <img src={current?.url} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                                    {media.length > 1 && (
                                        <>
                                            <button aria-label="Previous photo" onClick={() => go(-1)} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 22, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
                                            <button aria-label="Next photo" onClick={() => go(1)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 22, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
                                            <div style={{ position: 'absolute', bottom: 8, right: 10, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 10 }}>{activeIdx + 1} / {media.length}</div>
                                        </>
                                    )}
                                </div>
                                {media.length > 1 && (
                                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '8px 12px' }}>
                                        {media.map((m, i) => (
                                            <button key={i} onClick={() => setActiveIdx(i)} style={{
                                                position: 'relative', flexShrink: 0, width: 64, height: 48, borderRadius: 6, overflow: 'hidden',
                                                border: i === activeIdx ? '2px solid #60a5fa' : '2px solid transparent', cursor: 'pointer', padding: 0, background: '#000',
                                            }}>
                                                {m.type === 'video'
                                                    ? <><video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /><span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, background: 'rgba(0,0,0,0.3)' }}>▶</span></>
                                                    : <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: 32, color: C.dim, background: '#0f1420' }}>No photos or videos uploaded</div>
                        )}

                        <div style={{ padding: '16px 18px' }}>
                            {/* Title + badges */}
                            <div style={{ fontSize: 19, fontWeight: 700, color: C.text }}>{title}</div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 10px' }}>
                                {inv.intent && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: inv.intent === 'rent' ? '#064e3b' : '#312e81', color: inv.intent === 'rent' ? '#34d399' : '#818cf8' }}>{inv.intent.toUpperCase()}</span>}
                                {inv.status && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: '#1f2937', color: inv.status === 'active' ? '#34d399' : '#9ca3af' }}>{String(inv.status).toUpperCase()}</span>}
                                {inv.display_id && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#1f2937', color: C.sub }}>{inv.display_id}</span>}
                            </div>

                            {/* Location */}
                            <div style={{ color: C.sub, fontSize: 13, marginBottom: 4 }}>📍 {generalLoc || 'Location N/A'}</div>
                            {unitLine && <div style={{ color: C.body, fontSize: 12, marginBottom: 4 }}>🏠 {unitLine}</div>}

                            {/* Price */}
                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '12px 0' }}>
                                {(inv.customer_price || inv.price) && fullAccess && (
                                    <div><div style={{ fontSize: 11, color: C.dim }}>Demand price</div><div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{formatPrice(inv.customer_price || inv.price, inv.intent)}</div></div>
                                )}
                                {(inv.display_price || inv.price) && (
                                    <div><div style={{ fontSize: 11, color: C.dim }}>{fullAccess ? 'Display price' : 'Price'}</div><div style={{ fontSize: 16, fontWeight: 700, color: '#60a5fa' }}>{formatPrice(inv.display_price || inv.price, inv.intent)}</div></div>
                                )}
                            </div>

                            {/* Specs grid */}
                            {specRows.length > 0 && (
                                <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
                                    <div style={{ fontSize: 12, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Details</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                                        {specRows.map(([k, v]) => (
                                            <div key={k}><div style={{ fontSize: 11, color: C.dim }}>{k}</div><div style={{ fontSize: 13, color: C.body }}>{v}</div></div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Amenities */}
                            {amenities.length > 0 && (
                                <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12, marginTop: 14 }}>
                                    <div style={{ fontSize: 12, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Amenities</div>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {amenities.map((a) => <span key={a} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 12, background: '#1f2937', color: C.body }}>{a}</span>)}
                                    </div>
                                </div>
                            )}

                            {/* Description */}
                            {inv.description && (
                                <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12, marginTop: 14 }}>
                                    <div style={{ fontSize: 12, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Description</div>
                                    <div style={{ fontSize: 13, color: C.body, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{inv.description}</div>
                                </div>
                            )}

                            {/* Contacts — role gated */}
                            <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14, marginTop: 16 }}>
                                <div style={{ fontSize: 12, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                                    {fullAccess ? 'People Connected' : 'Contact'}
                                </div>

                                {fullAccess ? (
                                    [
                                        { label: 'Owner', p: contacts?.owner },
                                        { label: 'Key Holder', p: contacts?.key_holder },
                                        { label: 'Assigned Agent', p: contacts?.assigned_agent },
                                    ].filter(x => toDialablePhone(x.p?.phone)).map(({ label, p }) => (
                                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.line2}` }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 11, color: C.dim }}>{label}</div>
                                                <div style={{ fontSize: 13, color: '#e5e7eb', fontWeight: 500 }}>{p!.name || 'Unknown'}</div>
                                                <div style={{ fontSize: 11, color: C.sub }}>{p!.phone}</div>
                                            </div>
                                            <button onClick={() => call(p!.phone)} style={{ background: 'rgba(34,197,94,0.15)', border: 'none', borderRadius: 8, color: '#22c55e', fontSize: 18, padding: '6px 10px', cursor: 'pointer' }}>📞</button>
                                            <button onClick={() => wa(p!.phone)} style={{ background: 'rgba(37,211,102,0.12)', border: 'none', borderRadius: 8, color: '#25d366', fontSize: 18, padding: '6px 10px', cursor: 'pointer' }}>💬</button>
                                        </div>
                                    ))
                                ) : (
                                    <>
                                        {/* Restricted: owner/key-holder hidden — route via the manager */}
                                        <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                                            <div style={{ fontSize: 13, color: '#fbbf24', fontWeight: 600, marginBottom: 2 }}>🔒 Owner contact is private</div>
                                            <div style={{ fontSize: 12, color: C.body, lineHeight: 1.5 }}>To arrange a visit or speak with the owner, please coordinate through your inventory manager.</div>
                                        </div>
                                        {toDialablePhone(contacts?.assigned_agent?.phone) && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 11, color: C.dim }}>Your point of contact</div>
                                                    <div style={{ fontSize: 13, color: '#e5e7eb', fontWeight: 500 }}>{contacts!.assigned_agent!.name}</div>
                                                </div>
                                                <button onClick={() => call(contacts!.assigned_agent!.phone)} style={{ background: 'rgba(34,197,94,0.15)', border: 'none', borderRadius: 8, color: '#22c55e', fontSize: 18, padding: '6px 10px', cursor: 'pointer' }}>📞</button>
                                                <button onClick={() => wa(contacts!.assigned_agent!.phone)} style={{ background: 'rgba(37,211,102,0.12)', border: 'none', borderRadius: 8, color: '#25d366', fontSize: 18, padding: '6px 10px', cursor: 'pointer' }}>💬</button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
