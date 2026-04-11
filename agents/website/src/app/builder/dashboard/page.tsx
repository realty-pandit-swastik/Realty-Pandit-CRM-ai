'use client';

import { useEffect, useState } from 'react';
import { FolderKanban, Users, Calendar, TrendingUp, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import api from '@/lib/api';

interface DashboardStats {
    activeProjects: number;
    totalLeads: number;
    upcomingVisits: number;
    conversions: number;
    conversionRate: string;
    recentLeads: Array<{
        id: string;
        contact: { name: string | null; phone_number: string };
        project: { name: string };
        status: string;
        created_at: string;
    }>;
}

export default function BuilderDashboard() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const token = localStorage.getItem('builder_token');
                const res = await api.get('/builder/dashboard/stats', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setStats(res.data);
            } catch (err: any) {
                setError(err.response?.data?.error || 'Failed to load dashboard');
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    if (loading) {
        return <div className="flex items-center justify-center h-64"><div className="text-gray-500">Loading dashboard...</div></div>;
    }

    if (error) {
        return <div className="bg-red-50 border-l-4 border-red-400 p-4"><p className="text-red-700">{error}</p></div>;
    }

    const statCards = [
        { name: 'Active Projects', value: stats?.activeProjects ?? 0, icon: FolderKanban, color: 'bg-emerald-500' },
        { name: 'Total Leads', value: stats?.totalLeads ?? 0, icon: Users, color: 'bg-blue-500' },
        { name: 'Upcoming Visits', value: stats?.upcomingVisits ?? 0, icon: Calendar, color: 'bg-purple-500' },
        { name: 'Conversion Rate', value: stats?.conversionRate ?? '0%', icon: TrendingUp, color: 'bg-amber-500' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
                    <p className="mt-1 text-sm text-gray-500">Overview of your projects and leads.</p>
                </div>
                <Link href="/builder/projects/new" className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700">
                    + New Project
                </Link>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {statCards.map((stat) => (
                    <div key={stat.name} className="bg-white overflow-hidden shadow rounded-lg">
                        <div className="p-5">
                            <div className="flex items-center">
                                <div className={`flex-shrink-0 rounded-md p-3 ${stat.color}`}>
                                    <stat.icon className="h-6 w-6 text-white" />
                                </div>
                                <div className="ml-5 w-0 flex-1">
                                    <dt className="text-sm font-medium text-gray-500 truncate">{stat.name}</dt>
                                    <dd className="text-lg font-medium text-gray-900">{stat.value}</dd>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-white shadow rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900">Recent Leads</h3>
                    <Link href="/builder/leads" className="text-sm text-emerald-600 hover:text-emerald-500 flex items-center gap-1">
                        View all <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>
                {stats?.recentLeads && stats.recentLeads.length > 0 ? (
                    <div className="divide-y divide-gray-200">
                        {stats.recentLeads.map((lead) => (
                            <div key={lead.id} className="py-3 flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-900">{lead.contact?.name || 'Unknown'}</p>
                                    <p className="text-xs text-gray-500">{lead.project?.name} &middot; {new Date(lead.created_at).toLocaleDateString()}</p>
                                </div>
                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                    lead.status === 'NEW' ? 'bg-blue-100 text-blue-700' :
                                    lead.status === 'CONTACTED' ? 'bg-yellow-100 text-yellow-700' :
                                    lead.status === 'CONVERTED' ? 'bg-green-100 text-green-700' :
                                    'bg-gray-100 text-gray-700'
                                }`}>
                                    {lead.status}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-500 text-sm">No leads yet. Create a project to start receiving enquiries.</p>
                )}
            </div>
        </div>
    );
}
