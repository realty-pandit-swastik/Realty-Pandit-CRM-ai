import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({ default: {
    transaction: { findUnique: vi.fn() },
    shortageEntry: { upsert: vi.fn(), updateMany: vi.fn() },
} }));
vi.mock('../services/matching_engine', () => ({ MatchingEngine: class {
    findMatches = findMatches;
} }));

const findMatches = vi.fn();
import prisma from '../db';
import { refreshDealShortage } from '../services/shortage_book';

beforeEach(() => vi.clearAllMocks());

it('upserts one shortage per deal below three tenant-scoped matches and resolves at three', async () => {
    (prisma.transaction.findUnique as any).mockResolvedValue({
        id: 'deal-1', tenant_id: 'tenant-1', status: 'QUALIFIED', inventory_id: null,
        demand_intent: 'buy', demand_contact: { preferred_location: 'Sector 1', assigned_agent_id: 'agent-1' },
    });
    findMatches.mockResolvedValueOnce([{ id: 'one' }, { id: 'two' }]).mockResolvedValueOnce([{ id: 'one' }, { id: 'two' }, { id: 'three' }]);
    await refreshDealShortage('deal-1');
    await refreshDealShortage('deal-1');
    expect(findMatches).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 'tenant-1', preferred_location: 'Sector 1' }), 3);
    expect(prisma.shortageEntry.upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({
        where: { deal_id: 'deal-1' }, create: expect.objectContaining({ match_count: 2, status: 'OPEN' }),
    }));
    expect(prisma.shortageEntry.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
        where: { deal_id: 'deal-1' }, update: expect.objectContaining({ match_count: 3, status: 'RESOLVED' }),
    }));
});

it('does not create a shortage from a lead with no saved demand details', async () => {
    (prisma.transaction.findUnique as any).mockResolvedValue({
        id: 'deal-2', tenant_id: 'tenant-1', status: 'NEW', inventory_id: null,
        demand_intent: 'buy', demand_contact: { assigned_agent_id: 'agent-1' },
    });
    await refreshDealShortage('deal-2');
    expect(findMatches).not.toHaveBeenCalled();
    expect(prisma.shortageEntry.upsert).not.toHaveBeenCalled();
});
