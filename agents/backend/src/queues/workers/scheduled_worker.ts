/**
 * Scheduled Jobs Worker — BullMQ worker for cron/repeatable jobs.
 *
 * Replaces fragile setTimeout/setInterval-based scheduling with persistent
 * BullMQ repeatable jobs. Jobs survive restarts and auto-retry on failure.
 *
 * Jobs dispatched to existing business logic functions (no business logic changes).
 */

import { Worker, Job } from 'bullmq';
import * as SentrySDK from '@sentry/node';
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

    // 4b. Panditji Daily Briefing (9:00 AM IST = 3:30 UTC)
    // Sends WhatsApp text snapshot (yesterday's leads, deals, top performer, stuck deals) to every active super_boss.
    await scheduledJobsQueue.upsertJobScheduler(
        'panditji-daily-briefing',
        { pattern: '30 3 * * *' },
        { name: 'panditji-daily-briefing' },
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
    await scheduledJobsQueue.upsertJobScheduler(
        'call-audio-retention',
        { pattern: '0 2 * * *' },
        { name: 'call-audio-retention' },
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

    // 11. 99acres Lead Poller (every 12 minutes)
    // 12 min ≈ 5 calls/hr — leaves headroom under 99acres' hard 6-requests/hour limit so
    // catch-up chunks / diagnostics don't trip ERROR-0007. (Was 10 min = exactly 6/hr, no slack.)
    await scheduledJobsQueue.upsertJobScheduler(
        '99acres-poll',
        { every: 720000 },
        { name: '99acres-poll' },
    );

    // 12. Housing.com Lead Poller (every 10 minutes)
    await scheduledJobsQueue.upsertJobScheduler(
        'housing-poll',
        { every: 600000 },
        { name: 'housing-poll' },
    );

    // 13. WhatsApp 24h Session Keep-Alive (every 30 minutes)
    // Checks contacts whose last inbound message is approaching 22h mark.
    // Sends a contextual keep-alive message with reply button to prevent session expiry.
    await scheduledJobsQueue.upsertJobScheduler(
        'session-keepalive',
        { every: 1800000 }, // 30 min
        { name: 'session-keepalive' },
    );

    // 13b. WhatsApp safety-net backstop sweep (every 15 minutes) — 2026-07-13.
    // A 60-day audit found 146 stale inbound messages (BUYER/TENANT/LANDLORD/UNKNOWN/
    // PARTNER_AGENT) with zero outbound reply logged, even though the inline safety net
    // in webhook_processor.ts is meant to guarantee an ack — the inline guard alone isn't
    // catching everything. This sweep re-checks for anything it missed.
    await scheduledJobsQueue.upsertJobScheduler(
        'whatsapp-safety-net-sweep',
        { every: 900000 }, // 15 min
        { name: 'whatsapp-safety-net-sweep' },
    );

    // 14. Partner upload nudge (every hour)
    // Partners who registered 23-25h ago with zero inventory get a nudge to upload.
    await scheduledJobsQueue.upsertJobScheduler(
        'partner-upload-nudge',
        { every: 3600000 },
        { name: 'partner-upload-nudge' },
    );

    // 15. Partner upload reminder (every hour)
    // Partners who got a nudge 71-73h ago and still have zero inventory get a reminder.
    await scheduledJobsQueue.upsertJobScheduler(
        'partner-upload-reminder',
        { every: 3600000 },
        { name: 'partner-upload-reminder' },
    );

    // 16. Meta catalog reconcile (3:30 AM IST = 22:00 UTC prev day)
    await scheduledJobsQueue.upsertJobScheduler(
        'catalog-reconcile',
        { pattern: '0 22 * * *' },
        { name: 'catalog-reconcile' },
    );

    // 17. Pending messages cleanup (4:00 AM IST = 22:30 UTC prev day)
    // Deletes expired + sent rows so the queue doesn't grow unbounded.
    await scheduledJobsQueue.upsertJobScheduler(
        'pending-messages-cleanup',
        { pattern: '30 22 * * *' },
        { name: 'pending-messages-cleanup' },
    );

    // 18. Behavior auditor — rule-based bot behavior audit (9:30 AM IST = 4:00 UTC)
    // Runs R1-R9 deterministic checks across last 24h, persists to audit_reports,
    // sends digest + critical WhatsApp alerts to super_boss agents.
    await scheduledJobsQueue.upsertJobScheduler(
        'behavior-audit',
        { pattern: '0 4 * * *' },
        { name: 'behavior-audit' },
    );

    // 19. Callback/Visit SLA regression report (8:30 AM IST = 3:00 UTC).
    // Cross-checks property_card_*_request interactions in last 24h vs tasks
    // created. Alerts super_boss if any signals lack a matching task — that's
    // the regression signal the 2026-05-12 task-routing fix is meant to prevent.
    await scheduledJobsQueue.upsertJobScheduler(
        'callback-sla-report',
        { pattern: '0 3 * * *' },
        { name: 'callback-sla-report' },
    );

    // Consolidated owner digest (2026-05-19) — the ONLY routine super_boss
    // WhatsApp. 08:00 IST = 02:30 UTC, 20:00 IST = 14:30 UTC. Replaces the
    // scattered odd-hour reports + per-finding/per-error alerts.
    // See docs/plans/2026-05-19-report-cadence-and-bot-reply.md
    await scheduledJobsQueue.upsertJobScheduler(
        'owner-digest-am',
        { pattern: '30 2 * * *' },
        { name: 'owner-digest-am' },
    );
    await scheduledJobsQueue.upsertJobScheduler(
        'owner-digest-pm',
        { pattern: '30 14 * * *' },
        { name: 'owner-digest-pm' },
    );

    // Self-set deal reminders (T8) — fires push + WhatsApp to the member at
    // their reminder time with the customer name/phone/note. Was previously
    // ONLY wired into the legacy node-cron (BullMQ-down fallback) so it never
    // ran in prod. See docs/plans/2026-05-18-google-calendar-task-reminder-sync.md
    await scheduledJobsQueue.upsertJobScheduler(
        'reminder-task-alerts',
        { every: 300000 }, // every 5 min
        { name: 'reminder-task-alerts' },
    );

    // P3: reconcile/backfill member reminders + visit appointments into their
    // own Google Calendar/Tasks — covers every appointment.create site and
    // items created before the member connected Google.
    await scheduledJobsQueue.upsertJobScheduler(
        'google-reconcile-sync',
        { every: 300000 }, // every 5 min
        { name: 'google-reconcile-sync' },
    );

    // Daily Lead Recycler — 9:00 AM IST. ⚠️ TZ GOTCHA: this server runs in Asia/Calcutta (TZ unset
    // → system local) and BullMQ/cron-parser uses LOCAL time, so these patterns are IST hours, NOT
    // UTC (the older "= X UTC" comments in this file are mislabeled — they actually fire at the IST
    // hour shown). So 9 AM IST = '0 9 * * *'. Drains the un-worked lead stock: 10 oldest un-converted
    // leads per active SALES agent → fresh deal + customer card (if matchable), once each. Excludes
    // super_boss/owner/developer numbers. See docs/plans/2026-06-12-daily-lead-recycler.md
    await scheduledJobsQueue.upsertJobScheduler(
        'lead-recycler',
        { pattern: '0 9 * * *' },
        { name: 'lead-recycler' },
    );

    // Deal-pipeline crons (2026-06-23). These lived ONLY in pipeline_crons.ts (node-cron), which runs
    // only via the dead BullMQ-down fallback → they never fired in prod (see feedback_legacy_cron_is_dead).
    // Registered here so they actually run. Patterns are IST-local (this worker fires at the pattern's
    // IST time, per the lead-recycler TZ note above); 30-min cadences use `every`.
    // (P-E, 2026-06-23) cold-lead-nudge now has a per-run cap (COLD_NUDGE_CAP=25) so first activation can't
    // blast all ~255 QUALIFIED customers at once; manager schedule/briefing are internal-only. All live.
    await scheduledJobsQueue.upsertJobScheduler('pipeline-visit-reminders', { every: 1800000 }, { name: 'pipeline-visit-reminders' });
    await scheduledJobsQueue.upsertJobScheduler('pipeline-post-visit-followup', { every: 1800000 }, { name: 'pipeline-post-visit-followup' });
    await scheduledJobsQueue.upsertJobScheduler('pipeline-negotiation-nudge', { pattern: '10 9 * * *' }, { name: 'pipeline-negotiation-nudge' });
    await scheduledJobsQueue.upsertJobScheduler('pipeline-inactivity-sweep', { pattern: '15 9 * * *' }, { name: 'pipeline-inactivity-sweep' });
    await scheduledJobsQueue.upsertJobScheduler('pipeline-cold-lead-nudge', { pattern: '20 10 * * *' }, { name: 'pipeline-cold-lead-nudge' });
    await scheduledJobsQueue.upsertJobScheduler('pipeline-manager-schedule', { pattern: '0 8 * * *' }, { name: 'pipeline-manager-schedule' });
    await scheduledJobsQueue.upsertJobScheduler('pipeline-manager-briefing', { every: 1800000 }, { name: 'pipeline-manager-briefing' });
    await scheduledJobsQueue.upsertJobScheduler('shortage-surveys', { pattern: '30 8 * * *', tz: 'Asia/Kolkata' }, { name: 'shortage-surveys' });
    await scheduledJobsQueue.upsertJobScheduler('shortage-refresh-recovery', { every: 60000 }, { name: 'shortage-refresh-recovery' });

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

        // Report to GlitchTip so we can see scheduled-job failures alongside other server errors.
        SentrySDK.captureException(err, {
            tags: { worker: 'scheduled', job: job?.name ?? 'unknown' },
            extra: { jobId: job?.id, attemptsMade: job?.attemptsMade, maxAttempts: job?.opts?.attempts },
        });

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
        SentrySDK.captureException(err, { tags: { worker: 'scheduled', source: 'worker.error' } });
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
        case 'lead-recycler': {
            // Daily Lead Recycler — drain un-worked stock (10 oldest un-converted leads/agent → fresh deal + card, once each).
            const { runDailyRecycle } = await import('../../services/lead_recycler');
            const r = await runDailyRecycle({});
            logger.info(`[ScheduledWorker] lead-recycler: ${JSON.stringify(r)}`);
            break;
        }
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
            // 2026-05-19: standalone 9 PM owner report retired — folded into
            // the consolidated 08:00/20:00 owner_digest (no extra WhatsApp).
            logger.info('[ScheduledWorker] daily-report retired → owner_digest (08:00/20:00 IST)');
            break;
        }

        case 'subscription-expiry': {
            // 2026-05-15: Business model changed to commission-on-sale (no subscription tiers).
            // This handler is intentionally a no-op now. Job registration kept so the scheduler
            // doesn't error on missing cases; logic disabled so we don't flip partners to EXPIRED.
            logger.info('[ScheduledWorker] subscription-expiry no-op — commission-on-sale model active');
            break;
        }

        case 'qa-health-report': {
            // 2026-05-19: standalone 9 AM QA health WhatsApp retired — system
            // health now surfaces in the consolidated owner_digest only.
            logger.info('[ScheduledWorker] qa-health-report retired → owner_digest');
            break;
        }

        case 'panditji-daily-briefing': {
            // 2026-05-19: standalone 9:30 AM briefing retired — folded into
            // the consolidated 08:00/20:00 owner_digest (no extra WhatsApp).
            logger.info('[ScheduledWorker] panditji-daily-briefing retired → owner_digest');
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

        case 'reminder-task-alerts': {
            // Self-set deal follow-up reminders (T8): push + WhatsApp with the
            // customer name/phone/note at the member's chosen time.
            const { sendReminderTaskAlerts } = await import('../../services/notification_crons');
            await sendReminderTaskAlerts();
            break;
        }

        case 'google-reconcile-sync': {
            // P3: backfill/repair member reminders + visit appointments into
            // their connected Google Calendar/Tasks.
            const { reconcileGoogleSync } = await import('../../services/google_sync');
            await reconcileGoogleSync();
            break;
        }

        // ─── Deal-pipeline crons (2026-06-23) — moved here from the dead pipeline_crons.ts node-cron ───
        case 'pipeline-visit-reminders': {
            const { runVisitReminders } = await import('../../services/pipeline_crons');
            await runVisitReminders();
            break;
        }
        case 'pipeline-post-visit-followup': {
            const { runPostVisitFollowup } = await import('../../services/pipeline_crons');
            await runPostVisitFollowup();
            break;
        }
        case 'pipeline-negotiation-nudge': {
            const { runNegotiationNudge } = await import('../../services/pipeline_crons');
            await runNegotiationNudge();
            break;
        }
        case 'pipeline-inactivity-sweep': {
            const { runInactivitySweep } = await import('../../services/pipeline_crons');
            await runInactivitySweep();
            break;
        }
        case 'pipeline-cold-lead-nudge': {
            const { runColdLeadNudge } = await import('../../services/pipeline_crons');
            await runColdLeadNudge();
            break;
        }
        case 'pipeline-manager-schedule': {
            const { runManagerDailySchedule } = await import('../../services/pipeline_crons');
            await runManagerDailySchedule();
            break;
        }
        case 'pipeline-manager-briefing': {
            const { runManager24hrBriefing } = await import('../../services/pipeline_crons');
            await runManager24hrBriefing();
            break;
        }
        case 'shortage-surveys': {
            const { createDailySurveyTasks } = await import('../../services/shortage_book');
            await createDailySurveyTasks();
            break;
        }
        case 'shortage-refresh':
        case 'shortage-refresh-recovery': {
            const { processPendingShortageRefreshes } = await import('../../services/shortage_book');
            await processPendingShortageRefreshes(job.data?.tenantId);
            break;
        }

        case 'call-processor': {
            const prisma = (await import('../../db')).default;
            const { processStaffCall, recoverExhaustedStaffCalls } = await import('../../services/staff_call_processing');

            const { recoverCallFollowups } = await import('../../services/call_followup');
            await recoverCallFollowups();
            await recoverExhaustedStaffCalls();
            const pendingCalls = await prisma.staffCall.findMany({
                where: { processing_attempts: { lt: 3 }, recording_url: { not: null }, OR: [
                    { status: 'PROCESSING', processing_claim_token: null },
                    { status: 'TRANSCRIBED', processing_claimed_at: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
                    { status: 'TRANSCRIBED', processing_claimed_at: null },
                ] }, take: 2,
            });

            for (const call of pendingCalls) {
                try {
                    await processStaffCall(call.id);
                } catch (err) {
                    logger.error(`[ScheduledWorker] Call processing failed: ${call.id}`, err);
                    // processStaffCall persists token-scoped retry state itself.
                }
            }
            break;
        }

        case 'call-audio-retention': {
            const { cleanupOldRecordings } = await import('../../services/audio_storage');
            await cleanupOldRecordings();
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
            const prismaDb = (await import('../../db')).default;
            const { HousingPoller } = await import('../../services/housing_poller');
            const poller = new HousingPoller();
            if (!poller.isConfigured()) {
                logger.debug('[ScheduledWorker] Housing.com: not configured, skipping');
                break;
            }

            // Exponential backoff: skip if too soon after consecutive failures (mirrors 99acres).
            const sync = await prismaDb.integrationSync.findUnique({ where: { source: 'housing' } });
            const failures = sync?.consecutive_failures || 0;
            if (failures > 0 && sync?.last_attempt) {
                const backoffMs = Math.min(failures * 600000, 7200000); // 10min/failure, max 2hr
                const elapsed = Date.now() - new Date(sync.last_attempt).getTime();
                if (elapsed < backoffMs) {
                    logger.debug(`[ScheduledWorker] Housing: backoff active (${failures} failures, wait ${Math.round(backoffMs / 60000)}min), skipping`);
                    break;
                }
            }

            try {
                const result = await poller.poll();
                logger.info(`[ScheduledWorker] Housing.com poll: ${result.fetched} fetched, ${result.new} new, ${result.updated} updated`);
            } catch (err) {
                // Poller already marked IntegrationSync failed — just log, don't re-throw.
                logger.error(`[ScheduledWorker] Housing.com poll failed: ${(err as Error).message}`);
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
                data: { assigned_agent_id: superBoss.id, assignment_method: 'other' }, // Phase 5C — SLA escalation
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
                    await prismaDb.contact.update({ where: { phone_number: contact_phone }, data: { assigned_agent_id: manager.id, assignment_method: 'other' } }); // Phase 5C — workflow escalation
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

        case 'session-keepalive': {
            // ⚠ KILL SWITCH (2026-08-07). This job blasts `rp_reopen_session` at every contact
            // whose session is about to lapse — with no opt-out filter, no per-run cap and no
            // dedup marker. It is nearly a no-op TODAY only because `last_wa_inbound` was
            // never being stamped for new contacts (the SessionTracker.markInbound race). The
            // moment that field gets backfilled this job wakes up and fires at the whole
            // backfilled population in one run. Default OFF; enable only after watching the
            // candidate count. See the Phase 2 → Phase 4 ordering constraint.
            if (process.env.SESSION_KEEPALIVE_ENABLED !== 'true') {
                logger.info('[SessionKeepAlive] DISABLED (SESSION_KEEPALIVE_ENABLED != true) — skipping.');
                break;
            }

            // Find contacts whose last WhatsApp inbound is 21-23 hours ago (approaching 24h expiry)
            const prisma = (await import('../../db')).default;
            const { WhatsAppService } = await import('../../services/whatsapp');
            const { isQuietHours, msUntilMorningSend } = await import('../../utils/quiet_hours');
            const wa = new WhatsAppService();

            const KEEPALIVE_CAP = 50;
            const now = new Date();
            const windowStart = new Date(now.getTime() - 23 * 60 * 60 * 1000); // 23h ago
            const windowEnd = new Date(now.getTime() - 21 * 60 * 60 * 1000);   // 21h ago
            const dedupSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);

            const expiringContacts = await prisma.contact.findMany({
                where: {
                    last_wa_inbound: { gte: windowStart, lte: windowEnd },
                    contact_type: { notIn: ['MANAGEMENT'] },
                    lead_status: { notIn: ['closed', 'lost'] },
                    opted_out_at: null,   // consent guard — was entirely absent (2026-08-07)
                    // Dedup: never keep-alive the same contact twice in 24h.
                    interactions: {
                        none: { event_type: 'session_keepalive', created_at: { gte: dedupSince } },
                    },
                },
                select: { phone_number: true, name: true, last_wa_inbound: true, tenant_id: true },
                take: KEEPALIVE_CAP,
            });

            if (expiringContacts.length === 0) break;

            // Don't send during quiet hours — reschedule for 7 AM IST
            if (isQuietHours()) {
                logger.info(`[SessionKeepAlive] ${expiringContacts.length} sessions expiring but quiet hours — will retry after 7 AM IST`);
                // These contacts will be picked up on next run after quiet hours end
                break;
            }

            for (const contact of expiringContacts) {
                try {
                    const displayName = contact.name || 'there';
                    await wa.sendTemplate(contact.phone_number, 'rp_reopen_session', {
                        name: displayName,
                    }, undefined, 'session_keepalive');
                    // Dedup marker — the `none:` filter above reads this back, so a contact
                    // cannot be keep-alived again within 24h.
                    await prisma.interaction.create({
                        data: {
                            tenant_id: contact.tenant_id,
                            phone_number: contact.phone_number,
                            channel: 'whatsapp',
                            direction: 'outbound',
                            event_type: 'session_keepalive',
                            content: 'Session keep-alive (rp_reopen_session)',
                        },
                    }).catch(() => { /* marker is best-effort; never fail the send on it */ });
                    logger.info(`[SessionKeepAlive] Keep-alive sent to ${contact.phone_number}`);
                } catch (err) {
                    logger.warn(`[SessionKeepAlive] Failed for ${contact.phone_number}: ${(err as Error).message}`);
                }
            }
            logger.info(`[SessionKeepAlive] Processed ${expiringContacts.length} expiring sessions`);
            break;
        }

        case 'whatsapp-safety-net-sweep': {
            // Backstop for the inline never-silent guard in webhook_processor.ts — a 60-day
            // audit found 146 stale inbound messages with zero outbound reply despite the
            // inline guard, so this periodically re-checks for anything it missed.
            const prisma = (await import('../../db')).default;
            const { SAFETYNET_COVERED_TYPES, SAFETYNET_SKIP_RE, sendSafetyNetAck } = await import('../../services/webhook_processor');

            const now = new Date();
            const staleThreshold = new Date(now.getTime() - 15 * 60 * 1000); // 15 min old
            const lookback = new Date(now.getTime() - 6 * 60 * 60 * 1000);   // bound query cost to last 6h

            const conversationalTypes = [
                'message', 'workflow_message', 'template_button', 'buyer_workflow_message',
                'buyer_workflow_start', 'property_card_visit_request', 'property_card_callback_request',
                'closing_signal', 'frustration_escalation', 'workflow_start',
            ];

            const staleInbound = await prisma.interaction.findMany({
                where: {
                    channel: 'whatsapp', direction: 'inbound',
                    event_type: { in: conversationalTypes },
                    created_at: { gte: lookback, lte: staleThreshold },
                },
                orderBy: { created_at: 'desc' },
                select: { phone_number: true, content: true, created_at: true },
            });

            // Only the most recent stale inbound per phone matters — an ack covers everything before it.
            const latestByPhone = new Map<string, (typeof staleInbound)[number]>();
            for (const i of staleInbound) {
                if (!latestByPhone.has(i.phone_number)) latestByPhone.set(i.phone_number, i);
            }

            let acked = 0;
            for (const [phone, msg] of latestByPhone) {
                const text = msg.content || '';
                if (!text || SAFETYNET_SKIP_RE.test(text)) continue;

                // 2026-07-13 hotfix: some synchronous reply handlers (e.g. admin_agent's
                // "Hi" → daily-snapshot reply) log their outbound Interaction a few
                // milliseconds BEFORE the inbound one finishes writing, in the same
                // turn — a logging-order race, not a real miss. A strict `gt` here
                // false-positived on that, sending a confusing duplicate ack to a
                // contact who'd already gotten a real reply. 15s tolerance absorbs
                // same-turn write-order jitter without weakening the 15-min staleness
                // check itself (staleThreshold already requires the inbound to be
                // >=15 min old before we even get here).
                const REPLY_RACE_TOLERANCE_MS = 15000;
                const laterOutbound = await prisma.interaction.findFirst({
                    where: {
                        phone_number: phone, direction: 'outbound',
                        created_at: { gte: new Date(msg.created_at.getTime() - REPLY_RACE_TOLERANCE_MS) },
                    },
                    select: { id: true },
                });
                if (laterOutbound) continue;

                const contact = await prisma.contact.findUnique({
                    where: { phone_number: phone },
                    select: { tenant_id: true, contact_type: true, assigned_agent_id: true, name: true },
                });
                if (!contact || !SAFETYNET_COVERED_TYPES.includes(String(contact.contact_type))) continue;

                await sendSafetyNetAck(phone, contact, text).catch((e) =>
                    logger.warn(`[SafetyNetSweep] ack failed for ${phone}: ${(e as Error).message}`));
                acked++;
            }
            if (acked > 0) logger.warn(`[SafetyNetSweep] Acked ${acked} stale conversation(s) the inline guard missed`);
            break;
        }

        case 'partner-upload-nudge': {
            const prisma = (await import('../../db')).default;
            const { WhatsAppService } = await import('../../services/whatsapp');
            const { isQuietHours } = await import('../../utils/quiet_hours');
            const wa = new WhatsAppService();
            if (isQuietHours()) break;

            const now = new Date();
            const windowStart = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25h ago
            const windowEnd   = new Date(now.getTime() - 23 * 60 * 60 * 1000); // 23h ago

            const partners = await prisma.partnerAgent.findMany({
                where: {
                    created_at: { gte: windowStart, lte: windowEnd },
                    status: 'ACTIVE',
                    referred_inventory: { none: {} },
                },
                include: { managing_agent: { select: { name: true } } },
            });

            for (const partner of partners) {
                // Skip if nudge was already sent (check interaction log)
                const alreadySent = await prisma.interaction.findFirst({
                    where: { phone_number: partner.phone_number, event_type: 'partner_upload_nudge' },
                });
                if (alreadySent) continue;

                try {
                    await wa.sendTemplate(partner.phone_number, 'rp_partner_upload_nudge', {
                        name: partner.name,
                    });
                    await prisma.interaction.create({
                        data: {
                            tenant_id: (await prisma.tenant.findFirst())?.id || '',
                            phone_number: partner.phone_number,
                            channel: 'whatsapp',
                            direction: 'outbound',
                            event_type: 'partner_upload_nudge',
                            content: 'Upload nudge sent',
                        },
                    });
                    logger.info(`[PartnerNudge] Upload nudge sent to ${partner.phone_number}`);
                } catch (err) {
                    logger.warn(`[PartnerNudge] Failed for ${partner.phone_number}: ${(err as Error).message}`);
                }
            }
            logger.info(`[PartnerNudge] Processed ${partners.length} eligible partner(s)`);
            break;
        }

        case 'partner-upload-reminder': {
            const prisma = (await import('../../db')).default;
            const { WhatsAppService } = await import('../../services/whatsapp');
            const { isQuietHours } = await import('../../utils/quiet_hours');
            const wa = new WhatsAppService();
            if (isQuietHours()) break;

            const now = new Date();
            const windowStart = new Date(now.getTime() - 73 * 60 * 60 * 1000); // 73h ago
            const windowEnd   = new Date(now.getTime() - 71 * 60 * 60 * 1000); // 71h ago

            // Partners who got a nudge in the 71-73h window and still have no inventory
            const nudgeLogs = await prisma.interaction.findMany({
                where: {
                    event_type: 'partner_upload_nudge',
                    created_at: { gte: windowStart, lte: windowEnd },
                },
                select: { phone_number: true },
            });
            const nudgedPhones = nudgeLogs.map(l => l.phone_number);
            if (nudgedPhones.length === 0) break;

            const partners = await prisma.partnerAgent.findMany({
                where: {
                    phone_number: { in: nudgedPhones },
                    status: 'ACTIVE',
                    referred_inventory: { none: {} },
                },
                include: { managing_agent: { select: { name: true } } },
            });

            for (const partner of partners) {
                // Skip if reminder was already sent
                const alreadySent = await prisma.interaction.findFirst({
                    where: { phone_number: partner.phone_number, event_type: 'partner_upload_reminder' },
                });
                if (alreadySent) continue;

                try {
                    await wa.sendTemplate(partner.phone_number, 'rp_partner_upload_reminder', {
                        name: partner.name,
                        coordinator: partner.managing_agent?.name || 'your coordinator',
                    });
                    await prisma.interaction.create({
                        data: {
                            tenant_id: (await prisma.tenant.findFirst())?.id || '',
                            phone_number: partner.phone_number,
                            channel: 'whatsapp',
                            direction: 'outbound',
                            event_type: 'partner_upload_reminder',
                            content: 'Upload reminder sent',
                        },
                    });
                    logger.info(`[PartnerReminder] Upload reminder sent to ${partner.phone_number}`);
                } catch (err) {
                    logger.warn(`[PartnerReminder] Failed for ${partner.phone_number}: ${(err as Error).message}`);
                }
            }
            logger.info(`[PartnerReminder] Processed ${partners.length} eligible partner(s)`);
            break;
        }

        case 'catalog-reconcile': {
            const { reconcileCatalog } = await import('../../services/catalog_sync');
            const result = await reconcileCatalog();
            logger.info(`[CatalogReconcile] Done — ${result.upserted} upserted, ${result.deleted} deleted`);
            break;
        }

        case 'pending-messages-cleanup': {
            // Delete expired + already-sent pending_messages rows. Keeps the queue bounded.
            const prismaDb = (await import('../../db')).default;
            const result = await prismaDb.$executeRaw`
                DELETE FROM pending_messages
                WHERE expires_at < NOW() OR status = 'sent'
            `;
            logger.info(`[PendingCleanup] Deleted ${result} stale rows`);
            break;
        }

        case 'behavior-audit': {
            const { runBehaviorAudit } = await import('../../services/behavior_auditor');
            const result = await runBehaviorAudit();
            logger.info(`[BehaviorAudit] ${result.findings.length} findings — critical=${result.counts_by_severity.critical}, high=${result.counts_by_severity.high}`);
            break;
        }

        case 'owner-digest-am': {
            const { sendOwnerDigest } = await import('../../services/owner_digest');
            await sendOwnerDigest('morning');
            break;
        }

        case 'owner-digest-pm': {
            const { sendOwnerDigest } = await import('../../services/owner_digest');
            await sendOwnerDigest('evening');
            break;
        }

        case 'qualification_call_attempt': {
            const { processCallAttempt } = await import('../../services/lead_qualification_caller');
            await processCallAttempt(job);
            break;
        }

        case 'callback-sla-report': {
            // Daily regression check: every property_card_*_request signal
            // in the last 24h should have a matching task. Alerts super_boss
            // via WhatsApp if any are unmatched.
            const prismaDb = (await import('../../db')).default;
            const { WhatsAppService } = await import('../../services/whatsapp');
            const wa = new WhatsAppService();

            const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const signals = await prismaDb.interaction.findMany({
                where: {
                    event_type: { in: ['property_card_callback_request', 'property_card_visit_request'] },
                    created_at: { gte: since },
                },
                select: { phone_number: true, event_type: true, created_at: true },
            });
            const tasks = await prismaDb.task.findMany({
                where: {
                    task_type: { in: ['CALLBACK_REQUEST', 'VISIT_REQUEST'] },
                    created_at: { gte: since },
                },
                select: { contact_phone: true, task_type: true, due_date: true, status: true },
            });

            const unmatched = signals.filter(sig => {
                const expectedType = sig.event_type === 'property_card_callback_request' ? 'CALLBACK_REQUEST' : 'VISIT_REQUEST';
                return !tasks.find(t =>
                    t.contact_phone === sig.phone_number &&
                    t.task_type === expectedType &&
                    Math.abs(t.due_date.getTime() - sig.created_at.getTime()) < 60 * 60 * 1000
                );
            });
            const breached = tasks.filter(t => t.status !== 'DONE' && t.due_date < new Date()).length;

            logger.info(`[CallbackSLAReport] signals=${signals.length} tasks=${tasks.length} unmatched=${unmatched.length} breached=${breached}`);

            // 2026-05-19: keep the regression DETECTION (logged for ops /
            // GlitchTip) but no standalone super_boss WhatsApp — this rolls
            // into the consolidated 08:00/20:00 owner_digest instead.
            if (unmatched.length > 0) {
                logger.warn(`[CallbackSLAReport] REGRESSION: ${unmatched.length} unmatched callback/visit signals, ${breached} SLA-breached (last 24h). Phones: ${unmatched.slice(0, 5).map(u => `${u.phone_number}(${u.event_type})`).join(', ')}`);
            }
            void wa; // WhatsApp send intentionally removed (digest carries it)
            break;
        }

        case 'task-sla-check': {
            // Fired at task.due_date for CALLBACK_REQUEST / VISIT_REQUEST tasks.
            // If still TODO, reassign to super_boss + URGENT and notify.
            const { task_id, contact_phone, original_assignee_id, action } = job.data as {
                task_id: string;
                contact_phone: string;
                original_assignee_id: string;
                action: string;
            };
            const prismaDb = (await import('../../db')).default;
            const { notify } = await import('../../services/notify');

            const task = await prismaDb.task.findUnique({
                where: { id: task_id },
                select: { id: true, status: true, assigned_to: true, contact_phone: true, task_type: true, stage_metadata: true },
            });
            if (!task || task.status === 'DONE') {
                logger.info(`[SLACheck] Task ${task_id} resolved before SLA — no escalation`);
                break;
            }

            const superBoss = await prismaDb.agent.findFirst({
                where: { role: 'super_boss', status: 'active' },
                select: { id: true, name: true, email: true, phone: true },
            });
            if (!superBoss) {
                logger.error('[SLACheck] No active super_boss found — cannot escalate');
                break;
            }
            if (task.assigned_to === superBoss.id) {
                logger.info(`[SLACheck] Task ${task_id} already on super_boss — no double-escalation`);
                break;
            }

            const originalAgent = await prismaDb.agent.findUnique({
                where: { id: original_assignee_id },
                select: { name: true },
            });
            const contact = await prismaDb.contact.findUnique({
                where: { phone_number: contact_phone },
                select: { name: true },
            });

            await prismaDb.task.update({
                where: { id: task_id },
                data: {
                    assigned_to: superBoss.id,
                    priority: 'URGENT',
                    description: `⚠️ SLA breach — auto-escalated from ${originalAgent?.name || 'agent'}. Original task: ${task.task_type} for ${contact_phone}.`,
                },
            });

            const tenant = await prismaDb.tenant.findFirst();
            if (tenant) {
                await prismaDb.interaction.create({
                    data: {
                        tenant_id: tenant.id,
                        phone_number: contact_phone,
                        channel: 'system',
                        direction: 'outbound',
                        event_type: 'task_sla_escalated',
                        content: `Task ${task_id} (${task.task_type}) escalated from ${originalAgent?.name || 'agent'} to ${superBoss.name} after SLA breach`,
                        metadata: { task_id, action, original_assignee_id, escalated_to: superBoss.id },
                    },
                });
            }

            const slaMin = (task.stage_metadata as any)?.sla_minutes || 15;
            notify('lead_action_sla_breach', [{
                id: superBoss.id,
                type: 'agent' as const,
                phone: superBoss.phone ?? undefined,
                email: superBoss.email,
                name: superBoss.name,
            }], {
                task_id,
                action_label: action === 'CALLBACK_REQUEST' ? '📞 Callback' : '📅 Visit',
                contact_name: contact?.name || contact_phone,
                contact_phone,
                original_agent_name: originalAgent?.name || 'Unknown Agent',
                sla_minutes: slaMin,
            });

            logger.warn(`[SLACheck] Task ${task_id} (${task.task_type}) escalated to super_boss ${superBoss.name} after ${slaMin}min SLA breach`);
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
