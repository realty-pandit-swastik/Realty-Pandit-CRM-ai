import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../services/whatsapp', () => ({
    WhatsAppService: class {
        sendText = vi.fn().mockResolvedValue({ messages: [{ id: 'wa123' }] });
        sendTemplate = vi.fn().mockResolvedValue(undefined);
        sendImage = vi.fn().mockResolvedValue(undefined);
        sendTextStrict = vi.fn().mockResolvedValue(undefined);
        parseWebhook = vi.fn().mockReturnValue([]);
    },
}));

import app from '../app';
import prisma from '../db';

beforeEach(() => vi.clearAllMocks());

describe('internal_tools router skeleton', () => {
    it('returns 400 when caller phone missing', async () => {
        const res = await request(app).get('/webhooks/internal/tools/ping');
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/caller/i);
    });

    it('returns 403 when caller not in agents table', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(null);
        const res = await request(app).get('/webhooks/internal/tools/ping?caller=%2B919000000000');
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/not recognized/i);
    });
});

describe('GET /webhooks/internal/tools/my-leads', () => {
    const rohan = {
        id: 'a1', name: 'Rohan', phone: '+919958860411', email: 'rohan@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1', status: 'active',
    };

    beforeEach(() => {
        (prisma.agent.findFirst as any).mockResolvedValue(rohan);
    });

    it('returns leads assigned to caller', async () => {
        (prisma.lead.findMany as any).mockResolvedValue([
            {
                id: 'l1',
                contact_phone: '+919111111111',
                intent: 'buy',
                budget_min: 5000000,
                budget_max: 8000000,
                demand_main_category: 'residential',
                demand_type_slug: '2bhk',
                lifecycle_stage: 'new',
                assigned_agent_id: 'a1',
                created_at: new Date(),
                contact: { name: 'Ramesh Gupta' },
            },
        ]);

        const res = await request(app).get('/webhooks/internal/tools/my-leads?caller=%2B919958860411');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.leads).toHaveLength(1);
        expect(res.body.leads[0].name).toBe('Ramesh Gupta');
        expect(res.body.leads[0].intent).toBe('buy');
        expect(prisma.lead.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ assigned_agent_id: 'a1' }),
            }),
        );
    });

    it('applies stage filter when provided', async () => {
        (prisma.lead.findMany as any).mockResolvedValue([]);
        await request(app).get('/webhooks/internal/tools/my-leads?caller=%2B919958860411&stage=site_visit_scheduled');
        expect(prisma.lead.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ lifecycle_stage: 'site_visit_scheduled' }),
            }),
        );
    });

    it('respects limit param, defaults to 10, caps at 50', async () => {
        (prisma.lead.findMany as any).mockResolvedValue([]);

        await request(app).get('/webhooks/internal/tools/my-leads?caller=%2B919958860411');
        expect(prisma.lead.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));

        (prisma.lead.findMany as any).mockClear();
        await request(app).get('/webhooks/internal/tools/my-leads?caller=%2B919958860411&limit=5');
        expect(prisma.lead.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));

        (prisma.lead.findMany as any).mockClear();
        await request(app).get('/webhooks/internal/tools/my-leads?caller=%2B919958860411&limit=9999');
        expect(prisma.lead.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
    });
});

describe('GET /webhooks/internal/tools/my-appointments', () => {
    const rohan = {
        id: 'a1', name: 'Rohan', phone: '+919958860411', email: 'rohan@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1', status: 'active',
    };

    beforeEach(() => {
        (prisma.agent.findFirst as any).mockResolvedValue(rohan);
    });

    it('returns appointments for today by default', async () => {
        (prisma.appointment.findMany as any).mockResolvedValue([
            {
                id: 'ap1',
                scheduled_at: new Date(),
                contact_id: '+919111111111',
                type: 'site_visit',
                status: 'confirmed',
                location: 'Vaishali',
                contact: { name: 'Ramesh Gupta' },
            },
        ]);
        const res = await request(app).get('/webhooks/internal/tools/my-appointments?caller=%2B919958860411');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.appointments).toHaveLength(1);
        expect(res.body.appointments[0].client_name).toBe('Ramesh Gupta');
    });

    it('accepts date_range=week and applies 7-day range', async () => {
        (prisma.appointment.findMany as any).mockResolvedValue([]);
        await request(app).get('/webhooks/internal/tools/my-appointments?caller=%2B919958860411&date_range=week');
        const call = (prisma.appointment.findMany as any).mock.calls[0][0];
        expect(call.where.scheduled_at.gte).toBeDefined();
        expect(call.where.scheduled_at.lte).toBeDefined();
    });

    it('accepts date_range=upcoming and ranges from now to +30 days', async () => {
        (prisma.appointment.findMany as any).mockResolvedValue([]);
        await request(app).get('/webhooks/internal/tools/my-appointments?caller=%2B919958860411&date_range=upcoming');
        const call = (prisma.appointment.findMany as any).mock.calls[0][0];
        expect(call.where.scheduled_at.gte).toBeDefined();
        expect(call.where.scheduled_at.lte).toBeDefined();
    });
});

