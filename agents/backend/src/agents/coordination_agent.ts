/**
 * Coordination Agent — Bridges communication between demand and supply sides.
 *
 * Now implements BaseAgent for direct message routing (TX-008).
 * Handles:
 * 1. Incoming appointment-related messages via handle() (BaseAgent interface)
 * 2. Programmatic coordination via coordinate() (internal API)
 *
 * Appointment rules (Transaction-aware):
 * - ALL appointments MUST have transaction_id
 * - demand_contact_id (from Transaction)
 * - supply_contact_id (from Transaction — can't schedule without supply)
 * - executive_agent_id (from Transaction — internal must attend)
 * - All 3 parties notified on create/confirm/reschedule/cancel
 */

import { BaseAgent, AgentContext, AgentResponse } from './types';
import { NotificationAgent } from './notification_agent';
import { transitionTransaction } from '../services/transaction_state_machine';
import { TransactionStatus } from '@prisma/client';
import prisma from '../db';
import logger from '../utils/logger';
import { parseMenuChoice } from '../utils/menu_choice';
import { lastOutboundWasSameMenu, escalateStuckMenu } from '../utils/menu_loop_guard';

interface CoordinationRequest {
    appointment_id: string;
    action: 'notify_seller' | 'notify_buyer' | 'confirm_both' | 'handle_reschedule' | 'handle_cancel';
    initiated_by?: string; // phone number of who initiated
}

interface CoordinationResult {
    success: boolean;
    buyer_notified: boolean;
    seller_notified: boolean;
    status: string;
    message?: string;
}

export class CoordinationAgent implements BaseAgent {
    readonly name = 'coordination' as const;
    private notificationAgent: NotificationAgent;

    constructor() {
        this.notificationAgent = new NotificationAgent();
    }

