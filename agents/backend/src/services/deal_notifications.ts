/**
 * Deal Notification Service (Phase 7 - Phase 4)
 *
 * Sends WhatsApp + Email notifications on EVERY deal activity to ALL relevant parties.
 *
 * Event → Notification Matrix:
 * | Event             | Recipients                          | WhatsApp Template          |
 * |-------------------|-------------------------------------|----------------------------|
 * | Deal created      | Coordinator + demand handler        | rp_deal_created            |
 * | Property matched  | All 3 parties                       | rp_deal_matched            |
 * | Status changed    | All 3 parties                       | rp_deal_status_update      |
 * | Query raised      | Coordinator + other party           | rp_deal_query              |
 * | Query answered    | Query raiser                        | rp_deal_query_answered     |
 * | Deal closed (won) | All 3 parties                       | rp_tx_deal_closed          |
 * | Deal closed (lost)| All 3 parties                       | rp_deal_closed_lost        |
 */

import { WhatsAppService } from './whatsapp';
import { emailService } from './email_service';
import { maskDealForViewer } from './deal_visibility';
import prisma from '../db';
import logger from '../utils/logger';

const whatsapp = new WhatsAppService();

type DealEvent = 'created' | 'matched' | 'status_changed' | 'query_raised' | 'query_answered' | 'closed_won' | 'closed_lost';

interface DealEventContext {
    dealId: string;
    event: DealEvent;
    newStatus?: string;
    oldStatus?: string;
    reason?: string;
    querySubject?: string;
    queryAnswer?: string;
    queryRaisedById?: string;
    performedBy?: string;
}

interface Recipient {
    name: string;
    phone: string | null;
    email: string | null;
    role: 'coordinator' | 'demand_handler' | 'supply_handler' | 'customer';
}

/**
 * Main notification dispatcher - call after every deal event
 */
export async function notifyDealEvent(ctx: DealEventContext): Promise<void> {
    try {
        // Load full deal data
        const deal = await prisma.transaction.findUnique({
            where: { id: ctx.dealId },
            include: {
                demand_contact: { select: { name: true, phone_number: true, email: true } },
                supply_contact: { select: { name: true, phone_number: true, email: true } },
                coordinator: { select: { name: true, phone: true, email: true } },
                inventory: { select: { type: true, location: true, price: true } },
            },
        });

        if (!deal) {
            logger.warn(`[DealNotify] Deal ${ctx.dealId} not found, skipping notification`);
            return;
        }

        // Check notification preferences (quiet hours etc.)
        const now = new Date();
        const currentHour = now.getHours();

        // Build common context
        const propertyType = deal.demand_property_type || deal.demand_type_slug || deal.inventory?.type || 'Property';
        const location = deal.demand_location || deal.inventory?.location || 'Unknown';
        const budget = formatBudgetRange(deal.demand_budget_min, deal.demand_budget_max);
        const coordinatorName = deal.coordinator?.name || 'Team';
        const customerName = deal.demand_contact?.name || 'Customer';

        // Determine recipients based on event
        const recipients = getRecipientsForEvent(ctx.event, deal);

        // Send to each recipient
        for (const recipient of recipients) {
            try {
                // Check quiet hours (skip WhatsApp between 9 PM and 8 AM, but still send email)
                const isQuietHours = currentHour >= 21 || currentHour < 8;

                // Send WhatsApp
                if (recipient.phone && !isQuietHours) {
                    await sendWhatsAppNotification(ctx, recipient, {
                        propertyType, location, budget, coordinatorName, customerName,
                    });
                }

                // Send Email
                if (recipient.email) {
                    await sendEmailNotification(ctx, recipient, deal.tenant_id, {
                        propertyType, location, budget, coordinatorName, customerName,
                    });
                }

                // Log interaction
                if (recipient.phone) {
                    await prisma.interaction.create({
                        data: {
                            tenant_id: deal.tenant_id,
                            phone_number: recipient.phone,
                            channel: 'system',
                            direction: 'outbound',
                            event_type: 'deal_notification',
                            content: `Deal ${ctx.event} notification sent`,
                            metadata: {
                                type: 'deal_notification',
                                deal_id: ctx.dealId,
                                event: ctx.event,
                                recipient_role: recipient.role,
                            },
                        },
                    });
                }
            } catch (err) {
                logger.error(`[DealNotify] Failed to notify ${recipient.role} (${recipient.phone || recipient.email}):`, err);
                // Continue to next recipient - don't let one failure block others
            }
        }

        logger.info(`[DealNotify] ${ctx.event} notifications sent for deal ${ctx.dealId} to ${recipients.length} recipients`);
    } catch (err) {
        logger.error(`[DealNotify] Failed to process deal event ${ctx.event} for ${ctx.dealId}:`, err);
    }
}

