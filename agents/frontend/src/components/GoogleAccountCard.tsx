import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useToast } from '../contexts/ToastContext';

interface Cfg {
    available?: boolean;
    connected?: boolean;
    google_email?: string | null;
    connected_at?: string | null;
    sync_enabled?: boolean;
}

/**
 * Self-service "Connect Google" card (2026-05-18). Mirrors EmailAccountCard.
 * Lets a member link their OWN Google account so their deal reminders + visit
 * appointments also land in their Google Calendar + Tasks.
 *
 * The OAuth callback redirects back to /profile?google=<status>, which we
 * surface as a toast on mount.
 */
export function GoogleAccountCard({ isMobile }: { isMobile?: boolean }) {
    const { showToast } = useToast();
    const [cfg, setCfg] = useState<Cfg | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const load = async () => {
        try {
            const res = await client.get('/api/team/me/google-config');
            setCfg(res.data?.data || {});
        } catch {
            showToast('Could not load Google settings', 'error');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    // Note: the ?google=<status> OAuth callback toast is handled globally in
    // App.tsx (the SPA has no router, so the card may not be mounted on return).

    const connect = async () => {
        setBusy(true);
        try {
            const res = await client.get('/api/team/me/google/connect');
            const url = res.data?.data?.url;
            if (!url) throw new Error('no url');
            // Top-level navigation — Google consent must not be in an iframe/XHR
            window.location.href = url;
        } catch (e: any) {
            showToast(e?.response?.data?.error || 'Could not start Google connect', 'error');
            setBusy(false);
        }
    };

    const toggleSync = async (next: boolean) => {
        setBusy(true);
        try {
            await client.put('/api/team/me/google-config', { sync_enabled: next });
            showToast(next ? 'Google sync turned on' : 'Google sync paused', 'success');
            load();
        } catch (e: any) {
            showToast(e?.response?.data?.error || 'Failed to update', 'error');
        } finally {
            setBusy(false);
        }
    };

    const disconnect = async () => {
        setBusy(true);
        try {
            await client.delete('/api/team/me/google');
            showToast('Google account disconnected', 'success');
            load();
        } catch (e: any) {
            showToast(e?.response?.data?.error || 'Failed to disconnect', 'error');
        } finally {
            setBusy(false);
        }
    };

    const card: React.CSSProperties = {
        backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px',
        marginBottom: '16px', border: '1px solid var(--border-secondary)',
    };

    if (loading) {
        return (
            <div style={card}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 14 }}>
                    📅 Google Calendar &amp; Tasks
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
            </div>
        );
    }

    // OAuth client not provisioned on this environment — hide the feature.
    if (cfg && cfg.available === false) return null;

    const connected = !!cfg?.connected;

    return (
        <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                    📅 Google Calendar &amp; Tasks
                </div>
                {connected && (
                    <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>● Connected</span>
                )}
            </div>

            <div style={{
                fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6,
                padding: '10px 12px', borderRadius: 8, marginBottom: 16,
                backgroundColor: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)',
            }}>
                Connect your own Google account so the deal reminders you set and
                your scheduled property visits also appear in <strong>your Google
                Calendar (with pop-up alerts)</strong> and <strong>Google Tasks</strong> —
                so you never miss a client call-back.
                <br /><br />
                Only your own reminders and visits sync. You can pause or disconnect
                anytime. We never read your existing calendar.
            </div>

            {/* Get the Google apps so notifications actually reach the phone */}
            <div style={{
                fontSize: 12, color: 'var(--text-muted)', marginBottom: 16,
                padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
            }}>
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    📲 Install the Google apps to get the alerts on your phone:
                </div>
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 20 }}>
                    <div>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 2 }}>📅 Google Calendar</div>
                        <a href="https://play.google.com/store/apps/details?id=com.google.android.calendar" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-link)', marginRight: 12 }}>Android</a>
                        <a href="https://apps.apple.com/app/google-calendar/id909319292" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-link)' }}>iPhone</a>
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 2 }}>✅ Google Tasks</div>
                        <a href="https://play.google.com/store/apps/details?id=com.google.android.apps.tasks" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-link)', marginRight: 12 }}>Android</a>
                        <a href="https://apps.apple.com/app/google-tasks/id1353634006" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-link)' }}>iPhone</a>
                    </div>
                </div>
            </div>

            {connected ? (
                <>
                    <div style={{
                        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
                        gap: 10, alignItems: isMobile ? 'flex-start' : 'center',
                        justifyContent: 'space-between', marginBottom: 16,
                    }}>
                        <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                            Connected as <strong>{cfg?.google_email || 'your Google account'}</strong>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={!!cfg?.sync_enabled}
                                disabled={busy}
                                onChange={e => toggleSync(e.target.checked)}
                            />
                            Sync {cfg?.sync_enabled ? 'on' : 'paused'}
                        </label>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            type="button"
                            onClick={disconnect}
                            disabled={busy}
                            style={{
                                padding: '10px 18px', borderRadius: 8, fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer',
                                backgroundColor: 'transparent', border: '1px solid #f87171', color: '#f87171', opacity: busy ? 0.6 : 1,
                            }}
                        >
                            Disconnect
                        </button>
                    </div>
                </>
            ) : (
                <button
                    type="button"
                    onClick={connect}
                    disabled={busy}
                    style={{
                        padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                        backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none',
                        cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
                    }}
                >
                    {busy ? 'Connecting…' : 'Connect Google'}
                </button>
            )}
        </div>
    );
}
