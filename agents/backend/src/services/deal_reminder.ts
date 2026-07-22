// deal_reminder.ts — single source of truth for "book a follow-up reminder on a deal".
// Creates a REMINDER Task (notified once before + once at the time by scheduled_worker),
// records it in the deal + lead timelines, and pushes it to the agent's Google Calendar +
// Google Tasks (opt-in, fire-and-forget). Used by BOTH the /reminder route and the
// Log-Call CALLBACK_REQUESTED outcome so a callback actually resurfaces the deal. (2026-06-27)

import prisma from '../db';
import logger from '../utils/logger';

export interface CreateDealReminderArgs {
    dealId: string;
    tenantId: string;
    dealStatus: string;
    agentId: string;
    agentName?: string | null;
    contactPhone?: string | null;
    contactName?: string | null;
    remindAt: Date;
    note?: string | null;
    advanceMinutes?: number;
    /** Deal-timeline action label — 'REMINDER_SET' (default) or 'CALLBACK_SCHEDULED'. */
    actionType?: string;
}

export async function createDealReminder(a: CreateDealReminderArgs): Promise<{ task_id: string; advance_minutes: number }> {
    const advanceMin = a.advanceMinutes && a.advanceMinutes > 0 ? Math.min(a.advanceMinutes, 24 * 60) : 30;
    const contactName = a.contactName || a.contactPhone || 'the client';
    const whenStr = a.remindAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
    const reminderNote = (a.note && String(a.note).trim()) || `Reminder to follow up with ${contactName}`;

    // #3 (2026-07-01): supersede any prior OPEN reminder on this deal. The tile's "Next follow-up"
    // reads the soonest open REMINDER task — an old overdue one was outranking the freshly-set one,
    // and duplicate reminders kept firing. Mark the old ones DONE + clean their Google entries so
    // there is exactly one active "next" reminder per deal.
    const priorOpen = await prisma.task.findMany({
        where: { deal_id: a.dealId, task_type: 'REMINDER', status: 'TODO' },
        select: { id: true },
    });
    if (priorOpen.length) {
        const gsync = await import('./google_sync');
        for (const t of priorOpen) { await gsync.cancelReminderGoogle(t.id).catch(() => {}); }
        await prisma.task.updateMany({
            where: { id: { in: priorOpen.map(t => t.id) } },
            data: { status: 'DONE', completed_at: new Date() },
        });
    }

    const task = await prisma.task.create({
        data: {
            title: `Follow-up: ${contactName}`,
            description: reminderNote,
            assigned_to: a.agentId,
            due_date: a.remindAt,
            priority: 'HIGH',
            status: 'TODO',
            task_type: 'REMINDER',
            deal_id: a.dealId,
            ...(a.contactPhone ? { contact_phone: a.contactPhone } : {}),
            tags: ['reminder', 'follow-up'],
            stage_metadata: { advance_minutes: advanceMin, advance_fired: false, due_fired: false, set_by: a.agentId },
        } as any,
    });

    const timelineText = `⏰ Reminder set by ${a.agentName || 'team member'} for ${whenStr} (alert ${advanceMin} min before). Note: ${reminderNote}`;

    await prisma.$transaction([
        prisma.teamAction.create({
            data: {
                tenant_id: a.tenantId,
                transaction_id: a.dealId,
                agent_id: a.agentId,
                stage: a.dealStatus,
                action_type: a.actionType || 'REMINDER_SET',
                outcome: `Reminder for ${whenStr}`,
                notes: reminderNote,
            },
        }),
        prisma.transaction.update({ where: { id: a.dealId }, data: { last_team_action_at: new Date() } }),
        ...(a.contactPhone ? [
            prisma.interaction.create({
                data: {
                    tenant_id: a.tenantId,
                    phone_number: a.contactPhone,
                    channel: 'admin',
                    direction: 'outbound',
                    event_type: 'reminder_set',
                    content: timelineText,
                    metadata: {
                        task_id: task.id, deal_id: a.dealId, remind_at: a.remindAt.toISOString(),
                        advance_minutes: advanceMin, set_by: a.agentId, set_by_name: a.agentName,
                    },
                },
            }),
        ] : []),
    ]);

    logger.info(`[deal_reminder] task ${task.id} on deal ${a.dealId} by ${a.agentId} for ${a.remindAt.toISOString()}`);

    // Push to the member's own Google Calendar + Tasks if connected (opt-in, idempotent, never blocks).
    import('./google_sync')
        .then(m => m.pushReminderToGoogle(task.id))
        .catch(err => logger.error('[deal_reminder] google_sync hook error:', err));

    return { task_id: task.id, advance_minutes: advanceMin };
}
