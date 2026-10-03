import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import prisma from '../db';
import staffCallsRouter from '../routes/staff_calls';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
    req.agent = { id: 'staff-1', role: 'employee', tenant_id: 'tenant-1' };
    next();
});
app.use('/api/calls', staffCallsRouter);

beforeEach(() => {
    vi.clearAllMocks();
});

describe('GET /api/calls/caller-id', () => {
    it('returns found: false when phone does not exist in CRM', async () => {
        vi.mocked(prisma.contact.findFirst).mockResolvedValue(null);

        const res = await request(app).get('/api/calls/caller-id?phone=9999900000');
        expect(res.status).toBe(200);
        expect(res.body.found).toBe(false);
        expect(res.body.phone_number).toBe('+919999900000');
    });

    it('returns full caller dossier when contact exists', async () => {
        const mockContact = {
            id: 'c-1',
            phone_number: '9876543210',
            name: 'Rahul Sharma',
            contact_type: 'BUYER',
            intent: 'buy',
            property_type: 'flat',
            budget_min: 80,
            budget_max: 120,
            preferred_location: 'Whitefield',
            ai_summary: 'Looking for 3BHK in gated community',
            assigned_agent: { id: 'agent-1', name: 'Agent Amit', phone: '9876500001', role: 'employee' },
            last_channel: 'staff_call',
            last_interaction: new Date(),
        };

        const mockDeals = [
            {
                id: 'deal-1',
                status: 'NEW',
                source: 'magicbricks',
                source_ref: 'prop-101',
                type: 'BUY',
                demand_intent: 'buy',
                demand_location: 'Whitefield',
                demand_budget_min: 80,
                demand_budget_max: 120,
                coordinator_agent: { id: 'agent-1', name: 'Agent Amit' },
                created_at: new Date(),
            },
        ];

        const mockInteractions = [
            {
                id: 'int-1',
                event_type: 'call',
                direction: 'inbound',
                channel: 'staff_call',
                content: 'Inquired about 3BHK availability',
                created_at: new Date(),
            },
        ];

        const mockShortages = [
            {
                id: 'sh-1',
                deal_id: 'deal-1',
                area: 'Whitefield',
                match_count: 1,
                status: 'OPEN',
            },
        ];

        vi.mocked(prisma.contact.findFirst).mockResolvedValue(mockContact as any);
        vi.mocked(prisma.transaction.findMany).mockResolvedValue(mockDeals as any);
        vi.mocked(prisma.interaction.findMany).mockResolvedValue(mockInteractions as any);
        vi.mocked(prisma.shortageEntry.findMany).mockResolvedValue(mockShortages as any);

        const res = await request(app).get('/api/calls/caller-id?phone=+91-98765-43210');
        expect(res.status).toBe(200);
        expect(res.body.found).toBe(true);
        expect(res.body.contact.name).toBe('Rahul Sharma');
        expect(res.body.contact.phone_number).toBe('9876543210');
        expect(res.body.contact.assigned_agent.name).toBe('Agent Amit');
        expect(res.body.deals).toHaveLength(1);
        expect(res.body.deals[0].source_ref).toBe('prop-101');
        expect(res.body.interactions).toHaveLength(1);
        expect(res.body.shortages).toHaveLength(1);
    });
});
