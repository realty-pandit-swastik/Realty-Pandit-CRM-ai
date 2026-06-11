/**
 * Parse a WhatsApp numbered-menu reply into its choice number.
 *
 * Menus like "1. Confirm  2. Reschedule  3. Cancel" tell users to "reply
 * with the number". Without this, handlers that only matched word keywords
 * ignored "1"/"2"/"3" and re-sent the same menu forever (2026-05-19 prod
 * loop on contact +917986024171). Use this everywhere a numbered menu is
 * offered. See docs/plans/2026-05-19-menu-loop-shared-parser.md
 *
 * Accepts: "3", " 3 ", "3.", "3)", "3-", "*3*", "option 3", "no. 3",
 *          "3 - cancel", "👉 3". Range 1..9 only. Anything else → null.
 * Deliberately strict: must be a LEADING standalone choice token, so a
 * sentence like "I want 2 bhk" does NOT parse as choice 2.
 */
export function parseMenuChoice(text: string | null | undefined): number | null {
    if (!text) return null;
    const t = String(text).trim().toLowerCase();
    const m = t.match(/^(?:\*+|👉|➡️|option|opt|number|no\.?|choice)?\s*\*?\s*([1-9])\s*\*?(?:[.)\-:\s]|$)/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n >= 1 && n <= 9 ? n : null;
}
