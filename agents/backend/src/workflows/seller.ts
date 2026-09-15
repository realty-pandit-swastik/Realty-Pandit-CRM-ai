
import prisma from '../db';
import { LLMService } from '../services/llm';
import { SystemPromptService } from '../services/system_prompt';
import logger from '../utils/logger';

interface WorkflowResult {
    action: 'reply' | 'monitor';
    reply_script?: string;
}

export class SellerWorkflow {
    private llmService: LLMService;

    constructor() {
        this.llmService = new LLMService();
    }

    public async handle(contact: any, message: string): Promise<WorkflowResult> {
        logger.info(`[Seller] Handling message for ${contact.phone_number} via Gemini AI`);
        const msg = message.toLowerCase();

        // Extract property type from message if missing
        if (!contact.property_type) {
            const typeMap: Record<string, string> = {
                'flat': 'flat', 'apartment': 'flat',
                'house': 'house', 'villa': 'house', 'bungalow': 'house',
                'plot': 'plot', 'land': 'plot',
                'office': 'office', 'shop': 'shop'
            };
            for (const [keyword, type] of Object.entries(typeMap)) {
                if (msg.includes(keyword)) {
                    await this.updateContact(contact.phone_number, { property_type: type });
                    contact.property_type = type;
                    break;
                }
            }
        }

        // Extract location if property type is known but location isn't
        if (contact.property_type && !contact.preferred_location) {
            // If message doesn't contain property keywords, treat it as location
            const hasPropertyKeyword = ['flat', 'house', 'plot', 'sell', 'rent', 'office', 'shop'].some(k => msg.includes(k));
            if (!hasPropertyKeyword && message.trim().length > 1) {
                await this.updateContact(contact.phone_number, { preferred_location: message });
                contact.preferred_location = message;
            }
        }

        // Mark as warm when we have enough info
        if (contact.property_type && contact.preferred_location && contact.lead_status === 'cold') {
            await this.updateContact(contact.phone_number, {
                lead_status: 'warm',
                ai_summary: `Seller: ${contact.property_type} in ${contact.preferred_location}. Price info: ${message}`
            });
            contact.lead_status = 'warm';
        }

        // Generate AI response
        const systemPrompt = await SystemPromptService.getSellerPrompt({
            lead_status: contact.lead_status,
            intent: contact.intent || 'sell',
            property_type: contact.property_type,
            preferred_location: contact.preferred_location,
            price_discussed: contact.lead_status === 'warm' || contact.lead_status === 'hot' ? 'Yes' : 'No'
        });

        const reply = await this.llmService.generateResponseWithHistory(
            systemPrompt, message, contact.phone_number
        );
        return { action: 'reply', reply_script: reply };
    }

    private async updateContact(phone: string, data: any) {
        return prisma.contact.update({
            where: { phone_number: phone },
            data
        });
    }
}
