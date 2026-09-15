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
 * | Status changed    | Stage-specific (see switch below)   | per-stage templates        |
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
import { isNotificationQuietHours } from '../utils/quiet_hours';
import { isOptedOut } from './wa_compliance';
import * as SentrySDK from '@sentry/node';

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
                inventory: {
                    select: {
                        type: true, location: true, price: true, latitude: true, longitude: true,
                        referral_partner: { select: { name: true, phone_number: true, managing_agent: { select: { name: true } } } },
                    },
                },
            },
        });

        if (!deal) {
            logger.warn(`[DealNotify] Deal ${ctx.dealId} not found, skipping notification`);
            return;
        }

        // Check notification preferences (quiet hours etc.). The hour is no longer read
        // from server-local time here — isNotificationQuietHours() computes it in IST,
        // which is what the 21/8 window was always meant to mean. (2026-08-07)
        const now = new Date();

        // Build common context. Phase 5 (demand canonical): legacy demand_property_type
        // / demand_type_slug columns dropped on Transaction. Derive a human label
        // from the canonical demand_schema_values, then fall back to the matched
        // inventory's type, then a generic placeholder.
        const demandSchema = ((deal as any).demand_schema_values
            ?? {}) as Record<string, any>;
        const propertyType = (typeof demandSchema.property_type === 'string' && demandSchema.property_type)
            || (typeof demandSchema.type === 'string' && demandSchema.type)
            || deal.inventory?.type
            || 'Property';
        const location = deal.demand_location || deal.inventory?.location || 'Unknown';
        const budget = formatBudgetRange(deal.demand_budget_min, deal.demand_budget_max);
        const coordinatorName = deal.coordinator?.name || 'Team';
        const customerName = deal.demand_contact?.name || 'Customer';
        const ownerName = deal.supply_contact?.name || 'Owner';
        const mapsLink = (deal.inventory?.latitude && deal.inventory?.longitude)
            ? `https://maps.google.com/?q=${deal.inventory.latitude},${deal.inventory.longitude}`
            : null;

        // Determine recipients based on event
        const recipients = getRecipientsForEvent(ctx.event, deal, ctx);

        // Send to each recipient
        for (const recipient of recipients) {
            try {
                // Quiet hours (skip WhatsApp 9 PM – 8 AM, but still send email). The 21/8 window
                // now lives in utils/quiet_hours as isNotificationQuietHours() — deliberately NOT
                // the shared isQuietHours() (22/6), which would WIDEN this send window. (2026-08-07)
                const isQuietHours = isNotificationQuietHours();

                // Consent guard — this dispatcher checked neither opted_out_at nor ai_paused.
                const optedOut = recipient.phone ? await isOptedOut(recipient.phone) : false;
                if (optedOut) {
                    logger.info(`[DealNotifications] Skipping ${recipient.phone} — opted out`);
                }

                // Send WhatsApp
                if (recipient.phone && !isQuietHours && !optedOut) {
                    await sendWhatsAppNotification(ctx, recipient, {
                        propertyType, location, budget, coordinatorName, customerName, ownerName, mapsLink,
                    });
                }

                // Send Email (owner/seller is WhatsApp-only for now — NEG-3)
                if (recipient.email && recipient.role !== 'supply_handler') {
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

        // Partner-specific notifications on match event
        if (ctx.event === 'matched' && deal) {
            await notifyPartnersOnMatch(deal, coordinatorName);
        }

        logger.info(`[DealNotify] ${ctx.event} notifications sent for deal ${ctx.dealId} to ${recipients.length} recipients`);
    } catch (err) {
        logger.error(`[DealNotify] Failed to process deal event ${ctx.event} for ${ctx.dealId}:`, err);
    }
}

/**
 * Notify partner agents when a deal is matched.
 * - Supply partner (whose property was matched): rp_partner_inventory_matched
 * - Demand partner (whose client was matched):   rp_partner_client_matched
 */
async function notifyPartnersOnMatch(deal: any, coordinatorName: string): Promise<void> {
    const propertyType = deal.demand_property_type || deal.inventory?.type || 'Property';
    const location = deal.demand_location || deal.inventory?.location || 'Unknown';
    const price = deal.inventory?.price ? formatPrice(deal.inventory.price) : formatBudgetRange(deal.demand_budget_min, deal.demand_budget_max);
    const customerName = deal.demand_contact?.name || 'Customer';

    // Notify the partner who owns the matched inventory (supply side)
    const inventoryPartner = deal.inventory?.referral_partner;
    if (inventoryPartner?.phone_number) {
        try {
            await whatsapp.sendTemplate(inventoryPartner.phone_number, 'rp_partner_inventory_matched', {
                name: inventoryPartner.name,
                property_type: propertyType,
                location,
                buyer_budget: price,
                coordinator: inventoryPartner.managing_agent?.name || coordinatorName,
            });
            logger.info(`[DealNotify] Inventory partner ${inventoryPartner.phone_number} notified of match`);
        } catch (err) {
            logger.warn(`[DealNotify] Failed to notify inventory partner: ${(err as Error).message}`);
        }
    }

    // Notify the partner who referred the buyer (demand side)
    // demand_handler_id is a PartnerAgent.id when demand_handler_type === 'PARTNER'
    if (deal.demand_handler_type === 'PARTNER' && deal.demand_handler_id) {
        try {
            const demandPartner = await prisma.partnerAgent.findUnique({
                where: { id: deal.demand_handler_id },
                select: { name: true, phone_number: true, managing_agent: { select: { name: true } } },
            });
            if (demandPartner?.phone_number) {
                await whatsapp.sendTemplate(demandPartner.phone_number, 'rp_partner_client_matched', {
                    name: demandPartner.name,
                    property_type: propertyType,
                    location,
                    price,
                    coordinator: demandPartner.managing_agent?.name || coordinatorName,
                });
                logger.info(`[DealNotify] Demand partner ${demandPartner.phone_number} notified of match`);
            }
        } catch (err) {
            logger.warn(`[DealNotify] Failed to notify demand partner: ${(err as Error).message}`);
        }
    }
}

/**
 * Determine who gets notified for each event type.
 * For status_changed, recipients vary by the target stage to avoid noise.
 */
function getRecipientsForEvent(event: DealEvent, deal: any, ctx?: DealEventContext): Recipient[] {
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

    // (NEG-3, 2026-06-23) The property owner/seller — previously loaded but never notified, so a
    // "two-sided" negotiation ran entirely single-sided. Looped in on NEGOTIATION entry + CLOSED_WON.
    const seller: Recipient | null = deal.supply_contact ? {
        name: deal.supply_contact.name || 'Owner',
        phone: deal.supply_contact.phone_number,
        email: deal.supply_contact.email,
        role: 'supply_handler',
    } : null;

    switch (event) {
        case 'created':
            if (coordinator) recipients.push(coordinator);
            break;

        case 'matched':
        case 'closed_won':
        case 'closed_lost':
            if (coordinator) recipients.push(coordinator);
            if (customer) recipients.push(customer);
            // Tell the owner their property's deal closed (won only — CLOSED_LOST just silently
            // returns the inventory to `active` via the NEG-1 lock, no owner message needed).
            if (event === 'closed_won' && seller) recipients.push(seller);
            break;

        case 'status_changed': {
            const ns = ctx?.newStatus;
            if (ns === 'VISIT_SCHEDULED') {
                // Customer only — coordinator booked via Deal Workspace so they already know
                if (customer) recipients.push(customer);
            } else if (ns === 'NEGOTIATION') {
                // Customer (availability ask) + owner (a buyer is negotiating their property). NEG-3.
                if (customer) recipients.push(customer);
                if (seller) recipients.push(seller);
            } else if (ns === 'ON_HOLD') {
                // Coordinator only — customer is not notified on hold (per KRA)
                if (coordinator) recipients.push(coordinator);
            } else if (ns === 'QUALIFIED' || ns === 'VISITED') {
                // Internal transitions — no WhatsApp noise
            } else {
                // NEW and any unexpected value — keep both (legacy behaviour)
                if (coordinator) recipients.push(coordinator);
                if (customer) recipients.push(customer);
            }
            break;
        }

        case 'query_raised':
            if (coordinator) recipients.push(coordinator);
            break;

        case 'query_answered':
            // Caller resolves queryRaisedById separately
            break;
    }

    return recipients;
}

/**
 * Fetch the scheduled_at datetime of the latest appointment linked to a deal,
 * formatted as "27 Apr at 11:00 AM" (IST). Returns "Check CRM" on failure.
 */
async function getLatestAppointmentDatetime(dealId: string): Promise<string> {
    try {
        const appt = await prisma.appointment.findFirst({
            where: { transaction_id: dealId },
            orderBy: { scheduled_at: 'desc' },
            select: { scheduled_at: true },
        });
        if (appt?.scheduled_at) {
            return appt.scheduled_at.toLocaleString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
            });
        }
    } catch { /* fall through */ }
    return 'Check CRM';
}

