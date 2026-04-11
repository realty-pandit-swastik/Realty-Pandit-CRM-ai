/**
 * AI Boss — Self-Improving Bot Orchestrator
 *
 * Runs daily at 2 AM IST. Coordinates:
 * 1. Conversation Audit Agent → finds issues in last 24h conversations
 * 2. Prompt Engineer Agent → auto-deploys prompt improvements to DB
 * 3. Emails full report to Super Boss
 * 4. Logs everything to AuditReport table
 *
 * Reports directly to Super Boss only (email, not WhatsApp).
 * Does NOT interact with customers.
 */

import { AuditAgent, AuditResult } from '../agents/audit_agent';
import { PromptEngineerAgent, PromptAction } from '../agents/prompt_engineer_agent';
import { EmailService } from './email_service';
import prisma from '../db';
import logger from '../utils/logger';

export class AIBoss {
    private auditAgent: AuditAgent;
    private promptEngineer: PromptEngineerAgent;
    private emailService: EmailService;

    constructor() {
        this.auditAgent = new AuditAgent();
        this.promptEngineer = new PromptEngineerAgent();
        this.emailService = new EmailService();
    }

    /**
     * Run the full daily self-improvement cycle.
     */
    async runDailyCycle(): Promise<void> {
        logger.info('[AIBoss] Starting daily self-improvement cycle...');
        const startTime = Date.now();

        try {
            // Step 1: Run Conversation Audit
            logger.info('[AIBoss] Step 1: Running Conversation Audit...');
            const auditResult = await this.auditAgent.runDailyAudit();
            logger.info(`[AIBoss] Audit complete: ${auditResult.totalConversations} conversations, ${auditResult.issuesFound.length} issue categories`);

            // Step 2: Save audit report to DB (before prompt engineer, so we have the ID)
            const report = await prisma.auditReport.create({
                data: {
                    total_conversations: auditResult.totalConversations,
                    total_flagged: auditResult.totalFlagged,
                    avg_quality_score: auditResult.avgQualityScore,
                    issues_found: auditResult.issuesFound as any,
                    agent_breakdown: auditResult.agentBreakdown as any,
                    sentiment_stats: auditResult.sentimentStats as any,
                    actions_taken: [],
                    deployments: 0,
                },
            });

            // Step 3: Run Prompt Engineer (only if issues found)
            let actions: PromptAction[] = [];
            if (auditResult.issuesFound.length > 0) {
                logger.info('[AIBoss] Step 2: Running Prompt Engineer...');
                actions = await this.promptEngineer.processAuditReport(auditResult, report.id);
                logger.info(`[AIBoss] Prompt Engineer deployed ${actions.length} improvements`);

                // Update report with actions
                await prisma.auditReport.update({
                    where: { id: report.id },
                    data: {
                        actions_taken: actions as any,
                        deployments: actions.length,
                    },
                });
            } else {
                logger.info('[AIBoss] No issues found — Prompt Engineer skipped');
            }

            // Step 4: Send email to Super Boss
            logger.info('[AIBoss] Step 3: Sending report to Super Boss...');
            await this.sendBossEmail(report.id, auditResult, actions, Date.now() - startTime);

            const durationSec = Math.round((Date.now() - startTime) / 1000);
            logger.info(`[AIBoss] Daily cycle completed in ${durationSec}s. ${actions.length} fixes deployed.`);
        } catch (err) {
            logger.error('[AIBoss] Daily cycle failed:', err);
        }
    }

