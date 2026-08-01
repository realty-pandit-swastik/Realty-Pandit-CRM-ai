/**
 * Compose an inventory's display address from the STRUCTURED fields (the source of truth):
 * building/apartment -> sub-locality -> locality -> city -> state -> pincode.
 *
 * Fixes tiles showing a stale `full_address` — that field is a one-time Google-autocomplete
 * snapshot that is NOT recomposed when the address is edited, so a card kept showing the old
 * "Shakti Khand" address after the building was changed to "Mks La Royale". We compose from the
 * structured fields (which the edit form writes) and fall back to full_address / location only
 * when there are no structured parts at all. (2026-08-01)
 */
export interface InventoryAddressParts {
    apartment_name?: string | null;
    sub_locality?: string | null;
    locality?: string | null;
    district?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
    full_address?: string | null;
    location?: string | null;
}

export function formatInventoryAddress(inv?: InventoryAddressParts | null): string {
    if (!inv) return 'Location N/A';
    const parts = [
        inv.apartment_name,
        inv.sub_locality,
        inv.locality,
        inv.district || inv.city,
        inv.state,
        inv.pincode,
    ].map(x => (x == null ? '' : String(x).trim())).filter(Boolean);
    const composed = parts.join(', ');
    return composed || (inv.full_address || '').trim() || (inv.location || '').trim() || 'Location N/A';
}
