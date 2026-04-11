/**
 * Conversational Workflow Core
 *
 * Platform-agnostic conversational logic extracted from WhatsAppWorkflowAdapter.
 * Both WhatsApp and Chat (HTTP) adapters delegate to this core for:
 * - Session initialization (first step)
 * - Input processing (validate + advance)
 * - Media/document accumulation
 * - Multi-select iterative collection
 * - Summary generation + commit
 * - Navigation (back, skip, cancel)
 * - Frustration detection + session expiry
 *
 * The core does NOT send messages or persist sessions — that's the adapter's job.
 */

import { WorkflowEngine } from './workflow_engine';
import { WorkflowStep, StepOption, WorkflowAnswer, StepResult, ValidationResult, WorkflowSummary } from './workflow_types';
import logger from '../utils/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ConversationalState =
    | 'in_progress'
    | 'awaiting_media'
    | 'awaiting_documents'
    | 'awaiting_confirm'
    | 'awaiting_multi_select';

export interface ConversationalSession {
    workflow: string;                    // 'inventory_v2' | 'chat_inventory'
    state: ConversationalState;
    answers: WorkflowAnswer;
    current_step_id: string | null;
    current_step_options?: StepOption[];
    pending_media: string[];
    pending_docs: Array<{ file_url: string; file_name: string; mime_type: string; file_size: number }>;
    pending_multi_select?: string[];
    pending_hints?: Record<string, string>;  // e.g. { configuration_bhk: '2' }
    failed_attempts: number;
    started_at: string;
    last_activity_at: string;
}

export interface ParsedInput {
    value: any;
    secondaryValue?: any;
}

export type ProcessAction =
    | 'next_step'
    | 'validation_error'
    | 'parse_error'
    | 'media_received'
    | 'doc_received'
    | 'summary'
    | 'committed'
    | 'cancelled'
    | 'went_back'
    | 'skipped'
    | 'help'
    | 'session_expired'
    | 'multi_select_updated'
    | 'frustrated'
    | 'media_done'
    | 'doc_done'
    | 'multi_select_done'
    | 'auto_cancelled';

export interface ProcessResult {
    action: ProcessAction;
    step?: WorkflowStep;
    options?: StepOption[];
    metadata?: Record<string, any>;
    summary?: WorkflowSummary;
    error?: string;
    inventory_id?: string;
    display_id?: string;
    completion_pct?: number;
    session: ConversationalSession;
    media_count?: number;
    doc_count?: number;
    multi_select_current?: string[];
    multi_select_options?: StepOption[];
    done?: boolean;
}

// ─── Core ────────────────────────────────────────────────────────────────────

const SESSION_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
const MAX_FAILED_ATTEMPTS = 15;

const FRUSTRATION_KEYWORDS = [
    'stuck', 'lost', '??', 'samajh nahi', 'confused',
    'not working', 'what is this', 'you are lost',
    'you lost', 'again stuck', 'pagal', 'stupid',
    'bekaar', 'bekar', 'kuch nahi ho raha',
];

export class ConversationalWorkflowCore {
    private engine: WorkflowEngine;

    constructor() {
        this.engine = new WorkflowEngine();
    }

    /** Get the underlying workflow engine (for adapters that need direct access). */
    getEngine(): WorkflowEngine {
        return this.engine;
    }

    /** Get step definition by ID. */
    getStepDefinition(stepId: string): WorkflowStep | undefined {
        return this.engine.getDefinition().find(s => s.id === stepId);
    }

    /** Get all step definitions. */
    getDefinition(): WorkflowStep[] {
        return this.engine.getDefinition();
    }

    /** Check if session has expired (30 min inactivity). */
    isExpired(session: ConversationalSession): boolean {
        const lastActivity = new Date(session.last_activity_at).getTime();
        return Date.now() - lastActivity > SESSION_EXPIRY_MS;
    }

    /** Detect frustration keywords in user text. */
    isFrustrated(text: string): boolean {
        const lc = text.toLowerCase();
        return FRUSTRATION_KEYWORDS.some(k => lc.includes(k));
    }

    /** Check if user has hit max failed attempts. */
    isAutoCancel(session: ConversationalSession): boolean {
        return session.failed_attempts >= MAX_FAILED_ATTEMPTS;
    }

