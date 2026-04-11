/**
 * Notification Preferences - Phase 4.2
 * User settings for notification channels and timing
 */

import { useState, useEffect } from 'react';
import { Bell, Save, Clock, Phone, MessageSquare, Mail, Volume2, Smartphone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../lib/api';
import { usePushSubscription } from '../hooks/usePushSubscription';

interface NotificationPreferences {
  // Channels
  whatsapp_enabled: boolean;
  email_enabled: boolean;
  voice_enabled: boolean;
  sms_enabled: boolean;

  // Event types
  new_lead_notification: boolean;
  appointment_reminder: boolean;
  task_due_reminder: boolean;
  property_match_notification: boolean;
  message_received_notification: boolean;
  call_missed_notification: boolean;

  // Timing preferences
  quiet_hours_enabled: boolean;
  quiet_hours_start: string; // HH:MM format
  quiet_hours_end: string; // HH:MM format
  daily_digest_enabled: boolean;
  daily_digest_time: string; // HH:MM format

  // Frequency
  instant_notifications: boolean;
  batch_notifications: boolean; // Group notifications every X minutes
  batch_interval_minutes: number;

  // Sound preferences
  notification_sound_enabled: boolean;
  notification_vibration_enabled: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  whatsapp_enabled: true,
  email_enabled: true,
  voice_enabled: false,
  sms_enabled: false,
  new_lead_notification: true,
  appointment_reminder: true,
  task_due_reminder: true,
  property_match_notification: true,
  message_received_notification: true,
  call_missed_notification: true,
  quiet_hours_enabled: true,
  quiet_hours_start: '21:00',
  quiet_hours_end: '08:00',
  daily_digest_enabled: true,
  daily_digest_time: '09:00',
  instant_notifications: true,
  batch_notifications: false,
  batch_interval_minutes: 15,
  notification_sound_enabled: true,
  notification_vibration_enabled: true,
};

export default function NotificationSettings() {
  const { token } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/notifications/preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setPreferences({ ...DEFAULT_PREFERENCES, ...data.preferences });
      } else {
        // Use defaults if not found
        setPreferences(DEFAULT_PREFERENCES);
      }
    } catch (err: any) {
      console.error('Failed to load preferences:', err);
      setPreferences(DEFAULT_PREFERENCES);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');

      const response = await fetch(`${API_BASE_URL}/api/notifications/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ preferences }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save preferences');
      }

      setSuccess('Notification preferences saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save preferences');
      setTimeout(() => setError(''), 5000);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (key: keyof NotificationPreferences) => {
    setPreferences({
      ...preferences,
      [key]: !preferences[key as keyof NotificationPreferences],
    });
  };

  const handleChange = (key: keyof NotificationPreferences, value: any) => {
    setPreferences({
      ...preferences,
      [key]: value,
    });
  };

  const handleTestNotification = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/notifications/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ channel: 'whatsapp' }),
      });

      if (response.ok) {
        setSuccess('Test notification sent! Check your WhatsApp.');
        setTimeout(() => setSuccess(''), 5000);
      } else {
        throw new Error('Failed to send test notification');
      }
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
    }
  };

  if (loading) {
    return <div className="p-6">Loading notification settings...</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">🔔 Notification Settings</h1>
        <p className="text-gray-600 mt-1">Control how and when you receive notifications from Panditji AI</p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
          {success}
        </div>
      )}

      {/* Notification Channels */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 border-b">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Notification Channels
          </h2>
          <p className="text-sm text-gray-600 mt-1">Choose how you want to receive notifications</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-green-600" />
              <div>
                <div className="font-medium">WhatsApp</div>
                <div className="text-sm text-gray-600">Get notifications on WhatsApp</div>
              </div>
            </div>
            <button
              onClick={() => handleToggle('whatsapp_enabled')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                preferences.whatsapp_enabled ? 'bg-green-600' : 'bg-gray-300'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                preferences.whatsapp_enabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-blue-600" />
              <div>
                <div className="font-medium">Email</div>
                <div className="text-sm text-gray-600">Get notifications via email</div>
              </div>
            </div>
            <button
              onClick={() => handleToggle('email_enabled')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                preferences.email_enabled ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                preferences.email_enabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-purple-600" />
              <div>
                <div className="font-medium">Voice Calls</div>
                <div className="text-sm text-gray-600">Get voice call notifications for urgent alerts</div>
              </div>
            </div>
            <button
              onClick={() => handleToggle('voice_enabled')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                preferences.voice_enabled ? 'bg-purple-600' : 'bg-gray-300'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                preferences.voice_enabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-orange-600" />
              <div>
                <div className="font-medium">SMS</div>
                <div className="text-sm text-gray-600">Get text message notifications</div>
              </div>
            </div>
            <button
              onClick={() => handleToggle('sms_enabled')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                preferences.sms_enabled ? 'bg-orange-600' : 'bg-gray-300'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                preferences.sms_enabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          <PushNotificationToggle />
        </div>
      </div>

      {/* Event Types */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 border-b">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Event Notifications
          </h2>
          <p className="text-sm text-gray-600 mt-1">Select which events trigger notifications</p>
        </div>
        <div className="p-6 space-y-4">
          {[
            { group: 'Inventory', items: [
              { key: 'new_inventory', label: 'New Inventory', desc: 'When a new property is listed' },
              { key: 'inventory', label: 'Inventory Updates', desc: 'Approvals, rejections, shares, transfers' },
            ]},
            { group: 'Leads', items: [
              { key: 'new_lead_notification', label: 'New Lead', desc: 'When a new lead enters the system' },
              { key: 'lead', label: 'Lead Updates', desc: 'Assignments, status changes' },
            ]},
            { group: 'Deals', items: [
              { key: 'property_match_notification', label: 'Property Match', desc: 'When a property matches lead requirements' },
              { key: 'deal', label: 'Deal Updates', desc: 'Created, status changed, queries, closed' },
            ]},
            { group: 'Appointments', items: [
              { key: 'appointment_reminder', label: 'Appointment Alerts', desc: 'Bookings, reminders, cancellations' },
            ]},
            { group: 'Tasks', items: [
              { key: 'task_due_reminder', label: 'Task Alerts', desc: 'Assignments, due reminders, overdue' },
            ]},
            { group: 'Communication', items: [
              { key: 'message_received_notification', label: 'New Message', desc: 'When you receive a new message' },
              { key: 'call_missed_notification', label: 'Missed Call', desc: 'When you miss an incoming call' },
            ]},
            { group: 'System', items: [
              { key: 'system', label: 'System Alerts', desc: 'Security alerts, daily summaries' },
              { key: 'batch_notifications', label: 'Batch Mode', desc: 'Group notifications into 15-min digests instead of instant' },
            ]},
          ].map((section) => (
            <div key={section.group}>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-2">{section.group}</div>
              {section.items.map((event) => (
                <div key={event.key} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium text-sm">{event.label}</div>
                    <div className="text-xs text-gray-500">{event.desc}</div>
                  </div>
                  <button
                    onClick={() => handleToggle(event.key as keyof NotificationPreferences)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                      preferences[event.key as keyof NotificationPreferences] ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                      preferences[event.key as keyof NotificationPreferences] ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Timing Preferences */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 border-b">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Timing & Schedule
          </h2>
          <p className="text-sm text-gray-600 mt-1">Control when notifications are sent</p>
        </div>
        <div className="p-6 space-y-6">
          {/* Quiet Hours */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-medium">Quiet Hours</div>
                <div className="text-sm text-gray-600">Don't send notifications during these hours</div>
              </div>
              <button
                onClick={() => handleToggle('quiet_hours_enabled')}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                  preferences.quiet_hours_enabled ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                  preferences.quiet_hours_enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            {preferences.quiet_hours_enabled && (
              <div className="grid grid-cols-2 gap-4 ml-6">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={preferences.quiet_hours_start}
                    onChange={(e) => handleChange('quiet_hours_start', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">End Time</label>
                  <input
                    type="time"
                    value={preferences.quiet_hours_end}
                    onChange={(e) => handleChange('quiet_hours_end', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Daily Digest */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-medium">Daily Digest</div>
                <div className="text-sm text-gray-600">Get a summary of daily activity</div>
              </div>
              <button
                onClick={() => handleToggle('daily_digest_enabled')}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                  preferences.daily_digest_enabled ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                  preferences.daily_digest_enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            {preferences.daily_digest_enabled && (
              <div className="ml-6">
                <label className="block text-sm text-gray-600 mb-1">Digest Time</label>
                <input
                  type="time"
                  value={preferences.daily_digest_time}
                  onChange={(e) => handleChange('daily_digest_time', e.target.value)}
                  className="w-48 px-3 py-2 border rounded-lg"
                />
              </div>
            )}
          </div>

          {/* Notification Frequency */}
          <div>
            <div className="font-medium mb-3">Notification Frequency</div>
            <div className="space-y-3 ml-6">
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  checked={preferences.instant_notifications}
                  onChange={() => {
                    handleChange('instant_notifications', true);
                    handleChange('batch_notifications', false);
                  }}
                  className="w-4 h-4"
                />
                <div>
                  <div className="font-medium">Instant</div>
                  <div className="text-sm text-gray-600">Get notified immediately</div>
                </div>
              </label>

              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  checked={preferences.batch_notifications}
                  onChange={() => {
                    handleChange('instant_notifications', false);
                    handleChange('batch_notifications', true);
                  }}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className="font-medium">Batched</div>
                  <div className="text-sm text-gray-600">Group notifications together</div>
                  {preferences.batch_notifications && (
                    <div className="mt-2">
                      <label className="block text-sm text-gray-600 mb-1">Batch Interval (minutes)</label>
                      <input
                        type="number"
                        value={preferences.batch_interval_minutes}
                        onChange={(e) => handleChange('batch_interval_minutes', parseInt(e.target.value))}
                        min="5"
                        max="120"
                        className="w-32 px-3 py-2 border rounded-lg"
                      />
                    </div>
                  )}
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Sound & Vibration */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 border-b">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Volume2 className="w-5 h-5" />
            Sound & Vibration
          </h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Notification Sound</div>
              <div className="text-sm text-gray-600">Play sound for notifications</div>
            </div>
            <button
              onClick={() => handleToggle('notification_sound_enabled')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                preferences.notification_sound_enabled ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                preferences.notification_sound_enabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Vibration</div>
              <div className="text-sm text-gray-600">Vibrate for notifications (mobile)</div>
            </div>
            <button
              onClick={() => handleToggle('notification_vibration_enabled')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                preferences.notification_vibration_enabled ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                preferences.notification_vibration_enabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <Save className="w-5 h-5" />
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>

        <button
          onClick={handleTestNotification}
          className="flex items-center gap-2 px-6 py-3 border rounded-lg hover:bg-gray-50"
        >
          <Bell className="w-5 h-5" />
          Send Test Notification
        </button>
      </div>
    </div>
  );
}

// ─── Push Notification Toggle ───────────────────────────────────────────────
function PushNotificationToggle() {
    const { supported, subscribed, loading, error, subscribe, unsubscribe } = usePushSubscription();

    if (!supported) return null;

    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-cyan-600" />
                <div>
                    <div className="font-medium">Browser Push</div>
                    <div className="text-sm text-gray-600">
                        {subscribed ? 'Push notifications enabled' : 'Get alerts even when the tab is closed'}
                    </div>
                    {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
                </div>
            </div>
            <button
                onClick={() => subscribed ? unsubscribe() : subscribe()}
                disabled={loading}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                    subscribed ? 'bg-cyan-600' : 'bg-gray-300'
                } ${loading ? 'opacity-50' : ''}`}
            >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    subscribed ? 'translate-x-6' : 'translate-x-1'
                }`} />
            </button>
        </div>
    );
}
