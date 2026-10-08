import { toDialablePhone } from '../../lib/phone';
import { stageInfo, bhkLabel } from '../../lib/leadDisplay';

interface Lead {
    phone_number: string;
    name: string | null;
    email: string | null;
    source: string;
    lead_status: string;
    intent: string | null;
    preferred_location: string | null;
    created_at: string;
    budget_min: string | null;
    budget_max: string | null;
    demand_bhk: number | null;
    lead_score: { total_score: number } | null;
    lead_type: string | null;
    referral_partner_name: string | null;
    referral_partner_phone: string | null;
    assigned_agent?: { id: string; name: string | null; role: string | null } | null;
    // 2026-08-09: agent IDs this lead is shared with, for the "Shared" badge.
    shared_with_ids?: string[] | null;
    // Pipeline stage (Contact.lifecycle_stage, or the row's deal status on multi-deal contacts).
    lifecycle_stage?: string | null;
    property_type?: string | null;
    demand_taxonomy_node_id?: string | null;
    demand_schema_values?: Record<string, any> | null;
    demand_transactions?: Array<{ id: string }> | null;
    /** The enquiry (deal) this card represents — set when a contact has several leads. */
    _deal?: { id?: string; source_ref: string | null } | null;
}

interface LeadCardProps {
    /** Viewer's agent id — the badge shows only when the lead is shared with THIS person. */
    currentAgentId?: string | null;
    lead: Lead;
    isSelected: boolean;
    onSelect: (phone: string) => void;
    onStatusChange: (phone: string, status: string) => void;
    updatingPhone: string | null;
    sourceColors: Record<string, string>;
    sourceLabels: Record<string, string>;
    scoreColor: (s: number) => string;
    formatBudget: (val: string | null) => string;
    /** Resolved taxonomy node name (e.g. "Builder Flat Front") — parent resolves via taxonomy tree. */
    subtypeLabel?: string | null;
    /** Lightweight "N matching properties" count for the row's deal (null = unknown/not loaded). */
    matchCount?: number | null;
    /** Open the Deal Pipeline (focused on this lead's deal when known). */
    onOpenPipeline?: (lead: Lead) => void;
    /** Open the lead detail to view/find matching properties. */
    onOpenMatches?: (lead: Lead) => void;
}

const STATUSES = ['cold', 'warm', 'hot', 'closed', 'lost'];
const statusColors: Record<string, string> = {
    cold: '#94a3b8', warm: '#f59e0b', hot: '#ef4444', closed: '#22c55e', lost: '#6b7280',
};