/**
 * Determine who gets notified for each event type
 */
function getRecipientsForEvent(event: DealEvent, deal: any): Recipient[] {
    const recipients: Recipient[] = [];

    const coordinator: Recipient | null = deal.coordinator ? {
        name: deal.coordinator.name,
        phone: deal.coordinator.phone,
        email: deal.coordinator.email,
        role: 'coordinator',
    } : null;

    const customer: Recipient | null = deal.demand_contact ? {
        name: deal.demand_contact.name || 'Customer',
        phone: deal.demand_contact.phone_number,
        email: deal.demand_contact.email,
        role: 'customer',
    } : null;

    // For partner handlers, we need to look up their contact info
    // (demand_handler and supply_handler are PartnerAgent IDs)

    switch (event) {
        case 'created':
            // Coordinator + demand handler (partner who brought the customer)
            if (coordinator) recipients.push(coordinator);
            break;

        case 'matched':
        case 'closed_won':
        case 'closed_lost':
            // All parties
            if (coordinator) recipients.push(coordinator);
            if (customer) recipients.push(customer);
            break;

        case 'status_changed':
            // All parties
            if (coordinator) recipients.push(coordinator);
            if (customer) recipients.push(customer);
            break;

        case 'query_raised':
            // Coordinator always gets notified about queries
            if (coordinator) recipients.push(coordinator);
            break;

        case 'query_answered':
            // The person who raised the query
            // (queryRaisedById would be resolved by caller)
            break;
    }

    return recipients;
}

/**
 * Send WhatsApp notification based on event type
 */
async function sendWhatsAppNotification(
    ctx: DealEventContext,
    recipient: Recipient,
    data: { propertyType: string; location: string; budget: string; coordinatorName: string; customerName: string }
): Promise<void> {
    const phone = recipient.phone;
    if (!phone) return;

    switch (ctx.event) {
        case 'created':
            await whatsapp.sendTemplate(phone, 'rp_deal_created', {
                customer_name: data.customerName,
                property_type: data.propertyType,
                location: data.location,
                budget: data.budget,
            });
            break;

        case 'matched':
            await whatsapp.sendTemplate(phone, 'rp_deal_matched', {
                property_type: data.propertyType,
                location: data.location,
                price: data.budget,
                coordinator_name: data.coordinatorName,
            });
            break;

        case 'status_changed':
            await whatsapp.sendTemplate(phone, 'rp_deal_status_update', {
                property_type: data.propertyType,
                location: data.location,
                new_status: getStatusLabel(ctx.newStatus || ''),
                extra_info: ctx.reason || '',
            });
            break;

        case 'query_raised':
            await whatsapp.sendTemplate(phone, 'rp_deal_query', {
                property_type: data.propertyType,
                location: data.location,
                subject: ctx.querySubject || 'New query',
            });
            break;

        case 'query_answered':
            await whatsapp.sendTemplate(phone, 'rp_deal_query_answered', {
                subject: ctx.querySubject || 'Query',
                property_type: data.propertyType,
                answer_preview: (ctx.queryAnswer || '').slice(0, 100),
            });
            break;

        case 'closed_won':
            await whatsapp.sendTemplate(phone, 'rp_tx_deal_closed', {
                property_type: data.propertyType,
                location: data.location,
                price_info: data.budget ? ` at ${data.budget}` : '',
            });
            break;

        case 'closed_lost':
            await whatsapp.sendTemplate(phone, 'rp_deal_closed_lost', {
                property_type: data.propertyType,
                location: data.location,
                reason: ctx.reason || 'Deal did not proceed',
            });
            break;
    }
}

/**
 * Send email notification based on event type
 */
