import { toDialablePhone, isPlaceholderPhone } from '../../lib/phone';
import { stageInfo, bhkLabel, dealerFallback, effectiveClientRole, isTemporaryClientRole, clientRoleLabel } from '../../lib/leadDisplay';
import { PresentationIcon } from '../ui/PresentationIcon';

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
    demand_transactions?: Array<{ id: string; client_role_override?: string | null }> | null;
    // Primary client role (CLIENT | AGENT | BUILDER | FINANCER | CHOKIDAR…).
    client_role?: string | null;
    /** The enquiry (deal) this card represents — set when a contact has several leads. */
    _deal?: { id?: string; source_ref: string | null; client_role_override?: string | null } | null;
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
    cold: 'var(--text-secondary)', warm: 'var(--rp-warn-text)', hot: 'var(--rp-danger-text)', closed: 'var(--rp-success-text)', lost: 'var(--text-secondary)',
};

export default function LeadCard({
    lead, currentAgentId, isSelected, onSelect, onStatusChange, updatingPhone,
    sourceColors, sourceLabels, scoreColor, formatBudget,
    subtypeLabel, matchCount, onOpenPipeline, onOpenMatches,
}: LeadCardProps) {
    // Shown identity: the client's own name/number, else the dealer's (placeholder phone =
    // "we don't know the client yet"). The buttons target whichever identity is shown.
    const identity = dealerFallback(lead, isPlaceholderPhone, toDialablePhone);
    const clientTel = identity.phone;                              // canonical +91… or null
    const partnerTel = identity.isDealer ? null : toDialablePhone(lead.referral_partner_phone);
    const dialable = !!clientTel;
    const waHref = clientTel ? `https://wa.me/${clientTel.slice(1)}` : null;
    const score = lead.lead_score?.total_score;
    const date = new Date(lead.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    const bhk = bhkLabel(lead);
    const role = effectiveClientRole(lead);
    const si = stageInfo((lead as any).lifecycle_stage);
    // Subtype fallback: explicit label from the parent, else the legacy property_type slug.
    const subtype = subtypeLabel || (lead.property_type ? lead.property_type.replace(/_/g, ' ') : null);

    return (
        <div
            onClick={() => onSelect(lead.phone_number)}
            style={{
                backgroundColor: isSelected ? 'var(--bg-active)' : 'var(--bg-primary)',
                border: isSelected ? '1px solid var(--blue-600)' : '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-card)',
                padding: '12px 14px',
                paddingRight: dialable ? '112px' : '14px',
                paddingBottom: lead.lead_type === 'PARTNER_REFERRAL' && partnerTel ? '64px' : '12px',
                cursor: 'pointer',
                position: 'relative',
                transition: 'border-color 0.15s',
            }}
        >
            {/* Row 1: Name + BHK + Subtype + Client-type badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                <button type="button" className="rp-lead-name" style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                    {identity.name || 'Unknown'}
                </button>
                {identity.isDealer && (
                    <span title="Client unknown — showing the dealer who brought this lead"
                        style={{ backgroundColor: 'var(--rp-info-bg)', color: 'var(--rp-info-text)', padding: '4px 8px', borderRadius: 'var(--radius-control)', fontSize: '12px', fontWeight: 500 }}>
                        Dealer
                    </span>
                )}
                {lead.lead_type === 'PARTNER_REFERRAL' && (
                    <span style={{ backgroundColor: 'var(--rp-info-bg)', color: 'var(--rp-info-text)', padding: '4px 8px', borderRadius: 'var(--radius-control)', fontSize: '12px', fontWeight: 500 }}>
                        {lead.referral_partner_name || 'Partner'}
                    </span>
                )}
                {role && (
                    <span title={isTemporaryClientRole(lead) ? 'Temporary role for this enquiry' : 'Primary role'}
                        style={{ backgroundColor: 'var(--rp-info-bg)', color: 'var(--rp-info-text)', padding: '4px 8px', borderRadius: 'var(--radius-control)', fontSize: '12px', fontWeight: 500, textTransform: 'capitalize' }}>
                        {clientRoleLabel(role)}
                    </span>
                )}
                {!!currentAgentId && lead.shared_with_ids?.includes(currentAgentId) && (
                    <span title="Shared with you by a teammate — the owner is unchanged"
                        style={{ backgroundColor: 'var(--rp-info-bg)', color: 'var(--rp-info-text)', padding: '4px 8px', borderRadius: 'var(--radius-control)', fontSize: '12px', fontWeight: 500 }}>
                        Shared
                    </span>
                )}
                {bhk && (
                    <span style={{ backgroundColor: 'var(--rp-info-bg)', color: 'var(--rp-info-text)', padding: '4px 8px', borderRadius: 'var(--radius-control)', fontSize: '12px', fontWeight: 500 }}>
                        {bhk}
                    </span>
                )}
                {subtype && (
                    <span title="Property subtype"
                        style={{ backgroundColor: 'var(--rp-info-bg)', color: 'var(--rp-info-text)', padding: '4px 8px', borderRadius: 'var(--radius-control)', fontSize: '12px', fontWeight: 500, textTransform: 'capitalize' }}>
                        {subtype}
                    </span>
                )}
            </div>

            {/* Row 2: Phone + Date */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {dialable ? (identity.phone as string) : 'No phone'}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{date}</span>
            </div>

            {/* Row 3: Source + Status + Stage + Score + Intent */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {/* Source badge */}
                <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    backgroundColor: 'var(--rp-info-bg)',
                    color: sourceColors[lead.source] || 'var(--text-secondary)',
                    padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600,
                }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: sourceColors[lead.source] || 'var(--text-secondary)' }} />
                    {sourceLabels[lead.source] || lead.source}
                </span>

                {/* Status dropdown */}
                <select
                    value={lead.lead_status}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => { e.stopPropagation(); onStatusChange(lead.phone_number, e.target.value); }}
                    disabled={updatingPhone === lead.phone_number}
                    style={{
                        backgroundColor: 'var(--bg-primary)',
                        color: statusColors[lead.lead_status] || 'var(--text-secondary)',
                        border: 'none', borderRadius: '10px', padding: '2px 8px',
                        fontSize: '10px', fontWeight: 600, cursor: 'pointer',
                        opacity: updatingPhone === lead.phone_number ? 0.5 : 1,
                    }}
                >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>

                {/* Pipeline stage */}
                <span title="Pipeline stage"
                    style={{ backgroundColor: 'var(--rp-info-bg)', color: 'var(--rp-info-text)', padding: '4px 8px', borderRadius: 'var(--radius-control)', fontSize: '12px', fontWeight: 500 }}>
                    {si.label}
                </span>

                {/* Score */}
                {score != null && (
                    <span style={{ backgroundColor: 'var(--bg-secondary)', color: scoreColor(score), padding: '4px 8px', borderRadius: 'var(--radius-control)', fontSize: '12px', fontWeight: 500 }}>
                        {score}
                    </span>
                )}

                {/* Intent */}
                {lead.intent && (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                        {lead.intent}
                    </span>
                )}

                {/* Quality flags — only for 99acres leads */}
                {lead.source === '99acres' && !lead.budget_max && (
                    <span style={{ backgroundColor: 'var(--rp-warn-bg)', color: 'var(--rp-warn-text)', padding: '4px 8px', borderRadius: 'var(--radius-control)', fontSize: '12px', fontWeight: 500 }}>
                        No Budget
                    </span>
                )}
                {lead.source === '99acres' && (!lead.email || !lead.email.includes('@')) && (
                    <span style={{ backgroundColor: 'var(--rp-warn-bg)', color: 'var(--rp-warn-text)', padding: '4px 8px', borderRadius: 'var(--radius-control)', fontSize: '12px', fontWeight: 500 }}>
                        No Email
                    </span>
                )}
            </div>

            {/* Row 4: Location + Budget */}
            {(lead.preferred_location || lead.budget_min || lead.budget_max) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                        {lead.preferred_location || ''}
                    </span>
                    {(lead.budget_min || lead.budget_max) && (
                        <span>{formatBudget(lead.budget_min)}–{formatBudget(lead.budget_max)}</span>
                    )}
                </div>
            )}

            {lead._deal?.source_ref && (
                <div title={lead._deal.source_ref} style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <PresentationIcon value="house" /> {lead._deal.source_ref}
                </div>
            )}

            {/* Row 5: Assigned manager (2026-05-13) */}
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <PresentationIcon value="user-round" />
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
                                backgroundColor: 'var(--rp-info-bg)', color: 'var(--rp-info-text)',
                                border: '1px solid var(--control-line)', cursor: 'pointer',
                            }}
                        >
                            Pipeline
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
                                backgroundColor: 'var(--rp-info-bg)', color: 'var(--rp-info-text)',
                                border: '1px solid var(--control-line)', cursor: 'pointer',
                            }}
                        >
                            {matchCount != null ? `${matchCount} Matches` : 'Matching'}
                        </button>
                    )}
                </div>
            )}

            {/* WhatsApp button — wa.me deep link, only for a real number */}
            {waHref && (
                <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="Chat on WhatsApp"
                    aria-label="Chat on WhatsApp"
                    style={{
                        position: 'absolute', top: '8px', right: '56px',
                        width: '44px', height: '44px', borderRadius: 'var(--radius-control)',
                        backgroundColor: 'var(--rp-info-bg)', color: 'var(--rp-info-text)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '14px', textDecoration: 'none',
                    }}
                >
                    <PresentationIcon value="message-circle" />
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
                        position: 'absolute', top: '8px', right: '8px',
                        width: '44px', height: '44px', borderRadius: 'var(--radius-control)',
                        backgroundColor: 'var(--rp-info-bg)', color: 'var(--rp-info-text)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '14px', textDecoration: 'none',
                    }}
                >
                    <PresentationIcon value="phone" />
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
                        minWidth: '44px', height: '44px', padding: '0 8px', borderRadius: 'var(--radius-control)',
                        backgroundColor: 'var(--rp-info-bg)', color: 'var(--rp-info-text)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', fontWeight: 700, textDecoration: 'none',
                    }}
                >
                    <PresentationIcon value="phone" />
                </a>
            )}
        </div>
    );
}
