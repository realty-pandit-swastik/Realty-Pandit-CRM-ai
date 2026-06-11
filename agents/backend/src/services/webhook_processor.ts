/**
 * Webhook Processor — Core message processing logic extracted from webhooks.ts.
 *
 * Called by:
 *   1. BullMQ WhatsApp Inbound Worker (normal async path)
 *   2. Webhooks route directly (sync fallback if Redis/BullMQ unavailable)
 *
 * This separation ensures the webhook route stays thin (parse → queue → 200)
 * while the heavy processing runs asynchronously with retry support.
 */

import { WhatsAppService } from './whatsapp';
import { LeadScoreService } from './lead_score';
import { MessageRouter } from './message_router';
import { ChatHandler } from './chat_handler';
import { authenticateUser } from '../routes/auth_otp';
import { CalendarService } from './calendar';
import { identifyContact } from './contact_identifier';
import { parseMenuChoice } from '../utils/menu_choice';
import { SessionTracker } from './session_tracker';
import { PendingMessageQueue } from './pending_message_queue';
import { WhatsAppWorkflowAdapter } from '../workflows/whatsapp_workflow_adapter';
import { BuyerWhatsAppAdapter } from '../workflows/buyer_whatsapp_adapter';
import { builderOnboardingWorkflow } from '../workflows/builder_onboarding';
import { agentOnboardingWorkflow } from '../workflows/agent_onboarding';
import { ensureDealForLead } from './ensure_deal';
import prisma from '../db';
import logger from '../utils/logger';
import { normalizePhone } from '../utils/phone';

// Module-level singleton services
const whatsappService = new WhatsAppService();
const leadScoreService = new LeadScoreService();
const messageRouter = new MessageRouter();
const chatHandler = new ChatHandler();
const calendarService = new CalendarService();
const workflowAdapter = new WhatsAppWorkflowAdapter();
const buyerWorkflowAdapter = new BuyerWhatsAppAdapter();

// Inventory workflow trigger keywords (English + Hindi)
const INVENTORY_TRIGGER_WORDS = [
    'property', 'list property', 'add property', 'sell property', 'rent property',
    'post property', 'upload property', 'new listing', 'listing',
    'upload inventory', 'add inventory', 'inventory upload', 'inventory add',
    'meri property', 'property list karo', 'property dalo', 'property add karo',
    'inventory upload karo', 'inventory dalo',
];

// Buyer/tenant workflow trigger keywords (English + Hindi + Hinglish)
const BUYER_TRIGGER_WORDS = [
    'buy', 'rent', 'kharidna', 'kiraya', 'lena', 'chahiye',
    'looking for', 'dhundh', 'flat chahiye', 'ghar chahiye',
    'property chahiye', 'makan', 'find property', 'search property',
    'buyer', 'tenant', 'kirayedar', 'flat lena', 'ghar lena',
    'property lena', 'makan lena', 'makan chahiye',
    'property dekhna', 'flat dekhna', 'ghar dekhna',
    'property search', 'search', 'browse',
];

export interface InboundMessageData {
    from: string;
    text: string;
    rawMessage: any;
}

/**
 * Process a single inbound WhatsApp message through the full pipeline:
 *   Contact lookup → Lead scoring → Auth/Calendar/Workflow checks → Message routing → Response
 */
