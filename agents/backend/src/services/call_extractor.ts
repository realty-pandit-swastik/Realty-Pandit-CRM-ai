/**
 * Call AI Extraction Service
 * Extracts structured data from call transcripts using Gemini
 * Handles Hindi, Hinglish, and English conversations
 */

import { LLMService } from './llm';
import prisma from '../db';
import logger from '../utils/logger';

export interface ExtractedCallData {
    intent: 'BUY' | 'RENT' | 'SELL' | 'LEASE' | 'OTHER';
    role: 'BUYER' | 'TENANT' | 'LANDLORD' | 'UNKNOWN';
    propertyType?: string; // flat, house, plot, office, etc.
    bhk?: string; // 1, 2, 3, 4, 5+
    location?: string;
    budgetMin?: number; // in lakhs
    budgetMax?: number; // in lakhs
    urgency?: 'IMMEDIATE' | 'WITHIN_MONTH' | 'WITHIN_3_MONTHS' | 'FLEXIBLE';
    followUpDate?: string; // YYYY-MM-DD
    appointmentMentioned?: boolean;
    sentiment?: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
    summary: string; // 2-3 sentences
    confidence: number; // 0.0 - 1.0
    keyPoints?: string[]; // Important points mentioned
}

/**
 * Call Extractor Service
 * Uses Gemini to extract structured data from call transcripts
 */
export class CallExtractor {
    private llm: LLMService;

    constructor() {
        this.llm = new LLMService();
    }

    /**
     * Extract structured data from call transcript
     * @param transcript Call transcript text
     * @param phoneNumber Contact phone number (for context enrichment)
     */
    async extractFromTranscript(
        transcript: string,
        phoneNumber?: string
    ): Promise<ExtractedCallData> {
        try {
            logger.info('[CallExtractor] Extracting data from transcript...');

            // Clean transcript
            const cleanedTranscript = this.preprocessTranscript(transcript);

            // Get context from existing contact (if any)
            const context = phoneNumber ? await this.getContactContext(phoneNumber) : null;

            // Generate extraction prompt
            const prompt = this.buildExtractionPrompt(cleanedTranscript, context);

            // Call Gemini API
            const llmResponse = await this.llm.generateResponse(prompt, '');

            // Parse structured response
            const extractedData = this.parseExtractionResponse(llmResponse);

            // Validate and adjust confidence
            const validatedData = this.validateAndScore(extractedData, cleanedTranscript);

            logger.info('[CallExtractor] Extraction complete:', validatedData);

            return validatedData;
        } catch (error) {
            logger.error('[CallExtractor] Extraction failed:', error);
            // Return fallback data
            return this.getFallbackData(transcript);
        }
    }

    /**
     * Build extraction prompt for Gemini
     */
    private buildExtractionPrompt(transcript: string, context: any): string {
        let contextInfo = '';
        if (context) {
            contextInfo = `\n\nEXISTING CONTACT CONTEXT:
- Previous intent: ${context.intent || 'unknown'}
- Previous property type: ${context.property_type || 'unknown'}
- Previous location: ${context.preferred_location || 'unknown'}
- Lead status: ${context.lead_status || 'unknown'}`;
        }

        return `You are an AI assistant for a real estate company. Analyze the following call transcript and extract structured information.

IMPORTANT INSTRUCTIONS:
1. The conversation may be in Hindi, English, or Hinglish (mix of both)
2. Extract all relevant information accurately
3. If information is not mentioned, leave it as null/undefined
4. Be conservative with confidence score - only high confidence if data is clear
5. Use Indian real estate terminology (e.g., 1 BHK, 2 BHK, Lakh, Crore)

CALL TRANSCRIPT:
${transcript}
${contextInfo}

Please extract the following information and respond ONLY with valid JSON (no markdown, no code blocks, just pure JSON):

{
  "intent": "BUY | RENT | SELL | LEASE | OTHER",
  "role": "BUYER | TENANT | LANDLORD | UNKNOWN",
  "propertyType": "string or null (e.g., flat, house, villa, plot, office, shop)",
  "bhk": "string or null (e.g., 1, 2, 3, 4, 5+, Studio)",
  "location": "string or null (specific area, city, locality)",
  "budgetMin": number or null (in lakhs),
  "budgetMax": number or null (in lakhs),
  "urgency": "IMMEDIATE | WITHIN_MONTH | WITHIN_3_MONTHS | FLEXIBLE | null",
  "followUpDate": "YYYY-MM-DD or null",
  "appointmentMentioned": boolean,
  "sentiment": "POSITIVE | NEUTRAL | NEGATIVE",
  "summary": "2-3 sentence summary of the call in English",
  "keyPoints": ["array of important points mentioned"],
  "confidence": number (0.0 to 1.0)
}

EXTRACTION RULES:
- Intent: Identify if caller wants to BUY, RENT, SELL, or LEASE property
- Role: BUYER if buying, TENANT if renting, LANDLORD if listing their own property
- Location: Extract specific area/locality names (e.g., "Sector 150 Noida", "Gurgaon", "South Delhi")
- Budget: Convert to lakhs (e.g., "50 lakh", "1.5 crore" = 150 lakhs)
- Urgency: Based on timeline mentioned (e.g., "urgent" = IMMEDIATE, "in 2 months" = WITHIN_3_MONTHS)
- Sentiment: POSITIVE if enthusiastic/interested, NEGATIVE if frustrated/uninterested, NEUTRAL otherwise
- Confidence: 0.9-1.0 if all key fields clear, 0.7-0.89 if most fields clear, 0.5-0.69 if partial info, <0.5 if vague
- Summary: Concise summary in English covering main discussion points

RESPOND WITH ONLY THE JSON OBJECT.`;
    }

