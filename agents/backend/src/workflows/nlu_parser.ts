/**
 * NLU Parser — Natural Language Understanding for Chat Workflow
 *
 * Two-tier parsing strategy:
 *   Tier 1: Pattern matching (fast, zero API calls)
 *   Tier 2: Gemini LLM fallback (for ambiguous/complex inputs)
 *
 * Supports Hindi, English, and Hinglish input.
 */

import { WorkflowStep, StepOption } from './workflow_types';
import { ParsedInput } from './conversational_workflow_core';
import { LLMService } from '../services/llm';
import { normalizePhone } from '../utils/phone';
import logger from '../utils/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NLUParseResult {
    parsed: ParsedInput | null;
    command: 'back' | 'skip' | 'cancel' | 'done' | null;
    confidence: 'high' | 'medium' | 'low';
    usedLLM: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COMMANDS: Record<string, string[]> = {
    back: [
        'back', 'wapas', 'peeche', 'previous', 'go back', 'pichla',
        'repeat', 'dobara', 'phir se', 'fir se', 'galti', 'mistake',
        'change', 'badlo', 'wrong', 'galat', 'redo',
        'dobara se', 'galti se', 'pehle wala',
    ],
    skip: [
        'skip', 'aage', 'chhodo', 'next', 'skip karo', 'chhod do',
        // "I don't know" variants (English + Hindi + Hinglish)
        "i don't know", "i dont know", "don't know", "dont know", "idk", "no idea",
        "not sure", "i am not sure", "i'm not sure", "dunno",
        "mujhe nahi pata", "nahi pata", "pata nahi", "malum nahi", "nahi malum",
        "mujhe nhi pata", "nhi pata", "pata nhi", "kuch nahi", "nahi hai",
        "mujhe nahi malum", "nahi pata hai", "pata nahi hai",
    ],
    cancel: [
        'cancel', 'band karo', 'ruk', 'stop', 'quit', 'exit', 'band', 'ruko',
        'nahi karna', 'rehne do', 'chhod do', 'mat karo',
    ],
    done: ['done', 'ho gaya', 'bas', 'finish', 'complete', 'finished', 'hogaya', 'khatam', 'theek hai', 'sahi hai'],
};

const CURRENCY_PATTERNS: Array<{ regex: RegExp; multiplier: number }> = [
    { regex: /(\d+(?:\.\d+)?)\s*(?:crore|cr|karod|crores)/i, multiplier: 10000000 },
    { regex: /(\d+(?:\.\d+)?)\s*(?:lakh|lac|lacs|lakhs)/i, multiplier: 100000 },
    { regex: /(\d+(?:\.\d+)?)\s*(?:thousand|hazar|hazaar|k)\b/i, multiplier: 1000 },
];

// Combined pattern: "X lakh Y thousand" or "X.Y lakh"
const COMBINED_CURRENCY = /(\d+(?:\.\d+)?)\s*(?:lakh|lac|lacs|lakhs)\s*(?:(\d+)\s*(?:thousand|hazar|hazaar|k)?\s*)?/i;

const YES_WORDS = ['yes', 'haan', 'ha', 'y', 'confirm', 'haa', 'ji', 'ji haan', 'sahi hai'];
const NO_WORDS = ['no', 'nahi', 'n', 'edit', 'nhi', 'galat', 'change', 'modify'];

// ─── Indian Address Regex Helpers ────────────────────────────────────────────

