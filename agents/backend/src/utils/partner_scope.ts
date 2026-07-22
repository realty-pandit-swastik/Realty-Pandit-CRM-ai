/**
 * Partner scoping helpers (2026-07-12; PARTNER TEAMS 2026-07-13).
 *
 * A partner agent logs into the SAME admin app (role:'partner') but must only ever see their
 * OWN data. These helpers build the Prisma `where` clauses that define "belongs to this partner",
 * including a company partner's sub-agents. Pair every partner-facing response with the partner
 * redaction (`applyRoleMaskList(rows, viewerFromPartner(id))`) so owner contact + exact address
 * are stripped. See middleware/auth.ts PARTNER_ALLOWLIST (default-deny) for route gating.
 *
 * ─── THE SCOPE RULE (one rule, both roles — no `if (isSubAgent)` anywhere) ───
 *   row is mine  ⇔  referral/handler ∈ ids  OR  partner_assignee_id ∈ ids
 * because `partnerIdsWithSubAgents` returns:
 *   OWNER     → [self, ...subAgents]  → sees own rows + everything referred by / assigned to the team
 *   SUB-AGENT → [self]                → sees only what they referred or were ASSIGNED
 *
 * ─── TWO MEANINGS, NEVER CONFLATE ───
 *   referral_partner_id / *_handler_id → WHO BROUGHT the business (attribution + commission).
 *                                        Must survive any reassignment. Never written by an assign.
 *   partner_assignee_id                → WHO IS WORKING it (a sub-agent inside the partner's company).
 */
import prisma from '../db';

/** Phone variants (E.164 + bare 10-digit) — partner phones are stored inconsistently across tables. */
export function phoneVariantsOf(phones: Array<string | null | undefined>): string[] {
    const out: string[] = [];
    for (const p of phones) {
        if (!p) continue;
        out.push(p);
        if (p.startsWith('+91')) out.push(p.slice(3));
        else if (p.startsWith('91') && p.length === 12) out.push(p.slice(2));
    }
    return out;
}

/**
 * The partner + their sub-agents (company hierarchy): ids and all phone variants.
 *
 * INVARIANT: exactly ONE level deep. A sub-agent has no sub-agents (creation forces
 * partner_category:'INDIVIDUAL', and only a COMPANY owner may add members).
 *
 * ⚠ DO NOT add `status: 'ACTIVE'` to the sub-agent findMany below. Suspended sub-agents must stay in
 * the OWNER's ids, or every row assigned to them would VANISH from the owner's lists. Suspension is
 * enforced where it belongs — at login and in the per-request guards. Exclude them from the
 * *assignable* roster instead (see routes/partner_team.ts).
 */
export async function partnerIdsWithSubAgents(partnerId: string): Promise<{ ids: string[]; phones: string[] }> {
    const self = await prisma.partnerAgent.findUnique({
        where: { id: partnerId }, select: { id: true, phone_number: true },
    });
    const subs = await prisma.partnerAgent.findMany({
        where: { parent_partner_id: partnerId }, select: { id: true, phone_number: true },
    });
    return {
        ids: [partnerId, ...subs.map(s => s.id)],
        phones: phoneVariantsOf([self?.phone_number, ...subs.map(s => s.phone_number)]),
    };
}

// ─── Pure OR-builders: the SINGLE SOURCE OF TRUTH for each entity's partner scope ───────────────
// Synchronous + id-taking so both the list queries and the per-row guards use the SAME expression.
// (deal_service.ts previously hand-copied the deal OR; if only one copy gains a clause, the list and
// the guard silently disagree → "visible in the list, 403 when opened". Never duplicate these.)

/** Contact (lead) belongs to these partner ids. */
export function partnerLeadOr(ids: string[]): any[] {
    return [
        { referral_partner_id: { in: ids } },   // they brought it
        { partner_assignee_id: { in: ids } },   // it was assigned to them
    ];
}

/**
 * Transaction (deal) belongs to these partner ids.
 * The two `demand_contact` clauses are load-bearing: `ensureDealForLead` auto-creates a deal with the
 * handler fields UNSET, so such a deal is reachable only through its contact. Without the
 * `demand_contact.partner_assignee_id` clause, a sub-agent assigned a lead would see the LEAD but not
 * its DEAL — a broken half-state.
 */
export function partnerDealOr(ids: string[]): any[] {
    return [
        { demand_handler_id: { in: ids } },
        { supply_handler_id: { in: ids } },
        { partner_assignee_id: { in: ids } },
        { demand_contact: { referral_partner_id: { in: ids } } },
        { demand_contact: { partner_assignee_id: { in: ids } } },
    ];
}

/** Inventory belongs to these partner ids (or matches their owner/uploader/key-holder phones). */
export function partnerInventoryOr(ids: string[], phones: string[], ownerIds: string[]): any[] {
    const or: any[] = [
        { referral_partner_id: { in: ids } },
        { partner_assignee_id: { in: ids } },
    ];
    if (ownerIds.length) or.push({ owner_id: { in: ownerIds } });
    if (phones.length) {
        or.push({ owner_phone: { in: phones } });
        or.push({ uploader_phone: { in: phones } });
        or.push({ key_holder_phone: { in: phones } });
    }
    return or;
}

// ─── Async wrappers (unchanged signatures — no call-site churn) ─────────────────────────────────

/** OR-clauses matching inventory that BELONGS to this partner (their own listings, any status). */
export async function partnerOwnInventoryWhere(partnerId: string): Promise<any[]> {
    const { ids, phones } = await partnerIdsWithSubAgents(partnerId);
    let ownerIds: string[] = [];
    if (phones.length) {
        const owners = await prisma.owner.findMany({
            where: { contact_phone: { in: phones } }, select: { id: true },
        });
        ownerIds = owners.map(o => o.id);
    }
    return partnerInventoryOr(ids, phones, ownerIds);
}

/** OR-clauses matching DEALS that belong to this partner (incl. their sub-agents). */
export async function partnerDealWhereOr(partnerId: string): Promise<any[]> {
    const { ids } = await partnerIdsWithSubAgents(partnerId);
    return partnerDealOr(ids);
}

/** True when this inventory row belongs to the partner (computed on the RAW row, pre-redaction). */
export function isPartnerOwnInventory(row: any, ids: string[], phones: string[]): boolean {
    if (row?.referral_partner_id && ids.includes(row.referral_partner_id)) return true;
    // An ASSIGNED sub-agent may work the listing (user chose full work rights) — this is what grants
    // them edit access via partnerMayMutateInventory().
    if (row?.partner_assignee_id && ids.includes(row.partner_assignee_id)) return true;
    const p = (v: any) => (v ? phones.includes(String(v)) : false);
    return p(row?.owner_phone) || p(row?.uploader_phone) || p(row?.key_holder_phone);
}
