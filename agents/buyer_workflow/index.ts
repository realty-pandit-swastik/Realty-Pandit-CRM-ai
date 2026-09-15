import { LLMService } from '../backend/src/services/llm';
import { SystemPromptService } from '../backend/src/services/system_prompt';

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
        console.log(`[Buyer] Handling message for ${contact.phone_number} via Gemini AI`);

        // 1. Determine current state
        let state = contact.lead_status === 'cold' ? this.STATES.INTAKE : this.STATES.QUALIFICATION;

        // 2. Logic Transfer
        if (state === this.STATES.INTAKE) {
            // Intent Classification
            const intent = await this.llmService.classifyIntent(message);
            console.log(`[Buyer] AI Classified Intent: ${intent}`);

            if (intent === 'BUYER' || intent === 'TENANT') {
                // Generate Dynamic Reply
                const systemPrompt = SystemPromptService.getBuyerPrompt({
                    lead_status: 'cold',
                    intent: intent,
                    missing_info: "Budget, Location, Type"
                });
                const reply = await this.llmService.generateResponse(systemPrompt, message);

                return {
                    next_state: this.STATES.QUALIFICATION,
                    action: 'ask_details',
                    reply_script: reply
                };
            }
        }

        // Handle Qualification Loop (Dynamic)
        if (state === this.STATES.QUALIFICATION) {
            const systemPrompt = SystemPromptService.getBuyerPrompt({
                lead_status: 'qualifying',
                intent: contact.intent || 'BUYER',
                missing_info: "Confirm details or ask next question"
            });
            const reply = await this.llmService.generateResponse(systemPrompt, message);

            return {
                action: 'reply',
                reply_script: reply
            };
        }

        return {
            action: 'monitor',
            notes: "No state change triggered."
        };
    }
}
