import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
    default: { agent: { findFirst: vi.fn() } },
}));

import prisma from '../db';
import { resolveAgentByEmail, resolveAgentByMagicBricksSubUser } from '../services/lead_assignment';

beforeEach(() => vi.clearAllMocks());

// 99acres / Housing SubUserName routing: a lead is assigned to the agent whose portal email == the
// lister's Gmail. Match order (2026-06-25): dedicated nine9acres_email → personal_email → google_email.
// Active EMPLOYEE or MANAGER (managers like Ashwani also list/handle), not employees only.
describe('resolveAgentByEmail — SubUserName → portal email match', () => {
    it('matches active employee/manager across nine9acres_email/personal_email/google_email', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue({ id: 'agent-ashwani', name: 'Ashwani' });

        const id = await resolveAgentByEmail('ashwanikashyap8595@gmail.com');

        expect(id).toBe('agent-ashwani');
        const whereArg = (prisma.agent.findFirst as any).mock.calls[0][0].where;
        expect(whereArg.role).toEqual({ in: ['employee', 'manager'] });
        expect(whereArg.status).toBe('active');
        // Dedicated 99acres field is checked first, then the legacy fallbacks.
        const orKeys = whereArg.OR.map((c: any) => Object.keys(c)[0]);
        expect(orKeys).toEqual(['nine9acres_email', 'personal_email', 'google_email']);
        expect(whereArg.OR[0].nine9acres_email).toEqual({ equals: 'ashwanikashyap8595@gmail.com', mode: 'insensitive' });
    });

    it('returns null when no agent matches', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(null);
        expect(await resolveAgentByEmail('nobody@gmail.com')).toBeNull();
    });

    it('returns null (and does not query) for an empty / missing email', async () => {
        expect(await resolveAgentByEmail('')).toBeNull();
        expect(await resolveAgentByEmail(null)).toBeNull();
        expect(await resolveAgentByEmail(undefined)).toBeNull();
        expect((prisma.agent.findFirst as any)).not.toHaveBeenCalled();
    });
});

// MagicBricks sub_user routing (2026-06-25): the per-agent magicbricks_email is checked FIRST (handles
// both the MB Gmail and the <phone>@timesgroup.com form), then phone, then the email fallback.
describe('resolveAgentByMagicBricksSubUser — magicbricks_email first', () => {
    it('routes via the dedicated magicbricks_email field on the first query', async () => {
        (prisma.agent.findFirst as any).mockResolvedValueOnce({ id: 'agent-vivan', name: 'vivan sonu' });

        const id = await resolveAgentByMagicBricksSubUser('kumarvivan972@gmail.com');

        expect(id).toBe('agent-vivan');
        const whereArg = (prisma.agent.findFirst as any).mock.calls[0][0].where;
        expect(whereArg.magicbricks_email).toEqual({ equals: 'kumarvivan972@gmail.com', mode: 'insensitive' });
        expect(whereArg.role).toEqual({ in: ['employee', 'manager'] });
    });

    it('falls back to phone match (<phone>@timesgroup.com) when magicbricks_email misses', async () => {
        (prisma.agent.findFirst as any)
            .mockResolvedValueOnce(null)                                   // magicbricks_email: no match
            .mockResolvedValueOnce({ id: 'agent-by-phone', name: 'X' });   // phone: matches

        const id = await resolveAgentByMagicBricksSubUser('7906597808@timesgroup.com');

        expect(id).toBe('agent-by-phone');
        expect((prisma.agent.findFirst as any).mock.calls[1][0].where.phone).toEqual({ contains: '7906597808' });
    });

    it('returns null for empty/missing sub_user without querying', async () => {
        expect(await resolveAgentByMagicBricksSubUser('')).toBeNull();
        expect(await resolveAgentByMagicBricksSubUser(null)).toBeNull();
        expect((prisma.agent.findFirst as any)).not.toHaveBeenCalled();
    });
});
