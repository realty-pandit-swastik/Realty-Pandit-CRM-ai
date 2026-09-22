import prisma from '../db';
import { LLMService } from './llm';
import { isSupplyIntent } from '../utils/intent_signals';
import { WhatsAppService } from './whatsapp';
import { DateTimeParser } from './date_parser';
import { CalendarService } from './calendar';
import { normalizePhone } from '../utils/phone';

interface FilterState {
    city?: string;
    propertyType?: string;
    bhk?: string;
    budget?: { min: number; max: number };
    intent?: 'buy' | 'rent' | 'lease';
}

interface Property {
    id: string;
    type: string | null;
    location: string | null;
    price: number;
    status: string | null;
    specs: any; // JSON field containing bedrooms, bathrooms, area
    photos: string[];
}

export class ChatHandler {
    private llmService: LLMService;
    private whatsappService: WhatsAppService;
    private dateParser: DateTimeParser;
    private calendarService: CalendarService;

    constructor() {
        this.llmService = new LLMService();
        this.whatsappService = new WhatsAppService();
        this.dateParser = new DateTimeParser();
        this.calendarService = new CalendarService();
    }

    /**
     * Process user message and return AI response with properties
     */
    async processMessage(message: string, filters: FilterState, sessionId?: string) {
        try {
            // 1. Search properties based on filters and message
            const properties = await this.searchProperties(filters, message);

            // 2. Build system prompt with property context
            const systemPrompt = this.buildSystemPrompt(filters, properties);

            // 3. Generate AI response using Gemini
            const aiReply = await this.llmService.generateResponse(systemPrompt, message);

            // 4. Detect if user wants to book a visit
            const action = this.detectAction(message, aiReply);

            // 5. Format properties for response (limit to top 6)
            const topProperties = properties.slice(0, 6).map(p => this.formatProperty(p));

            return {
                reply: aiReply,
                properties: topProperties,
                action,
                sessionId: sessionId || `session_${Date.now()}`,
            };
        } catch (error) {
            console.error('Chat handler error:', error);
            return {
                reply: 'I apologize, but I encountered an error. Please try again.',
                properties: [],
                action: null,
                sessionId: sessionId || `session_${Date.now()}`,
            };
        }
    }

    /**
     * Check if a message is a genuine property SEARCH request (not just a conversational mention).
     * Uses pattern matching: needs a location OR (action + property type) to qualify.
     */
    private hasPropertyIntent(message: string): boolean {
        const lowerMessage = message.toLowerCase();

        // Location keywords — strong signal: user wants to search in a specific area
        const locationKeywords = [
            'noida', 'gurgaon', 'gurugram', 'delhi', 'mumbai', 'bangalore', 'pune', 'hyderabad', 'chennai',
            'sector', 'dwarka', 'vaishali', 'indiranagar', 'koramangala', 'bandra', 'andheri',
            'ghaziabad', 'faridabad', 'greater noida', 'lucknow', 'jaipur', 'chandigarh',
        ];
        const hasLocation = locationKeywords.some(kw => lowerMessage.includes(kw));

        // BHK mention is a strong signal
        const hasBHK = /\d\s*bhk/i.test(lowerMessage);

        // Budget mention is a strong signal
        const hasBudget = /\b(lakh|lac|crore|cr|budget|kitna)\b/i.test(lowerMessage);

        // Property type keywords
        const propertyTypes = ['flat', 'house', 'plot', 'apartment', 'villa', 'penthouse', 'studio',
            'office', 'shop', 'warehouse', 'makan', 'ghar', 'dukan', 'kothi'];
        const hasPropertyType = propertyTypes.some(kw => lowerMessage.includes(kw));

        // Action keywords
        const actionKeywords = ['buy', 'rent', 'lease', 'sell', 'kharidna', 'kiraya', 'bechna',
            'looking for', 'chahiye', 'dhundh', 'dikhao'];
        const hasAction = actionKeywords.some(kw => lowerMessage.includes(kw));

        // Need at least TWO signals, or one very strong signal (location + anything, BHK, budget)
        if (hasLocation) return true;       // Location alone is strong enough
        if (hasBHK) return true;            // "2 BHK" alone is strong enough
        if (hasBudget) return true;         // Budget mention is strong enough
        if (hasPropertyType && hasAction) return true; // "buy flat", "rent house"

        return false;
    }

