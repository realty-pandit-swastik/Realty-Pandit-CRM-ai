import prisma from '../db';
import { buildContactVisibilityFilter } from '../middleware/contact_visibility';
import { getTeamIds } from '../utils/team_scope';
import { isPlaceholderPhone, normalizePhone, resolveStoredContactPhone, phoneVariants } from '../utils/phone';
import { sanitizationService } from './sanitization_service';

export interface CrmViewer { id: string; tenant_id: string; role: string }
export class CrmError extends Error {
    constructor(public status: number, message: string) { super(message); }
}

export async function crmScope(viewer: CrmViewer) {
    if (!viewer || !['super_boss', 'manager', 'employee'].includes(viewer.role)) throw new CrmError(403, 'Internal staff access required');
    const teamIds = await getTeamIds(viewer);
    const deal = { tenant_id: viewer.tenant_id, ...(viewer.role === 'super_boss' ? {} : {
        OR: [{ coordinator_agent_id: { in: teamIds } }, { executive_agent_id: { in: teamIds } }],
    }) };
    const inventory = { tenant_id: viewer.tenant_id, ...(viewer.role === 'super_boss' ? {} : {
        OR: [{ uploaded_by_agent_id: { in: teamIds } }, { assigned_agent_id: { in: teamIds } }, { shared_with_ids: { hasSome: teamIds } }],
    }) };
    const contact = { tenant_id: viewer.tenant_id, ...(viewer.role === 'super_boss' ? {} : { OR: [
        buildContactVisibilityFilter(viewer.id, viewer.role),
        { inventory: { some: inventory } }, { owned_properties: { some: inventory } },
        { key_holder_properties: { some: inventory } },
        { work_tasks: { some: { assigned_to: { in: teamIds } } } },
        { appointments: { some: { tenant_id: viewer.tenant_id, assigned_to_agent_id: { in: teamIds } } } },
    ] }) };
    return { contact, deal, inventory, teamIds };
}

export async function visibleContact(raw: string, viewer: CrmViewer) {
    if (!raw || raw.length > 150) throw new CrmError(400, 'Invalid contact');
    const scope = await crmScope(viewer);
    const phone = isPlaceholderPhone(raw) ? raw : (await resolveStoredContactPhone(raw, prisma)) || normalizePhone(raw);
    if (!phone) throw new CrmError(400, 'Invalid contact phone');
    // Inventory owners may legitimately have no demand enquiry/assigned Contact handler.
    const contact = await prisma.contact.findFirst({
        where: { AND: [scope.contact, { phone_number: phone }] },
        select: { phone_number: true, name: true, email: true, contact_type: true, client_role: true, client_role_label: true, created_at: true,
            assigned_agent: { select: { id: true, name: true, tenant_id: true } } },
    });
    if (!contact) throw new CrmError(404, 'Contact not found or not accessible');
    return { contact, scope };
}