    // ─── Session Initialization ──────────────────────────────────────────────

    /**
     * Initialize a new workflow session. Returns the first step.
     */
    async startSession(workflowName: string, source: string): Promise<ProcessResult> {
        const firstStep = await this.engine.getNextStep(null, { _source: source });
        if (!firstStep) {
            const session = this.createEmptySession(workflowName);
            return {
                action: 'cancelled',
                error: 'Workflow configuration error. No steps available.',
                session,
            };
        }

        const session: ConversationalSession = {
            workflow: workflowName,
            state: 'in_progress',
            answers: { _source: source },
            current_step_id: firstStep.step.id,
            current_step_options: firstStep.options,
            pending_media: [],
            pending_docs: [],
            pending_multi_select: [],
            failed_attempts: 0,
            started_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
        };

        return {
            action: 'next_step',
            step: firstStep.step,
            options: firstStep.options || [],
            metadata: firstStep.metadata,
            session,
        };
    }

    // ─── Input Processing ────────────────────────────────────────────────────

    /**
     * Process a validated input for the current step.
     * The adapter is responsible for parsing raw text into ParsedInput
     * (using NLUParser for chat, or parseInput for WhatsApp).
     */
    async processInput(
        session: ConversationalSession,
        parsed: ParsedInput | null,
        command: 'answer' | 'back' | 'skip' | 'cancel' | 'done' | null,
        rawText?: string,
    ): Promise<ProcessResult> {
        // Touch activity timestamp
        session.last_activity_at = new Date().toISOString();

        // Check expiry
        if (this.isExpired(session)) {
            return { action: 'session_expired', session };
        }

        // Handle commands
        if (command === 'back') {
            return this.goBack(session);
        }
        if (command === 'cancel') {
            return { action: 'cancelled', session };
        }
        if (command === 'skip') {
            return this.handleSkip(session);
        }

        // Route by state
        if (session.state === 'awaiting_confirm') {
            // This should be handled by confirmWorkflow / goBack
            // If we get here with 'answer', treat 'yes'/'no' detection
            return { action: 'parse_error', error: 'Type CONFIRM to submit or EDIT to modify.', session };
        }

        // For media/doc/multi_select states, commands should be routed above
        // Actual media/doc/multi_select data is handled by dedicated methods

        // Normal in_progress: validate + advance
        if (!parsed) {
            session.failed_attempts++;
            if (this.isAutoCancel(session)) {
                return { action: 'auto_cancelled', session };
            }

            const step = this.getStepDefinition(session.current_step_id || '');
            return {
                action: 'parse_error',
                step,
                options: session.current_step_options,
                error: 'Could not understand your answer. Please try again.',
                session,
            };
        }

        // Get current step
        const currentStep = this.getStepDefinition(session.current_step_id || '');
        if (!currentStep) {
            return { action: 'parse_error', error: 'Step not found.', session };
        }

        // Validate
        const validation = await this.engine.validateStep(
            session.current_step_id!,
            parsed.value,
            session.answers,
        );
        if (!validation.valid) {
            return {
                action: 'validation_error',
                step: currentStep,
                options: session.current_step_options,
                error: validation.error,
                session,
            };
        }

        // Store answer
        const newAnswers = { ...session.answers, [currentStep.field]: parsed.value };
        if (parsed.secondaryValue !== undefined && currentStep.secondary_field) {
            newAnswers[currentStep.secondary_field] = parsed.secondaryValue;
        }
        session.answers = newAnswers;
        session.failed_attempts = 0;

        // Extract BHK hint from raw text for auto-fill on configuration step
        if (rawText && (currentStep.id === 'flat_property_type_id' || currentStep.id === 'main_category')) {
            const bhkMatch = rawText.match(/(\d)\s*bhk/i);
            if (bhkMatch) {
                session.pending_hints = { ...(session.pending_hints || {}), configuration_bhk: bhkMatch[1] };
                logger.info(`[ConversationalCore] BHK hint extracted: ${bhkMatch[1]} BHK`);
            }
        }

        // Advance to next step
        return this.advanceToNext(session);
    }

    // ─── Media Collection ────────────────────────────────────────────────────

