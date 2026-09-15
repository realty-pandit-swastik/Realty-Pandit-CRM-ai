/**
 * Social Inbound Worker — Instagram/Facebook comments and DMs.
 *
 * WHY THIS EXISTS (2026-08-07): `integrations/facebook.ts` used to call the reply handlers
 * inline and fire-and-forget (`handleInstagramDM(...).catch(log)`), after already answering
 * Meta with 200. A reply that failed — and for months every single one did, 65 failures
 * against 0 successes — was logged once and gone. There was no queue to inspect, no retry,
 * and nothing to replay. If the process restarted mid-flight the event vanished too.
 *
 * Now the webhook route only acknowledges and enqueues; this worker owns delivery, with 3
 * attempts and exponential backoff. A permanently failing reply lands in the DLQ where it can
 * actually be seen.
 *
 * ⚠ The handlers must THROW for a retry to happen. They currently swallow send failures
 * (logger.error, no rethrow), so `runSocialJob` inspects the outcome and rethrows — see below.
 *
 * Started by server.ts on the primary PM2 instance only (cluster mode ×2).
 */

import { Worker, UnrecoverableError } from 'bullmq';
import * as SentrySDK from '@sentry/node';
import { redisConnection } from '../connection';
import logger from '../../utils/logger';
import { alertCritical } from '../../utils/alerter';
import {
    handleInstagramComment,
    handleInstagramDM,
    handleFacebookComment,
    handleMessengerMessage,
} from '../../services/social_replier';

export type SocialJobData =
    | { kind: 'ig_comment'; comment_id: string; text: string; from: { id: string; username: string }; media_id: string; ad_id?: string; ad_title?: string }
    | { kind: 'ig_dm'; sender_id: string; text: string; message_id?: string }
    | { kind: 'fb_comment'; comment_id: string; post_id: string; text: string; from: { id: string; name: string } }
    | { kind: 'fb_dm'; sender_id: string; text: string; message_id?: string };

let worker: Worker | null = null;

/**
 * Is this failure permanent — i.e. will retrying it ever help?
 *
 * 2026-08-08: a real customer DM ("Price" from IGSID 1537931924728687) burned all 3 attempts
 * against `(#200) App does not have Advanced Access to instagram_manage_messages`. That will
 * NEVER succeed on retry — it needs Meta App Review. Retrying wasted API calls, delayed the
 * DLQ entry, and buried the one thing that actually mattered: a real person asked us a
 * question and nobody answered.
 *
 * Permanent failures now fail fast and raise a human-reply alert instead.
 */
function classifySocialFailure(message: string): { permanent: boolean; reason: string } {
    const m = message || '';
    if (/Advanced Access|does not have role on app/i.test(m)) {
        return { permanent: true, reason: 'meta_advanced_access_required' };
    }
    if (/You cannot send messages to this id/i.test(m)) {
        return { permanent: true, reason: 'recipient_not_messageable' };
    }
    if (/Object with ID .* does not exist|does not support this operation/i.test(m)) {
        return { permanent: true, reason: 'target_gone_or_unsupported' };
    }
    if (/outside.*window|re-?engagement/i.test(m)) {
        return { permanent: true, reason: 'messaging_window_closed' };
    }
    return { permanent: false, reason: 'transient' };
}

/** Who/what the failed event was, in a form a human can act on from the Instagram inbox. */
function describeJob(d: SocialJobData): string {
    switch (d.kind) {
        case 'ig_comment': return `Instagram comment from @${d.from?.username} — "${String(d.text).slice(0, 120)}"`;
        case 'fb_comment': return `Facebook comment from ${d.from?.name} — "${String(d.text).slice(0, 120)}"`;
        case 'ig_dm': return `Instagram DM from ${d.sender_id} — "${String(d.text).slice(0, 120)}"`;
        case 'fb_dm': return `Messenger DM from ${d.sender_id} — "${String(d.text).slice(0, 120)}"`;
        default: return JSON.stringify(d).slice(0, 160);
    }
}