    /**
     * Search properties based on filters and message keywords
     */
    private async searchProperties(filters: FilterState, message: string): Promise<any[]> {
        try {
            const where: any = {};
            const hasFilters = !!(filters.city || filters.propertyType || filters.bhk || filters.budget || filters.intent);

            // If no filters and message has no property intent, skip search
            if (!hasFilters && !this.hasPropertyIntent(message)) {
                return [];
            }

            // Apply city filter (using location field)
            if (filters.city) {
                where.location = {
                    contains: filters.city,
                    mode: 'insensitive',
                };
            }

            // Apply property type filter
            if (filters.propertyType) {
                where.type = {
                    contains: filters.propertyType,
                    mode: 'insensitive',
                };
            }

            // Apply BHK filter (stored in specs.bedrooms JSON field)
            // Note: This requires JSON filtering which may not work efficiently
            // For now, we'll filter in memory after fetching results

            // Apply budget filter
            if (filters.budget) {
                where.price = {
                    gte: filters.budget.min,
                };
                if (filters.budget.max > 0) {
                    where.price.lte = filters.budget.max;
                }
            }

            // Apply intent filter (buy/rent/lease)
            if (filters.intent) {
                if (filters.intent === 'buy') {
                    where.intent = 'sell';
                } else {
                    where.intent = filters.intent;
                }
            }

            // Extract keywords from message for location/features
            const keywords = this.extractKeywords(message);
            if (keywords.location) {
                // Search in location field only (no separate city field exists)
                where.location = {
                    contains: keywords.location,
                    mode: 'insensitive',
                };
            }

            // Search database - select only fields that exist in BOTH schema and DB
            const properties = await prisma.inventory.findMany({
                where,
                select: {
                    id: true,
                    tenant_id: true,
                    owner_phone: true,
                    category: true,
                    type: true,
                    specs: true,
                    // features dropped Phase 4 — read from specs.amenities
                    location: true,
                    price: true,
                    display_price: true,
                    price_unit: true,
                    status: true,
                    intent: true,
                    media_urls: true,
                    created_at: true,
                    updated_at: true,
                },
                take: 20,
                orderBy: [
                    { status: 'asc' }, // Ready to move first
                    { created_at: 'desc' }, // Newest first
                ],
            });

            return properties;
        } catch (error) {
            console.error('Property search error:', error);
            return [];
        }
    }

    /**
     * Build system prompt for AI with property context
     */
    private buildSystemPrompt(filters: FilterState, properties: any[]): string {
        const cityFilter = filters.city || 'any city';
        const typeFilter = filters.propertyType || 'any type';
        const bhkFilter = filters.bhk || 'any size';
        const budgetFilter = filters.budget
            ? `₹${(filters.budget.min / 100000).toFixed(0)}L - ₹${filters.budget.max > 0 ? (filters.budget.max / 10000000).toFixed(1) + 'Cr' : 'unlimited'}`
            : 'any budget';
        const intentFilter = filters.intent || 'buy/rent';

        const propertyList = properties.length > 0
            ? properties.slice(0, 10).map((p, i) => {
                const specs = p.specs as any || {};
                const bedrooms = specs.bedrooms || '';
                const area = specs.area || 'N/A';
                const bhkLabel = bedrooms ? `${bedrooms} BHK` : '';
                return `${i + 1}. ${bhkLabel} ${p.type || 'Property'} in ${p.location || 'Location'} - ₹${this.formatPrice(Number((p as any).display_price ?? p.price) || 0)} - ${area} sqft - ${p.status || 'Available'}`;
            }).join('\n')
            : 'No properties found matching these criteria.';

        return `You are Panditji, a friendly and knowledgeable AI property assistant for Realty Pandit.

CURRENT SEARCH CONTEXT:
- City: ${cityFilter}
- Property Type: ${typeFilter}
- BHK: ${bhkFilter}
- Budget: ${budgetFilter}
- Intent: ${intentFilter}
- Found Properties: ${properties.length} matches

AVAILABLE PROPERTIES:
${propertyList}

YOUR PERSONALITY:
- Warm, friendly, and professional
- Use "Namaste" occasionally
- Be conversational but concise
- Show genuine interest in helping
- Never be pushy or sales-y

YOUR ROLE:
1. Help users find the perfect property based on their requirements
2. Recommend the top 3-6 properties that best match their needs
3. Highlight unique features (location, amenities, price, status)
4. When a user shows interest, ask for their WhatsApp number to schedule a visit
5. Be helpful with property questions and comparisons

RESPONSE GUIDELINES:
- Keep responses under 100 words
- Mention specific property details from the list above
- If no properties match, suggest nearby alternatives or different filters
- When recommending properties, use phrases like "I found some great options for you"
- If user wants to visit/book, say: "I'd love to help schedule a visit! May I have your WhatsApp number?"

IMPORTANT:
- NEVER make up property details not in the list
- If you don't have information, say so politely
- Always be truthful about property availability and features
- Use Indian rupee format (Lakhs/Crores)
- For greetings (hi, hello, how are you), reply warmly WITHOUT listing properties
- For vague/contextual messages (show previous, what was that, etc.) just respond conversationally
- Only recommend properties when the user explicitly asks to SEARCH, FIND, or SHOW properties with specific criteria
- If no properties are available (0 found), don't mention any — just ask what they're looking for`;
    }

