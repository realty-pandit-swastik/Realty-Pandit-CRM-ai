/**
 * Partner Agent — Handles external property dealers/agents.
 *
 * Manages: inventory listing, buyer lead capture + matching, visit queries, price updates.
 *
 * Buyer Lead Flow (HAS_BUYERS):
 * 1. Partner says they have a buyer → start partner_buyer session
 * 2. LLM extracts requirements (intent, type, location, budget) from natural conversation
 * 3. When requirements complete → auto-create Deal + run MatchingEngine
 * 4. Send matched properties ONE AT A TIME (like/skip)
 * 5. "Like" → schedule visit, "Skip" → next property
 */

import { BaseAgent, AgentContext, AgentResponse } from './types';
import { LLMService } from '../services/llm';
import { SystemPromptService } from '../services/system_prompt';
import { InventoryStateMachine, InventoryState } from '../workflows/inventory_machine';
import { MatchingEngine, MatchedProperty } from '../services/matching_engine';
import { sessionStore } from '../services/session/store';
import { phoneVariants, normalizePhone } from '../utils/phone';
import prisma from '../db';
import logger from '../utils/logger';

// ─── Partner Buyer Session Types ─────────────────────────────────────────────

interface BuyerRequirements {
    customer_name?: string;
    customer_phone?: string;
    intent?: string;         // buy | rent_lease
    property_type?: string;  // flat, house, plot, office, shop, etc.
    category?: string;       // residential, commercial
    location?: string;
    budget?: string;         // raw text like "50k/month" or "1 crore"
    bhk?: string;            // "2", "3", etc.
}

interface PartnerBuyerSession {
    state: 'collecting' | 'browsing' | 'scheduling';
    requirements: BuyerRequirements;
    deal_id?: string;
    matches: MatchedProperty[];
    current_index: number;         // which property we're showing
    shown_property_ids: string[];  // track what partner has already seen
}

// Budget parsing (reused from buyer_workflow_engine.ts)
function parseBudget(text: string): { min: number; max: number } | null {
    if (!text) return null;
    const lower = text.toLowerCase().trim();

    const rangeMatch = lower.match(/(\d+\.?\d*)\s*(crore|cr|lakh|lac|lacs|k|thousand)?\s*(?:to|-|se)\s*(\d+\.?\d*)\s*(crore|cr|lakh|lac|lacs|k|thousand)?/i);
    if (rangeMatch) {
        const unit1 = rangeMatch[2] || rangeMatch[4] || 'lakh';
        const unit2 = rangeMatch[4] || unit1;
        const min = parseFloat(rangeMatch[1]) * getMultiplier(unit1);
        const max = parseFloat(rangeMatch[3]) * getMultiplier(unit2);
        return { min, max };
    }

    const patterns = [
        { regex: /(\d+\.?\d*)\s*(crore|cr)\b/i, multiplier: 10_000_000 },
        { regex: /(\d+\.?\d*)\s*(lakh|lac|lacs)\b/i, multiplier: 100_000 },
        { regex: /(\d+\.?\d*)\s*(k|thousand|hazar)\b/i, multiplier: 1_000 },
        { regex: /(\d+)\s*(?:per\s*month|monthly|\/month|pm|mahine)\b/i, multiplier: 1 },
    ];
    for (const { regex, multiplier } of patterns) {
        const m = lower.match(regex);
        if (m) {
            const val = parseFloat(m[1]) * multiplier;
            return { min: val * 0.7, max: val };
        }
    }

    const plainNum = parseFloat(lower.replace(/[,\s]/g, ''));
    if (!isNaN(plainNum) && plainNum > 0) {
        return { min: plainNum * 0.7, max: plainNum };
    }
    return null;
}

function getMultiplier(unit: string): number {
    const u = unit.toLowerCase();
    if (u === 'crore' || u === 'cr') return 10_000_000;
    if (u === 'lakh' || u === 'lac' || u === 'lacs') return 100_000;
    if (u === 'k' || u === 'thousand' || u === 'hazar') return 1_000;
    return 1;
}

function formatPrice(amount: number): string {
    if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(1)} Cr`;
    if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(1)} Lakh`;
    return `₹${amount.toLocaleString('en-IN')}`;
}

// ─── Main Handler ────────────────────────────────────────────────────────────

export class PartnerAgentHandler implements BaseAgent {
    readonly name = 'partner' as const;
    private llmService: LLMService;
    private inventoryMachine: InventoryStateMachine;
    private matchingEngine: MatchingEngine;

    constructor() {
        this.llmService = new LLMService();
        this.inventoryMachine = new InventoryStateMachine();
        this.matchingEngine = new MatchingEngine();
    }

