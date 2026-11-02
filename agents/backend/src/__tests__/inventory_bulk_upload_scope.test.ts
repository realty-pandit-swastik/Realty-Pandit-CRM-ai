import { beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
vi.mock('../services/ensure_owner', () => ({ ensureOwner: vi.fn(async () => 'synthetic-owner') }));
vi.mock('../utils/inventory_id', () => ({ generateDisplayId: vi.fn(async () => 'SYNTHETIC-CSV') }));
import prisma from '../db';
import team from '../routes/team';
const app = express(); app.use((req: any, _res, next) => { req.agent = { id: 'synthetic-member', role: 'super_boss', tenant_id: 'synthetic-tenant' }; next(); }); app.use('/api/team', team);
beforeEach(() => { vi.clearAllMocks(); prisma.tenant.findUnique = vi.fn().mockResolvedValue({ id: 'synthetic-tenant' }); vi.mocked(prisma.contact.findUnique).mockResolvedValue(null); vi.mocked(prisma.inventory.create).mockResolvedValue({ id: 'synthetic-property' } as any); });
const upload = (csv: string) => request(app).post('/api/team/inventory/bulk-upload').attach('file', Buffer.from(csv), { filename: 'synthetic.csv', contentType: 'text/csv' });
it('uses actor tenant and normalized owner phone and rejects foreign contacts with row outcomes', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ tenant_id: 'foreign-tenant' } as any);
    const r = await upload('owner_phone,type,intent\n,flat,sell\n9000000091,flat,sell');
    expect(r.status).toBe(200); expect(r.body.imported).toBe(0); expect(r.body.skipped).toBe(2); expect(r.body.rows.map((x: { row: number; status: string }) => [x.row, x.status])).toEqual([[2, 'rejected'], [3, 'rejected']]);
    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({ where: { id: 'synthetic-tenant' } });
    expect(prisma.contact.findUnique).toHaveBeenCalledWith({ where: { phone_number: '+919000000091' }, select: { tenant_id: true } }); expect(prisma.contact.upsert).not.toHaveBeenCalled(); expect(prisma.inventory.create).not.toHaveBeenCalled();
});
it('converts CSV units once and stores the canonical raw-rupee price', async () => {
    const r = await upload('owner_phone,type,intent,price,price_unit\n9000000091,flat,sell,55,Lakh');
    expect(r.status).toBe(200); expect(r.body.imported).toBe(1); expect(r.body.rows).toEqual([{ row: 2, status: 'imported' }]);
    expect(prisma.inventory.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ price: 5500000, price_unit: null, tenant_id: 'synthetic-tenant' }) }));
});
it('reports malformed prices as rejected rows without creating properties', async () => {
    const r = await upload('owner_phone,type,intent,price,price_unit\n9000000091,flat,sell,55oops,Lakh');
    expect(r.body.skipped).toBe(1); expect(r.body.rows[0].status).toBe('rejected'); expect(prisma.inventory.create).not.toHaveBeenCalled(); expect(prisma.contact.upsert).not.toHaveBeenCalled();
});
