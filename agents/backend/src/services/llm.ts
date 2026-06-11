
import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from '../db';
import logger from '../utils/logger';
import { geminiCircuit } from '../utils/circuit_breaker';
import { cacheGet, cacheSet } from '../utils/redis';
import crypto from 'crypto';

// Simple token bucket rate limiter for Gemini API
class RateLimiter {
    private tokens: number;
    private lastRefill: number;
    private readonly maxTokens: number;
    private readonly refillRate: number; // tokens per ms

    constructor(maxRequestsPerMinute: number) {
        this.maxTokens = maxRequestsPerMinute;
        this.tokens = maxRequestsPerMinute;
        this.lastRefill = Date.now();
        this.refillRate = maxRequestsPerMinute / 60000;
    }

    async acquire(): Promise<boolean> {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
        this.lastRefill = now;

        if (this.tokens >= 1) {
            this.tokens -= 1;
            return true;
        }
        return false;
    }
}

// 500 RPM (Paid Tier 1 limit is 1,000 RPM for Gemini 2.5 Flash — using 50% headroom)
const rateLimiter = new RateLimiter(500);

/** Hash a string for cache key */
function hashKey(input: string): string {
    return crypto.createHash('md5').update(input.toLowerCase().trim()).digest('hex').substring(0, 16);
}

export class LLMService {
    private genAI?: GoogleGenerativeAI;
    private model: any;

    constructor() {
        // Don't initialize in constructor - do it lazily in generateResponse
    }

    private getModel() {
        if (this.model) {
            return this.model;
        }

        const apiKey = process.env.GEMINI_API_KEY;
        console.log('[LLMService] Checking for Gemini API key...', apiKey ? `Found: ${apiKey.substring(0, 10)}...` : 'NOT FOUND');

        if (!apiKey) {
            console.error('[LLMService] GEMINI_API_KEY is missing! Using Mock Mode.');
            logger.error('[LLMService] GEMINI_API_KEY is missing! Using Mock Mode.');
            this.model = {
                generateContent: async () => ({
                    response: { text: () => "This is a mock AI response. Please set GEMINI_API_KEY." }
                })
            };
            return this.model;
        }

        console.log('[LLMService] Initializing Gemini AI with API key');
        logger.info('[LLMService] Initializing Gemini AI with API key');
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        console.log('[LLMService] ✅ Using model: gemini-2.5-flash (Paid Tier 1: 1000 RPM, limiter set to 500 RPM)');
        return this.model;
    }

