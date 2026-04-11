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
import { SessionTracker } from './session_tracker';
import { PendingMessageQueue } from './pending_message_queue';
import { WhatsAppWorkflowAdapter } from '../workflows/whatsapp_workflow_adapter';
import { BuyerWhatsAppAdapter } from '../workflows/buyer_whatsapp_adapter';
import { builderOnboardingWorkflow } from '../workflows/builder_onboarding';
import { agentOnboardingWorkflow } from '../workflows/agent_onboarding';
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
export async function processInboundMessage(data: InboundMessageData): Promise<void> {
    const from = normalizePhone(data.from);
    const text = data.text;
    const msg = data.rawMessage;

    logger.info(`[WebhookProcessor] Processing msg from ${from}: ${text}`);

    // Track 24h session window for Meta template compliance
    SessionTracker.markInbound(from).catch(() => {});

    // Deliver any queued messages (from LLM hybrid approach)
    PendingMessageQueue.deliverPending(whatsappService, from).catch(() => {});

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
    } else if (
        contact.contact_type === 'UNKNOWN' ||
        contact.contact_type === 'BUYER_TENANT' ||
        contact.contact_type === 'SELLER_LANDLORD' ||
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
        if (normalizedText === 'confirm' || normalizedText.includes('confirmed') ||
            normalizedText === 'reschedule' || normalizedText.includes('reschedule')) {

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
                if (normalizedText === 'confirm' || normalizedText.includes('confirmed')) {
                    await calendarService.confirmAppointment(pendingAppointment.id);
                    logger.info(`[Calendar] Appointment confirmed via WhatsApp: ${pendingAppointment.id}`);
                    return;
                } else if (normalizedText === 'reschedule' || normalizedText.includes('reschedule')) {
                    await calendarService.requestReschedule(pendingAppointment.id);
                    logger.info(`[Calendar] Reschedule requested via WhatsApp: ${pendingAppointment.id}`);
                    return;
                }
            }
        }
    } catch (calendarError) {
        logger.warn('[WebhookProcessor] Calendar check failed (table may not exist):', calendarError);
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
        if (['SELLER_LANDLORD', 'PARTNER_AGENT', 'REAL_ESTATE_BUILDER', 'MANAGEMENT'].includes(contact.contact_type)) {
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
        if (['BUYER_TENANT', 'UNKNOWN'].includes(contact.contact_type)) {
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
    } else {
        // Fallback: workflow returned no reply
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
