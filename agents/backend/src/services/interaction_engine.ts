
import prisma from '../db';
import { LLMService } from './llm';
import { SystemPromptService } from './system_prompt';
import { WhatsAppService } from './whatsapp';
import { TransactionStatus } from '@prisma/client';
import { isQuietHours } from '../utils/quiet_hours';
import logger from '../utils/logger';

// ─── Interaction Probability Matrix ─────────────────────────────
// What users likely do next based on Transaction status

interface ProbabilityEntry {
    action: string;
    probability: number; // 0-100
}

interface TriggerRule {
    /** Hours of silence before triggering */
    silenceHours: number;
    /** Template key for the follow-up message */
    templateKey: string;
    /** Description for logging */
    description: string;
    /** Max times this trigger fires per transaction */
    maxFires: number;
}

const INTERACTION_MATRIX: Record<string, {
    expectedActions: ProbabilityEntry[];
    triggers: TriggerRule[];
}> = {
    NEW: {
        expectedActions: [
            { action: 'provide_requirements', probability: 90 },
            { action: 'ask_about_services', probability: 5 },
            { action: 'go_silent', probability: 5 },
        ],
        triggers: [
            {
                silenceHours: 24,
                templateKey: 'tx_followup_new',
                description: 'Ask for budget/location/property type',
                maxFires: 2,
            },
        ],
    },
    MATCHED: {
        expectedActions: [
            { action: 'ask_property_details', probability: 60 },
            { action: 'schedule_visit', probability: 25 },
            { action: 'reject_match', probability: 10 },
            { action: 'go_silent', probability: 5 },
        ],
        triggers: [
            {
                silenceHours: 12,
                templateKey: 'tx_followup_matched',
                description: 'Send match summary and encourage visit',
                maxFires: 2,
            },
        ],
    },
    VISIT_SCHEDULED: {
        expectedActions: [
            { action: 'confirm_visit', probability: 50 },
            { action: 'reschedule', probability: 25 },
            { action: 'cancel', probability: 15 },
            { action: 'go_silent', probability: 10 },
        ],
        triggers: [
            {
                silenceHours: 24,
                templateKey: 'tx_reminder_visit_day_before',
                description: 'Visit reminder (day before)',
                maxFires: 1,
            },
            {
                silenceHours: 2,
                templateKey: 'tx_reminder_visit_2h',
                description: 'Visit reminder (2 hours before)',
                maxFires: 1,
            },
        ],
    },
    VISITED: {
        expectedActions: [
            { action: 'share_feedback', probability: 40 },
            { action: 'negotiate_price', probability: 30 },
            { action: 'request_more_properties', probability: 20 },
            { action: 'go_silent', probability: 10 },
        ],
        triggers: [
            {
                silenceHours: 48,
                templateKey: 'tx_followup_visited',
                description: 'Ask for visit feedback',
                maxFires: 2,
            },
        ],
    },
    NEGOTIATION: {
        expectedActions: [
            { action: 'discuss_price', probability: 45 },
            { action: 'agree_deal', probability: 15 },
            { action: 'walk_away', probability: 10 },
            { action: 'request_revisit', probability: 15 },
            { action: 'go_silent', probability: 15 },
        ],
        triggers: [
            {
                silenceHours: 72,
                templateKey: 'tx_followup_negotiation',
                description: 'Executive intervention — nudge deal forward',
                maxFires: 3,
            },
        ],
    },
    CLOSED_WON: {
        expectedActions: [
            { action: 'paperwork_questions', probability: 70 },
            { action: 'referral', probability: 20 },
            { action: 'go_silent', probability: 10 },
        ],
        triggers: [
            {
                silenceHours: 168, // 7 days
                templateKey: 'tx_followup_won',
                description: 'Ask for referral or review',
                maxFires: 1,
            },
        ],
    },
    CLOSED_LOST: {
        expectedActions: [
            { action: 're_engage', probability: 40 },
            { action: 'permanent_exit', probability: 60 },
        ],
        triggers: [
            {
                silenceHours: 720, // 30 days
                templateKey: 'tx_followup_lost',
                description: 'New inventory notification / re-engagement',
                maxFires: 1,
            },
        ],
    },
};

// ─── Follow-up Message Templates ─────────────────────────────────

