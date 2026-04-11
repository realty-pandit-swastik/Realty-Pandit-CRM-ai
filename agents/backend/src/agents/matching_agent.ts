/**
 * Matching Agent — Smart Property Matching Engine
 *
 * Dedicated agent for matching buyers/tenants with the right properties.
 * Uses subscription-priority ranking: Internal > PREMIUM > PRO > BASIC > FREE.
 *
 * Called by Sales Agent during QUALIFICATION → MATCHING transition.
 * Also callable directly by Master Orchestrator for PROPERTY domain intent.
 *
 * Implements BaseAgent interface.
 */

import { BaseAgent, AgentContext, AgentResponse } from './types';
import { MatchingEngine, MatchCriteria } from '../services/matching_engine';
import logger from '../utils/logger';

export class MatchingAgent implements BaseAgent {
    readonly name = 'matching' as const;
    private matchingEngine: MatchingEngine;

    constructor() {
        this.matchingEngine = new MatchingEngine();
    }

    async handle(context: AgentContext): Promise<AgentResponse> {
        const { contact, message } = context;
        const msg = message.toLowerCase();

        logger.info(`[MatchingAgent] Matching request from ${contact.phone_number}`);

        // Build match criteria from contact profile + current message
        const criteria = this.buildCriteria(context);

        // Check if buyer is asking for more results
        if (msg === 'more' || msg.includes('next') || msg.includes('aur dikhao')) {
            return this.handleMoreResults(context, criteria);
        }

        // Check if buyer selected a specific property number
        const propertyNumber = this.extractPropertySelection(msg);
        if (propertyNumber) {
            return this.handlePropertySelection(context, propertyNumber);
        }

        // Default: Run matching
        return this.runMatching(context, criteria);
    }

    /**
     * Build match criteria from contact data and message context.
     */
    private buildCriteria(context: AgentContext): MatchCriteria {
        const { contact, message } = context;
        const msg = message.toLowerCase();

        const criteria: MatchCriteria = {
            intent: contact.intent || (contact.contact_type === 'BUYER_TENANT' ? 'BUYER' : null),
            property_type: contact.property_type,
            budget_min: contact.budget_min,
            budget_max: contact.budget_max,
            preferred_location: contact.preferred_location,
        };

        // Extract BHK from message if mentioned
        const bhkMatch = msg.match(/(\d)\s*bhk/);
        if (bhkMatch) {
            criteria.bhk = parseInt(bhkMatch[1]);
        }

        // Extract budget from message if mentioned (e.g., "50 lakh", "1 crore")
        const budgetMatch = msg.match(/(\d+\.?\d*)\s*(lakh|lac|crore|cr)/i);
        if (budgetMatch) {
            const amount = parseFloat(budgetMatch[1]);
            const unit = budgetMatch[2].toLowerCase();
            const value = unit.startsWith('cr') ? amount * 10000000 : amount * 100000;

            if (!criteria.budget_max || value > criteria.budget_max) {
                criteria.budget_max = value;
            }
            if (!criteria.budget_min) {
                criteria.budget_min = value * 0.7; // 30% below mentioned budget
            }
        }

        // Extract property type from message
        if (!criteria.property_type) {
            const typeMap: Record<string, string> = {
                'flat': 'flat', 'apartment': 'flat',
                'house': 'house', 'villa': 'house', 'bungalow': 'house',
                'plot': 'plot', 'land': 'plot',
                'office': 'office', 'shop': 'shop',
            };
            for (const [keyword, type] of Object.entries(typeMap)) {
                if (msg.includes(keyword)) {
                    criteria.property_type = type;
                    break;
                }
            }
        }

        // Extract location from message (if not already set)
        if (!criteria.preferred_location) {
            const knownAreas = [
                'noida', 'greater noida', 'gurgaon', 'gurugram', 'faridabad',
                'ghaziabad', 'delhi', 'mumbai', 'bangalore', 'pune', 'hyderabad', 'chennai',
                'vaishali', 'indirapuram', 'vasundhara', 'kaushambi', 'raj nagar',
                'crossing republik', 'gaur city', 'panchsheel',
                'dwarka', 'rohini', 'laxmi nagar', 'saket', 'nehru place',
            ];
            const cities = [
                'noida', 'greater noida', 'gurgaon', 'gurugram', 'ghaziabad',
                'delhi', 'faridabad', 'mumbai', 'bangalore', 'pune', 'hyderabad', 'chennai',
            ];
            for (const area of knownAreas) {
                if (msg.includes(area)) {
                    let location = area;
                    const afterArea = msg.substring(msg.indexOf(area) + area.length);
                    const sectorMatch = afterArea.match(/\s*(?:sector|sec)\s*(\d+)/i);
                    if (sectorMatch) {
                        location += ' sector ' + sectorMatch[1];
                    }
                    if (!cities.includes(area)) {
                        for (const city of cities) {
                            if (msg.includes(city) && city !== area) {
                                location += ', ' + city;
                                break;
                            }
                        }
                    }
                    criteria.preferred_location = location;
                    break;
                }
            }
            // Standalone "sector X" pattern
            if (!criteria.preferred_location) {
                const sectorPattern = msg.match(/sector\s*(\d+)/i);
                if (sectorPattern) {
                    let loc = 'sector ' + sectorPattern[1];
                    for (const city of cities) {
                        if (msg.includes(city)) { loc += ', ' + city; break; }
                    }
                    criteria.preferred_location = loc;
                }
            }
        }

        return criteria;
    }

