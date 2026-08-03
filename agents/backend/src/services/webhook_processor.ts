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
import { sendBuyerConfirmationWhatsApp } from './lead_notifications';
import { MatchingEngine, buildMatchCriteriaFromLead } from './matching_engine';
import { isSupplyIntent } from '../utils/intent_signals';
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

    // P2 (2026-06-12): central template-button router — Open Portal / Upload Now / Talk to
    // Coordinator / engagement (Haan dikhao…) / bare Reply. Runs after the property-card handler
    // (card trio) and before the deal/workflow pipeline; engagement/Reply defer to active sessions.
    try {
        const { handleTemplateButton } = await import('./template_button_router');
        if (await handleTemplateButton(msg, from)) {
            logger.info(`[WebhookProcessor] Template button handled for ${from}; skipping normal pipeline`);
            return;
        }
    } catch (err) {
        logger.warn('[WebhookProcessor] template_button_router error:', err);
    }

    // Phase 3 (2026-07-28): a tap on the List-vs-Find disambiguation buttons routes straight into the
    // supply/demand workflow — before any keyword routing, so the choice can never be re-guessed.
    try {
        const { handleDisambiguationReply } = await import('./disambiguation_router');
        if (await handleDisambiguationReply(msg, from)) {
            logger.info(`[WebhookProcessor] Disambiguation reply handled for ${from}; skipping normal pipeline`);
            return;
        }
    } catch (err) {
        logger.warn('[WebhookProcessor] disambiguation_router error:', err);
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

        // Greet a genuinely-organic first-time WhatsApp contact (2026-07-13) — every OTHER
        // intake path (manual/99acres/website/MagicBricks/housing/Facebook) already sends
        // this via sendBuyerConfirmationWhatsApp; this was the one path with no greeting at
        // all. Fire-and-forget, matches the pattern used everywhere else it's called.
        if (['BUYER', 'TENANT', 'UNKNOWN'].includes(contact!.contact_type)) {
            sendBuyerConfirmationWhatsApp(contact!.phone_number, contact!.name, 'whatsapp')
                .catch((err) => logger.warn(`[WebhookProcessor] Welcome message failed for ${contact!.phone_number}: ${(err as Error).message}`));
        }

        // LEAD SCORING: Initialize
        await leadScoreService.initScore(contact.phone_number, contact.tenant_id);

        // B1: auto-create NEW deal for buyer/tenant/unknown inbound — Stage 1 KRA entry path.
        // Skip for partner agents, management, builders (they don't need a deal). Also skip when the
        // FIRST message is a SUPPLY offer ("for sale", "I have a property", "rent out"…) — otherwise a
        // seller gets a demand deal + buyer cards (real-chat F6); supply is routed to the inventory
        // workflow below instead.
        if (['BUYER', 'TENANT', 'UNKNOWN'].includes(contact.contact_type) && !isSupplyIntent(text)) {
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
                trackWhatsAppLead({ ctwaClid, phone: contact.phone_number, eventName: 'LeadSubmitted' }).catch(() => {});
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
    // CTWA: Meta puts a `referral` object on the first message after a Click-to-WhatsApp
    // ad tap. Resolve it to ad/adset/campaign and stamp the contact's meta_* columns so
    // ad-sourced leads are distinguishable in the admin dashboard (otherwise every ad lead
    // looks identical to an organic WhatsApp lead). Runs for new AND returning contacts -
    // the referral only exists when they genuinely clicked an ad. Fire-and-forget: must
    // never block or fail inbound processing.
    if (contact) {
        try {
            const { extractCtwaReferral, handleCtwaAdLead } = await import('./ctwa_attribution');
            const referral = extractCtwaReferral(msg);
            if (referral) {
                // AWAITED, not fire-and-forget: a referral only appears on the first message
                // after a real ad click (rare), and we must know whether the advertised
                // property card went out before deciding to skip the generic ack below.
                const handled = await handleCtwaAdLead({
                    phone: contact.phone_number,
                    tenantId: contact.tenant_id,
                    referral,
                    firstMessage: text,
                });
                if (handled) {
                    await prisma.contact.update({
                        where: { phone_number: contact.phone_number },
                        data: { last_channel: 'whatsapp', last_interaction: new Date() },
                    }).catch(() => { /* non-fatal */ });
                    logger.info(`[WebhookProcessor] CTWA ad lead ${contact.phone_number} handled — advertised property card sent, skipping generic routing`);
                    return;
                }
            }
        } catch (err) { logger.warn('[WebhookProcessor] ctwa_attribution error:', err); }
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

    // ─── 3a-bis. FRUSTRATION / HUMAN HAND-OFF (Fix C, 2026-06-12) ─────────────────
    // Audit: "call karo" / "bolte rehte ho par call nahi karte" / venting were ignored —
    // the bot kept auto-replying and no human picked it up. Detect those and hand off to
    // the assigned agent (createLeadActionTask notifies them) with a reassuring holding
    // line, instead of letting an agent fumble the turn. De-duped to one escalation per
    // contact per 30 min so the agent isn't spammed.
    try {
        const { detectFrustration } = await import('../utils/frustration');
        const fr = detectFrustration(text || '');
        if (fr.escalate) {
            const recent = await prisma.interaction.findFirst({
                where: {
                    phone_number: from,
                    event_type: 'frustration_escalation',
                    created_at: { gte: new Date(Date.now() - 30 * 60 * 1000) },
                },
                select: { id: true },
            });
            if (!recent) {
                const { createLeadActionTask } = await import('./workflow_task_service');
                await createLeadActionTask({
                    phone: from,
                    action: 'CALLBACK_REQUEST',
                    tenantId: contact.tenant_id,
                    sourceChannel: 'whatsapp-text',
                    rawNote: `Customer frustration/hand-off (${fr.kind}): "${(text || '').slice(0, 140)}". Please call them.`,
                }).catch((e) => logger.error('[WebhookProcessor] frustration escalation task failed:', e));
            }
            try {
                await whatsappService.sendText(from, '🙏 Main aapko hamari team se connect kar raha hoon — woh aapko jaldi call karenge. Bas thodi der.');
            } catch (e) { logger.warn('[WebhookProcessor] frustration holding line failed:', e); }
            await prisma.interaction.create({
                data: {
                    tenant_id: contact.tenant_id, phone_number: from, channel: 'whatsapp',
                    direction: 'inbound', event_type: 'frustration_escalation',
                    content: text || '[media]', metadata: { kind: fr.kind },
                },
            });
            logger.info(`[WebhookProcessor] Frustration (${fr.kind}) from ${from} → escalated to assigned agent`);
            return;
        }
    } catch (frErr) {
        logger.warn('[WebhookProcessor] Frustration check failed:', frErr);
    }

    // ─── 3a-bis. POST-VISIT FEEDBACK (VS4-2): reply to the cron's "visit kaisi rahi?" prompt ───
    // runPostVisitFollowup asks how the visit went while the deal is still VISIT_SCHEDULED with a
    // PAST appointment — so without this, that reply hits the confirm/cancel menu and is misread.
    // If a recent post_visit_followup marker exists for this contact and no outcome is logged yet,
    // treat the FIRST reply as feedback. Human-in-the-loop: a 👍 raises a negotiation task for the
    // coordinator (it does NOT auto-advance the deal to NEGOTIATION). 🔎 shares more, 🚫 reschedules.
    try {
        const recentPrompt = await prisma.interaction.findFirst({
            where: {
                phone_number: from, event_type: 'post_visit_followup', direction: 'outbound',
                created_at: { gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
            },
            orderBy: { created_at: 'desc' },
            select: { metadata: true, created_at: true },
        });
        const pvDealId = (recentPrompt?.metadata as any)?.deal_id;
        if (recentPrompt && pvDealId) {
            const alreadyHandled = await prisma.interaction.findFirst({
                where: { phone_number: from, event_type: 'post_visit_feedback', created_at: { gte: recentPrompt.created_at } },
                select: { id: true },
            });
            const pvDeal = alreadyHandled ? null : await prisma.transaction.findUnique({
                where: { id: pvDealId },
                select: {
                    id: true, status: true, ai_paused: true, visit_outcome: true, tenant_id: true,
                    coordinator: { select: { id: true, name: true, phone: true } },
                    demand_contact: { select: { name: true } },
                },
            });
            if (pvDeal && pvDeal.status === 'VISIT_SCHEDULED' && !pvDeal.ai_paused && !pvDeal.visit_outcome) {
                const raw = text || '';
                // Order matters: check "didn't happen" before "positive" so "nahi ho payi" can't be
                // mis-read as positive. Emojis (👍/🔎/🚫) are the strongest signal.
                const didntHappen = /🚫|nahi\s*ho\s*pa|nahi\s*hui|visit\s*nahi|could\s*n'?t|did\s*n'?t|reschedul|postpone|\bcancel|nahi\s*ja\s*pa/i.test(raw);
                const wantsMore = /🔎|aur\s*(option|propert|dikha|ghar|flat)|more\s*option|other\s*(option|propert)|dusr|doosr|kuch\s*aur|\balag/i.test(raw);
                const positive = /👍|pasand|acch|achhi|achi|badhiya|good|great|liked|love|interested|negotiat|\bhaan\b|\byes\b|\bsahi\b/i.test(raw);
                const cust = pvDeal.demand_contact?.name || '';
                let sentiment: 'positive' | 'want_more' | 'didnt_happen' | null = null;

                if (didntHappen) {
                    sentiment = 'didnt_happen';
                    // Reset the open appointment to awaiting-slot so the next day/time is captured (VS-5 routing).
                    try {
                        const appt = await prisma.appointment.findFirst({
                            where: { transaction_id: pvDeal.id, status: { notIn: ['cancelled', 'completed', 'no_show'] } },
                            orderBy: { scheduled_at: 'desc' }, select: { id: true },
                        });
                        if (appt) await prisma.appointment.update({ where: { id: appt.id }, data: { status: 'requested' } });
                    } catch { /* best-effort */ }
                    await whatsappService.sendTemplate(from, 'rp_visit_availability', {}).catch(() => {});
                } else if (wantsMore) {
                    sentiment = 'want_more';
                    await whatsappService.sendText(from, `🔎 Bilkul ${cust}! Main aapko aur options bhejta hoon.`).catch(() => {});
                    import('./property_sharing').then(({ shareNextProperty }) => shareNextProperty(pvDeal.id).catch(() => {})).catch(() => {});
                } else if (positive) {
                    sentiment = 'positive';
                    await prisma.transaction.update({ where: { id: pvDeal.id }, data: { client_interest_level: 'Hot', last_team_action_at: new Date() } }).catch(() => {});
                    await whatsappService.sendText(from, `🎉 Bahut badhiya ${cust}! Hamari team aapse aage ki baat (price/negotiation) ke liye turant sampark karegi.`).catch(() => {});
                }

                if (sentiment) {
                    if (pvDeal.coordinator?.id) {
                        const taskTitle = sentiment === 'positive'
                            ? `💰 Customer liked the property — start negotiation: ${cust || from}`
                            : sentiment === 'want_more'
                                ? `🔎 Customer wants more options — review matches: ${cust || from}`
                                : `🗓️ Visit didn't happen — reschedule: ${cust || from}`;
                        await prisma.task.create({
                            data: {
                                title: taskTitle,
                                description: `Post-visit reply: "${raw.slice(0, 200)}". Deal ${pvDeal.id}.`,
                                contact_phone: from, deal_id: pvDeal.id, assigned_to: pvDeal.coordinator.id,
                                priority: sentiment === 'positive' ? 'HIGH' : 'MEDIUM', status: 'TODO', task_type: 'GENERAL',
                                due_date: new Date(Date.now() + (sentiment === 'positive' ? 2 : 6) * 60 * 60 * 1000),
                            },
                        }).catch(e => logger.warn('[PostVisitFeedback] task create failed:', (e as Error).message));
                        try {
                            const { notify } = await import('./notify');
                            notify('task_assigned',
                                [{ id: pvDeal.coordinator.id, type: 'agent', phone: pvDeal.coordinator.phone ?? undefined, name: pvDeal.coordinator.name ?? undefined }],
                                { title: taskTitle, due_date: sentiment === 'positive' ? 'now' : 'today' });
                        } catch { /* notify is best-effort */ }
                    }
                    // Dedup marker — only the FIRST reply to the prompt is treated as feedback.
                    await prisma.interaction.create({
                        data: {
                            tenant_id: pvDeal.tenant_id, phone_number: from, channel: 'whatsapp',
                            direction: 'inbound', event_type: 'post_visit_feedback',
                            content: raw.slice(0, 500), metadata: { deal_id: pvDeal.id, sentiment },
                        },
                    }).catch(() => {});
                    logger.info(`[WebhookProcessor] Post-visit feedback (${sentiment}) from ${from} on deal ${pvDeal.id}`);
                    return; // claimed — don't fall through to the confirm/cancel menu or router
                }
                // ambiguous reply → fall through to normal handling (no marker written, can retry)
            }
        }
    } catch (pvErr) {
        logger.warn('[WebhookProcessor] post-visit feedback handling failed:', (pvErr as Error).message);
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

        // ── 3b.1 Closing signal detection (Hindi/English/Hinglish) ──
        // Split into two DISTINCT meanings (2026-07-13) — these used to share one
        // pattern array and one hardcoded reply, so a lead saying "not interested,
        // close my query" got told "congratulations on finalizing!". Same ON_HOLD +
        // task handling for both, but different copy and a correct lost_reason.
        //
        // OPT-OUT (2026-07-22): this whole block used to live INSIDE `if (activeDeal)`,
        // so anyone without an open NEW/QUALIFIED deal who asked us to stop was never
        // even evaluated. Detection now runs first, and a withdrawal is honoured with
        // or without a deal. Audit that prompted this: 21 people asked us to stop and
        // ALL 21 kept receiving messages (98 sends) — the behaviour Meta locked the
        // account for ("Sending spam", 13 Jul).
        const finalizedElsewherePatterns = [
            /humne\s*(le|li|liya|li\s*hai|kha?ri?d)/i,
            /already\s*(bought|got|taken|purchased|finalized|done)/i,
            /property\s*mil\s*(gayi|gaya|gay[ai])/i,
            /property\s*(le?\s*li|li\s*hai|kha?ri?d\s*li)/i,
            /(flat|ghar|makan)\s*(le?\s*li|li\s*hai|le\s*liya|kha?ri?d\s*liya)/i,
            /(buy|kha?ri?d)\s*kar\s*li/i,
            /book\s*kar\s*li/i,
        ];
        const withdrawingPatterns = [
            /\bnot\s*interested\b/i,
            /\bno\s*(thanks|thank\s*you|thanx)\b/i,
            /\bmat\s*bhejo\b/i,
            // Negative lookbehind added 2026-07-22: "please dont stop sending options" is a
            // request to KEEP messaging, but matched "stop sending" and silenced the lead.
            /(?<!(?:do\s*not|don'?t|dont)\s{0,3})\bstop\s*(messages?|messaging|sending)\b/i,
            /\bunsubscribe\b/i,
            // A BARE "stop" is Meta's universal opt-out keyword and matched nothing here —
            // 23 people sent exactly that. Anchored to the WHOLE message on purpose, so
            // "stop by the property tomorrow" / "bus stop" / "non-stop" do NOT trip it.
            /^\s*(stop|stop[.!]|unsubscribe|band\s*karo|bas\s*karo|no\s*more)\s*$/i,
            /\b(do\s*n[o']?t|dont|don't)\s*(text|message|msg|contact|call)\b/i,
            /\b(remove|delete)\s*(me|my\s*number)\b/i,
            /\b(ab|aage)\s*(koi\s*)?(message|msg|sms)\s*(mat|na|nahi)\b/i,
        ];
        const isFinalizedElsewhere = finalizedElsewherePatterns.some(re => re.test(text || ''));
        const isWithdrawing = withdrawingPatterns.some(re => re.test(text || ''));
        const isClosingSignal = isFinalizedElsewhere || isWithdrawing;

        // No open deal, but they asked us to stop — still honour it. Previously fell
        // through to the generic bot flow and kept the conversation (and sends) going.
        if (!activeDeal && isWithdrawing) {
            logger.info(`[WebhookProcessor] Opt-out (no active deal) from ${from}: "${text}"`);
            await prisma.interaction.create({
                data: {
                    tenant_id: contact.tenant_id,
                    phone_number: from,
                    channel: 'whatsapp',
                    direction: 'inbound',
                    event_type: 'closing_signal',
                    content: text,
                    metadata: { action: 'opt_out', reason: 'NOT_INTERESTED', no_active_deal: true },
                },
            }).catch(() => {});
            const ack = 'Samajh gaya, koi baat nahi 🙏 Aapko is baare mein aur messages nahi karenge. Agar future mein kabhi zaroorat ho to hum yahin hain. Dhanyawad!';
            await whatsappService.sendText(from, ack).catch(() => {});
            await prisma.contact.update({
                where: { phone_number: from },
                data: { last_channel: 'whatsapp', last_interaction: new Date(), opted_out_at: new Date() },
            }).catch(() => {});
            await prisma.transaction.updateMany({
                where: { demand_contact_id: from, ai_paused: false },
                data: { ai_paused: true },
            }).catch(() => {});
            return;
        }

        if (activeDeal) {
            if (isClosingSignal) {
                logger.info(`[WebhookProcessor] Closing signal (${isFinalizedElsewhere ? 'finalized-elsewhere' : 'withdrawing'}) detected from ${from} on deal ${activeDeal.id}: "${text}"`);

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
                                title: isFinalizedElsewhere
                                    ? `Verify closure: ${contact.name || from} indicated they bought elsewhere`
                                    : `Lead withdrew: ${contact.name || from} is no longer interested`,
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

                // Polite acknowledgement — congratulate on a genuine finalize-elsewhere,
                // but don't congratulate someone who's simply withdrawing/not interested.
                const closingAck = isFinalizedElsewhere
                    ? 'Samajh gaya. Aapki property finalize karne ke liye congratulations! 🏡 Hum aage bhi kuch achhi opportunities aane par share karenge. Dhanyawad! 🙏'
                    : 'Samajh gaya, koi baat nahi 🙏 Aapko is baare mein aur messages nahi karenge. Agar future mein kabhi zaroorat ho to hum yahin hain. Dhanyawad!';
                await whatsappService.sendText(from, closingAck);

                await prisma.interaction.create({
                    data: {
                        tenant_id: contact.tenant_id,
                        phone_number: from,
                        channel: 'whatsapp',
                        direction: 'inbound',
                        event_type: 'closing_signal',
                        content: text,
                        metadata: { deal_id: activeDeal.id, action: 'on_hold', reason: isFinalizedElsewhere ? 'PURCHASED_ELSEWHERE' : 'NOT_INTERESTED' },
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
                    data: {
                        last_channel: 'whatsapp',
                        last_interaction: new Date(),
                        lost_reason: isFinalizedElsewhere ? 'PURCHASED_ELSEWHERE' : 'NOT_INTERESTED',
                        lost_at: new Date(),
                        // Consent, not pipeline outcome (2026-07-22). ONLY a withdrawal opts them
                        // out — a "purchased elsewhere" is acked with "hum aage bhi achhi
                        // opportunities share karenge", so suppressing them would break that promise.
                        ...(isWithdrawing ? { opted_out_at: new Date() } : {}),
                    },
                });

                // Pause AI on EVERY deal this contact has, not just the active one. ai_paused is
                // the existing suppression convention (honoured by property_sharing,
                // inventory_broadcast, pipeline_crons, interaction_engine), and a future deal
                // would otherwise resume messaging someone who already asked us to stop.
                if (isWithdrawing) {
                    await prisma.transaction.updateMany({
                        where: { demand_contact_id: from, ai_paused: false },
                        data: { ai_paused: true },
                    }).catch(() => {});
                }
                return;
            }

            // ── 3b.1b Video request — share the current best match's video link directly ──
            // (2026-07-13) Previously unhandled entirely: a buyer asking "send the video" got
            // either silence or the generic safety-net ack, never an actual video. English +
            // Hindi/Hinglish phrasing, same array-of-regex style as closingSignalPatterns above.
            const videoRequestPatterns = [
                /\bvideo\b/i,
                /\breel\b/i,
                /\bwalkthrough\b/i,
                /\bvideo\s*(bhej|dikhao|dikha\s*do|bhejo|bhejiye)/i,
                /\bclip\b/i,
            ];
            const isVideoRequest = videoRequestPatterns.some(re => re.test(text || ''));

            if (isVideoRequest) {
                logger.info(`[WebhookProcessor] Video request detected from ${from} on deal ${activeDeal.id}: "${text}"`);
                try {
                    const engine = new MatchingEngine();
                    const dealSchema = ((activeDeal as any).demand_schema_values ?? {}) as Record<string, any>;
                    const bhkRaw = dealSchema.bhk != null ? String(dealSchema.bhk) : null;
                    const bhkMatch = bhkRaw?.match(/\d+/)?.[0];
                    const criteria = buildMatchCriteriaFromLead({
                        intent: (activeDeal as any).demand_intent === 'rent_lease' ? 'rent'
                            : (activeDeal as any).demand_intent === 'rent' ? 'rent'
                            : (activeDeal as any).demand_intent === 'buy' ? 'buy'
                            : (activeDeal.demand_budget_max && Number(activeDeal.demand_budget_max) < 200000) ? 'rent'
                            : 'buy',
                        demand_type_slug: null,
                        type_id: (contact as any).type_id || null,
                        sub_category_id: (contact as any).sub_category_id || null,
                        category_id: (contact as any).category_id || null,
                        budget_min: activeDeal.demand_budget_min,
                        budget_max: activeDeal.demand_budget_max,
                        preferred_location: activeDeal.demand_location || (contact as any).preferred_location || null,
                        preferred_lat: (contact as any).preferred_lat ?? null,
                        preferred_lng: (contact as any).preferred_lng ?? null,
                        demand_bhk: bhkMatch ? parseInt(bhkMatch, 10) : null,
                        demand_taxonomy_node_id: (activeDeal as any).demand_taxonomy_node_id ?? (contact as any).demand_taxonomy_node_id ?? null,
                        demand_schema_values: (activeDeal as any).demand_schema_values ?? (contact as any).demand_schema_values ?? null,
                    });
                    const matches = await engine.findMatches(criteria, 1);
                    const best = matches[0];
                    const VIDEO_MIN_MATCH_SCORE = 50;

                    if (best && (best as any).match_score >= VIDEO_MIN_MATCH_SCORE) {
                        const inv = await prisma.inventory.findUnique({
                            where: { id: best.id },
                            select: { video_urls: true, display_id: true },
                        });
                        if (inv?.video_urls?.length) {
                            const link = `https://www.realtypandit.in/properties/${inv.display_id || best.id}`;
                            const videoReply = `🎥 Yahan video dekhiye:\n${link}`;
                            await whatsappService.sendText(from, videoReply);
                            await prisma.interaction.create({
                                data: {
                                    tenant_id: contact.tenant_id, phone_number: from, channel: 'whatsapp',
                                    direction: 'outbound', event_type: 'message', content: videoReply,
                                    metadata: { deal_id: activeDeal.id, inventory_id: best.id, video_request: true },
                                },
                            }).catch(() => {});
                            logger.info(`[WebhookProcessor] Video link sent to ${from} for inventory ${best.id}`);
                            return;
                        }
                    }
                    logger.info(`[WebhookProcessor] Video request from ${from} — no video-having match found; falling through`);
                } catch (videoErr) {
                    logger.warn(`[WebhookProcessor] Video-request handling failed for ${from}: ${(videoErr as Error).message}`);
                }
                // No video-having match → don't reply here; fall through to conversational/generic
                // handling below, and the wrapper-level safety net covers true silence.
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
                // F6 backstop: a SHORT supply offer ("property for sale") on a stray demand deal would
                // otherwise get qualified + card-spammed — redirect to listing intake instead. (Long
                // supply messages are already caught above as conversational.) (F6, 2026-06-21)
                if (isSupplyIntent(text)) {
                    await whatsappService.sendText(from, `🙏 Lagta hai aap property *bech* ya *rent pe de* rahe hain. Apni property ki detail (type, location, area, price) bhej dijiye — main turant list kar deta hoon.`);
                    await prisma.contact.update({ where: { phone_number: from }, data: { last_channel: 'whatsapp', last_interaction: new Date() } });
                    return;
                }
                // ── 3b.3 Generic / requirement message → (capture any new requirement) qualify + auto-share ──
                // P1 (2026-06-11): a SHORT message on an active deal used to go straight to a blind
                // next-card, silently dropping stated requirements like "1 bhk" / "Vaishali" / "rent"
                // (audit: only 28% of requirement messages got a matching card). Now we extract the
                // slots and persist them to the DEAL — the criteria source for shareNextProperty — so
                // the auto-shared card reflects the NEW requirement. Pure chit-chat ("hi"/"ok"/"yes")
                // yields no slots → unchanged behaviour.
                const { extractReqSlots } = await import('../utils/requirement_slots');
                const reqSlots = extractReqSlots(text || '');
                if (Object.keys(reqSlots).length > 0) {
                    const { foldLegacyDemand, mergeDemandSchemaValues } = await import('../utils/demand_canonical');
                    const dealData: any = {};
                    if (reqSlots.location) dealData.demand_location = reqSlots.location;
                    if (reqSlots.intent) dealData.demand_intent = reqSlots.intent === 'rent' ? 'rent_lease' : 'buy';
                    if (reqSlots.budget) dealData.demand_budget_max = reqSlots.budget;
                    if (reqSlots.bhk) {
                        // Re-read the deal's current schema fresh so we merge (not clobber) other keys
                        // (amenities/furnishing/…) the in-scope activeDeal may not have loaded.
                        const cur = await prisma.transaction.findUnique({
                            where: { id: activeDeal.id }, select: { demand_schema_values: true },
                        });
                        const folded = foldLegacyDemand({ demand_bhk: reqSlots.bhk });
                        dealData.demand_schema_values = mergeDemandSchemaValues(
                            (cur?.demand_schema_values as any) ?? null, folded.demand_schema_values,
                        );
                    }
                    if (Object.keys(dealData).length > 0) {
                        try {
                            await prisma.transaction.update({ where: { id: activeDeal.id }, data: dealData });
                            // Mirror the scalar slots onto the contact (future turns + contact-fallback
                            // in shareNextProperty). BHK lives on the deal (authoritative) — no JSON merge here.
                            const cData: any = {};
                            if (reqSlots.location) cData.preferred_location = reqSlots.location;
                            if (reqSlots.intent) cData.intent = reqSlots.intent;
                            if (reqSlots.budget) cData.budget_max = reqSlots.budget;
                            if (Object.keys(cData).length > 0) {
                                await prisma.contact.update({ where: { phone_number: from }, data: cData });
                            }
                            logger.info(`[WebhookProcessor] Captured requirement on deal ${activeDeal.id} from ${from}: ${JSON.stringify(reqSlots)} — re-matching`);
                        } catch (err) {
                            logger.error('[WebhookProcessor] Requirement capture update failed:', err);
                        }
                    }
                    // Residential/commercial: resolve the stated type → contact.category_id so the
                    // re-matched card respects res-vs-com (the type slug itself is not matched — see
                    // property_sharing which reads contact.category_id). (A1, 2026-06-21)
                    if (reqSlots.type) {
                        const { applyDemandCategoryFromType } = await import('../utils/demand_capture');
                        await applyDemandCategoryFromType(from, reqSlots.type);
                    }
                }

                // Deterministic qualify + anti-spam (F2, 2026-06-21): do NOT auto-qualify on a bare
                // "hi"/"ok" and do NOT fire a card on every reply. Qualify only when the deal has
                // enough (location+budget); share a card only on a NEW requirement or an explicit
                // "more" — otherwise ask for the missing detail / acknowledge.
                const capturedThisTurn = Object.keys(reqSlots).length > 0;
                const wantsMore = /\b(more|next|aur|aur dikhao|dusr[ae]|other|others|alternate|dikhao|dikha do|aur batao)\b/i.test(text || '');
                const dealNow = await prisma.transaction.findUnique({
                    where: { id: activeDeal.id },
                    select: { demand_location: true, demand_budget_max: true },
                });
                const hasEnough = !!dealNow?.demand_location && !!dealNow?.demand_budget_max;
                const { shareNextProperty } = await import('./property_sharing');

                if (activeDeal.status === 'NEW') {
                    if (hasEnough) {
                        const { transitionTransaction } = await import('./transaction_state_machine');
                        const { TransactionStatus } = await import('@prisma/client');
                        await transitionTransaction(activeDeal.id, TransactionStatus.QUALIFIED, from, 'whatsapp',
                            { notes: 'Customer provided enough requirement (location+budget) via WhatsApp' });
                        logger.info(`[WebhookProcessor] Deal ${activeDeal.id} qualified (location+budget) from ${from}`);
                        await shareNextProperty(activeDeal.id);
                    } else {
                        const miss: string[] = [];
                        if (!dealNow?.demand_location) miss.push('location (jaise: Vaishali, Sector 62 Noida)');
                        if (!dealNow?.demand_budget_max) miss.push('budget');
                        await whatsappService.sendText(from, `🙏 Thodi aur detail bata dijiye — ${miss.join(' aur ')}? Phir aapke liye best matching properties turant bhejta hoon.`);
                    }
                } else {
                    // QUALIFIED: share only on a NEW requirement or an explicit "more" — not on chit-chat.
                    if (capturedThisTurn || wantsMore) {
                        await shareNextProperty(activeDeal.id);
                    } else {
                        await whatsappService.sendText(from, `🙏 Ji bataiye — in properties mein se koi pasand aayi, ya koi aur requirement hai? (location / budget / BHK bata sakte hain)`);
                    }
                }

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

        // Check if message triggers a new inventory workflow. UNKNOWN added (F6): a brand-new contact
        // OFFERING a property must be able to enter the seller/inventory flow (previously excluded, so
        // a seller fell through to the buyer card path). For UNKNOWN we require an explicit
        // supply-intent signal (not the broad inventory keywords, which a buyer might also use).
        if (['LANDLORD', 'PARTNER_AGENT', 'REAL_ESTATE_BUILDER', 'MANAGEMENT', 'UNKNOWN'].includes(contact.contact_type)) {
            const lowerText = normalizedText;
            const isInventoryTrigger = contact.contact_type === 'UNKNOWN'
                ? isSupplyIntent(text)
                : INVENTORY_TRIGGER_WORDS.some(kw => lowerText.includes(kw));
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
            // 2026-07-28: a clear SUPPLY message mid-buyer-session ("I want to put it on rent") must
            // switch to the listing/inventory flow, not be captured as a buyer message. (Nilin root cause.)
            if (isSupplyIntent(text)) {
                logger.info(`[WebhookProcessor] Supply intent during buyer session for ${from} — switching to listing intake`);
                await workflowAdapter.startSession(from);
                await prisma.interaction.create({ data: { tenant_id: contact.tenant_id, phone_number: from, channel: 'whatsapp', direction: 'inbound', event_type: 'supply_reroute_from_buyer', content: text || '' } });
                await prisma.contact.update({ where: { phone_number: from }, data: { last_channel: 'whatsapp', last_interaction: new Date() } });
                return;
            }
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
    // Phase 3 (2026-07-28): the message failed BOTH the supply and buyer routers above. For a brand-new
    // UNKNOWN contact, ASK "list or find?" (one deterministic tap) instead of letting the AI router
    // guess the intent — the guessing is how landlords (Nilin) got misfiled as buyers.
    try {
        const { maybeSendDisambiguation } = await import('./disambiguation_router');
        // Never ask an ad-sourced lead "list or find?" — they tapped an ad for a specific
        // property, so their intent is already known. CTWA leads carry meta_ad_id.
        if (!contact.meta_ad_id && await maybeSendDisambiguation(from, contact, text)) {
            await prisma.contact.update({ where: { phone_number: from }, data: { last_channel: 'whatsapp', last_interaction: new Date() } });
            return;
        }
    } catch (err) {
        logger.warn('[WebhookProcessor] maybeSendDisambiguation error:', err);
    }

    const result = await messageRouter.route(contact, text, 'whatsapp', conversationContext);

    logger.info(`[Router] Result:`, result);

    // ─── 6b. P0 reliability (2026-06-11): never send the raw LLM-failure string; never go silent ──
    // After retries, a failed model call surfaces as the "high traffic" sentinel in reply_script.
    // Replace it with a graceful holding line AND escalate to the assigned agent (createLeadActionTask)
    // so a human follows up — the customer's message is never answered with an error or dropped.
    if (result.reply_script && /experiencing high traffic|encountered a brief issue/i.test(result.reply_script)) {
        const holding = 'Ek minute 🙏 — main aapki request check kar raha hoon. Hamari team aapse abhi connect karegi.';
        await whatsappService.sendText(from, holding).catch(() => null);
        try {
            const { createLeadActionTask } = await import('./workflow_task_service');
            await createLeadActionTask({
                phone: from, action: 'CALLBACK_REQUEST', tenantId: contact.tenant_id,
                sourceChannel: 'whatsapp-text',
                rawNote: `AI could not respond (LLM failure). Customer's last message: "${(text || '[media]').slice(0, 200)}". Please follow up.`,
            });
        } catch (e) { logger.warn('[WebhookProcessor] safety-net task failed:', (e as Error).message); }
        await prisma.interaction.create({
            data: { tenant_id: contact.tenant_id, phone_number: from, channel: 'whatsapp', direction: 'outbound', event_type: 'message', content: holding },
        }).catch(() => {});
        return;
    }

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
export const SAFETYNET_SKIP_RE = /^\s*(confirm|confirmed|reschedule|cancel|stop|unsubscribe|mat\s*bhejo)\s*$/i;
const EXTERNAL_TYPES = ['BUYER', 'TENANT', 'LANDLORD', 'UNKNOWN'];
// Partner agents get the same never-silent guarantee as external clients (2026-07-13):
// they were previously excluded outright, so a partner's button-tap or message could
// go unanswered forever. MANAGEMENT stays excluded — that's the owner's own number,
// correctly exempt from bot auto-replies.
export const SAFETYNET_COVERED_TYPES = [...EXTERNAL_TYPES, 'PARTNER_AGENT'];
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
        if (!contact || !SAFETYNET_COVERED_TYPES.includes(String(contact.contact_type))) return;

        await sendSafetyNetAck(from, contact, text);
    } catch (netErr) {
        logger.error(`[WebhookProcessor] Safety-net error for ${from}: ${(netErr as Error)?.message}`);
    }
}

type SafetyNetContact = {
    tenant_id: string;
    contact_type: string;
    assigned_agent_id: string | null;
    name: string | null;
};

/**
 * Shared ack + follow-up-task logic for a contact the bot has gone silent on.
 * Called from the inline post-turn guard above AND from the scheduled backstop
 * sweep (`whatsapp-safety-net-sweep`, scheduled_worker.ts) — 146 confirmed-stale
 * messages in a 60-day audit showed the inline guard alone doesn't catch every
 * silent case, so a periodic sweep re-checks for anything it missed.
 */
export async function sendSafetyNetAck(from: string, contact: SafetyNetContact, text: string): Promise<void> {
    const isPartner = contact.contact_type === 'PARTNER_AGENT';
    const ack = isPartner
        ? "🙏 Noted — our listings team will follow up shortly."
        : "🙏 Got it — thank you for your message. A team member will assist you shortly.";
    await whatsappService.sendText(from, ack).catch(() => {});
    await prisma.interaction.create({
        data: {
            tenant_id: contact.tenant_id, phone_number: from, channel: 'whatsapp',
            direction: 'outbound', event_type: 'message', content: ack,
        },
    }).catch(() => {});

    // Assign a follow-up: partners route to whoever manages that partner relationship,
    // everyone else to the lead's own agent — both fall back to a super_boss.
    let assignee = contact.assigned_agent_id;
    if (isPartner) {
        const pa = await prisma.partnerAgent.findUnique({
            where: { phone_number: from }, select: { managing_agent_id: true },
        });
        assignee = pa?.managing_agent_id || null;
    }
    if (!assignee) {
        const sb = await prisma.agent.findFirst({
            where: { role: 'super_boss', status: 'active' }, select: { id: true },
        });
        assignee = sb?.id || null;
    }
    if (assignee) {
        await prisma.task.create({
            data: {
                title: `Unanswered WhatsApp${isPartner ? ' (Partner)' : ''}: ${contact.name || from}`,
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
    logger.warn(`[SafetyNet] No reply for ${isPartner ? 'partner' : 'external client'} ${from} ("${text.slice(0, 60)}") → acked + assigned ${assignee || 'NONE'}`);
}