const FOLLOWUP_TEMPLATES: Record<string, (tx: any) => string> = {
    tx_followup_new: (tx) =>
        `Namaste! Main Panditji, aapka property assistant. Aapne recently ${tx.type === 'RENT' ? 'rent' : 'purchase'} ke baare mein inquiry ki thi. Kya aap apna budget, preferred location, aur property type bata sakte hain? Main aapke liye best options dhundhta hoon! 🏠`,

    tx_followup_matched: (tx) =>
        `Hello! Aapki ${tx.demand_property_type || 'property'} search ke liye ${tx.demand_location || 'aapke preferred area'} mein ek matching property mili hai. Kya aap site visit schedule karna chahenge? Main sab arrange kar dunga. 📋`,

    tx_reminder_visit_day_before: (_tx) =>
        `Reminder: Kal aapki property visit scheduled hai. Kya aap confirm karte hain? Agar reschedule karna ho toh bata dijiye. 🗓️`,

    tx_reminder_visit_2h: (_tx) =>
        `Aapki property visit 2 ghante mein hai. Ready hain? Koi bhi question ho toh pooch lijiye. Main yahaan hoon! 🏡`,

    tx_followup_visited: (tx) =>
        `Namaste! Aapne recently ${tx.demand_location || 'ek'} property visit ki thi. Kaisa laga? Kya aap aage badhna chahte hain, ya kuch aur options dekhne hain? Aapka feedback zaroori hai. 🙏`,

    tx_followup_negotiation: (tx) =>
        `Hello! ${tx.demand_property_type || 'Property'} deal ke baare mein koi update? Agar price discussion mein koi help chahiye toh Realty Pandit ki team ready hai. Hum aapke liye best deal negotiate karenge. 💼`,

    tx_followup_won: (_tx) =>
        `Congratulations again on your new property! 🎉 Agar paperwork ya registration mein koi help chahiye, Panditji yahaan hai. Aur agar aapke friends ya family ko bhi property chahiye, toh unhe Realty Pandit recommend karein! 🏠`,

    tx_followup_lost: (tx) =>
        `Namaste! Kuch time pehle aapne ${tx.demand_property_type || 'property'} ke liye inquiry ki thi. Hamare paas naye properties aayi hain ${tx.demand_location || 'aapke preferred area'} mein. Kya aap dubara dekhna chahenge? 🏘️`,
};

// ─── Interaction Engine ──────────────────────────────────────────

const MAX_FOLLOWUPS_PER_RUN = 30;
const CHECK_INTERVAL_MS = 3600000; // 1 hour

export class InteractionEngine {
    private llmService: LLMService;
    private whatsappService: WhatsAppService;
    private running: boolean = false;
    private intervalId?: ReturnType<typeof setInterval>;

    constructor() {
        this.llmService = new LLMService();
        this.whatsappService = new WhatsAppService();
    }

    /**
     * Start the engine. Runs every hour alongside FollowupScheduler.
     */
    start(intervalMs: number = CHECK_INTERVAL_MS): void {
        if (this.running) return;
        this.running = true;
        logger.info('[InteractionEngine] Started. Checking hourly for transaction-based triggers.');

        // Run once immediately, then on interval
        this.runTriggerCheck();
        this.intervalId = setInterval(() => this.runTriggerCheck(), intervalMs);
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
        this.running = false;
        logger.info('[InteractionEngine] Stopped.');
    }

    /**
     * Get probability matrix for a given transaction status.
     */
    static getExpectedActions(status: string): ProbabilityEntry[] {
        return INTERACTION_MATRIX[status]?.expectedActions || [];
    }

    /**
     * Get trigger rules for a given transaction status.
     */
    static getTriggerRules(status: string): TriggerRule[] {
        return INTERACTION_MATRIX[status]?.triggers || [];
    }

    /**
     * Main trigger check: find all active transactions that need proactive follow-up.
     */
    async runTriggerCheck(): Promise<number> {
        // Indian quiet hours: no automated follow-ups 9 PM – 8 AM IST
        if (isQuietHours()) {
            logger.info('[InteractionEngine] Quiet hours (9PM-8AM IST) — skipping trigger check.');
            return 0;
        }

        try {
            const activeStatuses: TransactionStatus[] = [
                'NEW', 'MATCHED', 'VISIT_SCHEDULED', 'VISITED',
                'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST',
            ];

            // Fetch active transactions with their demand contacts
            const transactions = await prisma.transaction.findMany({
                where: {
                    status: { in: activeStatuses },
                },
                include: {
                    demand_contact: true,
                    supply_contact: true,
                    executive_agent: true,
                    logs: {
                        where: { action: 'FOLLOWUP_SENT' },
                        orderBy: { created_at: 'desc' },
                    },
                },
                take: 100,
                orderBy: { updated_at: 'asc' },
            });

            if (transactions.length === 0) {
                logger.info('[InteractionEngine] No active transactions to check.');
                return 0;
            }

            let sent = 0;

            for (const tx of transactions) {
                if (sent >= MAX_FOLLOWUPS_PER_RUN) break;

                const rules = InteractionEngine.getTriggerRules(tx.status);
                if (rules.length === 0) continue;

                for (const rule of rules) {
                    if (sent >= MAX_FOLLOWUPS_PER_RUN) break;

                    const shouldFire = await this.shouldFireTrigger(tx, rule);
                    if (shouldFire) {
                        const success = await this.fireTrigger(tx, rule);
                        if (success) sent++;
                    }
                }
            }

            logger.info(`[InteractionEngine] Sent ${sent} transaction follow-ups this run.`);
            return sent;
        } catch (error) {
            logger.error('[InteractionEngine] Error in trigger check:', error);
            return 0;
        }
    }

