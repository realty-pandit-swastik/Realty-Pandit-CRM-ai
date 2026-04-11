/**
 * Inventory Agent — Wraps the InventoryStateMachine as a BaseAgent.
 *
 * Handles property listing collection through a multi-step state machine:
 * START → CATEGORY → TYPE → SPECS → AMENITIES → LOCATION → PRICE → MEDIA → EXTRAS → CONFIRM → COMMIT
 *
 * Can be triggered by SalesAgent (seller mode) or PartnerAgent for property onboarding.
 */

import { BaseAgent, AgentContext, AgentResponse } from './types';
import { InventoryStateMachine } from '../workflows/inventory_machine';
import logger from '../utils/logger';

export class InventoryAgent implements BaseAgent {
    readonly name = 'inventory' as const;
    private machine: InventoryStateMachine;

    constructor() {
        this.machine = new InventoryStateMachine();
    }

    async handle(context: AgentContext): Promise<AgentResponse> {
        const { contact, message, session } = context;
        const sessionId = `inv_${contact.phone_number}`;

        try {
            // If session state is START or no inventory session exists, begin new listing
            if (!session.context?.inventory_started) {
                const intent = contact.intent === 'rent' ? 'rent' : 'sell';
                const result = await this.machine.startSession(sessionId, intent, contact.phone_number);

                return {
                    action: 'reply',
                    reply_script: result.reply.text,
                    next_state: `inventory_${result.state}`,
                    quality_hint: 'confident',
                    metadata: {
                        inventory_started: true,
                        inventory_state: result.state,
                    },
                };
            }

            // Continue existing inventory collection
            const payload = this.parseUserInput(message, session.context?.inventory_state);
            const result = await this.machine.handleStep(sessionId, payload);

            // Check if listing is complete (SUMMARY_CONFIRMATION + user said YES)
            const isComplete = result.state === 'SUMMARY_CONFIRMATION' && message.toLowerCase().includes('yes');

            return {
                action: 'reply',
                reply_script: result.reply.text,
                next_state: isComplete ? 'inventory_complete' : `inventory_${result.state}`,
                quality_hint: 'confident',
                metadata: {
                    inventory_started: !isComplete,
                    inventory_state: result.state,
                    listing_complete: isComplete,
                },
            };
        } catch (error) {
            logger.error('[InventoryAgent] Error:', error);
            return {
                action: 'reply',
                reply_script: 'Sorry, something went wrong while collecting your property details. Let me start over.',
                quality_hint: 'uncertain',
                metadata: { inventory_started: false },
            };
        }
    }

    /**
     * Parse free-text user input into structured payload for the state machine.
     */
    private parseUserInput(message: string, currentState?: string): Record<string, any> {
        const msg = message.toLowerCase().trim();
        const payload: Record<string, any> = { raw_input: message };

        switch (currentState) {
            case 'PROPERTY_CATEGORY_SELECTION':
                payload.category = msg.includes('commercial') ? 'COMMERCIAL' : 'RESIDENTIAL';
                break;
            case 'PROPERTY_TYPE_SELECTION':
                if (msg.includes('flat') || msg.includes('apartment')) payload.type = 'flat';
                else if (msg.includes('house') || msg.includes('villa')) payload.type = 'house';
                else if (msg.includes('plot') || msg.includes('land')) payload.type = 'plot';
                else if (msg.includes('office')) payload.type = 'office';
                else if (msg.includes('shop')) payload.type = 'shop';
                else payload.type = msg;
                break;
            case 'LOCATION_COLLECTION':
                payload.location = message.trim();
                break;
            case 'PRICE_COLLECTION': {
                // Extract number and unit from user input
                const numMatch = message.match(/[\d,.]+/);
                payload.price = numMatch ? numMatch[0].replace(/,/g, '') : '0';
                payload.price_unit = msg.includes('crore') || msg.includes('cr') ? 'Crore' : 'Lakh';
                break;
            }
            default:
                payload.user_response = message;
                break;
        }

        return payload;
    }
}
