'use client';

import { useEffect, useState } from 'react';
import { Calendar, Clock, Phone, MapPin } from 'lucide-react';
import api from '@/lib/api';

interface Appointment {
    id: string;
    property: string;
    buyer_name: string;
    buyer_phone: string;
    date: string;
    time: string;
    status: string;
    location?: string;
    isMasked: boolean;
}

export default function AgentAppointments() {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);

    const token = typeof window !== 'undefined' ? localStorage.getItem('agent_token') : null;
    const headers = { Authorization: `Bearer ${token}` };

    useEffect(() => {
        if (!token) { setLoading(false); return; }
        api.get('/agent/appointments', { headers })
            .then(res => setAppointments(res.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-gray-900">Appointments</h1>
                <p className="mt-1 text-sm text-gray-500">Upcoming site visits for your properties.</p>
            </div>

            {loading ? (
                <div className="text-center py-8 text-gray-500">Loading appointments...</div>
            ) : appointments.length === 0 ? (
                <div className="text-center py-12">
                    <Calendar className="mx-auto h-12 w-12 text-gray-300" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No appointments scheduled</h3>
                    <p className="mt-1 text-sm text-gray-500">When buyers schedule visits to your properties, they will appear here.</p>
                </div>
            ) : (
                <div className="grid gap-6 lg:grid-cols-2">
                    {appointments.map((apt) => (
                        <div key={apt.id} className="bg-white shadow rounded-lg p-6 border-l-4 border-indigo-500">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-lg font-medium text-gray-900">{apt.property || 'Property Visit'}</h3>
                                    {apt.date && (
                                        <div className="mt-2 flex items-center text-sm text-gray-500">
                                            <Calendar className="w-4 h-4 mr-2" />
                                            {formatDate(apt.date)}
                                        </div>
                                    )}
                                    {apt.time && (
                                        <div className="mt-1 flex items-center text-sm text-gray-500">
                                            <Clock className="w-4 h-4 mr-2" />
                                            {apt.time}
                                        </div>
                                    )}
                                    {apt.location && (
                                        <div className="mt-1 flex items-center text-sm text-gray-500">
                                            <MapPin className="w-4 h-4 mr-2" />
                                            {apt.location}
                                        </div>
                                    )}
                                </div>
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                    apt.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                                    apt.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                                    apt.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                    'bg-yellow-100 text-yellow-800'
                                }`}>
                                    {apt.status}
                                </span>
                            </div>

                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center">
                                        <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                                            {apt.isMasked ? '?' : (apt.buyer_name || '?')[0]}
                                        </div>
                                        <div className="ml-3">
                                            <p className="text-sm font-medium text-gray-900">{apt.buyer_name || 'Buyer'}</p>
                                            <p className="text-xs text-gray-500 flex items-center">
                                                <Phone className="w-3 h-3 mr-1" />
                                                {apt.isMasked ? 'Contact hidden' : apt.buyer_phone}
                                            </p>
                                        </div>
                                    </div>
                                    {!apt.isMasked && apt.buyer_phone && (
                                        <a href={`tel:${apt.buyer_phone}`}
                                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                                            Call
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