async function processInboundMessageInner(data: InboundMessageData): Promise<void> {
    const from = normalizePhone(data.from);
    const text = data.text;
    const msg = data.rawMessage;

    logger.info(`[WebhookProcessor] Processing msg from ${from}: ${text}`);

    // Track 24h session window for Meta template compliance
    SessionTracker.markInbound(from).catch(() => {});

    // Deliver any queued messages (from LLM hybrid approach)
    PendingMessageQueue.deliverPending(whatsappService, from).catch(() => {});

    // Stage 2 KRA: short-circuit property-card button replies before normal routing
    try {
        const { handlePropertyCardReply } = await import('./property_card_reply_handler');
        if (await handlePropertyCardReply(msg, from)) {
            logger.info(`[WebhookProcessor] Property-card reply handled for ${from}; skipping normal pipeline`);
            return;
        }
    } catch (err) {
        logger.warn('[WebhookProcessor] property_card_reply_handler error:', err);
    }

    // ─── 1. SSOT: Check or Create Contact ─────────────────────────────────────
    let contact = await prisma.contact.findUnique({ where: { phone_number: from } });

    if (!contact) {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) {
            logger.error('[WebhookProcessor] No tenant found. Seed DB first.');
            return;
        }

        // Smart identification: check Agent/PartnerAgent/Owner tables before defaulting to UNKNOWN
        const identified = await identifyContact(from);

        contact = await prisma.contact.create({
            data: {
                phone_number: from,
                tenant_id: tenant.id,
                lead_status: 'cold',
                source: identified ? `auto_${identified.source_table.toLowerCase()}` : 'whatsapp',
                contact_type: identified?.contact_type || 'UNKNOWN',
                name: identified?.name || null,
                email: identified?.email || null,
            }
        });
        logger.info(`[SSOT] Created new contact: ${from} → ${contact.contact_type}${identified ? ` (from ${identified.source_table})` : ''}`);

        // LEAD SCORING: Initialize
        await leadScoreService.initScore(contact.phone_number, contact.tenant_id);

        // B1: auto-create NEW deal for buyer/tenant/unknown inbound — Stage 1 KRA entry path.
        // Skip for partner agents, management, builders (they don't need a deal).
        if (['BUYER', 'TENANT', 'UNKNOWN'].includes(contact.contact_type)) {
            ensureDealForLead({
                contactPhone: contact.phone_number,
                source: 'whatsapp',
            }).catch((err) => {
                logger.error(`[WebhookProcessor] ensureDealForLead failed for ${contact.phone_number}: ${(err as Error).message}`);
            });
        }

        // CTWA: if this lead came from a Click-to-WhatsApp ad (ctwa_clid cached
        // on first inbound in routes/webhooks.ts), fire a real Lead event to
        // Meta's Conversions API messaging dataset so Meta can optimise toward
        // actual leads, not just "conversations started". Fully additive +
        // best-effort — must never block or fail inbound processing.
        try {
            const { cacheGet } = await import('../utils/redis');
            const ctwaClid = await cacheGet(`ctwa:${contact.phone_number}`);
            if (ctwaClid) {
                const { trackWhatsAppLead } = await import('./meta_conversions');
                trackWhatsAppLead({ ctwaClid, phone: contact.phone_number, eventName: 'Lead' }).catch(() => {});
            }
        } catch { /* non-fatal */ }
    } else if (
        contact.contact_type === 'UNKNOWN' ||
        ['BUYER', 'TENANT'].includes(contact.contact_type) ||
        (contact.contact_type === 'LANDLORD') ||
        (contact.contact_type === 'MANAGEMENT' && !contact.name)
    ) {
        // Re-check: contact may be a team member, partner, or builder that was misclassified
        const identified = await identifyContact(from);
        if (identified) {
            contact = await prisma.contact.update({
                where: { phone_number: from },
                data: {
                    contact_type: identified.contact_type,
                    name: identified.name || contact.name,
                    email: identified.email || contact.email,
                }
            });
            logger.info(`[SSOT] Re-classified/updated ${from} → ${identified.contact_type} (name: ${identified.name}, from ${identified.source_table})`);
        }
    }

    // LEAD SCORING: Engagement (+10 for message)
    if (contact) {
        await leadScoreService.updateScore(contact.phone_number, 'engagement', 10);
    }

    // ─── 2. AUTHENTICATION: Website chat WhatsApp link ────────────────────────
    const normalizedText = text.trim().toLowerCase();

    if (normalizedText === 'yes' || normalizedText === 'agree' ||
        normalizedText === 'yes.' || normalizedText === 'agree.') {

        const authenticated = authenticateUser(from);

        if (authenticated) {
            const confirmMsg = `✅ *Successfully Connected!*

Your WhatsApp is now synced with Panditji. All your conversations will be saved across all channels.

How can I help you find your perfect property today? 🏡`;

            await whatsappService.sendText(from, confirmMsg);

            await prisma.interaction.create({
                data: {
                    tenant_id: contact.tenant_id,
                    phone_number: from,
                    channel: 'whatsapp',
                    direction: 'outbound',
                    event_type: 'authentication_confirmed',
                    content: confirmMsg,
                },
            });

            logger.info(`[Auth] User authenticated via WhatsApp: ${from}`);

            await prisma.contact.update({
                where: { phone_number: from },
                data: {
                    last_channel: 'whatsapp',
                    last_interaction: new Date()
                }
            });

            return; // Skip normal routing
        }
    }

    // ─── 3. CALENDAR: Appointment confirmations / reschedule ──────────────────
    try {
        const apptChoice = parseMenuChoice(text);
        const wantsConfirm = normalizedText === 'confirm' || normalizedText.includes('confirmed') || apptChoice === 1;
        const wantsReschedule = normalizedText === 'reschedule' || normalizedText.includes('reschedule') || apptChoice === 2;
        const wantsCancel = normalizedText === 'cancel' || apptChoice === 3;
        if (wantsConfirm || wantsReschedule || wantsCancel) {

            const now = new Date();
            const pendingAppointment = await prisma.appointment.findFirst({
                where: {
                    contact_id: from,
                    scheduled_at: { gte: now },
                    status: { in: ['scheduled', 'confirmed'] },
                    reminder_sent: true,
                },
                orderBy: { scheduled_at: 'asc' },
            });

            if (pendingAppointment) {
                if (wantsConfirm) {
                    await calendarService.confirmAppointment(pendingAppointment.id);
                    logger.info(`[Calendar] Appointment confirmed via WhatsApp: ${pendingAppointment.id}`);
                    return;
                } else if (wantsReschedule) {
                    await calendarService.requestReschedule(pendingAppointment.id);
                    logger.info(`[Calendar] Reschedule requested via WhatsApp: ${pendingAppointment.id}`);
                    return;
                } else if (wantsCancel) {
                    // No cancelAppointment() on calendarService — route to the
                    // reschedule/coordination flow which a human handles.
                    await calendarService.requestReschedule(pendingAppointment.id);
                    logger.info(`[Calendar] Cancel routed to reschedule/human flow via WhatsApp: ${pendingAppointment.id}`);
                    return;
                }
            }
        }
    } catch (calendarError) {
        logger.warn('[WebhookProcessor] Calendar check failed (table may not exist):', calendarError);
    }

    // ─── 3b. PIPELINE DEAL: Active NEW/QUALIFIED deal → qualify + send property card ────
    // Per KRA Stage 1 Area 6: any positive WhatsApp reply qualifies the lead.
    // Per KRA Stage 2 Area 1: on QUALIFIED entry, send first property card immediately.
    //
    // Three message classes are handled differently:
    //   1. CLOSING SIGNAL ("humne le li hai", "not interested") → ON_HOLD, notify lead manager, polite close
    //   2. CONVERSATIONAL (questions, specific asks) → fall through to message_router for proper reply
    //   3. GENERIC ("Hi", "yes") → qualify + share next property (existing behavior)
    try {
        const activeDeal = await prisma.transaction.findFirst({
            where: {
                demand_contact_id: from,
                status: { in: ['NEW', 'QUALIFIED'] },
                ai_paused: false,
            },
            orderBy: { updated_at: 'desc' },
        });

        if (activeDeal) {
            // ── 3b.1 Closing signal detection (Hindi/English/Hinglish) ──
            const closingSignalPatterns = [
                /humne\s*(le|li|liya|li\s*hai|kha?ri?d)/i,
                /already\s*(bought|got|taken|purchased|finalized|done)/i,
                /\bnot\s*interested\b/i,
                /\bno\s*(thanks|thank\s*you|thanx)\b/i,
                /\bmat\s*bhejo\b/i,
                /\bstop\s*(messages?|messaging|sending)\b/i,
                /\bunsubscribe\b/i,
                /property\s*mil\s*(gayi|gaya|gay[ai])/i,
                /property\s*(le?\s*li|li\s*hai|kha?ri?d\s*li)/i,
                /(flat|ghar|makan)\s*(le?\s*li|li\s*hai|le\s*liya|kha?ri?d\s*liya)/i,
                /(buy|kha?ri?d)\s*kar\s*li/i,
                /book\s*kar\s*li/i,
            ];
            const isClosingSignal = closingSignalPatterns.some(re => re.test(text || ''));

            if (isClosingSignal) {
                logger.info(`[WebhookProcessor] Closing signal detected from ${from} on deal ${activeDeal.id}: "${text}"`);

                // Move deal to ON_HOLD + pause AI
                try {
                    await prisma.transaction.update({
                        where: { id: activeDeal.id },
                        data: {
                            status: 'ON_HOLD' as any,
                            ai_paused: true,
                            last_team_action_at: new Date(),
                        },
                    });
                } catch (statusErr) {
                    logger.warn(`[WebhookProcessor] Failed to move deal to ON_HOLD: ${(statusErr as Error).message}`);
                }

                // Create high-priority task for lead manager to verify + close
                try {
                    const leadMgr = await prisma.agent.findFirst({
                        where: { role: 'super_boss', status: 'active' },
                        select: { id: true },
                    });
                    if (leadMgr) {
                        await prisma.task.create({
                            data: {
                                title: `Verify closure: ${contact.name || from} indicated they bought elsewhere`,
                                description: `Customer message: "${text}". Deal moved to ON_HOLD + AI paused. Verify and decide CLOSED_LOST or reopen.`,
                                contact_phone: from,
                                assigned_to: leadMgr.id,
                                priority: 'HIGH',
                                status: 'TODO',
                                task_type: 'CALLBACK',
                                due_date: new Date(Date.now() + 4 * 60 * 60 * 1000),
                            },
                        });
                    }
                } catch (taskErr) {
                    logger.warn(`[WebhookProcessor] Failed to create closure task: ${(taskErr as Error).message}`);
                }

                // Polite acknowledgement (within 24h window since they just messaged)
                const closingAck = 'Samajh gaya. Aapki property finalize karne ke liye congratulations! 🏡 Hum aage bhi kuch achhi opportunities aane par share karenge. Dhanyawad! 🙏';
                await whatsappService.sendText(from, closingAck);

                await prisma.interaction.create({
                    data: {
                        tenant_id: contact.tenant_id,
                        phone_number: from,
                        channel: 'whatsapp',
                        direction: 'inbound',
                        event_type: 'closing_signal',
                        content: text,
                        metadata: { deal_id: activeDeal.id, action: 'on_hold' },
                    },
                });
                // Log the ack as outbound too — keeps R4 / the safety-net
                // honest (a reply WAS sent), 2026-05-19.
                await prisma.interaction.create({
                    data: {
                        tenant_id: contact.tenant_id,
                        phone_number: from,
                        channel: 'whatsapp',
                        direction: 'outbound',
                        event_type: 'message',
                        content: closingAck,
                    },
                }).catch(() => {});
                await prisma.contact.update({
                    where: { phone_number: from },
                    data: { last_channel: 'whatsapp', last_interaction: new Date() },
                });
                return;
            }

            // ── 3b.2 Conversational intent — fall through to message_router for real reply ──
            // Triggers: questions, specific asks, longer messages.
            // Without this guard, a lead asking "kya price hai" got only a property card and no answer.
            const isConversational = (text || '').length > 20 ||
                /\?|kahan|kab|kaise|kya|kaisa|kit?ne?|details?|address|sector|floor|price|rate|emi|loan|brokerage|amenities|metro|parking|owner|broker|site\s*visit|visit\s*kab/i.test(text || '');

            if (isConversational) {
                logger.info(`[WebhookProcessor] Conversational message from ${from} on deal ${activeDeal.id} — routing to message_router`);
                // Fall through to step 6 (message router) — do NOT return here.
            } else {
                // ── 3b.3 Generic message ("Hi", "yes") → qualify + auto-share property ──
                if (activeDeal.status === 'NEW') {
                    const { transitionTransaction } = await import('./transaction_state_machine');
                    const { TransactionStatus } = await import('@prisma/client');
                    await transitionTransaction(
                        activeDeal.id,
                        TransactionStatus.QUALIFIED,
                        from,
                        'whatsapp',
                        { notes: 'Customer engaged via WhatsApp — auto-qualified' },
                    );
                    logger.info(`[WebhookProcessor] Deal ${activeDeal.id} qualified via WhatsApp reply from ${from}`);
                }

                const { shareNextProperty } = await import('./property_sharing');
                await shareNextProperty(activeDeal.id);

                await prisma.interaction.create({
                    data: {
                        tenant_id: contact.tenant_id,
                        phone_number: from,
                        channel: 'whatsapp',
                        direction: 'inbound',
                        event_type: 'message',
                        content: text || '[media]',
                    },
                });
                await prisma.contact.update({
                    where: { phone_number: from },
                    data: { last_channel: 'whatsapp', last_interaction: new Date() },
                });
                return;
            }
        }
    } catch (pipelineErr) {
        logger.warn('[WebhookProcessor] Pipeline deal check error:', (pipelineErr as Error).message);
    }

    // ─── 4. INVENTORY WORKFLOW V2: Active session or trigger ──────────────────
    try {
        const workflowSession = await WhatsAppWorkflowAdapter.loadSession(from);
        if (workflowSession) {
            logger.info(`[WebhookProcessor] Routing to inventory workflow v2 for ${from}`);
            await workflowAdapter.handleMessage(from, msg, workflowSession);

            await prisma.interaction.create({
                data: {
                    tenant_id: contact.tenant_id,
                    phone_number: from,
                    channel: 'whatsapp',
                    direction: 'inbound',
                    event_type: 'workflow_message',
                    content: text || '[media]',
                },
            });
            await prisma.contact.update({
                where: { phone_number: from },
                data: { last_channel: 'whatsapp', last_interaction: new Date() },
            });
            return;
        }

        // Check if message triggers a new inventory workflow
        if (['LANDLORD', 'PARTNER_AGENT', 'REAL_ESTATE_BUILDER', 'MANAGEMENT'].includes(contact.contact_type)) {
            const lowerText = normalizedText;
            const isInventoryTrigger = INVENTORY_TRIGGER_WORDS.some(kw => lowerText.includes(kw));
            if (isInventoryTrigger) {
                logger.info(`[WebhookProcessor] Starting inventory workflow v2 for ${from} (trigger: "${text}")`);
                await workflowAdapter.startSession(from);
                await prisma.interaction.create({
                    data: {
                        tenant_id: contact.tenant_id,
                        phone_number: from,
                        channel: 'whatsapp',
                        direction: 'inbound',
                        event_type: 'workflow_start',
                        content: text,
                    },
                });
                await prisma.contact.update({
                    where: { phone_number: from },
                    data: { last_channel: 'whatsapp', last_interaction: new Date() },
                });
                return;
            }
        }
    } catch (wfErr) {
        logger.error('[WebhookProcessor] Inventory workflow v2 error:', wfErr);
        const hasSession = await WhatsAppWorkflowAdapter.hasActiveSession(from);
        if (hasSession) {
            await whatsappService.sendText(from,
                '⚠️ Something went wrong with your property listing. Please try again or type "cancel" to start over.'
            );
            await prisma.interaction.create({
                data: {
                    tenant_id: contact.tenant_id,
                    phone_number: from,
                    channel: 'whatsapp',
                    direction: 'outbound',
                    event_type: 'workflow_error',
                    content: `Workflow error: ${(wfErr as Error).message}`,
                },
            });
            return; // DO NOT fall through to message router
        }
    }

    // ─── 4b. BUYER WORKFLOW: Active session or trigger ──────────────────────
    try {
        const buyerSession = await BuyerWhatsAppAdapter.loadSession(from);
        if (buyerSession) {
            logger.info(`[WebhookProcessor] Routing to buyer workflow for ${from}`);
            await buyerWorkflowAdapter.handleMessage(from, msg, buyerSession);

            await prisma.interaction.create({
                data: {
                    tenant_id: contact.tenant_id,
                    phone_number: from,
                    channel: 'whatsapp',
                    direction: 'inbound',
                    event_type: 'buyer_workflow_message',
                    content: text || '[media]',
                },
            });
            await prisma.contact.update({
                where: { phone_number: from },
                data: { last_channel: 'whatsapp', last_interaction: new Date() },
            });
            return;
        }

        // Check if message triggers a new buyer workflow
        if (['BUYER', 'TENANT', 'UNKNOWN'].includes(contact.contact_type)) {
            const lowerText = normalizedText;
            const isBuyerTrigger = BUYER_TRIGGER_WORDS.some(kw => lowerText.includes(kw));
            if (isBuyerTrigger) {
                logger.info(`[WebhookProcessor] Starting buyer workflow for ${from} (trigger: "${text}")`);
                await buyerWorkflowAdapter.startSession(from);
                await prisma.interaction.create({
                    data: {
                        tenant_id: contact.tenant_id,
                        phone_number: from,
                        channel: 'whatsapp',
                        direction: 'inbound',
                        event_type: 'buyer_workflow_start',
                        content: text,
                    },
                });
                await prisma.contact.update({
                    where: { phone_number: from },
                    data: { last_channel: 'whatsapp', last_interaction: new Date() },
                });
                return;
            }
        }
    } catch (buyerWfErr) {
        logger.error('[WebhookProcessor] Buyer workflow error:', buyerWfErr);
        const hasBuyerSession = await BuyerWhatsAppAdapter.hasActiveSession(from);
        if (hasBuyerSession) {
            await whatsappService.sendText(from,
                '⚠️ Something went wrong with your property search. Please try again or type "cancel" to start over.'
            );
            return;
        }
    }

    // ─── 4c. ONBOARDING WORKFLOWS: Builder & Agent registration ──────────────
    try {
        // Check for active builder onboarding session
        const builderSession = await prisma.builderOnboardingSession.findFirst({
            where: { phone_number: from, status: 'IN_PROGRESS' }
        });
        if (builderSession) {
            logger.info(`[WebhookProcessor] Routing to builder onboarding for ${from}`);
            const result = await builderOnboardingWorkflow.handle(contact, text);
            await whatsappService.sendText(from, result.reply_script);
            return;
        }

        // Check for active agent onboarding session
        const agentSession = await prisma.agentOnboardingSession.findFirst({
            where: { phone_number: from, status: 'IN_PROGRESS' }
        });
        if (agentSession) {
            logger.info(`[WebhookProcessor] Routing to agent onboarding for ${from}`);
            const result = await agentOnboardingWorkflow.handle(contact, text);
            await whatsappService.sendText(from, result.reply_script);
            return;
        }

        // Check if message triggers new onboarding
        if (builderOnboardingWorkflow.isBuilderIntent(text)) {
            logger.info(`[WebhookProcessor] Starting builder onboarding for ${from}`);
            const result = await builderOnboardingWorkflow.handle(contact, text);
            await whatsappService.sendText(from, result.reply_script);
            return;
        }
        if (agentOnboardingWorkflow.isAgentIntent(text)) {
            logger.info(`[WebhookProcessor] Starting agent onboarding for ${from}`);
            const result = await agentOnboardingWorkflow.handle(contact, text);
            await whatsappService.sendText(from, result.reply_script);
            return;
        }
    } catch (onboardingErr) {
        logger.error('[WebhookProcessor] Onboarding workflow error:', onboardingErr);
    }

    // ─── 5. WEBSITE CHAT SESSION: Cross-channel continuity ───────────────────
    let conversationContext = null;
    const existingSession = await prisma.conversationSession.findFirst({
        where: {
            phone_number: from,
            active: true,
            workflow: { notIn: ['inventory_v2', 'inventory', 'buyer_intake'] },
        },
        orderBy: { created_at: 'desc' },
    });

    if (existingSession && existingSession.context) {
        const sessionContext = existingSession.context as any;

        if (sessionContext.source === 'website_chat') {
            logger.info(`[WhatsApp] Found existing website chat session for ${from}`);

            const chatHistory = await chatHandler.loadChatHistory(from, 20);

            if (chatHistory.length > 0) {
                conversationContext = {
                    source: 'website_chat',
                    sessionId: existingSession.id,
                    history: chatHistory,
                    historyCount: chatHistory.length,
                };

                logger.info(`[WhatsApp] Loaded ${chatHistory.length} messages from website chat history`);

                if (!sessionContext.whatsappStarted) {
                    await whatsappService.sendText(from, `👋 Great to hear from you on WhatsApp! I have our previous conversation from the website. Let's continue from where we left off. How can I help you?`);

                    await prisma.conversationSession.update({
                        where: { id: existingSession.id },
                        data: {
                            context: {
                                ...sessionContext,
                                whatsappStarted: true,
                                whatsappStartedAt: new Date().toISOString(),
                            },
                        },
                    });
                }
            }
        }
    }

    // ─── 6. CENTRAL MESSAGE ROUTER ───────────────────────────────────────────
    const result = await messageRouter.route(contact, text, 'whatsapp', conversationContext);

    logger.info(`[Router] Result:`, result);

    // ─── 7. SEND RESPONSE ────────────────────────────────────────────────────
    if (result.reply_script) {
        await whatsappService.sendText(from, result.reply_script);

        // Send media attachments (property images) if present
        if (result.media && Array.isArray(result.media)) {
            const apiBase = process.env.API_BASE_URL || 'https://api.realtypandit.in';
            for (const item of result.media) {
                try {
                    let mediaUrl = item.url;
                    if (mediaUrl.startsWith('/')) {
                        mediaUrl = `${apiBase}${mediaUrl}`;
                    }
                    if (item.type === 'document') {
                        // Future: sendDocument
                    } else {
                        await whatsappService.sendImage(from, mediaUrl, item.caption || '');
                    }
                } catch (imgErr: any) {
                    logger.warn(`[WebhookProcessor] Failed to send media to ${from}: ${imgErr.message}`);
                }
            }
        }

        // Log outbound interaction
        await prisma.interaction.create({
            data: {
                tenant_id: contact.tenant_id,
                phone_number: from,
                channel: 'whatsapp',
                direction: 'outbound',
                event_type: 'message',
                content: result.reply_script
            }
        });
    } else if (!result.metadata?.card_sent) {
        // Fallback: workflow returned no reply.
        // card_sent (2026-06-11): a v5 property card was already sent directly by the agent
        // (matching_agent → shareNextProperty). Skip both the text send and this greeting fallback
        // so the customer gets only the card — not a stray "how can I help?".
        const fallback = "Namaste! I'm Panditji, your property assistant. How can I help you today?";
        await whatsappService.sendText(from, fallback);
        await prisma.interaction.create({
            data: {
                tenant_id: contact.tenant_id,
                phone_number: from,
                channel: 'whatsapp',
                direction: 'outbound',
                event_type: 'message',
                content: fallback
            }
        });
        logger.warn(`[WebhookProcessor] No reply_script from router, sent fallback to ${from}`);
    }

    // ─── 8. LOG INBOUND INTERACTION ──────────────────────────────────────────
    await prisma.interaction.create({
        data: {
            tenant_id: contact.tenant_id,
            phone_number: from,
            channel: 'whatsapp',
            direction: 'inbound',
            event_type: 'message',
            content: text
        }
    });

    // ─── 9. UPDATE LAST INTERACTION ──────────────────────────────────────────
    await prisma.contact.update({
        where: { phone_number: from },
        data: {
            last_channel: 'whatsapp',
            last_interaction: new Date()
        }
    });
}

