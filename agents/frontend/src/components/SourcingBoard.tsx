import { useEffect, useState } from 'react';
import { API_BASE_URL, authedFetch } from '../lib/api';
import { RefreshCw, MapPin, CheckCircle, AlertTriangle, ShieldAlert, ClipboardList } from 'lucide-react';
import CallingQueue from './CallingQueue';
import { useAuth } from '../contexts/AuthContext';

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

export default function SourcingBoard() {
  const { agent, hasPermission } = useAuth();
  const [threshold, setThreshold] = useState(3);
  const [thresholdInput, setThresholdInput] = useState('3');
  const [shortages, setShortages] = useState<Shortage[]>([]);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(false);
  const [refreshingShortageId, setRefreshingShortageId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const shortagesRes = await authedFetch(`${API_BASE_URL}/api/deals/shortages`);
      if (!shortagesRes.ok) throw new Error('Could not load sourcing data');
      const sData = await shortagesRes.json();
      setShortages(sData.data || []);
      setThreshold(sData.threshold || 3);
      setThresholdInput(String(sData.threshold || 3));
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

  const saveThreshold = async () => {
    setBusyAction(true);
    setError('');
    try {
      const res = await authedFetch(`${API_BASE_URL}/api/deals/shortages/settings`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: Number(thresholdInput) }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Could not save threshold');
      setThreshold(Number(thresholdInput));
      setSuccessMsg('Shortage threshold saved. Inventory matching will refresh shortly.');
      await loadData();
    } catch (e) { setError((e as Error).message); }
    finally { setBusyAction(false); }
  };

  const criticalShortages = shortages.filter(s => s.match_count === 0);
  const lowStockShortages = shortages.filter(s => s.match_count > 0);

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
          {agent?.role === 'super_boss' && hasPermission('manage_settings') && (
            <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '13px' }}>
              Match threshold
              <input aria-label="Shortage match threshold" type="number" min={1} max={100}
                value={thresholdInput} onChange={event => setThresholdInput(event.target.value)} style={{ width: '60px' }} />
              <button type="button" disabled={busyAction} onClick={saveThreshold}>Save</button>
            </label>
          )}
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
            Low Stock (&lt; {threshold} Matches)
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#f59e0b', marginTop: '6px' }}>
            {lowStockShortages.length}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Fewer than {threshold} options to present
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-secondary)', borderRadius: '12px', padding: '18px', boxShadow: 'var(--card-shadow)' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Active Calling Queue
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#3b82f6', marginTop: '6px' }}>
            Paginated
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Fresh intake and aged follow-up
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
              Client requirements with fewer than {threshold} suitable inventory matches. Agents can survey societies in these target areas.
            </p>
          </div>
        </div>

        {shortages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)', fontSize: '14px' }}>
            <CheckCircle size={32} color="#34d399" style={{ margin: '0 auto 10px auto' }} />
            <div>No open inventory shortages for your team.</div>
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

      <CallingQueue />
    </div>
  );
}
