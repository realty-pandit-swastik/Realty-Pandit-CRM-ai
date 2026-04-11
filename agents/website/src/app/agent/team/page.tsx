'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Users } from 'lucide-react';
import api from '@/lib/api';

interface SubAgent {
    id: string;
    name: string;
    phone_number: string;
    email: string | null;
    status: string;
    created_at: string;
}

export default function AgentTeam() {
    const router = useRouter();
    const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ name: '', phone: '', email: '' });
    const [formLoading, setFormLoading] = useState(false);
    const [formError, setFormError] = useState('');

    const token = typeof window !== 'undefined' ? localStorage.getItem('agent_token') : null;
    const headers = { Authorization: `Bearer ${token}` };

    useEffect(() => {
        // Guard: only company owners can access
        try {
            const info = localStorage.getItem('agent_info');
            if (info) {
                const parsed = JSON.parse(info);
                if (parsed.partner_category !== 'COMPANY' || parsed.parent_partner_id) {
                    router.push('/agent/dashboard');
                    return;
                }
            }
        } catch {
            router.push('/agent/dashboard');
            return;
        }
        fetchTeam();
    }, []);

    const fetchTeam = async () => {
        try {
            const res = await api.get('/agent/team', { headers });
            setSubAgents(res.data);
        } catch (err) {
            console.error('Failed to fetch team', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        setFormLoading(true);
        try {
            await api.post('/agent/team', formData, { headers });
            setShowForm(false);
            setFormData({ name: '', phone: '', email: '' });
            await fetchTeam();
        } catch (err: any) {
            setFormError(err.response?.data?.error || 'Failed to add team member');
        } finally {
            setFormLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">My Team</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        {subAgents.length} team member{subAgents.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <button
                    onClick={() => { setShowForm(!showForm); setFormError(''); }}
                    className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700"
                >
                    {showForm ? 'Cancel' : <><UserPlus className="h-4 w-4 mr-2" /> Add Member</>}
                </button>
            </div>

            {/* Add Member Form */}
            {showForm && (
                <div className="bg-white shadow rounded-lg p-6">
                    <h3 className="text-sm font-medium text-gray-900 mb-4">Add Team Member</h3>
                    {formError && (
                        <div className="bg-red-50 text-red-700 px-4 py-2 rounded-md text-sm mb-4">{formError}</div>
                    )}
                    <form onSubmit={handleAddMember} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <input
                            placeholder="Full Name *"
                            value={formData.name}
                            required
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <input
                            placeholder="WhatsApp Number (10 digits) *"
                            value={formData.phone}
                            required
                            maxLength={10}
                            onChange={e => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })}
                            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <input
                            placeholder="Email (optional)"
                            type="email"
                            value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <button
                            type="submit"
                            disabled={formLoading}
                            className="sm:col-span-3 bg-indigo-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {formLoading ? 'Adding...' : 'Add Team Member'}
                        </button>
                    </form>
                </div>
            )}

            {/* Team List */}
            {loading ? (
                <div className="text-center py-12 text-gray-500">Loading team...</div>
            ) : subAgents.length === 0 ? (
                <div className="bg-white shadow rounded-lg p-8 text-center">
                    <Users className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No team members yet</h3>
                    <p className="mt-1 text-sm text-gray-500">Add team members to help manage your inventory and leads.</p>
                </div>
            ) : (
                <div className="bg-white shadow rounded-lg overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Name</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Phone</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Email</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Added</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {subAgents.map(agent => (
                                <tr key={agent.id}>
                                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{agent.name}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{agent.phone_number}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{agent.email || '-'}</td>
                                    <td className="px-4 py-3">
                                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                            agent.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                        }`}>
                                            {agent.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                        {new Date(agent.created_at).toLocaleDateString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
