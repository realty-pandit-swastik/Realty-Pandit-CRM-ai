import React, { useState } from 'react';
import { MainDashboard } from './dashboard/MainDashboard';
import { MarketTrendsDashboard } from './dashboard/MarketTrendsDashboard';
import { UserPerformanceDashboard } from './dashboard/UserPerformanceDashboard';
import { LeadSourcesDashboard } from './dashboard/LeadSourcesDashboard';
import { PropertyAnalyticsDashboard } from './dashboard/PropertyAnalyticsDashboard';

const TABS = [
  { id: 'main', label: 'Main Dashboard', icon: '📊' },
  { id: 'market', label: 'Market Trends', icon: '📈' },
  { id: 'users', label: 'User Performance', icon: '👥' },
  { id: 'sources', label: 'Lead Sources', icon: '🎯' },
  { id: 'property', label: 'Property Analytics', icon: '🏠' },
];

export const DashboardTabs: React.FC = () => {
  const [activeTab, setActiveTab] = useState('main');

  const renderContent = () => {
    switch (activeTab) {
      case 'main':
        return <MainDashboard />;
      case 'market':
        return <MarketTrendsDashboard />;
      case 'users':
        return <UserPerformanceDashboard />;
      case 'sources':
        return <LeadSourcesDashboard />;
      case 'property':
        return <PropertyAnalyticsDashboard />;
      default:
        return <MainDashboard />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* Tab Navigation */}
      <div
        style={{
          display: 'flex',
          borderBottom: '2px solid var(--border-color)',
          backgroundColor: 'var(--bg-primary)',
          overflowX: 'auto',
          flexShrink: 0,
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 12px',
              border: 'none',
              background: activeTab === tab.id ? 'var(--bg-active)' : 'transparent',
              color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: activeTab === tab.id ? '600' : '400',
              borderBottom: activeTab === tab.id ? '3px solid var(--primary)' : '3px solid transparent',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
              minHeight: '44px',
            }}
            onMouseEnter={(e) => {
              if (activeTab !== tab.id) {
                e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== tab.id) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <span style={{ fontSize: '14px' }}>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>{renderContent()}</div>
    </div>
  );
};
