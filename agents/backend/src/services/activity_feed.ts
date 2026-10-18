import prisma from '../db';
import { CrmError, crmScope, type CrmViewer } from './contact_relationship';
import { normalizePhone, resolveStoredContactPhone, isPlaceholderPhone } from '../utils/phone';

export type ActivityKind = 'task' | 'followup' | 'appointment' | 'visit' | 'contact';
export type ActivityGroup = 'overdue' | 'today' | 'upcoming' | 'done';
export interface ActivityItem {
    id: string; kind: ActivityKind; title: string; type: string; due_at: string; done: boolean;
    contact: { phone_number: string; name: string | null } | null;
    deal_id: string | null; inventory_id: string | null; workflow: boolean;
}
const WORKFLOW_TYPES = ['QUALIFY_LEAD', 'SHARE_PROPERTIES', 'SCHEDULE_VISIT', 'VISIT_FEEDBACK', 'NEGOTIATE_DEAL'];
const contactSelect = { phone_number: true, name: true } as const;

export function activityType(raw: string, tags: string[] = []): string {
    const value = `${raw} ${tags.join(' ')}`.toLowerCase();
    if (/share_properties|matching|match/.test(value)) return 'matching';
    if (/call|qualify_lead/.test(value)) return 'call';
    if (/visit|handover|meeting|documentation|negotiation|contract/.test(value)) return 'visit';
    if (/whatsapp|message/.test(value)) return 'whatsapp';
    if (/reminder|follow/.test(value)) return 'followup';
    return 'other';
}
export function activityGroup(due: Date, done: boolean, now = new Date()): ActivityGroup {
    if (done) return 'done';
    if (due.getTime() < now.getTime()) return 'overdue';
    const day = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    return day(due) === day(now) ? 'today' : 'upcoming';
}

export function scheduledVisitTime(date: Date, time?: string | null): Date {
    if (!time || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(time.trim())) return date;
    const day = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    return new Date(`${day}T${time.trim().padStart(5, '0')}:00+05:30`);
}

async function activityScope(viewer: CrmViewer) {
    const scope = await crmScope(viewer);
    const assignees = viewer.role === 'super_boss'
        ? (await prisma.agent.findMany({ where: { tenant_id: viewer.tenant_id }, select: { id: true } })).map(a => a.id)
        : scope.teamIds;
    return {
        task: { assigned_to: { in: assignees }, AND: [
            { OR: [{ contact_phone: null }, { contact: { tenant_id: viewer.tenant_id } }] },
            { OR: [{ property_id: null }, { property: { tenant_id: viewer.tenant_id } }] },
        ] },
        followup: { tenant_id: viewer.tenant_id, contact: scope.contact },
        appointment: { tenant_id: viewer.tenant_id, ...(viewer.role === 'super_boss' ? {} : { assigned_to_agent_id: { in: scope.teamIds } }) },
        visit: { contact: scope.contact, ...(viewer.role === 'super_boss' ? {} : { OR: [
            { internal_handler_id: { in: scope.teamIds } }, { internal_handler_id: null },
        ] }) },
        contact: scope.contact,
    };
}

export async function accessibleActivityTask(viewer: CrmViewer, id: string) {
    const scope = await activityScope(viewer);
    const task = await prisma.task.findFirst({ where: { AND: [scope.task, { id }] } });
    if (task?.deal_id && !await prisma.transaction.findFirst({ where: { id: task.deal_id, tenant_id: viewer.tenant_id }, select: { id: true } })) return null;
    return task;
}

/** Native records remain authoritative. We merge before pagination so filtering by contact
 * or activity type never hides a later source row behind an unrelated per-table limit. */
