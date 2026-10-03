import { beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import prisma from '../db';
vi.mock('../utils/team_scope', () => ({ getTeamIds: vi.fn(async (agent: any) => agent.role === 'manager' ? [agent.id, 'report'] : [agent.id]) }));
vi.mock('../services/portal_harvest', () => ({ harvestedOwnerOutreachAllowed: vi.fn(async () => true) }));
import { harvestedOwnerOutreachAllowed } from '../services/portal_harvest';
import router from '../routes/calling_work';
const app = express();
let actor: any;
app.use(express.json(), (req: any, _res, next) => { req.agent = actor; next(); });
app.use('/calling', router);
let work: any;
let contact: any;
let tasks: Map<string, any>;
let clock = 1;
function matches(where: any, row: any): boolean {
    return Object.entries(where).every(([key, value]: any) => {
        if (key === 'OR') return value.some((part: any) => matches(part, row));
        if (value && typeof value === 'object' && !(value instanceof Date)) {
            if (value.in) return value.in.includes(row[key]);
            if (value.gt) return row[key] > value.gt;
            if (value.lte) return row[key] != null && row[key] <= value.lte;
        }
        if (value instanceof Date) return row[key]?.getTime() === value.getTime();
        return row[key] === value;
    });
}
beforeEach(() => {
    vi.clearAllMocks(); clock = 1;
    actor = { id: 'a', role: 'employee', tenant_id: 'tenant' };
    contact = { phone_number: '+919999999999', tenant_id: 'tenant', assigned_agent_id: 'a', opted_out_at: null, verification_status: 'VERIFIED' };
    work = { id: 'work', tenant_id: 'tenant', contact_phone: contact.phone_number, state: 'READY', claimed_by: null, lease_until: null, updated_at: new Date(clock), dispatch_key: null, deal_id: 'deal' };
    tasks = new Map();
    const db = prisma as any;
    db.callingWork = {
        findFirst: vi.fn(async ({ where }: any) => matches(where, work) ? { ...work } : null),
        findUnique: vi.fn(async () => ({ ...work })),
        updateMany: vi.fn(async ({ where, data }: any) => { if (!matches(where, work)) return { count: 0 }; Object.assign(work, data, { updated_at: new Date(++clock) }); return { count: 1 }; }),
        upsert: vi.fn(async () => ({ ...work })),
    };
    db.contact.findFirst = vi.fn(async ({ where }: any) => matches(where, contact) ? { ...contact } : null);
    db.contact.findMany = vi.fn(async () => []);
    db.transaction = { findFirst: vi.fn(async () => ({ id: 'deal' })) };
    db.agent.findFirst = vi.fn(async () => ({ id: 'a', tenant_id: 'tenant', phone: '9999999998' }));
    db.task.upsert = vi.fn(async ({ where, create }: any) => { if (!tasks.has(where.id)) tasks.set(where.id, create); return tasks.get(where.id); });
    db.$transaction = vi.fn(async (fn: any) => fn(db));
    vi.mocked(harvestedOwnerOutreachAllowed).mockResolvedValue(true);
});
const action = (name: string) => request(app).post(`/calling/work/${name}`);
async function claim() { expect((await action('claim')).status).toBe(200); }
it('atomic lease admits only one claimant when two staff see the same work', async () => {
    const { controlCallingWork } = await import('../services/calling_work');
    const outcomes = await Promise.allSettled([
        controlCallingWork({ id: 'x', role: 'super_boss', tenant_id: 'tenant' }, 'work', 'claim'),
        controlCallingWork({ id: 'y', role: 'super_boss', tenant_id: 'tenant' }, 'work', 'claim'),
    ]);
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1);
});
it('expired lease rejects controls and can be reclaimed, renewed and released', async () => {
    await claim(); work.lease_until = new Date(Date.now() - 1);
    expect((await action('renew')).status).toBe(409);
    await claim(); expect((await action('renew')).status).toBe(200);
    expect(work.lease_until.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);
    expect((await action('release')).status).toBe(200); expect(work.claimed_by).toBeNull();
});
it('tenant, assignment and partner scopes apply to every read and control', async () => {
    work.tenant_id = 'other'; expect((await action('claim')).status).toBe(404);
    work.tenant_id = 'tenant'; contact.assigned_agent_id = 'other'; expect((await action('claim')).status).toBe(404);
    actor.role = 'partner'; expect((await request(app).get('/calling')).status).toBe(403);
    expect((await action('claim')).status).toBe(403);
});
it('opt-out and unverified harvested owners cannot start AI calls', async () => {
    await claim(); contact.opted_out_at = new Date(); expect((await action('start')).status).toBe(409);
    contact.opted_out_at = null; vi.mocked(harvestedOwnerOutreachAllowed).mockResolvedValue(false);
    expect((await action('retry')).status).toBe(409); expect(work.state).toBe('READY');
});
it('start/retry persist an explicit provider gate without claiming dispatch', async () => {
    await claim(); const response = await action('start');
    expect(response.status).toBe(200); expect(response.body.provider_available).toBe(false);
    expect(work.state).toBe('BLOCKED_PROVIDER'); expect(work.dispatch_key).toBeNull();
    expect((await action('retry')).status).toBe(200); expect(work.provider_call_id).toBeUndefined();
});
it('uncertain dispatch is fenced across retry and reclaim after restart', async () => {
    await claim(); work.dispatch_key = 'persisted-intent'; work.state = 'OUTCOME_UNKNOWN';
    expect((await action('retry')).status).toBe(409);
    await action('release'); await claim(); expect((await action('start')).status).toBe(409);
    expect(work.dispatch_key).toBe('persisted-intent');
});
it('unavailable transfer targets the assigned staff phone and creates one callback on repeats', async () => {
    await claim(); const first = await action('transfer').send({ phone: '+918888888888' });
    expect(first.status).toBe(200); expect(work.transfer_state).toBe('UNAVAILABLE');
    expect(work.transfer_target).toBe('+919999999998'); expect(work.state).toBe('PAUSED');
    expect((await action('transfer')).status).toBe(200); expect(tasks.size).toBe(1);
    expect([...tasks.values()][0]).toMatchObject({ assigned_to: 'a', contact_phone: contact.phone_number, deal_id: 'deal' });
});
it('confirmed handoff blocks further AI work', async () => {
    await claim(); work.transfer_state = 'CONFIRMED'; expect((await action('retry')).status).toBe(409);
});
it('paging scopes authoritative contacts without an overall cap and links active deals', async () => {
    (prisma.contact.findMany as any).mockResolvedValue([0, 1, 2].map(n => ({ ...contact, phone_number: `+91999999999${n}`, created_at: new Date(), name: 'Client', work_tasks: [] })));
    const response = await request(app).get('/calling?queue=aged&limit=2&cursor=%2B919000000000');
    expect(response.status).toBe(200); expect(response.body.data.rows).toHaveLength(2);
    expect(response.body.data.next_cursor).toBe('+919999999991');
    expect(prisma.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3, where: expect.objectContaining({ tenant_id: 'tenant', assigned_agent_id: { in: ['a'] }, phone_number: { gt: '+919000000000' }, created_at: { lt: expect.any(Date) } }) }));
    expect((prisma as any).callingWork.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ deal_id: 'deal' }) }));
});
it('invalid inputs are rejected and disposition is persisted', async () => {
    expect((await request(app).get('/calling?limit=101')).status).toBe(400);
    await claim(); expect((await action('invalid')).status).toBe(400);
    expect((await action('disposition').send({ disposition: 'invalid' })).status).toBe(400);
    expect((await action('disposition').send({ disposition: 'CONTACTED' })).status).toBe(200); expect(work.state).toBe('DONE');
});
