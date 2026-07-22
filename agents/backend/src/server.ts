// MUST be the very first import — Sentry's OpenTelemetry auto-instrumentation needs to
// patch http/express/prisma/etc. before they load. instrument.ts also loads dotenv.
import { SentrySDK } from './instrument';

// Validate critical env vars before importing anything else
const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET', 'AGENT_JWT_SECRET'];
const missing = requiredEnvVars.filter(key => !process.env[key]);
if (missing.length > 0) {
    console.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
    console.error('Create a .env file based on .env.example');
    process.exit(1);
}

const warnEnvVars = ['GEMINI_API_KEY', 'REDIS_HOST'];
const missingWarn = warnEnvVars.filter(k => !process.env[k]);
if (missingWarn.length) console.warn(`WARNING: Missing optional env vars: ${missingWarn.join(', ')} — some features may be degraded`);

import app from './app';
import prisma from './db';
import logger from './utils/logger';
import { alertCritical } from './utils/alerter';

// BullMQ Workers (replace node-cron + setTimeout/setInterval)
import { startWhatsAppInboundWorker, stopWhatsAppInboundWorker } from './queues/workers/whatsapp_inbound';
import { startScheduledWorker, stopScheduledWorker } from './queues/workers/scheduled_worker';

const port = process.env.PORT || 7071;

// PM2 Cluster Mode: Only run workers/schedulers on instance 0
const isPrimaryInstance = !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0';

// ─── Unhandled Error Handling ────────────────────────────────────────────────
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    alertCritical('uncaught_exception', error.message, { stack: error.stack?.substring(0, 500) });
    SentrySDK.captureException(error, { tags: { source: 'uncaughtException' } });
    // Flush pending events before the process dies, then exit.
    SentrySDK.flush(2000).catch(() => undefined).finally(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
    alertCritical('unhandled_rejection', String(reason));
    SentrySDK.captureException(reason, { tags: { source: 'unhandledRejection' } });
});

// ─── Start Server ────────────────────────────────────────────────────────────
const server = app.listen(Number(port), '127.0.0.1', async () => {
    const instanceId = process.env.NODE_APP_INSTANCE || 'single';
    logger.info(`Agent Server running on port ${port} (instance: ${instanceId})`);
    logger.info('Webhooks active at /webhooks/whatsapp and /webhooks/voice');

    // Start BullMQ workers on primary instance only
    if (isPrimaryInstance) {
        logger.info('[Server] Primary instance — starting BullMQ workers');

        try {
            // 1. WhatsApp inbound message processor (async webhook processing)
            startWhatsAppInboundWorker();

            // 2. Scheduled jobs worker (replaces node-cron, setTimeout, setInterval)
            //    - Pending actions check (every 60s)
            //    - Daily report (9 PM IST)
            //    - Subscription expiry (midnight IST)
            //    - QA health report (9 AM IST)
            //    - QA integrity check (3 AM IST)
            //    - AI Boss cycle (2 AM IST)
            //    - Follow-up check (hourly)
            //    - Call processor (every 10s)
            //    - Interaction triggers (hourly)
            //    - Security scan (hourly)
            await startScheduledWorker();

            logger.info('[Server] All BullMQ workers started successfully');
        } catch (err) {
            // If BullMQ fails to start (e.g., Redis down), fall back to legacy schedulers
            logger.error('[Server] BullMQ worker startup failed, falling back to legacy schedulers:', err);
            startLegacySchedulers();
        }

        // Lead redistribution — 10 aged-dump leads/day to the least-served employees at 08:00 IST.
        // Self-contained node-cron (independent of BullMQ), primary instance only. (2026-07-09)
        try {
            const { startLeadRedistributionCron } = require('./services/lead_redistribution');
            startLeadRedistributionCron();
        } catch (e) {
            logger.error('[Server] lead redistribution cron start failed:', e);
        }
    } else {
        logger.info(`[Server] Worker instance ${instanceId} — skipping workers (handled by instance 0)`);
    }
});

