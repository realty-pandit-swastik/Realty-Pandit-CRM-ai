import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import prisma from '../db';
import leadsRouter from '../routes/leads';

const app = express();
let role = 'super_boss';
app.use((req: any, _res, next) => {
    req.agent = { id: 'boss-1', name: 'Boss', role, tenant_id: 'tenant-1' };
    next();
});
app.use('/api/leads', leadsRouter);

beforeEach(() => {
    vi.clearAllMocks();
    role = 'super_boss';
    vi.mocked(prisma.contact.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.contact.count).mockResolvedValue(0);
    vi.mocked(prisma.partnerAgent.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.agent.findMany).mockResolvedValue([] as any);
});

function whereOf(): any {
    return vi.mocked(prisma.contact.findMany).mock.calls[0][0]?.where;
}

describe('GET /api/leads/recent-external — pipeline stage filter', () => {
    it('matches a contact by its own stage OR by any deal in the set', async () => {
        const res = await request(app).get('/api/leads/recent-external?stage=VISITED,NEGOTIATION');
        expect(res.status).toBe(200);
        const stageClause = (whereOf().AND || []).find((c: any) => c?.OR?.some((x: any) => x.lifecycle_stage));
        expect(stageClause).toEqual({
            OR: [
                { lifecycle_stage: { in: ['VISITED', 'NEGOTIATION'] } },
                { demand_transactions: { some: { status: { in: ['VISITED', 'NEGOTIATION'] } } } },
            ],
        });
    });

    it('normalises casing and drops junk entries', async () => {
        await request(app).get('/api/leads/recent-external?stage=visited,%20,,new');
        const stageClause = (whereOf().AND || []).find((c: any) => c?.OR?.some((x: any) => x.lifecycle_stage));
        expect(stageClause.OR[0].lifecycle_stage.in).toEqual(['VISITED', 'NEW']);
    });

    it('reaches lost leads: selecting a stage relaxes the default active view', async () => {
        await request(app).get('/api/leads/recent-external?stage=CLOSED_LOST&active=active');
        // No lead_status restriction at all — otherwise picking CLOSED_LOST in the default view
        // would return nothing, which is exactly the "rework my lost leads" job this enables.
        expect(whereOf().lead_status).toBeUndefined();
    });

    it('keeps the active/archived split when no stage is selected', async () => {
        await request(app).get('/api/leads/recent-external?active=active');
        expect(whereOf().lead_status).toEqual({ notIn: ['lost', 'closed'] });
    });

    it('adds no stage clause when the param is absent', async () => {
        await request(app).get('/api/leads/recent-external');
        expect((whereOf().AND || []).some((c: any) => c?.OR?.some((x: any) => x.lifecycle_stage))).toBe(false);
    });

    it('orders the default newest-first sort by the current lead cycle, not first-seen date', async () => {
        await request(app).get('/api/leads/recent-external?sort=date&direction=desc');
        expect(prisma.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({
            orderBy: { cycle_start_at: 'desc' },
        }));
    });

    it('returns the cycle columns the UI needs for the Added date and the recycled badge', async () => {
        await request(app).get('/api/leads/recent-external');
        const select: any = vi.mocked(prisma.contact.findMany).mock.calls[0][0]?.select;
        expect(select).toMatchObject({ cycle_start_at: true, recycled_at: true, lead_cycle: true, created_at: true });
    });
});