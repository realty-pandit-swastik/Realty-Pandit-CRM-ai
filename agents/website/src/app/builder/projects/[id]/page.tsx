'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Upload, Play, Pause, MapPin } from 'lucide-react';
import api, { getMediaUrl } from '@/lib/api';

interface ProjectUnit {
    id: string;
    configuration: string;
    area_min: number;
    area_max: number | null;
    price_min: number;
    price_max: number | null;
    total_units: number | null;
    available_units: number | null;
    is_active: boolean;
}

interface ProjectMedia {
    id: string;
    media_type: string;
    media_url: string;
    caption: string | null;
    display_order: number;
}

interface ProjectDetail {
    id: string;
    name: string;
    project_type: string;
    city: string;
    locality: string;
    google_map_link: string | null;
    rera_number: string | null;
    possession_date: string | null;
    project_status: string;
    short_description: string;
    long_description: string | null;
    status: string;
    created_at: string;
    units: ProjectUnit[];
    media: ProjectMedia[];
    leads: Array<{
        id: string;
        contact: { name: string | null; phone_number: string };
        status: string;
        configuration: string | null;
        created_at: string;
    }>;
    _count: { leads: number; appointments: number };
}

type Tab = 'overview' | 'units' | 'media' | 'leads';

export default function ProjectDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const [project, setProject] = useState<ProjectDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [error, setError] = useState('');

    const token = typeof window !== 'undefined' ? localStorage.getItem('builder_token') : null;
    const headers = { Authorization: `Bearer ${token}` };

    const fetchProject = async () => {
        try {
            const res = await api.get(`/builder/projects/${id}`, { headers });
            setProject(res.data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to load project');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchProject(); }, [id]);

    const handleActivate = async () => {
        try {
            await api.patch(`/builder/projects/${id}/activate`, {}, { headers });
            fetchProject();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Activation failed');
        }
    };

    const handlePause = async () => {
        try {
            await api.patch(`/builder/projects/${id}/pause`, {}, { headers });
            fetchProject();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Pause failed');
        }
    };

    if (loading) return <div className="text-center py-12 text-gray-500">Loading project...</div>;
    if (error) return <div className="bg-red-50 border-l-4 border-red-400 p-4"><p className="text-red-700">{error}</p></div>;
    if (!project) return null;

    const tabs: { key: Tab; label: string; count?: number }[] = [
        { key: 'overview', label: 'Overview' },
        { key: 'units', label: 'Units', count: project.units.filter(u => u.is_active).length },
        { key: 'media', label: 'Media', count: project.media.length },
        { key: 'leads', label: 'Leads', count: project._count.leads },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link href="/builder/projects" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="h-5 w-5" /></Link>
                    <div>
                        <h1 className="text-2xl font-semibold text-gray-900">{project.name}</h1>
                        <p className="text-sm text-gray-500 flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {project.locality}, {project.city}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {project.status === 'DRAFT' && (
                        <button onClick={handleActivate} className="inline-flex items-center gap-1 px-4 py-2 bg-emerald-600 text-white text-sm rounded-md hover:bg-emerald-700">
                            <Play className="h-4 w-4" /> Activate
                        </button>
                    )}
                    {project.status === 'ACTIVE' && (
                        <button onClick={handlePause} className="inline-flex items-center gap-1 px-4 py-2 bg-yellow-500 text-white text-sm rounded-md hover:bg-yellow-600">
                            <Pause className="h-4 w-4" /> Pause
                        </button>
                    )}
                </div>
            </div>

            <div className="border-b border-gray-200">
                <nav className="flex gap-6">
                    {tabs.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === tab.key ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {tab.label} {tab.count !== undefined && <span className="ml-1 text-xs bg-gray-100 px-1.5 py-0.5 rounded-full">{tab.count}</span>}
                        </button>
                    ))}
                </nav>
            </div>

            {activeTab === 'overview' && <OverviewTab project={project} />}
            {activeTab === 'units' && <UnitsTab project={project} headers={headers} onRefresh={fetchProject} />}
            {activeTab === 'media' && <MediaTab project={project} headers={headers} onRefresh={fetchProject} />}
            {activeTab === 'leads' && <LeadsTab project={project} />}
        </div>
    );
}

