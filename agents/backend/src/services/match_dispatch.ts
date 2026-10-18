import prisma from '../db';
import { CrmError, crmScope, visibleContact, type CrmViewer } from './contact_relationship';
import { ensureDealForLead } from './ensure_deal';
import { MatchingEngine, buildMatchCriteriaFromLead } from './matching_engine';
import { shareSpecificProperty } from './property_sharing';
import { WhatsAppService } from './whatsapp';
import { SessionTracker } from './session_tracker';
import { isPlaceholderPhone, normalizePhone } from '../utils/phone';

interface Receipt {
    deal_id: string; by_agent_id: string; state: 'processing' | 'failed' | 'sent';
    inventory_ids: string[]; sent_inventory_ids: string[];
    hi_sent: boolean; greeting_status: 'sent' | 'manual_required'; timestamp?: string;
}

function validateRequestId(requestId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId || '')) throw new CrmError(400, 'A valid request_id is required');
}

/** Legacy contact-only tiles also get a one-tap path. Reuse a visible enquiry, or create
 * a staff-initiated enquiry without changing another handler's lead or contact assignment. */
export async function dispatchContactMatches(viewer: CrmViewer, rawPhone: string, requestId: string) {
    validateRequestId(requestId);
    const { contact, scope } = await visibleContact(rawPhone, viewer);
    if (isPlaceholderPhone(contact.phone_number) || !normalizePhone(contact.phone_number)) throw new CrmError(422, 'Add the client phone before sending matches');
    const receipt = await prisma.interaction.findUnique({ where: { id: requestId } });
    if (receipt) {
        const metadata = receipt.metadata as unknown as Receipt;
        if (receipt.phone_number !== contact.phone_number || receipt.tenant_id !== viewer.tenant_id || metadata.by_agent_id !== viewer.id) throw new CrmError(409, 'Request ID already used for another action');
        return dispatchLeadMatches(viewer, metadata.deal_id, requestId);
    }
    const existing = await prisma.transaction.findFirst({ where: { ...scope.deal, demand_contact_id: contact.phone_number, status: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } }, orderBy: { created_at: 'desc' }, select: { id: true } });
    const id = existing?.id || (await ensureDealForLead({ contactPhone: contact.phone_number, source: 'manual', createdByAgentId: viewer.id, assignedAgentId: viewer.id, newEnquiry: true })).dealId;
    return dispatchLeadMatches(viewer, id, requestId);
}

/** A request UUID is also a unique Interaction ID, giving retries a durable receipt without
 * a second source of truth. Failed requests resume only unsent items; parallel requests with
 * the same UUID cannot both claim the send. Never reset a processing receipt on timeout:
 * provider acceptance may have happened even if the browser lost its response. */
