// Guard against fat-fingered / garbage demand prices (e.g. ₹782 Cr on a flat).
// A single unit shouldn't exceed ₹100 Cr; land/plots are exempt (genuinely high value).
const ABS_CEIL = 1_000_000_000; // ₹100 Cr
const isPlot = (t?: string | null) => /plot|land/i.test(String(t || ''));

/** Returns a human error string if the price is absurd for the property type, else null. */
export function absurdPriceError(price: number | null | undefined, type?: string | null): string | null {
    if (price == null || Number.isNaN(Number(price))) return null;
    if (Number(price) > ABS_CEIL && !isPlot(type)) {
        return `Price ₹${(Number(price) / 1e7).toFixed(1)} Cr looks incorrect for this property — a single unit should be under ₹100 Cr. Please re-check the amount.`;
    }
    return null;
}
