/**
 * Buyer Chat Workflow Adapter
 *
 * HTTP API adapter for the buyer conversational workflow.
 * Wraps BuyerConversationalCore + NLUParser to provide
 * a REST API for the web/admin chat UI.
 *
 * Uses ChatWorkflowSession (workflow='buyer_intake') for persistence.
 *
 * Two-phase flow:
 *   Phase A: Requirement capture (structured steps)
 *   Phase B: Property matching loop (show one property at a time)
 */

import { v4 as uuidv4 } from 'uuid';
import prisma from '../db';
import logger from '../utils/logger';
import {
    BuyerConversationalCore,
    BuyerSession,
    BuyerProcessResult,
} from './buyer_conversational_core';
import { NLUParser } from './nlu_parser';
import { CalendarService } from '../services/calendar';
import { WorkflowStep, StepOption } from './workflow_types';
import { ChatMessage, QuickReply } from './chat_workflow_adapter';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BuyerChatStartResponse {
    session_id: string;
    messages: ChatMessage[];
    workflow_type: 'buyer_intake';
}

export interface BuyerChatMessageResponse {
    messages: ChatMessage[];
    session_active: boolean;
    progress?: { current: number; total: number; group: string };
    matching_phase?: boolean;
}

export interface BuyerActionResponse {
    messages: ChatMessage[];
    session_active: boolean;
    matching_phase?: boolean;
}

