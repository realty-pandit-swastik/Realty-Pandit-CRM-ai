
import prisma from '../db';
import { LLMService } from './llm';
import { SystemPromptService } from './system_prompt';
import { WhatsAppService } from './whatsapp';
import { SessionTracker } from './session_tracker';
import { PendingMessageQueue } from './pending_message_queue';
import { isQuietHours } from '../utils/quiet_hours';
import { isLlmFallback } from '../utils/intent_signals';
import logger from '../utils/logger';

const FOLLOWUP_HOURS = 48;
const MAX_FOLLOWUPS_PER_RUN = 20;
const SILENCE_PAUSE_DAYS = 5;  // Stop AI messages, create phone-call task for agent
const SILENCE_COLD_DAYS = 14;  // Mark lead cold, close sessions, stop all messages

/**
 * Proactive AI Follow-up Scheduler.
 * Checks for warm/hot contacts with no interaction in 48h and
 * generates personalized follow-up messages via Panditji.
 */
export class FollowupScheduler {
    private llmService: LLMService;
    private whatsappService: WhatsAppService;
    private running: boolean = false;
    private intervalId?: ReturnType<typeof setInterval>;

    constructor() {
        this.llmService = new LLMService();
        this.whatsappService = new WhatsAppService();
    }

    /**
     * Start the scheduler. Runs every hour.
     */
    start(intervalMs: number = 3600000): void {
        if (this.running) return;
        this.running = true;
        logger.info('[FollowupScheduler] Started. Checking every hour for stale leads.');

        // Run once immediately, then on interval
        this.checkAndFollowUp();
        this.intervalId = setInterval(() => this.checkAndFollowUp(), intervalMs);
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
        this.running = false;
        logger.info('[FollowupScheduler] Stopped.');
    }