describe('GET /webhooks/internal/tools/my-tasks', () => {
    const rohan = {
        id: 'a1', name: 'Rohan', phone: '+919958860411', email: 'rohan@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1', status: 'active',
    };

    beforeEach(() => (prisma.agent.findFirst as any).mockResolvedValue(rohan));

    it('returns pending tasks by default', async () => {
        (prisma.taskFollowup.findMany as any).mockResolvedValue([
            {
                id: 't1',
                task_type: 'call',
                status: 'pending',
                scheduled_at: new Date(),
                phone_number: '+919111111111',
                contact: { name: 'Ramesh Gupta' },
            },
        ]);
        const res = await request(app).get('/webhooks/internal/tools/my-tasks?caller=%2B919958860411');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.tasks).toHaveLength(1);
        expect(res.body.tasks[0].client_name).toBe('Ramesh Gupta');
        expect(prisma.taskFollowup.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    status: 'pending',
                    contact: { assigned_agent_id: 'a1' },
                }),
            }),
        );
    });

    it('accepts status=completed filter', async () => {
        (prisma.taskFollowup.findMany as any).mockResolvedValue([]);
        await request(app).get('/webhooks/internal/tools/my-tasks?caller=%2B919958860411&status=completed');
        const call = (prisma.taskFollowup.findMany as any).mock.calls[0][0];
        expect(call.where.status).toBe('completed');
    });

    it('caps results at 20', async () => {
        (prisma.taskFollowup.findMany as any).mockResolvedValue([]);
        await request(app).get('/webhooks/internal/tools/my-tasks?caller=%2B919958860411');
        const call = (prisma.taskFollowup.findMany as any).mock.calls[0][0];
        expect(call.take).toBe(20);
    });
});

describe('GET /webhooks/internal/tools/search-lead', () => {
    const rohan = {
        id: 'a1', name: 'Rohan', phone: '+919958860411', email: 'rohan@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1', status: 'active',
    };
    const manager = {
        ...rohan, id: 'm1', name: 'Sanjay', role: 'manager',
    };

    beforeEach(() => (prisma.agent.findFirst as any).mockResolvedValue(rohan));

    it('rejects request when no search param provided', async () => {
        const res = await request(app).get('/webhooks/internal/tools/search-lead?caller=%2B919958860411');
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/required/i);
    });

    it('searches by phone variants', async () => {
        (prisma.lead.findMany as any).mockResolvedValue([]);
        await request(app).get('/webhooks/internal/tools/search-lead?caller=%2B919958860411&phone=9111111111');
        const call = (prisma.lead.findMany as any).mock.calls[0][0];
        expect(call.where.contact_phone.in).toEqual(expect.arrayContaining(['+919111111111', '919111111111', '9111111111']));
    });

    it('searches by name using case-insensitive contains via contact relation', async () => {
        (prisma.lead.findMany as any).mockResolvedValue([]);
        await request(app).get('/webhooks/internal/tools/search-lead?caller=%2B919958860411&name=priya');
        const call = (prisma.lead.findMany as any).mock.calls[0][0];
        expect(call.where.contact.name.contains).toBe('priya');
        expect(call.where.contact.name.mode).toBe('insensitive');
    });

    it('searches by lead_id', async () => {
        (prisma.lead.findMany as any).mockResolvedValue([]);
        await request(app).get('/webhooks/internal/tools/search-lead?caller=%2B919958860411&lead_id=xyz');
        const call = (prisma.lead.findMany as any).mock.calls[0][0];
        expect(call.where.id).toBe('xyz');
    });

    it('employee-scoped: only returns leads assigned to caller', async () => {
        (prisma.lead.findMany as any).mockResolvedValue([]);
        await request(app).get('/webhooks/internal/tools/search-lead?caller=%2B919958860411&name=priya');
        const call = (prisma.lead.findMany as any).mock.calls[0][0];
        expect(call.where.assigned_agent_id).toBe('a1');
    });

    it('manager-scope does NOT add assigned_agent_id filter (Phase 1 open for managers)', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(manager);
        (prisma.lead.findMany as any).mockResolvedValue([]);
        await request(app).get('/webhooks/internal/tools/search-lead?caller=%2B919958860411&name=priya');
        const call = (prisma.lead.findMany as any).mock.calls[0][0];
        expect(call.where.assigned_agent_id).toBeUndefined();
    });

    it('returns mapped lead objects', async () => {
        (prisma.lead.findMany as any).mockResolvedValue([
            {
                id: 'l1', contact_phone: '+919111111111', intent: 'buy',
                budget_min: 6000000, budget_max: 8000000,
                demand_main_category: 'residential', demand_type_slug: '2bhk',
                lifecycle_stage: 'site_visit_scheduled',
                assigned_agent_id: 'a1',
                contact: { name: 'Priya Sharma' },
            },
        ]);
        const res = await request(app).get('/webhooks/internal/tools/search-lead?caller=%2B919958860411&name=priya');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.leads).toHaveLength(1);
        expect(res.body.leads[0].name).toBe('Priya Sharma');
        expect(res.body.leads[0].stage).toBe('site_visit_scheduled');
    });
});

