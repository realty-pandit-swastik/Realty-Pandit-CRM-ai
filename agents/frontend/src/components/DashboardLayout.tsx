
import { type ReactNode, useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { NotificationBell } from './NotificationBell';

interface DashboardLayoutProps {
    activeView: string;
    onViewChange: (view: string) => void;
    children: ReactNode;
}

export function DashboardLayout({ activeView, onViewChange, children }: DashboardLayoutProps) {
    const { agent, logout, hasPermission } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const isMobile = useIsMobile();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const navRef = useRef<HTMLElement>(null);

    // PWA Install Prompt
    const [installPrompt, setInstallPrompt] = useState<any>(null);
    const [isStandalone, setIsStandalone] = useState(false);
    useEffect(() => {
        // Check if already running as installed PWA
        const standalone = window.matchMedia('(display-mode: standalone)').matches
            || (window.navigator as any).standalone === true;
        setIsStandalone(standalone);

        const handler = (e: Event) => {
            e.preventDefault();
            setInstallPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const navSections = [
        {
            label: "Today's Tasks",
            items: [
                { id: 'tasks', label: 'Tasks', icon: '\u{1F5D2}', permission: null },
                { id: 'calendar', label: 'Calendar', icon: '\u{1F4C5}', permission: null },
            ],
        },
        {
            label: 'Leads & Deals',
            items: [
                { id: 'leads', label: 'Ext. Leads', icon: '\u{1F4E5}', permission: null },
                // 'buyer-chat' (Buyer Lead chat) removed from nav 2026-06-03 — 0 bookings ever,
                // redundant with '+ Add Lead'. Engine + route kept (WhatsApp buyer bot uses it).
                { id: 'deals', label: 'Deal Pipeline', icon: '\u{1F3AF}', permission: null },
            ],
        },
        {
            label: 'Properties',
            items: [
                { id: 'inventory', label: 'Inventory', icon: '\u{1F3E0}', permission: 'view_inventory' },
                { id: 'property-map', label: 'Property Map', icon: '\u{1F5FA}', permission: 'view_inventory' },
                { id: 'live-status', label: 'Live Status', icon: '\u{1F7E2}', permission: 'view_inventory' },
                { id: 'taxonomy', label: 'Property Taxonomy', icon: '\u{1F333}', permission: null, superBossOnly: true },
            ],
        },
        {
            label: 'Communication',
            items: [
                { id: 'chats', label: 'Chats', icon: '\u{1F4AC}', permission: null },
                { id: 'emails', label: 'Emails', icon: '\u{1F4E7}', permission: null },
                { id: 'calls', label: 'Call Log', icon: '\u{1F4DE}', permission: null },
            ],
        },
        {
            label: 'Team',
            items: [
                { id: 'my-profile', label: 'My Profile', icon: '\u{1F464}', permission: null },
                { id: 'partners', label: 'Partner Agents', icon: '\u{1F91D}', permission: 'manage_agents' },
                { id: 'team', label: 'Team', icon: '\u{1F465}', permission: 'manage_agents' },
            ],
        },
        {
            label: 'Admin',
            items: [
                { id: 'dashboard', label: 'Dashboard', icon: '\u{1F4CA}', permission: null },
                { id: 'reports', label: 'Reports', icon: '\u{1F4CA}', permission: 'view_reports' },
                { id: 'ai-dashboard', label: 'AI Agents', icon: '\u{1F916}', permission: 'view_reports' },
                { id: 'agent-logs', label: 'Agent Logs', icon: '\u{1F4DD}', permission: 'view_reports' },
                { id: 'override', label: 'Override', icon: '\u{1F6E1}', permission: 'view_reports' },
                { id: 'workflows', label: 'Workflows', icon: '\u{1F504}', permission: 'view_reports' },
                { id: 'marketing', label: 'Marketing', icon: '\u{1F4E2}', permission: 'view_reports' },
                { id: 'analytics', label: 'Analytics', icon: '\u{1F4C8}', permission: 'view_reports' },
            ],
        },
    ];


    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case 'super_boss': return '#ef4444';
            case 'manager': return '#f59e0b';
            case 'employee': return '#22c55e';
            default: return '#6b7280';
        }
    };

    const handleNavClick = (viewId: string) => {
        onViewChange(viewId);
        if (isMobile) setMobileMenuOpen(false);
    };

    const handleNavKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const items = navRef.current?.querySelectorAll<HTMLElement>('button[aria-current]');
        const allItems = navRef.current?.querySelectorAll<HTMLElement>('button');
        const list = allItems ? Array.from(allItems) : [];
        if (list.length === 0) return;
        const idx = list.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'ArrowDown'
            ? list[(idx + 1) % list.length]
            : list[(idx - 1 + list.length) % list.length];
        next?.focus();
        // suppress unused variable warning
        void items;
    };

    const sidebarContent = (
        <>
            {/* Brand */}
            <div style={{ padding: '16px 12px', borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', justifyContent: (collapsed && !isMobile) ? 'center' : 'space-between' }}>
                {(!collapsed || isMobile) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div>
                            <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '18px', whiteSpace: 'nowrap' }}>Realty Pandit</h2>
                            <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '12px' }}>Dashboard</p>
                        </div>
                        {!isMobile && <NotificationBell onNavigate={(url) => { if (url.startsWith('#/')) onViewChange(url.replace('#/', '').split('?')[0]); }} />}
                    </div>
                )}
                {collapsed && !isMobile && (
                    <NotificationBell onNavigate={(url) => { if (url.startsWith('#/')) onViewChange(url.replace('#/', '').split('?')[0]); }} />
                )}
                {isMobile ? (
                    <button onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation menu" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '22px', padding: '4px', minWidth: '44px', minHeight: '44px' }}>{'\u2715'}</button>
                ) : (
                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        style={{
                            background: 'none', border: '1px solid var(--border-secondary)', borderRadius: '6px',
                            color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px',
                            padding: '4px 7px', lineHeight: 1, flexShrink: 0
                        }}
                    >
                        {collapsed ? '\u25B6' : '\u25C0'}
                    </button>
                )}
            </div>

            {/* Navigation */}
            <nav ref={navRef} aria-label="Main navigation" onKeyDown={handleNavKeyDown} style={{ flex: 1, padding: '8px 8px', overflowX: 'hidden', overflowY: 'auto' }}>
                {navSections.map(section => {
                    const sectionItems = section.items.filter(
                        item => (item.permission === null || hasPermission(item.permission))
                            && (!(item as any).superBossOnly || agent?.role === 'super_boss')
                    );
                    if (sectionItems.length === 0) return null;
                    return (
                        <div key={section.label} style={{ marginBottom: '4px' }}>
                            {(!collapsed || isMobile) && (
                                <div style={{
                                    fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em',
                                    textTransform: 'uppercase', color: 'var(--text-muted)',
                                    padding: '8px 12px 4px',
                                }}>
                                    {section.label}
                                </div>
                            )}
                            {sectionItems.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => handleNavClick(item.id)}
                                    title={(collapsed && !isMobile) ? item.label : undefined}
                                    aria-current={activeView === item.id ? 'page' : undefined}
                                    style={{
                                        display: 'flex', alignItems: 'center',
                                        gap: (collapsed && !isMobile) ? '0' : '10px',
                                        justifyContent: (collapsed && !isMobile) ? 'center' : 'flex-start',
                                        width: '100%',
                                        padding: (collapsed && !isMobile) ? '10px 0' : '9px 12px',
                                        minHeight: isMobile ? '44px' : undefined,
                                        marginBottom: '2px',
                                        backgroundColor: activeView === item.id ? 'var(--bg-active)' : 'transparent',
                                        border: activeView === item.id ? '1px solid var(--border-secondary)' : '1px solid transparent',
                                        borderRadius: '8px', cursor: 'pointer',
                                        color: activeView === item.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        fontSize: '14px', textAlign: 'left',
                                        fontWeight: activeView === item.id ? 600 : 400,
                                    }}
                                >
                                    <span style={{ fontSize: '17px', flexShrink: 0 }}>{item.icon}</span>
                                    {(!collapsed || isMobile) && item.label}
                                </button>
                            ))}
                        </div>
                    );
                })}
            </nav>

            {/* User Info + Theme Toggle */}
            <div style={{
                padding: (collapsed && !isMobile) ? '12px 8px' : '16px', borderTop: '1px solid var(--border-primary)',
                display: 'flex', flexDirection: 'column', gap: '8px',
                alignItems: (collapsed && !isMobile) ? 'center' : 'stretch'
            }}>
                <button
                    onClick={toggleTheme}
                    aria-label="Toggle dark mode"
                    title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    style={{
                        backgroundColor: 'var(--bg-active)', border: '1px solid var(--border-secondary)',
                        color: 'var(--text-secondary)', padding: (collapsed && !isMobile) ? '6px' : '6px 12px', borderRadius: '6px',
                        cursor: 'pointer', fontSize: (collapsed && !isMobile) ? '16px' : '13px',
                        textAlign: 'center', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', gap: '6px',
                        minWidth: '44px', minHeight: '44px'
                    }}
                >
                    {theme === 'dark' ? '\u2600\uFE0F' : '\u{1F319}'}
                    {(!collapsed || isMobile) && (theme === 'dark' ? 'Light Mode' : 'Dark Mode')}
                </button>

                {(!collapsed || isMobile) && (
                    <div>
                        <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {agent?.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                            <span style={{
                                backgroundColor: getRoleBadgeColor(agent?.role || ''),
                                color: '#fff', padding: '2px 8px', borderRadius: '10px',
                                fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', whiteSpace: 'nowrap'
                            }}>
                                {agent?.role?.replace('_', ' ')}
                            </span>
                        </div>
                        {agent?.phone && (
                            <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                                {agent.phone}
                            </div>
                        )}
                    </div>
                )}
                {(collapsed && !isMobile) && (
                    <div title={agent?.name || ''} style={{ fontSize: '18px', textAlign: 'center' }}>{'\u{1F464}'}</div>
                )}
                {!isStandalone && (
                    <button
                        onClick={async () => {
                            if (installPrompt) {
                                installPrompt.prompt();
                                const result = await installPrompt.userChoice;
                                if (result.outcome === 'accepted') setInstallPrompt(null);
                            } else {
                                alert('To install:\n\nChrome: Tap \u22EE menu \u2192 "Add to Home screen"\n\nSafari: Tap Share \u2192 "Add to Home Screen"');
                            }
                        }}
                        title={(collapsed && !isMobile) ? 'Install App' : undefined}
                        style={{
                            backgroundColor: '#3b82f6', border: 'none',
                            color: '#ffffff', padding: '6px 12px', borderRadius: '6px',
                            cursor: 'pointer', fontSize: (collapsed && !isMobile) ? '16px' : '13px',
                            textAlign: 'center', minWidth: '44px', minHeight: '44px',
                            fontWeight: 600, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: '6px',
                        }}
                    >
                        {(collapsed && !isMobile) ? '\u{1F4F2}' : '\u{1F4F2} Install App'}
                    </button>
                )}
                <button
                    onClick={logout}
                    title={(collapsed && !isMobile) ? 'Logout' : undefined}
                    style={{
                        backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)',
                        color: 'var(--text-secondary)', padding: '6px 12px', borderRadius: '6px',
                        cursor: 'pointer', fontSize: (collapsed && !isMobile) ? '16px' : '13px',
                        textAlign: 'center', minWidth: '44px', minHeight: '44px'
                    }}
                >
                    {(collapsed && !isMobile) ? '\u23FB' : 'Logout'}
                </button>
            </div>
        </>
    );

    return (
        <div style={{ display: 'flex', height: '100vh', fontFamily: 'Inter, sans-serif' }}>
            {/* Skip-to-content: visible on focus, hidden otherwise (WCAG 2.4.1) */}
            <a href="#main-content" className="skip-to-content">
                Skip to main content
            </a>

            {/* Mobile Top Bar */}
            {isMobile && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0,
                    minHeight: 'calc(52px + env(safe-area-inset-top, 0px))',
                    zIndex: 999,
                    backgroundColor: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border-primary)',
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                    paddingBottom: '4px',
                    paddingTop: 'env(safe-area-inset-top, 0px)',
                    paddingLeft: 'calc(12px + env(safe-area-inset-left, 0px))',
                    paddingRight: 'calc(12px + env(safe-area-inset-right, 0px))',
                }}>
                    <button
                        onClick={() => setMobileMenuOpen(true)}
                        aria-label="Open navigation menu"
                        aria-expanded={mobileMenuOpen ? 'true' : 'false'}
                        style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '22px', padding: '6px', minWidth: '44px', minHeight: '44px' }}
                    >{'\u2630'}</button>
                    <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '16px' }}>Realty Pandit</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <NotificationBell onNavigate={(url) => { if (url.startsWith('#/')) onViewChange(url.replace('#/', '').split('?')[0]); }} />
                        <button
                            onClick={toggleTheme}
                            aria-label="Toggle dark mode"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '6px', minWidth: '44px', minHeight: '44px' }}
                        >{theme === 'dark' ? '\u2600\uFE0F' : '\u{1F319}'}</button>
                    </div>
                </div>
            )}

            {/* Mobile Overlay Sidebar */}
            {isMobile && mobileMenuOpen && (
                <div
                    style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000 }}
                    onClick={() => setMobileMenuOpen(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Navigation menu"
                        style={{
                            width: '280px', height: '100%', backgroundColor: 'var(--bg-sidebar)',
                            display: 'flex', flexDirection: 'column', overflow: 'hidden'
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {sidebarContent}
                    </div>
                </div>
            )}

            {/* Desktop Sidebar */}
            {!isMobile && (
                <div style={{
                    width: collapsed ? '60px' : '220px',
                    backgroundColor: 'var(--bg-sidebar)', display: 'flex',
                    flexDirection: 'column', borderRight: '1px solid var(--border-primary)',
                    transition: 'width 0.2s ease', overflow: 'hidden', flexShrink: 0
                }}>
                    {sidebarContent}
                </div>
            )}

            {/* Main Content */}
            <div
                id="main-content"
                role="main"
                style={{
                    flex: 1, display: 'flex', backgroundColor: 'var(--bg-primary)',
                    marginTop: isMobile ? 'calc(52px + env(safe-area-inset-top, 0px))' : 0,
                    width: isMobile ? '100%' : undefined,
                }}
            >
                {children}
            </div>
        </div>
    );
}