export async function dispatchLeadMatches(viewer: CrmViewer, dealId: string, requestId: string) {
    validateRequestId(requestId);
    const scope = await crmScope(viewer);
    const deal = await prisma.transaction.findFirst({
        where: { ...scope.deal, id: dealId }, include: { demand_contact: { select: { phone_number: true, name: true } } },
    });
    if (!deal?.demand_contact) throw new CrmError(404, 'Enquiry not found or not accessible');
    const phone = deal.demand_contact.phone_number;
    if (isPlaceholderPhone(phone) || !normalizePhone(phone)) throw new CrmError(422, 'Add the client phone before sending matches');
    let receipt = await prisma.interaction.findUnique({ where: { id: requestId } });
    let state: Receipt;
    if (receipt) {
        state = receipt.metadata as unknown as Receipt;
        if (receipt.tenant_id !== viewer.tenant_id || receipt.phone_number !== phone
            || receipt.event_type !== 'matches_sent' || state.deal_id !== dealId || state.by_agent_id !== viewer.id) {
            throw new CrmError(409, 'Request ID already used for another action');
        }
        if (state.state === 'sent') return { ...state, contact_name: deal.demand_contact.name, replayed: true };
        if (state.state === 'processing') throw new CrmError(409, 'Matching is already in progress. Check the timeline before retrying.');
        const claimed = await prisma.interaction.updateMany({ where: { id: requestId, metadata: { path: ['state'], equals: 'failed' } },
            data: { metadata: { ...state, state: 'processing' } as any } });
        if (!claimed.count) throw new CrmError(409, 'Matching is already in progress');
        state = { ...state, state: 'processing' };
    } else {
        const criteria = buildMatchCriteriaFromLead({
            intent: deal.demand_intent, budget_min: deal.demand_budget_min, budget_max: deal.demand_budget_max,
            preferred_location: deal.demand_location, demand_taxonomy_node_id: deal.demand_taxonomy_node_id,
            demand_schema_values: deal.demand_schema_values as Record<string, any> | null,
        });
        if (!criteria.preferred_location && !criteria.budget_max && !criteria.demand_taxonomy_node_id && !Object.keys(criteria.demand_schema_values || {}).length) {
            throw new CrmError(422, 'Add this enquiry’s requirements before matching');
        }
        const matches = await new MatchingEngine().findMatches({ ...criteria, tenant_id: viewer.tenant_id }, 10);
        // Recheck tenant/status at the send boundary as well as in the matching engine.
        const allowed = await prisma.inventory.findMany({ where: { id: { in: matches.map(m => m.id) }, tenant_id: viewer.tenant_id, status: 'active' }, select: { id: true } });
        const ids = new Set(allowed.map(i => i.id));
        const inventoryIds = matches.map(m => m.id).filter(id => ids.has(id));
        if (!inventoryIds.length) return { state: 'no_matches', inventory_ids: [], sent_inventory_ids: [], hi_sent: false };
        state = { deal_id: deal.id, by_agent_id: viewer.id, state: 'processing', inventory_ids: inventoryIds,
            sent_inventory_ids: [], hi_sent: false, greeting_status: 'manual_required' };
        try {
            receipt = await prisma.interaction.create({ data: {
                id: requestId, tenant_id: viewer.tenant_id, phone_number: phone,
                channel: 'whatsapp', direction: 'outbound', event_type: 'matches_sent',
                content: 'Matching in progress', metadata: state as any,
            } });
        } catch (e: any) {
            if (e.code === 'P2002') throw new CrmError(409, 'Matching is already in progress');
            throw e;
        }
    }
    const save = (content: string) => prisma.interaction.update({ where: { id: requestId }, data: { content, metadata: state as any } });
    try {
        if (process.env.NODE_ENV === 'development') throw new CrmError(503, 'WhatsApp sends are disabled in development');
        // Free-form Hi is permitted only in an active WhatsApp session. Outside it, property
        // sharing still uses approved templates; the UI provides an honest personal-chat link.
        if (!state.hi_sent && await SessionTracker.isSessionActive(phone)) {
            await new WhatsAppService().sendTextStrict(normalizePhone(phone), 'Hi');
            state.hi_sent = true;
            state.greeting_status = 'sent';
            await save('Hi sent; sending matches');
            await prisma.interaction.create({ data: { tenant_id: viewer.tenant_id, phone_number: phone,
                channel: 'whatsapp', direction: 'outbound', event_type: 'message', content: 'Hi',
                metadata: { deal_id: deal.id, dispatch_id: requestId, by_agent_id: viewer.id } } });
        }
        for (const id of state.inventory_ids) {
            if (state.sent_inventory_ids.includes(id)) continue;
            if (!await shareSpecificProperty(deal.id, id, viewer.id)) throw new CrmError(502, 'WhatsApp did not accept a property share');
            state.sent_inventory_ids.push(id);
            await save(`Sending matches · ${state.sent_inventory_ids.length}/${state.inventory_ids.length}`);
        }
        state.state = 'sent';
        state.timestamp = new Date().toISOString();
        await save('Matches sent');
        return { ...state, contact_name: deal.demand_contact.name, replayed: false };
    } catch (error) {
        state.state = 'failed';
        await save('Matching failed — retry to send remaining properties');
        if (error instanceof CrmError) throw error;
        throw new CrmError(502, 'Matching could not be sent. Retry to send remaining properties.');
    }
}
