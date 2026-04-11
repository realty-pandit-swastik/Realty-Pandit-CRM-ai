'use client';

import { useEffect, useState } from 'react';
import { Check, X, Zap, Crown, Star, Phone, ArrowUpRight, Clock } from 'lucide-react';

type PlanKey = 'FREE' | 'PRO' | 'ADVANCE_PRO';

interface AgentInfo {
    name: string;
    phone_number: string;
    package_type: PlanKey;
    subscription_end?: string;
    coordinator?: { phone?: string; name?: string };
}

const PLANS: {
    key: PlanKey;
    name: string;
    price: string;
    period: string;
    tagline: string;
    icon: typeof Zap;
    gradient: string;
    badge?: string;
    features: string[];
    limitations: string[];
}[] = [
    {
        key: 'FREE',
        name: 'Free',
        price: '₹0',
        period: 'forever',
        tagline: 'Get started at no cost',
        icon: Star,
        gradient: 'from-slate-400 to-slate-500',
        features: [
            '5 active property listings',
            'Basic lead notifications',
            'WhatsApp OTP login',
            'Dashboard & inventory',
        ],
        limitations: [
            'Phone numbers masked on leads',
            'No priority in search results',
            'No direct buyer contact',
        ],
    },
    {
        key: 'PRO',
        name: 'Pro',
        price: '₹1,999',
        period: 'per month',
        tagline: 'For growing agents',
        icon: Zap,
        gradient: 'from-blue-500 to-indigo-600',
        badge: 'Most Popular',
        features: [
            '25 active property listings',
            'Full buyer contact details',
            'Priority in search results',
            'Direct WhatsApp chat with buyers',
            'Advanced analytics dashboard',
            'Priority support',
        ],
        limitations: [],
    },
    {
        key: 'ADVANCE_PRO',
        name: 'Advance Pro',
        price: '₹4,999',
        period: 'per month',
        tagline: 'For established agencies',
        icon: Crown,
        gradient: 'from-amber-500 to-orange-500',
        badge: 'Best Value',
        features: [
            '100 active property listings',
            'Top priority in all search results',
            'Featured listings with photo highlights',
            'Dedicated account manager',
            'Team sub-agent management',
            'Commission tracking dashboard',
            'Custom branding on listings',
        ],
        limitations: [],
    },
];

const PLAN_ORDER: PlanKey[] = ['FREE', 'PRO', 'ADVANCE_PRO'];

