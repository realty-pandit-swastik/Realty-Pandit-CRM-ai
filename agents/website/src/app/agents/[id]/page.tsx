'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Crown, Zap, Star, Users, Building2, Phone, Mail, ArrowLeft, ChevronRight, BadgeCheck } from 'lucide-react';
import api from '@/lib/api';

type PlanKey = 'FREE' | 'PRO' | 'ADVANCE_PRO';

interface AgentProfile {
    id: string;
    name: string;
    business_name?: string;
    company_name?: string;
    city?: string;
    partner_category: 'INDIVIDUAL' | 'COMPANY';
    package_type: PlanKey;
    verified: boolean;
    priority_score: number;
    listing_count: number;
    created_at: string;
}

const PLAN_META: Record<PlanKey, { label: string; icon: typeof Star; gradient: string }> = {
    FREE: { label: 'Free', icon: Star, gradient: 'from-slate-400 to-slate-500' },
    PRO: { label: 'Pro', icon: Zap, gradient: 'from-blue-500 to-indigo-600' },
    ADVANCE_PRO: { label: 'Advance Pro', icon: Crown, gradient: 'from-amber-500 to-orange-500' },
};

interface ContactFormData {
    name: string;
    phone: string;
    message: string;
}

export default function AgentProfilePage() {
    const params = useParams<{ id: string }>();
    const [agent, setAgent] = useState<AgentProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [form, setForm] = useState<ContactFormData>({ name: '', phone: '', message: '' });
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [sendError, setSendError] = useState('');

    useEffect(() => {
        if (!params?.id) return;
        api.get(`/public/agents/${params.id}`)
            .then(res => setAgent(res.data.agent))
            .catch(err => {
                if (err.response?.status === 404) setNotFound(true);
            })
            .finally(() => setLoading(false));
    }, [params?.id]);

    const handleContact = async (e: React.FormEvent) => {
        e.preventDefault();
        setSending(true);
        setSendError('');
        try {
            // Use general contact endpoint — attribute to agent
            await api.post('/public/contact', {
                name: form.name,
                phone: form.phone,
                message: `[Agent enquiry for ${agent?.name}] ${form.message}`,
                source: 'agent_profile',
            });
            setSent(true);
        } catch {
            setSendError('Failed to send message. Please try again.');
        } finally {
            setSending(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
        );
    }

    if (notFound || !agent) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 text-center px-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                    <Users size={24} className="text-slate-300" />
                </div>
                <h1 className="text-xl font-bold text-slate-800">Agent not found</h1>
                <p className="text-slate-500 text-sm">This agent profile doesn&apos;t exist or is no longer active.</p>
                <Link href="/agents" className="inline-flex items-center gap-2 text-blue-600 text-sm font-medium hover:underline">
                    <ArrowLeft size={14} /> Browse all agents
                </Link>
            </div>
        );
    }

    const plan = PLAN_META[agent.package_type] ?? PLAN_META.FREE;
    const PlanIcon = plan.icon;
    const displayName = agent.business_name || agent.company_name || agent.name;
    const initials = agent.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const memberSince = new Date(agent.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Back nav */}
            <div className="bg-white border-b border-slate-100">
                <div className="max-w-5xl mx-auto px-4 py-3">
                    <Link href="/agents" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors">
                        <ArrowLeft size={14} />
                        All Agents
                        <ChevronRight size={12} className="text-slate-300" />
                        <span className="text-slate-800 font-medium">{displayName}</span>
                    </Link>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Profile Card */}
                    <div className="lg:col-span-2 space-y-5">
                        {/* Main profile */}
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                            {/* Header gradient */}
                            <div className={`h-20 bg-gradient-to-r ${plan.gradient}`} />
                            <div className="px-6 pb-6">
                                {/* Avatar */}
                                <div className="-mt-10 mb-4 flex items-end justify-between">
                                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-600 border-4 border-white flex items-center justify-center text-white font-bold text-2xl shadow-lg">
                                        {initials}
                                    </div>
                                    {agent.verified && (
                                        <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                                            <BadgeCheck size={13} />
                                            Verified Agent
                                        </div>
                                    )}
                                </div>

                                {/* Name & plan */}
                                <div className="flex items-start gap-3 flex-wrap">
                                    <div>
                                        <h1 className="text-xl font-bold text-slate-900">{displayName}</h1>
                                        {displayName !== agent.name && (
                                            <p className="text-sm text-slate-500 mt-0.5">{agent.name}</p>
                                        )}
                                    </div>
                                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-gradient-to-r ${plan.gradient} text-white mt-0.5`}>
                                        <PlanIcon size={11} />
                                        {plan.label}
                                    </span>
                                </div>

                                {/* Meta */}
                                <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-500">
                                    {agent.city && (
                                        <span className="flex items-center gap-1.5">
                                            <MapPin size={14} className="text-slate-400" />
                                            {agent.city}
                                        </span>
                                    )}
                                    <span className="flex items-center gap-1.5">
                                        <Users size={14} className="text-slate-400" />
                                        {agent.partner_category === 'COMPANY' ? 'Real Estate Agency' : 'Individual Agent'}
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <Building2 size={14} className="text-slate-400" />
                                        {agent.listing_count} active listing{agent.listing_count !== 1 ? 's' : ''}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-4">
                            {[
                                { label: 'Active Listings', value: agent.listing_count, icon: Building2 },
                                { label: 'Member Since', value: memberSince, icon: Star },
                                { label: 'Agent Type', value: agent.partner_category === 'COMPANY' ? 'Agency' : 'Individual', icon: Users },
                            ].map(stat => (
                                <div key={stat.label} className="bg-white rounded-2xl border border-slate-100 p-4 text-center">
                                    <stat.icon size={18} className="text-blue-400 mx-auto mb-2" />
                                    <p className="text-sm font-bold text-slate-900">{stat.value}</p>
                                    <p className="text-xs text-slate-400 mt-0.5">{stat.label}</p>
                                </div>
                            ))}
                        </div>

                        {/* What this agent offers */}
                        <div className="bg-white rounded-2xl border border-slate-100 p-6">
                            <h2 className="text-sm font-semibold text-slate-800 mb-3">Services</h2>
                            <div className="grid grid-cols-2 gap-3">
                                {['Property Listings', 'Buyer Assistance', 'Property Valuation', 'Site Visits'].map(s => (
                                    <div key={s} className="flex items-center gap-2 text-sm text-slate-600">
                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                                        {s}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Contact Form */}
                    <div className="space-y-4">
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sticky top-6">
                            <h2 className="text-base font-bold text-slate-900 mb-1">Contact this Agent</h2>
                            <p className="text-xs text-slate-400 mb-5">Send a message and {agent.name.split(' ')[0]} will get back to you.</p>

                            {sent ? (
                                <div className="text-center py-6">
                                    <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3">
                                        <BadgeCheck size={22} className="text-green-500" />
                                    </div>
                                    <p className="font-semibold text-slate-800">Message sent!</p>
                                    <p className="text-xs text-slate-400 mt-1">The agent will contact you shortly.</p>
                                </div>
                            ) : (
                                <form onSubmit={handleContact} className="space-y-3">
                                    {sendError && (
                                        <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-xl">{sendError}</div>
                                    )}
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">Your Name</label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="Full name"
                                            value={form.name}
                                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">Phone Number</label>
                                        <input
                                            type="tel"
                                            required
                                            placeholder="+91 98765 43210"
                                            value={form.phone}
                                            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                                            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">Message</label>
                                        <textarea
                                            required
                                            rows={3}
                                            placeholder="I'm looking for..."
                                            value={form.message}
                                            onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                                            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all resize-none"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={sending}
                                        className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 transition-all shadow-md hover:shadow-lg"
                                    >
                                        {sending ? (
                                            <>
                                                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                </svg>
                                                Sending...
                                            </>
                                        ) : (
                                            <>
                                                <Phone size={14} />
                                                Send Message
                                            </>
                                        )}
                                    </button>
                                </form>
                            )}

                            <p className="mt-4 text-center text-xs text-slate-400">
                                Want to list properties?{' '}
                                <Link href="/agent/login" className="text-blue-500 hover:underline">
                                    Join as an agent
                                </Link>
                            </p>
                        </div>

                        {/* Join CTA */}
                        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 text-white">
                            <h3 className="font-bold text-sm">Are you an agent?</h3>
                            <p className="text-xs text-blue-200 mt-1 mb-3">Join Realty Pandit&apos;s partner network and grow your business.</p>
                            <Link
                                href="/agent/login"
                                className="inline-flex items-center gap-1.5 bg-white text-blue-700 text-xs font-bold px-4 py-2 rounded-xl hover:bg-blue-50 transition-colors"
                            >
                                Get started <ChevronRight size={12} />
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
