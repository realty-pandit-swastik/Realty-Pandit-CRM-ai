
import { type ReactNode, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { NotificationBell } from '../NotificationBell';

interface MobileLayoutProps {
    activeView: string;
    onViewChange: (view: string) => void;
    children: ReactNode;
}

const PRIMARY = '#4F46E5';

const NAV_SECTIONS: { label: string; items: { id: string; label: string; icon: string; permission: string | null }[] }[] = [
    {
        label: "Today's Tasks",
        items: [
            { id: 'lead-tasks', label: 'Lead Tasks', icon: '📋', permission: null },
            { id: 'tasks', label: 'Tasks', icon: '🗒', permission: null },
            { id: 'calendar', label: 'Calendar', icon: '📅', permission: null },
        ],
    },
    {
        label: 'Leads & Deals',
        items: [
            { id: 'leads', label: 'Ext. Leads', icon: '📥', permission: null },
            { id: 'buyer-chat', label: 'Buyer Lead', icon: '🔍', permission: null },
            { id: 'deals', label: 'Deal Pipeline', icon: '🎯', permission: null },
        ],
    },
    {
        label: 'Properties',
        items: [
            { id: 'inventory', label: 'Inventory', icon: '🏠', permission: 'view_inventory' },
            { id: 'property-map', label: 'Property Map', icon: '🗺', permission: 'view_inventory' },
            { id: 'live-status', label: 'Live Status', icon: '🟢', permission: 'view_inventory' },
        ],
    },
    {
        label: 'Communication',
        items: [
            { id: 'chats', label: 'Chats', icon: '💬', permission: null },
            { id: 'emails', label: 'Emails', icon: '📧', permission: null },
            { id: 'calls', label: 'Call Log', icon: '📞', permission: null },
        ],
    },
    {
        label: 'Team',
        items: [
            { id: 'partners', label: 'Partner Agents', icon: '🤝', permission: 'manage_agents' },
            { id: 'team', label: 'Team', icon: '👥', permission: 'manage_agents' },
        ],
    },
    {
        label: 'Admin',
        items: [
            { id: 'dashboard', label: 'Dashboard', icon: '📊', permission: 'view_reports' },
            { id: 'reports', label: 'Reports', icon: '📊', permission: 'view_reports' },
            { id: 'ai-dashboard', label: 'AI Agents', icon: '🤖', permission: 'view_reports' },
            { id: 'agent-logs', label: 'Agent Logs', icon: '📝', permission: 'view_reports' },
            { id: 'override', label: 'Override', icon: '🛡', permission: 'view_reports' },
            { id: 'workflows', label: 'Workflows', icon: '🔄', permission: 'view_reports' },
            { id: 'marketing', label: 'Marketing', icon: '📢', permission: 'view_reports' },
            { id: 'analytics', label: 'Analytics', icon: '📈', permission: 'view_reports' },
        ],
    },
];

// Flat list for title lookup
const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap(s => s.items);

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
    super_boss: { bg: '#7f1d1d', color: '#f87171' },
    manager: { bg: '#78350f', color: '#fbbf24' },
    employee: { bg: '#14532d', color: '#4ade80' },
};

