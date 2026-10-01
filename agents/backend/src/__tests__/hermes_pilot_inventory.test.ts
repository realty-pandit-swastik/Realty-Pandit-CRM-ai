import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import prisma from '../db';
import inventoryRouter from '../routes/inventory';

const app = express();
let role = 'employee';
app.use((req: any, _res, next) => {
  req.agent = { id: 'staff-1', role, tenant_id: 'tenant-1' };
  next();
});
app.use('/api/inventory', inventoryRouter);

beforeEach(() => {
  vi.clearAllMocks();
  role = 'employee';
});

describe('GET /api/inventory/hermes-pilot', () => {
  it('returns only tenant active listing fields', async () => {
    vi.mocked(prisma.inventory.findMany).mockResolvedValue([{ id: 'inv-1', status: 'active', locality: 'Sector 4' }] as any);
    vi.mocked(prisma.inventory.count).mockResolvedValue(1);
    vi.mocked(prisma.partnerAgent.findMany).mockResolvedValue([]);
    const res = await request(app).get('/api/inventory/hermes-pilot?page=1');
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('tenant_staff');
    expect(prisma.inventory.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenant_id: 'tenant-1', status: 'active',
        OR: expect.arrayContaining([{ uploaded_by_agent_id: { in: ['staff-1'] } }]),
      }),
      select: expect.not.objectContaining({ owner_phone: true }),
    }));
    expect(prisma.inventory.count).toHaveBeenCalledWith({ where: expect.objectContaining({ tenant_id: 'tenant-1', status: 'active' }) });
  });

  it('rejects partner access before querying inventory', async () => {
    role = 'partner';
    const res = await request(app).get('/api/inventory/hermes-pilot');
    expect(res.status).toBe(403);
    expect(prisma.inventory.findMany).not.toHaveBeenCalled();
  });
});
