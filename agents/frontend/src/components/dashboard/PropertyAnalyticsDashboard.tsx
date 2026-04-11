import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { getPropertyTrends } from '../../api/client';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6366f1'];

export const PropertyAnalyticsDashboard: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const trends = await getPropertyTrends();
      setData(trends);
    } catch (error) {
      console.error('Error loading property trends:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading property analytics...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px' }}>
        <p style={{ color: 'var(--text-secondary)' }}>No property data available</p>
      </div>
    );
  }

  const totalProperties = data.status_breakdown?.reduce((sum: number, s: any) => sum + s.count, 0) || 0;
  const activeProperties = data.status_breakdown?.find((s: any) => s.status === 'active')?.count || 0;

  return (
    <div style={{ padding: '32px 40px', backgroundColor: 'var(--bg-primary)', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0, color: 'var(--text-primary)' }}>
          Property Analytics
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
          Inventory breakdown by status, intent, and property type
        </p>
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
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Total Properties</div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#3b82f6' }}>{totalProperties}</div>
        </div>
        <div
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '12px',
            padding: '20px',
            border: '1px solid var(--border-color)',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Active Listings</div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#10b981' }}>{activeProperties}</div>
        </div>
        <div
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '12px',
            padding: '20px',
            border: '1px solid var(--border-color)',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Recent Additions</div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#8b5cf6' }}>{data.recent_additions || 0}</div>
        </div>
        <div
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '12px',
            padding: '20px',
            border: '1px solid var(--border-color)',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Availability Rate</div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#f59e0b' }}>
            {totalProperties > 0 ? ((activeProperties / totalProperties) * 100).toFixed(0) : 0}%
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        {/* Status Breakdown */}
        <div
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '12px',
            padding: '24px',
            border: '1px solid var(--border-color)',
          }}
        >
          <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 20px', color: 'var(--text-primary)' }}>
            Status Breakdown
          </h3>
          {data.status_breakdown && data.status_breakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={data.status_breakdown}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(props: any) => `${props.status}: ${props.count}`}
                  outerRadius={90}
                  fill="#8884d8"
                  dataKey="count"
                  nameKey="status"
                >
                  {data.status_breakdown.map((_entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>No data</div>
          )}
        </div>

        {/* Intent Breakdown */}
        <div
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '12px',
            padding: '24px',
            border: '1px solid var(--border-color)',
          }}
        >
          <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 20px', color: 'var(--text-primary)' }}>
            Intent Breakdown
          </h3>
          {data.intent_breakdown && data.intent_breakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.intent_breakdown} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="intent" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                <YAxis stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="count" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>No data</div>
          )}
        </div>
      </div>

      {/* Property Type Breakdown */}
      <div
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '12px',
          padding: '24px',
          border: '1px solid var(--border-color)',
        }}
      >
        <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 20px', color: 'var(--text-primary)' }}>
          Property Type Distribution
        </h3>
        {data.type_breakdown && data.type_breakdown.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.type_breakdown} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis type="number" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
              <YAxis dataKey="type" type="category" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                }}
              />
              <Bar dataKey="count" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
            No property type data available
          </div>
        )}
      </div>
    </div>
  );
};
