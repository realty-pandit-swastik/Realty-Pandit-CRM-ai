import React, { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { getLeadSources } from '../../api/client';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#14b8a6'];

export const LeadSourcesDashboard: React.FC = () => {
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await getLeadSources();
      setSources(data.sources || []);
    } catch (error) {
      console.error('Error loading lead sources:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalLeads = sources.reduce((sum, s) => sum + s.count, 0);
  const totalConverted = sources.reduce((sum, s) => sum + s.converted, 0);
  const overallConversionRate = totalLeads > 0 ? ((totalConverted / totalLeads) * 100).toFixed(1) : '0.0';

  const chartData = sources.map((s) => ({
    name: s.source,
    value: s.count,
  }));

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading lead sources...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 40px', backgroundColor: 'var(--bg-primary)', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0, color: 'var(--text-primary)' }}>Lead Sources</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
          Breakdown of lead acquisition channels and conversion rates
        </p>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <div
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '12px',
            padding: '20px',
            border: '1px solid var(--border-color)',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Total Leads</div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#3b82f6' }}>{totalLeads}</div>
        </div>
        <div
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '12px',
            padding: '20px',
            border: '1px solid var(--border-color)',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Converted</div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#10b981' }}>{totalConverted}</div>
        </div>
        <div
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '12px',
            padding: '20px',
            border: '1px solid var(--border-color)',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Conversion Rate</div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#f59e0b' }}>{overallConversionRate}%</div>
        </div>
        <div
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '12px',
            padding: '20px',
            border: '1px solid var(--border-color)',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Active Sources</div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#8b5cf6' }}>{sources.length}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Pie Chart */}
        <div
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '12px',
            padding: '24px',
            border: '1px solid var(--border-color)',
          }}
        >
          <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 20px', color: 'var(--text-primary)' }}>
            Distribution by Source
          </h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${percent ? (percent * 100).toFixed(0) : 0}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {chartData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
              No data available
            </div>
          )}
        </div>

        {/* Source Details Table */}
        <div
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '12px',
            padding: '24px',
            border: '1px solid var(--border-color)',
          }}
        >
          <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 20px', color: 'var(--text-primary)' }}>
            Source Performance
          </h3>
          <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-primary)', zIndex: 1 }}>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th
                    style={{
                      padding: '10px 12px',
                      textAlign: 'left',
                      fontSize: '11px',
                      fontWeight: '600',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Source
                  </th>
                  <th
                    style={{
                      padding: '10px 12px',
                      textAlign: 'right',
                      fontSize: '11px',
                      fontWeight: '600',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Leads
                  </th>
                  <th
                    style={{
                      padding: '10px 12px',
                      textAlign: 'right',
                      fontSize: '11px',
                      fontWeight: '600',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Converted
                  </th>
                  <th
                    style={{
                      padding: '10px 12px',
                      textAlign: 'right',
                      fontSize: '11px',
                      fontWeight: '600',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source, idx) => (
                  <tr key={source.source} style={{ borderBottom: idx < sources.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                    <td style={{ padding: '12px', fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                          style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            backgroundColor: COLORS[idx % COLORS.length],
                          }}
                        />
                        {source.source}
                      </div>
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: 'var(--text-primary)', textAlign: 'right' }}>
                      {source.count}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#10b981', textAlign: 'right' }}>
                      {source.converted}
                    </td>
                    <td
                      style={{
                        padding: '12px',
                        fontSize: '14px',
                        color: source.conversion_rate >= 10 ? '#10b981' : source.conversion_rate >= 5 ? '#f59e0b' : '#ef4444',
                        fontWeight: '600',
                        textAlign: 'right',
                      }}
                    >
                      {source.conversion_rate.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
