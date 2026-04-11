'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
    Handshake, Plus, Search, MapPin, IndianRupee, ChevronRight,
    Phone, Building2, X, Loader2, Sparkles,
} from 'lucide-react';
import api from '@/lib/api';
import { getMediaUrl } from '@/lib/api';

interface Deal {
    id: string;
    type: string;
    status: string;
    deal_scenario: string | null;
    customer_name: string | null;
    coordinator: { name: string; phone: string } | null;
    property: { type: string; location: string; price: number; image: string | null } | null;
    demand_location: string | null;
    demand_budget_min: number | null;
    demand_budget_max: number | null;
    created_at: string;
    updated_at: string;
}

interface MatchedProperty {
    id: string;
    type: string;
    location: string;
    price: number;
    match_score: number;
    media_urls?: string[];
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
    NEW: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'New' },
    MATCHED: { bg: 'bg-purple-50', text: 'text-purple-700', label: 'Matched' },
    VISIT_SCHEDULED: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Visit Scheduled' },
    VISITED: { bg: 'bg-cyan-50', text: 'text-cyan-700', label: 'Visited' },
    NEGOTIATION: { bg: 'bg-orange-50', text: 'text-orange-700', label: 'Negotiation' },
    CLOSED_WON: { bg: 'bg-green-50', text: 'text-green-700', label: 'Closed (Won)' },
    CLOSED_LOST: { bg: 'bg-red-50', text: 'text-red-700', label: 'Closed (Lost)' },
    ON_HOLD: { bg: 'bg-slate-50', text: 'text-slate-600', label: 'On Hold' },
};

const formatPrice = (price: number | null) => {
    if (!price) return '';
    if (price >= 10000000) return `${(price / 10000000).toFixed(1)}Cr`;
    if (price >= 100000) return `${(price / 100000).toFixed(1)}L`;
    return `${(price / 1000).toFixed(0)}K`;
};

