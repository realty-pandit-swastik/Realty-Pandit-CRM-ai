import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { MainDashboard } from './dashboard/MainDashboard';
import { LeadIntelligenceDashboard } from './dashboard/LeadIntelligenceDashboard';
import { UserPerformanceDashboard } from './dashboard/UserPerformanceDashboard';
import { PropertyAnalyticsDashboard } from './dashboard/PropertyAnalyticsDashboard';
import { TeamPerformanceDashboard } from './dashboard/TeamPerformanceDashboard';

export const DashboardTabs: React.FC = () => {
  const [activeTab, setActiveTab] = useState('main');
  const { agent } = useAuth();
  const isEmployee = agent?.role === 'employee';
  // Team Performance rolls individuals up into teams — only meaningful for someone
  // who manages people. Backend also 403s employees on /team-performance.
  const canSeeTeams = agent?.role === 'manager' || agent?.role === 'super_boss';

  // All dashboard data is role-scoped on the backend (super_boss=org, manager=team,
  // employee=self). For an employee the "User Performance" view contains only their
  // own row, so it reads as "My Performance".
  const TABS = [
    { id: 'main', label: 'Main Dashboard', icon: '📊' },
    { id: 'lead-intel', label: 'Lead Intelligence', icon: '🎯' },
    { id: 'users', label: isEmployee ? 'My Performance' : 'User Performance', icon: '👥' },
    ...(canSeeTeams ? [{ id: 'teams', label: 'Team Performance', icon: '🏆' }] : []),
    { id: 'property', label: 'Property Analytics', icon: '🏠' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'main':
        return <MainDashboard />;
      case 'lead-intel':
        return <LeadIntelligenceDashboard />;
      case 'users':
        return <UserPerformanceDashboard />;
      case 'teams':
        return canSeeTeams ? <TeamPerformanceDashboard /> : <MainDashboard />;
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
