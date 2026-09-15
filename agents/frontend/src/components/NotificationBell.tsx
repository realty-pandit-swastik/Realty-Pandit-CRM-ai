/**
 * Notification Bell — Shows unread count badge, opens NotificationDrawer on click.
 * Used in DashboardLayout header (mobile + desktop).
 */

import { useState, useEffect, useCallback } from 'react';
import { getUnreadNotificationCount, getNotificationHistory, markAllNotificationsRead, markNotificationClicked } from '../api/client';

interface Notification {
    id: string;
    event: string;
    category: string;
    title: string;
    body: string;
    action_url?: string;
    channels_sent: string[];
    read: boolean;
    clicked: boolean;
    created_at: string;
}

const CATEGORY_ICONS: Record<string, string> = {
    inventory: '\u{1F3E0}',
    lead: '\u{1F4E5}',
    deal: '\u{1F3AF}',
    appointment: '\u{1F4C5}',
    task: '\u2705',
    team: '\u{1F465}',
    system: '\u2699\uFE0F',
};

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function NotificationBell({ onNavigate }: { onNavigate?: (url: string) => void }) {
    const [unreadCount, setUnreadCount] = useState(0);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    // Poll unread count every 30 seconds
    const fetchUnread = useCallback(async () => {
        try {
            const data = await getUnreadNotificationCount();
            setUnreadCount(data.count || 0);
        } catch {}
    }, []);

    useEffect(() => {
        fetchUnread();
        const interval = setInterval(fetchUnread, 30000);
        return () => clearInterval(interval);
    }, [fetchUnread]);

    // Load notifications when drawer opens
    const loadNotifications = useCallback(async (pageNum: number, append = false) => {
        setLoading(true);
        try {
            const data = await getNotificationHistory(pageNum, 15);
            if (append) {
                setNotifications(prev => [...prev, ...(data.data || [])]);
            } else {
                setNotifications(data.data || []);
            }
            setHasMore(pageNum < (data.totalPages || 1));
        } catch {}
        setLoading(false);
    }, []);

    const handleOpen = useCallback(() => {
        setDrawerOpen(true);
        setPage(1);
        loadNotifications(1);
    }, [loadNotifications]);

    const handleClose = useCallback(() => {
        setDrawerOpen(false);
    }, []);

    const handleMarkAllRead = useCallback(async () => {
        await markAllNotificationsRead();
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnreadCount(0);
    }, []);

    const handleClick = useCallback(async (notif: Notification) => {
        if (!notif.read) {
            await markNotificationClicked(notif.id);
            setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true, clicked: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        }
        if (notif.action_url && onNavigate) {
            onNavigate(notif.action_url);
            setDrawerOpen(false);
        }
    }, [onNavigate]);

    const handleLoadMore = useCallback(() => {
        const nextPage = page + 1;
        setPage(nextPage);
        loadNotifications(nextPage, true);
    }, [page, loadNotifications]);

    return (
        <>
            {/* Bell Button */}
            <button
                onClick={handleOpen}
                style={{
                    position: 'relative', background: 'none', border: 'none',
                    cursor: 'pointer', fontSize: '20px', padding: '6px', lineHeight: 1,
                }}
                title="Notifications"
            >
                {'\u{1F514}'}
                {unreadCount > 0 && (
                    <span style={{
                        position: 'absolute', top: '0', right: '0',
                        backgroundColor: '#ef4444', color: '#fff',
                        fontSize: '10px', fontWeight: 700,
                        minWidth: '16px', height: '16px',
                        borderRadius: '8px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        padding: '0 4px',
                    }}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Drawer Overlay */}
            {drawerOpen && (
                <div
                    style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', justifyContent: 'flex-end' }}
                    onClick={handleClose}
                >
                    {/* Backdrop */}
                    <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />

                    {/* Drawer Panel */}
                    <div
                        style={{
                            position: 'relative', width: '380px', maxWidth: '90vw', height: '100%',
                            backgroundColor: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-primary)',
                            display: 'flex', flexDirection: 'column', overflow: 'hidden',
                            boxShadow: '-4px 0 20px rgba(0,0,0,0.3)',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div style={{
                            padding: '16px', borderBottom: '1px solid var(--border-secondary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                Notifications
                            </h3>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                {unreadCount > 0 && (
                                    <button
                                        onClick={handleMarkAllRead}
                                        style={{
                                            background: 'none', border: 'none', color: '#60a5fa',
                                            cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                                        }}
                                    >Mark all read</button>
                                )}
                                <button
                                    onClick={handleClose}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '20px' }}
                                >{'\u2715'}</button>
                            </div>
                        </div>

                        {/* Notification List */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                            {notifications.length === 0 && !loading && (
                                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>{'\u{1F514}'}</div>
                                    <div style={{ fontSize: '14px' }}>No notifications yet</div>
                                </div>
                            )}

                            {notifications.map(notif => (
                                <div
                                    key={notif.id}
                                    onClick={() => handleClick(notif)}
                                    style={{
                                        display: 'flex', gap: '10px', padding: '12px 16px',
                                        cursor: notif.action_url ? 'pointer' : 'default',
                                        backgroundColor: notif.read ? 'transparent' : 'rgba(59,130,246,0.06)',
                                        borderBottom: '1px solid var(--border-secondary)',
                                        transition: 'background-color 0.15s',
                                    }}
                                    onMouseEnter={e => { if (!notif.read) (e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.1)'); }}
                                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = notif.read ? 'transparent' : 'rgba(59,130,246,0.06)'; }}
                                >
                                    {/* Category Icon */}
                                    <div style={{ fontSize: '18px', flexShrink: 0, paddingTop: '2px' }}>
                                        {CATEGORY_ICONS[notif.category] || '\u{1F514}'}
                                    </div>

                                    {/* Content */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: '13px', fontWeight: notif.read ? 500 : 700,
                                            color: 'var(--text-primary)', marginBottom: '2px',
                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                        }}>
                                            {notif.title}
                                        </div>
                                        <div style={{
                                            fontSize: '12px', color: 'var(--text-muted)',
                                            overflow: 'hidden', textOverflow: 'ellipsis',
                                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                        }}>
                                            {notif.body}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <span>{timeAgo(notif.created_at)}</span>
                                            {notif.channels_sent.length > 0 && (
                                                <span style={{ fontSize: '10px', opacity: 0.6 }}>
                                                    via {notif.channels_sent.join(', ')}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Unread dot */}
                                    {!notif.read && (
                                        <div style={{
                                            width: '8px', height: '8px', borderRadius: '50%',
                                            backgroundColor: '#3b82f6', flexShrink: 0, marginTop: '6px',
                                        }} />
                                    )}
                                </div>
                            ))}

                            {/* Load More */}
                            {hasMore && notifications.length > 0 && (
                                <div style={{ textAlign: 'center', padding: '12px' }}>
                                    <button
                                        onClick={handleLoadMore}
                                        disabled={loading}
                                        aria-busy={loading ? 'true' : 'false'}
                                        aria-label={loading ? 'Loading notifications' : 'Load more notifications'}
                                        style={{
                                            background: 'none', border: '1px solid var(--border-secondary)',
                                            color: 'var(--text-link)', cursor: 'pointer',
                                            padding: '8px 20px', borderRadius: '6px', fontSize: '13px',
                                        }}
                                    >
                                        {loading ? 'Loading...' : 'Load More'}
                                    </button>
                                </div>
                            )}

                            {loading && notifications.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>
                                    Loading...
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
