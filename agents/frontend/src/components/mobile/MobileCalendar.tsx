
import { useEffect, useState } from 'react';
import { getAppointments, updateAppointment } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { PresentationIcon } from '../ui/PresentationIcon';

const CARD_RADIUS = '12px';

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
    scheduled: { bg: 'var(--blue-50)', color: 'var(--blue-500)' },
    confirmed: { bg: 'var(--rp-success-bg)', color: 'var(--rp-success-text)' },
    completed: { bg: 'var(--rp-success-bg)', color: 'var(--rp-success-text)' },
    cancelled: { bg: 'var(--rp-danger-text)', color: 'var(--rp-danger-text)' },
    no_show: { bg: 'var(--rp-warn-bg)', color: 'var(--rp-warn-text)' },
};

const TYPE_ICONS: Record<string, string> = {
    site_visit: 'house', phone_call: 'phone', video_call: 'video', meeting: 'handshake', follow_up: 'refresh-cw',
};

export function MobileCalendar() {
    const { showToast } = useToast();
    const [appointments, setAppointments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');

    useEffect(() => { loadAppointments(); }, [filter]);

    const loadAppointments = async () => {
        try {
            setLoading(true);
            const params: Record<string, any> = {};
            if (filter) params.status = filter;
            const data = await getAppointments(params);
            setAppointments(Array.isArray(data) ? data : data?.data || data?.appointments || []);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const handleStatusChange = async (id: string, status: string) => {
        try {
            await updateAppointment(id, { status });
            await loadAppointments();
        } catch (err: any) {
            showToast(err.response?.data?.error || 'Failed', 'error');
        }
    };

    const filterChips = [
        { key: '', label: 'All' },
        { key: 'scheduled', label: 'Upcoming' },
        { key: 'confirmed', label: 'Confirmed' },
        { key: 'completed', label: 'Done' },
    ];

    // Group by date
    const grouped: Record<string, any[]> = {};
    appointments.forEach(apt => {
        const date = new Date(apt.scheduled_at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(apt);
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Filter Chips */}
            <div style={{ padding: '12px 16px', display: 'flex', gap: '8px', overflowX: 'auto' }}>
                {filterChips.map(chip => (
                    <button key={chip.key} onClick={() => setFilter(chip.key)}
                        style={{
                            flexShrink: 0, padding: '6px 14px', borderRadius: '20px',
                            border: filter === chip.key ? '1px solid var(--blue-600)' : '1px solid var(--border-secondary)',
                            backgroundColor: filter === chip.key ? 'var(--blue-600)' : 'var(--bg-secondary)',
                            color: filter === chip.key ? 'var(--surface-white)' : 'var(--text-secondary)',
                            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                        }}>
                        {chip.label}
                    </button>
                ))}
            </div>

            {/* Appointment List */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Loading...</div>
                ) : appointments.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>No appointments</div>
                ) : (
                    Object.entries(grouped).map(([date, apts]) => (
                        <div key={date} style={{ marginBottom: '16px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700, padding: '8px 0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                {date}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {apts.map(apt => {
                                    const statusStyle = STATUS_COLORS[apt.status] || { bg: 'var(--bg-primary)', color: 'var(--text-muted)' };
                                    const time = new Date(apt.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                                    return (
                                        <div key={apt.id} style={{
                                            backgroundColor: 'var(--bg-secondary)', borderRadius: CARD_RADIUS,
                                            padding: '12px 16px', border: '1px solid var(--border-secondary)',
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <PresentationIcon value={TYPE_ICONS[apt.type] || 'clipboard-list'} size={18} />
                                                    <div>
                                                        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{apt.title}</div>
                                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{time} · {apt.duration || 30}min</div>
                                                    </div>
                                                </div>
                                                <span style={{
                                                    backgroundColor: statusStyle.bg, color: statusStyle.color,
                                                    padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                                                }}>
                                                    {apt.status}
                                                </span>
                                            </div>
                                            {apt.contact && (
                                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                                    <PresentationIcon value="user-round" /> {apt.contact.name || apt.contact.phone_number}
                                                </div>
                                            )}
                                            {apt.location && (
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}><PresentationIcon value="map-pin" /> {apt.location}</div>
                                            )}
                                            {/* Quick actions */}
                                            {apt.status === 'scheduled' && (
                                                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                                    <button onClick={() => handleStatusChange(apt.id, 'confirmed')}
                                                        style={{ flex: 1, padding: '6px', borderRadius: '8px', border: '1px solid var(--rp-success-text)', backgroundColor: 'transparent', color: 'var(--rp-success-text)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                                                        Confirm
                                                    </button>
                                                    <button onClick={() => handleStatusChange(apt.id, 'cancelled')}
                                                        style={{ flex: 1, padding: '6px', borderRadius: '8px', border: '1px solid var(--rp-danger-text)', backgroundColor: 'transparent', color: 'var(--rp-danger-text)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                                                        Cancel
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
