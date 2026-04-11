/**
 * Classifier Agent — Identifies unknown contacts via AI classification.
 *
 * Wraps the existing UnknownIdentificationWorkflow as a BaseAgent.
 * Uses confidence scoring to avoid mis-classification.
 */

import { BaseAgent, AgentContext, AgentResponse } from './types';
import { LLMService } from '../services/llm';
import { SystemPromptService } from '../services/system_prompt';
import logger from '../utils/logger';

const CONFIDENCE_THRESHOLD = 60;

export class ClassifierAgent implements BaseAgent {
    readonly name = 'classifier' as const;
    private llmService: LLMService;

    constructor() {
        this.llmService = new LLMService();
    }

    // Keywords that explicitly indicate the person is a property OWNER (not agent/broker)
    private static readonly OWNER_KEYWORDS = [
        'owner', 'malik', 'mera', 'meri', 'apna', 'apni', 'my property', 'my flat',
        'my house', 'my plot', 'i own', 'i am the owner', 'i am owner', 'main malik',
        'khud ka', 'personal property', 'own property', 'self owned',
    ];

    // Keywords that indicate a broker/dealer/agent (not individual owner)
    private static readonly AGENT_KEYWORDS = [
        'broker', 'dealer', 'agent', 'agency', 'firm', 'company', 'realtor',
        'property dealer', 'real estate agent', 'dalal', 'dukan',
        'client ke liye', 'client property', 'multiple properties',
    ];

    private hasOwnerSignal(message: string): boolean {
        const msg = message.toLowerCase();
        return ClassifierAgent.OWNER_KEYWORDS.some(k => msg.includes(k));
    }

    private hasAgentSignal(message: string): boolean {
        const msg = message.toLowerCase();
        return ClassifierAgent.AGENT_KEYWORDS.some(k => msg.includes(k));
    }

    async handle(context: AgentContext): Promise<AgentResponse> {
        const { contact, message } = context;
        logger.info(`[ClassifierAgent] Identifying contact type for ${contact.phone_number}`);

        // R013: Use pre-classification from MessageRouter's classifyFull() if available
        // This saves a separate LLM call since the type was already classified
        const preClass = context.crossAgentData?.preClassification as
            { contactType: string; domainIntent: string; language: string; confidence: number } | undefined;

        let classification: { type: string; confidence: number; intent?: string | null };
        if (preClass && preClass.confidence >= CONFIDENCE_THRESHOLD) {
            classification = {
                type: preClass.contactType,
                confidence: preClass.confidence,
            };
            logger.info(`[ClassifierAgent] Using pre-classification: ${classification.type} (confidence: ${classification.confidence}%) — skipped LLM call`);
        } else {
            classification = await this.llmService.classifyWithConfidence(message);
            logger.info(`[ClassifierAgent] Classified as: ${classification.type} (confidence: ${classification.confidence}%)`);
        }

        // Low confidence — ask clarifying question
        if (classification.type === 'UNKNOWN' || classification.confidence < CONFIDENCE_THRESHOLD) {
            const systemPrompt = await SystemPromptService.getIdentificationPrompt();
            const reply = await this.llmService.generateResponseWithHistory(
                systemPrompt, message, contact.phone_number,
            );

            return {
                action: 'reply',
                reply_script: reply,
                contact_type: 'UNKNOWN',
                confidence: classification.confidence,
                quality_hint: 'uncertain',
                metadata: { raw_classification: classification },
            };
        }

        // ─── Ownership clarification for sell/rent-out intent ─────────
        // When someone wants to sell/rent out a property, we MUST ask if they
        // are the owner or a broker. This prevents misrouting individual
        // owners to the Partner Agent flow.
        const isSellIntent = classification.type === 'LANDLORD' ||
            classification.intent === 'sell' || classification.intent === 'rent_out';

        if (isSellIntent && !this.hasOwnerSignal(message) && !this.hasAgentSignal(message)) {
            // Sell intent detected but can't confirm if owner or agent — ask
            logger.info(`[ClassifierAgent] Sell intent but no ownership signal — asking clarification`);

            return {
                action: 'reply',
                reply_script: "That's great! Before I assist you, could you please confirm — are you the *owner* of this property, or are you a *property dealer/broker* listing it on behalf of someone?",
                contact_type: 'UNKNOWN',
                confidence: classification.confidence,
                quality_hint: 'uncertain',
                metadata: {
                    awaiting_ownership: true,
                    raw_classification: classification,
                },
            };
        }

        // If explicit agent/broker signal, classify as PARTNER_AGENT
        let contactType = classification.type;
        if (isSellIntent && this.hasAgentSignal(message)) {
            contactType = 'PARTNER_AGENT';
            logger.info(`[ClassifierAgent] Broker signal detected — classifying as PARTNER_AGENT`);
        }

        // Determine intent
        let intent: string | undefined;
        if (classification.intent) {
            intent = classification.intent;
        } else if (contactType === 'BUYER' || contactType === 'TENANT' || contactType === 'LANDLORD') {
            const classifiedIntent = await this.llmService.classifyIntent(message);
            if (classifiedIntent === 'BUYER') intent = 'buy';
            else if (classifiedIntent === 'TENANT') intent = 'rent';
            else if (classifiedIntent === 'SELLER') intent = 'sell';
            else if (classifiedIntent === 'LANDLORD') intent = 'rent';
        }

        // Return acknowledgment
        const acknowledgments: Record<string, string> = {
            BUYER: "Welcome! I understand you're looking to purchase a property. Let me help you find the perfect match.",
            TENANT: "Welcome! I understand you're looking for a rental property. Let me help you find the right place.",
            LANDLORD: "Welcome! I understand you have a property. Let me help you list it and find the right buyer or tenant.",
            PARTNER_AGENT: "Welcome, partner! I see you're a property dealer. Let me know if you have properties to list or buyers to match.",
            MANAGEMENT: "Welcome, boss! How can I assist you today?",
        };

        return {
            action: 'reply',
            reply_script: acknowledgments[contactType] || 'How can I help you today?',
            contact_type: contactType,
            confidence: classification.confidence,
            quality_hint: 'confident',
            metadata: {
                intent,
                raw_classification: classification,
            },
        };
    }
}
