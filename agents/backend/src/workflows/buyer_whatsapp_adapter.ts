/**
 * Buyer WhatsApp Workflow Adapter
 *
 * Platform adapter that renders the buyer workflow as WhatsApp
 * interactive messages. Handles two phases:
 *   Phase A: Requirement capture (structured steps)
 *   Phase B: Property matching (cards with action buttons)
 *
 * Manages per-user buyer sessions in ConversationSession.
 *
 * Rendering rules (same as inventory adapter):
 * - dropdown ≤ 3 options → WhatsApp buttons
 * - dropdown 4-10 options → WhatsApp list message
 * - dropdown > 10 options → numbered text
 * - radio → buttons
 * - text/phone → text prompt
 * - confirm → summary + YES/NO buttons
 * - property_card → image + details + action buttons
 */

import { WorkflowStep, StepOption } from './workflow_types';
import {
    BuyerConversationalCore,
    BuyerSession,
    BuyerProcessResult,
    BuyerSessionState,
} from './buyer_conversational_core';
import { PropertyCardData } from './buyer_workflow_engine';
import { NLUParser } from './nlu_parser';
import { WhatsAppService } from '../services/whatsapp';
import { CalendarService } from '../services/calendar';
import prisma from '../db';
import logger from '../utils/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BuyerWhatsAppSession {
    workflow: 'buyer_intake';
    state: BuyerSessionState;
    answers: Record<string, any>;
    current_step_id: string | null;
    current_step_options?: StepOption[];
    failed_attempts: number;
    started_at: string;
    last_activity_at: string;
    matching_state?: any;
    committed_phone?: string;
    committed_tx_id?: string;
}

