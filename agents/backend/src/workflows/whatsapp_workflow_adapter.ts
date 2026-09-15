/**
 * WhatsApp Workflow Adapter
 *
 * Platform adapter that renders the unified workflow engine as
 * WhatsApp interactive messages (buttons, lists, text prompts).
 * Manages per-user workflow sessions in ConversationSession.
 *
 * Delegates core workflow logic (step navigation, validation, media
 * accumulation, confirmation) to ConversationalWorkflowCore.
 *
 * Rendering rules:
 * - dropdown ≤ 3 options → WhatsApp buttons
 * - dropdown 4-10 options → WhatsApp list message
 * - dropdown > 10 options → numbered text + text reply parsing
 * - radio → buttons
 * - multi_select → text prompt (comma-separated)
 * - number/text/textarea → plain text prompt
 * - media_upload → "Send photos, type 'done' when finished"
 * - document_upload → "Send documents, type 'done' when finished"
 * - confirm → summary + YES/NO buttons
 */

import { WorkflowStep, StepOption, WorkflowAnswer } from './workflow_types';
import { ConversationalWorkflowCore, ConversationalSession, ProcessResult } from './conversational_workflow_core';
import { NLUParser } from './nlu_parser';
import { WhatsAppService } from '../services/whatsapp';
import { StorageService } from '../services/storage';
import prisma from '../db';
import logger from '../utils/logger';
import { phoneVariants } from '../utils/phone';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WhatsAppWorkflowSession {
    workflow: 'inventory_v2';
    state: 'in_progress' | 'awaiting_media' | 'awaiting_documents' | 'awaiting_confirm' | 'awaiting_multi_select';
    answers: WorkflowAnswer;
    current_step_id: string | null;
    current_step_options?: StepOption[];
    pending_media: string[];  // Accumulated photo URLs during media collection
    pending_docs: Array<{ file_url: string; file_name: string; mime_type: string; file_size: number }>;
    pending_multi_select?: string[];  // Accumulated selections for multi_select steps
    failed_attempts: number;  // Track consecutive failed parse attempts on current step
    started_at: string;
}

export interface WhatsAppIncomingMessage {
    from: string;
    type: 'text' | 'image' | 'document' | 'video' | 'interactive' | 'button';
    text?: { body: string };
    image?: { id: string; mime_type?: string; caption?: string };
    document?: { id: string; mime_type?: string; filename?: string };
    video?: { id: string; mime_type?: string; caption?: string };
    interactive?: {
        type: 'button_reply' | 'list_reply';
        button_reply?: { id: string; title: string };
        list_reply?: { id: string; title: string };
    };
    button?: { text: string; payload: string };
}

