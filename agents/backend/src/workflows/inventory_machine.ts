import { sessionStore } from '../services/session/store';
import { LLMService } from '../services/llm';
import { SystemPromptService } from '../services/system_prompt';
import prisma from '../db';
import logger from '../utils/logger';

/**
 * Legacy inventory state machine (v1).
 *
 * NOTE: The active WhatsApp flow uses ConversationalWorkflowCore + WhatsAppWorkflowAdapter
 * which delegates to WorkflowEngine. This file is kept for backward compatibility
 * but is NOT actively imported anywhere.
 *
 * The v3 shortened flow has 10 stages:
 * Identity → Contact → Intent → Property Type → Config → Address → Key Holder → Media → Confirm → Enrichment (post-save)
 */

export enum InventoryState {
    START = 'START',
    IDENTITY_DETECTION = 'IDENTITY_DETECTION',
    CONTACT_COLLECTION = 'CONTACT_COLLECTION',
    INTENT_SELECTION = 'INTENT_SELECTION',
    PROPERTY_CATEGORY_SELECTION = 'PROPERTY_CATEGORY_SELECTION',
    PROPERTY_TYPE_SELECTION = 'PROPERTY_TYPE_SELECTION',
    LOCATION_COLLECTION = 'LOCATION_COLLECTION',
    KEY_HOLDER_COLLECTION = 'KEY_HOLDER_COLLECTION',
    MEDIA_COLLECTION = 'MEDIA_COLLECTION',
    SUMMARY_CONFIRMATION = 'SUMMARY_CONFIRMATION',
    COMMIT = 'COMMIT'
}

export class InventoryStateMachine {
    private llmService: LLMService;

    constructor() {
        this.llmService = new LLMService();
    }

    public async startSession(sessionId: string, intent: string, ownerPhone?: string) {
        const state = InventoryState.CONTACT_COLLECTION;

        await sessionStore.saveSession(sessionId, {
            id: sessionId,
            state: state,
            data: {
                intent,
                ownerPhone: ownerPhone || sessionId,
            },
            lastUpdated: Date.now()
        });

        return {
            state: state,
            reply: { text: 'Namaste! Let us list your property. Please share your name and phone number.', language: 'auto' }
        };
    }

    public async handleStep(sessionId: string, payload: any) {
        const session = await sessionStore.getSession(sessionId);
        if (!session) throw new Error('Session expired or invalid');

        let nextState = session.state;
        let replyText = '';
        const data = { ...session.data, ...payload };

        switch (session.state) {
            case InventoryState.CONTACT_COLLECTION:
                nextState = InventoryState.INTENT_SELECTION;
                replyText = 'Contact noted. Property sell karna hai ya rent/lease pe dena hai?';
                break;

            case InventoryState.INTENT_SELECTION:
                nextState = InventoryState.PROPERTY_CATEGORY_SELECTION;
                replyText = 'Property type kya hai? Residential, Commercial, ya Agricultural Land?';
                break;

            case InventoryState.PROPERTY_CATEGORY_SELECTION: {
                nextState = InventoryState.PROPERTY_TYPE_SELECTION;
                const userInput = (payload.category || payload.user_response || '').toLowerCase();
                const categories = await prisma.propertyCategory.findMany({
                    where: { is_active: true },
                    orderBy: { display_order: 'asc' },
                });
                const matchedCat = categories.find(c =>
                    c.slug === userInput || c.name.toLowerCase().includes(userInput)
                );

                if (matchedCat) {
                    data.categoryId = matchedCat.id;
                    data.category = matchedCat.slug;
                    const subCats = await prisma.propertySubCategory.findMany({
                        where: { category_id: matchedCat.id, is_active: true },
                        include: { property_types: { where: { is_active: true }, orderBy: { display_order: 'asc' } } },
                        orderBy: { display_order: 'asc' },
                    });
                    const typeNames = subCats.flatMap(sc => sc.property_types.map(t => t.name)).join(', ');
                    replyText = `${matchedCat.name} selected. Property type batayein: ${typeNames}`;
                } else {
                    data.category = userInput || 'residential';
                    replyText = 'Category noted. Property type kya hai? Flat, House, Villa, Plot, Office, Shop?';
                }
                break;
            }

            case InventoryState.PROPERTY_TYPE_SELECTION:
                nextState = InventoryState.LOCATION_COLLECTION;
                replyText = 'Property ka address aur locality kya hai? City bhi batayein.';
                break;

            case InventoryState.LOCATION_COLLECTION:
                nextState = InventoryState.KEY_HOLDER_COLLECTION;
                replyText = 'Property ki key kisne ke paas hai?\n\n1. Mere paas hai\n2. Kisi aur ke paas hai';
                break;

            case InventoryState.KEY_HOLDER_COLLECTION: {
                nextState = InventoryState.MEDIA_COLLECTION;
                const input = (payload.key_holder || payload.user_response || '').toLowerCase();
                if (input.includes('1') || input.includes('mere') || input.includes('main') || input.includes('my')) {
                    data.key_holder_type = 'I_HAVE_KEY';
                } else {
                    data.key_holder_type = 'SOMEONE_ELSE';
                }
                replyText = 'Photos ya video upload karna chahte ho? Ya "skip" bol do.';
                break;
            }

            case InventoryState.MEDIA_COLLECTION:
                nextState = InventoryState.SUMMARY_CONFIRMATION;
                replyText = this.buildSummary(data);
                break;

            case InventoryState.SUMMARY_CONFIRMATION:
                replyText = 'Waiting for confirmation...';
                break;
        }

        // Generate dynamic question via LLM
        if (nextState !== InventoryState.SUMMARY_CONFIRMATION && nextState !== InventoryState.KEY_HOLDER_COLLECTION) {
            try {
                const prompt = await SystemPromptService.getInventoryPrompt(nextState);
                const userLastInput = JSON.stringify(payload);
                replyText = await this.llmService.generateResponse(prompt, `User provided: ${userLastInput}. Ack and ask next question.`);
            } catch (err) {
                logger.warn('[InventoryMachine] LLM fallback for dynamic question', err);
            }
        }

        await sessionStore.saveSession(sessionId, {
            ...session,
            state: nextState,
            data: data,
            lastUpdated: Date.now()
        });

        return {
            state: nextState,
            reply: { text: replyText, language: 'auto' }
        };
    }

    private buildSummary(data: any): string {
        const keyHolderLabel = data.key_holder_type === 'I_HAVE_KEY' ? 'Uploader'
            : data.key_holder_type === 'SOMEONE_ELSE' ? `Someone else${data.key_holder_name ? ' (' + data.key_holder_name + ')' : ''}`
            : 'Not set';

        const lines = [
            `*Property Summary — Please Confirm*`,
            ``,
            `Category: ${data.category || 'N/A'}`,
            `Type: ${data.type || 'N/A'}`,
            `Location: ${data.location || data.locationText || 'N/A'}`,
            `Intent: ${data.intent || 'N/A'}`,
            `Key Holder: ${keyHolderLabel}`,
            ``,
            `Type *YES* to publish or *NO* to cancel.`,
        ];
        return lines.join('\n');
    }
}
