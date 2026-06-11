import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useToast } from '../contexts/ToastContext';
import { GoogleAccountCard } from './GoogleAccountCard';

/**
 * Self-hosted Realty Pandit mail server (verified from prod Postfix/Dovecot
 * 2026-05-19): MX/Postfix myhostname mail.realtypandit.in; Dovecot IMAPS 993
 * (ssl required); Postfix submission 587 (STARTTLS). Same for every
 * @realtypandit.in mailbox — only the email + password differ per member.
 */
const MAIL = { host: 'mail.realtypandit.in', imapPort: 993, smtpPort: 587 };

/**
 * Self-service "My Profile" (2026-05-18). Reachable by EVERY logged-in member
 * (no admin permission) — fixes the gap where employees could not view/manage
 * their own profile (Team nav is manage_agents-gated; the mobile PWA had no
 * profile editor at all). Uses only the auth-only /api/team/me* endpoints +
 * /auth/change-password. Responsive: the same component renders on desktop
 * and in the PWA. See docs/plans/2026-05-18-member-self-profile.md
 */

interface Me {
    id?: string;
    name?: string;
    email?: string;
    phone?: string | null;
    role?: string;
    department?: string | null;
    status?: string;
    personal_email?: string | null;
    email_mailbox_activated?: boolean;
}

const DEPT_LABELS: Record<string, string> = {
    property_sales: 'Property Sales Staff',
    operations: 'Operations',
    management: 'Management',
    software_sales: 'Software Sales',
};

