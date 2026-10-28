import { useEffect, useRef, useState } from 'react';
import { formatInventoryAddress, formatUnitLabel } from '../lib/address';
import client from '../api/client';
import { toDialablePhone } from '../lib/phone';
import { getDisplayFloor } from '../lib/floor';
import { useAuth } from '../contexts/AuthContext';
import { X, Pencil, Phone, MessageCircle, MapPin, House, LockKeyhole, Play } from 'lucide-react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { Skeleton } from './ui/States';
import { Badge } from './ui/Badge';

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
    const dialogRef = useDialogFocus(onClose);
    const { agent, hasPermission } = useAuth();
    const fullAccess = agent?.role === 'super_boss' || agent?.role === 'manager';
    const canEdit = hasPermission('edit_inventory');

    const [inv, setInv] = useState<any>(null);
    const [contacts, setContacts] = useState<Contacts | null>(null);
    const [completedInventoryId, setCompletedInventoryId] = useState<string | null>(null);
    const [activeIdx, setActiveIdx] = useState(0);

    const loading = completedInventoryId !== inventoryId;

    useEffect(() => {
        let alive = true;
        Promise.all([
            client.get(`/api/inventory/${inventoryId}`),
            client.get(`/api/inventory/${inventoryId}/contacts`).catch(() => ({ data: null })),
        ]).then(([invRes, ctRes]) => {
            if (!alive) return;
            setInv(invRes.data?.data ?? invRes.data);
            setContacts(ctRes.data?.data ?? ctRes.data ?? null);
        }).catch(console.error).finally(() => { if (alive) setCompletedInventoryId(inventoryId); });
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

    const C = { panel: 'var(--bg-primary)', line: 'var(--border-secondary)', line2: 'var(--border-primary)', text: 'var(--text-primary)', sub: 'var(--text-secondary)', dim: 'var(--text-muted)', body: 'var(--text-secondary)' };

    return (
        <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            style={{ position: 'fixed', inset: 0, background: 'var(--sheet-backdrop)', zIndex: 1200, display: 'flex', justifyContent: 'flex-end' }}>
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="rp-property-title" tabIndex={-1} className="rp-property-detail" style={{ width: 'min(640px, 100%)', height: '100%', background: C.panel, overflowY: 'auto', boxShadow: 'var(--rp-shadow-far)' }}>
                {/* Header */}
                <div style={{ position: 'sticky', top: 0, zIndex: 2, background: C.panel, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${C.line}` }}>
                    <h2 id="rp-property-title" style={{ margin: 0, fontSize: 16, color: C.text }}>Property Details</h2>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {canEdit && inv?.can_edit && onEdit && (
                            <button onClick={onEdit} className="rp-btn rp-btn--primary"><Pencil size={15} aria-hidden="true" />Edit</button>
                        )}
                        <button onClick={onClose} className="rp-btn rp-btn--ghost" aria-label="Close property details"><X size={18} aria-hidden="true" /></button>
                    </div>
                </div>

                {loading && <div role="status" aria-busy="true" style={{ padding: 24, display: 'grid', gap: 16 }}><Skeleton height={240} /><Skeleton width="60%" height={24} /><Skeleton width="85%" /><span>Loading property details…</span></div>}

                {!loading && inv && (
                    <div style={{ paddingBottom: 40 }}>
                        {/* ── Media viewer ── */}
                        {media.length > 0 ? (
                            <div style={{ background: 'var(--ink)' }}>
                                <div
                                    onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
                                    onTouchEnd={(e) => {
                                        if (touchStartX.current == null) return;
                                        const dx = e.changedTouches[0].clientX - touchStartX.current;
                                        touchStartX.current = null;
                                        if (media.length > 1 && Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
                                    }}
                                    style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', background: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'pan-y', userSelect: 'none' }}>
                                    {current?.type === 'video'
                                        ? <video key={current.url} src={current.url} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                        : <img src={current?.url} alt={`${title} — photo ${activeIdx + 1}`} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                                    {media.length > 1 && (
                                        <>
                                            <button aria-label="Previous photo" onClick={() => go(-1)} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: 'var(--radius-control)', border: 'none', background: 'var(--media-overlay)', color: 'var(--surface-white)', fontSize: 22, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
                                            <button aria-label="Next photo" onClick={() => go(1)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: 'var(--radius-control)', border: 'none', background: 'var(--media-overlay)', color: 'var(--surface-white)', fontSize: 22, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
                                            <div style={{ position: 'absolute', bottom: 8, right: 12, background: 'var(--media-overlay)', color: 'var(--surface-white)', fontSize: 12, padding: '4px 8px', borderRadius: 'var(--radius-control)' }}>{activeIdx + 1} / {media.length}</div>
                                        </>
                                    )}
                                </div>
                                {media.length > 1 && (
                                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '8px 12px' }}>
                                        {media.map((m, i) => (
                                            <button key={i} aria-label={`View ${m.type} ${i + 1}`} aria-pressed={i === activeIdx} onClick={() => setActiveIdx(i)} style={{
                                                position: 'relative', flexShrink: 0, width: 64, height: 48, borderRadius: 6, overflow: 'hidden',
                                                border: i === activeIdx ? '2px solid var(--blue-400)' : '2px solid transparent', cursor: 'pointer', padding: 0, background: 'var(--ink)',
                                            }}>
                                                {m.type === 'video'
                                                    ? <><video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /><span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--surface-white)', background: 'var(--media-overlay)' }}><Play size={16} strokeWidth={1.7} aria-hidden="true" /></span></>
                                                    : <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: 32, color: C.dim, background: 'var(--bg-secondary)' }}>No photos or videos uploaded</div>
                        )}

                        <div style={{ padding: '16px 18px' }}>
                            {/* Title + badges */}
                            <div style={{ fontSize: 19, fontWeight: 700, color: C.text }}>{title}</div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 10px' }}>
                                {inv.intent && <Badge tone={inv.intent === 'rent' ? 'success' : 'info'}>{inv.intent.toUpperCase()}</Badge>}
                                {inv.status && <Badge tone={inv.status === 'active' ? 'success' : 'neutral'}>{String(inv.status).toUpperCase()}</Badge>}
                                {inv.display_id && <Badge>{inv.display_id}</Badge>}
                            </div>

                            {/* Location */}
                            <div style={{ color: C.sub, fontSize: 13, marginBottom: 4 }}><MapPin size={14} aria-hidden="true" /> {generalLoc || 'Location N/A'}</div>
                            {unitLine && <div style={{ color: C.body, fontSize: 12, marginBottom: 4 }}><House size={14} aria-hidden="true" /> {unitLine}</div>}

                            {/* Price */}
                            <div className="rp-property-prices" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '16px 0 24px' }}>
                                {(inv.customer_price || inv.price) && fullAccess && (
                                    <div><div style={{ fontSize: 11, color: C.dim }}>Demand price</div><div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{formatPrice(inv.customer_price || inv.price, inv.intent)}</div></div>
                                )}
                                {(inv.display_price || inv.price) && (
                                    <div><div style={{ fontSize: 11, color: C.dim }}>{fullAccess ? 'Display price' : 'Price'}</div><div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-link)' }}>{formatPrice(inv.display_price || inv.price, inv.intent)}</div></div>
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
                                        {amenities.map((a) => <span key={a} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 'var(--radius-control)', background: 'var(--bg-tertiary)', color: C.body }}>{a}</span>)}
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
                                                <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{p!.name || 'Unknown'}</div>
                                                <div style={{ fontSize: 11, color: C.sub }}>{p!.phone}</div>
                                            </div>
                                            <button onClick={() => call(p!.phone)} className="rp-btn rp-btn--ghost" aria-label={`Call ${label}`}><Phone size={17} aria-hidden="true" /></button>
                                            <button onClick={() => wa(p!.phone)} className="rp-btn rp-btn--ghost" aria-label={`WhatsApp ${label}`}><MessageCircle size={17} aria-hidden="true" /></button>
                                        </div>
                                    ))
                                ) : (
                                    <>
                                        {/* Restricted: owner/key-holder hidden — route via the manager */}
                                        <div style={{ background: 'var(--rp-warn-bg)', border: '1px solid var(--rp-warn-line)', borderRadius: 'var(--radius-card)', padding: '12px', marginBottom: 12 }}>
                                            <div style={{ fontSize: 13, color: 'var(--rp-warn-text)', fontWeight: 600, marginBottom: 4 }}><LockKeyhole size={16} strokeWidth={1.7} aria-hidden="true" /> Owner contact is private</div>
                                            <div style={{ fontSize: 12, color: C.body, lineHeight: 1.5 }}>To arrange a visit or speak with the owner, please coordinate through your inventory manager.</div>
                                        </div>
                                        {toDialablePhone(contacts?.assigned_agent?.phone) && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 11, color: C.dim }}>Your point of contact</div>
                                                    <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{contacts!.assigned_agent!.name}</div>
                                                </div>
                                                <button onClick={() => call(contacts!.assigned_agent!.phone)} className="rp-btn rp-btn--ghost" aria-label="Call your inventory manager"><Phone size={17} aria-hidden="true" /></button>
                                                <button onClick={() => wa(contacts!.assigned_agent!.phone)} className="rp-btn rp-btn--ghost" aria-label="WhatsApp your inventory manager"><MessageCircle size={17} aria-hidden="true" /></button>
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
