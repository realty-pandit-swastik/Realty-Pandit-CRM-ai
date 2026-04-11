
import { useEffect, useState, useCallback } from 'react';
import { getContacts, getInteractions, updateContactType, reportNoShow } from './api/client';
import { useAuth } from './contexts/AuthContext';
import { useIsMobile } from './hooks/useIsMobile';
import { LoginPage } from './components/LoginPage';
import { SetupPasswordPage } from './components/SetupPasswordPage';
import { DashboardLayout } from './components/DashboardLayout';
import { ContactList } from './components/ContactList';
import { ChatView } from './components/ChatView';
import { InventoryList } from './components/InventoryList';
import { PropertyMapView } from './components/PropertyMapView';
import { PropertyLiveStatus } from './components/PropertyLiveStatus';
import { DashboardTabs } from './components/DashboardTabs';
import { TeamManagement } from './components/TeamManagement';
import { PartnerManagement } from './components/PartnerManagement';
import { ReportsView } from './components/ReportsView';
import { ExternalLeads } from './components/ExternalLeads';
import { BuyerChatWorkflowPanel } from './components/BuyerChatWorkflow';
import { CalendarView } from './components/CalendarView';
import { EmailManagement } from './components/EmailManagement';
import { QADashboard } from './components/QADashboard';
import { AgentLogs } from './components/AgentLogs';
import { AgentOverride } from './components/AgentOverride';
import WorkflowBuilder from './components/WorkflowBuilder';
import MarketingCampaign from './components/MarketingCampaign';
import TaskBoard from './components/TaskBoard';
import LeadWorkflowPage from './components/LeadWorkflowPage';
import DealPipeline from './components/DealPipeline';
import CallLog from './components/CallLog';
import AdvancedAnalytics from './components/AdvancedAnalytics';
import VoiceCommands from './components/VoiceCommands';
import { ErrorBoundary } from './components/ErrorBoundary';
// Mobile components
import { MobileLayout } from './components/mobile/MobileLayout';
import { MobileDashboard } from './components/mobile/MobileDashboard';
import { MobileContactList } from './components/mobile/MobileContactList';
import { MobileChatView } from './components/mobile/MobileChatView';
import { MobileInventoryList } from './components/mobile/MobileInventoryList';
import { MobileInventoryEdit } from './components/mobile/MobileInventoryEdit';
import { MobileTeamView } from './components/mobile/MobileTeamView';
import { MobileCalendar } from './components/mobile/MobileCalendar';
import { MobileScrollWrapper } from './components/mobile/MobileScrollWrapper';
import { InventoryModal } from './components/InventoryModal';

// ─── Welcome Panel ─────────────────────────────────────────────────────────────
interface WelcomePanelProps {
  contacts: any[];
  agentName?: string;
  onSelect: (phone: string) => void;
}