describe('POST /webhooks/internal/tools/schedule-callback', () => {
    const rohan = {
        id: 'a1', name: 'Rohan', phone: '+919958860411', email: 'rohan@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1', status: 'active',
    };

    beforeEach(() => (prisma.agent.findFirst as any).mockResolvedValue(rohan));

    it('rejects when lead_id or datetime missing', async () => {
        const res = await request(app)
            .post('/webhooks/internal/tools/schedule-callback')
            .send({ caller: '+919958860411' });
        expect(res.status).toBe(400);
    });

    it('creates a TaskFollowup with task_type=call, status=pending', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue({
            id: 'l1', contact_phone: '+919111111111', assigned_agent_id: 'a1', tenant_id: 't1',
        });
        (prisma.taskFollowup.create as any).mockResolvedValue({ id: 't99' });

        const res = await request(app)
            .post('/webhooks/internal/tools/schedule-callback')
            .send({
                caller: '+919958860411',
                lead_id: 'l1',
                datetime: '2026-04-20T10:00:00.000Z',
                note: 'Follow up on Dwarka',
            });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.task_id).toBe('t99');
        expect(prisma.taskFollowup.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    task_type: 'call',
                    status: 'pending',
                    phone_number: '+919111111111',
                    tenant_id: 't1',
                }),
            }),
        );
    });

    it('returns 404 when lead does not exist', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue(null);
        const res = await request(app)
            .post('/webhooks/internal/tools/schedule-callback')
            .send({ caller: '+919958860411', lead_id: 'missing', datetime: '2026-04-20T10:00:00.000Z' });
        expect(res.status).toBe(404);
    });

    it('rejects when employee tries to schedule for a lead not assigned to them', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue({
            id: 'l1', contact_phone: '+919111111111', assigned_agent_id: 'other', tenant_id: 't1',
        });
        const res = await request(app)
            .post('/webhooks/internal/tools/schedule-callback')
            .send({ caller: '+919958860411', lead_id: 'l1', datetime: '2026-04-20T10:00:00.000Z' });
        expect(res.status).toBe(403);
    });
});

describe('POST /webhooks/internal/tools/log-call-note', () => {
    const rohan = {
        id: 'a1', name: 'Rohan', phone: '+919958860411', email: 'rohan@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1', status: 'active',
    };

    beforeEach(() => (prisma.agent.findFirst as any).mockResolvedValue(rohan));

    it('rejects when lead_id or note missing', async () => {
        const res = await request(app)
            .post('/webhooks/internal/tools/log-call-note')
            .send({ caller: '+919958860411', lead_id: 'l1' });
        expect(res.status).toBe(400);
    });

    it('writes an Interaction with channel=voice', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue({
            id: 'l1', contact_phone: '+919111111111', assigned_agent_id: 'a1', tenant_id: 't1',
        });
        (prisma.interaction.create as any).mockResolvedValue({ id: 'i99' });

        const res = await request(app)
            .post('/webhooks/internal/tools/log-call-note')
            .send({
                caller: '+919958860411',
                lead_id: 'l1',
                note: 'Client wants Sector 12 next week',
            });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.interaction_id).toBe('i99');
        expect(prisma.interaction.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    channel: 'voice',
                    phone_number: '+919111111111',
                    tenant_id: 't1',
                }),
            }),
        );
    });

    it('returns 404 when lead not found', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue(null);
        const res = await request(app)
            .post('/webhooks/internal/tools/log-call-note')
            .send({ caller: '+919958860411', lead_id: 'missing', note: 'x' });
        expect(res.status).toBe(404);
    });

    it('rejects when employee tries to log note for lead not assigned to them', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue({
            id: 'l1', contact_phone: '+919111111111', assigned_agent_id: 'other', tenant_id: 't1',
        });
        const res = await request(app)
            .post('/webhooks/internal/tools/log-call-note')
            .send({ caller: '+919958860411', lead_id: 'l1', note: 'x' });
        expect(res.status).toBe(403);
    });
});

describe('POST /webhooks/internal/tools/send-whatsapp', () => {
    const rohan = {
        id: 'a1', name: 'Rohan', phone: '+919958860411', email: 'rohan@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1', status: 'active',
    };

    beforeEach(() => (prisma.agent.findFirst as any).mockResolvedValue(rohan));

    it('rejects when recipient_phone/content_type/payload missing', async () => {
        const res = await request(app)
            .post('/webhooks/internal/tools/send-whatsapp')
            .send({ caller: '+919958860411' });
        expect(res.status).toBe(400);
    });

    it('rejects non-text content_type in phase 1', async () => {
        const res = await request(app)
            .post('/webhooks/internal/tools/send-whatsapp')
            .send({
                caller: '+919958860411',
                recipient_phone: '+919111111111',
                content_type: 'image',
                payload: { url: 'x' },
            });
        expect(res.status).toBe(400);
    });

    it('rejects empty text payload', async () => {
        const res = await request(app)
            .post('/webhooks/internal/tools/send-whatsapp')
            .send({
                caller: '+919958860411',
                recipient_phone: '+919111111111',
                content_type: 'text',
                payload: { body: '' },
            });
        expect(res.status).toBe(400);
    });

    it('sends text message and returns wa_message_id', async () => {
        const res = await request(app)
            .post('/webhooks/internal/tools/send-whatsapp')
            .send({
                caller: '+919958860411',
                recipient_phone: '+919111111111',
                content_type: 'text',
                payload: { body: 'Your appointment is confirmed for 3pm tomorrow.' },
            });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.wa_message_id).toBe('wa123');
    });
});