    /**
     * Receive a media file during awaiting_media state.
     */
    async receiveMedia(session: ConversationalSession, mediaUrl: string): Promise<ProcessResult> {
        session.last_activity_at = new Date().toISOString();
        session.pending_media.push(mediaUrl);

        const count = session.pending_media.length;

        // Auto-advance at 10
        if (count >= 10) {
            return this.finishMediaCollection(session);
        }

        return {
            action: 'media_received',
            media_count: count,
            session,
        };
    }

    /**
     * Finish media collection (done command or max reached).
     */
    async finishMediaCollection(session: ConversationalSession): Promise<ProcessResult> {
        const newAnswers = { ...session.answers };
        if (session.pending_media.length > 0) {
            newAnswers.photos = session.pending_media;
        }
        session.answers = newAnswers;
        session.pending_media = [];
        session.state = 'in_progress';
        return this.advanceToNext(session);
    }

    // ─── Document Collection ─────────────────────────────────────────────────

    /**
     * Receive a document during awaiting_documents state.
     */
    async receiveDocument(
        session: ConversationalSession,
        doc: { file_url: string; file_name: string; mime_type: string; file_size: number },
    ): Promise<ProcessResult> {
        session.last_activity_at = new Date().toISOString();
        session.pending_docs.push(doc);

        return {
            action: 'doc_received',
            doc_count: session.pending_docs.length,
            session,
        };
    }

    /**
     * Finish document collection.
     */
    async finishDocumentCollection(session: ConversationalSession): Promise<ProcessResult> {
        const newAnswers = { ...session.answers };
        if (session.pending_docs.length > 0) {
            newAnswers.documents = session.pending_docs.map(d => ({
                file_url: d.file_url,
                file_name: d.file_name,
                mime_type: d.mime_type,
                file_size: d.file_size,
                doc_type: 'other',
                title: d.file_name,
            }));
        }
        session.answers = newAnswers;
        session.pending_docs = [];
        session.state = 'in_progress';
        return this.advanceToNext(session);
    }

    // ─── Video Collection ────────────────────────────────────────────────────

    /**
     * Receive a video URL.
     */
    async receiveVideo(session: ConversationalSession, videoUrl: string): Promise<ProcessResult> {
        session.last_activity_at = new Date().toISOString();
        if (!session.answers.videos) session.answers.videos = [];
        (session.answers.videos as string[]).push(videoUrl);

        return {
            action: 'media_received',
            media_count: (session.answers.videos as string[]).length,
            session,
        };
    }

    /**
     * Finish video collection.
     */
    async finishVideoCollection(session: ConversationalSession): Promise<ProcessResult> {
        session.state = 'in_progress';
        return this.advanceToNext(session);
    }

    // ─── Multi-Select Collection ─────────────────────────────────────────────

    /**
     * Update multi-select selections.
     */
    async processMultiSelect(
        session: ConversationalSession,
        newSelections: string[],
    ): Promise<ProcessResult> {
        session.last_activity_at = new Date().toISOString();
        const current = session.pending_multi_select || [];

        for (const val of newSelections) {
            if (!current.includes(val)) {
                current.push(val);
            }
        }
        session.pending_multi_select = current;

        // Get options for the frontend to show
        const step = this.getStepDefinition(session.current_step_id || '');
        const allOptions = step?.static_options
            ? step.static_options.map(o => ({ value: o.value, label: o.label }))
            : (session.current_step_options || []);

        // Auto-advance if all selected or max 12
        const remaining = allOptions.filter(o => !current.includes(o.value));
        if (remaining.length === 0 || current.length >= 12) {
            return this.finishMultiSelect(session);
        }

        return {
            action: 'multi_select_updated',
            multi_select_current: current,
            multi_select_options: allOptions,
            step,
            session,
        };
    }

    /**
     * Finish multi-select collection.
     */
    async finishMultiSelect(session: ConversationalSession): Promise<ProcessResult> {
        const selections = session.pending_multi_select || [];
        const currentStep = this.getStepDefinition(session.current_step_id || '');
        if (currentStep) {
            session.answers[currentStep.field] = selections.length > 0 ? selections : undefined;
        }
        session.pending_multi_select = [];
        session.state = 'in_progress';
        return this.advanceToNext(session);
    }

    // ─── Confirmation & Commit ───────────────────────────────────────────────

