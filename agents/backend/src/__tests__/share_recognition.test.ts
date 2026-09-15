import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
    default: { partnerAgent: { findFirst: vi.fn() } },
}));

import prisma from '../db';
import { resolveShareMode } from '../services/share_recognition';

describe('resolveShareMode', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns dealer when an ACTIVE PartnerAgent matches the phone', async () => {
        (prisma.partnerAgent.findFirst as any).mockResolvedValue({ phone_number: '+919810721286', name: 'Shiv' });
        const r = await resolveShareMode('9810721286');
        expect(r.mode).toBe('dealer');
        expect(r.partner?.name).toBe('Shiv');
        // looked up by ACTIVE status across phone variants
        expect((prisma.partnerAgent.findFirst as any).mock.calls[0][0].where.status).toBe('ACTIVE');
    });

    it('returns direct when no PartnerAgent matches', async () => {
        (prisma.partnerAgent.findFirst as any).mockResolvedValue(null);
        const r = await resolveShareMode('+919958804559');
        expect(r.mode).toBe('direct');
        expect(r.partner).toBeNull();
    });
});
