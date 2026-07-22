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
    budget?: number;
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

    // Location: known area/city (longest first). Capture a trailing "sector N" so
    // "noida sector 62" is kept (not collapsed to "noida"); else a bare "sector N".
    for (const a of AREAS) {
        if (msg.includes(a)) {
            out.location = a;
            const after = msg.slice(msg.indexOf(a) + a.length);
            const sec = after.match(/\s*(?:sector|sec)\s*(\d+)/i);
            if (sec) out.location = `${a} sector ${sec[1]}`;
            break;
        }
    }
    if (!out.location) {
        const sec = msg.match(/sector\s*\d+/i);
        if (sec) out.location = sec[0];
    }

    // Budget — sale (lakh/cr) or monthly rent (Nk, or a 4-7 digit figure guarded by a budget
    // CUE so a sector/pincode number isn't mistaken for a budget). Previously absent here, so the
    // active-deal path (webhook 3b.3) silently dropped a client's stated budget. (2026-06-21)
    const sale = msg.match(/(\d+\.?\d*)\s*(lakh|lac|crore|cr)\b/i);
    if (sale) {
        const v = parseFloat(sale[1]);
        out.budget = Math.round(sale[2].toLowerCase().startsWith('cr') ? v * 1e7 : v * 1e5);
    } else {
        const k = msg.match(/(\d+\.?\d*)\s*k\b/i);
        if (k) {
            const v = Math.round(parseFloat(k[1]) * 1000);
            if (v >= 5000 && v <= 500000) out.budget = v;
        } else {
            const cue = /(?:below|under|upto|up\s*to|max|maximum|tak|budget|rent|month|₹|rs\.?)\s*₹?\s*([\d,]{4,7})/i.exec(msg);
            if (cue) {
                const v = parseInt(cue[1].replace(/,/g, ''), 10);
                if (v >= 5000 && v <= 500000) out.budget = v;
            }
        }
    }

    return out;
}
