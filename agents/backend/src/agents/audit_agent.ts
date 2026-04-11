/**
 * Conversation Audit Agent — Analyzes last 24h of bot conversations.
 *
 * Finds patterns of failure (repeated greetings, language mixing, context loss,
 * missing property searches, wrong classifications, etc.) and produces a
 * structured report for the Prompt Engineer Agent.
 *
 * Part of the AI Boss self-improvement system.
 */

import { LLMService } from '../services/llm';
import prisma from '../db';
import logger from '../utils/logger';

// ─── Types ──────────────────────────────────────────────────────

export interface AuditIssue {
    category: string;
    count: number;
    severity: 'high' | 'medium' | 'low';
    examples: { phone: string; detail: string; message_index?: number }[];
    suggestion: string;
}

export interface AgentBreakdown {
    [agentName: string]: {
        count: number;
        avg_score: number;
        avg_duration_ms: number;
    };
}

export interface SentimentStats {
    positive: number;
    neutral: number;
    negative: number;
    frustrated: number;
}

export interface AuditResult {
    totalConversations: number;
    totalFlagged: number;
    avgQualityScore: number | null;
    issuesFound: AuditIssue[];
    agentBreakdown: AgentBreakdown;
    sentimentStats: SentimentStats;
    winningTemplates: { phone: string; content: string; score: number }[];
}

// ─── Issue Categories ───────────────────────────────────────────

const ISSUE_CATEGORIES = [
    'repeated_greeting',
    'language_mixing',
    'context_loss',
    'no_property_search',
    'wrong_classification',
    'generic_response',
    'missed_intent',
    'slow_qualification',
    'no_follow_up',
    'tone_issue',
] as const;

// ─── Audit Agent ────────────────────────────────────────────────

export class AuditAgent {
    private llmService: LLMService;

    constructor() {
        this.llmService = new LLMService();
    }

    /**
     * Run the daily conversation audit.
     * Analyzes last 24h of conversations and produces a structured report.
     */
    async runDailyAudit(): Promise<AuditResult> {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        logger.info(`[AuditAgent] Starting daily audit for conversations since ${since.toISOString()}`);

        // 1. Fetch QA logs (quality scores, flags, sentiment)
        const qaLogs = await prisma.qALog.findMany({
            where: { created_at: { gte: since } },
            orderBy: { created_at: 'desc' },
        });

        // 2. Fetch agent action logs (performance data)
        const actionLogs = await prisma.agentActionLog.findMany({
            where: { created_at: { gte: since } },
            orderBy: { created_at: 'desc' },
        });

        // 3. Fetch all interactions (conversations)
        const interactions = await prisma.interaction.findMany({
            where: { created_at: { gte: since } },
            orderBy: { created_at: 'asc' },
            select: {
                phone_number: true,
                direction: true,
                content: true,
                channel: true,
                created_at: true,
                event_type: true,
            },
        });

        // 4. Group interactions by phone number → conversations
        const conversations = new Map<string, typeof interactions>();
        for (const ix of interactions) {
            const existing = conversations.get(ix.phone_number) || [];
            existing.push(ix);
            conversations.set(ix.phone_number, existing);
        }

        // 5. Compute sentiment stats from QA logs
        const sentimentStats: SentimentStats = { positive: 0, neutral: 0, negative: 0, frustrated: 0 };
        for (const qa of qaLogs) {
            const sentiment = (qa.sentiment || 'neutral').toLowerCase();
            if (sentiment === 'positive') sentimentStats.positive++;
            else if (sentiment === 'negative') sentimentStats.negative++;
            else if (sentiment === 'frustrated') sentimentStats.frustrated++;
            else sentimentStats.neutral++;
        }

        // 6. Compute agent breakdown from action logs
        const agentBreakdown: AgentBreakdown = {};
        for (const log of actionLogs) {
            const name = log.agent_name;
            if (!agentBreakdown[name]) {
                agentBreakdown[name] = { count: 0, avg_score: 0, avg_duration_ms: 0 };
            }
            agentBreakdown[name].count++;
            agentBreakdown[name].avg_score += log.quality_score || 0;
            agentBreakdown[name].avg_duration_ms += log.duration_ms || 0;
        }
        for (const name of Object.keys(agentBreakdown)) {
            const b = agentBreakdown[name];
            if (b.count > 0) {
                b.avg_score = Math.round((b.avg_score / b.count) * 10) / 10;
                b.avg_duration_ms = Math.round(b.avg_duration_ms / b.count);
            }
        }

        // 7. Compute average quality score
        const scores = qaLogs.map(q => q.quality_score).filter((s): s is number => s !== null);
        const avgQualityScore = scores.length > 0
            ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
            : null;

        // 8. Find flagged conversations
        const flaggedPhones = new Set(
            qaLogs.filter(q => q.flagged).map(q => q.phone_number),
        );

        // 9. Find low-score conversations (score < 6)
        const lowScorePhones = new Set(
            qaLogs.filter(q => q.quality_score !== null && q.quality_score < 6).map(q => q.phone_number),
        );

        // 10. Find winning templates (score >= 8) — fetch bot responses from Interaction table
        const winningTemplates: AuditResult['winningTemplates'] = [];
        const highScoreQAs = qaLogs.filter(q => q.quality_score !== null && q.quality_score >= 8 && q.interaction_id);
        for (const qa of highScoreQAs.slice(0, 5)) {
            try {
                const interaction = await prisma.interaction.findFirst({
                    where: { id: qa.interaction_id!, direction: 'outbound' },
                    select: { content: true },
                });
                if (interaction?.content) {
                    winningTemplates.push({
                        phone: qa.phone_number,
                        content: interaction.content.substring(0, 300),
                        score: qa.quality_score,
                    });
                }
            } catch { /* skip */ }
        }

        // 11. Sample conversations for LLM analysis (prioritize flagged + low-score)
        const sampled: { phone: string; messages: typeof interactions; qaScore?: number }[] = [];

        // Priority 1: Flagged conversations
        for (const phone of flaggedPhones) {
            const msgs = conversations.get(phone);
            if (msgs && msgs.length >= 2) {
                const qa = qaLogs.find(q => q.phone_number === phone);
                sampled.push({ phone, messages: msgs, qaScore: qa?.quality_score ?? undefined });
            }
            if (sampled.length >= 10) break;
        }

        // Priority 2: Low-score conversations
        for (const phone of lowScorePhones) {
            if (sampled.some(s => s.phone === phone)) continue;
            const msgs = conversations.get(phone);
            if (msgs && msgs.length >= 2) {
                const qa = qaLogs.find(q => q.phone_number === phone);
                sampled.push({ phone, messages: msgs, qaScore: qa?.quality_score ?? undefined });
            }
            if (sampled.length >= 20) break;
        }

        // Priority 3: Random sample from remaining
        for (const [phone, msgs] of conversations) {
            if (sampled.some(s => s.phone === phone)) continue;
            if (msgs.length >= 3) {
                sampled.push({ phone, messages: msgs });
            }
            if (sampled.length >= 30) break;
        }

        // 12. Analyze sampled conversations via LLM
        const allIssues: Map<string, AuditIssue> = new Map();

        // Process in batches of 5 to avoid rate limits
        for (let i = 0; i < sampled.length; i += 5) {
            const batch = sampled.slice(i, i + 5);
            const analyses = await Promise.allSettled(
                batch.map(s => this.analyzeConversation(s.phone, s.messages, s.qaScore)),
            );

            for (const result of analyses) {
                if (result.status === 'fulfilled' && result.value) {
                    for (const issue of result.value) {
                        const existing = allIssues.get(issue.category);
                        if (existing) {
                            existing.count += 1;
                            existing.examples.push(...issue.examples);
                            if (issue.severity === 'high') existing.severity = 'high';
                            else if (issue.severity === 'medium' && existing.severity === 'low') existing.severity = 'medium';
                        } else {
                            allIssues.set(issue.category, { ...issue });
                        }
                    }
                }
            }
        }

        // Sort issues by count (highest first)
        const issuesFound = Array.from(allIssues.values())
            .sort((a, b) => b.count - a.count);

        const result: AuditResult = {
            totalConversations: conversations.size,
            totalFlagged: flaggedPhones.size,
            avgQualityScore,
            issuesFound,
            agentBreakdown,
            sentimentStats,
            winningTemplates,
        };

        logger.info(`[AuditAgent] Audit complete: ${conversations.size} conversations, ${issuesFound.length} issue categories found`);
        return result;
    }