    /**
     * Run the matching engine and return formatted results.
     */
    private async runMatching(context: AgentContext, criteria: MatchCriteria): Promise<AgentResponse> {
        const matches = await this.matchingEngine.findMatches(criteria, 3);

        if (matches.length === 0) {
            return {
                action: 'reply',
                reply_script: `I searched our inventory but couldn't find an exact match for your criteria right now.\n\n` +
                    `*Your preferences:*\n` +
                    `${criteria.property_type ? `Type: ${criteria.property_type}\n` : ''}` +
                    `${criteria.preferred_location ? `Location: ${criteria.preferred_location}\n` : ''}` +
                    `${criteria.budget_max ? `Budget: up to ₹${(criteria.budget_max / 100000).toFixed(0)} Lakh\n` : ''}` +
                    `\nWould you like to:\n1. Broaden your location?\n2. Adjust your budget?\n3. Get notified when matching properties are listed?`,
                quality_hint: 'confident',
                metadata: {
                    match_count: 0,
                    criteria: criteria,
                    lifecycle_stage: 'QUALIFIED', // They have criteria, just no match yet
                },
            };
        }

        // Format results for WhatsApp
        const formattedMsg = this.matchingEngine.formatMatchesForWhatsApp(matches);

        // Collect media attachments (first image from each match with photos)
        const media = matches
            .filter(m => m.media_urls && m.media_urls.length > 0)
            .map((m, i) => {
                const specs = m.specs ? (typeof m.specs === 'string' ? JSON.parse(m.specs) : m.specs) : {};
                const bhk = specs.bedrooms ? `${specs.bedrooms}BHK ` : '';
                return {
                    url: m.media_urls[0],
                    caption: `${bhk}${m.type.toUpperCase()} - ${m.location || 'Location TBD'}`,
                    type: 'image' as const,
                };
            });

        return {
            action: 'reply',
            reply_script: formattedMsg,
            next_state: 'MATCHING',
            quality_hint: 'confident',
            media: media.length > 0 ? media : undefined,
            metadata: {
                match_count: matches.length,
                match_ids: matches.map(m => m.id),
                top_score: matches[0]?.match_score,
                criteria: criteria,
                lifecycle_stage: 'MATCHED',
                lead_status: 'warm',
            },
        };
    }

    /**
     * Handle "more" / pagination request.
     */
    private async handleMoreResults(context: AgentContext, criteria: MatchCriteria): Promise<AgentResponse> {
        // Get session context for offset
        const offset = context.session?.context?.match_offset || 3;
        const matches = await this.matchingEngine.findMatches(criteria, 3);

        if (matches.length === 0) {
            return {
                action: 'reply',
                reply_script: "I've shown you all the matching properties we have right now. Would you like to adjust your criteria, or shall I notify you when new properties are listed?",
                quality_hint: 'confident',
            };
        }

        const formattedMsg = this.matchingEngine.formatMatchesForWhatsApp(matches);

        const media = matches
            .filter(m => m.media_urls && m.media_urls.length > 0)
            .map(m => {
                const specs = m.specs ? (typeof m.specs === 'string' ? JSON.parse(m.specs) : m.specs) : {};
                const bhk = specs.bedrooms ? `${specs.bedrooms}BHK ` : '';
                return { url: m.media_urls[0], caption: `${bhk}${m.type.toUpperCase()} - ${m.location || 'Location TBD'}`, type: 'image' as const };
            });

        return {
            action: 'reply',
            reply_script: formattedMsg,
            quality_hint: 'confident',
            media: media.length > 0 ? media : undefined,
            metadata: {
                match_count: matches.length,
                match_offset: offset + 3,
            },
        };
    }

