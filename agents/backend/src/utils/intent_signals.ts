/**
 * Shared deterministic text-signal detectors used by inbound routing + safe sending.
 */

// SUPPLY intent — the sender is OFFERING a property (seller / landlord / agent listing inventory),
// NOT seeking one. Conservative/high-precision so a buyer ("looking for a flat for sale") isn't
// misread (note: "for sale"/"on sale" are seller phrasings buyers rarely type about their own ask).
// Fixes the seller-treated-as-buyer card-spam (real-chat-findings.md F6).
export const SUPPLY_INTENT_RE = /\b(for sale|on sale|sell my|selling my|sale property|property for sale|i have a (?:flat|plot|property|shop|house|villa|office|land|space)|i'?m offering|offering (?:a |my )?(?:flat|plot|property|shop|house|villa|office)|lease out|rent out|rent it out|list my|listing my|my property|resale|newly leased|pre-?leased|tenanted|available for (?:sale|lease)|put [a-z ]{0,25}on rent|give (?:it |this |my |the )?(?:on )?rent|want to (?:sell|rent out|lease out|list)|wanna (?:sell|rent out)|having (?:a |an )?(?:flat|plot|property|shop|house|villa|office|land|space)|rent pe (?:de|dena|dedo|du)|kiray[ae]? pe (?:de|dena|dedo)|bech(?:na|ni|do)|becna|sale karni|list kar(?:ni|na|do|wana))\b/i;

export function isSupplyIntent(text: string | null | undefined): boolean {
    return !!text && SUPPLY_INTENT_RE.test(text);
}

// LLM holding/fallback text that must NEVER be sent PROACTIVELY (followup nudges) to a client.
// The live inbound path already guards this (webhook_processor) + escalates; proactive senders
// (followup_scheduler, interaction_engine) did not, so "I am currently experiencing high traffic"
// leaked as a followup (real-chat-findings.md F7-A).
const LLM_FALLBACK_RE = /experiencing high traffic|try again in a moment|try again later|encountered a brief issue|temporarily unavailable|i'?m having trouble|please try again/i;

export function isLlmFallback(text: string | null | undefined): boolean {
    return !!text && LLM_FALLBACK_RE.test(text);
}