    /**
     * BaseAgent interface — handle incoming appointment-related messages.
     * Routes based on transaction status and message intent.
     */
    async handle(context: AgentContext): Promise<AgentResponse> {
        const { contact, message, currentTransaction } = context;
        const msg = message.toLowerCase();

        logger.info(`[CoordinationAgent] Handling message from ${contact.phone_number}` +
            (currentTransaction ? ` (TX: ${currentTransaction.id.substring(0, 8)}, status: ${currentTransaction.status})` : ''));

        // No transaction → can't coordinate, redirect to sales
        if (!currentTransaction) {
            return {
                action: 'reply',
                reply_script: 'Namaste! To schedule a property visit, I first need to understand your requirements. Could you tell me what type of property you are looking for?',
                quality_hint: 'confident',
                metadata: { redirect_reason: 'no_transaction_for_coordination' },
            };
        }

        // Transaction not yet QUALIFIED → can't schedule visit
        if (currentTransaction.status === 'NEW') {
            return {
                action: 'reply',
                reply_script: "We're still finding the right property for you. Once we match you with a property, we'll help schedule a visit. Is there anything specific about your requirements you'd like to update?",
                quality_hint: 'confident',
            };
        }

        // 2026-05-19 CRITICAL loop fix: the VISIT_SCHEDULED prompt instructs
        // "reply 1 / 2 / 3" but no handler parsed the numbers, so every
        // numeric reply fell through to the default and re-sent the SAME
        // menu forever. Map the menu numbers to intent for the relevant
        // statuses BEFORE the keyword checks.
        const choice = parseMenuChoice(message);
        if (choice && currentTransaction.status === 'VISIT_SCHEDULED') {
            if (choice === 1) return this.handleConfirmMessage(context);
            if (choice === 2) return this.handleRescheduleMessage(context);
            if (choice === 3) return this.handleCancelMessage(context);
        }

        // Handle CONFIRM/RESCHEDULE/CANCEL keywords
        if (msg.includes('confirm') || msg.includes('yes') || msg.includes('haan')) {
            return this.handleConfirmMessage(context);
        }

        if (msg.includes('reschedule') || msg.includes('change time') || msg.includes('badlo')) {
            return this.handleRescheduleMessage(context);
        }

        if (msg.includes('cancel') || msg.includes('nahi')) {
            return this.handleCancelMessage(context);
        }

        // Default: show options based on transaction status
        if (currentTransaction.status === 'VISIT_SCHEDULED') {
            const menu = 'You have a property visit scheduled. Would you like to:\n\n1. *Confirm* your attendance\n2. *Reschedule* to a different time\n3. *Cancel* the visit\n\nJust reply with your choice!';
            if (await lastOutboundWasSameMenu(contact.phone_number, menu)) {
                return escalateStuckMenu(context, menu);
            }
            return { action: 'reply', reply_script: menu, quality_hint: 'confident' };
        }

        if (currentTransaction.status === 'QUALIFIED') {
            // Guard: can't schedule without a supply party linked
            if (!currentTransaction.supply_contact_id) {
                return {
                    action: 'reply',
                    reply_script: "We've found a potential match for you! We're currently coordinating with the property owner. I'll notify you as soon as we can schedule a visit.",
                    quality_hint: 'confident',
                    metadata: { blocked_reason: 'no_supply_contact_linked' },
                };
            }
            return {
                action: 'reply',
                reply_script: "Great news! We've found a property matching your requirements. Would you like to schedule a visit? Just say *\"schedule visit\"* and I'll coordinate with the property owner and our team.",
                quality_hint: 'confident',
            };
        }

        if (currentTransaction.status === 'VISITED') {
            const visitedMenu = "How was the property visit? Would you like to:\n\n1. *Make an offer* on this property\n2. *Schedule another visit* to see it again\n3. *See more properties* that match your criteria\n\nYour feedback helps us find the perfect match!";
            const vChoice = parseMenuChoice(message);
            const lower = msg;
            // Numeric OR word intent → acknowledge + hand to a human (no
            // automated offer/again/see-more flow exists; never loop).
            if (vChoice === 1 || lower.includes('offer')) {
                return escalateStuckMenu(context, visitedMenu).then(r => ({
                    ...r,
                    reply_script: "Great — you'd like to make an offer. 🙌 A team member will call you shortly to take it forward.",
                }));
            }
            if (vChoice === 2 || lower.includes('another visit') || lower.includes('again') || lower.includes('schedule')) {
                return escalateStuckMenu(context, visitedMenu).then(r => ({
                    ...r,
                    reply_script: "Sure — we'll arrange another visit. 🗓️ A team member will coordinate the new time with you shortly.",
                }));
            }
            if (vChoice === 3 || lower.includes('more propert') || lower.includes('see more') || lower.includes('other option')) {
                return {
                    action: 'reply',
                    reply_script: "On it — I'll pull up more properties that match your requirements.",
                    quality_hint: 'confident',
                    metadata: { redirect_to: 'sales', reason: 'visited_see_more' },
                };
            }
            if (await lastOutboundWasSameMenu(contact.phone_number, visitedMenu)) {
                return escalateStuckMenu(context, visitedMenu);
            }
            return { action: 'reply', reply_script: visitedMenu, quality_hint: 'confident' };
        }

        // Fallback
        return {
            action: 'reply',
            reply_script: 'I can help you with your property visit. Please let me know if you want to schedule, confirm, reschedule, or cancel a visit.',
            quality_hint: 'confident',
        };
    }

    private async handleConfirmMessage(context: AgentContext): Promise<AgentResponse> {
        const { currentTransaction, contact } = context;
        if (!currentTransaction) return { action: 'reply', reply_script: 'No active appointment to confirm.' };

        const appointment = await prisma.appointment.findFirst({
            where: { transaction_id: currentTransaction.id, status: { in: ['scheduled', 'rescheduled'] } },
            orderBy: { scheduled_at: 'desc' },
        });

        if (appointment) {
            await this.coordinate({ appointment_id: appointment.id, action: 'confirm_both', initiated_by: contact.phone_number });
            return {
                action: 'reply',
                reply_script: 'Your visit is confirmed! Both parties have been notified. Our team member will accompany you during the visit. See you there!',
                quality_hint: 'confident',
            };
        }

        return { action: 'reply', reply_script: "I don't see a pending visit to confirm. Would you like to schedule a new one?" };
    }

    private async handleRescheduleMessage(context: AgentContext): Promise<AgentResponse> {
        const { currentTransaction, contact } = context;
        if (!currentTransaction) return { action: 'reply', reply_script: 'No active appointment to reschedule.' };

        const appointment = await prisma.appointment.findFirst({
            where: { transaction_id: currentTransaction.id, status: { in: ['scheduled', 'confirmed'] } },
            orderBy: { scheduled_at: 'desc' },
        });

        if (appointment) {
            await this.coordinate({ appointment_id: appointment.id, action: 'handle_reschedule', initiated_by: contact.phone_number });
            return {
                action: 'reply',
                reply_script: 'Reschedule request noted! Our team will coordinate a new time with all parties and get back to you shortly.',
                quality_hint: 'confident',
            };
        }

        return { action: 'reply', reply_script: "I don't see an active visit to reschedule." };
    }

