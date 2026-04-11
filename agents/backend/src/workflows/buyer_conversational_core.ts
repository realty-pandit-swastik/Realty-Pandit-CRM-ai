/**
 * Buyer Conversational Core
 *
 * Two-phase buyer workflow:
 *   Phase A: Requirement capture (structured steps via BuyerWorkflowEngine)
 *   Phase B: Property matching loop (show one property at a time, offer actions)
 *
 * This core does NOT send messages or persist sessions — that's the adapter's job.
 * It returns ProcessResult objects that adapters (WhatsApp, Chat HTTP) render.
 */

import { BuyerWorkflowEngine, PropertyCardData } from './buyer_workflow_engine';
import { BUYER_WORKFLOW_STEPS } from './buyer_workflow_definition';
import { WorkflowStep, StepOption, WorkflowAnswer, StepResult, WorkflowSummary } from './workflow_types';
import { MatchingEngine, MatchCriteria, MatchedProperty } from '../services/matching_engine';
import logger from '../utils/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export type BuyerSessionState =
    | 'in_progress'           // Requirement capture (Phase A)
    | 'awaiting_confirm'      // Summary confirmation before matching
    | 'matching'              // Showing a property card (Phase B)
    | 'awaiting_action'       // Waiting for user to choose action on shown property
    | 'booking'               // Collecting visit booking details
    | 'completed';            // Session done

export interface BuyerMatchingState {
    criteria: MatchCriteria;
    shown_ids: string[];             // Property IDs already shown
    current_property_id?: string;    // Currently displayed property
    current_property?: PropertyCardData; // Full card data for current property
    offset: number;                  // For DB pagination
    no_more: boolean;                // True when all matches exhausted
}

export interface BuyerSession {
    workflow: 'buyer_intake';
    state: BuyerSessionState;
    answers: WorkflowAnswer;
    current_step_id: string | null;
    current_step_options?: StepOption[];
    failed_attempts: number;
    started_at: string;
    last_activity_at: string;
    matching_state?: BuyerMatchingState;
    committed_phone?: string;        // Phone after commit
    committed_tx_id?: string;        // Transaction ID after commit
}

export type BuyerAction =
    | 'next_step'
    | 'validation_error'
    | 'parse_error'
    | 'summary'
    | 'committed'
    | 'property_card'
    | 'no_matches'
    | 'no_more_properties'
    | 'visit_booked'
    | 'cancelled'
    | 'went_back'
    | 'skipped'
    | 'session_expired'
    | 'auto_cancelled'
    | 'requirements_changed';

export interface BuyerProcessResult {
    action: BuyerAction;
    step?: WorkflowStep;
    options?: StepOption[];
    metadata?: Record<string, any>;
    summary?: WorkflowSummary;
    error?: string;
    property?: PropertyCardData;
    match_index?: number;
    total_available?: number;
    session: BuyerSession;
    quick_replies?: Array<{ label: string; value: string }>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SESSION_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
const MAX_FAILED_ATTEMPTS = 15;
const MATCH_BATCH_SIZE = 5; // Fetch 5 at a time from DB, show 1 at a time

const FRUSTRATION_KEYWORDS = [
    'stuck', 'lost', '??', 'samajh nahi', 'confused',
    'not working', 'pagal', 'bekaar',
];

// ─── Core ────────────────────────────────────────────────────────────────────

export class BuyerConversationalCore {
    private engine: BuyerWorkflowEngine;
    private matchingEngine: MatchingEngine;

    constructor() {
        this.engine = new BuyerWorkflowEngine();
        this.matchingEngine = new MatchingEngine();
    }

    getEngine(): BuyerWorkflowEngine {
        return this.engine;
    }

    getStepDefinition(stepId: string): WorkflowStep | undefined {
        return this.engine.getDefinition().find(s => s.id === stepId);
    }

    isExpired(session: BuyerSession): boolean {
        return Date.now() - new Date(session.last_activity_at).getTime() > SESSION_EXPIRY_MS;
    }

    // ─── Session Initialization ──────────────────────────────────────────────

