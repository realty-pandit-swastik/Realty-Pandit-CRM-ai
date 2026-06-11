/**
 * Structured Error Alerter — 6 Sigma Reliability
 *
 * Alert levels:
 *   INFO     — Winston log only
 *   WARN     — Winston log + dashboard indicator
 *   CRITICAL — Winston log + WhatsApp to management (super_boss contacts)
 *
 * Rate-limited: max 1 alert per error-type per 5 minutes to prevent alert storms.
 */

import logger from './logger';
import prisma from '../db';

type AlertLevel = 'INFO' | 'WARN' | 'CRITICAL';

// Rate limiting: max 1 alert per error type per 5 minutes
const alertCooldowns = new Map<string, number>();
const COOLDOWN_MS = 5 * 60 * 1000;

/**
 * 2026-05-19 — owner asked for NO odd-hour / per-finding WhatsApp spam; the
 * noise (behaviour-audit findings + scattered cron reports) was removed/folded
 * into the 08:00/20:00 owner digest. But genuine "system is down / data loss"
 * events MUST still page in real-time (a server crash or the WhatsApp
 * processor dying at 2 AM cannot wait until 08:00). This allowlist is the
 * set of errorTypes the codebase actually emits as CRITICAL that are true
 * outages — verified against every alertCritical() call site 2026-05-19.
 * The 1-alert-per-type-per-5-min cooldown already prevents these from
 * storming. Anything NOT here is log-only.
 * See docs/plans/2026-05-19-report-cadence-and-bot-reply.md
 */
const REALTIME_CRITICAL_TYPES = new Set<string>([
    // Process-level crashes (server.ts)
    'uncaught_exception',
    'unhandled_rejection',
    // API throwing 500s in a sustained way (error_handler.ts; cooldown caps it)
    'server_5xx',
    // The WhatsApp inbound pipeline failed all retries → bot literally can't
    // reply to clients (this IS the "AI not replying" failure mode).
    'whatsapp_job_failed',
    // Lead-source ingestion auth broken → silent loss of all portal leads.
    '99acres_auth_failed',
    // Forward-looking infra types (not yet emitted but reserved so future
    // system-down alerts page immediately without another code change).
    'gemini_circuit_open', 'db_pool_exhausted', 'database_down',
    'redis_down', 'worker_dead', 'whatsapp_api_down', 'webhook_processing_down',
]);

/**
 * Send a structured alert. Rate-limited per errorType.
 *
 * @param level   - INFO (log only), WARN (log), CRITICAL (log + WhatsApp to boss)
 * @param errorType - Unique error identifier (e.g., 'circuit_breaker_open', 'db_pool_exhausted')
 * @param message - Human-readable description
 * @param details - Optional extra data (truncated to 200 chars in WhatsApp)
 */
export async function alert(
    level: AlertLevel,
    errorType: string,
    message: string,
    details?: any,
): Promise<void> {
    // 1. Always log
    const logMsg = `[Alert:${level}] ${errorType}: ${message}`;
    if (level === 'CRITICAL') {
        logger.error(logMsg, details);
    } else if (level === 'WARN') {
        logger.warn(logMsg, details);
    } else {
        logger.info(logMsg, details);
    }

    // 2. Rate limit check
    const lastAlert = alertCooldowns.get(errorType) || 0;
    if (Date.now() - lastAlert < COOLDOWN_MS) {
        return; // Cooldown active — skip sending
    }
    alertCooldowns.set(errorType, Date.now());

    // 3. For CRITICAL: send WhatsApp to management — ONLY for true
    // system-down error types. All other CRITICALs are log-only and roll
    // up into the next 08:00/20:00 owner digest (no odd-hour spam).
    if (level === 'CRITICAL' && !REALTIME_CRITICAL_TYPES.has(errorType)) {
        logger.warn(`[Alerter] CRITICAL '${errorType}' logged-only (not a real-time outage type) — folded into next owner digest, no real-time WhatsApp`);
        return;
    }
    if (level === 'CRITICAL') {
        try {
            // Lazy-import WhatsAppService to avoid circular dependency
            // (alerter → WhatsAppService → circuit_breaker → alerter)
            const { WhatsAppService } = await import('../services/whatsapp');
            const whatsappService = new WhatsAppService();

            // Find super_boss agents via Agent table, then use their phone numbers
            const bosses = await prisma.agent.findMany({
                where: { role: 'super_boss', status: 'ACTIVE' },
                select: { phone: true },
                take: 3,
            });

            const mgmtContacts = bosses
                .filter(b => b.phone)
                .map(b => ({ phone_number: b.phone }));

            if (mgmtContacts.length === 0) {
                logger.warn('[Alerter] No super_boss contacts found for CRITICAL alert');
                return;
            }

            const detailStr = details
                ? `\n*Details*: ${JSON.stringify(details).substring(0, 200)}`
                : '';

            const alertMsg = [
                `*CRITICAL ALERT*`,
                ``,
                `*Type*: ${errorType}`,
                `*Message*: ${message}`,
                `*Time*: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
                `*Instance*: ${process.env.NODE_APP_INSTANCE || 'single'}`,
                detailStr,
            ].join('\n');

            for (const contact of mgmtContacts) {
                const phone = contact.phone_number!;
                await whatsappService.sendText(phone, alertMsg).catch(() => {
                    // If WhatsApp itself is down, we can't alert via WhatsApp — just log
                    logger.error(`[Alerter] Failed to send WhatsApp alert to ${phone}`);
                });
            }
        } catch (err) {
            logger.error('[Alerter] Failed to send CRITICAL alert via WhatsApp:', err);
        }
    }
}

// ─── Convenience Wrappers ────────────────────────────────────────────────────

export const alertCritical = (type: string, msg: string, details?: any) =>
    alert('CRITICAL', type, msg, details);

export const alertWarn = (type: string, msg: string, details?: any) =>
    alert('WARN', type, msg, details);

export const alertInfo = (type: string, msg: string, details?: any) =>
    alert('INFO', type, msg, details);
