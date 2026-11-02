import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
// Only external notification delivery is mocked. Auth, scope, query execution and transactions are real.
vi.mock('../services/notify', () => ({ notify: vi.fn() }));
import tasks from '../routes/tasks';
import { AppError } from '../middleware/error_handler';
import prisma from '../db';

const db = new PrismaClient();
const app = express();
app.use(express.json());
app.use('/api', tasks);
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error instanceof AppError ? error.statusCode : 500).json({ error: error.message });
});
const a = 'mobile-scope-a', b = 'mobile-scope-b';
const boss = 'mobile-scope-boss', manager = 'mobile-scope-manager', employee = 'mobile-scope-employee', peer = 'mobile-scope-peer', foreign = 'mobile-scope-foreign';
const task = 'mobile-scope-task', hiddenTask = 'mobile-scope-hidden', foreignTask = 'mobile-scope-other', project = 'mobile-scope-project';
const partnerId = 'mobile-scope-partner', partnerPhone = '+919000000061';
function token(id = employee, role = 'employee', tenant = a) {
    return jwt.sign({ id, role, tenant_id: tenant, email: `${id}@example.invalid` }, process.env.JWT_SECRET!);
}
const get = (path: string, id = employee, role = 'employee') => request(app).get(`/api/${path}`).auth(token(id, role), { type: 'bearer' });

beforeAll(async () => {
    for (const id of [a, b]) await db.tenant.create({ data: { id, business_name: 'Synthetic scope', owner_name: 'Synthetic', primary_phone: id } });
    for (const [id, role, tenant_id, reports_to_id] of [[boss, 'super_boss', a, null], [manager, 'manager', a, null], [employee, 'employee', a, manager], [peer, 'employee', a, null], [foreign, 'employee', b, null]] as const) {
        await db.agent.create({ data: { id, name: 'Synthetic', email: `${id}@example.invalid`, role, tenant_id, reports_to_id } });
    }
    await db.workProject.create({ data: { id: project, name: 'Synthetic project', owner_id: manager, team_members: [employee] } });
    await db.contact.create({ data: { phone_number: partnerPhone, tenant_id: a, name: 'Synthetic partner' } });
    await db.partnerAgent.create({ data: { id: partnerId, phone_number: partnerPhone, name: 'Synthetic partner', status: 'ACTIVE' } });
    for (const [id, assigned_to] of [[task, employee], [hiddenTask, peer], [foreignTask, foreign]]) {
        await db.task.create({ data: { id, title: 'Synthetic task', assigned_to, due_date: new Date('2026-10-17T00:00:00Z'), tags: [], ...(id === task ? { project_id: project } : {}) } });
    }
});
afterAll(async () => {
    await db.task.deleteMany({ where: { assigned_to: { in: [boss, manager, employee, peer, foreign] } } });
    await db.workProject.deleteMany({ where: { owner_id: { in: [boss, manager, employee, peer, foreign] } } });
    await db.partnerAgent.delete({ where: { id: partnerId } });
    await db.contact.delete({ where: { phone_number: partnerPhone } });
    await db.agent.deleteMany({ where: { tenant_id: { in: [a, b] } } });
    await db.tenant.deleteMany({ where: { id: { in: [a, b] } } });
    await db.$disconnect(); await prisma.$disconnect();
});

