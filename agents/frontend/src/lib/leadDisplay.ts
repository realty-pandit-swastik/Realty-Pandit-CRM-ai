/**
 * Shared lead-tile display helpers — single owner for BHK labels and pipeline-stage
 * badges used by both the mobile LeadCard and the desktop rows in ExternalLeads.
 */

// Pipeline stage (Contact.lifecycle_stage, or the row's deal status on multi-deal
// contacts). Shown read-only — the stage itself is driven by the deal pipeline.
export const STAGE_META: Record<string, { label: string; color: string }> = {
    NEW: { label: 'New', color: '#3b82f6' },
    QUALIFIED: { label: 'Qualified', color: '#6366f1' },
    MATCHED: { label: 'Matched', color: '#8b5cf6' },
    MATCHING_APPOINTMENT: { label: 'Matching', color: '#8b5cf6' },
    VISIT_SCHEDULED: { label: 'Visit set', color: '#f59e0b' },
    VISITED: { label: 'Visited', color: '#14b8a6' },
    NEGOTIATION: { label: 'Negotiation', color: '#f97316' },
    CLOSED_WON: { label: 'Won', color: '#22c55e' },
    CLOSED_LOST: { label: 'Lost', color: '#ef4444' },
    ON_HOLD: { label: 'On hold', color: '#94a3b8' },
};

export const stageInfo = (raw?: string | null): { label: string; color: string } => {
    const key = String(raw || 'NEW').toUpperCase();
    return STAGE_META[key === 'LEAD' ? 'NEW' : key] || { label: String(raw || 'New'), color: '#6b7280' };
};

/**
 * BHK label — canonical demand_schema_values.bhk first ("2", "1 RK", 2),
 * legacy demand_bhk mirror fallback (set by optimistic saves, absent on fresh loads).
 * Returns null when there is no meaningful value (null/empty/0/non-numeric arrays).
 */
export function bhkLabel(source: { demand_schema_values?: Record<string, any> | null; demand_bhk?: number | null } | null | undefined): string | null {
    const raw: any = source?.demand_schema_values?.bhk ?? (source as any)?.demand_bhk ?? null;
    if (raw == null || raw === '' || Array.isArray(raw)) return null;
    const s = String(raw).trim();
    if (!s) return null;
    if (/rk/i.test(s)) {
        const n = parseInt(s, 10);
        if (Number.isNaN(n) || n <= 0) return s.toUpperCase();
        return `${n} RK`;
    }
    const n = parseInt(s, 10);
    if (Number.isNaN(n)) return s;
    if (n <= 0) return null;
    return `${n} BHK`;
}