export interface BuyerBookResponse {
    messages: ChatMessage[];
    session_active: boolean;
    appointment_id?: string;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class BuyerChatWorkflowAdapter {
    private core: BuyerConversationalCore;
    private nlu: NLUParser;
    private calendar: CalendarService;

    constructor() {
        this.core = new BuyerConversationalCore();
        this.nlu = new NLUParser();
        this.calendar = new CalendarService();
    }

    /**
     * Start a new buyer chat workflow session.
     * prefill: optional known data (phone, name) to auto-fill and skip those steps.
     */
    async startSession(
        existingSessionId?: string,
        source: 'web' | 'admin' = 'web',
        prefill?: { phone?: string; name?: string },
    ): Promise<BuyerChatStartResponse> {
        // Resume existing session
        if (existingSessionId) {
            const existing = await this.loadSession(existingSessionId);
            if (existing) {
                const messages: ChatMessage[] = [
                    this.makeMessage('assistant', 'Welcome back! Let\'s continue finding your perfect property.', 'system'),
                ];

                if (existing.state === 'awaiting_action' && existing.matching_state?.current_property) {
                    // Resume in matching phase — re-show current property
                    messages.push(this.makePropertyCardMessage(
                        existing.matching_state.current_property,
                        existing.matching_state.shown_ids.length - 1,
                        0,
                    ));
                } else if (existing.state === 'awaiting_confirm') {
                    const summary = await this.core.getEngine().buildBuyerSummary(existing.answers);
                    messages.push(this.makeSummaryMessage(summary));
                } else if (existing.current_step_id) {
                    const step = this.core.getStepDefinition(existing.current_step_id);
                    if (step) {
                        const progress = await this.core.calculateProgress(existing);
                        messages.push(this.makeStepMessage(step, existing.current_step_options || [], progress));
                    }
                }

                return { session_id: existingSessionId, messages, workflow_type: 'buyer_intake' };
            }
        }

        // Create new session
        const result = await this.core.startSession(source);
        const sessionId = uuidv4();

        if (result.action === 'cancelled' || !result.step) {
            return {
                session_id: sessionId,
                messages: [this.makeMessage('assistant', 'Unable to start buyer workflow. Please try again later.', 'error')],
                workflow_type: 'buyer_intake',
            };
        }

        // Pre-fill known data (phone, name) to skip those steps
        let session = result.session;
        let currentStep = result.step;
        let currentOptions = result.options || [];
        let currentMetadata = result.metadata;

        if (prefill) {
            // Auto-fill phone step
            if (prefill.phone && session.current_step_id === 'buyer_phone') {
                const phoneResult = await this.core.processInput(session, prefill.phone, 'answer');
                if (phoneResult.session) session = phoneResult.session;
                if (phoneResult.step) currentStep = phoneResult.step;
                currentOptions = phoneResult.options || [];
                currentMetadata = phoneResult.metadata;

                // Auto-fill name step
                if (prefill.name && session.current_step_id === 'buyer_name') {
                    const nameResult = await this.core.processInput(session, prefill.name, 'answer');
                    if (nameResult.session) session = nameResult.session;
                    if (nameResult.step) currentStep = nameResult.step;
                    currentOptions = nameResult.options || [];
                    currentMetadata = nameResult.metadata;
                }
            }
        }

        // Save to DB
        await this.saveSession(sessionId, session);

        const progress = await this.core.calculateProgress(session);
        const messages: ChatMessage[] = [
            this.makeMessage(
                'assistant',
                'Namaste! I\'ll help you find the perfect property. Let me ask you a few quick questions to understand your requirements.',
                'system',
            ),
            this.makeStepMessage(currentStep, currentOptions, progress, currentMetadata),
        ];

        return { session_id: sessionId, messages, workflow_type: 'buyer_intake' };
    }

    /**
     * Handle a text message during buyer workflow.
     * Routes to intake steps or matching actions based on session state.
     */
    async handleMessage(
        sessionId: string,
        text?: string,
        quickReplyValue?: string,
        source: 'web' | 'admin' = 'web',
    ): Promise<BuyerChatMessageResponse> {
        const session = await this.loadSession(sessionId);
        if (!session) {
            return {
                messages: [this.makeMessage('assistant', 'Session not found or expired. Please start a new search.', 'error')],
                session_active: false,
            };
        }

        if (this.core.isExpired(session)) {
            await this.endSession(sessionId);
            return {
                messages: [this.makeMessage('assistant', 'Your session expired due to inactivity. Please start a new property search.', 'error')],
                session_active: false,
            };
        }

        const messages: ChatMessage[] = [];

        // Echo user message
        if (text) {
            messages.push(this.makeMessage('user', text, 'text'));
        } else if (quickReplyValue) {
            const step = this.core.getStepDefinition(session.current_step_id || '');
            const options = session.current_step_options || [];
            const matchedOpt = options.find(o => o.value === quickReplyValue);
            messages.push(this.makeMessage('user', matchedOpt?.label || quickReplyValue, 'text'));
        }

        const input = text || quickReplyValue || '';

        // Route by session state
        if (session.state === 'awaiting_confirm') {
            return this.handleConfirmMessage(sessionId, session, input, messages, source);
        }

        if (session.state === 'awaiting_action' || session.state === 'matching') {
            // In matching phase — route to action handler
            return this.handleActionMessage(sessionId, session, input, messages, source);
        }

        if (session.state === 'booking') {
            // In booking phase — handled by book endpoint
            messages.push(this.makeMessage('assistant', 'Please use the booking form to schedule your visit, or click Back.', 'text'));
            return { messages, session_active: true, matching_phase: true };
        }

        // Phase A: Normal intake step processing
        let result: BuyerProcessResult;

        if (quickReplyValue) {
            result = await this.core.processInput(session, quickReplyValue, 'answer');
        } else if (text) {
            const step = this.core.getStepDefinition(session.current_step_id || '');
            if (!step) {
                return {
                    messages: [this.makeMessage('assistant', 'Step not found. Please start a new search.', 'error')],
                    session_active: false,
                };
            }

            const options = session.current_step_options || [];
            const nluResult = await this.nlu.parse(text, step, options);

            if (nluResult.command) {
                result = await this.core.processInput(session, null, nluResult.command as any);
            } else if (nluResult.parsed) {
                result = await this.core.processInput(session, nluResult.parsed.value, 'answer');
            } else {
                result = await this.core.processInput(session, null, null);
            }
        } else {
            return {
                messages: [this.makeMessage('assistant', 'Please send a message or select an option.', 'text')],
                session_active: true,
            };
        }

        await this.saveSession(sessionId, result.session);

        // Handle result
        const progress = await this.core.calculateProgress(result.session);
        messages.push(...this.resultToMessages(result, progress));

        const active = result.action !== 'cancelled' &&
            result.action !== 'session_expired' &&
            result.action !== 'auto_cancelled';

        return {
            messages,
            session_active: active,
            progress,
            matching_phase: result.session.state === 'awaiting_action' || result.session.state === 'matching',
        };
    }

    /**
     * Handle buyer action on a property card.
     * Actions: schedule_visit, next_property, change_requirements
     */
    async handleAction(
        sessionId: string,
        action: string,
        source: 'web' | 'admin' = 'web',
    ): Promise<BuyerActionResponse> {
        const session = await this.loadSession(sessionId);
        if (!session) {
            return {
                messages: [this.makeMessage('assistant', 'Session not found.', 'error')],
                session_active: false,
            };
        }

        const result = await this.core.handleAction(session, action, source);
        await this.saveSession(sessionId, result.session);

        const messages = this.resultToMessages(result);

        const active = result.session.state !== 'completed';
        return {
            messages,
            session_active: active,
            matching_phase: result.session.state === 'awaiting_action' || result.session.state === 'matching',
        };
    }

    /**
     * Book a property visit.
     */
    async handleBookVisit(
        sessionId: string,
        propertyId: string,
        preferredDate?: string,
        preferredTime?: string,
        source: 'web' | 'admin' = 'web',
    ): Promise<BuyerBookResponse> {
        const session = await this.loadSession(sessionId);
        if (!session) {
            return {
                messages: [this.makeMessage('assistant', 'Session not found.', 'error')],
                session_active: false,
            };
        }

        const contactPhone = session.committed_phone;
        if (!contactPhone) {
            return {
                messages: [this.makeMessage('assistant', 'Phone number is required to book a visit. Please provide your phone number.', 'error')],
                session_active: true,
            };
        }

        // Build appointment date
        let scheduledAt: Date;
        if (preferredDate && preferredTime) {
            scheduledAt = new Date(`${preferredDate}T${preferredTime}`);
        } else if (preferredDate) {
            scheduledAt = new Date(`${preferredDate}T10:00:00`);
        } else {
            // Default: tomorrow at 10 AM
            scheduledAt = new Date();
            scheduledAt.setDate(scheduledAt.getDate() + 1);
            scheduledAt.setHours(10, 0, 0, 0);
        }

        try {
            const appointment = await this.calendar.createFromChat({
                contact_id: contactPhone,
                property_id: propertyId,
                scheduled_at: scheduledAt,
                source: source === 'admin' ? 'admin_buyer_chat' : 'website_buyer_chat',
                sessionId,
            });

            // Transition back to matching state
            session.state = 'awaiting_action';
            await this.saveSession(sessionId, session);

            const dateStr = scheduledAt.toLocaleDateString('en-IN', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            });
            const timeStr = scheduledAt.toLocaleTimeString('en-IN', {
                hour: '2-digit', minute: '2-digit',
            });

            return {
                messages: [
                    this.makeMessage(
                        'assistant',
                        `Visit scheduled for ${dateStr} at ${timeStr}. You'll receive a confirmation on WhatsApp. Would you like to see more properties?`,
                        'success',
                        undefined,
                        undefined,
                        [
                            { label: 'Next Property', value: '__next_property__' },
                            { label: 'Done', value: '__done__' },
                        ],
                    ),
                ],
                session_active: true,
                appointment_id: appointment?.id,
            };
        } catch (err) {
            logger.error('[BuyerChatAdapter] Booking error:', err);
            return {
                messages: [this.makeMessage('assistant', 'Could not schedule the visit. Please try again.', 'error')],
                session_active: true,
            };
        }
    }