    /**
     * Build summary for confirmation.
     */
    async buildSummary(session: ConversationalSession): Promise<WorkflowSummary> {
        return this.engine.buildSummary(session.answers);
    }

    /**
     * Commit the workflow after confirmation.
     */
    async commitWorkflow(
        session: ConversationalSession,
        source: 'web' | 'admin' | 'whatsapp' | 'voice',
        agentId?: string,
    ): Promise<ProcessResult> {
        try {
            const result = await this.engine.commit(session.answers, source, agentId);
            return {
                action: 'committed',
                inventory_id: result.inventory_id,
                display_id: result.display_id,
                completion_pct: result.completion_pct,
                session,
            };
        } catch (err) {
            logger.error('[ConversationalCore] Commit error:', err);
            return {
                action: 'validation_error',
                error: `Error submitting property: ${(err as Error).message}`,
                session,
            };
        }
    }

    // ─── Navigation ──────────────────────────────────────────────────────────

    /**
     * Advance to the next step after storing an answer.
     */
    async advanceToNext(session: ConversationalSession): Promise<ProcessResult> {
        logger.info(`[ConversationalCore] advanceToNext: current=${session.current_step_id}, answersCount=${Object.keys(session.answers).length}`);
        const nextResult = await this.engine.getNextStep(session.current_step_id, session.answers);
        logger.info(`[ConversationalCore] advanceToNext: next=${nextResult?.step?.id || 'NONE (summary)'}, type=${nextResult?.step?.input_type || 'n/a'}`);

        // Auto-fill configuration_id from BHK hint (e.g., user said "2 BHK flat" at property type step)
        if (nextResult?.step?.id === 'configuration_id' && session.pending_hints?.configuration_bhk) {
            const bhk = session.pending_hints.configuration_bhk;
            const configOptions = await this.engine.getStepOptions(nextResult.step, session.answers);
            const matched = configOptions.find(o => o.label.toLowerCase().includes(`${bhk} bhk`));
            if (matched) {
                logger.info(`[ConversationalCore] Auto-filling configuration from BHK hint: ${bhk} BHK → ${matched.value}`);
                session.answers = { ...session.answers, configuration_id: matched.value };
                delete session.pending_hints!.configuration_bhk;
                return this.advanceToNext(session); // Skip to next step
            }
        }

        if (!nextResult) {
            // All steps done → show summary for confirmation
            try {
                const summary = await this.engine.buildSummary(session.answers);
                session.state = 'awaiting_confirm';
                session.current_step_id = 'summary_confirmation';

                return {
                    action: 'summary',
                    summary,
                    done: true,
                    session,
                };
            } catch (err) {
                logger.error('[ConversationalCore] Summary error:', err);
                return {
                    action: 'validation_error',
                    error: 'Error building summary.',
                    session,
                };
            }
        }

        // Route by next step type
        if (nextResult.step.input_type === 'media_upload') {
            session.state = 'awaiting_media';
            session.current_step_id = nextResult.step.id;
            session.current_step_options = [];
            return {
                action: 'next_step',
                step: nextResult.step,
                options: [],
                metadata: nextResult.metadata,
                session,
            };
        }

        if (nextResult.step.input_type === 'video_upload') {
            session.state = 'awaiting_media';
            session.current_step_id = nextResult.step.id;
            session.current_step_options = [];
            return {
                action: 'next_step',
                step: nextResult.step,
                options: [],
                metadata: nextResult.metadata,
                session,
            };
        }

        if (nextResult.step.input_type === 'document_upload') {
            session.state = 'awaiting_documents';
            session.current_step_id = nextResult.step.id;
            session.current_step_options = [];
            return {
                action: 'next_step',
                step: nextResult.step,
                options: [],
                metadata: nextResult.metadata,
                session,
            };
        }

        if (nextResult.step.input_type === 'multi_select') {
            session.state = 'awaiting_multi_select';
            session.current_step_id = nextResult.step.id;
            session.current_step_options = nextResult.options || nextResult.step.static_options?.map(o => ({ value: o.value, label: o.label })) || [];
            session.pending_multi_select = [];
            return {
                action: 'next_step',
                step: nextResult.step,
                options: session.current_step_options,
                metadata: nextResult.metadata,
                session,
            };
        }

        // Confirm step — build summary and set awaiting_confirm
        if (nextResult.step.input_type === 'confirm') {
            try {
                const summary = await this.engine.buildSummary(session.answers);
                session.state = 'awaiting_confirm';
                session.current_step_id = nextResult.step.id;
                session.current_step_options = [];
                return {
                    action: 'summary',
                    summary,
                    done: true,
                    session,
                };
            } catch (err) {
                logger.error('[ConversationalCore] Summary error at confirm step:', err);
                return {
                    action: 'validation_error',
                    error: 'Error building summary.',
                    session,
                };
            }
        }

        // Normal step
        session.state = 'in_progress';
        session.current_step_id = nextResult.step.id;
        session.current_step_options = nextResult.options;
        return {
            action: 'next_step',
            step: nextResult.step,
            options: nextResult.options || [],
            metadata: nextResult.metadata,
            session,
        };
    }

