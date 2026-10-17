import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import prisma from '../db';
import router from '../routes/external_leads';
import { ensureDealForLead } from '../services/ensure_deal';

vi.mock('../middleware/apikey', () => ({ apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../services/ensure_deal', () => ({ ensureDealForLead: vi.fn() }));
vi.mock('../services/lead_notifications', () => ({ sendBuyerConfirmationWhatsApp: vi.fn().mockResolvedValue(undefined) }));
const app = express(); app.use(express.json()); app.use('/external', router);
const phone = '+919000000001';
beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.tenant.findFirst).mockResolvedValue({ id: 'tenant-1' } as any);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ phone_number: phone }] as any);
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ tenant_id: 'tenant-1' } as any);
    vi.mocked(prisma.contact.upsert).mockResolvedValue({ phone_number: phone, tenant_id: 'tenant-1', assigned_agent_id: 'handler', contact_type: 'BUYER', lead_status: 'warm' } as any);
    Object.assign(prisma, { leadScore: { upsert: vi.fn().mockResolvedValue({}) } });
    vi.mocked(prisma.agent.findMany).mockResolvedValue([]);
    vi.mocked(ensureDealForLead).mockReset().mockResolvedValueOnce({ dealId: 'enquiry-1', created: true, status: 'NEW' }).mockResolvedValueOnce({ dealId: 'enquiry-2', created: true, status: 'NEW' });
});
describe('external enquiry intake', () => {
    it('reuses the contact for country-code variants but returns a new lead ID and its own requirements each time', async () => {
        const first = await request(app).post('/external/leads').send({ source: 'magicbricks', phone: '90000 00001', property_id: '85225923', location: 'A', budget: 5000000 });
        const second = await request(app).post('/external/leads').send({ source: '99acres', phone: '+91-9000000001', property_id: '84110871', location: 'B', budget: 9000000 });
        expect(first.status).toBe(201); expect(second.status).toBe(201);
        expect(first.body.contact_id).toBe(second.body.contact_id); expect(first.body.lead_id).not.toBe(second.body.lead_id);
        expect(ensureDealForLead).toHaveBeenNthCalledWith(1, expect.objectContaining({ contactPhone: phone, newEnquiry: true, sourceRef: '85225923', demand: expect.objectContaining({ location: 'A', budgetMax: 5000000 }) }));
        expect(ensureDealForLead).toHaveBeenNthCalledWith(2, expect.objectContaining({ contactPhone: phone, newEnquiry: true, sourceRef: '84110871', demand: expect.objectContaining({ location: 'B', budgetMax: 9000000 }) }));
        expect(vi.mocked(prisma.contact.upsert).mock.calls.every(call => call[0].where.phone_number === phone)).toBe(true);
    });
    it('creates an enquiry for each valid batch item instead of only upserting contacts', async () => {
        const res = await request(app).post('/external/leads/batch').send({ source: 'magicbricks', leads: [
            { phone: '9000000001', property_id: '85225923' }, { phone: '+919000000001', property_id: '84110871' },
        ] });
        expect(res.status).toBe(201); expect(res.body.success).toBe(2); expect(ensureDealForLead).toHaveBeenCalledTimes(2);
    });
    it('does not update a cross-tenant contact or accept an invalid budget', async () => {
        vi.mocked(prisma.contact.findUnique).mockResolvedValueOnce({ tenant_id: 'another-tenant' } as any);
        expect((await request(app).post('/external/leads').send({ source: 'magicbricks', phone, budget: 100 })).status).toBe(409);
        expect((await request(app).post('/external/leads').send({ source: 'magicbricks', phone, budget: 'bad' })).status).toBe(400);
        expect(prisma.contact.upsert).not.toHaveBeenCalled(); expect(ensureDealForLead).not.toHaveBeenCalled();
    });
});