describe('real task/project isolation', () => {
    it('requires authentication and rejects partner access without a global API mount', async () => {
        expect((await request(app).get('/api/tasks')).status).toBe(401);
        expect((await request(app).get('/api/tasks').auth(token(partnerId, 'partner'), { type: 'bearer' })).status).toBe(403);
    });
    it('scopes lists and stats; a query filter never broadens ownership', async () => {
        expect((await get('tasks')).body.tasks.map((row: { id: string }) => row.id)).toEqual([task]);
        expect((await get(`tasks?assigned_to=${foreign}`)).body.tasks).toEqual([]);
        expect((await get('tasks/stats/summary')).body.total).toBe(1);
        expect((await get('tasks', manager, 'manager')).body.total).toBe(1);
        expect((await get('tasks', boss, 'super_boss')).body.total).toBe(2);
    });
    it('denies foreign and peer objects on reads, edits and deletes', async () => {
        for (const id of [foreignTask, hiddenTask]) {
            expect((await get(`tasks/${id}`)).status).toBe(404);
            expect((await request(app).patch(`/api/tasks/${id}`).auth(token(), { type: 'bearer' }).send({ status: 'DONE' })).status).toBe(404);
            expect((await request(app).delete(`/api/tasks/${id}`).auth(token(), { type: 'bearer' })).status).toBe(404);
        }
        expect((await db.task.findUniqueOrThrow({ where: { id: foreignTask } })).status).toBe('TODO');
    });
    it('scopes projects and nested tasks and validates owner/team changes', async () => {
        expect((await get(`projects/${project}`)).body.tasks.map((row: { id: string }) => row.id)).toEqual([task]);
        expect((await get(`projects/${project}`, peer)).status).toBe(404);
        expect((await request(app).patch(`/api/projects/${project}`).auth(token(), { type: 'bearer' }).send({ owner_id: foreign })).status).toBe(403);
        expect((await request(app).post('/api/projects').auth(token(), { type: 'bearer' }).send({ name: 'Synthetic', team_members: [foreign] })).status).toBe(403);
    });
    it('returns only a project label when an assigned task does not grant project membership', async () => {
        const createdProject = await request(app).post('/api/projects').auth(token(manager, 'manager'), { type: 'bearer' })
            .send({ name: 'Synthetic manager project', description: 'Synthetic private project description', team_members: [], start_date: '2026-10-20', end_date: '2026-10-30' }).expect(201);
        const projectId = createdProject.body.id;
        try {
            const createdTask = await request(app).post('/api/tasks').auth(token(manager, 'manager'), { type: 'bearer' })
                .send({ title: 'Synthetic delegated task', description: 'Allowed task details', assigned_to: employee, due_date: '2026-10-20', project_id: projectId }).expect(201);
            const taskId = createdTask.body.id;
            try {
                await get(`projects/${projectId}`).expect(404);
                const detail = await get(`tasks/${taskId}`).expect(200);
                expect(detail.body).toMatchObject({ id: taskId, title: 'Synthetic delegated task', description: 'Allowed task details', assigned_to: employee, project_id: projectId });
                expect(detail.body.project).toEqual({ id: projectId, name: 'Synthetic manager project' });
                expect(detail.body.project).toEqual(createdTask.body.project);
                const managerDetail = await get(`projects/${projectId}`, manager, 'manager').expect(200);
                expect(managerDetail.body).toMatchObject({ description: 'Synthetic private project description', owner_id: manager, team_members: [], end_date: '2026-10-30T00:00:00.000Z' });
            } finally {
                await db.task.deleteMany({ where: { id: taskId } });
            }
        } finally {
            await db.workProject.delete({ where: { id: projectId } });
        }
    });
    it('rejects foreign references, reassignment and malformed writes including bulk input', async () => {
        const input = { title: 'Synthetic', assigned_to: foreign, due_date: '2026-10-18' };
        expect((await request(app).post('/api/tasks').auth(token(), { type: 'bearer' }).send(input)).status).toBe(403);
        expect((await request(app).patch(`/api/tasks/${task}`).auth(token(), { type: 'bearer' }).send({ assigned_to: foreign })).status).toBe(403);
        expect((await request(app).post('/api/tasks').auth(token(), { type: 'bearer' }).send({ ...input, assigned_to: employee, due_date: 'bad-date' })).status).toBe(400);
        const result = await request(app).post('/api/tasks/bulk-import').auth(token(), { type: 'bearer' }).send({ tasks: [input] });
        expect(result.body.created_count).toBe(0); expect(result.body.error_count).toBe(1);
    });
    it('retains web date-only writes, completion metadata and stable pagination', async () => {
        const created = await request(app).post('/api/tasks').auth(token(), { type: 'bearer' }).send({ title: 'Synthetic new', assigned_to: employee, due_date: '2026-10-18', tags: [] });
        expect(created.status).toBe(201);
        const done = await request(app).patch(`/api/tasks/${created.body.id}`).auth(token(), { type: 'bearer' }).send({ status: 'DONE' });
        expect(done.status).toBe(200); expect(done.body.completed_by).toBe(employee);
        const one = await get('tasks?page=1&limit=1'); const two = await get('tasks?page=2&limit=1');
        expect(one.body.total).toBe(2); expect(one.body.tasks[0].id).not.toBe(two.body.tasks[0].id);
        expect((await get('tasks?limit=101')).status).toBe(400);
    });
    it('paginates scoped projects without exposing hidden task counts and keeps the web list contract', async () => {
        const created = await request(app).post('/api/projects').auth(token(), { type: 'bearer' }).send({ name: 'Synthetic paginated project', description: 'Synthetic description', start_date: '2026-10-20', end_date: null });
        expect(created.status).toBe(201);
        const id = created.body.id;
        await db.task.create({ data: { title: 'Hidden peer count', assigned_to: peer, due_date: new Date('2026-10-20'), tags: [], project_id: id } });
        const first = await get('projects?page=1&limit=1'), second = await get('projects?page=2&limit=1');
        expect(first.status).toBe(200); expect(first.body.total).toBe(2);
        expect(first.body.projects[0].id).not.toBe(second.body.projects[0].id);
        const listed = (await get('projects')).body.projects;
        expect(listed.find((row: { id: string }) => row.id === id)._count.tasks).toBe(0);
        expect((await get('projects?limit=101')).status).toBe(400);
        expect((await get(`projects/${id}?include_tasks=false`)).body.tasks).toBeUndefined();
        expect((await get(`projects/${id}`)).body.tasks).toEqual([]);
        expect((await get(`projects?owner_id=${foreign}`)).body.projects).toEqual([]);
        await db.workProject.delete({ where: { id } });
    });
    it('preserves task links/tags/assignment on edit, clears completion on reopen, and deletes only the task', async () => {
        const created = await request(app).post('/api/tasks').auth(token(), { type: 'bearer' }).send({ title: 'Synthetic editable task', assigned_to: employee, due_date: '2026-10-20T10:30:00+05:30', project_id: project, tags: ['keep,comma', 'follow-up'] });
        expect(created.status).toBe(201);
        const id = created.body.id;
        const edited = await request(app).patch(`/api/tasks/${id}`).auth(token(), { type: 'bearer' }).send({ title: 'Synthetic edited task', description: 'New description', status: 'DONE', priority: 'URGENT', due_date: created.body.due_date });
        expect(edited.status).toBe(200);
        expect(edited.body).toMatchObject({ title: 'Synthetic edited task', project_id: project, assigned_to: employee, tags: ['keep,comma', 'follow-up'], due_date: '2026-10-20T05:00:00.000Z', completed_by: employee });
        const reopened = await request(app).patch(`/api/tasks/${id}`).auth(token(), { type: 'bearer' }).send({ status: 'IN_PROGRESS' });
        expect(reopened.status).toBe(200); expect(reopened.body.completed_at).toBeNull(); expect(reopened.body.completed_by).toBeNull();
        const filtered = await get('tasks?status=IN_PROGRESS&priority=URGENT&page=1&limit=25');
        expect(filtered.body.tasks.map((row: { id: string }) => row.id)).toEqual([id]);
        expect((await request(app).delete(`/api/tasks/${id}`).auth(token(), { type: 'bearer' })).status).toBe(200);
        expect((await get(`tasks/${id}`)).status).toBe(404);
        expect((await get(`projects/${project}`)).status).toBe(200);
    });
    it('edits project fields without changing its team, rejects invalid writes and preserves tasks on deletion', async () => {
        const created = await request(app).post('/api/projects').auth(token(), { type: 'bearer' }).send({ name: 'Synthetic lifecycle project', start_date: '2026-10-20', team_members: [employee] });
        expect(created.status).toBe(201);
        const id = created.body.id;
        const linked = await db.task.create({ data: { title: 'Synthetic retained task', assigned_to: employee, due_date: new Date('2026-10-20'), tags: [], project_id: id } });
        for (const method of ['patch', 'delete'] as const) {
            expect((await request(app)[method](`/api/projects/${id}`).auth(token(peer), { type: 'bearer' }).send(method === 'patch' ? { name: 'Denied' } : {})).status).toBe(404);
        }
        expect((await request(app).patch(`/api/projects/${id}`).auth(token(), { type: 'bearer' }).send({ description: { invalid: true } })).status).toBe(400);
        expect((await request(app).patch(`/api/projects/${id}`).auth(token(), { type: 'bearer' }).send({ start_date: '2026-02-30' })).status).toBe(400);
        const edited = await request(app).patch(`/api/projects/${id}`).auth(token(), { type: 'bearer' }).send({ name: 'Synthetic edited project', description: 'Updated', status: 'ON_HOLD', start_date: created.body.start_date, end_date: '2026-10-30' });
        expect(edited.status).toBe(200); expect(edited.body).toMatchObject({ owner_id: employee, team_members: [employee], status: 'ON_HOLD', end_date: '2026-10-30T00:00:00.000Z' });
        expect((await request(app).delete(`/api/projects/${id}`).auth(token(), { type: 'bearer' })).status).toBe(200);
        expect((await get(`projects/${id}`)).status).toBe(404);
        const retained = await db.task.findUniqueOrThrow({ where: { id: linked.id } });
        expect(retained.project_id).toBeNull(); expect(retained.title).toBe('Synthetic retained task');
    });

});
