import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import prisma from '../db';
vi.mock('../utils/partner_scope', () => ({
    partnerIdsWithSubAgents: vi.fn(async () => ({ ids: ['partner-1', 'partner-child'], phones: [] })),
    partnerLeadOr: (ids: string[]) => [{ referral_partner_id: { in: ids } }, { partner_assignee_id: { in: ids } }],
}));
import leads from '../routes/leads';
let role = 'employee';
const app = express();
app.use((req: any, _res, next) => { req.agent = { id: 'staff-1', role, tenant_id: 'tenant-1' }; next(); });
app.use('/api/leads', leads);
beforeEach(() => {
    vi.clearAllMocks(); role = 'employee';
    vi.mocked(prisma.contact.findMany).mockResolvedValue([]);
    vi.mocked(prisma.partnerAgent.findMany).mockResolvedValue([]);
    vi.mocked(prisma.agent.findMany).mockResolvedValue([{ id: 'report-1' }] as any);
});
describe('contact autocomplete authorization', () => {
    it('name search combines tenant, visibility and query filters', async () => {
        expect((await request(app).get('/api/leads/search?q=Rahul')).status).toBe(200);
        const where: any = vi.mocked(prisma.contact.findMany).mock.calls[0][0]?.where;
        expect(where.tenant_id).toBe('tenant-1');
        expect(where.AND[0].OR).toContainEqual({ assigned_agent_id: 'staff-1' });
        expect(where.AND[1].OR).toContainEqual({ name: { contains: 'Rahul', mode: 'insensitive' } });
        expect((vi.mocked(prisma.partnerAgent.findMany).mock.calls[0][0]?.where as any).contact).toEqual({ tenant_id: 'tenant-1' });
    });
    it('manager searches include their direct reports managed partners', async () => {
        role = 'manager';
        await request(app).get('/api/leads/search?q=Rahul');
        expect((vi.mocked(prisma.partnerAgent.findMany).mock.calls[0][0]?.where as any).managing_agent_id).toEqual({ in: ['staff-1', 'report-1'] });
    });
    it('super boss bypasses team filters but retains tenant boundary', async () => {
        role = 'super_boss'; await request(app).get('/api/leads/search?q=Rahul');
        expect(vi.mocked(prisma.contact.findMany).mock.calls[0][0]?.where).toMatchObject({ tenant_id: 'tenant-1', AND: [{}, expect.anything()] });
    });
    it('partner autocomplete is limited to referred/assigned client contacts', async () => {
        role = 'partner'; await request(app).get('/api/leads/search?q=Rahul');
        const where: any = vi.mocked(prisma.contact.findMany).mock.calls[0][0]?.where;
        expect(where.AND[0].OR).toContainEqual({ referral_partner_id: { in: ['partner-1', 'partner-child'] } });
        expect((vi.mocked(prisma.partnerAgent.findMany).mock.calls[0][0]?.where as any).id).toBe('staff-1');
    });
});