    /**
     * Go back to the previous step.
     */
    async goBack(session: ConversationalSession): Promise<ProcessResult> {
        const currentId = session.current_step_id || 'summary_confirmation';
        const prevResult = await this.engine.getPreviousStep(currentId, session.answers);

        if (!prevResult) {
            return {
                action: 'parse_error',
                error: 'This is the first step. Cannot go back further.',
                session,
            };
        }

        // Remove the previous step's answer so user can re-enter
        const step = this.getStepDefinition(prevResult.step.id);
        if (step) {
            delete session.answers[step.field];
            if (step.secondary_field) delete session.answers[step.secondary_field];
        }

        session.state = 'in_progress';
        session.current_step_id = prevResult.step.id;
        session.current_step_options = prevResult.options;

        return {
            action: 'went_back',
            step: prevResult.step,
            options: prevResult.options || [],
            session,
        };
    }

    /**
     * Handle skip command.
     */
    private async handleSkip(session: ConversationalSession): Promise<ProcessResult> {
        // Handle skip in special states
        if (session.state === 'awaiting_media') {
            session.pending_media = [];
            session.state = 'in_progress';
            return this.advanceToNext(session);
        }
        if (session.state === 'awaiting_documents') {
            session.pending_docs = [];
            session.state = 'in_progress';
            return this.advanceToNext(session);
        }
        if (session.state === 'awaiting_multi_select') {
            session.pending_multi_select = [];
            session.state = 'in_progress';
            return this.advanceToNext(session);
        }

        const currentStep = this.getStepDefinition(session.current_step_id || '');
        if (currentStep?.required) {
            return {
                action: 'validation_error',
                step: currentStep,
                options: session.current_step_options,
                error: `This step (*${currentStep.question}*) is required and cannot be skipped.`,
                session,
            };
        }

        return this.advanceToNext(session);
    }

    /**
     * Re-fetch options for a step if they were lost.
     */
    async ensureOptions(session: ConversationalSession): Promise<StepOption[]> {
        const step = this.getStepDefinition(session.current_step_id || '');
        if (!step) return [];

        if (session.current_step_options && session.current_step_options.length > 0) {
            return session.current_step_options;
        }

        if (step.input_type === 'dropdown' || step.input_type === 'radio') {
            const options = await this.engine.getStepOptions(step, session.answers);
            if (options.length > 0) {
                session.current_step_options = options;
            }
            return options;
        }

        return [];
    }

    /**
     * Calculate progress (step position).
     */
    async calculateProgress(session: ConversationalSession): Promise<{ current: number; total: number; group: string }> {
        const visibleSteps = await this.engine.getVisibleSteps(session.answers);
        const currentIdx = visibleSteps.findIndex(s => s.id === session.current_step_id);
        const currentStep = visibleSteps.find(s => s.id === session.current_step_id);

        return {
            current: Math.max(currentIdx + 1, 1),
            total: visibleSteps.length,
            group: currentStep?.group || 'ownership',
        };
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private createEmptySession(workflowName: string): ConversationalSession {
        return {
            workflow: workflowName,
            state: 'in_progress',
            answers: {},
            current_step_id: null,
            current_step_options: [],
            pending_media: [],
            pending_docs: [],
            pending_multi_select: [],
            failed_attempts: 0,
            started_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
        };
    }
}