    /**
     * Get session state for reconnection.
     */
    async getSession(sessionId: string): Promise<{
        active: boolean;
        workflow_type: 'buyer_intake';
        state?: string;
        step_id?: string;
        progress?: { current: number; total: number; group: string };
        matching_phase?: boolean;
    }> {
        const session = await this.loadSession(sessionId);
        if (!session) return { active: false, workflow_type: 'buyer_intake' };

        if (this.core.isExpired(session)) {
            await this.endSession(sessionId);
            return { active: false, workflow_type: 'buyer_intake' };
        }

        const progress = await this.core.calculateProgress(session);
        return {
            active: true,
            workflow_type: 'buyer_intake',
            state: session.state,
            step_id: session.current_step_id || undefined,
            progress,
            matching_phase: session.state === 'awaiting_action' || session.state === 'matching',
        };
    }

    // ─── Confirmation Handling ───────────────────────────────────────────────

    private async handleConfirmMessage(
        sessionId: string,
        session: BuyerSession,
        text: string,
        messages: ChatMessage[],
        source: 'web' | 'admin',
    ): Promise<BuyerChatMessageResponse> {
        const confirmation = this.nlu.parseConfirmation(text);
        const phone = session.answers.buyer_phone as string | undefined;

        if (confirmation === 'yes' || text === '__confirm__') {
            const result = await this.core.handleConfirmation(session, true, source, phone);
            await this.saveSession(sessionId, result.session);
            messages.push(...this.resultToMessages(result));
            return {
                messages,
                session_active: result.session.state !== 'completed',
                matching_phase: result.session.state === 'awaiting_action',
            };
        }

        if (confirmation === 'no' || text === '__edit__') {
            const result = await this.core.handleConfirmation(session, false, source, phone);
            await this.saveSession(sessionId, result.session);
            const progress = await this.core.calculateProgress(result.session);
            messages.push(...this.resultToMessages(result, progress));
            return { messages, session_active: true, progress };
        }

        messages.push(this.makeMessage(
            'assistant',
            'Please click "Confirm & Find Properties" to proceed or "Edit Requirements" to modify.',
            'text',
        ));
        return { messages, session_active: true };
    }

