/**
 * Frustration / hand-off detector — Fix C (2026-06-12).
 *
 * The audit found buyers explicitly asking to be called ("call karo", "you keep
 * talking but never call") and venting ("useless", "bakwaas") while the bot kept
 * replying as if nothing happened — no human ever picked it up. This pure helper
 * flags those messages so webhook_processor can escalate to the assigned agent
 * (createLeadActionTask) and send a reassuring holding line instead of letting an
 * agent fumble the turn.
 *
 * Conservative by design: better to miss a borderline case than to escalate every
 * "no"/"cancel". Pure + dependency-free → unit-tested directly.
 */

export type FrustrationKind = 'call_request' | 'human_request' | 'anger';

export interface FrustrationResult {
    escalate: boolean;
    kind?: FrustrationKind;
}

export function detectFrustration(message: string): FrustrationResult {
    const m = (message || '').toLowerCase().trim();
    if (!m) return { escalate: false };

    // "you keep talking but never call" / "call nahi aaya"
    if (/(bolte rehte|baat karte ho|message karte).*(call|phone)/.test(m)
        || /(call|phone)\s*(nahi|nhi)\s*(karte|kiya|aaya|aayi|aata)/.test(m)) {
        return { escalate: true, kind: 'call_request' };
    }

    // explicit request to be called
    if (/\b(call me|please call|ring me|give me a call|call back)\b/.test(m)
        || /\b(call|phone|ring)\b[^.!?]{0,15}\b(karo|kardo|kar do|kijiye|karna|karein|chahiye|me|mujhe|abhi|now)\b/.test(m)
        || /\b(mujhe|please)\b[^.!?]{0,15}\b(call|phone)\b/.test(m)) {
        return { escalate: true, kind: 'call_request' };
    }

    // ask to reach a human
    const wantsContact = /\b(talk to|speak to|connect me|connect with|baat kar|baat karni|baat karwa|baat karao)\b/.test(m);
    const aHuman = /\b(human|person|someone|agent|team|representative|manager|executive|insaan|aadmi|koi|staff)\b/.test(m);
    if ((wantsContact && aHuman) || /\b(real person|human agent|customer care|customer support|live agent)\b/.test(m)) {
        return { escalate: true, kind: 'human_request' };
    }

    // anger / complaint
    if (/\b(useless|bekaar|bekar|ghatiya|faltu|fizool|bakwaas|bakwas|worst|pathetic|nonsense|rubbish|fraud|scam|cheat|cheater|dhoka|dhokha|complaint|stupid|idiot|terrible|horrible|disgusting|waste of time|time waste)\b/.test(m)) {
        return { escalate: true, kind: 'anger' };
    }

    return { escalate: false };
}
