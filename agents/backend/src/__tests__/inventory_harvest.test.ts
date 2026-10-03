import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import prisma from '../db';
import inventoryRouter from '../routes/inventory';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
    req.agent = { id: 'staff-1', role: 'employee', tenant_id: 'tenant-1' };
    next();
});
app.use('/api/inventory', inventoryRouter);

beforeEach(() => {
    vi.clearAllMocks();
});

describe('POST /api/inventory/harvest', () => {
    it('rejects request when seller_phone is missing', async () => {
        const res = await request(app).post('/api/inventory/harvest').send({
            source: '99acres',
            property_title: '3BHK Villa',
        });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('seller_phone');
    });

    it('rejects duplicate external listing source_ref', async () => {
        vi.mocked(prisma.inventory.findFirst).mockResolvedValue({
            id: 'inv-existing',
            display_id: 'RP-BLR-RES-20001',
            status: 'pending_approval',
        } as any);

        const res = await request(app).post('/api/inventory/harvest').send({
            source: '99acres',
            source_ref: '99acres-listing-12345',
            seller_phone: '9876543210',
            seller_name: 'Property Owner',
        });
        expect(res.status).toBe(409);
        expect(res.body.error).toContain('already harvested');
    });

    it('creates contact, inventory, and verification task on valid harvested listing', async () => {
        vi.mocked(prisma.inventory.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.contact.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.contact.create).mockResolvedValue({
            id: 'c-owner-1',
            phone_number: '+919876543210',
            name: 'Sunil Verma',
        } as any);
        vi.mocked(prisma.inventory.create).mockResolvedValue({
            id: 'inv-harvested-1',
            display_id: 'RP-BLR-RES-20002',
            status: 'pending_approval',
            upload_source: 'portal_crawl',
        } as any);
        (prisma as any).task = { create: vi.fn().mockResolvedValue({ id: 'task-1' }) };

        const res = await request(app).post('/api/inventory/harvest').send({
            source: 'magicbricks',
            source_ref: 'mb-987654',
            seller_name: 'Sunil Verma',
            seller_phone: '9876543210',
            property_title: '3BHK Luxury Apartment',
            property_type: 'flat',
            intent: 'sell',
            price: 12500000,
            locality: 'Whitefield',
            city: 'Bengaluru',
            description: 'North facing 3BHK flat near ITPL',
        });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.inventory_id).toBe('inv-harvested-1');
        expect(res.body.display_id).toBe('RP-BLR-RES-20002');
        expect(res.body.contact_id).toBe('c-owner-1');
        expect(prisma.contact.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                phone_number: '+919876543210',
                contact_type: 'LANDLORD',
                source: 'magicbricks',
            }),
        }));
        expect(prisma.inventory.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                upload_source: 'portal_crawl',
                status: 'pending_approval',
                source_ref: 'mb-987654',
            }),
        }));
    });
});
