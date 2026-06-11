
import { useEffect, useState, useCallback, useRef } from 'react';
import { getContacts, getInteractions, updateContactType, reportNoShow, markLeadLost } from './api/client';
import { useAuth } from './contexts/AuthContext';
import { useIsMobile } from './hooks/useIsMobile';
import { ToastProvider, useToast } from './contexts/ToastContext';
import { ToastContainer } from './components/ui/Toast';
import { ConfirmProvider, ConfirmDialogRoot, useConfirm } from './contexts/ConfirmContext';
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
import { MyProfile } from './components/MyProfile';
import { PartnerManagement } from './components/PartnerManagement';
import { PropertyTaxonomy } from './components/PropertyTaxonomy';
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
  const { agent, loading, sessionExpired, dismissSessionExpired } = useAuth();
  const isMobile = useIsMobile();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [view, setView] = useState('dashboard');
  // Deep link: ?deal=<id> opens the Deal Pipeline straight to that deal (from Google
  // Calendar/Task new-lead notifications). Consumed by DealPipeline via initialDealId.
  const [deepLinkDealId, setDeepLinkDealId] = useState<string | null>(null);
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [interactions, setInteractions] = useState<any[]>([]);
  // Mobile-specific state
  const [mobileEditItem, setMobileEditItem] = useState<any>(null);
  const [mobileShowAdd, setMobileShowAdd] = useState(false);

  // Show update-available toast when a new SW takes control
  useEffect(() => {
    const handleSwUpdate = () => {
      showToast('A new version is available — refresh to update.', 'info');
    };
    window.addEventListener('sw-update-ready', handleSwUpdate);
    return () => window.removeEventListener('sw-update-ready', handleSwUpdate);
  }, [showToast]);

  // Google OAuth callback result (2026-05-18). The backend bounces the member
  // back to /profile?google=<status>; the SPA has no router so we surface the
  // result globally here and drop them on the Team view (one click from their
  // own profile card, which then shows the connected state).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get('google');
    if (!g) return;
    const msgs: Record<string, [string, 'success' | 'error' | 'info']> = {
      connected: ['Google account connected — your reminders & visits will sync to your Calendar', 'success'],
      denied: ['Google connection cancelled', 'info'],
      expired: ['That Google link expired — please try connecting again', 'error'],
      error: ['Could not connect Google — please try again', 'error'],
    };
    const m = msgs[g];
    if (m) showToast(m[0], m[1]);
    if (g === 'connected') setView('team');
    // Strip the param so a refresh / re-render doesn't re-toast
    params.delete('google');
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
  }, [showToast]);

  // Deep link from Google Calendar/Task new-lead notifications: ?deal=<id> → open
  // the Deal Pipeline straight to that deal (DealPipeline reads initialDealId).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dealId = params.get('deal');
    if (!dealId) return;
    setDeepLinkDealId(dealId);
    setView('deals');
    params.delete('deal');
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
  }, []);

  useEffect(() => {
    if (agent) loadContacts();
  }, [agent]);

  useEffect(() => {
    if (selectedPhone) loadInteractions(selectedPhone);
  }, [selectedPhone]);

  const loadContacts = async () => {
    try {
      setContactsLoading(true);
      const data = await getContacts();
      setContacts(data);
    } catch (err) {
      console.error('Failed to load contacts', err);
    } finally {
      setContactsLoading(false);
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
    const ok = await confirm(`Report No-Show for ${selectedPhone}? This will penalize their reliability score.`);
    if (!ok) return;
    try {
      await reportNoShow(selectedPhone);
      await loadContacts();
      showToast('No-Show reported. Score updated.', 'success');
    } catch (err) {
      console.error('Failed to report no-show', err);
      showToast('Failed to report no-show', 'error');
    }
  };

  // 2026-05-12: Mark Lead Lost — sets contact.lead_status=lost + lifecycle=CLOSED_LOST
  // and auto-closes any active deals tied to this contact.
  const handleMarkLeadLost = async () => {
    if (!selectedPhone) return;
    // Two-step confirm with reason capture
    const reasonOptions = [
      'just_browsing', 'wrong_number', 'spam', 'budget_mismatch',
      'already_bought', 'duplicate', 'partner_agent', 'other',
    ];
    const reasonRaw = window.prompt(
      `Reason for marking ${selectedPhone} as LOST?\n\nOne of: ${reasonOptions.join(', ')}\n(Press Cancel to abort.)`,
      'just_browsing',
    );
    if (!reasonRaw) return;
    const reason = reasonRaw.trim().toLowerCase();
    const note = window.prompt('Optional note (or leave blank):', '') || undefined;
    const ok = await confirm(
      `Mark ${selectedPhone} as LOST?\n\nThis will close the lead AND auto-close any active deals for them. This action is reversible by reopening individual deals.`,
    );
    if (!ok) return;
    try {
      const result = await markLeadLost(selectedPhone, reason, note);
      await loadContacts();
      const dealMsg = result.deals_closed > 0 ? ` and ${result.deals_closed} deal${result.deals_closed === 1 ? '' : 's'}` : '';
      showToast(`Lead marked LOST${dealMsg}.`, 'success');
    } catch (err: any) {
      console.error('Failed to mark lead lost', err);
      showToast(err?.response?.data?.error || 'Failed to mark lead lost', 'error');
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
    history.replaceState({ view: viewRef.current }, '');
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isMobile]);

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
    return (
      <>
        {sessionExpired && (
          <div role="alert" className="session-expired-banner">
            Your session has expired. Please log in again.
            <button
              type="button"
              onClick={dismissSessionExpired}
              aria-label="Dismiss session expired message"
              className="session-expired-banner__close"
            >×</button>
          </div>
        )}
        <LoginPage />
      </>
    );
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
                  onMarkLeadLost={handleMarkLeadLost}
                  onUpdateContactType={handleUpdateContactType}
                />
              </>
            );
          }
          return (
            <MobileContactList
              contacts={contacts}
              loading={contactsLoading}
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
        case 'my-profile':
          return <MobileScrollWrapper><MyProfile isMobile /></MobileScrollWrapper>;
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
        case 'taxonomy':
          return <MobileScrollWrapper><PropertyTaxonomy /></MobileScrollWrapper>;
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
          return <DealPipeline initialDealId={deepLinkDealId} />;
        case 'tasks':
          return <MobileScrollWrapper><TaskBoard /></MobileScrollWrapper>;
        case 'analytics':
          return <MobileScrollWrapper><AdvancedAnalytics /></MobileScrollWrapper>;
        case 'deals':
          return <DealPipeline initialDealId={deepLinkDealId} />;
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
      <ErrorBoundary>
        <ConfirmProvider>
          <ToastProvider>
            <MobileLayout activeView={view} onViewChange={handleMobileNav}>
              <ErrorBoundary>{renderMobileContent()}</ErrorBoundary>
            </MobileLayout>
            <ToastContainer />
            <ConfirmDialogRoot />
          </ToastProvider>
        </ConfirmProvider>
      </ErrorBoundary>
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
                onMarkLeadLost={handleMarkLeadLost}
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
      case 'my-profile':
        return <MyProfile />;
      case 'team':
        return <TeamManagement />;
      case 'partners':
        return <PartnerManagement />;
      case 'taxonomy':
        return <PropertyTaxonomy />;
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
        return <DealPipeline initialDealId={deepLinkDealId} />;
      case 'tasks':
        return <TaskBoard />;
      case 'deals':
        return <DealPipeline initialDealId={deepLinkDealId} />;
      case 'analytics':
        return <AdvancedAnalytics />;
      default:
        return null;
    }
  };

  return (
    <ErrorBoundary>
      <ConfirmProvider>
        <ToastProvider>
          <a
            href="#main-content"
            style={{ position: 'absolute', left: '-9999px', top: 'auto', width: '1px', height: '1px', overflow: 'hidden' }}
            onFocus={(e) => { (e.target as HTMLElement).style.cssText = 'position:fixed;top:4px;left:4px;padding:8px 16px;background:#3b82f6;color:white;border-radius:4px;z-index:9999;width:auto;height:auto;overflow:visible'; }}
            onBlur={(e) => { (e.target as HTMLElement).style.cssText = 'position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden'; }}
          >
            Skip to main content
          </a>
          <DashboardLayout activeView={view} onViewChange={setView}>
            <ErrorBoundary>{renderContent()}</ErrorBoundary>
          </DashboardLayout>
          <VoiceCommands onNavigate={setView} currentView={view} />
          <ToastContainer />
          <ConfirmDialogRoot />
        </ToastProvider>
      </ConfirmProvider>
    </ErrorBoundary>
  );
}

export default App;
