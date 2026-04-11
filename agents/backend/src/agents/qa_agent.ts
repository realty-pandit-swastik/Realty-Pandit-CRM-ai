/**
 * QA Agent — Quality Assurance & Workflow Monitor
 *
 * The "brain of the brains" — watches all other agents and makes the system smarter.
 *
 * Responsibilities:
 * A. Post-response quality scoring (0-10) using LLM
 * B. Sentiment detection (flag frustrated users for human takeover)
 * C. Data integrity checking (daily cron)
 * D. Daily health report (sent via WhatsApp to admin)
 *
 * This agent runs ASYNC — it never blocks user responses.
 */

import { LLMService } from '../services/llm';
import { NotificationAgent } from './notification_agent';
import prisma from '../db';
import logger from '../utils/logger';

interface QACheckInput {
    phone_number: string;
    agent_name: string;
    user_message: string;
    ai_response: string;
    contact_type?: string;
    interaction_id?: string;
}

interface QAResult {
    quality_score: number;   // 0-10
    sentiment: string;       // positive, neutral, negative, frustrated
    issues: Array<{ type: string; detail: string }>;
    flagged: boolean;
}

export class QAAgent {
    private llmService: LLMService;
    private notificationAgent: NotificationAgent;

    constructor() {
        this.llmService = new LLMService();
        this.notificationAgent = new NotificationAgent();
    }

    // ─── A. Post-Response Quality Check (async, fire-and-forget) ─

    /**
     * Analyze an AI response for quality issues.
     * Called by Master Orchestrator after every agent response.
     * Non-blocking — errors are logged, never crash the main flow.
     */
    async checkResponseQuality(input: QACheckInput): Promise<void> {
        try {
            const result = await this.analyzeQuality(input);

            // Save to QALog
            await prisma.qALog.create({
                data: {
                    interaction_id: input.interaction_id,
                    phone_number: input.phone_number,
                    agent_name: input.agent_name,
                    quality_score: result.quality_score,
                    issues: result.issues.length > 0 ? result.issues : undefined,
                    sentiment: result.sentiment,
                    flagged: result.flagged,
                },
            });

            // If flagged, alert admin
            if (result.flagged) {
                await this.alertAdmin(input, result);
            }

            // Update the AgentActionLog with quality score
            if (input.interaction_id) {
                await prisma.agentActionLog.updateMany({
                    where: {
                        phone_number: input.phone_number,
                        agent_name: input.agent_name,
                        status: 'success',
                    },
                    data: {
                        quality_score: result.quality_score,
                    },
                });
            }

            // Save winning templates for self-improvement (score >= 9)
            await this.logWinningTemplate(input, result);

            logger.info(`[QAAgent] Quality check: ${input.agent_name} → score=${result.quality_score}/10, sentiment=${result.sentiment}, flagged=${result.flagged}`);
        } catch (error) {
            logger.error('[QAAgent] Quality check failed (non-blocking):', error);
        }
    }

