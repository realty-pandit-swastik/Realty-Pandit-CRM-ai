import React, { useState } from 'react';
import { LayoutDashboard, Target, Users, Trophy, House } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { MainDashboard } from './dashboard/MainDashboard';
import { LeadIntelligenceDashboard } from './dashboard/LeadIntelligenceDashboard';
import { UserPerformanceDashboard } from './dashboard/UserPerformanceDashboard';
import { PropertyAnalyticsDashboard } from './dashboard/PropertyAnalyticsDashboard';
import { TeamPerformanceDashboard } from './dashboard/TeamPerformanceDashboard';

export const DashboardTabs: React.FC = () => {
  const { agent } = useAuth();
  const isEmployee = agent?.role === 'employee';
  // Team Performance rolls individuals up into teams — only meaningful for someone
  // who manages people. Backend also 403s employees on /team-performance.
  const canSeeTeams = agent?.role === 'manager' || agent?.role === 'super_boss';
  // Approved URL presentation state. No view/router or request contract changes;
  // existing ?deal / ?google params and history.state are retained.
  const [activeTab, setActiveTab] = useState(() => {
    const saved = new URLSearchParams(window.location.search).get('rpDashboard');
    return saved && ['main', 'lead-intel', 'users', 'property', ...(canSeeTeams ? ['teams'] : [])].includes(saved) ? saved : 'main';
  });
  const pickTab = (tab: string) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (tab === 'main') url.searchParams.delete('rpDashboard'); else url.searchParams.set('rpDashboard', tab);
    window.history.replaceState(window.history.state, '', url);
  };

  // All dashboard data is role-scoped on the backend (super_boss=org, manager=team,
  // employee=self). For an employee the "User Performance" view contains only their
  // own row, so it reads as "My Performance".
  const TABS = [
    { id: 'main', label: 'Main Dashboard', icon: LayoutDashboard },
    { id: 'lead-intel', label: 'Lead Intelligence', icon: Target },
    { id: 'users', label: isEmployee ? 'My Performance' : 'User Performance', icon: Users },
    ...(canSeeTeams ? [{ id: 'teams', label: 'Team Performance', icon: Trophy }] : []),
    { id: 'property', label: 'Property Analytics', icon: House },
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
        role="tablist" aria-label="Dashboard views"
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
            type="button" role="tab" id={`rp-tab-${tab.id}`} aria-selected={activeTab === tab.id}
            aria-controls="rp-dashboard-panel" tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => pickTab(tab.id)}
            onKeyDown={e => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
              e.preventDefault();
              const i = TABS.findIndex(t => t.id === tab.id);
              const next = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1
                : (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
              pickTab(TABS[next].id);
              document.getElementById(`rp-tab-${TABS[next].id}`)?.focus();
            }}
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
              transition: 'background-color 0.2s ease, color 0.2s ease',
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
            <tab.icon size={16} strokeWidth={1.7} aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div id="rp-dashboard-panel" role="tabpanel" aria-labelledby={`rp-tab-${activeTab}`} style={{ flex: 1, overflowY: 'auto', padding: '0' }}>{renderContent()}</div>
    </div>
  );
};
