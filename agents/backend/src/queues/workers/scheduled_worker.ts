/**
 * Scheduled Jobs Worker — BullMQ worker for cron/repeatable jobs.
 *
 * Replaces fragile setTimeout/setInterval-based scheduling with persistent
 * BullMQ repeatable jobs. Jobs survive restarts and auto-retry on failure.
 *
 * Jobs dispatched to existing business logic functions (no business logic changes).
 */

import { Worker, Job } from 'bullmq';
import { scheduledJobsQueue } from '../index';
import { redisConnection } from '../connection';
import logger from '../../utils/logger';
import { alertCritical } from '../../utils/alerter';

let worker: Worker | null = null;

/**
 * Register all repeatable jobs and start the worker.
 * Call once from server.ts on the primary PM2 instance.
 *
 * IST to UTC conversions:
 *   2:00 AM IST = 20:30 UTC (previous day)
 *   3:00 AM IST = 21:30 UTC (previous day)
 *   9:00 AM IST =  3:30 UTC
 *   9:00 PM IST = 15:30 UTC
 *  12:00 AM IST = 18:30 UTC (previous day)
 */
export async function startScheduledWorker(): Promise<void> {
    if (worker) {
        logger.warn('[ScheduledWorker] Worker already running');
        return;
    }

    // ─── Register Repeatable Jobs ────────────────────────────────────────────
    // Note: upsertJobScheduler is idempotent — safe to call on every restart.

    // 1. Pending actions check (every 60 seconds)
    await scheduledJobsQueue.upsertJobScheduler(
        'pending-actions',
        { every: 60000 },
        { name: 'pending-actions' },
    );

    // 2. Daily report (9:00 PM IST = 15:30 UTC)
    await scheduledJobsQueue.upsertJobScheduler(
        'daily-report',
        { pattern: '30 15 * * *' },
        { name: 'daily-report' },
    );

    // 3. Subscription expiry check (12:00 AM IST = 18:30 UTC prev day)
    await scheduledJobsQueue.upsertJobScheduler(
        'subscription-expiry',
        { pattern: '30 18 * * *' },
        { name: 'subscription-expiry' },
    );

    // 4. QA Health Report (9:00 AM IST = 3:30 UTC)
    await scheduledJobsQueue.upsertJobScheduler(
        'qa-health-report',
        { pattern: '30 3 * * *' },
        { name: 'qa-health-report' },
    );

    // 5. QA Data Integrity Check (3:00 AM IST = 21:30 UTC prev day)
    await scheduledJobsQueue.upsertJobScheduler(
        'qa-integrity-check',
        { pattern: '30 21 * * *' },
        { name: 'qa-integrity-check' },
    );

    // 6. AI Boss Daily Cycle (2:00 AM IST = 20:30 UTC prev day)
    await scheduledJobsQueue.upsertJobScheduler(
        'ai-boss-cycle',
        { pattern: '30 20 * * *' },
        { name: 'ai-boss-cycle' },
    );

    // 7. Follow-up check (every hour)
    await scheduledJobsQueue.upsertJobScheduler(
        'followup-check',
        { every: 3600000 },
        { name: 'followup-check' },
    );

    // 8. Call processor (every 10 seconds — polls for pending transcriptions)
    await scheduledJobsQueue.upsertJobScheduler(
        'call-processor',
        { every: 10000 },
        { name: 'call-processor' },
    );

    // 9. Interaction Engine triggers (every hour)
    await scheduledJobsQueue.upsertJobScheduler(
        'interaction-triggers',
        { every: 3600000 },
        { name: 'interaction-triggers' },
    );

    // 10. Security Agent scan (every hour)
    await scheduledJobsQueue.upsertJobScheduler(
        'security-scan',
        { every: 3600000 },
        { name: 'security-scan' },
    );

    // 11. 99acres Lead Poller (every 10 minutes)
    await scheduledJobsQueue.upsertJobScheduler(
        '99acres-poll',
        { every: 600000 },
        { name: '99acres-poll' },
    );

    // 12. Housing.com Lead Poller (every 10 minutes)
    await scheduledJobsQueue.upsertJobScheduler(
        'housing-poll',
        { every: 600000 },
        { name: 'housing-poll' },
    );

    logger.info('[ScheduledWorker] All repeatable jobs registered');

    // ─── Start Worker ────────────────────────────────────────────────────────
    worker = new Worker(
        'scheduled-jobs',
        async (job) => {
            logger.info(`[ScheduledWorker] Running job: ${job.name}`);
            await dispatchJob(job);
        },
        {
            connection: redisConnection,
            concurrency: 3,   // Max 3 cron jobs running in parallel
        },
    );

    worker.on('completed', (job) => {
        logger.info(`[ScheduledWorker] Job ${job.name} completed`);
    });

    worker.on('failed', (job, err) => {
        logger.error(`[ScheduledWorker] Job ${job?.name} failed: ${err.message}`);

        if (job && job.attemptsMade >= (job.opts?.attempts || 2)) {
            alertCritical(
                'scheduled_job_failed',
                `Scheduled job "${job.name}" failed after ${job.attemptsMade} attempts`,
                { jobName: job.name, error: err.message },
            );
        }
    });

    worker.on('error', (err) => {
        logger.error('[ScheduledWorker] Worker error:', err.message);
    });

    logger.info('[ScheduledWorker] Started with concurrency=3');
}

