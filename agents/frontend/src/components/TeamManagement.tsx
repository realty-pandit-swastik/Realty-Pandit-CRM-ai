
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import client, { setMemberPassword, resendSetupLink, getTeamMembers } from '../api/client';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { TeamDeactivateDialog } from './TeamDeactivateDialog';
import { TeamMemberProfile } from './TeamMemberProfile';

interface TeamMember {
    id: string;
    name: string;
    email: string;
    phone?: string;
    role: string;
    department?: string;
    status: string;
    last_login_at?: string;
    last_activity_at?: string | null;
    last_activity_type?: string | null;
    created_at: string;
    _count?: { assigned_leads: number };
    reports_to?: { id: string; name: string; email: string } | null;
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
const DEPT_COLORS: Record<string, string> = {
    property_sales: '#3b82f6', operations: '#8b5cf6', management: '#f59e0b', software_sales: '#06b6d4',
};

export function TeamManagement() {
    const { agent, hasPermission } = useAuth();
    const { showToast } = useToast();
    const confirm = useConfirm();
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editMember, setEditMember] = useState<TeamMember | null>(null);
    const [createdCredentials, setCreatedCredentials] = useState<any | null>(null);
    const [phonelessCount, setPhonelessCount] = useState(0);
    // Deactivation dialog shows ownership cascade preview (middleman model, 2026-04-17)
    const [deactivateTarget, setDeactivateTarget] = useState<TeamMember | null>(null);
    // Profile navigation
    const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

    const [formData, setFormData] = useState({ name: '', phone: '', department: 'property_sales', role: 'employee', reports_to_id: '', personal_email: '' });
    const [useCustomPassword, setUseCustomPassword] = useState(false);
    const [customPassword, setCustomPassword] = useState('');
    const [emailPreview, setEmailPreview] = useState('');
    const [formError, setFormError] = useState('');
    const [formLoading, setFormLoading] = useState(false);
    const [editData, setEditData] = useState({ name: '', phone: '', department: '' });
    const [editError, setEditError] = useState('');

    // Set Password modal state
    const [setPwdMember, setSetPwdMember] = useState<TeamMember | null>(null);
    const [setPwdValue, setSetPwdValue] = useState('');
    const [setPwdShow, setSetPwdShow] = useState(false);
    const [setPwdLoading, setSetPwdLoading] = useState(false);
    const [setPwdError, setSetPwdError] = useState('');
    const [setPwdSuccess, setSetPwdSuccess] = useState(false);

    // Self-service portal-email (used by 99acres SubUserName / Housing routing).
    const [portalEmail, setPortalEmail] = useState('');
    const [portalEmailSaving, setPortalEmailSaving] = useState(false);
    const [portalEmailLoaded, setPortalEmailLoaded] = useState('');

    useEffect(() => { loadTeam(); loadPhonelessCount(); loadMyProfile(); }, []);

    const loadMyProfile = async () => {
        try {
            const res = await client.get('/api/team/me');
            const value = res.data?.data?.personal_email || '';
            setPortalEmail(value);
            setPortalEmailLoaded(value);
        } catch { /* non-fatal */ }
    };

    const savePortalEmail = async () => {
        if (portalEmail.trim() === portalEmailLoaded) return;
        setPortalEmailSaving(true);
        try {
            const res = await client.patch('/api/team/me/portal-email', { portal_email: portalEmail.trim() });
            const newValue = res.data?.personal_email || '';
            setPortalEmailLoaded(newValue);
            setPortalEmail(newValue);
            showToast('Portal email saved', 'success');
        } catch (err: any) {
            showToast(err?.response?.data?.error || 'Save failed', 'error');
            setPortalEmail(portalEmailLoaded);
        } finally {
            setPortalEmailSaving(false);
        }
    };