export interface WhatsAppIncomingMessage {
    from: string;
    type: 'text' | 'image' | 'document' | 'interactive' | 'button';
    text?: { body: string };
    image?: { id: string; mime_type?: string; caption?: string };
    document?: { id: string; mime_type?: string; filename?: string };
    interactive?: {
        type: 'button_reply' | 'list_reply';
        button_reply?: { id: string; title: string };
        list_reply?: { id: string; title: string };
    };
    button?: { text: string; payload: string };
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class BuyerWhatsAppAdapter {
    private core: BuyerConversationalCore;
    private whatsapp: WhatsAppService;
    private nlu: NLUParser;
    private calendar: CalendarService;

    constructor() {
        this.core = new BuyerConversationalCore();
        this.whatsapp = new WhatsAppService();
        this.nlu = new NLUParser();
        this.calendar = new CalendarService();
    }

    /**
     * Start a new buyer workflow session for a WhatsApp user.
     */
    async startSession(phone: string): Promise<void> {
        // Deactivate ALL existing active sessions for this phone (buyer + inventory)
        await prisma.conversationSession.updateMany({
            where: { phone_number: phone, active: true },
            data: { active: false },
        });

        const result = await this.core.startSession('whatsapp');

        if (result.action === 'cancelled' || !result.step) {
            await this.whatsapp.sendText(phone, 'Buyer workflow configuration error. Please try again later.');
            return;
        }

        // Save session
        await this.saveSession(phone, this.coreToBuyerWaSession(result.session));

        // Greeting
        await this.whatsapp.sendText(phone,
            '🙏 *Namaste! I am Panditji, your property search assistant.*\n\n' +
            'Let me help you find your perfect property — I\'ll ask a few quick questions.\n\n' +
            'Aap naturally likh sakte hain — Hindi, English, ya Hinglish mein.\n' +
            'Commands: *back* / *skip* / *cancel*'
        );

        await this.sendStep(phone, result.step, result.options || []);
    }

    /**
     * Handle an incoming WhatsApp message within an active buyer session.
     */
    async handleMessage(phone: string, msg: WhatsAppIncomingMessage, sessionData: BuyerWhatsAppSession): Promise<void> {
        try {
            const rawText = this.extractText(msg).trim();
            if (!rawText) {
                logger.info(`[BuyerWhatsApp] Ignoring empty message from ${phone}`);
                return;
            }

            const session = this.waToCoreSession(sessionData);

            // Route by session state
            if (session.state === 'awaiting_confirm') {
                await this.handleConfirmation(phone, msg, session);
                return;
            }

            if (session.state === 'awaiting_action' || session.state === 'matching') {
                await this.handlePropertyAction(phone, rawText, msg, session);
                return;
            }

            if (session.state === 'booking') {
                await this.handleBookingInput(phone, rawText, session);
                return;
            }

            // Phase A: Requirement capture
            if (!session.current_step_id) {
                await this.whatsapp.sendText(phone, 'No active step. Type "search property" to start over.');
                return;
            }

            const currentStep = this.core.getStepDefinition(session.current_step_id);
            if (!currentStep) {
                await this.whatsapp.sendText(phone, 'Step not found. Type "search property" to start over.');
                return;
            }

            // Fast path: interactive button/list reply
            const interactiveId = this.extractInteractiveId(msg);
            let stepOptions = sessionData.current_step_options || [];

            if (interactiveId) {
                const matched = stepOptions.find(o => o.value === interactiveId);
                if (matched) {
                    const result = await this.core.processInput(session, matched.value, 'answer');
                    await this.saveSession(phone, this.coreToBuyerWaSession(result.session));
                    await this.renderResult(phone, result);
                    return;
                }
            }

            // NLU parsing
            const nluResult = await this.nlu.parse(rawText, currentStep, stepOptions);

            if (nluResult.command) {
                if (nluResult.command === 'cancel') {
                    await this.cancelSession(phone);
                    return;
                }
                const result = await this.core.processInput(session, null, nluResult.command as any);
                await this.saveSession(phone, this.coreToBuyerWaSession(result.session));
                await this.renderResult(phone, result);
                return;
            }

            if (nluResult.parsed) {
                const result = await this.core.processInput(session, nluResult.parsed.value, 'answer');
                await this.saveSession(phone, this.coreToBuyerWaSession(result.session));
                await this.renderResult(phone, result);
                return;
            }

            // NLU failed
            sessionData.failed_attempts = (sessionData.failed_attempts || 0) + 1;
            await this.saveSession(phone, sessionData);

            if (sessionData.failed_attempts >= 15) {
                await this.whatsapp.sendText(phone,
                    '😕 Lagta hai aapko pareshani ho rahi hai. Session cancel kar raha hoon.\n\nType *search property* to start fresh.'
                );
                await this.endSession(phone);
                return;
            }

            await this.sendContextualHelp(phone, currentStep, stepOptions);
        } catch (err) {
            logger.error(`[BuyerWhatsApp] Error handling message from ${phone}:`, err);
            await this.whatsapp.sendText(phone, 'Something went wrong. Please try again or type "cancel" to start over.');
        }
    }

    // ─── Result Rendering ────────────────────────────────────────────────────

    private async renderResult(phone: string, result: BuyerProcessResult): Promise<void> {
        switch (result.action) {
            case 'next_step':
            case 'went_back':
            case 'skipped':
                if (result.step) {
                    await this.sendStep(phone, result.step, result.options || []);
                }
                break;

            case 'requirements_changed':
                await this.whatsapp.sendText(phone, '🔄 Let\'s update your requirements. Starting from the beginning.');
                if (result.step) {
                    await this.sendStep(phone, result.step, result.options || []);
                }
                break;

            case 'summary':
                if (result.summary) {
                    const summaryLines = Object.entries(result.summary).map(([k, v]) => `• *${k}*: ${v}`).join('\n');
                    const summaryMsg = `📋 *Your Requirements — Please Confirm*\n\n${summaryLines}\n\nIs everything correct?`;
                    await this.sendButtons(phone, summaryMsg, [
                        { value: 'confirm_yes', label: 'Confirm ✅' },
                        { value: 'confirm_no', label: 'Edit ✏️' },
                    ]);
                }
                break;

            case 'property_card':
                if (result.property) {
                    await this.sendPropertyCard(phone, result.property, result.match_index || 0, result.metadata);
                }
                break;

            case 'no_matches':
            case 'no_more_properties':
                await this.whatsapp.sendText(phone,
                    result.metadata?.message ||
                    '🏠 No more matching properties available. We\'ll notify you when new listings arrive!\n\nType *search property* to search with different requirements.'
                );
                await this.endSession(phone);
                break;

            case 'validation_error':
                await this.whatsapp.sendText(phone, `❌ ${result.error}\n\nPlease try again.`);
                break;

            case 'parse_error':
                if (result.error) {
                    await this.whatsapp.sendText(phone, result.error);
                }
                if (result.quick_replies && result.quick_replies.length > 0 && result.quick_replies.length <= 3) {
                    await this.sendButtons(phone, 'Choose an option:', result.quick_replies);
                }
                break;

            case 'cancelled':
                await this.cancelSession(phone);
                break;

            case 'session_expired':
                await this.endSession(phone);
                await this.whatsapp.sendText(phone, '⏰ Your session expired due to inactivity. Type "search property" to start again.');
                break;

            case 'auto_cancelled':
                await this.endSession(phone);
                await this.whatsapp.sendText(phone,
                    '😕 It seems you\'re having trouble. I\'m cancelling this session.\n\nType *search property* to start fresh anytime.'
                );
                break;
        }
    }

    // ─── Property Card Rendering ─────────────────────────────────────────────

    private async sendPropertyCard(
        phone: string,
        property: PropertyCardData,
        matchIndex: number,
        metadata?: Record<string, any>,
    ): Promise<void> {
        // Build property details
        const title = [property.bhk, property.type].filter(Boolean).join(' ');
        const details: string[] = [];
        if (property.area) details.push(property.area);
        if (property.furnishing) details.push(property.furnishing);
        if (property.floor) details.push(`Floor ${property.floor}`);

        // Send image with rich caption (if available)
        if (property.images.length > 0) {
            const captionLines: string[] = [];
            captionLines.push(`🏠 *${title}*`);
            captionLines.push(`📍 ${property.location}`);
            captionLines.push(`💰 *${property.display_price_formatted}*`);
            if (details.length > 0) captionLines.push(`📐 ${details.join(' · ')}`);
            if (property.amenities.length > 0) captionLines.push(`✨ ${property.amenities.join(', ')}`);
            if (property.match_score) captionLines.push(`🎯 Match: ${property.match_score}%`);
            captionLines.push(`\nProperty #${matchIndex + 1} | ${property.intent === 'rent' ? 'For Rent' : 'For Sale'}`);
            try {
                await this.whatsapp.sendImage(phone, property.images[0], captionLines.join('\n'));
            } catch (err) {
                logger.error('[BuyerWhatsApp] Error sending property image:', err);
            }
        } else {
            // No image — send details as text
            const textLines: string[] = [];
            textLines.push(`🏠 *${title}*`);
            textLines.push(`📍 ${property.location}`);
            textLines.push(`💰 *${property.display_price_formatted}*`);
            if (details.length > 0) textLines.push(`📐 ${details.join(' · ')}`);
            if (property.amenities.length > 0) textLines.push(`✨ ${property.amenities.join(', ')}`);
            if (property.match_score) textLines.push(`🎯 Match: ${property.match_score}%`);
            textLines.push(`\nProperty #${matchIndex + 1} | ${property.intent === 'rent' ? 'For Rent' : 'For Sale'}`);
            await this.whatsapp.sendText(phone, textLines.join('\n'));
        }

        // Send action buttons
        const buttonPrompt = `Interested in this *${title}*?`;
        if (metadata?.booking_mode) {
            await this.sendButtons(phone, buttonPrompt, [
                { value: '__book_now__', label: 'Book Now' },
                { value: '__back_to_property__', label: 'Back' },
            ]);
        } else {
            await this.sendButtons(phone, buttonPrompt, [
                { value: '__schedule_visit__', label: 'Schedule Visit' },
                { value: '__next_property__', label: 'Next Property' },
                { value: '__change_requirements__', label: 'Change Criteria' },
            ]);
        }
    }

    // ─── Confirmation Handling ───────────────────────────────────────────────

    private async handleConfirmation(phone: string, msg: WhatsAppIncomingMessage, session: BuyerSession): Promise<void> {
        const text = this.extractText(msg).toLowerCase().trim();
        const interactiveId = this.extractInteractiveId(msg);

        const nluConf = this.nlu.parseConfirmation(text);
        const isYes = interactiveId === 'confirm_yes' || nluConf === 'yes';
        const isNo = interactiveId === 'confirm_no' || nluConf === 'no';

        if (isYes) {
            const buyerPhone = session.answers.buyer_phone as string || phone;
            await this.whatsapp.sendText(phone, '🔍 Searching for matching properties...');
            const result = await this.core.handleConfirmation(session, true, 'whatsapp', buyerPhone);
            await this.saveSession(phone, this.coreToBuyerWaSession(result.session));
            await this.renderResult(phone, result);
            return;
        }

        if (isNo) {
            const result = await this.core.handleConfirmation(session, false, 'whatsapp');
            await this.saveSession(phone, this.coreToBuyerWaSession(result.session));
            await this.renderResult(phone, result);
            return;
        }

        await this.whatsapp.sendText(phone, 'Please type *YES* to confirm or *NO* to go back and edit.');
    }

    // ─── Property Action Handling ────────────────────────────────────────────

    private async handlePropertyAction(
        phone: string,
        text: string,
        msg: WhatsAppIncomingMessage,
        session: BuyerSession,
    ): Promise<void> {
        const interactiveId = this.extractInteractiveId(msg);
        const action = interactiveId || this.normalizeAction(text);

        // Handle "done" / cancel
        if (action === '__done__' || action === 'cancel') {
            if (action === 'cancel') {
                await this.cancelSession(phone);
            } else {
                await this.endSession(phone);
                await this.whatsapp.sendText(phone,
                    '🙏 Thank you for using Realty Pandit! We\'ll notify you when new matching properties become available.'
                );
            }
            return;
        }

        // Schedule visit → transition to booking
        if (action === '__schedule_visit__') {
            session.state = 'booking';
            await this.saveSession(phone, this.coreToBuyerWaSession(session));
            await this.whatsapp.sendText(phone,
                '📅 *Schedule a Visit*\n\n' +
                'When would you like to visit this property?\n\n' +
                'Please send a date and time, e.g.:\n' +
                '_tomorrow 10am_\n' +
                '_15 March 3pm_\n' +
                '_kal subah 11 baje_\n\n' +
                'Or type *back* to go back to the property.'
            );
            return;
        }

        // Route to core for other actions
        const result = await this.core.handleAction(session, action, 'whatsapp');
        await this.saveSession(phone, this.coreToBuyerWaSession(result.session));
        await this.renderResult(phone, result);
    }

    // ─── Booking Input Handling ──────────────────────────────────────────────

    private async handleBookingInput(phone: string, text: string, session: BuyerSession): Promise<void> {
        const lower = text.toLowerCase().trim();

        // Back command
        if (/^(back|wapas|peeche)$/i.test(lower)) {
            session.state = 'awaiting_action';
            await this.saveSession(phone, this.coreToBuyerWaSession(session));
            if (session.matching_state?.current_property) {
                await this.sendPropertyCard(phone, session.matching_state.current_property, session.matching_state.shown_ids.length - 1);
            }
            return;
        }

        if (/^cancel$/i.test(lower)) {
            await this.cancelSession(phone);
            return;
        }

        // Parse date/time from text
        const scheduledAt = this.parseDateFromText(text);
        if (!scheduledAt) {
            await this.whatsapp.sendText(phone,
                '❓ Could not understand the date/time.\n\nPlease try: _tomorrow 10am_, _15 March 3pm_, or _kal 11 baje_\n\nType *back* to go back.'
            );
            return;
        }

        const propertyId = session.matching_state?.current_property_id;
        if (!propertyId) {
            await this.whatsapp.sendText(phone, '❌ No property selected. Type *back* to go back.');
            session.state = 'awaiting_action';
            await this.saveSession(phone, this.coreToBuyerWaSession(session));
            return;
        }

        const contactPhone = session.committed_phone || phone;

        try {
            await this.calendar.createFromChat({
                contact_id: contactPhone,
                property_id: propertyId,
                scheduled_at: scheduledAt,
                source: 'whatsapp_buyer_chat',
            });

            session.state = 'awaiting_action';
            await this.saveSession(phone, this.coreToBuyerWaSession(session));

            const dateStr = scheduledAt.toLocaleDateString('en-IN', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            });
            const timeStr = scheduledAt.toLocaleTimeString('en-IN', {
                hour: '2-digit', minute: '2-digit',
            });

            await this.sendButtons(phone,
                `✅ *Visit Scheduled!*\n\n📅 ${dateStr}\n🕐 ${timeStr}\n\nYou'll receive a confirmation reminder. Would you like to see more properties?`,
                [
                    { value: '__next_property__', label: 'Next Property' },
                    { value: '__done__', label: 'Done' },
                ],
            );
        } catch (err) {
            logger.error('[BuyerWhatsApp] Booking error:', err);
            await this.whatsapp.sendText(phone, '❌ Could not schedule the visit. Please try again.');
        }
    }

