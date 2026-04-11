/**
 * Deal Visibility Engine (Phase 7 - Phase 3)
 *
 * Controls what each party sees in a deal based on their role:
 *
 * | Data                    | Internal Team | Demand Partner | Supply Partner |
 * |-------------------------|---------------|----------------|----------------|
 * | Property images + basics| Full          | Full           | Full           |
 * | Property exact address  | Full          | Area only      | Full (theirs)  |
 * | Customer name           | Full          | Full (theirs)  | First name     |
 * | Customer phone          | Full          | Full (theirs)  | NEVER          |
 * | Other partner details   | Full          | NEVER          | NEVER          |
 * | Coordinator name+phone  | Full          | Full           | Full           |
 * | Commission              | Full          | Their share    | Their share    |
 */

import { maskPhone, maskName } from './permission_engine';

export type ViewerRole = 'internal' | 'demand_partner' | 'supply_partner';

export interface DealPartyView {
    // Customer (demand side)
    customer_name: string | null;
    customer_phone: string | null;
    customer_email: string | null;

    // Property (supply side)
    property_id: string | null;
    property_type: string | null;
    property_location: string | null;
    property_full_address: string | null;
    property_price: number | null;
    property_images: string[];

    // Coordinator (always visible)
    coordinator_name: string | null;
    coordinator_phone: string | null;
    coordinator_email: string | null;

    // Demand handler
    demand_handler_name: string | null;
    demand_handler_phone: string | null;

    // Supply handler
    supply_handler_name: string | null;
    supply_handler_phone: string | null;

    // Deal metadata (always visible)
    deal_id: string;
    deal_status: string;
    deal_scenario: string | null;
    deal_type: string;
    demand_location: string | null;
    demand_budget_min: number | null;
    demand_budget_max: number | null;
    demand_property_type: string | null;
    created_at: Date;
    updated_at: Date;
}

interface RawDealData {
    id: string;
    status: string;
    type: string;
    deal_scenario: string | null;
    demand_location: string | null;
    demand_budget_min: number | null;
    demand_budget_max: number | null;
    demand_property_type: string | null;
    created_at: Date;
    updated_at: Date;

    // Demand side
    demand_contact?: {
        name: string | null;
        phone_number: string;
        email: string | null;
    } | null;
    demand_handler_type: string | null;
    demand_handler_id: string | null;

    // Supply side
    supply_contact?: {
        name: string | null;
        phone_number: string;
        email: string | null;
    } | null;
    supply_handler_type: string | null;
    supply_handler_id: string | null;

    // Coordinator
    coordinator?: {
        name: string | null;
        phone: string | null;
        email: string | null;
    } | null;

    // Property
    inventory?: {
        id: string;
        type: string | null;
        location: string | null;
        full_address?: string | null;
        price: number | null;
        media_urls: string[];
    } | null;

    // Partner names (from joined data)
    demand_partner_name?: string | null;
    demand_partner_phone?: string | null;
    supply_partner_name?: string | null;
    supply_partner_phone?: string | null;
}

/**
 * Determine the viewer's role in a deal
 */
export function determineViewerRole(
    deal: { demand_handler_id: string | null; supply_handler_id: string | null; coordinator_agent_id: string | null; executive_agent_id: string | null },
    viewerId: string,
    viewerType: 'agent' | 'partner'
): ViewerRole {
    if (viewerType === 'agent') return 'internal';
    if (deal.demand_handler_id === viewerId) return 'demand_partner';
    if (deal.supply_handler_id === viewerId) return 'supply_partner';
    return 'internal'; // Fallback for unknown
}

/**
 * Apply visibility masking to a deal based on viewer role
 */
export function maskDealForViewer(deal: RawDealData, role: ViewerRole): DealPartyView {
    const base: DealPartyView = {
        deal_id: deal.id,
        deal_status: deal.status,
        deal_scenario: deal.deal_scenario,
        deal_type: deal.type,
        demand_location: deal.demand_location,
        demand_budget_min: deal.demand_budget_min,
        demand_budget_max: deal.demand_budget_max,
        demand_property_type: deal.demand_property_type,
        created_at: deal.created_at,
        updated_at: deal.updated_at,

        // Coordinator always visible to everyone
        coordinator_name: deal.coordinator?.name || null,
        coordinator_phone: deal.coordinator?.phone || null,
        coordinator_email: deal.coordinator?.email || null,

        // Property basics always visible
        property_id: deal.inventory?.id || null,
        property_type: deal.inventory?.type || null,
        property_price: deal.inventory?.price || null,
        property_images: deal.inventory?.media_urls || [],

        // Defaults (will be overridden below)
        property_location: null,
        property_full_address: null,
        customer_name: null,
        customer_phone: null,
        customer_email: null,
        demand_handler_name: null,
        demand_handler_phone: null,
        supply_handler_name: null,
        supply_handler_phone: null,
    };

    switch (role) {
        case 'internal':
            // Internal team sees EVERYTHING
            base.customer_name = deal.demand_contact?.name || null;
            base.customer_phone = deal.demand_contact?.phone_number || null;
            base.customer_email = deal.demand_contact?.email || null;
            base.property_location = deal.inventory?.location || null;
            base.property_full_address = deal.inventory?.full_address || deal.inventory?.location || null;
            base.demand_handler_name = deal.demand_partner_name || null;
            base.demand_handler_phone = deal.demand_partner_phone || null;
            base.supply_handler_name = deal.supply_partner_name || null;
            base.supply_handler_phone = deal.supply_partner_phone || null;
            break;

        case 'demand_partner':
            // Demand partner: sees their own customer fully, property area only, never sees other partner
            base.customer_name = deal.demand_contact?.name || null;
            base.customer_phone = deal.demand_contact?.phone_number || null;
            base.customer_email = deal.demand_contact?.email || null;
            base.property_location = deal.inventory?.location || null; // Area only
            base.property_full_address = null; // No exact address
            base.demand_handler_name = null; // Own info - not needed
            base.demand_handler_phone = null;
            base.supply_handler_name = null; // NEVER see other partner
            base.supply_handler_phone = null;
            break;

        case 'supply_partner':
            // Supply partner: sees customer first name only, no phone, full property (theirs), never sees demand partner
            base.customer_name = deal.demand_contact?.name ? maskName(deal.demand_contact.name) : null;
            base.customer_phone = null; // NEVER
            base.customer_email = null; // NEVER
            base.property_location = deal.inventory?.location || null; // Full (their property)
            base.property_full_address = deal.inventory?.full_address || deal.inventory?.location || null;
            base.demand_handler_name = null; // NEVER see demand partner
            base.demand_handler_phone = null;
            base.supply_handler_name = null; // Own info - not needed
            base.supply_handler_phone = null;
            break;
    }

    return base;
}

/**
 * Mask a list of deals for a partner viewer
 */
export function maskDealsForPartner(
    deals: RawDealData[],
    partnerId: string
): DealPartyView[] {
    return deals.map(deal => {
        const role = deal.demand_handler_id === partnerId ? 'demand_partner' : 'supply_partner';
        return maskDealForViewer(deal, role);
    });
}
