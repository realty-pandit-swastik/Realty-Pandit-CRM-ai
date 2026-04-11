/**
 * Call Processing Worker
 * Background job processor for transcription → AI extraction pipeline
 * Handles sequential processing: PROCESSING → TRANSCRIBED → READY_FOR_REVIEW
 */

import prisma from '../db';
import transcriptionService from '../services/transcription';
import callExtractor from '../services/call_extractor';
import logger from '../utils/logger';

interface ProcessingJob {
    callId: string;
    attempt: number;
    startedAt: Date;
}

// In-memory job queue (can be upgraded to BullMQ/Redis later)
const jobQueue: ProcessingJob[] = [];
const processingJobs = new Map<string, ProcessingJob>();
const MAX_RETRIES = 3;
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL = 5000; // Check for new jobs every 5 seconds

/**
 * Start the call processing worker
 * Polls for calls with status PROCESSING and processes them
 */
export function startCallProcessor() {
    logger.info('[CallProcessor] Worker started');

    // Poll for jobs periodically
    setInterval(async () => {
        try {
            await checkForNewJobs();
            await processNextJob();
        } catch (error) {
            logger.error('[CallProcessor] Worker error:', error);
        }
    }, POLL_INTERVAL);

    // Also run immediately
    checkForNewJobs().then(processNextJob).catch(err => logger.error('[CallProcessor] Initial job check failed:', err));
}

/**
 * Check for new calls that need processing
 */
async function checkForNewJobs() {
    try {
        const pendingCalls = await prisma.staffCall.findMany({
            where: {
                status: 'PROCESSING',
                recording_url: { not: null },
            },
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

    // Set timeout
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Processing timeout')), TIMEOUT_MS);
    });

    try {
        // Get call record
        const staffCall = await prisma.staffCall.findUnique({
            where: { id: job.callId },
        });

        if (!staffCall) {
            throw new Error('Call not found');
        }

        if (!staffCall.recording_url) {
            throw new Error('No recording URL');
        }

        // Step 1: Transcription
        logger.info(`[CallProcessor] Transcribing: ${job.callId}`);
        const transcriptionResult = await Promise.race([
            transcriptionService.transcribeAudio(staffCall.recording_url, { language: 'auto' }),
            timeoutPromise,
        ]) as any;

        if (!transcriptionResult || !transcriptionResult.text) {
            throw new Error('Transcription failed or returned empty');
        }

        // Update status to TRANSCRIBED
        await prisma.staffCall.update({
            where: { id: job.callId },
            data: {
                transcript: transcriptionResult.text,
                status: 'TRANSCRIBED',
            },
        });

        logger.info(`[CallProcessor] Transcription complete: ${job.callId}`);

        // Step 2: AI Extraction
        logger.info(`[CallProcessor] Extracting data: ${job.callId}`);
        const extractedData = await Promise.race([
            callExtractor.extractFromTranscript(transcriptionResult.text, staffCall.phone_number),
            timeoutPromise,
        ]) as any;

        // Update status to READY_FOR_REVIEW
        await prisma.staffCall.update({
            where: { id: job.callId },
            data: {
                ai_extraction: extractedData as any,
                confidence_score: extractedData.confidence,
                status: 'READY_FOR_REVIEW',
            },
        });

        logger.info(`[CallProcessor] Processing complete: ${job.callId} (confidence: ${extractedData.confidence})`);
    } catch (error) {
        logger.error(`[CallProcessor] Processing error: ${job.callId}`, error);
        throw error;
    }
}

/**
 * Handle job failure with retry logic
 */
async function handleJobFailure(job: ProcessingJob, error: Error) {
    const { callId, attempt } = job;

    if (attempt < MAX_RETRIES) {
        // Retry
        logger.info(`[CallProcessor] Retrying: ${callId} (attempt ${attempt + 1}/${MAX_RETRIES})`);
        jobQueue.push({
            callId,
            attempt: attempt + 1,
            startedAt: new Date(),
        });
    } else {
        // Max retries reached - mark as failed
        logger.error(`[CallProcessor] Max retries reached: ${callId}`);
        try {
            await prisma.staffCall.update({
                where: { id: callId },
                data: {
                    status: 'REJECTED',
                    transcript: `Processing failed: ${error.message}`,
                },
            });
        } catch (updateError) {
            logger.error(`[CallProcessor] Failed to update status: ${callId}`, updateError);
        }
    }
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