    // ─── Matching Phase Action Handling ──────────────────────────────────────

    private async handleActionMessage(
        sessionId: string,
        session: BuyerSession,
        text: string,
        messages: ChatMessage[],
        source: 'web' | 'admin',
    ): Promise<BuyerChatMessageResponse> {
        // Map text input to known actions
        const normalizedAction = this.normalizeAction(text);

        if (normalizedAction === '__done__') {
            session.state = 'completed';
            await this.saveSession(sessionId, session);
            messages.push(this.makeMessage(
                'assistant',
                'Thank you for using Realty Pandit! We\'ll notify you when new matching properties become available.',
                'success',
            ));
            return { messages, session_active: false };
        }

        const result = await this.core.handleAction(session, normalizedAction, source);
        await this.saveSession(sessionId, result.session);
        messages.push(...this.resultToMessages(result));

        const active = result.session.state !== 'completed';
        return {
            messages,
            session_active: active,
            matching_phase: result.session.state === 'awaiting_action' || result.session.state === 'matching',
        };
    }

    private normalizeAction(text: string): string {
        const lower = text.toLowerCase().trim();

        // Quick reply values (pass through)
        if (lower.startsWith('__') && lower.endsWith('__')) return lower;

        // Natural language mappings
        if (/^(next|more|aur|aur dikhao|show more|agli|next property)$/i.test(lower)) return '__next_property__';
        if (/^(schedule|book|visit|dekhna|milna|schedule visit|book visit)$/i.test(lower)) return '__schedule_visit__';
        if (/^(change|badlo|modify|edit|change requirements)$/i.test(lower)) return '__change_requirements__';
        if (/^(done|bas|finish|khatam|no more|enough)$/i.test(lower)) return '__done__';
        if (/^(back|wapas|peeche)$/i.test(lower)) return '__back_to_property__';

        return lower;
    }

    // ─── Message Builders ────────────────────────────────────────────────────