    private async handleCancelMessage(context: AgentContext): Promise<AgentResponse> {
        const { currentTransaction, contact } = context;
        if (!currentTransaction) return { action: 'reply', reply_script: 'No active appointment to cancel.' };

        const appointment = await prisma.appointment.findFirst({
            where: { transaction_id: currentTransaction.id, status: { in: ['scheduled', 'confirmed'] } },
            orderBy: { scheduled_at: 'desc' },
        });

        if (appointment) {
            await this.coordinate({ appointment_id: appointment.id, action: 'handle_cancel', initiated_by: contact.phone_number });
            return {
                action: 'reply',
                reply_script: 'The visit has been cancelled. All parties have been notified. If you change your mind or want to see other properties, just let me know!',
                quality_hint: 'confident',
            };
        }

        return { action: 'reply', reply_script: "I don't see an active visit to cancel." };
    }

    // ─── Programmatic Coordination API (used internally) ──────────

    /**
     * Coordinate between buyer and seller for an appointment.
     */
    async coordinate(request: CoordinationRequest): Promise<CoordinationResult> {
        logger.info(`[CoordinationAgent] Action: ${request.action} for appointment ${request.appointment_id}`);

        try {
            // Fetch appointment with all related data
            const appointment = await prisma.appointment.findUnique({
                where: { id: request.appointment_id },
                include: {
                    contact: true,     // The buyer/tenant
                    property: true,    // The property
                    assigned_to_agent: true, // Internal agent handling
                },
            });

            if (!appointment) {
                logger.warn(`[CoordinationAgent] Appointment ${request.appointment_id} not found`);
                return { success: false, buyer_notified: false, seller_notified: false, status: 'not_found' };
            }

            switch (request.action) {
                case 'notify_seller':
                    return this.notifySeller(appointment);
                case 'notify_buyer':
                    return this.notifyBuyer(appointment);
                case 'confirm_both':
                    return this.confirmBothParties(appointment);
                case 'handle_reschedule':
                    return this.handleReschedule(appointment, request.initiated_by);
                case 'handle_cancel':
                    return this.handleCancel(appointment, request.initiated_by);
                default:
                    return { success: false, buyer_notified: false, seller_notified: false, status: 'unknown_action' };
            }
        } catch (error) {
            logger.error(`[CoordinationAgent] Error:`, error);
            return { success: false, buyer_notified: false, seller_notified: false, status: 'error' };
        }
    }

