import { useEffect, useState } from 'react';
import { API_BASE_URL, authedFetch } from '../lib/api';

type Shortage = { id: string; deal_id: string; area: string | null; demand: { intent?: string; budget_max?: number; schema_values?: Record<string, unknown> }; match_count: number; owner_id: string | null; status: string };
type Lead = { phone_number: string; name: string | null; created_at: string; assigned_agent_id: string | null; work_tasks: { title: string; due_date: string }[] };

export default function SourcingBoard() {
  const [shortages, setShortages] = useState<Shortage[]>([]);
  const [queues, setQueues] = useState<{ fresh: Lead[]; aged: Lead[] }>({ fresh: [], aged: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      authedFetch(`${API_BASE_URL}/api/deals/shortages`),
      authedFetch(`${API_BASE_URL}/api/deals/calling-queue`),
    ]).then(async responses => {
      if (responses.some(response => !response.ok)) throw new Error('Could not load sourcing work');
      const [s, q] = await Promise.all(responses.map(response => response.json()));
      setShortages(s.data || []);
      setQueues(q.data || { fresh: [], aged: [] });
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div role="status">Loading sourcing work…</div>;
  if (error) return <div role="alert">{error}</div>;
  return <main style={{ padding: 24 }}>
    <h1>Sourcing and calling</h1>
    <section aria-labelledby="shortages-heading">
      <h2 id="shortages-heading">Shortage Book ({shortages.length})</h2>
      {shortages.length === 0 ? <p>No open shortages.</p> : <ul>{shortages.map(s => <li key={s.id}>
        <strong>{s.area || 'Area unspecified'}</strong> · {s.demand.intent || 'Buy'} · {s.match_count}/3 active matches · Owner {s.owner_id || 'Unassigned'} · {s.status}
        <div>Demand: {JSON.stringify(s.demand.schema_values || {})} {s.demand.budget_max ? `· Max ₹${s.demand.budget_max.toLocaleString('en-IN')}` : ''}</div>
      </li>)}</ul>}
    </section>
    {(['fresh', 'aged'] as const).map(queue => <section key={queue} aria-labelledby={`${queue}-heading`}>
      <h2 id={`${queue}-heading`}>{queue === 'fresh' ? 'Fresh leads' : 'Aged leads'} ({queues[queue].length})</h2>
      {queues[queue].length === 0 ? <p>No leads in this queue.</p> : <ul>{queues[queue].map(lead => <li key={lead.phone_number}>
        <a href={`tel:${lead.phone_number}`}>{lead.name || lead.phone_number}</a> · Assigned {lead.assigned_agent_id || 'Unassigned'}
        {lead.work_tasks[0] && <> · Next task: {lead.work_tasks[0].title}</>}
      </li>)}</ul>}
    </section>)}
  </main>;
}
