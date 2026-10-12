import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
    default: {
        task: { findMany: vi.fn() },
    },
}));

import prisma from '../db';
import { getWorkflowQueue } from '../services/workflow_task_service';

beforeEach(() => {
    vi.clearAllMocks();
    (prisma.task.findMany as any).mockResolvedValue([]);
});

const lastWhere = () => (prisma.task.findMany as any).mock.calls[0][0].where;

// GET /my-queue for managers/super_bosses used to return the whole tasks table — Task has no
// tenant_id column, so that was a cross-tenant leak in multi-tenant use. Tasks are now scoped
// through their contact's tenant; contact-less tasks stay visible (closing that residual needs
// a schema change).
describe('getWorkflowQueue — tenant scope', () => {
    it('managers only see their own tenant (contact-joined) plus contact-less tasks', async () => {
        await getWorkflowQueue('mgr-1', 'manager', 't1');

        const where = lastWhere();
        expect(where.assigned_to).toBeUndefined(); // managers still see the whole team
        const andGroups = where.AND || [];
        const tenantGroup = andGroups.find((g: any) => g.OR?.some((c: any) => c.contact?.tenant_id === 't1'));
        expect(tenantGroup).toBeTruthy();
        expect(tenantGroup.OR).toContainEqual({ contact_phone: null });
    });

    it('super_boss is tenant-scoped the same way', async () => {
        await getWorkflowQueue('boss-1', 'super_boss', 't1');

        expect(JSON.stringify(lastWhere())).toContain('t1');
    });

    it('employees keep the assigned-to filter and need no tenant group', async () => {
        await getWorkflowQueue('emp-1', 'employee', 't1');

        const where = lastWhere();
        expect(where.assigned_to).toBe('emp-1');
        expect(where.AND).toBeUndefined();
    });

    it('never clobbers the snooze filter when adding the tenant group', async () => {
        await getWorkflowQueue('mgr-1', 'manager', 't1');

        const where = lastWhere();
        // The snooze OR stays top-level; the tenant group is AND-ed alongside it.
        expect(where.OR).toEqual([
            { snoozed_until: null },
            { snoozed_until: { lte: expect.any(Date) } },
        ]);
        expect(where.task_type).toEqual({ not: 'GENERAL' });
        expect(where.status).toEqual({ not: 'DONE' });
    });
});