/**
 * LogCallOverlay — Stage 1 NEW call-outcome workflow.
 *
 * Step 1: pick one of 6 outcomes.
 * Step 2: outcome-specific form (qualify form, reason picker, callback time, etc).
 * Submits to POST /api/deals/:id/log-call (handles all state transitions server-side).
 *
 * This is the ONLY way to qualify a NEW deal — bypass paths were removed in Phase 4.
 */

import { useState, useEffect } from 'react';
import client from '../../api/client';
import { getDealMatchedInventory, shareDealProperties, setDealReminder, type Deal } from '../../api/client';
import { MatchShareTab } from './MatchShareTab';
// Phase 2c demand-side unification (2026-05-29) — shared canonical form replaces the
// legacy <BuyerRequirementsForm> for the Quick-Edit "Answered — interested" path.
import DemandRequirementsForm, { type DemandPayload } from '../leads/DemandRequirementsForm';
import { defaultReminderLocal } from '../../lib/defaultReminder';

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
    | 'LANGUAGE_BARRIER'
    | 'CLOSED_UNREACHABLE';

/** Guided entry from the tile's 2-button flow (deal-workflow, 2026-06-29). */
export type CallEntryMode = 'answered' | 'not_answered';

export interface LogCallOverlayProps {
    dealId: string;
    /** Full deal — powers the rich Match & Share surface in the Interested→Share step.
     *  Optional: when absent the step falls back to the lean ShareStep list. */
    deal?: Deal;
    contactName: string;
    contactPhone: string;
    initialRequirements: Partial<RequirementsValues>;
    isMobile?: boolean;
    /** Open directly on this outcome's form (skip the picker) — used by the deal-tile buttons. */
    initialOutcome?: CallOutcome | null;
    /** Guided 2-button entry (Answered / Not answered). Overrides the legacy 6-outcome picker. */
    entryMode?: CallEntryMode | null;
    /** Derived no-answer count — gates Reassign/Close on the Not-answered path at N=4. */
    noAnswerCount?: number;
    /** Team members for the Not-answered → Reassign picker. */
    agents?: { id: string; name: string }[];
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
    dealId, deal, contactName, contactPhone, initialRequirements, isMobile, initialOutcome, entryMode, noAnswerCount = 0, agents = [], onClose, onSuccess,
}: LogCallOverlayProps) {
    const [outcome, setOutcome] = useState<CallOutcome | null>(initialOutcome ?? null);
    // Guided entry (2026-06-29): which 2-button sub-step we're on. null when launched legacy-style.
    const [entryStep, setEntryStep] = useState<CallEntryMode | 'not_interested_reasons' | null>(entryMode ?? null);
    // Interested continuous wizard (2026-06-29): requirements → share → mandatory reminder, one window.
    const [interestedStep, setInterestedStep] = useState<'requirements' | 'share' | 'reminder'>('requirements');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (payload: any) => {
        if (!outcome) return;
        await submitOutcome(outcome, payload);
    };

    // Post a specific outcome directly (used by the guided steps that don't set `outcome` state).
    const submitOutcome = async (oc: CallOutcome, payload: any) => {
        setSubmitting(true);
        setError(null);
        try {
            await client.post(`/api/deals/${dealId}/log-call`, { outcome: oc, payload });
            onSuccess();
        } catch (err: any) {
            setError(err?.response?.data?.error || err.message || 'Failed to log call');
            setSubmitting(false);
        }
    };

    // Not-answered → Reassign (separate endpoint).
    const reassignTo = async (agentId: string) => {
        setSubmitting(true);
        setError(null);
        try {
            await client.patch(`/api/deals/${dealId}/reassign`, { agent_id: agentId });
            onSuccess();
        } catch (err: any) {
            setError(err?.response?.data?.error || err.message || 'Failed to reassign');
            setSubmitting(false);
        }
    };

    // Interested path: qualify, then KEEP the window open and advance to the share step.
    const submitInterestedRequirements = async (payload: any) => {
        setSubmitting(true);
        setError(null);
        try {
            await client.post(`/api/deals/${dealId}/log-call`, { outcome: 'ANSWERED_INTERESTED', payload });
            setSubmitting(false);
            setInterestedStep('share');
        } catch (err: any) {
            setError(err?.response?.data?.error || err.message || 'Failed to qualify');
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

                    {!outcome && !entryStep && <OutcomePicker onPick={setOutcome} />}

                    {/* Guided 2-button flow (2026-06-29) */}
                    {!outcome && entryStep === 'answered' && (
                        <AnsweredStep
                            onInterested={() => { setInterestedStep('requirements'); setOutcome('ANSWERED_INTERESTED'); }}
                            onNotInterested={() => setEntryStep('not_interested_reasons')}
                        />
                    )}
                    {!outcome && entryStep === 'not_interested_reasons' && (
                        <NotInterestedReasonsStep submitting={submitting} onSubmit={submitOutcome} onBack={() => setEntryStep('answered')} onCancel={onClose} />
                    )}
                    {!outcome && entryStep === 'not_answered' && (
                        <NotAnsweredStep
                            submitting={submitting}
                            noAnswerCount={noAnswerCount}
                            agents={agents}
                            onSetReminder={(remindAt, notes) => submitOutcome('NO_ANSWER', { remind_at: remindAt, notes })}
                            onReassign={reassignTo}
                            onCloseUnreachable={(notes) => submitOutcome('CLOSED_UNREACHABLE', { notes })}
                            onCancel={onClose}
                        />
                    )}

                    {outcome === 'ANSWERED_INTERESTED' && interestedStep === 'requirements' && (
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
                            submitLabel="✅ Save & Qualify → Share"
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
                                submitInterestedRequirements({
                                    requirements: legacy,
                                    // Canonical SoT — backend Phase 1 deep-merges if it sees these.
                                    demand_taxonomy_node_id: p.demand_taxonomy_node_id,
                                    demand_schema_values: p.demand_schema_values,
                                });
                            }}
                            onCancel={onClose}
                        />
                    )}

                    {/* Interested wizard — step 2: share inventories (or no-match → reminder).
                        Rich Match & Share when the full deal is available (images / BHK / copyable code /
                        filter bar); lean ShareStep fallback otherwise. Negative margin cancels the body
                        padding so MatchShareTab's own padding governs. */}
                    {outcome === 'ANSWERED_INTERESTED' && interestedStep === 'share' && (
                        deal ? (
                            <div style={{ margin: '-16px -18px 0' }}>
                                <MatchShareTab deal={deal} onShared={() => setInterestedStep('reminder')} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border-secondary)' }}>
                                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}>Cancel</button>
                                    <button type="button" onClick={() => setInterestedStep('reminder')} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}>Continue → set reminder</button>
                                </div>
                            </div>
                        ) : (
                            <ShareStep dealId={dealId} onAdvance={() => setInterestedStep('reminder')} onCancel={onClose} />
                        )
                    )}
                    {/* Interested wizard — step 3: mandatory follow-up reminder, then done */}
                    {outcome === 'ANSWERED_INTERESTED' && interestedStep === 'reminder' && (
                        <FollowUpReminderStep dealId={dealId} contactName={contactName || contactPhone} onDone={onSuccess} onCancel={onClose} />
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
    const [notes, setNotes] = useState('');
    return (
        <PathShell
            onCancel={onCancel}
            onSubmit={() => onSubmit({ notes })}
            submitLabel="Close — not interested"
            submitting={submitting}
            disabled={!notes.trim()}
        >
            <div style={{
                padding: '10px 12px', borderRadius: '8px',
                backgroundColor: 'rgba(239,68,68,0.08)', fontSize: '13px',
                color: 'var(--text-primary)', lineHeight: 1.5,
            }}>
                This <strong>closes the deal</strong> and removes it from the board. For a "not now, maybe later"
                lead, use <strong>Callback / Remind</strong> instead.
            </div>
            <Field label="Why? (required)">
                <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    style={inputStyle}
                    placeholder="What did the customer say? (required)"
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
    const [callbackAt, setCallbackAt] = useState(() => defaultReminderLocal());
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
    const [notes, setNotes] = useState('');
    return (
        <PathShell
            onCancel={onCancel}
            onSubmit={() => onSubmit({ reason, notes })}
            submitLabel="Mark and close"
            submitting={submitting}
            disabled={!notes.trim()}
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
            <Field label="Note (required)">
                <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    style={inputStyle}
                    placeholder="Add a short note (required)"
                />
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

// ─── GUIDED 2-BUTTON ENTRY STEPS (deal-workflow, 2026-06-29) ────────────────────

function AnsweredStep({ onInterested, onNotInterested }: { onInterested: () => void; onNotInterested: () => void }) {
    const card = (border: string, bg: string): React.CSSProperties => ({
        padding: '16px', borderRadius: '10px', textAlign: 'left', border: `1px solid ${border}`,
        backgroundColor: bg, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
    });
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Call answered — what did the customer say?</div>
            <button type="button" onClick={onInterested} style={card('#22c55e', 'rgba(34,197,94,0.08)')}>
                <span style={{ fontSize: '22px' }}>👍</span>
                <div><div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Interested</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Capture requirements → qualify → share</div></div>
            </button>
            <button type="button" onClick={onNotInterested} style={card('var(--border-secondary)', 'var(--bg-secondary)')}>
                <span style={{ fontSize: '22px' }}>👎</span>
                <div><div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Not interested</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Pick a reason and close</div></div>
            </button>
        </div>
    );
}

function NotInterestedReasonsStep({ submitting, onSubmit, onBack, onCancel }: {
    submitting: boolean;
    onSubmit: (outcome: CallOutcome, payload: any) => void;
    onBack: () => void;
    onCancel: () => void;
}) {
    const [reason, setReason] = useState('');
    const [comment, setComment] = useState('');
    const REASONS = [
        { key: 'SPAM', label: '🚫 Spam lead' },
        { key: 'LANGUAGE', label: '🌐 Language barrier' },
        { key: 'FULFILLED', label: '✅ Requirement already fulfilled' },
        { key: 'OTHER', label: '🗒 Other' },
    ];
    const isLanguage = reason === 'LANGUAGE';
    const disabled = !reason || !comment.trim();
    const submit = () => {
        if (disabled) return;
        if (reason === 'SPAM') return onSubmit('WRONG_OR_SPAM', { reason: 'SPAM', notes: comment.trim() });
        if (reason === 'LANGUAGE') return onSubmit('LANGUAGE_BARRIER', { language: comment.trim(), notes: comment.trim() });
        return onSubmit('NOT_INTERESTED', { notes: (reason === 'FULFILLED' ? 'Requirement already fulfilled: ' : '') + comment.trim() });
    };
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <button type="button" onClick={onBack} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', fontSize: '12px', color: 'var(--accent-primary)', cursor: 'pointer', padding: 0 }}>← Back</button>
            <Field label="Reason (required)">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {REASONS.map(r => (
                        <button key={r.key} type="button" onClick={() => setReason(r.key)}
                            style={{ padding: '12px 14px', borderRadius: '8px', textAlign: 'left', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                                border: reason === r.key ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-secondary)',
                                backgroundColor: reason === r.key ? 'rgba(59,130,246,0.08)' : 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                            {r.label}
                        </button>
                    ))}
                </div>
            </Field>
            <Field label="Comment (required)">
                <textarea rows={3} value={comment} onChange={e => setComment(e.target.value)} style={inputStyle} placeholder="Add details (required)" />
            </Field>
            {isLanguage && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Language barrier alerts the manager for a multilingual handoff and keeps the deal open (not closed).</div>}
            <ActionRow submitting={submitting} onCancel={onCancel} disabled={disabled} onSubmit={submit}
                label={isLanguage ? 'Alert manager' : 'Close — not interested'} danger={!isLanguage} />
        </div>
    );
}

function NotAnsweredStep({ submitting, noAnswerCount, agents, onSetReminder, onReassign, onCloseUnreachable, onCancel }: {
    submitting: boolean;
    noAnswerCount: number;
    agents: { id: string; name: string }[];
    onSetReminder: (remindAtISO: string, notes: string) => void;
    onReassign: (agentId: string) => void;
    onCloseUnreachable: (notes: string) => void;
    onCancel: () => void;
}) {
    const [mode, setMode] = useState<'reminder' | 'reassign' | 'close'>('reminder');
    const [remindAt, setRemindAt] = useState(() => defaultReminderLocal());
    const [notes, setNotes] = useState('');
    const [agentId, setAgentId] = useState('');
    const gateOpen = noAnswerCount >= 4; // N = 4
    const tab = (active: boolean): React.CSSProperties => ({
        padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
        border: active ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-secondary)',
        backgroundColor: active ? 'rgba(59,130,246,0.08)' : 'var(--bg-secondary)', color: 'var(--text-primary)',
    });
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: 'rgba(59,130,246,0.08)', fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                No answer. The AI keeps its retry cadence — set your own reminder so the deal resurfaces for you.
                {gateOpen && <div style={{ marginTop: '6px', color: '#b45309', fontWeight: 600 }}>⚠ Called {noAnswerCount}× with no answer — consider reassigning or closing.</div>}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setMode('reminder')} style={tab(mode === 'reminder')}>⏰ Set reminder</button>
                {gateOpen && <button type="button" onClick={() => setMode('reassign')} style={tab(mode === 'reassign')}>🔄 Reassign</button>}
                {gateOpen && <button type="button" onClick={() => setMode('close')} style={tab(mode === 'close')}>❌ Close</button>}
            </div>
            {mode === 'reminder' && (<>
                <Field label="Call again at *"><input aria-label="Date and time" type="datetime-local" value={remindAt} onChange={e => setRemindAt(e.target.value)} style={inputStyle} /></Field>
                <Field label="Note (optional)"><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} style={inputStyle} placeholder="What to mention next time?" /></Field>
                <ActionRow submitting={submitting} onCancel={onCancel} disabled={!remindAt} label="Set reminder" onSubmit={() => onSetReminder(new Date(remindAt).toISOString(), notes)} />
            </>)}
            {mode === 'reassign' && (<>
                <Field label="Reassign to *">
                    <select aria-label="Reassign to agent" value={agentId} onChange={e => setAgentId(e.target.value)} style={inputStyle}>
                        <option value="">Select an agent…</option>
                        {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                </Field>
                <ActionRow submitting={submitting} onCancel={onCancel} disabled={!agentId} label="Reassign deal" onSubmit={() => onReassign(agentId)} />
            </>)}
            {mode === 'close' && (<>
                <div style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: 'rgba(239,68,68,0.08)', fontSize: '13px', color: 'var(--text-primary)' }}>
                    Closes the deal as unreachable — the {noAnswerCount} no-answer call{noAnswerCount === 1 ? '' : 's'} are recorded.
                </div>
                <Field label="Note (optional)"><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} style={inputStyle} placeholder="Anything to add?" /></Field>
                <ActionRow submitting={submitting} onCancel={onCancel} disabled={false} label="Close — couldn't reach" onSubmit={() => onCloseUnreachable(notes)} danger />
            </>)}
        </div>
    );
}