export function MobileLayout({ activeView, onViewChange, children }: MobileLayoutProps) {
    const { agent, logout, hasPermission } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [drawerOpen, setDrawerOpen] = useState(false);

    const tabs = [
        { id: 'dashboard', label: 'Home', icon: '🏡' },
        { id: 'lead-tasks', label: 'My Tasks', icon: '📋' },
        { id: 'leads', label: 'Leads', icon: '📥' },
        { id: 'chats', label: 'Chats', icon: '💬' },
        { id: '_menu', label: 'Menu', icon: '☰' },
    ];

    const displayTitle = ALL_NAV_ITEMS.find(t => t.id === activeView)?.label
        || tabs.find(t => t.id === activeView)?.label
        || 'Realty Pandit';

    const handleTabClick = (tabId: string) => {
        if (tabId === '_menu') {
            setDrawerOpen(true);
        } else {
            onViewChange(tabId);
        }
    };

    const handleDrawerNav = (viewId: string) => {
        setDrawerOpen(false);
        onViewChange(viewId);
    };

    const roleStyle = ROLE_COLORS[agent?.role || ''] || { bg: 'var(--bg-primary)', color: 'var(--text-muted)' };

    return (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            {/* Top Bar */}
            <div style={{
                height: '52px', flexShrink: 0,
                backgroundColor: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 16px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button onClick={() => setDrawerOpen(true)} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '20px', padding: '10px', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        ☰
                    </button>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{displayTitle}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <NotificationBell onNavigate={(url) => { if (url.startsWith('#/')) onViewChange(url.replace('#/', '').split('?')[0]); }} />
                    <button onClick={toggleTheme} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '10px', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {theme === 'dark' ? '☀️' : '🌙'}
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', minHeight: 0 }}>
                {children}
            </div>

            {/* Bottom Navigation */}
            <div style={{
                height: '64px', flexShrink: 0,
                backgroundColor: 'var(--bg-secondary)',
                borderTop: '1px solid var(--border-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-around',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}>
                {tabs.map(tab => {
                    const isActive = tab.id === '_menu' ? false : activeView === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleTabClick(tab.id)}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                                padding: '6px 12px', minWidth: '56px',
                                color: isActive ? PRIMARY : 'var(--text-muted)',
                                position: 'relative',
                            }}
                        >
                            {isActive && <div style={{ position: 'absolute', top: '-1px', left: '50%', transform: 'translateX(-50%)', width: '24px', height: '3px', backgroundColor: PRIMARY, borderRadius: '0 0 3px 3px' }} />}
                            <span style={{ fontSize: tab.id === '_menu' ? '20px' : '22px', lineHeight: 1 }}>{tab.icon}</span>
                            <span style={{ fontSize: '12px', fontWeight: isActive ? 700 : 500 }}>{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Slide-out Drawer */}
            {drawerOpen && (
                <div
                    style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000 }}
                    onClick={() => setDrawerOpen(false)}
                >
                    <div
                        style={{
                            width: '280px', height: '100%', backgroundColor: 'var(--bg-secondary)',
                            display: 'flex', flexDirection: 'column', overflow: 'hidden',
                            boxShadow: '4px 0 20px rgba(0,0,0,0.3)',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Drawer Header */}
                        <div style={{
                            padding: '20px 16px', borderBottom: '1px solid var(--border-primary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                            <div>
                                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>Realty Pandit</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Admin Panel</div>
                            </div>
                            <button onClick={() => setDrawerOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '22px', padding: '4px' }}>
                                ✕
                            </button>
                        </div>

                        {/* Sectioned Navigation */}
                        <nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto', minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
                            {NAV_SECTIONS.map(section => {
                                const sectionItems = section.items.filter(
                                    item => item.permission === null || hasPermission(item.permission)
                                );
                                if (sectionItems.length === 0) return null;
                                return (
                                    <div key={section.label} style={{ marginBottom: '4px' }}>
                                        <div style={{
                                            fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
                                            textTransform: 'uppercase', color: 'var(--text-muted)',
                                            padding: '8px 14px 4px',
                                        }}>
                                            {section.label}
                                        </div>
                                        {sectionItems.map(item => (
                                            <button
                                                key={item.id}
                                                onClick={() => handleDrawerNav(item.id)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '12px',
                                                    width: '100%', padding: '11px 14px', marginBottom: '2px',
                                                    backgroundColor: activeView === item.id ? 'var(--bg-active)' : 'transparent',
                                                    border: activeView === item.id ? '1px solid var(--border-secondary)' : '1px solid transparent',
                                                    borderRadius: '10px', cursor: 'pointer',
                                                    color: activeView === item.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                    fontSize: '14px', textAlign: 'left', fontWeight: activeView === item.id ? 600 : 400,
                                                    minHeight: '44px',
                                                }}
                                            >
                                                <span style={{ fontSize: '18px', flexShrink: 0 }}>{item.icon}</span>
                                                {item.label}
                                            </button>
                                        ))}
                                    </div>
                                );
                            })}

                            {/* Profile — bottom of scroll area */}
                            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-primary)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        width: '40px', height: '40px', borderRadius: '50%',
                                        backgroundColor: PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '18px', color: '#fff', fontWeight: 700, flexShrink: 0,
                                    }}>
                                        {agent?.name?.charAt(0)?.toUpperCase() || '?'}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {agent?.name}
                                        </div>
                                        <span style={{
                                            display: 'inline-block', marginTop: '2px',
                                            backgroundColor: roleStyle.bg, color: roleStyle.color,
                                            padding: '1px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                                        }}>
                                            {agent?.role?.replace('_', ' ')}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={toggleTheme}
                                    style={{
                                        width: '100%', padding: '10px 14px', borderRadius: '10px',
                                        border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
                                        color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px',
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                    }}
                                >
                                    {theme === 'dark' ? '☀️' : '🌙'}
                                    {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                                </button>
                                <button
                                    onClick={logout}
                                    style={{
                                        width: '100%', padding: '10px 14px', borderRadius: '10px',
                                        border: '1px solid #EF4444', backgroundColor: 'transparent',
                                        color: '#EF4444', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                                    }}
                                >
                                    Logout
                                </button>
                            </div>
                        </nav>
                    </div>
                </div>
            )}
        </div>
    );
}
