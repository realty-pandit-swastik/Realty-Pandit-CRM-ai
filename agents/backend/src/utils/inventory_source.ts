/**
 * Inventory source kind for tiles (2026-10-09) — who the listing's source contact IS.
 *
 * The tile must never show a dealer as "Owner". `ownership_type` alone cannot decide that:
 * it is NULL on most rows (only ever set explicitly), so dealer listings uploaded through a
 * partner read as OWNER. A listing attributed to a registered partner (`referral_partner_id`)
 * came through a dealer and displays as one.
 *
 * Precedence is deliberate: an explicit classification wins; the partner link is the fallback;
 * a direct-owner listing is the default, never a guess in the other direction.
 */

export type InventorySourceKind = 'DEALER' | 'AGENT_OWNER' | 'OWNER';

export interface InventorySourceRow {
    ownership_type?: string | null;
    referral_partner_id?: string | null;
    referral_partner?: { phone_number?: string | null; name?: string | null } | null;
}

export function inventorySourceKind(row: InventorySourceRow | null | undefined): InventorySourceKind {
    const ownership = String(row?.ownership_type || '').trim().toUpperCase();
    if (ownership === 'EXTERNAL_AGENT') return 'DEALER';
    if (ownership === 'AGENT_OWNER') return 'AGENT_OWNER';
    // Explicit OWNER (or nothing set) + a partner attribution → the listing came via a dealer.
    const partnerId = String((row as any)?.referral_partner_id || '').trim();
    const partnerPhone = String((row as any)?.referral_partner?.phone_number || '').trim();
    if (partnerId || partnerPhone) return 'DEALER';
    return 'OWNER';
}
