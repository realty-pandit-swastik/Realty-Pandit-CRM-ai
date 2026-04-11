
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
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
}

interface AuthContextType {
    agent: Agent | null;
    token: string | null;
    loading: boolean;
    login: (phone: string, password: string) => Promise<void>;
    setup: (name: string, email: string, password: string) => Promise<void>;
    logout: () => void;
    hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [agent, setAgent] = useState<Agent | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (token) {
            client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            fetchMe();
        } else {
            setLoading(false);
        }
    }, []);

    const fetchMe = async () => {
        try {
            const res = await client.get('/auth/me');
            setAgent(res.data);
        } catch {
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            setToken(null);
            delete client.defaults.headers.common['Authorization'];
        } finally {
            setLoading(false);
        }
    };

    const login = async (phone: string, password: string) => {
        const res = await client.post('/auth/login', { phone, password });
        const { token: newToken, refreshToken } = res.data;
        localStorage.setItem('token', newToken);
        localStorage.setItem('refreshToken', refreshToken);
        setToken(newToken);
        client.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        await fetchMe();
    };

    const setup = async (name: string, email: string, password: string) => {
        const res = await client.post('/auth/setup', { name, email, password });
        const { token: newToken, refreshToken } = res.data;
        localStorage.setItem('token', newToken);
        localStorage.setItem('refreshToken', refreshToken);
        setToken(newToken);
        client.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        await fetchMe();
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        setToken(null);
        setAgent(null);
        delete client.defaults.headers.common['Authorization'];
    };

    const hasPermission = (permission: string) => {
        return agent?.permissions?.includes(permission) ?? false;
    };

    return (
        <AuthContext.Provider value={{ agent, token, loading, login, setup, logout, hasPermission }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