    /**
     * Detect user intent/action from message
     */
    private detectAction(message: string, aiReply: string): 'request_phone' | 'book_visit' | 'redirect_upload' | null {
        const lowerMessage = message.toLowerCase();
        const lowerReply = aiReply.toLowerCase();

        // Check if user wants to sell/list/upload a property
        const uploadKeywords = [
            'sell my', 'bechna', 'list my property', 'upload property',
            'makan bechna', 'ghar bechna', 'property list karna', 'post property',
            'apna makan', 'apna ghar', 'apni property', 'property bechni',
            'i want to sell', 'i want to list', 'want to upload',
        ];
        if (uploadKeywords.some(kw => lowerMessage.includes(kw)) || isSupplyIntent(message)) {
            // 2026-07-28: reuse the shared supply classifier so the chatbox catches the same
            // seller phrasings as WhatsApp ("put it on rent", "rent out", "kiraya pe dena", etc.).
            return 'redirect_upload';
        }

        // Check if user wants to visit/book
        const bookingKeywords = ['visit', 'schedule', 'book', 'see the property', 'interested', 'view'];
        if (bookingKeywords.some(kw => lowerMessage.includes(kw))) {
            return 'request_phone';
        }

        // Check if AI is asking for phone number
        if (lowerReply.includes('whatsapp number') || lowerReply.includes('phone number') || lowerReply.includes('contact number')) {
            return 'request_phone';
        }

        // Check if message contains a phone number
        if (/(\+91|91)?[6-9]\d{9}/.test(message)) {
            return 'book_visit';
        }

        return null;
    }

