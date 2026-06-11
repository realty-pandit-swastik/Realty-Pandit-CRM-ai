import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => {
    const transaction = { findUnique: vi.fn() };
    const dealCommissionEntry = { create: vi.fn(), findMany: vi.fn() };
    return {
        default: {
            transaction,
            dealCommissionEntry,
        },
    };
});

import { CommissionService } from '../services/commission_service';
import prisma from '../db';
import { Prisma } from '@prisma/client';

const svc = new CommissionService();

beforeEach(() => {
    vi.clearAllMocks();
});

describe('CommissionService.recordEntry', () => {
    it('records an INTERNAL_AGENT entry', async () => {
        (prisma.transaction.findUnique as any).mockResolvedValue({ id: 't1' });
        (prisma as any).dealCommissionEntry.create.mockResolvedValue({ id: 'e1' });

        await svc.recordEntry('t1', {
            partyType: 'INTERNAL_AGENT',
            agentId: 'a1',
            amount: 25000,
            enteredBy: 'a1',
        });

        expect((prisma as any).dealCommissionEntry.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                transaction_id: 't1',
                party_type: 'INTERNAL_AGENT',
                agent_id: 'a1',
                partner_agent_id: null,
                currency: 'INR',
                entered_by_agent_id: 'a1',
            }),
        });
    });

    it('records a PARTNER_AGENT entry', async () => {
        (prisma.transaction.findUnique as any).mockResolvedValue({ id: 't1' });
        (prisma as any).dealCommissionEntry.create.mockResolvedValue({ id: 'e2' });

        await svc.recordEntry('t1', {
            partyType: 'PARTNER_AGENT',
            partnerAgentId: 'p1',
            amount: 25000,
            enteredBy: 'a1',
            notes: 'lead side',
        });

        const call = (prisma as any).dealCommissionEntry.create.mock.calls[0][0];
        expect(call.data.partner_agent_id).toBe('p1');
        expect(call.data.agent_id).toBeNull();
        expect(call.data.notes).toBe('lead side');
    });

    it('records a PLATFORM entry with no agent or partner', async () => {
        (prisma.transaction.findUnique as any).mockResolvedValue({ id: 't1' });
        (prisma as any).dealCommissionEntry.create.mockResolvedValue({ id: 'e3' });
        await svc.recordEntry('t1', {
            partyType: 'PLATFORM',
            amount: 10000,
            enteredBy: 'a1',
        });
        const call = (prisma as any).dealCommissionEntry.create.mock.calls[0][0];
        expect(call.data.agent_id).toBeNull();
        expect(call.data.partner_agent_id).toBeNull();
    });

    it('rejects unknown transaction', async () => {
        (prisma.transaction.findUnique as any).mockResolvedValue(null);
        await expect(
            svc.recordEntry('nope', { partyType: 'PLATFORM', amount: 100, enteredBy: 'a1' }),
        ).rejects.toThrow(/not found/);
    });

    it('rejects INTERNAL_AGENT entry without agentId', async () => {
        (prisma.transaction.findUnique as any).mockResolvedValue({ id: 't1' });
        await expect(
            svc.recordEntry('t1', { partyType: 'INTERNAL_AGENT', amount: 100, enteredBy: 'a1' }),
        ).rejects.toThrow(/agentId is required/);
    });

    it('rejects PARTNER_AGENT entry without partnerAgentId', async () => {
        (prisma.transaction.findUnique as any).mockResolvedValue({ id: 't1' });
        await expect(
            svc.recordEntry('t1', { partyType: 'PARTNER_AGENT', amount: 100, enteredBy: 'a1' }),
        ).rejects.toThrow(/partnerAgentId is required/);
    });

    it('rejects zero or negative amount', async () => {
        (prisma.transaction.findUnique as any).mockResolvedValue({ id: 't1' });
        await expect(
            svc.recordEntry('t1', { partyType: 'PLATFORM', amount: 0, enteredBy: 'a1' }),
        ).rejects.toThrow(/positive/);
        await expect(
            svc.recordEntry('t1', { partyType: 'PLATFORM', amount: -500, enteredBy: 'a1' }),
        ).rejects.toThrow(/positive/);
    });
});

describe('CommissionService.summarize', () => {
    it('returns total + per-party breakdown for 3-party deal', async () => {
        (prisma as any).dealCommissionEntry.findMany.mockResolvedValue([
            { party_type: 'INTERNAL_AGENT', amount: new Prisma.Decimal(25000), agent_id: 'a1', partner_agent_id: null },
            { party_type: 'PARTNER_AGENT', amount: new Prisma.Decimal(25000), agent_id: null, partner_agent_id: 'p1' },
            { party_type: 'PLATFORM', amount: new Prisma.Decimal(10000), agent_id: null, partner_agent_id: null },
        ]);
        const s = await svc.summarize('t1');
        expect(s.total.toFixed(2)).toBe('60000.00');
        expect(s.byParty.INTERNAL_AGENT.toFixed(2)).toBe('25000.00');
        expect(s.byParty.PARTNER_AGENT.toFixed(2)).toBe('25000.00');
        expect(s.byParty.PLATFORM.toFixed(2)).toBe('10000.00');
        expect(s.entries).toHaveLength(3);
    });

    it('handles empty deal', async () => {
        (prisma as any).dealCommissionEntry.findMany.mockResolvedValue([]);
        const s = await svc.summarize('t-empty');
        expect(s.total.toFixed(2)).toBe('0.00');
        expect(s.entries).toEqual([]);
    });

    it('handles 2-party 50:50 deal', async () => {
        (prisma as any).dealCommissionEntry.findMany.mockResolvedValue([
            { party_type: 'PARTNER_AGENT', amount: new Prisma.Decimal(50000), agent_id: null, partner_agent_id: 'p1' },
            { party_type: 'PLATFORM', amount: new Prisma.Decimal(50000), agent_id: null, partner_agent_id: null },
        ]);
        const s = await svc.summarize('t2');
        expect(s.total.toFixed(2)).toBe('100000.00');
        expect(s.byParty.PARTNER_AGENT.toFixed(2)).toBe('50000.00');
        expect(s.byParty.PLATFORM.toFixed(2)).toBe('50000.00');
    });
});
