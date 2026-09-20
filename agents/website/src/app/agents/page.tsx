'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, MapPin, Building2, Crown, Zap, Star, Users, ChevronRight, Filter } from 'lucide-react';
import api from '@/lib/api';

type PlanKey = 'FREE' | 'PRO' | 'ADVANCE_PRO';
type CategoryKey = 'INDIVIDUAL' | 'COMPANY';

interface Agent {
    id: string;
    name: string;
    business_name?: string;
    company_name?: string;
    city?: string;
    partner_category: CategoryKey;
    package_type: PlanKey;
    verified: boolean;
    priority_score: number;
}

interface Pagination {
    total: number;
    page: number;
    pages: number;
}

const PLAN_META: Record<PlanKey, { label: string; icon: typeof Star; color: string; badge: string }> = {
    FREE: { label: 'Free', icon: Star, color: 'text-slate-500', badge: 'bg-slate-100 text-slate-500' },
    PRO: { label: 'Pro', icon: Zap, color: 'text-blue-500', badge: 'bg-blue-50 text-blue-600' },
    ADVANCE_PRO: { label: 'Advance Pro', icon: Crown, color: 'text-amber-500', badge: 'bg-amber-50 text-amber-600' },
};

const POPULAR_CITIES = ['Delhi', 'Mumbai', 'Bangalore', 'Hyderabad', 'Pune', 'Gurugram', 'Noida'];