    /**
     * Handle property visit booking
     */
    async handleBooking(phone: string, propertyId: string, message: string, sessionId?: string) {
        try {
            // Normalize phone number to E.164
            const normalizedPhone = normalizePhone(phone);
            if (!normalizedPhone) {
                return { success: false, error: 'Invalid or missing phone number' };
            }

            // Parse date/time from message
            const parsedDateTime = this.dateParser.parse(message);
            console.log('📅 Parsed date/time:', parsedDateTime);

            // Date AND time are mandatory for every client booking — do NOT
            // create a vague visit; ask the client for the missing piece.
            // See docs/plans/2026-05-17-website-visit-not-visible-in-crm.md
            if (!parsedDateTime.date || !parsedDateTime.time) {
                const missing = !parsedDateTime.date && !parsedDateTime.time
                    ? 'preferred date and time'
                    : !parsedDateTime.date ? 'preferred date' : 'preferred time';
                return {
                    success: false,
                    needs_datetime: true,
                    message: `Please share your ${missing} for the visit — for example "tomorrow at 11 AM" or "18 May 4 PM" — so we can confirm it.`,
                };
            }

            // Get property details - select only fields that exist in BOTH schema and DB
            const property = await prisma.inventory.findUnique({
                where: { id: propertyId },
                select: {
                    id: true,
                    type: true,
                    location: true,
                    price: true,
                    display_price: true,
                    status: true,
                    specs: true,
                    media_urls: true,
                    owner_phone: true,
                },
            });

            if (!property) {
                return {
                    success: false,
                    error: 'Property not found',
                };
            }

            // Find or create contact
            let contact = await prisma.contact.findUnique({
                where: { phone_number: normalizedPhone },
            });

            if (!contact) {
                contact = await prisma.contact.create({
                    data: {
                        phone_number: normalizedPhone,
                        contact_type: 'BUYER',  // Default for chat-based contact creation — intent clarified later
                        source: 'website_chat',
                        last_channel: 'website',
                    },
                });
            } else {
                await prisma.contact.update({
                    where: { phone_number: normalizedPhone },
                    data: {
                        last_channel: 'website',
                        last_interaction: new Date(),
                    },
                });
            }

            // Create scheduled visit with parsed date/time
            const visit = await prisma.scheduledVisit.create({
                data: {
                    contact_id: normalizedPhone, // phone_number is the foreign key
                    property_id: propertyId,
                    status: 'pending',
                    source: 'website_chat',
                    preferred_date: parsedDateTime.date,
                    preferred_time: parsedDateTime.time,
                    metadata: {
                        sessionId,
                        message,
                        parsedDateTime: {
                            confidence: parsedDateTime.confidence,
                            original: parsedDateTime.original,
                        },
                    },
                },
            });

            // CALENDAR INTEGRATION: Create appointment in calendar system
            if (parsedDateTime.date) {
                try {
                    await this.calendarService.createFromChat({
                        contact_id: normalizedPhone,
                        property_id: propertyId,
                        scheduled_at: parsedDateTime.date,
                        source: 'website_chat',
                        sessionId,
                    });
                    console.log(`✅ Calendar appointment created for visit: ${visit.id}`);
                } catch (calendarError) {
                    console.error('Failed to create calendar appointment:', calendarError);
                    // Don't fail the booking if calendar creation fails
                }
            }

            // Log interaction
            await prisma.interaction.create({
                data: {
                    contact_id: contact.id,
                    direction: 'inbound',
                    channel: 'website_chat',
                    event_type: 'schedule_visit',
                    metadata: {
                        propertyId,
                        visitId: visit.id,
                        sessionId,
                    },
                },
            });

            // Prepare property details for messages
            const specs = property.specs as any || {};
            const bedrooms = specs.bedrooms || '';
            const bhkLabel = bedrooms ? `${bedrooms} BHK` : '';
            const propertyTitle = `${bhkLabel} ${property.type || 'Property'} in ${property.location || 'Location'}`;
            const propertyPrice = this.formatPrice(Number((property as any).display_price ?? property.price) || 0);
            const propertyAddress = property.location || 'Location';
            const customerName = contact.name || 'Customer';
            const customerPhone = normalizedPhone;

            // Format date/time for messages
            let visitDateTime = '';
            if (parsedDateTime.date || parsedDateTime.time) {
                visitDateTime = '\n\n*Preferred Visit Time:*\n';
                if (parsedDateTime.date) {
                    visitDateTime += `📅 ${this.dateParser.formatDate(parsedDateTime.date)}`;
                }
                if (parsedDateTime.time) {
                    visitDateTime += `\n🕐 ${this.dateParser.formatTime(parsedDateTime.time)}`;
                }
            }

            // ==================== 1. Send confirmation to CUSTOMER ====================
            const customerMessage = `🏠 *Realty Pandit - Visit Confirmation*

Thank you for your interest!

*Property:* ${propertyTitle}
*Price:* ${propertyPrice}
*Location:* ${propertyAddress}${visitDateTime}

Our team will contact you shortly to confirm your visit.

View property: https://realtypandit.in/properties/${propertyId}

_Namaste_ 🙏
- Panditji (Your AI Property Assistant)`;

            try {
                await this.whatsappService.sendText(normalizedPhone, customerMessage);
                console.log(`✅ Customer confirmation sent to ${normalizedPhone}`);
            } catch (whatsappError) {
                console.error('WhatsApp send error (customer):', whatsappError);
            }

            // ==================== FEATURE 3: WhatsApp Continuation Invite ====================
            // Send invitation to continue conversation on WhatsApp
            try {
                await this.sendWhatsAppContinuationInvite(normalizedPhone, sessionId);
            } catch (error) {
                console.error('WhatsApp continuation invite error:', error);
            }

            // ==================== 2. Find and notify INTERNAL SALES AGENT ====================
            // Find assigned agent for this contact OR property's default agent
            let assignedAgent = null;

            if (contact.assigned_to_agent_id) {
                // Contact has assigned agent
                assignedAgent = await prisma.agent.findUnique({
                    where: { id: contact.assigned_to_agent_id },
                });
            } else if (property.assigned_agent_id) {
                // Property has assigned agent
                assignedAgent = await prisma.agent.findUnique({
                    where: { id: property.assigned_agent_id },
                });
            } else {
                // Fallback: Find any active super_boss or manager
                assignedAgent = await prisma.agent.findFirst({
                    where: {
                        active: true,
                        role: { in: ['super_boss', 'manager'] },
                    },
                });
            }

            if (assignedAgent && assignedAgent.phone) {
                try {
                    await this.whatsappService.sendTemplate(assignedAgent.phone, 'rp_visit_agent_notify_v3', {
                        customer_name: customerName,
                        property: propertyTitle,
                        price: propertyPrice,
                        address: propertyAddress,
                        source: 'Website AI Chat (Panditji)',
                    });
                    console.log(`Agent notification sent to ${assignedAgent.name} (${assignedAgent.phone})`);
                } catch (whatsappError) {
                    console.error('WhatsApp send error (agent):', whatsappError);
                }
            }

            // ==================== 3. Find and notify KEY HANDLER ====================
            // Key handler is stored in property metadata or as a contact
            let keyHandler = null;

            if (property.key_holder_contact_id) {
                // Property has a specific key holder
                keyHandler = await prisma.contact.findUnique({
                    where: { id: property.key_holder_contact_id },
                });
            } else if (property.owner_contact_id) {
                // Fallback to property owner
                keyHandler = await prisma.contact.findUnique({
                    where: { id: property.owner_contact_id },
                });
            } else if (property.metadata && typeof property.metadata === 'object') {
                // Check metadata for key handler phone
                const metadata = property.metadata as any;
                if (metadata.key_holder_phone) {
                    keyHandler = {
                        phone_number: metadata.key_holder_phone,
                        name: metadata.key_holder_name || 'Key Holder',
                    };
                }
            }

            if (keyHandler && keyHandler.phone_number) {
                try {
                    await this.whatsappService.sendTemplate(keyHandler.phone_number, 'rp_visit_keyholder_v2', {
                        property: propertyTitle,
                        address: propertyAddress,
                        visitor_name: customerName,
                    });
                    console.log(`Key holder notification sent to ${keyHandler.name} (${keyHandler.phone_number})`);
                } catch (whatsappError) {
                    console.error('WhatsApp send error (key holder):', whatsappError);
                }
            }

            // ==================== 4. Optionally notify MANAGEMENT ====================
            // Send to super_boss for high-value properties (optional)
            if (property.price >= 10000000) { // Properties >= 1 Crore
                const superBoss = await prisma.agent.findFirst({
                    where: {
                        active: true,
                        role: 'super_boss',
                    },
                });

                if (superBoss && superBoss.phone) {
                    try {
                        await this.whatsappService.sendTemplate(superBoss.phone, 'rp_visit_mgmt_alert_v2', {
                            property: propertyTitle,
                            price: propertyPrice,
                            customer_name: customerName,
                            agent: assignedAgent?.name || 'Unassigned',
                        });
                        console.log(`Management alert sent to ${superBoss.name}`);
                    } catch (whatsappError) {
                        console.error('WhatsApp send error (management):', whatsappError);
                    }
                }
            }

            // Build confirmation message
            let confirmationMsg = `Great! I've scheduled your visit`;
            if (parsedDateTime.date || parsedDateTime.time) {
                confirmationMsg += ` for `;
                if (parsedDateTime.date) {
                    confirmationMsg += this.dateParser.formatDate(parsedDateTime.date);
                }
                if (parsedDateTime.time) {
                    confirmationMsg += ` at ${this.dateParser.formatTime(parsedDateTime.time)}`;
                }
            }
            confirmationMsg += `. You'll receive a confirmation on WhatsApp at ${normalizedPhone}. Our team will contact you soon! 🙏`;

            return {
                success: true,
                visitId: visit.id,
                message: confirmationMsg,
            };
        } catch (error) {
            console.error('Booking handler error:', error);
            throw error;
        }
    }

