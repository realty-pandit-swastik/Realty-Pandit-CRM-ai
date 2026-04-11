'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft, Phone, MapPin, IndianRupee, Building2, Clock,
    MessageSquare, Send, Loader2, User, ChevronDown, ChevronUp, Search,
} from 'lucide-react';
import api from '@/lib/api';

interface DealDetail {
    id: string;
    type: string;
    status: string;
    deal_scenario: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    coordinator: { name: string; phone: string } | null;
    property: { id: string; type: string; location: string; price: number; media_urls: string[] } | null;
    demand_location: string | null;
    demand_budget_min: number | null;
    demand_budget_max: number | null;
    demand_property_type: string | null;
    logs: { action: string; details: any; created_at: string }[];
    queries: { id: string; subject: string; message: string; status: string; answer: string | null; raised_by_type: string; created_at: string }[];
    created_at: string;
    updated_at: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string; border: string }> = {
    NEW: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'New', border: 'border-blue-200' },
    MATCHED: { bg: 'bg-purple-50', text: 'text-purple-700', label: 'Matched', border: 'border-purple-200' },
    VISIT_SCHEDULED: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Visit Scheduled', border: 'border-amber-200' },
    VISITED: { bg: 'bg-cyan-50', text: 'text-cyan-700', label: 'Visited', border: 'border-cyan-200' },
    NEGOTIATION: { bg: 'bg-orange-50', text: 'text-orange-700', label: 'Negotiation', border: 'border-orange-200' },
    CLOSED_WON: { bg: 'bg-green-50', text: 'text-green-700', label: 'Closed (Won)', border: 'border-green-200' },
    CLOSED_LOST: { bg: 'bg-red-50', text: 'text-red-700', label: 'Closed (Lost)', border: 'border-red-200' },
    ON_HOLD: { bg: 'bg-slate-50', text: 'text-slate-600', label: 'On Hold', border: 'border-slate-200' },
};

const LOG_LABELS: Record<string, string> = {
    CREATED: 'Deal Created',
    STATUS_CHANGED: 'Status Changed',
    EXECUTIVE_ASSIGNED: 'Coordinator Assigned',
    EXECUTIVE_CHANGED: 'Coordinator Changed',
    APPOINTMENT_LINKED: 'Appointment Linked',
    APPOINTMENT_COMPLETED: 'Appointment Completed',
    NEGOTIATION_UPDATE: 'Negotiation Update',
    PARTY_NOTIFIED: 'Party Notified',
    DUPLICATE_BLOCKED: 'Duplicate Blocked',
    CLOSED: 'Deal Closed',
    REOPENED: 'Deal Reopened',
    NOTE_ADDED: 'Note Added',
    FOLLOWUP_SENT: 'Follow-up Sent',
};

const formatPrice = (price: number | null) => {
    if (!price) return '';
    if (price >= 10000000) return `${(price / 10000000).toFixed(1)} Cr`;
    if (price >= 100000) return `${(price / 100000).toFixed(1)} Lakh`;
    return `${(price / 1000).toFixed(0)}K`;
};

const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
};

