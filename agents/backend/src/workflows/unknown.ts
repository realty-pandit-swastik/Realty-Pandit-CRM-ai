
import { LLMService } from '../services/llm';
import { SystemPromptService } from '../services/system_prompt';
import prisma from '../db';
import logger from '../utils/logger';

const CONFIDENCE_THRESHOLD = 60;

export class UnknownIdentificationWorkflow {
    private llmService: LLMService;

    constructor() {
        this.llmService = new LLMService();
    }

    /**
     * Identifies an unknown contact's type via AI classification with confidence scoring.
     * Low confidence (<60) asks a clarifying question instead of mis-classifying.
     */
    public async handle(contact: any, message: string): Promise<any> {
        logger.info(`[Unknown] Identifying contact type for ${contact.phone_number}`);

        // Step 1: Classify with confidence score
        const classification = await this.llmService.classifyWithConfidence(message);
        logger.info(`[Unknown] AI classified as: ${classification.type} (confidence: ${classification.confidence}%)`);

        // Low confidence or UNKNOWN — ask clarifying question
        if (classification.type === 'UNKNOWN' || classification.confidence < CONFIDENCE_THRESHOLD) {
            const systemPrompt = await SystemPromptService.getIdentificationPrompt();
            const reply = await this.llmService.generateResponseWithHistory(
                systemPrompt, message, contact.phone_number
            );

            return {
                action: 'reply',
                reply_script: reply,
                contact_type: 'UNKNOWN',
                confidence: classification.confidence
            };
        }

        const contactType = classification.type;

        // Step 2: Update contact_type in SSOT
        const updateData: any = { contact_type: contactType };

        // Set intent from confidence classification
        if (classification.intent) {
            updateData.intent = classification.intent;
        } else if (contactType === 'BUYER' || contactType === 'TENANT' || contactType === 'LANDLORD') {
            const intent = await this.llmService.classifyIntent(message);
            if (intent === 'BUYER') updateData.intent = 'buy';
            else if (intent === 'TENANT') updateData.intent = 'rent';
            else if (intent === 'SELLER') updateData.intent = 'sell';
            else if (intent === 'LANDLORD') updateData.intent = 'rent';
        }

        await prisma.contact.update({
            where: { phone_number: contact.phone_number },
            data: updateData
        });

        logger.info(`[Unknown] Contact ${contact.phone_number} identified as ${contactType} (confidence: ${classification.confidence}%)`);

        // Step 3: Return acknowledgment
        const acknowledgments: Record<string, string> = {
            BUYER: "Welcome! I understand you're looking to buy a property. Let me help you find the perfect one.",
            TENANT: "Welcome! I understand you're looking to rent a property. Let me help you find the perfect one.",
            LANDLORD: "Welcome! I understand you have a property to sell or rent out. Let me help you list it.",
            PARTNER_AGENT: "Welcome, partner! I see you're a property dealer. Let me know if you have properties to list or buyers to match.",
            MANAGEMENT: "Welcome, boss! How can I assist you today?"
        };

        return {
            action: 'reply',
            reply_script: acknowledgments[contactType] || "How can I help you today?",
            contact_type: contactType,
            confidence: classification.confidence
        };
    }
}
