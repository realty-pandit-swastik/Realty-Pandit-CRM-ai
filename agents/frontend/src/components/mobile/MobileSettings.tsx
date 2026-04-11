
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

interface MobileSettingsProps {
    onNavigate: (view: string) => void;
}

const CARD_RADIUS = '12px';

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
    super_boss: { bg: '#7f1d1d', color: '#f87171' },
    manager: { bg: '#78350f', color: '#fbbf24' },
    employee: { bg: '#14532d', color: '#4ade80' },
};

export function MobileSettings({ onNavigate }: MobileSettingsProps) {
    const { agent, logout, hasPermission } = useAuth();
    const { theme, toggleTheme } = useTheme();

    const roleStyle = ROLE_COLORS[agent?.role || ''] || { bg: 'var(--bg-primary)', color: 'var(--text-muted)' };

    const menuItems = [
        { id: 'leads', label: 'External Leads', icon: '📥', permission: null },
        { id: 'partners', label: 'Partner Agents', icon: '🤝', permission: 'manage_agents' },
        { id: 'emails', label: 'Email Management', icon: '📧', permission: null },
        { id: 'reports', label: 'Reports', icon: '📊', permission: 'view_reports' },
        { id: 'ai-dashboard', label: 'AI Agents Dashboard', icon: '🤖', permission: 'view_reports' },
        { id: 'agent-logs', label: 'Agent Logs', icon: '📝', permission: 'view_reports' },
        { id: 'override', label: 'Agent Override', icon: '🛡', permission: 'view_reports' },
    ].filter(item => item.permission === null || hasPermission(item.permission));

    return (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Profile Card */}
            <div style={{
                backgroundColor: 'var(--bg-secondary)', borderRadius: CARD_RADIUS,
                padding: '20px', border: '1px solid var(--border-secondary)', textAlign: 'center',
            }}>
                <div style={{
                    width: '64px', height: '64px', borderRadius: '50%',
                    backgroundColor: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 12px', fontSize: '28px', color: '#fff', fontWeight: 700,
                }}>
                    {agent?.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div style={{ fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)' }}>{agent?.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>{agent?.email}</div>
                {agent?.phone && <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>{agent.phone}</div>}
                <span style={{
                    display: 'inline-block', marginTop: '8px',
                    backgroundColor: roleStyle.bg, color: roleStyle.color,
                    padding: '3px 14px', borderRadius: '12px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase',
                }}>
                    {agent?.role?.replace('_', ' ')}
                </span>
            </div>

            {/* Theme Toggle */}
            <div style={{
                backgroundColor: 'var(--bg-secondary)', borderRadius: CARD_RADIUS,
                padding: '14px 16px', border: '1px solid var(--border-secondary)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
            }} onClick={toggleTheme}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '20px' }}>{theme === 'dark' ? '🌙' : '☀️'}</span>
                    <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>
                        {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                    </span>
                </div>
                <div style={{
                    width: '44px', height: '24px', borderRadius: '12px',
                    backgroundColor: theme === 'dark' ? '#4F46E5' : 'var(--border-secondary)',
                    position: 'relative', transition: 'background-color 0.2s',
                }}>
                    <div style={{
                        width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#fff',
                        position: 'absolute', top: '2px',
                        left: theme === 'dark' ? '22px' : '2px', transition: 'left 0.2s',
                    }} />
                </div>
            </div>

            {/* Menu Items */}
            {menuItems.length > 0 && (
                <div style={{
                    backgroundColor: 'var(--bg-secondary)', borderRadius: CARD_RADIUS,
                    border: '1px solid var(--border-secondary)', overflow: 'hidden',
                }}>
                    {menuItems.map((item, i) => (
                        <button key={item.id} onClick={() => onNavigate(item.id)}
                            style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: '14px',
                                padding: '14px 16px', background: 'none', border: 'none',
                                borderBottom: i < menuItems.length - 1 ? '1px solid var(--border-secondary)' : 'none',
                                cursor: 'pointer', textAlign: 'left',
                            }}>
                            <span style={{ fontSize: '18px' }}>{item.icon}</span>
                            <span style={{ flex: 1, fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>{item.label}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '16px' }}>›</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Logout */}
            <button onClick={logout}
                style={{
                    width: '100%', padding: '14px', borderRadius: CARD_RADIUS,
                    border: '1px solid #EF4444', backgroundColor: 'transparent',
                    color: '#EF4444', fontSize: '15px', fontWeight: 700, cursor: 'pointer',
                }}>
                Logout
            </button>

            {/* Version */}
            <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', padding: '8px 0' }}>
                Realty Pandit Admin v2.0
            </div>
        </div>
    );
}
