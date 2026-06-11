import { useState, useEffect } from 'react';
import { getAppointments, getCalendarSummary, updateAppointment, cancelAppointment } from '../api/client';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';

interface Appointment {
    id: string;
    title: string;
    description?: string;
    type: string;
    scheduled_at: string;
    duration: number;
    status: string;
    contact: {
        phone_number: string;
        name?: string;
        email?: string;
    };
    property?: {
        id: string;
        location?: string;
        type?: string;
        price?: number;
    };
    assigned_to_agent?: {
        id: string;
        name: string;
        phone?: string;
    };
    location?: string;
}

interface Summary {
    today: number;
    this_week: number;
    pending: number;
}

export function CalendarView() {
    const { showToast } = useToast();
    const confirm = useConfirm();
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [summary, setSummary] = useState<Summary>({ today: 0, this_week: 0, pending: 0 });
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({
        status: 'all',
        type: 'all',
    });
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

    useEffect(() => {
        loadData();
    }, [filter]);

    const loadData = async () => {
        setLoading(true);
        try {
            const params: any = {};
            if (filter.status !== 'all') params.status = filter.status;
            if (filter.type !== 'all') params.type = filter.type;

            const [appointmentsData, summaryData] = await Promise.all([
                getAppointments(params),
                getCalendarSummary(),
            ]);

            setAppointments(appointmentsData.appointments || []);
            setSummary(summaryData.summary || { today: 0, this_week: 0, pending: 0 });
        } catch (error) {
            console.error('Failed to load calendar data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (id: string, status: string) => {
        try {
            await updateAppointment(id, { status });
            loadData();
            setSelectedAppointment(null);
        } catch (error) {
            console.error('Failed to update appointment:', error);
            showToast('Failed to update appointment status', 'error');
        }
    };

    const handleCancel = async (id: string) => {
        const ok = await confirm('Are you sure you want to cancel this appointment?');
        if (!ok) return;

        try {
            await cancelAppointment(id);
            loadData();
            setSelectedAppointment(null);
        } catch (error) {
            console.error('Failed to cancel appointment:', error);
            showToast('Failed to cancel appointment', 'error');
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-IN', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'scheduled': return '#3b82f6';
            case 'confirmed': return '#22c55e';
            case 'completed': return '#6b7280';
            case 'cancelled': return '#ef4444';
            case 'rescheduled': return '#f59e0b';
            case 'no_show': return '#dc2626';
            default: return 'var(--text-muted)';
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'property_visit': return '🏠';
            case 'follow_up_call': return '📞';
            case 'meeting': return '🤝';
            case 'site_visit': return '📍';
            case 'documentation': return '📄';
            case 'negotiation': return '💼';
            case 'contract_signing': return '✍️';
            case 'handover': return '🔑';
            default: return '📅';
        }
    };

    return (
        <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
            {/* Header */}
            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ margin: 0, fontSize: '28px', color: 'var(--text-primary)', fontWeight: 700 }}>
                    📅 Calendar & Appointments
                </h1>
                <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: '14px' }}>
                    Manage all property visits, meetings, and appointments
                </p>
            </div>

            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                <div style={{
                    backgroundColor: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px',
                    border: '1px solid var(--border-secondary)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                    <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>Today's Appointments</div>
                    <div style={{ fontSize: '32px', fontWeight: 700, color: '#3b82f6' }}>{summary.today}</div>
                </div>
                <div style={{
                    backgroundColor: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px',
                    border: '1px solid var(--border-secondary)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                    <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>This Week</div>
                    <div style={{ fontSize: '32px', fontWeight: 700, color: '#22c55e' }}>{summary.this_week}</div>
                </div>
                <div style={{
                    backgroundColor: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px',
                    border: '1px solid var(--border-secondary)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                    <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>Pending</div>
                    <div style={{ fontSize: '32px', fontWeight: 700, color: '#f59e0b' }}>{summary.pending}</div>
                </div>
            </div>

            {/* Filters */}
            <div style={{
                backgroundColor: 'var(--bg-secondary)', padding: '16px', borderRadius: '12px',
                border: '1px solid var(--border-secondary)', marginBottom: '24px',
                display: 'flex', gap: '12px', alignItems: 'center'
            }}>
                <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 500 }}>Filters:</span>
                <select
                    value={filter.status}
                    onChange={(e) => setFilter({ ...filter, status: e.target.value })}
                    style={{
                        padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-secondary)',
                        fontSize: '14px', color: 'var(--text-primary)', cursor: 'pointer'
                    }}
                >
                    <option value="all">All Status</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                </select>
                <select
                    value={filter.type}
                    onChange={(e) => setFilter({ ...filter, type: e.target.value })}
                    style={{
                        padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-secondary)',
                        fontSize: '14px', color: 'var(--text-primary)', cursor: 'pointer'
                    }}
                >
                    <option value="all">All Types</option>
                    <option value="property_visit">Property Visit</option>
                    <option value="follow_up_call">Follow-up Call</option>
                    <option value="meeting">Meeting</option>
                    <option value="site_visit">Site Visit</option>
                </select>
                <button
                    onClick={loadData}
                    style={{
                        padding: '8px 16px', borderRadius: '8px', border: 'none',
                        backgroundColor: '#3b82f6', color: '#fff', fontSize: '14px',
                        cursor: 'pointer', fontWeight: 500, marginLeft: 'auto'
                    }}
                >
                    🔄 Refresh
                </button>
            </div>

            {/* Appointments List */}
            <div style={{
                backgroundColor: 'var(--bg-secondary)', borderRadius: '12px',
                border: '1px solid var(--border-secondary)', overflow: 'hidden'
            }}>
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Loading appointments...
                    </div>
                ) : appointments.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No appointments found
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-secondary)' }}>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Type</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Appointment</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Contact</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Date & Time</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {appointments.map((apt) => (
                                <tr key={apt.id} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                                    <td style={{ padding: '16px' }}>
                                        <span style={{ fontSize: '24px' }}>{getTypeIcon(apt.type)}</span>
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                                            {apt.title}
                                        </div>
                                        {apt.property && (
                                            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                                {apt.property.type} in {apt.property.location}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
                                            {apt.contact.name || 'Unknown'}
                                        </div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                            {apt.contact.phone_number}
                                        </div>
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 500 }}>
                                            {formatDate(apt.scheduled_at)}
                                        </div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                            {formatTime(apt.scheduled_at)} ({apt.duration} min)
                                        </div>
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <span style={{
                                            padding: '4px 12px', borderRadius: '12px',
                                            fontSize: '12px', fontWeight: 600,
                                            backgroundColor: `${getStatusColor(apt.status)}20`,
                                            color: getStatusColor(apt.status)
                                        }}>
                                            {apt.status.toUpperCase().replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <button
                                            onClick={() => setSelectedAppointment(apt)}
                                            style={{
                                                padding: '6px 12px', borderRadius: '6px',
                                                border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
                                                fontSize: '13px', cursor: 'pointer', color: '#3b82f6',
                                                fontWeight: 500
                                            }}
                                        >
                                            Details
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Appointment Detail Modal */}
            {selectedAppointment && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }} onClick={() => setSelectedAppointment(null)}>
                    <div style={{
                        backgroundColor: 'var(--bg-secondary)', borderRadius: '16px', padding: '24px',
                        maxWidth: '600px', width: '90%', maxHeight: '80vh', overflow: 'auto'
                    }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--text-primary)' }}>
                                    {getTypeIcon(selectedAppointment.type)} {selectedAppointment.title}
                                </h2>
                                <span style={{
                                    display: 'inline-block', marginTop: '8px',
                                    padding: '4px 12px', borderRadius: '12px',
                                    fontSize: '12px', fontWeight: 600,
                                    backgroundColor: `${getStatusColor(selectedAppointment.status)}20`,
                                    color: getStatusColor(selectedAppointment.status)
                                }}>
                                    {selectedAppointment.status.toUpperCase()}
                                </span>
                            </div>
                            <button
                                onClick={() => setSelectedAppointment(null)}
                                style={{
                                    border: 'none', background: 'none', fontSize: '24px',
                                    cursor: 'pointer', color: 'var(--text-muted)'
                                }}
                            >
                                ×
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Date & Time */}
                            <div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>DATE & TIME</div>
                                <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                                    {formatDate(selectedAppointment.scheduled_at)} at {formatTime(selectedAppointment.scheduled_at)}
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Duration: {selectedAppointment.duration} minutes</div>
                            </div>

                            {/* Contact */}
                            <div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>CONTACT</div>
                                <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{selectedAppointment.contact.name || 'Unknown'}</div>
                                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{selectedAppointment.contact.phone_number}</div>
                                {selectedAppointment.contact.email && (
                                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{selectedAppointment.contact.email}</div>
                                )}
                            </div>

                            {/* Property */}
                            {selectedAppointment.property && (
                                <div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>PROPERTY</div>
                                    <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                                        {selectedAppointment.property.type} in {selectedAppointment.property.location}
                                    </div>
                                    {selectedAppointment.property.price && (
                                        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                            Price: ₹{selectedAppointment.property.price.toLocaleString()}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Assigned Agent */}
                            {selectedAppointment.assigned_to_agent && (
                                <div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>ASSIGNED TO</div>
                                    <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{selectedAppointment.assigned_to_agent.name}</div>
                                    {selectedAppointment.assigned_to_agent.phone && (
                                        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{selectedAppointment.assigned_to_agent.phone}</div>
                                    )}
                                </div>
                            )}

                            {/* Description */}
                            {selectedAppointment.description && (
                                <div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>DESCRIPTION</div>
                                    <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{selectedAppointment.description}</div>
                                </div>
                            )}

                            {/* Actions */}
                            {selectedAppointment.status !== 'completed' && selectedAppointment.status !== 'cancelled' && (
                                <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                                    {selectedAppointment.status === 'scheduled' && (
                                        <button
                                            onClick={() => handleStatusChange(selectedAppointment.id, 'confirmed')}
                                            style={{
                                                flex: 1, padding: '10px', borderRadius: '8px',
                                                border: 'none', backgroundColor: '#22c55e', color: '#fff',
                                                fontSize: '14px', fontWeight: 600, cursor: 'pointer'
                                            }}
                                        >
                                            ✓ Confirm
                                        </button>
                                    )}
                                    {(selectedAppointment.status === 'confirmed' || selectedAppointment.status === 'scheduled') && (
                                        <button
                                            onClick={() => handleStatusChange(selectedAppointment.id, 'completed')}
                                            style={{
                                                flex: 1, padding: '10px', borderRadius: '8px',
                                                border: 'none', backgroundColor: '#3b82f6', color: '#fff',
                                                fontSize: '14px', fontWeight: 600, cursor: 'pointer'
                                            }}
                                        >
                                            ✓ Mark Complete
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleCancel(selectedAppointment.id)}
                                        style={{
                                            flex: 1, padding: '10px', borderRadius: '8px',
                                            border: '1px solid #ef4444', backgroundColor: 'var(--bg-secondary)', color: '#ef4444',
                                            fontSize: '14px', fontWeight: 600, cursor: 'pointer'
                                        }}
                                    >
                                        ✕ Cancel
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
