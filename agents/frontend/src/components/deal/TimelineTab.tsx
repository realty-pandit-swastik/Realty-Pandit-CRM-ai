import React, { useState } from 'react';
import { InventoryPreviewModal } from './MatchShareTab';
import { noAnswerReasonLabel } from '../../lib/callOutcomes';

// Raw timeline event exactly as returned by GET /api/deals/:id/timeline
interface RawEvent {
    id: string;
    source: 'log' | 'query' | 'appointment' | 'team_action' | 'whatsapp' | 'call' | 'interaction' | 'lead_origin';
    created_at: string;
    // log
    action?: string;
    old_status?: string;
    new_status?: string;
    details?: any;
    performed_by?: string;
    channel?: string;
    // query
    subject?: string;
    message?: string;
    status?: string;
    answer?: string;
    raised_by_type?: string;
    // appointment
    appointment_type?: string;
    scheduled_at?: string;
    // team_action
    action_type?: string;
    outcome?: string;
    notes?: string;
    stage?: string;
    agent_name?: string;
    agent_role?: string;
    // whatsapp
    direction?: string;
    body?: string;
    message_type?: string;
    template_name?: string;
    // call
    call_status?: string;
    duration?: number;
    ai_call_summary?: string;
    // interaction
    event_type?: string;
    content?: string;
    metadata?: any;
    // lead_origin
    lead_source?: string;
    contact_name?: string;
    intent?: string;
    property_type?: string;
    budget_min?: number;
    budget_max?: number;
    preferred_location?: string;
    meta_campaign_name?: string;
    referral_partner_name?: string;
}

interface Props {
    events: RawEvent[];
    loading: boolean;
}

function formatTs(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
}

function formatDuration(secs?: number): string {
    if (!secs) return '';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m ? `${m}m ${s}s` : `${s}s`;
}

