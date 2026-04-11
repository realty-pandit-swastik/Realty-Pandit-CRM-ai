/**
 * Notification Batcher — Groups pending notifications into digest summaries.
 *
 * Runs every 15 minutes via cron. For agents with batch_notifications=true,
 * collects un-sent notifications and delivers a single digest via WhatsApp + Email.
 */

import cron from 'node-cron';
import prisma from '../db';
import logger from '../utils/logger';
import { NotificationAgent } from '../agents/notification_agent';
import { normalizePhone } from '../utils/phone';

const notificationAgent = new NotificationAgent();

const CATEGORY_LABELS: Record<string, string> = {
    inventory: 'Property',
    lead: 'Lead',
    deal: 'Deal',
    appointment: 'Visit',
    task: 'Task',
    team: 'Team',
    system: 'System',
};

export function initNotificationBatcher(): void {
    // Run every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
        try {
            await processBatchDigests();
        } catch (err) {
            logger.error('[NotifBatcher] Error:', err);
        }
    });
    logger.info('[NotifBatcher] Batch digest cron started (every 15 min)');
}

async function processBatchDigests(): Promise<void> {
    // Find agents with batch mode enabled
    const batchPrefs = await prisma.notificationPreference.findMany({
        where: {
            owner_type: 'agent',
            // We check event_preferences JSON for batch_notifications flag
        },
    });

    for (const pref of batchPrefs) {
        const eventPrefs = (pref.event_preferences as Record<string, any>) || {};
        if (!eventPrefs.batch_notifications) continue;

        // Find unsent notifications (channels_sent is empty = held for batch)
        const pending = await prisma.notification.findMany({
            where: {
                recipient_id: pref.owner_id,
                channels_sent: { isEmpty: true },
                read: false,
                created_at: { gte: new Date(Date.now() - 20 * 60 * 1000) }, // Last 20 min
            },
            orderBy: { created_at: 'desc' },
            take: 20,
        });

        if (pending.length === 0) continue;

        // Build digest message
        const agent = await prisma.agent.findUnique({
            where: { id: pref.owner_id },
            select: { id: true, phone: true, email: true, name: true },
        });
        if (!agent) continue;

        // Group by category
        const grouped: Record<string, typeof pending> = {};
        for (const n of pending) {
            if (!grouped[n.category]) grouped[n.category] = [];
            grouped[n.category].push(n);
        }

        // Build WhatsApp digest
        let digestLines: string[] = [`*Notification Digest* (${pending.length} updates)\n`];
        for (const [cat, items] of Object.entries(grouped)) {
            const label = CATEGORY_LABELS[cat] || cat;
            digestLines.push(`*${label}* (${items.length}):`);
            for (const item of items.slice(0, 5)) {
                digestLines.push(`  - ${item.title}`);
            }
            if (items.length > 5) {
                digestLines.push(`  + ${items.length - 5} more...`);
            }
        }
        const digestText = digestLines.join('\n');

        // Send digest
        const channelsSent: string[] = [];
        try {
            if (pref.whatsapp_enabled && agent.phone) {
                await notificationAgent.send({
                    to: normalizePhone(agent.phone) || agent.phone,
                    channel: 'whatsapp',
                    message: digestText,
                    log_interaction: false,
                });
                channelsSent.push('whatsapp');
            }
        } catch (err) {
            logger.warn(`[NotifBatcher] WhatsApp digest failed for ${agent.id}:`, err);
        }

        try {
            if (pref.email_enabled && agent.email) {
                await notificationAgent.send({
                    to: agent.email,
                    channel: 'email',
                    subject: `Realty Pandit — ${pending.length} notification${pending.length > 1 ? 's' : ''}`,
                    message: digestText.replace(/\*/g, ''),
                    log_interaction: false,
                });
                channelsSent.push('email');
            }
        } catch (err) {
            logger.warn(`[NotifBatcher] Email digest failed for ${agent.id}:`, err);
        }

        // Mark notifications as sent via batch
        if (channelsSent.length > 0) {
            await prisma.notification.updateMany({
                where: { id: { in: pending.map(n => n.id) } },
                data: { channels_sent: ['batch_' + channelsSent.join('_')] },
            });
            logger.info(`[NotifBatcher] Sent digest to ${agent.name}: ${pending.length} notifications via ${channelsSent.join(', ')}`);
        }
    }
}
