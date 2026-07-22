import React, { useEffect, useState } from 'react';
import { getManagementAlerts } from '../../api/client';

const SEV: Record<string, { bg: string; border: string; fg: string; icon: string }> = {
  high: { bg: '#3b1f1f', border: 'rgba(239,68,68,0.4)', fg: '#fca5a5', icon: '🔴' },
  medium: { bg: '#3a2f1a', border: 'rgba(245,158,11,0.4)', fg: '#fcd34d', icon: '🟠' },
  low: { bg: '#1e3558', border: 'rgba(147,197,253,0.3)', fg: '#93c5fd', icon: '🔵' },
};

/**
 * Management Alerts panel (Phase 3). Self-hides while loading, on error, or when there
 * is nothing to flag. Data is role-scoped on the backend, so a manager sees only their
 * team's alerts. Rendered on the Main Dashboard for managers + super_boss.
 */
export const ManagementAlerts: React.FC = () => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const d = await getManagementAlerts();
        setAlerts(d.alerts || []);
      } catch (e) {
        console.error('Error loading management alerts:', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  if (!loaded || alerts.length === 0) return null;

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
        ⚠️ Needs Attention
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
        {alerts.map((a) => {
          const s = SEV[a.severity] || SEV.low;
          return (
            <div key={a.type} style={{ backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: '12px', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px' }}>{s.icon}</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '14px' }}>{a.title}</span>
                <span style={{ marginLeft: 'auto', fontWeight: 800, color: s.fg, fontSize: '18px' }}>{a.count}</span>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{a.detail}</div>
              {a.names && a.names.length > 0 && (
                <div style={{ marginTop: '6px', fontSize: '11px', color: s.fg }}>
                  {a.names.slice(0, 5).join(', ')}
                  {a.names.length > 5 ? ` +${a.names.length - 5} more` : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
