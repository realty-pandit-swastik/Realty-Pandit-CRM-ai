import { useEffect, useState } from 'react';
import { API_BASE_URL, authedFetch } from '../lib/api';

type Call = {
  id: string;
  phone_number: string;
  status: string;
  created_at: string;
  recording_url?: string | null;
  transcript?: string | null;
  ai_extraction?: Record<string, unknown> | null;
  staff_edited_data?: { source?: string; review_status?: string; prior_values?: Record<string, unknown>; auto_saved_fields?: Record<string, unknown> } | null;
};

const editable = ['intent', 'role', 'propertyType', 'location', 'budgetMin', 'budgetMax', 'summary'] as const;
const crmField: Record<string, string> = { intent: 'intent', role: 'contact_type', propertyType: 'property_type', location: 'preferred_location', budgetMin: 'budget_min', budgetMax: 'budget_max', summary: 'ai_summary' };

export default function StaffCallReview() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [selected, setSelected] = useState<Call | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [phone, setPhone] = useState('');
  const [matches, setMatches] = useState<Array<{ phone_number: string; name?: string; contact_type: string }>>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    const response = await authedFetch(`${API_BASE_URL}/api/calls/?limit=30`);
    if (!response.ok) throw new Error('Could not load staff calls');
    setCalls((await response.json()).calls || []);
  };

  useEffect(() => {
    refresh().catch(e => setError(e.message));
    const timer = setInterval(() => refresh().catch(() => {}), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (phone.trim().length < 2) { setMatches([]); return; }
    const timer = setTimeout(async () => {
      const response = await authedFetch(`${API_BASE_URL}/api/leads/search?q=${encodeURIComponent(phone)}`);
      if (response.ok) setMatches(await response.json());
    }, 250);
    return () => clearTimeout(timer);
  }, [phone]);

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('phone_number', phone);
      form.append('classification', 'INBOUND');
      form.append('audio', file);
      const response = await authedFetch(`${API_BASE_URL}/api/calls/upload`, { method: 'POST', body: form });
      if (!response.ok) throw new Error((await response.json()).error || 'Upload failed');
      setFile(null);
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const open = async (id: string) => {
    setError('');
    try {
      const response = await authedFetch(`${API_BASE_URL}/api/calls/${id}`);
      if (!response.ok) throw new Error('Could not load call');
      const call: Call = await response.json();
      setSelected(call);
      setEdits(Object.fromEntries(editable.map(key => [key, String(call.ai_extraction?.[key] ?? '')])));
    } catch (e) { setError((e as Error).message); }
  };

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const edited_data = Object.fromEntries(Object.entries(edits).map(([key, value]) =>
        [key, key.startsWith('budget') ? (value ? Number(value) : null) : value || null]));
      const response = await authedFetch(`${API_BASE_URL}/api/calls/${selected.id}/submit`, {
        method: 'POST', body: JSON.stringify({ edited_data }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Review failed');
      setSelected(null);
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const play = async () => {
    if (!selected?.recording_url) return;
    const response = await authedFetch(`${API_BASE_URL}${selected.recording_url}`);
    if (!response.ok) { setError('Recording unavailable'); return; }
    const url = URL.createObjectURL(await response.blob());
    const audio = new Audio(url);
    audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true });
    await audio.play();
  };

  return <section className="bg-white rounded-lg shadow p-4 mb-6" aria-label="Staff call review">
    <h2 className="text-xl font-semibold mb-3">Recording review</h2>
    <form onSubmit={upload} className="flex flex-wrap gap-2 items-center mb-4">
      <label>Caller number <input className="border p-2 rounded" value={phone} onChange={e => setPhone(e.target.value)} required /></label>
      {matches.length > 0 && <div aria-label="Matching contacts" className="flex flex-wrap gap-2">
        {matches.map(match => <button type="button" key={match.phone_number} className="border rounded px-2 py-1"
          onClick={() => { setPhone(match.phone_number); setMatches([]); }}>
          {match.name || match.phone_number} · {match.contact_type}
        </button>)}
      </div>}
      <label>Recording <input type="file" accept="audio/*" onChange={e => setFile(e.target.files?.[0] || null)} required /></label>
      <button className="bg-blue-700 text-white px-3 py-2 rounded" disabled={busy}>Upload for review</button>
    </form>
    {error && <p role="alert" className="text-red-700 mb-2">{error}</p>}
    <div className="space-y-2 mb-4">
      {calls.map(call => <div key={call.id} className="flex gap-3 items-center border-b pb-2">
        <span>{call.phone_number}</span><span>{call.status.replaceAll('_', ' ')}</span>
        <button className="text-blue-700 underline" onClick={() => open(call.id)}>View</button>
      </div>)}
    </div>
    {selected && <div className="border-t pt-4 space-y-3">
      <h3 className="font-semibold">{selected.phone_number} · {selected.status.replaceAll('_', ' ')}</h3>
      {selected.recording_url && <button className="text-blue-700 underline" onClick={play}>Play recording</button>}
      <p className="whitespace-pre-wrap">{selected.transcript || 'Transcript pending'}</p>
      {selected.status === 'READY_FOR_REVIEW' && <>
        <p>Source: {selected.staff_edited_data?.source || 'AI call'} · Review: {selected.staff_edited_data?.review_status || 'PENDING'}. Correct any field before approving; clearing a field removes its AI value.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {editable.map(key => <label key={key} className="flex flex-col">{key}
            <input className="border p-2 rounded" type={key.startsWith('budget') ? 'number' : 'text'} value={edits[key] || ''}
              onChange={e => setEdits({ ...edits, [key]: e.target.value })} />
            {crmField[key] in (selected.staff_edited_data?.prior_values || {}) && <span className="text-sm text-gray-600">
              Previous CRM value: {String(selected.staff_edited_data?.prior_values?.[crmField[key]] ?? 'empty')}
              <button type="button" className="text-blue-700 underline ml-2" onClick={() => {
                const prior = selected.staff_edited_data?.prior_values?.[crmField[key]];
                setEdits({ ...edits, [key]: prior == null ? '' : key === 'intent' ? String(prior).toUpperCase() : String(prior) });
              }}>Restore</button>
            </span>}
          </label>)}
        </div>
        <button className="bg-green-700 text-white px-3 py-2 rounded" disabled={busy} onClick={submit}>Approve corrections</button>
      </>}
    </div>}
  </section>;
}
