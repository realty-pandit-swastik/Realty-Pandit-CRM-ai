import React, { useEffect, useState, useRef } from 'react';
import { API_BASE_URL, authedFetch } from '../lib/api';
import { Phone, Play, Pause, FileText, Check, AlertCircle, Clock } from 'lucide-react';
import { normalizePhoneInput } from '../lib/phone';

type Call = {
  id: string;
  phone_number: string;
  status: string;
  duration?: number | null;
  created_at: string;
  recording_url?: string | null;
  transcript?: string | null;
  ai_extraction?: Record<string, unknown> | null;
  confidence_score?: number | null;
  staff_edited_data?: { source?: string; review_status?: string; prior_values?: Record<string, unknown>; auto_saved_fields?: Record<string, unknown> } | null;
};

type CallerDossier = {
  found: boolean;
  phone_number?: string;
  contact?: {
    id: string;
    phone_number: string;
    name: string | null;
    contact_type: string;
    intent: string | null;
    property_type: string | null;
    budget_min: number | null;
    budget_max: number | null;
    preferred_location: string | null;
    ai_summary: string | null;
    assigned_agent: { id: string; name: string; phone: string | null; role: string } | null;
    last_channel: string | null;
    last_interaction: string | null;
  };
  deals?: Array<{
    id: string;
    status: string;
    source: string;
    source_ref: string | null;
    type: string;
    demand_intent: string | null;
    demand_location: string | null;
    demand_budget_min: number | null;
    demand_budget_max: number | null;
    coordinator_agent: { id: string; name: string } | null;
    created_at: string;
  }>;
  interactions?: Array<{
    id: string;
    event_type: string;
    direction: string;
    channel: string;
    content: string;
    created_at: string;
  }>;
  shortages?: Array<{
    id: string;
    deal_id: string;
    area: string | null;
    match_count: number;
    status: string;
  }>;
};

const editable = ['intent', 'role', 'propertyType', 'location', 'budgetMin', 'budgetMax', 'summary'] as const;
const crmField: Record<string, string> = {
  intent: 'intent',
  role: 'contact_type',
  propertyType: 'property_type',
  location: 'preferred_location',
  budgetMin: 'budget_min',
  budgetMax: 'budget_max',
  summary: 'ai_summary'
};

// The extractor and the review fields speak lakhs; the CRM stores budgets in rupees.
const toLakh = (rupees: unknown) => (rupees == null || rupees === '' ? null : +(Number(rupees) / 100000).toFixed(2));

type BulkRow = { file: File; phone: string; classification: 'INBOUND' | 'OUTBOUND'; status: 'pending' | 'uploading' | 'done' | 'error'; error?: string };
// Dialers usually put the number and direction in the file name (e.g. "Call_9876543210_out.m4a").
const guessPhone = (name: string) => name.match(/(?:\+?91[\s_-]?)?([6-9]\d{9})/)?.[1] ?? '';
const guessDirection = (name: string): 'INBOUND' | 'OUTBOUND' => (/outgoing|outbound|[\s_.-]out[\s_.-]/i.test(name) ? 'OUTBOUND' : 'INBOUND');

