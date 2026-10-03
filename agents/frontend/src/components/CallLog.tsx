/**
 * Call Log Management - Phase 4.1
 * View call history with audio playback, transcripts, and AI summaries
 *
 * Styling note (2026-09-28): this screen was originally written with Tailwind
 * utility classes, but the admin SPA ships NO Tailwind (no tailwindcss dep, no
 * PostCSS plugin, no @tailwind directive — index.css is a CSS-custom-property
 * theme). Those class names compiled to inert strings, so the page rendered
 * unstyled in production. It is now ported to the app's house style: inline
 * styles driven by the --* theme tokens in index.css, like every other CRM tab.
 *
 * Data note: reads through the shared axios client (api/client.ts), which fails
 * loudly in production when VITE_API_BASE_URL is unset. The previous local
 * `authedFetch` + API_BASE_URL pair (lib/api.ts) silently fell back to
 * http://localhost:7071 in a production build.
 */

import { useState, useEffect, useRef } from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Play, Pause, Download, Filter, Calendar, Clock, FileText, MessageSquare } from 'lucide-react';
import client from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import StaffCallReview from './StaffCallReview';

interface VoiceCall {
  id: string;
  phone_number: string;
  contact?: { name?: string };
  call_sid?: string;
  direction: string;
  call_status: string;
  duration?: number;
  recording_url?: string;
  transcript?: string;
  ai_call_summary?: string;
  started_at: string;
  ended_at?: string;
}

const CALL_STATUSES = [
  { value: 'all', label: 'All Calls' },
  { value: 'answered', label: 'Answered' },
  { value: 'missed', label: 'Missed' },
  { value: 'failed', label: 'Failed' },
];

const DIRECTIONS = [
  { value: 'all', label: 'All Directions' },
  { value: 'inbound', label: 'Incoming' },
  { value: 'outbound', label: 'Outgoing' },
];

