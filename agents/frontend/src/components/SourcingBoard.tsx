import { useEffect, useState } from 'react';
import { API_BASE_URL, authedFetch } from '../lib/api';
import { Phone, MessageSquare, RefreshCw, MapPin, CheckCircle, AlertTriangle, ShieldAlert, Calendar, ClipboardList } from 'lucide-react';
import { toDialablePhone } from '../lib/phone';

type Shortage = {
  id: string;
  deal_id: string;
  area: string | null;
  demand: {
    intent?: string;
    budget_min?: number;
    budget_max?: number;
    taxonomy_node_id?: string;
    schema_values?: Record<string, unknown>;
  };
  match_count: number;
  owner_id: string | null;
  status: string;
};

type Lead = {
  phone_number: string;
  name: string | null;
  created_at: string;
  assigned_agent_id: string | null;
  work_tasks: { id: string; title: string; due_date: string }[];
};

export default function SourcingBoard() {
  const [shortages, setShortages] = useState<Shortage[]>([]);
  const [queues, setQueues] = useState<{ fresh: Lead[]; aged: Lead[] }>({ fresh: [], aged: [] });
  const [activeQueueTab, setActiveQueueTab] = useState<'fresh' | 'aged'>('fresh');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(false);
  const [refreshingShortageId, setRefreshingShortageId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [shortagesRes, queueRes] = await Promise.all([
        authedFetch(`${API_BASE_URL}/api/deals/shortages`),
        authedFetch(`${API_BASE_URL}/api/deals/calling-queue`),
      ]);
      if (!shortagesRes.ok || !queueRes.ok) throw new Error('Could not load sourcing data');
      const [sData, qData] = await Promise.all([shortagesRes.json(), queueRes.json()]);
      setShortages(sData.data || []);
      setQueues(qData.data || { fresh: [], aged: [] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleGenerateTasks = async () => {
    setBusyAction(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await authedFetch(`${API_BASE_URL}/api/deals/shortages/generate-tasks`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate survey tasks');
      }
      setSuccessMsg('Field survey tasks successfully generated for team agents!');
      await loadData();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyAction(false);
    }
  };

  const handleRefreshShortage = async (id: string) => {
    setRefreshingShortageId(id);
    setError('');
    try {
      const res = await authedFetch(`${API_BASE_URL}/api/deals/shortages/${id}/refresh`, { method: 'POST' });
      if (!res.ok) throw new Error('Refresh failed');
      await loadData();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshingShortageId(null);
    }
  };

  const criticalShortages = shortages.filter(s => s.match_count === 0);
  const lowStockShortages = shortages.filter(s => s.match_count > 0 && s.match_count < 3);

  if (loading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading Sourcing & Shortage Book...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            🔎 Inventory Sourcing & Shortage Book
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Identify unmet buyer demand, generate society survey tasks, and distribute pipeline calling queues.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            disabled={busyAction}
            onClick={handleGenerateTasks}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#2563eb',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: busyAction ? 'not-allowed' : 'pointer',
            }}
          >
            <ClipboardList size={15} />
            {busyAction ? 'Generating Tasks...' : 'Generate Daily Survey Tasks'}
          </button>
          <button
            type="button"
            onClick={loadData}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-secondary)',
              backgroundColor: 'var(--card-bg)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error-text)', padding: '12px 16px', borderRadius: '8px', fontSize: '13px', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {successMsg && (
        <div style={{ backgroundColor: 'rgba(52,211,153,0.15)', color: '#34d399', padding: '12px 16px', borderRadius: '8px', fontSize: '13px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* KPI Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-secondary)', borderRadius: '12px', padding: '18px', boxShadow: 'var(--card-shadow)' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Open Shortages
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '6px' }}>
            {shortages.length}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Requirements needing stock
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-secondary)', borderRadius: '12px', padding: '18px', boxShadow: 'var(--card-shadow)' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Critical (0 Matches)
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#ef4444', marginTop: '6px' }}>
            {criticalShortages.length}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Zero inventory available in database
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-secondary)', borderRadius: '12px', padding: '18px', boxShadow: 'var(--card-shadow)' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Low Stock (&lt; 3 Matches)
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#f59e0b', marginTop: '6px' }}>
            {lowStockShortages.length}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Fewer than 3 options to present
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-secondary)', borderRadius: '12px', padding: '18px', boxShadow: 'var(--card-shadow)' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Active Calling Queue
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#3b82f6', marginTop: '6px' }}>
            {queues.fresh.length + queues.aged.length}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {queues.fresh.length} fresh &middot; {queues.aged.length} follow-up
          </div>
        </div>
      </div>

      {/* Section 1: Shortage Book */}
      <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-secondary)', borderRadius: '12px', padding: '20px', marginBottom: '32px', boxShadow: 'var(--card-shadow)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              📕 Unfulfilled Demand: Shortage Book ({shortages.length})
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              Client requirements with less than 3 inventory matches. Agents can survey societies in these target areas.
            </p>
          </div>
        </div>

        {shortages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)', fontSize: '14px' }}>
            <CheckCircle size={32} color="#34d399" style={{ margin: '0 auto 10px auto' }} />
            <div>All active client demands currently have 3+ matching inventory options in stock!</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
            {shortages.map(item => {
              const isCritical = item.match_count === 0;
              return (
                <div
                  key={item.id}
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-secondary)',
                    borderRadius: '10px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    {/* Top Row: Area & Status Badge */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                        <MapPin size={15} color="#ef4444" />
                        <span>{item.area || 'Area Unspecified'}</span>
                      </div>
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontWeight: 700,
                        backgroundColor: isCritical ? '#450a0a' : '#451a03',
                        color: isCritical ? '#f87171' : '#fbbf24',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}>
                        {isCritical ? <ShieldAlert size={12} /> : <AlertTriangle size={12} />}
                        {item.match_count} Matches
                      </span>
                    </div>

                    {/* Demand Criteria */}
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: 1.5 }}>
                      <div>
                        <strong>Intent:</strong> {(item.demand.intent || 'BUY').toUpperCase()}{' '}
                        {item.demand.budget_max ? ` · Max: ₹${Number(item.demand.budget_max).toLocaleString('en-IN')}` : ''}
                      </div>
                      {item.demand.schema_values && Object.keys(item.demand.schema_values).length > 0 && (
                        <div style={{ marginTop: '4px', color: 'var(--text-muted)' }}>
                          <strong>Specs:</strong> {Object.entries(item.demand.schema_values).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bottom Row: Owner & Check Matches Action */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-secondary)', paddingTop: '10px', marginTop: '10px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Deal: #{item.deal_id.slice(0, 8)}
                    </span>
                    <button
                      type="button"
                      disabled={refreshingShortageId === item.id}
                      onClick={() => handleRefreshShortage(item.id)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-secondary)',
                        backgroundColor: 'var(--card-bg)',
                        color: 'var(--text-primary)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: refreshingShortageId === item.id ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <RefreshCw size={11} className={refreshingShortageId === item.id ? 'spin' : ''} />
                      {refreshingShortageId === item.id ? 'Matching...' : 'Check Matches'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: Team Pipeline & Calling Queues */}
      <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-secondary)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--card-shadow)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              📞 Calling Distribution & Team Pipeline
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              Distribute fresh intake and aged leads to agents for AI-assisted calling and direct human follow-up.
            </p>
          </div>

          {/* Queue Selector Tabs */}
          <div style={{ display: 'flex', gap: '6px', backgroundColor: 'var(--bg-secondary)', padding: '4px', borderRadius: '8px' }}>
            <button
              type="button"
              onClick={() => setActiveQueueTab('fresh')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: activeQueueTab === 'fresh' ? '#2563eb' : 'transparent',
                color: activeQueueTab === 'fresh' ? '#fff' : 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Fresh Leads ({queues.fresh.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveQueueTab('aged')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: activeQueueTab === 'aged' ? '#2563eb' : 'transparent',
                color: activeQueueTab === 'aged' ? '#fff' : 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Aged / Follow-Up ({queues.aged.length})
            </button>
          </div>
        </div>

        {/* Lead List */}
        {queues[activeQueueTab].length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)', fontSize: '13px' }}>
            No leads in the {activeQueueTab} queue at this time.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {queues[activeQueueTab].map(lead => {
              const dialNumber = toDialablePhone(lead.phone_number);
              const waNumber = lead.phone_number.replace(/\D/g, '');
              return (
                <div
                  key={lead.phone_number}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-secondary)',
                    backgroundColor: 'var(--bg-secondary)',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                      {(lead.name || lead.phone_number || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                        {lead.name || 'Client'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {lead.phone_number} &middot; Received {new Date(lead.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  </div>

                  {/* Task & Next Action */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {lead.work_tasks[0] && (
                      <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={11} /> {lead.work_tasks[0].title}
                      </span>
                    )}

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <a
                        href={`tel:${dialNumber}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          backgroundColor: '#2563eb',
                          color: '#fff',
                          textDecoration: 'none',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        <Phone size={13} /> Call
                      </a>
                      <a
                        href={`https://wa.me/${waNumber}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          backgroundColor: '#25d366',
                          color: '#fff',
                          textDecoration: 'none',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        <MessageSquare size={13} /> WhatsApp
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
