'use client';

import { useEffect, useState } from 'react';
import { Users, Search, Phone, MessageSquare, CheckCircle, Edit3, X, ChevronDown, ChevronUp } from 'lucide-react';
import api from '@/lib/api';

interface ReferredLead {
    phone_number: string;
    name: string | null;
    email: string | null;
    lead_status: string;
    lifecycle_stage: string | null;
    intent: string | null;
    budget_min: string | null;
    budget_max: string | null;
    demand_bhk: number | null;
    preferred_location: string | null;
    timeline: string | null;
    notes: string | null;
    created_at: string;
    assigned_agent: { name: string } | null;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
    cold:           { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Cold' },
    warm:           { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Warm' },
    hot:            { bg: 'bg-red-100',   text: 'text-red-700',   label: 'Hot' },
    closed:         { bg: 'bg-green-100', text: 'text-green-700', label: 'Closed' },
    lost:           { bg: 'bg-gray-100',  text: 'text-gray-500',  label: 'Lost' },
    partner_closed: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Done by You' },
};

function formatBudget(val: string | null) {
    if (!val) return '';
    const n = parseInt(val);
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
    if (n >= 100000) return `₹${(n / 100000).toFixed(0)}L`;
    return `₹${n.toLocaleString()}`;
}

function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
}

export default function AgentLeads() {
    const [leads, setLeads] = useState<ReferredLead[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [editingLead, setEditingLead] = useState<ReferredLead | null>(null);
    const [editForm, setEditForm] = useState<Partial<ReferredLead & { phone: string }>>({});
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [donePhone, setDonePhone] = useState<string | null>(null);
    const [markingDone, setMarkingDone] = useState(false);
    const [expandedPhone, setExpandedPhone] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'active' | 'done'>('active');

    const loadLeads = () => {
        api.get('/agent/referred-leads')
            .then(res => setLeads(res.data || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadLeads(); }, []);

    const openEdit = (lead: ReferredLead) => {
        setEditingLead(lead);
        setEditForm({
            name: lead.name || '',
            phone: lead.phone_number.startsWith('TEMP_') ? '' : lead.phone_number,
            email: lead.email || '',
            intent: lead.intent || '',
            budget_min: lead.budget_min || '',
            budget_max: lead.budget_max || '',
            demand_bhk: lead.demand_bhk ?? undefined,
            preferred_location: lead.preferred_location || '',
            timeline: lead.timeline || '',
            notes: lead.notes || '',
        });
        setSaveError('');
    };

    const handleSave = async () => {
        if (!editingLead) return;
        setSaving(true);
        setSaveError('');
        try {
            await api.patch(`/agent/referred-leads/${encodeURIComponent(editingLead.phone_number)}`, editForm);
            setEditingLead(null);
            loadLeads();
        } catch (err: any) {
            setSaveError(err?.response?.data?.error || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleMarkDone = async () => {
        if (!donePhone) return;
        setMarkingDone(true);
        try {
            await api.post(`/agent/referred-leads/${encodeURIComponent(donePhone)}/done`, {});
            setDonePhone(null);
            loadLeads();
        } catch (err: any) {
            alert(err?.response?.data?.error || 'Failed to mark as done');
        } finally {
            setMarkingDone(false);
        }
    };

    const activeLeads = leads.filter(l => l.lead_status !== 'partner_closed');
    const doneLeads = leads.filter(l => l.lead_status === 'partner_closed');
    const displayLeads = activeTab === 'active' ? activeLeads : doneLeads;
    const filtered = search
        ? displayLeads.filter(l =>
            (l.name || '').toLowerCase().includes(search.toLowerCase()) ||
            (!l.phone_number.startsWith('TEMP_') && l.phone_number.includes(search)) ||
            (l.preferred_location || '').toLowerCase().includes(search.toLowerCase()))
        : displayLeads;

    const inputCls = 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
    const labelCls = 'block text-xs font-medium text-gray-500 mb-1';

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="border-b border-gray-200 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">Referred Leads</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Leads you have referred to Realty Pandit</p>
                </div>
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                        className="pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500 w-full"
                        placeholder="Search by name, phone, location..." />
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-0 border border-gray-200 rounded-lg overflow-hidden w-fit">
                <button onClick={() => setActiveTab('active')}
                    className={`px-5 py-2 text-sm font-medium transition-colors ${activeTab === 'active' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    Active ({activeLeads.length})
                </button>
                <button onClick={() => setActiveTab('done')}
                    className={`px-5 py-2 text-sm font-medium transition-colors ${activeTab === 'done' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    Done by Me ({doneLeads.length})
                </button>
            </div>

            {loading ? (
                <div className="text-center py-12 text-gray-400">Loading leads...</div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16">
                    <Users className="mx-auto h-12 w-12 text-gray-300" />
                    <h3 className="mt-3 text-sm font-medium text-gray-900">
                        {activeTab === 'active' ? 'No active leads' : 'No completed leads'}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                        {activeTab === 'active'
                            ? 'Leads you refer will appear here.'
                            : 'Leads you mark as done will appear here.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map(lead => {
                        const isTemp = lead.phone_number.startsWith('TEMP_');
                        const status = STATUS_STYLES[lead.lead_status] || STATUS_STYLES.cold;
                        const isExpanded = expandedPhone === lead.phone_number;
                        const isDone = lead.lead_status === 'partner_closed';

                        return (
                            <div key={lead.phone_number} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                {/* Main row */}
                                <div className="p-4 flex items-start gap-3">
                                    {/* Avatar */}
                                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-600 font-bold text-base">
                                        {(lead.name || '?')[0].toUpperCase()}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-gray-900 text-sm">
                                                {lead.name || <span className="text-gray-400 italic">No name yet</span>}
                                            </span>
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                                                {status.label}
                                            </span>
                                            {lead.demand_bhk && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600">
                                                    {lead.demand_bhk} BHK
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-3 flex-wrap">
                                            <span>{isTemp ? 'No phone yet' : lead.phone_number}</span>
                                            {lead.preferred_location && <span>📍 {lead.preferred_location}</span>}
                                            {(lead.budget_min || lead.budget_max) && (
                                                <span>{formatBudget(lead.budget_min)} – {formatBudget(lead.budget_max)}</span>
                                            )}
                                            <span className="text-gray-400">{timeAgo(lead.created_at)}</span>
                                        </div>
                                        {lead.assigned_agent && (
                                            <div className="text-xs text-indigo-500 mt-1">Handler: {lead.assigned_agent.name}</div>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {!isTemp && !isDone && (
                                            <a href={`tel:${lead.phone_number}`}
                                                className="p-1.5 rounded-full text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors">
                                                <Phone className="w-4 h-4" />
                                            </a>
                                        )}
                                        {!isDone && (
                                            <button onClick={() => openEdit(lead)}
                                                className="p-1.5 rounded-full text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                                                <Edit3 className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button onClick={() => setExpandedPhone(isExpanded ? null : lead.phone_number)}
                                            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded details */}
                                {isExpanded && (
                                    <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-2">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-xs">
                                            {lead.intent && <div><span className="text-gray-400">Intent:</span> <span className="font-medium capitalize">{lead.intent}</span></div>}
                                            {lead.timeline && <div><span className="text-gray-400">Timeline:</span> <span className="font-medium capitalize">{lead.timeline}</span></div>}
                                            {lead.email && <div><span className="text-gray-400">Email:</span> <span className="font-medium">{lead.email}</span></div>}
                                            {lead.lifecycle_stage && <div><span className="text-gray-400">Stage:</span> <span className="font-medium">{lead.lifecycle_stage.replace(/_/g, ' ')}</span></div>}
                                        </div>
                                        {lead.notes && (
                                            <div className="text-xs text-gray-600 bg-white rounded px-3 py-2 border border-gray-200">
                                                {lead.notes}
                                            </div>
                                        )}

                                        {/* Mark as Done button */}
                                        {!isDone && (
                                            <button onClick={() => setDonePhone(lead.phone_number)}
                                                className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 transition-colors">
                                                <CheckCircle className="w-3.5 h-3.5" />
                                                Mark as Done (handled by me)
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Edit Drawer ── */}
            {editingLead && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setEditingLead(null)} />
                    <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white">
                            <h3 className="font-semibold text-gray-900">Update Lead Details</h3>
                            <button onClick={() => setEditingLead(null)} className="p-1 rounded-full hover:bg-gray-100">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>
                        <div className="px-5 py-4 space-y-4">
                            {saveError && (
                                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{saveError}</div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Client Name</label>
                                    <input type="text" value={editForm.name || ''} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                                        placeholder="Full name" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>
                                        Phone {editingLead.phone_number.startsWith('TEMP_') ? '' : '(cannot change)'}
                                    </label>
                                    <input type="tel" value={editForm.phone || ''}
                                        onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))}
                                        placeholder="+91 9876543210"
                                        disabled={!editingLead.phone_number.startsWith('TEMP_')}
                                        className={`${inputCls} ${!editingLead.phone_number.startsWith('TEMP_') ? 'bg-gray-50 text-gray-400' : ''}`} />
                                </div>
                            </div>

                            <div>
                                <label className={labelCls}>Email</label>
                                <input type="email" value={editForm.email || ''} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))}
                                    placeholder="email@example.com" className={inputCls} />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Intent</label>
                                    <select value={editForm.intent || ''} onChange={e => setEditForm(p => ({ ...p, intent: e.target.value }))} className={inputCls}>
                                        <option value="">Select</option>
                                        <option value="buy">Buy</option>
                                        <option value="rent">Rent</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>BHK</label>
                                    <select value={editForm.demand_bhk ?? ''} onChange={e => setEditForm(p => ({ ...p, demand_bhk: e.target.value ? parseInt(e.target.value) : undefined }))} className={inputCls}>
                                        <option value="">Any</option>
                                        {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} BHK</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Min Budget (₹)</label>
                                    <input type="number" value={editForm.budget_min || ''} onChange={e => setEditForm(p => ({ ...p, budget_min: e.target.value }))}
                                        placeholder="e.g. 2000000" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Max Budget (₹)</label>
                                    <input type="number" value={editForm.budget_max || ''} onChange={e => setEditForm(p => ({ ...p, budget_max: e.target.value }))}
                                        placeholder="e.g. 5000000" className={inputCls} />
                                </div>
                            </div>

                            <div>
                                <label className={labelCls}>Preferred Location</label>
                                <input type="text" value={editForm.preferred_location || ''} onChange={e => setEditForm(p => ({ ...p, preferred_location: e.target.value }))}
                                    placeholder="e.g. Indirapuram, Ghaziabad" className={inputCls} />
                            </div>

                            <div>
                                <label className={labelCls}>Timeline</label>
                                <select value={editForm.timeline || ''} onChange={e => setEditForm(p => ({ ...p, timeline: e.target.value }))} className={inputCls}>
                                    <option value="">Select</option>
                                    <option value="immediately">Immediately</option>
                                    <option value="1-3 months">1–3 Months</option>
                                    <option value="3-6 months">3–6 Months</option>
                                    <option value="6-12 months">6–12 Months</option>
                                    <option value="more than 1 year">More than 1 Year</option>
                                </select>
                            </div>

                            <div>
                                <label className={labelCls}>Notes</label>
                                <textarea value={editForm.notes || ''} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                                    rows={3} placeholder="Any additional info about this client..." className={`${inputCls} resize-none`} />
                            </div>
                        </div>
                        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-5 py-4 flex gap-3">
                            <button onClick={() => setEditingLead(null)} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                                Cancel
                            </button>
                            <button onClick={handleSave} disabled={saving}
                                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Mark as Done Confirmation ── */}
            {donePhone && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setDonePhone(null)} />
                    <div className="relative bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                                <CheckCircle className="w-5 h-5 text-purple-600" />
                            </div>
                            <h3 className="font-semibold text-gray-900">Mark Lead as Done?</h3>
                        </div>
                        <p className="text-sm text-gray-600 mb-6">
                            This means you've handled this client with your own inventory. The lead will be removed from Realty Pandit's follow-up queue. <strong>This cannot be undone.</strong>
                        </p>
                        <p className="text-xs text-gray-400 mb-5">Realty Pandit team will be notified automatically.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setDonePhone(null)}
                                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                                Cancel
                            </button>
                            <button onClick={handleMarkDone} disabled={markingDone}
                                className="flex-1 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-60">
                                {markingDone ? 'Marking...' : 'Yes, Mark Done'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
