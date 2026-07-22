/**
 * Single source of truth for customer-facing property price strings. INTENT-AWARE so a rent
 * listing never renders as "₹0.0 Lakh" / "0.2 Lakh" (real bug, 16% of card replies — see
 * docs/pipeline-analysis/real-chat-findings.md F5):
 *   - rent  → "₹25,000/month"
 *   - sale  → "₹1.5 Cr" / "₹50 Lakh" (with a ≥1e5 floor; never "0.0 Lakh")
 *   - missing / zero / non-positive → "Price on request" (guards on a NUMERIC <= 0, because a
 *     Prisma.Decimal(0) is a truthy object and was slipping past `price ? …` guards)
 *
 * `unit` ('Lakh'|'Crore'|'thousand') is honoured when the figure is stored in those units
 * (sale listings); rent figures are raw monthly rupees with no unit.
 */
export function formatPropertyPrice(
    price: unknown,
    opts?: { intent?: string | null; unit?: string | null },
): string {
    const n = Number(price);
    if (!Number.isFinite(n) || n <= 0) return 'Price on request';

    const intent = String(opts?.intent || '').toLowerCase();
    const isRent = intent === 'rent' || intent === 'rent_lease' || intent === 'lease';
    const u = String(opts?.unit || '').toLowerCase();

    // Rent: always a monthly figure in raw rupees.
    if (isRent) return `₹${n.toLocaleString('en-IN')}/month`;

    // Sale stored in explicit units.
    if (u === 'crore' || u === 'cr') return `₹${trim(n)} Cr`;
    if (u === 'lakh') return `₹${trim(n)} Lakh`;
    if (u === 'thousand') return `₹${(n * 1000).toLocaleString('en-IN')}`;

    // Sale in raw rupees — derive the unit from magnitude (≥1e5 floor → never "0.0 Lakh").
    if (n >= 1e7) return `₹${trim(n / 1e7)} Cr`;
    if (n >= 1e5) return `₹${trim(n / 1e5)} Lakh`;

    // Sub-lakh with no unit + unknown intent → almost always a monthly rent figure.
    if (!intent) return `₹${n.toLocaleString('en-IN')}/month`;
    return `₹${n.toLocaleString('en-IN')}`;
}

/** Trim trailing zeros: 1.50→"1.5", 50.0→"50", 1.25→"1.25". */
function trim(n: number): string {
    return Number(n.toFixed(2)).toString();
}
