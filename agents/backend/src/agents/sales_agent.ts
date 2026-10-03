/**
 * Sales Agent — Handles BUYER, TENANT, and LANDLORD contacts.
 *
 * Consolidates buyer.ts + seller.ts into a single agent that adapts behavior
 * based on contact_type and intent. Implements BaseAgent interface.
 *
 * States: INTAKE → QUALIFICATION → MATCHING → NEGOTIATION
 */

import { BaseAgent, AgentContext, AgentResponse, TransactionData } from './types';
import { MatchingAgent } from './matching_agent';
import { LLMService } from '../services/llm';
import { foldLegacyDemand, mergeDemandSchemaValues } from '../utils/demand_canonical';
import { SystemPromptService } from '../services/system_prompt';
import { createTransaction, findExistingTransaction, CreateTransactionInput, linkSupplyToTransaction } from '../services/transaction_service';
import { transitionTransaction } from '../services/transaction_state_machine';
import { TransactionStatus, TransactionType } from '@prisma/client';
import prisma from '../db';
import { generateDisplayId } from '../utils/inventory_id';
import logger from '../utils/logger';
import { extractReqSlots, parseIndianSaleAmount } from '../utils/requirement_slots';
import { applyDemandCategoryFromType } from '../utils/demand_capture';

const STATES = {
    INTAKE: 'INTAKE',
    QUALIFICATION: 'QUALIFICATION',
    MATCHING: 'MATCHING',
    NEGOTIATION: 'NEGOTIATION',
} as const;

export class SalesAgent implements BaseAgent {
    readonly name = 'sales' as const;
    private llmService: LLMService;
    private matchingAgent: MatchingAgent;

    constructor() {
        this.llmService = new LLMService();
        this.matchingAgent = new MatchingAgent();
    }

    async handle(context: AgentContext): Promise<AgentResponse> {
        const { contact, message, roleContext, currentTransaction } = context;

        // Transaction-aware routing: use roleContext if available, fall back to contact_type
        const isDemand = roleContext === 'DEMAND' || contact.contact_type === 'BUYER' || contact.contact_type === 'TENANT';
        const isSupply = roleContext === 'SUPPLY' || contact.contact_type === 'LANDLORD';

        logger.info(`[SalesAgent] Handling ${isDemand ? 'demand' : 'supply'} message for ${contact.phone_number}` +
            (currentTransaction ? ` (TX: ${currentTransaction.id.substring(0, 8)}, status: ${currentTransaction.status})` : ' (no TX)'));

        if (isDemand) {
            return this.handleBuyer(context);
        } else {
            return this.handleSeller(context);
        }
    }

    // ─── Buyer/Tenant Flow ──────────────────────────────────────

