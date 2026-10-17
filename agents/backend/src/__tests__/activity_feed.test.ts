import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../db';
import { activityGroup, activityType, listActivities, mutateActivity, scheduledVisitTime } from '../services/activity_feed';
vi.mock('../utils/team_scope', () => ({ getTeamIds: vi.fn().mockResolvedValue(['agent-1']) }));
vi.mock('../services/google_sync', () => ({ pushReminderToGoogle: vi.fn().mockResolvedValue(undefined), cancelReminderGoogle: vi.fn().mockResolvedValue(undefined), pushAppointmentToGoogle: vi.fn().mockResolvedValue(undefined) }));
const viewer = { id: 'agent-1', tenant_id: 'tenant-1', role: 'employee' };
const contact = { phone_number: '+919000000001', name: 'Person' };
const past = new Date('2026-10-17T03:00:00Z');
const future = new Date('2026-10-17T10:00:00Z');
beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-17T06:00:00Z'));
    vi.mocked(prisma.task.findMany).mockResolvedValue([{ id: 'task-1', title: 'Send matching', task_type: 'SHARE_PROPERTIES', tags: [], status: 'TODO', due_date: past, contact, contact_phone: contact.phone_number, deal_id: 'deal-1' }] as any);
    vi.mocked(prisma.taskFollowup.findMany).mockResolvedValue([{ id: 'follow-1', task_type: 'call', status: 'pending', scheduled_at: future, contact }] as any);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([{ id: 'visit-1', title: 'Property visit', type: 'property_visit', scheduled_at: new Date('2026-10-18T10:00:00Z'), status: 'scheduled', contact, property_id: 'inventory-1' }] as any);
    Object.assign(prisma.scheduledVisit, { findMany: vi.fn().mockResolvedValue([]) });
    vi.mocked(prisma.contact.findMany).mockResolvedValue([]); vi.mocked(prisma.interaction.findMany).mockResolvedValue([]);
    Object.assign(prisma.task, { updateMany: vi.fn().mockResolvedValue({ count: 1 }) });
    vi.mocked(prisma.task.findFirst).mockResolvedValue({ id: 'task-2', title: 'Call', task_type: 'GENERAL', tags: ['call'], status: 'TODO', due_date: past, contact_phone: contact.phone_number } as any);
    vi.mocked(prisma.interaction.create).mockResolvedValue({} as any);
});
afterEach(() => vi.useRealTimers());

describe('unified activity feed', () => {
    it('combines source records in the correct groups and types', async () => {
        expect((await listActivities(viewer, { group: 'overdue', page: 1 })).items).toMatchObject([{ kind: 'task', type: 'matching', workflow: true }]);
        expect((await listActivities(viewer, { group: 'today', page: 1 })).items).toMatchObject([{ kind: 'followup', type: 'call' }]);
        expect((await listActivities(viewer, { group: 'upcoming', page: 1 })).items).toMatchObject([{ kind: 'appointment', inventory_id: 'inventory-1' }]);
        expect((await listActivities(viewer, { group: 'today', type: 'visit', page: 1 })).items).toEqual([]);
        expect((prisma.task.findMany as any).mock.calls[0][0].where).toMatchObject({ assigned_to: { in: ['agent-1'] }, AND: expect.any(Array) });
        expect((prisma.appointment.findMany as any).mock.calls[0][0].where).toMatchObject({ tenant_id: 'tenant-1', assigned_to_agent_id: { in: ['agent-1'] } });
    });
    it('uses India day boundaries and retains completed work in Done', () => {
        expect(activityGroup(new Date('2026-10-17T19:00:00Z'), false, new Date('2026-10-17T18:00:00Z'))).toBe('upcoming');
        expect(activityGroup(past, true)).toBe('done');
        expect(activityType('REMINDER', ['new-lead', 'call'])).toBe('call');
        expect(scheduledVisitTime(new Date('2026-10-17T00:00:00Z'), '14:30').toISOString()).toBe('2026-10-17T09:00:00.000Z');
    });
    it('paginates after merging/filtering, retaining all 55 matching tasks', async () => {
        vi.mocked(prisma.task.findMany).mockResolvedValue(Array.from({ length: 55 }, (_, i) => ({ id: `task-${i}`, title: 'Share', task_type: 'SHARE_PROPERTIES', tags: [], status: 'TODO', due_date: past, contact })) as any);
        const first = await listActivities(viewer, { group: 'overdue', type: 'matching', page: 1 });
        const second = await listActivities(viewer, { group: 'overdue', type: 'matching', page: 2 });
        expect(first.items).toHaveLength(50); expect(second.items).toHaveLength(5);
        expect(first.total).toBe(55); expect(second.has_more).toBe(false);
    });
    it('completes a native task and its contact timeline in one transaction', async () => {
        await mutateActivity(viewer, 'task', 'task-2', 'complete');
        expect((prisma.task as any).updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'DONE', completed_at: expect.any(Date), completed_by: 'agent-1' } }));
        expect(prisma.interaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ phone_number: contact.phone_number, event_type: 'activity_completed', tenant_id: 'tenant-1' }) }));
        expect((prisma as any).$transaction).toHaveBeenCalled();
    });
    it('reschedules the native task, clears snooze and records the new time', async () => {
        await mutateActivity(viewer, 'task', 'task-2', 'reschedule', future.toISOString());
        expect((prisma.task as any).updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { due_date: future, snoozed_until: null } }));
        expect((prisma.interaction.create as any).mock.calls[0][0].data.metadata.scheduled_at).toBe(future.toISOString());
    });
    it('cannot bypass workflow requirements or complete inaccessible work', async () => {
        vi.mocked(prisma.task.findFirst).mockResolvedValueOnce({ task_type: 'QUALIFY_LEAD', status: 'TODO' } as any);
        await expect(mutateActivity(viewer, 'task', 'workflow', 'complete')).rejects.toMatchObject({ status: 409 });
        vi.mocked(prisma.task.findFirst).mockResolvedValueOnce(null);
        await expect(mutateActivity(viewer, 'task', 'foreign', 'complete')).rejects.toMatchObject({ status: 404 });
        expect((prisma.task as any).updateMany).not.toHaveBeenCalled();
    });
    it('rejects invalid dates, canceled activities and concurrent edits without a false timeline entry', async () => {
        await expect(mutateActivity(viewer, 'task', 'task-2', 'reschedule', 'invalid')).rejects.toMatchObject({ status: 400 });
        (prisma.task as any).updateMany.mockResolvedValue({ count: 0 });
        await expect(mutateActivity(viewer, 'task', 'task-2', 'complete')).rejects.toMatchObject({ status: 409 });
        expect(prisma.interaction.create).not.toHaveBeenCalled();
    });
    it('never exposes the staff feed to external partner accounts', async () => {
        await expect(listActivities({ ...viewer, role: 'partner' }, { group: 'today', page: 1 })).rejects.toMatchObject({ status: 403 });
        expect(prisma.task.findMany).not.toHaveBeenCalled();
    });
});
