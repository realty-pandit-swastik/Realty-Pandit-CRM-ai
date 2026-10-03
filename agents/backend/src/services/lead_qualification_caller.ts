/**
 * Lead Qualification Caller — Stage 1 NEW call cadence engine (DEC-003 / Stage 1 KRA).
 *
 * Cadence per KRA:
 *   - Attempt #1: immediate
 *   - Attempt #2: 5 min after #1
 *   - Attempt #3: 1 hr after #2 (also fire rp_call_attempted WhatsApp + manager alert)
 *   - Attempts #4..N: every 3 hrs
 *   - Business hours: 8 AM – 9 PM IST (out-of-hours attempts shifted to next 8 AM)
 *   - Stop if deal status leaves NEW, or after MAX_ATTEMPTS, or on terminal Omnidim outcome.
 *
 * Each attempt POSTs to Omnidim (stubbed until creds available) and logs an
 * Interaction with event_type=`omnidim_call_attempt` so the deal feed shows
 * call history without a new model.
 */

import { Worker, Job } from 'bullmq';
import * as SentrySDK from '@sentry/node';
import { redisConnection } from '../queues/connection';
import { scheduledJobsQueue } from '../queues/index';
import prisma from '../db';
import logger from '../utils/logger';
import { WhatsAppService } from './whatsapp';

const whatsapp = new WhatsAppService();

const QUEUE_NAME = 'scheduled-jobs';
const JOB_NAME = 'qualification_call_attempt';
const EVT_CALL_ATTEMPT = 'omnidim_call_attempt';
const MAX_ATTEMPTS = 8;

const BUSINESS_START_HOUR_IST = 8;   // 08:00 IST
const BUSINESS_END_HOUR_IST = 21;    // 21:00 IST
const IST_OFFSET_MINUTES = 5 * 60 + 30;

/**
 * Public API: enqueue the next qualification call attempt for a deal.
 * Pass attempt=0 to start the sequence; the worker will re-enqueue subsequent ones.
 */
export async function scheduleQualificationCall(
    dealId: string,
    attempt: number,
): Promise<void> {
    if (attempt >= MAX_ATTEMPTS) {
        logger.info(`[QualCall] Deal ${dealId} reached MAX_ATTEMPTS=${MAX_ATTEMPTS}, halting cadence`);
        return;
    }

    const delayMs = computeDelayMs(attempt);
    const fireAt = new Date(Date.now() + delayMs);
    const adjustedDelay = adjustToBusinessHours(fireAt);

    await scheduledJobsQueue.add(
        JOB_NAME,
        { dealId, attempt: attempt + 1 },
        { delay: adjustedDelay, jobId: `qualcall:${dealId}:${attempt + 1}` },
    );
    logger.info(`[QualCall] Deal ${dealId} attempt #${attempt + 1} scheduled in ${Math.round(adjustedDelay / 1000)}s`);
}

/** Cadence delays from KRA. attempt is 0-indexed (0 = first attempt). */
function computeDelayMs(attempt: number): number {
    if (attempt === 0) return 0;                   // Attempt #1: immediate
    if (attempt === 1) return 5 * 60 * 1000;       // Attempt #2: +5 min
    if (attempt === 2) return 60 * 60 * 1000;      // Attempt #3: +1 hr
    return 3 * 60 * 60 * 1000;                     // #4+: +3 hr
}

/**
 * Shift the fire-at time into the next 8 AM–9 PM IST window if it falls outside.
 * Returns the resulting absolute delay in milliseconds.
 */
