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
// ROUTE's reason handling, not the transition rules (covered by transition_noop.test.ts).
vi.mock('../services/transaction_state_machine', () => ({
    transitionTransaction: vi.fn().mockResolvedValue({ status: 'CLOSED_LOST' }),
    advanceVisitedDeal: vi.fn(),
    getValidNextStatuses: vi.fn().mockResolvedValue([]),
}));

import prisma from '../db';
import dealsRouter from '../routes/deals';
import { createDealReminder } from '../services/deal_reminder';
import { transitionTransaction } from '../services/transaction_state_machine';

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

const postLogCall = (outcome: string, payload: Record<string, any> = {}) =>
    request(app()).post(`/api/deals/${DEAL_ID}/log-call`).send({ outcome, payload });

const teamActionOutcome = () => (prisma.teamAction.create as any).mock.calls[0][0].data.outcome;
const interactionMetadata = () => (prisma.interaction.create as any).mock.calls[0][0].data.metadata;

beforeEach(() => {
    vi.clearAllMocks();
    (prisma.transaction.findUnique as any).mockResolvedValue({ ...NEW_DEAL });
    (prisma.interaction.create as any).mockResolvedValue({ id: 'i1' });
    (prisma.teamAction.create as any).mockResolvedValue({ id: 'ta1' });
    (prisma.transaction.update as any).mockResolvedValue({});
    (prisma.interaction.count as any).mockResolvedValue(0);
    (createDealReminder as any).mockResolvedValue({ task_id: 'task-1' });
});

// Why a no-answer call reached nobody. Encoded on team_actions.outcome as "<BASE>:<REASON>" so the
// base outcome survives and cannot collide with another writer of that free-text column.
// metadata.outcome MUST stay the raw outcome — the derived no_answer_count, the "N× no answer"
// badge and the N=4 reassign/close gate all query metadata.path['outcome'] == 'NO_ANSWER'.
describe('POST /api/deals/:id/log-call — no-answer reason', () => {
    it('records the reason alongside the base outcome so the tile can label it', async () => {
        const res = await postLogCall('NO_ANSWER', { no_answer_reason: 'BUSY' });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, outcome: 'NO_ANSWER' });
        expect(teamActionOutcome()).toBe('NO_ANSWER:BUSY');
    });

    it('keeps interaction metadata.outcome = NO_ANSWER so the no-answer count still derives', async () => {
        await postLogCall('NO_ANSWER', { no_answer_reason: 'NOT_REACHABLE' });

        expect(interactionMetadata()).toMatchObject({
            outcome: 'NO_ANSWER',
            deal_id: DEAL_ID,
            no_answer_reason: 'NOT_REACHABLE',
        });
    });

    it('does not let a caller override the audited metadata.outcome / deal_id from the body', async () => {
        // Without trusted-last spread ordering this makes the row look like a NO_ANSWER, inflating
        // no_answer_count and mis-attributing it — enough to trip the N=4 close gate on a deal that
        // was actually qualified.
        const res = await postLogCall('ANSWERED_INTERESTED', {
            outcome: 'NO_ANSWER',
            deal_id: 'some-other-deal',
            no_answer_reason: 'BUSY',
            requirements: {
                intent: 'buy', budget_min: 1, budget_max: 2, preferred_location: 'Noida', timeline: 'now',
            },
        });

        expect(res.status).toBe(200);
        expect(interactionMetadata()).toMatchObject({ outcome: 'ANSWERED_INTERESTED', deal_id: DEAL_ID });
    });

    it('never persists an unrecognised reason, and never fails the call over it', async () => {
        // The frontend requires this field, so a frontend deployed ahead of the backend must degrade
        // to "no reason" — not brick the whole Log Call form (which may close a deal).
        const res = await postLogCall('NO_ANSWER', { no_answer_reason: 'killed the call 🎉'.repeat(50) });

        expect(res.status).toBe(200);
        expect(teamActionOutcome()).toBe('NO_ANSWER');
        expect(interactionMetadata().no_answer_reason).toBeUndefined();
    });

    it('does not attach a no-answer reason to an unrelated outcome', async () => {
        await postLogCall('CALLBACK_REQUESTED', {
            callback_at: '2026-10-09T10:00:00.000Z',
            no_answer_reason: 'BUSY',
        });

        expect(teamActionOutcome()).toBe('CALLBACK_REQUESTED');
        expect(interactionMetadata().no_answer_reason).toBeUndefined();
    });

    it('keeps CLOSED_UNREACHABLE as the outcome when closing with a reason', async () => {
        // Regression: a bare reason here would erase "closed as unreachable" AND collide with the
        // WRONG_NUMBER value WRONG_OR_SPAM already writes to the same column.
        const res = await postLogCall('CLOSED_UNREACHABLE', { no_answer_reason: 'WRONG_NUMBER' });

        expect(res.status).toBe(200);
        expect(teamActionOutcome()).toBe('CLOSED_UNREACHABLE:WRONG_NUMBER');
        expect(transitionTransaction).toHaveBeenCalledWith(DEAL_ID, 'CLOSED_LOST', 'agent-1', 'admin', expect.objectContaining({ notes: expect.stringContaining('unreachable') }));
    });

    it('does not close the deal when the reason is unrecognised', async () => {
        const res = await postLogCall('CLOSED_UNREACHABLE', { no_answer_reason: 'nope' });

        expect(res.status).toBe(200);
        expect(transitionTransaction).toHaveBeenCalled();
        expect(teamActionOutcome()).toBe('CLOSED_UNREACHABLE');
        expect(interactionMetadata().no_answer_reason).toBeUndefined();
    });

    it('accepts a reason together with a reminder and books it', async () => {
        const res = await postLogCall('NO_ANSWER', { no_answer_reason: 'SWITCHED_OFF', remind_at: '2026-10-09T10:00:00.000Z' });

        expect(res.status).toBe(200);
        expect(createDealReminder).toHaveBeenCalledTimes(1);
        expect(teamActionOutcome()).toBe('NO_ANSWER:SWITCHED_OFF');
    });

    it('still logs the generic outcome when an older client sends no reason', async () => {
        const res = await postLogCall('NO_ANSWER', {});

        expect(res.status).toBe(200);
        expect(teamActionOutcome()).toBe('NO_ANSWER');
    });

    it('normalises a lowercase reason', async () => {
        await postLogCall('NO_ANSWER', { no_answer_reason: 'busy' });

        expect(teamActionOutcome()).toBe('NO_ANSWER:BUSY');
    });
});