// ─── Safety net (2026-05-19) ─────────────────────────────────────────────────
// A genuine client message must NEVER end in silence. The inner pipeline has
// ~18 early returns; the normal router always replies, but a message
// short-circuited by an earlier guard that doesn't send → the client is
// ignored (real lost leads, e.g. Sudhit/Vasundhara). This additive wrapper:
//   • skips 3rd-party autoresponders entirely (no churn, no R4 noise)
//   • runs the existing pipeline unchanged (exception-safe)
//   • if NOTHING replied this turn for an external client → sends a brief
//     acknowledgement + creates/assigns a HIGH follow-up task to the lead's
//     agent so a human picks it up.
// See docs/plans/2026-05-19-report-cadence-and-bot-reply.md

const AUTORESPONDER_RE = /thank you for contacting|please let us know how we can help|do not reply|automated message|out of office|this is an automated|auto[- ]?reply/i;
const SAFETYNET_SKIP_RE = /^\s*(confirm|confirmed|reschedule|cancel|stop|unsubscribe|mat\s*bhejo)\s*$/i;
const EXTERNAL_TYPES = ['BUYER', 'TENANT', 'LANDLORD', 'UNKNOWN'];
// Specialised handlers that legitimately own a turn without an outbound row.
const CLAIMED_EVENT_TYPES = ['workflow_message', 'workflow_start', 'workflow_error', 'authentication_confirmed', 'closing_signal'];