    async handle(context: AgentContext): Promise<AgentResponse> {
        const { contact, message } = context;
        logger.info(`[PartnerAgent] Handling message for ${contact.phone_number}`);

        // Check if partner profile exists
        const variants = phoneVariants(contact.phone_number);
        const partnerProfile = await (prisma.partnerAgent as any).findFirst({
            where: { phone_number: { in: variants } },
            include: {
                managing_agent: { select: { name: true, phone: true, email: true } },
            },
        }) as any;

        if (!partnerProfile) {
            return {
                action: 'reply',
                reply_script: `Welcome to Realty Pandit Partner Program! 🏢\n\nTo get started as a partner agent, please register at:\n/agent/register\n\nOr contact our team for assistance.`,
                quality_hint: 'confident',
                metadata: { reason: 'no_partner_profile' },
            };
        }

        // Sync contact name if missing
        if (!contact.name && partnerProfile.name) {
            prisma.contact.update({
                where: { phone_number: contact.phone_number },
                data: { name: partnerProfile.name },
            }).catch(() => {});
        }

        const msg = message.toLowerCase().trim();

        // ─── CHECK FOR ACTIVE PARTNER BUYER SESSION ──────────────────
        const buyerSession = await this.getBuyerSession(contact.phone_number);
        if (buyerSession) {
            // Handle cancel/exit
            if (msg === 'cancel' || msg === 'exit' || msg === 'stop' || msg === 'band karo') {
                await this.deleteBuyerSession(contact.phone_number);
                return {
                    action: 'reply',
                    reply_script: `Buyer search cancelled. How else can I help you, ${partnerProfile.name}?`,
                    quality_hint: 'confident',
                    metadata: { mode: 'buyer_cancelled' },
                };
            }

            return this.handleBuyerSession(contact, message, buyerSession, partnerProfile);
        }

        // ─── CHECK FOR ACTIVE INVENTORY SESSION ─────────────────────
        const activeSession = await sessionStore.getSession(contact.phone_number);
        if (activeSession && activeSession.state !== InventoryState.COMMIT) {
            const result = await this.inventoryMachine.handleStep(contact.phone_number, { text: message });
            return {
                action: 'reply',
                reply_script: result.reply.text,
                quality_hint: 'confident',
                metadata: { mode: 'inventory_collection', state: result.state },
            };
        }

        // ─── INTENT DETECTION ───────────────────────────────────────

        // Intent: Add Inventory
        if (msg.includes('add') && (msg.includes('property') || msg.includes('flat') || msg.includes('list') || msg.includes('inventory'))) {
            const result = await this.inventoryMachine.startSession(contact.phone_number, 'sell', contact.phone_number);
            return {
                action: 'reply',
                reply_script: result.reply.text,
                quality_hint: 'confident',
                metadata: { mode: 'inventory_start' },
            };
        }

        // Intent: Check Visits
        if (msg.includes('visit') || msg.includes('appointment')) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const visits = await prisma.scheduledVisit.findMany({
                where: {
                    agent_id: partnerProfile.id,
                    preferred_date: { gte: today, lt: tomorrow },
                },
            });

            if (visits.length === 0) {
                return {
                    action: 'reply',
                    reply_script: 'No visits scheduled for today yet.',
                    quality_hint: 'confident',
                };
            }

            const visitList = visits.map(v =>
                `- ${v.preferred_time || 'Time TBD'}: ${v.name} (${v.buyer_info_masked ? 'Hidden' : v.phone})`,
            ).join('\n');

            return {
                action: 'reply',
                reply_script: `📅 You have ${visits.length} visit(s) today:\n\n${visitList}`,
                quality_hint: 'confident',
                metadata: { visit_count: visits.length },
            };
        }

        // Intent: Update Listing
        if (msg.includes('update') && (msg.includes('rent') || msg.includes('price'))) {
            return {
                action: 'reply',
                reply_script: 'Please use your Dashboard (/agent/inventory) to update pricing for security reasons.',
                quality_hint: 'confident',
            };
        }

        // ─── BUYER INTENT DETECTION → START BUYER SESSION ────────────
        const hasBuyerKeywords = msg.includes('buyer') || msg.includes('client') || msg.includes('customer')
            || msg.includes('looking') || msg.includes('requirement') || msg.includes('chahiye')
            || msg.includes('dhundh') || msg.includes('khoj') || msg.includes('mere pass ek')
            || msg.includes('mera customer') || msg.includes('mera client')
            || (msg.includes('need') && !msg.includes('add'));
        const hasPropertyKeywords = msg.includes('property') || msg.includes('list') || msg.includes('sell')
            || msg.includes('flat') || msg.includes('plot');