function ActionRow({ submitting, onCancel, onSubmit, label, disabled, danger }: {
    submitting: boolean; onCancel: () => void; onSubmit: () => void; label: string; disabled: boolean; danger?: boolean;
}) {
    const blocked = submitting || disabled;
    return (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onCancel} disabled={submitting} style={{ padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: '1px solid var(--border-secondary)', backgroundColor: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancel</button>
            <button type="button" onClick={onSubmit} disabled={blocked}
                style={{ padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, border: 'none', color: '#fff',
                    backgroundColor: blocked ? '#94a3b8' : (danger ? '#ef4444' : 'var(--accent-primary)'), cursor: blocked ? 'not-allowed' : 'pointer' }}>
                {submitting ? 'Saving…' : label}
            </button>
        </div>
    );
}

// ─── INTERESTED WIZARD STEPS — share → reminder (deal-workflow, 2026-06-29) ─────

export function ShareStep({ dealId, onAdvance, onCancel }: { dealId: string; onAdvance: () => void; onCancel: () => void }) {
    const [matches, setMatches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [sharing, setSharing] = useState(false);
    const [done, setDone] = useState(false);
    const [err, setErr] = useState('');
    useEffect(() => {
        getDealMatchedInventory(dealId).then((res: any) => { setMatches(res?.data || []); setLoading(false); }).catch(() => setLoading(false));
    }, [dealId]);
    const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const fmtPrice = (p: number) => p >= 1e7 ? `₹${(p / 1e7).toFixed(2)} Cr` : p >= 1e5 ? `₹${(p / 1e5).toFixed(1)} L` : `₹${p.toLocaleString('en-IN')}`;
    const share = async () => {
        if (!selected.size) return;
        setSharing(true); setErr('');
        try { await shareDealProperties(dealId, [...selected]); setDone(true); setTimeout(onAdvance, 900); }
        catch (e: any) { setErr(e?.response?.data?.error || 'Share failed'); setSharing(false); }
    };
    if (loading) return <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>Finding matches…</div>;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: 'rgba(34,197,94,0.08)', fontSize: '13px', color: 'var(--text-primary)' }}>
                ✅ Qualified. Share matching properties with the client, then set your next reminder.
            </div>
            {done ? <div style={{ padding: '20px', textAlign: 'center', color: '#22c55e', fontWeight: 700 }}>📤 Shared! Continuing…</div> : matches.length === 0 ? (
                <>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No suitable inventory matches this requirement yet.</div>
                    <ActionRow submitting={false} onCancel={onCancel} disabled={false} label="No match yet → set reminder" onSubmit={onAdvance} />
                </>
            ) : (
                <>
                    <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {matches.slice(0, 30).map((m: any) => {
                            const sel = selected.has(m.id);
                            const loc = [m.locality, m.city].filter(Boolean).join(', ');
                            return (
                                <button key={m.id} type="button" onClick={() => toggle(m.id)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', textAlign: 'left', cursor: 'pointer',
                                        border: sel ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-secondary)', backgroundColor: sel ? 'rgba(59,130,246,0.08)' : 'var(--bg-secondary)' }}>
                                    <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        border: sel ? '2px solid var(--accent-primary)' : '2px solid var(--border-secondary)', backgroundColor: sel ? 'var(--accent-primary)' : 'transparent' }}>
                                        {sel && <span style={{ color: '#fff', fontSize: 11, lineHeight: 1 }}>✓</span>}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{String(m.type || 'Property').replace(/_/g, ' ')}{m.price ? ` · ${fmtPrice(Number(m.price))}` : ''}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc || m.location || ''}{m.already_shared ? ' · already shared' : ''}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    {err && <div style={{ fontSize: '12px', color: '#ef4444' }}>{err}</div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <button type="button" onClick={onAdvance} disabled={sharing} style={{ background: 'none', border: 'none', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}>Skip → reminder</button>
                        <ActionRow submitting={sharing} onCancel={onCancel} disabled={selected.size === 0} label={`Share ${selected.size || ''}→ reminder`} onSubmit={share} />
                    </div>
                </>
            )}
        </div>
    );
}

export function FollowUpReminderStep({ dealId, contactName, onDone, onCancel }: { dealId: string; contactName: string; onDone: () => void; onCancel: () => void }) {
    const [remindAt, setRemindAt] = useState(() => defaultReminderLocal());
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const save = async () => {
        if (!remindAt) return;
        setSaving(true); setErr('');
        try {
            await setDealReminder(dealId, { remind_at: new Date(remindAt).toISOString(), note: note.trim() || `Follow up with ${contactName}` });
            onDone();
        } catch (e: any) { setErr(e?.response?.data?.error || 'Failed to set reminder'); setSaving(false); }
    };
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: 'rgba(59,130,246,0.08)', fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                Last step — when will you follow up with {contactName} next? This books your reminder (Google Calendar + Tasks + in-app) and becomes the deal's <strong>Next</strong>.
            </div>
            <Field label="Follow up at *"><input aria-label="Date and time" type="datetime-local" value={remindAt} onChange={e => setRemindAt(e.target.value)} style={inputStyle} /></Field>
            <Field label="Next action (optional)"><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} style={inputStyle} placeholder="e.g. Confirm if they liked the shared options" /></Field>
            {err && <div style={{ fontSize: '12px', color: '#ef4444' }}>{err}</div>}
            <ActionRow submitting={saving} onCancel={onCancel} disabled={!remindAt} label="Finish — set reminder" onSubmit={save} />
        </div>
    );
}
