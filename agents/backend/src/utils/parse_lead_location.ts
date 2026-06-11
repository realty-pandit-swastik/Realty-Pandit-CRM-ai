/**
 * Extract the granular location from a MagicBricks lead `msg`.
 *
 * MagicBricks puts the customer's real area only in the free-text message, in a fixed shape:
 *   "This user is looking for 2 BHK Builder Floor Apartment for Sale in Sector 6 Vaishali, Ghaziabad
 *    and has viewed your contact details."
 * The structured `City` field is just the city ("Ghaziabad"), so storing that loses the sector/locality.
 *
 * Returns the trimmed "<LOCATION>" between "for <sale|rent|lease> in" and " and has viewed" (or the end /
 * a sentence break), or null if the phrase isn't present (caller falls back to the city).
 */
export function extractLocationFromMsg(msg?: string | null): string | null {
    if (!msg) return null;
    const m = String(msg).match(/for\s+(?:sale|rent|lease)\s+in\s+(.+?)(?:\s+and\s+has\s+viewed|[.\n]|$)/i);
    const loc = m?.[1]?.replace(/\s{2,}/g, ' ').trim();
    return loc || null;
}
