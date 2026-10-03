import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
vi.mock('../services/portal_harvest', () => ({ ingestPortalListing: vi.fn(), HarvestError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
import { HarvestError, ingestPortalListing } from '../services/portal_harvest';
import prisma from '../db';
import inventoryRouter from '../routes/inventory';
import { csrfMiddleware } from '../middleware/csrf';
const app = express(); app.use(express.json()); app.use(csrfMiddleware);
app.use((req: any, _res, next) => { req.agent = { id: 'staff-1', role: 'employee', tenant_id: 'tenant-1' }; next(); });
app.use('/api/inventory', inventoryRouter);
beforeEach(() => { vi.clearAllMocks(); delete process.env.PORTAL_INGESTION_TOKEN; (prisma as any).inventory.update = vi.fn(); (prisma as any).inventory.create = vi.fn(); (prisma as any).portalListing = { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) }; });
describe('staff and service harvest', () => {
    it('passes staff identity and returns idempotent success', async () => {
        vi.mocked(ingestPortalListing).mockResolvedValue({ success: true, duplicate: true, candidate_id: 'c', status: 'CANDIDATE' } as any);
        const res = await request(app).post('/api/inventory/harvest').set('Authorization', 'Bearer test-staff').send({ source: '99acres', source_ref: 'x' });
        expect(res.status).toBe(200); expect(ingestPortalListing).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ tenant_id: 'tenant-1', id: 'staff-1' }));
    });
    it('returns validation failure without leaking unexpected errors', async () => {
        vi.mocked(ingestPortalListing).mockRejectedValue(new HarvestError(400, 'source_ref is required'));
        expect((await request(app).post('/api/inventory/harvest').set('Authorization', 'Bearer test-staff').send({})).status).toBe(400);
        vi.mocked(ingestPortalListing).mockRejectedValue(new Error('database secret'));
        const res = await request(app).post('/api/inventory/harvest').set('Authorization', 'Bearer test-staff').send({});
        expect(res.status).toBe(500); expect(JSON.stringify(res.body)).not.toContain('secret');
    });
    it('fails closed when service token is absent or wrong', async () => {
        expect((await request(app).post('/api/inventory/harvest/service').set('Authorization', 'Bearer x').send({})).status).toBe(503);
        process.env.PORTAL_INGESTION_TOKEN = 'x'.repeat(40); process.env.PORTAL_INGESTION_TENANT_ID = 'bound-tenant'; process.env.PORTAL_INGESTION_AGENT_ID = 'bound-staff';
        expect((await request(app).post('/api/inventory/harvest/service').set('Authorization', 'Bearer bad').send({})).status).toBe(401);
        expect(ingestPortalListing).not.toHaveBeenCalled();
    });
    it('binds service tenant/staff and rejects unlisted sources despite payload identity', async () => {
        process.env.PORTAL_INGESTION_TOKEN = 'x'.repeat(40); process.env.PORTAL_INGESTION_TENANT_ID = 'bound-tenant'; process.env.PORTAL_INGESTION_AGENT_ID = 'bound-staff'; process.env.PORTAL_INGESTION_SOURCES = '99acres';
        vi.mocked(prisma.agent.findFirst).mockResolvedValue({ id: 'bound-staff', tenant_id: 'bound-tenant', role: 'employee', status: 'active' } as any);
        vi.mocked(ingestPortalListing).mockResolvedValue({ success: true, duplicate: false, candidate_id: 'c', status: 'CANDIDATE' } as any);
        const token = 'Bearer ' + 'x'.repeat(40);
        expect((await request(app).post('/api/inventory/harvest/service').set('Authorization', token).send({ source: 'housing' })).status).toBe(403);
        const res = await request(app).post('/api/inventory/harvest/service').set('Authorization', token).send({ source: '99acres', tenant_id: 'attacker', staff_id: 'attacker' });
        expect(res.status).toBe(201); expect(ingestPortalListing).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ tenant_id: 'bound-tenant', id: 'bound-staff' }));
    });
    it('lists only tenant/team candidates with bounded pagination', async () => {
        const res = await request(app).get('/api/inventory/harvest/candidates?limit=999&page=2');
        expect(res.status).toBe(200);
        expect((prisma as any).portalListing.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenant_id: 'tenant-1', OR: [{ payload: { path: ['_ingested_by'], equals: 'staff-1' } }] }, take: 100, skip: 100 }));
    });
    it('does not approve pending harvested stock without scoped human-call evidence', async () => {
        vi.mocked(prisma.inventory.findUnique).mockResolvedValue({ id: 'inventory', status: 'pending_approval', upload_source: 'portal_crawl' } as any);
        vi.mocked(prisma.inventory.findFirst).mockResolvedValue({ id: 'inventory', tenant_id: 'tenant-1', assigned_agent_id: 'staff-1' } as any);
        (prisma as any).portalListing.findFirst.mockResolvedValue({ id: 'candidate', owner_call_verified_at: null });
        const res = await request(app).post('/api/inventory/inventory/approve').set('Authorization', 'Bearer test').send({});
        expect(res.status).toBe(409); expect(prisma.inventory.update).not.toHaveBeenCalled();
    });
    it('cannot record a human owner call across team visibility', async () => {
        (prisma as any).portalListing.findFirst.mockResolvedValue({ id: 'candidate', inventory_id: 'inventory' });
        vi.mocked(prisma.inventory.findFirst).mockResolvedValue({ id: 'inventory', tenant_id: 'tenant-1', assigned_agent_id: 'other-staff' } as any);
        const res = await request(app).post('/api/inventory/harvest/candidate/owner-call').set('Authorization', 'Bearer test').send({ owner_called: true, notes: 'Called owner and verified availability.' });
        expect(res.status).toBe(404);
    });
    it('cannot clone harvested stock into active inventory', async () => {
        vi.mocked(prisma.inventory.findFirst).mockResolvedValue({ id: 'inventory', tenant_id: 'tenant-1', upload_source: 'portal_crawl' } as any);
        const res = await request(app).post('/api/inventory/inventory/clone').set('Authorization', 'Bearer test').send({});
        expect(res.status).toBe(409); expect(prisma.inventory.create).not.toHaveBeenCalled();
    });

});