    /**
     * Send the daily report email to Super Boss.
     */
    private async sendBossEmail(
        reportId: string,
        audit: AuditResult,
        actions: PromptAction[],
        durationMs: number,
    ): Promise<void> {
        try {
            // Find Super Boss agent
            const superBoss = await prisma.agent.findFirst({
                where: { role: 'super_boss', status: 'active' },
            });

            if (!superBoss?.email) {
                logger.warn('[AIBoss] No Super Boss with email found. Skipping email.');
                return;
            }

            const date = new Date().toLocaleDateString('en-IN', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                timeZone: 'Asia/Kolkata',
            });

            const subject = `[AI Boss] Daily Report — ${audit.issuesFound.length} issues, ${actions.length} fixes deployed`;

            const html = this.buildReportHTML(date, audit, actions, durationMs);

            await this.emailService.sendEmail({
                from: 'AI Boss <ai-boss@realtypandit.in>',
                to: superBoss.email,
                subject,
                html,
            }, superBoss.tenant_id);

            // Mark report as emailed
            await prisma.auditReport.update({
                where: { id: reportId },
                data: { email_sent: true, email_sent_to: superBoss.email },
            });

            logger.info(`[AIBoss] Report emailed to ${superBoss.email}`);
        } catch (err) {
            logger.error('[AIBoss] Failed to send email to Super Boss:', err);
        }
    }

    /**
     * Build the HTML email report.
     */
    private buildReportHTML(
        date: string,
        audit: AuditResult,
        actions: PromptAction[],
        durationMs: number,
    ): string {
        const sentimentEmojis = `Positive: ${audit.sentimentStats.positive} | Neutral: ${audit.sentimentStats.neutral} | Negative: ${audit.sentimentStats.negative} | Frustrated: ${audit.sentimentStats.frustrated}`;

        const issueRows = audit.issuesFound.map(issue => {
            const severityColor = issue.severity === 'high' ? '#dc2626' : issue.severity === 'medium' ? '#f59e0b' : '#16a34a';
            const example = issue.examples[0]?.detail || 'N/A';
            return `
                <tr>
                    <td style="padding:8px;border-bottom:1px solid #eee;">
                        <span style="color:${severityColor};font-weight:bold;">[${issue.severity.toUpperCase()}]</span>
                        ${issue.category.replace(/_/g, ' ')}
                    </td>
                    <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${issue.count}</td>
                    <td style="padding:8px;border-bottom:1px solid #eee;font-size:13px;color:#666;">${example}</td>
                </tr>`;
        }).join('');

        const actionRows = actions.length > 0
            ? actions.map(a => `
                <tr>
                    <td style="padding:8px;border-bottom:1px solid #eee;">
                        <span style="color:#16a34a;">&#10003;</span> [${a.section}]
                    </td>
                    <td style="padding:8px;border-bottom:1px solid #eee;font-size:13px;">${a.content.substring(0, 150)}...</td>
                    <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;color:#666;">${a.reason}</td>
                </tr>`).join('')
            : '<tr><td colspan="3" style="padding:12px;text-align:center;color:#666;">No fixes needed today</td></tr>';

        const agentRows = Object.entries(audit.agentBreakdown).map(([name, data]) => `
            <tr>
                <td style="padding:6px;">${name}</td>
                <td style="padding:6px;text-align:center;">${data.count}</td>
                <td style="padding:6px;text-align:center;">${data.avg_score}</td>
                <td style="padding:6px;text-align:center;">${data.avg_duration_ms}ms</td>
            </tr>`).join('') || '<tr><td colspan="4" style="padding:8px;text-align:center;color:#666;">No agent data</td></tr>';

        return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;background:#f5f5f5;">
<div style="max-width:700px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff;padding:24px 30px;">
        <h1 style="margin:0;font-size:22px;">AI Boss Daily Report</h1>
        <p style="margin:4px 0 0;opacity:0.85;font-size:14px;">${date}</p>
    </div>

    <div style="padding:24px 30px;">

        <!-- Summary Cards -->
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px;">
            <div style="flex:1;min-width:140px;background:#f0f9ff;border-radius:8px;padding:16px;text-align:center;">
                <div style="font-size:28px;font-weight:bold;color:#2563eb;">${audit.totalConversations}</div>
                <div style="font-size:12px;color:#666;">Conversations</div>
            </div>
            <div style="flex:1;min-width:140px;background:#fef3c7;border-radius:8px;padding:16px;text-align:center;">
                <div style="font-size:28px;font-weight:bold;color:#d97706;">${audit.totalFlagged}</div>
                <div style="font-size:12px;color:#666;">Flagged</div>
            </div>
            <div style="flex:1;min-width:140px;background:#f0fdf4;border-radius:8px;padding:16px;text-align:center;">
                <div style="font-size:28px;font-weight:bold;color:#16a34a;">${audit.avgQualityScore ?? 'N/A'}</div>
                <div style="font-size:12px;color:#666;">Avg Score /10</div>
            </div>
            <div style="flex:1;min-width:140px;background:#fef2f2;border-radius:8px;padding:16px;text-align:center;">
                <div style="font-size:28px;font-weight:bold;color:#dc2626;">${actions.length}</div>
                <div style="font-size:12px;color:#666;">Fixes Deployed</div>
            </div>
        </div>

        <!-- Sentiment -->
        <p style="margin:0 0 20px;font-size:14px;color:#666;">Sentiment: ${sentimentEmojis}</p>

        <!-- Issues Found -->
        <h2 style="font-size:16px;color:#1e3a5f;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">Issues Found</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <thead>
                <tr style="background:#f8fafc;">
                    <th style="padding:8px;text-align:left;font-size:13px;">Issue</th>
                    <th style="padding:8px;text-align:center;font-size:13px;">Count</th>
                    <th style="padding:8px;text-align:left;font-size:13px;">Example</th>
                </tr>
            </thead>
            <tbody>${issueRows || '<tr><td colspan="3" style="padding:12px;text-align:center;color:#16a34a;">No issues found!</td></tr>'}</tbody>
        </table>

        <!-- Auto-Deployed Fixes -->
        <h2 style="font-size:16px;color:#1e3a5f;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">Auto-Deployed Fixes</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <thead>
                <tr style="background:#f8fafc;">
                    <th style="padding:8px;text-align:left;font-size:13px;">Section</th>
                    <th style="padding:8px;text-align:left;font-size:13px;">Rule</th>
                    <th style="padding:8px;text-align:left;font-size:13px;">Reason</th>
                </tr>
            </thead>
            <tbody>${actionRows}</tbody>
        </table>

        <!-- Agent Performance -->
        <h2 style="font-size:16px;color:#1e3a5f;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">Agent Performance</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <thead>
                <tr style="background:#f8fafc;">
                    <th style="padding:6px;text-align:left;font-size:13px;">Agent</th>
                    <th style="padding:6px;text-align:center;font-size:13px;">Messages</th>
                    <th style="padding:6px;text-align:center;font-size:13px;">Avg Score</th>
                    <th style="padding:6px;text-align:center;font-size:13px;">Avg Time</th>
                </tr>
            </thead>
            <tbody>${agentRows}</tbody>
        </table>

    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;padding:16px 30px;text-align:center;font-size:12px;color:#94a3b8;">
        Cycle completed in ${Math.round(durationMs / 1000)}s &mdash; AI Boss, Realty Pandit
    </div>

</div>
</body>
</html>`;
    }
}