    /**
     * Use LLM to analyze response quality.
     */
    private async analyzeQuality(input: QACheckInput): Promise<QAResult> {
        const prompt = `You are a Quality Assurance analyst for a real estate AI assistant called Panditji.

Analyze this conversation exchange and rate the AI response quality.

User message: "${input.user_message}"
AI response: "${input.ai_response}"
Agent type: ${input.agent_name}
Contact type: ${input.contact_type || 'unknown'}

Rate the response on these criteria:
1. Relevance (0-10): Does the response address the user's query?
2. Accuracy (0-10): Is the information correct and not hallucinated?
3. Tone (0-10): Is it professional, warm, and appropriate?
4. Helpfulness (0-10): Does it move the conversation forward?

Also detect user sentiment from their message:
- positive: Happy, satisfied, interested
- neutral: Normal query, no strong emotion
- negative: Unhappy, complaining, dissatisfied
- frustrated: Repeated questions, anger, confusion

Reply ONLY in this exact JSON format:
{"score":8,"sentiment":"neutral","issues":[]}

If there are issues, include them like:
{"score":4,"sentiment":"frustrated","issues":[{"type":"hallucination","detail":"AI mentioned a property that doesn't exist"},{"type":"missed_intent","detail":"User asked about rent but AI talked about buying"}]}

Issue types: hallucination, wrong_info, missed_intent, rude_tone, too_generic, off_topic`;

        try {
            const result = await this.llmService.generateResponse(prompt, '');
            const jsonMatch = result.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const score = Math.min(10, Math.max(0, parsed.score || 5));
                const sentiment = ['positive', 'neutral', 'negative', 'frustrated'].includes(parsed.sentiment)
                    ? parsed.sentiment
                    : 'neutral';
                const issues = Array.isArray(parsed.issues) ? parsed.issues : [];

                // Flag if score < 5 or sentiment is frustrated
                const flagged = score < 5 || sentiment === 'frustrated';

                return { quality_score: score, sentiment, issues, flagged };
            }

            return { quality_score: 7, sentiment: 'neutral', issues: [], flagged: false };
        } catch (error) {
            logger.error('[QAAgent] LLM analysis failed:', error);
            return { quality_score: 5, sentiment: 'neutral', issues: [], flagged: false };
        }
    }

    /**
     * Alert admin via WhatsApp when a conversation needs human attention.
     */
    private async alertAdmin(input: QACheckInput, result: QAResult): Promise<void> {
        try {
            // Find management contact to alert
            const adminContact = await prisma.contact.findFirst({
                where: { contact_type: 'MANAGEMENT' },
                orderBy: { created_at: 'asc' },
            });

            if (!adminContact) {
                logger.warn('[QAAgent] No MANAGEMENT contact found for alert');
                return;
            }

            const issueList = result.issues.map(i => `  - ${i.type}: ${i.detail}`).join('\n');
            const alertMsg = `⚠️ *QA Alert — Needs Human Review*

Contact: ${input.phone_number}
Agent: ${input.agent_name}
Score: ${result.quality_score}/10
Sentiment: ${result.sentiment}
${issueList ? `\nIssues:\n${issueList}` : ''}
User said: "${input.user_message.substring(0, 100)}"
AI replied: "${input.ai_response.substring(0, 100)}"`;

            await this.notificationAgent.send({
                to: adminContact.phone_number,
                message: alertMsg,
                channel: 'whatsapp',
                log_interaction: false,
            });
            logger.info(`[QAAgent] Alert sent to admin ${adminContact.phone_number}`);
        } catch (error) {
            logger.error('[QAAgent] Failed to send admin alert:', error);
        }
    }

    // ─── B. Daily Health Report ─────────────────────────────────

    /**
     * Generate and send daily health report to admin via WhatsApp.
     * Called by cron job.
     */
    async sendDailyHealthReport(): Promise<void> {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Gather metrics
            const [
                totalMessages,
                newContacts,
                activeProperties,
                avgQualityScore,
                flaggedCount,
                agentBreakdown,
                sentimentBreakdown,
                errorCount,
            ] = await Promise.all([
                prisma.interaction.count({ where: { created_at: { gte: today } } }),
                prisma.contact.count({ where: { created_at: { gte: today } } }),
                prisma.inventory.count({ where: { status: 'active' } }),
                prisma.qALog.aggregate({ where: { created_at: { gte: today } }, _avg: { quality_score: true } }),
                prisma.qALog.count({ where: { created_at: { gte: today }, flagged: true } }),
                prisma.agentActionLog.groupBy({
                    by: ['agent_name'],
                    where: { created_at: { gte: today } },
                    _count: true,
                    _avg: { duration_ms: true },
                }),
                prisma.qALog.groupBy({
                    by: ['sentiment'],
                    where: { created_at: { gte: today } },
                    _count: true,
                }),
                prisma.agentActionLog.count({ where: { created_at: { gte: today }, status: 'failed' } }),
            ]);

            // Format agent stats
            const agentStats = agentBreakdown.map(a =>
                `  ${a.agent_name}: ${a._count} msgs (avg ${Math.round(a._avg.duration_ms || 0)}ms)`
            ).join('\n') || '  No agent activity today';

            // Format sentiment
            const sentimentStats = sentimentBreakdown.map(s =>
                `  ${s.sentiment}: ${s._count}`
            ).join('\n') || '  No sentiment data';

            const avgScore = avgQualityScore._avg.quality_score?.toFixed(1) || 'N/A';

            const report = `📊 *Panditji Daily Health Report*
${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

*Activity*
  Messages today: ${totalMessages}
  New contacts: ${newContacts}
  Active properties: ${activeProperties}
  Errors: ${errorCount}

*AI Quality*
  Avg score: ${avgScore}/10
  Flagged conversations: ${flaggedCount}

*Agent Performance*
${agentStats}

*User Sentiment*
${sentimentStats}

${flaggedCount > 0 ? `\n⚠️ ${flaggedCount} conversation(s) need human review!` : '✅ All conversations looking good!'}`;

            // Send to all management contacts
            const admins = await prisma.contact.findMany({
                where: { contact_type: 'MANAGEMENT' },
            });

            for (const admin of admins) {
                await this.notificationAgent.send({
                    to: admin.phone_number,
                    message: report,
                    channel: 'whatsapp',
                    log_interaction: false,
                });
            }

            logger.info(`[QAAgent] Daily health report sent to ${admins.length} admin(s)`);
        } catch (error) {
            logger.error('[QAAgent] Failed to generate daily report:', error);
        }
    }

    // ─── C. Data Integrity Checker ──────────────────────────────

    /**
     * Check data integrity and flag issues. Called by daily cron.
     */
    async checkDataIntegrity(): Promise<string[]> {
        const issues: string[] = [];

        try {
            // 1. Find contacts with interactions but no contact_type set after 24h
            const staleUnknowns = await prisma.contact.count({
                where: {
                    contact_type: 'UNKNOWN',
                    created_at: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
                },
            });
            if (staleUnknowns > 0) {
                issues.push(`${staleUnknowns} contacts still UNKNOWN after 24h`);
            }

            // 2. Find orphan interactions (no matching contact — should be 0 due to FK)
            const orphanInteractions = await prisma.$queryRaw<{ count: bigint }[]>`
                SELECT COUNT(*) as count FROM interactions i LEFT JOIN contacts c ON i.phone_number = c.phone_number WHERE c.phone_number IS NULL`;
            const orphanCount = Number(orphanInteractions[0]?.count || 0);
            if (orphanCount > 0) {
                issues.push(`${orphanCount} orphan interactions (no matching contact)`);
            }

            // 3. Find stale properties (active, no interaction in 90 days)
            const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
            const staleProperties = await prisma.inventory.count({
                where: {
                    status: 'active',
                    updated_at: { lt: ninetyDaysAgo },
                },
            });
            if (staleProperties > 0) {
                issues.push(`${staleProperties} active properties not updated in 90+ days`);
            }

            // 4. Find contacts with lead_status hot but no interaction in 7 days
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const coldHotLeads = await prisma.contact.count({
                where: {
                    lead_status: 'hot',
                    last_interaction: { lt: sevenDaysAgo },
                },
            });
            if (coldHotLeads > 0) {
                issues.push(`${coldHotLeads} "hot" leads with no interaction in 7+ days`);
            }

            // 5. Check for duplicate phone numbers in different formats
            const duplicates = await prisma.$queryRaw<{ count: bigint }[]>`
                SELECT COUNT(*) as count FROM contacts WHERE phone_number NOT LIKE '91%' AND LENGTH(phone_number) < 12`;
            const badPhoneCount = Number(duplicates[0]?.count || 0);
            if (badPhoneCount > 0) {
                issues.push(`${badPhoneCount} contacts with non-E.164 phone format`);
            }

            if (issues.length > 0) {
                logger.warn(`[QAAgent] Data integrity issues found: ${issues.join('; ')}`);
            } else {
                logger.info('[QAAgent] Data integrity check passed — no issues found');
            }

        } catch (error) {
            logger.error('[QAAgent] Data integrity check failed:', error);
            issues.push(`Check failed: ${error}`);
        }

        return issues;
    }

    // ─── D. Self-Improvement Logger (Template Library) ───────────

    /**
     * Track high-scoring responses as templates for future use.
     * Called after quality check — if score >= 9, save as a "winning" template.
     * Periodically review these to improve system prompts and agent behavior.
     */
    async logWinningTemplate(input: QACheckInput, result: QAResult): Promise<void> {
        if (result.quality_score < 9) return; // Only save exceptional responses

        try {
            await prisma.agentActionLog.create({
                data: {
                    agent_name: 'qa',
                    task_type: 'winning_template',
                    phone_number: input.phone_number,
                    input_summary: `[${input.agent_name}] User: "${input.user_message.substring(0, 200)}"`,
                    output_summary: `Score: ${result.quality_score}/10 | AI: "${input.ai_response.substring(0, 500)}"`,
                    quality_score: result.quality_score,
                    status: 'success',
                },
            });

            logger.info(`[QAAgent] Winning template saved: ${input.agent_name} score=${result.quality_score}`);
        } catch (error) {
            logger.error('[QAAgent] Failed to save winning template:', error);
        }
    }

    /**
     * Get winning templates for a specific agent — use to improve prompts.
     * Returns the top N highest-scoring responses for that agent.
     */
    async getWinningTemplates(agentName: string, limit: number = 10): Promise<any[]> {
        try {
            return prisma.agentActionLog.findMany({
                where: {
                    agent_name: 'qa',
                    task_type: 'winning_template',
                    input_summary: { startsWith: `[${agentName}]` },
                },
                orderBy: { quality_score: 'desc' },
                take: limit,
            });
        } catch (error) {
            logger.error('[QAAgent] Failed to fetch winning templates:', error);
            return [];
        }
    }
}