    private async handleBuyer(context: AgentContext): Promise<AgentResponse> {
        const { contact, message, currentTransaction } = context;

        // Determine current state from lead_status
        const state = contact.lead_status === 'cold' ? STATES.INTAKE : STATES.QUALIFICATION;

        // INTAKE: Extract data + classify intent + create Transaction + auto-match if ready
        if (state === STATES.INTAKE) {
            const msg = message.toLowerCase();

            // FIRST: Extract buyer data from the very first message (budget, location, type)
            const extractedData = this.extractBuyerData(msg, message, contact);
            if (Object.keys(extractedData).length > 0) {
                try {
                    await prisma.contact.update({
                        where: { phone_number: contact.phone_number },
                        data: extractedData,
                    });
                    logger.info(`[SalesAgent] INTAKE: Extracted buyer data: ${JSON.stringify(extractedData)}`);
                    Object.assign(contact, extractedData);
                } catch (err) {
                    logger.error('[SalesAgent] INTAKE data update failed:', err);
                }
            }

            // Resolve residential-vs-commercial from the captured type so matching separates the two
            // worlds — property_sharing reads contact.category_id, not the property_type string. (A1, 2026-06-21)
            if (extractedData.property_type) {
                await applyDemandCategoryFromType(contact.phone_number, extractedData.property_type);
            }

            // Infer intent from extracted data if possible (skip LLM call)
            let intent: string;
            if (extractedData.budget_max) {
                // Budget-based heuristic: <= 5 lakh likely rent, > 5 lakh likely buy
                intent = extractedData.budget_max <= 500000 ? 'TENANT' : 'BUYER';
                logger.info(`[SalesAgent] INTAKE: Inferred intent ${intent} from budget ${extractedData.budget_max}`);
            } else {
                // Fall back to LLM classification
                intent = await this.llmService.classifyIntent(message);
                logger.info(`[SalesAgent] INTAKE: Classified intent: ${intent}`);
            }

            // If intent is OTHER but contact type is known, force to match contact_type to break the loop
            if (intent !== 'BUYER' && contact.contact_type === 'BUYER') {
                intent = 'BUYER';
                logger.info(`[SalesAgent] Forced intent to BUYER (contact_type is BUYER)`);
            } else if (intent !== 'TENANT' && contact.contact_type === 'TENANT') {
                intent = 'TENANT';
                logger.info(`[SalesAgent] Forced intent to TENANT (contact_type is TENANT)`);
            }

            if (intent === 'BUYER' || intent === 'TENANT') {
                // Create a Transaction if none exists
                let txMetadata: Record<string, any> = { classified_intent: intent };
                if (!currentTransaction) {
                    try {
                        const txResult = await createTransaction({
                            tenant_id: contact.tenant_id,
                            demand_contact_id: contact.phone_number,
                            type: intent === 'TENANT' ? 'RENT' as TransactionType : 'SALE' as TransactionType,
                            source: context.channel,
                            demand_property_type: contact.property_type || undefined,
                            demand_location: contact.preferred_location || undefined,
                            demand_budget_min: contact.budget_min || undefined,
                            demand_budget_max: contact.budget_max || undefined,
                        }, contact.phone_number, context.channel);

                        if (!txResult.isDuplicate) {
                            logger.info(`[SalesAgent] Created Transaction ${txResult.transaction.id.substring(0, 8)} for ${contact.phone_number}`);
                            txMetadata.transaction_id = txResult.transaction.id;
                            txMetadata.transaction_created = true;
                        } else {
                            logger.info(`[SalesAgent] Continuing existing Transaction ${txResult.transaction.id.substring(0, 8)}`);
                            txMetadata.transaction_id = txResult.transaction.id;
                            txMetadata.transaction_continued = true;
                        }
                    } catch (err) {
                        logger.error('[SalesAgent] Transaction creation failed (non-blocking):', err);
                    }
                }

                // Deterministic qualify: ask for the missing field, read-back when complete,
                // qualify + share matches only on confirm — no LLM dependency, no card-spam. (F1, 2026-06-21)
                const detResult = await this.runDeterministicQualification(context, intent);
                return {
                    ...detResult,
                    next_state: STATES.QUALIFICATION,
                    metadata: { ...txMetadata, ...(detResult.metadata || {}), lead_status: 'warm', intent },
                };
            }
        }

        // QUALIFICATION: Gather details, auto-trigger matching when ready
        if (state === STATES.QUALIFICATION) {
            const msg = message.toLowerCase();

            // Extract data from current message to fill gaps
            const extractedData = this.extractBuyerData(msg, message, contact);

            // Update contact with any newly extracted data
            if (Object.keys(extractedData).length > 0) {
                try {
                    await prisma.contact.update({
                        where: { phone_number: contact.phone_number },
                        data: extractedData,
                    });
                    logger.info(`[SalesAgent] Updated buyer data: ${JSON.stringify(extractedData)}`);
                    // Merge into contact for immediate use
                    Object.assign(contact, extractedData);
                } catch (err) {
                    logger.error('[SalesAgent] Buyer data update failed:', err);
                }
            }

            // Keep residential/commercial in sync if the type changed this turn. (A1, 2026-06-21)
            if (extractedData.property_type) {
                await applyDemandCategoryFromType(contact.phone_number, extractedData.property_type);
            }

            // Check if buyer selected a specific property (1, 2, 3)
            const propertyNumber = /^\d$/.test(msg.trim()) ? parseInt(msg.trim()) : null;
            if (propertyNumber) {
                return this.matchingAgent.handle(context);
            }

            // Check for "more" results request
            if (msg === 'more' || msg.includes('next') || msg.includes('aur dikhao') || msg.includes('aur batao')) {
                return this.matchingAgent.handle(context);
            }

            // Deterministic qualify (ask → read-back → qualify+match on confirm). See
            // runDeterministicQualification — no LLM-dependent ask, no qualify-on-"hi". (F1, 2026-06-21)
            return this.runDeterministicQualification(context, contact.intent || undefined);
        }

        // Fallback: Generate AI response for any unhandled state
        const fallbackPrompt = await SystemPromptService.getBuyerPrompt({
            lead_status: contact.lead_status || 'cold',
            intent: contact.intent || 'BUYER',
            missing_info: 'Budget, Location, Type',
        });
        const fallbackReply = await this.llmService.generateResponseWithHistory(
            fallbackPrompt, message, contact.phone_number,
        );

        return {
            action: 'reply',
            reply_script: fallbackReply,
            quality_hint: 'uncertain',
        };
    }