    useEffect(() => {
        if (formData.name.length > 1) {
            const timer = setTimeout(() => fetchEmailPreview(formData.name), 400);
            return () => clearTimeout(timer);
        } else { setEmailPreview(''); }
    }, [formData.name]);

    const loadTeam = async () => {
        try {
            const data = await getTeamMembers();
            setMembers(data);
        } catch (err) { console.error('Failed to load team', err); }
        finally { setLoading(false); }
    };

    const loadPhonelessCount = async () => {
        try {
            const res = await client.get('/api/team/members-without-phone');
            setPhonelessCount(res.data.count);
        } catch { /* ignore */ }
    };

    const fetchEmailPreview = async (name: string) => {
        try {
            const res = await client.get('/api/team/email-preview', { params: { name } });
            setEmailPreview(res.data.email);
        } catch { setEmailPreview(''); }
    };

    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(''); setFormLoading(true);
        try {
            const payload: any = { ...formData, phone: formData.phone.replace(/\D/g, '') };
            if (useCustomPassword && customPassword) payload.customPassword = customPassword;
            const res = await client.post('/api/team/members', payload);
            setCreatedCredentials(res.data.credentials);
            setShowAddForm(false);
            setFormData({ name: '', phone: '', department: 'property_sales', role: 'employee', reports_to_id: '', personal_email: '' });
            setUseCustomPassword(false);
            setCustomPassword('');
            setEmailPreview('');
            await loadTeam();
        } catch (err: any) {
            setFormError(err.response?.data?.error || 'Failed to create member');
        } finally { setFormLoading(false); }
    };

    const handleEdit = (member: TeamMember) => {
        setEditMember(member);
        setEditData({ name: member.name, phone: member.phone?.replace('+91', '') || '', department: member.department || '' });
        setEditError('');
    };

    const handleUpdateMember = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editMember) return;
        setEditError('');
        try {
            await client.patch(`/api/team/members/${editMember.id}`, editData);
            setEditMember(null);
            await loadTeam();
        } catch (err: any) { setEditError(err.response?.data?.error || 'Update failed'); }
    };

    const handleToggleStatus = async (member: TeamMember) => {
        // Deactivation runs the ownership cascade — show the preview dialog instead of
        // a plain confirm so the super_boss can see exactly what transfers to them.
        if (member.status === 'active') {
            setDeactivateTarget(member);
            return;
        }
        // Reactivation is a no-cascade status flip — keep the simple confirm flow.
        const ok = await confirm(`Reactivate ${member.name}?`);
        if (!ok) return;
        try {
            await client.patch(`/api/team/members/${member.id}/deactivate`, { status: 'active' });
            await loadTeam();
        } catch (err: any) { showToast(err.response?.data?.error || 'Failed', 'error'); }
    };

    const handleResetPassword = async (member: TeamMember) => {
        const ok = await confirm(`Reset password for ${member.name}? A new temporary password will be generated.`);
        if (!ok) return;
        try {
            const res = await client.patch(`/api/team/members/${member.id}/reset-password`);
            setCreatedCredentials({ email: res.data.email, tempPassword: res.data.newPassword, note: res.data.note });
        } catch (err: any) { showToast(err.response?.data?.error || 'Failed to reset password', 'error'); }
    };

    const handleResendSetup = async (member: TeamMember) => {
        const ok = await confirm(`Resend setup link to ${member.name} on WhatsApp?`);
        if (!ok) return;
        try {
            await resendSetupLink(member.id);
            showToast(`Setup link sent to ${member.name}'s WhatsApp.`, 'success');
        } catch (err: any) { showToast(err.response?.data?.error || 'Failed to resend setup link', 'error'); }
    };

    const openSetPassword = (member: TeamMember) => {
        setSetPwdMember(member);
        setSetPwdValue('');
        setSetPwdShow(false);
        setSetPwdError('');
        setSetPwdSuccess(false);
    };

    const generateRandomPassword = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let pwd = '';
        for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
        setSetPwdValue(pwd);
        setSetPwdShow(true);
    };

    const handleSetPassword = async () => {
        if (!setPwdMember || setPwdValue.length < 6) {
            setSetPwdError('Password must be at least 6 characters.');
            return;
        }
        setSetPwdLoading(true);
        setSetPwdError('');
        try {
            await setMemberPassword(setPwdMember.id, setPwdValue);
            setSetPwdSuccess(true);
            setSetPwdShow(true);
        } catch (err: any) {
            setSetPwdError(err.response?.data?.error || 'Failed to set password');
        } finally {
            setSetPwdLoading(false);
        }
    };

    const closeSetPassword = () => {
        setSetPwdMember(null);
        setSetPwdValue('');
        setSetPwdSuccess(false);
    };

    const getRoleBadge = (role: string) => (
        <span style={{ backgroundColor: ROLE_COLORS[role] || '#6b7280', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' as const }}>
            {role.replace('_', ' ')}
        </span>
    );

    const getDeptBadge = (dept?: string) => {
        if (!dept) return <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>;
        const label = DEPARTMENTS.find(d => d.value === dept)?.label || dept;
        return <span style={{ backgroundColor: DEPT_COLORS[dept] || '#6b7280', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '11px' }}>{label}</span>;
    };

    if (loading) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>Loading team...</div>;

    // Profile page view
    if (selectedMemberId) {
        return (
            <TeamMemberProfile
                memberId={selectedMemberId}
                onBack={() => setSelectedMemberId(null)}
                onReload={loadTeam}
            />
        );
    }

    // Managers/super_bosses list for the Add Member form
    const managerOptions = members.filter(m => m.role === 'manager' || m.role === 'super_boss');

    return (
        <div style={{ flex: 1, padding: window.innerWidth < 768 ? '12px' : '24px', overflowY: 'auto', backgroundColor: 'var(--bg-primary)' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '20px' }}>Team Management</h2>
                    <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '13px' }}>
                        {members.length} member{members.length !== 1 ? 's' : ''}
                    </p>
                </div>
                {hasPermission('create_agents') && (
                    <button onClick={() => { setShowAddForm(!showAddForm); setFormError(''); }} style={btnStyle('#3b82f6')}>
                        {showAddForm ? '✕ Cancel' : '+ Add Member'}
                    </button>
                )}
            </div>

            {/* Warning: Members without phone */}
            {phonelessCount > 0 && (
                <div style={{
                    backgroundColor: 'var(--warning-bg)', border: '1px solid #f59e0b', borderRadius: '10px',
                    padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px',
                }}>
                    <span style={{ fontSize: '20px' }}>&#9888;</span>
                    <span style={{ color: 'var(--warning-text)', fontSize: '13px' }}>
                        <strong>{phonelessCount}</strong> team member{phonelessCount !== 1 ? 's' : ''} don't have a phone number.
                        They can't be recognized by Panditji on WhatsApp or reset their password via OTP.
                    </span>
                </div>
            )}

            {/* Credentials Modal */}
            {createdCredentials && (
                <div style={{ backgroundColor: 'var(--success-bg)', border: '1px solid #22c55e', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <h3 style={{ color: 'var(--success-text-bright)', margin: 0, fontSize: '15px' }}>✅ Account Ready — Share Credentials Securely</h3>
                        <button onClick={() => setCreatedCredentials(null)} style={{ background: 'none', border: 'none', color: 'var(--success-text-bright)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <CredRow label="Login Email" value={createdCredentials.email} />
                        <CredRow label="Temp Password" value={createdCredentials.tempPassword} />
                        {createdCredentials.imapHost && <>
                            <CredRow label="IMAP" value={`${createdCredentials.imapHost}:${createdCredentials.imapPort}`} />
                            <CredRow label="SMTP" value={`${createdCredentials.smtpHost}:${createdCredentials.smtpPort}`} />
                        </>}
                    </div>
                    {createdCredentials.note && <p style={{ color: 'var(--success-text)', fontSize: '12px', margin: '12px 0 0' }}>⚠️ {createdCredentials.note}</p>}
                </div>
            )}

            {/* Add Member Form */}
            {showAddForm && (
                <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', marginBottom: '24px', border: '1px solid var(--border-secondary)' }}>
                    <h3 style={{ color: 'var(--text-primary)', margin: '0 0 16px', fontSize: '15px' }}>New Team Member</h3>
                    {formError && <div style={errorBoxStyle}>{formError}</div>}
                    {emailPreview && (
                        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid #3b82f6', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '13px', color: 'var(--text-link)' }}>
                            📧 Email will be: <strong>{emailPreview}</strong>
                        </div>
                    )}
                    <form onSubmit={handleAddMember} style={{ display: 'grid', gridTemplateColumns: window.innerWidth < 768 ? '1fr' : '1fr 1fr', gap: '12px' }}>
                        <input placeholder="Full Name *" value={formData.name} required onChange={e => setFormData({ ...formData, name: e.target.value })} style={inputStyle} />
                        <input placeholder="Phone (10 digits) *" value={formData.phone} required maxLength={10} onChange={e => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })} style={inputStyle} />
                        <select value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })} style={inputStyle}>
                            {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                        </select>
                        <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} style={inputStyle}>
                            <option value="employee">Employee</option>
                            {agent?.role === 'super_boss' && <option value="manager">Manager</option>}
                            {agent?.role === 'super_boss' && <option value="super_boss">Super Boss</option>}
                        </select>
                        {managerOptions.length > 0 && (
                            <select title="Manager" value={formData.reports_to_id} onChange={e => setFormData({ ...formData, reports_to_id: e.target.value })} style={inputStyle}>
                                <option value="">— Select Manager (optional) —</option>
                                {managerOptions.map(m => (
                                    <option key={m.id} value={m.id}>{m.name} ({m.role.replace('_', ' ')})</option>
                                ))}
                            </select>
                        )}
                        <div style={{ gridColumn: '1 / -1' }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const, marginBottom: '5px', letterSpacing: '0.05em' }}>
                                Portal Account Email <span style={{ fontWeight: 400, textTransform: 'none' as const }}>(optional)</span>
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                Gmail they use on 99acres / MagicBricks / Housing — incoming leads on their listings will be auto-assigned to them.
                            </div>
                            <input
                                type="email"
                                placeholder="their-portal-email@gmail.com"
                                value={formData.personal_email}
                                onChange={e => setFormData({ ...formData, personal_email: e.target.value })}
                                style={inputStyle}
                            />
                        </div>
                        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                                type="checkbox"
                                id="customPwdToggle"
                                checked={useCustomPassword}
                                onChange={e => { setUseCustomPassword(e.target.checked); if (!e.target.checked) setCustomPassword(''); }}
                                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                            />
                            <label htmlFor="customPwdToggle" style={{ color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
                                Set custom password (leave unchecked to auto-generate)
                            </label>
                        </div>
                        {useCustomPassword && (
                            <input
                                placeholder="Custom Password (min 8 chars)"
                                type="text"
                                value={customPassword}
                                minLength={8}
                                required={useCustomPassword}
                                onChange={e => setCustomPassword(e.target.value)}
                                style={{ ...inputStyle, gridColumn: '1 / -1', fontFamily: 'monospace' }}
                            />
                        )}
                        <button type="submit" disabled={formLoading} style={{ ...btnStyle('#22c55e'), gridColumn: '1 / -1', padding: '12px', opacity: formLoading ? 0.7 : 1 }}>
                            {formLoading ? 'Creating...' : '✓ Create Member & Provision Email'}
                        </button>
                    </form>
                </div>
            )}

            {/* Edit Modal */}
            {editMember && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
                    <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: window.innerWidth < 768 ? '16px' : '24px', width: window.innerWidth < 768 ? '90%' : '400px', maxWidth: '400px', border: '1px solid var(--border-secondary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ color: 'var(--text-primary)', margin: 0 }}>Edit: {editMember.name}</h3>
                            <button onClick={() => setEditMember(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '20px' }}>✕</button>
                        </div>
                        {editError && <div style={errorBoxStyle}>{editError}</div>}
                        <form onSubmit={handleUpdateMember} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <input placeholder="Full Name" value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} style={inputStyle} />
                            <input placeholder="Phone (10 digits)" value={editData.phone} onChange={e => setEditData({ ...editData, phone: e.target.value.replace(/\D/g, '') })} style={inputStyle} maxLength={10} />
                            <select value={editData.department} onChange={e => setEditData({ ...editData, department: e.target.value })} style={inputStyle}>
                                <option value="">No Department</option>
                                {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                            </select>
                            <button type="submit" style={btnStyle('#3b82f6')}>Save Changes</button>
                        </form>
                    </div>
                </div>
            )}

            {/* Set Password Modal */}
            {setPwdMember && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
                    <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: window.innerWidth < 768 ? '16px' : '24px', width: window.innerWidth < 768 ? '90%' : '420px', maxWidth: '420px', border: '1px solid var(--border-secondary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ color: 'var(--text-primary)', margin: 0 }}>
                                {setPwdSuccess ? '✅ Password Set' : '🔐 Set Password'}
                            </h3>
                            <button onClick={closeSetPassword} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '20px' }}>✕</button>
                        </div>

                        <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Member</span>
                            <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{setPwdMember.name}</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{setPwdMember.email}</div>
                        </div>

                        {setPwdError && <div style={errorBoxStyle}>{setPwdError}</div>}

                        {setPwdSuccess ? (
                            <div>
                                <div style={{ backgroundColor: 'var(--success-bg)', border: '1px solid #22c55e', borderRadius: '8px', padding: '14px' }}>
                                    <div style={{ color: 'var(--success-text)', fontSize: '11px', marginBottom: '4px' }}>New Password</div>
                                    <div style={{ color: '#fff', fontSize: '16px', fontFamily: 'monospace', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>{setPwdValue}</span>
                                        <button
                                            onClick={() => navigator.clipboard.writeText(setPwdValue).catch(() => {})}
                                            style={{ background: 'none', border: 'none', color: 'var(--success-text-bright)', cursor: 'pointer', fontSize: '16px' }}
                                            title="Copy"
                                        >📋</button>
                                    </div>
                                </div>
                                <p style={{ color: '#f59e0b', fontSize: '12px', margin: '12px 0 0', textAlign: 'center' }}>
                                    ⚠️ Save this password — it won't be shown again.
                                </p>
                                <button onClick={closeSetPassword} style={{ ...btnStyle('#3b82f6'), width: '100%', marginTop: '12px', padding: '10px' }}>
                                    Done
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={setPwdShow ? 'text' : 'password'}
                                        placeholder="Enter new password (min 6 chars)"
                                        value={setPwdValue}
                                        onChange={e => setSetPwdValue(e.target.value)}
                                        style={{ ...inputStyle, paddingRight: '40px', fontFamily: setPwdShow ? 'monospace' : 'inherit' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setSetPwdShow(!setPwdShow)}
                                        style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px' }}
                                    >{setPwdShow ? '🙈' : '👁️'}</button>
                                </div>
                                <button type="button" onClick={generateRandomPassword} style={{ ...btnStyle('#6b7280'), padding: '8px' }}>
                                    🎲 Generate Random Password
                                </button>
                                <button
                                    onClick={handleSetPassword}
                                    disabled={setPwdLoading || setPwdValue.length < 6}
                                    style={{ ...btnStyle('#22c55e'), padding: '10px', opacity: (setPwdLoading || setPwdValue.length < 6) ? 0.6 : 1 }}
                                >
                                    {setPwdLoading ? 'Setting...' : '✓ Set Password'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Self-service: my portal account email (used by 99acres / Housing lead routing) */}
            <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>My Portal Account Email</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-link)', backgroundColor: 'rgba(59,130,246,0.12)', padding: '2px 8px', borderRadius: '8px' }}>self-service</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    The Gmail you use to log in to <strong>99acres</strong> / <strong>MagicBricks</strong> / <strong>Housing</strong>. Incoming leads on listings posted under this email will be auto-assigned to you.
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' as const }}>
                    <input
                        type="email"
                        placeholder="your-portal-email@gmail.com"
                        value={portalEmail}
                        onChange={(e) => setPortalEmail(e.target.value)}
                        onBlur={savePortalEmail}
                        disabled={portalEmailSaving}
                        style={{
                            flex: 1, minWidth: '260px', padding: '8px 12px', borderRadius: '8px', fontSize: '13px',
                            border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                        }}
                    />
                    {portalEmail && portalEmail.trim() !== portalEmailLoaded && (
                        <button
                            type="button"
                            onClick={savePortalEmail}
                            disabled={portalEmailSaving}
                            style={{ padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                                     border: 'none', backgroundColor: 'var(--accent-primary)', color: '#fff', cursor: 'pointer' }}
                        >
                            {portalEmailSaving ? 'Saving...' : 'Save'}
                        </button>
                    )}
                    {portalEmailLoaded && portalEmail.trim() === portalEmailLoaded && (
                        <span style={{ fontSize: '11px', color: '#22c55e' }}>✓ saved</span>
                    )}
                </div>
            </div>

            {/* Team Table */}
            <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-secondary)', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)' }}>
                            {['Member', 'Phone', 'Role', 'Department', 'Manager', 'Status', 'Last Login', 'Last Activity', 'Actions'].map(h => (
                                <th key={h} style={{ textAlign: 'left', padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {members.map(m => (
                            <tr key={m.id} style={{ borderBottom: '1px solid var(--bg-secondary)', opacity: m.status === 'inactive' ? 0.5 : 1, backgroundColor: m.id === agent?.id ? 'rgba(59,130,246,0.04)' : undefined }}>
                                <td style={cellStyle}>
                                    <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                                        {m.name}
                                        {m.id === agent?.id && <span style={{ color: 'var(--text-link)', fontSize: '11px', marginLeft: '6px' }}>(you)</span>}
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>{m.email}</div>
                                </td>
                                <td style={{ ...cellStyle, color: 'var(--text-secondary)', fontSize: '13px' }}>
                                    {m.phone ? m.phone : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                </td>
                                <td style={cellStyle}>{getRoleBadge(m.role)}</td>
                                <td style={cellStyle}>{getDeptBadge(m.department)}</td>
                                <td style={{ ...cellStyle, fontSize: '13px', color: 'var(--text-secondary)' }}>
                                    {m.reports_to ? (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: ROLE_COLORS[m.reports_to.id ? 'manager' : 'super_boss'] || '#94a3b8', display: 'inline-block', flexShrink: 0 }} />
                                            {m.reports_to.name}
                                        </span>
                                    ) : (
                                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                                    )}
                                </td>
                                <td style={cellStyle}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: m.status === 'active' ? '#22c55e' : '#f59e0b', display: 'inline-block', marginRight: '6px' }} />
                                    <span style={{ color: 'var(--text-bright)', fontSize: '13px' }}>{m.status}</span>
                                </td>
                                <td style={{ ...cellStyle, color: 'var(--text-muted)', fontSize: '12px' }}>
                                    {m.last_login_at ? new Date(m.last_login_at).toLocaleDateString('en-IN') : 'Never'}
                                </td>
                                <td style={{ ...cellStyle, fontSize: '12px' }}>
                                    {m.last_activity_at ? (
                                        <div>
                                            <div style={{ color: 'var(--text-secondary)' }}>{m.last_activity_type || 'Activity'}</div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px', whiteSpace: 'nowrap' as const }}>
                                                {new Date(m.last_activity_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                    ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                </td>
                                <td style={{ ...cellStyle, whiteSpace: 'nowrap' as const }}>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button onClick={() => setSelectedMemberId(m.id)} style={actionBtnStyle('#6366f1')} title="View Profile">👤</button>
                                        {hasPermission('manage_team') && m.id !== agent?.id && (
                                            <>
                                                <button onClick={() => handleEdit(m)} style={actionBtnStyle('#3b82f6')} title="Edit">✏️</button>
                                                <button onClick={() => handleResetPassword(m)} style={actionBtnStyle('#f59e0b')} title="Reset Password">🔑</button>
                                                <button onClick={() => openSetPassword(m)} style={actionBtnStyle('#8b5cf6')} title="Set Password">🔐</button>
                                                <button onClick={() => handleResendSetup(m)} style={actionBtnStyle('#06b6d4')} title="Resend Setup Link">📩</button>
                                                {hasPermission('manage_settings') && (
                                                    <button onClick={() => handleToggleStatus(m)} style={actionBtnStyle(m.status === 'active' ? '#ef4444' : '#22c55e')} title={m.status === 'active' ? 'Deactivate' : 'Reactivate'}>
                                                        {m.status === 'active' ? '🚫' : '✅'}
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {members.length === 0 && (
                            <tr><td colSpan={8} style={{ ...cellStyle, textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>No team members yet. Add your first member above.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Deactivation dialog with ownership cascade preview */}
            {deactivateTarget && (
                <TeamDeactivateDialog
                    agentId={deactivateTarget.id}
                    agentName={deactivateTarget.name}
                    onClose={() => setDeactivateTarget(null)}
                    onSuccess={(counts) => {
                        const total = counts.partners + counts.inventory + counts.contacts + counts.transactions;
                        showToast(
                            total > 0
                                ? `${deactivateTarget.name} deactivated. ${total} asset${total === 1 ? '' : 's'} transferred to super boss.`
                                : `${deactivateTarget.name} deactivated.`,
                            'success',
                        );
                        setDeactivateTarget(null);
                        loadTeam();
                    }}
                />
            )}
        </div>
    );
}

function CredRow({ label, value }: { label: string; value: string }) {
    const copy = () => navigator.clipboard.writeText(value).catch(() => {});
    return (
        <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '8px 10px' }}>
            <div style={{ color: 'var(--success-text)', fontSize: '11px', marginBottom: '2px' }}>{label}</div>
            <div style={{ color: '#fff', fontSize: '13px', fontFamily: 'monospace', display: 'flex', justifyContent: 'space-between' }}>
                <span>{value}</span>
                <button onClick={copy} style={{ background: 'none', border: 'none', color: 'var(--success-text-bright)', cursor: 'pointer', fontSize: '14px' }}>📋</button>
            </div>
        </div>
    );
}

const inputStyle: React.CSSProperties = { padding: '10px 12px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', width: '100%', boxSizing: 'border-box' };
const cellStyle: React.CSSProperties = { padding: '12px 16px', color: 'var(--text-bright)', fontSize: '14px', verticalAlign: 'middle' };
const errorBoxStyle: React.CSSProperties = { backgroundColor: 'var(--error-bg)', color: 'var(--error-text)', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', fontSize: '13px' };
function btnStyle(bg: string): React.CSSProperties { return { backgroundColor: bg, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 500 }; }
function actionBtnStyle(bg: string): React.CSSProperties { return { backgroundColor: bg + '22', border: `1px solid ${bg}44`, borderRadius: '6px', cursor: 'pointer', padding: '4px 8px', fontSize: '14px' }; }