    private resultToMessages(
        result: BuyerProcessResult,
        progress?: { current: number; total: number; group: string },
    ): ChatMessage[] {
        const messages: ChatMessage[] = [];

        switch (result.action) {
            case 'next_step':
            case 'went_back':
            case 'skipped':
            case 'requirements_changed':
                if (result.step) {
                    messages.push(this.makeStepMessage(result.step, result.options || [], progress, result.metadata));
                }
                if (result.action === 'requirements_changed') {
                    messages.unshift(this.makeMessage('assistant', 'Let\'s update your requirements. Starting from the beginning.', 'system'));
                }
                break;

            case 'summary':
                if (result.summary) {
                    messages.push(this.makeSummaryMessage(result.summary, result.quick_replies));
                }
                break;

            case 'property_card':
                if (result.property) {
                    messages.push(this.makePropertyCardMessage(
                        result.property,
                        result.match_index || 0,
                        result.total_available || 0,
                        result.quick_replies,
                        result.metadata,
                    ));
                }
                break;

            case 'no_matches':
            case 'no_more_properties':
                messages.push(this.makeMessage(
                    'assistant',
                    result.metadata?.message || 'No more matching properties available. We\'ll notify you when new listings arrive!',
                    'system',
                    undefined,
                    undefined,
                    [{ label: 'Change Requirements', value: '__change_requirements__' }],
                ));
                break;

            case 'committed':
                messages.push(this.makeMessage('assistant', 'Requirements saved! Let me find matching properties for you...', 'system'));
                break;

            case 'validation_error':
                messages.push(this.makeMessage('assistant', result.error || 'Invalid input.', 'error'));
                if (result.step) {
                    messages.push(this.makeStepMessage(result.step, result.options || [], progress));
                }
                break;

            case 'parse_error':
                messages.push(this.makeMessage(
                    'assistant',
                    result.error || 'Could not understand your answer. Please try again.',
                    'error',
                    undefined,
                    undefined,
                    result.quick_replies,
                ));
                break;

            case 'cancelled':
                messages.push(this.makeMessage('assistant', 'Property search cancelled.', 'system'));
                break;

            case 'session_expired':
                messages.push(this.makeMessage('assistant', 'Your session expired due to inactivity. Please start a new search.', 'error'));
                break;

            case 'auto_cancelled':
                messages.push(this.makeMessage('assistant', 'Session cancelled due to too many errors. Please start fresh.', 'error'));
                break;

            case 'visit_booked':
                messages.push(this.makeMessage('assistant', 'Visit booked successfully!', 'success'));
                break;
        }

        return messages;
    }

    private makePropertyCardMessage(
        property: any,
        matchIndex: number,
        totalAvailable: number,
        quickReplies?: Array<{ label: string; value: string }>,
        metadata?: Record<string, any>,
    ): ChatMessage {
        const title = [property.bhk, property.type].filter(Boolean).join(' ');
        const priceStr = property.display_price_formatted || `₹${property.display_price?.toLocaleString('en-IN')}`;

        const specs: string[] = [];
        if (property.area) specs.push(property.area);
        if (property.furnishing) specs.push(property.furnishing);
        if (property.floor) specs.push(`Floor: ${property.floor}`);

        const content = [
            `${title} - ${property.location}`,
            priceStr,
            specs.length > 0 ? specs.join(' | ') : '',
            property.amenities?.length > 0 ? `Amenities: ${property.amenities.join(', ')}` : '',
            property.match_score ? `Match: ${Math.round(property.match_score)}%` : '',
        ].filter(Boolean).join('\n');

        return {
            id: uuidv4(),
            role: 'assistant',
            content,
            timestamp: new Date().toISOString(),
            type: 'property_card' as any,
            quick_replies: quickReplies || [
                { label: 'Schedule Visit', value: '__schedule_visit__' },
                { label: 'Next Property', value: '__next_property__' },
                { label: 'Change Requirements', value: '__change_requirements__' },
            ],
            metadata: {
                property,
                match_index: matchIndex,
                total_available: totalAvailable,
                booking_mode: metadata?.booking_mode,
                property_id: metadata?.property_id || property.property_id,
            } as any,
        };
    }

    private makeSummaryMessage(
        summary: Record<string, any>,
        quickReplies?: Array<{ label: string; value: string }>,
    ): ChatMessage {
        return {
            id: uuidv4(),
            role: 'assistant',
            content: 'Here\'s a summary of your requirements. Please review and confirm.',
            timestamp: new Date().toISOString(),
            type: 'summary',
            step_id: 'buyer_summary',
            input_type: 'confirm',
            quick_replies: quickReplies || [
                { label: 'Confirm & Find Properties', value: '__confirm__' },
                { label: 'Edit Requirements', value: '__edit__' },
            ],
            metadata: { summary: summary as Record<string, string> },
        };
    }

