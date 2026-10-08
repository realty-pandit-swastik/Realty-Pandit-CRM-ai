import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import prisma from '../db';

// Local Prisma mock: the bulk path uses $transaction + transaction.updateMany, which the shared
// test setup does not model.
vi.mock('../db', () => ({
    default: {
        $queryRaw: vi.fn().mockResolvedValue([]),
        $transaction: vi.fn(),
        contact: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
        transaction: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
        interaction: { create: vi.fn(), count: vi.fn() },
        agent: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
        partnerAgent: { findUnique: vi.fn(), findMany: vi.fn() },
    },
}));

// The stage edit is routed through the deal state machine. Stub it so these tests assert the BULK
// endpoint's own behaviour (permission, recycle bookkeeping, per-lead isolation, audit), not the
// transition rules — those are covered by transition_noop.test.ts.
const stageEdit = vi.hoisted(() => ({ applyLeadStageEdit: vi.fn() }));
vi.mock('../services/lead_stage_sync', async () => {
    const actual: any = await vi.importActual('../services/lead_stage_sync');
    return { ...actual, applyLeadStageEdit: stageEdit.applyLeadStageEdit };
});

import leadsRouter from '../routes/leads';

const app = express();
app.use(express.json());
let role = 'manager';
app.use((req: any, _res, next) => {
    req.agent = { id: 'mgr-1', name: 'Mgr', role, tenant_id: 'tenant-1' };
    next();
});
app.use('/api/leads', leadsRouter);

const LOST = {
    phone_number: '+919000000001', name: 'Lost Lead', tenant_id: 'tenant-1',
    assigned_agent_id: 'staff-1', lifecycle_stage: 'CLOSED_LOST', lead_status: 'lost',
    lost_reason: 'BUDGET', lost_at: new Date('2026-01-01T00:00:00.000Z'), lead_cycle: 1,
};
const ACTIVE = {
    phone_number: '+919000000002', name: 'Active Lead', tenant_id: 'tenant-1',
    assigned_agent_id: 'staff-1', lifecycle_stage: 'QUALIFIED', lead_status: 'warm',
    lost_reason: null, lost_at: null, lead_cycle: 1,
};

function contactUpdateData(): any {
    const calls = vi.mocked(prisma.contact.update).mock.calls;
    return calls[calls.length - 1][0]?.data;
}

/** Any contact.update call carrying this key (a stage write and the audit write are separate). */
function contactWriteWith(key: string): any {
    return vi.mocked(prisma.contact.update).mock.calls
        .map(c => c[0]?.data)
        .find((d: any) => d && key in d);
}

beforeEach(() => {
    vi.clearAllMocks();
    role = 'manager';
    stageEdit.applyLeadStageEdit.mockResolvedValue({ handled: true });
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(LOST as any);
    // Migration-present probe run by recycle mode.
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ lead_cycle: 1 } as any);
    vi.mocked(prisma.contact.update).mockResolvedValue({} as any);
    vi.mocked(prisma.transaction.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(prisma.interaction.create).mockResolvedValue({} as any);
    vi.mocked(prisma.agent.findUnique).mockResolvedValue({ name: 'Mgr' } as any);
    vi.mocked(prisma.agent.findFirst).mockResolvedValue({ id: 'staff-9', name: 'New Owner', role: 'employee', phone: null, email: null } as any);
    vi.mocked(prisma.$transaction).mockImplementation(async (arg: any) => (Array.isArray(arg) ? arg : [arg]));
});