export async function listActivities(viewer: CrmViewer, filter: { group: ActivityGroup; type?: string; contact?: string; page: number }) {
    const scope = await activityScope(viewer);
    const phone = filter.contact
        ? (isPlaceholderPhone(filter.contact) ? filter.contact : await resolveStoredContactPhone(filter.contact, prisma) || normalizePhone(filter.contact)) : null;
    if (filter.contact && !phone) throw new CrmError(400, 'Invalid contact filter');
    const [tasks, followups, appointments, visits, reminders, completedReminders] = await Promise.all([
        prisma.task.findMany({ where: { ...scope.task, ...(phone ? { contact_phone: phone } : {}) }, include: { contact: { select: contactSelect } } }),
        prisma.taskFollowup.findMany({ where: { ...scope.followup, ...(phone ? { phone_number: phone } : {}) }, include: { contact: { select: contactSelect } } }),
        prisma.appointment.findMany({ where: { ...scope.appointment, ...(phone ? { contact_id: phone } : {}), status: { notIn: ['cancelled', 'no_show', 'requested'] } }, include: { contact: { select: contactSelect } } }),
        prisma.scheduledVisit.findMany({ where: { ...scope.visit, ...(phone ? { contact_id: phone } : {}), preferred_date: { not: null }, status: { not: 'cancelled' } }, include: { contact: { select: contactSelect } } }),
        prisma.contact.findMany({ where: { AND: [scope.contact, { next_action_at: { not: null } }, ...(phone ? [{ phone_number: phone }] : [])] }, select: { ...contactSelect, next_action_at: true, next_action_type: true } }),
        filter.group === 'done' ? prisma.interaction.findMany({ where: {
            tenant_id: viewer.tenant_id, contact: scope.contact, event_type: 'activity_completed',
            metadata: { path: ['kind'], equals: 'contact' }, ...(phone ? { phone_number: phone } : {}),
        }, include: { contact: { select: contactSelect } } }) : [],
    ]);
    const items: ActivityItem[] = [
        ...tasks.map(t => ({ id: t.id, kind: 'task' as const, title: t.title, type: activityType(t.task_type, t.tags), due_at: (t.snoozed_until || t.due_date).toISOString(),
            done: t.status === 'DONE', contact: t.contact, deal_id: t.deal_id, inventory_id: t.property_id, workflow: WORKFLOW_TYPES.includes(t.task_type) })),
        ...followups.filter(t => t.status !== 'skipped').map(t => ({ id: t.id, kind: 'followup' as const, title: `${t.task_type.replaceAll('_', ' ')} follow-up`, type: activityType(t.task_type), due_at: t.scheduled_at.toISOString(),
            done: t.status === 'completed', contact: t.contact, deal_id: null, inventory_id: null, workflow: false })),
        ...appointments.map(a => ({ id: a.id, kind: 'appointment' as const, title: a.title, type: activityType(a.type), due_at: a.scheduled_at.toISOString(),
            done: a.status === 'completed', contact: a.contact, deal_id: a.transaction_id, inventory_id: a.property_id, workflow: false })),
        ...visits.filter(v => !appointments.some(a => (a.metadata as any)?.scheduled_visit_id === v.id)).map(v => ({ id: v.id, kind: 'visit' as const, title: `Visit · ${v.property_id}`, type: 'visit', due_at: scheduledVisitTime(v.preferred_date!, v.preferred_time).toISOString(),
            done: v.status === 'completed', contact: v.contact, deal_id: null, inventory_id: v.property_id, workflow: false })),
        ...reminders.map(c => ({ id: c.phone_number, kind: 'contact' as const, title: (c.next_action_type || 'Contact reminder').replaceAll('_', ' '), type: activityType(c.next_action_type || 'reminder'), due_at: c.next_action_at!.toISOString(),
            done: false, contact: { phone_number: c.phone_number, name: c.name }, deal_id: null, inventory_id: null, workflow: false })),
        ...completedReminders.map(e => ({ id: e.id, kind: 'contact' as const, title: e.content || 'Reminder completed', type: (e.metadata as any)?.type || 'followup', due_at: (e.metadata as any)?.due_at || e.created_at.toISOString(),
            done: true, contact: e.contact, deal_id: null, inventory_id: null, workflow: false })),
    ];
    const now = new Date();
    const filtered = items.filter(i => activityGroup(new Date(i.due_at), i.done, now) === filter.group && (!filter.type || i.type === filter.type));
    filtered.sort((a, b) => (filter.group === 'done' ? -1 : 1) * (a.due_at.localeCompare(b.due_at) || `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)));
    const offset = (filter.page - 1) * 50;
    return { items: filtered.slice(offset, offset + 50), has_more: filtered.length > offset + 50, total: filtered.length };
}

export async function mutateActivity(viewer: CrmViewer, kind: ActivityKind, id: string, action: 'complete' | 'reschedule', scheduledAt?: string) {
    const scope = await activityScope(viewer);
    const model = { task: prisma.task, followup: prisma.taskFollowup, appointment: prisma.appointment, visit: prisma.scheduledVisit, contact: prisma.contact }[kind] as any;
    if (!model) throw new CrmError(400, 'Unknown activity kind');
    const key = kind === 'contact' ? { phone_number: id } : { id };
    const row = await model.findFirst({ where: { AND: [scope[kind], key] } });
    if (!row) throw new CrmError(404, 'Activity not found or not accessible');
    if (['cancelled', 'skipped', 'no_show'].includes(row.status)) throw new CrmError(409, 'This activity is no longer scheduled');
    if (kind === 'task' && WORKFLOW_TYPES.includes(row.task_type) && action === 'complete') {
        throw new CrmError(409, 'Open this activity’s Pipeline workflow to complete its required steps');
    }
    const done = kind === 'task' ? row.status === 'DONE' : kind === 'contact' ? !row.next_action_at : row.status === 'completed';
    if (done) { if (action === 'complete') return { success: true, already_done: true }; throw new CrmError(409, 'Completed activities cannot be rescheduled'); }
    const when = scheduledAt ? new Date(scheduledAt) : null;
    if (action === 'reschedule' && (!when || !Number.isFinite(when.getTime()) || when.getTime() <= Date.now())) throw new CrmError(400, 'Choose a valid future date and time');
    const phone = row.contact_phone || row.contact_id || row.phone_number || null;
    const due = row.snoozed_until || row.due_date || row.scheduled_at || row.preferred_date || row.next_action_at;
    const now = new Date();
    const data: Record<ActivityKind, any> = action === 'complete' ? {
        task: { status: 'DONE', completed_at: now, completed_by: viewer.id },
        followup: { status: 'completed', executed_at: now }, appointment: { status: 'completed' },
        visit: { status: 'completed' }, contact: { next_action_at: null, next_action_type: null },
    } : {
        task: { due_date: when, snoozed_until: null }, followup: { scheduled_at: when },
        appointment: { scheduled_at: when, end_time: new Date(when!.getTime() + (row.duration || 30) * 60000), status: 'scheduled', reminder_sent: false, reminder_sent_at: null },
        visit: { preferred_date: when, preferred_time: when!.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }) }, contact: { next_action_at: when },
    };
    await prisma.$transaction(async tx => {
        const repository = { task: tx.task, followup: tx.taskFollowup, appointment: tx.appointment, visit: tx.scheduledVisit, contact: tx.contact }[kind] as any;
        const compare = { ...(row.updated_at ? { updated_at: row.updated_at } : {}), ...(kind === 'contact' ? { next_action_at: row.next_action_at } : { status: row.status, ...(kind === 'task' ? { due_date: row.due_date } : kind === 'appointment' || kind === 'followup' ? { scheduled_at: row.scheduled_at } : { preferred_date: row.preferred_date }) }) };
        const updated = await repository.updateMany({ where: { AND: [scope[kind], key, compare] }, data: data[kind] });
        if (!updated.count) throw new CrmError(409, 'Activity changed elsewhere. Refresh and try again.');
        if (phone) await tx.interaction.create({ data: { tenant_id: viewer.tenant_id, phone_number: phone,
            channel: 'crm', direction: 'internal', event_type: action === 'complete' ? 'activity_completed' : 'activity_rescheduled',
            content: `${row.title || row.task_type || row.next_action_type || 'Activity'} ${action === 'complete' ? 'completed' : 'rescheduled'}`,
            metadata: { kind, activity_id: id, by_agent_id: viewer.id, deal_id: row.deal_id || row.transaction_id || null,
                inventory_id: row.property_id || null, due_at: due?.toISOString() || null, scheduled_at: when?.toISOString() || null,
                type: activityType(row.task_type || row.type || row.next_action_type || 'other', row.tags || []) },
        } });
    });
    if (kind === 'task' && row.task_type === 'REMINDER') {
        const { pushReminderToGoogle, cancelReminderGoogle } = await import('./google_sync');
        await (action === 'complete' ? cancelReminderGoogle(id) : pushReminderToGoogle(id)).catch(() => {});
    }
    if (kind === 'appointment' && action === 'reschedule') {
        const { pushAppointmentToGoogle } = await import('./google_sync');
        await pushAppointmentToGoogle(id).catch(() => {});
    }
    return { success: true };
}