export default function AgentDealDetail() {
    const params = useParams();
    const router = useRouter();
    const dealId = params.id as string;

    const [deal, setDeal] = useState<DealDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'details' | 'timeline' | 'queries'>('details');

    // Query form
    const [showQueryForm, setShowQueryForm] = useState(false);
    const [querySubject, setQuerySubject] = useState('');
    const [queryMessage, setQueryMessage] = useState('');
    const [querySubmitting, setQuerySubmitting] = useState(false);

    const token = typeof window !== 'undefined' ? localStorage.getItem('agent_token') : null;
    const headers = { Authorization: `Bearer ${token}` };

    const fetchDeal = () => {
        if (!token || !dealId) return;
        setLoading(true);
        api.get(`/agent/deals/${dealId}`, { headers })
            .then(res => setDeal(res.data))
            .catch(err => setError(err.response?.data?.error || 'Failed to load deal'))
            .finally(() => setLoading(false));
    };

    useEffect(() => { fetchDeal(); }, [dealId]);

    const handleSubmitQuery = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!querySubject || !queryMessage) return;
        setQuerySubmitting(true);
        try {
            await api.post(`/agent/deals/${dealId}/query`, { subject: querySubject, message: queryMessage }, { headers });
            setQuerySubject('');
            setQueryMessage('');
            setShowQueryForm(false);
            fetchDeal();
        } catch {
            // silent fail
        } finally {
            setQuerySubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
        );
    }

    if (error || !deal) {
        return (
            <div className="text-center py-20">
                <p className="text-red-600 font-medium">{error || 'Deal not found'}</p>
                <Link href="/agent/deals" className="text-sm text-blue-600 hover:underline mt-2 inline-block">Back to deals</Link>
            </div>
        );
    }

    const st = STATUS_STYLES[deal.status] || STATUS_STYLES.NEW;

    return (
        <div className="max-w-4xl space-y-6">
            {/* Back button */}
            <button onClick={() => router.push('/agent/deals')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors">
                <ArrowLeft size={16} /> Back to Deals
            </button>

            {/* Header Card */}
            <div className={`bg-white rounded-2xl border ${st.border} p-6`}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-xl font-bold text-slate-900">{deal.customer_name || 'Customer'}</h1>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${st.bg} ${st.text}`}>
                                {st.label}
                            </span>
                            <span className="text-xs text-slate-400 bg-slate-50 px-2 py-1 rounded-full">
                                {deal.type === 'SALE' || deal.type === 'BUY' ? 'Buy' : 'Rent'}
                            </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-slate-500">
                            {deal.demand_location && (
                                <span className="flex items-center gap-1.5">
                                    <MapPin size={14} className="text-slate-400" /> {deal.demand_location}
                                </span>
                            )}
                            {(deal.demand_budget_min || deal.demand_budget_max) && (
                                <span className="flex items-center gap-1.5">
                                    <IndianRupee size={14} className="text-slate-400" />
                                    {deal.demand_budget_min && deal.demand_budget_max
                                        ? `${formatPrice(deal.demand_budget_min)} - ${formatPrice(deal.demand_budget_max)}`
                                        : deal.demand_budget_max
                                            ? `Up to ${formatPrice(deal.demand_budget_max)}`
                                            : `${formatPrice(deal.demand_budget_min)}+`}
                                </span>
                            )}
                            {deal.demand_property_type && (
                                <span className="flex items-center gap-1.5">
                                    <Building2 size={14} className="text-slate-400" /> {deal.demand_property_type}
                                </span>
                            )}
                        </div>

                        {deal.customer_phone && (
                            <a href={`tel:${deal.customer_phone}`} className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 mt-2">
                                <Phone size={14} /> {deal.customer_phone}
                            </a>
                        )}
                    </div>

                    <div className="text-xs text-slate-400 flex-shrink-0">
                        Created {formatDate(deal.created_at)}
                    </div>
                </div>
            </div>

            {/* Info Cards Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Coordinator */}
                <div className="bg-white rounded-2xl border border-slate-100 p-5">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Coordinator</h3>
                    {deal.coordinator ? (
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                                {deal.coordinator.name?.[0]?.toUpperCase() || 'C'}
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-900">{deal.coordinator.name}</p>
                                {deal.coordinator.phone && (
                                    <a href={`tel:${deal.coordinator.phone}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                                        <Phone size={11} /> {deal.coordinator.phone}
                                    </a>
                                )}
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-slate-400">Not assigned yet</p>
                    )}
                </div>

                {/* Matched Property */}
                <div className="bg-white rounded-2xl border border-slate-100 p-5">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Matched Property</h3>
                    {deal.property ? (
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                                <Building2 size={18} className="text-purple-600" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-900">{deal.property.type} in {deal.property.location}</p>
                                <p className="text-xs text-slate-500">{formatPrice(deal.property.price)}</p>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <p className="text-sm text-slate-400 mb-3">No property matched yet</p>
                            <Link
                                href={`/agent/deals/${deal.id}/browse`}
                                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
                            >
                                <Search size={14} /> Browse Matching Properties
                            </Link>
                        </div>
                    )}
                </div>
            </div>

            {/* Browse Properties CTA for active deals */}
            {!deal.property && (deal.status === 'NEW' || deal.status === 'MATCHED') && (
                <Link
                    href={`/agent/deals/${deal.id}/browse`}
                    className="block bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-5 text-white hover:shadow-lg transition-shadow"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-bold text-base">Find Matching Properties</h3>
                            <p className="text-white/70 text-sm mt-0.5">Browse properties one at a time. Like to schedule a visit, skip to see next.</p>
                        </div>
                        <Search size={24} className="text-white/50 flex-shrink-0" />
                    </div>
                </Link>
            )}

            {/* Tabs */}
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <div className="flex border-b border-slate-100">
                    {(['details', 'timeline', 'queries'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex-1 py-3 text-sm font-medium transition-colors ${
                                activeTab === tab
                                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            {tab === 'details' ? 'Details' : tab === 'timeline' ? 'Timeline' : `Queries (${deal.queries?.length || 0})`}
                        </button>
                    ))}
                </div>

                <div className="p-5">
                    {/* Details Tab */}
                    {activeTab === 'details' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <InfoRow label="Deal Type" value={deal.type === 'SALE' || deal.type === 'BUY' ? 'Purchase' : 'Rental'} />
                                <InfoRow label="Status" value={st.label} />
                                <InfoRow label="Scenario" value={deal.deal_scenario?.replace(/_/g, ' ') || 'N/A'} />
                                <InfoRow label="Property Type" value={deal.demand_property_type || 'Any'} />
                                <InfoRow label="Location" value={deal.demand_location || 'Not specified'} />
                                <InfoRow label="Budget" value={
                                    deal.demand_budget_min || deal.demand_budget_max
                                        ? `${formatPrice(deal.demand_budget_min)} - ${formatPrice(deal.demand_budget_max)}`
                                        : 'Not specified'
                                } />
                                <InfoRow label="Created" value={formatDate(deal.created_at)} />
                                <InfoRow label="Last Updated" value={formatDate(deal.updated_at)} />
                            </div>
                        </div>
                    )}

                    {/* Timeline Tab */}
                    {activeTab === 'timeline' && (
                        <div>
                            {!deal.logs || deal.logs.length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-6">No activity yet</p>
                            ) : (
                                <div className="space-y-0">
                                    {deal.logs.map((log, i) => (
                                        <div key={i} className="flex gap-3 pb-4">
                                            <div className="flex flex-col items-center">
                                                <div className="w-2 h-2 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
                                                {i < deal.logs.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                                            </div>
                                            <div className="flex-1 min-w-0 pb-2">
                                                <p className="text-sm font-medium text-slate-800">
                                                    {LOG_LABELS[log.action] || log.action}
                                                </p>
                                                {log.details && typeof log.details === 'object' && (
                                                    <p className="text-xs text-slate-500 mt-0.5">
                                                        {log.details.new_status && `→ ${STATUS_STYLES[log.details.new_status]?.label || log.details.new_status}`}
                                                        {log.details.coordinator_name && `Assigned to ${log.details.coordinator_name}`}
                                                        {log.details.deal_scenario && ` (${log.details.deal_scenario.replace(/_/g, ' ')})`}
                                                    </p>
                                                )}
                                                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                                                    <Clock size={10} /> {formatDate(log.created_at)}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Queries Tab */}
                    {activeTab === 'queries' && (
                        <div className="space-y-4">
                            <button
                                onClick={() => setShowQueryForm(!showQueryForm)}
                                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
                            >
                                <MessageSquare size={14} /> Raise a Query
                            </button>

                            {showQueryForm && (
                                <form onSubmit={handleSubmitQuery} className="bg-slate-50 rounded-xl p-4 space-y-3">
                                    <input
                                        type="text" required value={querySubject}
                                        onChange={e => setQuerySubject(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Subject (e.g. Budget negotiation)"
                                    />
                                    <textarea
                                        required value={queryMessage}
                                        onChange={e => setQueryMessage(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                                        placeholder="Your question or message..."
                                    />
                                    <div className="flex gap-2">
                                        <button type="submit" disabled={querySubmitting}
                                            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                                        >
                                            {querySubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send
                                        </button>
                                        <button type="button" onClick={() => setShowQueryForm(false)}
                                            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-semibold transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </form>
                            )}

                            {!deal.queries || deal.queries.length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-6">No queries yet. Raise a query to communicate with your coordinator.</p>
                            ) : (
                                <div className="space-y-3">
                                    {deal.queries.map(q => (
                                        <div key={q.id} className="bg-slate-50 rounded-xl p-4">
                                            <div className="flex items-start justify-between gap-2">
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-900">{q.subject}</p>
                                                    <p className="text-xs text-slate-400 mt-0.5">
                                                        {q.raised_by_type === 'partner_demand' ? 'You' : 'Supply Partner'} &middot; {formatDate(q.created_at)}
                                                    </p>
                                                </div>
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                    q.status === 'ANSWERED' ? 'bg-green-50 text-green-700' :
                                                    q.status === 'CLOSED' ? 'bg-slate-100 text-slate-500' :
                                                    'bg-amber-50 text-amber-700'
                                                }`}>
                                                    {q.status}
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-600 mt-2">{q.message}</p>
                                            {q.answer && (
                                                <div className="mt-3 p-3 bg-white rounded-lg border border-slate-200">
                                                    <p className="text-xs font-semibold text-green-700 mb-1">Answer:</p>
                                                    <p className="text-sm text-slate-700">{q.answer}</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p>
            <p className="text-sm font-medium text-slate-800 mt-0.5">{value}</p>
        </div>
    );
}
