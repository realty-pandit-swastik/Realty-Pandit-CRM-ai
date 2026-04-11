/**
 * Call Log Management - Phase 4.1
 * View call history with audio playback, transcripts, and AI summaries
 */

import { useState, useEffect, useRef } from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Play, Pause, Download, Filter, Calendar, Clock, FileText, MessageSquare } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../lib/api';

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

export default function CallLog() {
  const { token, hasPermission } = useAuth();
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
      const response = await fetch(`${API_BASE_URL}/api/calls/voice-log/all`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 403) {
        // User doesn't have permission - don't show error, just don't render
        console.log('[CallLog] User lacks view_reports permission');
        setError('You do not have permission to view call logs');
        return;
      }

      if (!response.ok) throw new Error('Failed to fetch calls');

      const data = await response.json();
      setCalls(data.calls || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load call log');
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
      filtered = filtered.filter(call =>
        call.phone_number.includes(searchQuery) ||
        call.contact?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        call.transcript?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        call.ai_call_summary?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredCalls(filtered);
  };

  const handlePlayPause = (call: VoiceCall) => {
    if (!call.recording_url) {
      alert('No recording available for this call');
      return;
    }

    if (playingCallId === call.id) {
      // Pause current audio
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingCallId(null);
    } else {
      // Play new audio
      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(call.recording_url);
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
      return call.call_status === 'answered' ?
        <PhoneIncoming className="w-5 h-5 text-green-600" /> :
        <PhoneMissed className="w-5 h-5 text-red-600" />;
    } else {
      return <PhoneOutgoing className="w-5 h-5 text-blue-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'answered': return 'bg-green-100 text-green-700';
      case 'missed': return 'bg-red-100 text-red-700';
      case 'failed': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const handleDownloadRecording = (url: string, callId: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `call_${callId}_${new Date().getTime()}.mp3`;
    link.click();
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
    return <div className="p-6">Loading call log...</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">📞 Call Log</h1>
        <p className="text-gray-600 mt-1">View call history with audio playback and AI summaries</p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-sm text-gray-600">Total Calls</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-green-600">{stats.answered}</div>
          <div className="text-sm text-green-700">Answered</div>
        </div>
        <div className="bg-red-50 p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-red-600">{stats.missed}</div>
          <div className="text-sm text-red-700">Missed</div>
        </div>
        <div className="bg-blue-50 p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-blue-600">{stats.inbound}</div>
          <div className="text-sm text-blue-700">Incoming</div>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-purple-600">{stats.outbound}</div>
          <div className="text-sm text-purple-700">Outgoing</div>
        </div>
        <div className="bg-orange-50 p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-orange-600">{formatDuration(stats.totalDuration)}</div>
          <div className="text-sm text-orange-700">Total Duration</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-5 h-5 text-gray-600" />
          <h2 className="font-semibold text-gray-900">Filters</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Phone, name, transcript..."
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              {CALL_STATUSES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Direction</label>
            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              {DIRECTIONS.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">From Date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">To Date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
        </div>
      </div>

      {/* Call List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-xl font-semibold">Call History ({filteredCalls.length})</h2>
        </div>

        {filteredCalls.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Phone className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-lg mb-1">No calls found</p>
            <p className="text-sm">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredCalls.map(call => (
              <div key={call.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="mt-1">
                    {getCallIcon(call)}
                  </div>

                  {/* Main Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {call.contact?.name || call.phone_number}
                        </h3>
                        {call.contact?.name && (
                          <p className="text-sm text-gray-500">{call.phone_number}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusColor(call.call_status)}`}>
                          {call.call_status.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {formatDate(call.started_at)}
                      </span>
                      {call.duration && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {formatDuration(call.duration)}
                        </span>
                      )}
                      <span className="capitalize">
                        {call.direction === 'inbound' ? 'Incoming' : 'Outgoing'}
                      </span>
                    </div>

                    {/* AI Summary (if available) */}
                    {call.ai_call_summary && (
                      <div className="mb-3 p-3 bg-blue-50 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <MessageSquare className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-medium text-blue-900">AI Summary</span>
                        </div>
                        <p className="text-sm text-blue-800">{call.ai_call_summary}</p>
                      </div>
                    )}

                    {/* Audio Playback (if recording available) */}
                    {call.recording_url && (
                      <div className="mb-3 p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handlePlayPause(call)}
                            className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700"
                          >
                            {playingCallId === call.id ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </button>

                          {playingCallId === call.id && (
                            <div className="flex-1">
                              <input
                                type="range"
                                min="0"
                                max={duration}
                                value={currentTime}
                                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                                className="w-full"
                              />
                              <div className="flex justify-between text-xs text-gray-500 mt-1">
                                <span>{formatDuration(currentTime)}</span>
                                <span>{formatDuration(duration)}</span>
                              </div>
                            </div>
                          )}

                          {playingCallId !== call.id && (
                            <span className="text-sm text-gray-600">Recording available</span>
                          )}

                          <button
                            onClick={() => handleDownloadRecording(call.recording_url!, call.id)}
                            className="p-2 text-gray-600 hover:bg-gray-200 rounded"
                            title="Download recording"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Transcript Toggle */}
                    {call.transcript && (
                      <div>
                        <button
                          onClick={() => setExpandedCallId(expandedCallId === call.id ? null : call.id)}
                          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                        >
                          <FileText className="w-4 h-4" />
                          {expandedCallId === call.id ? 'Hide' : 'Show'} Transcript
                        </button>

                        {expandedCallId === call.id && (
                          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{call.transcript}</p>
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
