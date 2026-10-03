import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL, authedFetch } from '../lib/api';
import { toDialablePhone } from '../lib/phone';
import { useAuth } from '../contexts/AuthContext';
type Work = { id: string; state: string; claimed_by: string | null; lease_until: string | null; disposition: string | null; transcript: string | null; provider_call_id: string | null; transfer_state: string | null; last_error: string | null };
type Row = { phone_number: string; name: string | null; created_at: string; opted_out_at: string | null; work: Work; work_tasks: { title: string }[] };
export default function CallingQueue() {
    const { agent } = useAuth();
    const [queue, setQueue] = useState<'fresh' | 'aged'>('fresh');
    const [cursor, setCursor] = useState<string | null>(null);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [refresh, setRefresh] = useState(0);
    const requestId = useRef(0);
    useEffect(() => {
        const id = ++requestId.current;
        setLoading(true);
        authedFetch(`${API_BASE_URL}/api/deals/calling-queue?queue=${queue}&limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
            .then(async res => { const body = await res.json(); if (!res.ok) throw new Error(body.error || 'Could not load calling work'); return body.data; })
            .then(data => { if (id === requestId.current) { setRows(data.rows); setNextCursor(data.next_cursor); } })
            .catch(err => { if (id === requestId.current) setError(err.message); })
            .finally(() => { if (id === requestId.current) setLoading(false); });
        return () => { requestId.current++; };
    }, [queue, cursor, refresh]);
    useEffect(() => { const timer = setInterval(() => setRefresh(n => n + 1), 15000); return () => clearInterval(timer); }, []);
    async function act(id: string, action: string, disposition?: string) {
        setBusy(id); setError('');
        try {
            const res = await authedFetch(`${API_BASE_URL}/api/deals/calling-queue/${id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ disposition }) });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Could not update calling work');
            setRows(previous => previous.map(row => row.work.id === id ? { ...row, work: body.data } : row));
        } catch (err) { setError((err as Error).message); }
        finally { setBusy(null); }
    }
    return <section style={{ background: 'var(--card-bg)', padding: 20, borderRadius: 12 }}>
        <h2>Calling Distribution & Team Pipeline</h2>
        <p>Fresh intake is less than 48 hours old. Claims last fifteen minutes and can be renewed.</p>
        <p role="status">AI calling and phone transfer are unavailable while provider setup is pending. Manual calling is available; recordings require upload for review.</p>
        {error && <p role="alert">{error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
            {(['fresh', 'aged'] as const).map(tab => <button key={tab} type="button" aria-pressed={queue === tab} onClick={() => { setRows([]); setCursor(null); setQueue(tab); setError(''); }}>{tab === 'fresh' ? 'Fresh leads' : 'Aged / follow-up'}</button>)}
            <button type="button" onClick={() => { setError(''); setRefresh(n => n + 1); }}>Refresh</button>
        </div>
        {loading && <p role="status">Loading calling work…</p>}
        {!loading && !rows.length && <p>No leads in this queue.</p>}
        {rows.map(row => {
            const active = !!row.work.lease_until && new Date(row.work.lease_until).getTime() > Date.now();
            const mine = active && row.work.claimed_by === agent?.id;
            const disabled = busy === row.work.id;
            return <article key={row.work.id} style={{ padding: 16, marginTop: 12, border: '1px solid var(--border-secondary)', borderRadius: 8 }}>
                <strong>{row.name || 'Client'}</strong> · {row.phone_number}
                <p>Received {new Date(row.created_at).toLocaleString('en-IN')} · {row.work.state} {row.work.disposition && `· ${row.work.disposition}`}</p>
                {row.work_tasks[0] && <p>{row.work_tasks[0].title}</p>}
                <p>{active ? mine ? `Your claim expires ${new Date(row.work.lease_until!).toLocaleTimeString()}` : 'Claimed by another staff member' : 'Available to claim'}</p>
                {row.opted_out_at && <p>Contact opted out. Automated outreach is blocked.</p>}
                {row.work.last_error && <p role="status">{row.work.last_error}</p>}
                {row.work.transfer_state && <p>Phone transfer: {row.work.transfer_state}</p>}
                {row.work.provider_call_id && <p>Provider call: {row.work.provider_call_id}</p>}
                {row.work.transcript && <details><summary>Available transcript</summary><p style={{ whiteSpace: 'pre-wrap' }}>{row.work.transcript}</p></details>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {!mine && <button type="button" disabled={disabled || active} onClick={() => act(row.work.id, 'claim')}>Claim</button>}
                    {mine && <>
                        <button type="button" disabled={disabled} onClick={() => act(row.work.id, 'renew')}>Renew claim</button>
                        <button type="button" disabled={disabled} onClick={() => act(row.work.id, 'release')}>Release</button>
                        {!row.opted_out_at && toDialablePhone(row.phone_number) && <a href={`tel:${toDialablePhone(row.phone_number)}`}>Call manually</a>}
                        <button type="button" disabled={disabled || !!row.opted_out_at} onClick={() => act(row.work.id, 'start')}>AI start / setup status</button>
                        <button type="button" disabled={disabled} onClick={() => act(row.work.id, 'pause')}>Pause AI work</button>
                        <button type="button" disabled={disabled || !!row.opted_out_at} onClick={() => act(row.work.id, 'retry')}>Retry / setup status</button>
                        <button type="button" disabled={disabled} onClick={() => act(row.work.id, 'transfer')}>Request staff-phone transfer</button>
                        <select aria-label="Record calling outcome" value="" disabled={disabled} onChange={event => act(row.work.id, 'disposition', event.target.value)}>
                            <option value="" disabled>Record outcome…</option>
                            {['CONTACTED', 'CALLBACK', 'NO_ANSWER', 'WRONG_NUMBER', 'NOT_INTERESTED'].map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
                        </select>
                    </>}
                </div>
            </article>;
        })}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="button" disabled={loading || !cursor} onClick={() => setCursor(null)}>First page</button>
            <button type="button" disabled={loading || !nextCursor} onClick={() => setCursor(nextCursor)}>Next page</button>
        </div>
    </section>;
}