    /**
     * Notify the property owner/agent about a new site visit request.
     */
    private async notifySeller(appointment: any): Promise<CoordinationResult> {
        const property = appointment.property;
        if (!property) {
            return { success: false, buyer_notified: false, seller_notified: false, status: 'no_property' };
        }

        const sellerPhone = property.owner_phone;
        if (!sellerPhone) {
            return { success: false, buyer_notified: false, seller_notified: false, status: 'no_seller_phone' };
        }

        const date = new Date(appointment.scheduled_at).toLocaleDateString('en-IN', {
            weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
        });
        const time = new Date(appointment.scheduled_at).toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit',
        });

        const msg = `*New Site Visit Request*

Property: ${property.type} in ${property.location || 'TBD'}
Date: ${date}
Time: ${time}
Duration: ${appointment.duration} minutes

A potential ${appointment.contact?.intent === 'rent' ? 'tenant' : 'buyer'} wants to visit your property.
${appointment.assigned_to_agent ? `Our executive ${appointment.assigned_to_agent.name} will coordinate the visit.` : ''}

Reply *CONFIRM* to accept or *RESCHEDULE* to suggest a new time.`;

        await this.notificationAgent.send({ to: sellerPhone, message: msg, channel: 'whatsapp' });
        await this.logCoordinationInteraction(sellerPhone, appointment, 'seller_notified', msg);

        return { success: true, buyer_notified: false, seller_notified: true, status: 'seller_notified' };
    }

    /**
     * Notify the buyer about appointment confirmation.
     */
    private async notifyBuyer(appointment: any): Promise<CoordinationResult> {
        const buyerPhone = appointment.contact_id;
        if (!buyerPhone) {
            return { success: false, buyer_notified: false, seller_notified: false, status: 'no_buyer_phone' };
        }

        const date = new Date(appointment.scheduled_at).toLocaleDateString('en-IN', {
            weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
        });
        const time = new Date(appointment.scheduled_at).toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit',
        });

        const property = appointment.property;
        const msg = `*Visit Confirmed!*

Property: ${property?.type || 'Property'} in ${property?.location || 'TBD'}
Date: ${date}
Time: ${time}
${appointment.location ? `Location: ${appointment.location}` : ''}
${appointment.assigned_to_agent ? `Your Realty Pandit executive: ${appointment.assigned_to_agent.name}` : ''}

Reply *CONFIRM* to confirm your attendance or *RESCHEDULE* if you need to change the time.`;

        await this.notificationAgent.send({ to: buyerPhone, message: msg, channel: 'whatsapp' });
        await this.logCoordinationInteraction(buyerPhone, appointment, 'buyer_notified', msg);

        return { success: true, buyer_notified: true, seller_notified: false, status: 'buyer_notified' };
    }

    /**
     * Send confirmation to both parties + internal executive when appointment is confirmed.
     */
    private async confirmBothParties(appointment: any): Promise<CoordinationResult> {
        let buyerNotified = false;
        let sellerNotified = false;

        const date = new Date(appointment.scheduled_at).toLocaleDateString('en-IN', {
            weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
        });
        const time = new Date(appointment.scheduled_at).toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit',
        });
        const property = appointment.property;

        // Notify buyer (demand party)
        if (appointment.contact_id) {
            const buyerMsg = `*Visit Confirmed by Both Parties!*

Property: ${property?.type || 'Property'} in ${property?.location || 'TBD'}
Date: ${date} at ${time}
${appointment.assigned_to_agent ? `Your Realty Pandit executive ${appointment.assigned_to_agent.name} will accompany you.` : ''}

Both you and the property owner have confirmed. See you there!`;

            await this.notificationAgent.send({ to: appointment.contact_id, message: buyerMsg, channel: 'whatsapp' });
            await this.logCoordinationInteraction(appointment.contact_id, appointment, 'both_confirmed', buyerMsg);
            buyerNotified = true;
        }

        // Notify seller (supply party)
        if (property?.owner_phone) {
            const sellerMsg = `*Visit Confirmed!*

Property: ${property.type} in ${property.location || 'TBD'}
Date: ${date} at ${time}

The ${appointment.contact?.intent === 'rent' ? 'tenant' : 'buyer'} has confirmed. Please ensure the property is ready for viewing.
${appointment.assigned_to_agent ? `Our executive ${appointment.assigned_to_agent.name} will coordinate.` : ''}`;

            await this.notificationAgent.send({ to: property.owner_phone, message: sellerMsg, channel: 'whatsapp' });
            await this.logCoordinationInteraction(property.owner_phone, appointment, 'both_confirmed', sellerMsg);
            sellerNotified = true;
        }

        // Notify internal executive (3rd party — always the middleman)
        if (appointment.assigned_to_agent?.phone) {
            const execMsg = `*Visit Confirmed - Action Required*

Appointment ${appointment.id.substring(0, 8)} is confirmed.
Property: ${property?.type || 'Property'} in ${property?.location || 'TBD'}
Date: ${date} at ${time}
Buyer: ${appointment.contact?.name || appointment.contact_id}
Seller: ${property?.owner_phone || 'N/A'}

Please be present at the property for the visit.`;

            await this.notificationAgent.send({ to: appointment.assigned_to_agent.phone, message: execMsg, channel: 'whatsapp' });
        }

        // Update appointment status
        await prisma.appointment.update({
            where: { id: appointment.id },
            data: { status: 'confirmed', confirmation_received: true },
        });

        // Transition Transaction → VISITED when appointment is confirmed
        // (Visit confirmed by both parties = visit effectively completed/happening)
        if (appointment.transaction_id) {
            try {
                const tx = await prisma.transaction.findUnique({ where: { id: appointment.transaction_id } });
                if (tx && tx.status === 'VISIT_SCHEDULED') {
                    await transitionTransaction(
                        appointment.transaction_id,
                        TransactionStatus.VISITED,
                        'system:coordination_agent',
                        'whatsapp',
                        { trigger: 'appointment_confirmed', appointment_id: appointment.id },
                    );
                    logger.info(`[CoordinationAgent] Transaction ${appointment.transaction_id.substring(0, 8)} → VISITED (appointment confirmed)`);
                }
            } catch (txErr) {
                logger.error('[CoordinationAgent] TX transition to VISITED failed (non-blocking):', txErr);
            }
        }

        return { success: true, buyer_notified: buyerNotified, seller_notified: sellerNotified, status: 'both_confirmed' };
    }

    /**
     * Handle reschedule request from either party.
     */
    private async handleReschedule(appointment: any, initiatedBy?: string): Promise<CoordinationResult> {
        const property = appointment.property;
        const isFromBuyer = initiatedBy === appointment.contact_id;

        const otherPartyPhone = isFromBuyer ? property?.owner_phone : appointment.contact_id;
        const initiatorLabel = isFromBuyer ? 'buyer/tenant' : 'property owner';

        if (otherPartyPhone) {
            const msg = `*Reschedule Request*

The ${initiatorLabel} has requested to reschedule the property visit for:
${property?.type || 'Property'} in ${property?.location || 'TBD'}

Our team will contact you shortly with new time options.`;

            await this.notificationAgent.send({ to: otherPartyPhone, message: msg, channel: 'whatsapp' });
            await this.logCoordinationInteraction(otherPartyPhone, appointment, 'reschedule_requested', msg);
        }

        await prisma.appointment.update({
            where: { id: appointment.id },
            data: {
                status: 'rescheduled',
                notes: `${appointment.notes || ''}\nReschedule requested by ${initiatedBy || 'unknown'} at ${new Date().toISOString()}`,
            },
        });

        // Notify internal executive
        if (appointment.assigned_to_agent?.phone) {
            const agentMsg = `*Reschedule Alert*

Appointment ${appointment.id.substring(0, 8)} needs rescheduling.
${initiatorLabel} requested the change.
Contact: ${initiatedBy || 'unknown'}
Property: ${property?.location || 'TBD'}

Please coordinate new timing with both parties.`;

            await this.notificationAgent.send({ to: appointment.assigned_to_agent.phone, message: agentMsg, channel: 'whatsapp' });
        }

        return {
            success: true,
            buyer_notified: !isFromBuyer,
            seller_notified: isFromBuyer,
            status: 'reschedule_requested',
        };
    }

    /**
     * Handle cancellation from either party.
     */
    private async handleCancel(appointment: any, initiatedBy?: string): Promise<CoordinationResult> {
        const property = appointment.property;
        const isFromBuyer = initiatedBy === appointment.contact_id;
        const otherPartyPhone = isFromBuyer ? property?.owner_phone : appointment.contact_id;
        const initiatorLabel = isFromBuyer ? 'buyer/tenant' : 'property owner';

        if (otherPartyPhone) {
            const msg = `*Visit Cancelled*

The property visit for ${property?.type || 'Property'} in ${property?.location || 'TBD'} has been cancelled by the ${initiatorLabel}.

If you'd like to reschedule, just let us know!`;

            await this.notificationAgent.send({ to: otherPartyPhone, message: msg, channel: 'whatsapp' });
            await this.logCoordinationInteraction(otherPartyPhone, appointment, 'cancelled', msg);
        }

        // Notify internal executive
        if (appointment.assigned_to_agent?.phone) {
            const agentMsg = `*Visit Cancelled*

Appointment ${appointment.id.substring(0, 8)} cancelled by ${initiatorLabel}.
Property: ${property?.location || 'TBD'}
Contact: ${initiatedBy || 'unknown'}`;

            await this.notificationAgent.send({ to: appointment.assigned_to_agent.phone, message: agentMsg, channel: 'whatsapp' });
        }

        await prisma.appointment.update({
            where: { id: appointment.id },
            data: {
                status: 'cancelled',
                notes: `${appointment.notes || ''}\nCancelled by ${initiatedBy || 'unknown'} at ${new Date().toISOString()}`,
            },
        });

        return {
            success: true,
            buyer_notified: !isFromBuyer,
            seller_notified: isFromBuyer,
            status: 'cancelled',
        };
    }

    /**
     * Log coordination interactions to the SSOT Interaction table.
     */
    private async logCoordinationInteraction(
        phone: string, appointment: any, eventType: string, content: string,
    ): Promise<void> {
        try {
            const contact = await prisma.contact.findUnique({ where: { phone_number: phone } });
            if (contact) {
                await prisma.interaction.create({
                    data: {
                        tenant_id: contact.tenant_id,
                        phone_number: phone,
                        channel: 'whatsapp',
                        direction: 'outbound',
                        event_type: `coordination_${eventType}`,
                        content,
                        metadata: { appointment_id: appointment.id },
                    },
                });
            }
        } catch (err) {
            logger.error('[CoordinationAgent] Failed to log interaction:', err);
        }
    }
}
