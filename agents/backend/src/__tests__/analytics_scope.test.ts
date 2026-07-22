import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

// Local mock of the db module — only $queryRaw is exercised by the resolver.
vi.mock('../db', () => ({
  default: { $queryRaw: vi.fn() },
}));

import prisma from '../db';
import {
  resolveVisibleAgentIds,
  invalidateSubtreeCache,
  scopeByAgentField,
  contactScopeOR,
  inventoryScopeOR,
  rawAgentFilter,
  rawContactFilter,
  rawInventoryFilter,
  rawContactJoinFilter,
} from '../services/analytics_scope';

beforeEach(() => {
  vi.clearAllMocks();
  invalidateSubtreeCache(); // clear module-level cache between tests
});

describe('resolveVisibleAgentIds — role matrix', () => {
  it('super_boss -> null (no restriction)', async () => {
    expect(await resolveVisibleAgentIds('s1', 'super_boss', 't1')).toBeNull();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('employee -> only self', async () => {
    expect(await resolveVisibleAgentIds('e1', 'employee', 't1')).toEqual(['e1']);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('unknown role -> self only (never "all")', async () => {
    expect(await resolveVisibleAgentIds('x1', 'something_else', 't1')).toEqual(['x1']);
  });

  it('missing agentId or tenantId -> empty set (no data)', async () => {
    expect(await resolveVisibleAgentIds(undefined, 'manager', 't1')).toEqual([]);
    expect(await resolveVisibleAgentIds('m1', 'manager', undefined)).toEqual([]);
  });

  it('manager -> self + full recursive subtree', async () => {
    (prisma.$queryRaw as any).mockResolvedValue([{ id: 'm1' }, { id: 'e1' }, { id: 'e2' }]);
    const ids = await resolveVisibleAgentIds('m1', 'manager', 't1');
    expect(ids).toEqual(['m1', 'e1', 'e2']);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('manager subtree always includes self even if query returns empty', async () => {
    (prisma.$queryRaw as any).mockResolvedValue([]);
    const ids = await resolveVisibleAgentIds('m9', 'manager', 't1');
    expect(ids).toContain('m9');
  });

  it('manager subtree is cached (second call hits cache, not DB)', async () => {
    (prisma.$queryRaw as any).mockResolvedValue([{ id: 'm2' }, { id: 'e3' }]);
    await resolveVisibleAgentIds('m2', 'manager', 't1');
    await resolveVisibleAgentIds('m2', 'manager', 't1');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('cache is per (tenant, manager) and clears on invalidate', async () => {
    (prisma.$queryRaw as any).mockResolvedValue([{ id: 'm3' }]);
    await resolveVisibleAgentIds('m3', 'manager', 't1');
    invalidateSubtreeCache('t1');
    await resolveVisibleAgentIds('m3', 'manager', 't1');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
});

describe('Prisma query-object helpers', () => {
  it('scopeByAgentField: null -> {}; ids -> IN filter', () => {
    expect(scopeByAgentField('assigned_to_agent_id', null)).toEqual({});
    expect(scopeByAgentField('executive_agent_id', ['a', 'b'])).toEqual({
      executive_agent_id: { in: ['a', 'b'] },
    });
  });

  it('contactScopeOR: null for super_boss; 3-clause OR otherwise', () => {
    expect(contactScopeOR(null)).toBeNull();
    expect(contactScopeOR(['a'])).toEqual([
      { assigned_agent_id: { in: ['a'] } },
      { created_by: { in: ['a'] } },
      { owning_manager_id: { in: ['a'] } },
    ]);
  });

  it('inventoryScopeOR: null for super_boss; uploader/assignee/owning-manager OR otherwise', () => {
    expect(inventoryScopeOR(null)).toBeNull();
    expect(inventoryScopeOR(['a'])).toEqual([
      { uploaded_by_agent_id: { in: ['a'] } },
      { assigned_agent_id: { in: ['a'] } },
      { owning_manager_id: { in: ['a'] } },
    ]);
  });
});

describe('raw SQL helpers', () => {
  it('rawAgentFilter: null -> empty; populated -> parameterized ids', () => {
    expect(rawAgentFilter('executive_agent_id', null)).toEqual(Prisma.empty);
    const sql = rawAgentFilter('executive_agent_id', ['a', 'b']);
    expect(sql.values).toContain('a');
    expect(sql.values).toContain('b');
  });

  it('rawAgentFilter: empty set -> AND false (no rows)', () => {
    const sql = rawAgentFilter('executive_agent_id', []);
    expect(sql.sql).toContain('false');
  });

  it('rawContactFilter: parameterizes ids across all three attribution columns', () => {
    const sql = rawContactFilter(['a'], 'c');
    // 'a' bound once per column (assigned/created/owning) = 3 occurrences
    expect(sql.values.filter((v) => v === 'a')).toHaveLength(3);
  });

  it('rawInventoryFilter: null -> empty; parameterizes ids across uploader/assignee/owner', () => {
    expect(rawInventoryFilter(null, 'i')).toEqual(Prisma.empty);
    const sql = rawInventoryFilter(['a'], 'i');
    expect(sql.values.filter((v) => v === 'a')).toHaveLength(3);
  });

  it('rawContactJoinFilter: null -> empty; emits a contacts subquery binding tenant + ids', () => {
    expect(rawContactJoinFilter(null, 't1')).toEqual(Prisma.empty);
    const sql = rawContactJoinFilter(['a'], 't1');
    expect(sql.sql).toContain('SELECT phone_number FROM contacts');
    expect(sql.values).toContain('t1');
    expect(sql.values.filter((v) => v === 'a')).toHaveLength(3);
  });
});