export interface WhatsAppOutgoingMessage {
    type: 'text' | 'interactive_buttons' | 'interactive_list';
    to: string;
    text?: string;
    interactive?: any;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class WhatsAppWorkflowAdapter {
    private core: ConversationalWorkflowCore;
    private whatsapp: WhatsAppService;
    private storage: StorageService;
    private nlu: NLUParser;

    constructor() {
        this.core = new ConversationalWorkflowCore();
        this.whatsapp = new WhatsAppService();
        this.storage = new StorageService();
        this.nlu = new NLUParser();
    }

    /**
     * Start a new inventory workflow session for a WhatsApp user.
     * Returns the first step as a WhatsApp message.
     */
    async startSession(phone: string): Promise<void> {
        // DEDUP: Deactivate ALL existing active sessions for this phone (strict no-duplicate rule)
        await prisma.conversationSession.updateMany({
            where: { phone_number: phone, active: true },
            data: { active: false },
        });

        const result = await this.core.startSession('inventory_v2', 'whatsapp');

        if (result.action === 'cancelled' || !result.step) {
            await this.whatsapp.sendText(phone, 'Workflow configuration error. Please try again later.');
            return;
        }

        // Convert core session to WhatsApp session format and save
        await this.saveSession(phone, this.coreToWaSession(result.session));

        // Conversational greeting
        await this.whatsapp.sendText(phone,
            '🙏 *Namaste! I am Panditji, your property listing assistant.*\n\n' +
            'Let us list your property together — I will ask simple questions one by one.\n\n' +
            'Aap naturally likh sakte hain — Hindi, English, ya Hinglish mein.\n' +
            'Commands: *back* / *skip* / *cancel*'
        );

        await this.sendStep(phone, result.step, result.options || [], result.session.answers);
    }

    /**
     * Handle an incoming WhatsApp message within an active workflow session.
     */
    async handleMessage(phone: string, msg: WhatsAppIncomingMessage, sessionData: WhatsAppWorkflowSession): Promise<void> {
        try {
            // PERF: Skip empty/non-actionable messages immediately
            const rawText = this.extractText(msg).trim();
            const hasMedia = msg.type === 'image' || msg.type === 'document' || msg.type === 'video';
            if (!rawText && !hasMedia) {
                logger.info(`[WhatsAppWorkflow] Ignoring empty message from ${phone} (type: ${msg.type})`);
                return;
            }

            const { state, current_step_id, answers } = sessionData;
            const coreSession = this.waToCoreSession(sessionData);

            // Handle media collection state
            if (state === 'awaiting_media') {
                await this.handleMediaCollection(phone, msg, sessionData);
                return;
            }

            // Handle document collection state
            if (state === 'awaiting_documents') {
                await this.handleDocumentCollection(phone, msg, sessionData);
                return;
            }

            // Handle confirmation state
            if (state === 'awaiting_confirm') {
                await this.handleConfirmation(phone, msg, sessionData);
                return;
            }

            // Handle multi-select iterative selection state
            if (state === 'awaiting_multi_select') {
                await this.handleMultiSelectCollection(phone, msg, sessionData);
                return;
            }

            // FIX 6: When user sends photo/doc during a non-media step, give guidance
            if (!rawText && hasMedia && state === 'in_progress') {
                await this.whatsapp.sendText(phone,
                    '📷 I received your file, but I need a text answer for this step.\n\nPlease type your answer or type "skip" to skip.'
                );
                return;
            }

            if (!current_step_id) {
                await this.whatsapp.sendText(phone, 'No active step. Type "property" to start over.');
                return;
            }

            // Get step definition
            const currentStep = this.core.getStepDefinition(current_step_id);
            if (!currentStep) {
                await this.whatsapp.sendText(phone, 'Step not found. Type "property" to start over.');
                return;
            }

            // Ensure options are available for dropdown/radio steps
            let stepOptions = sessionData.current_step_options || [];
            if (stepOptions.length === 0 &&
                (currentStep.input_type === 'dropdown' || currentStep.input_type === 'radio') &&
                (currentStep.options_source === 'dynamic' || currentStep.options_source === 'filtered' || currentStep.options_source === 'static')) {
                const engine = this.core.getEngine();
                stepOptions = await engine.getStepOptions(currentStep, sessionData.answers);
                if (stepOptions.length > 0) {
                    sessionData.current_step_options = stepOptions;
                    await this.saveSession(phone, sessionData);
                    logger.info(`[WhatsAppWorkflow] Re-fetched ${stepOptions.length} options for step ${currentStep.id}`);
                } else {
                    logger.warn(`[WhatsAppWorkflow] Step ${currentStep.id} expects options but none available from DB`);
                }
            }

            // ── Fast path: WhatsApp button/list reply → direct value (skip NLU) ──
            const interactiveId = this.extractInteractiveId(msg);

            // Handle media skip/upload buttons
            if (interactiveId === '__skip__' && currentStep.allow_group_skip) {
                const prevGroup = currentStep.group;
                const result = await this.core.processInput(coreSession, { value: '__skip__' }, 'answer', rawText);
                await this.saveSession(phone, this.coreToWaSession(result.session));
                await this.renderResult(phone, result, prevGroup);
                return;
            }
            if (interactiveId === 'upload_now' && (currentStep.input_type === 'media_upload' || currentStep.input_type === 'video_upload')) {
                // User chose to upload — show the normal upload prompt
                const mediaType = currentStep.input_type === 'media_upload' ? 'photos' : 'videos';
                const emoji = currentStep.input_type === 'media_upload' ? '📸' : '🎬';
                await this.whatsapp.sendText(phone,
                    `${emoji} Send your property ${mediaType} now.\n\nType *done* when finished, or *skip* to skip.`
                );
                return;
            }

            if (interactiveId) {
                const matched = stepOptions.find(o => o.value === interactiveId);
                if (matched) {
                    const prevGroup = currentStep.group;
                    const result = await this.core.processInput(coreSession, { value: matched.value }, 'answer', rawText);
                    await this.saveSession(phone, this.coreToWaSession(result.session));
                    await this.renderResult(phone, result, prevGroup);
                    return;
                }
            }

            // ── NLU parsing for text input (handles all step types + commands) ──
            // Pass address context for context-aware address parsing
            let addrCtx: { floor_required: boolean; plot_area_required: boolean; bhk_required: boolean } | undefined;
            if (currentStep.input_type === 'address_block') {
                addrCtx = await this.core.getEngine().getAddressRules(coreSession.answers);
            }
            const nluResult = await this.nlu.parse(rawText, currentStep, stepOptions, addrCtx);

            // Handle commands: back, skip, cancel, done
            if (nluResult.command) {
                if (nluResult.command === 'cancel') {
                    await this.cancelSession(phone);
                    return;
                }
                if (nluResult.command === 'skip' && currentStep.required) {
                    await this.whatsapp.sendText(phone,
                        `⚠️ Yeh step (*${currentStep.question}*) *required* hai, skip nahi kar sakte.\n\nPlease answer karein ya "cancel" type karein.`
                    );
                    return;
                }
                const result = await this.core.processInput(coreSession, null, nluResult.command, rawText);
                await this.saveSession(phone, this.coreToWaSession(result.session));
                await this.renderResult(phone, result, currentStep.group);
                return;
            }

            // NLU successfully parsed input
            if (nluResult.parsed) {
                const prevGroup = currentStep.group;
                const result = await this.core.processInput(coreSession, nluResult.parsed, 'answer', rawText);

                // Contact lookup: when uploader_phone is answered, resolve name from DB
                if (current_step_id === 'uploader_phone' && result.session?.answers?.uploader_phone) {
                    const inputPhone = String(result.session.answers.uploader_phone).replace(/\D/g, '').slice(-10);
                    const variants = phoneVariants('+91' + inputPhone);
                    const foundAgent = await prisma.agent.findFirst({
                        where: { phone: { in: variants }, status: 'active' },
                        select: { name: true },
                    });
                    const foundContact = !foundAgent ? await prisma.contact.findFirst({
                        where: { phone_number: { in: variants } },
                        select: { name: true },
                    }) : null;
                    const resolvedName = foundAgent?.name || foundContact?.name;
                    if (resolvedName) {
                        result.session.answers.uploader_name = resolvedName;
                        await this.whatsapp.sendText(phone, `✅ Contact found: *${resolvedName}*`);
                        logger.info(`[WhatsAppWorkflow] Auto-resolved name "${resolvedName}" for phone ${inputPhone}`);
                    }
                }

                await this.saveSession(phone, this.coreToWaSession(result.session));
                await this.renderResult(phone, result, prevGroup);
                return;
            }

            // ── NLU failed: provide contextual help ──
            sessionData.failed_attempts = (sessionData.failed_attempts || 0) + 1;
            await this.saveSession(phone, sessionData);

            if (this.core.isAutoCancel({ ...this.waToCoreSession(sessionData), failed_attempts: sessionData.failed_attempts })) {
                await this.whatsapp.sendText(phone,
                    '😕 Lagta hai aapko pareshani ho rahi hai. Session cancel kar raha hoon.\n\nType *upload property* to start fresh.'
                );
                await this.endSession(phone);
                return;
            }

            await this.sendContextualHelp(phone, currentStep, stepOptions);
        } catch (err) {
            logger.error(`[WhatsAppWorkflow] Error handling message from ${phone}:`, err);
            await this.whatsapp.sendText(phone, 'Something went wrong. Please try again or type "cancel" to start over.');
        }
    }

    // ─── Result Rendering ────────────────────────────────────────────────────

    /**
     * Render a ProcessResult as WhatsApp messages.
     */
    private async renderResult(phone: string, result: ProcessResult, prevGroup?: string): Promise<void> {
        switch (result.action) {
            case 'next_step':
            case 'went_back':
            case 'skipped':
                if (result.step) {
                    // Send group transition message when moving to a new group
                    if (prevGroup && result.action !== 'went_back' && prevGroup !== result.step.group) {
                        await this.sendGroupTransition(phone, prevGroup, result.step.group);
                    }
                    await this.sendStep(phone, result.step, result.options || [], result.session?.answers);
                }
                break;

            case 'summary': {
                if (result.summary) {
                    const summaryLines = Object.entries(result.summary).map(([k, v]) => `• *${k}*: ${v}`).join('\n');
                    const summaryMsg = `📋 *Property Summary — Please Confirm*\n\n${summaryLines}\n\nIs everything correct?`;
                    await this.sendButtons(phone, summaryMsg, [
                        { value: 'confirm_yes', label: 'YES ✅' },
                        { value: 'confirm_no', label: 'NO ✏️' },
                    ]);
                }
                break;
            }

            case 'validation_error':
                await this.whatsapp.sendText(phone, `❌ ${result.error}\n\nPlease try again.`);
                break;

            case 'parse_error':
                if (result.error) {
                    await this.whatsapp.sendText(phone, result.error);
                }
                break;

            case 'committed':
                await this.endSession(phone);
                await this.whatsapp.sendText(phone,
                    `✅ *Property Listed Successfully!*\n\n` +
                    `Listing ID: *${result.display_id || result.inventory_id}*\n` +
                    `Completion: ${result.completion_pct || 0}%\n\n` +
                    `Panditji will verify and activate your listing within 24 hours. ` +
                    `You'll be notified when it goes live! 🏡\n\n` +
                    (result.completion_pct && result.completion_pct < 80
                        ? `💡 _Add more details (pricing, amenities, area) from the admin panel to improve your listing._\n\n`
                        : '') +
                    `Type "property" to list another property.`
                );
                break;

            case 'cancelled':
                await this.cancelSession(phone);
                break;

            case 'session_expired':
                await this.endSession(phone);
                await this.whatsapp.sendText(phone, '⏰ Your session expired due to inactivity. Type "property" to start again.');
                break;

            case 'auto_cancelled':
                await this.endSession(phone);
                await this.whatsapp.sendText(phone,
                    '😕 It seems you\'re having trouble. I\'m cancelling this session.\n\nType *upload property* to start fresh anytime.'
                );
                break;
        }
    }

    // ─── Step Rendering ──────────────────────────────────────────────────────

    /**
     * Send a workflow step as a WhatsApp message.
     */
    private async sendStep(phone: string, step: WorkflowStep, options: StepOption[], answers?: Record<string, any>): Promise<void> {
        const question = step.question_hi
            ? `${step.question}\n\n_${step.question_hi}_`
            : step.question;

        // Handle address_block — context-aware prompt based on property type
        if (step.input_type === 'address_block') {
            const rules = await this.core.getEngine().getAddressRules(answers || {});
            let fields: string;
            let example: string;
            if (rules.floor_required) {
                // Apartment/Flat/Office — need flat no, floor, building name
                fields = 'Flat No, Floor No, Society/Building Name, Locality/Sector, City, State, Pincode';
                example = '_A-101, 3rd Floor, Seemant Vihar Apartments, Sector 14 Vaishali, Ghaziabad, Uttar Pradesh, 201010_';
            } else if (rules.plot_area_required) {
                // Plot/Land — need plot number
                fields = 'Plot No, Locality/Sector, City, State, Pincode';
                example = '_Plot-25, Sector 62, Noida, Uttar Pradesh, 201301_';
            } else if (rules.bhk_required) {
                // Independent house/Villa — plot no optional, society optional
                fields = 'House/Plot No, Colony/Society (if any), Locality, City, State, Pincode';
                example = '_B-42, Green Valley Colony, Sector 9 Vaishali, Ghaziabad, Uttar Pradesh, 201010_';
            } else {
                fields = 'Address details, Locality/Sector, City, State, Pincode';
                example = '_Sector 14 Vaishali, Ghaziabad, Uttar Pradesh, 201010_';
            }
            const msg = `📍 *${question}*\n\nPlease send the *complete property address* in one message.\n\nInclude: ${fields}\n\nExample: ${example}`;
            await this.whatsapp.sendText(phone, msg);
            return;
        }

        // Handle uploader_block — composite text prompt
        if (step.input_type === 'uploader_block') {
            const msg = `*${question}*\n\nPlease send your details in this format:\n*Name, Phone, Email*\n\nExample: _Rahul Sharma, 9876543210, rahul@gmail.com_\n\n_(Email is optional)_`;
            await this.whatsapp.sendText(phone, msg);
            return;
        }

        // Handle owner_block — composite text prompt
        if (step.input_type === 'owner_block') {
            const msg = `*${question}*\n\nPlease send the property owner's details:\n*Name, Phone*\n\nExample: _Sunita Devi, 9876543210_`;
            await this.whatsapp.sendText(phone, msg);
            return;
        }

        // Handle media upload steps — offer skip if allow_group_skip
        if (step.input_type === 'media_upload') {
            if (step.allow_group_skip) {
                await this.sendButtons(phone,
                    `📸 *${question}*\n\nWould you like to upload photos now or skip?`,
                    [
                        { value: 'upload_now', label: 'Upload Now 📸' },
                        { value: '__skip__', label: 'Skip (Add Later)' },
                    ]
                );
            } else {
                const msg = `📸 *${question}*\n\nSend your property photos now (JPEG/PNG/WebP, max 10 photos).\n\nType *done* when finished, or *skip* to skip.`;
                await this.whatsapp.sendText(phone, msg);
            }
            return;
        }

        // Handle video upload steps
        if (step.input_type === 'video_upload') {
            if (step.allow_group_skip) {
                await this.sendButtons(phone,
                    `🎬 *${question}*\n\nWould you like to upload videos now or skip?`,
                    [
                        { value: 'upload_now', label: 'Upload Now 🎬' },
                        { value: '__skip__', label: 'Skip (Add Later)' },
                    ]
                );
            } else {
                const msg = `🎬 *${question}*\n\nSend property videos (MP4/WebM, max 3 videos).\n\nType *done* when finished, or *skip* to skip.`;
                await this.whatsapp.sendText(phone, msg);
            }
            return;
        }

        // Handle document upload steps
        if (step.input_type === 'document_upload') {
            const msg = `📄 *${question}*\n\nSend property documents (PDF/JPEG/PNG). Each document will be saved.\n\nType *done* when finished, or *skip* to skip.`;
            await this.whatsapp.sendText(phone, msg);
            return;
        }

        // Handle confirm step (summary)
        if (step.input_type === 'confirm') {
            return;
        }

        // For steps with options
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

        // Multi-select — use interactive list with iterative selection
        if (step.input_type === 'multi_select' && options.length > 0) {
            await this.sendMultiSelectPrompt(phone, question, options, []);
            return;
        }

        // Compound (e.g., area + unit)
        if (step.input_type === 'compound' && step.secondary_options) {
            const units = step.secondary_options.map(o => o.label).join('/');
            const msg = `*${question}*\n\nType the value followed by unit.\nExample: \`1200 sqft\`\nUnits: ${units}${step.placeholder ? `\n\n_${step.placeholder}_` : ''}`;
            await this.whatsapp.sendText(phone, msg);
            return;
        }

        // Number — add pricing tips
        if (step.input_type === 'number' && step.group === 'pricing') {
            let msg = `💰 *${question}*\n\n_Aap "55 lakh" ya "2.5 crore" bhi likh sakte hain._`;
            if (step.placeholder) msg += `\n_${step.placeholder}_`;
            if (!step.required) msg += `\n\nType *skip* to skip.`;
            await this.whatsapp.sendText(phone, msg);
            return;
        }

        // Phone
        if (step.input_type === 'phone') {
            let msg = `📞 *${question}*\n\n_10 digit mobile number bhejein (e.g., 9876543210)_`;
            if (!step.required) msg += `\n\nType *skip* to skip.`;
            await this.whatsapp.sendText(phone, msg);
            return;
        }

        // Number / Text / Textarea
        let msg = `*${question}*`;
        if (step.placeholder) msg += `\n\n_${step.placeholder}_`;
        if (!step.required) msg += `\n\nType *skip* to skip this.`;
        await this.whatsapp.sendText(phone, msg);
    }

    /**
     * Send WhatsApp interactive buttons (max 3 options).
     */
    private async sendButtons(phone: string, question: string, options: StepOption[]): Promise<void> {
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

    /**
     * Send WhatsApp interactive list (4-10 options).
     */
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

    /**
     * Send multi-select prompt as numbered text.
     */
    private async sendMultiSelectPrompt(phone: string, question: string, allOptions: StepOption[], selected: string[]): Promise<void> {
        const selectedLabels = allOptions
            .filter(o => selected.includes(o.value))
            .map(o => o.label);
        const selectedText = selectedLabels.length > 0
            ? `\n\n✅ Selected: ${selectedLabels.join(', ')}`
            : '';

        const optionsList = allOptions
            .map((o, i) => {
                const marker = selected.includes(o.value) ? ' ✅' : '';
                return `${i + 1}. ${o.label}${marker}`;
            })
            .join('\n');

        const msg = `*${question}*${selectedText}\n\n${optionsList}\n\n` +
            (selected.length > 0
                ? `Type more numbers (e.g., 4,7) or type *done* to continue.`
                : `Type numbers separated by comma (e.g., 1,3,5)\nType *skip* to skip or *done* when finished.`);

        await this.whatsapp.sendText(phone, msg);
    }

    /**
     * Handle messages during multi-select iterative collection.
     */
    private async handleMultiSelectCollection(phone: string, msg: WhatsAppIncomingMessage, session: WhatsAppWorkflowSession): Promise<void> {
        const text = this.extractText(msg).toLowerCase().trim();
        const coreSession = this.waToCoreSession(session);

        // Use NLU command detection for full Hindi/English support
        const cmd = await this.detectNLUCommand(text);

        if (cmd === 'done' || cmd === 'skip') {
            const result = await this.core.finishMultiSelect(coreSession);
            await this.saveSession(phone, this.coreToWaSession(result.session));
            await this.renderResult(phone, result);
            return;
        }

        if (cmd === 'cancel') {
            await this.cancelSession(phone);
            return;
        }

        if (cmd === 'back') {
            coreSession.pending_multi_select = [];
            coreSession.state = 'in_progress';
            const result = await this.core.goBack(coreSession);
            await this.saveSession(phone, this.coreToWaSession(result.session));
            await this.renderResult(phone, result);
            return;
        }

        // Parse multi-select input
        const currentStep = this.core.getStepDefinition(session.current_step_id || '');
        if (!currentStep) return;

        const allOptions = currentStep.static_options
            ? currentStep.static_options.map(o => ({ value: o.value, label: o.label }))
            : (session.current_step_options || []);

        let selected = session.pending_multi_select || [];
        let matchedAny = false;

        const items = text.split(/[,;]+/).map(s => s.trim()).filter(s => s.length > 0);
        for (const item of items) {
            const num = parseInt(item);
            if (!isNaN(num) && num >= 1 && num <= allOptions.length) {
                const val = allOptions[num - 1].value;
                if (!selected.includes(val)) {
                    selected.push(val);
                    matchedAny = true;
                }
            } else {
                const match = allOptions.find(o =>
                    o.value.toLowerCase() === item || o.label.toLowerCase().includes(item)
                );
                if (match && !selected.includes(match.value)) {
                    selected.push(match.value);
                    matchedAny = true;
                }
            }
        }

        if (!matchedAny) {
            await this.whatsapp.sendText(phone,
                `I didn't recognize that. Please type numbers (e.g., 1,3,5) or type *done* to continue.\n\n` +
                `Commands: *done* | *skip* | *back* | *cancel*`
            );
            return;
        }

        session.pending_multi_select = selected;
        await this.saveSession(phone, session);

        const remaining = allOptions.filter(o => !selected.includes(o.value));

        if (remaining.length === 0 || selected.length >= 12) {
            // All selected or max reached — auto-advance via core
            coreSession.pending_multi_select = selected;
            const result = await this.core.finishMultiSelect(coreSession);
            await this.saveSession(phone, this.coreToWaSession(result.session));
            await this.renderResult(phone, result);
            return;
        }

        // Show confirmation + prompt for more
        await this.sendMultiSelectPrompt(phone, currentStep.question, allOptions, selected);
    }

    /**
     * Send help message with available commands.
     */
    private async sendHelpMessage(phone: string): Promise<void> {
        await this.whatsapp.sendText(phone,
            '🆘 *Available commands:*\n\n' +
            '• Type your answer to continue\n' +
            '• *back* — go to previous question\n' +
            '• *skip* — skip this question\n' +
            '• *done* — finish current selection\n' +
            '• *cancel* — stop and start over\n\n' +
            '_Aap "cancel" type karke dobara shuru kar sakte hain._'
        );
    }

    /**
     * Send interactive message via WhatsApp Cloud API.
     */
    private async sendInteractive(phone: string, payload: any): Promise<void> {
        if (process.env.NODE_ENV === 'development') {
            logger.info(`[WhatsAppWorkflow] Mock interactive to ${phone}:`, JSON.stringify(payload.interactive?.type));
            const body = payload.interactive?.body?.text || '';
            const options = payload.interactive?.action?.buttons
                ? payload.interactive.action.buttons.map((b: any) => b.reply.title).join(' | ')
                : payload.interactive?.action?.sections?.[0]?.rows?.map((r: any) => r.title).join(', ') || '';
            await this.whatsapp.sendText(phone, `${body}\n\nOptions: ${options}`);
            return;
        }

        try {
            const axios = (await import('axios')).default;
            const apiUrl = `https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
            logger.info(`[WhatsAppWorkflow] Sending interactive ${payload.interactive?.type} to ${phone}`);
            const resp = await axios.post(apiUrl, payload, {
                headers: {
                    'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            });
            logger.info(`[WhatsAppWorkflow] Interactive sent OK to ${phone} (${resp.status}): msgId=${resp.data?.messages?.[0]?.id || 'none'}`);
        } catch (err: any) {
            const errDetail = err?.response?.data ? JSON.stringify(err.response.data) : (err as Error).message;
            logger.error('[WhatsAppWorkflow] Failed to send interactive:', errDetail);
            const body = payload.interactive?.body?.text || 'Please choose an option:';
            const buttons = payload.interactive?.action?.buttons;
            const rows = payload.interactive?.action?.sections?.[0]?.rows;
            let optionsText = '';
            if (buttons && buttons.length > 0) {
                optionsText = '\n\n*Options:*\n' + buttons.map((b: any, i: number) => `${i + 1}. ${b.reply.title}`).join('\n');
                optionsText += '\n\n_Type the number or option name to choose._';
            } else if (rows && rows.length > 0) {
                optionsText = '\n\n*Options:*\n' + rows.map((r: any, i: number) => `${i + 1}. ${r.title}`).join('\n');
                optionsText += '\n\n_Type the number or option name to choose._';
            }
            await this.whatsapp.sendText(phone, body + optionsText);
        }
    }

    // ─── NLU Helpers ──────────────────────────────────────────────────────────

    /**
     * Detect a command (back/skip/cancel/done) from text using NLU.
     * Used by media/document/multi-select handlers.
     */
    private async detectNLUCommand(text: string): Promise<'back' | 'skip' | 'cancel' | 'done' | null> {
        const dummy: WorkflowStep = { id: '_cmd', group: '', question: '', input_type: 'text', field: '_cmd', required: false };
        const result = await this.nlu.parse(text, dummy, []);
        return result.command;
    }

    /**
     * Send a friendly group transition message when advancing to a new workflow group.
     */
    private async sendGroupTransition(phone: string, fromGroup: string, toGroup: string): Promise<void> {
        const transitions: Record<string, string> = {
            // v3 shortened flow
            'identity→contact':         'Great! 👍 Now tell me your contact details...',
            'contact→intent':           'Contact saved! 🏠 What would you like to do with this property?',
            'intent→property_type':     'Got it! 📝 What type of property is this?',
            'property_type→config':     'Property type noted! 🔧 Let me know the configuration...',
            'config→address':           'Configuration saved! 📍 Now the property address...',
            'address→keyholder':        'Address saved! 🔑 Who holds the property key?',
            'keyholder→media':          'Key holder noted! 📸 Share property photos if you have them...',
            'media→confirm':            'Almost done! ✅ Let me show you the summary...',
            // Legacy v2 transitions (backward compat)
            'ownership→classification': 'Basic details noted! 👍 Now let me understand the property type...',
            'classification→specs':     'Got it! 📝 Let me know about the property specifications...',
            'specs→pricing':            'Specifications saved! 💰 Now the most important part — pricing...',
            'pricing→address':          'Price noted! 📍 Now tell me the property address...',
            'address→features':         'Address saved! ✨ Almost done — any special features?',
            'features→media':           'Great! 📸 Now share property photos and documents...',
            'media→keyholder':          'Media saved! 🔑 Last section — who holds the property key?',
        };
        const key = `${fromGroup}→${toGroup}`;
        const msg = transitions[key];
        if (msg) {
            await this.whatsapp.sendText(phone, msg);
        }
    }

    /**
     * Send contextual help based on the current step type (bilingual).
     */
    private async sendContextualHelp(phone: string, step: WorkflowStep, options: StepOption[]): Promise<void> {
        let helpMsg = '❓ Samajh nahi aaya. ';

        switch (step.input_type) {
            case 'radio':
            case 'dropdown': {
                if (options.length > 0) {
                    const optsList = options.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
                    helpMsg += `Neeche diye options mein se choose karein:\n\n${optsList}\n\n_Number ya naam type karein._`;
                } else {
                    helpMsg += 'Please type your answer.';
                }
                break;
            }
            case 'number': {
                if (step.group === 'pricing') {
                    helpMsg += 'Aap "55 lakh" ya "2.5 crore" bhi likh sakte hain.\n\n_Example: 55 lakh, 2.5 crore, 5000000_';
                } else {
                    helpMsg += 'Please enter a number.\n\n_Example: 3, 1200, 2.5_';
                }
                break;
            }
            case 'phone':
                helpMsg += '10 digit mobile number bhejein.\n\n_Example: 9876543210_';
                break;
            case 'address_block':
                helpMsg += 'Poora address ek message mein bhejein.\n\n_Example: A-101, Seemant Vihar, Sector 14 Vaishali, Ghaziabad, UP, 201010_';
                break;
            case 'owner_block':
                helpMsg += 'Owner ka naam aur phone bhejein.\n\n_Format: Name, Phone_\n_Example: Sunita Devi, 9876543210_';
                break;
            case 'uploader_block':
                helpMsg += 'Apna naam, phone aur email bhejein.\n\n_Format: Name, Phone, Email_\n_Example: Rahul, 9876543210, rahul@gmail.com_';
                break;
            case 'compound':
                helpMsg += 'Value aur unit type karein.\n\n_Example: 1200 sqft_';
                break;
            default:
                helpMsg += 'Apna jawab type karein ya *skip* karein.';
                break;
        }

        helpMsg += '\n\n_Commands: *back* | *skip* | *cancel*_';
        await this.whatsapp.sendText(phone, helpMsg);
    }

    // ─── Input Parsing ───────────────────────────────────────────────────────

    /**
     * Extract text from any WhatsApp message type.
     */
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

    /**
     * Extract the selected ID from interactive replies.
     */
    private extractInteractiveId(msg: WhatsAppIncomingMessage): string | null {
        if (msg.interactive?.button_reply) return msg.interactive.button_reply.id;
        if (msg.interactive?.list_reply) return msg.interactive.list_reply.id;
        return null;
    }

    // ─── Media/Document Collection ───────────────────────────────────────────

    /**
     * Handle messages during photo collection phase.
     */
    private async handleMediaCollection(phone: string, msg: WhatsAppIncomingMessage, session: WhatsAppWorkflowSession): Promise<void> {
        const text = this.extractText(msg).toLowerCase().trim();

        // Use NLU command detection for full Hindi/English support
        const cmd = text ? await this.detectNLUCommand(text) : null;

        if (cmd === 'done' || cmd === 'skip') {
            const coreSession = this.waToCoreSession(session);
            const result = await this.core.finishMediaCollection(coreSession);
            await this.saveSession(phone, this.coreToWaSession(result.session));
            await this.renderResult(phone, result);
            return;
        }

        if (cmd === 'cancel') {
            await this.cancelSession(phone);
            return;
        }

        // Video received — stored in pending_docs with video mime type for later saving to video_urls
        if (msg.video?.id) {
            try {
                const media = await this.whatsapp.downloadMedia(msg.video.id);
                if (media) {
                    const ext = media.mimeType === 'video/mp4' ? '.mp4' : media.mimeType === 'video/quicktime' ? '.mov' : '.mp4';
                    const fs = require('fs');
                    const path = require('path');
                    const videoDir = path.join(process.cwd(), 'uploads', 'properties', `pending_${phone}`);
                    fs.mkdirSync(videoDir, { recursive: true });
                    const filename = `${Date.now()}${ext}`;
                    fs.writeFileSync(path.join(videoDir, filename), media.buffer);
                    const videoUrl = `/uploads/properties/pending_${phone}/${filename}`;
                    if (!session.answers.videos) session.answers.videos = [];
                    (session.answers.videos as string[]).push(videoUrl);
                    await this.saveSession(phone, session);

                    const count = (session.answers.videos as string[]).length;
                    await this.whatsapp.sendText(phone, `✅ Video ${count} received! Send more or type *done* to continue.${count >= 3 ? '\n\n⚠️ Maximum 3 videos reached. Type *done* to continue.' : ''}`);
                } else {
                    await this.whatsapp.sendText(phone, '❌ Could not download the video. Please try again.');
                }
            } catch (err) {
                logger.error('[WhatsAppWorkflow] Video download error:', err);
                await this.whatsapp.sendText(phone, '❌ Error processing video. Please try again.');
            }
            return;
        }

        // Image received
        if (msg.image?.id) {
            try {
                const media = await this.whatsapp.downloadMedia(msg.image.id);
                if (media) {
                    const result = await this.storage.uploadBuffer(media.buffer, `pending_${phone}`, media.mimeType);
                    session.pending_media.push(result.original);
                    await this.saveSession(phone, session);

                    const count = session.pending_media.length;
                    await this.whatsapp.sendText(phone, `✅ Photo ${count} received! Send more photos or type *done*.${count >= 10 ? '\n\n⚠️ Maximum 10 photos reached. Type *done* to continue.' : ''}`);

                    if (count >= 10) {
                        const coreSession = this.waToCoreSession(session);
                        const advResult = await this.core.finishMediaCollection(coreSession);
                        await this.saveSession(phone, this.coreToWaSession(advResult.session));
                        await this.renderResult(phone, advResult);
                    }
                } else {
                    await this.whatsapp.sendText(phone, '❌ Could not download the photo. Please try again.');
                }
            } catch (err) {
                logger.error('[WhatsAppWorkflow] Media download error:', err);
                await this.whatsapp.sendText(phone, '❌ Error processing photo. Please try again.');
            }
            return;
        }

        await this.whatsapp.sendText(phone, 'Please send a photo/video or type *done* to continue.');
    }

    /**
     * Handle messages during document collection phase.
     */
    private async handleDocumentCollection(phone: string, msg: WhatsAppIncomingMessage, session: WhatsAppWorkflowSession): Promise<void> {
        const text = this.extractText(msg).toLowerCase().trim();

        // Use NLU command detection for full Hindi/English support
        const cmd = text ? await this.detectNLUCommand(text) : null;

        if (cmd === 'done' || cmd === 'skip') {
            const coreSession = this.waToCoreSession(session);
            const result = await this.core.finishDocumentCollection(coreSession);
            await this.saveSession(phone, this.coreToWaSession(result.session));
            await this.renderResult(phone, result);
            return;
        }

        if (cmd === 'cancel') {
            await this.cancelSession(phone);
            return;
        }

        // Document or image received
        const mediaId = msg.document?.id || msg.image?.id;
        if (mediaId) {
            try {
                const media = await this.whatsapp.downloadMedia(mediaId);
                if (media) {
                    const originalName = msg.document?.filename || `document_${session.pending_docs.length + 1}`;
                    const docResult = await this.storage.uploadDocument(media.buffer, `pending_${phone}`, media.mimeType, originalName);
                    const docEntry = {
                        file_url: docResult.url,
                        file_name: docResult.file_name,
                        mime_type: docResult.mime_type,
                        file_size: docResult.file_size,
                    };
                    session.pending_docs.push(docEntry);
                    await this.saveSession(phone, session);

                    await this.whatsapp.sendText(phone, `✅ Document received: ${docEntry.file_name}\nSend more or type *done* to continue.`);
                } else {
                    await this.whatsapp.sendText(phone, '❌ Could not download the document. Please try again.');
                }
            } catch (err) {
                logger.error('[WhatsAppWorkflow] Document download error:', err);
                await this.whatsapp.sendText(phone, '❌ Error processing document. Please try again.');
            }
            return;
        }

        await this.whatsapp.sendText(phone, 'Please send a document (PDF/photo) or type *done* to continue.');
    }

    /**
     * Handle YES/NO confirmation at the end of the workflow.
     */
    private async handleConfirmation(phone: string, msg: WhatsAppIncomingMessage, session: WhatsAppWorkflowSession): Promise<void> {
        const text = this.extractText(msg).toLowerCase().trim();
        const interactiveId = this.extractInteractiveId(msg);

        // Use NLU parseConfirmation for full Hindi/English/Hinglish support
        const nluConf = this.nlu.parseConfirmation(text);
        const isYes = interactiveId === 'confirm_yes' || nluConf === 'yes';
        const isNo = interactiveId === 'confirm_no' || nluConf === 'no';

        if (isYes) {
            try {
                // Default owner_phone to the WhatsApp phone if not provided
                if (!session.answers.owner_phone) {
                    session.answers.owner_phone = phone;
                }

                let agentId: string | undefined;
                const uploaderAgent = await prisma.agent.findFirst({
                    where: { phone: { in: phoneVariants(phone) }, status: 'active' },
                    select: { id: true },
                });
                if (uploaderAgent) {
                    agentId = uploaderAgent.id;
                    logger.info(`[WhatsAppWorkflow] Resolved uploader agent: ${agentId} for phone ${phone}`);
                } else {
                    logger.warn(`[WhatsAppWorkflow] No agent found for phone ${phone}, inventory will have no uploader`);
                }

                const coreSession = this.waToCoreSession(session);
                const result = await this.core.commitWorkflow(coreSession, 'whatsapp', agentId);
                await this.renderResult(phone, result);
            } catch (err) {
                logger.error('[WhatsAppWorkflow] Commit error:', err);
                await this.whatsapp.sendText(phone, `❌ Error submitting property: ${(err as Error).message}\n\nPlease try again or type "cancel".`);
            }
            return;
        }

        if (isNo) {
            const coreSession = this.waToCoreSession(session);
            const result = await this.core.goBack(coreSession);
            await this.saveSession(phone, this.coreToWaSession(result.session));
            await this.renderResult(phone, result);
            return;
        }

        await this.whatsapp.sendText(phone, 'Please type *YES* to confirm or *NO* to go back and edit.');
    }

    // ─── Session Conversion ──────────────────────────────────────────────────

    /**
     * Convert WhatsApp session to ConversationalSession.
     */
    private waToCoreSession(wa: WhatsAppWorkflowSession): ConversationalSession {
        return {
            workflow: wa.workflow,
            state: wa.state,
            answers: wa.answers,
            current_step_id: wa.current_step_id,
            current_step_options: wa.current_step_options,
            pending_media: wa.pending_media,
            pending_docs: wa.pending_docs,
            pending_multi_select: wa.pending_multi_select || [],
            failed_attempts: wa.failed_attempts,
            started_at: wa.started_at,
            last_activity_at: new Date().toISOString(),
        };
    }

    /**
     * Convert ConversationalSession back to WhatsApp session.
     */
    private coreToWaSession(core: ConversationalSession): WhatsAppWorkflowSession {
        return {
            workflow: 'inventory_v2',
            state: core.state,
            answers: core.answers,
            current_step_id: core.current_step_id,
            current_step_options: core.current_step_options,
            pending_media: core.pending_media,
            pending_docs: core.pending_docs,
            pending_multi_select: core.pending_multi_select,
            failed_attempts: core.failed_attempts,
            started_at: core.started_at,
        };
    }

    // ─── Session Persistence (WhatsApp-specific) ─────────────────────────────

    /**
     * Cancel the workflow session.
     */
    private async cancelSession(phone: string): Promise<void> {
        await this.endSession(phone);
        await this.whatsapp.sendText(phone, '❌ Property listing cancelled.\n\nType "property" to start again anytime.');
    }

    /**
     * Save workflow session to ConversationSession table.
     */
    private async saveSession(phone: string, data: WhatsAppWorkflowSession): Promise<void> {
        const context: Record<string, any> = {
            answers: data.answers,
            current_step_id: data.current_step_id,
            current_step_options: data.current_step_options || [],
            pending_media: data.pending_media,
            pending_docs: data.pending_docs,
            pending_multi_select: data.pending_multi_select || [],
            failed_attempts: data.failed_attempts || 0,
            state: data.state,
            started_at: data.started_at,
        };

        await prisma.$transaction(async (tx) => {
            const existing = await tx.conversationSession.findFirst({
                where: { phone_number: phone, active: true, workflow: 'inventory_v2' },
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
                        workflow: 'inventory_v2',
                        state: data.state,
                        context,
                        active: true,
                    },
                });
            }
        });
    }

    /**
     * Load workflow session from ConversationSession table.
     */
    static async loadSession(phone: string): Promise<WhatsAppWorkflowSession | null> {
        const session = await prisma.conversationSession.findFirst({
            where: { phone_number: phone, active: true, workflow: 'inventory_v2' },
            orderBy: { updated_at: 'desc' },
        });

        if (!session) return null;

        const ctx = session.context as any;
        return {
            workflow: 'inventory_v2',
            state: ctx.state || 'in_progress',
            answers: ctx.answers || {},
            current_step_id: ctx.current_step_id || null,
            current_step_options: ctx.current_step_options,
            pending_media: ctx.pending_media || [],
            pending_docs: ctx.pending_docs || [],
            pending_multi_select: ctx.pending_multi_select || [],
            failed_attempts: ctx.failed_attempts || 0,
            started_at: ctx.started_at || session.created_at.toISOString(),
        };
    }

    /**
     * End workflow session (deactivate).
     */
    private async endSession(phone: string): Promise<void> {
        await prisma.conversationSession.updateMany({
            where: { phone_number: phone, active: true, workflow: 'inventory_v2' },
            data: { active: false },
        });
    }

    /**
     * Check if a phone number has an active workflow session.
     */
    static async hasActiveSession(phone: string): Promise<boolean> {
        const count = await prisma.conversationSession.count({
            where: { phone_number: phone, active: true, workflow: 'inventory_v2' },
        });
        return count > 0;
    }
}