const INDIAN_STATES: Array<{ names: string[]; canonical: string }> = [
    { names: ['uttar pradesh', 'up', 'u.p.', 'u p'], canonical: 'Uttar Pradesh' },
    { names: ['madhya pradesh', 'mp', 'm.p.', 'm p'], canonical: 'Madhya Pradesh' },
    { names: ['andhra pradesh', 'ap', 'a.p.'], canonical: 'Andhra Pradesh' },
    { names: ['arunachal pradesh'], canonical: 'Arunachal Pradesh' },
    { names: ['himachal pradesh', 'hp', 'h.p.'], canonical: 'Himachal Pradesh' },
    { names: ['west bengal', 'wb', 'w.b.', 'bengal', 'paschim banga'], canonical: 'West Bengal' },
    { names: ['rajasthan', 'rj', 'raj'], canonical: 'Rajasthan' },
    { names: ['maharashtra', 'mh', 'maha'], canonical: 'Maharashtra' },
    { names: ['karnataka', 'ka', 'karnatak'], canonical: 'Karnataka' },
    { names: ['tamil nadu', 'tn', 't.n.', 'tamilnadu'], canonical: 'Tamil Nadu' },
    { names: ['telangana', 'ts', 'telengana'], canonical: 'Telangana' },
    { names: ['kerala', 'kl'], canonical: 'Kerala' },
    { names: ['gujarat', 'gj', 'guj'], canonical: 'Gujarat' },
    { names: ['punjab', 'pb', 'panjab'], canonical: 'Punjab' },
    { names: ['haryana', 'hr', 'hry'], canonical: 'Haryana' },
    { names: ['bihar', 'br'], canonical: 'Bihar' },
    { names: ['odisha', 'or', 'orissa'], canonical: 'Odisha' },
    { names: ['jharkhand', 'jh', 'jharkand'], canonical: 'Jharkhand' },
    { names: ['chhattisgarh', 'cg', 'chattisgarh', 'chhatisgarh'], canonical: 'Chhattisgarh' },
    { names: ['uttarakhand', 'uk', 'uttaranchal', 'uttrakhand'], canonical: 'Uttarakhand' },
    { names: ['goa', 'ga'], canonical: 'Goa' },
    { names: ['assam', 'as'], canonical: 'Assam' },
    { names: ['delhi', 'dl', 'new delhi', 'nct', 'dilli'], canonical: 'Delhi' },
    { names: ['jammu and kashmir', 'jk', 'j&k', 'j k', 'jammu kashmir'], canonical: 'Jammu and Kashmir' },
    { names: ['chandigarh', 'chd'], canonical: 'Chandigarh' },
];

// City → district + state mapping for common cities
const CITY_STATE_MAP: Record<string, { district: string; state: string }> = {
    'noida': { district: 'Gautam Buddh Nagar', state: 'Uttar Pradesh' },
    'greater noida': { district: 'Gautam Buddh Nagar', state: 'Uttar Pradesh' },
    'ghaziabad': { district: 'Ghaziabad', state: 'Uttar Pradesh' },
    'lucknow': { district: 'Lucknow', state: 'Uttar Pradesh' },
    'varanasi': { district: 'Varanasi', state: 'Uttar Pradesh' },
    'agra': { district: 'Agra', state: 'Uttar Pradesh' },
    'meerut': { district: 'Meerut', state: 'Uttar Pradesh' },
    'prayagraj': { district: 'Prayagraj', state: 'Uttar Pradesh' },
    'allahabad': { district: 'Prayagraj', state: 'Uttar Pradesh' },
    'kanpur': { district: 'Kanpur Nagar', state: 'Uttar Pradesh' },
    'gurugram': { district: 'Gurugram', state: 'Haryana' },
    'gurgaon': { district: 'Gurugram', state: 'Haryana' },
    'faridabad': { district: 'Faridabad', state: 'Haryana' },
    'delhi': { district: 'Delhi', state: 'Delhi' },
    'new delhi': { district: 'New Delhi', state: 'Delhi' },
    'mumbai': { district: 'Mumbai', state: 'Maharashtra' },
    'pune': { district: 'Pune', state: 'Maharashtra' },
    'bangalore': { district: 'Bengaluru', state: 'Karnataka' },
    'bengaluru': { district: 'Bengaluru', state: 'Karnataka' },
    'hyderabad': { district: 'Hyderabad', state: 'Telangana' },
    'chennai': { district: 'Chennai', state: 'Tamil Nadu' },
    'kolkata': { district: 'Kolkata', state: 'West Bengal' },
    'jaipur': { district: 'Jaipur', state: 'Rajasthan' },
    'jodhpur': { district: 'Jodhpur', state: 'Rajasthan' },
    'udaipur': { district: 'Udaipur', state: 'Rajasthan' },
    'ahmedabad': { district: 'Ahmedabad', state: 'Gujarat' },
    'surat': { district: 'Surat', state: 'Gujarat' },
    'chandigarh': { district: 'Chandigarh', state: 'Chandigarh' },
    'bhopal': { district: 'Bhopal', state: 'Madhya Pradesh' },
    'indore': { district: 'Indore', state: 'Madhya Pradesh' },
    'patna': { district: 'Patna', state: 'Bihar' },
    'ranchi': { district: 'Ranchi', state: 'Jharkhand' },
    'dehradun': { district: 'Dehradun', state: 'Uttarakhand' },
    'shimla': { district: 'Shimla', state: 'Himachal Pradesh' },
    'vaishali': { district: 'Ghaziabad', state: 'Uttar Pradesh' },
    'indirapuram': { district: 'Ghaziabad', state: 'Uttar Pradesh' },
    'crossing republik': { district: 'Ghaziabad', state: 'Uttar Pradesh' },
    'raj nagar extension': { district: 'Ghaziabad', state: 'Uttar Pradesh' },
    'dwarka': { district: 'South West Delhi', state: 'Delhi' },
    'rohini': { district: 'North West Delhi', state: 'Delhi' },
    'laxmi nagar': { district: 'East Delhi', state: 'Delhi' },
};

