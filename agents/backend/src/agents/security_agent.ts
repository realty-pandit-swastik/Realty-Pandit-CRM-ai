/**
 * Security Agent — Rate Monitoring, Anomaly Detection, Data Protection
 *
 * Runs in two modes:
 * 1. MIDDLEWARE: Real-time rate checking per message (called by MessageRouter)
 * 2. CRON: Hourly anomaly detection scan
 *
 * Detects:
 * - Rapid-fire messaging (>30 msgs/5min from same number)
 * - Bulk lead grabbing (agent accessing >50 leads/hour)
 * - Login anomalies (multiple failed attempts)
 * - Suspicious agent behavior (external agents scraping data)
 *
 * Alerts admin via WhatsApp for high/critical events.
 */

import { AuditLogger } from '../services/audit_logger';
import { NotificationAgent } from './notification_agent';
import prisma from '../db';
import logger from '../utils/logger';

export class SecurityAgent {
    private auditLogger: AuditLogger;
    private notificationAgent: NotificationAgent;
    private cleanupInterval: NodeJS.Timeout | null = null;
    private anomalyScanInterval: NodeJS.Timeout | null = null;

    constructor() {
        this.auditLogger = new AuditLogger();
        this.notificationAgent = new NotificationAgent();
    }

    // ─── Middleware Mode: Real-time Checks ────────────────────

    /**
     * Check if a message should be rate-limited.
     * Called by MessageRouter before processing.
     * Returns true if the message should be blocked.
     */
    checkRateLimit(phoneNumber: string): boolean {
        return this.auditLogger.trackMessage(phoneNumber);
    }

    /**
     * Check if lead access is suspicious.
     * Called when agents view contact details.
     */
    checkLeadAccess(accessorId: string, contactPhone: string): boolean {
        return this.auditLogger.trackLeadAccess(accessorId, contactPhone);
    }

    /**
     * Log authentication events.
     */
    logAuth(success: boolean, identifier: string, ip?: string): void {
        if (success) {
            this.auditLogger.logAuthSuccess(identifier, ip);
        } else {
            this.auditLogger.logAuthFailure(identifier, ip);
        }
    }

    // ─── Cron Mode: Hourly Anomaly Scan ──────────────────────

    /**
     * Start the security agent's background jobs.
     * Called from server.ts startup.
     */
    start(): void {
        logger.info('[SecurityAgent] Starting background security monitoring...');

        // Cleanup stale trackers every 10 minutes
        this.cleanupInterval = setInterval(() => {
            this.auditLogger.cleanup();
        }, 10 * 60 * 1000);

        // Run anomaly scan every hour
        this.anomalyScanInterval = setInterval(() => {
            this.runAnomalyScan().catch(err => {
                logger.error('[SecurityAgent] Anomaly scan failed:', err);
            });
        }, 60 * 60 * 1000);

        // Run initial scan after 5 minutes (let system warm up)
        setTimeout(() => {
            this.runAnomalyScan().catch(err => {
                logger.error('[SecurityAgent] Initial anomaly scan failed:', err);
            });
        }, 5 * 60 * 1000);
    }

    /**
     * Stop background jobs.
     */
    stop(): void {
        if (this.cleanupInterval) clearInterval(this.cleanupInterval);
        if (this.anomalyScanInterval) clearInterval(this.anomalyScanInterval);
        logger.info('[SecurityAgent] Background monitoring stopped');
    }

