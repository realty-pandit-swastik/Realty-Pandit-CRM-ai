import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getMarketTrends } from '../../api/client';

export const MarketTrendsDashboard: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30'); // days

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const loadData = async () => {
    try {
      setLoading(true);
      const days = parseInt(dateRange);
      const to = new Date();
      const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const trends = await getMarketTrends({
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0],
      });

      // Combine all data by date
      const dateMap = new Map<string, any>();

      trends.leads?.forEach((item: any) => {
        dateMap.set(item.date, { ...dateMap.get(item.date), date: item.date, leads: item.count });
      });

      trends.visits?.forEach((item: any) => {
        const existing = dateMap.get(item.date) || { date: item.date };
        dateMap.set(item.date, { ...existing, visits: item.count });
      });

      trends.sales?.forEach((item: any) => {
        const existing = dateMap.get(item.date) || { date: item.date };
        dateMap.set(item.date, { ...existing, sales: item.count });
      });

      const combined = Array.from(dateMap.values()).map((item) => ({
        date: item.date,
        leads: item.leads || 0,
        visits: item.visits || 0,
        sales: item.sales || 0,
      }));

      combined.sort((a, b) => a.date.localeCompare(b.date));

      setData(combined);
    } catch (error) {
      console.error('Error loading market trends:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading market trends...</p>
      </div>
    );
  }

  const totalLeads = data.reduce((sum, d) => sum + d.leads, 0);
  const totalVisits = data.reduce((sum, d) => sum + d.visits, 0);
  const totalSales = data.reduce((sum, d) => sum + d.sales, 0);
  const conversionRate = totalLeads > 0 ? ((totalSales / totalLeads) * 100).toFixed(1) : '0.0';

  return (
    <div style={{ padding: '32px 40px', backgroundColor: 'var(--bg-primary)', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0, color: 'var(--text-primary)' }}>
            Market Trends
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Track leads, appointments, and sales over time
          </p>
        </div>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: '14px',
          }}
        >
          <option value="7">Last 7 Days</option>
          <option value="30">Last 30 Days</option>
          <option value="60">Last 60 Days</option>
          <option value="90">Last 90 Days</option>
        </select>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
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
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Total Visits</div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#8b5cf6' }}>{totalVisits}</div>
        </div>
        <div
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '12px',
            padding: '20px',
            border: '1px solid var(--border-color)',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Total Sales</div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#10b981' }}>{totalSales}</div>
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
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#f59e0b' }}>{conversionRate}%</div>
        </div>
      </div>

      {/* Chart */}
      <div
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '12px',
          padding: '24px',
          border: '1px solid var(--border-color)',
        }}
      >
        <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 20px', color: 'var(--text-primary)' }}>
          Activity Timeline
        </h3>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="date" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
              <YAxis stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '14px', color: 'var(--text-primary)' }} />
              <Line type="monotone" dataKey="leads" stroke="#3b82f6" strokeWidth={2} name="Leads" dot={{ r: 4 }} />
              <Line type="monotone" dataKey="visits" stroke="#8b5cf6" strokeWidth={2} name="Visits" dot={{ r: 4 }} />
              <Line type="monotone" dataKey="sales" stroke="#10b981" strokeWidth={2} name="Sales" dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
            No data available for the selected period
          </div>
        )}
      </div>
    </div>
  );
};