        if (hasBuyerKeywords && !hasPropertyKeywords) {
            // Start a new buyer lead capture session
            const session: PartnerBuyerSession = {
                state: 'collecting',
                requirements: {},
                matches: [],
                current_index: 0,
                shown_property_ids: [],
            };

            // Try to extract any requirements already mentioned in this first message
            const extracted = await this.extractRequirementsFromLLM(message, {}, partnerProfile.name);
            if (extracted.requirements) {
                Object.assign(session.requirements, extracted.requirements);
            }

            await this.saveBuyerSession(contact.phone_number, session);

            // Update partner_type
            if (partnerProfile.partner_type !== 'HAS_BUYERS' && partnerProfile.partner_type !== 'BOTH') {
                await prisma.partnerAgent.update({
                    where: { id: partnerProfile.id },
                    data: { partner_type: 'HAS_BUYERS' },
                }).catch(() => {});
            }

            // Check if requirements are already complete from first message
            if (this.isRequirementsComplete(session.requirements)) {
                return this.commitAndMatch(contact, session, partnerProfile);
            }

            // Ask for missing info
            const missing = this.getMissingFields(session.requirements);
            const reply = extracted.reply || this.buildCollectionPrompt(partnerProfile.name, session.requirements, missing);

            return {
                action: 'reply',
                reply_script: reply,
                quality_hint: 'confident',
                metadata: { mode: 'buyer_intake_started', extracted: session.requirements },
            };
        }

        // ─── DEFAULT: LLM GENERAL CONVERSATION ──────────────────────
        let stage = 'GENERAL';
        if (hasPropertyKeywords) stage = 'HAS_PROPERTIES';

        if (stage !== 'GENERAL' && partnerProfile.partner_type !== stage && partnerProfile.partner_type !== 'BOTH') {
            await prisma.partnerAgent.update({
                where: { id: partnerProfile.id },
                data: { partner_type: stage },
            }).catch(() => {});
        }

        let listingCount = 0;
        try {
            const owner = await prisma.owner.findUnique({
                where: { contact_phone: partnerProfile.phone_number },
                select: { _count: { select: { inventory: { where: { status: 'active' } } } } },
            });
            listingCount = owner?._count?.inventory ?? 0;
        } catch { /* non-blocking */ }

        const systemPrompt = await SystemPromptService.getPartnerAgentPrompt({
            stage,
            partner_type: partnerProfile.partner_type,
            partner_name: partnerProfile.name,
            coordinator_name: (partnerProfile as any).managing_agent?.name || null,
            listing_count: listingCount,
        });
        const reply = await this.llmService.generateResponseWithHistory(systemPrompt, message, contact.phone_number);

