import { useEffect, useState } from 'react';
import { API_BASE_URL, authedFetch } from '../lib/api';
import { normalizePhoneInput, isValidPhoneInput } from '../lib/phone';

type Dossier = {
  found: boolean;
  contact?: { name: string | null; phone_number: string; property_type: string | null; preferred_location: string | null; budget_max: number | null; ai_summary: string | null; assigned_agent?: { name: string } | null };
  deals?: Array<{ id: string; status: string; source: string; demand_location: string | null }>;
  interactions?: Array<{ id: string; channel: string; content: string; created_at: string }>;
  shortages?: Array<{ id: string; area: string | null; match_count: number }>;
};

/** Shared, permission-filtered caller context for call review, lead detail and deal detail. */
export default function CallerDossier({ phone }: { phone: string }) {
  const normalized = isValidPhoneInput(phone) ? normalizePhoneInput(phone) : '';
  const [result, setResult] = useState<{ phone: string; data?: Dossier; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!isValidPhoneInput(normalized)) return;
    let active = true;
    setResult(null);
    const timer = setTimeout(async () => {
      try {
        const response = await authedFetch(`${API_BASE_URL}/api/calls/caller-id?phone=${encodeURIComponent(normalized)}`);
        if (!response.ok) throw new Error('Caller details could not be loaded.');
        const data: Dossier = await response.json();
        if (active) setResult({ phone: normalized, data });
      } catch (error) {
        if (active) setResult({ phone: normalized, error: (error as Error).message });
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [normalized, retry]);
  if (!isValidPhoneInput(normalized)) return null;
  const current = result?.phone === normalized ? result : null;
  const dossier = current?.data;
  return <section aria-label="Caller dossier" style={{ padding: 12, marginBottom: 12, border: '1px solid var(--border-secondary)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }}>
    <strong>Caller dossier</strong>
    {!current && <p role="status">Loading caller details…</p>}
    {current?.error && <div role="alert"><p>{current.error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Retry caller lookup</button></div>}
    {dossier && !dossier.found && <p>No visible CRM record for this number.</p>}
    {dossier?.found && dossier.contact && <>
      <p>{dossier.contact.name || 'Unnamed contact'} · {dossier.contact.phone_number} · Assigned to {dossier.contact.assigned_agent?.name || 'Unassigned'}</p>
      <p>{dossier.contact.property_type || 'Type unspecified'} · {dossier.contact.preferred_location || 'Location unspecified'} · {dossier.contact.budget_max == null ? 'Budget unspecified' : `Up to ₹${(Number(dossier.contact.budget_max) / 100000).toLocaleString('en-IN')} lakh`}</p>
      {dossier.contact.ai_summary && <p style={{ whiteSpace: 'pre-wrap' }}>{dossier.contact.ai_summary}</p>}
      <details><summary>Enquiries ({dossier.deals?.length || 0}) and recent activity</summary>
        {dossier.deals?.map(deal => <p key={deal.id}>{deal.source} · {deal.status} · {deal.demand_location || 'Location unspecified'}</p>)}
        {dossier.shortages?.map(shortage => <p key={shortage.id}>Open shortage: {shortage.area || 'Area unspecified'} · {shortage.match_count} suitable matches</p>)}
        {dossier.interactions?.length ? dossier.interactions.map(interaction => <p key={interaction.id} style={{ whiteSpace: 'pre-wrap' }}>{new Date(interaction.created_at).toLocaleString('en-IN')} · {interaction.channel}: {interaction.content}</p>) : <p>No recent activity.</p>}
      </details>
    </>}
  </section>;
}
