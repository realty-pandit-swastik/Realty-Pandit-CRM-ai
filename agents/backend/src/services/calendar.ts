import prisma from '../db';
import { WhatsAppService } from './whatsapp';
import { CoordinationAgent } from '../agents/coordination_agent';
import logger from '../utils/logger';

export class CalendarService {
    private whatsappService: WhatsAppService;
    private coordinationAgent: CoordinationAgent;

    constructor() {
        this.whatsappService = new WhatsAppService();
        this.coordinationAgent = new CoordinationAgent();
    }

    /**
     * Send WhatsApp reminder for appointment
     */
    async sendAppointmentReminder(appointmentId: string): Promise<boolean> {
        try {
            const appointment = await prisma.appointment.findUnique({
                where: { id: appointmentId },
                include: {
                    contact: true,
                    property: true,
                    assigned_to_agent: true,
                },
            });

            if (!appointment) {
                logger.error(`[Calendar] Appointment not found: ${appointmentId}`);
                return false;
            }

            // Format date and time
            const scheduledDate = new Date(appointment.scheduled_at);
            const dateStr = scheduledDate.toLocaleDateString('en-IN', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
            const timeStr = scheduledDate.toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
            });

            // Build message based on appointment type
            let message = `🗓️ *Appointment Confirmed*\n\n`;

            if (appointment.type === 'property_visit') {
                message += `📍 *Property Visit*\n`;
                if (appointment.property) {
                    message += `Property: ${appointment.property.type} in ${appointment.property.location}\n`;
                    message += `Price: ₹${appointment.property.price}\n`;
                }
            } else {
                message += `📞 *${this.formatAppointmentType(appointment.type)}*\n`;
            }

            message += `\n`;
            message += `📅 Date: ${dateStr}\n`;
            message += `⏰ Time: ${timeStr}\n`;

            if (appointment.location) {
                message += `📍 Location: ${appointment.location}\n`;
            }

            if (appointment.assigned_to_agent) {
                message += `👤 Contact Person: ${appointment.assigned_to_agent.name}\n`;
                if (appointment.assigned_to_agent.phone) {
                    message += `📱 Phone: ${appointment.assigned_to_agent.phone}\n`;
                }
            }

            if (appointment.description) {
                message += `\n📝 Note: ${appointment.description}\n`;
            }

            message += `\n✅ Please reply "Confirm" to confirm this appointment or "Reschedule" if you need to change the time.\n`;
            message += `\n- Panditji 🙏`;

            // Send WhatsApp message (Meta-approved utility template for business-initiated)
            const agentName = appointment.assigned_to_agent?.name || 'Our team';
            const agentPhone = appointment.assigned_to_agent?.phone || '';
            await this.whatsappService.sendTemplate(appointment.contact_id, 'rp_appointment_confirm', {
                type: appointment.property?.type || 'Property',
                location: appointment.property?.location || 'TBD',
                date: dateStr,
                time: timeStr,
                contact_info: agentPhone ? `${agentName} (${agentPhone})` : agentName,
            });

            // Update appointment to mark reminder sent
            await prisma.appointment.update({
                where: { id: appointmentId },
                data: {
                    reminder_sent: true,
                    reminder_sent_at: new Date(),
                },
            });

            logger.info(`[Calendar] Reminder sent for appointment: ${appointmentId}`);
            return true;
        } catch (error) {
            logger.error(`[Calendar] Failed to send reminder:`, error);
            return false;
        }
    }

    /**
     * Send appointment confirmation when user replies "confirm"
     */
    async confirmAppointment(appointmentId: string): Promise<boolean> {
        try {
            const appointment = await prisma.appointment.update({
                where: { id: appointmentId },
                data: {
                    status: 'confirmed',
                    confirmation_received: true,
                },
                include: {
                    contact: true,
                },
            });

            const message = `✅ *Appointment Confirmed!*\n\nThank you for confirming. We'll see you at the scheduled time.\n\nLooking forward to helping you find your perfect property! 🏡\n\n- Panditji 🙏`;

            await this.whatsappService.sendText(appointment.contact_id, message);

            // Log interaction
            await prisma.interaction.create({
                data: {
                    tenant_id: appointment.tenant_id,
                    phone_number: appointment.contact_id,
                    channel: 'whatsapp',
                    direction: 'outbound',
                    event_type: 'appointment_confirmed',
                    content: message,
                },
            });

            // Notify both parties via CoordinationAgent (fire-and-forget)
            this.coordinationAgent.coordinate({
                appointment_id: appointmentId,
                action: 'confirm_both',
            }).catch(err => logger.error('[Calendar] Coordination confirm_both failed:', err));

            return true;
        } catch (error) {
            logger.error(`[Calendar] Failed to confirm appointment:`, error);
            return false;
        }
    }

    /**
     * Handle reschedule request
     */
    async requestReschedule(appointmentId: string): Promise<boolean> {
        try {
            const appointment = await prisma.appointment.findUnique({
                where: { id: appointmentId },
                include: {
                    contact: true,
                    assigned_to_agent: true,
                },
            });

            if (!appointment) return false;

            const message = `📅 *Reschedule Request Received*\n\nNo problem! Our team will contact you shortly to find a better time.\n\nYou can also call us directly at ${appointment.assigned_to_agent?.phone || 'our office'} to reschedule.\n\n- Panditji 🙏`;

            await this.whatsappService.sendText(appointment.contact_id, message);

            // Update status
            await prisma.appointment.update({
                where: { id: appointmentId },
                data: { status: 'rescheduled' },
            });

            // Log interaction
            await prisma.interaction.create({
                data: {
                    tenant_id: appointment.tenant_id,
                    phone_number: appointment.contact_id,
                    channel: 'whatsapp',
                    direction: 'inbound',
                    event_type: 'reschedule_requested',
                    content: 'User requested to reschedule appointment',
                },
            });

            // Notify other party via CoordinationAgent (fire-and-forget)
            this.coordinationAgent.coordinate({
                appointment_id: appointmentId,
                action: 'handle_reschedule',
                initiated_by: appointment.contact_id,
            }).catch(err => logger.error('[Calendar] Coordination handle_reschedule failed:', err));

            return true;
        } catch (error) {
            logger.error(`[Calendar] Failed to handle reschedule:`, error);
            return false;
        }
    }

    /**
     * Send reminder 24 hours before appointment
     */
    async send24HourReminder(appointmentId: string): Promise<boolean> {
        try {
            const appointment = await prisma.appointment.findUnique({
                where: { id: appointmentId },
                include: {
                    contact: true,
                    property: true,
                },
            });

            if (!appointment || appointment.status === 'cancelled') {
                return false;
            }

            const scheduledDate = new Date(appointment.scheduled_at);
            const dateStr = scheduledDate.toLocaleDateString('en-IN', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
            });
            const timeStr = scheduledDate.toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
            });

            // Send 24h reminder via Meta-approved template
            await this.whatsappService.sendTemplate(appointment.contact_id, 'rp_appointment_reminder', {
                title: appointment.title || 'Property Visit',
                date: dateStr,
                time: timeStr,
            });

            logger.info(`[Calendar] 24-hour reminder sent for appointment: ${appointmentId}`);
            return true;
        } catch (error) {
            logger.error(`[Calendar] Failed to send 24-hour reminder:`, error);
            return false;
        }
    }

    /**
     * @deprecated use createPropertyVisitAppointment — kept as a thin alias so
     * existing chat/WhatsApp callers keep working unchanged.
     */
    async createFromChat(data: {
        contact_id: string;
        property_id: string;
        scheduled_at: Date;
        source: string;
        sessionId?: string;
    }): Promise<any> {
        return this.createPropertyVisitAppointment(data);
    }

    /**
     * Create a property-visit Appointment (the canonical CRM model the
     * lead-detail Visits tab + employee calendar read). Used by the website
     * form, website chat, WhatsApp and buyer adapters.
     * See docs/plans/2026-05-17-website-visit-not-visible-in-crm.md
     */
    async createPropertyVisitAppointment(data: {
        contact_id: string;
        property_id: string;
        scheduled_at: Date;
        source: string;
        sessionId?: string;
        /** Override the coordinating agent (website lead routing). Defaults to the property's agent. */
        assigned_to_agent_id?: string;
        /** Deal link — when set, find-or-update the deal's open (e.g. provisional 'requested') appointment instead of creating a duplicate. */
        transaction_id?: string;
    }): Promise<any> {
        try {
            const { contact_id, property_id, scheduled_at, source, sessionId } = data;

            // Get property details
            const property = await prisma.inventory.findUnique({
                where: { id: property_id },
                include: {
                    owner: true,
                },
            });

            if (!property) {
                throw new Error('Property not found');
            }

            // Calculate end_time (default 30 minutes)
            const endTime = new Date(scheduled_at.getTime() + 30 * 60000);

            // Determine assigned agent — caller override (website lead routing) wins,
            // else fall back to the property's assigned agent.
            let assigned_to_agent_id = data.assigned_to_agent_id ?? property.assigned_agent_id;

            // Get tenant
            const tenant = await prisma.tenant.findFirst();
            if (!tenant) {
                throw new Error('No tenant found');
            }

            // Create OR slot-fill the appointment. If the deal already has an open appointment
            // (e.g. the provisional 'requested' one from the Schedule-Visit card tap), UPDATE that
            // row with the real slot + status 'scheduled' instead of creating a duplicate. (QUALIFIED-1)
            const baseData = {
                title: `Property Visit - ${property.type} in ${property.location}`,
                description: `Visit scheduled via ${source}`,
                type: 'property_visit' as const,
                scheduled_at,
                duration: 30,
                end_time: endTime,
                assigned_to_agent_id,
                property_id,
                location: property.location || undefined,
                source,
                channel: source.startsWith('website') ? 'website' : 'whatsapp',
                status: 'scheduled' as const,
                tenant_id: tenant.id,
            };
            const existingAppt = data.transaction_id
                ? await prisma.appointment.findFirst({
                    where: { transaction_id: data.transaction_id, status: { notIn: ['cancelled', 'completed', 'no_show'] } },
                    orderBy: { created_at: 'desc' }, select: { id: true, metadata: true },
                })
                : null;
            const appointment = existingAppt
                ? await prisma.appointment.update({
                    where: { id: existingAppt.id },
                    data: { ...baseData, metadata: { ...((existingAppt.metadata as any) || {}), awaiting_slot: false } },
                    include: { contact: true, property: true, assigned_to_agent: true },
                })
                : await prisma.appointment.create({
                    data: { ...baseData, contact_id, transaction_id: data.transaction_id, metadata: sessionId ? { sessionId } : undefined },
                    include: { contact: true, property: true, assigned_to_agent: true },
                });

            // Send WhatsApp confirmation to buyer
            await this.sendAppointmentReminder(appointment.id);

            // Notify seller/owner via CoordinationAgent (fire-and-forget)
            this.coordinationAgent.coordinate({
                appointment_id: appointment.id,
                action: 'notify_seller',
            }).catch(err => logger.error('[Calendar] Coordination notify_seller failed:', err));

            // Notify super_boss about the appointment (fire-and-forget)
            this.notifySuperBoss(appointment).catch(err =>
                logger.error('[Calendar] Super boss notification failed:', err)
            );

            // P3: mirror to the assigned member's own Google Calendar if they
            // connected Google (opt-in, idempotent). The 5-min reconcile sweep
            // also covers this + every other appointment.create site.
            import('./google_sync')
                .then(m => m.pushAppointmentToGoogle(appointment.id))
                .catch(err => logger.error('[Calendar] google_sync appt hook error:', err));

            // Notify assigned lead agent if different from property agent (fire-and-forget)
            this.notifyLeadAgent(appointment).catch(err =>
                logger.error('[Calendar] Lead agent notification failed:', err)
            );

            // Send Meta Conversions API event (fire-and-forget)
            import('../services/meta_conversions').then(({ trackVisitScheduled }) => {
                const propertyInfo = property ? `${property.type} in ${property.location || 'TBD'}` : 'property';
                trackVisitScheduled(contact_id, propertyInfo).catch(() => {});
            }).catch(() => {});

            // Send appointment confirmation email (fire-and-forget)
            if (appointment.contact?.email) {
                import('../templates/email_templates').then(({ appointmentEmail }) => {
                    const dateStr = new Date(scheduled_at).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                    const timeStr = new Date(scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                    const propInfo = property ? `${property.type} in ${property.location || 'TBD'}` : 'Property';
                    const agentName = appointment.assigned_to_agent?.name;
                    const { subject, html } = appointmentEmail(appointment.contact.name || 'there', dateStr, timeStr, propInfo, agentName);
                    import('./email_service').then(({ emailService: es }) => {
                        const tenant_id = appointment.tenant_id;
                        es.sendEmail({ to: appointment.contact.email, from: 'Realty Pandit <noreply@realtypandit.in>', subject, html }, tenant_id)
                            .catch(err => logger.warn('[Calendar] Appointment email failed:', (err as Error).message));
                    }).catch(() => {});
                }).catch(() => {});
            }

            return appointment;
        } catch (error) {
            logger.error(`[Calendar] Failed to create appointment from chat:`, error);
            throw error;
        }
    }

    /**
     * Format appointment type for display
     */
    private formatAppointmentType(type: string): string {
        const typeMap: { [key: string]: string } = {
            property_visit: 'Property Visit',
            follow_up_call: 'Follow-up Call',
            meeting: 'Meeting',
            site_visit: 'Site Visit',
            documentation: 'Documentation',
            negotiation: 'Negotiation',
            contract_signing: 'Contract Signing',
            handover: 'Property Handover',
            other: 'Appointment',
        };

        return typeMap[type] || type;
    }

    /**
     * Get upcoming appointments for a contact
     */
    async getUpcomingForContact(phone_number: string, limit: number = 5): Promise<any[]> {
        try {
            const now = new Date();

            const appointments = await prisma.appointment.findMany({
                where: {
                    contact_id: phone_number,
                    scheduled_at: {
                        gte: now,
                    },
                    status: {
                        notIn: ['cancelled', 'completed'],
                    },
                },
                include: {
                    property: {
                        select: {
                            id: true,
                            location: true,
                            type: true,
                            price: true,
                        },
                    },
                    assigned_to_agent: {
                        select: {
                            name: true,
                            phone: true,
                        },
                    },
                },
                orderBy: {
                    scheduled_at: 'asc',
                },
                take: limit,
            });

            return appointments;
        } catch (error) {
            logger.error(`[Calendar] Failed to get upcoming appointments:`, error);
            return [];
        }
    }

    /**
     * Notify super_boss about a new appointment (summary, no client phone).
     */
    private async notifySuperBoss(appointment: any): Promise<void> {
        const superBoss = await prisma.agent.findFirst({
            where: { role: 'super_boss', status: 'active' },
            select: { id: true, phone: true, email: true, name: true },
        });
        if (!superBoss?.phone) return;

        const date = new Date(appointment.scheduled_at).toLocaleDateString('en-IN', {
            weekday: 'short', day: 'numeric', month: 'short',
        });
        const time = new Date(appointment.scheduled_at).toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit',
        });
        const propertyInfo = appointment.property
            ? `${appointment.property.type} in ${appointment.property.location || 'TBD'}`
            : 'a property';
        const agentName = appointment.assigned_to_agent?.name || 'Unassigned';

        const { notify } = await import('./notify');
        await notify('appointment_created', [
            { id: superBoss.id, type: 'agent', phone: superBoss.phone, email: superBoss.email || undefined, name: superBoss.name },
        ], {
            property_info: propertyInfo,
            date,
            time,
            agent_name: agentName,
            client_name: appointment.contact?.name || 'Client',
        });
    }

    /**
     * Notify the assigned lead agent (if different from property's assigned agent).
     */
    private async notifyLeadAgent(appointment: any): Promise<void> {
        const contact = appointment.contact;
        if (!contact?.assigned_agent_id) return;

        // Skip if lead agent is the same as property agent
        if (contact.assigned_agent_id === appointment.assigned_to_agent_id) return;

        const leadAgent = await prisma.agent.findUnique({
            where: { id: contact.assigned_agent_id },
            select: { id: true, phone: true, email: true, name: true },
        });
        if (!leadAgent?.phone) return;

        const date = new Date(appointment.scheduled_at).toLocaleDateString('en-IN', {
            weekday: 'short', day: 'numeric', month: 'short',
        });
        const time = new Date(appointment.scheduled_at).toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit',
        });
        const propertyInfo = appointment.property
            ? `${appointment.property.type} in ${appointment.property.location || 'TBD'}`
            : 'a property';

        const { notify } = await import('./notify');
        await notify('appointment_created', [
            { id: leadAgent.id, type: 'agent', phone: leadAgent.phone, email: leadAgent.email || undefined, name: leadAgent.name },
        ], {
            property_info: propertyInfo,
            date,
            time,
            client_name: contact.name || contact.phone_number,
            client_phone: contact.phone_number,
        });
    }
}
