'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { LayoutDashboard, Building2, Users, Calendar, CreditCard, LogOut, Menu, X, UserPlus, ChevronRight, Handshake } from 'lucide-react';
import { ManagerContactBanner } from '@/components/agent/ManagerContactBanner';

const PLAN_COLORS: Record<string, string> = {
    FREE: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    PRO: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    ADVANCE_PRO: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

const PLAN_LABELS: Record<string, string> = {
    FREE: 'Free',
    PRO: 'Pro',
    ADVANCE_PRO: 'Advance Pro',
};

const PLAN_LIMITS: Record<string, number> = {
    FREE: 5,
    PRO: 25,
    ADVANCE_PRO: 100,
};

interface AgentInfo {
    name: string;
    phone_number: string;
    package_type: string;
    partner_category?: string;
    parent_partner_id?: string;
    listing_count?: number;
}

export default function AgentLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
    const [isCompanyOwner, setIsCompanyOwner] = useState(false);

    useEffect(() => {
        const isLoginPage = pathname === '/agent/login';

        // Skip auth probe entirely on login page — otherwise a 429/401 here triggers
        // the api interceptor's redirect to /agent/login?expired=1 which flips pathname,
        // re-runs this effect, refires the probe, and creates an infinite reload loop.
        if (!isLoginPage) {
            // Probe /agent/coordinator (which exists) instead of /agent/me (which doesn't).
            // Only redirect on 401 (real auth failure). Treat 429/5xx as "unknown — don't
            // bounce the user around" so rate-limit hiccups don't kick them to login.
            api.get('/agent/coordinator').then(() => {
                // OK — stay where we are
            }).catch((err) => {
                if (err?.response?.status === 401) {
                    router.push('/agent/login');
                }
            });
        }

        try {
            const info = localStorage.getItem('agent_info');
            if (info) {
                const parsed: AgentInfo = JSON.parse(info);
                setAgentInfo(parsed);
                setIsCompanyOwner(parsed.partner_category === 'COMPANY' && !parsed.parent_partner_id);
            }
        } catch {}
    }, [pathname, router]);

    if (pathname === '/agent/login') {
        return <>{children}</>;
    }

    const navItems = [
        { name: 'Dashboard', href: '/agent/dashboard', icon: LayoutDashboard },
        { name: 'My Inventory', href: '/agent/inventory', icon: Building2 },
        { name: 'Deals', href: '/agent/deals', icon: Handshake },
        { name: 'Leads & Enquiries', href: '/agent/leads', icon: Users },
        { name: 'Appointments', href: '/agent/appointments', icon: Calendar },
        ...(isCompanyOwner ? [{ name: 'My Team', href: '/agent/team', icon: UserPlus }] : []),
        { name: 'Subscription', href: '/agent/subscription', icon: CreditCard },
    ];

    const handleLogout = async () => {
        localStorage.removeItem('agent_info');
        try {
            await api.post('/auth/logout');
        } catch {}
        router.push('/agent/login');
    };

    const plan = agentInfo?.package_type ?? 'FREE';
    const listingCount = agentInfo?.listing_count ?? 0;
    const listingLimit = PLAN_LIMITS[plan] ?? 5;
    const listingPercent = Math.min(100, Math.round((listingCount / listingLimit) * 100));
    const initials = agentInfo?.name
        ? agentInfo.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
        : 'AG';

    const SidebarContent = () => (
        <div className="flex flex-col h-full bg-gradient-to-b from-slate-900 via-slate-900 to-blue-950">
            {/* Header */}
            <div className="flex items-center justify-between h-16 px-5 border-b border-white/10 flex-shrink-0">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow">
                        RP
                    </div>
                    <span className="text-white font-bold text-base">Realty Pandit</span>
                </div>
                <button type="button" aria-label="Close sidebar" className="lg:hidden text-slate-400 hover:text-white" onClick={() => setIsSidebarOpen(false)}>
                    <X className="h-5 w-5" />
                </button>
            </div>

            {/* Agent Profile Card */}
            {agentInfo && (
                <div className="mx-4 mt-5 p-4 rounded-2xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                            {initials}
                        </div>
                        <div className="min-w-0">
                            <p className="text-white text-sm font-semibold truncate">{agentInfo.name}</p>
                            <p className="text-slate-400 text-xs truncate">{agentInfo.phone_number}</p>
                        </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PLAN_COLORS[plan] ?? PLAN_COLORS.FREE}`}>
                            {PLAN_LABELS[plan] ?? plan}
                        </span>
                        <span className="text-xs text-slate-400">{listingCount}/{listingLimit} listings</span>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all ${listingPercent >= 90 ? 'bg-red-400' : listingPercent >= 70 ? 'bg-amber-400' : 'bg-blue-400'}`}
                            style={{ width: `${listingPercent}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Navigation */}
            <nav className="flex-1 mt-4 px-3 space-y-0.5 overflow-y-auto">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            onClick={() => setIsSidebarOpen(false)}
                            className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                                isActive
                                    ? 'bg-white/10 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <Icon className={`h-4.5 w-4.5 flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}`} size={18} />
                                {item.name}
                            </div>
                            {isActive && <ChevronRight className="h-3.5 w-3.5 text-slate-500" />}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer — logout */}
            <div className="p-3 border-t border-white/10 flex-shrink-0">
                <button
                    type="button"
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-3 py-2.5 text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-150"
                >
                    <LogOut size={18} />
                    Sign Out
                </button>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-100 flex">
            {/* Mobile overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-20 lg:hidden backdrop-blur-sm"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar — desktop static */}
            <aside className="hidden lg:flex lg:flex-col w-64 flex-shrink-0">
                <div className="fixed top-0 left-0 bottom-0 w-64 z-30">
                    <SidebarContent />
                </div>
            </aside>

            {/* Sidebar — mobile slide-in */}
            <aside className={`fixed inset-y-0 left-0 z-30 w-64 transform transition-transform duration-300 ease-in-out lg:hidden ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <SidebarContent />
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile top bar */}
                <header className="bg-white border-b border-slate-200 lg:hidden flex-shrink-0">
                    <div className="flex items-center justify-between h-14 px-4">
                        <button onClick={() => setIsSidebarOpen(true)} className="text-slate-500 hover:text-slate-900 focus:outline-none">
                            <Menu className="h-5 w-5" />
                        </button>
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white font-bold text-xs">
                                RP
                            </div>
                            <span className="text-sm font-semibold text-slate-800">Partner Portal</span>
                        </div>
                        <div className="w-5" />
                    </div>
                </header>

                <ManagerContactBanner />
                <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
