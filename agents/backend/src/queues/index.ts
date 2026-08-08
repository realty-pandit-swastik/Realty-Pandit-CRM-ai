/**
 * BullMQ Queue Definitions — Central registry for all job queues.
 *
 * Queues:
 *  - whatsapp-inbound: Inbound WhatsApp webhook messages (async processing)
 *  - scheduled-jobs:   Cron/repeatable jobs (daily reports, integrity checks, etc.)
 */

import { Queue } from 'bullmq';
import { redisConnection } from './connection';

// ─── WhatsApp Inbound Queue ─────────────────────────────────────────────────
// Processes inbound webhook messages asynchronously so Meta never times out.
export const whatsappInboundQueue = new Queue('whatsapp-inbound', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 1000 },  // Keep last 1000 completed for observability
        removeOnFail: { count: 5000 },      // Keep last 5000 failed for DLQ inspection
    },
});

// ─── Social Inbound Queue ───────────────────────────────────────────────────
// Instagram/Facebook comments and DMs. Added 2026-08-07: these were previously handled
// inline and fire-and-forget in integrations/facebook.ts, so a failed reply was lost
// permanently with nothing to inspect or replay — and every reply failed for months
// (38 inbound events, 0 successful sends) with no queue to recover them from.
// `jobId` is set to Meta's comment_id/message_id at enqueue time, giving a second natural
// dedup layer behind the Redis `social_dedup:` key.
export const socialInboundQueue = new Queue('social-inbound', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },  // 5s, 10s, 20s — Graph API blips
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },                  // keep for DLQ inspection
    },
});

// ─── Scheduled Jobs Queue ───────────────────────────────────────────────────
// Repeatable/cron jobs: daily reports, integrity checks, AI boss cycle, etc.
export const scheduledJobsQueue = new Queue('scheduled-jobs', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 1,  // Reduced from 2 — prevents rate-limit death spiral for pollers
        backoff: { type: 'fixed', delay: 5000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1000 },
    },
});

/**
 * Get queue health stats for the /health endpoint and agent dashboard.
 */
export async function getQueueStats() {
    try {
        const [waWaiting, waActive, waFailed, waDelayed] = await Promise.all([
            whatsappInboundQueue.getWaitingCount(),
            whatsappInboundQueue.getActiveCount(),
            whatsappInboundQueue.getFailedCount(),
            whatsappInboundQueue.getDelayedCount(),
        ]);

        const [sjWaiting, sjActive, sjFailed] = await Promise.all([
            scheduledJobsQueue.getWaitingCount(),
            scheduledJobsQueue.getActiveCount(),
            scheduledJobsQueue.getFailedCount(),
        ]);

        const [soWaiting, soActive, soFailed] = await Promise.all([
            socialInboundQueue.getWaitingCount(),
            socialInboundQueue.getActiveCount(),
            socialInboundQueue.getFailedCount(),
        ]);

        return {
            whatsapp_inbound: {
                waiting: waWaiting,
                active: waActive,
                failed: waFailed,
                delayed: waDelayed,
            },
            social_inbound: {
                waiting: soWaiting,
                active: soActive,
                failed: soFailed,
            },
            scheduled_jobs: {
                waiting: sjWaiting,
                active: sjActive,
                failed: sjFailed,
            },
        };
    } catch {
        return { status: 'unavailable' };
    }
}