    private makeStepMessage(
        step: WorkflowStep,
        options: StepOption[],
        progress?: { current: number; total: number; group: string },
        metadata?: Record<string, any>,
    ): ChatMessage {
        const quickReplies = this.buildQuickReplies(step, options);
        const msgMetadata: ChatMessage['metadata'] = { progress };

        if (options.length > 0) {
            msgMetadata!.options = options.map(o => ({ value: o.value, label: o.label }));
        }
        if (metadata?.address_config) {
            msgMetadata!.address_config = metadata.address_config;
        }

        const question = step.question_hi
            ? `${step.question}\n${step.question_hi}`
            : step.question;

        return {
            id: uuidv4(),
            role: 'assistant',
            content: question,
            timestamp: new Date().toISOString(),
            type: 'question',
            step_id: step.id,
            input_type: step.input_type,
            quick_replies: quickReplies.length > 0 ? quickReplies : undefined,
            metadata: msgMetadata,
        };
    }

    private buildQuickReplies(step: WorkflowStep, options: StepOption[]): QuickReply[] {
        if ((step.input_type === 'radio' || step.input_type === 'dropdown') && options.length > 0 && options.length <= 8) {
            return options.map(o => ({ label: o.label, value: o.value }));
        }
        return [];
    }

    private makeMessage(
        role: 'assistant' | 'user',
        content: string,
        type: ChatMessage['type'],
        stepId?: string,
        inputType?: string,
        quickReplies?: QuickReply[],
        metadata?: ChatMessage['metadata'],
    ): ChatMessage {
        return {
            id: uuidv4(),
            role,
            content,
            timestamp: new Date().toISOString(),
            type,
            step_id: stepId,
            input_type: inputType,
            quick_replies: quickReplies,
            metadata,
        };
    }

    // ─── Session Persistence ─────────────────────────────────────────────────

    private async loadSession(sessionId: string): Promise<BuyerSession | null> {
        const record = await prisma.chatWorkflowSession.findFirst({
            where: { id: sessionId, active: true, workflow: 'buyer_intake' },
        });

        if (!record) return null;

        const ctx = record.context as any;
        return {
            workflow: 'buyer_intake',
            state: ctx.state || 'in_progress',
            answers: ctx.answers || {},
            current_step_id: ctx.current_step_id || null,
            current_step_options: ctx.current_step_options,
            failed_attempts: ctx.failed_attempts || 0,
            started_at: ctx.started_at || record.created_at.toISOString(),
            last_activity_at: ctx.last_activity_at || record.updated_at.toISOString(),
            matching_state: ctx.matching_state,
            committed_phone: ctx.committed_phone,
            committed_tx_id: ctx.committed_tx_id,
        };
    }

    private async saveSession(sessionId: string, session: BuyerSession): Promise<void> {
        const context = {
            answers: session.answers,
            current_step_id: session.current_step_id,
            current_step_options: session.current_step_options || [],
            failed_attempts: session.failed_attempts || 0,
            state: session.state,
            started_at: session.started_at,
            last_activity_at: session.last_activity_at,
            matching_state: session.matching_state,
            committed_phone: session.committed_phone,
            committed_tx_id: session.committed_tx_id,
        };

        const existing = await prisma.chatWorkflowSession.findUnique({
            where: { id: sessionId },
        });

        if (existing) {
            await prisma.chatWorkflowSession.update({
                where: { id: sessionId },
                data: { state: session.state, context: context as any },
            });
        } else {
            await prisma.chatWorkflowSession.create({
                data: {
                    id: sessionId,
                    workflow: 'buyer_intake',
                    state: session.state,
                    context: context as any,
                    active: true,
                },
            });
        }
    }

    private async endSession(sessionId: string): Promise<void> {
        await prisma.chatWorkflowSession.updateMany({
            where: { id: sessionId, active: true },
            data: { active: false },
        });
    }
}
