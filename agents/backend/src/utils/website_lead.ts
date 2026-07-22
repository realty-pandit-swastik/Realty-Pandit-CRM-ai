// Shared helpers for website-originated leads (Schedule Visit + Contact Agent OTP reveal).
//
// Routing rule (Puneet, 2026-06-11):
//   - EXISTING customer  → keep their already-assigned agent (never reassign).
//   - NEW customer       → assign to the "inventory manager" = the team member the
//                          inventory is assigned to (assigned_agent_id), with a fallback
//                          chain, and OWN the contact so it's visible in the CRM/PWA.
//
// Requirement capture: a new (or requirement-less) lead inherits the demand profile of the
// inventory it was enquired on — the Contact demand model is literally a mirror of
// inventory.taxonomy_node_id + inventory.specs (schema.prisma), so this is a direct copy.

import prisma from '../db';
import { resolveStoredContactPhone } from './phone';
import type { AssignmentMethod } from '../services/assign_contact';

export interface InventoryForRouting {
    assigned_agent_id: string | null;
    owning_manager_id: string | null;
    uploaded_by_agent_id: string | null;
}

export interface ResolvedHandler {
    storedPhone: string;
    /** The existing contact (if any) — null means a brand-new lead. */
    existing: { phone_number: string; assigned_agent_id: string | null; owning_manager_id: string | null; demand_taxonomy_node_id: string | null } | null;
    isNew: boolean;
    /** The agent who should own + be notified for this lead. */
    handlerId: string | null;
    /** Phase 5C — how the handler was chosen for a NEW lead: 'uploader' (inventory manager) or
     * 'other' (super_boss fallback). null for existing leads (keep-same, no fresh write). */
    handlerMethod: AssignmentMethod | null;
}

/**
 * Resolve who a website lead should be routed to, and whether they're new.
 * EXISTING → their agent; NEW → the inventory manager (assigned → owning_manager →
 * uploader → super_boss). Never throws.
 */
export async function resolveWebsiteLeadHandler(phone: string, property: InventoryForRouting): Promise<ResolvedHandler> {
    const storedPhone = (await resolveStoredContactPhone(phone, prisma)) ?? phone;
    const existing = await prisma.contact.findUnique({
        where: { phone_number: storedPhone },
        select: { phone_number: true, assigned_agent_id: true, owning_manager_id: true, demand_taxonomy_node_id: true },
    });

    // Same precedence chain as before (first non-null wins) — behaviour unchanged; Phase 5C additionally
    // records HOW the handler was chosen. existing.* branches are keep-same (public.ts writes on CREATE
    // only), so they carry no fresh method; property.* → 'uploader'; super_boss fallback → 'other'.
    let handlerId: string | null = null;
    let handlerMethod: AssignmentMethod | null = null;
    if (existing?.assigned_agent_id) { handlerId = existing.assigned_agent_id; }
    else if (existing?.owning_manager_id) { handlerId = existing.owning_manager_id; }
    else if (property.assigned_agent_id) { handlerId = property.assigned_agent_id; handlerMethod = 'uploader'; }
    else if (property.owning_manager_id) { handlerId = property.owning_manager_id; handlerMethod = 'uploader'; }
    else if (property.uploaded_by_agent_id) { handlerId = property.uploaded_by_agent_id; handlerMethod = 'uploader'; }

    if (!handlerId) {
        const sb = await prisma.agent.findFirst({ where: { role: 'super_boss', status: 'active' }, select: { id: true } });
        handlerId = sb?.id ?? null;
        if (handlerId) handlerMethod = 'other';
    }

    return { storedPhone, existing, isNew: !existing, handlerId, handlerMethod };
}

function bhkFromSpecs(specs: any): string | undefined {
    if (!specs || typeof specs !== 'object') return undefined;
    const v = specs.bhk ?? specs.rooms ?? specs.bedrooms ?? specs.bhk_count;
    return v != null && v !== '' ? String(v) : undefined;
}

export interface InventoryForDemand {
    intent: string;
    taxonomy_node_id: string | null;
    specs: any;
    locality: string | null;
    city: string | null;
    district: string | null;
    location: string | null;
}

/**
 * Build the demand requirement for a lead from the inventory it was enquired on.
 * Copies the inventory's canonical attributes (intent, property-type taxonomy node, BHK,
 * location) onto the Contact's demand fields so the lead is instantly matchable.
 * Budget is intentionally left for the agent (price-scale ambiguity) — type/BHK/location
 * are the "basic things" the customer is signalling by being on this page.
 */
export function buildDemandFromInventory(inv: InventoryForDemand): Record<string, any> {
    const isRent = inv.intent === 'rent';
    const bhk = bhkFromSpecs(inv.specs);
    const loc = [inv.locality, inv.city || inv.district].filter(Boolean).join(', ') || inv.location || undefined;
    const areaRaw = inv.specs && typeof inv.specs === 'object' ? inv.specs.area : undefined;
    const area = areaRaw != null && areaRaw !== '' && !isNaN(Number(areaRaw)) ? Number(areaRaw) : undefined;

    const demand: Record<string, any> = {
        intent: isRent ? 'rent' : 'buy',
        contact_type: isRent ? 'TENANT' : 'BUYER',
        demand_budget_type: isRent ? 'per_month' : 'one_time',
    };
    if (inv.taxonomy_node_id) demand.demand_taxonomy_node_id = inv.taxonomy_node_id;
    if (bhk) demand.demand_schema_values = { bhk };
    if (loc) demand.preferred_location = loc;
    if (area) demand.area_min = area;
    return demand;
}
