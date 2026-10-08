import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import prisma from '../db';
import leads from '../routes/leads';

const app = express();
app.use((req: any, _res, next) => {
    req.agent = { id: 'boss-1', role: 'super_boss', tenant_id: 'tenant-1' };
    next();
});
app.use('/api/leads', leads);

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.contact.findMany).mockResolvedValue([]);
    vi.mocked(prisma.contact.count).mockResolvedValue(0);
});

function searchGroup(where: any): any {
    // where.AND[0] is always the contact-type visibility group for this route.
    return where.AND[1];
}

describe('GET /api/leads/recent-external search', () => {
    it('ANDs name and qualifying phone fragments without touching visibility scoping', async () => {
        const res = await request(app).get('/api/leads/recent-external?search=Rahul%209958');
        expect(res.status).toBe(200);
        const where: any = vi.mocked(prisma.contact.findMany).mock.calls[0][0]?.where;
        expect(searchGroup(where)).toEqual({
            AND: [
                {
                    OR: [
                        { name: { contains: 'Rahul', mode: 'insensitive' } },
                        { email: { contains: 'Rahul', mode: 'insensitive' } },
                    ],
                },
                {
                    OR: [
                        { name: { contains: '9958', mode: 'insensitive' } },
                        { email: { contains: '9958', mode: 'insensitive' } },
                        { phone_number: { contains: '9958' } },
                        { phone_number: { contains: '+9958' } },
                    ],
                },
            ],
        });
    });

    it('uses indexed equality for a complete mobile number', async () => {
        const res = await request(app).get('/api/leads/recent-external?search=%2B919958804559');
        expect(res.status).toBe(200);
        const where: any = vi.mocked(prisma.contact.findMany).mock.calls[0][0]?.where;
        expect(searchGroup(where)).toEqual({
            OR: [
                { name: { contains: '+919958804559', mode: 'insensitive' } },
                { email: { contains: '+919958804559', mode: 'insensitive' } },
                { phone_number: { in: ['+919958804559', '919958804559', '9958804559'] } },
                { phone_number: { contains: '9958804559' } },
            ],
        });
    });

    it('leaves the list unfiltered for unproductive input', async () => {
        const res = await request(app).get('/api/leads/recent-external?search=a');
        expect(res.status).toBe(200);
        const where: any = vi.mocked(prisma.contact.findMany).mock.calls[0][0]?.where;
        expect(where.AND).toHaveLength(1);
    });
});