// ─── House styles (index.css theme tokens — light + dark aware) ───────────────
const s = {
  page: { padding: '24px', maxWidth: '1280px', margin: '0 auto' } as React.CSSProperties,
  h1: { fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' } as React.CSSProperties,
  subtitle: { fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px' } as React.CSSProperties,
  card: { backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', borderRadius: '10px', padding: '16px' } as React.CSSProperties,
  sectionTitle: { fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' } as React.CSSProperties,
  label: { display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' } as React.CSSProperties,
  input: {
    width: '100%', padding: '8px 10px', borderRadius: '8px', boxSizing: 'border-box',
    border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)', fontSize: '13px',
  } as React.CSSProperties,
  statValue: { fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' } as React.CSSProperties,
  statLabel: { fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' } as React.CSSProperties,
  row: { padding: '16px', borderBottom: '1px solid var(--border-secondary)' } as React.CSSProperties,
  iconBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px',
    borderRadius: '999px', border: 'none', backgroundColor: 'var(--accent-primary)', color: '#fff',
    cursor: 'pointer', flexShrink: 0,
  } as React.CSSProperties,
  ghostBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px',
    borderRadius: '8px', border: 'none', backgroundColor: 'transparent', color: 'var(--text-secondary)',
    cursor: 'pointer', flexShrink: 0,
  } as React.CSSProperties,
  linkBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none',
    padding: 0, fontSize: '13px', color: 'var(--text-link)', cursor: 'pointer', fontWeight: 600,
  } as React.CSSProperties,
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 } as React.CSSProperties,
};

export default function CallLog() {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [calls, setCalls] = useState<VoiceCall[]>([]);
  const [filteredCalls, setFilteredCalls] = useState<VoiceCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Audio playback
  const [playingCallId, setPlayingCallId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Expanded details
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

  useEffect(() => {
    // Only fetch if user has view_reports permission
    if (hasPermission('view_reports')) {
      fetchCalls();
    } else {
      setLoading(false);
      setError('You do not have permission to view call logs');
    }
  }, [hasPermission]);

  useEffect(() => {
    applyFilters();
  }, [calls, statusFilter, directionFilter, dateFrom, dateTo, searchQuery]);

  const fetchCalls = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await client.get('/api/calls/voice-log/all');

      if (response.status === 403) {
        // User doesn't have permission - don't show error, just don't render
        console.warn('[CallLog] User lacks view_reports permission');
        setError('You do not have permission to view call logs');
        return;
      }

      const data: any = response.data;
      setCalls(data?.calls || []);
    } catch (err: any) {
      const status = err?.response?.status;
      setError(
        status === 403
          ? 'You do not have permission to view call logs'
          : (err?.response?.data?.error || err?.message || 'Failed to load call log')
      );
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...calls];

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(call => call.call_status === statusFilter);
    }

    // Direction filter
    if (directionFilter !== 'all') {
      filtered = filtered.filter(call => call.direction === directionFilter);
    }

    // Date range filter
    if (dateFrom) {
      filtered = filtered.filter(call =>
        new Date(call.started_at) >= new Date(dateFrom)
      );
    }
    if (dateTo) {
      filtered = filtered.filter(call =>
        new Date(call.started_at) <= new Date(dateTo + 'T23:59:59')
      );
    }

    // Search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(call =>
        (call.phone_number || '').includes(searchQuery) ||
        (call.contact?.name || '').toLowerCase().includes(q) ||
        (call.transcript || '').toLowerCase().includes(q) ||
        (call.ai_call_summary || '').toLowerCase().includes(q)
      );
    }

    setFilteredCalls(filtered);
  };

  const handlePlayPause = async (call: VoiceCall) => {
    if (!call.recording_url) {
      showToast('No recording available for this call', 'info');
      return;
    }

    if (playingCallId === call.id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingCallId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }

      let playUrl = call.recording_url;
      let blobUrlToRevoke: string | null = null;
      if (call.recording_url.startsWith('/api/calls/')) {
        try {
          const res = await client.get(call.recording_url, { responseType: 'blob' });
          playUrl = URL.createObjectURL(res.data);
          blobUrlToRevoke = playUrl;
        } catch {
          showToast('Recording unavailable', 'error');
          return;
        }
      }

      const audio = new Audio(playUrl);
      audioRef.current = audio;

      audio.addEventListener('loadedmetadata', () => {
        setDuration(audio.duration);
      });

      audio.addEventListener('timeupdate', () => {
        setCurrentTime(audio.currentTime);
      });

      audio.addEventListener('ended', () => {
        setPlayingCallId(null);
        setCurrentTime(0);
        if (blobUrlToRevoke) URL.revokeObjectURL(blobUrlToRevoke);
      });

      audio.play();
      setPlayingCallId(call.id);
    }
  };

  const handleSeek = (value: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value;
      setCurrentTime(value);
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getCallIcon = (call: VoiceCall) => {
    if (call.direction === 'inbound') {
      return call.call_status === 'answered'
        ? <PhoneIncoming size={20} color="var(--success-text)" />
        : <PhoneMissed size={20} color="var(--error-text)" />;
    }
    return <PhoneOutgoing size={20} color="var(--btn-blue-text)" />;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'answered': return { backgroundColor: 'var(--success-bg)', color: 'var(--success-text)' };
      case 'missed': return { backgroundColor: 'var(--error-bg)', color: 'var(--error-text)' };
      case 'failed': return { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' };
      default: return { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' };
    }
  };

  const handleDownloadRecording = async (url: string, callId: string) => {
    try {
      let downloadUrl = url;
      let blobUrlToRevoke: string | null = null;
      if (url.startsWith('/api/calls/')) {
        const res = await client.get(url, { responseType: 'blob' });
        downloadUrl = URL.createObjectURL(res.data);
        blobUrlToRevoke = downloadUrl;
      }
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `call_${callId}_${new Date().getTime()}.mp3`;
      link.click();
      if (blobUrlToRevoke) {
        setTimeout(() => URL.revokeObjectURL(blobUrlToRevoke), 1000);
      }
    } catch {
      showToast('Recording unavailable', 'error');
    }
  };

  // Stats
  const stats = {
    total: filteredCalls.length,
    answered: filteredCalls.filter(c => c.call_status === 'answered').length,
    missed: filteredCalls.filter(c => c.call_status === 'missed').length,
    inbound: filteredCalls.filter(c => c.direction === 'inbound').length,
    outbound: filteredCalls.filter(c => c.direction === 'outbound').length,
    totalDuration: filteredCalls.reduce((sum, c) => sum + (c.duration || 0), 0),
  };

  if (loading) {
    return <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>Loading call log...</div>;
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div>
        <h1 style={s.h1}>📞 Call Log</h1>
        <p style={s.subtitle}>View call history with audio playback and AI summaries</p>
      </div>

      {/* Staff call review banner */}
      <StaffCallReview />

      {/* Error Alert */}
      {error && (
        <div style={{ marginBottom: '16px', padding: '12px 14px', backgroundColor: 'var(--error-bg)', border: '1px solid var(--error-text)', color: 'var(--error-text)', borderRadius: '8px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div style={{ ...s.card }}>
          <div style={s.statValue}>{stats.total}</div>
          <div style={s.statLabel}>Total Calls</div>
        </div>
        <div style={{ ...s.card, backgroundColor: 'var(--success-bg)' }}>
          <div style={{ ...s.statValue, color: 'var(--success-text)' }}>{stats.answered}</div>
          <div style={{ ...s.statLabel, color: 'var(--success-text)' }}>Answered</div>
        </div>
        <div style={{ ...s.card, backgroundColor: 'var(--error-bg)' }}>
          <div style={{ ...s.statValue, color: 'var(--error-text)' }}>{stats.missed}</div>
          <div style={{ ...s.statLabel, color: 'var(--error-text)' }}>Missed</div>
        </div>
        <div style={{ ...s.card, backgroundColor: 'var(--btn-blue-bg)' }}>
          <div style={{ ...s.statValue, color: 'var(--btn-blue-text)' }}>{stats.inbound}</div>
          <div style={{ ...s.statLabel, color: 'var(--btn-blue-text)' }}>Incoming</div>
        </div>
        <div style={{ ...s.card, backgroundColor: 'var(--btn-purple-bg)' }}>
          <div style={{ ...s.statValue, color: 'var(--btn-purple-text)' }}>{stats.outbound}</div>
          <div style={{ ...s.statLabel, color: 'var(--btn-purple-text)' }}>Outgoing</div>
        </div>
        <div style={{ ...s.card, backgroundColor: 'var(--btn-orange-bg)' }}>
          <div style={{ ...s.statValue, color: 'var(--btn-orange-text)' }}>{formatDuration(stats.totalDuration)}</div>
          <div style={{ ...s.statLabel, color: 'var(--btn-orange-text)' }}>Total Duration</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ ...s.card, marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Filter size={18} color="var(--text-secondary)" />
          <span style={s.sectionTitle}>Filters</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
          <div>
            <label htmlFor="calllog-search" style={s.label}>Search</label>
            <input
              id="calllog-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Phone, name, transcript..."
              style={s.input}
            />
          </div>
          <div>
            <label htmlFor="status-filter" style={s.label}>Status</label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={s.input}
            >
              {CALL_STATUSES.map(st => (
                <option key={st.value} value={st.value}>{st.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="direction-filter" style={s.label}>Direction</label>
            <select
              id="direction-filter"
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value)}
              style={s.input}
            >
              {DIRECTIONS.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="date-from" style={s.label}>From Date</label>
            <input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={s.input}
            />
          </div>
          <div>
            <label htmlFor="date-to" style={s.label}>To Date</label>
            <input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={s.input}
            />
          </div>
        </div>
      </div>

      {/* Call List */}
      <div style={s.card}>
        <div style={{ paddingBottom: '12px', borderBottom: '1px solid var(--border-secondary)' }}>
          <span style={s.sectionTitle}>Call History ({filteredCalls.length})</span>
        </div>

        {filteredCalls.length === 0 ? (
          <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Phone size={48} color="var(--border-secondary)" style={{ marginBottom: '12px' }} />
            <div style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>No calls found</div>
            <div style={{ fontSize: '13px', marginTop: '2px' }}>Try adjusting your filters</div>
          </div>
        ) : (
          <div>
            {filteredCalls.map(call => (
              <div key={call.id} style={s.row}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                  {/* Icon */}
                  <div style={{ marginTop: '2px' }}>{getCallIcon(call)}</div>

                  {/* Main Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {call.contact?.name || call.phone_number}
                        </div>
                        {call.contact?.name && (
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{call.phone_number}</div>
                        )}
                      </div>
                      <span style={{ ...s.badge, ...getStatusColor(call.call_status) }}>
                        {(call.call_status || '').toUpperCase()}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={14} color="var(--text-muted)" />
                        {formatDate(call.started_at)}
                      </span>
                      {call.duration ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={14} color="var(--text-muted)" />
                          {formatDuration(call.duration)}
                        </span>
                      ) : null}
                      <span style={{ textTransform: 'capitalize' }}>
                        {call.direction === 'inbound' ? 'Incoming' : 'Outgoing'}
                      </span>
                    </div>

                    {/* AI Summary (if available) */}
                    {call.ai_call_summary && (
                      <div style={{ marginBottom: '12px', padding: '12px', backgroundColor: 'var(--btn-blue-bg)', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                          <MessageSquare size={14} color="var(--btn-blue-text)" />
                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--btn-blue-text)' }}>AI Summary</span>
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{call.ai_call_summary}</div>
                      </div>
                    )}

                    {/* Audio Playback (if recording available) */}
                    {call.recording_url && (
                      <div style={{ marginBottom: '12px', padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <button
                            type="button"
                            onClick={() => handlePlayPause(call)}
                            style={s.iconBtn}
                            title={playingCallId === call.id ? 'Pause' : 'Play recording'}
                          >
                            {playingCallId === call.id ? <Pause size={16} color="#fff" /> : <Play size={16} color="#fff" />}
                          </button>

                          {playingCallId === call.id ? (
                            <div style={{ flex: 1 }}>
                              <input
                                aria-label="Audio scrubber"
                                type="range"
                                min={0}
                                max={duration || 0}
                                value={currentTime}
                                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                                style={{ width: '100%' }}
                              />
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                <span>{formatDuration(currentTime)}</span>
                                <span>{formatDuration(duration)}</span>
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Recording available</span>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDownloadRecording(call.recording_url!, call.id)}
                            style={s.ghostBtn}
                            title="Download recording"
                          >
                            <Download size={16} color="var(--text-secondary)" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Transcript Toggle */}
                    {call.transcript && (
                      <div>
                        <button
                          type="button"
                          onClick={() => setExpandedCallId(expandedCallId === call.id ? null : call.id)}
                          style={s.linkBtn}
                        >
                          <FileText size={14} color="var(--text-link)" />
                          {expandedCallId === call.id ? 'Hide' : 'Show'} Transcript
                        </button>

                        {expandedCallId === call.id && (
                          <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{call.transcript}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
