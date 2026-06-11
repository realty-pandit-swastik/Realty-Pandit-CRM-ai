/**
 * Pure requirement-slot extractor — message-only (no contact/DB).
 *
 * P1 (2026-06-11): used by webhook_processor (step 3b.3) to decide whether a
 * SHORT message on an active deal carries a NEW requirement ("1 bhk", "rent",
 * "Vaishali") — which must be captured + re-matched — versus pure chit-chat
 * ("hi", "ok", "yes") which keeps the auto-share-next-card behaviour. Also
 * used by sales_agent to capture intent. Returns ONLY the slots actually
 * stated; `{}` for chit-chat (so the generic path still fires).
 *
 * Deliberately conservative: word-boundaried so it never fires on substrings
 * ("current"/"parent" do NOT match \brent\b), and BHK requires the bhk/bedroom
 * suffix so a bare "2" (handled as property selection) is not a requirement.
 */
export interface ReqSlots {
    intent?: 'rent' | 'buy';
    bhk?: number;
    type?: string;
    location?: string;
}

// Multi-word / longer entries first so the longest match wins.
const TYPES = [
    'builder floor', 'independent floor', 'builder flat', 'independent house',
    'farm house', 'farmhouse', 'apartment', 'penthouse', 'duplex', 'studio',
    'bungalow', 'showroom', 'warehouse', 'godown', 'kothi', 'villa', 'office',
    'shop', 'plot', 'land', 'zameen', 'flat', 'falt',
];

const AREAS = [
    'greater noida', 'crossing republik', 'gaur city', 'raj nagar', 'nehru place',
    'laxmi nagar', 'indirapuram', 'vasundhara', 'kaushambi', 'panchsheel',
    'gurugram', 'gurgaon', 'faridabad', 'ghaziabad', 'vaishali', 'bangalore',
    'hyderabad', 'chennai', 'mumbai', 'dwarka', 'rohini', 'saket', 'noida',
    'delhi', 'pune',
];

export function extractReqSlots(rawMsg: string): ReqSlots {
    const msg = (rawMsg || '').toLowerCase();
    const out: ReqSlots = {};

    // Intent (rent vs buy) — rent checked first ("on rent"/"for rent" subsume "rent").
    if (/\b(rent|kiray|kiraya|on rent|for rent)\b/.test(msg)) out.intent = 'rent';
    else if (/\b(buy|purchase|kharid|kharidna|sale|sell|resale)\b/.test(msg)) out.intent = 'buy';

    // BHK count: "1 bhk", "2bhk", "2/3 bhk" (take the lower), "2 bedroom", "rk".
    const bhk = msg.match(/(\d)\s*\/?\s*\d?\s*(?:bhk|bkh|bk|bedroom|bed|rk)\b/);
    if (bhk) {
        const n = parseInt(bhk[1], 10);
        if (n >= 1 && n <= 6) out.bhk = n;
    }

    // Property type (longest keyword wins).
    for (const t of TYPES) {
        if (msg.includes(t)) { out.type = t; break; }
    }

    // Location: known area/city (longest first), else a bare "sector N".
    for (const a of AREAS) {
        if (msg.includes(a)) { out.location = a; break; }
    }
    if (!out.location) {
        const sec = msg.match(/sector\s*\d+/);
        if (sec) out.location = sec[0];
    }

    return out;
}