export async function contactRelationship(raw: string, viewer: CrmViewer, page: number) {
    const { contact, scope } = await visibleContact(raw, viewer);
    const phone = contact.phone_number;
    const leads = await prisma.transaction.findMany({
        where: { ...scope.deal, demand_contact_id: phone }, orderBy: { created_at: 'desc' },
        select: { id: true, source: true, source_label: true, source_ref: true, status: true, created_at: true, inventory_id: true,
            demand_budget_min: true, demand_budget_max: true, demand_location: true, demand_intent: true },
    });
    const inventoryIds = leads.map(l => l.inventory_id).filter((id): id is string => !!id);
    const refs = leads.map(l => l.source_ref).filter((id): id is string => !!id);
    const inventory = await prisma.inventory.findMany({
        where: { AND: [scope.inventory, { OR: [
            { owner_phone: phone }, { owner_contact_id: phone }, { owner: { contact_phone: phone } },
            { key_holder_contact_id: phone }, { key_holder_phone: { in: phoneVariants(phone) } },
            { referral_partner: { phone_number: { in: phoneVariants(phone) } } },
            { id: { in: [...inventoryIds, ...refs] } }, { display_id: { in: refs } },
        ] }] },
        orderBy: { created_at: 'desc' },
        select: { id: true, display_id: true, type: true, location: true, city: true, status: true, price: true,
            owner_phone: true, owner_contact_id: true, owner: { select: { contact_phone: true } }, key_holder_contact_id: true, key_holder_phone: true,
            referral_partner: { select: { phone_number: true } },
            assigned_agent_id: true, uploaded_by_agent_id: true, shared_with_ids: true },
    });
    const visibleDealIds = new Set(leads.map(l => l.id));
    const size = 50;
    // Filter enquiry-linked entries before merging/pagination. A shared Contact is not
    // permission to read another handler's enquiry payloads.
    const [allEvents, appointments, calls, messages, logs, legacyVisits] = await Promise.all([
        prisma.interaction.findMany({ where: { tenant_id: viewer.tenant_id, phone_number: phone }, orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
            select: { id: true, event_type: true, content: true, created_at: true, metadata: true, channel: true, direction: true } }),
        prisma.appointment.findMany({ where: { tenant_id: viewer.tenant_id, contact_id: phone,
            ...(viewer.role === 'super_boss' ? {} : { assigned_to_agent_id: { in: scope.teamIds } }) },
            select: { id: true, title: true, status: true, created_at: true, updated_at: true, scheduled_at: true, transaction_id: true } }),
        prisma.staffCall.findMany({ where: { tenant_id: viewer.tenant_id, phone_number: phone,
            ...(viewer.role === 'super_boss' ? {} : { staff_agent_id: { in: scope.teamIds } }) },
            select: { id: true, created_at: true, duration: true, status: true } }),
        prisma.whatsAppMessage.findMany({ where: { tenant_id: viewer.tenant_id, phone_number: phone },
            select: { id: true, wa_message_id: true, body: true, message_type: true, direction: true, status: true, created_at: true } }),
        prisma.transactionLog.findMany({ where: { transaction_id: { in: leads.map(l => l.id) }, transaction: { tenant_id: viewer.tenant_id } },
            select: { id: true, transaction_id: true, action: true, old_status: true, new_status: true, details: true, created_at: true } }),
        prisma.scheduledVisit.findMany({ where: { contact_id: phone, contact: { tenant_id: viewer.tenant_id },
            ...(viewer.role === 'super_boss' ? {} : { OR: [{ internal_handler_id: { in: scope.teamIds } }, { internal_handler_id: null }] }) },
            select: { id: true, created_at: true, updated_at: true, preferred_date: true, status: true, property_id: true } }),
    ]);
    const events = allEvents.filter(e => {
        const linkedDeal = (e.metadata as any)?.deal_id || (e.metadata as any)?.transaction_id;
        return viewer.role === 'super_boss' || !linkedDeal || visibleDealIds.has(linkedDeal);
    }).map(e => {
        const raw = (e.metadata || {}) as Record<string, any>;
        // Portal original_data and internal provider payloads are not a public timeline contract.
        const metadata = Object.fromEntries(['deal_id', 'inventory_id', 'inventory_ids', 'sent_inventory_ids', 'state', 'timestamp', 'hi_sent']
            .filter(key => raw[key] !== undefined).map(key => [key, raw[key]]));
        return { ...e, metadata, created_at: e.event_type === 'matches_sent' && raw.state === 'sent' && raw.timestamp ? new Date(raw.timestamp) : e.created_at };
    });
    const timeline: Array<{ id: string; event_type: string; content: string | null; created_at: Date; metadata?: unknown }> = [...events];
    // Derived entries include historical records predating Interaction logging, without
    // inventing events. Stable prefixed IDs disambiguate different source tables.
    for (const lead of leads) if (!events.some(e => e.event_type === 'lead_created' && (e.metadata as any)?.deal_id === lead.id)) {
        timeline.push({ id: `lead:${lead.id}`, event_type: 'lead_created', content: `Lead created · ${lead.source}${lead.source_ref ? ` · ${lead.source_ref}` : ''}`, created_at: lead.created_at, metadata: { deal_id: lead.id } });
    }
    for (const a of appointments) {
        if (a.transaction_id && !visibleDealIds.has(a.transaction_id)) continue;
        timeline.push({ id: `appointment:${a.id}`, event_type: 'visit_scheduled', content: `${a.title} · ${a.scheduled_at.toISOString()}`, created_at: a.created_at });
        if (a.status === 'completed') timeline.push({ id: `appointment-done:${a.id}`, event_type: 'visit_completed', content: `${a.title} completed`, created_at: a.updated_at });
    }
    for (const call of calls) timeline.push({ id: `call:${call.id}`, event_type: 'call', content: `Call · ${call.status}${call.duration != null ? ` · ${call.duration}s` : ''}`, created_at: call.created_at });
    for (const message of messages) {
        if (message.wa_message_id && allEvents.some(e => (e.metadata as any)?.message_id === message.wa_message_id || (e.metadata as any)?.wa_message_id === message.wa_message_id)) continue;
        timeline.push({ id: `whatsapp:${message.id}`, event_type: message.status === 'failed' ? 'whatsapp_failed' : 'whatsapp_message',
            content: `WhatsApp ${message.direction === 'outbound' ? message.status : 'received'} · ${message.body || message.message_type}`, created_at: message.created_at });
    }
    for (const log of logs) {
        const details = log.details as Record<string, unknown> | null;
        const note = details?.note || details?.notes || details?.reason;
        timeline.push({ id: `deal-log:${log.id}`, event_type: 'status_change',
            content: `${log.action}${log.new_status ? ` · ${log.old_status || 'New'} → ${log.new_status}` : ''}${typeof note === 'string' ? ` · ${note}` : ''}`,
            created_at: log.created_at, metadata: { deal_id: log.transaction_id } });
    }
    for (const visit of legacyVisits) {
        timeline.push({ id: `legacy-visit:${visit.id}`, event_type: 'visit_scheduled', content: `Visit scheduled · ${visit.property_id}${visit.preferred_date ? ` · ${visit.preferred_date.toISOString()}` : ''}`, created_at: visit.created_at });
        if (visit.status === 'completed') timeline.push({ id: `legacy-visit-done:${visit.id}`, event_type: 'visit_completed', content: `Visit completed · ${visit.property_id}`, created_at: visit.updated_at });
    }
    timeline.sort((a, b) => b.created_at.getTime() - a.created_at.getTime() || b.id.localeCompare(a.id));
    const relatedInventory = inventory.map(i => {
        const same = (value?: string | null) => !!value && normalizePhone(value) === normalizePhone(phone);
        const relationships = [same(i.owner_phone) || same(i.owner_contact_id) || same(i.owner?.contact_phone) ? 'Owner' : null,
            same(i.key_holder_contact_id) || same(i.key_holder_phone) ? 'Key holder' : null,
            same(i.referral_partner?.phone_number) ? 'Partner' : null,
            inventoryIds.includes(i.id) || refs.includes(i.id) || (!!i.display_id && refs.includes(i.display_id)) ? 'Enquired' : null].filter((r): r is string => !!r);
        const safe = sanitizationService.redactInventoryForStaff(i, {
            agentId: viewer.id, isSuperBoss: viewer.role === 'super_boss', teamIds: scope.teamIds,
        });
        // Relationship identity fields are query internals, never a second PII response path.
        return { id: safe.id, display_id: safe.display_id, type: safe.type, location: safe.location,
            city: safe.city, status: safe.status, relationship: relationships[0] || 'Owner', relationships };
    });
    const handler = contact.assigned_agent;
    const otherLinks = handler && handler.tenant_id === viewer.tenant_id && (viewer.role === 'super_boss' || scope.teamIds.includes(handler.id))
        ? [{ id: handler.id, type: 'Assigned employee', name: handler.name }] : [];
    const { assigned_agent: _handler, ...safeContact } = contact;
    return {
        contact: safeContact, leads: leads.slice((page - 1) * size, page * size),
        inventory: relatedInventory.slice((page - 1) * size, page * size),
        other_links: otherLinks,
        counts: { leads: leads.length, inventory: relatedInventory.filter(i => i.relationships.includes('Owner')).length,
            key_holder: relatedInventory.filter(i => i.relationships.includes('Key holder')).length,
            deals: leads.filter(l => !['CLOSED_WON', 'CLOSED_LOST'].includes(l.status)).length,
            other: otherLinks.length + relatedInventory.filter(i => i.relationships.includes('Partner') || i.relationships.includes('Enquired')).length },
        has_more_relationships: Math.max(leads.length, relatedInventory.length) > page * size,
        timeline: timeline.slice((page - 1) * size, page * size), page,
        has_more: timeline.length > page * size,
    };
}