/**
 * Send WhatsApp notification based on event type
 */
async function sendWhatsAppNotification(
    ctx: DealEventContext,
    recipient: Recipient,
    data: { propertyType: string; location: string; budget: string; coordinatorName: string; customerName: string; ownerName: string; mapsLink: string | null }
): Promise<void> {
    const phone = recipient.phone;
    if (!phone) return;

    // (NEG-3, 2026-06-23) Owner/seller-side notifications use distinct seller templates. Best-effort:
    // these templates are pending Meta approval and won't deliver until approved — a failure here must
    // not block the buyer/coordinator notifications (the caller try/catches per recipient).
    if (recipient.role === 'supply_handler') {
        const propertyLabel = `${data.propertyType}, ${data.location}`;
        if (ctx.event === 'status_changed' && ctx.newStatus === 'NEGOTIATION') {
            await whatsapp.sendTemplate(phone, 'rp_negotiation_seller', { owner_name: data.ownerName, property: propertyLabel });
        } else if (ctx.event === 'closed_won') {
            await whatsapp.sendTemplate(phone, 'rp_deal_closed_seller', { owner_name: data.ownerName, property: propertyLabel });
        }
        return;
    }

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

        case 'status_changed': {
            const ns = ctx.newStatus;
            if (ns === 'VISIT_SCHEDULED') {
                // Customer gets visit confirmation with Google Maps location.
                // Template pending Meta approval — fall back to plaintext on failure.
                const datetime = await getLatestAppointmentDatetime(ctx.dealId);
                const maps = data.mapsLink || data.location;
                const fallback = `✅ Visit Confirmed!\n📅 ${datetime}\n🏠 ${data.propertyType}, ${data.location}\n📍 ${maps}\n\nTime pe pahunchen — hum wait karenge!`;
                await whatsapp.sendTemplateOrText(phone, 'rp_visit_confirmed_customer', {
                    datetime,
                    property: `${data.propertyType}, ${data.location}`,
                    maps_link: maps,
                }, fallback);
            } else if (ns === 'NEGOTIATION') {
                // Customer gets availability-collection message (per Stage 6 KRA entry action)
                await whatsapp.sendTemplate(phone, 'rp_negotiation_availability', {});
            } else if (ns === 'ON_HOLD') {
                // Coordinator gets deal-on-hold alert (customer not notified per KRA)
                await whatsapp.sendTemplate(phone, 'rp_deal_onhold', {
                    customer_name: data.customerName,
                    property_type: data.propertyType,
                    location: data.location,
                    reason: ctx.reason || 'Koi progress nahi tha',
                });
            } else {
                // NEW and any other transitions — generic status update
                await whatsapp.sendTemplate(phone, 'rp_deal_status_update', {
                    property_type: data.propertyType,
                    location: data.location,
                    new_status: getStatusLabel(ns || ''),
                    extra_info: ctx.reason || '',
                });
            }
            break;
        }

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
            await whatsapp.sendTemplate(phone, 'rp_tx_deal_closed_v2', {
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

function formatPrice(price: number): string {
    if (price >= 10000000) return `${(price / 10000000).toFixed(1)} Cr`;
    if (price >= 100000) return `${(price / 100000).toFixed(1)} Lakh`;
    return `${(price / 1000).toFixed(0)}K`;
}

function formatBudgetRange(min: number | null, max: number | null): string {
    if (!min && !max) return 'Not specified';
    const fmt = (v: number) => v >= 10000000 ? `${(v / 10000000).toFixed(1)}Cr` : v >= 100000 ? `${(v / 100000).toFixed(1)}L` : `${(v / 1000).toFixed(0)}K`;
    if (min && max) return `${fmt(min)} - ${fmt(max)}`;
    if (max) return `Up to ${fmt(max)}`;
    return `${fmt(min!)}+`;
}

/**
 * Fires 3 WhatsApp notifications when an appointment is booked via Deal Workspace:
 * 1. Customer — visit confirmation
 * 2. Coordinator — visit details alert
 * 3. Key holder — masked customer phone + visit time
 */
export async function notifyAppointmentBooked(params: {
    deal: any;
    inv: any;
    appointment: any;
    visitDate: string;
    visitTime: string;
    bookedByName: string;
}): Promise<void> {
    const { deal, inv } = params;
    const wa = new WhatsAppService();
    // Room count: canonical taxonomy keys (bhk/rooms) → legacy (bhk_count/bedrooms).
    const _rooms = inv.specs?.bhk ?? inv.specs?.rooms ?? inv.specs?.bhk_count ?? inv.specs?.bedrooms;
    const propertyLabel = _rooms
        ? `${_rooms}BHK ${inv.classification?.name || inv.type || 'Property'}`
        : (inv.classification?.name || inv.type || 'Property');
    const dateLabel = new Date(`${params.visitDate}T${params.visitTime}:00+05:30`)
        .toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

    if (deal.demand_contact?.phone_number) {
        try {
            await wa.sendTemplate(deal.demand_contact.phone_number, 'rp_visit_confirmation_customer', {
                customer_name: deal.demand_contact.name || 'Customer',
                property_label: propertyLabel,
                location: inv.location || inv.locality || '-',
                visit_datetime: dateLabel,
            });
        } catch (e) { logger.warn('[Notify] Customer visit confirmation failed:', e); SentrySDK.captureException(e, { tags: { notify: 'visit_customer' } }); }
    }

    if (deal.coordinator?.phone) {
        try {
            await wa.sendTemplate(deal.coordinator.phone, 'rp_visit_booked_manager', {
                manager_name: deal.coordinator.name || 'Team',
                customer_name: deal.demand_contact?.name || 'Customer',
                customer_phone: deal.demand_contact?.phone_number || '-',
                property_label: propertyLabel,
                location: inv.location || inv.locality || '-',
                visit_datetime: dateLabel,
            });
        } catch (e) { logger.warn('[Notify] Manager visit notification failed:', e); SentrySDK.captureException(e, { tags: { notify: 'visit_manager' } }); }
    }

    // VS-7 (2026-06-22): fall back to the owner's phone when no dedicated key-holder phone is set,
    // so the agent isn't sent to a property with nobody to unlock it. Warn if neither exists.
    const keyPhone = inv.key_holder_phone || inv.owner_phone;
    if (keyPhone) {
        const rawPhone = deal.demand_contact?.phone_number || '';
        const masked = rawPhone.length > 4 ? `XXXXXX${rawPhone.slice(-4)}` : 'XXXXXX';
        try {
            await wa.sendTemplate(keyPhone, 'rp_visit_keyholder_alert', {
                keyholder_name: inv.key_holder_name || 'Key Holder',
                property_label: propertyLabel,
                location: inv.location || inv.locality || '-',
                visit_datetime: dateLabel,
                customer_masked_phone: masked,
            });
        } catch (e) { logger.warn('[Notify] Key holder visit notification failed:', e); SentrySDK.captureException(e, { tags: { notify: 'visit_keyholder' } }); }
    } else {
        logger.warn(`[Notify] No key-holder OR owner phone for the visit property — access must be arranged manually (deal ${deal.id})`);
    }
}

function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
        NEW: 'New Inquiry',
        QUALIFIED: 'Qualified',
        MATCHING_APPOINTMENT: 'Booking Appointment (Legacy)',
        VISIT_SCHEDULED: 'Visit Scheduled',
        VISITED: 'Visit Completed',
        NEGOTIATION: 'In Negotiation',
        CLOSED_WON: 'Deal Closed (Won)',
        CLOSED_LOST: 'Deal Closed (Lost)',
        ON_HOLD: 'On Hold',
    };
    return labels[status] || status;
}