export async function processInboundMessage(data: InboundMessageData): Promise<void> {
    const from = normalizePhone(data.from);
    const text = (data.text || '').trim();

    // 3rd-party autoresponder → ignore completely (no bot reply, no deal
    // churn, won't show as an "ignored client" in the audit).
    if (text && AUTORESPONDER_RE.test(text)) {
        logger.info(`[WebhookProcessor] Autoresponder from ${from} — skipped, no processing`);
        return;
    }

    const turnStart = new Date();
    try {
        await processInboundMessageInner(data);
    } catch (err) {
        logger.error(`[WebhookProcessor] Inner pipeline threw for ${from}: ${(err as Error)?.message}`, err);
        // fall through to the safety net below
    }

    // Did anything reply / did a specialised handler claim this turn?
    try {
        const replied = await prisma.interaction.findFirst({
            where: { phone_number: from, direction: 'outbound', created_at: { gte: turnStart } },
            select: { id: true },
        });
        if (replied) return;
        const claimed = await prisma.interaction.findFirst({
            where: { phone_number: from, created_at: { gte: turnStart }, event_type: { in: CLAIMED_EVENT_TYPES } },
            select: { id: true },
        });
        if (claimed) return;

        // Nothing answered. Only net genuine external-client queries.
        if (!text || SAFETYNET_SKIP_RE.test(text)) return;
        const contact = await prisma.contact.findUnique({
            where: { phone_number: from },
            select: { tenant_id: true, contact_type: true, assigned_agent_id: true, name: true },
        });
        if (!contact || !EXTERNAL_TYPES.includes(String(contact.contact_type))) return;

        const ack = "🙏 Got it — thank you for your message. A team member will assist you shortly.";
        await whatsappService.sendText(from, ack).catch(() => {});
        await prisma.interaction.create({
            data: {
                tenant_id: contact.tenant_id, phone_number: from, channel: 'whatsapp',
                direction: 'outbound', event_type: 'message', content: ack,
            },
        }).catch(() => {});

        // Assign a follow-up to the lead's agent (else a super_boss).
        let assignee = contact.assigned_agent_id;
        if (!assignee) {
            const sb = await prisma.agent.findFirst({
                where: { role: 'super_boss', status: 'active' }, select: { id: true },
            });
            assignee = sb?.id || null;
        }
        if (assignee) {
            await prisma.task.create({
                data: {
                    title: `Unanswered WhatsApp: ${contact.name || from}`,
                    description: `Bot did not reply to: "${text.slice(0, 200)}". Auto-acknowledged; please follow up.`,
                    contact_phone: from,
                    assigned_to: assignee,
                    priority: 'HIGH',
                    status: 'TODO',
                    task_type: 'CALLBACK',
                    due_date: new Date(Date.now() + 60 * 60 * 1000),
                },
            }).catch((e) => logger.warn(`[SafetyNet] task create failed: ${(e as Error).message}`));
        }
        logger.warn(`[SafetyNet] No reply for external client ${from} ("${text.slice(0, 60)}") → acked + assigned ${assignee || 'NONE'}`);
    } catch (netErr) {
        logger.error(`[WebhookProcessor] Safety-net error for ${from}: ${(netErr as Error)?.message}`);
    }
}
