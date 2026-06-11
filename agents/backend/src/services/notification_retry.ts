/**
 * Notification Retry — Retries failed notification deliveries using BullMQ.
 *
 * When a WhatsApp or Email send fails in notify.ts, the notification ID is
 * added to the retry queue. This worker picks it up and retries with
 * exponential backoff: 1 min → 5 min → 15 min → give up.
 */

import { Queue, Worker } from 'bullmq';
import * as SentrySDK from '@sentry/node';
import { redisConnection } from '../queues/connection';
import prisma from '../db';
import logger from '../utils/logger';
import { NotificationAgent } from '../agents/notification_agent';
import { normalizePhone } from '../utils/phone';
import { sendPushToUser } from './push_service';

const QUEUE_NAME = 'notification_retry';
const notificationAgent = new NotificationAgent();

// Create queue
export const notificationRetryQueue = new Queue(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'custom',
        },
        removeOnComplete: 100,
        removeOnFail: 500,
    },
});

export interface RetryJobData {
    notification_id: string;
    channel: 'whatsapp' | 'email' | 'push';
    to: string; // phone for WA/push, email for email
    title: string;
    body: string;
    subject?: string;
    agent_id?: string; // for push
    action_url?: string;
}

/**
 * Add a failed notification to the retry queue.
 */
export async function scheduleRetry(data: RetryJobData): Promise<void> {
    try {
        await notificationRetryQueue.add('retry', data, {
            backoff: {
                type: 'custom',
            },
        });
        logger.info(`[NotifRetry] Queued retry for ${data.channel} to ${data.to}`);
    } catch (err) {
        logger.warn(`[NotifRetry] Failed to queue retry:`, err);
    }
}

/**
 * Initialize the retry worker.
 */
export function initNotificationRetryWorker(): void {
    const worker = new Worker(QUEUE_NAME, async (job) => {
        const data = job.data as RetryJobData;
        logger.info(`[NotifRetry] Attempt ${job.attemptsMade + 1}/3 for ${data.channel} to ${data.to}`);

        try {
            if (data.channel === 'whatsapp') {
                await notificationAgent.send({
                    to: normalizePhone(data.to) || data.to,
                    channel: 'whatsapp',
                    message: `*${data.title}*\n\n${data.body}`,
                    log_interaction: false,
                });
            } else if (data.channel === 'email') {
                await notificationAgent.send({
                    to: data.to,
                    channel: 'email',
                    subject: data.subject || `Realty Pandit — ${data.title}`,
                    message: data.body,
                    log_interaction: false,
                });
            } else if (data.channel === 'push' && data.agent_id) {
                await sendPushToUser(data.agent_id, {
                    title: data.title,
                    body: data.body,
                    action_url: data.action_url,
                });
            }

            // Update notification record
            if (data.notification_id) {
                const notif = await prisma.notification.findUnique({ where: { id: data.notification_id } });
                if (notif) {
                    const channels = [...(notif.channels_sent || [])];
                    if (!channels.includes(data.channel)) channels.push(data.channel);
                    await prisma.notification.update({
                        where: { id: data.notification_id },
                        data: { channels_sent: channels },
                    });
                }
            }

            logger.info(`[NotifRetry] Success: ${data.channel} to ${data.to}`);
        } catch (err) {
            logger.warn(`[NotifRetry] Attempt ${job.attemptsMade + 1} failed for ${data.channel} to ${data.to}:`, err);
            throw err; // BullMQ will retry
        }
    }, {
        connection: redisConnection,
        concurrency: 5,
        settings: {
            backoffStrategy: (attemptsMade: number) => {
                // 1 min, 5 min, 15 min
                const delays = [60000, 300000, 900000];
                return delays[Math.min(attemptsMade, delays.length - 1)];
            },
        },
    });

    worker.on('failed', (job, err) => {
        if (job && job.attemptsMade >= 3) {
            logger.error(`[NotifRetry] Permanently failed after 3 attempts: ${job.data?.channel} to ${job.data?.to}`);
            SentrySDK.captureException(err, {
                tags: { worker: 'notification_retry', channel: job.data?.channel ?? 'unknown', terminal: 'true' },
                extra: { jobId: job.id, notification_id: job.data?.notification_id, to: job.data?.to, attemptsMade: job.attemptsMade },
            });
            if (job.data?.notification_id) {
                prisma.notification.update({
                    where: { id: job.data.notification_id },
                    data: { channels_sent: [...([] as string[]), `failed_${job.data.channel}`] },
                }).catch((prismaErr) => {
                    SentrySDK.captureException(prismaErr, {
                        tags: { worker: 'notification_retry', stage: 'mark_failed' },
                        extra: { notification_id: job.data.notification_id },
                    });
                });
            }
        }
    });

    logger.info('[NotifRetry] Retry worker started (3 attempts, backoff: 1m/5m/15m)');
}
