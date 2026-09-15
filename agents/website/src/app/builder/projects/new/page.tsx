'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import api from '@/lib/api';

export default function NewProject() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState({
        name: '',
        projectType: 'RESIDENTIAL',
        city: '',
        locality: '',
        googleMapLink: '',
        reraNumber: '',
        possessionDate: '',
        projectStatus: 'UNDER_CONSTRUCTION',
        shortDescription: '',
        longDescription: '',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await api.post('/builder/projects', form);
            router.push(`/builder/projects/${res.data.id}`);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to create project');
        } finally {
            setLoading(false);
        }
    };

    const inputClass = "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:ring-emerald-500";

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <Link href="/builder/projects" className="text-gray-400 hover:text-gray-600">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <h1 className="text-2xl font-semibold text-gray-900">Create New Project</h1>
            </div>

            {error && (
                <div className="bg-red-50 border-l-4 border-red-400 p-4">
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg divide-y divide-gray-200">
                <div className="p-6 space-y-4">
                    <h3 className="text-lg font-medium text-gray-900">Basic Information</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                            <label className="block text-sm font-medium text-gray-700">Project Name *</label>
                            <input name="name" value={form.name} onChange={handleChange} required className={inputClass} placeholder="e.g., Sunshine Residency" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Project Type *</label>
                            <select name="projectType" value={form.projectType} onChange={handleChange} className={inputClass}>
                                <option value="RESIDENTIAL">Residential</option>
                                <option value="COMMERCIAL">Commercial</option>
                                <option value="MIXED_USE">Mixed Use</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Project Status</label>
                            <select name="projectStatus" value={form.projectStatus} onChange={handleChange} className={inputClass}>
                                <option value="UPCOMING">Upcoming</option>
                                <option value="UNDER_CONSTRUCTION">Under Construction</option>
                                <option value="READY_TO_MOVE">Ready to Move</option>
                                <option value="DELIVERED">Delivered</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="p-6 space-y-4">
                    <h3 className="text-lg font-medium text-gray-900">Location</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">City *</label>
                            <input name="city" value={form.city} onChange={handleChange} required className={inputClass} placeholder="e.g., Noida" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Locality *</label>
                            <input name="locality" value={form.locality} onChange={handleChange} required className={inputClass} placeholder="e.g., Sector 150" />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-sm font-medium text-gray-700">Google Maps Link</label>
                            <input name="googleMapLink" value={form.googleMapLink} onChange={handleChange} className={inputClass} placeholder="https://maps.google.com/..." />
                        </div>
                    </div>
                </div>

                <div className="p-6 space-y-4">
                    <h3 className="text-lg font-medium text-gray-900">Details</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">RERA Number</label>
                            <input name="reraNumber" value={form.reraNumber} onChange={handleChange} className={inputClass} placeholder="e.g., UPRERAPRJ12345" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Possession Date</label>
                            <input name="possessionDate" type="date" value={form.possessionDate} onChange={handleChange} className={inputClass} />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-sm font-medium text-gray-700">Short Description *</label>
                            <textarea name="shortDescription" value={form.shortDescription} onChange={handleChange} required rows={2} className={inputClass} placeholder="Brief description of the project" />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-sm font-medium text-gray-700">Detailed Description</label>
                            <textarea name="longDescription" value={form.longDescription} onChange={handleChange} rows={4} className={inputClass} placeholder="Detailed project description, amenities, highlights..." />
                        </div>
                    </div>
                </div>

                <div className="p-6 flex justify-end gap-3">
                    <Link href="/builder/projects" className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                        Cancel
                    </Link>
                    <button type="submit" disabled={loading} className="px-6 py-2 text-sm font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50">
                        {loading ? 'Creating...' : 'Create Project'}
                    </button>
                </div>
            </form>
        </div>
    );
}
