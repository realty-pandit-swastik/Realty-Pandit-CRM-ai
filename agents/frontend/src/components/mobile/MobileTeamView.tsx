
import { useEffect, useState } from 'react';
import { getTeamMembers, setMemberPassword, resendSetupLink } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';

const CARD_RADIUS = '12px';

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
    super_boss: { bg: '#7f1d1d', color: '#f87171' },
    manager: { bg: '#78350f', color: '#fbbf24' },
    employee: { bg: '#14532d', color: '#4ade80' },
};

export function MobileTeamView() {
    const { hasPermission, agent } = useAuth();
    const { showToast } = useToast();
    const confirm = useConfirm();
    const [members, setMembers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionMember, setActionMember] = useState<any>(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [passwordResult, setPasswordResult] = useState('');

    useEffect(() => { loadMembers(); }, []);

    const loadMembers = async () => {
        try {
            setLoading(true);
            const data = await getTeamMembers();
            const list = Array.isArray(data) ? data : data?.data || data?.members || [];
            setMembers(list);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const handleSetPassword = async () => {
        if (!actionMember || !newPassword) return;
        try {
            await setMemberPassword(actionMember.id, newPassword);
            setPasswordResult(newPassword);
        } catch (err: any) {
            showToast(err.response?.data?.error || 'Failed', 'error');
        }
    };

    const handleResendSetup = async (member: any) => {
        const ok = await confirm(`Resend setup link to ${member.name}?`);
        if (!ok) return;
        try {
            await resendSetupLink(member.id);
            showToast('Setup link sent!', 'success');
        } catch (err: any) {
            showToast(err.response?.data?.error || 'Failed', 'error');
        }
    };

    const generateRandom = () => {
        const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
        let pwd = '';
        for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
        setNewPassword(pwd);
    };

    const openPasswordModal = (member: any) => {
        setActionMember(member);
        setNewPassword('');
        setPasswordResult('');
        setShowPasswordModal(true);
    };

    if (loading) return <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>Loading team...</div>;

    return (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Team Members ({members.length})
            </div>

            {members.map(m => {
                const roleStyle = ROLE_COLORS[m.role] || { bg: 'var(--bg-primary)', color: 'var(--text-muted)' };
                const lastLogin = m.last_login_at ? new Date(m.last_login_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never';
                return (
                    <div key={m.id} style={{
                        backgroundColor: 'var(--bg-secondary)', borderRadius: CARD_RADIUS,
                        padding: '14px 16px', border: '1px solid var(--border-secondary)',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{m.name}</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{m.email}</div>
                            </div>
                            <span style={{
                                backgroundColor: roleStyle.bg, color: roleStyle.color,
                                padding: '2px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                            }}>
                                {m.role?.replace('_', ' ')}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                            {m.phone && <span>📞 {m.phone}</span>}
                            {m.department && <span>🏢 {m.department}</span>}
                            <span>🕐 {lastLogin}</span>
                        </div>
                        {/* Actions */}
                        {hasPermission('manage_agents') && m.id !== agent?.id && (
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button onClick={() => openPasswordModal(m)}
                                    style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: '#4F46E5', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                                    Set Password
                                </button>
                                <button onClick={() => handleResendSetup(m)}
                                    style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: '#06b6d4', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                                    Resend Setup
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Set Password Modal */}
            {showPasswordModal && actionMember && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
                    onClick={e => e.target === e.currentTarget && setShowPasswordModal(false)}>
                    <div style={{
                        backgroundColor: 'var(--bg-secondary)', borderRadius: '16px 16px 0 0',
                        padding: '24px 20px', width: '100%', maxWidth: '500px',
                    }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: 'var(--text-primary)' }}>
                            Set Password for {actionMember.name}
                        </h3>
                        {!passwordResult ? (
                            <>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                    <input
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        placeholder="Enter new password"
                                        style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px' }}
                                    />
                                    <button onClick={generateRandom}
                                        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-link)', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                        Random
                                    </button>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => setShowPasswordModal(false)}
                                        style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px' }}>
                                        Cancel
                                    </button>
                                    <button onClick={handleSetPassword} disabled={!newPassword}
                                        style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: '#4F46E5', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 600, opacity: newPassword ? 1 : 0.5 }}>
                                        Set Password
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ backgroundColor: '#14532d', border: '1px solid #065f46', borderRadius: '8px', padding: '14px', marginBottom: '12px' }}>
                                    <div style={{ color: '#4ade80', fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>Password set successfully!</div>
                                    <div style={{ color: '#86efac', fontSize: '18px', fontFamily: 'monospace', padding: '8px', backgroundColor: '#0f2b1d', borderRadius: '6px', textAlign: 'center', userSelect: 'all' }}>
                                        {passwordResult}
                                    </div>
                                    <div style={{ color: '#6ee7b7', fontSize: '11px', marginTop: '6px' }}>Save this — won't be shown again</div>
                                </div>
                                <button onClick={() => { navigator.clipboard.writeText(passwordResult); showToast('Copied!', 'success'); }}
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: '#4F46E5', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                                    Copy Password
                                </button>
                                <button onClick={() => setShowPasswordModal(false)}
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px' }}>
                                    Close
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
