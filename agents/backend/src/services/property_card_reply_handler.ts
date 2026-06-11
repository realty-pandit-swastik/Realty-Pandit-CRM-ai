/**
 * Property Card Reply Handler — handles customer taps on `rp_property_card` buttons
 * (Stage 2 KRA reply-button routing).
 *
 * Buttons: "Call Back", "Schedule Visit", "Next Option" (indices 0, 1, 2).
 *
 * Identifies the most recently shared property + active deal for the inbound
 * phone via Interaction history, then routes:
 *   - "Schedule Visit" → ask for date/time via rp_visit_availability + alert coordinator
 *   - "Call Back"      → fire rp_callback_manager_alert to coordinator
 *   - "Next Option"    → call shareNextProperty(dealId)
 *
 * Returns true if the message was handled (caller should NOT continue normal
 * processing); false if not a property-card reply.
 */

import prisma from '../db';
import logger from '../utils/logger';
import { WhatsAppService } from './whatsapp';
import { createLeadActionTask } from './workflow_task_service';

const whatsapp = new WhatsAppService();

// Button-tap titles — the customer tapped a quick-reply, so the title is the exact button
// label; loose substring matching is safe here.
const BUTTON_TITLES = {
    SCHEDULE: ['schedule visit', 'visit', 'schedule'],
    CALLBACK: ['call back', 'callback'],
    NEXT: ['next option', 'next', 'next property', 'aage'],
};

// Typed equivalents (2026-06-11): a customer who TYPES a button word should be routed the same
// as a tap. Matched by EXACT trimmed equality (NOT substring) so ordinary chat like "next week",
// "I visited yesterday", or "call you tomorrow?" never mis-fires the card actions.
const TYPED_EQUIV = {
    SCHEDULE: ['schedule visit', 'book visit', 'schedule a visit', 'site visit', 'visit'],
    CALLBACK: ['call back', 'callback', 'call me', 'call me back'],
    NEXT: ['next option', 'next property', 'show next', 'next', 'more', 'aage'],
};

/**
 * Returns true if the message was a property-card button reply (tap OR typed equivalent) we routed.
 */
