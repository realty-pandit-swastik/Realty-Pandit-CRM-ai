import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../utils/demand_taxonomy', () => ({ resolveDemandTaxonomy: vi.fn().mockResolvedValue({ demand_taxonomy_node_id: 'flat-node', category_id: 'res', sub_category_id: 'flat', type_id: null, needs_review: false, demand_schema_values: { bhk: 3 } }) }));
import prisma from '../db';
import { HarvestError, harvestedOwnerOutreachAllowed, ingestPortalListing } from '../services/portal_harvest';
const actor = { tenant_id: 't1', id: 'a1' };
const listing = { source: 'magicbricks', source_ref: 'external-123', seller_phone: '9876543210', property_type: 'flat', city: 'Noida', price: 125, price_unit: 'Lakh', specs: { bedrooms: 3 }, features: { facing: 'North' } };
let tx: any;
beforeEach(() => {
    vi.clearAllMocks();
    tx = { $queryRaw: vi.fn().mockResolvedValue([]),
        portalListing: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'candidate' }), update: vi.fn() },
        contact: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'contact', phone_number: '+919876543210', tenant_id: 't1' }) },
        agent: { findFirst: vi.fn().mockResolvedValue(null) }, owner: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'owner' }) },
        inventory: { create: vi.fn().mockResolvedValue({ id: 'inventory', display_id: 'RP-NOI-RES-20002' }), findUnique: vi.fn().mockResolvedValue({ id: 'inventory', display_id: 'RP-NOI-RES-20002' }) },
        task: { create: vi.fn().mockResolvedValue({ id: 'task' }) },
    };
    (prisma as any).$transaction = vi.fn(async (fn: any) => fn(tx));
    (prisma as any).portalListing = { findFirst: vi.fn().mockResolvedValue(null) };
});
describe('transactional harvest', () => {
    it('creates owner relationships, canonical specs/rupees, one human verification task; no dropped columns', async () => {
        const result = await ingestPortalListing(listing, actor);
        expect(result.status).toBe('PENDING_VERIFICATION');
        const data = tx.inventory.create.mock.calls[0][0].data;
        expect(data).toMatchObject({ owner_id: 'owner', owner_phone: '+919876543210', apartment_name: null, category: 'residential', taxonomy_node_id: 'flat-node', price: 12500000, price_unit: 'INR', status: 'pending_approval', specs: { bhk: 3, facing: 'North' } });
        for (const dropped of ['source_ref', 'owner_name', 'society_name', 'features']) expect(data).not.toHaveProperty(dropped);
        expect(tx.task.create).toHaveBeenCalledTimes(1); expect(tx.task.create.mock.calls[0][0].data).not.toHaveProperty('tenant_id');
        expect(tx.portalListing.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ inventory_id: 'inventory', verification_task_id: 'task' }) }));
        expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    });
    it('retains no-contact public listings as candidates without invented CRM identity', async () => {
        const { seller_phone, ...withoutPhone } = listing;
        const result = await ingestPortalListing(withoutPhone, actor);
        expect(result.status).toBe('CANDIDATE'); expect(tx.contact.create).not.toHaveBeenCalled(); expect(tx.inventory.create).not.toHaveBeenCalled(); expect(tx.task.create).not.toHaveBeenCalled();
    });
    it('serial identity lock precedes duplicate lookup and does not duplicate task/inventory', async () => {
        tx.portalListing.findUnique.mockResolvedValue({ id: 'candidate', inventory_id: 'inventory', status: 'PENDING_VERIFICATION' });
        const result = await ingestPortalListing(listing, actor);
        expect(result.duplicate).toBe(true); expect(tx.inventory.create).not.toHaveBeenCalled(); expect(tx.task.create).not.toHaveBeenCalled();
        expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.portalListing.findUnique.mock.invocationCallOrder[0]);
        expect(tx.portalListing.findUnique.mock.calls[0][0].where.tenant_id_source_external_id).toEqual({ tenant_id: 't1', source: 'magicbricks', external_id: 'external-123' });
    });
    it('refreshes candidate observations without replacing staff inventory edits or losing assignment', async () => {
        tx.portalListing.findUnique.mockResolvedValue({ id: 'candidate', inventory_id: null, status: 'CANDIDATE', payload: { _ingested_by: 'original-staff' } });
        const { seller_phone, ...data } = listing;
        const result = await ingestPortalListing({ ...data, price: 130 }, actor);
        expect(result.duplicate).toBe(true);
        expect(tx.portalListing.update.mock.calls[0][0].data).toMatchObject({ payload: { price: 130, _ingested_by: 'original-staff' } });
        expect(tx.inventory.create).not.toHaveBeenCalled();
    });
    it('refuses foreign-tenant global seller identity and rolls transaction failure outward', async () => {
        tx.contact.findFirst.mockResolvedValue({ phone_number: '+919876543210', tenant_id: 'foreign' });
        await expect(ingestPortalListing(listing, actor)).rejects.toMatchObject({ status: 409 });
        expect(tx.inventory.create).not.toHaveBeenCalled();
    });
    it('task failure rejects ingestion instead of acknowledging partial progress', async () => {
        tx.task.create.mockRejectedValue(new Error('task unavailable'));
        await expect(ingestPortalListing(listing, actor)).rejects.toThrow('task unavailable'); expect(tx.portalListing.update).not.toHaveBeenCalled();
    });
    it('rejects invalid phone and missing external identity before transaction', async () => {
        await expect(ingestPortalListing({ ...listing, seller_phone: 'unknown' }, actor)).rejects.toBeInstanceOf(HarvestError);
        await expect(ingestPortalListing({ ...listing, source_ref: '' }, actor)).rejects.toMatchObject({ status: 400 });
        expect((prisma as any).$transaction).not.toHaveBeenCalled();
    });
    it('does not assume an unverified harvested owner can receive automatic outreach', async () => {
        (prisma as any).portalListing.findFirst.mockResolvedValue({ id: 'candidate' });
        expect(await harvestedOwnerOutreachAllowed('t1', '9876543210')).toBe(false);
        expect((prisma as any).portalListing.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenant_id: 't1', owner_call_verified_at: null }) }));
    });
});
