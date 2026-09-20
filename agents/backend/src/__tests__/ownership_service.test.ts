import { describe, it, expect, vi, beforeEach } from 'vitest';

// Local mock of the db module — replaces the setup.ts mock for this test file.
vi.mock('../db', () => {
    const partnerAgent = { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() };
    const agent = { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() };
    const inventory = { updateMany: vi.fn(), count: vi.fn() };
    const contact = { updateMany: vi.fn(), count: vi.fn() };
    const transaction = { updateMany: vi.fn(), count: vi.fn() };
    const lead = { updateMany: vi.fn(), count: vi.fn() };
    const partnerReassignmentLog = { create: vi.fn() };
    const tx = { partnerAgent, agent, inventory, contact, transaction, lead, partnerReassignmentLog };
    return {
        default: {
            ...tx,
            $transaction: vi.fn(async (fn: any) => fn(tx)),
        },
    };
});

// Import AFTER vi.mock.
import { OwnershipService } from '../services/ownership_service';
import prisma from '../db';

const svc = new OwnershipService();

beforeEach(() => {
    vi.clearAllMocks();
});

describe('OwnershipService.reassignPartner', () => {
    it('moves partner + cascades inventory + contacts + transactions + writes audit log', async () => {
        (prisma.partnerAgent.findUnique as any).mockResolvedValue({
            id: 'p1',
            managing_agent_id: 'old',
            phone_number: '+919000000001',
        });
        (prisma.agent.findUnique as any).mockResolvedValue({ id: 'new' });
        (prisma.partnerAgent.update as any).mockResolvedValue({});
        (prisma as any).inventory.updateMany.mockResolvedValue({ count: 3 });
        (prisma as any).contact.updateMany.mockResolvedValue({ count: 4 });
        (prisma as any).transaction.updateMany.mockResolvedValue({ count: 2 });
        (prisma as any).partnerReassignmentLog.create.mockResolvedValue({});

        const result = await svc.reassignPartner('p1', 'new', 'super-1', 'restructure');

        expect((prisma.partnerAgent.update as any)).toHaveBeenCalledWith({
            where: { id: 'p1' },
            data: { managing_agent_id: 'new' },
        });
        expect((prisma as any).partnerReassignmentLog.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                partner_agent_id: 'p1',
                from_agent_id: 'old',
                to_agent_id: 'new',
                performed_by_agent_id: 'super-1',
                reason: 'restructure',
            }),
        });
        expect(result).toEqual({
            partnerId: 'p1',
            fromAgentId: 'old',
            toAgentId: 'new',
            counts: { inventory: 3, contacts: 4, transactions: 2 },
        });
    });

    it('rejects reassign when partner missing', async () => {
        (prisma.partnerAgent.findUnique as any).mockResolvedValue(null);
        await expect(svc.reassignPartner('p1', 'new', 'super-1')).rejects.toThrow(/not found/);
    });

    it('rejects reassign when target agent missing', async () => {
        (prisma.partnerAgent.findUnique as any).mockResolvedValue({ id: 'p1', managing_agent_id: 'old' });
        (prisma.agent.findUnique as any).mockResolvedValue(null);
        await expect(svc.reassignPartner('p1', 'nope', 'super-1')).rejects.toThrow(/Target agent/);
    });

    it('rejects reassign when already assigned to same agent', async () => {
        (prisma.partnerAgent.findUnique as any).mockResolvedValue({ id: 'p1', managing_agent_id: 'new' });
        await expect(svc.reassignPartner('p1', 'new', 'super-1')).rejects.toThrow(/already assigned/);
    });
});