describe('POST /api/leads/bulk-stage — normal mode', () => {
    it('routes the stage through the deal (no direct lifecycle_stage write on a lead that has a deal)', async () => {
        const res = await request(app)
            .post('/api/leads/bulk-stage')
            .send({ phones: [LOST.phone_number], stage: 'QUALIFIED' });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, updated: 1, total: 1, failed: 0, mode: 'normal' });
        expect(stageEdit.applyLeadStageEdit).toHaveBeenCalledWith(expect.objectContaining({ requestedStage: 'QUALIFIED' }));
        // No contact write carries the stage — the deal + sync hook own it.
        expect(contactWriteWith('lifecycle_stage')).toBeUndefined();
    });

    it('writes lifecycle_stage directly ONLY for a lead with no deal (supply-side contacts)', async () => {
        stageEdit.applyLeadStageEdit.mockResolvedValue({ handled: false });
        const res = await request(app)
            .post('/api/leads/bulk-stage')
            .send({ phones: [LOST.phone_number], stage: 'QUALIFIED' });

        expect(res.status).toBe(200);
        expect(contactWriteWith('lifecycle_stage')).toMatchObject({ lifecycle_stage: 'QUALIFIED' });
    });

    it('reports an illegal jump per lead and keeps processing the rest of the batch', async () => {
        stageEdit.applyLeadStageEdit
            .mockRejectedValueOnce(Object.assign(new Error('Invalid transition: NEW → NEGOTIATION. Valid next: [...]'), { statusCode: 400 }))
            .mockResolvedValueOnce({ handled: true });
        vi.mocked(prisma.contact.findUnique)
            .mockResolvedValueOnce({ ...ACTIVE, lifecycle_stage: 'NEW' } as any)
            .mockResolvedValueOnce(LOST as any);

        const res = await request(app)
            .post('/api/leads/bulk-stage')
            .send({ phones: [ACTIVE.phone_number, LOST.phone_number], stage: 'NEGOTIATION' });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ updated: 1, total: 2, failed: 1 });
        expect(res.body.results[0]).toMatchObject({ ok: false });
        expect(String(res.body.results[0].error)).toMatch(/Invalid transition/);
        expect(res.body.results[1]).toMatchObject({ ok: true });
    });

    it('rejects a stage the pipeline forbids without writing anything when every lead fails', async () => {
        stageEdit.applyLeadStageEdit.mockRejectedValue(Object.assign(new Error('Invalid transition'), { statusCode: 400 }));
        const res = await request(app)
            .post('/api/leads/bulk-stage')
            .send({ phones: [LOST.phone_number], stage: 'CLOSED_WON' });

        expect(res.body).toMatchObject({ updated: 0, failed: 1 });
        expect(prisma.contact.update).not.toHaveBeenCalled();
        expect(prisma.interaction.create).not.toHaveBeenCalled();
    });

    it('validates input up front', async () => {
        expect((await request(app).post('/api/leads/bulk-stage').send({ stage: 'NEW' })).status).toBe(400);
        expect((await request(app).post('/api/leads/bulk-stage').send({ phones: [LOST.phone_number] })).status).toBe(400);
        const tooMany = Array.from({ length: 501 }, (_, i) => `+9190000${String(i).padStart(4, '0')}`);
        expect((await request(app).post('/api/leads/bulk-stage').send({ phones: tooMany, stage: 'NEW' })).status).toBe(400);
    });
});