function WelcomePanel({ contacts, agentName, onSelect }: WelcomePanelProps) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = agentName?.split(' ')[0] || 'there';

  const total   = contacts.length;
  const hot     = contacts.filter(c => (c.lead_score?.total_score ?? 0) >= 70).length;
  const warm    = contacts.filter(c => { const s = c.lead_score?.total_score ?? 0; return s >= 40 && s < 70; }).length;
  const cold    = contacts.filter(c => { const s = c.lead_score?.total_score ?? 0; return c.lead_score && s < 40; }).length;
  const noScore = contacts.filter(c => !c.lead_score).length;

  const recent = [...contacts]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 6);

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const statCards = [
    { label: 'Total Contacts', value: total,   color: 'var(--text-link)', bg: '#1e3a5f' },
    { label: '🔥 HOT Leads',   value: hot,     color: '#f87171', bg: 'var(--error-bg)' },
    { label: '🟢 WARM Leads',  value: warm,    color: 'var(--success-text-bright)', bg: 'var(--success-bg)' },
    { label: '❄️ COLD Leads',  value: cold,    color: '#93c5fd', bg: '#1e3558' },
    { label: '❓ No Score',    value: noScore, color: 'var(--text-secondary)', bg: 'var(--bg-secondary)' },
  ];

  const TYPE_LABEL: Record<string, string> = {
    BUYER: 'Buyer',
    TENANT: 'Tenant',
    LANDLORD: 'Landlord',
    PARTNER_AGENT: 'Partner',
    REAL_ESTATE_BUILDER: 'Builder',
    MANAGEMENT: 'Team',
    UNKNOWN: 'Unknown',
  };
  const TYPE_ICON: Record<string, string> = {
    BUYER: '🏠',
    TENANT: '🛋️',
    LANDLORD: '🔑',
    PARTNER_AGENT: '🤝',
    REAL_ESTATE_BUILDER: '🏗️',
    MANAGEMENT: '👔',
    UNKNOWN: '👤',
  };

  return (
    <div style={{
      flex: 1, overflowY: 'auto', padding: '32px 40px',
      backgroundColor: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', gap: '28px',
    }}>
      {/* Greeting */}
      <div>
        <h1 style={{ color: 'var(--text-primary)', fontSize: '24px', fontWeight: 700, margin: 0 }}>
          {greeting}, {firstName} 👋
        </h1>
        <p style={{ color: 'var(--text-muted)', margin: '6px 0 0', fontSize: '14px' }}>{today}</p>
      </div>

      {/* Stat Cards */}
      <div>
        <p style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
          Lead Overview
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
          {statCards.map(s => (
            <div key={s.label} style={{
              backgroundColor: s.bg, borderRadius: '12px',
              padding: '16px', textAlign: 'center',
              border: `1px solid ${s.color}33`,
            }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Contacts */}
      {recent.length > 0 && (
        <div>
          <p style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
            Recent Contacts
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            {recent.map(c => (
              <div
                key={c.phone_number}
                onClick={() => onSelect(c.phone_number)}
                style={{
                  backgroundColor: 'var(--bg-secondary)', borderRadius: '10px',
                  padding: '12px 16px', cursor: 'pointer',
                  border: '1px solid var(--border-secondary)', display: 'flex',
                  alignItems: 'center', gap: '12px',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#3b82f6'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-secondary)'}
              >
                <div style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  backgroundColor: 'var(--bg-primary)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '16px', flexShrink: 0,
                }}>
                  {TYPE_ICON[c.contact_type] || '👤'}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name || c.phone_number}
                  </div>
                  {c.name && <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{c.phone_number}</div>}
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>
                    {TYPE_LABEL[c.contact_type] || '?'} · {c.lead_status}
                  </div>
                </div>
                <div style={{ fontSize: '16px', color: 'var(--border-secondary)' }}>›</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hint */}
      <div style={{
        backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', borderRadius: '12px',
        padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <span style={{ fontSize: '20px' }}>💡</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          Click any contact on the left to view their full conversation history and lead details.
        </span>
      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────
function App() {
  const { agent, loading } = useAuth();
  const isMobile = useIsMobile();
  const [view, setView] = useState('dashboard');
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [interactions, setInteractions] = useState<any[]>([]);
  // Mobile-specific state
  const [mobileEditItem, setMobileEditItem] = useState<any>(null);
  const [mobileShowAdd, setMobileShowAdd] = useState(false);

  useEffect(() => {
    if (agent) loadContacts();
  }, [agent]);

  useEffect(() => {
    if (selectedPhone) loadInteractions(selectedPhone);
  }, [selectedPhone]);

  const loadContacts = async () => {
    try {
      const data = await getContacts();
      setContacts(data);
    } catch (err) {
      console.error('Failed to load contacts', err);
    }
  };

  const loadInteractions = async (phone: string) => {
    try {
      const data = await getInteractions(phone);
      setInteractions(data);
    } catch (err) {
      console.error('Failed to load interactions', err);
    }
  };

  const handleUpdateContactType = async (phone: string, type: string) => {
    try {
      await updateContactType(phone, type);
      await loadContacts();
    } catch (err) {
      console.error('Failed to update contact type', err);
    }
  };

  const handleReportNoShow = async () => {
    if (!selectedPhone) return;
    if (!confirm(`Report No-Show for ${selectedPhone}? This will penalize their reliability score.`)) return;
    try {
      await reportNoShow(selectedPhone);
      await loadContacts();
      alert('No-Show reported. Score updated.');
    } catch (err) {
      console.error('Failed to report no-show', err);
      alert('Failed to report no-show');
    }
  };

  // ─── Mobile: Navigation + Browser History (hooks MUST be before early returns) ──
  const handleMobileNav = useCallback((newView: string) => {
    setView(newView);
    setSelectedPhone(null);
    setMobileEditItem(null);
    setMobileShowAdd(false);
    if (isMobile) history.pushState({ view: newView }, '');
  }, [isMobile]);

  const handleMobileSelectContact = useCallback((phone: string) => {
    setSelectedPhone(phone);
    loadInteractions(phone);
    if (isMobile) history.pushState({ view: 'chats', detail: phone }, '');
  }, [isMobile]);

  const handleMobileBackFromDetail = useCallback(() => {
    setSelectedPhone(null);
    setMobileEditItem(null);
    setMobileShowAdd(false);
    if (isMobile) history.back();
  }, [isMobile]);

  // Browser back button handler
  useEffect(() => {
    if (!isMobile) return;
    const handlePopState = (e: PopStateEvent) => {
      const s = e.state;
      if (s?.view) {
        setView(s.view);
        if (!s.detail) {
          setSelectedPhone(null);
          setMobileEditItem(null);
          setMobileShowAdd(false);
        }
      }
    };
    history.replaceState({ view }, '');
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Public route: setup-password (no auth required)
  if (window.location.pathname === '/setup-password') {
    return <SetupPasswordPage />;
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
        Loading...
      </div>
    );
  }

  if (!agent) {
    return <LoginPage />;
  }

  const selectedContact = contacts.find(c => c.phone_number === selectedPhone);

  // ─── Mobile Layout ──────────────────────────────────────────────────────────
  if (isMobile) {
    const backBarStyle = {
      height: '44px', display: 'flex', alignItems: 'center', padding: '0 16px',
      backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-secondary)', flexShrink: 0,
    } as const;
    const backBtnStyle = {
      background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px',
      color: 'var(--text-primary)', marginRight: '12px', padding: '4px',
    } as const;

    const renderMobileContent = () => {
      switch (view) {
        case 'dashboard':
          return <DashboardTabs />;
        case 'chats':
          // Detail: chat view with inline back bar
          if (selectedPhone && selectedContact) {
            return (
              <>
                <div style={backBarStyle}>
                  <button onClick={handleMobileBackFromDetail} style={backBtnStyle}>←</button>
                  <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedContact.name || selectedContact.phone_number}
                  </span>
                </div>
                <MobileChatView
                  contact={selectedContact}
                  interactions={interactions}
                  onReportNoShow={handleReportNoShow}
                  onUpdateContactType={handleUpdateContactType}
                />
              </>
            );
          }
          return (
            <MobileContactList
              contacts={contacts}
              onSelect={handleMobileSelectContact}
            />
          );

        case 'inventory':
          // Detail: edit property
          if (mobileEditItem) {
            return (
              <>
                <div style={backBarStyle}>
                  <button onClick={handleMobileBackFromDetail} style={backBtnStyle}>←</button>
                  <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>Edit Property</span>
                </div>
                <MobileInventoryEdit
                  item={mobileEditItem}
                  onSaved={() => { setMobileEditItem(null); }}
                  onCancel={() => setMobileEditItem(null)}
                />
              </>
            );
          }
          // Detail: add property
          // Mobile Add Property — uses same InventoryModal as desktop
          if (mobileShowAdd) {
            return (
              <>
                <InventoryModal
                  isOpen={mobileShowAdd}
                  onClose={() => setMobileShowAdd(false)}
                  onCreated={() => { setMobileShowAdd(false); }}
                />
              </>
            );
          }
          return (
            <MobileInventoryList
              onEditItem={(item) => { setMobileEditItem(item); history.pushState({ view: 'inventory', detail: 'edit' }, ''); }}
              onAddNew={() => { setMobileShowAdd(true); history.pushState({ view: 'inventory', detail: 'add' }, ''); }}
            />
          );

        case 'calendar':
          return <MobileCalendar />;
        case 'team':
          return <MobileTeamView />;
        case 'property-map':
          return <MobileScrollWrapper><PropertyMapView /></MobileScrollWrapper>;
        case 'live-status':
          return <MobileScrollWrapper><PropertyLiveStatus /></MobileScrollWrapper>;
        case 'emails':
          return <MobileScrollWrapper><EmailManagement /></MobileScrollWrapper>;
        case 'calls':
          return <MobileScrollWrapper><CallLog /></MobileScrollWrapper>;
        case 'leads':
          return <MobileScrollWrapper><ExternalLeads isMobile={true} /></MobileScrollWrapper>;
        case 'buyer-chat':
          return <MobileScrollWrapper><BuyerChatWorkflowPanel onBack={() => setView('dashboard')} /></MobileScrollWrapper>;
        case 'partners':
          return <MobileScrollWrapper><PartnerManagement /></MobileScrollWrapper>;
        case 'reports':
          return <MobileScrollWrapper><ReportsView /></MobileScrollWrapper>;
        case 'ai-dashboard':
          return <MobileScrollWrapper><QADashboard /></MobileScrollWrapper>;
        case 'agent-logs':
          return <MobileScrollWrapper><AgentLogs /></MobileScrollWrapper>;
        case 'override':
          return <MobileScrollWrapper><AgentOverride /></MobileScrollWrapper>;
        case 'workflows':
          return <MobileScrollWrapper><WorkflowBuilder /></MobileScrollWrapper>;
        case 'marketing':
          return <MobileScrollWrapper><MarketingCampaign /></MobileScrollWrapper>;
        case 'lead-tasks':
          return <MobileScrollWrapper><LeadWorkflowPage /></MobileScrollWrapper>;
        case 'tasks':
          return <MobileScrollWrapper><TaskBoard /></MobileScrollWrapper>;
        case 'analytics':
          return <MobileScrollWrapper><AdvancedAnalytics /></MobileScrollWrapper>;
        case 'deals':
          return <DealPipeline />;
        default:
          return (
            <MobileDashboard
              contacts={contacts}
              agentName={agent.name}
              onSelectContact={handleMobileSelectContact}
            />
          );
      }
    };

    return (
      <>
        <MobileLayout activeView={view} onViewChange={handleMobileNav}>
          <ErrorBoundary>{renderMobileContent()}</ErrorBoundary>
        </MobileLayout>
      </>
    );
  }

  // ─── Desktop Layout ─────────────────────────────────────────────────────────
  const renderContent = () => {
    switch (view) {
      case 'dashboard':
        return <DashboardTabs />;
      case 'chats':
        return (
          <>
            <ContactList
              contacts={contacts}
              selectedPhone={selectedPhone}
              onSelect={setSelectedPhone}
            />
            {selectedPhone && selectedContact ? (
              <ChatView
                contact={selectedContact}
                interactions={interactions}
                onReportNoShow={handleReportNoShow}
                onUpdateContactType={handleUpdateContactType}
              />
            ) : (
              <WelcomePanel
                contacts={contacts}
                agentName={agent.name}
                onSelect={setSelectedPhone}
              />
            )}
          </>
        );
      case 'calendar':
        return <CalendarView />;
      case 'emails':
        return <EmailManagement />;
      case 'calls':
        return <CallLog />;
      case 'inventory':
        return <InventoryList />;
      case 'property-map':
        return <PropertyMapView />;
      case 'live-status':
        return <PropertyLiveStatus />;
      case 'leads':
        return <ExternalLeads />;
      case 'buyer-chat':
        return <BuyerChatWorkflowPanel onBack={() => setView('dashboard')} />;
      case 'team':
        return <TeamManagement />;
      case 'partners':
        return <PartnerManagement />;
      case 'reports':
        return <ReportsView />;
      case 'ai-dashboard':
        return <QADashboard />;
      case 'agent-logs':
        return <AgentLogs />;
      case 'override':
        return <AgentOverride />;
      case 'workflows':
        return <WorkflowBuilder />;
      case 'marketing':
        return <MarketingCampaign />;
      case 'lead-tasks':
        return <LeadWorkflowPage />;
      case 'tasks':
        return <TaskBoard />;
      case 'deals':
        return <DealPipeline />;
      case 'analytics':
        return <AdvancedAnalytics />;
      default:
        return null;
    }
  };

  return (
    <>
      <DashboardLayout activeView={view} onViewChange={setView}>
        <ErrorBoundary>{renderContent()}</ErrorBoundary>
      </DashboardLayout>
      <VoiceCommands onNavigate={setView} currentView={view} />
    </>
  );
}

export default App;