    async startSession(source: string): Promise<BuyerProcessResult> {
        const answers: WorkflowAnswer = { _source: source };
        const firstStep = await this.engine.getNextStep(null, answers);

        if (!firstStep) {
            return {
                action: 'cancelled',
                error: 'No steps available.',
                session: this.createEmptySession(),
            };
        }

        const session: BuyerSession = {
            workflow: 'buyer_intake',
            state: 'in_progress',
            answers,
            current_step_id: firstStep.step.id,
            current_step_options: firstStep.options,
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

    // ─── Phase A: Requirement Capture ────────────────────────────────────────

    /**
     * Process user input during requirement capture phase.
     */
    async processInput(
        session: BuyerSession,
        parsedValue: any,
        command: 'answer' | 'back' | 'skip' | 'cancel' | null,
    ): Promise<BuyerProcessResult> {
        session.last_activity_at = new Date().toISOString();

        if (this.isExpired(session)) {
            return { action: 'session_expired', session };
        }

        if (command === 'cancel') {
            return { action: 'cancelled', session };
        }
        if (command === 'back') {
            return this.goBack(session);
        }
        if (command === 'skip') {
            return this.skipStep(session);
        }

        // Parse failure
        if (parsedValue === null || parsedValue === undefined) {
            session.failed_attempts++;
            if (session.failed_attempts >= MAX_FAILED_ATTEMPTS) {
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
            parsedValue,
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
        session.answers = { ...session.answers, [currentStep.field]: parsedValue };
        session.failed_attempts = 0;

        // Advance
        return this.advanceToNext(session);
    }

    /**
     * Advance to next step, or transition to matching phase if all steps done.
     */
    private async advanceToNext(session: BuyerSession): Promise<BuyerProcessResult> {
        const nextResult = await this.engine.getNextStep(session.current_step_id, session.answers);

        if (!nextResult) {
            // All requirement steps complete → show summary before matching
            const summary = await this.engine.buildBuyerSummary(session.answers);
            session.state = 'awaiting_confirm';
            session.current_step_id = 'buyer_summary';

            return {
                action: 'summary',
                summary,
                session,
                quick_replies: [
                    { label: 'Confirm & Find Properties', value: '__confirm__' },
                    { label: 'Edit Requirements', value: '__edit__' },
                ],
            };
        }

        // Normal next step
        session.current_step_id = nextResult.step.id;
        session.current_step_options = nextResult.options;
        session.state = 'in_progress';

        return {
            action: 'next_step',
            step: nextResult.step,
            options: nextResult.options || [],
            metadata: nextResult.metadata,
            session,
        };
    }

    // ─── Confirmation → Transition to Matching ───────────────────────────────

    /**
     * Handle confirmation of buyer requirements.
     * On confirm: commit to DB and start matching.
     * On edit: go back to last step.
     */
    async handleConfirmation(
        session: BuyerSession,
        confirmed: boolean,
        source: 'web' | 'admin' | 'whatsapp' | 'voice',
        phone?: string,
    ): Promise<BuyerProcessResult> {
        session.last_activity_at = new Date().toISOString();

        if (!confirmed) {
            return this.goBack(session);
        }

        // Commit buyer data to DB
        try {
            const commitResult = await this.engine.commitBuyer(session.answers, source, phone);
            session.committed_phone = commitResult.contact_phone;
            session.committed_tx_id = commitResult.transaction_id;
        } catch (err) {
            logger.error('[BuyerCore] Commit error:', err);
            return {
                action: 'validation_error',
                error: `Error saving requirements: ${(err as Error).message}`,
                session,
            };
        }

        // Build match criteria and start matching
        const criteria = this.engine.buildMatchCriteria(session.answers);
        session.matching_state = {
            criteria,
            shown_ids: [],
            offset: 0,
            no_more: false,
        };

        return this.showNextProperty(session, source);
    }

    // ─── Phase B: Property Matching Loop ─────────────────────────────────────

    /**
     * Fetch and show the next matching property.
     */
    async showNextProperty(
        session: BuyerSession,
        source: 'web' | 'admin' | 'whatsapp' | 'voice' = 'web',
    ): Promise<BuyerProcessResult> {
        if (!session.matching_state) {
            return { action: 'no_matches', error: 'No matching state.', session };
        }

        const { criteria, shown_ids } = session.matching_state;

        // Fetch a batch of matches
        const matches = await this.matchingEngine.findMatches(criteria, MATCH_BATCH_SIZE);

        // Filter out already-shown properties
        const unseen = matches.filter(m => !shown_ids.includes(m.id));

        if (unseen.length === 0) {
            session.matching_state.no_more = true;
            session.state = 'completed';
            return {
                action: 'no_more_properties',
                session,
                metadata: {
                    total_shown: shown_ids.length,
                    message: shown_ids.length === 0
                        ? 'No properties match your requirements right now. We will notify you when new listings arrive!'
                        : `You have seen all ${shown_ids.length} matching properties. We will notify you when new listings arrive!`,
                },
            };
        }

        // Pick the best unseen property
        const property = unseen[0];
        const includeOwner = source === 'admin'; // Internal admin users see owner info
        const sanitized = this.engine.sanitizeProperty(property, includeOwner);

        // Update matching state
        session.matching_state.shown_ids.push(property.id);
        session.matching_state.current_property_id = property.id;
        session.matching_state.current_property = sanitized;
        session.state = 'awaiting_action';

        return {
            action: 'property_card',
            property: sanitized,
            match_index: shown_ids.length, // 0-indexed count of shown
            total_available: matches.length,
            session,
            quick_replies: [
                { label: 'Schedule Visit', value: '__schedule_visit__' },
                { label: 'Next Property', value: '__next_property__' },
                { label: 'Change Requirements', value: '__change_requirements__' },
            ],
        };
    }

    /**
     * Handle user action on a shown property.
     */
    async handleAction(
        session: BuyerSession,
        action: string,
        source: 'web' | 'admin' | 'whatsapp' | 'voice' = 'web',
    ): Promise<BuyerProcessResult> {
        session.last_activity_at = new Date().toISOString();

        switch (action) {
            case '__next_property__':
            case 'next':
            case 'more':
            case 'aur dikhao':
                return this.showNextProperty(session, source);

            case '__schedule_visit__':
            case 'schedule visit':
            case 'book visit':
                session.state = 'booking';
                return {
                    action: 'property_card',
                    property: session.matching_state?.current_property,
                    session,
                    metadata: { booking_mode: true, property_id: session.matching_state?.current_property_id },
                    quick_replies: [
                        { label: 'Book Now', value: '__book_now__' },
                        { label: 'Back', value: '__back_to_property__' },
                    ],
                };

            case '__change_requirements__':
            case 'change':
            case 'badlo':
                // Reset to first step
                session.state = 'in_progress';
                session.matching_state = undefined;
                session.current_step_id = null;
                const firstStep = await this.engine.getNextStep(null, { _source: session.answers._source });
                if (firstStep) {
                    // Keep old answers as defaults
                    session.current_step_id = firstStep.step.id;
                    session.current_step_options = firstStep.options;
                }
                return {
                    action: 'requirements_changed',
                    step: firstStep?.step,
                    options: firstStep?.options || [],
                    session,
                };

            default:
                // Check if it's a digit (property selection from list)
                if (/^\d$/.test(action)) {
                    return this.showNextProperty(session, source);
                }
                return {
                    action: 'parse_error',
                    error: 'Please choose: Schedule Visit, Next Property, or Change Requirements.',
                    session,
                    quick_replies: [
                        { label: 'Schedule Visit', value: '__schedule_visit__' },
                        { label: 'Next Property', value: '__next_property__' },
                        { label: 'Change Requirements', value: '__change_requirements__' },
                    ],
                };
        }
    }

    // ─── Navigation ──────────────────────────────────────────────────────────

    private async goBack(session: BuyerSession): Promise<BuyerProcessResult> {
        if (session.state === 'awaiting_confirm') {
            // Go back to last intake step
            const visibleSteps = await this.engine.getVisibleSteps(session.answers);
            const lastStep = visibleSteps[visibleSteps.length - 1];
            if (lastStep) {
                session.state = 'in_progress';
                session.current_step_id = lastStep.id;
                const options = await this.engine.getStepOptions(lastStep, session.answers);
                session.current_step_options = options;
                // Clear the answer for this step
                delete session.answers[lastStep.field];
                return {
                    action: 'went_back',
                    step: lastStep,
                    options,
                    session,
                };
            }
        }

        if (session.state === 'in_progress' && session.current_step_id) {
            const prevResult = await this.engine.getPreviousStep(session.current_step_id, session.answers);
            if (prevResult) {
                session.current_step_id = prevResult.step.id;
                session.current_step_options = prevResult.options;
                // Clear the answer for current step
                const currentStep = this.getStepDefinition(session.current_step_id);
                if (currentStep) delete session.answers[currentStep.field];
                return {
                    action: 'went_back',
                    step: prevResult.step,
                    options: prevResult.options || [],
                    session,
                };
            }
        }

        // Can't go back further
        return {
            action: 'parse_error',
            error: 'You are at the first step.',
            session,
        };
    }

    private async skipStep(session: BuyerSession): Promise<BuyerProcessResult> {
        const currentStep = this.getStepDefinition(session.current_step_id || '');
        if (currentStep?.required) {
            return {
                action: 'validation_error',
                step: currentStep,
                options: session.current_step_options,
                error: 'This question is required and cannot be skipped.',
                session,
            };
        }
        return this.advanceToNext(session);
    }

    /**
     * Calculate progress through the intake steps.
     */
    async calculateProgress(session: BuyerSession): Promise<{ current: number; total: number; group: string }> {
        const visibleSteps = await this.engine.getVisibleSteps(session.answers);
        const currentIndex = visibleSteps.findIndex(s => s.id === session.current_step_id);
        const currentStep = this.getStepDefinition(session.current_step_id || '');

        return {
            current: Math.max(0, currentIndex) + 1,
            total: visibleSteps.length,
            group: currentStep?.group || 'unknown',
        };
    }

    private createEmptySession(): BuyerSession {
        return {
            workflow: 'buyer_intake',
            state: 'in_progress',
            answers: {},
            current_step_id: null,
            failed_attempts: 0,
            started_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
        };
    }
}
