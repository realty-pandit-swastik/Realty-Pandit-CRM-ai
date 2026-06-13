export interface DemandFromInventory {
    intent: 'buy' | 'rent';
    property_type: string | null;
    category_id: string | null;
    sub_category_id: string | null;
    type_id: string | null;
    demand_taxonomy_node_id: string | null;
    demand_bhk: string | null;
    preferred_location: string | null;
    preferred_lat: number | null;
    preferred_lng: number | null;
    budget_min: number | null;
    budget_max: number | null;
}

/**
 * Map a listing the team is sharing → the buyer demand to seed a new lead
 * ("looking for something like THIS"). Inventory intent is sell/rent; lead intent
 * is buy/rent (sell→buy). Budget is a ±15% band around the listing price so the
 * matching engine has a range, not an exact point. Mirrors the demand keys the
 * lead-page handler (routes/leads.ts) accepts on the Contact.
 */
export function buildDemandFromInventory(inv: any): DemandFromInventory {
    const s = (inv.specs || {}) as Record<string, any>;
    const room = s.bhk ?? s.rooms ?? s.bedrooms ?? s.bhk_count;
    const price = Number(inv.display_price ?? inv.customer_price ?? inv.price ?? 0) || null;
    const loc = [inv.locality, inv.city].filter(Boolean).join(', ') || inv.location || null;
    return {
        intent: inv.intent === 'rent' || inv.intent === 'rent_lease' || inv.intent === 'lease' ? 'rent' : 'buy',
        property_type: inv.type ?? null,
        category_id: inv.category_id ?? null,
        sub_category_id: inv.sub_category_id ?? null,
        type_id: inv.type_id ?? null,
        demand_taxonomy_node_id: inv.taxonomy_node_id ?? inv.demand_taxonomy_node_id ?? null,
        demand_bhk: room != null ? String(room) : null,
        preferred_location: loc,
        preferred_lat: inv.preferred_lat ?? inv.lat ?? null,
        preferred_lng: inv.preferred_lng ?? inv.lng ?? null,
        budget_min: price ? Math.round(price * 0.85) : null,
        budget_max: price ? Math.round(price * 1.15) : null,
    };
}
