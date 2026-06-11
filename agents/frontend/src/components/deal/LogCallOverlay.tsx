/**
 * LogCallOverlay — Stage 1 NEW call-outcome workflow.
 *
 * Step 1: pick one of 6 outcomes.
 * Step 2: outcome-specific form (qualify form, reason picker, callback time, etc).
 * Submits to POST /api/deals/:id/log-call (handles all state transitions server-side).
 *
 * This is the ONLY way to qualify a NEW deal — bypass paths were removed in Phase 4.
 */

import { useState } from 'react';
import client from '../../api/client';
// Phase 2c demand-side unification (2026-05-29) — shared canonical form replaces the
// legacy <BuyerRequirementsForm> for the Quick-Edit "Answered — interested" path.
import DemandRequirementsForm, { type DemandPayload } from '../leads/DemandRequirementsForm';

// Legacy RequirementsValues shape kept inline so we can delete BuyerRequirementsForm.tsx.
// The backend /api/deals/:id/log-call route still consumes this shape; canonical
// demand_taxonomy_node_id + demand_schema_values get sent alongside for forward-compat.
interface RequirementsValues {
    intent: string;
    demand_main_category: string;
    demand_category: string | null;
    demand_type_slug: string;
    demand_bhk: number | null;
    area_min: number | null;
    area_max: number | null;
    area_unit: string;
    demand_amenities: string[];
    budget_min: number | null;
    budget_max: number | null;
    timeline: string;
    preferred_location: string;
}

export type CallOutcome =
    | 'ANSWERED_INTERESTED'
    | 'NOT_INTERESTED'
    | 'NO_ANSWER'
    | 'CALLBACK_REQUESTED'
    | 'WRONG_OR_SPAM'
    | 'LANGUAGE_BARRIER';

export interface LogCallOverlayProps {
    dealId: string;
    contactName: string;
    contactPhone: string;
    initialRequirements: Partial<RequirementsValues>;
    isMobile?: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface OutcomeButton {
    id: CallOutcome;
    emoji: string;
    title: string;
    subtitle: string;
}

const OUTCOMES: OutcomeButton[] = [
    { id: 'ANSWERED_INTERESTED', emoji: '✅', title: 'Answered — interested',           subtitle: 'Capture requirements & qualify' },
    { id: 'NOT_INTERESTED',      emoji: '❌', title: 'Not interested',                   subtitle: 'Customer declined' },
    { id: 'NO_ANSWER',           emoji: '📞', title: 'No answer',                        subtitle: 'AI continues retry cadence' },
    { id: 'CALLBACK_REQUESTED',  emoji: '📅', title: 'Callback requested',               subtitle: 'Schedule a time to call back' },
    { id: 'WRONG_OR_SPAM',       emoji: '🚫', title: 'Wrong / spam / banker / partner',  subtitle: 'Mark and close' },
    { id: 'LANGUAGE_BARRIER',    emoji: '🌐', title: 'Language barrier',                 subtitle: 'Alert manager for handoff' },
];

const labelStyle: React.CSSProperties = {
    fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', display: 'block',
};

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box',
};

