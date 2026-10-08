import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../db', () => ({
    default: {
        inventory: { findUnique: vi.fn() },
        contact: { create: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
        partnerAgent: { findUnique: vi.fn() },
        transaction: { update: vi.fn() },
        agent: { findUnique: vi.fn(), findFirst: vi.fn() },
        $transaction: vi.fn(),
    },
}));

// Staff agent: the route reads req.agent.tenant_id / req.agent.id throughout.
vi.mock('../middleware/auth', () => ({
    authMiddleware: (req: any, _res: any, next: any) => {
        req.agent = { id: 'agent-1', name: 'Rohan', role: 'employee', tenant_id: 't1' };
        next();
    },
    checkPermission: () => (_req: any, _res: any, next: any) => next(),
    requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../services/inventory_to_demand', () => ({
    buildDemandFromInventory: vi.fn().mockReturnValue({
        intent: 'buy', preferred_location: 'Vaishali', preferred_lat: null, preferred_lng: null,
        budget_min: 2800000, budget_max: 3100000, demand_bhk: '2',
        category_id: null, sub_category_id: null, type_id: null, demand_taxonomy_node_id: null,
    }),
}));
vi.mock('../services/ensure_deal', () => ({
    ensureDealForLead: vi.fn().mockResolvedValue({ dealId: 'deal-1', created: true }),
}));
vi.mock('../services/partner_auto_create', () => ({
    ensurePartnerAgent: vi.fn().mockResolvedValue({ partnerId: 'pa-1', partnerPhone: '+919812345678', wasCreated: false }),
}));
vi.mock('../services/partner_notifications', () => ({
    sendPartnerWelcomeWhatsApp: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../services/lead_notifications', () => ({
    sendBuyerConfirmationWhatsApp: vi.fn().mockResolvedValue(undefined),
    sendBuyerConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));

import prisma from '../db';
import inventoryRouter from '../routes/inventory';

const INV_ID = 'inv-1';

function app() {
    const a = express();
    a.use(express.json());
    a.use('/api/inventory', inventoryRouter);
    return a;
}

const INV = {
    id: INV_ID, intent: 'SALE', type: 'flat', category_id: null, sub_category_id: null,
    type_id: null, taxonomy_node_id: null, specs: {}, locality: 'Vaishali', city: 'Ghaziabad',
    location: 'Vaishali, Ghaziabad', display_price: null, price: 3000000, customer_price: null,
    latitude: null, longitude: null,
};

beforeEach(() => {
    vi.clearAllMocks();
    (prisma.inventory.findUnique as any).mockResolvedValue({ ...INV });
    (prisma.contact.create as any).mockResolvedValue({ phone_number: 'PENDING-x' });
    (prisma.contact.findUnique as any).mockResolvedValue(null);
    (prisma.contact.upsert as any).mockResolvedValue({ phone_number: '+919665996176' });
    (prisma.partnerAgent.findUnique as any).mockResolvedValue({ managing_agent_id: 'agent-1' });
    (prisma.transaction.update as any).mockResolvedValue({});
});

// Primary client role (Contact.client_role) — who the person IS, independent of contact_type
// (which stays load-bearing for queues/visibility). share-add-lead is the one creation path that
// KNOWS the answer, so it stamps CLIENT on create. Updates must never overwrite it.
describe('POST /api/inventory/share/add-lead — client_role', () => {
    it('partner branch: the on-behalf buyer is created as CLIENT', async () => {
        const res = await request(app()).post('/api/inventory/share/add-lead').send({
            phone: '9812345678', name: 'Sunny', role: 'partner', inventory_id: INV_ID,
        });

        expect(res.status).toBe(200);
        expect((prisma.contact.create as any)).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ client_role: 'CLIENT', contact_type: 'BUYER' }),
            }),
        );
    });

    it('direct branch: a new shared-to buyer is created as CLIENT', async () => {
        const res = await request(app()).post('/api/inventory/share/add-lead').send({
            phone: '9665996176', name: 'Arshan', role: 'direct', inventory_id: INV_ID,
        });

        expect(res.status).toBe(200);
        expect((prisma.contact.upsert as any)).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({ client_role: 'CLIENT' }),
            }),
        );
    });

    it('direct branch: an existing contact keeps its primary role on update', async () => {
        (prisma.contact.findUnique as any).mockResolvedValue({
            phone_number: '+919665996176', name: 'Arshan', client_role: 'BUILDER',
        });

        const res = await request(app()).post('/api/inventory/share/add-lead').send({
            phone: '9665996176', name: 'Arshan', role: 'direct', inventory_id: INV_ID,
        });

        expect(res.status).toBe(200);
        const { update } = (prisma.contact.upsert as any).mock.calls[0][0];
        expect(update.client_role).toBeUndefined();
    });
});