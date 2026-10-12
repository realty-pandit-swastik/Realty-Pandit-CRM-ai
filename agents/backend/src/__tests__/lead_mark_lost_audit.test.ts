import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import prisma from '../db';

vi.mock('../db', () => ({
    default: {
        $queryRaw: vi.fn().mockResolvedValue([]),
        $transaction: vi.fn(),
        contact: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
        transaction: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
        interaction: { create: vi.fn(), count: vi.fn() },
        agent: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
        partnerAgent: { findUnique: vi.fn(), findMany: vi.fn() },
        tenant: { findFirst: vi.fn() },
    },
}));

import leadsRouter from '../routes/leads';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
    req.agent = { id: 'mgr-1', name: 'Mgr', email: 'mgr@example.com', role: 'manager', tenant_id: 'tenant-1' };
    next();
});
app.use('/api/leads', leadsRouter);

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({
        phone_number: '+919000000001', name: 'Lost Lead', assigned_agent_id: 'staff-1', tenant_id: 'tenant-1',
    } as any);
    // No open deals — the loss lands on the contact only.
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([]);
    vi.mocked(prisma.contact.update).mockResolvedValue({} as any);
    vi.mocked(prisma.interaction.create).mockResolvedValue({} as any);
});

describe('PATCH /api/leads/:phone/mark-lost', () => {
    it('writes the lead_marked_lost audit interaction WITH the tenant id', async () => {
        // Regression: the write previously omitted tenant_id (required on Interaction), so the
        // create failed and .catch swallowed it — no loss event ever reached history, which broke
        // the "recycled lead keeps its history" guarantee at the source.
        const res = await request(app)
            .patch('/api/leads/%2B919000000001/mark-lost')
            .send({ reason: 'Budget Issue' });

        expect(res.status).toBe(200);
        expect(prisma.interaction.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                tenant_id: 'tenant-1',
                phone_number: '+919000000001',
                event_type: 'lead_marked_lost',
            }),
        }));
    });

    it('rejects a missing/invalid reason without writing anything', async () => {
        const res = await request(app)
            .patch('/api/leads/%2B919000000001/mark-lost')
            .send({ reason: 'Nope' });

        expect(res.status).toBe(400);
        expect(prisma.contact.update).not.toHaveBeenCalled();
        expect(prisma.interaction.create).not.toHaveBeenCalled();
    });
});