describe('OwnershipService.cascadeOnAgentDeactivation', () => {
    it('transfers all owned assets to super_boss and marks agent inactive', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue({ id: 'super-1' });
        (prisma.partnerAgent.updateMany as any).mockResolvedValue({ count: 2 });
        // Inventory and contacts each cascade TWICE — owning_manager_id then assigned_agent_id —
        // and the reported count is the sum. Distinct values per call so a dropped
        // assigned-cascade (the 2026-05-12 orphan bug) fails this test.
        (prisma as any).inventory.updateMany
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 4 });
        (prisma as any).lead.updateMany.mockResolvedValue({ count: 6 });
        (prisma as any).contact.updateMany
            .mockResolvedValueOnce({ count: 3 })
            .mockResolvedValueOnce({ count: 2 });
        (prisma as any).transaction.updateMany.mockResolvedValue({ count: 2 });
        (prisma.agent.update as any).mockResolvedValue({});

        const result = await svc.cascadeOnAgentDeactivation('old');

        expect((prisma as any).inventory.updateMany).toHaveBeenCalledWith({
            where: { owning_manager_id: 'old' },
            data: { owning_manager_id: 'super-1' },
        });
        expect((prisma as any).inventory.updateMany).toHaveBeenCalledWith({
            where: { assigned_agent_id: 'old' },
            data: { assigned_agent_id: 'super-1' },
        });
        expect((prisma.agent.update as any)).toHaveBeenCalledWith({
            where: { id: 'old' },
            data: { status: 'inactive' },
        });
        expect(result.counts).toEqual({
            partners: 2, inventory: 5, leads: 6, contacts: 5, transactions: 2,
        });
    });

    it('uses explicit superBossId when provided', async () => {
        (prisma.agent.findUnique as any).mockResolvedValue({ id: 'chosen-super' });
        (prisma.partnerAgent.updateMany as any).mockResolvedValue({ count: 0 });
        (prisma as any).inventory.updateMany.mockResolvedValue({ count: 0 });
        (prisma as any).lead.updateMany.mockResolvedValue({ count: 0 });
        (prisma as any).contact.updateMany.mockResolvedValue({ count: 0 });
        (prisma as any).transaction.updateMany.mockResolvedValue({ count: 0 });
        (prisma.agent.update as any).mockResolvedValue({});

        const result = await svc.cascadeOnAgentDeactivation('old', 'chosen-super');
        expect(result.toAgentId).toBe('chosen-super');
    });

    it('throws if no super_boss exists', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(null);
        await expect(svc.cascadeOnAgentDeactivation('old')).rejects.toThrow(/No active super_boss/);
    });

    it('refuses to deactivate the super_boss itself', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue({ id: 'super-1' });
        await expect(svc.cascadeOnAgentDeactivation('super-1')).rejects.toThrow(/Cannot deactivate the super_boss/);
    });
});

describe('OwnershipService.resolveOwningManagerForPartner', () => {
    it('returns the partner managing_agent_id', async () => {
        (prisma.partnerAgent.findUnique as any).mockResolvedValue({ managing_agent_id: 'mgr-1' });
        expect(await svc.resolveOwningManagerForPartner('p1')).toBe('mgr-1');
    });

    it('returns null when partner has no manager assigned', async () => {
        (prisma.partnerAgent.findUnique as any).mockResolvedValue({ managing_agent_id: null });
        expect(await svc.resolveOwningManagerForPartner('p1')).toBeNull();
    });

    it('returns null when partner missing', async () => {
        (prisma.partnerAgent.findUnique as any).mockResolvedValue(null);
        expect(await svc.resolveOwningManagerForPartner('p1')).toBeNull();
    });
});

describe('OwnershipService.getOwnershipSummary', () => {
    it('counts assets owned by an internal agent', async () => {
        // inventory and contacts are counted twice each (owned, then assigned) and summed.
        (prisma.partnerAgent.count as any) = vi.fn().mockResolvedValue(5);
        (prisma as any).inventory.count = vi.fn()
            .mockResolvedValueOnce(10).mockResolvedValueOnce(7);
        (prisma as any).contact.count = vi.fn()
            .mockResolvedValueOnce(20).mockResolvedValueOnce(5);
        (prisma as any).lead.count = vi.fn().mockResolvedValue(4);
        (prisma as any).transaction.count = vi.fn().mockResolvedValue(3);
        const out = await svc.getOwnershipSummary('mgr-1');
        expect(out).toEqual({ partners: 5, inventory: 17, contacts: 25, leads: 4, transactions: 3 });
    });
});