export async function handlePropertyCardReply(msg: any, from: string): Promise<boolean> {
    const tapTitle = (msg?.interactive?.button_reply?.title || msg?.button?.text || '').toLowerCase().trim();
    const typed = (msg?.text?.body || '').toLowerCase().trim();

    let isSchedule = false, isCallback = false, isNext = false;
    if (tapTitle) {
        isSchedule = BUTTON_TITLES.SCHEDULE.some(t => tapTitle.includes(t));
        isCallback = BUTTON_TITLES.CALLBACK.some(t => tapTitle.includes(t));
        isNext = BUTTON_TITLES.NEXT.some(t => tapTitle.includes(t));
    } else if (typed) {
        isSchedule = TYPED_EQUIV.SCHEDULE.includes(typed);
        isCallback = TYPED_EQUIV.CALLBACK.includes(typed);
        isNext = TYPED_EQUIV.NEXT.includes(typed);
    }
    if (!isSchedule && !isCallback && !isNext) return false;

    // Find the most recently shared property to this phone.
    const lastShare = await prisma.interaction.findFirst({
        where: {
            phone_number: from,
            event_type: 'property_shared',
        },
        orderBy: { created_at: 'desc' },
        select: { metadata: true, tenant_id: true },
    });
    if (!lastShare?.metadata) {
        logger.info(`[PropCardReply] No prior property share for ${from}; not handling`);
        return false;
    }

    const dealId = (lastShare.metadata as any).deal_id as string | undefined;
    if (!dealId) {
        logger.warn(`[PropCardReply] Last share for ${from} has no deal_id`);
        return false;
    }

    const deal = await prisma.transaction.findUnique({
        where: { id: dealId },
        include: {
            demand_contact: { select: { name: true } },
            coordinator: { select: { phone: true } },
        },
    });
    if (!deal) {
        logger.warn(`[PropCardReply] Deal ${dealId} not found`);
        return false;
    }

    const customerName = deal.demand_contact?.name || 'Customer';
    // Phase 5: legacy demand_property_type column dropped — derive label from
    // canonical demand_schema_values.
    const dSchema = ((deal as any).demand_schema_values ?? {}) as Record<string, any>;
    const propertyTypeLabel = (typeof dSchema.property_type === 'string' && dSchema.property_type)
        || (typeof dSchema.type === 'string' && dSchema.type)
        || 'property';
    const requirement = `${propertyTypeLabel} in ${deal.demand_location || 'requested area'}`;

    if (isNext) {
        const { shareNextProperty } = await import('./property_sharing');
        await shareNextProperty(dealId);
        logger.info(`[PropCardReply] Next-property request handled for deal ${dealId}`);
        return true;
    }

    if (isCallback) {
        if (deal.coordinator?.phone) {
            try {
                await whatsapp.sendTemplate(deal.coordinator.phone, 'rp_callback_manager_alert', {
                    name: customerName,
                    callback_time: 'ASAP — customer tapped Call Back',
                    requirement,
                });
            } catch (err) {
                logger.warn(`[PropCardReply] Manager alert failed:`, err);
            }
        }
        await prisma.interaction.create({
            data: {
                tenant_id: deal.tenant_id,
                phone_number: from,
                channel: 'whatsapp',
                direction: 'inbound',
                event_type: 'property_card_callback_request',
                content: 'Customer tapped Call Back on property card',
                metadata: { deal_id: dealId },
            },
        });
        // Create CRM task for the assigned agent (or super_boss fallback)
        // so the callback actually reaches a human. The coordinator WhatsApp
        // alert above is best-effort; this is the durable routing.
        await createLeadActionTask({
            phone: from,
            action: 'CALLBACK_REQUEST',
            tenantId: deal.tenant_id,
            propertyId: (lastShare.metadata as any).inventory_id as string | undefined,
            dealId,
            sourceChannel: 'whatsapp-button',
            rawNote: `Customer tapped Call Back on property card. Requirement: ${requirement}`,
        });
        logger.info(`[PropCardReply] Callback request handled for deal ${dealId}`);
        return true;
    }

    if (isSchedule) {
        const inventoryId = (lastShare.metadata as any).inventory_id as string | undefined;

        // Save selected inventory to deal + transition directly to VISIT_SCHEDULED.
        try {
            const { transitionTransaction } = await import('./transaction_state_machine');
            const { TransactionStatus } = await import('@prisma/client');

            // Patch inventory_id first if not already set.
            if (inventoryId && !deal.inventory_id) {
                await prisma.transaction.update({
                    where: { id: dealId },
                    data: { inventory_id: inventoryId },
                });
            }

            if (deal.status !== 'VISIT_SCHEDULED') {
                await transitionTransaction(
                    dealId,
                    TransactionStatus.VISIT_SCHEDULED,
                    from,
                    'whatsapp',
                    { notes: 'Customer tapped Schedule Visit — moved directly to VISIT_SCHEDULED', inventory_id: inventoryId },
                );
                logger.info(`[PropCardReply] Deal ${dealId} → VISIT_SCHEDULED via Schedule Visit tap`);
            }
        } catch (err) {
            logger.warn(`[PropCardReply] Transition to VISIT_SCHEDULED failed:`, (err as Error).message);
        }

        // Ask customer for availability; coordinator will confirm slot in CRM.
        try {
            await whatsapp.sendTemplate(from, 'rp_visit_availability', {});
        } catch (err) {
            logger.warn(`[PropCardReply] rp_visit_availability send failed:`, err);
        }
        if (deal.coordinator?.phone) {
            try {
                await whatsapp.sendTemplate(deal.coordinator.phone, 'rp_callback_manager_alert', {
                    name: customerName,
                    callback_time: 'Visit requested — confirm slot in CRM',
                    requirement,
                });
            } catch (err) {
                logger.warn(`[PropCardReply] Manager visit alert failed:`, err);
            }
        }
        await prisma.interaction.create({
            data: {
                tenant_id: deal.tenant_id,
                phone_number: from,
                channel: 'whatsapp',
                direction: 'inbound',
                event_type: 'property_card_visit_request',
                content: 'Customer tapped Schedule Visit on property card',
                metadata: { deal_id: dealId, inventory_id: inventoryId },
            },
        });
        await createLeadActionTask({
            phone: from,
            action: 'VISIT_REQUEST',
            tenantId: deal.tenant_id,
            propertyId: inventoryId,
            dealId,
            sourceChannel: 'whatsapp-button',
            rawNote: `Customer tapped Schedule Visit on property card. Requirement: ${requirement}`,
        });
        logger.info(`[PropCardReply] Visit request handled for deal ${dealId}`);
        return true;
    }

    return false;
}
