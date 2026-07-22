/**
 * Lead Redistribution — daily support drip (2026-07-09).
 *
 * Re-distributes a deduped queue of aged portal leads (99acres + Housing.com dumps) so that
 * EVERY eligible member reaches a daily lead target — the recycled queue tops up whatever they
 * did NOT already get from other sources. Members getting few/no leads elsewhere get the most;
 * busy members get little or none. Runs 08:00 IST daily.
 *
 * Eligible = active role 'employee' (excludes managers, super_boss, test accounts).
 * "Other-source inflow" = deals assigned to them in the last 24h whose source ≠ 'recycle 2'.
 *
 * Design (no schema migration): the queue is a JSON file; "already consumed" = the phone is
 * already a Contact, so re-runs never double-assign. Each lead → contact.upsert + ensureDealForLead
 * (deal lands in NEW; AI + human qualify it the normal way) + an in-app notification. Records carry
 * source='recycle 2' so the team can identify recycled leads.
 */

import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import prisma from '../db';
import logger from '../utils/logger';
import { ensureDealForLead } from './ensure_deal';

const QUEUE_PATH = path.join(__dirname, '../../data/redistribution_queue.json');
const TARGET_PER_MEMBER = 10;             // each eligible member should reach ~10 leads/day total
const REDISTRIB_SOURCE = 'recycle 2';     // CRM source label for identification

interface QueuedLead {
    name?: string | null; phone: string; source: string; intent?: string;
    bhk?: number | null; budget_max?: number | null; location?: string | null;
    property_type?: string | null; raw?: string | null;
}

const last10 = (p: string) => String(p || '').replace(/\D/g, '').slice(-10);

/** For each eligible member, how many recycled leads they need to reach TARGET_PER_MEMBER,
 *  counting only OTHER-source leads received in the last 24h (recycled ones don't count). */
async function planTopUp(): Promise<{ id: string; name: string; got: number; need: number }[]> {
    const emps = await prisma.agent.findMany({
        where: { role: 'employee', status: 'active', NOT: { name: { contains: 'test', mode: 'insensitive' } } },
        select: { id: true, name: true },
    });
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const counts = await prisma.transaction.groupBy({
        by: ['executive_agent_id'],
        where: { created_at: { gte: since }, source: { not: REDISTRIB_SOURCE } },
        _count: { _all: true },
    });
    const cmap = new Map<string, number>();
    counts.forEach((c: any) => { if (c.executive_agent_id) cmap.set(c.executive_agent_id, c._count._all); });
    return emps
        .map((e) => { const got = cmap.get(e.id) || 0; return { id: e.id, name: e.name || e.id.slice(0, 8), got, need: Math.max(0, TARGET_PER_MEMBER - got) }; })
        .filter((m) => m.need > 0)
        .sort((a, b) => b.need - a.need);
}

/** Round-robin slots: everyone gets 1 before anyone gets a 2nd (so if the queue is short, all
 *  are covered), and the neediest end up with the most overall. */
function buildSlots(plan: { id: string; name: string; need: number }[]): { id: string; name: string }[] {
    const rem = plan.map((m) => ({ id: m.id, name: m.name, r: m.need }));
    const slots: { id: string; name: string }[] = [];
    let any = true;
    while (any) {
        any = false;
        for (const m of rem) { if (m.r > 0) { slots.push({ id: m.id, name: m.name }); m.r--; any = true; } }
    }
    return slots;
}

export async function runDailyDistribution(opts: { dryRun?: boolean } = {}) {
    const dry = !!opts.dryRun;

    let queue: QueuedLead[] = [];
    try { queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8')); }
    catch { logger.warn('[LeadRedistrib] queue file missing — nothing to do'); return { error: 'no_queue', distributed: 0 }; }

    const contacts = await prisma.contact.findMany({ select: { phone_number: true } });
    const crm = new Set(contacts.map((c) => last10(c.phone_number)));
    const pending = queue.filter((q) => !crm.has(last10(q.phone)));
    if (!pending.length) { logger.info('[LeadRedistrib] queue drained'); return { distributed: 0, remaining: 0 }; }

    const plan = await planTopUp();
    const slots = buildSlots(plan);
    if (!slots.length) { logger.info('[LeadRedistrib] everyone already at target'); return { distributed: 0, remaining: pending.length }; }

    const batch = pending.slice(0, slots.length); // capped by queue availability
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) return { error: 'no_tenant', distributed: 0 };

    const perMember: Record<string, number> = {};
    for (let i = 0; i < batch.length; i++) {
        const lead = batch[i]; const who = slots[i];
        perMember[who.name] = (perMember[who.name] || 0) + 1;
        if (dry) continue;
        try {
            await prisma.contact.upsert({
                where: { phone_number: lead.phone },
                update: { assigned_agent_id: who.id, source: REDISTRIB_SOURCE, last_channel: REDISTRIB_SOURCE, last_interaction: new Date() },
                create: {
                    phone_number: lead.phone, name: lead.name ?? null, source: REDISTRIB_SOURCE, contact_type: 'BUYER',
                    intent: lead.intent ?? 'buy', preferred_location: lead.location ?? null,
                    budget_max: lead.budget_max ?? null, property_type: lead.property_type ?? null,
                    demand_schema_values: (lead.bhk ? { bhk: String(lead.bhk) } : undefined) as any,
                    assigned_agent_id: who.id, tenant_id: tenant.id, last_channel: REDISTRIB_SOURCE,
                    last_interaction: new Date(), lead_status: 'warm',
                },
            });
            await ensureDealForLead({ contactPhone: lead.phone, source: REDISTRIB_SOURCE, assignedAgentId: who.id });
            const summary = [lead.bhk ? `${lead.bhk} BHK` : null, lead.property_type,
                lead.budget_max ? `₹${Math.round(lead.budget_max / 100000)}L` : null, lead.location].filter(Boolean).join(' · ');
            await prisma.notification.create({
                data: {
                    tenant_id: tenant.id, recipient_id: who.id, recipient_type: 'agent',
                    event: 'lead_assigned', category: 'lead',
                    title: `🆕 New lead assigned: ${lead.name || lead.phone}`,
                    body: `From ${REDISTRIB_SOURCE} (${lead.source}). ${summary || 'Call to qualify.'}\n📞 ${lead.phone}`,
                    data: { source: REDISTRIB_SOURCE, redistribution: true } as any, channels_sent: ['in_app'],
                },
            });
        } catch (err) {
            logger.error(`[LeadRedistrib] failed for ${lead.phone} → ${who.name}: ${(err as Error).message}`);
        }
    }
    const remaining = pending.length - (dry ? 0 : batch.length);
    logger.info(`[LeadRedistrib] ${dry ? 'DRY-RUN ' : ''}topped up ${batch.length} leads to ${Object.keys(perMember).length} members; ~${remaining} remaining`);
    return {
        distributed: batch.length, membersToppedUp: Object.keys(perMember).length, remaining,
        dryRun: dry, target: TARGET_PER_MEMBER, perMember,
        plan: plan.map((m) => ({ name: m.name, gotFromOthers24h: m.got, recycledNeed: m.need })),
    };
}

let started = false;
/** Schedule the daily 08:00 IST run. Server is UTC → 02:30 UTC = 08:00 IST. Primary instance only. */
export function startLeadRedistributionCron(): void {
    if (started) return; started = true;
    cron.schedule('30 2 * * *', () => {
        runDailyDistribution().catch((e) => logger.error('[LeadRedistrib] cron run failed:', e));
    });
    logger.info('[LeadRedistrib] scheduled — top up every eligible member to 10 leads/day at 08:00 IST (02:30 UTC)');
}