function adjustToBusinessHours(fireAt: Date): number {
    const istMs = fireAt.getTime() + IST_OFFSET_MINUTES * 60 * 1000;
    const ist = new Date(istMs);
    const istHour = ist.getUTCHours();

    if (istHour >= BUSINESS_START_HOUR_IST && istHour < BUSINESS_END_HOUR_IST) {
        return Math.max(0, fireAt.getTime() - Date.now());
    }

    // Roll forward to next 8:00 IST
    const nextEightIst = new Date(ist);
    if (istHour >= BUSINESS_END_HOUR_IST) {
        nextEightIst.setUTCDate(nextEightIst.getUTCDate() + 1);
    }
    nextEightIst.setUTCHours(BUSINESS_START_HOUR_IST, 0, 0, 0);
    const targetUtcMs = nextEightIst.getTime() - IST_OFFSET_MINUTES * 60 * 1000;
    return Math.max(60 * 1000, targetUtcMs - Date.now());
}

/**
 * Worker that processes a single qualification-call attempt.
 * Mounted at startup via initQualificationCallWorker().
 */
export async function processCallAttempt(job: Job): Promise<void> {
    const { dealId, attempt } = job.data as { dealId: string; attempt: number };

    const deal = await prisma.transaction.findUnique({
        where: { id: dealId },
        include: {
            demand_contact: { select: { phone_number: true, name: true } },
            coordinator: { select: { phone: true } },
        },
    });

    if (!deal) {
        logger.warn(`[QualCall] Deal ${dealId} vanished — halting cadence`);
        return;
    }
    if (deal.status !== 'NEW') {
        logger.info(`[QualCall] Deal ${dealId} no longer NEW (now ${deal.status}) — halting cadence`);
        return;
    }
    if (deal.ai_paused) {
        logger.info(`[QualCall] Deal ${dealId} AI paused by team — skipping call attempt ${attempt}`);
        return;
    }
    // Back off 30 min if team member already manually called this lead
    if (deal.last_team_action_at && Date.now() - deal.last_team_action_at.getTime() < 30 * 60 * 1000) {
        logger.info(`[QualCall] Deal ${dealId} team acted recently — re-queuing attempt ${attempt} in 30 min`);
        await scheduledJobsQueue.add(
            JOB_NAME,
            { dealId, attempt },
            { delay: 30 * 60 * 1000, jobId: `qualcall:${dealId}:${attempt}:backoff` },
        );
        return;
    }
    if (!deal.demand_contact?.phone_number) {
        logger.warn(`[QualCall] Deal ${dealId} has no demand_contact phone — halting cadence`);
        return;
    }

    const customerPhone = deal.demand_contact.phone_number;
    const customerName = deal.demand_contact.name || 'Customer';
    // Phase 5: legacy demand_property_type column dropped — derive a label from
    // canonical demand_schema_values for manager-alert blurbs below.
    const demandSchema = ((deal as any).demand_schema_values ?? {}) as Record<string, any>;
    const propertyLabel = (typeof demandSchema.property_type === 'string' && demandSchema.property_type)
        || (typeof demandSchema.type === 'string' && demandSchema.type)
        || 'property';

    // ── Omnidim fallback: when calling provider isn't configured, route to WhatsApp template ──
    // Without this, every NEW deal silently logs 8 fake "call attempts" over hours with the
    // customer hearing nothing. Send a real intro template + alert manager once, then halt cadence.
    if (!isOmnidimConfigured()) {
        if (attempt === 1) {
            // First attempt: send intro + tell manager to take it from here.
            try {
                await whatsapp.sendTemplate(customerPhone, 'rp_buyer_lead_received', { name: customerName });
                logger.info(`[QualCall] Omnidim not configured — sent rp_buyer_lead_received to ${customerPhone} as fallback`);
            } catch (err) {
                logger.warn(`[QualCall] Fallback template send failed for ${customerPhone}:`, err);
            }

            if (deal.coordinator?.phone) {
                try {
                    await whatsapp.sendTemplate(deal.coordinator.phone, 'rp_callback_manager_alert', {
                        name: customerName,
                        callback_time: 'NOW — Omnidim not configured, please call manually',
                        requirement: `${propertyLabel} in ${deal.demand_location || 'requested area'}`,
                    });
                } catch (err) {
                    logger.warn(`[QualCall] Manager alert send failed:`, err);
                }
            }

            await prisma.interaction.create({
                data: {
                    tenant_id: deal.tenant_id,
                    phone_number: customerPhone,
                    channel: 'whatsapp',
                    direction: 'outbound',
                    event_type: EVT_CALL_ATTEMPT,
                    content: `Omnidim fallback — sent intro template + alerted manager`,
                    metadata: { deal_id: dealId, attempt, provider: 'fallback_whatsapp', stub: true },
                },
            });
        } else {
            logger.info(`[QualCall] Omnidim not configured — skipping attempt ${attempt} for deal ${dealId} (fallback already sent)`);
        }
        // Halt cadence — no point looping when no calling provider exists.
        return;
    }

    // Stub: trigger Omnidim outbound call. Replace with real HTTP POST when creds arrive.
    await triggerOmnidimCall({
        dealId,
        phone: customerPhone,
        attempt,
        customerName,
    });

    // Log the attempt
    await prisma.interaction.create({
        data: {
            tenant_id: deal.tenant_id,
            phone_number: customerPhone,
            channel: 'voice',
            direction: 'outbound',
            event_type: EVT_CALL_ATTEMPT,
            content: `AI qualification call attempt #${attempt}`,
            metadata: { deal_id: dealId, attempt, provider: 'omnidim', stub: false },
        },
    });

    // After attempt #2 (1hr-mark): send rp_call_attempted to customer + alert lead manager.
    if (attempt === 2) {
        try {
            await whatsapp.sendTemplate(customerPhone, 'rp_call_attempted', { name: customerName });
        } catch (err) {
            logger.warn(`[QualCall] rp_call_attempted send failed for ${customerPhone}:`, err);
        }
        if (deal.coordinator?.phone) {
            try {
                await whatsapp.sendTemplate(deal.coordinator.phone, 'rp_callback_manager_alert', {
                    name: customerName,
                    callback_time: 'Pending — customer not reached',
                    requirement: `${propertyLabel} in ${deal.demand_location || 'requested area'}`,
                });
            } catch (err) {
                logger.warn(`[QualCall] manager alert send failed:`, err);
            }
        }
    }

    // Schedule the next attempt (worker recurses).
    await scheduleQualificationCall(dealId, attempt);
}