    /**
     * Analyze a single conversation for issues using LLM.
     */
    private async analyzeConversation(
        phone: string,
        messages: { direction: string; content: string | null; created_at: Date }[],
        qaScore?: number,
    ): Promise<AuditIssue[]> {
        try {
            // Build conversation text
            const convoText = messages
                .map((m, i) => `[${i + 1}] ${m.direction === 'inbound' ? 'User' : 'Panditji'}: ${m.content || '(empty)'}`)
                .join('\n');

            const prompt = `You are a QA auditor for "Panditji", a real estate AI assistant.
Analyze this conversation and identify issues.

CONVERSATION:
${convoText}

${qaScore !== undefined ? `QUALITY SCORE: ${qaScore}/10` : ''}

Check for these issues:
1. repeated_greeting — Bot says Namaste/Hello/Welcome more than once in the conversation
2. language_mixing — Bot switches languages mid-conversation (user speaks English, bot replies Hinglish, or vice versa)
3. context_loss — Bot asks for information the user already provided
4. no_property_search — Buyer shared budget/location but bot didn't show properties
5. wrong_classification — User was misrouted (treated as wrong type)
6. generic_response — Bot gave vague reply that doesn't move conversation forward
7. missed_intent — User asked X, bot responded about Y
8. slow_qualification — Too many messages before qualifying buyer (>4 back-and-forth)
9. no_follow_up — Conversation ended abruptly without a clear next step
10. tone_issue — Response too formal, too casual, or inappropriate

Return ONLY a JSON array of issues found. If no issues, return [].
Each issue: {"category":"...","severity":"high|medium|low","detail":"one sentence describing the problem","message_index":N}

Response (JSON array only):`;

            const response = await this.llmService.generateResponse(prompt, '');

            // Parse JSON from response
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (!jsonMatch) return [];

            const parsed = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(parsed)) return [];

            // Convert to AuditIssue format
            return parsed
                .filter((p: any) => p.category && ISSUE_CATEGORIES.includes(p.category))
                .map((p: any) => ({
                    category: p.category,
                    count: 1,
                    severity: p.severity || 'medium',
                    examples: [{ phone, detail: p.detail || '', message_index: p.message_index }],
                    suggestion: '',
                }));
        } catch (err) {
            logger.warn(`[AuditAgent] Failed to analyze conversation for ${phone}:`, err);
            return [];
        }
    }
}
