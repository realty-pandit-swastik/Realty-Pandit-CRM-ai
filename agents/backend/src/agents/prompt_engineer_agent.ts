/**
 * Prompt Engineer Agent — Auto-deploys prompt improvements to DB.
 *
 * Takes audit reports, drafts specific prompt overrides, and saves them
 * to the PromptOverride table. Changes take effect immediately at runtime
 * since SystemPromptService reads overrides from DB.
 *
 * Safety: Max 3 new overrides/day, max 20 total active, prompt-only changes.
 * Part of the AI Boss self-improvement system.
 */

import { LLMService } from '../services/llm';
import { SystemPromptService } from '../services/system_prompt';
import { AuditResult, AuditIssue } from './audit_agent';
import prisma from '../db';
import logger from '../utils/logger';

// ─── Types ──────────────────────────────────────────────────────

export interface PromptAction {
    prompt_key: string;
    section: string;
    content: string;
    reason: string;
    issue_category: string;
}

// ─── Constants ──────────────────────────────────────────────────

const MAX_NEW_OVERRIDES_PER_DAY = 3;
const MAX_TOTAL_ACTIVE_OVERRIDES = 20;

/** Map issue categories to prompt keys */
const CATEGORY_TO_PROMPT_KEY: Record<string, string> = {
    repeated_greeting: 'core_behavior',
    language_mixing: 'core_behavior',
    context_loss: 'core_behavior',
    no_property_search: 'buyer_prompt',
    wrong_classification: 'identification',
    generic_response: 'core_behavior',
    missed_intent: 'core_behavior',
    slow_qualification: 'buyer_prompt',
    no_follow_up: 'core_behavior',
    tone_issue: 'core_behavior',
};

// ─── Prompt Engineer Agent ──────────────────────────────────────

export class PromptEngineerAgent {
    private llmService: LLMService;

    constructor() {
        this.llmService = new LLMService();
    }

