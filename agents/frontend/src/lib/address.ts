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
    // Exact unit. Deliberately NOT part of formatInventoryAddress() — see formatUnitLabel below.
    flat_no?: string | null;
    plot_no?: string | null;
}

/**
 * The exact unit: "Flat 507" / "Plot 362" / "Flat S2 · Plot 362". Returns '' when neither is set.
 *
 * 2026-08-08: tiles never showed the unit — both card components render only
 * formatInventoryAddress(), which composes building→locality→city and has no unit. The data was
 * always there (453 of 847 listings carry a flat_no or plot_no) and the API returns it; the card
 * simply dropped it. Detail view had this logic inline; this is now the one definition.
 *
 * ⚠ NO permission check here, on purpose. The API DELETES flat_no/plot_no for viewers who may not
 * see them (STAFF_HIDDEN_INVENTORY_FIELDS → redactInventoryForStaff), so an absent field yields ''
 * and nothing renders. Re-implementing the rule client-side would duplicate it and drift.
 *
 * ⚠ Trim and treat '' as absent — 508 rows carry an empty-string flat_no, which would otherwise
 * render as a bare "Flat".
 */
export function formatUnitLabel(inv?: { flat_no?: string | null; plot_no?: string | null } | null): string {
    const flat = (inv?.flat_no ?? '').trim();
    const plot = (inv?.plot_no ?? '').trim();
    return [flat && `Flat ${flat}`, plot && `Plot ${plot}`].filter(Boolean).join(' · ');
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
