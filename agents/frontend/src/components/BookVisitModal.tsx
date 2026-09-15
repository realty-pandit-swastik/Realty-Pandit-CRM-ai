import { useState, useEffect, useCallback } from 'react';
import { searchContactByPhone, ensureContact, createAppointment, getTeamMembersList } from '../api/client';

interface BookVisitModalProps {
    item: any;
    onClose: () => void;
    onBooked: () => void;
}

export default function BookVisitModal({ item, onClose, onBooked }: BookVisitModalProps) {
    const [step, setStep] = useState<'search' | 'schedule'>('search');

    // Step 1: Search client
    const [phone, setPhone] = useState('');
    const [clientName, setClientName] = useState('');
    const [searching, setSearching] = useState(false);
    const [foundContact, setFoundContact] = useState<any>(null);
    const [searched, setSearched] = useState(false);

    // Step 2: Schedule
    const [visitDate, setVisitDate] = useState('');
    const [visitTime, setVisitTime] = useState('10:00');
    const [duration, setDuration] = useState(30);
    const [assignedAgent, setAssignedAgent] = useState('');
    const [agents, setAgents] = useState<any[]>([]);
    const [booking, setBooking] = useState(false);
    const [booked, setBooked] = useState(false);
    const [error, setError] = useState('');

    const isMobile = window.innerWidth < 768;

    // Load team members for assignment dropdown
    useEffect(() => {
        getTeamMembersList().then(data => {
            setAgents(Array.isArray(data) ? data : data?.members || []);
        }).catch(err => {
            console.error('[BookVisitModal] failed to load team members:', err);
        });
    }, []);

    // Set default date to tomorrow
    useEffect(() => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setVisitDate(tomorrow.toISOString().split('T')[0]);
    }, []);

    const handleSearch = useCallback(async () => {
        if (!phone || phone.length < 10) {
            setError('Enter a valid phone number');
            return;
        }
        setSearching(true);
        setError('');
        try {
            const res = await searchContactByPhone(phone);
            setFoundContact(res.contact);
            if (res.contact?.name) setClientName(res.contact.name);
            setSearched(true);
        } catch (err) {
            console.error('[BookVisitModal] contact search failed:', err);
            setError('Search failed');
        } finally {
            setSearching(false);
        }
    }, [phone]);

    const handleProceed = () => {
        if (!phone || phone.length < 10) {
            setError('Enter a valid phone number');
            return;
        }
        setError('');
        setStep('schedule');
    };

    const handleBook = async () => {
        if (!visitDate || !visitTime) {
            setError('Date and time are required');
            return;
        }
        setBooking(true);
        setError('');
        try {
            // Ensure contact exists first
            await ensureContact(phone, clientName || undefined);

            // Create appointment
            const typeName = item.flat_property_type?.name || item.type?.toUpperCase() || 'Property';
            await createAppointment({
                contact_id: phone,
                title: `Property Visit - ${typeName} in ${item.location || item.full_address || 'TBD'}`,
                description: `Visit scheduled from inventory management for ${item.display_id || item.id}`,
                type: 'property_visit',
                scheduled_at: `${visitDate}T${visitTime}:00`,
                duration,
                assigned_to_agent_id: assignedAgent || undefined,
                property_id: item.id,
                location: item.full_address || item.location || undefined,
                source: 'manual',
                channel: 'admin',
            });
            setBooked(true);
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Failed to book visit');
        } finally {
            setBooking(false);
        }
    };

    const specs = item.specs as any;
    const price = item.display_price || item.price;
    const typeName = item.flat_property_type?.name || item.type?.toUpperCase() || 'Property';

    const s = {
        overlay: {
            position: 'fixed' as const, inset: 0, backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        },
        modal: {
            backgroundColor: 'var(--bg-secondary)', borderRadius: isMobile ? '12px 12px 0 0' : '12px',
            padding: isMobile ? '20px 16px' : '28px',
            width: isMobile ? '100%' : '480px', maxWidth: '90vw',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            maxHeight: isMobile ? '90vh' : undefined, overflowY: 'auto' as const,
        },
        title: { color: 'var(--text-primary)', fontSize: '18px', fontWeight: 700, margin: '0 0 16px' },
        label: { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px', display: 'block' },
        input: {
            width: '100%', padding: '8px 12px', borderRadius: '6px',
            border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)', fontSize: '14px', marginBottom: '12px',
            boxSizing: 'border-box' as const,
        },
        select: {
            width: '100%', padding: '8px 12px', borderRadius: '6px',
            border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)', fontSize: '14px', marginBottom: '12px',
            boxSizing: 'border-box' as const,
        },
        btnPrimary: {
            backgroundColor: '#8b5cf6', color: '#fff', border: 'none',
            padding: '10px 20px', borderRadius: '8px', cursor: 'pointer',
            fontSize: '14px', fontWeight: 600,
        },
        btnRow: { display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' },
        cancelBtn: {
            background: 'var(--border-secondary)', border: 'none', color: 'var(--text-secondary)',
            padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
        },
        propertyPreview: {
            backgroundColor: 'var(--bg-primary)', borderRadius: '8px', padding: '12px',
            marginBottom: '16px', border: '1px solid var(--border-secondary)',
        },
        contactCard: {
            backgroundColor: 'var(--bg-primary)', borderRadius: '8px', padding: '12px',
            marginBottom: '12px', border: '1px solid #22c55e40',
        },
        newContact: {
            backgroundColor: 'var(--bg-primary)', borderRadius: '8px', padding: '12px',
            marginBottom: '12px', border: '1px solid #f59e0b40',
        },
        searchRow: {
            display: 'flex', gap: '8px', marginBottom: '12px',
        },
        row: {
            display: 'flex', gap: '12px',
        },
    };

    return (
        <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
            <div style={s.modal}>
                <h3 style={s.title}>
                    {booked ? 'Visit Booked!' : step === 'search' ? 'Book a Visit — Find Client' : 'Book a Visit — Schedule'}
                </h3>

                {/* Property Preview */}
                <div style={s.propertyPreview}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                        {typeName}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {item.full_address || item.location || 'Location N/A'}
                        {specs?.bedrooms ? ` | ${specs.bedrooms} BHK` : ''}
                        {price ? ` | ₹${Number(price) >= 10000000 ? (Number(price) / 10000000).toFixed(1) + ' Cr' : Number(price) >= 100000 ? (Number(price) / 100000).toFixed(1) + ' Lakh' : Number(price).toLocaleString('en-IN')}` : ''}
                    </div>
                </div>

                {booked ? (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            <span style={{ fontSize: '24px' }}>✅</span>
                            <div>
                                <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Visit scheduled successfully!</div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                                    {visitDate} at {visitTime} | {clientName || phone}
                                </div>
                            </div>
                        </div>
                        <div style={s.btnRow}>
                            <button style={s.cancelBtn} onClick={onBooked}>Done</button>
                        </div>
                    </div>
                ) : step === 'search' ? (
                    <>
                        <label style={s.label}>Client Phone Number *</label>
                        <div style={s.searchRow}>
                            <input
                                style={{ ...s.input, flex: 1, marginBottom: 0 }}
                                type="tel"
                                placeholder="Enter 10-digit phone number"
                                value={phone}
                                onChange={e => { setPhone(e.target.value); setSearched(false); setFoundContact(null); }}
                                maxLength={13}
                                autoFocus
                                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            />
                            <button
                                style={{ ...s.btnPrimary, backgroundColor: '#3b82f6', padding: '8px 16px', opacity: searching ? 0.6 : 1 }}
                                disabled={searching}
                                onClick={handleSearch}
                            >
                                {searching ? '...' : 'Search'}
                            </button>
                        </div>

                        {/* Found contact */}
                        {searched && foundContact && (
                            <div style={s.contactCard}>
                                <div style={{ fontWeight: 600, color: '#22c55e', fontSize: '13px', marginBottom: '4px' }}>
                                    Existing Contact Found
                                </div>
                                <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{foundContact.name || 'Unnamed'}</div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                                    {foundContact.phone_number} | {foundContact.contact_type?.replace('_', ' ')}
                                    {foundContact.lifecycle_stage ? ` | ${foundContact.lifecycle_stage}` : ''}
                                </div>
                            </div>
                        )}

                        {/* New contact */}
                        {searched && !foundContact && (
                            <div style={s.newContact}>
                                <div style={{ fontWeight: 600, color: '#f59e0b', fontSize: '13px', marginBottom: '8px' }}>
                                    New contact — will be created automatically
                                </div>
                                <label style={s.label}>Client Name</label>
                                <input
                                    style={s.input}
                                    type="text"
                                    placeholder="Enter client name"
                                    value={clientName}
                                    onChange={e => setClientName(e.target.value)}
                                />
                            </div>
                        )}

                        {error && (
                            <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '12px' }}>{error}</div>
                        )}

                        <div style={s.btnRow}>
                            <button style={s.cancelBtn} onClick={onClose}>Cancel</button>
                            <button
                                style={{ ...s.btnPrimary, opacity: !searched ? 0.5 : 1 }}
                                disabled={!searched}
                                onClick={handleProceed}
                            >
                                Next — Schedule Visit
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        {/* Client summary */}
                        <div style={{ ...s.contactCard, border: '1px solid var(--border-secondary)' }}>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                Client: <strong style={{ color: 'var(--text-primary)' }}>{clientName || phone}</strong>
                                {' '}({phone})
                            </div>
                        </div>

                        <div style={s.row}>
                            <div style={{ flex: 1 }}>
                                <label style={s.label}>Visit Date *</label>
                                <input
                                    style={s.input}
                                    type="date"
                                    value={visitDate}
                                    onChange={e => setVisitDate(e.target.value)}
                                    min={new Date().toISOString().split('T')[0]}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={s.label}>Visit Time *</label>
                                <input
                                    style={s.input}
                                    type="time"
                                    value={visitTime}
                                    onChange={e => setVisitTime(e.target.value)}
                                />
                            </div>
                        </div>

                        <div style={s.row}>
                            <div style={{ flex: 1 }}>
                                <label style={s.label}>Duration</label>
                                <select
                                    style={s.select}
                                    value={duration}
                                    onChange={e => setDuration(Number(e.target.value))}
                                >
                                    <option value={30}>30 minutes</option>
                                    <option value={45}>45 minutes</option>
                                    <option value={60}>1 hour</option>
                                    <option value={90}>1.5 hours</option>
                                </select>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={s.label}>Assign to Agent</label>
                                <select
                                    style={s.select}
                                    value={assignedAgent}
                                    onChange={e => setAssignedAgent(e.target.value)}
                                >
                                    <option value="">Auto (self)</option>
                                    {agents.map((a: any) => (
                                        <option key={a.id} value={a.id}>{a.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {error && (
                            <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '12px' }}>{error}</div>
                        )}

                        <div style={s.btnRow}>
                            <button style={s.cancelBtn} onClick={() => setStep('search')}>Back</button>
                            <button
                                style={{ ...s.btnPrimary, opacity: booking ? 0.6 : 1 }}
                                disabled={booking}
                                onClick={handleBook}
                            >
                                {booking ? 'Booking...' : 'Book Visit'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