    // ─── Step Rendering ──────────────────────────────────────────────────────

    private async sendStep(phone: string, step: WorkflowStep, options: StepOption[]): Promise<void> {
        const question = step.question_hi
            ? `${step.question}\n\n_${step.question_hi}_`
            : step.question;

        // Phone
        if (step.input_type === 'phone') {
            let msg = `📞 *${question}*\n\n_10 digit mobile number bhejein (e.g., 9876543210)_`;
            if (!step.required) msg += '\n\nType *skip* to skip.';
            await this.whatsapp.sendText(phone, msg);
            return;
        }

        // Text / address for buyer location
        if (step.input_type === 'address_block' || step.field === 'buyer_location') {
            const msg = `📍 *${question}*\n\nPlease send the area, locality, or city name.\n\n_Example: Sector 14 Vaishali, Ghaziabad_`;
            await this.whatsapp.sendText(phone, msg);
            return;
        }

        // Budget
        if (step.field === 'buyer_budget') {
            const msg = `💰 *${question}*\n\n_Aap "50 lakh", "1 crore", "20k/month" bhi likh sakte hain._\n\n_Example: 50 lakh to 1 crore_`;
            await this.whatsapp.sendText(phone, msg);
            return;
        }

        // Options: radio/dropdown
        if (options.length > 0 && (step.input_type === 'dropdown' || step.input_type === 'radio')) {
            if (options.length <= 3) {
                await this.sendButtons(phone, question, options);
            } else if (options.length <= 10) {
                await this.sendList(phone, question, options, step.group);
            } else {
                const optsList = options.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
                const msg = `*${question}*\n\n${optsList}\n\n_Type the number or name to choose._`;
                await this.whatsapp.sendText(phone, msg);
            }
            return;
        }

        // Default text prompt
        let msg = `*${question}*`;
        if (step.placeholder) msg += `\n\n_${step.placeholder}_`;
        if (!step.required) msg += '\n\nType *skip* to skip this.';
        await this.whatsapp.sendText(phone, msg);
    }

