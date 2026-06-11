import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
    default: { agent: { findFirst: vi.fn() } },
}));

import prisma from '../db';
import { resolveAgentByEmail } from '../services/lead_assignment';

beforeEach(() => vi.clearAllMocks());

// 99acres SubUserName routing: a lead is assigned to the agent whose personal_email == the lister's Gmail.
// The lister can be an EMPLOYEE or a MANAGER (e.g. Ashwani manages + lists/handles buy-sell), so the match
// must include both active roles — NOT employees only (which silently dropped a manager's leads to super_boss).
describe('resolveAgentByEmail — SubUserName → personal_email match', () => {
    it('matches an active EMPLOYEE or MANAGER (not employees only) by personal_email', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue({ id: 'agent-ashwani', name: 'Ashwani' });

        const id = await resolveAgentByEmail('ashwanikashyap8595@gmail.com');

        expect(id).toBe('agent-ashwani');
        const whereArg = (prisma.agent.findFirst as any).mock.calls[0][0].where;
        expect(whereArg.role).toEqual({ in: ['employee', 'manager'] });
        expect(whereArg.status).toBe('active');
        expect(whereArg.personal_email).toEqual({ equals: 'ashwanikashyap8595@gmail.com', mode: 'insensitive' });
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
