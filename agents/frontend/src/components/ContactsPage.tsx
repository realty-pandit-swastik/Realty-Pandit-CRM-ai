import { useEffect, useState, useCallback } from 'react';
import PhoneInput from './PhoneInput';
import { getContactsDirectory, getInventory, updateContactProfile, type DirectoryContact } from '../api/client';
import { WhatsAppChatTab } from './WhatsAppChatTab';
import { toDialablePhone } from '../lib/phone';

/**
 * Unified Contacts directory (2026-06-20). Every contact — buyer, tenant, owner/landlord,
 * partner agent, builder — in one role-scoped list. Each row shows the type, assigned
 * manager, their listings (owners) or requirement (buyers/tenants), and call/WhatsApp.
 * Clicking opens a drawer with the WhatsApp chat history + their inventories or demand.
 * Shared by desktop + PWA.
 */

const TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
    BUYER: { label: 'Buyer', icon: '🏠', color: '#3b82f6' },
    TENANT: { label: 'Tenant', icon: '🛋️', color: '#8b5cf6' },
    LANDLORD: { label: 'Owner / Landlord', icon: '🔑', color: '#f59e0b' },
    PARTNER_AGENT: { label: 'Partner Agent', icon: '🤝', color: '#22c55e' },
    REAL_ESTATE_BUILDER: { label: 'Builder', icon: '🏗️', color: '#ef4444' },
    MANAGEMENT: { label: 'Team', icon: '👔', color: '#64748b' },
    UNKNOWN: { label: 'Unknown', icon: '👤', color: '#94a3b8' },
};
const TYPE_ORDER = ['BUYER', 'TENANT', 'LANDLORD', 'PARTNER_AGENT', 'REAL_ESTATE_BUILDER', 'MANAGEMENT', 'UNKNOWN'];

function fmtMoney(n: number | null): string | null {
    if (n == null || !Number.isFinite(n) || n <= 0) return null;
    if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
    if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
    return `₹${Math.round(n / 1000)}K`;
}
function demandLine(d: DirectoryContact['demand']): string {
    if (!d) return '';
    const parts: string[] = [];
    if (d.intent) parts.push(d.intent);
    const lo = fmtMoney(d.budget_min), hi = fmtMoney(d.budget_max);
    if (lo && hi) parts.push(`${lo}–${hi}`); else if (hi) parts.push(`up to ${hi}`); else if (lo) parts.push(`${lo}+`);
    if (d.location) parts.push(`📍 ${d.location}`);
    return parts.join(' · ');
}
function meta(t: string) { return TYPE_META[t] || TYPE_META.UNKNOWN; }

