import { beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import prisma from '../db';
vi.mock('../services/shortage_book', () => ({ getShortageThreshold: vi.fn(async () => 3), createDailySurveyTasks: vi.fn(), refreshDealShortage: vi.fn(), requestTenantShortageRefresh: vi.fn() }));
vi.mock('../middleware/auth', () => ({ authMiddleware: (req: any, _res: any, next: any) => next(), checkPermission: () => (req: any, _res: any, next: any) => next() }));
import deals from '../routes/deals';
import { createDailySurveyTasks, refreshDealShortage } from '../services/shortage_book';
const app = express();
let role = 'employee';
app.use(express.json(), (req: any, _res, next) => { req.agent = { id: 'agent-1', tenant_id: 'tenant-1', role }; next(); });
app.use('/api/deals', deals);
beforeEach(() => { vi.clearAllMocks(); role = 'employee'; (prisma as any).shortageEntry = { findMany: vi.fn(async () => []), findUnique: vi.fn() }; vi.mocked(prisma.agent.findMany).mockResolvedValue([{ id: 'agent-2' }] as any); });
it('employees and managers generate tasks only in permitted tenant and team', async () => {
    expect((await request(app).post('/api/deals/shortages/generate-tasks')).status).toBe(200);
    expect(createDailySurveyTasks).toHaveBeenLastCalledWith(expect.any(Date), { tenant_id: 'tenant-1', owner_ids: ['agent-1'] });
    role = 'manager';
    await request(app).post('/api/deals/shortages/generate-tasks');
    expect(createDailySurveyTasks).toHaveBeenLastCalledWith(expect.any(Date), { tenant_id: 'tenant-1', owner_ids: ['agent-1', 'agent-2'] });
});
it('even administrators generate tasks only in own tenant', async () => {
    role = 'super_boss'; await request(app).post('/api/deals/shortages/generate-tasks');
    expect(createDailySurveyTasks).toHaveBeenCalledWith(expect.any(Date), { tenant_id: 'tenant-1', owner_ids: undefined });
});
it('cross-team and cross-tenant refreshes cannot alter shortage outcomes', async () => {
    for (const shortage of [{ tenant_id: 'tenant-2', owner_id: 'agent-1' }, { tenant_id: 'tenant-1', owner_id: 'agent-2' }]) {
        (prisma as any).shortageEntry.findUnique.mockResolvedValue({ ...shortage, deal_id: 'd' });
        expect((await request(app).post('/api/deals/shortages/s/refresh')).status).toBe(404);
    }
    expect(refreshDealShortage).not.toHaveBeenCalled();
});
it('partner generation and employee threshold changes are rejected', async () => {
    role = 'partner'; expect((await request(app).post('/api/deals/shortages/generate-tasks')).status).toBe(403);
    role = 'employee'; expect((await request(app).patch('/api/deals/shortages/settings').send({ threshold: 1 })).status).toBe(403);
});
