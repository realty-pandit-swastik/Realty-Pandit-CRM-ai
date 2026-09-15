'use client';

import { useEffect, useState } from 'react';
import { Building2, Users, Calendar, TrendingUp, Lock, Phone, Mail, User, ArrowRight, ShieldCheck, KeyRound, Handshake } from 'lucide-react';
import Link from 'next/link';
import api from '@/lib/api';

const PLAN_LABELS: Record<string, string> = {
    FREE: 'Free',
    PRO: 'Pro',
    ADVANCE_PRO: 'Advance Pro',
};

const PLAN_GRADIENTS: Record<string, string> = {
    FREE: 'from-slate-500 to-slate-600',
    PRO: 'from-blue-500 to-indigo-600',
    ADVANCE_PRO: 'from-amber-500 to-orange-600',
};

export default function AgentDashboard() {
    const [stats, setStats] = useState({
        activeListings: 0,
        totalListings: 0,
        totalEnquiries: 0,
        visitsScheduled: 0,
    });
    const [loading, setLoading] = useState(true);
    const [agentInfo, setAgentInfo] = useState<any>(null);
    const [showSetPassword, setShowSetPassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [pwLoading, setPwLoading] = useState(false);
    const [pwMessage, setPwMessage] = useState('');
    const [pwError, setPwError] = useState('');

    useEffect(() => {
        try {
            const info = localStorage.getItem('agent_info');
            if (info) setAgentInfo(JSON.parse(info));
        } catch {}

        api.get('/agent/dashboard')
            .then(res => setStats(res.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const handleSetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPwError('');
        setPwMessage('');

        if (newPassword.length < 6) { setPwError('Password must be at least 6 characters'); return; }
        if (newPassword !== confirmPassword) { setPwError('Passwords do not match'); return; }

        setPwLoading(true);
        try {
            const body: any = { password: newPassword };
            if (agentInfo?.has_password) body.current_password = currentPassword;

            const res = await api.post('/agent/set-password', body);
            setPwMessage(res.data.message);
            setShowSetPassword(false);
            setNewPassword('');
            setConfirmPassword('');
            setCurrentPassword('');

            const updated = { ...agentInfo, has_password: true };
            setAgentInfo(updated);
            localStorage.setItem('agent_info', JSON.stringify(updated));
        } catch (err: any) {
            setPwError(err.response?.data?.error || 'Failed to set password');
        } finally {
            setPwLoading(false);
        }
    };

    const plan = agentInfo?.package_type ?? 'FREE';
    const firstName = agentInfo?.name?.split(' ')[0] ?? 'Agent';
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    const statCards = [
        {
            name: 'Active Listings',
            value: stats.activeListings,
            icon: Building2,
            gradient: 'from-blue-500 to-blue-600',
            bg: 'bg-blue-50',
            text: 'text-blue-600',
            href: '/agent/inventory',
        },
        {
            name: 'Total Listings',
            value: stats.totalListings,
            icon: TrendingUp,
            gradient: 'from-indigo-500 to-indigo-600',
            bg: 'bg-indigo-50',
            text: 'text-indigo-600',
            href: '/agent/inventory',
        },
        {
            name: 'Enquiries',
            value: stats.totalEnquiries,
            icon: Users,
            gradient: 'from-emerald-500 to-green-600',
            bg: 'bg-emerald-50',
            text: 'text-emerald-600',
            href: '/agent/leads',
        },
        {
            name: 'Visits Scheduled',
            value: stats.visitsScheduled,
            icon: Calendar,
            gradient: 'from-violet-500 to-purple-600',
            bg: 'bg-violet-50',
            text: 'text-violet-600',
            href: '/agent/appointments',
        },
    ];

    const quickActions = [
        { label: 'Submit Lead', href: '/agent/deals', icon: Handshake, desc: 'Submit a buyer lead' },
        { label: 'Add Listing', href: '/agent/inventory', icon: Building2, desc: 'Post a new property' },
        { label: 'View Leads', href: '/agent/leads', icon: Users, desc: 'Check enquiries' },
        { label: 'Appointments', href: '/agent/appointments', icon: Calendar, desc: 'Manage visits' },
        { label: 'Upgrade Plan', href: '/agent/subscription', icon: TrendingUp, desc: 'Get more features' },
    ];

    return (
        <div className="space-y-6 max-w-6xl">

            {/* Welcome Banner */}
            <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${PLAN_GRADIENTS[plan] ?? PLAN_GRADIENTS.FREE} p-6 text-white shadow-lg`}>
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
                    <div className="absolute -bottom-10 -left-5 w-40 h-40 rounded-full bg-black/10 blur-2xl" />
                </div>
                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <p className="text-white/70 text-sm font-medium">{greeting}</p>
                        <h1 className="text-2xl font-bold mt-0.5">{firstName}!</h1>
                        <p className="text-white/70 text-sm mt-1">
                            You&apos;re on the <span className="text-white font-semibold">{PLAN_LABELS[plan] ?? plan}</span> plan
                        </p>
                    </div>
                    <Link
                        href="/agent/subscription"
                        className="inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all border border-white/20 self-start sm:self-auto"
                    >
                        {plan === 'ADVANCE_PRO' ? 'View Plan' : 'Upgrade Plan'}
                        <ArrowRight size={14} />
                    </Link>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((card) => (
                    <Link
                        key={card.name}
                        href={card.href}
                        className="group bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md hover:border-slate-200 transition-all"
                    >
                        <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center mb-3`}>
                            <card.icon className={`h-5 w-5 ${card.text}`} />
                        </div>
                        <p className="text-sm font-medium text-slate-500">{card.name}</p>
                        <p className="text-2xl font-bold text-slate-900 mt-0.5">
                            {loading ? (
                                <span className="inline-block w-8 h-6 bg-slate-100 rounded animate-pulse" />
                            ) : (
                                card.value
                            )}
                        </p>
                        <p className={`text-xs font-medium mt-1 ${card.text} flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
                            View details <ArrowRight size={10} />
                        </p>
                    </Link>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Quick Actions */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-900 mb-4">Quick Actions</h2>
                    <div className="space-y-2">
                        {quickActions.map((action) => (
                            <Link
                                key={action.label}
                                href={action.href}
                                className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group"
                            >
                                <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-blue-50 flex items-center justify-center flex-shrink-0 transition-colors">
                                    <action.icon size={15} className="text-slate-500 group-hover:text-blue-600 transition-colors" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-slate-800">{action.label}</p>
                                    <p className="text-xs text-slate-400">{action.desc}</p>
                                </div>
                                <ArrowRight size={14} className="text-slate-300 group-hover:text-slate-500 ml-auto flex-shrink-0 transition-colors" />
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Coordinator Card */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-900 mb-4">Your Coordinator</h2>
                    {agentInfo?.coordinator ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                                    {agentInfo.coordinator.name?.[0]?.toUpperCase() ?? 'C'}
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-900">{agentInfo.coordinator.name}</p>
                                    <p className="text-xs text-slate-400">Realty Pandit</p>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {agentInfo.coordinator.phone && (
                                    <a
                                        href={`tel:${agentInfo.coordinator.phone}`}
                                        className="flex items-center gap-2.5 text-sm text-slate-600 hover:text-blue-600 transition-colors"
                                    >
                                        <Phone size={14} className="text-slate-400 flex-shrink-0" />
                                        {agentInfo.coordinator.phone}
                                    </a>
                                )}
                                {agentInfo.coordinator.email && (
                                    <a
                                        href={`mailto:${agentInfo.coordinator.email}`}
                                        className="flex items-center gap-2.5 text-sm text-slate-600 hover:text-blue-600 transition-colors"
                                    >
                                        <Mail size={14} className="text-slate-400 flex-shrink-0" />
                                        {agentInfo.coordinator.email}
                                    </a>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-6 text-center">
                            <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center mb-3">
                                <User size={20} className="text-slate-300" />
                            </div>
                            <p className="text-sm text-slate-400">No coordinator assigned yet</p>
                        </div>
                    )}
                </div>

                {/* Account Security */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold text-slate-900">Account Security</h2>
                        <div className={`p-1.5 rounded-lg ${agentInfo?.has_password ? 'bg-green-50' : 'bg-amber-50'}`}>
                            <ShieldCheck size={16} className={agentInfo?.has_password ? 'text-green-500' : 'text-amber-500'} />
                        </div>
                    </div>

                    {pwMessage && (
                        <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-sm text-green-700">
                            <ShieldCheck size={14} /> {pwMessage}
                        </div>
                    )}

                    {!showSetPassword ? (
                        <div>
                            <div className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-xl mb-4 ${agentInfo?.has_password ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                                <KeyRound size={13} />
                                {agentInfo?.has_password ? 'Password is set' : 'No password — OTP only'}
                            </div>
                            <p className="text-xs text-slate-400 mb-4">
                                {agentInfo?.has_password
                                    ? 'You can sign in with your password or WhatsApp OTP.'
                                    : 'Set a password to sign in without needing an OTP each time.'}
                            </p>
                            <button
                                type="button"
                                onClick={() => { setShowSetPassword(true); setPwError(''); setPwMessage(''); }}
                                className="w-full py-2 px-4 bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors"
                            >
                                {agentInfo?.has_password ? 'Change Password' : 'Set Password'}
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSetPassword} className="space-y-3">
                            {pwError && (
                                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-xs">{pwError}</div>
                            )}
                            {agentInfo?.has_password && (
                                <input
                                    type="password"
                                    placeholder="Current Password"
                                    required
                                    value={currentPassword}
                                    onChange={e => setCurrentPassword(e.target.value)}
                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                                />
                            )}
                            <input
                                type="password"
                                placeholder="New Password (min 6 chars)"
                                required
                                minLength={6}
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                            />
                            <input
                                type="password"
                                placeholder="Confirm Password"
                                required
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                            />
                            <div className="flex gap-2">
                                <button
                                    type="submit"
                                    disabled={pwLoading}
                                    className="flex-1 py-2 bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
                                >
                                    {pwLoading ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setShowSetPassword(false); setPwError(''); }}
                                    className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