    /**
     * Parse LLM response to extract structured data
     */
    private parseExtractionResponse(llmResponse: string): ExtractedCallData {
        try {
            // Remove markdown code blocks if present
            let cleanedResponse = llmResponse.trim();
            cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');

            // Parse JSON
            const parsed = JSON.parse(cleanedResponse);

            return {
                intent: parsed.intent || 'OTHER',
                role: parsed.role || 'UNKNOWN',
                propertyType: parsed.propertyType || undefined,
                bhk: parsed.bhk || undefined,
                location: parsed.location || undefined,
                budgetMin: parsed.budgetMin || undefined,
                budgetMax: parsed.budgetMax || undefined,
                urgency: parsed.urgency || undefined,
                followUpDate: parsed.followUpDate || undefined,
                appointmentMentioned: parsed.appointmentMentioned || false,
                sentiment: parsed.sentiment || 'NEUTRAL',
                summary: parsed.summary || 'Call transcript extracted.',
                confidence: parsed.confidence || 0.5,
                keyPoints: parsed.keyPoints || [],
            };
        } catch (error) {
            logger.error('[CallExtractor] Failed to parse LLM response:', error);
            throw new Error('Failed to parse extraction response');
        }
    }

    /**
     * Validate extracted data and adjust confidence score
     */
    private validateAndScore(data: ExtractedCallData, transcript: string): ExtractedCallData {
        let confidence = data.confidence;

        // Reduce confidence if key fields are missing
        if (!data.intent || data.intent === 'OTHER') confidence *= 0.8;
        if (data.role === 'UNKNOWN') confidence *= 0.9;
        if (!data.location) confidence *= 0.9;

        // Increase confidence if multiple fields are present
        const fieldCount = [
            data.propertyType,
            data.bhk,
            data.location,
            data.budgetMin,
            data.budgetMax,
            data.urgency,
        ].filter((f) => f !== undefined && f !== null).length;

        if (fieldCount >= 4) confidence = Math.min(confidence * 1.1, 1.0);

        // Ensure confidence is within bounds
        confidence = Math.max(0.0, Math.min(1.0, confidence));

        return {
            ...data,
            confidence,
        };
    }

    /**
     * Get existing contact context for enrichment
     */
    private async getContactContext(phoneNumber: string): Promise<any> {
        try {
            const contact = await prisma.contact.findUnique({
                where: { phone_number: phoneNumber },
                select: {
                    intent: true,
                    property_type: true,
                    preferred_location: true,
                    lead_status: true,
                    contact_type: true,
                },
            });

            return contact;
        } catch (error) {
            logger.error('[CallExtractor] Failed to get contact context:', error);
            return null;
        }
    }

    /**
     * Pre-process transcript (clean filler words, normalize)
     */
    private preprocessTranscript(transcript: string): string {
        let cleaned = transcript;

        // Remove excessive filler words (common in Hindi/Hinglish)
        const fillerWords = ['uh', 'um', 'uhm', 'hmm', 'haan', 'achha', 'theek', 'matlab'];
        fillerWords.forEach((word) => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            cleaned = cleaned.replace(regex, '');
        });

        // Normalize multiple spaces
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        // Normalize currency mentions (for easier extraction)
        cleaned = cleaned.replace(/(\d+)\s*crore/gi, '$1 Crore');
        cleaned = cleaned.replace(/(\d+)\s*lakh/gi, '$1 Lakh');

        return cleaned;
    }

    /**
     * Get fallback data when extraction fails
     */
    private getFallbackData(transcript: string): ExtractedCallData {
        return {
            intent: 'OTHER',
            role: 'UNKNOWN',
            summary: `Call transcript: ${transcript.substring(0, 200)}...`,
            confidence: 0.2,
            sentiment: 'NEUTRAL',
            appointmentMentioned: false,
        };
    }
}

// Singleton instance
const callExtractor = new CallExtractor();

export default callExtractor;