function renderEvent(ev: RawEvent, onPreview?: (id: string) => void): { icon: string; label: string; detail: React.ReactNode } {
    switch (ev.source) {

        case 'log': {
            const action = ev.action || '';
            if (action === 'STATUS_CHANGED') {
                return {
                    icon: '🔄',
                    label: 'Status changed',
                    detail: <span><strong>{ev.old_status}</strong> → <strong>{ev.new_status}</strong>{ev.performed_by ? ` · by ${ev.performed_by}` : ''}</span>,
                };
            }
            if (action === 'REQUIREMENTS_UPDATED') {
                const changes = ev.details?.changes || {};
                return {
                    icon: '✏️',
                    label: 'Requirements updated',
                    detail: Object.keys(changes).length > 0 ? (
                        <div>
                            {Object.entries(changes).map(([k, v]) => (
                                <div key={k} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                    <strong>{k.replace('demand_', '')}</strong>: {String(v)}
                                </div>
                            ))}
                        </div>
                    ) : null,
                };
            }
            if (action === 'DEAL_CREATED') return { icon: '🟢', label: 'Deal created', detail: null };
            if (action === 'PAUSED_AI')   return { icon: '⏸', label: 'AI paused', detail: ev.performed_by ? <span>by {ev.performed_by}</span> : null };
            if (action === 'RESUMED_AI')  return { icon: '▶️', label: 'AI resumed', detail: ev.performed_by ? <span>by {ev.performed_by}</span> : null };
            return { icon: '📋', label: action.replace(/_/g, ' '), detail: ev.details ? <span style={{ fontSize: 11 }}>{JSON.stringify(ev.details).substring(0, 80)}</span> : null };
        }

        case 'team_action': {
            const type = ev.action_type || '';
            const icons: Record<string, string> = {
                CALL_LOGGED: '📞', LOG_CALL: '📞', SCHEDULED_VISIT: '📅',
                CONFIRMED_VISIT: '✅', REMINDER_GIVEN: '🔔', OUTCOME_SUBMITTED: '📝',
                TRANSFER: '🔄', NOTE_ADDED: '💬',
            };
            return {
                icon: icons[type] || '👤',
                label: type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()),
                detail: (
                    <div>
                        {ev.notes && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ev.notes}</div>}
                        {ev.outcome && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Outcome: {noAnswerReasonLabel(ev.outcome)}</div>}
                        {ev.agent_name && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>by {ev.agent_name}</div>}
                    </div>
                ),
            };
        }

        case 'appointment': {
            const ts = ev.scheduled_at ? formatTs(ev.scheduled_at) : '—';
            return {
                icon: '📅',
                label: `Visit scheduled`,
                detail: <span>{ts} · {ev.status || 'SCHEDULED'}</span>,
            };
        }

        case 'whatsapp': {
            const dir = ev.direction === 'inbound' ? '📥' : '📤';
            const label = ev.direction === 'inbound' ? 'Customer replied on WhatsApp' : 'WhatsApp sent';
            return {
                icon: dir,
                label,
                detail: ev.body ? <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ev.body.substring(0, 100)}</span>
                       : ev.template_name ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Template: {ev.template_name}</span>
                       : null,
            };
        }

        case 'call': {
            const dir = ev.direction === 'inbound' ? '📲' : '📞';
            return {
                icon: dir,
                label: `Voice call${ev.call_status ? ` · ${ev.call_status}` : ''}`,
                detail: (
                    <div>
                        {ev.duration ? <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Duration: {formatDuration(ev.duration)}</div> : null}
                        {ev.ai_call_summary ? <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{ev.ai_call_summary.substring(0, 120)}</div> : null}
                    </div>
                ),
            };
        }

        case 'query': {
            return {
                icon: '❓',
                label: `Query: ${ev.subject || '—'}`,
                detail: (
                    <div>
                        {ev.message && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ev.message.substring(0, 80)}</div>}
                        {ev.answer && <div style={{ fontSize: 11, color: '#22c55e', marginTop: 2 }}>Answer: {ev.answer.substring(0, 80)}</div>}
                    </div>
                ),
            };
        }

        case 'interaction': {
            const etype = ev.event_type || '';
            const icons: Record<string, string> = {
                property_shared: '🏠',
                property_share_exhausted: '📦',
                pipeline_cold_nudge: '💬',
                call_initiated: '📞',
                deal_created: '🟢',
            };
            const labels: Record<string, string> = {
                property_shared: 'Property shared with customer',
                property_share_exhausted: 'All matching properties shared',
                pipeline_cold_nudge: 'Follow-up nudge sent',
                call_initiated: 'AI call initiated',
                deal_created: 'Deal created',
            };
            const invId = ev.metadata?.inventory_id;
            const contentNode = ev.content && ev.content !== labels[etype]
                ? <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ev.content}</span>
                : null;
            const viewBtn = etype === 'property_shared' && invId && onPreview
                ? <button type="button" onClick={() => onPreview(invId)} style={{
                    marginTop: contentNode ? 4 : 0, background: 'none', border: 'none',
                    color: 'var(--accent-primary)', fontSize: 11, cursor: 'pointer', padding: 0,
                    fontWeight: 600, display: 'block',
                }}>👁 View Property</button>
                : null;
            return {
                icon: icons[etype] || '💡',
                label: labels[etype] || (ev.content || etype.replace(/_/g, ' ')),
                detail: (contentNode || viewBtn) ? <div>{contentNode}{viewBtn}</div> : null,
            };
        }

        case 'lead_origin': {
            const SOURCE_LABELS: Record<string, string> = {
                '99acres': '99acres', 'magicbricks': 'MagicBricks', 'housing': 'Housing.com',
                'facebook': 'Facebook', 'website': 'Website', 'whatsapp': 'WhatsApp',
                'voice': 'Voice Call', 'manual': 'Manual (Agent)', 'partner_portal': 'Partner Portal',
            };
            const srcKey = (ev.lead_source || 'manual').toLowerCase();
            const srcLabel = SOURCE_LABELS[srcKey] || ev.lead_source || 'Manual';
            const formatBudget = (v?: number) => {
                if (!v) return null;
                if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
                if (v >= 100000)   return `₹${(v / 100000).toFixed(1)}L`;
                return `₹${(v / 1000).toFixed(0)}K`;
            };
            const budgetStr = ev.budget_max
                ? (ev.budget_min ? `${formatBudget(ev.budget_min)} – ${formatBudget(ev.budget_max)}` : `Up to ${formatBudget(ev.budget_max)}`)
                : null;
            return {
                icon: '🌐',
                label: `Lead received from ${srcLabel}`,
                detail: (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {ev.intent && <span style={{ marginRight: 10 }}><strong>Intent:</strong> {ev.intent}</span>}
                        {ev.property_type && <span style={{ marginRight: 10 }}><strong>Type:</strong> {ev.property_type}</span>}
                        {budgetStr && <span style={{ marginRight: 10 }}><strong>Budget:</strong> {budgetStr}</span>}
                        {ev.preferred_location && <span style={{ marginRight: 10 }}><strong>Location:</strong> {ev.preferred_location}</span>}
                        {ev.meta_campaign_name && <div style={{ marginTop: 2 }}><strong>Campaign:</strong> {ev.meta_campaign_name}</div>}
                        {ev.referral_partner_name && <div style={{ marginTop: 2 }}><strong>Referred by:</strong> {ev.referral_partner_name}</div>}
                        {ev.notes && <div style={{ marginTop: 2, fontStyle: 'italic' }}>{ev.notes.substring(0, 120)}</div>}
                    </div>
                ),
            };
        }

        default:
            return { icon: '•', label: 'Event', detail: null };
    }
}

export function TimelineTab({ events, loading }: Props) {
    const [previewInventoryId, setPreviewInventoryId] = useState<string | null>(null);

    if (loading) {
        return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading timeline…</div>;
    }
    if (events.length === 0) {
        return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No events yet.</div>;
    }

    return (
        <div style={{ padding: '14px 20px' }}>
            <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: 15, top: 16, bottom: 16, width: 2, backgroundColor: 'var(--border-secondary)' }} />

                {events.map((ev, i) => {
                    const { icon, label, detail } = renderEvent(ev, setPreviewInventoryId);
                    const ts = formatTs(ev.created_at);

                    return (
                        <div key={ev.id || i} style={{ display: 'flex', gap: 12, marginBottom: 14, position: 'relative' }}>
                            {/* Icon bubble */}
                            <div style={{
                                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                backgroundColor: 'var(--bg-secondary)', border: '2px solid var(--border-secondary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 13, zIndex: 1,
                            }}>
                                {icon}
                            </div>

                            {/* Content */}
                            <div style={{ flex: 1, paddingTop: 5, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{ts}</div>
                                </div>
                                {detail && <div style={{ marginTop: 2 }}>{detail}</div>}
                            </div>
                        </div>
                    );
                })}
            </div>

            {previewInventoryId && (
                <InventoryPreviewModal inventoryId={previewInventoryId} onClose={() => setPreviewInventoryId(null)} />
            )}
        </div>
    );
}
