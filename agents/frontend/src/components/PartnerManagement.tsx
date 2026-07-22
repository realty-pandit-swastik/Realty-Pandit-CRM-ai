import React, { useEffect, useState, useRef } from 'react';
import { getPartners, verifyPartner, updatePartnerStatus, updatePartnerPackage, updatePartnerCategory, createPartner } from '../api/client';
import { loadGoogleMaps } from '../lib/loadGoogleMaps';
import { useAuth } from '../contexts/AuthContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { PartnerReassignDialog } from './PartnerReassignDialog';
import PartnerProfile from './PartnerProfile';

interface Partner {
    id: string;
    phone_number: string;
    name: string;
    email?: string;
    agency_name?: string;
    partner_type: string;
    partner_category: 'INDIVIDUAL' | 'COMPANY';
    verified: boolean;
    status: string;
    package_type: string;
    business_name?: string;
    business_address?: string;
    registration_number?: string;
    managing_agent_id?: string;
    managing_agent?: { name: string; email: string };
    created_at: string;
}

const initialFormData = {
    phone_number: '', name: '', email: '',
    partner_category: 'INDIVIDUAL' as 'INDIVIDUAL' | 'COMPANY',
    business_name: '', business_address: '', registration_number: '',
    business_lat: null as number | null, business_lng: null as number | null,
    agency_name: '',
    partner_type: 'HAS_PROPERTIES', package_type: 'FREE'
};

const PLAN_LABELS: Record<string, string> = { FREE: 'Free', PRO: 'Pro', ADVANCE_PRO: 'Advance Pro' };
const PLAN_COLORS: Record<string, string> = { FREE: '#6b7280', PRO: '#3b82f6', ADVANCE_PRO: '#f59e0b' };

const isActive = (status: string) => status === 'ACTIVE' || status === 'active';

