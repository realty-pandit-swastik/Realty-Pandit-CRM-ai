import { toDialablePhone } from '../../lib/phone';

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
}

const STATUSES = ['cold', 'warm', 'hot', 'closed', 'lost'];
const statusColors: Record<string, string> = {
    cold: '#94a3b8', warm: '#f59e0b', hot: '#ef4444', closed: '#22c55e', lost: '#6b7280',
};

export default function LeadCard({
    lead, currentAgentId, isSelected, onSelect, onStatusChange, updatingPhone,
    sourceColors, sourceLabels, scoreColor, formatBudget,
}: LeadCardProps) {
    const clientTel = toDialablePhone(lead.phone_number);          // canonical +91… for tel:, or null (placeholder/junk)
    const partnerTel = toDialablePhone(lead.referral_partner_phone);
    const dialable = !!clientTel;
    const score = lead.lead_score?.total_score;
    const date = new Date(lead.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

    return (
        <div
            onClick={() => onSelect(lead.phone_number)}
            style={{
                backgroundColor: isSelected ? 'rgba(59,130,246,0.08)' : 'var(--bg-secondary, #1e293b)',
                border: isSelected ? '1px solid #3b82f6' : '1px solid var(--border-secondary, #334155)',
                borderRadius: '12px',
                padding: '12px 14px',
                cursor: 'pointer',
                position: 'relative',
                transition: 'border-color 0.15s',
            }}
        >
            {/* Row 1: Name + Badges */}
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
                {lead.demand_bhk && (
                    <span style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa', padding: '1px 6px', borderRadius: '8px', fontSize: '9px', fontWeight: 600 }}>
                        {lead.demand_bhk} BHK
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

            {/* Row 3: Source + Status + Score + Intent */}
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

            {/* Row 5: Assigned manager (2026-05-13) */}
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted, #94a3b8)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>👤</span>
                <span>{lead.assigned_agent?.name || <span style={{ fontStyle: 'italic' }}>Unassigned</span>}</span>
            </div>

            {/* Call button — only for a real, dialable number (not placeholder/junk) */}
            {dialable && (
                <a
                    href={`tel:${clientTel}`}
                    onClick={(e) => e.stopPropagation()}
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
                        position: 'absolute', top: '10px', right: dialable ? '44px' : '10px',
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