    /**
     * Extract keywords from user message
     */
    private extractKeywords(message: string): { location?: string } {
        const keywords: { location?: string } = {};
        const lowerMessage = message.toLowerCase();

        // Common cities
        const cities = ['noida', 'gurgaon', 'delhi', 'mumbai', 'bangalore', 'pune', 'hyderabad', 'chennai'];
        for (const city of cities) {
            if (lowerMessage.includes(city)) {
                keywords.location = city;
                break;
            }
        }

        // Common localities
        const localities = ['vaishali', 'sector', 'dwarka', 'indiranagar', 'koramangala', 'bandra', 'andheri'];
        for (const locality of localities) {
            if (lowerMessage.includes(locality)) {
                keywords.location = locality;
                break;
            }
        }

        return keywords;
    }

    /**
     * Format property for response
     */
    private formatProperty(property: any): Property {
        return {
            id: property.id,
            type: property.type,
            location: property.location,
            price: Number(property.price) || 0,
            status: property.status,
            specs: property.specs || {},
            photos: property.media_urls || [],
        };
    }

    /**
     * FEATURE 3: Send WhatsApp invitation to continue conversation
     */
    private async sendWhatsAppContinuationInvite(phone: string, sessionId?: string) {
        try {
            // Create or update conversation session
            if (sessionId) {
                // Check if session already exists
                let session = await prisma.conversationSession.findFirst({
                    where: {
                        phone_number: phone,
                        active: true,
                    },
                });

                if (!session) {
                    // Create new session linking website chat to WhatsApp
                    session = await prisma.conversationSession.create({
                        data: {
                            id: sessionId,
                            phone_number: phone,
                            workflow: 'buyer', // Assuming buyer since they're looking at properties
                            state: 'PROPERTY_SEARCH',
                            context: {
                                source: 'website_chat',
                                startedAt: new Date().toISOString(),
                                invitedToWhatsApp: true,
                            },
                            active: true,
                        },
                    });
                    console.log(`✅ Created conversation session: ${sessionId}`);
                } else {
                    // Update existing session to include website chat context
                    await prisma.conversationSession.update({
                        where: { id: session.id },
                        data: {
                            context: {
                                ...(session.context as any || {}),
                                invitedToWhatsApp: true,
                                invitedAt: new Date().toISOString(),
                            },
                        },
                    });
                    console.log(`✅ Updated conversation session: ${session.id}`);
                }
            }

            // Send WhatsApp invitation (Meta-approved utility template)
            await this.whatsappService.sendTemplate(phone, 'rp_whatsapp_invite_v2', {});
            console.log(`WhatsApp continuation invite sent to ${phone}`);

            // Log the invitation
            await prisma.interaction.create({
                data: {
                    phone_number: phone,
                    direction: 'outbound',
                    channel: 'whatsapp',
                    event_type: 'continuation_invite',
                    content: '[Template: rp_whatsapp_invite] WhatsApp continuation invite sent',
                    metadata: {
                        sessionId,
                        source: 'website_chat',
                    },
                },
            });

        } catch (error) {
            console.error('Error sending WhatsApp continuation invite:', error);
            throw error;
        }
    }

    /**
     * FEATURE 3: Load conversation history from website chat
     * Used by WhatsApp webhook to provide context
     */
    async loadChatHistory(phone: string, limit: number = 20): Promise<any[]> {
        try {
            const interactions = await prisma.interaction.findMany({
                where: {
                    phone_number: phone,
                    channel: { in: ['website_chat', 'whatsapp'] },
                },
                orderBy: {
                    created_at: 'desc',
                },
                take: limit,
            });

            // Format history for context
            return interactions.reverse().map(interaction => ({
                role: interaction.direction === 'inbound' ? 'user' : 'assistant',
                content: interaction.content || '',
                timestamp: interaction.created_at,
                channel: interaction.channel,
            }));
        } catch (error) {
            console.error('Error loading chat history:', error);
            return [];
        }
    }

    /**
     * Format price in Indian format
     */
    private formatPrice(price: number): string {
        if (price >= 10000000) {
            return `₹${(price / 10000000).toFixed(2)} Cr`;
        } else if (price >= 100000) {
            return `₹${(price / 100000).toFixed(0)} L`;
        } else {
            return `₹${price.toLocaleString('en-IN')}`;
        }
    }
}
