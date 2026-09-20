import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
    default: {
        appointment: { findFirst: vi.fn().mockResolvedValue(null) },
        task: { create: vi.fn().mockResolvedValue({ id: 't1' }) },
        agent: { findFirst: vi.fn().mockResolvedValue({ id: 'sb1' }) },
        interaction: { findFirst: vi.fn().mockResolvedValue(null) },
    },
}));

import { CoordinationAgent } from '../agents/coordination_agent';
import prisma from '../db';

const ctx = (message: string, status: string) => ({
    contact: { phone_number: '+910000000000', assigned_agent_id: null, tenant_id: 't', name: 'X' },
    message,
    currentTransaction: { id: '00000000-0000-0000-0000-000000000000', status },
}) as any;

describe('CoordinationAgent VIST_SCHEDULED numeric menu', () => {
    let agent: CoordinationAgent;
    beforeEach(() => { agent = new CoordinationAgent(); });

    it('does NOT re-send the menu for "1"/"2"/"3" / "3." / "*2*"', async () => {
        for (const m of ['1', '2', '3', '3.', '*2*']) {
            const r = await agent.handle(ctx(m, 'VISIT_SCHEDULED'));
            expect(r.reply_script || '').not.toContain('You have a property visit scheduled. Would you like to');
        }
    });
    it('still handles the word "confirm" (not the loop menu)', async () => {
        const r = await agent.handle(ctx('confirm', 'VISIT_SCHEDULED'));
        expect(r.reply_script || '').not.toContain('You have a property visit scheduled. Would you like to');
    });
    it('shows the menu once for an unrelated first message', async () => {
        // The menu only makes sense once a visit is actually booked.
        (prisma.appointment.findFirst as any).mockResolvedValueOnce({ id: 'a1', status: 'confirmed' });
        const r = await agent.handle(ctx('Hello', 'VISIT_SCHEDULED'));
        expect(r.reply_script || '').toContain('You have a property visit scheduled');
    });

    // Fix B (2026-06-12): a deal can be VISIT_SCHEDULED with no Appointment row. Showing the
    // menu there contradicted itself ("you have a visit" → "no visit to cancel"), so the agent
    // now treats the message as the availability reply instead.
    it('asks for a day and time when VISIT_SCHEDULED but nothing is booked yet', async () => {
        (prisma.appointment.findFirst as any).mockResolvedValueOnce(null);
        const r = await agent.handle(ctx('Hello', 'VISIT_SCHEDULED'));
        expect(r.reply_script || '').toContain('din aur time');
        expect(r.reply_script || '').not.toContain('You have a property visit scheduled');
    });
});

describe('CoordinationAgent VISITED menu', () => {
    let agent: CoordinationAgent;
    beforeEach(() => { agent = new CoordinationAgent(); });

    it('1/2/3 do NOT re-send the VISITED menu', async () => {
        for (const m of ['1', '2', '3']) {
            const r = await agent.handle(ctx(m, 'VISITED'));
            expect(r.reply_script || '').not.toContain('How was the property visit?');
        }
    });
    it('unrecognized first reply shows the VISITED menu once', async () => {
        const r = await agent.handle(ctx('hmm', 'VISITED'));
        expect(r.reply_script || '').toContain('How was the property visit?');
    });
});
