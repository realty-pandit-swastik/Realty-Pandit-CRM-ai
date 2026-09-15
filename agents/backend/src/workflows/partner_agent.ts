
import { LLMService } from '../services/llm';
import { SystemPromptService } from '../services/system_prompt';
import { MatchingService } from '../services/matching';
import prisma from '../db';
import logger from '../utils/logger';

import { InventoryStateMachine, InventoryState } from './inventory_machine';
import { sessionStore } from '../services/session/store';

export class PartnerAgentWorkflow {
    private llmService: LLMService;
    private matchingService: MatchingService;
    private inventoryMachine: InventoryStateMachine;

    constructor() {
        this.llmService = new LLMService();
        this.matchingService = new MatchingService();
        this.inventoryMachine = new InventoryStateMachine();
    }

    /**
     * Handles messages from Partner Agents (external dealers).
     * Two modes: HAS_PROPERTIES (list inventory) or HAS_BUYERS (match buyers).
     */
    public async handle(contact: any, message: string): Promise<any> {
        logger.info(`[PartnerAgent] Handling message for ${contact.phone_number}`);

        // Check if partner profile exists
        const partnerProfile = await prisma.partnerAgent.findUnique({
            where: { phone_number: contact.phone_number }
        });

        // First interaction — direct to registration
        if (!partnerProfile) {
            const reply = `Welcome to Realty Pandit Partner Program! 🏢

To get started as a partner agent, please register at:
/agent/register

Or contact our team for assistance.`;

            return {
                action: 'reply',
                reply_script: reply
            };
        }

        // 1. Check if ACTIVE Inventory Session exists
        const activeSession = await sessionStore.getSession(contact.phone_number);
        if (activeSession && activeSession.state !== InventoryState.COMMIT) {
            // Continue inventory flow
            const result = await this.inventoryMachine.handleStep(contact.phone_number, { text: message });
            return { action: 'reply', reply_script: result.reply.text };
        }

        const msg = message.toLowerCase();

        // 2. Intent: Add Inventory ("Add property", "List flat")
        if (msg.includes('add') && (msg.includes('property') || msg.includes('flat') || msg.includes('list') || msg.includes('inventory'))) {
            const result = await this.inventoryMachine.startSession(contact.phone_number, 'sell'); // Default to sell for now
            return { action: 'reply', reply_script: result.reply.text };
        }

        // 3. Intent: Check Visits ("Any visits today?", "My appointments")
        if (msg.includes('visit') || msg.includes('appointment')) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const visits = await prisma.scheduledVisit.findMany({
                where: {
                    agent_id: partnerProfile.id,
                    preferred_date: {
                        gte: today,
                        lt: tomorrow
                    }
                }
            });

            if (visits.length === 0) {
                return { action: 'reply', reply_script: "No visits scheduled for today yet." };
            }

            const visitList = visits.map(v =>
                `- ${v.preferred_time || 'Time TBD'}: ${v.name} (${v.buyer_info_masked ? 'Hidden' : v.phone})`
            ).join('\n');

            return {
                action: 'reply',
                reply_script: `📅 You have ${visits.length} visit(s) today:\n\n${visitList}`
            };
        }

        // 4. Intent: Update Listing (Update Rent)
        if (msg.includes('update') && (msg.includes('rent') || msg.includes('price'))) {
            return {
                action: 'reply',
                reply_script: "Please use your Dashboard (/agent/inventory) to update pricing for security reasons."
            };
        }


        // 5. Fallback: LLM Chat
        const hasPropertyKeywords = msg.includes('property') || msg.includes('list') || msg.includes('sell') || msg.includes('flat') || msg.includes('plot');
        const hasBuyerKeywords = msg.includes('buyer') || msg.includes('client') || msg.includes('looking') || msg.includes('need') || msg.includes('requirement');

        if (hasPropertyKeywords && !hasBuyerKeywords) {
            // Mode 1: Partner has properties to list
            const systemPrompt = await SystemPromptService.getPartnerAgentPrompt({
                stage: 'HAS_PROPERTIES',
                partner_type: partnerProfile.partner_type
            });
            const reply = await this.llmService.generateResponseWithHistory(systemPrompt, message, contact.phone_number);

            if (partnerProfile.partner_type !== 'HAS_PROPERTIES' && partnerProfile.partner_type !== 'BOTH') {
                await prisma.partnerAgent.update({
                    where: { phone_number: contact.phone_number },
                    data: { partner_type: 'HAS_PROPERTIES' }
                });
            }

            return { action: 'reply', reply_script: reply };
        }

        if (hasBuyerKeywords && !hasPropertyKeywords) {
            // Mode 2: Partner has buyers
            const systemPrompt = await SystemPromptService.getPartnerAgentPrompt({
                stage: 'HAS_BUYERS',
                partner_type: partnerProfile.partner_type
            });
            const reply = await this.llmService.generateResponseWithHistory(systemPrompt, message, contact.phone_number);

            if (partnerProfile.partner_type !== 'HAS_BUYERS' && partnerProfile.partner_type !== 'BOTH') {
                await prisma.partnerAgent.update({
                    where: { phone_number: contact.phone_number },
                    data: { partner_type: 'HAS_BUYERS' }
                });
            }

            return { action: 'reply', reply_script: reply };
        }

        // General conversation
        const systemPrompt = await SystemPromptService.getPartnerAgentPrompt({
            stage: 'GENERAL',
            partner_type: partnerProfile.partner_type
        });
        const reply = await this.llmService.generateResponseWithHistory(systemPrompt, message, contact.phone_number);

        return { action: 'reply', reply_script: reply };
    }
}
