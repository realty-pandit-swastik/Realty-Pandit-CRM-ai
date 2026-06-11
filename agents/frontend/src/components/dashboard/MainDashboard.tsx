import React, { useEffect, useState } from 'react';
import { getContacts, getAppointments, getInventory, getWorkflowStats } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';

export const MainDashboard: React.FC = () => {
  const { agent } = useAuth();
  const isMobile = useIsMobile();
  const [stats, setStats] = useState({
    totalContacts: 0,
    hotLeads: 0,
    warmLeads: 0,
    coldLeads: 0,
    // 2026-05-12 Bug D fix: dashboard pills previously summed to less than totalContacts
    // because contacts with lead_status='lost' or other values were dropped silently.
    // Now we surface lostLeads + an 'other' bucket so the math always reconciles.
    lostLeads: 0,
    otherLeads: 0,
    todayAppointments: 0,
    activeProperties: 0,
    recentContacts: [] as any[],
  });
  const [workflowStats, setWorkflowStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Load contacts
      const contacts = await getContacts();
      const today = new Date().toISOString().split('T')[0];

      // Load today's appointments
      const appointments = await getAppointments({
        startDate: today,
        endDate: today,
      });

      // Load active properties
      const inventory = await getInventory({ status: 'active', limit: 1 });

      // Load workflow stats
      getWorkflowStats().then(ws => setWorkflowStats(ws)).catch(() => {});

      // 2026-05-12 (later): "Total Contacts" used to count all rows (1575) including partners
      // landlords, internal management — which is misleading because team uses this to gauge
      // their LEAD pipeline. Filter to demand-side types only.
      const LEAD_TYPES = new Set(['BUYER', 'TENANT', 'UNKNOWN']);
      const leads = contacts.filter((c: any) => !c.contact_type || LEAD_TYPES.has(c.contact_type));

      const totalContacts = leads.length;
      const hotLeads = leads.filter((c: any) => c.lead_status === 'hot').length;
      const warmLeads = leads.filter((c: any) => c.lead_status === 'warm').length;
      const coldLeads = leads.filter((c: any) => c.lead_status === 'cold').length;
      const lostLeads = leads.filter((c: any) => c.lead_status === 'lost' || c.lead_status === 'closed').length;
      // 'other' catches anything else (legacy 'NEW' rows, null, etc.) so the math reconciles.
      const otherLeads = totalContacts - hotLeads - warmLeads - coldLeads - lostLeads;
      const todayAppointments = appointments?.length || 0;
      const activeProperties = inventory?.total || 0;

      // Get recent contacts (last 6)
      const recentContacts = [...contacts]
        .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 6);

      setStats({
        totalContacts,
        hotLeads,
        warmLeads,
        coldLeads,
        lostLeads,
        otherLeads,
        todayAppointments,
        activeProperties,
        recentContacts,
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = agent?.name?.split(' ')[0] || 'there';
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--text-secondary)',
        }}
      >
        Loading dashboard...
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: isMobile ? '16px' : '32px 40px',
        backgroundColor: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        gap: isMobile ? '16px' : '28px',
      }}
    >
      {/* Greeting */}
      <div>
        <h1 style={{ color: 'var(--text-primary)', fontSize: isMobile ? '18px' : '24px', fontWeight: 700, margin: 0 }}>
          {greeting}, {firstName} 👋
        </h1>
        <p style={{ color: 'var(--text-muted)', margin: '6px 0 0', fontSize: '14px' }}>{today}</p>
      </div>

      {/* Bento Grid */}
      <div style={{ marginBottom: isMobile ? '16px' : '24px' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
          Quick Overview
        </p>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--bento-gap)' }}>
            {[120, 80, 80, 80, 80, 80].map((h, i) => (
              <div key={i} className="skeleton" style={{ height: h, borderRadius: '16px', gridColumn: i === 0 ? '1 / -1' : undefined }} />
            ))}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--bento-gap)',
          }}>
            {/* Wide tile: Total Leads — spans full width
                2026-05-12: renamed from "Total Contacts" + filtered to BUYER/TENANT/UNKNOWN
                because the team uses this to gauge their lead pipeline (not internal staff
                or partners). */}
            <div style={{
              gridColumn: '1 / -1',
              backgroundColor: '#1e3a5f',
              borderRadius: 'var(--radius-clay)',
              padding: isMobile ? '16px' : '20px',
              boxShadow: 'var(--shadow-clay)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              border: '1px solid rgba(96,165,250,0.2)',
            }}>
              <div>
                <div style={{ fontSize: '13px', color: '#93c5fd', fontWeight: 600, marginBottom: '4px' }}>Total Leads</div>
                <div style={{ fontSize: '40px', fontWeight: 800, color: '#60a5fa', lineHeight: 1 }}>{stats.totalContacts}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>buyers + tenants</div>
              </div>
              <div style={{ fontSize: '40px', opacity: 0.4 }}>👥</div>
            </div>

            {/* HOT Leads */}
            <div style={{ backgroundColor: 'var(--error-bg)', borderRadius: 'var(--radius-clay)', padding: isMobile ? '12px' : '16px', boxShadow: 'var(--shadow-clay)', textAlign: 'center', border: '1px solid rgba(239,68,68,0.2)' }}>
              <div style={{ fontSize: isMobile ? '20px' : '24px' }}>🔥</div>
              <div style={{ fontSize: isMobile ? '28px' : '32px', fontWeight: 800, color: '#f87171', lineHeight: 1.1 }}>{stats.hotLeads}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>HOT Leads</div>
            </div>

            {/* WARM Leads */}
            <div style={{ backgroundColor: 'var(--success-bg)', borderRadius: 'var(--radius-clay)', padding: isMobile ? '12px' : '16px', boxShadow: 'var(--shadow-clay)', textAlign: 'center', border: '1px solid rgba(34,197,94,0.2)' }}>
              <div style={{ fontSize: isMobile ? '20px' : '24px' }}>🟢</div>
              <div style={{ fontSize: isMobile ? '28px' : '32px', fontWeight: 800, color: 'var(--success-text-bright, #4ade80)', lineHeight: 1.1 }}>{stats.warmLeads}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>WARM Leads</div>
            </div>

            {/* COLD Leads */}
            <div style={{ backgroundColor: '#1e3558', borderRadius: 'var(--radius-clay)', padding: isMobile ? '12px' : '16px', boxShadow: 'var(--shadow-clay)', textAlign: 'center', border: '1px solid rgba(147,197,253,0.15)' }}>
              <div style={{ fontSize: isMobile ? '20px' : '24px' }}>❄️</div>
              <div style={{ fontSize: isMobile ? '28px' : '32px', fontWeight: 800, color: '#93c5fd', lineHeight: 1.1 }}>{stats.coldLeads}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>COLD Leads</div>
            </div>

            {/* LOST Leads — 2026-05-12 Bug D fix: surfaced so totals reconcile */}
            <div style={{ backgroundColor: '#3b1f1f', borderRadius: 'var(--radius-clay)', padding: isMobile ? '12px' : '16px', boxShadow: 'var(--shadow-clay)', textAlign: 'center', border: '1px solid rgba(127,29,29,0.4)' }}>
              <div style={{ fontSize: isMobile ? '20px' : '24px' }}>❌</div>
              <div style={{ fontSize: isMobile ? '28px' : '32px', fontWeight: 800, color: '#fca5a5', lineHeight: 1.1 }}>{stats.lostLeads}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>LOST</div>
            </div>

            {/* Today's Appointments */}
            <div style={{ backgroundColor: '#2e1f47', borderRadius: 'var(--radius-clay)', padding: isMobile ? '12px' : '16px', boxShadow: 'var(--shadow-clay)', textAlign: 'center', border: '1px solid rgba(167,139,250,0.2)' }}>
              <div style={{ fontSize: isMobile ? '20px' : '24px' }}>📅</div>
              <div style={{ fontSize: isMobile ? '28px' : '32px', fontWeight: 800, color: '#a78bfa', lineHeight: 1.1 }}>{stats.todayAppointments}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Appointments</div>
            </div>

            {/* Active Properties — spans full width */}
            <div style={{ gridColumn: '1 / -1', backgroundColor: '#1a3d2f', borderRadius: 'var(--radius-clay)', padding: isMobile ? '12px 16px' : '14px 20px', boxShadow: 'var(--shadow-clay)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid rgba(52,211,153,0.15)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '24px' }}>🏠</span>
                <div>
                  <div style={{ fontSize: '11px', color: '#6ee7b7', fontWeight: 600 }}>Active Properties</div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#34d399', lineHeight: 1 }}>{stats.activeProperties}</div>
                </div>
              </div>
              <div style={{ fontSize: '11px', color: '#6ee7b7', opacity: 0.7 }}>inventory</div>
            </div>
          </div>
        )}
      </div>

      {/* Workflow Tasks — horizontal scrollable chip row */}
      {workflowStats && workflowStats.total > 0 && (
        <div style={{ marginBottom: isMobile ? '16px' : '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Lead Tasks</p>
            {workflowStats.overdue > 0 && (
              <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, backgroundColor: '#ef444422', color: '#ef4444' }}>
                {workflowStats.overdue} overdue
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', WebkitOverflowScrolling: 'touch' }}>
            {[
              // 2026-05-12: HIGH-priority callback/visit requests come from WhatsApp
              // button taps and free-text "call me back". Surfaced first because
              // they have 15-30 min SLAs and auto-escalate to super_boss if missed.
              { key: 'CALLBACK_REQUEST', icon: '📞', label: 'Callback NOW', color: '#ef4444' },
              { key: 'VISIT_REQUEST',    icon: '🏃', label: 'Visit ASAP',   color: '#f43f5e' },
              { key: 'QUALIFY_LEAD',     icon: '📞', label: 'Qualify',   color: '#3b82f6' },
              { key: 'SHARE_PROPERTIES', icon: '📤', label: 'Share',     color: '#8b5cf6' },
              { key: 'SCHEDULE_VISIT',   icon: '📅', label: 'Visit',     color: '#f59e0b' },
              { key: 'VISIT_FEEDBACK',   icon: '✅', label: 'Feedback',  color: '#06b6d4' },
              { key: 'NEGOTIATE_DEAL',   icon: '🤝', label: 'Negotiate', color: '#f97316' },
            ].map(s => {
              const count = workflowStats.by_stage?.[s.key] || 0;
              if (!count) return null;
              return (
                <div key={s.key} style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '6px 12px', borderRadius: 'var(--radius-chip)',
                  backgroundColor: s.color + '18', border: `1.5px solid ${s.color}33`,
                  fontSize: '12px', whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  <span>{s.icon}</span>
                  <span style={{ fontWeight: 700, color: s.color }}>{count}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                </div>
              );
            })}
            {workflowStats.completed_today > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: 'var(--radius-chip)', backgroundColor: '#22c55e18', border: '1.5px solid #22c55e33', fontSize: '12px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                <span>🏆</span>
                <span style={{ fontWeight: 700, color: '#22c55e' }}>{workflowStats.completed_today}</span>
                <span style={{ color: 'var(--text-muted)' }}>done today</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent Contacts */}
      {stats.recentContacts.length > 0 && (
        <div>
          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: '12px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              margin: '0 0 12px',
            }}
          >
            Recent Contacts
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? '100%' : '300px'}, 1fr))`, gap: '8px' }}>
            {stats.recentContacts.map((c: any) => (
              <div
                key={c.phone_number}
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  border: '1px solid var(--border-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--bg-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    flexShrink: 0,
                  }}
                >
                  {({ BUYER: '🏠', TENANT: '🛋️', LANDLORD: '🔑', PARTNER_AGENT: '🤝', MANAGEMENT: '👔' } as Record<string, string>)[c.contact_type] || '👤'}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      color: 'var(--text-primary)',
                      fontWeight: 600,
                      fontSize: '13px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.name || c.phone_number}
                  </div>
                  {c.name && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{c.phone_number}</div>
                  )}
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>
                    {c.lead_status?.toUpperCase() || 'UNKNOWN'}
                  </div>
                </div>
                <div
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 600,
                    backgroundColor:
                      c.lead_status === 'hot'
                        ? '#fee2e2'
                        : c.lead_status === 'warm'
                        ? '#dcfce7'
                        : c.lead_status === 'cold'
                        ? '#dbeafe'
                        : '#f3f4f6',
                    color:
                      c.lead_status === 'hot'
                        ? '#991b1b'
                        : c.lead_status === 'warm'
                        ? '#166534'
                        : c.lead_status === 'cold'
                        ? '#1e40af'
                        : '#374151',
                  }}
                >
                  {c.lead_status?.toUpperCase() || 'UNKNOWN'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hint */}
      <div
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-secondary)',
          borderRadius: '12px',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <span style={{ fontSize: '20px' }}>💡</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          Explore different tabs above to view detailed analytics, market trends, and team performance metrics.
        </span>
      </div>
    </div>
  );
};
