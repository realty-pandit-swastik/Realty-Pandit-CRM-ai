'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface BuilderLead {
    id: string;
    contact: { name: string | null; phone_number: string; email: string | null };
    project: { id: string; name: string };
    configuration: string | null;
    status: string;
    source: string;
    created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
    NEW: 'bg-blue-100 text-blue-700',
    CONTACTED: 'bg-yellow-100 text-yellow-700',
    VISIT_SCHEDULED: 'bg-purple-100 text-purple-700',
    VISITED: 'bg-indigo-100 text-indigo-700',
    NEGOTIATION: 'bg-orange-100 text-orange-700',
    CONVERTED: 'bg-green-100 text-green-700',
    LOST: 'bg-red-100 text-red-700',
};

export default function BuilderLeads() {
    const [leads, setLeads] = useState<BuilderLead[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');

    const token = typeof window !== 'undefined' ? localStorage.getItem('builder_token') : null;
    const headers = { Authorization: `Bearer ${token}` };

    useEffect(() => {
        const fetchLeads = async () => {
            try {
                const params: any = { page: 1, limit: 50 };
                if (filter) params.status = filter;

                const res = await api.get('/builder/leads', { headers, params });
                setLeads(res.data.leads || res.data);
                setTotal(res.data.total || (res.data.leads || res.data).length);
            } catch (err) {
                console.error('Failed to fetch leads', err);
            } finally {
                setLoading(false);
            }
        };
        fetchLeads();
    }, [filter]);

    const updateStatus = async (leadId: string, status: string) => {
        try {
            await api.patch(`/builder/leads/${leadId}/status`, { status }, { headers });
            setLeads(leads.map(l => l.id === leadId ? { ...l, status } : l));
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to update status');
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-gray-900">Leads</h1>
                <p className="mt-1 text-sm text-gray-500">{total} lead{total !== 1 ? 's' : ''} across all projects</p>
            </div>

            <div className="flex gap-2 flex-wrap">
                {['', 'NEW', 'CONTACTED', 'VISIT_SCHEDULED', 'VISITED', 'NEGOTIATION', 'CONVERTED', 'LOST'].map((s) => (
                    <button
                        key={s}
                        onClick={() => setFilter(s)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                            filter === s ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                        {(s || 'All').replace(/_/g, ' ')}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="text-center py-12 text-gray-500">Loading leads...</div>
            ) : leads.length === 0 ? (
                <div className="bg-white shadow rounded-lg p-6 text-center text-gray-500 text-sm">No leads found.</div>
            ) : (
                <div className="bg-white shadow rounded-lg overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Contact</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Project</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Config</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Source</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {leads.map(lead => (
                                <tr key={lead.id}>
                                    <td className="px-4 py-3">
                                        <p className="text-sm font-medium text-gray-900">{lead.contact?.name || 'N/A'}</p>
                                        <p className="text-xs text-gray-500">{lead.contact?.phone_number}</p>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-700">{lead.project?.name}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{lead.configuration || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{lead.source}</td>
                                    <td className="px-4 py-3">
                                        <select
                                            value={lead.status}
                                            onChange={(e) => updateStatus(lead.id, e.target.value)}
                                            className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${STATUS_COLORS[lead.status] || 'bg-gray-100'}`}
                                        >
                                            {Object.keys(STATUS_COLORS).map(s => (
                                                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(lead.created_at).toLocaleDateString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