describe('GET /webhooks/internal/tools/search-inventory', () => {
    const rohan = {
        id: 'a1', name: 'Rohan', phone: '+919958860411', email: 'rohan@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1', status: 'active',
    };

    beforeEach(() => (prisma.agent.findFirst as any).mockResolvedValue(rohan));

    it('rejects when location or intent missing', async () => {
        const res = await request(app).get('/webhooks/internal/tools/search-inventory?caller=%2B919958860411');
        expect(res.status).toBe(400);
    });

    it('filters by location (OR across city/locality/sub_locality), intent, budget range', async () => {
        (prisma.inventory.findMany as any).mockResolvedValue([]);
        await request(app).get('/webhooks/internal/tools/search-inventory?caller=%2B919958860411&location=Vaishali&intent=rent&budget_min=15000&budget_max=30000');
        const call = (prisma.inventory.findMany as any).mock.calls[0][0];
        expect(call.where.status).toBe('active');
        // rent intent maps to multiple DB values
        expect(call.where.intent).toEqual({ in: ['rent', 'rent_lease', 'lease'] });
        expect(Array.isArray(call.where.OR)).toBe(true);
        expect(call.where.OR.length).toBeGreaterThanOrEqual(3);
        expect(call.where.price.gte).toBe(15000);
        expect(call.where.price.lte).toBe(30000);
    });

    it('maps "buy" intent to "sell" in DB', async () => {
        (prisma.inventory.findMany as any).mockResolvedValue([]);
        await request(app).get('/webhooks/internal/tools/search-inventory?caller=%2B919958860411&location=Delhi&intent=buy');
        const call = (prisma.inventory.findMany as any).mock.calls[0][0];
        expect(call.where.intent).toBe('sell');
    });

    it('returns mapped inventory objects with bedrooms from specs JSON', async () => {
        (prisma.inventory.findMany as any).mockResolvedValue([
            {
                id: 'inv1', type: 'flat', intent: 'rent', price: 25000, status: 'active',
                city: 'Ghaziabad', locality: 'Vaishali', sub_locality: 'Sector 4',
                furnishing: 'semi_furnished', specs: { bedrooms: 2, area: 1100, unit: 'sqft' },
                media_urls: ['https://cdn.example.com/1.jpg'],
            },
        ]);
        const res = await request(app).get('/webhooks/internal/tools/search-inventory?caller=%2B919958860411&location=Vaishali&intent=rent');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.inventory).toHaveLength(1);
        expect(res.body.inventory[0].locality).toBe('Vaishali');
        expect(res.body.inventory[0].bedrooms).toBe(2);
        expect(res.body.inventory[0].area).toBe(1100);
    });

    it('filters by bhk in-memory (after DB query)', async () => {
        (prisma.inventory.findMany as any).mockResolvedValue([
            { id: 'inv1', specs: { bedrooms: 2 }, type: 'flat', intent: 'rent', price: 25000, city: 'X', locality: 'Vaishali', sub_locality: null, furnishing: null, media_urls: [] },
            { id: 'inv2', specs: { bedrooms: 3 }, type: 'flat', intent: 'rent', price: 35000, city: 'X', locality: 'Vaishali', sub_locality: null, furnishing: null, media_urls: [] },
        ]);
        const res = await request(app).get('/webhooks/internal/tools/search-inventory?caller=%2B919958860411&location=Vaishali&intent=rent&bhk=2');
        expect(res.body.inventory).toHaveLength(1);
        expect(res.body.inventory[0].id).toBe('inv1');
    });

    it('caps take at 5 by default', async () => {
        (prisma.inventory.findMany as any).mockResolvedValue([]);
        await request(app).get('/webhooks/internal/tools/search-inventory?caller=%2B919958860411&location=Delhi&intent=rent');
        const call = (prisma.inventory.findMany as any).mock.calls[0][0];
        expect(call.take).toBe(5);
    });
});

