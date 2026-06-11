import React, { useEffect, useState, useRef } from 'react';
import {
    getPartner, updatePartner, verifyPartner, updatePartnerStatus,
    getPartnerInventory, getPartnerLeads, getPartnerCommissions, setPartnerPassword,
} from '../api/client';
import { loadGoogleMaps } from '../lib/loadGoogleMaps';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { PartnerReassignDialog } from './PartnerReassignDialog';

const isActive = (s: string) => s === 'ACTIVE' || s === 'active';
const PLAN_LABELS: Record<string, string> = { FREE: 'Free', PRO: 'Pro', ADVANCE_PRO: 'Advance Pro' };

const EMPTY_EDIT = {
    name: '', email: '', company_name: '', city: '', agency_name: '',
    business_name: '', business_address: '', registration_number: '',
    business_lat: null as number | null, business_lng: null as number | null,
    partner_type: '', partner_category: 'INDIVIDUAL',
    listing_limit: '', priority_score: '', commission_rate: '',
    subscription_start: '', subscription_end: '',
};

const dateInput = (v: any) => (v ? String(v).slice(0, 10) : '');

export function PartnerProfile({ partnerId, onBack }: { partnerId: string; onBack: () => void }) {
    const { agent } = useAuth();
    const { showToast } = useToast();
    const confirm = useConfirm();
    const isSuperBoss = agent?.role === 'super_boss';

    const [partner, setPartner] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState({ ...EMPTY_EDIT });
    const [saving, setSaving] = useState(false);
    // Google Places autocomplete on the City/Location field — only while editing. 2026-06-03.
    const cityRef = useRef<HTMLInputElement>(null);
    const cityAcRef = useRef<any>(null);
    useEffect(() => {
        if (!editMode) return;
        const key = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';
        if (!key) return;
        let cancelled = false;
        loadGoogleMaps().then(() => {
            if (cancelled || !cityRef.current || cityAcRef.current || !(window as any).google?.maps?.places) return;
            const ac = new (window as any).google.maps.places.Autocomplete(cityRef.current, {
                componentRestrictions: { country: 'in' }, fields: ['formatted_address', 'geometry'],
            });
            ac.addListener('place_changed', () => {
                const place = ac.getPlace();
                setForm(f => ({
                    ...f,
                    city: place.formatted_address || cityRef.current?.value || '',
                    business_lat: place.geometry?.location?.lat() ?? null,
                    business_lng: place.geometry?.location?.lng() ?? null,
                }));
            });
            cityAcRef.current = ac;
        }).catch(() => {});
        return () => {
            cancelled = true;
            if (cityAcRef.current && (window as any).google?.maps?.event) {
                (window as any).google.maps.event.clearInstanceListeners(cityAcRef.current);
                cityAcRef.current = null;
            }
        };
    }, [editMode]);

    const [tab, setTab] = useState<'listings' | 'leads' | 'commissions' | 'subagents'>('listings');
    const [listings, setListings] = useState<any[] | null>(null);
    const [leads, setLeads] = useState<any[] | null>(null);
    const [commissions, setCommissions] = useState<{ entries: any[]; total: number } | null>(null);

    const [reassign, setReassign] = useState(false);
    const [pwd, setPwd] = useState('');
    const [pwdSaving, setPwdSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const p = await getPartner(partnerId);
            setPartner(p);
            setForm({
                name: p.name || '', email: p.email || '', company_name: p.company_name || '',
                city: p.city || '', agency_name: p.agency_name || '', business_name: p.business_name || '',
                business_address: p.business_address || '', registration_number: p.registration_number || '',
                business_lat: p.business_lat ?? null, business_lng: p.business_lng ?? null,
                partner_type: p.partner_type || '', partner_category: p.partner_category || 'INDIVIDUAL',
                listing_limit: p.listing_limit ?? '', priority_score: p.priority_score ?? '',
                commission_rate: p.commission_rate ?? '', subscription_start: dateInput(p.subscription_start),
                subscription_end: dateInput(p.subscription_end),
            });
        } catch (e: any) {
            setError(e?.response?.data?.error || 'Failed to load partner');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [partnerId]);

    // Lazy-load tab data
    useEffect(() => {
        if (tab === 'listings' && listings === null) getPartnerInventory(partnerId).then(setListings).catch(() => setListings([]));
        if (tab === 'leads' && leads === null) getPartnerLeads(partnerId).then(setLeads).catch(() => setLeads([]));
        if (tab === 'commissions' && commissions === null) getPartnerCommissions(partnerId).then(setCommissions).catch(() => setCommissions({ entries: [], total: 0 }));
        /* eslint-disable-next-line */
    }, [tab]);

    const saveProfile = async () => {
        setSaving(true);
        try {
            await updatePartner(partnerId, { ...form });
            showToast('Profile updated', 'success');
            setEditMode(false);
            await load();
        } catch (e: any) {
            showToast(e?.response?.data?.error || 'Failed to save', 'error');
        } finally {
            setSaving(false);
        }
    };

    const doVerify = async () => {
        if (!(await confirm('Verify this partner? Sets status to ACTIVE.'))) return;
        try { await verifyPartner(partnerId, true); await load(); } catch { showToast('Failed to verify', 'error'); }
    };
    const doStatus = async (status: string) => {
        if (!(await confirm(`Change status to ${status}?`))) return;
        try { await updatePartnerStatus(partnerId, status); await load(); } catch { showToast('Failed to update status', 'error'); }
    };
    const savePassword = async () => {
        if (pwd.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }
        setPwdSaving(true);
        try { await setPartnerPassword(partnerId, pwd); setPwd(''); showToast('Portal password set', 'success'); }
        catch (e: any) { showToast(e?.response?.data?.error || 'Failed to set password', 'error'); }
        finally { setPwdSaving(false); }
    };

    if (loading) return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Loading partner…</div>;
    if (error || !partner) return (
        <div style={{ padding: 24 }}>
            <button onClick={onBack} style={backBtn}>← Back to Partner Agents</button>
            <div style={{ color: '#ef4444', marginTop: 16 }}>{error || 'Partner not found'}</div>
        </div>
    );

    const c = partner._counts || {};

    return (
        <div style={{ flex: 1, padding: 24, overflowY: 'auto', backgroundColor: 'var(--bg-primary)' }}>
            <button onClick={onBack} style={backBtn}>← Back to Partner Agents</button>

            {/* Header */}
            <div style={{ ...card, marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 20 }}>{partner.name || 'Unnamed'}</h2>
                        <span style={{ backgroundColor: partner.partner_category === 'COMPANY' ? '#8b5cf6' : '#06b6d4', padding: '2px 8px', borderRadius: 4, fontSize: 11, color: '#fff' }}>{partner.partner_category || 'INDIVIDUAL'}</span>
                        <span style={{ color: isActive(partner.status) ? '#22c55e' : '#ef4444', fontWeight: 600, fontSize: 13 }}>{partner.status}</span>
                        {!partner.verified && <span style={{ fontSize: 11, backgroundColor: '#fef3c7', color: '#92400e', padding: '1px 8px', borderRadius: 4 }}>Unverified</span>}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 6 }}>
                        {partner.phone_number}{partner.email ? ` · ${partner.email}` : ''} · Plan: {PLAN_LABELS[partner.package_type] || partner.package_type}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6 }}>
                        Manager: {partner.managing_agent?.name || '—'} · {c.listings ?? 0} listings · {c.leads ?? 0} leads · {c.commissions ?? 0} commissions
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {!partner.verified && <button onClick={doVerify} style={{ ...actBtn, backgroundColor: '#22c55e' }}>Verify</button>}
                    {isActive(partner.status)
                        ? <button onClick={() => doStatus('SUSPENDED')} style={{ ...actBtn, backgroundColor: '#ef4444' }}>Suspend</button>
                        : <button onClick={() => doStatus('ACTIVE')} style={{ ...actBtn, backgroundColor: '#3b82f6' }}>Activate</button>}
                    {isSuperBoss && <button onClick={() => setReassign(true)} style={{ ...actBtn, backgroundColor: '#8b5cf6' }}>Reassign Manager</button>}
                </div>
            </div>

            {/* Profile */}
            <div style={{ ...card, marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={sectionTitle}>Profile</h3>
                    {editMode
                        ? <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => { setEditMode(false); load(); }} style={ghostBtn}>Cancel</button>
                            <button onClick={saveProfile} disabled={saving} style={{ ...actBtn, backgroundColor: '#22c55e' }}>{saving ? 'Saving…' : 'Save'}</button>
                          </div>
                        : <button onClick={() => setEditMode(true)} style={ghostBtn}>✎ Edit</button>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    <Field label="Name"><input style={inp} value={form.name} disabled={!editMode} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
                    <Field label="Phone (read-only)"><input style={{ ...inp, opacity: 0.6 }} value={partner.phone_number} disabled /></Field>
                    <Field label="Email"><input style={inp} value={form.email} disabled={!editMode} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
                    <Field label="Category"><select style={inp} value={form.partner_category} disabled={!editMode} onChange={e => setForm({ ...form, partner_category: e.target.value })}><option value="INDIVIDUAL">Individual</option><option value="COMPANY">Company</option></select></Field>
                    <Field label="Company Name"><input style={inp} value={form.company_name} disabled={!editMode} onChange={e => setForm({ ...form, company_name: e.target.value })} /></Field>
                    <Field label="Agency Name"><input style={inp} value={form.agency_name} disabled={!editMode} onChange={e => setForm({ ...form, agency_name: e.target.value })} /></Field>
                    <Field label="Business Name"><input style={inp} value={form.business_name} disabled={!editMode} onChange={e => setForm({ ...form, business_name: e.target.value })} /></Field>
                    <Field label="City / Location"><input ref={cityRef} style={inp} value={form.city} disabled={!editMode} autoComplete="off" placeholder={editMode ? 'Search on Google Maps…' : ''} onChange={e => setForm({ ...form, city: e.target.value, business_lat: null, business_lng: null })} /></Field>
                    <Field label="Partner Type"><select style={inp} value={form.partner_type} disabled={!editMode} onChange={e => setForm({ ...form, partner_type: e.target.value })}><option value="">—</option><option value="HAS_PROPERTIES">Has Properties</option><option value="HAS_BUYERS">Has Buyers</option><option value="BOTH">Both</option></select></Field>
                    <Field label="Registration No. (Udyam/GSTIN)"><input style={inp} value={form.registration_number} disabled={!editMode} onChange={e => setForm({ ...form, registration_number: e.target.value })} /></Field>
                    <Field label="Listing Limit"><input style={inp} type="number" value={form.listing_limit} disabled={!editMode} onChange={e => setForm({ ...form, listing_limit: e.target.value })} /></Field>
                    <Field label="Priority Score"><input style={inp} type="number" value={form.priority_score} disabled={!editMode} onChange={e => setForm({ ...form, priority_score: e.target.value })} /></Field>
                    <Field label="Commission Rate (%)"><input style={inp} type="number" value={form.commission_rate} disabled={!editMode} onChange={e => setForm({ ...form, commission_rate: e.target.value })} /></Field>
                    <Field label="Subscription Start"><input style={inp} type="date" value={form.subscription_start} disabled={!editMode} onChange={e => setForm({ ...form, subscription_start: e.target.value })} /></Field>
                    <Field label="Subscription End"><input style={inp} type="date" value={form.subscription_end} disabled={!editMode} onChange={e => setForm({ ...form, subscription_end: e.target.value })} /></Field>
                    <Field label="Business Address" full><textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={form.business_address} disabled={!editMode} onChange={e => setForm({ ...form, business_address: e.target.value })} /></Field>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ ...card, marginTop: 16 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                    {([['listings', `Listings (${c.listings ?? 0})`], ['leads', `Leads & Deals (${c.leads ?? 0})`], ['commissions', `Commissions (${c.commissions ?? 0})`], ['subagents', `Sub-agents (${partner.sub_agents?.length ?? 0})`]] as const).map(([k, label]) => (
                        <button key={k} onClick={() => setTab(k)} style={{ ...tabBtn, ...(tab === k ? tabActive : {}) }}>{label}</button>
                    ))}
                </div>

                {tab === 'listings' && (listings === null ? <Muted text="Loading…" /> : listings.length === 0 ? <Muted text="No listings." /> :
                    <Table head={['Type', 'Location', 'Price', 'Status']} rows={listings.map(i => [
                        i.taxonomy_node?.name || i.flat_property_type?.name || i.type || '—',
                        i.full_address || i.location || i.city || '—',
                        i.display_price ? `₹${i.display_price}` : (i.price ? `₹${i.price}` : '—'),
                        i.status,
                    ])} />)}

                {tab === 'leads' && (leads === null ? <Muted text="Loading…" /> : leads.length === 0 ? <Muted text="No referred leads." /> :
                    <Table head={['Name', 'Phone', 'Type', 'Stage', 'Assigned']} rows={leads.map(l => [
                        l.name || '—', l.phone_number, l.contact_type || '—', l.lifecycle_stage || l.lead_status || '—', l.assigned_agent?.name || '—',
                    ])} />)}

                {tab === 'commissions' && (commissions === null ? <Muted text="Loading…" /> : commissions.entries.length === 0 ? <Muted text="No commission entries." /> :
                    <>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 8 }}>Total: ₹{commissions.total.toLocaleString('en-IN')}</div>
                        <Table head={['Amount', 'Currency', 'Notes', 'Date']} rows={commissions.entries.map(e => [
                            `₹${Number(e.amount).toLocaleString('en-IN')}`, e.currency, e.notes || '—', dateInput(e.entered_at),
                        ])} />
                    </>)}

                {tab === 'subagents' && ((partner.sub_agents?.length ?? 0) === 0 ? <Muted text="No sub-agents." /> :
                    <Table head={['Name', 'Phone', 'Plan', 'Status']} rows={partner.sub_agents.map((s: any) => [
                        s.name || '—', s.phone_number, PLAN_LABELS[s.package_type] || s.package_type, s.status,
                    ])} />)}
            </div>

            {/* Account */}
            <div style={{ ...card, marginTop: 16 }}>
                <h3 style={sectionTitle}>Account — Portal Password</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                    <input style={{ ...inp, maxWidth: 260 }} type="text" placeholder="Set a new portal password (min 6)" value={pwd} onChange={e => setPwd(e.target.value)} />
                    <button onClick={savePassword} disabled={pwdSaving} style={{ ...actBtn, backgroundColor: '#3b82f6' }}>{pwdSaving ? 'Saving…' : 'Set Password'}</button>
                </div>
            </div>

            {reassign && (
                <PartnerReassignDialog
                    partnerId={partner.id}
                    partnerName={partner.name}
                    currentManagerId={partner.managing_agent_id}
                    currentManagerName={partner.managing_agent?.name}
                    onClose={() => setReassign(false)}
                    onSuccess={() => { setReassign(false); load(); showToast('Partner reassigned', 'success'); }}
                />
            )}
        </div>
    );
}

