/**
 * Daily Lead Recycler (2026-06-12) — drains the un-worked lead stock.
 *
 * The audit found 1,170 leads (62%) that never became a deal and have zero recorded
 * human follow-up. This job, each morning, takes the 10 OLDEST un-converted leads per
 * team member and turns each into a FRESH deal — same member, fires the "call this lead
 * in 30 min" Calendar/Task/push (via ensureDealForLead) — and re-engages the customer
 * with a matching card. Each lead is recycled EXACTLY ONCE (a `lead_recycled` interaction
 * marker), so the backlog drains over ~31 days and then the job idles. No perpetual loop.
 */

import prisma from '../db';
import logger from '../utils/logger';

const RECYCLED_EVENT = 'lead_recycled';

/** Junk / placeholder phones never get recycled (would spam wrong numbers). */
export function isJunkPhone(ph: string): boolean {
    return !/^\+\d{10,15}$/.test(ph || '') || /TEMP|PENDING/i.test(ph || '');
}

/** Pure pick: the `limit` OLDEST leads that have no deal, aren't recycled, aren't junk. */
export function pickForAgent<T extends { phone_number: string; created_at: Date }>(
    leads: T[],
    recycled: Set<string>,
    hasDeal: Set<string>,
    limit = 10,
): T[] {
    return leads
        .filter((l) => !hasDeal.has(l.phone_number) && !recycled.has(l.phone_number) && !isJunkPhone(l.phone_number))
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
        .slice(0, limit);
}

const chunk = <T>(arr: T[], n: number): T[][] => {
    const o: T[][] = [];
    for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n));
    return o;
};

/** Recycle ONE lead: fresh deal (same agent) + re-engage customer if matchable + once-only marker. */
export async function recycleOneLead(contact: any): Promise<{ dealId: string; created: boolean; cardSent: boolean }> {
    const { ensureDealForLead } = await import('./ensure_deal');
    const r = await ensureDealForLead({
        contactPhone: contact.phone_number,
        source: 'recycled_stock',
        assignedAgentId: contact.assigned_agent_id,
    });

    // Re-engage the customer only when there's enough to match (else just the agent calls to qualify).
    let cardSent = false;
    const schema = (contact.demand_schema_values && typeof contact.demand_schema_values === 'object') ? contact.demand_schema_values : {};
    const hasCriteria = !!(contact.preferred_location || contact.budget_max || (schema as any).bhk);
    if (r.created && hasCriteria) {
        try {
            const { shareNextProperty } = await import('./property_sharing');
            const inv = await shareNextProperty(r.dealId);
            cardSent = !!inv;
        } catch (e) { logger.warn(`[Recycler] card send failed for ${contact.phone_number}:`, e); }
    }

    // Once-only marker — so this lead is never picked again.
    try {
        await prisma.interaction.create({
            data: {
                tenant_id: contact.tenant_id,
                phone_number: contact.phone_number,
                channel: 'system',
                direction: 'outbound',
                event_type: RECYCLED_EVENT,
                content: 'Recycled stock lead → fresh deal',
                metadata: { deal_id: r.dealId, agent: contact.assigned_agent_id, card_sent: cardSent },
            },
        });
    } catch (e) { logger.warn(`[Recycler] marker write failed for ${contact.phone_number}:`, e); }

    return { dealId: r.dealId, created: r.created, cardSent };
}

export interface RecycleResult { agents: number; recycled: number; cardsSent: number; remaining: number; }

/**
 * Daily run: per active agent, recycle their 10 oldest un-converted leads.
 * @param opts.dryRun  count only, no writes/sends.
 * @param opts.perAgent leads per agent per run (default 10).
 * @param opts.onlyAgentId scope to a single agent (the post-deploy single-agent verification).
 */
export async function runDailyRecycle(opts: { dryRun?: boolean; perAgent?: number; onlyAgentId?: string } = {}): Promise<RecycleResult> {
    const perAgent = opts.perAgent ?? 10;
    const where: any = { contact_type: { in: ['BUYER', 'TENANT', 'UNKNOWN'] }, assigned_agent_id: { not: null } };
    if (opts.onlyAgentId) where.assigned_agent_id = opts.onlyAgentId;

    const leads = await prisma.contact.findMany({
        where,
        select: { phone_number: true, name: true, assigned_agent_id: true, created_at: true, tenant_id: true, preferred_location: true, budget_max: true, demand_schema_values: true },
    });
    const phones = leads.map((l) => l.phone_number);

    const hasDeal = new Set<string>();
    for (const c of chunk(phones, 1000)) (await prisma.transaction.findMany({ where: { demand_contact_id: { in: c } }, select: { demand_contact_id: true }, distinct: ['demand_contact_id'] })).forEach((x) => hasDeal.add(x.demand_contact_id));
    const recycled = new Set<string>();
    for (const c of chunk(phones, 1000)) (await prisma.interaction.findMany({ where: { phone_number: { in: c }, event_type: RECYCLED_EVENT }, select: { phone_number: true }, distinct: ['phone_number'] })).forEach((x) => recycled.add(x.phone_number));

    const activeAgents = new Set((await prisma.agent.findMany({ where: { status: 'active' }, select: { id: true } })).map((a) => a.id));

    const byAgent: Record<string, any[]> = {};
    for (const l of leads) {
        if (!l.assigned_agent_id || !activeAgents.has(l.assigned_agent_id)) continue;
        (byAgent[l.assigned_agent_id] ||= []).push(l);
    }

    const eligibleTotal = leads.filter((l) => l.assigned_agent_id && activeAgents.has(l.assigned_agent_id) && !hasDeal.has(l.phone_number) && !recycled.has(l.phone_number) && !isJunkPhone(l.phone_number)).length;

    let recycledCount = 0, cardsSent = 0, agentsTouched = 0;
    for (const list of Object.values(byAgent)) {
        const picks = pickForAgent(list, recycled, hasDeal, perAgent);
        if (picks.length === 0) continue;
        agentsTouched++;
        for (const c of picks) {
            if (opts.dryRun) { recycledCount++; continue; }
            try {
                const res = await recycleOneLead(c);
                recycledCount++;
                if (res.cardSent) cardsSent++;
            } catch (e) { logger.error(`[Recycler] failed for ${c.phone_number}:`, e); }
        }
    }

    const remaining = Math.max(0, eligibleTotal - recycledCount);
    logger.info(`[Recycler] ${opts.dryRun ? 'DRY-RUN ' : ''}recycled ${recycledCount} across ${agentsTouched} agents | ${cardsSent} cards | ~${remaining} remaining in backlog`);
    return { agents: agentsTouched, recycled: recycledCount, cardsSent, remaining };
}