    // ─── WhatsApp Interactive Message Senders ────────────────────────────────

    private async sendButtons(phone: string, question: string, options: Array<{ value: string; label: string }>): Promise<void> {
        const buttons = options.slice(0, 3).map(o => ({
            type: 'reply',
            reply: { id: o.value, title: o.label.substring(0, 20) },
        }));

        const payload = {
            messaging_product: 'whatsapp',
            to: phone,
            type: 'interactive',
            interactive: {
                type: 'button',
                body: { text: question.substring(0, 1024) },
                action: { buttons },
            },
        };

        await this.sendInteractive(phone, payload);
    }

    private async sendList(phone: string, question: string, options: StepOption[], groupLabel: string): Promise<void> {
        const rows = options.slice(0, 10).map(o => ({
            id: o.value,
            title: o.label.substring(0, 24),
        }));

        const payload = {
            messaging_product: 'whatsapp',
            to: phone,
            type: 'interactive',
            interactive: {
                type: 'list',
                body: { text: question.substring(0, 1024) },
                action: {
                    button: 'Choose Option',
                    sections: [{
                        title: groupLabel || 'Options',
                        rows,
                    }],
                },
            },
        };

        await this.sendInteractive(phone, payload);
    }

    private async sendInteractive(phone: string, payload: any): Promise<void> {
        if (process.env.NODE_ENV === 'development') {
            logger.info(`[BuyerWhatsApp] Mock interactive to ${phone}:`, JSON.stringify(payload.interactive?.type));
            const body = payload.interactive?.body?.text || '';
            const options = payload.interactive?.action?.buttons
                ? payload.interactive.action.buttons.map((b: any) => b.reply.title).join(' | ')
                : payload.interactive?.action?.sections?.[0]?.rows?.map((r: any) => r.title).join(', ') || '';
            await this.whatsapp.sendText(phone, `${body}\n\nOptions: ${options}`);
            return;
        }

        try {
            const axios = (await import('axios')).default;
            const apiUrl = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
            const resp = await axios.post(apiUrl, payload, {
                headers: {
                    'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            });
            logger.info(`[BuyerWhatsApp] Interactive sent to ${phone} (${resp.status})`);
        } catch (err: any) {
            const errDetail = err?.response?.data ? JSON.stringify(err.response.data) : (err as Error).message;
            logger.error('[BuyerWhatsApp] Failed to send interactive:', errDetail);
            // Fallback to text
            const body = payload.interactive?.body?.text || 'Please choose an option:';
            const buttons = payload.interactive?.action?.buttons;
            const rows = payload.interactive?.action?.sections?.[0]?.rows;
            let optionsText = '';
            if (buttons && buttons.length > 0) {
                optionsText = '\n\n*Options:*\n' + buttons.map((b: any, i: number) => `${i + 1}. ${b.reply.title}`).join('\n');
                optionsText += '\n\n_Type the number or option name._';
            } else if (rows && rows.length > 0) {
                optionsText = '\n\n*Options:*\n' + rows.map((r: any, i: number) => `${i + 1}. ${r.title}`).join('\n');
                optionsText += '\n\n_Type the number or option name._';
            }
            await this.whatsapp.sendText(phone, body + optionsText);
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private extractText(msg: WhatsAppIncomingMessage): string {
        if (msg.interactive) {
            if (msg.interactive.button_reply) return msg.interactive.button_reply.title;
            if (msg.interactive.list_reply) return msg.interactive.list_reply.title;
        }
        if (msg.button) return msg.button.text || msg.button.payload;
        if (msg.text) return msg.text.body;
        if (msg.image?.caption) return msg.image.caption;
        return '';
    }

    private extractInteractiveId(msg: WhatsAppIncomingMessage): string | null {
        if (msg.interactive?.button_reply) return msg.interactive.button_reply.id;
        if (msg.interactive?.list_reply) return msg.interactive.list_reply.id;
        return null;
    }

    private normalizeAction(text: string): string {
        const lower = text.toLowerCase().trim();
        if (/^(next|more|aur|aur dikhao|show more|agli|next property)$/i.test(lower)) return '__next_property__';
        if (/^(schedule|book|visit|dekhna|milna|schedule visit|book visit)$/i.test(lower)) return '__schedule_visit__';
        if (/^(change|badlo|modify|edit|change req|change requirements|change criteria)$/i.test(lower)) return '__change_requirements__';
        if (/^(done|bas|finish|khatam|no more|enough)$/i.test(lower)) return '__done__';
        if (/^(back|wapas|peeche)$/i.test(lower)) return '__back_to_property__';
        if (/^cancel$/i.test(lower)) return 'cancel';
        return lower;
    }

    /**
     * Parse date/time from natural language text.
     * Supports: "tomorrow 10am", "15 March 3pm", "kal 11 baje"
     */
    private parseDateFromText(text: string): Date | null {
        const now = new Date();
        const lower = text.toLowerCase().trim();

        // "tomorrow" / "kal"
        let baseDate: Date | null = null;
        if (/\b(tomorrow|kal)\b/.test(lower)) {
            baseDate = new Date(now);
            baseDate.setDate(baseDate.getDate() + 1);
        } else if (/\b(today|aaj)\b/.test(lower)) {
            baseDate = new Date(now);
        } else if (/\b(parso|day after)\b/.test(lower)) {
            baseDate = new Date(now);
            baseDate.setDate(baseDate.getDate() + 2);
        }

        // Try to parse explicit date: "15 March", "March 15", "15/3", "15-03"
        if (!baseDate) {
            const months: Record<string, number> = {
                jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
                apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
                aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9,
                nov: 10, november: 10, dec: 11, december: 11,
            };

            // "15 March" or "March 15"
            const dateMonthMatch = lower.match(/(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*/i) ||
                lower.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*(\d{1,2})/i);
            if (dateMonthMatch) {
                const day = parseInt(dateMonthMatch[1].match(/\d+/) ? dateMonthMatch[1] : dateMonthMatch[2]);
                const monthStr = (dateMonthMatch[1].match(/[a-z]+/i) ? dateMonthMatch[1] : dateMonthMatch[2] || '').toLowerCase().substring(0, 3);
                const month = months[monthStr];
                if (month !== undefined && day >= 1 && day <= 31) {
                    baseDate = new Date(now.getFullYear(), month, day);
                    if (baseDate < now) baseDate.setFullYear(baseDate.getFullYear() + 1);
                }
            }

            // "15/3" or "15-03"
            if (!baseDate) {
                const slashMatch = lower.match(/(\d{1,2})[\/\-](\d{1,2})/);
                if (slashMatch) {
                    const day = parseInt(slashMatch[1]);
                    const month = parseInt(slashMatch[2]) - 1;
                    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
                        baseDate = new Date(now.getFullYear(), month, day);
                        if (baseDate < now) baseDate.setFullYear(baseDate.getFullYear() + 1);
                    }
                }
            }
        }

        if (!baseDate) return null;

        // Parse time
        let hour = 10; // Default 10 AM
        let minute = 0;

        // "10am", "3pm", "10:30am"
        const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
        if (timeMatch) {
            hour = parseInt(timeMatch[1]);
            minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
            if (timeMatch[3].toLowerCase() === 'pm' && hour < 12) hour += 12;
            if (timeMatch[3].toLowerCase() === 'am' && hour === 12) hour = 0;
        }

        // "11 baje", "3 baje"
        const bajeMatch = lower.match(/(\d{1,2})\s*baje/);
        if (bajeMatch) {
            hour = parseInt(bajeMatch[1]);
            if (hour < 7) hour += 12; // Assume PM for < 7
        }

        // "subah" (morning) / "dopahar" (afternoon) / "shaam" (evening)
        if (/\b(subah|morning)\b/.test(lower) && hour >= 12) hour -= 12;
        if (/\b(shaam|evening)\b/.test(lower) && hour < 12) hour += 12;
        if (/\b(dopahar|afternoon)\b/.test(lower) && hour < 12) hour += 12;

        baseDate.setHours(hour, minute, 0, 0);
        return baseDate;
    }

    private async sendContextualHelp(phone: string, step: WorkflowStep, options: StepOption[]): Promise<void> {
        let helpMsg = '❓ Samajh nahi aaya. ';

        switch (step.input_type) {
            case 'radio':
            case 'dropdown':
                if (options.length > 0) {
                    const optsList = options.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
                    helpMsg += `Neeche diye options mein se choose karein:\n\n${optsList}\n\n_Number ya naam type karein._`;
                } else {
                    helpMsg += 'Please type your answer.';
                }
                break;
            case 'phone':
                helpMsg += '10 digit mobile number bhejein.\n\n_Example: 9876543210_';
                break;
            default:
                helpMsg += 'Apna jawab type karein ya *skip* karein.';
                break;
        }

        helpMsg += '\n\n_Commands: *back* | *skip* | *cancel*_';
        await this.whatsapp.sendText(phone, helpMsg);
    }

    // ─── Session Conversion ──────────────────────────────────────────────────

    private waToCoreSession(wa: BuyerWhatsAppSession): BuyerSession {
        return {
            workflow: 'buyer_intake',
            state: wa.state,
            answers: wa.answers,
            current_step_id: wa.current_step_id,
            current_step_options: wa.current_step_options,
            failed_attempts: wa.failed_attempts,
            started_at: wa.started_at,
            last_activity_at: wa.last_activity_at || new Date().toISOString(),
            matching_state: wa.matching_state,
            committed_phone: wa.committed_phone,
            committed_tx_id: wa.committed_tx_id,
        };
    }

    private coreToBuyerWaSession(core: BuyerSession): BuyerWhatsAppSession {
        return {
            workflow: 'buyer_intake',
            state: core.state,
            answers: core.answers,
            current_step_id: core.current_step_id,
            current_step_options: core.current_step_options,
            failed_attempts: core.failed_attempts,
            started_at: core.started_at,
            last_activity_at: core.last_activity_at,
            matching_state: core.matching_state,
            committed_phone: core.committed_phone,
            committed_tx_id: core.committed_tx_id,
        };
    }

    // ─── Session Persistence ─────────────────────────────────────────────────

    private async cancelSession(phone: string): Promise<void> {
        await this.endSession(phone);
        await this.whatsapp.sendText(phone, '❌ Property search cancelled.\n\nType "search property" to start again anytime.');
    }

    private async saveSession(phone: string, data: BuyerWhatsAppSession): Promise<void> {
        const context: Record<string, any> = {
            answers: data.answers,
            current_step_id: data.current_step_id,
            current_step_options: data.current_step_options || [],
            failed_attempts: data.failed_attempts || 0,
            state: data.state,
            started_at: data.started_at,
            last_activity_at: data.last_activity_at || new Date().toISOString(),
            matching_state: data.matching_state,
            committed_phone: data.committed_phone,
            committed_tx_id: data.committed_tx_id,
        };

        await prisma.$transaction(async (tx) => {
            const existing = await tx.conversationSession.findFirst({
                where: { phone_number: phone, active: true, workflow: 'buyer_intake' },
                select: { id: true },
            });

            if (existing) {
                await tx.conversationSession.update({
                    where: { id: existing.id },
                    data: { state: data.state, context },
                });
            } else {
                await tx.conversationSession.create({
                    data: {
                        phone_number: phone,
                        workflow: 'buyer_intake',
                        state: data.state,
                        context,
                        active: true,
                    },
                });
            }
        });
    }

    /**
     * Load active buyer session for a phone number.
     */
    static async loadSession(phone: string): Promise<BuyerWhatsAppSession | null> {
        const session = await prisma.conversationSession.findFirst({
            where: { phone_number: phone, active: true, workflow: 'buyer_intake' },
            orderBy: { updated_at: 'desc' },
        });

        if (!session) return null;

        const ctx = session.context as any;
        return {
            workflow: 'buyer_intake',
            state: ctx.state || 'in_progress',
            answers: ctx.answers || {},
            current_step_id: ctx.current_step_id || null,
            current_step_options: ctx.current_step_options,
            failed_attempts: ctx.failed_attempts || 0,
            started_at: ctx.started_at || session.created_at.toISOString(),
            last_activity_at: ctx.last_activity_at || session.updated_at.toISOString(),
            matching_state: ctx.matching_state,
            committed_phone: ctx.committed_phone,
            committed_tx_id: ctx.committed_tx_id,
        };
    }

    /**
     * Check if a phone number has an active buyer session.
     */
    static async hasActiveSession(phone: string): Promise<boolean> {
        const count = await prisma.conversationSession.count({
            where: { phone_number: phone, active: true, workflow: 'buyer_intake' },
        });
        return count > 0;
    }

    private async endSession(phone: string): Promise<void> {
        await prisma.conversationSession.updateMany({
            where: { phone_number: phone, active: true, workflow: 'buyer_intake' },
            data: { active: false },
        });
    }
}