export function ContactsPage() {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const [items, setItems] = useState<DirectoryContact[]>([]);
    const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [type, setType] = useState('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<DirectoryContact | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, any> = { page, limit: 25 };
            if (type) params.type = type;
            if (search.trim()) params.search = search.trim();
            const res = await getContactsDirectory(params);
            setItems(res.data || []);
            setTypeCounts(res.type_counts || {});
            setTotal(res.total || 0);
            setTotalPages(res.totalPages || 1);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }, [page, type, search]);

    useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

    const totalAll = Object.values(typeCounts).reduce((a, b) => a + b, 0);
    const tabs = [{ key: '', label: 'All', count: totalAll }, ...TYPE_ORDER.filter(t => typeCounts[t]).map(t => ({ key: t, label: meta(t).label, count: typeCounts[t] }))];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: isMobile ? '12px' : '20px', boxSizing: 'border-box', overflow: 'hidden' }}>
            <div style={{ flexShrink: 0 }}>
                <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 12px' }}>📇 Contacts {total > 0 && <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)' }}>({total})</span>}</h2>
                <input
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    placeholder="Search by name or phone…"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box', marginBottom: 10 }}
                />
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
                    {tabs.map(tab => (
                        <button key={tab.key} onClick={() => { setType(tab.key); setPage(1); }}
                            style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 20, border: type === tab.key ? '1px solid #4F46E5' : '1px solid var(--border-secondary)', backgroundColor: type === tab.key ? '#4F46E5' : 'var(--bg-secondary)', color: type === tab.key ? '#fff' : 'var(--text-secondary)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            {tab.key ? `${meta(tab.key).icon} ` : ''}{tab.label} ({tab.count})
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {loading && items.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading contacts…</div>
                ) : items.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No contacts found.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {items.map(c => {
                            const m = meta(c.contact_type);
                            const tel = toDialablePhone(c.phone_number);
                            return (
                                <div key={c.phone_number} onClick={() => setSelected(c)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', cursor: 'pointer' }}>
                                    <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, backgroundColor: `${m.color}22` }}>{m.icon}</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{c.name || tel || c.phone_number}</span>
                                            <span style={{ fontSize: 10.5, fontWeight: 700, color: m.color, backgroundColor: `${m.color}1e`, borderRadius: 6, padding: '1px 7px' }}>{m.label}</span>
                                        </div>
                                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {c.inventory_count > 0 && <span>🏠 {c.inventory_count} listing{c.inventory_count !== 1 ? 's' : ''}</span>}
                                            {c.demand && demandLine(c.demand) && <span>{c.inventory_count > 0 ? ' · ' : ''}{demandLine(c.demand)}</span>}
                                            {c.manager && <span> · 🧑‍💼 {c.manager}</span>}
                                        </div>
                                    </div>
                                    {tel && (
                                        <a href={`tel:${tel}`} onClick={e => e.stopPropagation()} title="Call" style={{ color: '#22c55e', textDecoration: 'none', fontSize: 18, flexShrink: 0 }}>📞</a>
                                    )}
                                    {tel && (
                                        <a href={`https://wa.me/${tel.replace('+', '')}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title="WhatsApp" style={{ color: '#25d366', textDecoration: 'none', fontSize: 18, flexShrink: 0 }}>💬</a>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '16px 0' }}>
                        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.4 : 1 }}>Prev</button>
                        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{page}/{totalPages}</span>
                        <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.4 : 1 }}>Next</button>
                    </div>
                )}
            </div>

            {selected && <ContactDetailDrawer contact={selected} isMobile={isMobile} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); load(); }} />}
        </div>
    );
}

function ContactDetailDrawer({ contact, isMobile, onClose, onSaved }: { contact: DirectoryContact; isMobile: boolean; onClose: () => void; onSaved: () => void }) {
    const [tab, setTab] = useState<'overview' | 'chat'>('overview');
    const [listings, setListings] = useState<any[] | null>(null);
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({ name: contact.name || '', phone: contact.phone_number || '', email: contact.email || '' });
    const [saving, setSaving] = useState(false);
    const [saveErr, setSaveErr] = useState<string | null>(null);
    const m = meta(contact.contact_type);
    const tel = toDialablePhone(contact.phone_number);
    // Partner agents + team are managed on their own pages — not editable here.
    const editable = contact.contact_type !== 'PARTNER_AGENT' && contact.contact_type !== 'MANAGEMENT';

    const save = async () => {
        setSaving(true); setSaveErr(null);
        try {
            await updateContactProfile(contact.phone_number, { name: form.name.trim(), new_phone: form.phone.trim(), email: form.email.trim() });
            onSaved();
        } catch (e: any) {
            setSaveErr(e?.response?.data?.error || 'Failed to save');
        } finally { setSaving(false); }
    };

    useEffect(() => {
        if (contact.inventory_count > 0) {
            getInventory({ owner_phone: contact.phone_number, limit: 50 })
                .then((res: any) => setListings(res?.data || (Array.isArray(res) ? res : [])))
                .catch(() => setListings([]));
        }
    }, [contact.phone_number, contact.inventory_count]);

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'var(--sheet-backdrop, rgba(0,0,0,0.45))', display: 'flex', justifyContent: isMobile ? 'center' : 'flex-end', alignItems: isMobile ? 'flex-end' : 'stretch' }}>
            <div onClick={e => e.stopPropagation()} style={{ backgroundColor: 'var(--bg-secondary)', width: isMobile ? '100%' : 460, maxWidth: '100%', height: isMobile ? '88vh' : '100%', borderRadius: isMobile ? '18px 18px 0 0' : 0, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.3)' }}>
                {/* Header */}
                <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, backgroundColor: `${m.color}22` }}>{m.icon}</div>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.name || tel || contact.phone_number}</div>
                                <div style={{ fontSize: 11.5, color: m.color, fontWeight: 700 }}>{m.label}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {editable && !editing && (
                                <button onClick={() => setEditing(true)} title="Edit contact" style={{ background: 'none', border: 'none', color: 'var(--text-link)', fontSize: 17, cursor: 'pointer', padding: 4 }}>✎</button>
                            )}
                            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
                        </div>
                    </div>
                    {editing ? (
                        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Name" style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                            <PhoneInput value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="Phone number" style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                            <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Email (optional)" style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                            {saveErr && <div style={{ color: '#ef4444', fontSize: 12 }}>{saveErr}</div>}
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => { setEditing(false); setSaveErr(null); setForm({ name: contact.name || '', phone: contact.phone_number || '', email: contact.email || '' }); }} style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: '1px solid var(--border-secondary)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                                <button onClick={save} disabled={saving} style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', background: '#4F46E5', color: '#fff', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
                            </div>
                            <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Changes cascade to the deal pipeline + connected inventory.</div>
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                {tel && <a href={`tel:${tel}`} style={{ flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 9, backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e', fontWeight: 700, textDecoration: 'none', fontSize: 13 }}>📞 Call</a>}
                                {tel && <a href={`https://wa.me/${tel.replace('+', '')}`} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 9, backgroundColor: 'rgba(37,211,102,0.15)', color: '#25d366', fontWeight: 700, textDecoration: 'none', fontSize: 13 }}>💬 WhatsApp</a>}
                            </div>
                            {contact.manager && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>🧑‍💼 Manager: <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{contact.manager}</span></div>}
                        </>
                    )}
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border-primary)' }}>
                    {(['overview', 'chat'] as const).map(t => (
                        <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '11px 0', background: 'none', border: 'none', borderBottom: tab === t ? '2px solid #4F46E5' : '2px solid transparent', color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                            {t === 'overview' ? 'Overview' : '💬 WhatsApp'}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                    {tab === 'chat' ? (
                        <WhatsAppChatTab phone={contact.phone_number} isMobile={isMobile} />
                    ) : (
                        <div style={{ padding: '14px 18px' }}>
                            {contact.demand && demandLine(contact.demand) && (
                                <div style={{ marginBottom: 16 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 6 }}>🔎 Requirement (looking for)</div>
                                    <div style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>{demandLine(contact.demand)}</div>
                                </div>
                            )}
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 6 }}>
                                    🏠 Inventory provided ({contact.inventory_count})
                                </div>
                                {contact.inventory_count === 0 ? (
                                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No inventory from this contact.</div>
                                ) : listings == null ? (
                                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading listings…</div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {listings.map((inv: any) => (
                                            <div key={inv.id} style={{ padding: '8px 10px', borderRadius: 8, backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                                                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{inv.taxonomy_node?.name || inv.flat_property_type?.name || inv.type || 'Property'} {inv.display_id ? <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {inv.display_id}</span> : null}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{[inv.locality, inv.city || inv.district].filter(Boolean).join(', ') || inv.location || ''}{inv.status && inv.status !== 'active' ? ` · ${inv.status}` : ''}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