export function MyProfile({ isMobile }: { isMobile?: boolean }) {
    const { showToast } = useToast();
    const [me, setMe] = useState<Me | null>(null);
    const [loading, setLoading] = useState(true);

    // Editable personal fields (phone is intentionally read-only — it's the
    // account identity: phone login + WhatsApp OTP reset. Admin-only change.)
    const [name, setName] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);

    // Change LOGIN password
    const [curPwd, setCurPwd] = useState('');
    const [newPwd, setNewPwd] = useState('');
    const [confirmPwd, setConfirmPwd] = useState('');
    const [savingPwd, setSavingPwd] = useState(false);

    // Mailbox (email) password — activate / change
    const [mbPwd, setMbPwd] = useState('');
    const [mbConfirm, setMbConfirm] = useState('');
    const [savingMb, setSavingMb] = useState(false);
    const [showMbForm, setShowMbForm] = useState(false);

    const MB_RULE = /^[A-Za-z0-9!@#%^*()_\-+=.:?]{8,64}$/;
    const setMailboxPassword = async () => {
        if (!MB_RULE.test(mbPwd)) {
            showToast('8–64 chars; letters, digits and ! @ # % ^ * ( ) _ - + = . : ? only', 'error');
            return;
        }
        if (mbPwd !== mbConfirm) { showToast('Passwords do not match', 'error'); return; }
        setSavingMb(true);
        try {
            await client.post('/api/team/me/mailbox-password', { newPassword: mbPwd });
            showToast('Email account activated — your mailbox password is set', 'success');
            setMbPwd(''); setMbConfirm(''); setShowMbForm(false);
            await load(); // email_mailbox_activated flips → config details reveal
        } catch (e: any) {
            showToast(e?.response?.data?.error || 'Failed to set mailbox password', 'error');
        } finally {
            setSavingMb(false);
        }
    };

    const load = async () => {
        try {
            const res = await client.get('/api/team/me');
            const d: Me = res.data?.data || {};
            setMe(d);
            setName(d.name || '');
        } catch {
            showToast('Could not load your profile', 'error');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const saveProfile = async () => {
        if (name.trim().length < 2) { showToast('Name must be at least 2 characters', 'error'); return; }
        setSavingProfile(true);
        try {
            const res = await client.patch('/api/team/me/profile', { name: name.trim() });
            const d: Me = res.data?.data || {};
            setMe(m => ({ ...m, ...d }));
            showToast('Profile updated', 'success');
        } catch (e: any) {
            showToast(e?.response?.data?.error || 'Failed to update profile', 'error');
        } finally {
            setSavingProfile(false);
        }
    };

    const changePassword = async () => {
        if (newPwd.length < 8) { showToast('New password must be at least 8 characters', 'error'); return; }
        if (newPwd !== confirmPwd) { showToast('New passwords do not match', 'error'); return; }
        setSavingPwd(true);
        try {
            await client.post('/auth/change-password', { currentPassword: curPwd, newPassword: newPwd });
            showToast('Password changed', 'success');
            setCurPwd(''); setNewPwd(''); setConfirmPwd('');
        } catch (e: any) {
            showToast(e?.response?.data?.error || 'Failed to change password', 'error');
        } finally {
            setSavingPwd(false);
        }
    };

    const card: React.CSSProperties = {
        backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px',
        marginBottom: '16px', border: '1px solid var(--border-secondary)',
    };
    const label: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase' };
    const input: React.CSSProperties = {
        width: '100%', padding: '9px 10px', borderRadius: 7, fontSize: 13,
        border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
    };
    const ro: React.CSSProperties = { fontSize: 13, color: 'var(--text-primary)', padding: '8px 0' };
    const btn = (bg: string, disabled?: boolean): React.CSSProperties => ({
        padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
        backgroundColor: bg, color: '#fff', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
    });

    // The actual mailbox is keyed lowercase on the mail server — show that
    // (not the possibly mixed-case login email) for Outlook setup.
    const mailboxAddr = (me?.email || '').toLowerCase();

    return (
        <div style={{
            flex: 1, padding: isMobile ? '16px' : '24px', overflowY: 'auto',
            backgroundColor: 'var(--bg-primary)',
        }}>
            <h2 style={{ color: 'var(--text-primary)', margin: '0 0 4px', fontSize: 20 }}>My Profile</h2>
            <p style={{ color: 'var(--text-muted)', margin: '0 0 20px', fontSize: 13 }}>
                Manage your account, email sending, and Google sync.
            </p>

            {loading ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
            ) : (
                <>
                    {/* Personal details */}
                    <div style={card}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 14 }}>👤 Personal Details</div>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                            <div>
                                <div style={label}>Name</div>
                                <input style={input} value={name} onChange={e => setName(e.target.value)} />
                            </div>
                            <div>
                                <div style={label}>Phone</div>
                                <div style={ro}>
                                    {me?.phone || '—'}
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                                        (locked — contact an admin to change)
                                    </span>
                                </div>
                            </div>
                            <div>
                                <div style={label}>Login Email</div>
                                <div style={ro}>{me?.email || '—'}</div>
                            </div>
                            <div>
                                <div style={label}>Role</div>
                                <div style={ro}>{me?.role?.replace('_', ' ') || '—'}</div>
                            </div>
                            <div>
                                <div style={label}>Department</div>
                                <div style={ro}>{me?.department ? (DEPT_LABELS[me.department] || me.department) : '—'}</div>
                            </div>
                            <div>
                                <div style={label}>Status</div>
                                <div style={ro}>{me?.status || '—'}</div>
                            </div>
                        </div>
                        <div style={{ marginTop: 16 }}>
                            <button type="button" onClick={saveProfile} disabled={savingProfile} style={btn('var(--accent-primary)', savingProfile)}>
                                {savingProfile ? 'Saving…' : 'Save Details'}
                            </button>
                        </div>
                    </div>

                    {/* Portal account email — read-only (admin-managed) */}
                    <div style={card}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 6 }}>📨 Portal Account Email</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
                            The Gmail you use to log in to <strong>99acres / MagicBricks / Housing</strong>.
                            Incoming leads on listings posted under this email are auto-assigned to you.
                            Managed by your admin — contact them to change it.
                        </div>
                        <div style={ro}>{me?.personal_email || '— not set —'}</div>
                    </div>

                    {/* Email mailbox — read-only setup info for Outlook (send + receive) */}
                    <div style={card}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>📧 Your Email Mailbox</div>
                            {me?.email_mailbox_activated && (
                                <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>● Activated</span>
                            )}
                        </div>

                        {!me?.email_mailbox_activated ? (
                            /* Not activated — prompt to set the mailbox password first */
                            <>
                                <div style={{
                                    fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 14,
                                    padding: '10px 12px', borderRadius: 8,
                                    backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
                                }}>
                                    <strong>Activate your email account.</strong> First, set your
                                    mailbox password below. Once set, your Outlook configuration
                                    (incoming &amp; outgoing servers) appears here so you can send
                                    and receive your <strong>{mailboxAddr}</strong> email.
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <div style={label}>New mailbox password</div>
                                        <input style={input} type="password" value={mbPwd} onChange={e => setMbPwd(e.target.value)} autoComplete="new-password" />
                                    </div>
                                    <div>
                                        <div style={label}>Confirm password</div>
                                        <input style={input} type="password" value={mbConfirm} onChange={e => setMbConfirm(e.target.value)} autoComplete="new-password" />
                                    </div>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                                    8–64 chars; letters, digits and ! @ # % ^ * ( ) _ - + = . : ? (no spaces).
                                    This is separate from your CRM login password.
                                </div>
                                <div style={{ marginTop: 16 }}>
                                    <button type="button" onClick={setMailboxPassword} disabled={savingMb} style={btn('var(--accent-primary)', savingMb)}>
                                        {savingMb ? 'Activating…' : 'Set Password & Activate'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            /* Activated — show the Outlook send+receive config */
                            <>
                                <div style={{
                                    fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 14,
                                    padding: '10px 12px', borderRadius: 8,
                                    backgroundColor: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)',
                                }}>
                                    Add this account in <strong>Outlook</strong> (or any mail app) as an
                                    <strong> IMAP</strong> account to <strong>send and receive</strong> your
                                    Realty Pandit email. Use the settings below exactly, with the
                                    mailbox password you set.
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                    <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
                                        <div style={label}>Email address / Username</div>
                                        <div style={{ ...ro, wordBreak: 'break-all' }}>{mailboxAddr || '—'}</div>
                                    </div>
                                    <div>
                                        <div style={label}>Incoming mail — IMAP server</div>
                                        <div style={ro}>{MAIL.host}</div>
                                    </div>
                                    <div>
                                        <div style={label}>IMAP port / security</div>
                                        <div style={ro}>{MAIL.imapPort} · SSL/TLS</div>
                                    </div>
                                    <div>
                                        <div style={label}>Outgoing mail — SMTP server</div>
                                        <div style={ro}>{MAIL.host}</div>
                                    </div>
                                    <div>
                                        <div style={label}>SMTP port / security</div>
                                        <div style={ro}>{MAIL.smtpPort} · STARTTLS</div>
                                    </div>
                                    <div>
                                        <div style={label}>Password</div>
                                        <div style={ro}>The mailbox password you set</div>
                                    </div>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
                                    Require sign-in for both incoming and outgoing. SMTP uses the same
                                    username &amp; password as IMAP.
                                </div>
                                {showMbForm ? (
                                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-secondary)' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                            <div>
                                                <div style={label}>New mailbox password</div>
                                                <input style={input} type="password" value={mbPwd} onChange={e => setMbPwd(e.target.value)} autoComplete="new-password" />
                                            </div>
                                            <div>
                                                <div style={label}>Confirm password</div>
                                                <input style={input} type="password" value={mbConfirm} onChange={e => setMbConfirm(e.target.value)} autoComplete="new-password" />
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                            <button type="button" onClick={setMailboxPassword} disabled={savingMb} style={btn('var(--accent-primary)', savingMb)}>
                                                {savingMb ? 'Saving…' : 'Update mailbox password'}
                                            </button>
                                            <button type="button" onClick={() => { setShowMbForm(false); setMbPwd(''); setMbConfirm(''); }} disabled={savingMb}
                                                style={{ padding: '10px 18px', borderRadius: 8, fontSize: 13, cursor: 'pointer', backgroundColor: 'transparent', border: '1px solid var(--border-secondary)', color: 'var(--text-secondary)' }}>
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button type="button" onClick={() => setShowMbForm(true)}
                                        style={{ marginTop: 14, background: 'none', border: 'none', color: 'var(--text-link)', cursor: 'pointer', fontSize: 13, padding: 0, fontWeight: 600 }}>
                                        Change mailbox password
                                    </button>
                                )}
                            </>
                        )}
                    </div>

                    {/* Google Calendar & Tasks (P1) */}
                    <GoogleAccountCard isMobile={isMobile} />

                    {/* Change password */}
                    <div style={card}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 14 }}>🔑 Change Password</div>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                            <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
                                <div style={label}>Current Password</div>
                                <input style={input} type="password" value={curPwd} onChange={e => setCurPwd(e.target.value)} autoComplete="current-password" />
                            </div>
                            <div>
                                <div style={label}>New Password (min 8)</div>
                                <input style={input} type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} autoComplete="new-password" />
                            </div>
                            <div>
                                <div style={label}>Confirm New Password</div>
                                <input style={input} type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} autoComplete="new-password" />
                            </div>
                        </div>
                        <div style={{ marginTop: 16 }}>
                            <button
                                type="button"
                                onClick={changePassword}
                                disabled={savingPwd || !curPwd || !newPwd || !confirmPwd}
                                style={btn('#8b5cf6', savingPwd || !curPwd || !newPwd || !confirmPwd)}
                            >
                                {savingPwd ? 'Changing…' : 'Change Password'}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
