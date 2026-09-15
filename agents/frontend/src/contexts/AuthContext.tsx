
import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import client from '../api/client';

interface Agent {
    id: string;
    name: string;
    email: string;
    role: string;
    phone?: string;
    status: string;
    tenant_id: string;
    permissions: string[];
    reports_to?: { name: string; email: string } | null;
    subordinates?: { id: string; name: string; email: string; role: string }[];
    // PARTNER (role === 'partner') — returned by the /auth/me partner branch. (2026-07-13)
    partner_category?: string | null;   // 'COMPANY' | 'INDIVIDUAL'
    parent_partner_id?: string | null;  // set ⇒ this partner is a SUB-AGENT of another partner
    coordinator?: { name: string; phone?: string | null; email?: string | null } | null;
}

interface AuthContextType {
    agent: Agent | null;
    /** @deprecated Token is now stored in HttpOnly cookie — always null in JS */
    token: null;
    loading: boolean;
    sessionExpired: boolean;
    login: (phone: string, password: string) => Promise<void>;
    setup: (name: string, email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    hasPermission: (permission: string) => boolean;
    dismissSessionExpired: () => void;
    /** External partner agent (not internal staff). */
    isPartner: boolean;
    /**
     * A partner COMPANY OWNER — the only partner who may manage a team and assign work.
     * Derived ONCE here on purpose: recomputing this per-screen is how the four screens drift apart.
     */
    isPartnerOwner: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [agent, setAgent] = useState<Agent | null>(null);
    const [loading, setLoading] = useState(true);
    const [sessionExpired, setSessionExpired] = useState(false);

    const fetchMe = useCallback(async () => {
        try {
            const res = await client.get('/auth/me');
            setAgent(res.data);
        } catch {
            // Not authenticated — clear agent, login screen will show
            setAgent(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // On mount, check if we have a valid session via cookie.
        // No localStorage involved — the server sets HttpOnly cookies on login.
        fetchMe();
    }, [fetchMe]);

    useEffect(() => {
        // Listen for session-expired events dispatched by the axios interceptor
        // when the refresh cookie is also expired or invalid.
        const handleSessionExpired = () => {
            setAgent(null);
            setSessionExpired(true);
        };
        window.addEventListener('session-expired', handleSessionExpired);
        return () => window.removeEventListener('session-expired', handleSessionExpired);
    }, []);

    // Auto-subscribe to push notifications after login
    const pushSubscribed = useRef(false);
    useEffect(() => {
        if (!agent || pushSubscribed.current) return;
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
        if (Notification.permission === 'denied') return;

        pushSubscribed.current = true;

        // Small delay to let the UI settle, then request permission + subscribe
        const timer = setTimeout(async () => {
            try {
                const perm = await Notification.requestPermission();
                if (perm !== 'granted') return;

                const reg = await navigator.serviceWorker.ready;
                const existing = await reg.pushManager.getSubscription();
                if (existing) return; // Already subscribed

                const { data: { publicKey } } = await client.get('/api/notifications/push/vapid-key');
                if (!publicKey) return;

                const padding = '='.repeat((4 - publicKey.length % 4) % 4);
                const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
                const rawData = window.atob(base64);
                const applicationServerKey = new Uint8Array(rawData.length);
                for (let i = 0; i < rawData.length; i++) applicationServerKey[i] = rawData.charCodeAt(i);

                const subscription = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
                });

                const subJson = subscription.toJSON();
                await client.post('/api/notifications/push/subscribe', {
                    endpoint: subJson.endpoint,
                    keys: subJson.keys,
                });
                console.log('[Push] Auto-subscribed to push notifications');
            } catch (err) {
                console.warn('[Push] Auto-subscribe failed:', err);
            }
        }, 2000);

        return () => clearTimeout(timer);
    }, [agent]);

    const login = async (phone: string, password: string) => {
        // The server sets rp_access_token + rp_refresh_token + rp_csrf cookies
        // in the response. The browser stores them automatically.
        await client.post('/auth/login', { phone, password });
        setSessionExpired(false);
        pushSubscribed.current = false; // Reset so the effect triggers
        await fetchMe();
    };

    const setup = async (name: string, email: string, password: string) => {
        await client.post('/auth/setup', { name, email, password });
        setSessionExpired(false);
        await fetchMe();
    };

    const logout = async () => {
        try {
            // Ask the server to clear cookies and invalidate the refresh token in DB
            await client.post('/auth/logout');
        } catch {
            // Non-fatal — clear client state regardless
        }
        setAgent(null);
        setSessionExpired(false);
    };

    const hasPermission = (permission: string) => {
        return agent?.permissions?.includes(permission) ?? false;
    };

    const dismissSessionExpired = () => {
        setSessionExpired(false);
    };

    // Partner identity, derived ONCE (see AuthContextType). A partner OWNER is a COMPANY partner with
    // no parent — sub-agents are always created INDIVIDUAL + parented, so they can never be owners.
    const isPartner = agent?.role === 'partner';
    const isPartnerOwner = isPartner
        && agent?.partner_category === 'COMPANY'
        && !agent?.parent_partner_id;

    return (
        <AuthContext.Provider value={{
            agent,
            token: null,
            loading,
            sessionExpired,
            login,
            setup,
            logout,
            hasPermission,
            dismissSessionExpired,
            isPartner,
            isPartnerOwner,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