describe('POST /webhooks/internal/tools/schedule-site-visit', () => {
    const rohan = {
        id: 'a1', name: 'Rohan', phone: '+919958860411', email: 'rohan@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1', status: 'active',
    };

    beforeEach(() => (prisma.agent.findFirst as any).mockResolvedValue(rohan));

    it('rejects when lead_id or datetime missing', async () => {
        const res = await request(app)
            .post('/webhooks/internal/tools/schedule-site-visit')
            .send({ caller: '+919958860411' });
        expect(res.status).toBe(400);
    });

    it('creates Appointment with type=site_visit and status=scheduled', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue({
            id: 'l1', contact_phone: '+919111111111', assigned_agent_id: 'a1', tenant_id: 't1',
        });
        (prisma.appointment.create as any).mockResolvedValue({ id: 'ap99' });

        const res = await request(app)
            .post('/webhooks/internal/tools/schedule-site-visit')
            .send({
                caller: '+919958860411',
                lead_id: 'l1',
                datetime: '2026-04-20T15:00:00.000Z',
                property_id: 'inv1',
                location: 'Vaishali, Sector 4',
            });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.appointment_id).toBe('ap99');
        expect(prisma.appointment.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    contact_id: '+919111111111',
                    assigned_to_agent_id: 'a1',
                    scheduled_at: expect.any(Date),
                    location: 'Vaishali, Sector 4',
                }),
            }),
        );
    });

    it('returns 404 when lead not found', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue(null);
        const res = await request(app)
            .post('/webhooks/internal/tools/schedule-site-visit')
            .send({ caller: '+919958860411', lead_id: 'missing', datetime: '2026-04-20T15:00:00.000Z' });
        expect(res.status).toBe(404);
    });

    it('rejects when employee does not own the lead', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue({
            id: 'l1', contact_phone: '+919111111111', assigned_agent_id: 'other', tenant_id: 't1',
        });
        const res = await request(app)
            .post('/webhooks/internal/tools/schedule-site-visit')
            .send({ caller: '+919958860411', lead_id: 'l1', datetime: '2026-04-20T15:00:00.000Z' });
        expect(res.status).toBe(403);
    });
});

describe('POST /webhooks/internal/tools/update-lead-status', () => {
    const rohan = {
        id: 'a1', name: 'Rohan', phone: '+919958860411', email: 'rohan@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1', status: 'active',
    };

    beforeEach(() => (prisma.agent.findFirst as any).mockResolvedValue(rohan));

    it('rejects when lead_id or stage missing', async () => {
        const res = await request(app)
            .post('/webhooks/internal/tools/update-lead-status')
            .send({ caller: '+919958860411', lead_id: 'l1' });
        expect(res.status).toBe(400);
    });

    it('updates lifecycle_stage on owned lead', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue({
            id: 'l1', assigned_agent_id: 'a1', tenant_id: 't1', contact_phone: '+919111111111',
        });
        (prisma.lead.update as any).mockResolvedValue({ id: 'l1', lifecycle_stage: 'negotiation' });
        (prisma.interaction.create as any).mockResolvedValue({ id: 'i1' });

        const res = await request(app)
            .post('/webhooks/internal/tools/update-lead-status')
            .send({ caller: '+919958860411', lead_id: 'l1', stage: 'negotiation', note: 'price discussed' });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.stage).toBe('negotiation');
        expect(prisma.lead.update).toHaveBeenCalledWith({
            where: { id: 'l1' },
            data: { lifecycle_stage: 'negotiation' },
        });
        expect(prisma.interaction.create).toHaveBeenCalled();
    });

    it('updates without note without creating Interaction', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue({
            id: 'l1', assigned_agent_id: 'a1', tenant_id: 't1', contact_phone: '+919111111111',
        });
        (prisma.lead.update as any).mockResolvedValue({ id: 'l1', lifecycle_stage: 'negotiation' });

        const res = await request(app)
            .post('/webhooks/internal/tools/update-lead-status')
            .send({ caller: '+919958860411', lead_id: 'l1', stage: 'negotiation' });

        expect(res.status).toBe(200);
        expect(prisma.interaction.create).not.toHaveBeenCalled();
    });

    it('returns 404 when lead not found', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue(null);
        const res = await request(app)
            .post('/webhooks/internal/tools/update-lead-status')
            .send({ caller: '+919958860411', lead_id: 'missing', stage: 'negotiation' });
        expect(res.status).toBe(404);
    });

    it('rejects when employee does not own the lead', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue({
            id: 'l1', assigned_agent_id: 'other', tenant_id: 't1', contact_phone: '+919111111111',
        });
        const res = await request(app)
            .post('/webhooks/internal/tools/update-lead-status')
            .send({ caller: '+919958860411', lead_id: 'l1', stage: 'negotiation' });
        expect(res.status).toBe(403);
    });
});

