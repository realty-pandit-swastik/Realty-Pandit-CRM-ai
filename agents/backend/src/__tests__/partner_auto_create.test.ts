import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
    default: {
        partnerAgent: { findUnique: vi.fn(), create: vi.fn() },
        contact: { findUnique: vi.fn(), upsert: vi.fn() },
        interaction: { create: vi.fn() },
    },
}));

vi.mock('../utils/logger', () => ({
    default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { ensurePartnerAgent } from '../services/partner_auto_create';
import prisma from '../db';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('ensurePartnerAgent', () => {
    it('creates a new partner with partner_type = BOTH when phone is new', async () => {
        (prisma.partnerAgent.findUnique as any).mockResolvedValue(null);
        (prisma.partnerAgent.create as any).mockResolvedValue({ id: 'p1' });
        (prisma.contact.upsert as any).mockResolvedValue({});
        (prisma.interaction.create as any).mockResolvedValue({});

        const result = await ensurePartnerAgent('+919876543210', 'Raj', 'tenant-1', 'agent-1');

        expect(result.wasCreated).toBe(true);
        expect(result.partnerPhone).toBe('+919876543210');

        const createCall = (prisma.partnerAgent.create as any).mock.calls[0][0];
        expect(createCall.data.partner_type).toBe('BOTH');
        expect(createCall.data.managing_agent_id).toBe('agent-1');
        expect(createCall.data.onboarded_by_agent_id).toBe('agent-1');
        expect(createCall.data.status).toBe('ACTIVE');
        expect(createCall.data.package_type).toBe('FREE');
    });

    it('upserts the Contact row with PARTNER_AGENT type', async () => {
        (prisma.partnerAgent.findUnique as any).mockResolvedValue(null);
        (prisma.partnerAgent.create as any).mockResolvedValue({ id: 'p1' });
        (prisma.contact.upsert as any).mockResolvedValue({});
        (prisma.interaction.create as any).mockResolvedValue({});

        await ensurePartnerAgent('+919876543210', 'Raj', 'tenant-1', 'agent-1');

        const upsertCall = (prisma.contact.upsert as any).mock.calls[0][0];
        expect(upsertCall.where).toEqual({ phone_number: '+919876543210' });
        expect(upsertCall.create.contact_type).toBe('PARTNER_AGENT');
        expect(upsertCall.update.contact_type).toBe('PARTNER_AGENT');
    });

    it('returns existing partner without touching Contact/Interaction when phone already registered', async () => {
        (prisma.partnerAgent.findUnique as any).mockResolvedValue({ id: 'p-exists' });

        const result = await ensurePartnerAgent('+919876543210', 'Raj', 'tenant-1', 'agent-1');

        expect(result).toEqual({
            partnerId: 'p-exists',
            wasCreated: false,
            partnerPhone: '+919876543210',
        });
        expect(prisma.partnerAgent.create).not.toHaveBeenCalled();
        expect(prisma.contact.upsert).not.toHaveBeenCalled();
        expect(prisma.interaction.create).not.toHaveBeenCalled();
    });

    it('throws on empty phone', async () => {
        await expect(
            ensurePartnerAgent('', 'Raj', 'tenant-1', 'agent-1'),
        ).rejects.toThrow(/Invalid partner phone/);
    });

    it('uses placeholder name when name is empty', async () => {
        (prisma.partnerAgent.findUnique as any).mockResolvedValue(null);
        (prisma.partnerAgent.create as any).mockResolvedValue({ id: 'p1' });
        (prisma.contact.upsert as any).mockResolvedValue({});
        (prisma.interaction.create as any).mockResolvedValue({});

        await ensurePartnerAgent('+919876543210', '', 'tenant-1', 'agent-1');

        const createCall = (prisma.partnerAgent.create as any).mock.calls[0][0];
        expect(createCall.data.name).toBe('Partner Agent');
        expect(createCall.data.business_name).toBeNull();
    });
});