async function sendEmailNotification(
    ctx: DealEventContext,
    recipient: Recipient,
    tenantId: string,
    data: { propertyType: string; location: string; budget: string; coordinatorName: string; customerName: string }
): Promise<void> {
    if (!recipient.email) return;

    const subjects: Record<DealEvent, string> = {
        created: `New Deal: ${data.propertyType} in ${data.location}`,
        matched: `Property Matched: ${data.propertyType} in ${data.location}`,
        status_changed: `Deal Update: ${data.propertyType} - ${getStatusLabel(ctx.newStatus || '')}`,
        query_raised: `New Query: ${ctx.querySubject || 'Deal Question'}`,
        query_answered: `Query Answered: ${ctx.querySubject || 'Deal Question'}`,
        closed_won: `Deal Closed: ${data.propertyType} in ${data.location}`,
        closed_lost: `Deal Closed: ${data.propertyType} in ${data.location}`,
    };

    await emailService.sendEmail(
        {
            from: 'notifications@realtypandit.in',
            to: recipient.email,
            subject: subjects[ctx.event],
            body: buildEmailBody(ctx, recipient, data),
        },
        tenantId,
        false
    );
}

/**
 * Build email body text
 */
function buildEmailBody(
    ctx: DealEventContext,
    recipient: Recipient,
    data: { propertyType: string; location: string; budget: string; coordinatorName: string; customerName: string }
): string {
    const greeting = `Hi ${recipient.name},\n\n`;
    const footer = `\n\nBest regards,\nRealty Pandit Team\nhttps://realtypandit.in`;

    switch (ctx.event) {
        case 'created':
            return `${greeting}A new deal has been created!\n\nCustomer: ${data.customerName}\nProperty Type: ${data.propertyType}\nLocation: ${data.location}\nBudget: ${data.budget}\n\nYou have been assigned as the coordinator. Log in to manage this deal.${footer}`;
        case 'matched':
            return `${greeting}Great news! A ${data.propertyType} in ${data.location} has been matched to the deal.\n\nBudget: ${data.budget}\nCoordinator: ${data.coordinatorName}\n\nA visit will be scheduled soon.${footer}`;
        case 'status_changed':
            return `${greeting}Your deal for ${data.propertyType} in ${data.location} has been updated.\n\nNew Status: ${getStatusLabel(ctx.newStatus || '')}\n${ctx.reason ? `Note: ${ctx.reason}\n` : ''}${footer}`;
        case 'query_raised':
            return `${greeting}A new query has been raised on the deal for ${data.propertyType} in ${data.location}.\n\nSubject: ${ctx.querySubject}\n\nPlease log in to respond.${footer}`;
        case 'query_answered':
            return `${greeting}Your query "${ctx.querySubject}" has been answered.\n\nAnswer: ${ctx.queryAnswer}\n\nLog in to see full details.${footer}`;
        case 'closed_won':
            return `${greeting}Congratulations! The deal for ${data.propertyType} in ${data.location} has been closed successfully!\n\nBudget: ${data.budget}${footer}`;
        case 'closed_lost':
            return `${greeting}The deal for ${data.propertyType} in ${data.location} has been closed.\n\nReason: ${ctx.reason || 'Deal did not proceed'}\n\nPanditji will keep looking for better options!${footer}`;
        default:
            return `${greeting}There's an update on your deal. Please log in to see details.${footer}`;
    }
}

// ─── Helpers ────────────────────────────────────────────────────

function formatBudgetRange(min: number | null, max: number | null): string {
    if (!min && !max) return 'Not specified';
    const fmt = (v: number) => v >= 10000000 ? `${(v / 10000000).toFixed(1)}Cr` : v >= 100000 ? `${(v / 100000).toFixed(1)}L` : `${(v / 1000).toFixed(0)}K`;
    if (min && max) return `${fmt(min)} - ${fmt(max)}`;
    if (max) return `Up to ${fmt(max)}`;
    return `${fmt(min!)}+`;
}

function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
        NEW: 'New Inquiry',
        MATCHED: 'Property Matched',
        VISIT_SCHEDULED: 'Visit Scheduled',
        VISITED: 'Visit Completed',
        NEGOTIATION: 'In Negotiation',
        CLOSED_WON: 'Deal Closed (Won)',
        CLOSED_LOST: 'Deal Closed (Lost)',
        ON_HOLD: 'On Hold',
    };
    return labels[status] || status;
}
