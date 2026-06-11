// src/services/sanitization_service.ts
//
// Role-based sanitization of inventory + contact payloads for the middleman model.
// Strips owner/source fields from responses returned to viewers who don't own the asset.
//
// Rules (2026-04-17 — locked):
//   - owning_manager + super_boss  -> see everything
//   - foreign internal agent       -> see inventory details (for matching) but NO owner/source
//   - partner agent                -> see inventory details but NO owner/source + address masked
//
// This does NOT filter query results — it strips fields from already-fetched rows. Combine with
// existing query-level filters (contact_visibility.ts) for complete protection.

export type Viewer =
    | { role: 'agent'; agentId: string; isSuperBoss: boolean }
    | { role: 'partner'; partnerAgentId: string };

const OWNER_FIELDS = [
    // Contact shapes
    'owner',
    'owner_contact',
    'contact',
    'key_holder',
    'key_holder_contact',
    // Owner / key-holder PII
    'owner_phone',
    'owner_name',
    'owner_email',
    'owner_contact_id',
    'key_holder_name',
    'key_holder_phone',
    'key_holder_contact_id',
    // Uploader PII (may be the owner themselves)
    'uploader_phone',
    'uploader_name',
    'uploader_email',
    // Owner-linked IDs (resolving them would reveal the owner identity indirectly)
    'owner_id',
    // Internal confidential pricing — schema marks customer_price as "internal only,
    // never shown publicly"
    'customer_price',
];

const SOURCE_FIELDS = [
    'referral_partner_id',
    'referral_partner',
    'referral_partner_name',
    'referral_partner_phone',
    'owning_manager_id',
    'owning_manager',
    // Internal agent attribution — the middleman model routes all coordination through
    // the viewer's own manager, so the assigned/uploading/reference agents of OTHER
    // listings must not be exposed.
    'assigned_agent_id',
    'assigned_agent',
    'uploaded_by_agent_id',
    'uploaded_by_agent',
    'reference_agent_id',
    'reference_agent',
    'reference_agent_phone',
];

// Address fields hidden from partner viewers (exact address suppressed; locality/city retained
// so the partner can still understand geo-scope and schedule a visit via their manager).
const PARTNER_HIDDEN_ADDRESS_FIELDS = [
    'flat_no',
    'plot_no',
    'full_address',
    'apartment_name',
    'latitude',
    'longitude',
];

export class SanitizationService {
    /**
     * Strip owner/source fields from an inventory row based on the viewer.
     * Pass the row AFTER prisma include has hydrated relations.
     */
    sanitizeInventory<T extends Record<string, any>>(row: T, viewer: Viewer): T {
        if (!row) return row;
        if (this.canSeeOwner(row, viewer)) return row;

        const cleaned: Record<string, any> = { ...row };
        for (const f of OWNER_FIELDS) delete cleaned[f];
        for (const f of SOURCE_FIELDS) delete cleaned[f];

        if (viewer.role === 'partner') {
            for (const f of PARTNER_HIDDEN_ADDRESS_FIELDS) delete cleaned[f];
        }

        return cleaned as T;
    }

    sanitizeInventoryList<T extends Record<string, any>>(rows: T[], viewer: Viewer): T[] {
        if (!Array.isArray(rows)) return rows;
        return rows.map((r) => this.sanitizeInventory(r, viewer));
    }

    /**
     * Strip PII from a contact row based on the viewer. Returns the row with name/phone/email
     * removed when the viewer doesn't own it.
     */
    sanitizeContact<T extends Record<string, any>>(row: T, viewer: Viewer): T {
        if (!row) return row;
        if (this.canSeeContact(row, viewer)) return row;

        const cleaned: Record<string, any> = { ...row };
        delete cleaned.phone_number;
        delete cleaned.email;
        delete cleaned.name;
        return cleaned as T;
    }

    private canSeeOwner(row: { owning_manager_id?: string | null }, v: Viewer): boolean {
        if (v.role === 'partner') return false; // partners never see owner info
        if (v.isSuperBoss) return true;
        if (!row.owning_manager_id) return false;
        return row.owning_manager_id === v.agentId;
    }

    private canSeeContact(row: { owning_manager_id?: string | null }, v: Viewer): boolean {
        return this.canSeeOwner(row, v);
    }
}

export const sanitizationService = new SanitizationService();