/**
 * Legacy scheduler fallback — used when BullMQ/Redis is unavailable.
 * Calls the same functions as BullMQ repeatable jobs, but via node-cron/setInterval.
 */
let legacyCleanup: (() => void) | null = null;

function startLegacySchedulers(): void {
    logger.info('[Server] Starting legacy schedulers (BullMQ unavailable)');

    // Import legacy schedulers
    const { initScheduler } = require('./services/scheduler');
    const { FollowupScheduler } = require('./services/followup_scheduler');
    const { startCallProcessor, stopCallProcessor } = require('./workers/call_processor');
    const { startQAJobs } = require('./cron/qa_daily_jobs');
    const { startAIBossJobs } = require('./cron/ai_boss_jobs');
    const { SecurityAgent } = require('./agents/security_agent');
    const { InteractionEngine } = require('./services/interaction_engine');

    initScheduler();

    const followupScheduler = new FollowupScheduler();
    followupScheduler.start();

    startCallProcessor();
    startQAJobs();

    const securityAgent = new SecurityAgent();
    securityAgent.start();

    const interactionEngine = new InteractionEngine();
    interactionEngine.start();

    startAIBossJobs();

    // Notification system crons (Phase 4)
    const { initNotificationBatcher } = require('./services/notification_batcher');
    const { initNotificationRetryWorker } = require('./services/notification_retry');
    const { initNotificationCrons } = require('./services/notification_crons');
    const { initPipelineCrons } = require('./services/pipeline_crons');
    const { initQualificationCallWorker } = require('./services/lead_qualification_caller');
    initNotificationBatcher();
    initNotificationRetryWorker();
    initNotificationCrons();
    initPipelineCrons();
    initQualificationCallWorker();

    // Store cleanup function so graceful shutdown can stop intervals
    legacyCleanup = () => {
        logger.info('[Server] Stopping legacy schedulers...');
        try { followupScheduler.stop?.(); } catch (e) { /* ignore */ }
        try { stopCallProcessor?.(); } catch (e) { /* ignore */ }
        try { securityAgent.stop?.(); } catch (e) { /* ignore */ }
        try { interactionEngine.stop?.(); } catch (e) { /* ignore */ }
    };

    logger.info('[Server] Legacy schedulers started');
}

// ─── GRACEFUL SHUTDOWN ──────────────────────────────────────────────────────────
// PM2 sends SIGINT on restart/reload. Without a handler, in-flight requests are
// dropped, Prisma connections leak, and BullMQ workers may lose jobs.
// ─────────────────────────────────────────────────────────────────────────────────

let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`[Server] ${signal} received — starting graceful shutdown...`);

    // 1. Stop accepting new connections
    server.close(() => {
        logger.info('[Server] HTTP server closed (no new connections)');
    });

    // 2. Stop BullMQ workers (finish current jobs, then close)
    try {
        await Promise.all([
            stopWhatsAppInboundWorker(),
            stopScheduledWorker(),
        ]);
        logger.info('[Server] BullMQ workers stopped');
    } catch (err) {
        logger.error('[Server] BullMQ worker shutdown error:', err);
    }

    // 2b. Stop legacy schedulers if they were started
    if (legacyCleanup) {
        try {
            legacyCleanup();
            logger.info('[Server] Legacy schedulers stopped');
        } catch (err) {
            logger.error('[Server] Legacy scheduler cleanup error:', err);
        }
    }

    // 3. Allow in-flight requests to complete (10 second grace period)
    await new Promise(resolve => setTimeout(resolve, 10000));

    // 4. Disconnect Prisma (releases connection pool)
    try {
        await prisma.$disconnect();
        logger.info('[Server] Prisma disconnected');
    } catch (err) {
        logger.error('[Server] Prisma disconnect error:', err);
    }

    logger.info('[Server] Graceful shutdown complete');
    process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
