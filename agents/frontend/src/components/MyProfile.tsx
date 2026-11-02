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
        backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-card)', padding: 'var(--rp-s-6)',
        marginBottom: 'var(--rp-s-4)', border: '1px solid var(--border-primary)',
    };
    const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 };
    const input: React.CSSProperties = {
        width: '100%', padding: 'var(--rp-s-3)', borderRadius: 'var(--radius-control)', fontSize: 14,
        border: '1px solid var(--control-line)', backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
    };
    const ro: React.CSSProperties = { fontSize: 13, color: 'var(--text-primary)', padding: '8px 0' };
    const btn = (bg: string, disabled?: boolean): React.CSSProperties => ({
        padding: '12px 16px', borderRadius: 'var(--radius-control)', fontSize: 13, fontWeight: 600,
        backgroundColor: bg, color: 'var(--surface-white)', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
    });

    // The actual mailbox is keyed lowercase on the mail server — show that
    // (not the possibly mixed-case login email) for Outlook setup.
    const mailboxAddr = (me?.email || '').toLowerCase();

    return (
        <div className="rp-profile" style={{
            flex: 1, padding: isMobile ? '16px' : '24px', overflowY: 'auto',
            backgroundColor: 'var(--bg-secondary)',
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
                        <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)', marginBottom: 16 }}>Personal Details</div>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                            <div>
                                <label htmlFor="rp-profile-name" style={label}>Name</label>
                                <input id="rp-profile-name" style={input} value={name} onChange={e => setName(e.target.value)} />
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
                            <button type="button" onClick={saveProfile} disabled={savingProfile} style={btn('var(--blue-600)', savingProfile)}>
                                {savingProfile ? 'Saving…' : 'Save Details'}
                            </button>
                        </div>
                    </div>

                    {/* Portal account email — read-only (admin-managed) */}
                    <div style={card}>
                        <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)', marginBottom: 8 }}>Portal Account Email</div>
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
                            <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)' }}>Your Email Mailbox</div>
                            {me?.email_mailbox_activated && (
                                <span style={{ fontSize: 12, color: 'var(--rp-success-text)', fontWeight: 600 }}>● Activated</span>
                            )}
                        </div>

                        {!me?.email_mailbox_activated ? (
                            /* Not activated — prompt to set the mailbox password first */
                            <>
                                <div style={{
                                    fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 14,
                                    padding: '10px 12px', borderRadius: 8,
                                    backgroundColor: 'var(--rp-warn-bg)', border: '1px solid var(--rp-warn-line)',
                                }}>
                                    <strong>Activate your email account.</strong> First, set your
                                    mailbox password below. Once set, your Outlook configuration
                                    (incoming &amp; outgoing servers) appears here so you can send
                                    and receive your <strong>{mailboxAddr}</strong> email.
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label htmlFor="rp-mailbox-password" style={label}>New mailbox password</label>
                                        <input id="rp-mailbox-password" style={input} type="password" value={mbPwd} onChange={e => setMbPwd(e.target.value)} autoComplete="new-password" />
                                    </div>
                                    <div>
                                        <label htmlFor="rp-mailbox-confirm" style={label}>Confirm password</label>
                                        <input id="rp-mailbox-confirm" style={input} type="password" value={mbConfirm} onChange={e => setMbConfirm(e.target.value)} autoComplete="new-password" />
                                    </div>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                                    8–64 chars; letters, digits and ! @ # % ^ * ( ) _ - + = . : ? (no spaces).
                                    This is separate from your CRM login password.
                                </div>
                                <div style={{ marginTop: 16 }}>
                                    <button type="button" onClick={setMailboxPassword} disabled={savingMb} style={btn('var(--blue-600)', savingMb)}>
                                        {savingMb ? 'Activating…' : 'Set Password & Activate'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            /* Activated — show the Outlook send+receive config */
                            <>
                                <div style={{
                                    fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 14,
                                    padding: '10px 12px', borderRadius: 8,
                                    backgroundColor: 'var(--rp-info-bg)', border: '1px solid var(--rp-info-line)',
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
                                                <label htmlFor="rp-mailbox-password" style={label}>New mailbox password</label>
                                                <input id="rp-mailbox-password" style={input} type="password" value={mbPwd} onChange={e => setMbPwd(e.target.value)} autoComplete="new-password" />
                                            </div>
                                            <div>
                                                <label htmlFor="rp-mailbox-confirm" style={label}>Confirm password</label>
                                                <input id="rp-mailbox-confirm" style={input} type="password" value={mbConfirm} onChange={e => setMbConfirm(e.target.value)} autoComplete="new-password" />
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                            <button type="button" onClick={setMailboxPassword} disabled={savingMb} style={btn('var(--blue-600)', savingMb)}>
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
                        <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)', marginBottom: 16 }}>Change Password</div>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                            <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
                                <label htmlFor="rp-current-password" style={label}>Current Password</label>
                                <input id="rp-current-password" style={input} type="password" value={curPwd} onChange={e => setCurPwd(e.target.value)} autoComplete="current-password" />
                            </div>
                            <div>
                                <label htmlFor="rp-new-password" style={label}>New Password (min 8)</label>
                                <input id="rp-new-password" style={input} type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} autoComplete="new-password" />
                            </div>
                            <div>
                                <label htmlFor="rp-confirm-password" style={label}>Confirm New Password</label>
                                <input id="rp-confirm-password" style={input} type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} autoComplete="new-password" />
                            </div>
                        </div>
                        <div style={{ marginTop: 16 }}>
                            <button
                                type="button"
                                onClick={changePassword}
                                disabled={savingPwd || !curPwd || !newPwd || !confirmPwd}
                                style={btn('var(--blue-600)', savingPwd || !curPwd || !newPwd || !confirmPwd)}
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
