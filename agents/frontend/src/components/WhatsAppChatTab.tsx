import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getInteractions } from '../api/client';

/**
 * Read-only WhatsApp conversation history between Panditji (AI/team) and the
 * customer — every message both ways, including template / marketing /
 * workflow messages. Reused by the Deal modal and the Lead detail panel,
 * desktop + PWA. Data: GET /api/contacts/:phone/interactions (already
 * role-access-controlled server-side). 2026-05-19.
 * See docs/plans/2026-05-19-whatsapp-chat-tab.md
 */

interface Interaction {
    id?: string;
    channel?: string | null;
    direction?: string | null;
    event_type?: string | null;
    content?: string | null;
    created_at?: string;
}

// event_type values worth labelling so marketing/system msgs are obvious.
const EVENT_LABEL: Record<string, string> = {
    template: 'template',
    marketing: 'marketing',
    followup: 'follow-up',
    workflow_message: 'workflow',
    workflow_start: 'workflow',
    closing_signal: 'closing signal',
    property_shared: 'property card',
    omnidim_call_attempt: 'AI call',
    authentication_confirmed: 'system',
};

function fmtTime(iso?: string): string {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short',
            hour: '2-digit', minute: '2-digit',
        });
    } catch { return ''; }
}

export function WhatsAppChatTab({ phone, isMobile }: { phone: string; isMobile?: boolean }) {
    const [rows, setRows] = useState<Interaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const endRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            if (!phone) { setRows([]); setLoading(false); return; }
            setLoading(true); setError('');
            try {
                const res: any = await getInteractions(phone);
                const list: Interaction[] = Array.isArray(res) ? res : (res?.data || res?.interactions || []);
                if (cancelled) return;
                const wa = list
                    .filter(i => (i.channel || '').toLowerCase() === 'whatsapp')
                    .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
                setRows(wa);
            } catch (e: any) {
                if (!cancelled) setError(e?.response?.data?.error || 'Could not load the conversation');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        run();
        return () => { cancelled = true; };
    }, [phone]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: 'end' });
    }, [rows]);

    const dayGroups = useMemo(() => {
        const groups: { day: string; items: Interaction[] }[] = [];
        for (const r of rows) {
            const day = r.created_at
                ? new Date(r.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
                : '—';
            const last = groups[groups.length - 1];
            if (last && last.day === day) last.items.push(r);
            else groups.push({ day, items: [r] });
        }
        return groups;
    }, [rows]);

    const wrap: React.CSSProperties = {
        display: 'flex', flexDirection: 'column', gap: 4,
        maxHeight: isMobile ? '60vh' : 460, overflowY: 'auto',
        padding: isMobile ? '8px 4px' : '12px 8px',
        backgroundColor: 'var(--bg-primary)', borderRadius: 10,
    };

    if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 16 }}>Loading conversation…</div>;
    if (error) return <div style={{ color: '#f87171', fontSize: 13, padding: 16 }}>{error}</div>;
    if (rows.length === 0) {
        return <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 20, textAlign: 'center' }}>No WhatsApp messages with this customer yet.</div>;
    }

    return (
        <div style={wrap}>
            {dayGroups.map((g, gi) => (
                <div key={gi}>
                    <div style={{ textAlign: 'center', margin: '10px 0 6px' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', backgroundColor: 'var(--bg-secondary)', padding: '2px 10px', borderRadius: 10 }}>{g.day}</span>
                    </div>
                    {g.items.map((m, i) => {
                        const inbound = (m.direction || '').toLowerCase() === 'inbound';
                        const et = (m.event_type || '').toLowerCase();
                        const label = et && et !== 'message' ? (EVENT_LABEL[et] || et.replace(/_/g, ' ')) : '';
                        return (
                            <div key={m.id || i} style={{ display: 'flex', justifyContent: inbound ? 'flex-start' : 'flex-end', marginBottom: 6 }}>
                                <div style={{
                                    maxWidth: isMobile ? '82%' : '74%',
                                    backgroundColor: inbound ? 'var(--bg-secondary)' : 'rgba(37,211,102,0.18)',
                                    border: `1px solid ${inbound ? 'var(--border-secondary)' : 'rgba(37,211,102,0.4)'}`,
                                    borderRadius: 10, padding: '8px 11px',
                                }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: inbound ? 'var(--text-secondary)' : '#16a34a', marginBottom: 3, display: 'flex', gap: 6, alignItems: 'center' }}>
                                        {inbound ? 'Customer' : 'Panditji / Team'}
                                        {label && (
                                            <span style={{ fontWeight: 600, color: 'var(--text-muted)', backgroundColor: 'var(--bg-primary)', padding: '0 6px', borderRadius: 6, textTransform: 'uppercase', fontSize: 9 }}>{label}</span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                        {m.content || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>[no text]</span>}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right', marginTop: 3 }}>{fmtTime(m.created_at)}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}
            <div ref={endRef} />
        </div>
    );
}