    /**
     * Check if a trigger should fire for a given transaction.
     */
    private async shouldFireTrigger(tx: any, rule: TriggerRule): Promise<boolean> {
        // 1. Check silence duration
        const lastActivity = tx.updated_at;
        const silenceMs = Date.now() - new Date(lastActivity).getTime();
        const silenceHours = silenceMs / (1000 * 60 * 60);

        if (silenceHours < rule.silenceHours) return false;

        // 2. For visit reminders, check appointment time instead of silence
        if (rule.templateKey === 'tx_reminder_visit_2h' || rule.templateKey === 'tx_reminder_visit_day_before') {
            const appointment = await prisma.appointment.findFirst({
                where: {
                    transaction_id: tx.id,
                    status: { in: ['scheduled', 'confirmed'] },
                    scheduled_at: { gte: new Date() },
                },
                orderBy: { scheduled_at: 'asc' },
            });

            if (!appointment) return false;

            const hoursUntilVisit = (new Date(appointment.scheduled_at).getTime() - Date.now()) / (1000 * 60 * 60);

            if (rule.templateKey === 'tx_reminder_visit_day_before') {
                // Fire when visit is 20-28 hours away
                if (hoursUntilVisit < 20 || hoursUntilVisit > 28) return false;
            } else if (rule.templateKey === 'tx_reminder_visit_2h') {
                // Fire when visit is 1.5-3 hours away
                if (hoursUntilVisit < 1.5 || hoursUntilVisit > 3) return false;
            }
        }

        // 3. Check max fires per transaction for this template
        const previousFires = tx.logs.filter(
            (log: any) =>
                log.action === 'FOLLOWUP_SENT' &&
                log.details &&
                (log.details as any).templateKey === rule.templateKey
        ).length;

        if (previousFires >= rule.maxFires) return false;

        // 4. Check no follow-up sent in last 6 hours (anti-spam)
        const recentFollowup = tx.logs.find(
            (log: any) =>
                log.action === 'FOLLOWUP_SENT' &&
                Date.now() - new Date(log.created_at).getTime() < 6 * 60 * 60 * 1000
        );

        if (recentFollowup) return false;

        return true;
    }

