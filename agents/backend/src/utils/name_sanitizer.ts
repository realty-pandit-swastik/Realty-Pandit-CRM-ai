/**
 * Name sanitizer — strips placeholder/junk names that lead aggregators (99acres,
 * MagicBricks, Housing) emit instead of real customer names.
 *
 * Returns null when the input is missing OR matches a known placeholder pattern.
 * Otherwise returns the trimmed value. Use everywhere a contact name is read from
 * an external source before persisting.
 */

const PLACEHOLDER_PATTERN = /^(user|name|temp|test|n\/a|na|null|none|customer|guest|lead|buyer|seller|tenant|landlord|owner|caller|prospect|enquiry|client|unknown)$/i;

export function sanitizeName(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const trimmed = String(raw).trim();
    if (trimmed.length <= 1) return null;            // empty, ".", single char
    if (PLACEHOLDER_PATTERN.test(trimmed)) return null;
    if (/^[^a-zA-Z]+$/.test(trimmed)) return null;   // numbers/symbols only
    return trimmed;
}