export default function AgentSubscription() {
    const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);

    useEffect(() => {
        try {
            const info = localStorage.getItem('agent_info');
            if (info) setAgentInfo(JSON.parse(info));
        } catch {}
    }, []);

    const currentPlan = agentInfo?.package_type ?? 'FREE';
    const coordinatorPhone = agentInfo?.coordinator?.phone;

    const getUpgradeHref = (planKey: PlanKey) => {
        const message = encodeURIComponent(
            `Hi, I want to upgrade my Realty Pandit account to the ${PLANS.find(p => p.key === planKey)?.name} plan.\n\nMy registered phone: ${agentInfo?.phone_number ?? ''}`
        );
        return `https://wa.me/${coordinatorPhone?.replace(/\D/g, '') ?? '919999999999'}?text=${message}`;
    };

    const subscriptionEndDate = agentInfo?.subscription_end
        ? new Date(agentInfo.subscription_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
        : null;

    const currentPlanIndex = PLAN_ORDER.indexOf(currentPlan);

    return (
        <div className="max-w-5xl space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Subscription Plans</h1>
                <p className="mt-1 text-sm text-slate-500">Unlock more listings, leads, and features as you grow.</p>
            </div>

            {/* Current Plan Banner */}
            <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${PLANS.find(p => p.key === currentPlan)?.gradient ?? 'from-slate-400 to-slate-500'} p-5 text-white shadow-md`}>
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-xl" />
                </div>
                <div className="relative z-10 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        {(() => { const Icon = PLANS.find(p => p.key === currentPlan)?.icon ?? Star; return <Icon size={22} />; })()}
                        <div>
                            <p className="text-white/80 text-xs font-medium uppercase tracking-wider">Current Plan</p>
                            <p className="text-lg font-bold">{PLANS.find(p => p.key === currentPlan)?.name}</p>
                        </div>
                    </div>
                    {subscriptionEndDate && (
                        <div className="flex items-center gap-1.5 bg-white/20 px-3 py-1.5 rounded-xl text-sm">
                            <Clock size={14} />
                            <span>Renews {subscriptionEndDate}</span>
                        </div>
                    )}
                    {currentPlan !== 'ADVANCE_PRO' && coordinatorPhone && (
                        <a
                            href={getUpgradeHref('ADVANCE_PRO')}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 bg-white text-slate-900 text-sm font-semibold px-4 py-2 rounded-xl hover:bg-white/90 transition-colors"
                        >
                            Upgrade Now <ArrowUpRight size={14} />
                        </a>
                    )}
                </div>
            </div>

            {/* Plans Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {PLANS.map((plan) => {
                    const Icon = plan.icon;
                    const isCurrent = plan.key === currentPlan;
                    const isUpgrade = PLAN_ORDER.indexOf(plan.key) > currentPlanIndex;
                    const isDowngrade = PLAN_ORDER.indexOf(plan.key) < currentPlanIndex;

                    return (
                        <div
                            key={plan.key}
                            className={`relative bg-white rounded-2xl border-2 p-6 shadow-sm flex flex-col transition-all ${
                                isCurrent
                                    ? 'border-blue-500 shadow-md shadow-blue-100'
                                    : plan.badge
                                    ? 'border-slate-200 hover:border-blue-200 hover:shadow-md'
                                    : 'border-slate-100 hover:border-slate-200 hover:shadow-md'
                            }`}
                        >
                            {/* Badge */}
                            {plan.badge && !isCurrent && (
                                <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold text-white bg-gradient-to-r ${plan.gradient} shadow-sm whitespace-nowrap`}>
                                    {plan.badge}
                                </div>
                            )}
                            {isCurrent && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold text-white bg-green-500 shadow-sm whitespace-nowrap">
                                    Your Plan
                                </div>
                            )}

                            {/* Plan header */}
                            <div className="mb-5">
                                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center text-white mb-3`}>
                                    <Icon size={18} />
                                </div>
                                <h2 className="text-lg font-bold text-slate-900">{plan.name}</h2>
                                <p className="text-xs text-slate-400 mt-0.5">{plan.tagline}</p>
                                <div className="mt-3 flex items-end gap-1">
                                    <span className="text-3xl font-extrabold text-slate-900">{plan.price}</span>
                                    <span className="text-sm text-slate-400 mb-1">/{plan.period}</span>
                                </div>
                            </div>

                            {/* Features */}
                            <ul className="space-y-2.5 flex-1 mb-5">
                                {plan.features.map((f) => (
                                    <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                                        <Check size={15} className="text-green-500 flex-shrink-0 mt-0.5" />
                                        {f}
                                    </li>
                                ))}
                                {plan.limitations.map((l) => (
                                    <li key={l} className="flex items-start gap-2 text-sm text-slate-400">
                                        <X size={15} className="text-slate-300 flex-shrink-0 mt-0.5" />
                                        {l}
                                    </li>
                                ))}
                            </ul>

                            {/* CTA */}
                            {isCurrent ? (
                                <div className="w-full py-2.5 text-center text-sm font-semibold text-blue-600 bg-blue-50 rounded-xl">
                                    Active Plan
                                </div>
                            ) : isUpgrade && coordinatorPhone ? (
                                <a
                                    href={getUpgradeHref(plan.key)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`w-full py-2.5 text-center text-sm font-semibold text-white rounded-xl bg-gradient-to-r ${plan.gradient} hover:opacity-90 transition-opacity flex items-center justify-center gap-2`}
                                >
                                    <Phone size={14} />
                                    Upgrade via WhatsApp
                                </a>
                            ) : isUpgrade ? (
                                <div className="w-full py-2.5 text-center text-sm text-slate-400 bg-slate-50 rounded-xl">
                                    Contact support to upgrade
                                </div>
                            ) : isDowngrade ? (
                                <div className="w-full py-2.5 text-center text-sm text-slate-400 bg-slate-50 rounded-xl">
                                    Lower tier
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>

            {/* Feature Comparison Note */}
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">All plans include</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {['WhatsApp OTP login', 'Property inventory management', 'Lead notifications', 'Appointment scheduling'].map(f => (
                        <div key={f} className="flex items-center gap-2 text-xs text-slate-500">
                            <Check size={13} className="text-green-400 flex-shrink-0" />
                            {f}
                        </div>
                    ))}
                </div>
            </div>

            {/* Support Note */}
            {coordinatorPhone && (
                <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl p-4">
                    <Phone size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold text-slate-800">Need help choosing a plan?</p>
                        <p className="text-xs text-slate-500 mt-0.5">Your coordinator is available on WhatsApp to help you upgrade or answer questions.</p>
                        <a
                            href={`https://wa.me/${coordinatorPhone.replace(/\D/g, '')}?text=${encodeURIComponent('Hi, I have a question about my Realty Pandit subscription.')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-blue-600 hover:text-blue-800"
                        >
                            Chat with coordinator <ArrowUpRight size={12} />
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}
