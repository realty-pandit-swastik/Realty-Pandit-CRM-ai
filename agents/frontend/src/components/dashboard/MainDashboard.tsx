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

      // Calculate stats
      const totalContacts = contacts.length;
      const hotLeads = contacts.filter((c: any) => c.lead_status === 'hot').length;
      const warmLeads = contacts.filter((c: any) => c.lead_status === 'warm').length;
      const coldLeads = contacts.filter((c: any) => c.lead_status === 'cold').length;
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

  const statCards = [
    { label: 'Total Contacts', value: stats.totalContacts, color: 'var(--text-link)', bg: '#1e3a5f', icon: '👥' },
    { label: 'HOT Leads', value: stats.hotLeads, color: '#f87171', bg: 'var(--error-bg)', icon: '🔥' },
    { label: 'WARM Leads', value: stats.warmLeads, color: 'var(--success-text-bright)', bg: 'var(--success-bg)', icon: '🟢' },
    { label: 'COLD Leads', value: stats.coldLeads, color: '#93c5fd', bg: '#1e3558', icon: '❄️' },
    { label: "Today's Appointments", value: stats.todayAppointments, color: '#a78bfa', bg: '#2e1f47', icon: '📅' },
    { label: 'Active Properties', value: stats.activeProperties, color: '#34d399', bg: '#1a3d2f', icon: '🏠' },
  ];

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

      {/* Stat Cards */}
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
          Quick Overview
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? '140px' : '180px'}, 1fr))`, gap: isMobile ? '8px' : '12px' }}>
          {statCards.map((s) => (
            <div
              key={s.label}
              style={{
                backgroundColor: s.bg,
                borderRadius: isMobile ? '10px' : '12px',
                padding: isMobile ? '10px' : '16px',
                textAlign: 'center',
                border: `1px solid ${s.color}33`,
              }}
            >
              <div style={{ fontSize: isMobile ? '16px' : '20px', marginBottom: isMobile ? '4px' : '8px' }}>{s.icon}</div>
              <div style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: isMobile ? '10px' : '12px', color: 'var(--text-secondary)', marginTop: isMobile ? '4px' : '6px', lineHeight: 1.3 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Workflow Tasks Summary */}
      {workflowStats && (workflowStats.total > 0 || workflowStats.overdue > 0) && (
        <div style={{ marginBottom: isMobile ? '16px' : '24px', padding: isMobile ? '12px' : '16px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-secondary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontWeight: 600, fontSize: isMobile ? '14px' : '15px', color: 'var(--text-primary)' }}>Lead Tasks</span>
            {workflowStats.overdue > 0 && (
              <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, backgroundColor: '#ef444422', color: '#ef4444' }}>
                {workflowStats.overdue} overdue
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {[
              { key: 'QUALIFY_LEAD', icon: '📞', label: 'Qualify', color: '#3b82f6' },
              { key: 'SHARE_PROPERTIES', icon: '📤', label: 'Share', color: '#8b5cf6' },
              { key: 'SCHEDULE_VISIT', icon: '📅', label: 'Visit', color: '#f59e0b' },
              { key: 'VISIT_FEEDBACK', icon: '✅', label: 'Feedback', color: '#06b6d4' },
              { key: 'NEGOTIATE_DEAL', icon: '🤝', label: 'Negotiate', color: '#f97316' },
            ].map(s => {
              const count = workflowStats.by_stage?.[s.key] || 0;
              return count > 0 ? (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                  <span>{s.icon}</span>
                  <span style={{ fontWeight: 600, color: s.color }}>{count}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                </div>
              ) : null;
            })}
            {workflowStats.completed_today > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                <span>🏆</span>
                <span style={{ fontWeight: 600, color: '#22c55e' }}>{workflowStats.completed_today}</span>
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
