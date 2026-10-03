import prisma from '../db';
import { getTeamIds } from '../utils/team_scope';
import { normalizePhone } from '../utils/phone';
import { harvestedOwnerOutreachAllowed } from './portal_harvest';

type Staff = { id: string; tenant_id: string; role: string };
export class CallingError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
const leaseMs = 15 * 60 * 1000;
async function contactScope(agent: Staff) {
    if (agent.role === 'partner') throw new CallingError(403, 'Staff only');
    return { tenant_id: agent.tenant_id, ...(agent.role === 'super_boss' ? {} : { assigned_agent_id: { in: await getTeamIds(agent) } }) };
}

// Page the authoritative contact table, then materialize work idempotently. Assignment changes
// are immediately effective; a stale work row never grants access to its previous team.
export async function listCallingWork(agent: Staff, queue: 'fresh' | 'aged', cursor?: string, limit = 25) {
    const scope = await contactScope(agent);
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const contacts = await prisma.contact.findMany({
        where: { ...scope, contact_type: { in: ['BUYER', 'TENANT'] }, created_at: queue === 'fresh' ? { gte: cutoff } : { lt: cutoff }, ...(cursor ? { phone_number: { gt: cursor } } : {}) },
        orderBy: { phone_number: 'asc' }, take: limit + 1,
        select: { phone_number: true, name: true, created_at: true, assigned_agent_id: true, opted_out_at: true,
            work_tasks: { where: { status: { in: ['TODO', 'IN_PROGRESS'] } }, orderBy: { due_date: 'asc' }, take: 1, select: { id: true, title: true, due_date: true, deal_id: true } } },
    });
    const page = contacts.slice(0, limit);
    const rows = await Promise.all(page.map(async contact => {
        const deal = contact.work_tasks[0]?.deal_id ? null : await prisma.transaction.findFirst({ where: { tenant_id: agent.tenant_id, demand_contact_id: contact.phone_number, status: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } }, orderBy: { created_at: 'desc' }, select: { id: true } });
        const dealId = contact.work_tasks[0]?.deal_id || deal?.id || null;
        const work = await prisma.callingWork.upsert({ where: { tenant_id_contact_phone: { tenant_id: agent.tenant_id, contact_phone: contact.phone_number } },
            create: { tenant_id: agent.tenant_id, contact_phone: contact.phone_number, task_id: contact.work_tasks[0]?.id, deal_id: dealId },
            update: { task_id: contact.work_tasks[0]?.id ?? null, deal_id: dealId } });
        return { ...contact, work, lease_active: !!work.lease_until && work.lease_until.getTime() > Date.now() };
    }));
    return { rows, next_cursor: contacts.length > limit ? page[page.length - 1].phone_number : null, provider_available: false, provider_reason: 'Provider callback, dispatch and phone-transfer contract has not been verified.' };
}

export async function controlCallingWork(agent: Staff, id: string, action: string, disposition?: string) {
    const scope = await contactScope(agent);
    const now = new Date();
    return prisma.$transaction(async tx => {
        const work = await tx.callingWork.findFirst({ where: { id, tenant_id: agent.tenant_id } });
        if (!work) throw new CallingError(404, 'Calling work not found');
        const contact = await tx.contact.findFirst({ where: { ...scope, phone_number: work.contact_phone } });
        if (!contact) throw new CallingError(404, 'Calling work not found');
        if (action === 'claim') {
            const claimed = await tx.callingWork.updateMany({ where: { id, tenant_id: agent.tenant_id, OR: [{ lease_until: null }, { lease_until: { lte: now } }, { claimed_by: agent.id }] }, data: { claimed_by: agent.id, lease_until: new Date(now.getTime() + leaseMs) } });
            if (!claimed.count) throw new CallingError(409, 'Another staff member has claimed this work');
            return tx.callingWork.findUnique({ where: { id } });
        }
        if (work.claimed_by !== agent.id || !work.lease_until || work.lease_until <= now) throw new CallingError(409, 'Claim this work before acting; claims expire after fifteen minutes');
        const lease = { id, tenant_id: agent.tenant_id, claimed_by: agent.id, lease_until: { gt: now }, updated_at: work.updated_at };
        let data: any;
        if (action === 'renew') data = { lease_until: new Date(now.getTime() + leaseMs) };
        else if (action === 'release') data = { claimed_by: null, lease_until: null };
        else {
            // Never redispatch an accepted/uncertain call, including after a process crash.
            if (work.dispatch_key || ['DISPATCH_PENDING', 'OUTCOME_UNKNOWN', 'LIVE'].includes(work.state)) throw new CallingError(409, 'Provider reconciliation required before further controls');
            if (work.transfer_state === 'CONFIRMED') throw new CallingError(409, 'Human handoff confirmed; AI follow-ups are stopped');
            if (action === 'start' || action === 'retry') {
                if (contact.opted_out_at || contact.verification_status === 'REJECTED' || !normalizePhone(contact.phone_number)) throw new CallingError(409, 'Contact restrictions prevent automated outreach');
                if (!await harvestedOwnerOutreachAllowed(agent.tenant_id, contact.phone_number)) throw new CallingError(409, 'A recorded human owner call is required before automated outreach');
                if (work.state === 'DONE') throw new CallingError(409, 'Calling work is completed');
                data = { state: 'BLOCKED_PROVIDER', last_error: 'AI dispatch unavailable until the provider contract and account configuration pass the pilot.' };
            } else if (action === 'pause') data = { state: 'PAUSED' };
            else if (action === 'disposition') {
                if (!['CONTACTED', 'CALLBACK', 'NO_ANSWER', 'WRONG_NUMBER', 'NOT_INTERESTED'].includes(disposition || '')) throw new CallingError(400, 'Invalid disposition');
                data = { state: disposition === 'CALLBACK' || disposition === 'NO_ANSWER' ? 'READY' : 'DONE', disposition };
            } else if (action === 'transfer') {
                const assigned = contact.assigned_agent_id ? await tx.agent.findFirst({ where: { id: contact.assigned_agent_id, tenant_id: agent.tenant_id } }) : null;
                const target = assigned?.phone ? normalizePhone(assigned.phone) : '';
                // No provider call is made here. Recording a request is distinct from confirmation.
                const taskId = `calling-callback-${id}`;
                await tx.task.upsert({ where: { id: taskId }, create: { id: taskId, title: 'Phone transfer unavailable — call client back', description: target ? 'Provider phone-transfer contract is unverified. Call the client manually.' : 'Assigned staff phone is missing or invalid. Call the client manually.', assigned_to: contact.assigned_agent_id || agent.id, contact_phone: contact.phone_number, deal_id: work.deal_id, due_date: now, priority: 'HIGH', task_type: 'GENERAL', tags: ['calling', 'transfer-callback'], stage_metadata: { tenant_id: agent.tenant_id, calling_work_id: id } }, update: {} });
                data = { state: 'PAUSED', transfer_state: 'UNAVAILABLE', transfer_target: target || null, callback_task_id: taskId, last_error: 'Phone transfer unavailable; a human callback task was created.' };
            } else throw new CallingError(400, 'Invalid calling action');
        }
        const changed = await tx.callingWork.updateMany({ where: lease, data });
        if (!changed.count) throw new CallingError(409, 'Claim or calling state changed; refresh and try again');
        return tx.callingWork.findUnique({ where: { id } });
    }, { isolationLevel: 'Serializable' });
}
