import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getUserPerformance } from '../../api/client';

export const UserPerformanceDashboard: React.FC = () => {
  const [performance, setPerformance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'deals' | 'revenue' | 'leads'>('deals');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await getUserPerformance();
      setPerformance(data.performance || []);
    } catch (error) {
      console.error('Error loading user performance:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    return `₹${value.toLocaleString('en-IN')}`;
  };

  const sortedPerformance = [...performance].sort((a, b) => {
    switch (sortBy) {
      case 'deals':
        return b.deals_closed - a.deals_closed;
      case 'revenue':
        return b.revenue_generated - a.revenue_generated;
      case 'leads':
        return b.leads_assigned - a.leads_assigned;
      default:
        return 0;
    }
  });

  const chartData = sortedPerformance.slice(0, 10).map((p) => ({
    name: p.agent_name.split(' ')[0], // First name only
    Leads: p.leads_assigned,
    Appointments: p.appointments_completed,
    Deals: p.deals_closed,
  }));

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading performance data...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 40px', backgroundColor: 'var(--bg-primary)', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0, color: 'var(--text-primary)' }}>
          User Performance
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
          Individual agent metrics and conversion rates
        </p>
      </div>

      {/* Chart */}
      <div
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '12px',
          padding: '24px',
          border: '1px solid var(--border-color)',
          marginBottom: '24px',
        }}
      >
        <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 20px', color: 'var(--text-primary)' }}>
          Top Performers (by activity)
        </h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="name" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
              <YAxis stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '14px' }} />
              <Bar dataKey="Leads" fill="#3b82f6" />
              <Bar dataKey="Appointments" fill="#8b5cf6" />
              <Bar dataKey="Deals" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
            No performance data available
          </div>
        )}
      </div>

      {/* Sort Controls */}
      <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Sort by:</span>
        <button
          onClick={() => setSortBy('deals')}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            backgroundColor: sortBy === 'deals' ? 'var(--primary)' : 'var(--bg-secondary)',
            color: sortBy === 'deals' ? 'white' : 'var(--text-primary)',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Deals Closed
        </button>
        <button
          onClick={() => setSortBy('revenue')}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            backgroundColor: sortBy === 'revenue' ? 'var(--primary)' : 'var(--bg-secondary)',
            color: sortBy === 'revenue' ? 'white' : 'var(--text-primary)',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Revenue Generated
        </button>
        <button
          onClick={() => setSortBy('leads')}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            backgroundColor: sortBy === 'leads' ? 'var(--primary)' : 'var(--bg-secondary)',
            color: sortBy === 'leads' ? 'white' : 'var(--text-primary)',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Leads Assigned
        </button>
      </div>

      {/* Performance Table */}
      <div
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                Agent Name
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                Role
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                Leads
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                Hot Leads
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                Appointments
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                Completed
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                Deals Closed
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                Revenue
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedPerformance.length > 0 ? (
              sortedPerformance.map((p, idx) => (
                <tr key={p.agent_id} style={{ borderBottom: idx < sortedPerformance.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--text-primary)', fontWeight: '500' }}>
                    {p.agent_name}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '600',
                        backgroundColor:
                          p.role === 'super_boss' ? '#fee2e2' : p.role === 'manager' ? '#fef3c7' : '#dcfce7',
                        color: p.role === 'super_boss' ? '#991b1b' : p.role === 'manager' ? '#92400e' : '#166534',
                      }}
                    >
                      {p.role.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--text-primary)', textAlign: 'right' }}>
                    {p.leads_assigned}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#f87171', textAlign: 'right' }}>
                    {p.hot_leads}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--text-primary)', textAlign: 'right' }}>
                    {p.appointments_scheduled}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#10b981', textAlign: 'right' }}>
                    {p.appointments_completed}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--text-primary)', fontWeight: '600', textAlign: 'right' }}>
                    {p.deals_closed}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--text-primary)', fontWeight: '600', textAlign: 'right' }}>
                    {formatCurrency(p.revenue_generated)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No performance data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
