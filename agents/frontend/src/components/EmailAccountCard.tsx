import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useToast } from '../contexts/ToastContext';

interface Cfg {
    account_email?: string;
    provider?: string | null;
    smtp_host?: string | null;
    smtp_port?: number | null;
    smtp_secure?: boolean | null;
    smtp_username?: string | null;
    password_set?: boolean;
    configured_at?: string | null;
}

const PRESETS: Record<string, { host: string; port: number; secure: boolean; label: string }> = {
    outlook: { host: 'smtp-mail.outlook.com', port: 587, secure: false, label: 'Outlook.com / Hotmail' },
    office365: { host: 'smtp.office365.com', port: 587, secure: false, label: 'Microsoft 365 (work)' },
    gmail: { host: 'smtp.gmail.com', port: 587, secure: false, label: 'Gmail / Google Workspace' },
    custom: { host: '', port: 587, secure: false, label: 'Custom SMTP' },
};

export function EmailAccountCard({ isMobile, readOnly }: { isMobile?: boolean; readOnly?: boolean }) {
    const { showToast } = useToast();
    const [cfg, setCfg] = useState<Cfg | null>(null);
    const [loading, setLoading] = useState(true);
    const [provider, setProvider] = useState('outlook');
    const [host, setHost] = useState('');
    const [port, setPort] = useState(587);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [saving, setSaving] = useState(false);

    const load = async () => {
        try {
            const res = await client.get('/api/team/me/email-config');
            const d: Cfg = res.data?.data || {};
            setCfg(d);
            setProvider(d.provider || 'outlook');
            setHost(d.smtp_host || PRESETS.outlook.host);
            setPort(d.smtp_port || 587);
            setUsername(d.smtp_username || d.account_email || '');
        } catch {
            showToast('Could not load email settings', 'error');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const applyPreset = (p: string) => {
        setProvider(p);
        const preset = PRESETS[p];
        if (preset && p !== 'custom') {
            setHost(preset.host);
            setPort(preset.port);
        }
    };

    const save = async () => {
        if (!host || !port || !username) { showToast('Fill SMTP host, port and username', 'error'); return; }
        if (!cfg?.password_set && !password) { showToast('Enter your email app password', 'error'); return; }
        setSaving(true);
        try {
            await client.put('/api/team/me/email-config', {
                provider,
                smtp_host: host,
                smtp_port: port,
                smtp_secure: port === 465,
                smtp_username: username,
                ...(password ? { password } : {}),
            });
            showToast('Email account saved — your emails now send from this mailbox', 'success');
            setPassword('');
            load();
        } catch (e: any) {
            showToast(e?.response?.data?.error || 'Failed to save', 'error');
        } finally {
            setSaving(false);
        }
    };

    const clearCfg = async () => {
        setSaving(true);
        try {
            await client.put('/api/team/me/email-config', { clear: true });
            showToast('Email account disconnected — emails will use the shared sender', 'success');
            setPassword('');
            load();
        } catch (e: any) {
            showToast(e?.response?.data?.error || 'Failed to clear', 'error');
        } finally {
            setSaving(false);
        }
    };

    const label: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase' };
    const input: React.CSSProperties = {
        width: '100%', padding: '9px 10px', borderRadius: 7, fontSize: 13,
        border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
    };

    return (
        <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', marginBottom: '16px', border: '1px solid var(--border-secondary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>✉️ Email Sending Account</div>
                {cfg?.configured_at && (
                    <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>● Connected</span>
                )}
            </div>

            {loading ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
            ) : readOnly ? (
                /* Read-only: members view these settings to add the mailbox in
                   Outlook / their mail app. Only an admin can change them. */
                <>
                    <div style={{
                        fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6,
                        padding: '10px 12px', borderRadius: 8, marginBottom: 16,
                        backgroundColor: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)',
                    }}>
                        Use these settings to add your mailbox in <strong>Outlook</strong> (or any
                        mail app) and manage your emails. These are managed by your admin —
                        if anything looks wrong, ask your admin to update it in Team Management.
                    </div>
                    {cfg?.configured_at ? (
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                            {([
                                ['Account email', cfg?.account_email],
                                ['Provider', cfg?.provider && (PRESETS[cfg.provider]?.label || cfg.provider)],
                                ['Outgoing server (SMTP) host', cfg?.smtp_host],
                                ['Outgoing server (SMTP) port', cfg?.smtp_port != null ? String(cfg.smtp_port) : null],
                                ['Encryption', cfg?.smtp_secure ? 'SSL/TLS' : 'STARTTLS'],
                                ['Username', cfg?.smtp_username || cfg?.account_email],
                                ['Password', cfg?.password_set ? 'Set ✓ (ask admin if you need it for Outlook)' : 'Not set'],
                            ] as [string, string | null | undefined][]).map(([k, v]) => (
                                <div key={k}>
                                    <div style={label}>{k}</div>
                                    <div style={{ fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{v || '—'}</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                            No email-sending account configured yet. Ask your admin to set it up
                            in Team Management.
                        </div>
                    )}
                </>
            ) : (
                <>
                    <div style={{
                        fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6,
                        padding: '10px 12px', borderRadius: 8, marginBottom: 16,
                        backgroundColor: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)',
                    }}>
                        Connect your own Outlook / Microsoft 365 mailbox so emails you send from
                        the CRM go out as <strong>{cfg?.account_email}</strong>.
                        <br /><br />
                        <strong>How to configure Outlook / Microsoft 365:</strong>
                        <ol style={{ margin: '6px 0 0 18px', padding: 0 }}>
                            <li>Sign in to your mailbox in a browser.</li>
                            <li>Open <em>Security → App passwords</em> (you may need 2-step verification on, or ask your IT admin to allow SMTP AUTH).</li>
                            <li>Create an app password and paste it below — do not use your normal login password.</li>
                            <li>Pick your provider preset, confirm host/port, and Save.</li>
                        </ol>
                        <span style={{ display: 'block', marginTop: 8 }}>
                            Note: some Microsoft 365 work accounts have SMTP AUTH disabled by the
                            organisation admin — if saving fails to send, ask your admin to enable
                            “Authenticated SMTP” for your mailbox.
                        </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                        <div>
                            <div style={label}>Provider</div>
                            <select style={input} value={provider} onChange={e => applyPreset(e.target.value)}>
                                {Object.entries(PRESETS).map(([k, v]) => (
                                    <option key={k} value={k}>{v.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <div style={label}>Email address (username)</div>
                            <input style={input} value={username} onChange={e => setUsername(e.target.value)} placeholder="you@yourcompany.com" />
                        </div>
                        <div>
                            <div style={label}>SMTP host</div>
                            <input style={input} value={host} onChange={e => setHost(e.target.value)} disabled={provider !== 'custom'} />
                        </div>
                        <div>
                            <div style={label}>SMTP port</div>
                            <input style={input} type="number" value={port} onChange={e => setPort(parseInt(e.target.value, 10) || 587)} disabled={provider !== 'custom'} />
                        </div>
                        <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
                            <div style={label}>{cfg?.password_set ? 'Change email app password' : 'Email app password'}</div>
                            <input
                                style={input}
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder={cfg?.password_set ? '•••••••• (leave blank to keep current)' : 'App password'}
                                autoComplete="new-password"
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                        <button
                            type="button"
                            onClick={save}
                            disabled={saving}
                            style={{
                                padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                                backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none',
                                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                            }}
                        >
                            {saving ? 'Saving…' : 'Save Email Account'}
                        </button>
                        {cfg?.configured_at && (
                            <button
                                type="button"
                                onClick={clearCfg}
                                disabled={saving}
                                style={{
                                    padding: '10px 18px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                                    backgroundColor: 'transparent', border: '1px solid #f87171', color: '#f87171',
                                }}
                            >
                                Disconnect
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