describe('GET /webhooks/internal/tools/lead-history', () => {
    const rohan = {
        id: 'a1', name: 'Rohan', phone: '+919958860411', email: 'rohan@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1', status: 'active',
    };
    beforeEach(() => (prisma.agent.findFirst as any).mockResolvedValue(rohan));

    it('rejects missing lead_id', async () => {
        const res = await request(app).get('/webhooks/internal/tools/lead-history?caller=%2B919958860411');
        expect(res.status).toBe(400);
    });

    it('returns recent interactions for the lead contact, max 10', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue({
            id: 'l1', contact_phone: '+919111111111', assigned_agent_id: 'a1', tenant_id: 't1',
        });
        (prisma.interaction.findMany as any).mockResolvedValue([
            { id: 'i1', channel: 'whatsapp', direction: 'inbound', event_type: 'message', content: 'hi', created_at: new Date() },
            { id: 'i2', channel: 'voice', direction: 'internal', event_type: 'note', content: '[note]', created_at: new Date() },
        ]);
        const res = await request(app).get('/webhooks/internal/tools/lead-history?caller=%2B919958860411&lead_id=l1');
        expect(res.status).toBe(200);
        expect(res.body.history).toHaveLength(2);
        expect(prisma.interaction.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { phone_number: '+919111111111' },
            take: 10,
        }));
    });

    it('returns 404 when lead not found', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue(null);
        const res = await request(app).get('/webhooks/internal/tools/lead-history?caller=%2B919958860411&lead_id=missing');
        expect(res.status).toBe(404);
    });

    it('rejects when employee does not own the lead', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue({
            id: 'l1', contact_phone: '+919111111111', assigned_agent_id: 'other', tenant_id: 't1',
        });
        const res = await request(app).get('/webhooks/internal/tools/lead-history?caller=%2B919958860411&lead_id=l1');
        expect(res.status).toBe(403);
    });
});

describe('POST /webhooks/internal/tools/mark-task-done', () => {
    const rohan = {
        id: 'a1', name: 'Rohan', phone: '+919958860411', email: 'rohan@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1', status: 'active',
    };
    beforeEach(() => (prisma.agent.findFirst as any).mockResolvedValue(rohan));

    it('rejects missing task_id', async () => {
        const res = await request(app)
            .post('/webhooks/internal/tools/mark-task-done')
            .send({ caller: '+919958860411' });
        expect(res.status).toBe(400);
    });

    it('updates status to completed and sets executed_at', async () => {
        (prisma.taskFollowup.findUnique as any).mockResolvedValue({
            id: 't1', phone_number: '+919111111111', tenant_id: 't1', status: 'pending',
            contact: { assigned_agent_id: 'a1', tenant_id: 't1' },
        });
        (prisma.taskFollowup.update as any).mockResolvedValue({ id: 't1', status: 'completed' });
        (prisma.interaction.create as any).mockResolvedValue({ id: 'i99' });

        const res = await request(app)
            .post('/webhooks/internal/tools/mark-task-done')
            .send({ caller: '+919958860411', task_id: 't1', outcome_note: 'Client not interested' });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(prisma.taskFollowup.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 't1' },
            data: expect.objectContaining({ status: 'completed', executed_at: expect.any(Date) }),
        }));
    });

    it('returns 404 when task not found', async () => {
        (prisma.taskFollowup.findUnique as any).mockResolvedValue(null);
        const res = await request(app)
            .post('/webhooks/internal/tools/mark-task-done')
            .send({ caller: '+919958860411', task_id: 'missing' });
        expect(res.status).toBe(404);
    });

    it('rejects when task contact is not assigned to the employee', async () => {
        (prisma.taskFollowup.findUnique as any).mockResolvedValue({
            id: 't1', phone_number: '+919111111111', status: 'pending',
            contact: { assigned_agent_id: 'other' },
        });
        const res = await request(app)
            .post('/webhooks/internal/tools/mark-task-done')
            .send({ caller: '+919958860411', task_id: 't1' });
        expect(res.status).toBe(403);
    });
});

describe('GET /webhooks/internal/tools/unassigned-leads', () => {
    const employee = {
        id: 'e1', name: 'Rohan', phone: '+919958860411', email: 'r@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1', status: 'active',
    };
    const manager = { ...employee, id: 'm1', name: 'Sanjay', role: 'manager', phone: '+919000000001' };

    it('employee is denied (403) — manager-only tool', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(employee);
        const res = await request(app).get('/webhooks/internal/tools/unassigned-leads?caller=%2B919958860411');
        expect(res.status).toBe(403);
    });

    it('manager receives list of leads with assigned_agent_id=null, tenant-scoped', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(manager);
        (prisma.lead.findMany as any).mockResolvedValue([
            { id: 'l1', contact_phone: '+919111111111', intent: 'buy', preferred_location: 'Dwarka',
              budget_min: 5000000, budget_max: 8000000, demand_main_category: 'residential',
              created_at: new Date(), contact: { name: 'A' } },
        ]);
        const res = await request(app).get('/webhooks/internal/tools/unassigned-leads?caller=%2B919000000001');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.leads).toHaveLength(1);
        const callArgs = (prisma.lead.findMany as any).mock.calls[0][0];
        expect(callArgs.where.assigned_agent_id).toBeNull();
        expect(callArgs.where.tenant_id).toBe('t1');
    });

    it('applies location filter when provided', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(manager);
        (prisma.lead.findMany as any).mockResolvedValue([]);
        await request(app).get('/webhooks/internal/tools/unassigned-leads?caller=%2B919000000001&location=Dwarka');
        const callArgs = (prisma.lead.findMany as any).mock.calls[0][0];
        expect(callArgs.where.preferred_location).toEqual({ contains: 'Dwarka', mode: 'insensitive' });
    });

    it('caps take at 20 by default, 50 max', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(manager);
        (prisma.lead.findMany as any).mockResolvedValue([]);

        await request(app).get('/webhooks/internal/tools/unassigned-leads?caller=%2B919000000001');
        expect((prisma.lead.findMany as any).mock.calls[0][0].take).toBe(20);

        (prisma.lead.findMany as any).mockClear();
        await request(app).get('/webhooks/internal/tools/unassigned-leads?caller=%2B919000000001&limit=9999');
        expect((prisma.lead.findMany as any).mock.calls[0][0].take).toBe(50);
    });
});

