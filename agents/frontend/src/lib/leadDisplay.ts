/**
 * Shared lead-tile display helpers — single owner for BHK labels, pipeline-stage
 * badges, dealer fallbacks and client-type labels used by both the mobile LeadCard
 * and the desktop rows in ExternalLeads.
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

/**
 * Client-type vocabulary — who a person IS. CLIENT | AGENT | BUILDER | FINANCER | CHOKIDAR,
 * extensible in this one map (mirrors the backend's Contact.client_role allow-list).
 * Deliberately separate from contact_type, which is load-bearing for queues/visibility.
 */
export const CLIENT_ROLE_LABEL: Record<string, string> = {
    CLIENT: 'Client',
    AGENT: 'Agent',
    BUILDER: 'Builder',
    FINANCER: 'Financer',
    CHOKIDAR: 'Chokidar',
};

/** Badge colors per client role. Unknown/future codes fall back to grey. */
export const CLIENT_ROLE_COLOR: Record<string, string> = {
    CLIENT: '#3b82f6',
    AGENT: '#7c3aed',
    BUILDER: '#f59e0b',
    FINANCER: '#14b8a6',
    CHOKIDAR: '#64748b',
};

export function clientRoleLabel(raw?: string | null): string | null {
    if (!raw) return null;
    const key = String(raw).trim().toUpperCase();
    return CLIENT_ROLE_LABEL[key] || String(raw).trim();
}

export function clientRoleColor(raw?: string | null): string {
    if (!raw) return '#6b7280';
    return CLIENT_ROLE_COLOR[String(raw).trim().toUpperCase()] || '#6b7280';
}

export interface ClientRoleRow {
    client_role?: string | null;
    _deal?: { client_role_override?: string | null } | null;
    demand_transactions?: Array<{ client_role_override?: string | null }> | null;
}

/** The row's temporary per-enquiry override, if any. */
function clientRoleOverrideOf(row: ClientRoleRow | null | undefined): string | null {
    return row?._deal?.client_role_override
        ?? row?.demand_transactions?.[0]?.client_role_override
        ?? null;
}

/**
 * Effective client type for a rendered row: the row's temporary per-enquiry override wins,
 * else the contact's primary role, else null (unclassified — renders as "—", never a guess).
 */
export function effectiveClientRole(row: ClientRoleRow | null | undefined): string | null {
    return clientRoleOverrideOf(row) || (row as any)?.client_role || null;
}

/** True when the rendered role comes from the temporary per-enquiry override. */
export function isTemporaryClientRole(row: ClientRoleRow | null | undefined): boolean {
    return !!clientRoleOverrideOf(row);
}

export interface DealerFallback {
    /** Name to show: the client's own name, else the dealer's. */
    name: string | null;
    /**
     * Canonical E.164 phone, safe for tel:/wa.me hrefs AND display: the client's own number,
     * else the dealer's. Null when neither. NEVER the raw stored value — a bare "9812345678"
     * would misdial (no +91) and "+91-9654118097".slice(1) would corrupt wa.me.
     */
    phone: string | null;
    /** True when the shown identity is the dealer (client unknown) — render the Dealer tag. */
    isDealer: boolean;
}

/**
 * Dealer fallback for leads whose own phone is a PENDING-/TEMP- placeholder, i.e. "we don't
 * know the client yet" (partner referrals where the dealer won't share the client's number).
 * The dealer's name/phone are what make these rows actionable instead of "— / No phone".
 *
 * Callers pass a `toDialable` formatter (lib/phone) so this module stays phone-logic free.
 */
export function dealerFallback(
    lead: {
        name?: string | null;
        phone_number?: string | null;
        referral_partner_name?: string | null;
        referral_partner_phone?: string | null;
    } | null | undefined,
    isPlaceholder: (phone?: string | null) => boolean,
    toDialable: (phone?: string | null) => string | null,
): DealerFallback {
    const clientPhone = toDialable(lead?.phone_number);
    if (clientPhone) {
        // Return the CANONICAL number, not the raw stored value (bare/dashed forms misdial).
        return { name: lead?.name || null, phone: clientPhone, isDealer: false };
    }
    // Own number unusable — fall back to the dealer only for placeholder keys, never for junk:
    // a malformed client number must still read "No phone", not silently become someone else.
    if (lead && isPlaceholder(lead.phone_number)) {
        const dealerPhone = toDialable(lead.referral_partner_phone);
        const dealerName = (lead.referral_partner_name || '').trim() || null;
        if (dealerPhone || dealerName) {
            return { name: dealerName, phone: dealerPhone, isDealer: true };
        }
    }
    return { name: lead?.name || null, phone: null, isDealer: false };
}
