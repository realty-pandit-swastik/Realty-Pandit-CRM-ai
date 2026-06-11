'use client';

import { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import api from '@/lib/api';

interface Appointment {
    id: string;
    lead: {
        contact: { name: string | null; phone_number: string };
    };
    project: { name: string };
    scheduled_date: string;
    scheduled_time: string | null;
    status: string;
}

const STATUS_COLORS: Record<string, string> = {
    SCHEDULED: 'bg-blue-100 text-blue-700',
    CONFIRMED: 'bg-emerald-100 text-emerald-700',
    VISITED: 'bg-green-100 text-green-700',
    NO_SHOW: 'bg-red-100 text-red-700',
    CANCELLED: 'bg-gray-100 text-gray-500',
};

export default function BuilderAppointments() {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAppointments = async () => {
            try {
                const res = await api.get('/builder/appointments', { params: { page: 1, limit: 50 } });
                setAppointments(res.data.appointments || res.data);
            } catch (err) {
                console.error('Failed to fetch appointments', err);
            } finally {
                setLoading(false);
            }
        };
        fetchAppointments();
    }, []);

    const updateStatus = async (id: string, status: string) => {
        try {
            await api.patch(`/builder/appointments/${id}/status`, { status });
            setAppointments(appointments.map(a => a.id === id ? { ...a, status } : a));
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to update');
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-gray-900">Appointments</h1>
                <p className="mt-1 text-sm text-gray-500">Site visits and scheduled meetings</p>
            </div>

            {loading ? (
                <div className="text-center py-12 text-gray-500">Loading appointments...</div>
            ) : appointments.length === 0 ? (
                <div className="bg-white shadow rounded-lg p-8 text-center">
                    <Calendar className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No appointments</h3>
                    <p className="mt-1 text-sm text-gray-500">Appointments will appear here when buyers schedule site visits.</p>
                </div>
            ) : (
                <div className="bg-white shadow rounded-lg overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Buyer</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Project</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Date</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Time</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {appointments.map(apt => (
                                <tr key={apt.id}>
                                    <td className="px-4 py-3">
                                        <p className="text-sm font-medium text-gray-900">{apt.lead?.contact?.name || 'N/A'}</p>
                                        <p className="text-xs text-gray-500">{apt.lead?.contact?.phone_number}</p>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-700">{apt.project?.name}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700">{new Date(apt.scheduled_date).toLocaleDateString()}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{apt.scheduled_time || '-'}</td>
                                    <td className="px-4 py-3">
                                        <select
                                            value={apt.status}
                                            onChange={(e) => updateStatus(apt.id, e.target.value)}
                                            className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${STATUS_COLORS[apt.status] || 'bg-gray-100'}`}
                                        >
                                            {Object.keys(STATUS_COLORS).map(s => (
                                                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                                            ))}
                                        </select>
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