    /**
     * Fire a trigger: send a Meta-approved template follow-up message.
     */
    private async fireTrigger(tx: any, rule: TriggerRule): Promise<boolean> {
        try {
            const phone = tx.demand_contact?.phone_number;
            if (!phone) return false;

            // Map internal template keys to Meta template names + params
            const metaTemplateMap: Record<string, { name: string; params: Record<string, string> }> = {
                tx_followup_new: {
                    name: 'rp_tx_followup_new',
                    params: { inquiry_type: tx.type === 'RENT' ? 'renting a property' : 'purchasing a property' },
                },
                tx_followup_matched: {
                    name: 'rp_tx_followup_matched',
                    params: { property_type: tx.demand_property_type || 'property', location: tx.demand_location || 'your preferred area' },
                },
                tx_reminder_visit_day_before: {
                    name: 'rp_tx_visit_reminder_1d',
                    params: {},
                },
                tx_reminder_visit_2h: {
                    name: 'rp_tx_visit_reminder_2h',
                    params: {},
                },
                tx_followup_visited: {
                    name: 'rp_tx_followup_visited',
                    params: { location: tx.demand_location || 'your area' },
                },
                tx_followup_negotiation: {
                    name: 'rp_tx_followup_negotiation',
                    params: { property_type: tx.demand_property_type || 'Property' },
                },
                tx_followup_won: {
                    name: 'rp_tx_followup_won',
                    params: {},
                },
                tx_followup_lost: {
                    name: 'rp_tx_followup_lost',
                    params: { property_type: tx.demand_property_type || 'property', location: tx.demand_location || 'your preferred area' },
                },
            };

            const metaTemplate = metaTemplateMap[rule.templateKey];
            let message: string;

            if (metaTemplate) {
                // Send via Meta-approved template
                await this.whatsappService.sendTemplate(phone, metaTemplate.name, metaTemplate.params);
                // Keep old template text for logging
                const templateFn = FOLLOWUP_TEMPLATES[rule.templateKey];
                message = templateFn ? templateFn(tx) : `[Template: ${metaTemplate.name}]`;
            } else {
                // Fallback to LLM-generated message (within session window only)
                message = await this.generateLLMFollowup(tx, rule) || '';
                if (!message) return false;
                await this.whatsappService.sendText(phone, message);
            }

            // Log to TransactionLog
            await prisma.transactionLog.create({
                data: {
                    transaction_id: tx.id,
                    action: 'FOLLOWUP_SENT',
                    performed_by: 'system:interaction_engine',
                    channel: 'whatsapp',
                    details: {
                        templateKey: rule.templateKey,
                        description: rule.description,
                        silenceHours: rule.silenceHours,
                    },
                },
            });

            // Log to Interaction table
            await prisma.interaction.create({
                data: {
                    tenant_id: tx.demand_contact?.tenant_id || tx.tenant_id,
                    phone_number: phone,
                    channel: 'whatsapp',
                    direction: 'outbound',
                    event_type: 'followup',
                    content: message,
                    metadata: {
                        type: 'transaction_followup',
                        trigger: rule.templateKey,
                        transaction_id: tx.id,
                        transaction_status: tx.status,
                    },
                },
            });

            // Update contact last_interaction
            await prisma.contact.update({
                where: { phone_number: phone },
                data: { last_interaction: new Date() },
            });

            // Also notify the executive (if assigned) about the follow-up
            // Executive notifications are internal - use smartSend (template if outside session)
            if (tx.executive_agent?.phone) {
                const execMsg = `[Auto Follow-up] Transaction ${tx.id.substring(0, 8)} (${tx.status}): Follow-up sent to ${tx.demand_contact?.name || phone}. Reason: ${rule.description}`;
                const { SessionTracker } = require('./session_tracker');
                SessionTracker.smartSend(
                    this.whatsappService,
                    tx.executive_agent.phone,
                    execMsg,
                    'rp_tx_lead_assigned',
                    {
                        name: tx.demand_contact?.name || phone,
                        property_type: tx.demand_property_type || 'N/A',
                        location: tx.demand_location || 'N/A',
                        budget: 'N/A',
                        type: tx.type || 'Sale',
                        source: 'Auto Follow-up',
                    },
                ).catch(() => {});
            }

            logger.info(`[InteractionEngine] Trigger fired: ${rule.templateKey} for TX ${tx.id.substring(0, 8)} → ${phone}`);
            return true;
        } catch (error) {
            logger.error(`[InteractionEngine] Failed to fire trigger ${rule.templateKey} for TX ${tx.id}:`, error);
            return false;
        }
    }

    /**
     * LLM fallback for generating follow-up messages when no template exists.
     */
    private async generateLLMFollowup(tx: any, rule: TriggerRule): Promise<string | null> {
        const language = tx.demand_contact?.preferred_language;
        const coreBehavior = await SystemPromptService.getCoreBehavior(language);
        const prompt = `
        ${coreBehavior}

        CONTEXT:
        - Role: Proactive Transaction Follow-up
        - Transaction Type: ${tx.type === 'RENT' ? 'Rental' : 'Sale'}
        - Transaction Status: ${tx.status}
        - Property Type: ${tx.demand_property_type || 'Not specified'}
        - Location: ${tx.demand_location || 'Not specified'}
        - Budget: ${tx.demand_budget_max ? `Up to ${tx.demand_budget_max}` : 'Not specified'}
        - Trigger Reason: ${rule.description}
        - Contact Name: ${tx.demand_contact?.name || 'N/A'}

        GOAL: Generate a SHORT (2-3 sentences), friendly follow-up message.
        - Be warm but not pushy
        - Reference the specific deal context
        - Include a clear call-to-action
        `;

        return this.llmService.generateResponseWithHistory(
            prompt,
            'Generate a transaction follow-up message',
            tx.demand_contact?.phone_number || 'system',
            3
        );
    }
}
