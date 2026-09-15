
import { LLMService } from '../services/llm';
import { SystemPromptService } from '../services/system_prompt';
import logger from '../utils/logger';

export class BuyerWorkflow {
    private llmService: LLMService;

    constructor() {
        this.llmService = new LLMService();
    }

    private readonly STATES = {
        INTAKE: 'INTAKE',
        QUALIFICATION: 'QUALIFICATION',
        MATCHING: 'MATCHING',
        WARM: 'WARM'
    };

    /**
     * Main entry point for the Buyer Agent.
     */
    public async handle(contact: any, message: string): Promise<any> {
        logger.info(`[Buyer] Handling message for ${contact.phone_number} via Gemini AI`);

        // 1. Determine current state
        let state = contact.lead_status === 'cold' ? this.STATES.INTAKE : this.STATES.QUALIFICATION;

        // 2. Logic Transfer
        if (state === this.STATES.INTAKE) {
            // Intent Classification
            const intent = await this.llmService.classifyIntent(message);
            logger.info(`[Buyer] AI Classified Intent: ${intent}`);

            if (intent === 'BUYER' || intent === 'TENANT') {
                // Generate Dynamic Reply
                const systemPrompt = await SystemPromptService.getBuyerPrompt({
                    lead_status: 'cold',
                    intent: intent,
                    missing_info: "Budget, Location, Type"
                });
                const reply = await this.llmService.generateResponseWithHistory(
                    systemPrompt, message, contact.phone_number
                );

                return {
                    next_state: this.STATES.QUALIFICATION,
                    action: 'ask_details',
                    reply_script: reply
                };
            }
        }

        // Handle Qualification Loop (Dynamic)
        if (state === this.STATES.QUALIFICATION) {
            const systemPrompt = await SystemPromptService.getBuyerPrompt({
                lead_status: 'qualifying',
                intent: contact.intent || 'BUYER',
                missing_info: "Confirm details or ask next question"
            });
            const reply = await this.llmService.generateResponseWithHistory(
                systemPrompt, message, contact.phone_number
            );

            return {
                action: 'reply',
                reply_script: reply
            };
        }

        // Fallback: Generate AI response for any unhandled state
        const fallbackPrompt = await SystemPromptService.getBuyerPrompt({
            lead_status: contact.lead_status || 'cold',
            intent: contact.intent || 'BUYER',
            missing_info: "Budget, Location, Type"
        });
        const fallbackReply = await this.llmService.generateResponseWithHistory(
            fallbackPrompt, message, contact.phone_number
        );
        return {
            action: 'reply',
            reply_script: fallbackReply
        };
    }
}