    /**
     * Hourly anomaly detection scan.
     */
    async runAnomalyScan(): Promise<void> {
        logger.info('[SecurityAgent] Running hourly anomaly scan...');
        const alerts: string[] = [];

        try {
            // 1. Check for failed login spikes (>5 failures in last hour)
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const failedLogins = await prisma.agentActionLog.count({
                where: {
                    agent_name: 'security',
                    task_type: 'auth_failure',
                    created_at: { gte: oneHourAgo },
                },
            });
            if (failedLogins > 5) {
                alerts.push(`🔐 ${failedLogins} failed login attempts in last hour`);
            }

            // 2. Check for agent error spikes (>10 errors in last hour)
            const agentErrors = await prisma.agentActionLog.count({
                where: {
                    status: 'failed',
                    created_at: { gte: oneHourAgo },
                    agent_name: { not: 'security' },
                },
            });
            if (agentErrors > 10) {
                alerts.push(`⚠️ ${agentErrors} agent errors in last hour (possible system issue)`);
            }

            // 3. Check for suspended external agents still sending messages
            const suspendedAgents = await prisma.owner.findMany({
                where: {
                    scope: 'EXTERNAL',
                    status: 'SUSPENDED',
                },
                select: { contact_phone: true },
            });
            if (suspendedAgents.length > 0) {
                const suspendedPhones = suspendedAgents.map(a => a.contact_phone);
                const suspendedActivity = await prisma.interaction.count({
                    where: {
                        phone_number: { in: suspendedPhones },
                        created_at: { gte: oneHourAgo },
                    },
                });
                if (suspendedActivity > 0) {
                    alerts.push(`🚫 ${suspendedActivity} messages from SUSPENDED agents in last hour`);
                }
            }

            // 4. Check for expired subscriptions still active
            const expiredButActive = await prisma.subscription.count({
                where: {
                    status: 'ACTIVE',
                    end_date: { lt: new Date() },
                },
            });
            if (expiredButActive > 0) {
                alerts.push(`💳 ${expiredButActive} subscription(s) expired but still marked ACTIVE`);
            }

            // 5. Check for high-volume external agents (>20 messages/hour — potential abuse)
            const externalAgentActivity = await prisma.$queryRaw<Array<{ phone_number: string; msg_count: bigint }>>`
                SELECT i.phone_number, COUNT(*) as msg_count
                 FROM interactions i
                 JOIN contacts c ON i.phone_number = c.phone_number
                 WHERE c.contact_type = 'PARTNER_AGENT'
                 AND i.created_at >= ${oneHourAgo}
                 GROUP BY i.phone_number
                 HAVING COUNT(*) > 20`;
            for (const agent of externalAgentActivity) {
                alerts.push(`📱 Partner agent ${agent.phone_number}: ${agent.msg_count} messages/hour (high volume)`);
            }

            // Log scan result
            if (alerts.length > 0) {
                logger.warn(`[SecurityAgent] Anomaly scan found ${alerts.length} issue(s)`);
                await this.sendSecurityAlert(alerts);
            } else {
                logger.info('[SecurityAgent] Anomaly scan clean — no issues found');
            }

        } catch (error) {
            logger.error('[SecurityAgent] Anomaly scan error:', error);
        }
    }

    /**
     * Send security alerts to admin via WhatsApp.
     */
    private async sendSecurityAlert(alerts: string[]): Promise<void> {
        try {
            const adminContact = await prisma.contact.findFirst({
                where: { contact_type: 'MANAGEMENT' },
                orderBy: { created_at: 'asc' },
            });

            if (!adminContact) {
                logger.warn('[SecurityAgent] No MANAGEMENT contact for security alert');
                return;
            }

            const msg = `🛡️ *Panditji Security Alert*\n${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\n` +
                alerts.map((a, i) => `${i + 1}. ${a}`).join('\n') +
                `\n\n_Automated scan by Security Agent_`;

            await this.notificationAgent.send({
                to: adminContact.phone_number,
                message: msg,
                channel: 'whatsapp',
                log_interaction: false,
            });
            logger.info(`[SecurityAgent] Alert sent to ${adminContact.phone_number}`);

            // Also log the alert itself
            this.auditLogger.log({
                event_type: 'anomaly_detected',
                detail: `Hourly scan: ${alerts.length} issue(s) found and reported`,
                severity: alerts.some(a => a.includes('🚫') || a.includes('🔐')) ? 'high' : 'medium',
                metadata: { alerts },
            });

        } catch (error) {
            logger.error('[SecurityAgent] Failed to send security alert:', error);
        }
    }

    /**
     * Get security summary for dashboard/reports.
     */
    async getSecuritySummary(): Promise<any> {
        return this.auditLogger.getDailySummary();
    }

    /**
     * Get the audit logger instance (for use by other services).
     */
    getAuditLogger(): AuditLogger {
        return this.auditLogger;
    }
}