    // ─── Deterministic qualification (F1, 2026-06-21) ───────────
    // Replaces the LLM-dependent "ask for details" + loose "location OR budget → qualify"
    // logic. Real-chat audit (docs/pipeline-analysis/real-chat-findings.md) showed the bot
    // deflected ("a team member will assist", LLM-fail leaks) or qualified/card-spammed on a
    // bare "hi". This is deterministic: ask for the missing field → read-back the full
    // requirement → qualify + share matches ONLY on the client's confirmation. The LLM is used
    // only to answer genuine questions, never for the core capture flow (so it can't go silent).

    private isAffirmative(msg: string): boolean {
        const m = (msg || '').trim().toLowerCase();
        if (/^(yes|yep|yeah|y|ok|okay|okk|k|haan|haa|haanji|ha|hn|haa?n?ji|sahi|sai|theek|thik|done|sure|confirm(ed)?|correct|right|bilkul|👍|✅)[.! ]*$/i.test(m)) return true;
        return /\b(haan|yes|sahi hai|sahi h|theek hai|thik hai|bilkul|confirm|dikhao|dikha do|show me|chalega)\b/i.test(m);
    }

    private missingList(contact: any): string[] {
        const out: string[] = [];
        if (!contact.preferred_location) out.push('Location');
        if (!contact.budget_max) out.push('Budget');
        if (!contact.property_type && !((contact.demand_schema_values as any)?.bhk)) out.push('Type');
        return out;
    }

    private isRentIntent(contact: any): boolean {
        const i = String(contact.intent || '').toLowerCase();
        return i.includes('rent') || i === 'tenant';
    }

    private formatBudget(n: number, rent: boolean): string {
        if (rent || n < 200000) return `₹${Number(n).toLocaleString('en-IN')}${n < 200000 ? '/month' : ''}`;
        if (n >= 10000000) return `₹${(n / 10000000).toFixed(2).replace(/\.?0+$/, '')} Cr`;
        return `₹${Math.round(n / 100000)} Lakh`;
    }

    private async setAwaitingConfirm(contact: any, val: boolean): Promise<void> {
        try {
            const merged = mergeDemandSchemaValues((contact.demand_schema_values as any) ?? null, { awaiting_confirm: val }) ?? {};
            if (!val) delete (merged as any).awaiting_confirm;
            await prisma.contact.update({ where: { phone_number: contact.phone_number }, data: { demand_schema_values: merged as any } });
            contact.demand_schema_values = merged;
        } catch (err) {
            logger.warn('[SalesAgent] setAwaitingConfirm failed:', (err as Error).message);
        }
    }

