/**
 * Performance Monitor Service
 *
 * Tracks per-agent metrics for QA Agent advanced analytics:
 * - Response times (avg, p95, max) per agent
 * - Error rates per agent
 * - Message volume trends
 * - Conversion funnel (NEW → QUALIFIED → MATCHED → VISIT → CLOSED)
 * - Quality score trends
 *
 * Used by QA Dashboard and daily reports.
 */

import prisma from '../db';
import logger from '../utils/logger';

export interface AgentMetrics {
    agent_name: string;
    total_actions: number;
    successful: number;
    failed: number;
    escalated: number;
    error_rate: number;            // percentage
    avg_duration_ms: number;
    avg_quality_score: number | null;
    last_action_at: Date | null;
}

export interface ConversionFunnel {
    NEW: number;
    QUALIFIED: number;
    MATCHED: number;
    VISIT_SCHEDULED: number;
    VISITED: number;
    NEGOTIATION: number;
    CLOSED_WON: number;
    CLOSED_LOST: number;
}

export interface SystemHealth {
    uptime_seconds: number;
    total_contacts: number;
    total_interactions_today: number;
    active_properties: number;
    active_sessions: number;
    agent_metrics: AgentMetrics[];
    conversion_funnel: ConversionFunnel;
    quality_summary: {
        avg_score: number | null;
        total_checks: number;
        flagged: number;
        sentiment_breakdown: Record<string, number>;
    };
    security_summary: {
        total_events: number;
        high_severity: number;
        critical_severity: number;
    };
    campaign_summary: {
        total_campaigns: number;
        total_sent: number;
        active_campaigns: number;
    };
}

const serverStartTime = Date.now();

export class PerformanceMonitor {

    /**
     * Get comprehensive system health snapshot.
     */
    async getSystemHealth(): Promise<SystemHealth> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [
            totalContacts,
            interactionsToday,
            activeProperties,
            activeSessions,
            agentMetrics,
            funnel,
            qualitySummary,
            securitySummary,
            campaignSummary,
        ] = await Promise.all([
            prisma.contact.count(),
            prisma.interaction.count({ where: { created_at: { gte: today } } }),
            prisma.inventory.count({ where: { status: 'active' } }),
            prisma.conversationSession.count({ where: { active: true } }),
            this.getAgentMetrics(today),
            this.getConversionFunnel(),
            this.getQualitySummary(today),
            this.getSecuritySummary(today),
            this.getCampaignSummary(),
        ]);