/**
 * Regex-based Indian address parser (Tier 1 fallback).
 * Handles patterns like "56, d block vaishali sector 4 ghaziabad up"
 */
function regexParseAddress(text: string): Record<string, string> | null {
    const lc = text.toLowerCase().replace(/[,.\-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (lc.length < 5) return null;

    const result: Record<string, string> = {};

    // 1. Extract pincode
    const pincodeMatch = text.match(/\b(\d{6})\b/);
    if (pincodeMatch) result.pincode = pincodeMatch[1];

    // 2. Extract state (try to find at the end or anywhere)
    let detectedState: string | null = null;
    let textWithoutState = lc;
    for (const s of INDIAN_STATES) {
        for (const name of s.names) {
            // Match as whole word (with word boundaries)
            const stateRegex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (stateRegex.test(lc)) {
                detectedState = s.canonical;
                textWithoutState = lc.replace(stateRegex, ' ').trim();
                break;
            }
        }
        if (detectedState) break;
    }

    // 3. Extract city/district from known cities
    let cityInfo: { district: string; state: string } | null = null;
    // Sort by length descending so "greater noida" matches before "noida"
    const cityKeys = Object.keys(CITY_STATE_MAP).sort((a, b) => b.length - a.length);
    for (const city of cityKeys) {
        const cityRegex = new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (cityRegex.test(textWithoutState)) {
            cityInfo = CITY_STATE_MAP[city];
            textWithoutState = textWithoutState.replace(cityRegex, ' ').trim();
            break;
        }
    }

    // 4. If we found a city, use its district and state
    if (cityInfo) {
        result.district = cityInfo.district;
        if (!detectedState) detectedState = cityInfo.state;
        result.city = cityInfo.district;
    }
    if (detectedState) result.state = detectedState;

    // 5. Extract sector/block/phase patterns as sub_locality
    const sectorMatch = textWithoutState.match(/\b(sector\s*\d+[a-z]?|phase\s*\d+|block\s*[a-z0-9]+|pocket\s*[a-z0-9]+)\b/i);

    // 6. Everything remaining before the city is the locality
    // Remove pincode, plot/flat numbers from remaining text
    let remaining = textWithoutState
        .replace(/\b\d{6}\b/, '')
        .replace(/\b(flat|unit|shop|office|floor)\s*(no\.?\s*)?\d+[a-z]?\b/gi, '')
        .replace(/\b(plot)\s*(no\.?\s*)?\d+[a-z]?\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    // Extract flat/plot numbers for extra fields
    const flatMatch = lc.match(/\b(?:flat|unit|shop|office)\s*(?:no\.?\s*)?(\d+[a-z]?(?:\s*[-/]\s*\d+[a-z]?)?)\b/i);
    if (flatMatch) result.flat_no = flatMatch[1];
    const plotMatch = lc.match(/\b(?:plot)\s*(?:no\.?\s*)?(\d+[a-z]?)\b/i);
    if (plotMatch) result.plot_no = plotMatch[1];
    const floorMatch = lc.match(/\b(?:floor|manzil)\s*(?:no\.?\s*)?(\d+)\b/i);
    if (floorMatch) result.floor_number = floorMatch[1];

    // The remaining text is the locality
    if (remaining.length > 1) {
        // Capitalize each word
        const locality = remaining.replace(/\b\w/g, c => c.toUpperCase());
        result.locality = locality;
        // If sector was found, also set sub_locality
        if (sectorMatch) {
            result.sub_locality = sectorMatch[1].replace(/\b\w/g, c => c.toUpperCase());
        }
    } else if (sectorMatch) {
        result.locality = sectorMatch[1].replace(/\b\w/g, c => c.toUpperCase());
    }

    // Must have at least locality+state or city+state to be useful
    if (!result.state) return null;
    if (!result.locality && !result.district && !result.sub_locality) return null;

    return result;
}

// ─── Parser ──────────────────────────────────────────────────────────────────

export class NLUParser {
    private llm: LLMService;

    constructor() {
        this.llm = new LLMService();
    }

    /**
     * Parse free-text user input into structured workflow answer.
     *
     * Strategy:
     * 1. Check for commands (back/skip/cancel/done)
     * 2. Try pattern matching (fast, no API call)
     * 3. Fall back to Gemini for ambiguous inputs
     */
    async parse(
        text: string,
        step: WorkflowStep,
        options: StepOption[],
        addressContext?: { floor_required: boolean; plot_area_required: boolean; bhk_required: boolean },
    ): Promise<NLUParseResult> {
        const trimmed = text.trim();
        if (!trimmed) {
            return { parsed: null, command: null, confidence: 'low', usedLLM: false };
        }

        // 1. Check for commands
        const command = this.detectCommand(trimmed);
        if (command) {
            return { parsed: null, command, confidence: 'high', usedLLM: false };
        }

        // 2. Try pattern matching (Tier 1)
        const patternResult = this.patternParse(trimmed, step, options);
        if (patternResult) {
            return { parsed: patternResult, command: null, confidence: 'high', usedLLM: false };
        }

        // 3. Gemini fallback (Tier 2) — only for certain input types
        if (this.shouldUseLLM(step)) {
            try {
                const llmResult = await this.llmParse(trimmed, step, options, addressContext);
                if (llmResult) {
                    return { parsed: llmResult, command: null, confidence: 'medium', usedLLM: true };
                }
            } catch (err) {
                logger.warn(`[NLUParser] LLM fallback failed for step ${step.id}:`, err);
            }
        }

        return { parsed: null, command: null, confidence: 'low', usedLLM: false };
    }

    /**
     * Parse yes/no confirmation from text.
     */
    parseConfirmation(text: string): 'yes' | 'no' | null {
        const lc = text.toLowerCase().trim();
        if (YES_WORDS.some(w => lc === w || lc.startsWith(w + ' '))) return 'yes';
        if (NO_WORDS.some(w => lc === w || lc.startsWith(w + ' '))) return 'no';
        return null;
    }

    // ─── Command Detection ───────────────────────────────────────────────────

    detectCommand(text: string): 'back' | 'skip' | 'cancel' | 'done' | null {
        const lc = text.toLowerCase().trim();
        // Check last line for multi-line messages
        const lines = lc.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
        const candidates = lines.length > 1 ? [lines[lines.length - 1], lc] : [lc];

        for (const candidate of candidates) {
            for (const [cmd, words] of Object.entries(COMMANDS)) {
                // Exact match
                if (words.includes(candidate)) {
                    return cmd as 'back' | 'skip' | 'cancel' | 'done';
                }
                // Partial match: multi-word synonyms (>3 chars) found in user text
                if (words.some(w => w.length > 3 && candidate.includes(w))) {
                    return cmd as 'back' | 'skip' | 'cancel' | 'done';
                }
            }
        }
        return null;
    }

    // ─── Tier 1: Pattern Matching ────────────────────────────────────────────

    private patternParse(
        text: string,
        step: WorkflowStep,
        options: StepOption[],
    ): ParsedInput | null {
        const lc = text.toLowerCase().trim();

        switch (step.input_type) {
            case 'radio':
            case 'dropdown':
                return this.matchOption(text, options);

            case 'number':
                return this.parseNumber(text, step);

            case 'phone':
                return this.parsePhoneInput(text);

            case 'text':
            case 'textarea':
                // Accept any non-empty text
                return { value: text.trim() };

            case 'compound':
                return this.parseCompound(text, step);

            case 'confirm':
                const conf = this.parseConfirmation(text);
                if (conf) return { value: conf };
                return null;

            case 'address_block': {
                // Tier 1: Regex-based Indian address parser (no API call)
                const regexAddr = regexParseAddress(text);
                if (regexAddr) {
                    logger.info(`[NLUParser] Regex address parse succeeded: ${JSON.stringify(regexAddr)}`);
                    return { value: regexAddr };
                }
                // Return null → falls through to Gemini LLM (Tier 2)
                return null;
            }

            case 'owner_block':
                return this.parseOwnerBlock(text);

            case 'uploader_block':
                return this.parseUploaderBlock(text);

            case 'multi_select':
                return this.parseMultiSelect(text, options);

            default:
                return text.trim() ? { value: text.trim() } : null;
        }
    }

    /**
     * Match user text to one of the available options.
     */
    private matchOption(text: string, options: StepOption[]): ParsedInput | null {
        if (options.length === 0) return null;

        const lc = text.toLowerCase().trim();
        const lines = lc.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
        const lastLine = lines.length > 1 ? lines[lines.length - 1] : lc;
        const candidates = lines.length > 1 ? [lastLine, lc] : [lc];

        for (const candidate of candidates) {
            // Exact value match
            const exactValue = options.find(o => o.value.toLowerCase() === candidate);
            if (exactValue) return { value: exactValue.value };

            // Exact label match
            const exactLabel = options.find(o => o.label.toLowerCase() === candidate);
            if (exactLabel) return { value: exactLabel.value };

            // Hindi label match
            const hindiLabel = options.find(o => o.label_hi?.toLowerCase() === candidate);
            if (hindiLabel) return { value: hindiLabel.value };

            // Numbered selection ("1", "2", "3")
            const num = parseInt(candidate);
            if (!isNaN(num) && num >= 1 && num <= options.length) {
                return { value: options[num - 1].value };
            }

            // Partial: user text contains option label
            const partial = options.find(o => candidate.includes(o.label.toLowerCase()));
            if (partial) return { value: partial.value };

            // Partial: user text contains option value
            const partialValue = options.find(o => candidate.includes(o.value.toLowerCase()));
            if (partialValue) return { value: partialValue.value };

            // Reverse partial: option label contains user text
            const reversePartial = options.find(o => o.label.toLowerCase().includes(candidate));
            if (reversePartial) return { value: reversePartial.value };

            // Strip BHK patterns (e.g., "2 BHK flat" → "flat")
            const bhkStripped = candidate
                .replace(/\d+\s*bhk\s*/i, '')
                .trim();
            if (bhkStripped !== candidate && bhkStripped.length > 0) {
                const bhkMatch = options.find(o =>
                    o.label.toLowerCase().includes(bhkStripped) ||
                    bhkStripped.includes(o.label.toLowerCase()) ||
                    o.value.toLowerCase().includes(bhkStripped),
                );
                if (bhkMatch) return { value: bhkMatch.value };
            }

            // Cleaned input: strip conversational prefixes
            const cleaned = candidate
                .replace(/^(i want |i need |select |choose |option |mujhe |main |mere |mera )/i, '')
                .trim();
            if (cleaned !== candidate && cleaned.length > 0) {
                const cleanMatch = options.find(o =>
                    o.label.toLowerCase() === cleaned ||
                    cleaned.includes(o.label.toLowerCase()) ||
                    o.label.toLowerCase().includes(cleaned),
                );
                if (cleanMatch) return { value: cleanMatch.value };
            }
        }

        return null;
    }

    /**
     * Parse a number from text, including Indian currency formats.
     */
    private parseNumber(text: string, step: WorkflowStep): ParsedInput | null {
        // Try Indian currency first
        const currency = this.parseIndianCurrency(text);
        if (currency !== null) {
            return { value: currency };
        }

        // Plain number (strip commas)
        const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
        const numText = lines.length > 1 ? lines[lines.length - 1] : text.trim();
        const cleaned = numText.replace(/,/g, '').replace(/₹/g, '').trim();
        const num = parseFloat(cleaned);
        if (!isNaN(num)) {
            return { value: num };
        }

        return null;
    }

    /**
     * Parse Indian currency strings.
     * "55 lakh" → 5500000
     * "2.5 crore" → 25000000
     * "5 lakh 50 thousand" → 550000
     * "25 lakh" → 2500000
     */
    parseIndianCurrency(text: string): number | null {
        const lc = text.toLowerCase().trim().replace(/₹/g, '').replace(/,/g, '').trim();

        // Combined: "X lakh Y thousand"
        const combined = lc.match(COMBINED_CURRENCY);
        if (combined) {
            const lakhPart = parseFloat(combined[1]) * 100000;
            const thousandPart = combined[2] ? parseFloat(combined[2]) * 1000 : 0;
            return lakhPart + thousandPart;
        }

        // Single unit patterns
        for (const { regex, multiplier } of CURRENCY_PATTERNS) {
            const match = lc.match(regex);
            if (match) {
                return parseFloat(match[1]) * multiplier;
            }
        }

        return null;
    }

    /**
     * Parse phone number from text.
     */
    private parsePhoneInput(text: string): ParsedInput | null {
        // Strip all non-digits
        const digits = text.replace(/[^0-9+]/g, '');

        // Try to normalize
        const normalized = normalizePhone(digits);
        if (normalized && normalized.length >= 12) {
            // Return the bare 10-digit number (workflow engine expects this)
            const bare = normalized.replace('+91', '');
            return { value: bare };
        }

        // Try extracting 10 digits from the text
        const match = text.match(/[6-9]\d{9}/);
        if (match) {
            return { value: match[0] };
        }

        return null;
    }

    /**
     * Parse compound input (e.g., "1200 sqft").
     */
    private parseCompound(text: string, step: WorkflowStep): ParsedInput | null {
        if (!step.secondary_options) return null;

        const parts = text.trim().split(/\s+/);
        const numStr = (parts[0] || '').replace(/,/g, '');
        const num = parseFloat(numStr);
        if (isNaN(num)) return null;

        const unitText = parts.slice(1).join(' ').toLowerCase();
        if (unitText) {
            const matchedUnit = step.secondary_options.find(
                o => o.value.toLowerCase() === unitText || o.label.toLowerCase() === unitText,
            );
            return {
                value: num,
                secondaryValue: matchedUnit?.value || step.secondary_options[0].value,
            };
        }

        return { value: num, secondaryValue: step.secondary_options[0].value };
    }

    /**
     * Parse owner block: "Name, Phone"
     */
    private parseOwnerBlock(text: string): ParsedInput | null {
        const parts = text.split(/[,\n]+/).map(s => s.trim()).filter(s => s.length > 0);
        if (parts.length < 1) return null;
        return {
            value: {
                owner_name: parts[0],
                owner_phone: parts[1] || '',
            },
        };
    }

    /**
     * Parse uploader block: "Name, Phone, Email"
     */
    private parseUploaderBlock(text: string): ParsedInput | null {
        const parts = text.split(/[,\n]+/).map(s => s.trim()).filter(s => s.length > 0);
        if (parts.length < 2) return null;
        return {
            value: {
                name: parts[0],
                phone: parts[1],
                email: parts[2] || '',
            },
        };
    }

    /**
     * Parse multi-select input (comma-separated numbers/names).
     */
    private parseMultiSelect(text: string, options: StepOption[]): ParsedInput | null {
        if (!text.trim()) return null;
        const selected: string[] = [];
        const items = text.split(/[,;]+/).map(s => s.trim().toLowerCase());

        for (const item of items) {
            const num = parseInt(item);
            if (!isNaN(num) && num >= 1 && num <= options.length) {
                selected.push(options[num - 1].value);
                continue;
            }
            const match = options.find(o =>
                o.value.toLowerCase() === item || o.label.toLowerCase().includes(item),
            );
            if (match) selected.push(match.value);
        }

        return selected.length > 0 ? { value: selected } : null;
    }

    // ─── Tier 2: LLM Fallback ────────────────────────────────────────────────

    /**
     * Determine if we should use LLM for this step type.
     * Only for input types where pattern matching might fail.
     */
    private shouldUseLLM(step: WorkflowStep): boolean {
        return ['radio', 'dropdown', 'number', 'phone', 'compound', 'owner_block', 'uploader_block', 'address_block'].includes(step.input_type);
    }

    /**
     * Use Gemini to parse ambiguous user input.
     */
    private async llmParse(
        text: string,
        step: WorkflowStep,
        options: StepOption[],
        addressContext?: { floor_required: boolean; plot_area_required: boolean; bhk_required: boolean },
    ): Promise<ParsedInput | null> {
        // Specialized address_block parsing
        if (step.input_type === 'address_block') {
            return this.llmParseAddress(text, addressContext);
        }

        let prompt = `You are a form field parser for a Real Estate property listing system in India.

Current field: ${step.question}
Input type: ${step.input_type}
`;

        if (options.length > 0) {
            prompt += `Valid options:\n${options.map(o => `- "${o.value}": ${o.label}`).join('\n')}\n`;
        }
        if (step.validation) {
            prompt += `Validation: ${JSON.stringify(step.validation)}\n`;
        }

        prompt += `
User typed: "${text}"

Extract the structured value from the user's message. The user may type in Hindi, English, or Hinglish.
${step.input_type === 'number' ? 'Convert Indian currency like "55 lakh" to 5500000, "2.5 crore" to 25000000.' : ''}
${step.input_type === 'phone' ? 'Extract the 10-digit Indian phone number.' : ''}
${options.length > 0 ? 'Match the user intent to the closest valid option value.' : ''}

Reply ONLY in JSON (no markdown, no explanation):
{"value": <extracted_value>, "confidence": <0-100>}
${step.secondary_field ? ', "secondaryValue": <unit_value>' : ''}

If the input is completely unrelated or you cannot extract a value, reply: {"value": null, "confidence": 0}`;

        const response = await this.llm.generateResponse(
            'You are a structured data extraction assistant. Reply ONLY in valid JSON.',
            prompt,
        );

        try {
            // Extract JSON from response (may be wrapped in markdown code blocks)
            const jsonMatch = response.match(/\{[\s\S]*?\}/);
            if (!jsonMatch) return null;

            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.value === null || parsed.confidence < 30) return null;

            // For dropdown/radio, validate that the parsed value matches an option
            if ((step.input_type === 'dropdown' || step.input_type === 'radio') && options.length > 0) {
                const matched = options.find(o => o.value === parsed.value || o.label === parsed.value);
                if (matched) return { value: matched.value };
                // Try fuzzy match on the LLM output
                const fuzzy = options.find(o =>
                    o.value.toLowerCase() === String(parsed.value).toLowerCase() ||
                    o.label.toLowerCase() === String(parsed.value).toLowerCase(),
                );
                if (fuzzy) return { value: fuzzy.value };
                return null;
            }

            return {
                value: parsed.value,
                secondaryValue: parsed.secondaryValue,
            };
        } catch {
            logger.warn(`[NLUParser] Failed to parse LLM response: ${response.substring(0, 200)}`);
            return null;
        }
    }

    /**
     * Parse a free-text address into structured address_block using Gemini.
     * Expected output: { locality, district, state, pincode, lat?, lng?, flat_no?, floor_number?, apartment_name?, plot_no? }
     */
    private async llmParseAddress(
        text: string,
        addressContext?: { floor_required: boolean; plot_area_required: boolean; bhk_required: boolean },
    ): Promise<ParsedInput | null> {
        // Build context-aware required fields info
        let requiredInfo = '';
        if (addressContext?.floor_required) {
            requiredInfo = `\nIMPORTANT: This is an apartment/flat/building property. The following fields are REQUIRED:
- flat_no (flat number, unit number, office number, shop number)
- floor_number (floor number — if not mentioned, try to infer from flat number like A-101 = 1st floor, or estimate)
- apartment_name (society name, building name, tower name, complex name — REQUIRED, DO NOT omit)`;
        } else if (addressContext?.plot_area_required) {
            requiredInfo = `\nIMPORTANT: This is a land/plot property. plot_no (plot number) is REQUIRED. Do NOT include flat_no or floor_number.`;
        } else if (addressContext?.bhk_required) {
            requiredInfo = `\nIMPORTANT: This is an independent house/villa. plot_no is optional. apartment_name (colony/society) is optional. Do NOT include flat_no or floor_number.`;
        }

        const prompt = `You are an Indian address parser for a Real Estate property listing system.

Parse the following address text into structured components.

User typed: "${text}"
${requiredInfo}

Extract the following fields:
- locality: The area/sector/colony/society name (e.g., "Sector 14, Vaishali" or "DLF Phase 2")
- district: The city/district name (e.g., "Ghaziabad", "Noida", "Gurugram")
- state: The Indian state name (e.g., "Uttar Pradesh", "Haryana", "Delhi")
- pincode: 6-digit Indian pincode (guess the most likely if not provided)
- apartment_name: Society/building/tower name if mentioned
- flat_no: Flat/unit number if mentioned
- floor_number: Floor number if mentioned (try to infer from flat number if possible, e.g., 608 in a building likely means 6th floor)
- plot_no: Plot number if mentioned
- lat: Latitude if you can estimate (optional)
- lng: Longitude if you can estimate (optional)

Reply ONLY in JSON (no markdown, no explanation):
{"locality": "...", "district": "...", "state": "...", "pincode": "...", "apartment_name": "...", "flat_no": "", "floor_number": "", "plot_no": "", "confidence": 0-100}

Omit empty fields. If you cannot parse a valid Indian address, reply: {"confidence": 0}`;

        try {
            const response = await this.llm.generateResponse(
                'You are an Indian address parser. Reply ONLY in valid JSON.',
                prompt,
            );

            const jsonMatch = response.match(/\{[\s\S]*?\}/);
            if (!jsonMatch) return null;

            const parsed = JSON.parse(jsonMatch[0]);
            if (!parsed.locality || !parsed.state || parsed.confidence < 30) return null;

            // Build the structured address object
            const address: Record<string, string> = {};
            if (parsed.locality) address.locality = parsed.locality;
            if (parsed.district) address.district = parsed.district;
            if (parsed.city) address.city = parsed.city;
            if (parsed.state) address.state = parsed.state;
            if (parsed.pincode) address.pincode = String(parsed.pincode);
            if (parsed.apartment_name) address.apartment_name = parsed.apartment_name;
            if (parsed.flat_no) address.flat_no = parsed.flat_no;
            if (parsed.floor_number) address.floor_number = String(parsed.floor_number);
            if (parsed.plot_no) address.plot_no = parsed.plot_no;
            if (parsed.lat) address.lat = String(parsed.lat);
            if (parsed.lng) address.lng = String(parsed.lng);

            return { value: address };
        } catch (err) {
            logger.warn('[NLUParser] Address LLM parse failed, trying regex fallback:', err);
            // Last resort: regex fallback when Gemini circuit breaker is open
            const regexFallback = regexParseAddress(text);
            if (regexFallback) {
                logger.info(`[NLUParser] Regex address fallback succeeded: ${JSON.stringify(regexFallback)}`);
                return { value: regexFallback };
            }
            return null;
        }
    }
}
