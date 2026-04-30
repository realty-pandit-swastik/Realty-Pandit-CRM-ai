import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import prisma from '../../db';
import { assignViaManagerRoundRobin } from '../lead_assignment';

describe('assignViaManagerRoundRobin', () => {
    let mgrA: string;
    let mgrB: string;
    let employee: string;

    beforeEach(async () => {
        // Wipe last_assigned_at on all agents so test is deterministic
        await prisma.agent.updateMany({ data: { last_assigned_at: null } });

        const a = await prisma.agent.findFirst({ where: { role: 'manager', status: 'active' } });
        const b = await prisma.agent.findFirst({
            where: { role: 'manager', status: 'active', NOT: { id: a?.id } },
        });
        const emp = await prisma.agent.findFirst({ where: { role: 'employee', status: 'active' } });
        if (!a || !b || !emp) throw new Error('Test fixture: need >=2 managers + 1 employee in DB');
        mgrA = a.id;
        mgrB = b.id;
        employee = emp.id;
    });

    afterAll(async () => { await prisma.$disconnect(); });

    it('returns a manager id (not an employee)', async () => {
        const id = await assignViaManagerRoundRobin();
        expect(id === mgrA || id === mgrB).toBe(true);
        expect(id).not.toBe(employee);
    });

    it('rotates: second call returns a different manager than first', async () => {
        const first = await assignViaManagerRoundRobin();
        const second = await assignViaManagerRoundRobin();
        expect(second).not.toBe(first);
    });

    it('updates last_assigned_at on the chosen manager', async () => {
        const before = await prisma.agent.findUnique({ where: { id: mgrA } });
        await assignViaManagerRoundRobin();
        const after = await prisma.agent.findUnique({ where: { id: mgrA } });
        // At least one manager's last_assigned_at moved forward
        const aMoved = (after?.last_assigned_at?.getTime() || 0) > (before?.last_assigned_at?.getTime() || 0);
        const bRow = await prisma.agent.findUnique({ where: { id: mgrB } });
        const bMoved = (bRow?.last_assigned_at?.getTime() || 0) > 0;
        expect(aMoved || bMoved).toBe(true);
    });
});