describe('POST /api/leads/bulk-stage — recycle mode', () => {
    it('starts a new cycle without touching created_at, and clears the current-cycle lost fields', async () => {
        const res = await request(app)
            .post('/api/leads/bulk-stage')
            .send({ phones: [LOST.phone_number], mode: 'recycle' });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ updated: 1, mode: 'recycle', stage: 'NEW' });
        // Defaults to NEW, the only legal reopen out of CLOSED_LOST.
        expect(stageEdit.applyLeadStageEdit).toHaveBeenCalledWith(expect.objectContaining({ requestedStage: 'NEW' }));

        const data = contactUpdateData();
        expect(data.recycled_at).toBeInstanceOf(Date);
        expect(data.cycle_start_at).toBeInstanceOf(Date);
        expect(data.lead_cycle).toBe(2);
        // lead_status must leave lost/closed or the default Active view keeps hiding the lead.
        expect(data.lead_status).toBe('cold');
        expect(data.lost_at).toBeNull();
        expect(data.lost_reason).toBeNull();
        // History preserved: created_at is NOT part of the write.
        expect(data.created_at).toBeUndefined();
    });

    it('keeps the loss readable by writing a lead_recycled audit interaction carrying the prior reason', async () => {
        await request(app).post('/api/leads/bulk-stage').send({ phones: [LOST.phone_number], mode: 'recycle' });

        const call = vi.mocked(prisma.interaction.create).mock.calls[0][0]?.data as any;
        expect(call.event_type).toBe('lead_recycled');
        expect(call.metadata).toMatchObject({
            from_stage: 'CLOSED_LOST', to_stage: 'NEW', recycle: true, bulk: true,
            previous_lost_reason: 'BUDGET',
        });
        expect(String(call.content)).toContain('BUDGET');
    });

    it('refuses to recycle a lead that is not lost', async () => {
        vi.mocked(prisma.contact.findUnique).mockResolvedValue(ACTIVE as any);
        const res = await request(app)
            .post('/api/leads/bulk-stage')
            .send({ phones: [ACTIVE.phone_number], mode: 'recycle' });

        expect(res.body).toMatchObject({ updated: 0, failed: 1 });
        expect(String(res.body.results[0].error)).toMatch(/Only lost leads can be recycled/);
        expect(prisma.contact.update).not.toHaveBeenCalled();
    });

    it('recycles AND reassigns in one call', async () => {
        const res = await request(app)
            .post('/api/leads/bulk-stage')
            .send({ phones: [LOST.phone_number], mode: 'recycle', agent_id: 'staff-9' });

        expect(res.status).toBe(200);
        const data = contactUpdateData();
        expect(data.assigned_agent_id).toBe('staff-9');
        expect(data.lead_cycle).toBe(2);
        // Open deals follow the new owner, same as bulk-reassign.
        expect(prisma.transaction.updateMany).toHaveBeenCalled();
    });

    it('refuses to assign leads to the actor themselves', async () => {
        const res = await request(app)
            .post('/api/leads/bulk-stage')
            .send({ phones: [LOST.phone_number], stage: 'NEW', agent_id: 'mgr-1' });
        expect(res.status).toBe(400);
    });

    it('fails once with an actionable message when the lead-cycle migration is missing', async () => {
        // `run_migrations` defaults to FALSE on deploy, so recycling can run against a database
        // without the columns. One clear error beats the same Prisma text repeated per lead.
        vi.mocked(prisma.contact.findFirst).mockRejectedValueOnce(
            Object.assign(new Error('The column contacts.lead_cycle does not exist in the current database.'), { code: 'P2022' })
        );
        const res = await request(app)
            .post('/api/leads/bulk-stage')
            .send({ phones: [LOST.phone_number], mode: 'recycle' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/20261008120000_lead_cycle_recycling/);
        expect(prisma.contact.update).not.toHaveBeenCalled();
    });
});

describe('POST /api/leads/bulk-stage — permissions', () => {
    it('an employee may only move leads they own', async () => {
        role = 'employee';
        const res = await request(app)
            .post('/api/leads/bulk-stage')
            .send({ phones: [LOST.phone_number], stage: 'NEW' });

        expect(res.body).toMatchObject({ updated: 0, failed: 1 });
        expect(res.body.results[0].error).toBe('Not your lead');
    });

    it('hides leads from another tenant', async () => {
        vi.mocked(prisma.contact.findUnique).mockResolvedValue({ ...LOST, tenant_id: 'other-tenant' } as any);
        const res = await request(app)
            .post('/api/leads/bulk-stage')
            .send({ phones: [LOST.phone_number], stage: 'NEW' });

        expect(res.body).toMatchObject({ updated: 0, failed: 1 });
        expect(res.body.results[0].error).toBe('Lead not found');
    });
});