export default function AgentDeals() {
    const [deals, setDeals] = useState<Deal[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitResult, setSubmitResult] = useState<{ message: string; matches: MatchedProperty[]; isError?: boolean } | null>(null);

    const [form, setForm] = useState({
        customer_name: '', customer_phone: '', type: 'BUY' as 'BUY' | 'RENT',
        demand_location: '', demand_budget_min: '', demand_budget_max: '',
        demand_property_type: '',
    });

    const token = typeof window !== 'undefined' ? localStorage.getItem('agent_token') : null;
    const headers = { Authorization: `Bearer ${token}` };

    const fetchDeals = () => {
        if (!token) { setLoading(false); return; }
        const params: any = {};
        if (statusFilter) params.status = statusFilter;
        api.get('/agent/deals', { headers, params })
            .then(res => setDeals(res.data.deals || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    };

    useEffect(() => { fetchDeals(); }, [statusFilter]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.customer_name) return;
        setSubmitting(true);
        setSubmitResult(null);
        try {
            const body: any = {
                customer_name: form.customer_name,
                type: form.type,
            };
            if (form.customer_phone) body.customer_phone = form.customer_phone;
            if (form.demand_location) body.demand_location = form.demand_location;
            if (form.demand_property_type) body.demand_property_type = form.demand_property_type;
            if (form.demand_budget_min) body.demand_budget_min = parseInt(form.demand_budget_min);
            if (form.demand_budget_max) body.demand_budget_max = parseInt(form.demand_budget_max);

            const res = await api.post('/agent/deals', body, { headers });
            setSubmitResult({ message: res.data.message, matches: res.data.matches || [] });
            setForm({ customer_name: '', customer_phone: '', type: 'BUY', demand_location: '', demand_budget_min: '', demand_budget_max: '', demand_property_type: '' });
            fetchDeals();
        } catch (err: any) {
            const msg = err.response?.data?.error || 'Failed to create deal';
            setSubmitResult({ message: msg, matches: [], isError: true });
        } finally {
            setSubmitting(false);
        }
    };

    const filtered = search
        ? deals.filter(d =>
            d.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
            d.demand_location?.toLowerCase().includes(search.toLowerCase()) ||
            d.property?.location?.toLowerCase().includes(search.toLowerCase()))
        : deals;

    const timeAgo = (dateStr: string) => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };

    return (
        <div className="space-y-6 max-w-6xl">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">My Deals</h1>
                    <p className="text-sm text-slate-500 mt-1">Submit buyer leads and track deal progress</p>
                </div>
                <button
                    onClick={() => { setShowForm(true); setSubmitResult(null); }}
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm"
                >
                    <Plus size={16} /> Submit Buyer Lead
                </button>
            </div>

            {/* Submit Lead Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !submitting && setShowForm(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-slate-100">
                            <h2 className="text-lg font-bold text-slate-900">Submit Buyer Lead</h2>
                            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600" disabled={submitting}>
                                <X size={20} />
                            </button>
                        </div>

                        {submitResult ? (
                            <div className="p-5 space-y-4">
                                <div className={`p-4 rounded-xl ${submitResult.isError ? 'bg-red-50 text-red-800 border border-red-200' : submitResult.matches.length > 0 ? 'bg-green-50 text-green-800' : 'bg-blue-50 text-blue-800'}`}>
                                    <div className="flex items-center gap-2 font-semibold">
                                        <Sparkles size={16} /> {submitResult.message}
                                    </div>
                                    {submitResult.isError && (
                                        <button
                                            type="button"
                                            onClick={() => setSubmitResult(null)}
                                            className="mt-3 w-full py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
                                        >
                                            Try Again
                                        </button>
                                    )}
                                </div>
                                {submitResult.matches.length > 0 && (
                                    <div>
                                        <p className="text-sm font-semibold text-slate-700 mb-3">Matching Properties Found:</p>
                                        <div className="space-y-3">
                                            {submitResult.matches.map((m, i) => (
                                                <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                        <Building2 size={18} className="text-blue-600" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-slate-900 truncate">{m.type} in {m.location}</p>
                                                        <p className="text-xs text-slate-500">{formatPrice(m.price)} &middot; {m.match_score}% match</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <button
                                    onClick={() => { setShowForm(false); setSubmitResult(null); }}
                                    className="w-full py-2.5 bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors"
                                >
                                    Done
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="p-5 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Customer Name *</label>
                                    <input
                                        type="text" required value={form.customer_name}
                                        onChange={e => setForm({ ...form, customer_name: e.target.value })}
                                        className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Enter customer name"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Customer Phone</label>
                                    <input
                                        type="tel" value={form.customer_phone}
                                        onChange={e => setForm({ ...form, customer_phone: e.target.value })}
                                        className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g. 9876543210"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Type *</label>
                                        <select
                                            value={form.type} onChange={e => setForm({ ...form, type: e.target.value as 'BUY' | 'RENT' })}
                                            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="BUY">Buy</option>
                                            <option value="RENT">Rent</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Property Type</label>
                                        <select
                                            value={form.demand_property_type}
                                            onChange={e => setForm({ ...form, demand_property_type: e.target.value })}
                                            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="">Any</option>
                                            <option value="flat">Flat</option>
                                            <option value="house">House</option>
                                            <option value="villa">Villa</option>
                                            <option value="plot">Plot</option>
                                            <option value="office">Office</option>
                                            <option value="shop">Shop</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Location</label>
                                    <input
                                        type="text" value={form.demand_location}
                                        onChange={e => setForm({ ...form, demand_location: e.target.value })}
                                        className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g. Noida Sector 150"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Min Budget</label>
                                        <input
                                            type="number" value={form.demand_budget_min}
                                            onChange={e => setForm({ ...form, demand_budget_min: e.target.value })}
                                            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            placeholder="e.g. 5000000"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Max Budget</label>
                                        <input
                                            type="number" value={form.demand_budget_max}
                                            onChange={e => setForm({ ...form, demand_budget_max: e.target.value })}
                                            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            placeholder="e.g. 10000000"
                                        />
                                    </div>
                                </div>
                                <button
                                    type="submit" disabled={submitting}
                                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {submitting ? <><Loader2 size={16} className="animate-spin" /> Creating Deal...</> : 'Submit Lead'}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                        type="text" value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Search by name or location..."
                    />
                </div>
                <select
                    value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="">All Status</option>
                    <option value="NEW">New</option>
                    <option value="MATCHED">Matched</option>
                    <option value="VISIT_SCHEDULED">Visit Scheduled</option>
                    <option value="VISITED">Visited</option>
                    <option value="NEGOTIATION">Negotiation</option>
                    <option value="CLOSED_WON">Closed (Won)</option>
                    <option value="CLOSED_LOST">Closed (Lost)</option>
                </select>
            </div>

            {/* Deals List */}
            {loading ? (
                <div className="text-center py-12 text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading deals...
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
                    <Handshake className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                    <h3 className="text-sm font-semibold text-slate-900">No deals yet</h3>
                    <p className="text-sm text-slate-500 mt-1 mb-4">Submit a buyer lead to create your first deal.</p>
                    <button
                        onClick={() => setShowForm(true)}
                        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
                    >
                        <Plus size={16} /> Submit Lead
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map(deal => {
                        const st = STATUS_STYLES[deal.status] || STATUS_STYLES.NEW;
                        return (
                            <Link
                                key={deal.id}
                                href={`/agent/deals/${deal.id}`}
                                className="block bg-white rounded-2xl border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all p-5"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="text-sm font-semibold text-slate-900">
                                                {deal.customer_name || 'Customer'}
                                            </h3>
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${st.bg} ${st.text}`}>
                                                {st.label}
                                            </span>
                                            <span className="text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
                                                {deal.type === 'SALE' || deal.type === 'BUY' ? 'Buy' : 'Rent'}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                                            {deal.demand_location && (
                                                <span className="flex items-center gap-1">
                                                    <MapPin size={12} /> {deal.demand_location}
                                                </span>
                                            )}
                                            {(deal.demand_budget_min || deal.demand_budget_max) && (
                                                <span className="flex items-center gap-1">
                                                    <IndianRupee size={12} />
                                                    {deal.demand_budget_min && deal.demand_budget_max
                                                        ? `${formatPrice(deal.demand_budget_min)} - ${formatPrice(deal.demand_budget_max)}`
                                                        : deal.demand_budget_max
                                                            ? `Up to ${formatPrice(deal.demand_budget_max)}`
                                                            : `${formatPrice(deal.demand_budget_min)}+`}
                                                </span>
                                            )}
                                        </div>

                                        {deal.property && (
                                            <div className="mt-2 flex items-center gap-2">
                                                <Building2 size={12} className="text-purple-500" />
                                                <span className="text-xs text-purple-700 font-medium">
                                                    {deal.property.type} in {deal.property.location}
                                                    {deal.property.price ? ` — ${formatPrice(deal.property.price)}` : ''}
                                                </span>
                                            </div>
                                        )}

                                        {deal.coordinator && (
                                            <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                                                <Phone size={11} />
                                                Coordinator: {deal.coordinator.name}
                                                {deal.coordinator.phone && ` (${deal.coordinator.phone})`}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                        <span className="text-xs text-slate-400">{timeAgo(deal.updated_at)}</span>
                                        <ChevronRight size={16} className="text-slate-300 mt-1" />
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
