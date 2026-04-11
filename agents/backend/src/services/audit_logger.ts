/**
 * Audit Logger Service
 *
 * Tracks security-relevant events for the Security Agent:
 * - Data access (who viewed what contact info)
 * - Authentication events (login, failed login, token refresh)
 * - Rate limit triggers
 * - Suspicious patterns (bulk lead grabbing, rapid-fire requests)
 *
 * Stores in AgentActionLog with agent_name='security' for unified audit trail.
 * Non-blocking — all writes are fire-and-forget.
 */

import prisma from '../db';
import logger from '../utils/logger';

export type AuditEventType =
    | 'data_access'         // Contact info viewed
    | 'auth_success'        // Successful login
    | 'auth_failure'        // Failed login attempt
    | 'rate_limit_hit'      // Rate limit triggered
    | 'bulk_lead_grab'      // Suspiciously many leads accessed
    | 'rapid_fire'          // Too many messages in short window
    | 'anomaly_detected'    // General anomaly
    | 'api_key_misuse'      // Invalid or misused API key
    | 'sensitive_access';   // Sensitive data (phone, email) accessed

export interface AuditEvent {
    event_type: AuditEventType;
    phone_number?: string;
    agent_id?: string;       // Human agent (internal staff)
    ip_address?: string;
    user_agent?: string;
    detail: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    metadata?: Record<string, any>;
}

// In-memory trackers for pattern detection
const requestCounts: Map<string, { count: number; window_start: number }> = new Map();
const leadAccessCounts: Map<string, { count: number; window_start: number }> = new Map();

const RAPID_FIRE_THRESHOLD = 30;       // messages per 5 minutes
const BULK_LEAD_THRESHOLD = 50;        // lead accesses per hour
const WINDOW_5_MIN = 5 * 60 * 1000;
const WINDOW_1_HOUR = 60 * 60 * 1000;

export class AuditLogger {

    /**
     * Log an audit event. Non-blocking.
     */
    log(event: AuditEvent): void {
        prisma.agentActionLog.create({
            data: {
                agent_name: 'security',
                task_type: event.event_type,
                phone_number: event.phone_number,
                input_summary: event.detail,
                output_summary: event.severity,
                status: event.severity === 'critical' || event.severity === 'high' ? 'escalated' : 'success',
                error_message: event.metadata ? JSON.stringify(event.metadata) : undefined,
            },
        }).catch(err => {
            logger.error('[AuditLogger] Failed to log event:', err);
        });

        // Log to console for real-time monitoring
        if (event.severity === 'high' || event.severity === 'critical') {
            logger.warn(`[AuditLogger] ${event.severity.toUpperCase()}: ${event.event_type} — ${event.detail}`);
        } else {
            logger.info(`[AuditLogger] ${event.event_type}: ${event.detail}`);
        }
    }

    /**
     * Track a message from a phone number.
     * Returns true if rate is suspicious (rapid-fire).
     */
    trackMessage(phoneNumber: string): boolean {
        const now = Date.now();
        const tracker = requestCounts.get(phoneNumber);

        if (!tracker || now - tracker.window_start > WINDOW_5_MIN) {
            requestCounts.set(phoneNumber, { count: 1, window_start: now });
            return false;
        }

        tracker.count++;

        if (tracker.count > RAPID_FIRE_THRESHOLD) {
            this.log({
                event_type: 'rapid_fire',
                phone_number: phoneNumber,
                detail: `${tracker.count} messages in ${Math.round((now - tracker.window_start) / 1000)}s`,
                severity: 'high',
                metadata: { count: tracker.count, window_seconds: Math.round((now - tracker.window_start) / 1000) },
            });
            return true;
        }

        return false;
    }

    /**
     * Track lead/contact data access by an agent/user.
     * Returns true if access pattern is suspicious (bulk grabbing).
     */
    trackLeadAccess(accessorId: string, contactPhone: string): boolean {
        const now = Date.now();
        const tracker = leadAccessCounts.get(accessorId);

        if (!tracker || now - tracker.window_start > WINDOW_1_HOUR) {
            leadAccessCounts.set(accessorId, { count: 1, window_start: now });
            return false;
        }

        tracker.count++;

        if (tracker.count > BULK_LEAD_THRESHOLD) {
            this.log({
                event_type: 'bulk_lead_grab',
                phone_number: contactPhone,
                agent_id: accessorId,
                detail: `Agent ${accessorId} accessed ${tracker.count} leads in 1 hour`,
                severity: 'critical',
                metadata: { accessor: accessorId, count: tracker.count },
            });
            return true;
        }

        return false;
    }

    /**
     * Log a failed authentication attempt.
     */
    logAuthFailure(identifier: string, ip?: string): void {
        this.log({
            event_type: 'auth_failure',
            detail: `Failed login: ${identifier}`,
            ip_address: ip,
            severity: 'medium',
            metadata: { identifier, ip },
        });
    }

    /**
     * Log successful authentication.
     */
    logAuthSuccess(identifier: string, ip?: string): void {
        this.log({
            event_type: 'auth_success',
            detail: `Successful login: ${identifier}`,
            ip_address: ip,
            severity: 'low',
            metadata: { identifier, ip },
        });
    }

    /**
     * Get recent security events for the admin dashboard.
     */
    async getRecentEvents(hours: number = 24, limit: number = 50): Promise<any[]> {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000);

        return prisma.agentActionLog.findMany({
            where: {
                agent_name: 'security',
                created_at: { gte: since },
            },
            orderBy: { created_at: 'desc' },
            take: limit,
        });
    }

    /**
     * Get security summary for the daily report.
     */
    async getDailySummary(): Promise<{
        total_events: number;
        high_severity: number;
        critical_severity: number;
        top_event_types: Array<{ type: string; count: number }>;
    }> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [total, highSeverity, criticalSeverity, eventTypes] = await Promise.all([
            prisma.agentActionLog.count({
                where: { agent_name: 'security', created_at: { gte: today } },
            }),
            prisma.agentActionLog.count({
                where: { agent_name: 'security', created_at: { gte: today }, output_summary: 'high' },
            }),
            prisma.agentActionLog.count({
                where: { agent_name: 'security', created_at: { gte: today }, output_summary: 'critical' },
            }),
            prisma.agentActionLog.groupBy({
                by: ['task_type'],
                where: { agent_name: 'security', created_at: { gte: today } },
                _count: true,
                orderBy: { _count: { task_type: 'desc' } },
                take: 5,
            }),
        ]);

        return {
            total_events: total,
            high_severity: highSeverity,
            critical_severity: criticalSeverity,
            top_event_types: eventTypes.map(e => ({
                type: e.task_type,
                count: e._count,
            })),
        };
    }

    /**
     * Cleanup old in-memory trackers (call periodically).
     */
    cleanup(): void {
        const now = Date.now();

        for (const [key, tracker] of requestCounts.entries()) {
            if (now - tracker.window_start > WINDOW_5_MIN * 2) {
                requestCounts.delete(key);
            }
        }

        for (const [key, tracker] of leadAccessCounts.entries()) {
            if (now - tracker.window_start > WINDOW_1_HOUR * 2) {
                leadAccessCounts.delete(key);
            }
        }
    }
}