/**
 * Returns true when the Omnidim outbound calling provider is configured (API key present).
 * When false, processCallAttempt sends a WhatsApp intro template once and halts the cadence
 * instead of pretending to call.
 */
function isOmnidimConfigured(): boolean {
    // A key cannot turn a logging stub into a verified provider adapter.
    return false;
}

/**
 * Stub for the Omnidim outbound-call trigger. Real implementation will:
 *   - HTTP POST to Omnidim's call-trigger endpoint with bot_id, phone, deal_id, callback URL.
 *   - On success, log Omnidim's call_id in metadata so webhook events can be correlated.
 *
 * For now: log only. Webhook receiver (`POST /webhooks/omnidim`) is already deployed
 * and ready to consume call results when Omnidim is wired up.
 */
async function triggerOmnidimCall(args: {
    dealId: string; phone: string; attempt: number; customerName: string;
}): Promise<void> {
    throw new Error('Omnidim outbound adapter is disabled pending verified provider contract');
}

let workerInstance: Worker | null = null;

export function initQualificationCallWorker(): void {
    if (workerInstance) return;
    workerInstance = new Worker(
        QUEUE_NAME,
        async (job) => {
            if (job.name !== JOB_NAME) return;
            await processCallAttempt(job);
        },
        { connection: redisConnection, concurrency: 4 },
    );
    workerInstance.on('failed', (job, err) => {
        logger.error(`[QualCall] Job ${job?.id} failed:`, err);
        SentrySDK.captureException(err, {
            tags: { worker: 'lead_qualification_caller', job: job?.name ?? 'unknown' },
            extra: { jobId: job?.id, attemptsMade: job?.attemptsMade, data: job?.data },
        });
    });
    logger.info('[QualCall] Qualification call worker started');
}