export function PartnerManagement() {
    const { hasPermission, agent } = useAuth();
    const isMobile = useIsMobile();
    const { showToast } = useToast();
    const confirm = useConfirm();
    const [partners, setPartners] = useState<Partner[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [filterPlan, setFilterPlan] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState(initialFormData);
    const [formLoading, setFormLoading] = useState(false);
    // Google Places autocomplete on the partner Location/Address field — reuses the lead pattern
    // (loadGoogleMaps + google.maps.places.Autocomplete) so typing fetches a real Google place.
    // Re-inits whenever the form opens (the input only exists while showForm). 2026-06-03.
    const addrRef = useRef<HTMLInputElement>(null);
    const addrAcRef = useRef<any>(null);
    useEffect(() => {
        if (!showForm) return;
        const key = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';
        if (!key) return;
        let cancelled = false;
        loadGoogleMaps().then(() => {
            if (cancelled || !addrRef.current || addrAcRef.current || !(window as any).google?.maps?.places) return;
            const ac = new (window as any).google.maps.places.Autocomplete(addrRef.current, {
                componentRestrictions: { country: 'in' }, fields: ['formatted_address', 'geometry'],
            });
            ac.addListener('place_changed', () => {
                const place = ac.getPlace();
                setFormData(f => ({
                    ...f,
                    business_address: place.formatted_address || addrRef.current?.value || '',
                    business_lat: place.geometry?.location?.lat() ?? null,
                    business_lng: place.geometry?.location?.lng() ?? null,
                }));
            });
            addrAcRef.current = ac;
        }).catch(() => {});
        return () => {
            cancelled = true;
            if (addrAcRef.current && (window as any).google?.maps?.event) {
                (window as any).google.maps.event.clearInstanceListeners(addrAcRef.current);
                addrAcRef.current = null;
            }
        };
    }, [showForm]);
    const [formError, setFormError] = useState('');
    // Reassignment dialog state (super_boss only — see middleman model 2026-04-17)
    const [reassignTarget, setReassignTarget] = useState<Partner | null>(null);
    const [profileId, setProfileId] = useState<string | null>(null);
    const isSuperBoss = agent?.role === 'super_boss';

    useEffect(() => {
        loadPartners();
    }, []);

    const loadPartners = async () => {
        try {
            const data = await getPartners();
            setPartners(data);
        } catch (err) {
            console.error('Failed to load partners', err);
            setError('Failed to load partners');
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async (id: string) => {
        const ok = await confirm('Verify this partner? This will set their status to ACTIVE.');
        if (!ok) return;
        try {
            await verifyPartner(id, true);
            await loadPartners();
        } catch {
            showToast('Failed to verify partner', 'error');
        }
    };

    const handleStatusChange = async (id: string, newStatus: string) => {
        const ok = await confirm(`Change status to ${newStatus}?`);
        if (!ok) return;
        try {
            await updatePartnerStatus(id, newStatus);
            await loadPartners();
        } catch {
            showToast('Failed to update status', 'error');
        }
    };

    const handlePackageChange = async (id: string, pkg: string) => {
        const ok = await confirm(`Change plan to ${PLAN_LABELS[pkg] || pkg}?`);
        if (!ok) return;
        try {
            await updatePartnerPackage(id, pkg);
            await loadPartners();
        } catch {
            showToast('Failed to update plan', 'error');
        }
    };

    // COMPANY partners get the "My Team" screen and can build their own team of sub-agents.
    // Self-registered partners always land INDIVIDUAL — promoting them is OUR decision, made here.
    const handleCategoryChange = async (id: string, name: string, category: string) => {
        const ok = await confirm(
            category === 'COMPANY'
                ? `Make ${name} a Company? They'll be able to add their own team members and assign their leads, deals and listings to them.`
                : `Make ${name} an Individual? They'll lose the My Team screen.`
        );
        if (!ok) return;
        try {
            await updatePartnerCategory(id, category as 'INDIVIDUAL' | 'COMPANY');
            showToast(category === 'COMPANY' ? `${name} can now build a team.` : `${name} is now an individual.`, 'success');
            await loadPartners();
        } catch (err: any) {
            // e.g. "still has N team member(s)" or "is a team member of another partner"
            showToast(err.response?.data?.error || 'Failed to update partner type', 'error');
        }
    };

    const handleCreatePartner = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        setFormLoading(true);
        try {
            await createPartner(formData);
            setShowForm(false);
            setFormData(initialFormData);
            await loadPartners();
        } catch (err: any) {
            setFormError(err.response?.data?.error || 'Failed to create partner');
        } finally {
            setFormLoading(false);
        }
    };

    if (!hasPermission('manage_agents')) {
        return <div style={{ padding: '24px', color: '#ef4444' }}>Access Denied</div>;
    }

    if (loading) {
        return <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>Loading partners...</div>;
    }

    // Full-page partner profile (replaces the list view) — see PartnerProfile.tsx
    if (profileId) {
        return <PartnerProfile partnerId={profileId} onBack={() => { setProfileId(null); loadPartners(); }} />;
    }

    const filtered = partners.filter(p => {
        const q = search.toLowerCase();
        const matchSearch = !q ||
            p.name.toLowerCase().includes(q) ||
            p.phone_number.includes(q) ||
            (p.business_name ?? '').toLowerCase().includes(q) ||
            (p.email ?? '').toLowerCase().includes(q);
        const matchPlan = !filterPlan || p.package_type === filterPlan;
        const matchStatus = !filterStatus || p.status.toUpperCase() === filterStatus;
        return matchSearch && matchPlan && matchStatus;
    });

    return (
        <div style={{ flex: 1, padding: '24px', overflowY: 'auto', backgroundColor: 'var(--bg-primary)' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '20px' }}>Partner Agents</h2>
                    <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '13px' }}>
                        {filtered.length} of {partners.length} partner{partners.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <button
                    onClick={() => { setShowForm(!showForm); setFormError(''); }}
                    style={{ backgroundColor: '#3b82f6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 500 }}
                >
                    {showForm ? '✕ Cancel' : '+ Register Partner'}
                </button>
            </div>

            {/* Search + Filter bar */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <input
                    type="text"
                    placeholder="Search by name, phone, business..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ ...filterInputStyle, flex: isMobile ? '1 1 100%' : '1 1 200px' }}
                />
                <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)} style={filterInputStyle}>
                    <option value="">All Plans</option>
                    <option value="FREE">Free</option>
                    <option value="PRO">Pro</option>
                    <option value="ADVANCE_PRO">Advance Pro</option>
                </select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={filterInputStyle}>
                    <option value="">All Status</option>
                    <option value="ACTIVE">Active</option>
                    <option value="SUSPENDED">Suspended</option>
                    <option value="EXPIRED">Expired</option>
                    <option value="PENDING_PAYMENT">Pending Payment</option>
                </select>
                {(search || filterPlan || filterStatus) && (
                    <button
                        onClick={() => { setSearch(''); setFilterPlan(''); setFilterStatus(''); }}
                        style={{ ...filterInputStyle, cursor: 'pointer', backgroundColor: 'transparent', color: '#ef4444', border: '1px solid #ef4444' }}
                    >
                        Clear
                    </button>
                )}
            </div>

            {error && <div style={{ color: '#ef4444', marginBottom: '16px' }}>{error}</div>}

            {/* Registration Form */}
            {showForm && (
                <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', marginBottom: '24px', border: '1px solid var(--border-secondary)' }}>
                    <h3 style={{ color: 'var(--text-primary)', margin: '0 0 16px', fontSize: '15px' }}>Register New Partner Agent</h3>
                    {formError && <div style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error-text)', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', fontSize: '13px' }}>{formError}</div>}
                    <form onSubmit={handleCreatePartner} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                        {/* 2026-05-15: Business model changed to commission-on-sale.
                            Only name + phone_number are required. Everything else is optional
                            and can be filled later (by the partner from their portal, or by
                            our admin team via the edit flow). No subscription tiers. */}
                        <input placeholder="WhatsApp Number (10 digits) *" value={formData.phone_number} required maxLength={10}
                            onChange={e => setFormData({ ...formData, phone_number: e.target.value.replace(/\D/g, '') })} style={formInputStyle} />
                        <input placeholder="Full Name *" value={formData.name} required
                            onChange={e => setFormData({ ...formData, name: e.target.value })} style={formInputStyle} />
                        <input placeholder="Email Address (optional)" type="email" value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })} style={formInputStyle} />
                        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '16px', alignItems: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                            <span>Partner Type (optional):</span>
                            {(['INDIVIDUAL', 'COMPANY'] as const).map(cat => (
                                <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '13px' }}>
                                    <input type="radio" name="partner_category" value={cat}
                                        checked={formData.partner_category === cat}
                                        onChange={() => setFormData({ ...formData, partner_category: cat })} />
                                    {cat === 'INDIVIDUAL' ? 'Individual Dealer' : 'Company / Group'}
                                </label>
                            ))}
                        </div>
                        <input placeholder="Business Name (optional)" value={formData.business_name}
                            onChange={e => setFormData({ ...formData, business_name: e.target.value })} style={formInputStyle} />
                        <input placeholder="Agency Name (optional)" value={formData.agency_name}
                            onChange={e => setFormData({ ...formData, agency_name: e.target.value })} style={formInputStyle} />
                        <input ref={addrRef} placeholder="Location / Business Address — search on Google Maps…" value={formData.business_address}
                            onChange={e => setFormData({ ...formData, business_address: e.target.value, business_lat: null, business_lng: null })}
                            autoComplete="off" name="rp-partner-location" style={{ ...formInputStyle, gridColumn: '1 / -1' }} />
                        <input placeholder="Udyam / GSTIN / Registration No. (optional)" value={formData.registration_number}
                            onChange={e => setFormData({ ...formData, registration_number: e.target.value })} style={formInputStyle} />
                        <select value={formData.partner_type} onChange={e => setFormData({ ...formData, partner_type: e.target.value })} style={formInputStyle}>
                            <option value="BOTH">Has Both Properties & Buyers</option>
                            <option value="HAS_PROPERTIES">Has Properties</option>
                            <option value="HAS_BUYERS">Has Buyers</option>
                        </select>
                        <div style={{ gridColumn: '1 / -1', padding: '8px 12px', backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                            💡 Free onboarding · unlimited listings · we earn commission on closed deals only
                        </div>
                        <button type="submit" disabled={formLoading}
                            style={{ gridColumn: '1 / -1', backgroundColor: '#22c55e', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', cursor: formLoading ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 500, opacity: formLoading ? 0.7 : 1 }}>
                            {formLoading ? 'Registering...' : '✓ Register Partner Agent'}
                        </button>
                    </form>
                </div>
            )}

            {/* Partners List */}
            {isMobile ? (
                /* Mobile: Card layout */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {filtered.map(p => (
                        <div key={p.id} style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border-secondary)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                                <div>
                                    <div onClick={() => setProfileId(p.id)} title="Open profile" style={{ fontWeight: 600, color: '#60a5fa', fontSize: '15px', cursor: 'pointer' }}>
                                        {p.name}
                                    </div>
                                    {p.business_name && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{p.business_name}</div>}
                                </div>
                                <span style={{ color: isActive(p.status) ? '#22c55e' : '#ef4444', fontWeight: 600, fontSize: '12px' }}>{p.status}</span>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{p.phone_number}</span>
                                <span style={{ backgroundColor: p.partner_category === 'COMPANY' ? '#8b5cf6' : '#06b6d4', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', color: '#fff' }}>
                                    {p.partner_category || 'INDIVIDUAL'}
                                </span>
                                <span style={{ color: PLAN_COLORS[p.package_type] ?? '#6b7280', fontWeight: 600, fontSize: '12px' }}>
                                    {PLAN_LABELS[p.package_type] ?? p.package_type}
                                </span>
                                {!p.verified && <span style={{ fontSize: '10px', backgroundColor: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '4px' }}>Unverified</span>}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <button onClick={() => setProfileId(p.id)} style={{ ...btnStyle, backgroundColor: '#6366f1', padding: '6px 12px' }}>Manage</button>
                                <select value={p.package_type} onChange={e => handlePackageChange(p.id, e.target.value)}
                                    style={{ fontSize: '12px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                                    <option value="FREE">Free</option>
                                    <option value="PRO">Pro</option>
                                    <option value="ADVANCE_PRO">Advance Pro</option>
                                </select>
                                {/* Company partners get "My Team" and can assign their own leads/deals/listings to their own agents. */}
                                <select value={p.partner_category} onChange={e => handleCategoryChange(p.id, p.name, e.target.value)}
                                    title="Company partners can build their own team"
                                    style={{ fontSize: '12px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                                    <option value="INDIVIDUAL">Individual</option>
                                    <option value="COMPANY">Company (can build a team)</option>
                                </select>
                                {!p.verified && (
                                    <button onClick={() => handleVerify(p.id)} style={{ ...btnStyle, backgroundColor: '#22c55e', padding: '6px 12px' }}>Verify</button>
                                )}
                                {isActive(p.status) ? (
                                    <button onClick={() => handleStatusChange(p.id, 'SUSPENDED')} style={{ ...btnStyle, backgroundColor: '#ef4444', padding: '6px 12px' }}>Suspend</button>
                                ) : (
                                    <button onClick={() => handleStatusChange(p.id, 'ACTIVE')} style={{ ...btnStyle, backgroundColor: '#3b82f6', padding: '6px 12px' }}>Activate</button>
                                )}
                                {isSuperBoss && (
                                    <button onClick={() => setReassignTarget(p)} style={{ ...btnStyle, backgroundColor: '#8b5cf6', padding: '6px 12px' }}>Reassign</button>
                                )}
                            </div>
                        </div>
                    ))}
                    {filtered.length === 0 && (
                        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            {partners.length === 0 ? 'No partner agents registered yet.' : 'No partners match your filters.'}
                        </div>
                    )}
                </div>
            ) : (
                /* Desktop: Table layout */
                <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-secondary)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)' }}>
                                {['Name / Business', 'Phone', 'Category', 'Plan', 'Manager', 'Status', 'Actions'].map(h => (
                                    <th key={h} style={{ textAlign: 'left', padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(p => (
                                <tr key={p.id} style={{ borderBottom: '1px solid var(--bg-primary)' }}>
                                    <td style={cellStyle}>
                                        <div onClick={() => setProfileId(p.id)} title="Open profile" style={{ fontWeight: 500, color: '#60a5fa', cursor: 'pointer' }}>
                                            {p.name}
                                        </div>
                                        {p.business_name && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{p.business_name}</div>}
                                        {!p.verified && <span style={{ fontSize: '10px', backgroundColor: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '4px' }}>Unverified</span>}
                                    </td>
                                    <td style={cellStyle}>{p.phone_number}</td>
                                    <td style={cellStyle}>
                                        <span style={{ backgroundColor: p.partner_category === 'COMPANY' ? '#8b5cf6' : '#06b6d4', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', color: '#fff' }}>
                                            {p.partner_category || 'INDIVIDUAL'}
                                        </span>
                                    </td>
                                    <td style={cellStyle}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ color: PLAN_COLORS[p.package_type] ?? '#6b7280', fontWeight: 600, fontSize: '13px' }}>
                                                {PLAN_LABELS[p.package_type] ?? p.package_type}
                                            </span>
                                            <select
                                                value={p.package_type}
                                                onChange={e => handlePackageChange(p.id, e.target.value)}
                                                style={{ fontSize: '11px', padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' }}
                                            >
                                                <option value="FREE">Free</option>
                                                <option value="PRO">Pro</option>
                                                <option value="ADVANCE_PRO">Advance Pro</option>
                                            </select>
                                        </div>
                                    </td>
                                    <td style={cellStyle}>
                                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{p.managing_agent?.name || '—'}</span>
                                    </td>
                                    <td style={cellStyle}>
                                        <span style={{ color: isActive(p.status) ? '#22c55e' : '#ef4444', fontWeight: 500, fontSize: '13px' }}>
                                            {p.status}
                                        </span>
                                    </td>
                                    <td style={cellStyle}>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            <button onClick={() => setProfileId(p.id)} style={{ ...btnStyle, backgroundColor: '#6366f1' }}>Manage</button>
                                            {!p.verified && (
                                                <button onClick={() => handleVerify(p.id)} style={{ ...btnStyle, backgroundColor: '#22c55e' }}>Verify</button>
                                            )}
                                            {isActive(p.status) ? (
                                                <button onClick={() => handleStatusChange(p.id, 'SUSPENDED')} style={{ ...btnStyle, backgroundColor: '#ef4444' }}>Suspend</button>
                                            ) : (
                                                <button onClick={() => handleStatusChange(p.id, 'ACTIVE')} style={{ ...btnStyle, backgroundColor: '#3b82f6' }}>Activate</button>
                                            )}
                                            {isSuperBoss && (
                                                <button onClick={() => setReassignTarget(p)} style={{ ...btnStyle, backgroundColor: '#8b5cf6' }}>Reassign</button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        {partners.length === 0 ? 'No partner agents registered yet.' : 'No partners match your filters.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Reassignment dialog (super_boss only) */}
            {reassignTarget && (
                <PartnerReassignDialog
                    partnerId={reassignTarget.id}
                    partnerName={reassignTarget.name}
                    currentManagerId={reassignTarget.managing_agent_id}
                    currentManagerName={reassignTarget.managing_agent?.name}
                    onClose={() => setReassignTarget(null)}
                    onSuccess={(result) => {
                        const total = result.counts.inventory + result.counts.contacts + result.counts.transactions;
                        showToast(
                            `Reassigned ${reassignTarget.name}. ${total} asset${total === 1 ? '' : 's'} transferred.`,
                            'success',
                        );
                        setReassignTarget(null);
                        loadPartners();
                    }}
                />
            )}
        </div>
    );
}

const cellStyle: React.CSSProperties = { padding: '12px 16px', color: 'var(--text-bright)', fontSize: '14px' };

const filterInputStyle: React.CSSProperties = {
    padding: '8px 12px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-secondary)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    outline: 'none',
};

const formInputStyle: React.CSSProperties = {
    padding: '10px 12px',
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border-secondary)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box'
};

const btnStyle: React.CSSProperties = {
    border: 'none',
    padding: '5px 10px',
    borderRadius: '6px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500
};
