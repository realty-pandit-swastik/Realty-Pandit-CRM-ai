/**
 * QA Daily Jobs — Scheduled tasks for QA Agent
 *
 * 1. Daily health report (9:00 AM IST → sent to all MANAGEMENT contacts via WhatsApp)
 * 2. Data integrity check (3:00 AM IST → log issues, alert if critical)
 *
 * Usage: Import and call startQAJobs() from app.ts or server.ts
 */

import { QAAgent } from '../agents/qa_agent';
import logger from '../utils/logger';

const qaAgent = new QAAgent();

let healthReportInterval: NodeJS.Timeout | null = null;
let integrityCheckInterval: NodeJS.Timeout | null = null;

/**
 * Calculate milliseconds until next occurrence of a given hour (IST).
 *
 * Works entirely in UTC epoch ms to avoid setHours() using the server's
 * local timezone (UTC on Linux VPS) instead of IST.
 * e.g. hour=9 → next 09:00 IST = next 03:30 UTC.
 */
function msUntilNextIST(hour: number): number {
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const now = Date.now();

    // Compute the target's offset from UTC midnight:
    //   IST hour X = (X * 3600000 - IST_OFFSET_MS) ms past UTC midnight
    const offsetFromUTCMidnight = hour * 60 * 60 * 1000 - IST_OFFSET_MS;

    const todayUTCMidnight = new Date();
    todayUTCMidnight.setUTCHours(0, 0, 0, 0);

    let nextFire = todayUTCMidnight.getTime() + offsetFromUTCMidnight;
    if (nextFire <= now) {
        nextFire += 24 * 60 * 60 * 1000;
    }

    return nextFire - now;
}

/**
 * Start all QA scheduled jobs.
 */
export function startQAJobs(): void {
    logger.info('[QACron] Starting QA daily jobs...');

    // Schedule daily health report at 9:00 AM IST
    const msToHealthReport = msUntilNextIST(9);
    logger.info(`[QACron] Health report scheduled in ${Math.round(msToHealthReport / 1000 / 60)} minutes`);

    setTimeout(() => {
        // Run immediately on first trigger
        runHealthReport();

        // Then run every 24 hours
        healthReportInterval = setInterval(runHealthReport, 24 * 60 * 60 * 1000);
    }, msToHealthReport);

    // Schedule data integrity check at 3:00 AM IST
    const msToIntegrityCheck = msUntilNextIST(3);
    logger.info(`[QACron] Data integrity check scheduled in ${Math.round(msToIntegrityCheck / 1000 / 60)} minutes`);

    setTimeout(() => {
        runIntegrityCheck();
        integrityCheckInterval = setInterval(runIntegrityCheck, 24 * 60 * 60 * 1000);
    }, msToIntegrityCheck);
}

/**
 * Stop all QA scheduled jobs.
 */
export function stopQAJobs(): void {
    if (healthReportInterval) clearInterval(healthReportInterval);
    if (integrityCheckInterval) clearInterval(integrityCheckInterval);
    logger.info('[QACron] QA daily jobs stopped');
}

async function runHealthReport(): Promise<void> {
    logger.info('[QACron] Running daily health report...');
    try {
        await qaAgent.sendDailyHealthReport();
        logger.info('[QACron] Daily health report completed');
    } catch (error) {
        logger.error('[QACron] Daily health report failed:', error);
    }
}

async function runIntegrityCheck(): Promise<void> {
    logger.info('[QACron] Running data integrity check...');
    try {
        const issues = await qaAgent.checkDataIntegrity();
        if (issues.length > 0) {
            logger.warn(`[QACron] Data integrity found ${issues.length} issue(s): ${issues.join('; ')}`);
        } else {
            logger.info('[QACron] Data integrity check passed — all clean');
        }
    } catch (error) {
        logger.error('[QACron] Data integrity check failed:', error);
    }
}