    private buildAsk(contact: any): string {
        const rent = this.isRentIntent(contact);
        const greet = contact.lead_status === 'cold' ? 'Namaste! 🙏 Main Panditji, aapka property assistant.\n\n' : '';
        const need = this.missingList(contact);
        if (!contact.preferred_location && !contact.budget_max) {
            return `${greet}Aapke liye best ${rent ? 'rental ' : ''}options dhoondhne ke liye bata dijiye:\n📍 *Location* (jaise: Vaishali, Sector 62 Noida)\n💰 *Budget* (jaise: ${rent ? '25,000/month' : '50 lakh'})\n🏷️ *Type* (flat / villa / plot / shop / office)`;
        }
        if (!contact.preferred_location) return `${greet}Kaunsi *location* prefer karenge? (jaise: Vaishali, Sector 62 Noida, Indirapuram)`;
        if (!contact.budget_max) return `${greet}Aapka *budget* kitna hai? (jaise: ${rent ? '20,000–30,000/month' : '50 lakh ya 1 crore'})`;
        if (need.includes('Type')) return `${greet}Aap *flat* dhoondh rahe hain ya *villa / plot / shop / office*?`;
        return `${greet}Thodi aur detail bata dijiye taaki main best match bhej sakoon. 🙏`;
    }

    private buildReadback(contact: any): string {
        const rent = this.isRentIntent(contact);
        const parts: string[] = [];
        const bhk = (contact.demand_schema_values as any)?.bhk;
        if (bhk) parts.push(`${bhk} BHK`);
        if (contact.property_type) parts.push(String(contact.property_type));
        if (contact.preferred_location) parts.push(`📍 ${contact.preferred_location}`);
        if (contact.budget_max) parts.push(`💰 ${this.formatBudget(Number(contact.budget_max), rent)}`);
        parts.push(rent ? 'rent ke liye' : 'kharidne ke liye');
        return `Samajh gaya 🙏 — aap dhoondh rahe hain:\n*${parts.join(' · ')}*\n\nSahi hai? *Haan* bolein to main turant best matching properties bhejta hoon. 🏠`;
    }

    /** Deterministic capture→ask→read-back→qualify-on-confirm step. Returns the reply. */
    private async runDeterministicQualification(context: AgentContext, intent?: string): Promise<AgentResponse> {
        const { contact, message, currentTransaction } = context;
        const msg = (message || '').toLowerCase().trim();

        const complete = !!contact.preferred_location && !!contact.budget_max;
        const awaiting = !!((contact.demand_schema_values as any)?.awaiting_confirm);
        const isQuestion = /\?|\bkya\b|kah[aā]?n|\bkab\b|kaise|kitn[ae]|price|rate|emi|loan|detail|address|metro|parking|broker|owner/i.test(msg);

        // 1) Confirming a read-back + enough data → qualify (if NEW) + share matches (one card).
        if (awaiting && complete && this.isAffirmative(msg)) {
            await this.setAwaitingConfirm(contact, false);
            if (currentTransaction && currentTransaction.status === 'NEW') {
                try {
                    await prisma.transaction.update({
                        where: { id: currentTransaction.id },
                        data: {
                            demand_location: contact.preferred_location || currentTransaction.demand_location,
                            demand_budget_max: contact.budget_max || currentTransaction.demand_budget_max,
                        },
                    });
                    await transitionTransaction(currentTransaction.id, TransactionStatus.QUALIFIED, contact.phone_number, context.channel,
                        { trigger: 'deterministic_qualify_confirmed', contact_data: { property_type: contact.property_type, location: contact.preferred_location } });
                    logger.info(`[SalesAgent] ${currentTransaction.id.substring(0, 8)} → QUALIFIED (read-back confirmed)`);
                } catch (err) { logger.error('[SalesAgent] qualify-on-confirm failed (non-blocking):', err); }
            }
            return this.matchingAgent.handle(context);
        }

        // 2) Already qualified + has criteria → just serve matches (no re-confirm).
        if (complete && currentTransaction && currentTransaction.status !== 'NEW') {
            return this.matchingAgent.handle(context);
        }

        // 3) Genuine question → let the LLM answer it; keep awaiting so a later "haan" still qualifies.
        if (isQuestion) {
            const sp = await SystemPromptService.getBuyerPrompt({
                lead_status: contact.lead_status || 'qualifying', intent: contact.intent || intent || 'BUYER',
                missing_info: this.missingList(contact).join(', ') || 'none',
            });
            const reply = await this.llmService.generateResponseWithHistory(sp, message, contact.phone_number);
            return { action: 'reply', reply_script: reply, quality_hint: 'confident' };
        }

        // 4) Complete → deterministic read-back (await confirm). No card yet.
        if (complete) {
            await this.setAwaitingConfirm(contact, true);
            return { action: 'reply', reply_script: this.buildReadback(contact), quality_hint: 'confident', metadata: { stage: 'readback' } };
        }

        // 5) Incomplete → deterministic ask for the missing field. No card, no LLM, never silent.
        return { action: 'reply', reply_script: this.buildAsk(contact), quality_hint: 'confident', metadata: { stage: 'intake_ask' } };
    }

