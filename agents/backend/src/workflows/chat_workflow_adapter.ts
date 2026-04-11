/**
 * Chat Workflow Adapter
 *
 * HTTP API adapter for the conversational workflow.
 * Wraps ConversationalWorkflowCore + NLUParser to provide
 * a REST API for the web/admin chat UI.
 *
 * Uses ConversationSession (workflow='chat_inventory') for persistence.
 */

import { v4 as uuidv4 } from 'uuid';
import prisma from '../db';
import logger from '../utils/logger';
import { phoneVariants } from '../utils/phone';
import {
    ConversationalWorkflowCore,
    ConversationalSession,
    ProcessResult,
} from './conversational_workflow_core';
import { NLUParser } from './nlu_parser';
import { WorkflowStep, StepOption } from './workflow_types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QuickReply {
    label: string;
    value: string;
}

export interface ChatMessage {
    id: string;
    role: 'assistant' | 'user';
    content: string;
    timestamp: string;
    type: 'text' | 'question' | 'summary' | 'success' | 'error' | 'system';
    step_id?: string;
    input_type?: string;
    quick_replies?: QuickReply[];
    metadata?: {
        options?: Array<{ value: string; label: string }>;
        secondary_options?: Array<{ value: string; label: string }>;
        summary?: Record<string, string>;
        media_count?: number;
        doc_count?: number;
        inventory_id?: string;
        progress?: { current: number; total: number; group: string };
        address_config?: any;
        document_types?: Array<{ value: string; label: string }>;
    };
}

export interface ChatStartResponse {
    session_id: string;
    messages: ChatMessage[];
}

export interface ChatMessageResponse {
    messages: ChatMessage[];
    session_active: boolean;
    progress?: { current: number; total: number; group: string };
}

export interface ChatUploadResponse {
    messages: ChatMessage[];
    urls: string[];
}

// ─── Document Types (for document upload step) ──────────────────────────────