describe('POST /webhooks/internal/tools/reassign-lead', () => {
    const employee = {
        id: 'e1', name: 'Rohan', phone: '+919958860411', email: 'r@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1', status: 'active',
    };
    const manager = { ...employee, id: 'm1', name: 'Sanjay', role: 'manager', phone: '+919000000001' };
    const superBoss = { ...employee, id: 's1', name: 'Puneet', role: 'super_boss', phone: '+919958860411' };

    it('employee denied', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(employee);
        const res = await request(app)
            .post('/webhooks/internal/tools/reassign-lead')
            .send({ caller: '+919958860411', lead_id: 'l1', new_agent_id: 'e2' });
        expect(res.status).toBe(403);
    });

    it('rejects missing params', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(manager);
        const res = await request(app)
            .post('/webhooks/internal/tools/reassign-lead')
            .send({ caller: '+919000000001', lead_id: 'l1' });
        expect(res.status).toBe(400);
    });

    it('manager can reassign to a subordinate', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(manager);
        (prisma.lead.findUnique as any).mockResolvedValue({ id: 'l1', tenant_id: 't1', assigned_agent_id: 'e1' });
        (prisma.agent.findMany as any).mockResolvedValue([{ id: 'e2' }]); // subordinate lookup
        (prisma.lead.update as any).mockResolvedValue({ id: 'l1', assigned_agent_id: 'e2' });

        const res = await request(app)
            .post('/webhooks/internal/tools/reassign-lead')
            .send({ caller: '+919000000001', lead_id: 'l1', new_agent_id: 'e2' });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(prisma.lead.update).toHaveBeenCalledWith({
            where: { id: 'l1' },
            data: { assigned_agent_id: 'e2' },
        });
    });

    it('manager cannot reassign to agent outside their team', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(manager);
        (prisma.lead.findUnique as any).mockResolvedValue({ id: 'l1', tenant_id: 't1', assigned_agent_id: 'e1' });
        (prisma.agent.findMany as any).mockResolvedValue([]); // no subordinates match new_agent_id

        const res = await request(app)
            .post('/webhooks/internal/tools/reassign-lead')
            .send({ caller: '+919000000001', lead_id: 'l1', new_agent_id: 'stranger' });
        expect(res.status).toBe(403);
    });

    it('super_boss can reassign to anyone in tenant', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(superBoss);
        (prisma.lead.findUnique as any).mockResolvedValue({ id: 'l1', tenant_id: 't1', assigned_agent_id: 'e1' });
        // Implementation skips team check for super_boss — single findFirst call via resolveCaller.
        (prisma.lead.update as any).mockResolvedValue({ id: 'l1', assigned_agent_id: 'e99' });

        const res = await request(app)
            .post('/webhooks/internal/tools/reassign-lead')
            .send({ caller: '+919958860411', lead_id: 'l1', new_agent_id: 'e99' });
        expect(res.status).toBe(200);
    });

    it('returns 404 if lead does not exist', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(manager);
        (prisma.lead.findUnique as any).mockResolvedValue(null);
        const res = await request(app)
            .post('/webhooks/internal/tools/reassign-lead')
            .send({ caller: '+919000000001', lead_id: 'missing', new_agent_id: 'e2' });
        expect(res.status).toBe(404);
    });
});

describe('GET /webhooks/internal/tools/team-performance', () => {
    const employee = {
        id: 'e1', name: 'Rohan', phone: '+919958860411', email: 'r@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1', status: 'active',
    };
    const manager = { ...employee, id: 'm1', name: 'Sanjay', role: 'manager', phone: '+919000000001' };

    it('employee denied (403)', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(employee);
        const res = await request(app).get('/webhooks/internal/tools/team-performance?caller=%2B919958860411');
        expect(res.status).toBe(403);
    });

    it('manager sees per-agent counts for own team', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(manager);
        (prisma.agent.findMany as any).mockResolvedValue([
            { id: 'm1', name: 'Sanjay' },
            { id: 'e1', name: 'Rohan' },
            { id: 'e2', name: 'Priya' },
        ]);
        (prisma.lead.count as any).mockResolvedValue(5);
        (prisma.appointment.count as any).mockResolvedValue(2);

        const res = await request(app).get('/webhooks/internal/tools/team-performance?caller=%2B919000000001&period=today');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.team).toHaveLength(3);
        expect(res.body.team[0]).toMatchObject({ agent_id: expect.any(String), leads: 5, appointments: 2 });
    });
});