        return {
            uptime_seconds: Math.floor((Date.now() - serverStartTime) / 1000),
            total_contacts: totalContacts,
            total_interactions_today: interactionsToday,
            active_properties: activeProperties,
            active_sessions: activeSessions,
            agent_metrics: agentMetrics,
            conversion_funnel: funnel,
            quality_summary: qualitySummary,
            security_summary: securitySummary,
            campaign_summary: campaignSummary,
        };
    }

    /**
     * Get per-agent performance metrics for today.
     */
    async getAgentMetrics(since?: Date): Promise<AgentMetrics[]> {
        const today = since || new Date();
        if (!since) today.setHours(0, 0, 0, 0);

        const breakdown = await prisma.agentActionLog.groupBy({
            by: ['agent_name', 'status'],
            where: { created_at: { gte: today } },
            _count: true,
            _avg: { duration_ms: true, quality_score: true },
        });

        // Aggregate by agent
        const agentMap = new Map<string, AgentMetrics>();

        for (const row of breakdown) {
            if (!agentMap.has(row.agent_name)) {
                agentMap.set(row.agent_name, {
                    agent_name: row.agent_name,
                    total_actions: 0,
                    successful: 0,
                    failed: 0,
                    escalated: 0,
                    error_rate: 0,
                    avg_duration_ms: 0,
                    avg_quality_score: null,
                    last_action_at: null,
                });
            }

            const agent = agentMap.get(row.agent_name)!;
            agent.total_actions += row._count;

            if (row.status === 'success') agent.successful += row._count;
            else if (row.status === 'failed') agent.failed += row._count;
            else if (row.status === 'escalated') agent.escalated += row._count;

            if (row._avg.duration_ms) {
                agent.avg_duration_ms = Math.round(row._avg.duration_ms);
            }
            if (row._avg.quality_score) {
                agent.avg_quality_score = parseFloat(row._avg.quality_score.toFixed(1));
            }
        }

        // Calculate error rates
        for (const agent of agentMap.values()) {
            agent.error_rate = agent.total_actions > 0
                ? parseFloat(((agent.failed / agent.total_actions) * 100).toFixed(1))
                : 0;
        }

        return Array.from(agentMap.values()).sort((a, b) => b.total_actions - a.total_actions);
    }

    /**
     * Get conversion funnel — how many contacts at each lifecycle stage.
     */
    async getConversionFunnel(): Promise<ConversionFunnel> {
        const stages = await prisma.contact.groupBy({
            by: ['lifecycle_stage'],
            _count: true,
        });

        const funnel: ConversionFunnel = {
            NEW: 0,
            QUALIFIED: 0,
            MATCHED: 0,
            VISIT_SCHEDULED: 0,
            VISITED: 0,
            NEGOTIATION: 0,
            CLOSED_WON: 0,
            CLOSED_LOST: 0,
        };

        for (const stage of stages) {
            const key = stage.lifecycle_stage as keyof ConversionFunnel;
            if (key in funnel) {
                funnel[key] = stage._count;
            }
        }

        return funnel;
    }

    /**
     * Get quality assurance summary for today.
     */
    private async getQualitySummary(since: Date): Promise<{
        avg_score: number | null;
        total_checks: number;
        flagged: number;
        sentiment_breakdown: Record<string, number>;
    }> {
        const [avgScore, totalChecks, flagged, sentiments] = await Promise.all([
            prisma.qALog.aggregate({
                where: { created_at: { gte: since } },
                _avg: { quality_score: true },
            }),
            prisma.qALog.count({ where: { created_at: { gte: since } } }),
            prisma.qALog.count({ where: { created_at: { gte: since }, flagged: true } }),
            prisma.qALog.groupBy({
                by: ['sentiment'],
                where: { created_at: { gte: since } },
                _count: true,
            }),
        ]);

        const sentimentBreakdown: Record<string, number> = {};
        for (const s of sentiments) {
            if (s.sentiment) {
                sentimentBreakdown[s.sentiment] = s._count;
            }
        }

        return {
            avg_score: avgScore._avg.quality_score ? parseFloat(avgScore._avg.quality_score.toFixed(1)) : null,
            total_checks: totalChecks,
            flagged,
            sentiment_breakdown: sentimentBreakdown,
        };
    }

    /**
     * Get security summary for today.
     */
    private async getSecuritySummary(since: Date): Promise<{
        total_events: number;
        high_severity: number;
        critical_severity: number;
    }> {
        const [total, high, critical] = await Promise.all([
            prisma.agentActionLog.count({
                where: { agent_name: 'security', created_at: { gte: since } },
            }),
            prisma.agentActionLog.count({
                where: { agent_name: 'security', created_at: { gte: since }, output_summary: 'high' },
            }),
            prisma.agentActionLog.count({
                where: { agent_name: 'security', created_at: { gte: since }, output_summary: 'critical' },
            }),
        ]);

        return { total_events: total, high_severity: high, critical_severity: critical };
    }

    /**
     * Get campaign summary.
     */
    private async getCampaignSummary(): Promise<{
        total_campaigns: number;
        total_sent: number;
        active_campaigns: number;
    }> {
        const [total, sentSum, active] = await Promise.all([
            prisma.campaign.count(),
            prisma.campaign.aggregate({ _sum: { sent_count: true } }),
            prisma.campaign.count({ where: { status: { in: ['sending', 'scheduled'] } } }),
        ]);

        return {
            total_campaigns: total,
            total_sent: sentSum._sum.sent_count || 0,
            active_campaigns: active,
        };
    }

    /**
     * Get agent action log with pagination.
     */
    async getAgentLogs(options: {
        agent_name?: string;
        status?: string;
        phone_number?: string;
        limit?: number;
        offset?: number;
    } = {}): Promise<{ logs: any[]; total: number }> {
        const where: any = {};

        if (options.agent_name) where.agent_name = options.agent_name;
        if (options.status) where.status = options.status;
        if (options.phone_number) where.phone_number = options.phone_number;

        const [logs, total] = await Promise.all([
            prisma.agentActionLog.findMany({
                where,
                orderBy: { created_at: 'desc' },
                take: options.limit || 50,
                skip: options.offset || 0,
            }),
            prisma.agentActionLog.count({ where }),
        ]);

        return { logs, total };
    }

    /**
     * Get QA logs with pagination.
     */
    async getQALogs(options: {
        flagged_only?: boolean;
        agent_name?: string;
        limit?: number;
        offset?: number;
    } = {}): Promise<{ logs: any[]; total: number }> {
        const where: any = {};

        if (options.flagged_only) where.flagged = true;
        if (options.agent_name) where.agent_name = options.agent_name;

        const [logs, total] = await Promise.all([
            prisma.qALog.findMany({
                where,
                orderBy: { created_at: 'desc' },
                take: options.limit || 50,
                skip: options.offset || 0,
            }),
            prisma.qALog.count({ where }),
        ]);

        return { logs, total };
    }
}
