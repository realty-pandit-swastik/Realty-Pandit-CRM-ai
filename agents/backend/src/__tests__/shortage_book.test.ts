vi.mock('../utils/taxonomy_filter', () => ({ expandTaxonomyNodeIds: vi.fn(async (ids: string[]) => ids) }));
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({ default: {
    tenant: { findUnique: vi.fn() },
    transaction: { findUnique: vi.fn(), findMany: vi.fn() },
    shortageEntry: { upsert: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    task: { upsert: vi.fn() },
    shortageRefresh: { findMany: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
} }));
vi.mock('../queues', () => ({ scheduledJobsQueue: { add: vi.fn() } }));
vi.mock('../services/matching_engine', () => ({ MatchingEngine: class {
    findMatches = findMatches;
} }));

const findMatches = vi.fn();
import prisma from '../db';
import { refreshDealShortage, createDailySurveyTasks, requestTenantShortageRefresh, processPendingShortageRefreshes } from '../services/shortage_book';
import { scheduledJobsQueue } from '../queues';

beforeEach(() => {
    vi.clearAllMocks();
    (prisma.tenant.findUnique as any).mockResolvedValue({ shortage_match_threshold: 3 });
    (prisma.shortageRefresh.updateMany as any).mockResolvedValue({ count: 1 });
});

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

it('uses tenant threshold and canonical BHK in strict active-stock matching', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({ shortage_match_threshold: 5 });
    (prisma.transaction.findUnique as any).mockResolvedValue({
        id: 'd', tenant_id: 't', status: 'QUALIFIED', demand_contact: {
            preferred_location: 'Sector 1', demand_schema_values: { bhk_list: ['2', '3'] },
        },
    });
    findMatches.mockResolvedValue([{ id: 'one' }, { id: 'two' }, { id: 'three' }]);
    await refreshDealShortage('d');
    expect(findMatches).toHaveBeenCalledWith(expect.objectContaining({ strict_stock: true, bhk_list: [2, 3] }), 5);
    expect(prisma.shortageEntry.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ status: 'OPEN', match_count: 3 }),
    }));
});

it('resolves closed or inventory-assigned demands without matching', async () => {
    (prisma.transaction.findUnique as any).mockResolvedValue({ id: 'd', status: 'CLOSED_WON' });
    await refreshDealShortage('d');
    expect(prisma.shortageEntry.updateMany).toHaveBeenCalledWith({ where: { deal_id: 'd' }, data: { status: 'RESOLVED' } });
    expect(findMatches).not.toHaveBeenCalled();
});

it('groups scoped shortages by tenant, agent and area using the IST date', async () => {
    (prisma.shortageEntry.findMany as any).mockResolvedValue([
        { id: 's1', deal_id: 'd1', tenant_id: 't', owner_id: 'a', area: 'Sector 1', match_count: 0, demand: { intent: 'buy' } },
        { id: 's2', deal_id: 'd2', tenant_id: 't', owner_id: 'a', area: 'sector 1', match_count: 1, demand: { intent: 'buy' } },
    ]);
    const now = new Date('2026-10-03T20:00:00Z');
    await createDailySurveyTasks(now, { tenant_id: 't', owner_ids: ['a'] });
    await createDailySurveyTasks(now, { tenant_id: 't', owner_ids: ['a'] });
    expect(prisma.shortageEntry.findMany).toHaveBeenCalledWith({ where: { status: 'OPEN', tenant_id: 't', owner_id: { in: ['a'] } } });
    const calls = (prisma.task.upsert as any).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].where.id).toBe(calls[1][0].where.id);
    expect(calls[0][0].create).toEqual(expect.objectContaining({
        due_date: new Date('2026-10-04T03:00:00Z'), deal_id: null,
        stage_metadata: expect.objectContaining({ survey_day: '2026-10-04', deal_ids: ['d1', 'd2'] }),
    }));
    expect(calls[0][0].update).not.toHaveProperty('status');
});

it('persists refresh intent before enqueue and retains it when Redis is unavailable', async () => {
    (scheduledJobsQueue.add as any).mockRejectedValueOnce(new Error('redis unavailable'));
    await requestTenantShortageRefresh('t');
    expect(prisma.shortageRefresh.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { tenant_id: 't' } }));
    expect(scheduledJobsQueue.add).toHaveBeenCalledWith('shortage-refresh', { tenantId: 't' }, expect.objectContaining({
        attempts: 5, deduplication: expect.objectContaining({ id: 'shortage-t', extend: true, replace: true }),
    }));
    expect(prisma.shortageRefresh.deleteMany).not.toHaveBeenCalled();
});

it('records retryable refresh failures and fences updates to its own lease', async () => {
    const now = new Date('2026-10-03T10:00:00Z');
    (prisma.shortageRefresh.findMany as any).mockResolvedValue([{ tenant_id: 't', requested_at: now, attempts: 2 }]);
    (prisma.transaction.findMany as any).mockRejectedValue(new Error('database unavailable'));
    await processPendingShortageRefreshes('t', now);
    expect(prisma.shortageRefresh.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
        where: { tenant_id: 't', lease_until: new Date('2026-10-03T10:15:00Z') },
        data: expect.objectContaining({ attempts: { increment: 1 }, next_attempt_at: new Date('2026-10-03T10:02:00Z') }),
    }));
    expect(prisma.shortageRefresh.deleteMany).not.toHaveBeenCalled();
});

it('does no work when another processor wins the lease', async () => {
    (prisma.shortageRefresh.findMany as any).mockResolvedValue([{ tenant_id: 't', requested_at: new Date(), attempts: 0 }]);
    (prisma.shortageRefresh.updateMany as any).mockResolvedValue({ count: 0 });
    await processPendingShortageRefreshes('t');
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
});

it('clears only the processed request and its own lease so new writes survive refresh', async () => {
    const now = new Date('2026-10-03T10:00:00Z');
    (prisma.shortageRefresh.findMany as any).mockResolvedValue([{ tenant_id: 't', requested_at: now, attempts: 0 }]);
    (prisma.transaction.findMany as any).mockResolvedValue([]);
    await processPendingShortageRefreshes('t', now);
    expect(prisma.shortageRefresh.deleteMany).toHaveBeenCalledWith({ where: {
        tenant_id: 't', requested_at: now, lease_until: new Date('2026-10-03T10:15:00Z'),
    } });
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

it('matches each canonical property type in a multi-type shortage demand', async () => {
    (prisma.transaction.findUnique as any).mockResolvedValue({ id: 'd', tenant_id: 't', status: 'QUALIFIED', demand_contact: { preferred_location: 'Area', demand_taxonomy_node_id: 'flat', demand_schema_values: { type_node_list: ['flat', 'villa'], bhk_list: ['2'] } } });
    findMatches.mockResolvedValue([]);
    await refreshDealShortage('d');
    expect(findMatches).toHaveBeenCalledWith(expect.objectContaining({ taxonomy_node_id_list: ['flat', 'villa'], demand_taxonomy_node_id: undefined, bhk_list: [2] }), 3);
});