    /**
     * Internal: call Gemini with circuit breaker + rate limiter
     */
    private async callGemini(prompt: string, fallback: string): Promise<string> {
        // Rate limiter check
        const allowed = await rateLimiter.acquire();
        if (!allowed) {
            logger.warn('[LLMService] Rate limit exceeded, returning fallback');
            return fallback;
        }

        const model = this.getModel();

        // P0 reliability (2026-06-11): retry transient Gemini failures (timeout/429/5xx) with backoff
        // BEFORE the circuit breaker falls back. Most "high traffic" replies were single transient
        // failures; 3 quick attempts auto-recover them so the customer's message isn't lost.
        return geminiCircuit.call(
            async () => {
                let lastErr: unknown;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        const result = await model.generateContent(prompt);
                        const response = await result.response;
                        return response.text().trim();
                    } catch (err) {
                        lastErr = err;
                        logger.warn(`[LLMService] Gemini attempt ${attempt}/3 failed: ${(err as Error)?.message || err}`);
                        if (attempt < 3) await new Promise(r => setTimeout(r, 400 * attempt));
                    }
                }
                throw lastErr; // exhausted retries → let the circuit count it + return fallback
            },
            fallback
        );
    }

    public async generateResponse(systemPrompt: string, userMessage: string): Promise<string> {
        try {
            logger.info('[LLMService] Generating response...');
            const prompt = `${systemPrompt}\n\nUser: ${userMessage}\nAI:`;
            const text = await this.callGemini(prompt, "I am currently experiencing high traffic. Please try again in a moment.");
            logger.info(`[LLMService] Response: ${text.substring(0, 100)}...`);
            return text;
        } catch (error: any) {
            logger.error('[LLMService] Error:', error?.message || error);
            return "I am currently experiencing high traffic. Please try again later.";
        }
    }

    /**
     * Generate a response with conversation history context.
     * Fetches last N interactions from DB and includes them in the prompt.
     */
    public async generateResponseWithHistory(
        systemPrompt: string,
        userMessage: string,
        phoneNumber: string,
        historyCount: number = 10
    ): Promise<string> {
        try {
            logger.info(`[LLMService] Generating response with history for ${phoneNumber}...`);

            const interactions = await prisma.interaction.findMany({
                where: { phone_number: phoneNumber },
                orderBy: { created_at: 'desc' },
                take: historyCount,
                select: { direction: true, content: true, channel: true, created_at: true }
            });

            let historyBlock = '';
            if (interactions.length > 0) {
                const history = interactions.reverse().map(i => {
                    const role = i.direction === 'inbound' ? 'User' : 'Panditji';
                    return `${role}: ${i.content || '(no text)'}`;
                }).join('\n');

                historyBlock = `\nCONVERSATION HISTORY (last ${interactions.length} messages):\n${history}\n`;
            }

            const prompt = `${systemPrompt}${historyBlock}\nUser: ${userMessage}\nAI:`;
            const text = await this.callGemini(prompt, "I am currently experiencing high traffic. Please try again in a moment.");
            logger.info(`[LLMService] Response (with history): ${text.substring(0, 100)}...`);
            return text;
        } catch (error) {
            logger.error('[LLMService] Error (with history):', error);
            // Fallback to non-history response
            return this.generateResponse(systemPrompt, userMessage);
        }
    }

    public async classifyContactType(message: string): Promise<string> {
        // Check Redis cache first
        const cacheKey = `llm:classify_contact:${hashKey(message)}`;
        const cached = await cacheGet(cacheKey);
        if (cached) {
            logger.info(`[LLMService] Cache HIT for classifyContactType`);
            return cached;
        }

        const prompt = `
        You are a Contact Type Classifier for a Real Estate AI called Panditji.
        Based on the message, classify the person into one of these categories:

        - BUYER (wants to PURCHASE/BUY a property — words like "buy", "purchase", "kharidna")
        - TENANT (wants to RENT a property — words like "rent", "kiraya", "on rent", "looking for flat to rent")
        - LANDLORD (OWNS a property and wants to sell or rent it out — says "my property", "mera ghar", "sell karna hai", "rent pe dena hai")
        - PARTNER_AGENT (is a property dealer, broker, or agent from another agency)
        - MANAGEMENT (is an internal team member, boss, manager, or employee)
        - UNKNOWN (cannot determine from the message)

        Clues:
        - If they want to PURCHASE: "buy", "kharidna", "purchase", "looking to buy" -> BUYER
        - If they want to RENT for themselves: "rent", "kiraya", "on rent", "need flat on rent" -> TENANT
        - If they OWN and want to sell/rent out: "sell", "rent out", "my property", "mera ghar dena hai" -> LANDLORD
        - If they mention "dealer", "agent", "broker", "my agency", "I have clients/buyers" -> PARTNER_AGENT
        - If they mention "report", "team", "dashboard", "assign", "employee" -> MANAGEMENT
        - If it's just a greeting like "hi", "hello" -> UNKNOWN

        Message: "${message}"

        Reply ONLY with the Category Name.
        `;

        const text = await this.callGemini(prompt, 'UNKNOWN');
        const result = text.toUpperCase().trim();
        const valid = ['BUYER', 'TENANT', 'LANDLORD', 'PARTNER_AGENT', 'REAL_ESTATE_BUILDER', 'MANAGEMENT', 'UNKNOWN'];
        const classified = valid.includes(result) ? result : 'UNKNOWN';

        // Cache for 1 hour
        await cacheSet(cacheKey, classified, 3600);
        return classified;
    }

    /**
     * Classify contact type with confidence score.
     * Returns { type, intent, confidence } where confidence is 0-100.
     */
    public async classifyWithConfidence(message: string): Promise<{ type: string; intent: string | null; confidence: number }> {
        // Check Redis cache
        const cacheKey = `llm:classify_full:${hashKey(message)}`;
        const cached = await cacheGet(cacheKey);
        if (cached) {
            try {
                logger.info(`[LLMService] Cache HIT for classifyWithConfidence`);
                return JSON.parse(cached);
            } catch { /* parse error, re-classify */ }
        }

        const prompt = `
        You are a Contact Type Classifier for a Real Estate AI called Panditji.
        Based on the message, classify the person and provide a confidence score.

        Categories:
        - BUYER: Person looking to PURCHASE/BUY a property. Uses words like buy, purchase, kharidna.
        - TENANT: Person looking to RENT a property. Uses words like rent, kiraya, on rent, need flat on rent.
        - LANDLORD: Property OWNER wanting to sell or give on rent. Says "my property", "sell karna", "rent pe dena".
        - PARTNER_AGENT: Professional property DEALER, BROKER, or AGENT who deals in real estate as a business. They represent clients or have a firm/agency.
        - MANAGEMENT: Internal team member of Realty Pandit.
        - UNKNOWN: Cannot determine clearly.

        KEY RULE: If someone says they want to sell/rent out a property — they are most likely an INDIVIDUAL OWNER (LANDLORD), NOT a PARTNER_AGENT. Only classify as PARTNER_AGENT if they explicitly say "broker", "dealer", "agent", "agency", or similar business terms.

        Also detect intent if possible:
        - buy, rent, sell, rent_out, or null

        Message: "${message}"

        Reply ONLY in this exact JSON format (no extra text):
        {"type":"CATEGORY","intent":"intent_or_null","confidence":85}
        `;

        const fallback = { type: 'UNKNOWN', intent: null, confidence: 0 };

        try {
            const text = await this.callGemini(prompt, JSON.stringify(fallback));
            const jsonMatch = text.match(/\{[^}]+\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const validTypes = ['BUYER', 'TENANT', 'LANDLORD', 'PARTNER_AGENT', 'REAL_ESTATE_BUILDER', 'MANAGEMENT', 'UNKNOWN'];
                if (validTypes.includes(parsed.type)) {
                    const result = {
                        type: parsed.type,
                        intent: parsed.intent === 'null' ? null : (parsed.intent || null),
                        confidence: Math.min(100, Math.max(0, parseInt(parsed.confidence) || 50))
                    };
                    // Cache for 1 hour
                    await cacheSet(cacheKey, JSON.stringify(result), 3600);
                    return result;
                }
            }
            return fallback;
        } catch (error) {
            logger.error('[LLMService] ClassifyWithConfidence Error:', error);
            return fallback;
        }
    }

    public async classifyIntent(message: string): Promise<string> {
        // Check Redis cache
        const cacheKey = `llm:classify_intent:${hashKey(message)}`;
        const cached = await cacheGet(cacheKey);
        if (cached) {
            logger.info(`[LLMService] Cache HIT for classifyIntent`);
            return cached;
        }

        const prompt = `
        You are an Intent Classifier for a Real Estate AI.
        Classify the following message into one of these categories:
        - BUYER (looking to buy)
        - TENANT (looking to rent)
        - SELLER (looking to sell)
        - LANDLORD (looking to rent out)
        - OTHER (greeting, spam, unknown)

        Message: "${message}"

        Reply ONLY with the Category Name.
        `;

        const text = await this.callGemini(prompt, 'OTHER');
        const result = text.toUpperCase().trim();
        const valid = ['BUYER', 'TENANT', 'SELLER', 'LANDLORD', 'OTHER'];
        const classified = valid.includes(result) ? result : 'OTHER';

        // Cache for 1 hour
        await cacheSet(cacheKey, classified, 3600);
        return classified;
    }

    /**
     * Classify domain intent for multi-agent routing.
     * Returns: PROPERTY, LEGAL, LOAN, SERVICE, APPOINTMENT, GENERAL
     */
    public async classifyDomainIntent(message: string): Promise<string> {
        // Check Redis cache
        const cacheKey = `llm:domain:${hashKey(message)}`;
        const cached = await cacheGet(cacheKey);
        if (cached) {
            logger.info(`[LLMService] Cache HIT for classifyDomainIntent`);
            return cached;
        }

        const prompt = `
        You are a Domain Intent Classifier for a Real Estate AI platform.
        Classify the following message into one of these domains:
        - PROPERTY (buying, selling, renting, searching properties, pricing, location queries)
        - LEGAL (rental agreement, stamp duty, registration, documentation, NOC, verification)
        - LOAN (home loan, EMI, interest rate, bank comparison, eligibility, pre-approval)
        - SERVICE (packers and movers, painting, cleaning, plumbing, electrical, interior)
        - APPOINTMENT (schedule visit, confirm appointment, reschedule, cancel meeting)
        - GENERAL (greeting, hello, hi, thank you, help, anything else)

        Message: "${message}"

        Reply ONLY with the Domain Name.
        `;

        const text = await this.callGemini(prompt, 'GENERAL');
        const result = text.toUpperCase().trim();
        const valid = ['PROPERTY', 'LEGAL', 'LOAN', 'SERVICE', 'APPOINTMENT', 'GENERAL'];
        const classified = valid.includes(result) ? result : 'GENERAL';

        // Cache for 1 hour
        await cacheSet(cacheKey, classified, 3600);
        return classified;
    }

    /**
     * Detect the language of a message.
     * Returns: 'english', 'hindi', 'hinglish'
     */
    public async detectLanguage(message: string): Promise<string> {
        // Check Redis cache (24h TTL — language doesn't change)
        const cacheKey = `llm:lang:${hashKey(message)}`;
        const cached = await cacheGet(cacheKey);
        if (cached) return cached;

        const prompt = `
        Detect the language of this message. Reply with ONLY one of: english, hindi, hinglish

        - english: Written entirely in English
        - hindi: Written in Devanagari script (Hindi)
        - hinglish: Hindi words written in Roman/Latin script, or mix of Hindi and English

        Message: "${message}"

        Reply ONLY with the language name (lowercase).
        `;

        const text = await this.callGemini(prompt, 'english');
        const result = text.toLowerCase().trim();
        const classified = ['english', 'hindi', 'hinglish'].includes(result) ? result : 'english';

        // Cache for 24 hours
        await cacheSet(cacheKey, classified, 86400);
        return classified;
    }

    /**
     * Consolidated classification: contact_type + domain_intent + language in ONE Gemini call.
     * Replaces 3 separate LLM calls for UNKNOWN contacts → 66% fewer Gemini API calls.
     *
     * Returns: { contactType, domainIntent, language, confidence }
     */
    public async classifyFull(message: string): Promise<{
        contactType: string;
        domainIntent: string;
        language: string;
        confidence: number;
    }> {
        const cacheKey = `llm:classify_full_v2:${hashKey(message)}`;
        const cached = await cacheGet(cacheKey);
        if (cached) {
            try {
                logger.info('[LLMService] Cache HIT for classifyFull');
                return JSON.parse(cached);
            } catch { /* re-classify */ }
        }

        const prompt = `
        You are a multi-classifier for Panditji, a Real Estate AI assistant.
        Analyze the following message and provide ALL of these classifications in ONE response.

        1. CONTACT TYPE — Who is this person?
        - BUYER: Wants to PURCHASE a property. Keywords: buy, purchase, kharidna.
        - TENANT: Wants to RENT a property. Keywords: rent, kiraya, on rent, need flat on rent.
        - LANDLORD: OWNS a property, wants to sell or rent it out. Keywords: my property, sell, rent out, dena hai.
        - PARTNER_AGENT: Professional property DEALER, BROKER, or AGENT with a business.
        - MANAGEMENT: Internal team member of Realty Pandit.
        - UNKNOWN: Cannot determine (greetings like "hi", "hello").

        KEY RULE: If someone says they want to sell/rent out — they are LANDLORD, NOT PARTNER_AGENT.
        Only classify as PARTNER_AGENT if they explicitly mention "broker", "dealer", "agent", "agency".

        2. DOMAIN INTENT — What topic is this about?
        - PROPERTY: buying, selling, renting, searching, pricing, location
        - LEGAL: rental agreement, stamp duty, registration, documentation
        - LOAN: home loan, EMI, interest rate, bank
        - SERVICE: packers, movers, painting, cleaning, plumbing
        - APPOINTMENT: schedule visit, confirm, reschedule, cancel
        - GENERAL: greeting, hello, hi, thank you, help

        3. LANGUAGE — What language is the message in?
        - english: Written entirely in English
        - hindi: Written in Devanagari script
        - hinglish: Hindi words in Roman script, or mix of Hindi and English

        Message: "${message}"

        Reply ONLY in this exact JSON format (no extra text):
        {"contactType":"CATEGORY","domainIntent":"DOMAIN","language":"lang","confidence":85}
        `;

        const fallback = { contactType: 'UNKNOWN', domainIntent: 'GENERAL', language: 'english', confidence: 0 };

        try {
            const text = await this.callGemini(prompt, JSON.stringify(fallback));
            const jsonMatch = text.match(/\{[^}]+\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const validTypes = ['BUYER', 'TENANT', 'LANDLORD', 'PARTNER_AGENT', 'REAL_ESTATE_BUILDER', 'MANAGEMENT', 'UNKNOWN'];
                const validDomains = ['PROPERTY', 'LEGAL', 'LOAN', 'SERVICE', 'APPOINTMENT', 'GENERAL'];
                const validLangs = ['english', 'hindi', 'hinglish'];

                const result = {
                    contactType: validTypes.includes(parsed.contactType) ? parsed.contactType : 'UNKNOWN',
                    domainIntent: validDomains.includes(parsed.domainIntent) ? parsed.domainIntent : 'GENERAL',
                    language: validLangs.includes(parsed.language) ? parsed.language : 'english',
                    confidence: Math.min(100, Math.max(0, parseInt(parsed.confidence) || 50)),
                };

                // Cache for 1 hour
                await cacheSet(cacheKey, JSON.stringify(result), 3600);
                return result;
            }
            return fallback;
        } catch (error) {
            logger.error('[LLMService] classifyFull Error:', error);
            return fallback;
        }
    }

    /**
     * Generate a professional AI-enhanced property description.
     * Uses all property attributes to create a compelling 3-4 paragraph listing description.
     * Results are cached in Redis for 24 hours keyed by property ID.
     */
    public async generatePropertyDescription(propertyId: string, property: {
        type?: string;
        category?: string;
        location?: string;
        city?: string;
        locality?: string;
        price?: number | null;
        price_unit?: string | null;
        intent?: string;
        specs?: any;
        features?: any;
        furnishing?: string | null;
        facing?: string | null;
        property_age?: string | null;
        description?: string | null;
        apartment_name?: string | null;
        floor_number?: number | null;
        total_floors?: number | null;
    }, language: 'english' | 'hindi' = 'english'): Promise<string> {
        // Check Redis cache first (24h TTL) — separate cache per language
        const cacheKey = `llm:prop_desc:${propertyId}:${language}`;
        const cached = await cacheGet(cacheKey);
        if (cached) {
            logger.info(`[LLMService] Cache HIT for property description (${language}): ${propertyId}`);
            return cached;
        }

        // Phase 4 dedup (2026-05-28): specs.* is sole SoT; features column dropped.
        const specs: any = property.specs || {};
        const roomCount = specs.bhk ?? specs.rooms ?? specs.bedrooms ?? specs.bhk_count;
        const featureList = Array.isArray(specs.amenities)
            ? specs.amenities.join(', ')
            : '';

        const priceStr = property.price
            ? `₹${property.price} ${property.price_unit || ''}`
            : 'Price on request';

        const intentLabel = property.intent === 'sell' ? 'Sale' : property.intent === 'rent' ? 'Rent' : property.intent || '';

        const languageInstruction = language === 'hindi'
            ? `- Write in simple Hindi (Devanagari script) that a common Indian person can easily understand
- Use everyday Hindi words, avoid heavy or literary Hindi
- Keep sentences short and clear
- It's okay to use common English words that Indians use daily (like "flat", "society", "parking", "lift" etc.)`
            : `- Write in simple, easy-to-read English that anyone can understand
- Use short sentences and everyday words — avoid fancy or heavy language
- Write like you're explaining to a friend, not writing a formal essay
- It's okay to use common Hindi/Indian terms like "society", "BHK" etc.`;

        const prompt = `
You are a friendly property advisor for Realty Pandit, India's trusted property platform.
Write a helpful, easy-to-understand property description based on these details:

Property Type: ${property.type || 'Property'}
Category: ${property.category || 'Residential'}
Intent: For ${intentLabel}
Location: ${property.location || ''}${property.city ? `, ${property.city}` : ''}${property.locality ? ` (${property.locality})` : ''}
Price: ${priceStr}
${roomCount ? `Bedrooms: ${roomCount} BHK` : ''}
${specs.bathrooms ? `Bathrooms: ${specs.bathrooms}` : ''}
${specs.area ? `Area: ${specs.area} ${specs.area_unit || specs.unit || 'sqft'}` : ''}
${specs.furnishing ? `Furnishing: ${String(specs.furnishing).replace(/_/g, ' ')}` : ''}
${specs.facing ? `Facing: ${specs.facing}` : ''}
${specs['age-of-construction'] ? `Property Age: ${specs['age-of-construction']}` : ''}
${property.floor_number ? `Floor: ${property.floor_number}${specs.floors ? ` of ${specs.floors}` : ''}` : ''}
${property.apartment_name ? `Society/Project: ${property.apartment_name}` : ''}
${featureList ? `Amenities: ${featureList}` : ''}

${property.description ? `Original Description from Owner:\n${property.description}` : ''}

Guidelines:
${languageInstruction}
- Highlight the best things about this property: location, amenities, space
- If original description exists, rewrite it in a better way — don't just copy
- Mention why this area/location is good for living
- For sale: mention it's a good investment; for rent: mention comfort and convenience
- Keep it 2-3 short paragraphs, around 100-150 words total
- Do NOT include any price figures or contact details
- Do NOT use markdown formatting — write plain text with paragraph breaks
        `.trim();

        try {
            const text = await this.callGemini(prompt, '');
            if (text && text.length > 30) {
                // Cache for 24 hours
                await cacheSet(cacheKey, text, 86400);
                logger.info(`[LLMService] Generated property description (${language}) for ${propertyId} (${text.length} chars)`);
                return text;
            }
            return '';
        } catch (error) {
            logger.error(`[LLMService] generatePropertyDescription error for ${propertyId}:`, error);
            return '';
        }
    }
}
