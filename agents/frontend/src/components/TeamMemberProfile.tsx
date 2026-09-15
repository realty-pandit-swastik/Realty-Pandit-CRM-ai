
import { useEffect, useState } from 'react';
import PhoneInput from './PhoneInput';
import { useAuth } from '../contexts/AuthContext';
import { EmailAccountCard } from './EmailAccountCard';
import { GoogleAccountCard } from './GoogleAccountCard';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import client, { getTeamMemberProfile, updateTeamMemberManager, setMemberPassword, resendSetupLink, getUserPerformance, getSpeedToLead } from '../api/client';
import { RankedBars } from './dashboard/analytics/charts';
import { formatNum, formatINR, formatMins } from './dashboard/analytics/clay';

interface MemberProfile {
    id: string;
    name: string;
    email: string;
    phone?: string;
    personal_email?: string;
    nine9acres_email?: string;
    magicbricks_email?: string;
    role: string;
    department?: string;
    status: string;
    last_login_at?: string;
    created_at: string;
    reports_to?: { id: string; name: string; role: string } | null;
    subordinates: { id: string; name: string; role: string; department?: string; status: string }[];
    _count?: { assigned_leads: number };
}

interface ManagerOption {
    id: string;
    name: string;
    role: string;
}

const DEPARTMENTS = [
    { value: 'property_sales', label: 'Property Sales Staff' },
    { value: 'operations', label: 'Operations' },
    { value: 'management', label: 'Management' },
    { value: 'software_sales', label: 'Software Sales' },
];

const ROLE_COLORS: Record<string, string> = {
    super_boss: '#ef4444', manager: '#f59e0b', employee: '#22c55e',
};

// Phase 5D — productivity category → colour (mirrors UserPerformanceDashboard).
const catColor = (cat: string): string =>
    cat === 'Excellent' ? '#22c55e' : cat === 'Good' ? '#3b82f6' : cat === 'Average' ? '#f59e0b' : '#ef4444';

interface AgentPerf {
    agent_id: string;
    productivity_score: number;
    productivity_category: string;
    leads_assigned: number;
    deals_closed: number;
    revenue_generated: number;
    commission?: number;
    components?: { leads: number; conversion: number; appointments: number; inventory: number };
    avg_response_min?: number | null;
}

