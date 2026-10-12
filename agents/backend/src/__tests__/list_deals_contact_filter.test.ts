import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../db', () => ({
    default: {
        $queryRaw: vi.fn().mockResolvedValue([]),
        $transaction: vi.fn(),
        transaction: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
        task: { findMany: vi.fn(), create: vi.fn() },
        interaction: { create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
        agent: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
        contact: { findUnique: vi.fn(), update: vi.fn() },
        partnerAgent: { findUnique: vi.fn(), findMany: vi.fn() },
    },
}));

import prisma from '../db';
import { listDeals } from '../services/deal_service';
import dealsRouter from '../routes/deals';

const PHONE = '+919000000010';
const NOW = new Date('2026-10-09T10:00:00.000Z');

const RAW_DEAL: any = {
    id: 'deal-1',
    status: 'NEW',
    tenant_id: 't1',
    ai_paused: false,
    last_team_action_at: null,
    demand_contact: { phone_number: PHONE, name: 'Salil' },
};

function mockBoard(deals: any[] = [RAW_DEAL]) {
    // 1st findMany: whole-set id scan. 2nd: page fetch. task/interaction: reminders + no-answer.
    vi.mocked(prisma.transaction.findMany)
        .mockResolvedValueOnce(deals.map(d => ({ id: d.id, created_at: NOW })) as any)
        .mockResolvedValueOnce(deals as any);
    vi.mocked(prisma.task.findMany).mockResolvedValue([]);
    vi.mocked(prisma.interaction.findMany).mockResolvedValue([]);
}

function firstWhere(): any {
    return vi.mocked(prisma.transaction.findMany).mock.calls[0][0]?.where;
}

beforeEach(() => {
    vi.clearAllMocks();
    mockBoard();
});

describe('listDeals — contact_phone exact scope (2026-10-09)', () => {
    it('matches the canonical number exactly', async () => {
        await listDeals({ tenant_id: 't1', contact_phone: PHONE, limit: 20 });
        const and = firstWhere().AND || [];
        expect(and).toContainEqual({ demand_contact_id: PHONE });
    });

    it('canonicalizes a bare 10-digit number instead of missing', async () => {
        await listDeals({ tenant_id: 't1', contact_phone: '9000000010', limit: 20 });
        const and = firstWhere().AND || [];
        expect(and).toContainEqual({ demand_contact_id: PHONE });
    });

    it('matches a PENDING placeholder exactly — never digit-stripped to the dealer', async () => {
        const placeholder = 'PENDING-abc-919000000010';
        await listDeals({ tenant_id: 't1', contact_phone: placeholder, limit: 20 });
        const and = firstWhere().AND || [];
        expect(and).toContainEqual({ demand_contact_id: placeholder });
    });

    it('matches nothing (not everything) for unparseable input', async () => {
        await listDeals({ tenant_id: 't1', contact_phone: '!!!', limit: 20 });
        const and = firstWhere().AND || [];
        expect(and).toContainEqual({ demand_contact_id: { in: [] } });
    });

    it('relaxes hide_closed while narrowing so a Won/Lost-only lead still shows', async () => {
        await listDeals({ tenant_id: 't1', contact_phone: PHONE, hide_closed: true, limit: 20 });
        expect(firstWhere().status).toBeUndefined();
    });

    it('keeps hiding closed when NOT narrowing', async () => {
        await listDeals({ tenant_id: 't1', hide_closed: true, limit: 20 });
        expect(firstWhere().status).toEqual({ notIn: ['CLOSED_WON', 'CLOSED_LOST', 'ON_HOLD'] });
    });

    it('keeps team scope enforced alongside the contact scope', async () => {
        await listDeals({ tenant_id: 't1', contact_phone: PHONE, team_ids: ['agent-1'], limit: 20 });
        const and = firstWhere().AND || [];
        expect(and).toContainEqual({ demand_contact_id: PHONE });
        expect(and).toContainEqual({
            OR: [{ coordinator_agent_id: { in: ['agent-1'] } }, { executive_agent_id: { in: ['agent-1'] } }],
        });
    });

    it('keeps partner scope enforced: partner A cannot surface partner B contacts', async () => {
        await listDeals({ tenant_id: 't1', contact_phone: '+919000000099', partner_ids: ['pa-A'], limit: 20 });
        const and = firstWhere().AND || [];
        // The contact clause narrows; the partner OR still gates — both must be present.
        expect(and).toContainEqual({ demand_contact_id: '+919000000099' });
        expect(and.some((c: any) => c.OR && JSON.stringify(c.OR).includes('pa-A'))).toBe(true);
    });
});

describe('GET /api/deals — contact_phone boundary', () => {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
        req.agent = { id: 'boss-1', role: 'super_boss', tenant_id: 't1' };
        next();
    });
    app.use('/api/deals', dealsRouter);

    it('rejects an overlong contact_phone instead of sending it to Prisma + logs', async () => {
        const res = await request(app).get('/api/deals?contact_phone=' + '1'.repeat(65));
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/too long/i);
        expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    });
});
