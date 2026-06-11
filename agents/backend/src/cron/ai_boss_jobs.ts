/**
 * AI Boss Daily Jobs — Schedules the self-improvement cycle.
 *
 * Runs at 2:00 AM IST daily (after QA integrity check at 3 AM, before health report at 9 AM).
 * Uses the same msUntilNextIST pattern as qa_daily_jobs.ts.
 */

import { AIBoss } from '../services/ai_boss';
import logger from '../utils/logger';

let bossInterval: NodeJS.Timeout | null = null;

/**
 * Calculate milliseconds until next occurrence of a given hour (IST).
 *
 * Works entirely in UTC epoch ms to avoid setHours() using the server's
 * local timezone (UTC on Linux VPS) instead of IST.
 * e.g. hour=2 → next 02:00 IST = next 20:30 UTC.
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
 * Run the AI Boss daily cycle.
 */
async function runAIBossCycle(): Promise<void> {
    try {
        const boss = new AIBoss();
        await boss.runDailyCycle();
    } catch (err) {
        logger.error('[AIBossCron] Daily cycle failed:', err);
    }
}

/**
 * Start the AI Boss scheduler. Call once from server.ts.
 */
export function startAIBossJobs(): void {
    logger.info('[AIBossCron] Scheduling AI Boss daily cycle...');

    const msToRun = msUntilNextIST(2);
    const minutesUntil = Math.round(msToRun / 1000 / 60);
    logger.info(`[AIBossCron] AI Boss cycle scheduled in ${minutesUntil} minutes (2:00 AM IST)`);

    setTimeout(() => {
        runAIBossCycle();
        bossInterval = setInterval(runAIBossCycle, 24 * 60 * 60 * 1000);
    }, msToRun);
}

/**
 * Stop the AI Boss scheduler.
 */
export function stopAIBossJobs(): void {
    if (bossInterval) {
        clearInterval(bossInterval);
        bossInterval = null;
    }
    logger.info('[AIBossCron] AI Boss jobs stopped');
}