const DOCUMENT_TYPES = [
    { value: 'title_deed', label: 'Title Deed' },
    { value: 'noc', label: 'NOC' },
    { value: 'layout_plan', label: 'Layout Plan' },
    { value: 'sale_agreement', label: 'Sale Agreement' },
    { value: 'encumbrance', label: 'Encumbrance Certificate' },
    { value: 'tax_receipt', label: 'Tax Receipt' },
    { value: 'other', label: 'Other' },
];

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class ChatWorkflowAdapter {
    private core: ConversationalWorkflowCore;
    private nlu: NLUParser;

    constructor() {
        this.core = new ConversationalWorkflowCore();
        this.nlu = new NLUParser();
    }

    /**
     * Start a new chat workflow session.
     */
    async startSession(existingSessionId?: string, source: 'web' | 'admin' = 'web'): Promise<ChatStartResponse> {
        // If an existing session is provided, try to resume it
        if (existingSessionId) {
            const existing = await this.loadSession(existingSessionId);
            if (existing) {
                const step = existing.current_step_id
                    ? this.core.getStepDefinition(existing.current_step_id)
                    : null;
                const progress = await this.core.calculateProgress(existing);
                const messages: ChatMessage[] = [
                    this.makeMessage('assistant', 'Welcome back! Let\'s continue listing your property.', 'system'),
                ];
                if (step) {
                    const options = await this.core.ensureOptions(existing);
                    messages.push(this.makeStepMessage(step, options, progress));
                }
                return { session_id: existingSessionId, messages };
            }
        }

        // Create new session
        const result = await this.core.startSession('chat_inventory', source);
        const sessionId = uuidv4();

        if (result.action === 'cancelled' || !result.step) {
            return {
                session_id: sessionId,
                messages: [this.makeMessage('assistant', 'Unable to start workflow. Please try again later.', 'error')],
            };
        }

        // Save to DB
        await this.saveSession(sessionId, result.session);

        const progress = await this.core.calculateProgress(result.session);
        const messages: ChatMessage[] = [
            this.makeMessage(
                'assistant',
                'Namaste! I\'m Panditji, your property listing assistant. Let\'s list your property step by step. You can type naturally or use the buttons below.',
                'system',
            ),
            this.makeStepMessage(result.step, result.options || [], progress, result.metadata),
        ];

        return { session_id: sessionId, messages };
    }

    /**
     * Handle a text message from the user.
     */
    async handleMessage(
        sessionId: string,
        text?: string,
        quickReplyValue?: string,
    ): Promise<ChatMessageResponse> {
        const session = await this.loadSession(sessionId);
        if (!session) {
            return {
                messages: [this.makeMessage('assistant', 'Session not found or expired. Please start a new listing.', 'error')],
                session_active: false,
            };
        }

        // Check expiry
        if (this.core.isExpired(session)) {
            await this.endSession(sessionId);
            return {
                messages: [this.makeMessage('assistant', 'Your session expired due to inactivity. Please start a new listing.', 'error')],
                session_active: false,
            };
        }

        const messages: ChatMessage[] = [];

        // Echo user message
        if (text) {
            messages.push(this.makeMessage('user', text, 'text'));
        } else if (quickReplyValue) {
            // Find the label for the quick reply
            const step = this.core.getStepDefinition(session.current_step_id || '');
            const options = session.current_step_options || [];
            const matchedOpt = options.find(o => o.value === quickReplyValue);
            messages.push(this.makeMessage('user', matchedOpt?.label || quickReplyValue, 'text'));
        }

        // Handle based on current state
        if (session.state === 'awaiting_confirm') {
            return this.handleConfirmMessage(sessionId, session, text || quickReplyValue || '', messages);
        }

        if (session.state === 'awaiting_media' || session.state === 'awaiting_documents') {
            // Text commands during media/doc collection
            const cmd = (text || quickReplyValue || '').toLowerCase().trim();
            if (cmd === 'done' || cmd === '__done__' || quickReplyValue === '__done__') {
                const result = session.state === 'awaiting_media'
                    ? await this.core.finishMediaCollection(session)
                    : await this.core.finishDocumentCollection(session);
                await this.saveSession(sessionId, result.session);
                const progress = await this.core.calculateProgress(result.session);
                messages.push(...await this.resultToMessages(result, progress));
                return { messages, session_active: result.action !== 'committed', progress };
            }
            if (cmd === 'skip' || cmd === '__skip__' || quickReplyValue === '__skip__') {
                if (session.state === 'awaiting_media') {
                    session.pending_media = [];
                } else {
                    session.pending_docs = [];
                }
                // Store __skip__ as the answer so group-skip logic in getNextStep works
                const currentStepId = session.current_step_id;
                if (currentStepId) {
                    const stepDef = this.core.getStepDefinition(currentStepId);
                    if (stepDef) {
                        session.answers = { ...session.answers, [stepDef.field]: '__skip__' };
                    }
                }
                session.state = 'in_progress';
                const result = await this.core.advanceToNext(session);
                await this.saveSession(sessionId, result.session);
                const progress = await this.core.calculateProgress(result.session);
                messages.push(...await this.resultToMessages(result, progress));
                return { messages, session_active: true, progress };
            }
            // Otherwise, the upload is handled by handleUpload endpoint
            messages.push(this.makeMessage('assistant', 'Please upload files using the upload button, or type "done" when finished.', 'text'));
            return { messages, session_active: true };
        }

        if (session.state === 'awaiting_multi_select') {
            return this.handleMultiSelectMessage(sessionId, session, text || quickReplyValue || '', quickReplyValue, messages);
        }

        // Normal in_progress state — parse input
        let result: ProcessResult;

        if (quickReplyValue) {
            // Quick reply bypasses NLU — direct structured value
            // For address_block / owner_block / uploader_block: parse JSON objects
            let parsedValue: any = quickReplyValue;
            const currentStep = this.core.getStepDefinition(session.current_step_id || '');
            if (currentStep && ['address_block', 'owner_block', 'uploader_block'].includes(currentStep.input_type)) {
                try {
                    const obj = JSON.parse(quickReplyValue);
                    if (typeof obj === 'object' && obj !== null) parsedValue = obj;
                } catch { /* Not JSON, use as-is */ }
            }
            result = await this.core.processInput(session, { value: parsedValue }, 'answer');
        } else if (text) {
            // Get current step for NLU context
            const step = this.core.getStepDefinition(session.current_step_id || '');
            if (!step) {
                return {
                    messages: [this.makeMessage('assistant', 'Step not found. Please start a new listing.', 'error')],
                    session_active: false,
                };
            }

            const options = await this.core.ensureOptions(session);
            // Pass address context for context-aware parsing
            let addrCtx: { floor_required: boolean; plot_area_required: boolean; bhk_required: boolean } | undefined;
            if (step.input_type === 'address_block') {
                addrCtx = await this.core.getEngine().getAddressRules(session.answers);
            }
            const nluResult = await this.nlu.parse(text, step, options, addrCtx);

            if (nluResult.command) {
                result = await this.core.processInput(session, null, nluResult.command, text);
            } else if (nluResult.parsed) {
                result = await this.core.processInput(session, nluResult.parsed, 'answer', text);
            } else {
                result = await this.core.processInput(session, null, null, text);
            }
        } else {
            return {
                messages: [this.makeMessage('assistant', 'Please send a message or select an option.', 'text')],
                session_active: true,
            };
        }

        await this.saveSession(sessionId, result.session);
        const progress = await this.core.calculateProgress(result.session);
        messages.push(...await this.resultToMessages(result, progress));

        const active = result.action !== 'committed' && result.action !== 'cancelled' &&
            result.action !== 'session_expired' && result.action !== 'auto_cancelled';
        return { messages, session_active: active, progress };
    }

    /**
     * Handle media/document upload during chat.
     */
    async handleUpload(
        sessionId: string,
        type: 'photo' | 'video' | 'document',
        urls: string[],
        docMeta?: Array<{ file_name: string; mime_type: string; file_size: number }>,
    ): Promise<ChatUploadResponse> {
        const session = await this.loadSession(sessionId);
        if (!session) {
            return {
                messages: [this.makeMessage('assistant', 'Session not found.', 'error')],
                urls: [],
            };
        }

        const messages: ChatMessage[] = [];

        for (let i = 0; i < urls.length; i++) {
            if (type === 'photo') {
                await this.core.receiveMedia(session, urls[i]);
            } else if (type === 'video') {
                await this.core.receiveVideo(session, urls[i]);
            } else if (type === 'document' && docMeta && docMeta[i]) {
                await this.core.receiveDocument(session, {
                    file_url: urls[i],
                    file_name: docMeta[i].file_name,
                    mime_type: docMeta[i].mime_type,
                    file_size: docMeta[i].file_size,
                });
            }
        }

        await this.saveSession(sessionId, session);

        const count = type === 'photo' ? session.pending_media.length :
            type === 'video' ? (session.answers.videos as string[] || []).length :
                session.pending_docs.length;

        messages.push(this.makeMessage(
            'assistant',
            `${type === 'photo' ? '📸' : type === 'video' ? '🎬' : '📄'} ${urls.length} ${type}(s) uploaded (${count} total). Send more or click Done.`,
            'text',
        ));

        return { messages, urls };
    }

    /**
     * Handle confirmation (CONFIRM or EDIT).
     */
    async handleConfirm(
        sessionId: string,
        confirmed: boolean,
        agentId?: string,
    ): Promise<ChatMessageResponse> {
        const session = await this.loadSession(sessionId);
        if (!session) {
            return {
                messages: [this.makeMessage('assistant', 'Session not found.', 'error')],
                session_active: false,
            };
        }

        if (confirmed) {
            // Commit
            const source = session.answers._source === 'admin' ? 'admin' as const : 'web' as const;
            const result = await this.core.commitWorkflow(session, source, agentId);
            if (result.action === 'committed') {
                await this.endSession(sessionId);
                return {
                    messages: [
                        this.makeMessage('assistant', `Property listed successfully! Your Property ID is ${result.display_id || result.inventory_id}.`, 'success', undefined, undefined, undefined, { inventory_id: result.inventory_id, display_id: result.display_id }),
                    ],
                    session_active: false,
                };
            }
            // Error
            return {
                messages: [this.makeMessage('assistant', result.error || 'Error submitting property.', 'error')],
                session_active: true,
            };
        } else {
            // Go back
            const result = await this.core.goBack(session);
            await this.saveSession(sessionId, result.session);
            const progress = await this.core.calculateProgress(result.session);
            const messages = await this.resultToMessages(result, progress);
            return { messages, session_active: true, progress };
        }
    }

    /**
     * Get session state for reconnection.
     */
    async getSession(sessionId: string): Promise<{
        active: boolean;
        state?: string;
        step_id?: string;
        progress?: { current: number; total: number; group: string };
    }> {
        const session = await this.loadSession(sessionId);
        if (!session) return { active: false };

        if (this.core.isExpired(session)) {
            await this.endSession(sessionId);
            return { active: false };
        }

        const progress = await this.core.calculateProgress(session);
        return {
            active: true,
            state: session.state,
            step_id: session.current_step_id || undefined,
            progress,
        };
    }

    // ─── Multi-Select Handling ───────────────────────────────────────────────

    private async handleMultiSelectMessage(
        sessionId: string,
        session: ConversationalSession,
        text: string,
        quickReplyValue: string | undefined,
        messages: ChatMessage[],
    ): Promise<ChatMessageResponse> {
        const cmd = text.toLowerCase().trim();

        if (cmd === 'done' || cmd === '__done__' || quickReplyValue === '__done__') {
            const result = await this.core.finishMultiSelect(session);
            await this.saveSession(sessionId, result.session);
            const progress = await this.core.calculateProgress(result.session);
            messages.push(...await this.resultToMessages(result, progress));
            return { messages, session_active: true, progress };
        }

        if (cmd === 'skip' || cmd === '__skip__' || quickReplyValue === '__skip__') {
            session.pending_multi_select = [];
            session.state = 'in_progress';
            const result = await this.core.advanceToNext(session);
            await this.saveSession(sessionId, result.session);
            const progress = await this.core.calculateProgress(result.session);
            messages.push(...await this.resultToMessages(result, progress));
            return { messages, session_active: true, progress };
        }

        // Parse selections
        const step = this.core.getStepDefinition(session.current_step_id || '');
        const allOptions = step?.static_options
            ? step.static_options.map(o => ({ value: o.value, label: o.label }))
            : (session.current_step_options || []);

        const newSelections: string[] = [];

        if (quickReplyValue) {
            // Toggle: if already selected, remove; else add
            const current = session.pending_multi_select || [];
            if (current.includes(quickReplyValue)) {
                session.pending_multi_select = current.filter(v => v !== quickReplyValue);
                await this.saveSession(sessionId, session);
                const progress = await this.core.calculateProgress(session);
                messages.push(this.makeMultiSelectMessage(step!, allOptions, session.pending_multi_select, progress));
                return { messages, session_active: true, progress };
            }
            newSelections.push(quickReplyValue);
        } else {
            // Parse comma-separated text
            const items = text.split(/[,;]+/).map(s => s.trim().toLowerCase());
            for (const item of items) {
                const num = parseInt(item);
                if (!isNaN(num) && num >= 1 && num <= allOptions.length) {
                    newSelections.push(allOptions[num - 1].value);
                } else {
                    const match = allOptions.find(o =>
                        o.value.toLowerCase() === item || o.label.toLowerCase().includes(item),
                    );
                    if (match) newSelections.push(match.value);
                }
            }
        }

        if (newSelections.length > 0) {
            const result = await this.core.processMultiSelect(session, newSelections);
            await this.saveSession(sessionId, result.session);

            if (result.action === 'next_step' || result.action === 'summary') {
                const progress = await this.core.calculateProgress(result.session);
                messages.push(...await this.resultToMessages(result, progress));
                return { messages, session_active: true, progress };
            }

            // Show updated selection
            const progress = await this.core.calculateProgress(result.session);
            messages.push(this.makeMultiSelectMessage(step!, allOptions, result.multi_select_current || [], progress));
            return { messages, session_active: true, progress };
        }

        messages.push(this.makeMessage('assistant', 'Select options using the buttons or type numbers (e.g., 1,3,5). Click Done when finished.', 'text'));
        return { messages, session_active: true };
    }

    // ─── Confirmation Handling ───────────────────────────────────────────────

    private async handleConfirmMessage(
        sessionId: string,
        session: ConversationalSession,
        text: string,
        messages: ChatMessage[],
    ): Promise<ChatMessageResponse> {
        const confirmation = this.nlu.parseConfirmation(text);

        if (confirmation === 'yes') {
            return this.handleConfirm(sessionId, true);
        }
        if (confirmation === 'no') {
            return this.handleConfirm(sessionId, false);
        }

        messages.push(this.makeMessage('assistant', 'Please click Confirm to submit or Edit to modify your listing.', 'text'));
        return { messages, session_active: true };
    }

    // ─── Message Builders ────────────────────────────────────────────────────

    private async resultToMessages(
        result: ProcessResult,
        progress?: { current: number; total: number; group: string },
    ): ChatMessage[] {
        const messages: ChatMessage[] = [];

        switch (result.action) {
            case 'next_step':
            case 'went_back':
            case 'skipped':
                if (result.step) {
                    // confirm_create step → build summary and show as summary message
                    if (result.step.id === 'confirm_create' && result.session) {
                        try {
                            const summary = await this.core.getEngine().buildSummary(result.session.answers);
                            messages.push({
                                id: uuidv4(),
                                role: 'assistant',
                                content: result.step.question + (result.step.question_hi ? '\n' + result.step.question_hi : ''),
                                timestamp: new Date().toISOString(),
                                type: 'summary',
                                step_id: 'confirm_create',
                                input_type: 'confirm',
                                quick_replies: [
                                    { label: 'Confirm ✅', value: '__confirm_yes__' },
                                    { label: 'Go Back & Edit ✏️', value: '__confirm_no__' },
                                ],
                                metadata: { summary: summary as Record<string, string>, progress },
                            });
                        } catch (err) {
                            logger.error('[ChatWorkflowAdapter] Error building summary for confirm_create:', err);
                            messages.push(this.makeStepMessage(result.step, result.options || [], progress, result.metadata));
                        }
                    } else {
                        messages.push(this.makeStepMessage(result.step, result.options || [], progress, result.metadata));
                    }
                }
                break;

            case 'summary':
                if (result.summary) {
                    messages.push({
                        id: uuidv4(),
                        role: 'assistant',
                        content: 'Here\'s a summary of your property listing. Please review and confirm.',
                        timestamp: new Date().toISOString(),
                        type: 'summary',
                        step_id: 'summary_confirmation',
                        input_type: 'confirm',
                        quick_replies: [
                            { label: 'Confirm ✅', value: '__confirm_yes__' },
                            { label: 'Go Back & Edit ✏️', value: '__confirm_no__' },
                        ],
                        metadata: { summary: result.summary as Record<string, string>, progress },
                    });
                }
                break;

            case 'validation_error':
                messages.push(this.makeMessage('assistant', `${result.error || 'Invalid input.'}`, 'error'));
                // Re-show the current step
                if (result.step) {
                    messages.push(this.makeStepMessage(result.step, result.options || [], progress, result.metadata));
                }
                break;

            case 'parse_error':
                messages.push(this.makeMessage('assistant', result.error || 'Could not understand your answer. Please try again.', 'error'));
                break;

            case 'committed':
                messages.push(this.makeMessage('assistant', `Property listed successfully! Your Property ID is ${result.inventory_id}.`, 'success', undefined, undefined, undefined, { inventory_id: result.inventory_id }));
                break;

            case 'cancelled':
                messages.push(this.makeMessage('assistant', 'Property listing cancelled.', 'system'));
                break;

            case 'session_expired':
                messages.push(this.makeMessage('assistant', 'Your session expired due to inactivity. Please start a new listing.', 'error'));
                break;

            case 'auto_cancelled':
                messages.push(this.makeMessage('assistant', 'Session cancelled due to too many errors. Please start fresh.', 'error'));
                break;

            case 'media_received':
                messages.push(this.makeMessage('assistant', `Media received (${result.media_count} total). Send more or click Done.`, 'text'));
                break;

            case 'doc_received':
                messages.push(this.makeMessage('assistant', `Document received (${result.doc_count} total). Send more or click Done.`, 'text'));
                break;
        }

        return messages;
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
        if (step.secondary_options) {
            msgMetadata!.secondary_options = step.secondary_options;
        }
        if (metadata?.address_config) {
            msgMetadata!.address_config = metadata.address_config;
        }
        if (step.input_type === 'document_upload') {
            msgMetadata!.document_types = DOCUMENT_TYPES;
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
        // Radio / Dropdown → buttons (website wraps in flex grid, handles any count)
        if ((step.input_type === 'radio' || step.input_type === 'dropdown') && options.length > 0) {
            return options.map(o => ({ label: o.label, value: o.value }));
        }

        // Media upload → Skip/Done
        if (step.input_type === 'media_upload' || step.input_type === 'video_upload') {
            return [
                { label: 'Done ✅', value: '__done__' },
                { label: 'Skip ⏩', value: '__skip__' },
            ];
        }

        // Document upload → Skip/Done
        if (step.input_type === 'document_upload') {
            return [
                { label: 'Done ✅', value: '__done__' },
                { label: 'Skip ⏩', value: '__skip__' },
            ];
        }

        return [];
    }

    private makeMultiSelectMessage(
        step: WorkflowStep,
        allOptions: StepOption[],
        selected: string[],
        progress?: { current: number; total: number; group: string },
    ): ChatMessage {
        const selectedLabels = allOptions
            .filter(o => selected.includes(o.value))
            .map(o => o.label);

        const content = selectedLabels.length > 0
            ? `${step.question}\n\nSelected: ${selectedLabels.join(', ')}`
            : step.question;

        const quickReplies: QuickReply[] = allOptions.map(o => ({
            label: `${selected.includes(o.value) ? '✅ ' : ''}${o.label}`,
            value: o.value,
        }));
        quickReplies.push({ label: 'Done ✅', value: '__done__' });

        return {
            id: uuidv4(),
            role: 'assistant',
            content,
            timestamp: new Date().toISOString(),
            type: 'question',
            step_id: step.id,
            input_type: 'multi_select',
            quick_replies: quickReplies,
            metadata: {
                options: allOptions.map(o => ({ value: o.value, label: o.label })),
                progress,
            },
        };
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

    private async loadSession(sessionId: string): Promise<ConversationalSession | null> {
        const record = await prisma.chatWorkflowSession.findFirst({
            where: { id: sessionId, active: true, workflow: 'chat_inventory' },
        });

        if (!record) return null;

        const ctx = record.context as any;
        return {
            workflow: 'chat_inventory',
            state: ctx.state || 'in_progress',
            answers: ctx.answers || {},
            current_step_id: ctx.current_step_id || null,
            current_step_options: ctx.current_step_options,
            pending_media: ctx.pending_media || [],
            pending_docs: ctx.pending_docs || [],
            pending_multi_select: ctx.pending_multi_select || [],
            failed_attempts: ctx.failed_attempts || 0,
            started_at: ctx.started_at || record.created_at.toISOString(),
            last_activity_at: ctx.last_activity_at || record.updated_at.toISOString(),
        };
    }

    private async saveSession(sessionId: string, session: ConversationalSession): Promise<void> {
        const context = {
            answers: session.answers,
            current_step_id: session.current_step_id,
            current_step_options: session.current_step_options || [],
            pending_media: session.pending_media,
            pending_docs: session.pending_docs,
            pending_multi_select: session.pending_multi_select || [],
            failed_attempts: session.failed_attempts || 0,
            state: session.state,
            started_at: session.started_at,
            last_activity_at: session.last_activity_at,
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
                    workflow: 'chat_inventory',
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