function OverviewTab({ project }: { project: ProjectDetail }) {
    const statusColor: Record<string, string> = {
        DRAFT: 'bg-gray-100 text-gray-700',
        ACTIVE: 'bg-green-100 text-green-700',
        PAUSED: 'bg-yellow-100 text-yellow-700',
    };
    return (
        <div className="bg-white shadow rounded-lg p-6 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div><p className="text-xs text-gray-500">Status</p><span className={`text-sm px-2 py-0.5 rounded-full font-medium ${statusColor[project.status] || 'bg-gray-100'}`}>{project.status}</span></div>
                <div><p className="text-xs text-gray-500">Type</p><p className="text-sm font-medium">{project.project_type}</p></div>
                <div><p className="text-xs text-gray-500">Project Status</p><p className="text-sm font-medium">{project.project_status.replace(/_/g, ' ')}</p></div>
                {project.rera_number && <div><p className="text-xs text-gray-500">RERA</p><p className="text-sm font-medium">{project.rera_number}</p></div>}
                {project.possession_date && <div><p className="text-xs text-gray-500">Possession</p><p className="text-sm font-medium">{new Date(project.possession_date).toLocaleDateString()}</p></div>}
                <div><p className="text-xs text-gray-500">Created</p><p className="text-sm font-medium">{new Date(project.created_at).toLocaleDateString()}</p></div>
            </div>
            <div className="border-t pt-4">
                <p className="text-xs text-gray-500 mb-1">Description</p>
                <p className="text-sm text-gray-700">{project.short_description}</p>
                {project.long_description && <p className="text-sm text-gray-600 mt-2">{project.long_description}</p>}
            </div>
        </div>
    );
}

