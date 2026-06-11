/**
 * WhatsApp Inbound Worker — BullMQ worker for async webhook processing.
 *
 * Picks up queued inbound messages and processes them through the full pipeline.
 * Retry: 3 attempts with exponential backoff (2s, 4s, 8s).
 * Concurrency: 5 messages processed in parallel per worker instance.
 *
 * Started by server.ts on the primary PM2 instance only.
 */

import { Worker } from 'bullmq';
import * as SentrySDK from '@sentry/node';
import { redisConnection } from '../connection';
import { processInboundMessage } from '../../services/webhook_processor';
import logger from '../../utils/logger';
import { alertCritical } from '../../utils/alerter';

let worker: Worker | null = null;

/**
 * Start the WhatsApp inbound worker.
 * Call once from server.ts on primary instance.
 */
export function startWhatsAppInboundWorker(): void {
    if (worker) {
        logger.warn('[WhatsAppWorker] Worker already running');
        return;
    }

    worker = new Worker(
        'whatsapp-inbound',
        async (job) => {
            const { from, text, rawMessage } = job.data;
            logger.info(`[WhatsAppWorker] Processing job ${job.id} from ${from}`);
            await processInboundMessage({ from, text, rawMessage });
        },
        {
            connection: redisConnection,
            concurrency: 1,   // SERIAL: prevents session race conditions when same user sends rapid messages
            limiter: {
                max: 30,       // Max 30 jobs per 60 seconds (rate limit)
                duration: 60000,
            },
        },
    );

    worker.on('completed', (job) => {
        logger.info(`[WhatsAppWorker] Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
        logger.error(`[WhatsAppWorker] Job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts}): ${err.message}`);

        // Report to GlitchTip — note: `from` phone number is masked by the global beforeSend scrubber.
        SentrySDK.captureException(err, {
            tags: { worker: 'whatsapp_inbound', job: String(job?.id ?? 'unknown') },
            extra: { from: job?.data?.from, attemptsMade: job?.attemptsMade, maxAttempts: job?.opts?.attempts },
        });

        // Alert if job exhausted all retries (entered DLQ)
        if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
            alertCritical(
                'whatsapp_job_failed',
                `WhatsApp message processing failed after ${job.attemptsMade} attempts`,
                { jobId: job.id, from: job.data?.from, error: err.message },
            );
        }
    });

    worker.on('error', (err) => {
        logger.error('[WhatsAppWorker] Worker error:', err.message);
        SentrySDK.captureException(err, { tags: { worker: 'whatsapp_inbound', source: 'worker.error' } });
    });

    logger.info('[WhatsAppWorker] Started with concurrency=1 (serial processing)');
}

/**
 * Gracefully close the worker. Call from graceful shutdown handler.
 */
export async function stopWhatsAppInboundWorker(): Promise<void> {
    if (worker) {
        await worker.close();
        worker = null;
        logger.info('[WhatsAppWorker] Stopped');
    }
}