    /**
     * Find contacts needing follow-up and send personalized messages.
     */
    async checkAndFollowUp(): Promise<number> {
        // Indian quiet hours: no automated follow-ups 9 PM – 8 AM IST
        if (isQuietHours()) {
            logger.info('[FollowupScheduler] Quiet hours (9PM-8AM IST) — skipping.');
            return 0;
        }

        try {
            const cutoffDate = new Date(Date.now() - FOLLOWUP_HOURS * 60 * 60 * 1000);

            // Find warm/hot contacts with no recent interaction
            const staleContacts = await prisma.contact.findMany({
                where: {
                    lead_status: { in: ['warm', 'hot'] },
                    contact_type: { in: ['BUYER', 'TENANT', 'LANDLORD'] },
                    last_interaction: { lt: cutoffDate },
                    // Never follow up with someone who asked us to stop (2026-07-22).
                    // This service does not honour ai_paused, so it needs its own guard.
                    opted_out_at: null,
                    // Don't follow up on contacts that already have a pending follow-up task
                    NOT: {
                        tasks: {
                            some: {
                                status: 'pending',
                                task_type: 'whatsapp'
                            }
                        }
                    }
                },
                take: MAX_FOLLOWUPS_PER_RUN,
                orderBy: { last_interaction: 'asc' }
            });

            if (staleContacts.length === 0) {
                logger.info('[FollowupScheduler] No stale contacts found.');
                return 0;
            }

            logger.info(`[FollowupScheduler] Found ${staleContacts.length} contacts needing follow-up.`);

            let sent = 0;
            for (const contact of staleContacts) {
                try {
                    // NEVER-REPLIED leads (scraped from 99acres/MagicBricks/etc): skip free-form follow-ups.
                    // These contacts have no open 24h WhatsApp window — Meta rejects free-form messages
                    // and the queued message sits in pending_messages forever. Mark cold after 7 days.
                    if (!contact.last_wa_inbound) {
                        const daysSinceCreate = (Date.now() - contact.created_at.getTime()) / (1000 * 60 * 60 * 24);
                        if (daysSinceCreate >= 7) {
                            await prisma.contact.update({
                                where: { phone_number: contact.phone_number },
                                data: { lead_status: 'cold' }
                            });
                            logger.info(`[FollowupScheduler] ${contact.phone_number} (${contact.name}) never replied (created ${Math.round(daysSinceCreate)}d ago) — marked cold`);
                        } else {
                            logger.info(`[FollowupScheduler] ${contact.phone_number} (${contact.name}) never replied — skipping free-form (no open 24h window)`);
                        }
                        continue;
                    }

                    // Silence detection — check last time contact actually replied on WhatsApp
                    {
                        const daysSilent = (Date.now() - contact.last_wa_inbound.getTime()) / (1000 * 60 * 60 * 24);

                        if (daysSilent >= SILENCE_COLD_DAYS) {
                            // 14+ days no reply — mark cold, close all active sessions, stop all messages
                            await prisma.contact.update({
                                where: { phone_number: contact.phone_number },
                                data: { lead_status: 'cold' }
                            });
                            await prisma.conversationSession.updateMany({
                                where: { phone_number: contact.phone_number, active: true },
                                data: { active: false }
                            });
                            logger.info(`[FollowupScheduler] ${contact.phone_number} (${contact.name}) silent ${Math.round(daysSilent)}d — marked cold, sessions closed`);
                            continue;
                        }

                        if (daysSilent >= SILENCE_PAUSE_DAYS) {
                            // 5–14 days no reply — pause AI messages, create phone-call task for agent (once)
                            const existingCallTask = await prisma.task.findFirst({
                                where: {
                                    contact_phone: contact.phone_number,
                                    status: 'TODO',
                                    title: { contains: 'not responding on WhatsApp' }
                                }
                            });
                            if (!existingCallTask) {
                                // (2026-06-23) Task.assigned_to is REQUIRED — passing `undefined` for an
                                // unassigned contact threw "assigned_to is missing" EVERY HOUR (the failed
                                // create never deduped, so it retried forever). Route an unassigned silent
                                // lead's call task to an active super_boss so it isn't lost.
                                let assignee: string | null = contact.assigned_agent_id;
                                if (!assignee) {
                                    const boss = await prisma.agent.findFirst({ where: { role: 'super_boss', status: 'active' }, select: { id: true } });
                                    assignee = boss?.id ?? null;
                                }
                                if (assignee) {
                                    await prisma.task.create({
                                        data: {
                                            title: `📞 Call ${contact.name || contact.phone_number} — not responding on WhatsApp (${Math.round(daysSilent)}d)`,
                                            description: `Contact has not replied on WhatsApp for ${Math.round(daysSilent)} days. Last stated location: ${contact.preferred_location || 'unknown'}. Please call directly to check interest.`,
                                            contact_phone: contact.phone_number,
                                            assigned_to: assignee,
                                            priority: 'HIGH',
                                            status: 'TODO',
                                            task_type: 'QUALIFY_LEAD',
                                            due_date: new Date(Date.now() + 24 * 60 * 60 * 1000),
                                        }
                                    });
                                } else {
                                    logger.warn(`[FollowupScheduler] ${contact.phone_number} silent ${Math.round(daysSilent)}d but unassigned + no active super_boss — call task skipped`);
                                }
                            }
                            logger.info(`[FollowupScheduler] ${contact.phone_number} (${contact.name}) silent ${Math.round(daysSilent)}d — skipping AI message, phone task created`);
                            continue;
                        }
                    }

                    const followupMessage = await this.generateFollowUp(contact);
                    // Never send an LLM holding/error line ("experiencing high traffic") as a proactive
                    // followup — it leaked to clients (real-chat F7-A). Skip silently if the LLM failed.
                    if (followupMessage && isLlmFallback(followupMessage)) {
                        logger.warn(`[FollowupScheduler] LLM fallback text suppressed for ${contact.phone_number} — skipping followup`);
                        continue;
                    }
                    if (followupMessage) {
                        // Hybrid approach: check 24h session window
                        const sessionActive = await SessionTracker.isSessionActive(contact.phone_number);

                        if (sessionActive) {
                            // Within session - send LLM message directly
                            await this.whatsappService.sendText(contact.phone_number, followupMessage);
                        } else {
                            // Session expired - queue message + send re-opener template
                            await PendingMessageQueue.queueAndReopen(
                                this.whatsappService,
                                contact.phone_number,
                                followupMessage,
                                'ai_followup',
                            );
                        }

                        // Log interaction
                        await prisma.interaction.create({
                            data: {
                                tenant_id: contact.tenant_id,
                                phone_number: contact.phone_number,
                                channel: 'whatsapp',
                                direction: 'outbound',
                                event_type: 'followup',
                                content: followupMessage,
                                metadata: { type: 'ai_followup', trigger: 'scheduler' }
                            }
                        });

                        // Create a followup task record
                        await prisma.taskFollowup.create({
                            data: {
                                tenant_id: contact.tenant_id,
                                phone_number: contact.phone_number,
                                task_type: 'whatsapp',
                                status: 'completed',
                                scheduled_at: new Date(),
                                executed_at: new Date()
                            }
                        });

                        // Update last interaction
                        await prisma.contact.update({
                            where: { phone_number: contact.phone_number },
                            data: { last_interaction: new Date() }
                        });

                        sent++;
                        logger.info(`[FollowupScheduler] Sent follow-up to ${contact.phone_number}`);
                    }
                } catch (err) {
                    logger.error(`[FollowupScheduler] Failed for ${contact.phone_number}:`, err);
                }
            }

            logger.info(`[FollowupScheduler] Sent ${sent}/${staleContacts.length} follow-ups.`);
            return sent;
        } catch (error) {
            logger.error('[FollowupScheduler] Error:', error);
            return 0;
        }
    }

    /**
     * Generate a personalized follow-up message based on contact context and history.
     */
    private async generateFollowUp(contact: any): Promise<string | null> {
        const coreBehavior = await SystemPromptService.getCoreBehavior(contact.preferred_language);
        const prompt = `
        ${coreBehavior}

        CONTEXT:
        - Role: Proactive Follow-up
        - Contact Type: ${contact.contact_type}
        - Intent: ${contact.intent || 'unknown'}
        - Lead Status: ${contact.lead_status}
        - Location: ${contact.preferred_location || 'Not specified'}
        - Property Type: ${contact.property_type || 'Not specified'}
        - Last interaction was more than 48 hours ago

        GOAL: Send a friendly, personalized follow-up message to re-engage this contact.
        - If BUYER: Ask if they found a property to purchase, mention new matching listings
        - If TENANT: Ask if they found a rental property, mention new matching rentals
        - If LANDLORD: Ask about their property listing, offer updates on buyer/tenant interest
        - Keep it SHORT (2-3 sentences max)
        - Be warm but not pushy
        - Include their name if available: ${contact.name || 'N/A'}
        `;

        return this.llmService.generateResponseWithHistory(
            prompt,
            'Generate a follow-up message',
            contact.phone_number,
            5
        );
    }
}