function UnitsTab({ project, headers, onRefresh }: { project: ProjectDetail; headers: any; onRefresh: () => void }) {
    const [showForm, setShowForm] = useState(false);
    const [unitForm, setUnitForm] = useState({ configuration: '', area_min: '', area_max: '', price_min: '', price_max: '', total_units: '', available_units: '' });
    const [saving, setSaving] = useState(false);

    const handleAddUnit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.post(`/builder/projects/${project.id}/units`, {
                configuration: unitForm.configuration,
                areaMin: Number(unitForm.area_min),
                areaMax: unitForm.area_max ? Number(unitForm.area_max) : null,
                priceMin: Number(unitForm.price_min),
                priceMax: unitForm.price_max ? Number(unitForm.price_max) : null,
                totalUnits: unitForm.total_units ? Number(unitForm.total_units) : null,
                availableUnits: unitForm.available_units ? Number(unitForm.available_units) : null,
            }, { headers });
            setShowForm(false);
            setUnitForm({ configuration: '', area_min: '', area_max: '', price_min: '', price_max: '', total_units: '', available_units: '' });
            onRefresh();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to add unit');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteUnit = async (unitId: string) => {
        if (!confirm('Delete this unit configuration?')) return;
        try {
            await api.delete(`/builder/units/${unitId}`, { headers });
            onRefresh();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to delete');
        }
    };

    const activeUnits = project.units.filter(u => u.is_active);
    const inputClass = "block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:ring-emerald-500";

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Unit Configurations</h3>
                <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-md hover:bg-emerald-700">
                    <Plus className="h-4 w-4" /> Add Unit
                </button>
            </div>

            {showForm && (
                <form onSubmit={handleAddUnit} className="bg-white shadow rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="col-span-2 sm:col-span-1">
                        <label className="text-xs text-gray-500">Configuration *</label>
                        <input value={unitForm.configuration} onChange={e => setUnitForm({...unitForm, configuration: e.target.value})} required className={inputClass} placeholder="e.g., 2 BHK" />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">Area Min (sqft) *</label>
                        <input type="number" value={unitForm.area_min} onChange={e => setUnitForm({...unitForm, area_min: e.target.value})} required className={inputClass} />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">Area Max (sqft)</label>
                        <input type="number" value={unitForm.area_max} onChange={e => setUnitForm({...unitForm, area_max: e.target.value})} className={inputClass} />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">Price Min *</label>
                        <input type="number" value={unitForm.price_min} onChange={e => setUnitForm({...unitForm, price_min: e.target.value})} required className={inputClass} />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">Price Max</label>
                        <input type="number" value={unitForm.price_max} onChange={e => setUnitForm({...unitForm, price_max: e.target.value})} className={inputClass} />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">Total Units</label>
                        <input type="number" value={unitForm.total_units} onChange={e => setUnitForm({...unitForm, total_units: e.target.value})} className={inputClass} />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">Available</label>
                        <input type="number" value={unitForm.available_units} onChange={e => setUnitForm({...unitForm, available_units: e.target.value})} className={inputClass} />
                    </div>
                    <div className="col-span-2 sm:col-span-4 flex justify-end gap-2">
                        <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-md">Cancel</button>
                        <button type="submit" disabled={saving} className="px-4 py-1.5 text-sm text-white bg-emerald-600 rounded-md disabled:opacity-50">{saving ? 'Saving...' : 'Add'}</button>
                    </div>
                </form>
            )}

            {activeUnits.length === 0 ? (
                <div className="bg-white shadow rounded-lg p-6 text-center text-gray-500 text-sm">No unit configurations added yet.</div>
            ) : (
                <div className="bg-white shadow rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Config</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Area (sqft)</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Price</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Units</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {activeUnits.map(unit => (
                                <tr key={unit.id}>
                                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{unit.configuration}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{unit.area_min}{unit.area_max ? ` - ${unit.area_max}` : ''}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{formatINR(unit.price_min)}{unit.price_max ? ` - ${formatINR(unit.price_max)}` : ''}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{unit.available_units ?? '-'} / {unit.total_units ?? '-'}</td>
                                    <td className="px-4 py-3 text-right">
                                        <button onClick={() => handleDeleteUnit(unit.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
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

function MediaTab({ project, headers, onRefresh }: { project: ProjectDetail; headers: any; onRefresh: () => void }) {
    const [uploading, setUploading] = useState(false);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        try {
            const formData = new FormData();
            Array.from(files).forEach(f => formData.append('files', f));

            await api.post(`/builder/projects/${project.id}/media`, formData, {
                headers: { ...headers, 'Content-Type': 'multipart/form-data' }
            });
            onRefresh();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (mediaId: string) => {
        if (!confirm('Delete this media?')) return;
        try {
            await api.delete(`/builder/media/${mediaId}`, { headers });
            onRefresh();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Delete failed');
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Project Media</h3>
                <label className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-md hover:bg-emerald-700 cursor-pointer">
                    <Upload className="h-4 w-4" /> {uploading ? 'Uploading...' : 'Upload'}
                    <input type="file" multiple accept="image/*,video/*" onChange={handleUpload} className="hidden" disabled={uploading} />
                </label>
            </div>

            {project.media.length === 0 ? (
                <div className="bg-white shadow rounded-lg p-6 text-center text-gray-500 text-sm">No media uploaded yet.</div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {project.media.map(m => (
                        <div key={m.id} className="relative group bg-white rounded-lg shadow overflow-hidden">
                            <img src={getMediaUrl(m.media_url)} alt={m.caption || 'Project media'} className="w-full h-32 object-cover" />
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center">
                                <button onClick={() => handleDelete(m.id)} className="opacity-0 group-hover:opacity-100 p-2 bg-red-600 text-white rounded-full">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                            <div className="p-2">
                                <span className="text-xs text-gray-500">{m.media_type}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function LeadsTab({ project }: { project: ProjectDetail }) {
    if (!project.leads || project.leads.length === 0) {
        return <div className="bg-white shadow rounded-lg p-6 text-center text-gray-500 text-sm">No leads for this project yet.</div>;
    }

    return (
        <div className="bg-white shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Phone</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Config</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Date</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {project.leads.map(lead => (
                        <tr key={lead.id}>
                            <td className="px-4 py-3 text-sm text-gray-900">{lead.contact?.name || 'N/A'}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{lead.contact?.phone_number}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{lead.configuration || '-'}</td>
                            <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{lead.status}</span></td>
                            <td className="px-4 py-3 text-sm text-gray-500">{new Date(lead.created_at).toLocaleDateString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function formatINR(n: number): string {
    if (n >= 10000000) return `${(n / 10000000).toFixed(2)} Cr`;
    if (n >= 100000) return `${(n / 100000).toFixed(2)} L`;
    return n.toLocaleString('en-IN');
}