function Field({ label, children, full }: { label: string; children: any; full?: boolean }) {
    return (
        <div style={full ? { gridColumn: '1 / -1' } : undefined}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>{label}</label>
            {children}
        </div>
    );
}
function Muted({ text }: { text: string }) { return <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>{text}</div>; }
function Table({ head, rows }: { head: string[]; rows: any[][] }) {
    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{head.map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-secondary)' }}>{h}</th>)}</tr></thead>
                <tbody>{rows.map((r, i) => <tr key={i} style={{ borderBottom: '1px solid var(--bg-primary)' }}>{r.map((cell, j) => <td key={j} style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)' }}>{cell}</td>)}</tr>)}</tbody>
            </table>
        </div>
    );
}

const card: React.CSSProperties = { backgroundColor: 'var(--bg-secondary)', borderRadius: 12, padding: 20, border: '1px solid var(--border-secondary)' };
const sectionTitle: React.CSSProperties = { margin: 0, color: 'var(--text-primary)', fontSize: 15 };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none' };
const actBtn: React.CSSProperties = { border: 'none', padding: '7px 14px', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const ghostBtn: React.CSSProperties = { border: '1px solid var(--border-secondary)', padding: '6px 12px', borderRadius: 8, background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 };
const backBtn: React.CSSProperties = { border: 'none', background: 'transparent', color: '#3b82f6', cursor: 'pointer', fontSize: 14, fontWeight: 600, padding: 0 };
const tabBtn: React.CSSProperties = { border: '1px solid var(--border-secondary)', padding: '6px 12px', borderRadius: 8, background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 };
const tabActive: React.CSSProperties = { backgroundColor: '#1e3a5f', color: '#60a5fa', border: '1px solid #3b82f6' };

export default PartnerProfile;
