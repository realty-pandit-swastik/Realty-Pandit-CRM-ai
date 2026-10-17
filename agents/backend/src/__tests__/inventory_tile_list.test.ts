import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import prisma from '../db';
import inventoryRouter from '../routes/inventory';

vi.mock('../utils/team_scope', () => ({ getTeamIds: vi.fn().mockResolvedValue(['viewer']) }));

const app = express();
let role = 'super_boss';
app.use((req: any, _res, next) => {
    req.agent = { id: 'viewer', role, tenant_id: 'tenant-text-id' };
    next();
});
app.use('/inventory', inventoryRouter);

const listing = {
    id: 'property-1', tenant_id: 'tenant-text-id', ownership_type: 'OWNER',
    owner_phone: '+919000000001', contact: { name: 'Owner', client_role: 'FINANCER' },
    uploader_phone: '+919000000002', uploader_name: 'Uploader',
    key_holder_type: 'OWNER', key_holder_phone: null, key_holder_name: null,
    uploaded_by_agent_id: 'other', assigned_agent_id: 'other',
};

beforeEach(() => {
    vi.clearAllMocks();
    role = 'super_boss';
    vi.mocked(prisma.inventory.findMany).mockResolvedValue([listing] as any);
    vi.mocked(prisma.inventory.count).mockResolvedValue(1);
    Object.assign(prisma, { propertyShare: { groupBy: vi.fn().mockResolvedValue([]) } });
    (prisma.appointment as any).groupBy = vi.fn().mockImplementation(async (args: any) =>
        args._min ? [{ property_id: listing.id, _min: { scheduled_at: new Date('2026-12-01T10:00:00Z') } }] : []);
    (prisma.task as any).groupBy = vi.fn().mockResolvedValue([
        { property_id: listing.id, _min: { due_date: new Date('2026-10-01T10:00:00Z') } },
    ]);
    vi.mocked(prisma.$queryRaw).mockReset().mockResolvedValueOnce([]).mockResolvedValueOnce([
        { k: '9000000001', last_at: new Date('2026-09-01T10:00:00Z') },
    ]);
});

describe('inventory tile list metadata', () => {
    it('resolves the owner key holder and contact designation, and keeps an overdue task visible', async () => {
        const res = await request(app).get('/inventory');
        expect(res.status).toBe(200);
        expect(res.body.data[0]).toMatchObject({
            source: { name: 'Owner', designation: 'FINANCER', phone: listing.owner_phone },
            key_holder_name: 'Owner', key_holder_phone: listing.owner_phone,
            key_holder_designation: 'FINANCER',
            last_contacted_at: '2026-09-01T10:00:00.000Z',
            next_action_at: '2026-10-01T10:00:00.000Z',
        });
        const query = vi.mocked(prisma.$queryRaw).mock.calls[1];
        expect(query).toContain('tenant-text-id');
        expect((query[0] as TemplateStringsArray).join('')).not.toContain('::uuid');
        expect((prisma.task as any).groupBy).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ property: { tenant_id: 'tenant-text-id' }, completed_at: null }),
        }));
    });

    it('does not reattach protected key-holder data to a foreign staff viewer', async () => {
        role = 'employee';
        const res = await request(app).get('/inventory?all=true');
        expect(res.status).toBe(200);
        const row = res.body.data[0];
        expect(row.source.phone).toBeNull();
        expect(row.key_holder_phone).toBeUndefined();
        expect(row.key_holder_name).toBeUndefined();
        expect(row.key_holder_contact).toBeUndefined();
        expect(row.key_holder_designation).toBeNull();
        expect(row.last_contacted_at).toBeNull();
    });

    it('does not run activity queries for an empty page', async () => {
        vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
        vi.mocked(prisma.inventory.count).mockResolvedValue(0);
        const res = await request(app).get('/inventory');
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
        expect((prisma.task as any).groupBy).not.toHaveBeenCalled();
    });

    it('uses the upcoming appointment when no open property task exists', async () => {
        (prisma.task as any).groupBy.mockResolvedValue([]);
        const res = await request(app).get('/inventory');
        expect(res.status).toBe(200);
        expect(res.body.data[0].next_action_at).toBe('2026-12-01T10:00:00.000Z');
        expect((prisma.appointment as any).groupBy).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                tenant_id: 'tenant-text-id',
                status: { in: ['scheduled', 'confirmed', 'rescheduled'] },
                scheduled_at: { gte: expect.any(Date) },
            }),
        }));
    });

    it('hydrates an external key-holder relation and batches activity across multiple tiles', async () => {
        vi.mocked(prisma.inventory.findMany).mockResolvedValue([
            listing,
            { ...listing, id: 'property-2', key_holder_type: 'EXTERNAL',
                key_holder_contact: { name: 'Linked key holder', phone_number: '+919000000003', client_role: 'CHOKIDAR' } },
        ] as any);
        const res = await request(app).get('/inventory');
        expect(res.status).toBe(200);
        expect(res.body.data[1]).toMatchObject({
            key_holder_name: 'Linked key holder', key_holder_phone: '+919000000003', key_holder_designation: 'CHOKIDAR',
        });
        expect((prisma.task as any).groupBy).toHaveBeenCalledTimes(1);
        expect((prisma.appointment as any).groupBy).toHaveBeenCalledTimes(2);
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('ignores stale external key-holder fields after switching to owner or uploader', async () => {
        vi.mocked(prisma.inventory.findMany).mockResolvedValue([
            { ...listing, key_holder_name: 'Former holder', key_holder_phone: '+919000000009' },
            { ...listing, id: 'property-2', key_holder_type: 'UPLOADER', key_holder_name: 'Former holder', key_holder_phone: '+919000000009' },
        ] as any);
        const res = await request(app).get('/inventory');
        expect(res.status).toBe(200);
        expect(res.body.data[0]).toMatchObject({ key_holder_name: 'Owner', key_holder_phone: listing.owner_phone });
        expect(res.body.data[1]).toMatchObject({ key_holder_name: 'Uploader', key_holder_phone: listing.uploader_phone, key_holder_designation: 'Agent' });
    });
});