    /**
     * Handle when buyer selects a specific property by number.
     */
    private async handlePropertySelection(context: AgentContext, propertyNumber: number): Promise<AgentResponse> {
        // Get previously shown match IDs from session
        const matchIds = context.session?.context?.match_ids;

        if (!matchIds || propertyNumber > matchIds.length) {
            return {
                action: 'reply',
                reply_script: `Please select a valid property number. Type a number between 1 and ${matchIds?.length || '5'}.`,
                quality_hint: 'confident',
            };
        }

        const propertyId = matchIds[propertyNumber - 1];

        // Fetch full property details
        const property = await this.fetchPropertyDetails(propertyId);

        if (!property) {
            return {
                action: 'reply',
                reply_script: "Sorry, I couldn't find that property. It may have been removed. Let me search for more options.",
                quality_hint: 'uncertain',
            };
        }

        return {
            action: 'reply',
            reply_script: property,
            quality_hint: 'confident',
            metadata: {
                selected_property_id: propertyId,
                lifecycle_stage: 'MATCHED',
            },
        };
    }

    /**
     * Extract property selection number from message.
     */
    private extractPropertySelection(msg: string): number | null {
        // Match single digit or "property 2", "option 3", etc.
        const numMatch = msg.match(/^(\d)$/) || msg.match(/(?:property|option|number)\s*(\d)/);
        if (numMatch) {
            const num = parseInt(numMatch[1]);
            if (num >= 1 && num <= 10) return num;
        }
        return null;
    }

    /**
     * Fetch and format full property details for display.
     */
    private async fetchPropertyDetails(propertyId: string): Promise<string | null> {
        try {
            const { PrismaClient } = require('@prisma/client');
            const prisma = require('../db').default;

            const prop = await prisma.inventory.findUnique({
                where: { id: propertyId },
                include: {
                    contact: { select: { name: true } },
                },
            });

            if (!prop) return null;

            const specs = prop.specs ? (typeof prop.specs === 'string' ? JSON.parse(prop.specs) : prop.specs) : {};
            const features = prop.features ? (typeof prop.features === 'string' ? JSON.parse(prop.features) : prop.features) : {};

            const price = prop.price
                ? `₹${prop.price_unit === 'Crore' || prop.price_unit === 'Cr' ? (Number(prop.price) / 10000000).toFixed(1) + ' Cr' : (Number(prop.price) / 100000).toFixed(1) + ' Lakh'}`
                : 'Price on request';

            let detail = `*🏠 Property Details*\n\n`;
            detail += `*Type:* ${prop.type.toUpperCase()} (${prop.category})\n`;
            detail += `*Price:* ${price}\n`;
            detail += `*Location:* ${prop.location || 'TBD'}\n`;
            detail += `*For:* ${prop.intent === 'sell' ? 'Sale' : 'Rent'}\n`;

            if (specs.bedrooms) detail += `*Bedrooms:* ${specs.bedrooms}\n`;
            if (specs.bathrooms) detail += `*Bathrooms:* ${specs.bathrooms}\n`;
            if (specs.area) detail += `*Area:* ${specs.area} ${specs.area_unit || 'sqft'}\n`;

            // Features
            const featureList = Object.entries(features)
                .filter(([_, v]) => v)
                .map(([k]) => k.replace(/_/g, ' '))
                .join(', ');
            if (featureList) detail += `*Features:* ${featureList}\n`;

            detail += `\n*Interested?* Reply:\n`;
            detail += `• "schedule visit" to book a site visit\n`;
            detail += `• "more info" for additional details\n`;
            detail += `• "back" to see other properties`;

            return detail;
        } catch (error) {
            logger.error('[MatchingAgent] Failed to fetch property:', error);
            return null;
        }
    }
}