export default function StaffCallReview() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [selected, setSelected] = useState<Call | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [phone, setPhone] = useState('');
  const [classification, setClassification] = useState<'INBOUND' | 'OUTBOUND'>('INBOUND');
  const [matches, setMatches] = useState<Array<{ phone_number: string; name?: string; contact_type: string }>>([]);
  const [dossier, setDossier] = useState<CallerDossier | null>(null);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [bulk, setBulk] = useState<BulkRow[]>([]);
  const [autoShare, setAutoShare] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Audio player state
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const refresh = async () => {
    try {
      const response = await authedFetch(`${API_BASE_URL}/api/calls/?limit=30`);
      if (!response.ok) return;
      const data = await response.json();
      setCalls(data.calls || []);
    } catch {
      // ignore background poll error
    }
  };

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, []);

  // Alphanumeric lead search while typing phone or name
  useEffect(() => {
    if (phone.trim().length < 2) {
      setMatches([]);
      setDossier(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const response = await authedFetch(`${API_BASE_URL}/api/leads/search?q=${encodeURIComponent(phone.trim())}`);
        if (response.ok) {
          const list = await response.json();
          setMatches(list || []);
        }
      } catch {
        setMatches([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [phone]);

  // Caller identification lookup when a complete 10-digit number is reached
  useEffect(() => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 10) {
      setDossierLoading(true);
      const timer = setTimeout(async () => {
        try {
          const response = await authedFetch(`${API_BASE_URL}/api/calls/caller-id?phone=${encodeURIComponent(phone)}`);
          if (response.ok) {
            setDossier(await response.json());
          } else {
            setDossier(null);
          }
        } catch {
          setDossier(null);
        } finally {
          setDossierLoading(false);
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setDossier(null);
    }
  }, [phone]);

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    setSuccessMsg('');
    try {
      const form = new FormData();
      form.append('phone_number', phone);
      form.append('classification', classification);
      form.append('audio', file);
      const response = await authedFetch(`${API_BASE_URL}/api/calls/upload`, { method: 'POST', body: form });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Upload failed');
      }
      setFile(null);
      setSuccessMsg('Call recording uploaded! Transcription and AI extraction are in progress.');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const patchBulk = (i: number, patch: Partial<BulkRow>) =>
    setBulk(rows => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const pickBulk = (files: FileList | null) =>
    setBulk(Array.from(files || []).map(f => ({
      file: f, phone: normalizePhoneInput(guessPhone(f.name)), classification: guessDirection(f.name), status: 'pending' as const,
    })));

  // One request per file through the same endpoint as the single upload; a failed row doesn't stop the rest.
  const uploadAll = async () => {
    setBusy(true);
    setError('');
    setSuccessMsg('');
    let ok = 0;
    for (let i = 0; i < bulk.length; i++) {
      const row = bulk[i];
      if (row.status === 'done' || !row.phone.trim()) continue;
      patchBulk(i, { status: 'uploading', error: undefined });
      try {
        const form = new FormData();
        form.append('phone_number', row.phone);
        form.append('classification', row.classification);
        form.append('audio', row.file);
        const response = await authedFetch(`${API_BASE_URL}/api/calls/upload`, { method: 'POST', body: form });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Upload failed');
        patchBulk(i, { status: 'done' });
        ok++;
      } catch (e) {
        patchBulk(i, { status: 'error', error: (e as Error).message });
      }
    }
    setBusy(false);
    if (ok) {
      setSuccessMsg(`${ok} recording${ok > 1 ? 's' : ''} uploaded. Transcription and AI extraction are in progress.`);
      await refresh();
    }
  };

  const openCall = async (id: string) => {
    setError('');
    setSuccessMsg('');
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    try {
      const response = await authedFetch(`${API_BASE_URL}/api/calls/${id}`);
      if (!response.ok) throw new Error('Could not load call');
      const call: Call = await response.json();
      setSelected(call);
      setEdits(Object.fromEntries(editable.map(key => [key, String(call.ai_extraction?.[key] ?? '')])));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const submitCorrections = async () => {
    if (!selected) return;
    setBusy(true);
    setError('');
    setSuccessMsg('');
    try {
      const edited_data = Object.fromEntries(
        Object.entries(edits).map(([key, value]) => [
          key,
          key.startsWith('budget') ? (value ? Number(value) : null) : value || null,
        ])
      );
      const response = await authedFetch(`${API_BASE_URL}/api/calls/${selected.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edited_data, auto_share: autoShare }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Review submission failed');
      }
      const { followup } = await response.json();
      const extra = followup?.failed ? ' The lead could not be created automatically; a task was added for you.'
        : followup?.dealId ? ` Lead created${followup.shared ? `, ${followup.shared} matching propert${followup.shared > 1 ? 'ies' : 'y'} sent on WhatsApp` : ''}.`
        : followup?.listingTask ? ' A task was added to capture the listing.' : '';
      setSuccessMsg(`Call verified and approved! Updated CRM contact, lead score, and interaction history.${extra}`);
      setSelected(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rejectCall = async () => {
    if (!selected) return;
    if (!window.confirm('Are you sure you want to reject this call and permanently delete its audio recording?')) return;
    setBusy(true);
    setError('');
    try {
      const response = await authedFetch(`${API_BASE_URL}/api/calls/${selected.id}/reject`, {
        method: 'POST',
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Reject failed');
      }
      setSuccessMsg('Call rejected and recording purged.');
      setSelected(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const togglePlayAudio = async () => {
    if (!selected?.recording_url) return;
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }
    try {
      const response = await authedFetch(`${API_BASE_URL}${selected.recording_url}`);
      if (!response.ok) {
        setError('Recording audio file is unavailable.');
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        URL.revokeObjectURL(url);
      });
      await audio.play();
      setIsPlaying(true);
    } catch (err: any) {
      setError(err?.message || 'Audio playback failed');
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return { label: 'Approved', bg: '#064e3b', color: '#34d399' };
      case 'READY_FOR_REVIEW':
        return { label: 'Ready for Review', bg: '#1e3a5f', color: '#60a5fa' };
      case 'PROCESSING':
      case 'TRANSCRIBED':
        return { label: 'AI Processing', bg: '#451a03', color: '#fbbf24' };
      case 'REJECTED':
        return { label: 'Rejected', bg: '#450a0a', color: '#f87171' };
      default:
        return { label: status.replace(/_/g, ' '), bg: 'var(--bg-tertiary)', color: 'var(--text-secondary)' };
    }
  };

  return (
    <div style={{
      backgroundColor: 'var(--card-bg)',
      border: '1px solid var(--border-secondary)',
      borderRadius: '12px',
      padding: '20px',
      marginBottom: '24px',
      boxShadow: 'var(--card-shadow)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '12px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🎙️</span> AI Call Intelligence & Staff Review
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Capture calls, instant caller CRM identification, AI intent extraction, and staff verification.
          </p>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error-text)', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div style={{ backgroundColor: 'rgba(52,211,153,0.15)', color: '#34d399', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Check size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Section 1: Call Capture & Instant Caller Identification */}
      <form onSubmit={upload} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', alignItems: 'flex-end' }}>
          {/* Caller Number Input */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Caller Number or Name
            </label>
            <input
              type="text"
              placeholder="Search contact or type 10-digit phone"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-secondary)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>

          {/* Direction / Classification */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Call Direction
            </label>
            <select
              value={classification}
              onChange={e => setClassification(e.target.value as any)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-secondary)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '13px',
              }}
            >
              <option value="INBOUND">Inbound Call</option>
              <option value="OUTBOUND">Outbound Call</option>
            </select>
          </div>

          {/* Recording Audio Picker */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Call Audio Recording
            </label>
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.3gp,.ogg"
              onChange={e => setFile(e.target.files?.[0] || null)}
              required
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid var(--border-secondary)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '12px',
              }}
            />
          </div>

          {/* Upload Button */}
          <div>
            <button
              type="submit"
              disabled={busy || !file}
              style={{
                width: '100%',
                padding: '9px 16px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: busy ? 'var(--bg-tertiary)' : '#2563eb',
                color: '#fff',
                fontWeight: 600,
                fontSize: '13px',
                cursor: busy ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Phone size={14} />
              {busy ? 'Uploading...' : 'Upload & Process Call'}
            </button>
          </div>
        </div>

        {/* Alphanumeric Search Suggestions */}
        {matches.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Matching contacts:</span>
            {matches.map(m => (
              <button
                key={m.phone_number}
                type="button"
                onClick={() => { setPhone(normalizePhoneInput(m.phone_number)); setMatches([]); }}
                style={{
                  padding: '3px 10px',
                  borderRadius: '16px',
                  border: '1px solid var(--border-secondary)',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                {m.name || 'Unknown'} · {m.phone_number} ({m.contact_type})
              </button>
            ))}
          </div>
        )}

        {/* ── Caller Identification Dossier Overlay ── */}
        {dossierLoading && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={12} /> Looking up caller details in CRM...
          </div>
        )}

        {dossier && dossier.found && dossier.contact && (
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-secondary)',
            borderRadius: '10px',
            padding: '14px',
            marginTop: '4px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#3b82f6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px' }}>
                  {(dossier.contact.name || dossier.contact.phone_number || '?')[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                    {dossier.contact.name || 'Known Client'} · {dossier.contact.phone_number}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {dossier.contact.contact_type} · Assigned to: {dossier.contact.assigned_agent?.name || 'Unassigned'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600, backgroundColor: '#312e81', color: '#818cf8' }}>
                  {(dossier.contact.intent || 'CLIENT').toUpperCase()}
                </span>
                {dossier.shortages && dossier.shortages.length > 0 && (
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600, backgroundColor: '#450a0a', color: '#f87171' }}>
                    🚨 Unmet Demand Shortage
                  </span>
                )}
              </div>
            </div>

            {/* Requirements Details */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)', padding: '10px', borderRadius: '6px', marginBottom: '8px' }}>
              <div><strong>Property Type:</strong> {dossier.contact.property_type || 'Any'}</div>
              <div><strong>Location:</strong> {dossier.contact.preferred_location || 'Any'}</div>
              <div><strong>Budget:</strong> {dossier.contact.budget_max ? `₹${toLakh(dossier.contact.budget_max)} Lakh` : 'Not specified'}</div>
              <div><strong>Active Deals:</strong> {dossier.deals?.length || 0}</div>
            </div>

            {/* Active Deals Summary */}
            {dossier.deals && dossier.deals.length > 0 && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                <strong>Active Enquiries:</strong>{' '}
                {dossier.deals.map((d, i) => (
                  <span key={d.id} style={{ marginRight: '8px', color: 'var(--text-primary)' }}>
                    {d.source_ref ? `🏠 ${d.source_ref}` : 'General'} ({d.status}){i < dossier.deals!.length - 1 ? ' · ' : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </form>

      {/* Bulk upload: several recordings at once, one row per file */}
      <details style={{ marginBottom: '20px' }}>
        <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Bulk upload recordings</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
          <input type="file" multiple accept="audio/*,.mp3,.wav,.m4a,.3gp,.ogg" onChange={e => pickBulk(e.target.files)} style={{ fontSize: '12px' }} />
          {bulk.map((row, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 2fr) minmax(120px, 1fr) 110px minmax(80px, 1fr)', gap: '8px', alignItems: 'center', fontSize: '12px' }}>
              <span title={row.file.name} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{row.file.name}</span>
              <input
                type="text"
                placeholder="Phone number"
                value={row.phone}
                disabled={row.status === 'done' || row.status === 'uploading'}
                onChange={e => patchBulk(i, { phone: e.target.value })}
                style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '12px' }}
              />
              <select
                value={row.classification}
                disabled={row.status === 'done' || row.status === 'uploading'}
                onChange={e => patchBulk(i, { classification: e.target.value as BulkRow['classification'] })}
                style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '12px' }}
              >
                <option value="INBOUND">Inbound</option>
                <option value="OUTBOUND">Outbound</option>
              </select>
              <span style={{ color: row.status === 'done' ? '#34d399' : row.status === 'error' ? '#ef4444' : 'var(--text-muted)' }}>
                {row.status === 'error' ? row.error : row.status === 'pending' && !row.phone.trim() ? 'Needs a phone number' : row.status}
              </span>
            </div>
          ))}
          {bulk.length > 0 && (
            <button
              type="button"
              disabled={busy || bulk.every(r => r.status === 'done' || !r.phone.trim())}
              onClick={uploadAll}
              style={{ alignSelf: 'flex-start', padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#2563eb', color: '#fff', fontWeight: 600, fontSize: '13px', cursor: busy ? 'not-allowed' : 'pointer' }}
            >
              {busy ? 'Uploading...' : `Upload ${bulk.filter(r => r.status !== 'done' && r.phone.trim()).length} recording(s)`}
            </button>
          )}
        </div>
      </details>


      {/* Section 2: Recent Staff Calls Queue */}
      <div style={{ borderTop: '1px solid var(--border-secondary)', paddingTop: '16px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
          Call Review Queue ({calls.length})
        </h3>

        {calls.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
            No calls recorded yet. Upload a call audio above to begin processing.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {calls.map(call => {
              const badge = statusBadge(call.status);
              return (
                <div
                  key={call.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-secondary)',
                    backgroundColor: selected?.id === call.id ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Phone size={14} color="var(--text-secondary)" />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {call.phone_number}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {new Date(call.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                        {call.duration ? ` · ${Math.round(call.duration)}s` : ''}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600, backgroundColor: badge.bg, color: badge.color }}>
                      {badge.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => openCall(call.id)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-secondary)',
                        backgroundColor: 'var(--card-bg)',
                        color: 'var(--text-link)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {selected?.id === call.id ? 'Close' : 'Review'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 3: Selected Call Review Drawer / Modal Panel */}
      {selected && (
        <div style={{
          marginTop: '20px',
          padding: '16px',
          borderRadius: '10px',
          border: '1px solid var(--border-secondary)',
          backgroundColor: 'var(--bg-secondary)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '10px' }}>
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Call Verification: {selected.phone_number}
            </h4>
            <div style={{ display: 'flex', gap: '8px' }}>
              {selected.recording_url && (
                <button
                  type="button"
                  onClick={togglePlayAudio}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-secondary)',
                    backgroundColor: isPlaying ? '#2563eb' : 'var(--card-bg)',
                    color: isPlaying ? '#fff' : 'var(--text-primary)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                  {isPlaying ? 'Pause Audio' : 'Play Recording'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelected(null)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-secondary)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                ✕ Close
              </button>
            </div>
          </div>

          {/* Transcript View */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={14} /> Call Transcript
            </div>
            <div style={{
              padding: '10px 12px',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-tertiary)',
              fontSize: '13px',
              color: 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
              maxHeight: '140px',
              overflowY: 'auto',
              lineHeight: 1.5,
            }}>
              {selected.transcript || 'Transcript pending or processing...'}
            </div>
          </div>

          {/* AI Extracted Fields & Staff Correction */}
          {selected.status === 'READY_FOR_REVIEW' && (
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                Verify and correct extracted fields before approving into the CRM SSOT:
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                {editable.map(key => {
                  const rawPrior = selected.staff_edited_data?.prior_values?.[crmField[key]];
                  const prior = key.startsWith('budget') ? toLakh(rawPrior) : rawPrior;
                  return (
                    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                        {key.replace(/([A-Z])/g, ' $1')}{key.startsWith('budget') ? ' (lakh)' : ''}
                      </label>
                      <input
                        type={key.startsWith('budget') ? 'number' : 'text'}
                        value={edits[key] || ''}
                        onChange={e => setEdits({ ...edits, [key]: e.target.value })}
                        style={{
                          padding: '7px 10px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-secondary)',
                          backgroundColor: 'var(--card-bg)',
                          color: 'var(--text-primary)',
                          fontSize: '12px',
                        }}
                      />
                      {crmField[key] in (selected.staff_edited_data?.prior_values || {}) && (
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>CRM prior: {String(prior ?? 'none')}</span>
                          <button
                            type="button"
                            onClick={() => setEdits({ ...edits, [key]: prior == null ? '' : String(prior) })}
                            style={{ background: 'none', border: 'none', color: 'var(--text-link)', fontSize: '10px', cursor: 'pointer', padding: 0 }}
                          >
                            Restore
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {['BUY', 'RENT'].includes((edits.intent || '').toUpperCase()) && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                  <input type="checkbox" checked={autoShare} onChange={e => setAutoShare(e.target.checked)} />
                  On approval, create the lead and send the caller their best matching properties on WhatsApp
                </label>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={rejectCall}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    border: '1px solid #ef4444',
                    backgroundColor: 'transparent',
                    color: '#ef4444',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  Reject & Delete Audio
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={submitCorrections}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#16a34a',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  ✓ Approve Corrections
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
