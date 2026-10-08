import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import prisma from '../db';

// The owner railguard + Owner-record creation hit Agent/Owner/Tenant tables that the shared
// Prisma test mock does not model; stub ensureOwner so these tests assert the ROUTE's
// owner-contact handling (phone normalisation, name sync, persistence, rejection).
vi.mock('../services/ensure_owner', () => ({ ensureOwner: vi.fn().mockResolvedValue('owner-1') }));
// Catalog/broadcast side effects are covered by their own suites.
vi.mock('../services/catalog', () => ({ upsertCatalogProduct: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/inventory_broadcast', () => ({
    broadcastInventoryToQualifiedDeals: vi.fn().mockResolvedValue(undefined),
    broadcastNewInventoryToTeam: vi.fn().mockResolvedValue(undefined),
}));

import inventoryRouter from '../routes/inventory';

const app = express();
app.use(express.json());
let role = 'super_boss';
app.use((req: any, _res, next) => {
    req.agent = { id: 'boss-1', name: 'Boss', role, tenant_id: 'tenant-1' };
    next();
});
app.use('/api/inventory', inventoryRouter);

const INV_ID = 'inv-1';
const OLD_OWNER = '+919000000001';
const NEW_OWNER = '+919000000002';

const EXISTING: any = {
    id: INV_ID,
    tenant_id: 'tenant-1',
    status: 'active',
    upload_source: 'manual',
    owner_phone: OLD_OWNER,
    owner_contact_id: OLD_OWNER,
    uploader_phone: '+919000000009',
    uploader_name: 'Original Uploader',
    assigned_agent_id: 'staff-1',
    uploaded_by_agent_id: 'staff-1',
    specs: {},
};

beforeEach(() => {
    vi.clearAllMocks();
    role = 'super_boss';
    vi.mocked(prisma.inventory.findUnique).mockResolvedValue(EXISTING as any);
    // No active staff own a customer number by default → railguard passes.
    vi.mocked(prisma.agent.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.tenant.findFirst).mockResolvedValue({ id: 'tenant-1' } as any);
    vi.mocked(prisma.contact.update).mockResolvedValue({} as any);
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ name: 'New Owner Person' } as any);
        vi.mocked(prisma.inventory.update).mockImplementation((async ({ data }: any) => ({ ...EXISTING, ...data })) as any);
});

describe('PATCH /api/inventory/:id — owner contact change', () => {
    it('persists the new owner phone AND syncs the owner name onto the contact', async () => {
        const res = await request(app)
            .patch(`/api/inventory/${INV_ID}`)
            .send({ owner_phone: NEW_OWNER, owner_name: 'New Owner Person' });

        expect(res.status).toBe(200);

        // Phone normalized + persisted; name is NOT a column but must reach Contact.
        expect(vi.mocked(prisma.inventory.update).mock.calls[0][0]!.data).toMatchObject({
            owner_phone: NEW_OWNER,
            owner_contact_id: NEW_OWNER,
        });
        expect((vi.mocked(prisma.inventory.update).mock.calls[0][0]!.data as any).owner_name).toBeUndefined();
        expect(prisma.contact.update).toHaveBeenCalledWith({
            where: { phone_number: NEW_OWNER },
            data: { name: 'New Owner Person' },
        });
        // Response carries the resolved name so the open modal can refresh in place.
        expect(res.body.owner_name).toBe('New Owner Person');
    });

    it('leaves the uploader untouched (owner change is owner-only)', async () => {
        await request(app).patch(`/api/inventory/${INV_ID}`).send({ owner_phone: NEW_OWNER, owner_name: 'New Owner Person' });

        const data = vi.mocked(prisma.inventory.update).mock.calls[0][0]!.data as any;
        expect(data.uploader_phone).toBeUndefined();
        expect(data.uploader_name).toBeUndefined();
    });

    it('persists uploader_name when it IS sent (it is a real column)', async () => {
        const res = await request(app)
            .patch(`/api/inventory/${INV_ID}`)
            .send({ uploader_name: 'Corrected Uploader' });

        expect(res.status).toBe(200);
        expect(vi.mocked(prisma.inventory.update).mock.calls[0][0]!.data).toMatchObject({
            uploader_name: 'Corrected Uploader',
        });
    });

    it('never blanks an existing contact name when owner_name is omitted or empty', async () => {
        await request(app).patch(`/api/inventory/${INV_ID}`).send({ owner_phone: NEW_OWNER });
        expect(prisma.contact.update).not.toHaveBeenCalled();

        vi.clearAllMocks();
        vi.mocked(prisma.inventory.findUnique).mockResolvedValue(EXISTING as any);
        vi.mocked(prisma.agent.findMany).mockResolvedValue([] as any);
        vi.mocked(prisma.tenant.findFirst).mockResolvedValue({ id: 'tenant-1' } as any);
    vi.mocked(prisma.inventory.update).mockImplementation((async ({ data }: any) => ({ ...EXISTING, ...data })) as any);

        await request(app).patch(`/api/inventory/${INV_ID}`).send({ owner_phone: NEW_OWNER, owner_name: '   ' });
        expect(prisma.contact.update).not.toHaveBeenCalled();
    });

    it('rejects an active team member as owner with a coded error and writes nothing', async () => {
        vi.mocked(prisma.agent.findMany).mockResolvedValue([{ name: 'Rohan', phone: '9999999999' }] as any);

        const res = await request(app)
            .patch(`/api/inventory/${INV_ID}`)
            .send({ owner_phone: '+91 99999 99999', owner_name: 'Rohan' });

        expect(res.status).toBe(400);
        expect(res.body.error_code).toBe('OWNER_IS_TEAM_MEMBER');
        expect(prisma.inventory.update).not.toHaveBeenCalled();
        expect(prisma.contact.update).not.toHaveBeenCalled();
    });
});