        return {
            action: 'reply',
            reply_script: reply,
            quality_hint: 'confident',
            metadata: { stage },
        };
    }

    // ─── BUYER SESSION HANDLER ───────────────────────────────────────────────

    private async handleBuyerSession(
        contact: AgentContext['contact'],
        message: string,
        session: PartnerBuyerSession,
        partnerProfile: any,
    ): Promise<AgentResponse> {
        // ── BROWSING STATE: handle like/skip/schedule ──
        if (session.state === 'browsing') {
            return this.handleBrowsing(contact, message, session, partnerProfile);
        }

        // ── SCHEDULING STATE: handle visit scheduling ──
        if (session.state === 'scheduling') {
            return this.handleScheduling(contact, message, session, partnerProfile);
        }

        // ── COLLECTING STATE: extract requirements from conversation ──
        const extracted = await this.extractRequirementsFromLLM(
            message,
            session.requirements,
            partnerProfile.name,
        );

        // Merge extracted fields
        if (extracted.requirements) {
            for (const [key, val] of Object.entries(extracted.requirements)) {
                if (val) (session.requirements as any)[key] = val;
            }
        }

        // Check if complete
        if (this.isRequirementsComplete(session.requirements)) {
            await this.saveBuyerSession(contact.phone_number, session);
            return this.commitAndMatch(contact, session, partnerProfile);
        }

        // Save progress and ask for more
        await this.saveBuyerSession(contact.phone_number, session);

        const missing = this.getMissingFields(session.requirements);
        const reply = extracted.reply || this.buildCollectionPrompt(partnerProfile.name, session.requirements, missing);

        return {
            action: 'reply',
            reply_script: reply,
            quality_hint: 'confident',
            metadata: { mode: 'buyer_collecting', requirements: session.requirements, missing },
        };
    }

    // ─── BROWSING: One property at a time ────────────────────────────────────

    private async handleBrowsing(
        contact: AgentContext['contact'],
        message: string,
        session: PartnerBuyerSession,
        partnerProfile: any,
    ): Promise<AgentResponse> {
        const msg = message.toLowerCase().trim();

        // "Like" / "Interested" / "1" / "haan" / "yes" / "book" / "schedule"
        const isLike = msg === '1' || msg === 'like' || msg === 'yes' || msg === 'haan'
            || msg === 'ha' || msg.includes('interested') || msg.includes('book')
            || msg.includes('schedule') || msg.includes('pasand');

        // "Skip" / "Next" / "2" / "nahi" / "no" / "agle"
        const isSkip = msg === '2' || msg === 'skip' || msg === 'next' || msg === 'no'
            || msg === 'nahi' || msg === 'nah' || msg.includes('agle') || msg.includes('next');

        // "More" / "aur dikhao"
        const isMore = msg.includes('more') || msg.includes('aur') || msg.includes('dikhao');

        if (isLike) {
            const currentProperty = session.matches[session.current_index];
            if (!currentProperty) {
                return this.noMoreProperties(contact, session, partnerProfile);
            }

            // Move to scheduling
            session.state = 'scheduling';
            await this.saveBuyerSession(contact.phone_number, session);

            const propDesc = `${currentProperty.type} in ${currentProperty.location || 'the listed area'}`;
            return {
                action: 'reply',
                reply_script: `Great choice! 👍\n\nLet me schedule a visit for *${propDesc}*.\n\nWhen would your customer like to visit?\nPlease share preferred date and time.\n\n_Example: "Kal 3 baje" or "15 March 11 AM"_`,
                quality_hint: 'confident',
                metadata: { mode: 'buyer_scheduling', property_id: currentProperty.id },
            };
        }

        if (isSkip || isMore) {
            session.current_index += 1;
            await this.saveBuyerSession(contact.phone_number, session);

            if (session.current_index >= session.matches.length) {
                return this.noMoreProperties(contact, session, partnerProfile);
            }

            const propertyCard = this.formatSingleProperty(session.matches[session.current_index], session.current_index + 1, session.matches.length);
            return {
                action: 'reply',
                reply_script: propertyCard,
                quality_hint: 'confident',
                metadata: { mode: 'buyer_browsing', index: session.current_index },
            };
        }

        // Unknown input in browsing — re-show current property
        return {
            action: 'reply',
            reply_script: `Reply *1* to schedule a visit for this property, or *2* to see the next one.\n\nType *cancel* to exit search.`,
            quality_hint: 'confident',
            metadata: { mode: 'buyer_browsing_help' },
        };
    }

    // ─── SCHEDULING: Book visit for liked property ───────────────────────────

    private async handleScheduling(
        contact: AgentContext['contact'],
        message: string,
        session: PartnerBuyerSession,
        partnerProfile: any,
    ): Promise<AgentResponse> {
        const currentProperty = session.matches[session.current_index];
        if (!currentProperty) {
            session.state = 'browsing';
            await this.saveBuyerSession(contact.phone_number, session);
            return { action: 'reply', reply_script: 'Property not found. Showing next...', quality_hint: 'confident' };
        }

        // Try to parse date/time from message
        const dateInfo = this.parseDateTimeFromText(message);

        try {
            const tenant = await prisma.tenant.findFirst();
            if (!tenant) throw new Error('No tenant');

            // Create scheduled visit
            const visitPhone = session.requirements.customer_phone || contact.phone_number;
            await prisma.scheduledVisit.create({
                data: {
                    contact_id: visitPhone,
                    property_id: currentProperty.id,
                    agent_id: partnerProfile.id,
                    name: session.requirements.customer_name || partnerProfile.name,
                    phone: visitPhone,
                    preferred_date: dateInfo.date,
                    preferred_time: dateInfo.timeStr || 'To be confirmed',
                    status: 'scheduled',
                    source: 'whatsapp_partner',
                    buyer_info_masked: false,
                },
            });

            // Log interaction
            await prisma.interaction.create({
                data: {
                    tenant_id: tenant.id,
                    phone_number: contact.phone_number,
                    channel: 'whatsapp',
                    direction: 'inbound',
                    event_type: 'partner_visit_scheduled',
                    content: JSON.stringify({
                        property_id: currentProperty.id,
                        deal_id: session.deal_id,
                        customer: session.requirements.customer_name,
                        preferred_date: dateInfo.date,
                        preferred_time: dateInfo.timeStr,
                    }),
                },
            }).catch(() => {});

            // Notify deal event if deal exists
            if (session.deal_id) {
                try {
                    const { notifyDealEvent } = await import('../services/deal_notifications');
                    notifyDealEvent({ dealId: session.deal_id, event: 'status_changed', newStatus: 'VISIT_SCHEDULED' }).catch(() => {});
                } catch {}
            }

        } catch (err) {
            logger.error('[PartnerAgent] Visit scheduling failed:', err);
        }

        // Move to next property or end
        const propDesc = `${currentProperty.type} in ${currentProperty.location || 'the area'}`;
        let nextMsg = '';

        if (session.current_index + 1 < session.matches.length) {
            session.current_index += 1;
            session.state = 'browsing';
            await this.saveBuyerSession(contact.phone_number, session);

            const nextCard = this.formatSingleProperty(session.matches[session.current_index], session.current_index + 1, session.matches.length);
            nextMsg = `\n\n---\n\nHere's the next property:\n\n${nextCard}`;
        } else {
            await this.deleteBuyerSession(contact.phone_number);
            nextMsg = `\n\nThat was the last matching property. Our coordinator will follow up with visit details. You can also check deal status on your portal at /agent/deals`;
        }

        return {
            action: 'reply',
            reply_script: `✅ Visit scheduled for *${propDesc}*!\n📅 ${dateInfo.timeStr || message}\n\nOur coordinator will confirm the exact timing with the property owner.${nextMsg}`,
            quality_hint: 'confident',
            metadata: { mode: 'visit_scheduled', property_id: currentProperty.id },
        };
    }

    // ─── COMMIT DEAL + RUN MATCHING ──────────────────────────────────────────

    private async commitAndMatch(
        contact: AgentContext['contact'],
        session: PartnerBuyerSession,
        partnerProfile: any,
    ): Promise<AgentResponse> {
        const req = session.requirements;
        const budget = parseBudget(req.budget || '');

        try {
            const { createDeal } = await import('../services/deal_service');
            const tenant = await prisma.tenant.findFirst();
            if (!tenant) throw new Error('No tenant');

            // Create or find contact for the buyer
            const buyerPhone = normalizePhone(req.customer_phone || '') || contact.phone_number;
            const buyerContact = await prisma.contact.upsert({
                where: { phone_number: buyerPhone },
                update: {
                    name: req.customer_name || undefined,
                    contact_type: req.intent === 'rent_lease' ? 'TENANT' : 'BUYER',
                    intent: req.intent === 'rent_lease' ? 'rent' : 'buy',
                    property_type: req.property_type || undefined,
                    budget_min: budget?.min || undefined,
                    budget_max: budget?.max || undefined,
                    preferred_location: req.location || undefined,
                    lead_status: 'warm',
                    lifecycle_stage: 'QUALIFIED',
                    source: 'whatsapp',
                    last_channel: 'whatsapp',
                    last_interaction: new Date(),
                },
                create: {
                    phone_number: buyerPhone,
                    tenant_id: tenant.id,
                    name: req.customer_name || `${partnerProfile.name}'s Customer`,
                    contact_type: req.intent === 'rent_lease' ? 'TENANT' : 'BUYER',
                    intent: req.intent === 'rent_lease' ? 'rent' : 'buy',
                    property_type: req.property_type || undefined,
                    budget_min: budget?.min || undefined,
                    budget_max: budget?.max || undefined,
                    preferred_location: req.location || undefined,
                    lead_status: 'warm',
                    lifecycle_stage: 'QUALIFIED',
                    source: 'whatsapp',
                    last_channel: 'whatsapp',
                    last_interaction: new Date(),
                },
            });

            // Create deal with 3-role structure
            const txType = req.intent === 'rent_lease' ? 'RENT' : 'SALE';
            const result = await createDeal(
                {
                    tenant_id: tenant.id,
                    demand_contact_id: buyerContact.phone_number,
                    demand_handler_type: 'PARTNER',
                    demand_handler_id: partnerProfile.id,
                    type: txType as any,
                    source: 'whatsapp',
                    demand_intent: req.intent || undefined,
                    demand_category: req.category || undefined,
                    demand_type_slug: req.property_type || undefined,
                    demand_property_type: req.property_type || undefined,
                    demand_location: req.location || undefined,
                    demand_budget_min: budget?.min || undefined,
                    demand_budget_max: budget?.max || undefined,
                    demand_budget_type: req.intent === 'rent_lease' ? 'per_month' : 'one_time',
                    demand_bedrooms: req.bhk ? `${req.bhk}BHK` : undefined,
                    demand_notes: `Partner: ${partnerProfile.name}. Customer: ${req.customer_name || 'unnamed'}`,
                },
                `partner:${partnerProfile.id}`,
                'whatsapp',
            );

            session.deal_id = result.deal.id;
            session.matches = result.matches;
            session.current_index = 0;
            session.state = 'browsing';

            logger.info(`[PartnerAgent] Deal created: ${result.deal.id}, matches: ${result.matches.length}, duplicate: ${result.isDuplicate}`);

            // Log interaction
            await prisma.interaction.create({
                data: {
                    tenant_id: tenant.id,
                    phone_number: contact.phone_number,
                    channel: 'whatsapp',
                    direction: 'inbound',
                    event_type: 'partner_buyer_lead_committed',
                    content: JSON.stringify({
                        deal_id: result.deal.id,
                        requirements: req,
                        match_count: result.matches.length,
                    }),
                },
            }).catch(() => {});

            // If no matches found, try harder with more matches
            if (session.matches.length === 0) {
                try {
                    session.matches = await this.matchingEngine.findMatches({
                        intent: req.intent === 'rent_lease' ? 'rent' : 'buy',
                        property_type: req.property_type || undefined,
                        budget_min: budget?.min || undefined,
                        budget_max: budget?.max || undefined,
                        preferred_location: req.location || undefined,
                        bhk: req.bhk ? parseInt(req.bhk, 10) : undefined,
                    }, 10);
                } catch {}
            }

            await this.saveBuyerSession(contact.phone_number, session);

            // Build response
            const summaryLines = [];
            if (req.property_type) summaryLines.push(`Type: ${req.property_type}${req.bhk ? ` (${req.bhk} BHK)` : ''}`);
            if (req.location) summaryLines.push(`Location: ${req.location}`);
            if (budget) summaryLines.push(`Budget: ${formatPrice(budget.min)} - ${formatPrice(budget.max)}`);
            if (req.intent) summaryLines.push(`For: ${req.intent === 'rent_lease' ? 'Rent' : 'Purchase'}`);

            let reply = `✅ *Buyer lead registered!*\n\n📋 *Requirements:*\n${summaryLines.map(l => `  • ${l}`).join('\n')}`;

            if (result.isDuplicate) {
                reply += `\n\n_Note: A similar lead already exists. Using existing deal._`;
            }

            if (session.matches.length > 0) {
                reply += `\n\n🏠 *${session.matches.length} matching properties found!*\nShowing one at a time — reply *1* to schedule visit, *2* to skip.\n\n`;
                reply += this.formatSingleProperty(session.matches[0], 1, session.matches.length);
            } else {
                reply += `\n\nNo exact matches found right now. Our coordinator will search and get back to you.\n\nYou can also check your deal on the portal: /agent/deals`;
                await this.deleteBuyerSession(contact.phone_number);
            }

            return {
                action: 'reply',
                reply_script: reply,
                quality_hint: 'confident',
                metadata: { mode: 'buyer_committed', deal_id: result.deal.id, match_count: session.matches.length },
            };

        } catch (err) {
            logger.error('[PartnerAgent] Deal creation failed:', err);
            await this.deleteBuyerSession(contact.phone_number);
            return {
                action: 'reply',
                reply_script: `I've noted your buyer's requirements. Our team will find matching properties and get back to you shortly.\n\nYou can also submit leads from your portal at /agent/deals`,
                quality_hint: 'confident',
                metadata: { mode: 'buyer_commit_fallback', error: String(err) },
            };
        }
    }

    // ─── LLM REQUIREMENT EXTRACTION ──────────────────────────────────────────

    private async extractRequirementsFromLLM(
        message: string,
        existing: BuyerRequirements,
        partnerName: string,
    ): Promise<{ requirements: Partial<BuyerRequirements> | null; reply: string | null }> {
        const existingJson = JSON.stringify(existing);

        const prompt = `You are Panditji, a real estate AI assistant. A partner agent named ${partnerName} is telling you about their customer's property requirements.

ALREADY COLLECTED:
${existingJson}

PARTNER'S MESSAGE:
"${message}"

TASK: Extract any buyer requirements from this message. Respond in EXACTLY this JSON format:
{
  "requirements": {
    "customer_name": "extracted name or null",
    "customer_phone": "extracted phone or null",
    "intent": "buy or rent_lease or null",
    "property_type": "flat/house/plot/office/shop/builder_floor or null",
    "category": "residential/commercial or null",
    "location": "extracted location or null",
    "budget": "raw budget text or null",
    "bhk": "number as string or null"
  },
  "reply": "Your conversational reply in Hindi/English mix asking for MISSING info. Be brief and professional. If the partner mentioned rent/kiraya, intent=rent_lease. If buy/kharidna, intent=buy."
}

RULES:
- Only extract what is EXPLICITLY mentioned. Don't guess.
- For budget, keep the original text (e.g. "50 hazar per month", "1 crore").
- For location, extract city/area names.
- For property type, normalize to: flat, house, plot, builder_floor, office, shop, warehouse.
- If intent mentions rent/kiraya/lease → "rent_lease". If buy/kharidna/purchase → "buy".
- The reply should ask for the MOST IMPORTANT missing field first: location > budget > property_type > intent.
- Reply in the same language the partner used (Hindi/English/mix).
- Keep reply under 2 sentences.
- Return ONLY valid JSON, no markdown.`;

        try {
            const raw = await this.llmService.generateResponse(prompt, '');
            // Extract JSON from response (handle markdown code blocks)
            const jsonStr = raw.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
            const parsed = JSON.parse(jsonStr);

            // Clean nulls from requirements
            const reqs: Partial<BuyerRequirements> = {};
            if (parsed.requirements) {
                for (const [k, v] of Object.entries(parsed.requirements)) {
                    if (v && v !== 'null' && v !== null) {
                        (reqs as any)[k] = v;
                    }
                }
            }

            return {
                requirements: Object.keys(reqs).length > 0 ? reqs : null,
                reply: parsed.reply || null,
            };
        } catch (err) {
            logger.error('[PartnerAgent] LLM extraction failed:', err);
            return { requirements: null, reply: null };
        }
    }

    // ─── REQUIREMENT COMPLETENESS CHECK ──────────────────────────────────────

    private isRequirementsComplete(req: BuyerRequirements): boolean {
        // Minimum: location + (budget OR property_type)
        return !!(req.location && (req.budget || req.property_type));
    }

    private getMissingFields(req: BuyerRequirements): string[] {
        const missing: string[] = [];
        if (!req.location) missing.push('location');
        if (!req.budget) missing.push('budget');
        if (!req.property_type) missing.push('property_type');
        if (!req.intent) missing.push('intent');
        return missing;
    }

    private buildCollectionPrompt(partnerName: string, req: BuyerRequirements, missing: string[]): string {
        const collected: string[] = [];
        if (req.customer_name) collected.push(`Customer: ${req.customer_name}`);
        if (req.intent) collected.push(`For: ${req.intent === 'rent_lease' ? 'Rent' : 'Purchase'}`);
        if (req.property_type) collected.push(`Type: ${req.property_type}`);
        if (req.bhk) collected.push(`BHK: ${req.bhk}`);
        if (req.location) collected.push(`Location: ${req.location}`);
        if (req.budget) collected.push(`Budget: ${req.budget}`);

        let reply = `${partnerName} ji, noted! 👍`;
        if (collected.length > 0) {
            reply += `\n\n✅ ${collected.join('\n✅ ')}`;
        }

        if (missing.includes('location')) {
            reply += `\n\nKidhar property chahiye? Location bataiye.`;
        } else if (missing.includes('budget')) {
            reply += `\n\nBudget kitna hai? (e.g. 50K/month, 80 lakh)`;
        } else if (missing.includes('property_type')) {
            reply += `\n\nKis type ki property chahiye? (Flat, House, Plot, Office, Shop)`;
        } else if (missing.includes('intent')) {
            reply += `\n\nBuy karna hai ya rent pe lena hai?`;
        }

        return reply;
    }

    // ─── FORMAT SINGLE PROPERTY ──────────────────────────────────────────────

    private formatSingleProperty(property: MatchedProperty, index: number, total: number): string {
        const specs = property.specs ? (typeof property.specs === 'string' ? JSON.parse(property.specs) : property.specs) : {};
        const bhk = specs.bedrooms ? `${specs.bedrooms} BHK ` : '';
        const area = specs.area ? `${specs.area} ${specs.area_unit || 'sqft'}` : '';

        let priceStr = 'Price on request';
        if (property.price) {
            if (property.intent === 'rent') {
                priceStr = `₹${Number(property.price).toLocaleString('en-IN')}/month`;
            } else {
                priceStr = property.price >= 10_000_000
                    ? `₹${(property.price / 10_000_000).toFixed(1)} Cr`
                    : `₹${(property.price / 100_000).toFixed(1)} Lakh`;
            }
        }

        let msg = `*Property ${index}/${total}*\n\n`;
        msg += `🏠 *${bhk}${property.type.toUpperCase()}*\n`;
        msg += `💰 ${priceStr}\n`;
        msg += `📍 ${property.location || 'Location TBD'}\n`;
        if (area) msg += `📐 ${area}\n`;
        if (property.furnishing) msg += `🛋️ ${property.furnishing.replace(/_/g, ' ')}\n`;
        if (property.floor_number) msg += `🏢 Floor ${property.floor_number}${property.total_floors ? '/' + property.total_floors : ''}\n`;

        if (property.features && typeof property.features === 'object') {
            const amenities = Object.entries(property.features)
                .filter(([, v]) => v)
                .map(([k]) => k.replace(/_/g, ' '))
                .slice(0, 4);
            if (amenities.length > 0) {
                msg += `✨ ${amenities.join(', ')}\n`;
            }
        }

        msg += `🏷️ Match: ${property.match_score.toFixed(0)}%\n`;
        msg += `\n---\n`;
        msg += `Reply *1* → Schedule Visit ✅\n`;
        msg += `Reply *2* → Next Property ➡️`;

        return msg;
    }

    // ─── NO MORE PROPERTIES ──────────────────────────────────────────────────

    private async noMoreProperties(
        contact: AgentContext['contact'],
        session: PartnerBuyerSession,
        partnerProfile: any,
    ): Promise<AgentResponse> {
        await this.deleteBuyerSession(contact.phone_number);
        return {
            action: 'reply',
            reply_script: `That's all the matching properties for now, ${partnerProfile.name} ji.\n\nOur coordinator will continue searching and notify you when new matches come in.\n\nCheck deal status anytime on your portal: /agent/deals`,
            quality_hint: 'confident',
            metadata: { mode: 'buyer_browse_complete', deal_id: session.deal_id },
        };
    }

    // ─── DATE/TIME PARSING ───────────────────────────────────────────────────

    private parseDateTimeFromText(text: string): { date: Date; timeStr: string } {
        const now = new Date();
        let date = new Date(now);
        let timeStr = text;

        const lower = text.toLowerCase();

        // Date detection
        if (lower.includes('kal') || lower.includes('tomorrow')) {
            date.setDate(date.getDate() + 1);
        } else if (lower.includes('parso') || lower.includes('day after')) {
            date.setDate(date.getDate() + 2);
        }

        // Try to find a specific date (15 March, March 15, etc.)
        const dateMatch = lower.match(/(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|march|april|june|july|august|september|october|november|december)/i)
            || lower.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|march|april|june|july|august|september|october|november|december)\s*(\d{1,2})/i);
        if (dateMatch) {
            try {
                const parsed = new Date(text);
                if (!isNaN(parsed.getTime())) date = parsed;
            } catch {}
        }

        // Time detection
        const timeMatch = lower.match(/(\d{1,2})\s*(am|pm|baje)/i);
        if (timeMatch) {
            timeStr = timeMatch[0];
        }

        return { date, timeStr };
    }

    // ─── SESSION PERSISTENCE (partner_buyer workflow) ────────────────────────

    private async getBuyerSession(phone: string): Promise<PartnerBuyerSession | null> {
        try {
            const row = await prisma.conversationSession.findFirst({
                where: {
                    phone_number: phone,
                    workflow: 'partner_buyer',
                    active: true,
                },
                orderBy: { updated_at: 'desc' },
            });
            if (!row) return null;
            return (row.context || {}) as unknown as PartnerBuyerSession;
        } catch (err) {
            logger.error('[PartnerAgent] getBuyerSession failed:', err);
            return null;
        }
    }

    private async saveBuyerSession(phone: string, session: PartnerBuyerSession): Promise<void> {
        try {
            const existing = await prisma.conversationSession.findFirst({
                where: { phone_number: phone, workflow: 'partner_buyer', active: true },
            });

            if (existing) {
                await prisma.conversationSession.update({
                    where: { id: existing.id },
                    data: { state: session.state, context: session as any },
                });
            } else {
                const contact = await prisma.contact.findUnique({ where: { phone_number: phone } });
                const tenantId = contact?.tenant_id || (await prisma.tenant.findFirst())?.id;
                if (!tenantId) return;

                await prisma.conversationSession.create({
                    data: {
                        phone_number: phone,
                        workflow: 'partner_buyer',
                        state: session.state,
                        context: session as any,
                        active: true,
                    },
                });
            }
        } catch (err) {
            logger.error('[PartnerAgent] saveBuyerSession failed:', err);
        }
    }

    private async deleteBuyerSession(phone: string): Promise<void> {
        try {
            await prisma.conversationSession.updateMany({
                where: { phone_number: phone, workflow: 'partner_buyer', active: true },
                data: { active: false },
            });
        } catch (err) {
            logger.error('[PartnerAgent] deleteBuyerSession failed:', err);
        }
    }
}