export default function LogCallOverlay({
    dealId, contactName, contactPhone, initialRequirements, isMobile, onClose, onSuccess,
}: LogCallOverlayProps) {
    const [outcome, setOutcome] = useState<CallOutcome | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (payload: any) => {
        if (!outcome) return;
        setSubmitting(true);
        setError(null);
        try {
            await client.post(`/api/deals/${dealId}/log-call`, { outcome, payload });
            onSuccess();
        } catch (err: any) {
            setError(err?.response?.data?.error || err.message || 'Failed to log call');
            setSubmitting(false);
        }
    };

    const sheetWidth = outcome === 'ANSWERED_INTERESTED' ? '720px' : '480px';

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
                    zIndex: 200, backdropFilter: 'blur(2px)',
                }}
            />
            {/* Sheet */}
            <div
                style={{
                    position: 'fixed',
                    top: isMobile ? 0 : '50%',
                    left: isMobile ? 0 : '50%',
                    right: isMobile ? 0 : 'auto',
                    bottom: isMobile ? 0 : 'auto',
                    transform: isMobile ? 'none' : 'translate(-50%, -50%)',
                    backgroundColor: 'var(--bg-primary)',
                    borderRadius: isMobile ? 0 : '16px',
                    width: isMobile ? '100%' : sheetWidth,
                    maxWidth: isMobile ? '100%' : '94vw',
                    maxHeight: isMobile ? '100%' : '90vh',
                    height: isMobile ? '100%' : 'auto',
                    overflow: 'hidden',
                    zIndex: 201,
                    boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
                    display: 'flex', flexDirection: 'column',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '14px 18px', borderBottom: '1px solid var(--border-secondary)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{
                            margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            Log Call — {contactName || contactPhone}
                        </h3>
                        {outcome && (
                            <button
                                type="button"
                                onClick={() => { setOutcome(null); setError(null); }}
                                style={{
                                    marginTop: '4px', background: 'none', border: 'none',
                                    fontSize: '12px', color: 'var(--accent-primary)', cursor: 'pointer', padding: 0,
                                }}
                            >
                                ← Change outcome
                            </button>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        style={{
                            background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer',
                            color: 'var(--text-secondary)', minWidth: '44px', minHeight: '44px',
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
                    {error && (
                        <div style={{
                            padding: '10px 12px', borderRadius: '8px', marginBottom: '12px',
                            backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '13px',
                        }}>
                            {error}
                        </div>
                    )}

                    {!outcome && <OutcomePicker onPick={setOutcome} />}

                    {outcome === 'ANSWERED_INTERESTED' && (
                        <DemandRequirementsForm
                            initial={{
                                intent: (initialRequirements as any)?.intent || 'buy',
                                budget_min: (initialRequirements as any)?.budget_min ?? null,
                                budget_max: (initialRequirements as any)?.budget_max ?? null,
                                area_min: (initialRequirements as any)?.area_min ?? null,
                                area_max: (initialRequirements as any)?.area_max ?? null,
                                area_unit: (initialRequirements as any)?.area_unit || 'sqft',
                                timeline: (initialRequirements as any)?.timeline || '',
                                preferred_location: (initialRequirements as any)?.preferred_location || '',
                                demand_taxonomy_node_id: (initialRequirements as any)?.demand_taxonomy_node_id ?? null,
                                demand_schema_values: (initialRequirements as any)?.demand_schema_values ?? (
                                    // Derive minimal canonical schema_values from legacy demand_bhk + demand_amenities
                                    // so users with old data see their BHK/amenities pre-filled in the by-type panel.
                                    (() => {
                                        const sv: Record<string, any> = {};
                                        const bhk = (initialRequirements as any)?.demand_bhk;
                                        if (typeof bhk === 'number' && bhk > 0) sv.bhk = String(bhk);
                                        const am = (initialRequirements as any)?.demand_amenities;
                                        if (Array.isArray(am) && am.length) sv.amenities = am;
                                        return sv;
                                    })()
                                ),
                            }}
                            submitting={submitting}
                            submitLabel="✅ Save & Qualify Lead"
                            onSubmit={(p: DemandPayload) => {
                                // Convert canonical → legacy RequirementsValues so the existing
                                // /api/deals/:id/log-call backend handler keeps working. Plus
                                // pass canonical fields through so the route can consume them.
                                const bhkRaw = p.demand_schema_values?.bhk;
                                let demandBhk: number | null = null;
                                if (typeof bhkRaw === 'string') {
                                    const cleaned = bhkRaw.toLowerCase().replace('rk', '').replace('+', '').trim();
                                    const n = parseInt(cleaned, 10);
                                    if (!Number.isNaN(n)) demandBhk = n;
                                } else if (typeof bhkRaw === 'number') { demandBhk = bhkRaw; }
                                const amenities = Array.isArray(p.demand_schema_values?.amenities)
                                    ? (p.demand_schema_values.amenities as string[]) : [];
                                const legacy: RequirementsValues = {
                                    intent: p.intent,
                                    demand_main_category: '',
                                    demand_category: null,
                                    demand_type_slug: '',
                                    demand_bhk: demandBhk,
                                    area_min: p.area_min,
                                    area_max: p.area_max,
                                    area_unit: p.area_unit,
                                    demand_amenities: amenities,
                                    budget_min: p.budget_min,
                                    budget_max: p.budget_max,
                                    timeline: p.timeline,
                                    preferred_location: p.preferred_location,
                                };
                                submit({
                                    requirements: legacy,
                                    // Canonical SoT — backend Phase 1 deep-merges if it sees these.
                                    demand_taxonomy_node_id: p.demand_taxonomy_node_id,
                                    demand_schema_values: p.demand_schema_values,
                                });
                            }}
                            onCancel={onClose}
                        />
                    )}

                    {outcome === 'NOT_INTERESTED' && (
                        <NotInterestedPath submitting={submitting} onSubmit={submit} onCancel={onClose} />
                    )}

                    {outcome === 'NO_ANSWER' && (
                        <NoAnswerPath submitting={submitting} onSubmit={submit} onCancel={onClose} />
                    )}

                    {outcome === 'CALLBACK_REQUESTED' && (
                        <CallbackPath submitting={submitting} onSubmit={submit} onCancel={onClose} />
                    )}

                    {outcome === 'WRONG_OR_SPAM' && (
                        <WrongOrSpamPath submitting={submitting} onSubmit={submit} onCancel={onClose} />
                    )}

                    {outcome === 'LANGUAGE_BARRIER' && (
                        <LanguageBarrierPath submitting={submitting} onSubmit={submit} onCancel={onClose} />
                    )}
                </div>
            </div>
        </>
    );
}

// ─── STEP 1 PICKER ─────────────────────────────────────────────────────────────

function OutcomePicker({ onPick }: { onPick: (o: CallOutcome) => void }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                What was the outcome?
            </div>
            {OUTCOMES.map((b) => (
                <button
                    key={b.id}
                    type="button"
                    onClick={() => onPick(b.id)}
                    style={{
                        padding: '14px 16px', borderRadius: '10px', textAlign: 'left',
                        border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px',
                    }}
                >
                    <span style={{ fontSize: '22px' }}>{b.emoji}</span>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {b.title}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {b.subtitle}
                        </div>
                    </div>
                </button>
            ))}
        </div>
    );
}

// ─── STEP 2 PATHS ──────────────────────────────────────────────────────────────

function NotInterestedPath({ submitting, onSubmit, onCancel }: {
    submitting: boolean;
    onSubmit: (p: any) => void;
    onCancel: () => void;
}) {
    const [reason, setReason] = useState('NOT_INTERESTED_NOW');
    const [notes, setNotes] = useState('');
    return (
        <PathShell
            onCancel={onCancel}
            onSubmit={() => onSubmit({ reason, notes })}
            submitLabel="Mark not interested"
            submitting={submitting}
        >
            <Field label="Reason">
                <select value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle}>
                    <option value="NOT_INTERESTED_NOW">Not interested right now (revisit later)</option>
                    <option value="JUST_BROWSING">Just browsing — close the lead</option>
                </select>
            </Field>
            <Field label="Notes (optional)">
                <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    style={inputStyle}
                    placeholder="What did the customer say?"
                />
            </Field>
        </PathShell>
    );
}

function NoAnswerPath({ submitting, onSubmit, onCancel }: {
    submitting: boolean;
    onSubmit: (p: any) => void;
    onCancel: () => void;
}) {
    return (
        <PathShell
            onCancel={onCancel}
            onSubmit={() => onSubmit({})}
            submitLabel="Log no-answer"
            submitting={submitting}
        >
            <div style={{
                padding: '12px 14px', borderRadius: '8px',
                backgroundColor: 'rgba(59,130,246,0.08)',
                fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5,
            }}>
                Deal stays in <strong>NEW</strong>. AI continues its retry cadence
                (5 min → 1 hr → every 3 hr) per Stage 1 KRA.
            </div>
        </PathShell>
    );
}

function CallbackPath({ submitting, onSubmit, onCancel }: {
    submitting: boolean;
    onSubmit: (p: any) => void;
    onCancel: () => void;
}) {
    const [callbackAt, setCallbackAt] = useState('');
    const [notes, setNotes] = useState('');
    const canSubmit = !!callbackAt;
    return (
        <PathShell
            onCancel={onCancel}
            onSubmit={() => onSubmit({ callback_at: new Date(callbackAt).toISOString(), notes })}
            submitLabel="Schedule callback"
            submitting={submitting}
            disabled={!canSubmit}
        >
            <Field label="Callback at *">
                <input
                    type="datetime-local"
                    value={callbackAt}
                    onChange={(e) => setCallbackAt(e.target.value)}
                    style={inputStyle}
                />
            </Field>
            <Field label="Notes (optional)">
                <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    style={inputStyle}
                    placeholder="What did the customer ask you to call about?"
                />
            </Field>
        </PathShell>
    );
}

function WrongOrSpamPath({ submitting, onSubmit, onCancel }: {
    submitting: boolean;
    onSubmit: (p: any) => void;
    onCancel: () => void;
}) {
    const [reason, setReason] = useState('WRONG_NUMBER');
    return (
        <PathShell
            onCancel={onCancel}
            onSubmit={() => onSubmit({ reason })}
            submitLabel="Mark and close"
            submitting={submitting}
        >
            <Field label="Reason">
                <select value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle}>
                    <option value="WRONG_NUMBER">Wrong number</option>
                    <option value="SPAM">Spam</option>
                    <option value="BANKER_VALUER">Banker / valuer (not a customer)</option>
                    <option value="DUPLICATE">Duplicate of another deal</option>
                    <option value="PARTNER_AGENT">Partner agent (review later)</option>
                </select>
            </Field>
        </PathShell>
    );
}

function LanguageBarrierPath({ submitting, onSubmit, onCancel }: {
    submitting: boolean;
    onSubmit: (p: any) => void;
    onCancel: () => void;
}) {
    const [language, setLanguage] = useState('');
    return (
        <PathShell
            onCancel={onCancel}
            onSubmit={() => onSubmit({ language })}
            submitLabel="Alert manager"
            submitting={submitting}
            disabled={!language.trim()}
        >
            <Field label="Customer's language *">
                <input
                    type="text"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    style={inputStyle}
                    placeholder="e.g. Tamil, Bengali, Marathi"
                />
            </Field>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Manager will get a WhatsApp alert. Deal stays in NEW for human handoff.
            </div>
        </PathShell>
    );
}

// ─── SHARED BITS ───────────────────────────────────────────────────────────────

function PathShell({
    children, onCancel, onSubmit, submitLabel, submitting, disabled = false,
}: {
    children: React.ReactNode;
    onCancel: () => void;
    onSubmit: () => void;
    submitLabel: string;
    submitting: boolean;
    disabled?: boolean;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {children}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={submitting}
                    style={{
                        padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                        border: '1px solid var(--border-secondary)', backgroundColor: 'transparent',
                        color: 'var(--text-secondary)', cursor: 'pointer',
                    }}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={onSubmit}
                    disabled={submitting || disabled}
                    style={{
                        padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                        border: 'none',
                        backgroundColor: (submitting || disabled) ? '#94a3b8' : 'var(--accent-primary)',
                        color: '#fff',
                        cursor: (submitting || disabled) ? 'not-allowed' : 'pointer',
                    }}
                >
                    {submitting ? 'Saving...' : submitLabel}
                </button>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <div style={labelStyle}>{label}</div>
            {children}
        </div>
    );
}
