import React, { useState } from 'react';
import { LOST_REASONS } from '../constants/lostReasons';

interface MarkLostModalProps {
  phone: string;
  name?: string | null;
  /** Performs the API call; should throw on failure so the modal can show the error. */
  onSubmit: (reason: string, note?: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Mark Lead Lost — mandatory structured reason capture (dashboard spec).
 * Replaces the old window.prompt flow. The reason is required (Mark Lost stays
 * disabled until one is picked) and is persisted to contacts.lost_reason, which
 * feeds the Lead Intelligence "Lost Reasons" analytics.
 */
export const MarkLostModal: React.FC<MarkLostModalProps> = ({ phone, name, onSubmit, onClose }) => {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!reason) { setError('Please select a reason.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(reason, note.trim() || undefined);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to mark lead lost.');
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'var(--sheet-backdrop, rgba(0,0,0,0.45))', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-clay, 16px)', boxShadow: 'var(--shadow-clay)', border: '1px solid var(--border-secondary)', width: '100%', maxWidth: 420, padding: 22 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>❌</span>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>Mark Lead Lost</h3>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)' }}>
          {name || phone} — this closes the lead and auto-closes any active deals (reversible by reopening a deal).
        </p>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
          Reason <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <select
          value={reason}
          onChange={(e) => { setReason(e.target.value); setError(null); }}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${!reason && error ? '#ef4444' : 'var(--border-secondary)'}`, background: 'var(--bg-input)', color: 'var(--text-primary)', marginBottom: 14 }}
        >
          <option value="">Select a reason…</option>
          {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
          Note (optional)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Any extra context…"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-secondary)', background: 'var(--bg-input)', color: 'var(--text-primary)', resize: 'vertical', boxSizing: 'border-box' }}
        />

        {error && <div style={{ marginTop: 12, fontSize: 13, color: '#ef4444' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border-secondary)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', minHeight: 40 }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !reason}
            style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: !reason ? 'var(--bg-hover)' : '#ef4444', color: !reason ? 'var(--text-muted)' : '#fff', fontWeight: 700, cursor: !reason || submitting ? 'not-allowed' : 'pointer', minHeight: 40, opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? 'Marking…' : 'Mark Lost'}
          </button>
        </div>
      </div>
    </div>
  );
};
