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

    // 3. For CRITICAL: send WhatsApp to management
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