export function TeamMemberProfile({
    memberId,
    onBack,
    onReload,
}: {
    memberId: string;
    onBack: () => void;
    onReload?: () => void;
}) {
    const { agent } = useAuth();
    const { showToast } = useToast();
    const confirm = useConfirm();

    const [profile, setProfile] = useState<MemberProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [managers, setManagers] = useState<ManagerOption[]>([]);

    // Edit details state
    const [editMode, setEditMode] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', phone: '', department: '', role: '', personal_email: '', nine9acres_email: '', magicbricks_email: '' });
    const [editLoading, setEditLoading] = useState(false);
    const [editError, setEditError] = useState('');

    // Manager assignment state
    const [editingManager, setEditingManager] = useState(false);
    const [selectedManagerId, setSelectedManagerId] = useState<string>('');
    const [savingManager, setSavingManager] = useState(false);

    // Set Password state
    const [setPwdValue, setSetPwdValue] = useState('');
    const [setPwdShow, setSetPwdShow] = useState(false);
    const [pwdLoading, setPwdLoading] = useState(false);
    const [pwdSuccess, setPwdSuccess] = useState(false);
    const [pwdError, setPwdError] = useState('');
    const [showPwdPanel, setShowPwdPanel] = useState(false);

    // Performance scorecard (Phase 5D) — evaluators only.
    const [perf, setPerf] = useState<AgentPerf | null>(null);
    const [perfLoaded, setPerfLoaded] = useState(false);

    const isSuperBoss = agent?.role === 'super_boss';
    const isManager = agent?.role === 'manager';
    const isSelf = agent?.id === memberId;
    const canManage = isSuperBoss && !isSelf;
    // Portal lead-routing emails are editable by manager + super_boss (and self) — broader than canManage. (2026-06-25)
    const canEditDetails = canManage || isSelf || (isManager && !isSelf);

    useEffect(() => { load(); }, [memberId]);

    // Fetch the member's productivity row (role-scoped server-side) + response time. Phase 5D.
    useEffect(() => {
        if (!(isSuperBoss || isManager)) { setPerfLoaded(true); return; }
        let cancelled = false;
        setPerfLoaded(false);
        const to = new Date();
        const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
        const range = { from: from.toISOString(), to: to.toISOString() };
        Promise.all([
            getUserPerformance(range).catch(() => ({ performance: [] })),
            getSpeedToLead(range).catch(() => ({ by_agent: [] })),
        ]).then(([up, stl]) => {
            if (cancelled) return;
            const row = ((up?.performance || []) as AgentPerf[]).find((r) => r.agent_id === memberId) || null;
            const stlRow = ((stl?.by_agent || []) as Array<{ agent_id: string; avg_minutes: number }>).find((s) => s.agent_id === memberId);
            setPerf(row ? { ...row, avg_response_min: stlRow?.avg_minutes ?? null } : null);
            setPerfLoaded(true);
        });
        return () => { cancelled = true; };
    }, [memberId, isSuperBoss, isManager]);

    const load = async () => {
        setLoading(true);
        try {
            const [memberRes, teamRes] = await Promise.all([
                getTeamMemberProfile(memberId),
                isSuperBoss ? client.get('/api/team/members') : Promise.resolve({ data: [] }),
            ]);
            setProfile(memberRes);
            setSelectedManagerId(memberRes.reports_to?.id || '');
            if (isSuperBoss) {
                const allMembers: ManagerOption[] = teamRes.data;
                setManagers(allMembers.filter((m: ManagerOption) => m.id !== memberId && (m.role === 'manager' || m.role === 'super_boss')));
            }
        } catch {
            showToast('Failed to load profile', 'error');
        } finally {
            setLoading(false);
        }
    };

    const startEdit = () => {
        if (!profile) return;
        setEditForm({
            name: profile.name,
            phone: profile.phone?.replace(/^\+91/, '') || '',
            department: profile.department || '',
            role: profile.role,
            personal_email: profile.personal_email || '',
            nine9acres_email: profile.nine9acres_email || '',
            magicbricks_email: profile.magicbricks_email || '',
        });
        setEditMode(true);
        setEditError('');
    };

    const handleSaveDetails = async () => {
        if (!profile) return;
        setEditLoading(true);
        setEditError('');
        try {
            const payload: any = {};
            if (editForm.name.trim() && editForm.name.trim() !== profile.name) payload.name = editForm.name.trim();
            if (editForm.phone !== (profile.phone?.replace(/^\+91/, '') || '')) payload.phone = editForm.phone;
            if (editForm.department !== (profile.department || '')) payload.department = editForm.department;
            if (isSuperBoss && editForm.role !== profile.role) payload.role = editForm.role;
            const portalClean = editForm.personal_email.trim().toLowerCase();
            if (portalClean !== (profile.personal_email || '')) payload.personal_email = portalClean;
            const acres99Clean = editForm.nine9acres_email.trim().toLowerCase();
            if (acres99Clean !== (profile.nine9acres_email || '')) payload.nine9acres_email = acres99Clean;
            const mbClean = editForm.magicbricks_email.trim().toLowerCase();
            if (mbClean !== (profile.magicbricks_email || '')) payload.magicbricks_email = mbClean;

            if (Object.keys(payload).length > 0) {
                await client.patch(`/api/team/members/${memberId}`, payload);
                showToast('Profile updated', 'success');
                setEditMode(false);
                await load();
                onReload?.();
            } else {
                setEditMode(false);
            }
        } catch (err: any) {
            setEditError(err?.response?.data?.error || 'Update failed');
        } finally {
            setEditLoading(false);
        }
    };

    const handleSaveManager = async () => {
        setSavingManager(true);
        try {
            await updateTeamMemberManager(memberId, selectedManagerId || null);
            showToast('Manager updated', 'success');
            setEditingManager(false);
            await load();
            onReload?.();
        } catch (err: any) {
            showToast(err?.response?.data?.error || 'Update failed', 'error');
        } finally {
            setSavingManager(false);
        }
    };

    const handleToggleStatus = async () => {
        if (!profile) return;
        const action = profile.status === 'active' ? 'Deactivate' : 'Reactivate';
        const ok = await confirm(`${action} ${profile.name}?`);
        if (!ok) return;
        try {
            await client.patch(`/api/team/members/${memberId}/deactivate`, {
                status: profile.status === 'active' ? 'inactive' : 'active',
            });
            showToast(`${profile.name} ${action.toLowerCase()}d`, 'success');
            await load();
            onReload?.();
        } catch (err: any) {
            showToast(err?.response?.data?.error || 'Failed', 'error');
        }
    };

    const handleResetPassword = async () => {
        if (!profile) return;
        const ok = await confirm(`Reset password for ${profile.name}?`);
        if (!ok) return;
        try {
            await client.patch(`/api/team/members/${memberId}/reset-password`);
            showToast('Password reset — setup link sent to WhatsApp', 'success');
        } catch (err: any) {
            showToast(err?.response?.data?.error || 'Failed', 'error');
        }
    };

    const handleResendSetup = async () => {
        if (!profile) return;
        const ok = await confirm(`Resend setup link to ${profile.name} on WhatsApp?`);
        if (!ok) return;
        try {
            await resendSetupLink(memberId);
            showToast('Setup link sent', 'success');
        } catch (err: any) {
            showToast(err?.response?.data?.error || 'Failed', 'error');
        }
    };

    const generateRandomPassword = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let pwd = '';
        for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
        setSetPwdValue(pwd);
        setSetPwdShow(true);
    };

    const handleSetPassword = async () => {
        if (setPwdValue.length < 6) { setPwdError('Password must be at least 6 characters.'); return; }
        setPwdLoading(true);
        setPwdError('');
        try {
            await setMemberPassword(memberId, setPwdValue);
            setPwdSuccess(true);
            setSetPwdShow(true);
        } catch (err: any) {
            setPwdError(err?.response?.data?.error || 'Failed');
        } finally {
            setPwdLoading(false);
        }
    };

    if (loading) {
        return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading profile...</div>;
    }
    if (!profile) return null;

    const isMobile = window.innerWidth < 768;

    return (
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px' : '24px', backgroundColor: 'var(--bg-primary)' }}>

            {/* Back */}
            <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: 'var(--text-link)', cursor: 'pointer', fontSize: '14px', marginBottom: '20px', padding: 0 }}>
                ← Back to Team
            </button>

            {/* ─── Header card ─────────────────────────────────────────── */}
            <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '14px', padding: '24px', marginBottom: '16px', border: '1px solid var(--border-secondary)' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

                    {/* Avatar */}
                    <div style={{
                        width: '56px', height: '56px', borderRadius: '50%', flexShrink: 0,
                        backgroundColor: ROLE_COLORS[profile.role] + '22', border: `2px solid ${ROLE_COLORS[profile.role]}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '22px', fontWeight: 700, color: ROLE_COLORS[profile.role],
                    }}>
                        {profile.name.charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '20px' }}>
                                {profile.name}
                                {isSelf && <span style={{ color: 'var(--text-link)', fontSize: '13px', marginLeft: '8px' }}>(you)</span>}
                            </h2>
                            <RoleBadge role={profile.role} />
                            {profile.status === 'inactive' && (
                                <span style={{ backgroundColor: '#f87171', color: '#fff', borderRadius: '10px', padding: '2px 8px', fontSize: '11px', fontWeight: 600 }}>INACTIVE</span>
                            )}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{profile.email}</div>
                    </div>

                    {/* Stats */}
                    <div style={{ display: 'flex', gap: '16px', flexShrink: 0, alignItems: 'center' }}>
                        <StatPill label="Leads" value={profile._count?.assigned_leads ?? 0} color="#3b82f6" />
                        <StatPill label="Joined" value={new Date(profile.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} color="#94a3b8" />
                        <StatPill label="Last Login" value={profile.last_login_at ? new Date(profile.last_login_at).toLocaleDateString('en-IN') : 'Never'} color="#94a3b8" />
                    </div>
                </div>
            </div>

            {/* ─── Performance scorecard (Phase 5D) — evaluators only ──── */}
            {(isSuperBoss || isManager) && perfLoaded && (
                <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', marginBottom: '16px', border: '1px solid var(--border-secondary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary)' }}>
                            Performance <span style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 400 }}>· last 30 days</span>
                        </h3>
                        {perf && (
                            <span style={{ fontSize: '12px', fontWeight: 700, color: catColor(perf.productivity_category), backgroundColor: catColor(perf.productivity_category) + '1a', borderRadius: '8px', padding: '4px 10px' }}>
                                {formatNum(perf.productivity_score)} · {perf.productivity_category}
                            </span>
                        )}
                    </div>
                    {perf ? (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                                <StatPill label="Deals" value={formatNum(perf.deals_closed)} color="#22c55e" />
                                <StatPill label="Revenue" value={formatINR(perf.revenue_generated)} color="#f59e0b" />
                                <StatPill label="Commission" value={formatINR(perf.commission ?? 0)} color="#8b5cf6" />
                                <StatPill label="Avg Response" value={formatMins(perf.avg_response_min)} color="#06b6d4" />
                            </div>
                            {perf.components && (
                                <>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Score Composition (0–100 each)</div>
                                    <RankedBars
                                        rows={[
                                            { label: 'Leads', count: perf.components.leads },
                                            { label: 'Conversion', count: perf.components.conversion },
                                            { label: 'Appointments', count: perf.components.appointments },
                                            { label: 'Inventory', count: perf.components.inventory },
                                        ]}
                                        color="#8b5cf6"
                                    />
                                </>
                            )}
                        </>
                    ) : (
                        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No performance data for this member in the last 30 days.</div>
                    )}
                </div>
            )}

            {/* ─── Email Sending Account (self only, T9b) ──────────────── */}
            {isSelf && <EmailAccountCard isMobile={isMobile} />}

            {/* ─── Google Calendar & Tasks link (self only, 2026-05-18) ── */}
            {isSelf && <GoogleAccountCard isMobile={isMobile} />}

            {/* ─── Edit Details panel ──────────────────────────────────── */}
            <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', marginBottom: '16px', border: '1px solid var(--border-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>Profile Details</span>
                    {canEditDetails && !editMode && (
                        <button onClick={startEdit} style={smallBtnStyle('#3b82f6')}>✏️ Edit</button>
                    )}
                </div>

                {editMode ? (
                    /* ── Edit form ── */
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                        {editError && <div style={{ gridColumn: '1 / -1', ...errorBoxStyle }}>{editError}</div>}

                        <Field label="Full Name">
                            <input
                                value={editForm.name}
                                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                placeholder="Full name"
                                style={inputStyle}
                            />
                        </Field>

                        <Field label="Phone (10 digits)">
                            <PhoneInput
                                value={editForm.phone}
                                onChange={v => setEditForm({ ...editForm, phone: v })}
                                placeholder="9876543210"
                                style={inputStyle}
                            />
                        </Field>

                        <Field label="Department">
                            <select title="Department" value={editForm.department} onChange={e => setEditForm({ ...editForm, department: e.target.value })} style={inputStyle}>
                                <option value="">— No Department —</option>
                                {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                            </select>
                        </Field>

                        {isSuperBoss && (
                            <Field label="Role">
                                <select title="Role" value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })} style={inputStyle}>
                                    <option value="employee">Employee</option>
                                    <option value="manager">Manager</option>
                                    <option value="super_boss">Super Boss</option>
                                </select>
                            </Field>
                        )}

                        <Field label="99acres Email" hint="The Gmail this member uses on 99acres — routes their 99acres listing leads to them">
                            <input
                                type="email"
                                value={editForm.nine9acres_email}
                                onChange={e => setEditForm({ ...editForm, nine9acres_email: e.target.value })}
                                placeholder="their-99acres-email@gmail.com"
                                style={inputStyle}
                            />
                        </Field>

                        <Field label="MagicBricks Email / ID" hint="The email or <phone>@timesgroup.com this member uses on MagicBricks — routes their MagicBricks leads to them">
                            <input
                                value={editForm.magicbricks_email}
                                onChange={e => setEditForm({ ...editForm, magicbricks_email: e.target.value })}
                                placeholder="their-mb-email@gmail.com"
                                style={inputStyle}
                            />
                        </Field>

                        <Field label="Portal Email (general / Housing)" hint="Fallback portal Gmail — used for Housing and when the portal-specific fields above aren't set" wide>
                            <input
                                type="email"
                                value={editForm.personal_email}
                                onChange={e => setEditForm({ ...editForm, personal_email: e.target.value })}
                                placeholder="their-portal-email@gmail.com"
                                style={inputStyle}
                            />
                        </Field>

                        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px', marginTop: '4px' }}>
                            <button onClick={handleSaveDetails} disabled={editLoading} style={{ ...smallBtnStyle('#22c55e'), opacity: editLoading ? 0.7 : 1, padding: '8px 20px' }}>
                                {editLoading ? 'Saving...' : '✓ Save Changes'}
                            </button>
                            <button onClick={() => { setEditMode(false); setEditError(''); }} style={{ ...smallBtnStyle('#6b7280'), padding: '8px 16px' }}>
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    /* ── View mode ── */
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                        <InfoRow label="Phone" value={profile.phone || '—'} />
                        <InfoRow label="Department" value={DEPARTMENTS.find(d => d.value === profile.department)?.label || '—'} />
                        <InfoRow label="Role" value={profile.role.replace('_', ' ')} />
                        <InfoRow
                            label="99acres Email"
                            value={profile.nine9acres_email || '—'}
                            hint="99acres lead routing"
                            highlight={!!profile.nine9acres_email}
                        />
                        <InfoRow
                            label="MagicBricks Email / ID"
                            value={profile.magicbricks_email || '—'}
                            hint="MagicBricks lead routing"
                            highlight={!!profile.magicbricks_email}
                        />
                        <InfoRow
                            label="Portal Email (general)"
                            value={profile.personal_email || '—'}
                            hint="Housing + fallback routing"
                            highlight={!!profile.personal_email}
                        />
                    </div>
                )}
            </div>

            {/* ─── Manager section ─────────────────────────────────────── */}
            {canManage && (
                <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', marginBottom: '16px', border: '1px solid var(--border-secondary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>Reports To (Manager)</span>
                        {!editingManager && (
                            <button onClick={() => setEditingManager(true)} style={smallBtnStyle('#3b82f6')}>Change</button>
                        )}
                    </div>

                    {editingManager ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <select title="Manager" value={selectedManagerId} onChange={e => setSelectedManagerId(e.target.value)} style={inputStyle}>
                                <option value="">— No Manager —</option>
                                {managers.map(m => (
                                    <option key={m.id} value={m.id}>{m.name} ({m.role.replace('_', ' ')})</option>
                                ))}
                            </select>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={handleSaveManager} disabled={savingManager} style={smallBtnStyle('#22c55e')}>{savingManager ? 'Saving...' : '✓ Save'}</button>
                                <button onClick={() => { setEditingManager(false); setSelectedManagerId(profile.reports_to?.id || ''); }} style={smallBtnStyle('#6b7280')}>Cancel</button>
                            </div>
                        </div>
                    ) : (
                        profile.reports_to ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    width: '32px', height: '32px', borderRadius: '50%',
                                    backgroundColor: ROLE_COLORS[profile.reports_to.role] + '22',
                                    border: `1.5px solid ${ROLE_COLORS[profile.reports_to.role]}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '14px', fontWeight: 700, color: ROLE_COLORS[profile.reports_to.role],
                                }}>
                                    {profile.reports_to.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '14px' }}>{profile.reports_to.name}</div>
                                    <RoleBadge role={profile.reports_to.role} small />
                                </div>
                            </div>
                        ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
                                No manager assigned — click Change to assign one.
                            </span>
                        )
                    )}
                </div>
            )}

            {/* ─── Subordinates ────────────────────────────────────────── */}
            {profile.subordinates.length > 0 && (
                <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', marginBottom: '16px', border: '1px solid var(--border-secondary)' }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '12px' }}>
                        Team Members ({profile.subordinates.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {profile.subordinates.map(s => (
                            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', opacity: s.status === 'inactive' ? 0.5 : 1 }}>
                                <div style={{
                                    width: '28px', height: '28px', borderRadius: '50%',
                                    backgroundColor: ROLE_COLORS[s.role] + '22', border: `1.5px solid ${ROLE_COLORS[s.role]}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '12px', fontWeight: 700, color: ROLE_COLORS[s.role],
                                }}>
                                    {s.name.charAt(0).toUpperCase()}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500 }}>{s.name}</div>
                                    {s.department && <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{DEPARTMENTS.find(d => d.value === s.department)?.label || s.department}</div>}
                                </div>
                                <RoleBadge role={s.role} small />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ─── Account Actions ─────────────────────────────────────── */}
            {canManage && (
                <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', marginBottom: '16px', border: '1px solid var(--border-secondary)' }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '14px' }}>Account Actions</div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button onClick={handleResetPassword} style={actionBtnStyle('#f59e0b')}>🔑 Reset Password</button>
                        <button onClick={handleResendSetup} style={actionBtnStyle('#06b6d4')}>📩 Resend Setup Link</button>
                        <button onClick={() => { setShowPwdPanel(!showPwdPanel); setPwdSuccess(false); setSetPwdValue(''); setPwdError(''); setPwdLoading(false); }} style={actionBtnStyle('#8b5cf6')}>
                            🔐 Set Custom Password
                        </button>
                        <button onClick={handleToggleStatus} style={actionBtnStyle(profile.status === 'active' ? '#ef4444' : '#22c55e')}>
                            {profile.status === 'active' ? '🚫 Deactivate' : '✅ Reactivate'}
                        </button>
                    </div>

                    {showPwdPanel && (
                        <div style={{ marginTop: '16px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', padding: '16px', border: '1px solid var(--border-secondary)' }}>
                            {pwdSuccess ? (
                                <div>
                                    <div style={{ backgroundColor: 'var(--success-bg)', border: '1px solid #22c55e', borderRadius: '8px', padding: '12px' }}>
                                        <div style={{ color: 'var(--success-text)', fontSize: '11px', marginBottom: '4px' }}>Password set</div>
                                        <div style={{ color: '#fff', fontSize: '15px', fontFamily: 'monospace', display: 'flex', justifyContent: 'space-between' }}>
                                            <span>{setPwdValue}</span>
                                            <button onClick={() => navigator.clipboard.writeText(setPwdValue).catch(() => {})} style={{ background: 'none', border: 'none', color: 'var(--success-text-bright)', cursor: 'pointer' }}>📋</button>
                                        </div>
                                    </div>
                                    <p style={{ color: '#f59e0b', fontSize: '11px', margin: '8px 0 0' }}>Save this — it won't be shown again.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {pwdError && <div style={{ color: '#f87171', fontSize: '12px' }}>{pwdError}</div>}
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type={setPwdShow ? 'text' : 'password'}
                                            placeholder="Min 6 characters"
                                            value={setPwdValue}
                                            onChange={e => setSetPwdValue(e.target.value)}
                                            style={{ ...inputStyle, paddingRight: '40px', fontFamily: setPwdShow ? 'monospace' : 'inherit' }}
                                        />
                                        <button type="button" onClick={() => setSetPwdShow(!setPwdShow)} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}>
                                            {setPwdShow ? '🙈' : '👁️'}
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button onClick={generateRandomPassword} style={smallBtnStyle('#6b7280')}>🎲 Generate</button>
                                        <button onClick={handleSetPassword} disabled={pwdLoading || setPwdValue.length < 6} style={{ ...smallBtnStyle('#22c55e'), opacity: (pwdLoading || setPwdValue.length < 6) ? 0.5 : 1 }}>
                                            {pwdLoading ? 'Setting...' : '✓ Set Password'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RoleBadge({ role, small }: { role: string; small?: boolean }) {
    return (
        <span style={{
            backgroundColor: ROLE_COLORS[role] || '#6b7280', color: '#fff',
            borderRadius: '10px', fontSize: small ? '10px' : '11px', fontWeight: 600,
            padding: small ? '1px 6px' : '2px 8px', textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const,
        }}>
            {role.replace('_', ' ')}
        </span>
    );
}

function StatPill({ label, value, color }: { label: string; value: string | number; color: string }) {
    return (
        <div style={{ textAlign: 'center', minWidth: '60px' }}>
            <div style={{ color, fontSize: '18px', fontWeight: 700, lineHeight: 1 }}>{value}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '10px', marginTop: '3px' }}>{label}</div>
        </div>
    );
}

function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: React.ReactNode }) {
    return (
        <div style={{ gridColumn: wide ? '1 / -1' : undefined }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const, marginBottom: '5px', letterSpacing: '0.05em' }}>
                {label}
            </div>
            {hint && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px' }}>{hint}</div>}
            {children}
        </div>
    );
}

function InfoRow({ label, value, hint, highlight }: { label: string; value: string; hint?: string; highlight?: boolean }) {
    return (
        <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const, marginBottom: '3px', letterSpacing: '0.05em' }}>{label}</div>
            <div style={{ color: highlight ? 'var(--text-link)' : 'var(--text-primary)', fontSize: '14px', fontWeight: highlight ? 500 : 400 }}>{value}</div>
            {hint && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{hint}</div>}
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    padding: '9px 12px', backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border-secondary)', borderRadius: '8px',
    color: 'var(--text-primary)', fontSize: '13px', width: '100%', boxSizing: 'border-box',
};
const errorBoxStyle: React.CSSProperties = {
    backgroundColor: 'var(--error-bg)', color: 'var(--error-text)',
    padding: '8px 12px', borderRadius: '6px', fontSize: '13px',
};
function smallBtnStyle(bg: string): React.CSSProperties {
    return { backgroundColor: bg, color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 };
}
function actionBtnStyle(bg: string): React.CSSProperties {
    return { backgroundColor: bg + '22', border: `1px solid ${bg}55`, color: 'var(--text-primary)', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 };
}
