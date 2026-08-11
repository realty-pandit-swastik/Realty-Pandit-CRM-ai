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

// "All inventory visible to all staff" model (2026-06-18): a foreign internal agent (anyone who
// is NOT the listing's assigned/uploading manager and NOT super_boss) sees the listing WITHOUT
// owner/key-holder contact or the exact unit (flat_no/plot_no). Pricing (incl. customer_price) and
// the manager's name+phone are deliberately KEPT so any agent can quote + coordinate the showing.
const STAFF_HIDDEN_INVENTORY_FIELDS = [
    // Owner / key-holder contact (relations + scalars)
    'owner', 'owner_contact', 'contact', 'key_holder', 'key_holder_contact',
    'owner_phone', 'owner_name', 'owner_email', 'owner_id', 'owner_contact_id',
    'key_holder_name', 'key_holder_phone', 'key_holder_contact_id',
    // Source PII — the uploader/dealer NUMBER stays gated to the handling manager + super_boss.
    // (The displayable owner/dealer NAME is surfaced separately via the computed `source` field,
    // which carries its own per-viewer phone gate — see the inventory list route.)
    'uploader_phone', 'uploader_email', 'referral_partner', 'referral_partner_phone',
    // First address line (exact unit) — locality/society/city/pincode stay visible
    'flat_no', 'plot_no',
    // Owner paperwork (2026-08-11). Documents are restricted to the listing's own agent +
    // super_boss, so any OTHER staff viewer gets the relation stripped here as well as at the
    // route. Defence in depth: a future route that includes { documents: true } and forgets to
    // gate it still cannot leak them.
    'documents',
];

export class SanitizationService {
    /**
     * Strip owner/source fields from an inventory row based on the viewer.
     * Pass the row AFTER prisma include has hydrated relations.
     */
    sanitizeInventory<T extends Record<string, any>>(row: T, viewer: Viewer): T {
        if (!row) return row;
        // Documents (2026-08-11): owner paperwork — never exposed to an external partner, not
        // even on their OWN listing. Stripped ahead of the canSeeOwner early-return, which would
        // otherwise hand the whole row back untouched.
        if (viewer.role === 'partner' && (row as any).documents !== undefined) {
            const noDocs: any = { ...row };
            delete noDocs.documents;
            row = noDocs as T;
        }
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
     * Inventory redaction for the staff-wide visibility model (2026-06-18). The listing's
     * assigned OR uploading manager, anyone the listing is SHARED with, and super_boss see
     * everything; every other internal agent gets the listing minus owner/key-holder contact and
     * flat_no/plot_no (pricing stays visible).
     * The assigned manager's name+phone (the `assigned_agent` relation) is intentionally kept.
     */
    redactInventoryForStaff<T extends Record<string, any>>(
        row: T,
        viewer: { agentId?: string | null; isSuperBoss: boolean; teamIds?: string[] },
    ): T {
        if (!row) return row;
        if (viewer.isSuperBoss) return row;
        // Full detail for the agent's OWN listings AND (for a manager) their TEAM's listings.
        // teamIds defaults to [agentId], so an employee's behaviour is unchanged.
        const teamIds = viewer.teamIds && viewer.teamIds.length ? viewer.teamIds : (viewer.agentId ? [viewer.agentId] : []);
        // shared_with_ids added 2026-08-08. The inventory list query already grants VISIBILITY via
        // `shared_with_ids: { hasSome: teamIds }` (routes/inventory.ts), but this redaction only
        // ever checked assigned/uploaded — so the teammate you deliberately shared a property with
        // received the row with flat_no/plot_no STRIPPED. Verified on prod: RP-GZB-RES-20519
        // (flat_no "3A-71") came back to its sharee with the field absent. That defeats the point
        // of sharing. Same class of bug as the lead-side one where the agent_id filter ignores
        // Contact.shared_with_ids.
        //
        // NOT included: reference_agent_id. The list query grants visibility to a referring agent
        // too, but the owner's stated rule is manager + shared-with + super_boss only, so a
        // referrer still gets the redacted view. Widen here if that changes.
        const sharedWith: string[] = Array.isArray(row.shared_with_ids) ? row.shared_with_ids : [];
        if (
            teamIds.includes(row.assigned_agent_id)
            || teamIds.includes(row.uploaded_by_agent_id)
            || sharedWith.some((id) => teamIds.includes(id))
        ) {
            return row;
        }
        const cleaned: Record<string, any> = { ...row };
        for (const f of STAFF_HIDDEN_INVENTORY_FIELDS) delete cleaned[f];
        return cleaned as T;
    }

    redactInventoryListForStaff<T extends Record<string, any>>(
        rows: T[],
        viewer: { agentId?: string | null; isSuperBoss: boolean; teamIds?: string[] },
    ): T[] {
        if (!Array.isArray(rows)) return rows;
        return rows.map((r) => this.redactInventoryForStaff(r, viewer));
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