/**
 * Dispatch a job to the appropriate business logic function.
 * Uses lazy imports to avoid loading everything at startup.
 */
async function dispatchJob(job: Job): Promise<void> {
    const jobName = job.name;
    switch (jobName) {
        case 'pending-actions': {
            const prisma = (await import('../../db')).default;
            const { DecisionEngine } = await import('../../services/decision_engine');
            const engine = new DecisionEngine();
            const now = new Date();
            const pendingContacts = await prisma.contact.findMany({
                where: { next_action_at: { lte: now } }
            });
            for (const contact of pendingContacts) {
                await engine.executeNextAction(contact);
                await prisma.contact.update({
                    where: { phone_number: contact.phone_number },
                    data: { next_action_at: null }
                });
            }
            break;
        }

        case 'daily-report': {
            const prisma = (await import('../../db')).default;
            const { WhatsAppService } = await import('../../services/whatsapp');
            const wa = new WhatsAppService();
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const newLeads = await prisma.contact.count({ where: { created_at: { gte: today } } });
            const interactions = await prisma.interaction.count({ where: { created_at: { gte: today } } });
            const tenant = await prisma.tenant.findFirst();
            if (tenant) {
                await wa.sendTemplate(tenant.primary_phone, 'rp_daily_report', {
                    date: today.toLocaleDateString(),
                    leads: String(newLeads),
                    interactions: String(interactions),
                });
            }
            break;
        }

        case 'subscription-expiry': {
            const prisma = (await import('../../db')).default;
            const { WhatsAppService } = await import('../../services/whatsapp');
            const { isQuietHours: isQuiet } = await import('../../utils/quiet_hours');
            const wa = new WhatsAppService();
            const now = new Date();
            const expiredAgents = await prisma.partnerAgent.findMany({
                where: { subscription_end: { lt: now }, status: 'ACTIVE' }
            });
            for (const agent of expiredAgents) {
                await prisma.partnerAgent.update({
                    where: { id: agent.id },
                    data: { status: 'EXPIRED' }
                });
                // Only send notification outside quiet hours (9PM-8AM IST)
                if (!isQuiet()) {
                    await wa.sendTemplate(agent.phone_number, 'rp_subscription_expiry', {});
                }
            }
            break;
        }

        case 'qa-health-report': {
            const { QAAgent } = await import('../../agents/qa_agent');
            const qa = new QAAgent();
            await qa.sendDailyHealthReport();
            break;
        }

        case 'qa-integrity-check': {
            const { QAAgent } = await import('../../agents/qa_agent');
            const qa = new QAAgent();
            const issues = await qa.checkDataIntegrity();
            if (issues.length > 0) {
                logger.warn(`[ScheduledWorker] Data integrity: ${issues.length} issue(s)`);
            }
            break;
        }

        case 'ai-boss-cycle': {
            const { AIBoss } = await import('../../services/ai_boss');
            const boss = new AIBoss();
            await boss.runDailyCycle();
            break;
        }

        case 'followup-check': {
            const { FollowupScheduler } = await import('../../services/followup_scheduler');
            const scheduler = new FollowupScheduler();
            await scheduler.checkAndFollowUp();
            break;
        }

        case 'call-processor': {
            const prisma = (await import('../../db')).default;
            const transcriptionService = (await import('../../services/transcription')).default;
            const callExtractor = (await import('../../services/call_extractor')).default;

            const pendingCalls = await prisma.staffCall.findMany({
                where: { status: 'PROCESSING', recording_url: { not: null } },
                take: 2,
            });

            for (const call of pendingCalls) {
                try {
                    // Transcribe
                    const transcription = await transcriptionService.transcribeAudio(
                        call.recording_url!,
                        { language: 'auto' },
                    );
                    if (!transcription?.text) continue;

                    await prisma.staffCall.update({
                        where: { id: call.id },
                        data: { transcript: transcription.text, status: 'TRANSCRIBED' },
                    });

                    // Extract
                    const extracted = await callExtractor.extractFromTranscript(
                        transcription.text,
                        call.phone_number,
                    );

                    await prisma.staffCall.update({
                        where: { id: call.id },
                        data: {
                            ai_extraction: extracted as any,
                            confidence_score: extracted.confidence,
                            status: 'READY_FOR_REVIEW',
                        },
                    });
                } catch (err) {
                    logger.error(`[ScheduledWorker] Call processing failed: ${call.id}`, err);
                    await prisma.staffCall.update({
                        where: { id: call.id },
                        data: { status: 'REJECTED', transcript: `Processing failed: ${(err as Error).message}` },
                    }).catch(() => {});
                }
            }
            break;
        }

        case 'interaction-triggers': {
            const { InteractionEngine } = await import('../../services/interaction_engine');
            const engine = new InteractionEngine();
            await engine.runTriggerCheck();
            break;
        }

        case 'security-scan': {
            const { SecurityAgent } = await import('../../agents/security_agent');
            const agent = new SecurityAgent();
            await agent.runAnomalyScan();
            break;
        }

        case '99acres-poll': {
            const prismaDb = (await import('../../db')).default;
            const { NinetyNineAcresPoller } = await import('../../services/ninety_nine_acres_poller');
            const poller = new NinetyNineAcresPoller();
            if (!poller.isConfigured()) {
                logger.debug('[ScheduledWorker] 99acres: not configured, skipping');
                break;
            }

            // Exponential backoff: skip if too soon after consecutive failures
            const sync = await prismaDb.integrationSync.findUnique({ where: { source: '99acres' } });
            const failures = sync?.consecutive_failures || 0;
            if (failures > 0 && sync?.last_attempt) {
                const backoffMs = Math.min(failures * 600000, 7200000); // 10min per failure, max 2hr
                const elapsed = Date.now() - new Date(sync.last_attempt).getTime();
                if (elapsed < backoffMs) {
                    logger.debug(`[ScheduledWorker] 99acres: backoff active (${failures} failures, wait ${Math.round(backoffMs / 60000)}min), skipping`);
                    break;
                }
            }

            try {
                const result = await poller.poll();
                logger.info(`[ScheduledWorker] 99acres poll: ${result.fetched} fetched, ${result.new} new, ${result.updated} updated`);
            } catch (err) {
                // Poller already updates IntegrationSync on failure — just log, don't re-throw
                logger.error(`[ScheduledWorker] 99acres poll failed: ${(err as Error).message}`);
            }
            break;
        }

        case 'housing-poll': {
            const { HousingPoller } = await import('../../services/housing_poller');
            const poller = new HousingPoller();
            if (poller.isConfigured()) {
                const result = await poller.poll();
                logger.info(`[ScheduledWorker] Housing.com poll: ${result.fetched} fetched, ${result.new} new, ${result.updated} updated`);
            } else {
                logger.debug('[ScheduledWorker] Housing.com: not configured, skipping');
            }
            break;
        }

        case 'lead-escalation': {
            // Fired 20 minutes after a new lead is assigned.
            // If the agent has not contacted the lead, re-assign to super_boss and notify.
            const prisma = (await import('../../db')).default;
            const { notify } = await import('../../services/notify');

            const { phone_number, assigned_agent_id, lead_name, property_label, assigned_at } = job.data as {
                phone_number: string;
                assigned_agent_id: string;
                lead_name: string | null;
                property_label: string | null;
                assigned_at: string;
            };

            // Check 1: Any outbound interaction in the last 25 min?
            // 25 min window = 20 min delay + 5 min buffer for processing lag
            const lookbackFrom = new Date(Date.now() - 25 * 60 * 1000);
            const agentInteraction = await prisma.interaction.findFirst({
                where: { phone_number, direction: 'outbound', created_at: { gte: lookbackFrom } },
            });
            if (agentInteraction) {
                logger.info(`[EscalationCheck] ${phone_number} acknowledged (outbound interaction found) — no escalation`);
                break;
            }

            // Check 2: Has the agent manually changed lead status from 'warm'?
            const contact = await prisma.contact.findUnique({
                where: { phone_number },
                select: { lead_status: true },
            });
            if (!contact) {
                logger.warn(`[EscalationCheck] Contact not found for ${phone_number} — skipping`);
                break;
            }
            if (contact.lead_status !== 'warm') {
                logger.info(`[EscalationCheck] ${phone_number} status is '${contact.lead_status}' — no escalation`);
                break;
            }

            // Escalate: re-assign to super_boss and notify
            logger.warn(`[EscalationCheck] ${phone_number} not contacted in 20 min — escalating to super_boss`);

            const superBoss = await prisma.agent.findFirst({
                where: { role: 'super_boss', status: 'active' },
                select: { id: true, name: true, email: true, phone: true },
            });
            if (!superBoss) {
                logger.error('[EscalationCheck] No active super_boss found — cannot escalate');
                break;
            }

            await prisma.contact.update({
                where: { phone_number },
                data: { assigned_agent_id: superBoss.id },
            });

            const originalAgent = await prisma.agent.findUnique({
                where: { id: assigned_agent_id },
                select: { name: true },
            });

            notify('lead_escalation', [{
                id: superBoss.id,
                type: 'agent' as const,
                phone: superBoss.phone ?? undefined,
                email: superBoss.email,
                name: superBoss.name,
            }], {
                phone_number,
                lead_name: lead_name || 'Unknown',
                property_label: property_label || 'N/A',
                original_agent_name: originalAgent?.name || 'Unknown Agent',
                assigned_at,
            }).catch(err => logger.warn('[EscalationCheck] notify failed:', (err as Error).message));

            logger.info(`[EscalationCheck] Lead ${phone_number} escalated to super_boss ${superBoss.name}`);
            break;
        }

        // ─── Workflow Task Jobs ─────────────────────────────────────

        case 'workflow-snooze-reminder': {
            const { task_id, agent_id, contact_phone } = job.data;
            const prismaDb = (await import('../../db')).default;
            const { notify } = await import('../../services/notify');

            const task = await prismaDb.task.findUnique({ where: { id: task_id }, select: { id: true, title: true, snoozed_until: true, status: true } });
            if (!task || task.status === 'DONE') break;

            const agent = await prismaDb.agent.findUnique({ where: { id: agent_id }, select: { id: true, name: true, phone: true, email: true } });
            if (agent) {
                notify('workflow_snooze_expired', [
                    { id: agent.id, type: 'agent', phone: agent.phone ?? undefined, email: agent.email, name: agent.name },
                ], { task_id, title: task.title, contact_phone });
            }
            logger.info(`[WorkflowWorker] Snooze reminder sent for task ${task_id}`);
            break;
        }

        case 'workflow-snooze-escalation': {
            const { task_id, agent_id, contact_phone } = job.data;
            const prismaDb = (await import('../../db')).default;
            const { notify } = await import('../../services/notify');

            const task = await prismaDb.task.findUnique({ where: { id: task_id } });
            if (!task || task.status === 'DONE') break;

            // Find manager or super_boss to escalate to
            const manager = await prismaDb.agent.findFirst({
                where: { role: { in: ['manager', 'super_boss'] }, status: 'active' },
                select: { id: true, name: true, phone: true, email: true },
                orderBy: { role: 'asc' }, // manager first, then super_boss
            });

            if (manager) {
                await prismaDb.task.update({ where: { id: task_id }, data: { assigned_to: manager.id } });
                // Update contact assignment too
                if (contact_phone) {
                    await prismaDb.contact.update({ where: { phone_number: contact_phone }, data: { assigned_agent_id: manager.id } });
                }
                notify('workflow_escalated', [
                    { id: manager.id, type: 'agent', phone: manager.phone ?? undefined, email: manager.email, name: manager.name },
                ], { task_id, contact_name: contact_phone, original_agent: agent_id });
                logger.info(`[WorkflowWorker] Task ${task_id} escalated to ${manager.name} (${manager.role})`);
            }
            break;
        }

        case 'workflow-ai-followup': {
            const { contact_phone, deal_id, stage, template_name } = job.data;
            const prismaDb = (await import('../../db')).default;

            // Check if lead is still active (not lost/closed)
            const contact = await prismaDb.contact.findUnique({
                where: { phone_number: contact_phone },
                select: { lead_status: true, name: true },
            });
            if (!contact || contact.lead_status === 'lost' || contact.lead_status === 'closed') break;

            try {
                const { WhatsAppService } = await import('../../services/whatsapp');
                const wa = new WhatsAppService();
                const { buildTemplatePayload } = await import('../../config/whatsapp_templates');
                const payload = buildTemplatePayload(template_name, { name: contact.name || 'there' });
                if (payload) {
                    await wa.sendTemplate(contact_phone, template_name, payload.params || []);
                    logger.info(`[WorkflowWorker] AI follow-up sent: ${template_name} → ${contact_phone}`);
                }
            } catch (err) {
                logger.warn(`[WorkflowWorker] AI follow-up failed: ${(err as Error).message}`);
            }
            break;
        }

        default:
            logger.warn(`[ScheduledWorker] Unknown job: ${jobName}`);
    }
}

/**
 * Gracefully close the worker. Call from graceful shutdown handler.
 */
export async function stopScheduledWorker(): Promise<void> {
    if (worker) {
        await worker.close();
        worker = null;
        logger.info('[ScheduledWorker] Stopped');
    }
}
