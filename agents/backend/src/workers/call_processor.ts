/**
 * Call Processing Worker
 * Background job processor for transcription → AI extraction pipeline
 * Handles sequential processing: PROCESSING → TRANSCRIBED → READY_FOR_REVIEW
 */

import prisma from '../db';
import { processStaffCall, recoverExhaustedStaffCalls } from '../services/staff_call_processing';
import logger from '../utils/logger';
import { cleanupOldRecordings } from '../services/audio_storage';

interface ProcessingJob {
    callId: string;
    attempt: number;
    startedAt: Date;
}

// In-memory job queue (can be upgraded to BullMQ/Redis later)
const jobQueue: ProcessingJob[] = [];
const processingJobs = new Map<string, ProcessingJob>();
const POLL_INTERVAL = 5000; // Check for new jobs every 5 seconds
let pollTimer: NodeJS.Timeout | undefined;
let retentionTimer: NodeJS.Timeout | undefined;

/**
 * Start the call processing worker
 * Polls for calls with status PROCESSING and processes them
 */
export function startCallProcessor() {
    if (pollTimer) return;
    logger.info('[CallProcessor] Worker started');

    // Poll for jobs periodically
    pollTimer = setInterval(async () => {
        try {
            await checkForNewJobs();
            await processNextJob();
        } catch (error) {
            logger.error('[CallProcessor] Worker error:', error);
        }
    }, POLL_INTERVAL);
    retentionTimer = setInterval(() => cleanupOldRecordings().catch(error => logger.error('[CallProcessor] Retention failed:', error)), 24 * 60 * 60 * 1000);
    cleanupOldRecordings().catch(error => logger.error('[CallProcessor] Initial retention failed:', error));

    // Also run immediately
    checkForNewJobs().then(processNextJob).catch(err => logger.error('[CallProcessor] Initial job check failed:', err));
}

export function stopCallProcessor() {
    if (pollTimer) clearInterval(pollTimer);
    if (retentionTimer) clearInterval(retentionTimer);
    pollTimer = retentionTimer = undefined;
}

/**
 * Check for new calls that need processing
 */
async function checkForNewJobs() {
    try {
        const { recoverCallFollowups } = await import('../services/call_followup');
        await recoverCallFollowups();
        await recoverExhaustedStaffCalls();
        const pendingCalls = await prisma.staffCall.findMany({
            where: { processing_attempts: { lt: 3 }, recording_url: { not: null }, OR: [
                { status: 'PROCESSING', processing_claim_token: null },
                { status: 'TRANSCRIBED', processing_claimed_at: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
                { status: 'TRANSCRIBED', processing_claimed_at: null },
            ] },
            select: { id: true },
            take: 10,
        });

        for (const call of pendingCalls) {
            // Skip if already in queue or being processed
            if (processingJobs.has(call.id) || jobQueue.some((j) => j.callId === call.id)) {
                continue;
            }

            // Add to queue
            jobQueue.push({
                callId: call.id,
                attempt: 1,
                startedAt: new Date(),
            });

            logger.info(`[CallProcessor] Added to queue: ${call.id}`);
        }
    } catch (error) {
        logger.error('[CallProcessor] Failed to check for new jobs:', error);
    }
}

/**
 * Process next job in queue
 */
async function processNextJob() {
    // Skip if already processing max concurrent jobs
    if (processingJobs.size >= 2) {
        return; // Limit to 2 concurrent jobs
    }

    const job = jobQueue.shift();
    if (!job) {
        return; // No jobs in queue
    }

    // Mark as processing
    processingJobs.set(job.callId, job);

    try {
        await processCall(job);
        processingJobs.delete(job.callId);
    } catch (error) {
        logger.error(`[CallProcessor] Job failed: ${job.callId}`, error);
        await handleJobFailure(job, error as Error);
        processingJobs.delete(job.callId);
    }
}

/**
 * Process a single call: transcription → extraction → update
 */
async function processCall(job: ProcessingJob): Promise<void> {
    logger.info(`[CallProcessor] Processing call: ${job.callId} (attempt ${job.attempt})`);
    await processStaffCall(job.callId);
}

/**
 * Handle job failure with retry logic
 */
async function handleJobFailure(job: ProcessingJob, error: Error) {
    // The shared processor persists bounded, token-scoped retries.
}

/**
 * Manually trigger processing for a specific call
 * Useful for retry operations from API
 */
export async function triggerCallProcessing(callId: string): Promise<void> {
    // Check if already in queue or processing
    if (processingJobs.has(callId) || jobQueue.some((j) => j.callId === callId)) {
        logger.info(`[CallProcessor] Call already queued: ${callId}`);
        return;
    }

    // Add to front of queue (priority)
    jobQueue.unshift({
        callId,
        attempt: 1,
        startedAt: new Date(),
    });

    logger.info(`[CallProcessor] Manually triggered: ${callId}`);

    // Try to process immediately
    processNextJob();
}

/**
 * Get worker status
 */
export function getWorkerStatus() {
    return {
        queue_length: jobQueue.length,
        processing_count: processingJobs.size,
        processing_jobs: Array.from(processingJobs.values()).map((j) => ({
            call_id: j.callId,
            attempt: j.attempt,
            started_at: j.startedAt,
            duration_ms: Date.now() - j.startedAt.getTime(),
        })),
    };
}

export default {
    startCallProcessor,
    triggerCallProcessing,
    getWorkerStatus,
};