export default function LeadCard({
    lead, currentAgentId, isSelected, onSelect, onStatusChange, updatingPhone,
    sourceColors, sourceLabels, scoreColor, formatBudget,
    subtypeLabel, matchCount, onOpenPipeline, onOpenMatches,
}: LeadCardProps) {
    const clientTel = toDialablePhone(lead.phone_number);          // canonical +91… for tel:, or null (placeholder/junk)
    const partnerTel = toDialablePhone(lead.referral_partner_phone);
    const dialable = !!clientTel;
    const waHref = clientTel ? `https://wa.me/${clientTel.slice(1)}` : null;
    const score = lead.lead_score?.total_score;
    const date = new Date(lead.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    const bhk = bhkLabel(lead);
    const si = stageInfo((lead as any).lifecycle_stage);
    // Subtype fallback: explicit label from the parent, else the legacy property_type slug.
    const subtype = subtypeLabel || (lead.property_type ? lead.property_type.replace(/_/g, ' ') : null);

    return (
        <div
            onClick={() => onSelect(lead.phone_number)}
            style={{
                backgroundColor: isSelected ? 'rgba(59,130,246,0.08)' : 'var(--bg-secondary, #1e293b)',
                border: isSelected ? '1px solid #3b82f6' : '1px solid var(--border-secondary, #334155)',
                borderRadius: '12px',
                padding: '12px 14px',
                paddingRight: dialable ? '76px' : '14px',
                cursor: 'pointer',
                position: 'relative',
                transition: 'border-color 0.15s',
            }}
        >
            {/* Row 1: Name + BHK + Subtype badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary, #f1f5f9)' }}>
                    {lead.name || 'Unknown'}
                </span>
                {lead.lead_type === 'PARTNER_REFERRAL' && (
                    <span style={{ backgroundColor: '#ede9fe', color: '#7c3aed', padding: '1px 6px', borderRadius: '8px', fontSize: '9px', fontWeight: 700 }}>
                        {lead.referral_partner_name || 'Partner'}
                    </span>
                )}
                {!!currentAgentId && lead.shared_with_ids?.includes(currentAgentId) && (
                    <span title="Shared with you by a teammate — the owner is unchanged"
                        style={{ backgroundColor: '#ede9fe', color: '#7c3aed', padding: '1px 6px', borderRadius: '8px', fontSize: '9px', fontWeight: 700 }}>
                        🤝 Shared
                    </span>
                )}
                {bhk && (
                    <span style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa', padding: '1px 6px', borderRadius: '8px', fontSize: '9px', fontWeight: 700 }}>
                        {bhk}
                    </span>
                )}
                {subtype && (
                    <span title="Property subtype"
                        style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#a78bfa', padding: '1px 6px', borderRadius: '8px', fontSize: '9px', fontWeight: 600, textTransform: 'capitalize' }}>
                        {subtype}
                    </span>
                )}
            </div>

            {/* Row 2: Phone + Date */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)' }}>
                    {dialable ? lead.phone_number : 'No phone'}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)' }}>{date}</span>
            </div>

            {/* Row 3: Source + Status + Stage + Score + Intent */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {/* Source badge */}
                <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    backgroundColor: `${sourceColors[lead.source] || '#6b7280'}22`,
                    color: sourceColors[lead.source] || '#6b7280',
                    padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600,
                }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: sourceColors[lead.source] || '#6b7280' }} />
                    {sourceLabels[lead.source] || lead.source}
                </span>

                {/* Status dropdown */}
                <select
                    value={lead.lead_status}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => { e.stopPropagation(); onStatusChange(lead.phone_number, e.target.value); }}
                    disabled={updatingPhone === lead.phone_number}
                    style={{
                        backgroundColor: `${statusColors[lead.lead_status] || '#6b7280'}22`,
                        color: statusColors[lead.lead_status] || '#6b7280',
                        border: 'none', borderRadius: '10px', padding: '2px 8px',
                        fontSize: '10px', fontWeight: 600, cursor: 'pointer',
                        opacity: updatingPhone === lead.phone_number ? 0.5 : 1,
                    }}
                >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>

                {/* Pipeline stage */}
                <span title="Pipeline stage"
                    style={{ backgroundColor: `${si.color}22`, color: si.color, padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 700 }}>
                    {si.label}
                </span>

                {/* Score */}
                {score != null && (
                    <span style={{ backgroundColor: `${scoreColor(score)}22`, color: scoreColor(score), padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 700 }}>
                        {score}
                    </span>
                )}

                {/* Intent */}
                {lead.intent && (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted, #94a3b8)', textTransform: 'capitalize' }}>
                        {lead.intent}
                    </span>
                )}

                {/* Quality flags — only for 99acres leads */}
                {lead.source === '99acres' && !lead.budget_max && (
                    <span style={{ backgroundColor: '#fef3c722', color: '#d97706', padding: '2px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}>
                        No Budget
                    </span>
                )}
                {lead.source === '99acres' && (!lead.email || !lead.email.includes('@')) && (
                    <span style={{ backgroundColor: '#fef3c722', color: '#d97706', padding: '2px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}>
                        No Email
                    </span>
                )}
            </div>

            {/* Row 4: Location + Budget */}
            {(lead.preferred_location || lead.budget_min || lead.budget_max) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '11px', color: 'var(--text-muted, #94a3b8)' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                        {lead.preferred_location || ''}
                    </span>
                    {(lead.budget_min || lead.budget_max) && (
                        <span>{formatBudget(lead.budget_min)}–{formatBudget(lead.budget_max)}</span>
                    )}
                </div>
            )}

            {lead._deal?.source_ref && (
                <div title={lead._deal.source_ref} style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted, #94a3b8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    🏠 {lead._deal.source_ref}
                </div>
            )}

            {/* Row 5: Assigned manager (2026-05-13) */}
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted, #94a3b8)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>👤</span>
                <span>{lead.assigned_agent?.name || <span style={{ fontStyle: 'italic' }}>Unassigned</span>}</span>
            </div>

            {/* Row 6: Pipeline + Matching actions */}
            {(onOpenPipeline || onOpenMatches) && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    {onOpenPipeline && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onOpenPipeline(lead); }}
                            title="Open this lead in the Deal Pipeline"
                            aria-label="Open this lead in the Deal Pipeline"
                            style={{
                                flex: 1, padding: '6px 0', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                                backgroundColor: 'rgba(59,130,246,0.12)', color: '#60a5fa',
                                border: '1px solid rgba(59,130,246,0.4)', cursor: 'pointer',
                            }}
                        >
                            📊 Pipeline
                        </button>
                    )}
                    {onOpenMatches && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onOpenMatches(lead); }}
                            title="View matching properties for this lead"
                            aria-label="View matching properties for this lead"
                            style={{
                                flex: 1, padding: '6px 0', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                                backgroundColor: 'rgba(139,92,246,0.12)', color: '#a78bfa',
                                border: '1px solid rgba(139,92,246,0.4)', cursor: 'pointer',
                            }}
                        >
                            🏠 {matchCount != null ? `${matchCount} Matches` : 'Matching'}
                        </button>
                    )}
                </div>
            )}

            {/* WhatsApp button — wa.me deep link, only for a real number */}
            {waHref && (
                <a
                    href={waHref}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="Chat on WhatsApp"
                    aria-label="Chat on WhatsApp"
                    style={{
                        position: 'absolute', top: '10px', right: '44px',
                        width: '28px', height: '28px', borderRadius: '50%',
                        backgroundColor: 'rgba(37,211,102,0.15)', color: '#25d366',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '14px', textDecoration: 'none',
                    }}
                >
                    💬
                </a>
            )}

            {/* Call button — only for a real, dialable number (not placeholder/junk) */}
            {dialable && (
                <a
                    href={`tel:${clientTel}`}
                    onClick={(e) => e.stopPropagation()}
                    title="Call client"
                    aria-label="Call client"
                    style={{
                        position: 'absolute', top: '10px', right: '10px',
                        width: '28px', height: '28px', borderRadius: '50%',
                        backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '14px', textDecoration: 'none',
                    }}
                >
                    📞
                </a>
            )}

            {/* Call partner — for partner-referral leads, reach the referring partner agent directly */}
            {lead.lead_type === 'PARTNER_REFERRAL' && partnerTel && (
                <a
                    href={`tel:${partnerTel}`}
                    onClick={(e) => e.stopPropagation()}
                    title={`Call partner ${lead.referral_partner_name || ''}`}
                    style={{
                        position: 'absolute', bottom: '10px', right: '10px',
                        height: '28px', padding: '0 8px', borderRadius: '14px',
                        backgroundColor: 'rgba(124,58,237,0.15)', color: '#7c3aed',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', fontWeight: 700, textDecoration: 'none',
                    }}
                >
                    🤝📞
                </a>
            )}
        </div>
    );
}