describe('GET /webhooks/internal/tools/pipeline-overview', () => {
    const employee = {
        id: 'e1', name: 'Rohan', phone: '+919958860411', email: 'r@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1', status: 'active',
    };
    const manager = { ...employee, id: 'm1', name: 'Sanjay', role: 'manager', phone: '+919000000001' };

    it('employee denied (403)', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(employee);
        const res = await request(app).get('/webhooks/internal/tools/pipeline-overview?caller=%2B919958860411');
        expect(res.status).toBe(403);
    });

    it('manager sees stage counts for own team', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(manager);
        (prisma.agent.findMany as any).mockResolvedValue([{ id: 'm1' }, { id: 'e1' }]);
        (prisma.lead.groupBy as any).mockResolvedValue([
            { lifecycle_stage: 'new', _count: { id: 12 }, _sum: { budget_max: 600000000 } },
            { lifecycle_stage: 'site_visit_scheduled', _count: { id: 5 }, _sum: { budget_max: 250000000 } },
        ]);

        const res = await request(app).get('/webhooks/internal/tools/pipeline-overview?caller=%2B919000000001');
        expect(res.status).toBe(200);
        expect(res.body.stages).toHaveLength(2);
        expect(res.body.stages[0]).toMatchObject({ stage: 'new', count: 12 });

        // Verify team-scoped query
        const call = (prisma.lead.groupBy as any).mock.calls[0][0];
        expect(call.where.assigned_agent_id).toEqual({ in: ['m1', 'e1'] });
    });
});

describe('GET /webhooks/internal/tools/company-metrics', () => {
    const employee = {
        id: 'e1', name: 'Rohan', phone: '+919958860411', email: 'r@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1', status: 'active',
    };
    const manager = { ...employee, id: 'm1', name: 'Sanjay', role: 'manager', phone: '+919000000001' };
    const superBoss = { ...employee, id: 's1', name: 'Puneet', role: 'super_boss', phone: '+919958860411' };

    it('employee denied (403)', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(employee);
        const res = await request(app).get('/webhooks/internal/tools/company-metrics?caller=%2B919958860411');
        expect(res.status).toBe(403);
    });

    it('manager denied (403)', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(manager);
        const res = await request(app).get('/webhooks/internal/tools/company-metrics?caller=%2B919000000001');
        expect(res.status).toBe(403);
    });

    it('super_boss gets counts + deal value aggregation', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(superBoss);
        (prisma.lead.count as any).mockResolvedValue(42);
        (prisma.transaction.count as any).mockResolvedValue(3);
        (prisma.transaction.aggregate as any).mockResolvedValue({ _sum: { final_price: 12500000 } });
        (prisma.agent.findMany as any).mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);

        const res = await request(app).get('/webhooks/internal/tools/company-metrics?caller=%2B919958860411&period=week');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.metrics).toMatchObject({
            new_leads: 42,
            deals_closed: 3,
            deals_closed_value: 12500000,
            active_agents: 2,
        });
    });
});

describe('GET /webhooks/internal/tools/stuck-deals', () => {
    const employee = {
        id: 'e1', name: 'Rohan', phone: '+919958860411', email: 'r@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1', status: 'active',
    };
    const manager = { ...employee, id: 'm1', name: 'Sanjay', role: 'manager', phone: '+919000000001' };

    it('employee denied (403)', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(employee);
        const res = await request(app).get('/webhooks/internal/tools/stuck-deals?caller=%2B919958860411');
        expect(res.status).toBe(403);
    });

    it('manager gets stuck transactions older than 10 days (default)', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(manager);
        (prisma.agent.findMany as any).mockResolvedValue([{ id: 'm1' }, { id: 'e1' }]);
        (prisma.transaction.findMany as any).mockResolvedValue([
            {
                id: 'tx1', status: 'NEGOTIATION', final_price: 6000000,
                demand_contact_id: '+919111111111', updated_at: new Date(Date.now() - 15 * 24 * 3600 * 1000),
                coordinator_agent_id: 'e1',
            },
        ]);

        const res = await request(app).get('/webhooks/internal/tools/stuck-deals?caller=%2B919000000001');
        expect(res.status).toBe(200);
        expect(res.body.deals).toHaveLength(1);
        expect(res.body.deals[0].days_stuck).toBeGreaterThanOrEqual(15);
        const call = (prisma.transaction.findMany as any).mock.calls[0][0];
        expect(call.where.coordinator_agent_id.in).toEqual(['m1', 'e1']);
        // terminal states excluded
        expect(call.where.status).toEqual({ notIn: ['CLOSED_WON', 'CLOSED_LOST'] });
    });

    it('respects custom days=5 param', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(manager);
        (prisma.agent.findMany as any).mockResolvedValue([{ id: 'm1' }]);
        (prisma.transaction.findMany as any).mockResolvedValue([]);

        await request(app).get('/webhooks/internal/tools/stuck-deals?caller=%2B919000000001&days=5');
        const call = (prisma.transaction.findMany as any).mock.calls[0][0];
        // updated_at before 5 days ago — lte should be within last minute of 5 days ago
        const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 3600 * 1000);
        expect(call.where.updated_at.lt).toBeInstanceOf(Date);
        expect(Math.abs(call.where.updated_at.lt.getTime() - fiveDaysAgo.getTime())).toBeLessThan(60000);
    });
});
