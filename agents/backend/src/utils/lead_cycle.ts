/**
 * Lead-cycle helpers (2026-10-08).
 *
 * Recycling a lost lead starts a NEW sales cycle but must NOT rewrite history:
 * `contacts.created_at` stays the first-seen date that every report, age metric and audit
 * trail depends on. Instead a recycle stamps `recycled_at`, and the CURRENT cycle's start —
 * what the user thinks of as "the lead date" — is read from here.
 *
 * One helper, used by the Ext. Leads list (sort + date filter + "Added" column), the
 * staleness/age surfaces and the bulk recycle endpoint, so "how old is this lead" can never
 * mean two different things in two places.
 */

/** Minimal shape so callers can pass a full Prisma row or a hand-built object. */
export interface LeadCycleRow {
    created_at: Date | string;
    recycled_at?: Date | string | null;
    cycle_start_at?: Date | string | null;
    lead_cycle?: number | null;
}

/** Start of the lead's CURRENT cycle: the cycle stamp, else first seen. */
export function leadCycleStart(row: LeadCycleRow | null | undefined): Date | null {
    if (!row) return null;
    const cycle = row.cycle_start_at ? new Date(row.cycle_start_at) : null;
    if (cycle && !isNaN(cycle.getTime())) return cycle;
    const recycled = row.recycled_at ? new Date(row.recycled_at) : null;
    if (recycled && !isNaN(recycled.getTime())) return recycled;
    const created = row.created_at ? new Date(row.created_at) : null;
    return created && !isNaN(created.getTime()) ? created : null;
}

/** ISO (YYYY-MM-DD) of the current cycle start — the shape the date filters compare against. */
export function leadCycleStartIso(row: LeadCycleRow | null | undefined): string {
    const d = leadCycleStart(row);
    return d ? d.toISOString().slice(0, 10) : '';
}

/** True once the lead has been renewed at least once (cycle 2+). */
export function isRecycledLead(row: LeadCycleRow | null | undefined): boolean {
    if (!row) return false;
    return Number(row.lead_cycle || 1) > 1 || !!row.recycled_at;
}

/**
 * Stamp a fresh engagement cycle on a contact (portal re-enquiry auto-renew, 2026-10-09).
 *
 * Same semantics as a manual recycle — recycled_at/cycle_start_at move to now and the cycle
 * counter increments — but deliberately WITHOUT the recycle's status changes: a portal
 * re-enquiry must not flip lead_status or clear lost fields on a lead that may be mid-pipeline.
 * created_at is never touched. Returns the stamp, or null when the contact is missing.
 */
export async function stampNewLeadCycle(
    phone: string,
    db?: { contact: { update: Function; findUnique: Function } },
): Promise<Date | null> {
    const client: any = db || (await import('../db')).default;
    const existing = await client.contact.findUnique({
        where: { phone_number: phone },
        select: { lead_cycle: true },
    });
    if (!existing) return null;
    const now = new Date();
    await client.contact.update({
        where: { phone_number: phone },
        data: { recycled_at: now, cycle_start_at: now, lead_cycle: Number((existing as any).lead_cycle || 1) + 1 },
    });
    return now;
}

/** Prisma orderBy fragment ordering by the current cycle instead of first-seen date. */
export const LEAD_CYCLE_START_ORDER = { cycle_start_at: 'asc' as const };