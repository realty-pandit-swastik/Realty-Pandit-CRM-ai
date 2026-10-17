import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import prisma from '../db';
import router from '../routes/workflow_tasks';
import { completeQualifyTask, snoozeTask } from '../services/workflow_task_service';
vi.mock('../utils/team_scope', () => ({ getTeamIds: vi.fn().mockResolvedValue(['employee-1']) }));
vi.mock('../services/workflow_task_service', async importOriginal => ({ ...await importOriginal<typeof import('../services/workflow_task_service')>(),
    completeQualifyTask: vi.fn().mockResolvedValue({ success: true }), snoozeTask: vi.fn().mockResolvedValue({ id: 'task-1' }),
}));
let role = 'employee';
const app = express(); app.use(express.json()); app.use((req: any, _res, next) => { req.agent = { id: 'employee-1', tenant_id: 'tenant-1', role }; next(); }); app.use('/workflow', router);
beforeEach(() => {
    vi.clearAllMocks(); role = 'employee';
    vi.mocked(prisma.task.findFirst).mockResolvedValue({ id: 'task-1', task_type: 'QUALIFY_LEAD', assigned_to: 'employee-1', status: 'TODO', deal_id: null } as any);
});
describe('workflow task actions from consolidated Tasks', () => {
    it('completes the scoped task using the authenticated actor, never a supplied agentId', async () => {
        const res = await request(app).post('/workflow/task-1/complete').send({ outcome: 'VERIFIED', agentId: 'forged' });
        expect(res.status).toBe(200);
        expect(completeQualifyTask).toHaveBeenCalledWith('task-1', expect.objectContaining({ agentId: 'employee-1' }));
        expect((prisma.task.findFirst as any).mock.calls[0][0].where.AND[0]).toMatchObject({ assigned_to: { in: ['employee-1'] } });
    });
    it('cannot complete or snooze a task outside the same scope', async () => {
        vi.mocked(prisma.task.findFirst).mockResolvedValue(null);
        expect((await request(app).post('/workflow/hidden/complete').send({})).status).toBe(404);
        expect((await request(app).post('/workflow/hidden/snooze').send({})).status).toBe(404);
        expect(completeQualifyTask).not.toHaveBeenCalled(); expect(snoozeTask).not.toHaveBeenCalled();
    });
    it('denies a task whose linked deal belongs to another tenant', async () => {
        vi.mocked(prisma.task.findFirst).mockResolvedValue({ id: 'task-1', deal_id: 'foreign', task_type: 'QUALIFY_LEAD' } as any);
        vi.mocked(prisma.transaction.findFirst).mockResolvedValue(null);
        expect((await request(app).post('/workflow/task-1/complete').send({})).status).toBe(404);
        expect(completeQualifyTask).not.toHaveBeenCalled();
    });
    it('does not expose staff workflow mutation to external partners', async () => {
        role = 'partner';
        expect((await request(app).post('/workflow/task-1/complete').send({})).status).toBe(403);
        expect(completeQualifyTask).not.toHaveBeenCalled();
    });
});