/**
 * Dispatch a social job to the right handler. Exported so the webhook route can fall back to
 * inline processing if the enqueue itself fails (Redis down) — degrading to the old behaviour
 * rather than dropping the event.
 */
export async function runSocialJobInline(data: SocialJobData): Promise<void> {
    return runSocialJob(data);
}

async function runSocialJob(data: SocialJobData): Promise<void> {
    switch (data.kind) {
        case 'ig_comment':
            await handleInstagramComment({
                comment_id: data.comment_id, text: data.text, from: data.from,
                media_id: data.media_id, ad_id: data.ad_id, ad_title: data.ad_title,
            });
            break;
        case 'ig_dm':
            await handleInstagramDM({ sender_id: data.sender_id, text: data.text, message_id: data.message_id });
            break;
        case 'fb_comment':
            await handleFacebookComment({
                comment_id: data.comment_id, post_id: data.post_id, text: data.text, from: data.from,
            });
            break;
        case 'fb_dm':
            await handleMessengerMessage({ sender_id: data.sender_id, text: data.text, message_id: data.message_id });
            break;
        default:
            logger.warn(`[SocialWorker] Unknown job kind: ${JSON.stringify(data)}`);
    }
}

export function startSocialInboundWorker(): void {
    if (worker) {
        logger.warn('[SocialWorker] Worker already running');
        return;
    }

    worker = new Worker(
        'social-inbound',
        async (job) => {
            const data = job.data as SocialJobData;
            logger.info(`[SocialWorker] Processing job ${job.id} kind=${data.kind}`);
            try {
                await runSocialJob(data);
            } catch (err) {
                const msg = (err as Error)?.message || String(err);
                const { permanent, reason } = classifySocialFailure(msg);
                if (!permanent) throw err;   // transient — let BullMQ retry

                // The bot cannot answer this one, ever. Say so loudly and hand it to a human,
                // because "every DM and comment gets a reply" still has to hold.
                const who = describeJob(data);
                logger.error(`[SocialWorker] 🚨 MANUAL REPLY NEEDED (${reason}) — bot cannot send. ${who}`);
                alertCritical(
                    'social_manual_reply_needed',
                    `Bot blocked (${reason}) — reply by hand from the Instagram/Facebook inbox: ${who}`,
                    { jobId: job.id, kind: data.kind, reason, error: msg.slice(0, 300) },
                );
                // UnrecoverableError skips the remaining attempts — retrying a permission
                // failure is pure waste and delays the alert.
                throw new UnrecoverableError(`${reason}: ${msg}`);
            }
        },
        {
            connection: redisConnection,
            concurrency: 3,
            limiter: {
                // Well under Meta's Page-level messaging limits, and keeps a burst of
                // comments on a viral reel from looking like automated spam.
                max: 20,
                duration: 60000,
            },
        },
    );

    worker.on('completed', (job) => {
        logger.info(`[SocialWorker] Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
        logger.error(`[SocialWorker] Job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts}): ${err.message}`);
        SentrySDK.captureException(err, {
            tags: { worker: 'social_inbound', job: String(job?.id ?? 'unknown') },
            extra: { kind: job?.data?.kind, attemptsMade: job?.attemptsMade },
        });
        if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
            alertCritical(
                'social_job_failed',
                `Instagram/Facebook reply failed after ${job.attemptsMade} attempts`,
                { jobId: job.id, kind: job.data?.kind, error: err.message },
            );
        }
    });

    worker.on('error', (err) => {
        logger.error('[SocialWorker] Worker error:', err.message);
        SentrySDK.captureException(err, { tags: { worker: 'social_inbound', source: 'worker.error' } });
    });

    logger.info('[SocialWorker] Started with concurrency=3');
}

export async function stopSocialInboundWorker(): Promise<void> {
    if (worker) {
        await worker.close();
        worker = null;
        logger.info('[SocialWorker] Stopped');
    }
}
