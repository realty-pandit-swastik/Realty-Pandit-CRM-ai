import { describe, it, expect, vi, beforeEach } from 'vitest';

// ensureDealForLead pulls in assignment + qualification + google-sync; stub them so the unit test
// stays focused on the idempotency decision.
vi.mock('../db', () => ({
    default: {
        contact: { findUnique: vi.fn(), update: vi.fn() },
        transaction: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
        task: { create: vi.fn() },
    },
}));
vi.mock('../services/lead_assignment', () => ({
    assignViaRoundRobin: vi.fn().mockResolvedValue('agent-1'),
    assignViaManagerRoundRobin: vi.fn().mockResolvedValue('agent-1'),
}));
vi.mock('../services/lead_qualification_caller', () => ({ scheduleQualificationCall: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/google_sync', () => ({ pushReminderToGoogle: vi.fn().mockResolvedValue(undefined) }));

import prisma from '../db';
import { ensureDealForLead } from '../services/ensure_deal';

beforeEach(() => vi.clearAllMocks());

// A partner agent brings the SAME client both a "buy" and a "rent" requirement. The contact-centric
// idempotency (per contact_phone only) returned the first active deal and BLOCKED the second requirement.
// Idempotency must be scoped to (contact, deal type) so one client can hold an active SALE deal AND an
// active RENT deal.
describe('ensureDealForLead — per-(contact, type) idempotency', () => {
    it('creates a second deal for a RENT requirement when only a SALE deal is active', async () => {
        (prisma.contact.findUnique as any).mockResolvedValue({
            phone_number: '+919000000001', tenant_id: 't1', intent: 'rent', assigned_agent_id: 'agent-1', name: 'X',
        });
        // Existing active deal is SALE only.
        (prisma.transaction.findFirst as any).mockImplementation((args: any) =>
            Promise.resolve(args?.where?.type === 'SALE' ? { id: 'sale-deal', status: 'QUALIFIED' } : null)
        );
        (prisma.transaction.create as any).mockResolvedValue({ id: 'rent-deal', status: 'QUALIFIED' });
        (prisma.task.create as any).mockResolvedValue({ id: 'task-1' });

        const res = await ensureDealForLead({ contactPhone: '+919000000001', source: 'manual', createdByAgentId: 'agent-1' });

        expect(res.created).toBe(true);
        expect(res.dealId).toBe('rent-deal');
        expect(prisma.transaction.create).toHaveBeenCalled();
        // The idempotency lookup must be scoped to the RENT type, not the contact alone.
        expect((prisma.transaction.findFirst as any).mock.calls[0][0].where.type).toBe('RENT');
    });

    it('still returns the existing SALE deal for a second SALE requirement (no duplicate)', async () => {
        (prisma.contact.findUnique as any).mockResolvedValue({
            phone_number: '+919000000002', tenant_id: 't1', intent: 'buy', assigned_agent_id: 'agent-1', name: 'Y',
        });
        (prisma.transaction.findFirst as any).mockImplementation((args: any) =>
            Promise.resolve(args?.where?.type === 'SALE' ? { id: 'existing-sale', status: 'QUALIFIED' } : null)
        );

        const res = await ensureDealForLead({ contactPhone: '+919000000002', source: 'manual', createdByAgentId: 'agent-1' });

        expect(res.created).toBe(false);
        expect(res.dealId).toBe('existing-sale');
        expect(prisma.transaction.create).not.toHaveBeenCalled();
    });
});