    // ─── Buyer Data Extraction ─────────────────────────────────

    private extractBuyerData(msg: string, rawMessage: string, contact: any): Record<string, any> {
        const data: Record<string, any> = {};

        // Extract budget (₹20000, 20k, 50 lakh, 1 crore, etc.)
        if (!contact.budget_max) {
            // Monthly rent: "20000", "20k", "15000 per month"
            const rentMatch = msg.match(/(\d+)\s*k\b/) || msg.match(/(\d{4,6})\s*(?:per month|monthly|rent|tak)?/);
            if (rentMatch) {
                const val = parseInt(rentMatch[1]);
                const amount = msg.includes('k') ? val * 1000 : val;
                if (amount >= 5000 && amount <= 500000) { // Rent range
                    data.budget_max = amount;
                    // budget_min left UNSET — client stated one (max) figure, not a floor.
                    // leadToCriteria treats a null budget_min as "no lower bound" → wider, honest
                    // matching (a ₹50k-max tenant still sees good ₹30k options). (A1, 2026-06-21)
                }
            }

            // Sale: "50 lakh", "1 crore", "1.5 cr", "1.25 crores" — only if rent didn't already match.
            // Shared parser since 2026-08-07; the inline regex here missed every plural form.
            if (!data.budget_max) {
                const amount = parseIndianSaleAmount(msg);
                if (amount != null) {
                    data.budget_max = amount;
                    // budget_min left UNSET (see rent branch) — no fabricated 0.7x floor. (A1, 2026-06-21)
                }
            }
        }

        // Extract location (known areas + sector pattern)
        if (!contact.preferred_location) {
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
                    // Check if "sector X" follows immediately after the area name
                    const afterArea = msg.substring(msg.indexOf(area) + area.length);
                    const sectorMatch = afterArea.match(/\s*(?:sector|sec)\s*(\d+)/i);
                    if (sectorMatch) {
                        location += ' sector ' + sectorMatch[1];
                    }
                    // If area is a sub-locality, append parent city
                    if (!cities.includes(area)) {
                        for (const city of cities) {
                            if (msg.includes(city) && city !== area) {
                                location += ', ' + city;
                                break;
                            }
                        }
                    }
                    data.preferred_location = location;
                    break;
                }
            }
            // Also check for standalone "sector X" pattern
            if (!data.preferred_location) {
                const sectorPattern = msg.match(/sector\s*(\d+)/i);
                if (sectorPattern) {
                    let loc = 'sector ' + sectorPattern[1];
                    for (const city of cities) {
                        if (msg.includes(city)) { loc += ', ' + city; break; }
                    }
                    data.preferred_location = loc;
                }
            }
        }

        // Extract property type
        if (!contact.property_type) {
            // Order matters: multi-word keys first so "builder floor" wins
            // before a generic single word. (2026-05-19: buyers asking for
            // "builder floor / independent floor" were left with no type →
            // generic mixed results. See docs/plans/2026-05-19-report-cadence-and-bot-reply.md)
            const typeMap: Record<string, string> = {
                'builder floor': 'flat', 'independent floor': 'flat', 'builder flat': 'flat',
                'independent house': 'house', 'farm house': 'house', 'farmhouse': 'house',
                'flat': 'flat', 'apartment': 'flat', 'falt': 'flat', 'flats': 'flat',
                'duplex': 'flat', 'penthouse': 'flat', 'studio': 'flat',
                'house': 'house', 'villa': 'house', 'kothi': 'house', 'bungalow': 'house',
                'plot': 'plot', 'land': 'plot', 'zameen': 'plot', 'plots': 'plot',
                'office': 'office', 'shop': 'shop', 'showroom': 'shop',
                'warehouse': 'shop', 'godown': 'shop',
            };
            for (const [keyword, type] of Object.entries(typeMap)) {
                if (msg.includes(keyword)) {
                    data.property_type = type;
                    break;
                }
            }
        }

        // Extract BHK — capture the COUNT into demand_bhk (the matching
        // engine filters on it). Handles "2 bhk", "3bhk", "2/3 bhk"
        // (takes the lower = minimum desired), "2 bedroom". 2026-05-19:
        // previously the count was parsed then discarded, so buyers stating
        // "2/3 BHK" got configuration-agnostic results.
        const bhkMatch = msg.match(/(\d)\s*\/?\s*(\d)?\s*(?:bhk|bkh|bk|bedroom|bed)\b/i);
        if (bhkMatch) {
            const n = parseInt(bhkMatch[1], 10);
            // demand_bhk column DROPPED 2026-05-29 — fold into canonical demand_schema_values,
            // deep-merged onto existing so other keys (amenities/furnishing/…) aren't wiped by
            // the contact.update that spreads this object.
            const _existingBhk = (contact.demand_schema_values as any)?.bhk;
            if (n >= 1 && n <= 6 && !_existingBhk) {
                const _folded = foldLegacyDemand({ demand_bhk: n });
                data.demand_schema_values = mergeDemandSchemaValues(contact.demand_schema_values, _folded.demand_schema_values);
            }
            if (!contact.property_type && !data.property_type) {
                data.property_type = 'flat'; // BHK implies flat
            }
        }

        // Intent (rent vs buy) — previously never captured by extractBuyerData,
        // so standalone "rent"/"buy" answers were silently dropped. Feeds
        // matching via contact.intent. (P1, 2026-06-11)
        if (!contact.intent) {
            const _slots = extractReqSlots(rawMessage);
            if (_slots.intent) data.intent = _slots.intent;
        }

        return data;
    }

    // ─── Seller/Landlord Flow ───────────────────────────────────

    private async handleSeller(context: AgentContext): Promise<AgentResponse> {
        const { contact, message, currentTransaction } = context;
        const msg = message.toLowerCase();

        // Track what data we've collected for metadata
        const collectedData: Record<string, any> = {};

        // Extract property type from message if missing
        let propertyType = contact.property_type;
        if (!propertyType) {
            const typeMap: Record<string, string> = {
                'flat': 'flat', 'apartment': 'flat',
                'house': 'house', 'villa': 'house', 'bungalow': 'house',
                'plot': 'plot', 'land': 'plot',
                'office': 'office', 'shop': 'shop',
            };
            for (const [keyword, type] of Object.entries(typeMap)) {
                if (msg.includes(keyword)) {
                    propertyType = type;
                    collectedData.property_type = type;
                    break;
                }
            }
        }

        // Extract location if property type known but location isn't
        let location = contact.preferred_location;
        if (propertyType && !location) {
            const hasPropertyKeyword = ['flat', 'house', 'plot', 'sell', 'rent', 'office', 'shop']
                .some(k => msg.includes(k));
            if (!hasPropertyKeyword && message.trim().length > 1) {
                location = message;
                collectedData.preferred_location = message;
            }
        }

        // Determine if we should upgrade lifecycle
        let nextLifecycle: string | undefined;
        if (propertyType && location && contact.lead_status === 'cold') {
            collectedData.lead_status = 'warm';
            collectedData.ai_summary = `Seller: ${propertyType} in ${location}. Price info: ${message}`;
            nextLifecycle = 'QUALIFIED';

            // Create Inventory + link supply to matching Transactions
            try {
                // Find or create Owner record for this seller
                let owner = await prisma.owner.findUnique({ where: { contact_phone: contact.phone_number } });
                if (!owner) {
                    owner = await prisma.owner.create({
                        data: {
                            scope: 'INTERNAL',
                            contact_phone: contact.phone_number,
                            status: 'ACTIVE',
                        },
                    });
                    logger.info(`[SalesAgent] Created Owner for seller ${contact.phone_number}`);
                }

                const inventory = await prisma.inventory.create({
                    data: {
                        display_id: await generateDisplayId(location || '', 'residential'),
                        tenant_id: contact.tenant_id,
                        owner_id: owner.id,
                        type: propertyType,
                        category: 'residential',
                        intent: contact.intent === 'rent' ? 'rent' : 'sell',
                        location: location,
                        owner_phone: contact.phone_number,
                        status: 'active',
                    },
                });
                collectedData.inventory_id = inventory.id;
                logger.info(`[SalesAgent] Created Inventory ${inventory.id.substring(0, 8)} for seller ${contact.phone_number}`);

                // Find matching demand transactions waiting for supply.
                // Post-taxonomy unification: legacy demand_property_type column is gone;
                // narrow only by location (canonical taxonomy match happens downstream
                // via MatchingEngine, not in this fast linker). propertyType retained
                // for log breadcrumb only.
                void propertyType;
                const matchingDemandTxs = await prisma.transaction.findMany({
                    where: {
                        tenant_id: contact.tenant_id,
                        status: TransactionStatus.NEW,
                        supply_contact_id: null,
                        ...(location ? { demand_location: { contains: location, mode: 'insensitive' as any } } : {}),
                    },
                    take: 5,
                });

                // Link this seller as supply to matching transactions
                for (const demandTx of matchingDemandTxs) {
                    try {
                        await linkSupplyToTransaction(
                            demandTx.id,
                            contact.phone_number,
                            inventory.id,
                            contact.phone_number,
                        );
                        logger.info(`[SalesAgent] Linked seller ${contact.phone_number} as supply to TX ${demandTx.id.substring(0, 8)}`);
                    } catch (linkErr) {
                        logger.error(`[SalesAgent] Supply link failed for TX ${demandTx.id}:`, linkErr);
                    }
                }

                if (matchingDemandTxs.length > 0) {
                    collectedData.matched_transactions = matchingDemandTxs.length;
                }
            } catch (invErr) {
                logger.error('[SalesAgent] Inventory creation failed (non-blocking):', invErr);
            }
        }

        // Use TX-enhanced prompt if transaction exists
        const systemPrompt = currentTransaction
            ? await SystemPromptService.getSellerPromptWithTransaction(
                { lead_status: contact.lead_status, intent: contact.intent || 'sell', property_type: propertyType, preferred_location: location, language: contact.preferred_language },
                currentTransaction,
            )
            : await SystemPromptService.getSellerPrompt({
                lead_status: contact.lead_status,
                intent: contact.intent || 'sell',
                property_type: propertyType,
                preferred_location: location,
                price_discussed: contact.lead_status === 'warm' || contact.lead_status === 'hot' ? 'Yes' : 'No',
            });

        const reply = await this.llmService.generateResponseWithHistory(
            systemPrompt, message, contact.phone_number,
        );

        return {
            action: 'reply',
            reply_script: reply,
            quality_hint: 'confident',
            metadata: {
                ...collectedData,
                ...(nextLifecycle && { lifecycle_stage: nextLifecycle }),
            },
        };
    }
}