    /**
     * Process an audit report and deploy prompt improvements.
     */
    async processAuditReport(report: AuditResult, auditReportId?: string): Promise<PromptAction[]> {
        logger.info(`[PromptEngineer] Processing audit report with ${report.issuesFound.length} issue categories`);

        // 1. Check how many overrides we've already deployed today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayDeployments = await prisma.promptOverride.count({
            where: { created_at: { gte: todayStart } },
        });

        const remainingSlots = MAX_NEW_OVERRIDES_PER_DAY - todayDeployments;
        if (remainingSlots <= 0) {
            logger.info('[PromptEngineer] Daily override limit reached. Skipping.');
            return [];
        }

        // 2. Filter issues: only process categories with count >= 2
        const actionableIssues = report.issuesFound
            .filter(issue => issue.count >= 2)
            .sort((a, b) => {
                // Sort by severity (high first), then by count
                const severityOrder = { high: 0, medium: 1, low: 2 };
                const diff = severityOrder[a.severity] - severityOrder[b.severity];
                return diff !== 0 ? diff : b.count - a.count;
            })
            .slice(0, remainingSlots);

        if (actionableIssues.length === 0) {
            logger.info('[PromptEngineer] No actionable issues (all below threshold). Skipping.');
            return [];
        }

        // 3. Get current active overrides to avoid conflicts
        const existingOverrides = await prisma.promptOverride.findMany({
            where: { active: true },
            orderBy: { priority: 'asc' },
        });

        // 4. Get winning templates for reference
        const winningTemplatesStr = report.winningTemplates.length > 0
            ? report.winningTemplates.map(w => `[Score ${w.score}]: "${w.content}"`).join('\n')
            : 'No high-scoring examples available.';

        // 5. Draft and deploy overrides for each issue
        const actions: PromptAction[] = [];

        for (const issue of actionableIssues) {
            try {
                const action = await this.draftOverride(issue, existingOverrides, winningTemplatesStr);
                if (!action) continue;

                // Save to DB
                const nextPriority = existingOverrides.length + actions.length + 1;
                await prisma.promptOverride.create({
                    data: {
                        prompt_key: action.prompt_key,
                        section: action.section,
                        content: action.content,
                        priority: nextPriority,
                        active: true,
                        reason: action.reason,
                        audit_report_id: auditReportId || null,
                        deployed_by: 'prompt_engineer_agent',
                        version: 1,
                    },
                });

                actions.push(action);
                logger.info(`[PromptEngineer] Deployed override: [${action.prompt_key}/${action.section}] — ${action.reason}`);
            } catch (err) {
                logger.error(`[PromptEngineer] Failed to deploy override for ${issue.category}:`, err);
            }
        }

        // 6. Enforce max active overrides limit
        await this.enforceOverrideLimit();

        logger.info(`[PromptEngineer] Deployed ${actions.length} prompt improvements`);
        return actions;
    }

    /**
     * Draft a single prompt override using LLM.
     */
    private async draftOverride(
        issue: AuditIssue,
        existingOverrides: { prompt_key: string; section: string; content: string }[],
        winningTemplates: string,
    ): Promise<PromptAction | null> {
        const promptKey = CATEGORY_TO_PROMPT_KEY[issue.category] || 'core_behavior';

        // Get current prompt content for context
        let currentRules = '';
        try {
            if (promptKey === 'core_behavior') {
                currentRules = await SystemPromptService.getCoreBehavior();
            } else if (promptKey === 'buyer_prompt') {
                currentRules = await SystemPromptService.getBuyerPrompt({ lead_status: 'cold', intent: 'BUYER', missing_info: '' });
            } else if (promptKey === 'identification') {
                currentRules = await SystemPromptService.getIdentificationPrompt();
            }
            // Truncate to avoid token limits
            if (currentRules.length > 2000) {
                currentRules = currentRules.substring(0, 2000) + '... (truncated)';
            }
        } catch {
            currentRules = '(Could not load current rules)';
        }

        // Show existing overrides for this key
        const existingForKey = existingOverrides
            .filter(o => o.prompt_key === promptKey)
            .map(o => `[${o.section}]: ${o.content}`)
            .join('\n');

        const examplesStr = issue.examples
            .slice(0, 3)
            .map(e => `- ${e.detail}`)
            .join('\n');

        const prompt = `You are a prompt engineer for "Panditji", a real estate AI assistant.

CURRENT SYSTEM PROMPT (partial):
${currentRules.substring(0, 1500)}

EXISTING OVERRIDES FOR "${promptKey}":
${existingForKey || '(none)'}

AUDIT FINDING:
Category: ${issue.category}
Count: ${issue.count} occurrences in last 24h
Severity: ${issue.severity}
Examples:
${examplesStr}

WINNING TEMPLATES (high-scoring responses):
${winningTemplates.substring(0, 500)}

Draft a concise rule (1-3 sentences) to add to the system prompt that would prevent this issue.
The rule must be:
- Clear and unambiguous
- Not contradict existing rules or overrides
- Actionable (tells the AI exactly what to do/not do)
- Written in English

Return ONLY a JSON object:
{"section":"greeting_rules|language_rules|qualification_rules|response_format|classification_rules|context_rules|followup_rules","content":"The rule text...","reason":"Why this rule is needed (1 sentence)"}

Response (JSON only):`;

        try {
            const response = await this.llmService.generateResponse(prompt, '');
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return null;

            const parsed = JSON.parse(jsonMatch[0]);
            if (!parsed.section || !parsed.content) return null;

            // Validate section name
            const validSections = [
                'greeting_rules', 'language_rules', 'qualification_rules',
                'response_format', 'classification_rules', 'context_rules', 'followup_rules',
            ];
            if (!validSections.includes(parsed.section)) {
                parsed.section = 'response_format'; // fallback
            }

            return {
                prompt_key: promptKey,
                section: parsed.section,
                content: parsed.content.substring(0, 500), // Cap at 500 chars
                reason: (parsed.reason || `Fix for ${issue.category}`).substring(0, 200),
                issue_category: issue.category,
            };
        } catch (err) {
            logger.warn(`[PromptEngineer] Failed to draft override for ${issue.category}:`, err);
            return null;
        }
    }

    /**
     * Enforce the max active overrides limit.
     * Deactivates oldest overrides if limit exceeded.
     */
    private async enforceOverrideLimit(): Promise<void> {
        const activeCount = await prisma.promptOverride.count({ where: { active: true } });

        if (activeCount > MAX_TOTAL_ACTIVE_OVERRIDES) {
            const excess = activeCount - MAX_TOTAL_ACTIVE_OVERRIDES;
            const oldest = await prisma.promptOverride.findMany({
                where: { active: true },
                orderBy: { created_at: 'asc' },
                take: excess,
            });

            for (const override of oldest) {
                await prisma.promptOverride.update({
                    where: { id: override.id },
                    data: { active: false },
                });
                logger.info(`[PromptEngineer] Deactivated old override ${override.id} (${override.section}) — limit enforcement`);
            }
        }
    }
}
