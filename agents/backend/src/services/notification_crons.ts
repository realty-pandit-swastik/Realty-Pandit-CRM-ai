/**
 * Notification Cron Jobs — Scheduled notification triggers.
 *
 * 1. Appointment reminders (1h before)
 * 2. Task due reminders (morning check for tasks due today)
 * 3. Task overdue alerts (morning check for overdue tasks)
 * 4. Daily summary digest (9 AM IST)
 */

import cron from 'node-cron';
import prisma from '../db';
import logger from '../utils/logger';
import { notify, type NotifyRecipient } from './notify';

export function initNotificationCrons(): void {
    // ─── Appointment Reminders — Every 15 min, check for appointments in next 1 hour ───
    cron.schedule('*/15 * * * *', async () => {
        try {
            await sendAppointmentReminders();
        } catch (err) {
            logger.error('[NotifCron] Appointment reminder error:', err);
        }
    });

    // ─── Task Due/Overdue — Every day at 9 AM IST (3:30 AM UTC) ───
    cron.schedule('30 3 * * *', async () => {
        try {
            await sendTaskDueReminders();
            await sendTaskOverdueAlerts();
        } catch (err) {
            logger.error('[NotifCron] Task reminder error:', err);
        }
    });

    // ─── Daily Summary Digest — Every day at 9 AM IST (3:30 AM UTC) ───
    cron.schedule('35 3 * * *', async () => {
        try {
            await sendDailySummary();
        } catch (err) {
            logger.error('[NotifCron] Daily summary error:', err);
        }
    });

    logger.info('[NotifCron] Notification crons started (appointment 15min, tasks+summary 9AM IST)');
}

// ─── Appointment Reminders ───────────────────────────────────────────────────

async function sendAppointmentReminders(): Promise<void> {
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000); // Buffer to avoid duplicates

    // Find appointments starting in the next 45-75 minutes that haven't been reminded
    const appointments = await prisma.appointment.findMany({
        where: {
            status: { in: ['scheduled', 'confirmed'] },
            scheduled_at: {
                gte: new Date(now.getTime() + 45 * 60 * 1000),
                lte: new Date(now.getTime() + 75 * 60 * 1000),
            },
        },
        include: {
            assigned_to_agent: { select: { id: true, phone: true, email: true, name: true } },
        },
    });

    for (const appt of appointments) {
        // Check if we already sent a reminder (avoid duplicate via interaction check)
        const alreadyReminded = await prisma.notification.findFirst({
            where: {
                event: 'appointment_reminder',
                data: { path: ['appointment_id'], equals: appt.id },
                created_at: { gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
            },
        });
        if (alreadyReminded) continue;

        const recipients: NotifyRecipient[] = [];

        // Notify assigned agent
        if (appt.assigned_to_agent) {
            recipients.push({
                id: appt.assigned_to_agent.id,
                type: 'agent',
                phone: appt.assigned_to_agent.phone,
                email: appt.assigned_to_agent.email || undefined,
                name: appt.assigned_to_agent.name,
            });
        }

        if (recipients.length > 0) {
            const scheduledAt = appt.scheduled_at;
            notify('appointment_reminder', recipients, {
                appointment_id: appt.id,
                property_info: appt.title || 'property visit',
                time_until: 'in about 1 hour',
                date: scheduledAt.toLocaleDateString('en-IN'),
                time: scheduledAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            });
        }
    }

    if (appointments.length > 0) {
        logger.info(`[NotifCron] Sent ${appointments.length} appointment reminders`);
    }
}

// ─── Task Due Reminders ──────────────────────────────────────────────────────

async function sendTaskDueReminders(): Promise<void> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Tasks due today that aren't completed
    const dueTasks = await prisma.task.findMany({
        where: {
            status: { not: 'DONE' },
            due_date: { gte: todayStart, lte: todayEnd },
            assigned_to: { not: null },
        },
        select: { id: true, title: true, priority: true, due_date: true, assigned_to: true },
    });

    // Group by assignee
    const byAgent: Record<string, typeof dueTasks> = {};
    for (const task of dueTasks) {
        if (!task.assigned_to) continue;
        if (!byAgent[task.assigned_to]) byAgent[task.assigned_to] = [];
        byAgent[task.assigned_to].push(task);
    }

    for (const [agentId, tasks] of Object.entries(byAgent)) {
        const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { id: true, phone: true, email: true, name: true } });
        if (!agent) continue;

        // Send one notification per agent with count
        notify('task_due_reminder', [{ id: agent.id, type: 'agent', phone: agent.phone, email: agent.email || undefined, name: agent.name }], {
            title: tasks.length === 1 ? tasks[0].title : `${tasks.length} tasks`,
            time_until: 'today',
            count: tasks.length,
        });
    }

    if (dueTasks.length > 0) {
        logger.info(`[NotifCron] Sent task due reminders for ${dueTasks.length} tasks`);
    }
}

// ─── Task Overdue Alerts ─────────────────────────────────────────────────────

async function sendTaskOverdueAlerts(): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);

    const overdueTasks = await prisma.task.findMany({
        where: {
            status: { not: 'DONE' },
            due_date: { lt: yesterday },
            assigned_to: { not: null },
        },
        select: { id: true, title: true, priority: true, due_date: true, assigned_to: true },
    });

    const byAgent: Record<string, typeof overdueTasks> = {};
    for (const task of overdueTasks) {
        if (!task.assigned_to) continue;
        if (!byAgent[task.assigned_to]) byAgent[task.assigned_to] = [];
        byAgent[task.assigned_to].push(task);
    }

    for (const [agentId, tasks] of Object.entries(byAgent)) {
        const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { id: true, phone: true, email: true, name: true } });
        if (!agent) continue;

        notify('task_overdue', [{ id: agent.id, type: 'agent', phone: agent.phone, email: agent.email || undefined, name: agent.name }], {
            title: tasks.length === 1 ? tasks[0].title : `${tasks.length} overdue tasks`,
            count: tasks.length,
        });
    }

    if (overdueTasks.length > 0) {
        logger.info(`[NotifCron] Sent overdue alerts for ${overdueTasks.length} tasks`);
    }
}

// ─── Daily Summary Digest ────────────────────────────────────────────────────

async function sendDailySummary(): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Gather stats
    const [newLeads, newInventory, appointments, deals] = await Promise.all([
        prisma.contact.count({ where: { created_at: { gte: today } } }),
        prisma.inventory.count({ where: { created_at: { gte: today } } }),
        prisma.appointment.count({ where: { scheduled_at: { gte: today } } }),
        prisma.$queryRawUnsafe<any[]>(`SELECT count(*) FROM deals WHERE created_at >= $1`, today).then(r => Number(r[0]?.count || 0)).catch(() => 0),
    ]);

    // Send to all active managers and super_boss
    const admins = await prisma.agent.findMany({
        where: { role: { in: ['super_boss', 'manager'] }, status: 'active' },
        select: { id: true, phone: true, email: true, name: true },
    });

    if (admins.length > 0) {
        notify('daily_summary', admins.map(a => ({ id: a.id, type: 'agent' as const, phone: a.phone, email: a.email || undefined, name: a.name })), {
            leads: newLeads,
            appointments,
            deals,
            inventory: newInventory,
            date: new Date().toLocaleDateString('en-IN'),
        });
    }

    logger.info(`[NotifCron] Daily summary: ${newLeads} leads, ${appointments} visits, ${deals} deals, ${newInventory} properties`);
}
