'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, MapPin, Building2, Users, Image } from 'lucide-react';
import api from '@/lib/api';

interface ProjectListItem {
    id: string;
    name: string;
    project_type: string;
    city: string;
    locality: string;
    project_status: string;
    status: string;
    created_at: string;
    units: Array<{ configuration: string }>;
    media: Array<{ media_url: string }>;
    _count: { leads: number; units: number; media: number };
}

const STATUS_COLORS: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-700',
    ACTIVE: 'bg-green-100 text-green-700',
    PAUSED: 'bg-yellow-100 text-yellow-700',
    SOLD_OUT: 'bg-red-100 text-red-700',
    ARCHIVED: 'bg-gray-100 text-gray-500',
};

export default function BuilderProjects() {
    const [projects, setProjects] = useState<ProjectListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');

    useEffect(() => {
        const fetchProjects = async () => {
            try {
                const params: any = { page: 1, limit: 20 };
                if (filter) params.status = filter;

                const res = await api.get('/builder/projects', { params });
                setProjects(res.data.projects);
                setTotal(res.data.total);
            } catch (err) {
                console.error('Failed to fetch projects', err);
            } finally {
                setLoading(false);
            }
        };
        fetchProjects();
    }, [filter]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">My Projects</h1>
                    <p className="mt-1 text-sm text-gray-500">{total} project{total !== 1 ? 's' : ''}</p>
                </div>
                <Link href="/builder/projects/new" className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700">
                    <Plus className="h-4 w-4" /> New Project
                </Link>
            </div>

            <div className="flex gap-2">
                {['', 'DRAFT', 'ACTIVE', 'PAUSED', 'SOLD_OUT'].map((s) => (
                    <button
                        key={s}
                        onClick={() => setFilter(s)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                            filter === s ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                        {s || 'All'}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="text-center py-12 text-gray-500">Loading projects...</div>
            ) : projects.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-lg shadow">
                    <Building2 className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No projects</h3>
                    <p className="mt-1 text-sm text-gray-500">Get started by creating a new project.</p>
                    <Link href="/builder/projects/new" className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-md hover:bg-emerald-700">
                        <Plus className="h-4 w-4" /> Create Project
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {projects.map((project) => (
                        <Link key={project.id} href={`/builder/projects/${project.id}`} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow overflow-hidden">
                            <div className="h-40 bg-gray-200 flex items-center justify-center">
                                {project.media?.[0] ? (
                                    <img src={project.media[0].media_url} alt={project.name} className="w-full h-full object-cover" />
                                ) : (
                                    <Building2 className="h-12 w-12 text-gray-400" />
                                )}
                            </div>
                            <div className="p-4 space-y-2">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold text-gray-900 truncate">{project.name}</h3>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[project.status] || 'bg-gray-100 text-gray-700'}`}>
                                        {project.status}
                                    </span>
                                </div>
                                <div className="flex items-center text-sm text-gray-500 gap-1">
                                    <MapPin className="h-3.5 w-3.5" /> {project.locality}, {project.city}
                                </div>
                                <div className="flex items-center gap-4 text-xs text-gray-500 pt-1 border-t">
                                    <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {project._count.units} units</span>
                                    <span className="flex items-center gap-1"><Image className="h-3.5 w-3.5" /> {project._count.media} media</span>
                                    <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {project._count.leads} leads</span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