function AgentCard({ agent }: { agent: Agent }) {
    const plan = PLAN_META[agent.package_type] ?? PLAN_META.FREE;
    const PlanIcon = plan.icon;
    const displayName = agent.business_name || agent.company_name || agent.name;
    const initials = agent.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    return (
        <Link
            href={`/agents/${agent.id}`}
            className="group bg-white rounded-2xl border border-slate-100 hover:border-blue-200 hover:shadow-lg p-5 flex flex-col gap-4 transition-all duration-200"
        >
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
                        {initials}
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-900 text-sm leading-tight">{displayName}</h3>
                        {displayName !== agent.name && (
                            <p className="text-xs text-slate-400 mt-0.5">{agent.name}</p>
                        )}
                    </div>
                </div>
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${plan.badge}`}>
                    <PlanIcon size={11} />
                    {plan.label}
                </span>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-500">
                {agent.city && (
                    <span className="flex items-center gap-1">
                        <MapPin size={12} />
                        {agent.city}
                    </span>
                )}
                <span className="flex items-center gap-1">
                    <Users size={12} />
                    {agent.partner_category === 'COMPANY' ? 'Agency' : 'Individual'}
                </span>
                {agent.verified && (
                    <span className="flex items-center gap-1 text-green-500">
                        ✓ Verified
                    </span>
                )}
            </div>

            <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">View profile</span>
                <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
            </div>
        </Link>
    );
}

export default function AgentsPage() {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, pages: 1 });
    const [loading, setLoading] = useState(true);
    const [city, setCity] = useState('');
    const [category, setCategory] = useState('');
    const [plan, setPlan] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);

    useEffect(() => {
        queueMicrotask(() => setLoading(true));
        const params: Record<string, string> = { page: String(page), limit: '18' };
        if (city) params.city = city;
        if (category) params.category = category;
        if (plan) params.plan = plan;

        api.get('/public/agents', { params })
            .then(res => {
                setAgents(res.data.agents);
                setPagination(res.data.pagination);
            })
            .catch(() => setAgents([]))
            .finally(() => setLoading(false));
    }, [city, category, plan, page]);

    const filteredAgents = search
        ? agents.filter(a =>
            a.name.toLowerCase().includes(search.toLowerCase()) ||
            (a.business_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
            (a.city ?? '').toLowerCase().includes(search.toLowerCase())
          )
        : agents;

    const handleCityFilter = (c: string) => {
        setCity(prev => prev === c ? '' : c);
        setPage(1);
    };

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Hero */}
            <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white py-14 px-4">
                <div className="max-w-5xl mx-auto text-center">
                    <h1 className="text-3xl sm:text-4xl font-bold">Find a Real Estate Agent</h1>
                    <p className="mt-3 text-slate-400 text-base max-w-xl mx-auto">
                        Connect with verified partner agents across India to buy, sell, or rent properties.
                    </p>
                    {/* Search bar */}
                    <div className="mt-8 max-w-xl mx-auto relative">
                        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by name, agency, or city..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-11 pr-4 py-3.5 bg-white/10 border border-white/20 text-white placeholder-slate-400 rounded-2xl focus:outline-none focus:bg-white/20 focus:border-white/40 transition-all text-sm"
                        />
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4 py-10">
                {/* Filters */}
                <div className="flex flex-wrap gap-3 mb-8 items-center">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Filter size={14} />
                        <span className="font-medium">Filter:</span>
                    </div>

                    {/* City pills */}
                    <div className="flex flex-wrap gap-2">
                        {POPULAR_CITIES.map(c => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => handleCityFilter(c)}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                                    city === c
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300'
                                }`}
                            >
                                {c}
                            </button>
                        ))}
                    </div>

                    {/* Category */}
                    <select
                        value={category}
                        onChange={e => { setCategory(e.target.value); setPage(1); }}
                        className="px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-slate-200 text-slate-600 focus:outline-none focus:border-blue-300"
                    >
                        <option value="">All types</option>
                        <option value="INDIVIDUAL">Individual</option>
                        <option value="COMPANY">Agency</option>
                    </select>

                    {/* Plan */}
                    <select
                        value={plan}
                        onChange={e => { setPlan(e.target.value); setPage(1); }}
                        className="px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-slate-200 text-slate-600 focus:outline-none focus:border-blue-300"
                    >
                        <option value="">All plans</option>
                        <option value="PRO">Pro</option>
                        <option value="ADVANCE_PRO">Advance Pro</option>
                    </select>

                    {(city || category || plan) && (
                        <button
                            type="button"
                            onClick={() => { setCity(''); setCategory(''); setPlan(''); setPage(1); }}
                            className="px-3 py-1.5 rounded-full text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
                        >
                            Clear filters
                        </button>
                    )}
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between mb-6">
                    <p className="text-sm text-slate-500">
                        {loading ? 'Loading...' : `${pagination.total} agent${pagination.total !== 1 ? 's' : ''} found`}
                    </p>
                    {pagination.pages > 1 && (
                        <p className="text-xs text-slate-400">Page {pagination.page} of {pagination.pages}</p>
                    )}
                </div>

                {/* Grid */}
                {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 h-36 animate-pulse">
                                <div className="flex gap-3 mb-3">
                                    <div className="w-12 h-12 rounded-2xl bg-slate-100" />
                                    <div className="space-y-2 flex-1">
                                        <div className="h-3 bg-slate-100 rounded w-3/4" />
                                        <div className="h-2.5 bg-slate-100 rounded w-1/2" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : filteredAgents.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                            <Building2 size={24} className="text-slate-300" />
                        </div>
                        <p className="text-slate-500 font-medium">No agents found</p>
                        <p className="text-slate-400 text-sm mt-1">Try adjusting your filters</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredAgents.map(agent => (
                            <AgentCard key={agent.id} agent={agent} />
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {pagination.pages > 1 && (
                    <div className="flex justify-center gap-2 mt-10">
                        <button
                            type="button"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                            Previous
                        </button>
                        {[...Array(Math.min(5, pagination.pages))].map((_, i) => {
                            const p = i + 1;
                            return (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => setPage(p)}
                                    className={`w-10 h-10 rounded-xl text-sm font-medium transition-all ${
                                        page === p
                                            ? 'bg-blue-600 text-white'
                                            : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                    {p}
                                </button>
                            );
                        })}
                        <button
                            type="button"
                            onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                            disabled={page === pagination.pages}
                            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
