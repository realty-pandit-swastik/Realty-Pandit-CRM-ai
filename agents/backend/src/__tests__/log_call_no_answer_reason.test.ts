import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../db', () => ({
    default: {
        transaction: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
        interaction: { create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
        teamAction: { create: vi.fn() },
        agent: { findUnique: vi.fn(), findFirst: vi.fn() },
        contact: { update: vi.fn() },
        partnerAgent: { findUnique: vi.fn() },
        $transaction: vi.fn(),
    },
}));

// Inject a staff agent: the route reads req.agent.id (team-action FK + "who" on the tile)
// and partnerOwnsDealOr403 short-circuits for any non-partner role.
vi.mock('../middleware/auth', () => ({
    authMiddleware: (req: any, _res: any, next: any) => {
        req.agent = { id: 'agent-1', name: 'Rohan', role: 'employee', tenant_id: 't1' };
        next();
    },
    checkPermission: () => (_req: any, _res: any, next: any) => next(),
    requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../services/deal_reminder', () => ({ createDealReminder: vi.fn().mockResolvedValue({ task_id: 'task-1' }) }));

// The close-unreachable path drives the real state machine; stub it so these tests assert the
// ROUTE's reason handling (validation + team-action outcome), not the transition rules
// (covered by transition_noop.test.ts).
vi.mock('../services/transaction_state_machine', () => ({
    transitionTransaction: vi.fn().mockResolvedValue({ status: 'CLOSED_LOST' }),
    advanceVisitedDeal: vi.fn(),
    getValidNextStatuses: vi.fn().mockResolvedValue([]),
}));

import prisma from '../db';
import dealsRouter from '../routes/deals';
import { createDealReminder } from '../services/deal_reminder';

const DEAL_ID = 'deal-1';
const PHONE = '+919000000010';

function app() {
    const a = express();
    a.use(express.json());
    a.use('/api/deals', dealsRouter);
    return a;
}

const NEW_DEAL = {
    id: DEAL_ID,
    status: 'NEW',
    tenant_id: 't1',
    demand_schema_values: null,
    demand_taxonomy_node_id: null,
    demand_contact: { phone_number: PHONE, name: 'Salil', tenant_id: 't1' },
};

beforeEach(() => {
    vi.clearAllMocks();
    (prisma.transaction.findUnique as any).mockResolvedValue({ ...NEW_DEAL });
    (prisma.interaction.create as any).mockResolvedValue({ id: 'i1' });
    (prisma.teamAction.create as any).mockResolvedValue({ id: 'ta1' });
    (prisma.transaction.update as any).mockResolvedValue({});
    (prisma.interaction.count as any).mockResolvedValue(0);
    (createDealReminder as any).mockResolvedValue({ task_id: 'task-1' });
});

// Why a no-answer call reached nobody. The reason is recorded on team_actions.outcome so the
// Deal Pipeline tile's "last action" line can show it, while metadata.outcome MUST stay
// NO_ANSWER — the derived no_answer_count, the "N× no answer" badge and the N=4
// reassign/close gate all query metadata.path['outcome'] == 'NO_ANSWER'.
describe('POST /api/deals/:id/log-call — no-answer reason', () => {
    it('stores the picked reason on the team action so the tile shows it as the last action', async () => {
        const res = await request(app())
            .post(`/api/deals/${DEAL_ID}/log-call`)
            .send({ outcome: 'NO_ANSWER', payload: { no_answer_reason: 'BUSY' } });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, outcome: 'NO_ANSWER' });
        expect((prisma.teamAction.create as any)).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ action_type: 'CALL_LOGGED', outcome: 'BUSY' }),
            }),
        );
    });

    it('keeps interaction metadata.outcome = NO_ANSWER so the no-answer count still derives', async () => {
        await request(app())
            .post(`/api/deals/${DEAL_ID}/log-call`)
            .send({ outcome: 'NO_ANSWER', payload: { no_answer_reason: 'NOT_REACHABLE' } });

        expect((prisma.interaction.create as any)).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    event_type: 'human_call_outcome',
                    metadata: expect.objectContaining({ outcome: 'NO_ANSWER', no_answer_reason: 'NOT_REACHABLE' }),
                }),
            }),
        );
    });

    it('accepts a reason together with a reminder and books it', async () => {
        const res = await request(app())
            .post(`/api/deals/${DEAL_ID}/log-call`)
            .send({ outcome: 'NO_ANSWER', payload: { no_answer_reason: 'SWITCHED_OFF', remind_at: '2026-10-09T10:00:00.000Z' } });

        expect(res.status).toBe(200);
        expect(createDealReminder).toHaveBeenCalledTimes(1);
        expect((prisma.teamAction.create as any).mock.calls[0][0].data.outcome).toBe('SWITCHED_OFF');
    });

    it('rejects an unknown reason with 400 and writes no action row', async () => {
        const res = await request(app())
            .post(`/api/deals/${DEAL_ID}/log-call`)
            .send({ outcome: 'NO_ANSWER', payload: { no_answer_reason: 'killed the call' } });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Unknown no-answer reason/);
        expect(prisma.teamAction.create).not.toHaveBeenCalled();
        expect(prisma.interaction.create).not.toHaveBeenCalled();
    });

    it('still logs the generic outcome when an older client sends no reason', async () => {
        const res = await request(app())
            .post(`/api/deals/${DEAL_ID}/log-call`)
            .send({ outcome: 'NO_ANSWER', payload: {} });

        expect(res.status).toBe(200);
        expect((prisma.teamAction.create as any).mock.calls[0][0].data.outcome).toBe('NO_ANSWER');
    });

    it('accepts a reason on the close-unreachable path and rejects an unknown one there too', async () => {
        const ok = await request(app())
            .post(`/api/deals/${DEAL_ID}/log-call`)
            .send({ outcome: 'CLOSED_UNREACHABLE', payload: { no_answer_reason: 'WRONG_NUMBER' } });
        expect(ok.status).toBe(200);
        expect((prisma.teamAction.create as any).mock.calls[0][0].data.outcome).toBe('WRONG_NUMBER');

        vi.clearAllMocks();
        (prisma.transaction.findUnique as any).mockResolvedValue({ ...NEW_DEAL });
        const bad = await request(app())
            .post(`/api/deals/${DEAL_ID}/log-call`)
            .send({ outcome: 'CLOSED_UNREACHABLE', payload: { no_answer_reason: 'nope' } });
        expect(bad.status).toBe(400);
    });
});