/**
 * Notification Agent — Unified multi-channel notification delivery.
 *
 * Wraps WhatsApp, Email, and Voice services behind a single interface.
 * All other agents call NotificationAgent.send() instead of
 * directly using WhatsAppService/EmailService/VoiceService.
 *
 * Features:
 * - Channel selection (whatsapp, email, voice)
 * - Auto-fallback (WhatsApp fails → try Email)
 * - Delivery logging to Interaction table
 * - Bulk send support for campaigns
 * - Template support for common messages
 */

import { WhatsAppService } from '../services/whatsapp';
import { EmailService } from '../services/email_service';
import { VoiceService } from '../services/voice';
import { SessionTracker } from '../services/session_tracker';
import { isQuietHours } from '../utils/quiet_hours';
import prisma from '../db';
import logger from '../utils/logger';

export type NotificationChannel = 'whatsapp' | 'email' | 'voice';

export interface NotificationPayload {
    to: string;                    // Phone number (WhatsApp/Voice) or email address
    message: string;               // Text content
    channel: NotificationChannel;
    subject?: string;              // For email
    image_url?: string;            // For WhatsApp image messages
    template_name?: string;        // Named template (internal)
    meta_template?: string;        // Meta-approved WhatsApp template name
    meta_params?: Record<string, string>; // Parameters for Meta template
    metadata?: Record<string, any>;
    log_interaction?: boolean;     // Default: true — log to Interaction table
}

export interface BulkNotificationPayload {
    recipients: string[];          // Phone numbers or emails
    message: string;
    channel: NotificationChannel;
    subject?: string;
    campaign_id?: string;
    batch_size?: number;           // Default: 10
    delay_ms?: number;             // Delay between batches (default: 1000ms)
}

export interface NotificationResult {
    success: boolean;
    channel: NotificationChannel;
    recipient: string;
    error?: string;
}

// Common message templates
const TEMPLATES: Record<string, (data: Record<string, any>) => string> = {
    'welcome_buyer': (d) =>
        `Namaste ${d.name || ''}! Welcome to Realty Pandit. I'm Panditji, your AI property assistant. Tell me what you're looking for — type, budget, location — and I'll find the best options for you.`,

    'welcome_seller': (d) =>
        `Namaste ${d.name || ''}! Welcome to Realty Pandit. I'm Panditji. Ready to list your property? Just tell me the type (flat/house/plot), location, and asking price.`,

    'appointment_reminder': (d) =>
        `Reminder: Your property visit for *${d.property || 'property'}* is scheduled at ${d.time || 'TBD'} on ${d.date || 'TBD'}.\n\nReply "confirm" to confirm or "reschedule" to pick a new time.`,

    'follow_up': (d) =>
        `Hi ${d.name || ''}! Just checking in — are you still looking for a ${d.property_type || 'property'} in ${d.location || 'your preferred area'}? Reply and I'll show you the latest options.`,

    'new_listing_alert': (d) =>
        `New listing alert! A *${d.type || 'property'}* is now available in *${d.location || 'your area'}* for ${d.price || 'a great price'}. Reply "details" to know more.`,

    'security_alert': (d) =>
        `Security Alert: ${d.detail || 'Unusual activity detected'}. Please review in admin panel.`,

    'daily_report': (d) =>
        `Daily Report: ${d.messages || 0} messages, ${d.leads || 0} new leads, ${d.properties || 0} active properties. Avg AI quality: ${d.avg_score || 'N/A'}/10.`,

    // ─── Transaction Templates ───────────────────────────────

    'tx_created_demand': (d) =>
        `Namaste ${d.demand_name || ''}! Your property search is registered with Realty Pandit. ${d.executive_name ? `${d.executive_name} from our team is assigned to help you.` : 'Our team will assist you.'} We'll find the best ${d.type === 'RENT' ? 'rental' : ''} options for you!`,

    'tx_created_executive': (d) =>
        `*New Lead Assigned*\n\nBuyer: ${d.demand_name || d.demand_phone}\nLooking for: ${d.property_type || 'Any'} in ${d.location || 'TBD'}\nBudget: ${d.budget || 'Not specified'}\nType: ${d.type === 'RENT' ? 'Rent' : 'Sale'}\nSource: ${d.source}\n\nPlease follow up within 24 hours.`,

    'tx_matched_demand': (d) =>
        `Great news! We found a property matching your requirements:\n\n*${d.property_type || 'Property'}* in ${d.location || 'your area'}\nPrice: ${d.price || 'Contact for price'}\n\nWould you like to schedule a visit? Reply *"schedule visit"*`,

    'tx_matched_supply': (d) =>
        `Good news! A potential ${d.type === 'RENT' ? 'tenant' : 'buyer'} is interested in your property at ${d.location || 'your listing'}.\n\n${d.executive_name ? `${d.executive_name} from our team will coordinate.` : 'Our team will coordinate.'}\n\nWe'll notify you when a visit is scheduled.`,

    'tx_matched_executive': (d) =>
        `*Match Found*\n\nTransaction: ${d.tx_id}\nDemand: ${d.demand_name || d.demand_phone}\nSupply: ${d.supply_name || d.supply_phone}\nProperty: ${d.property_type || 'N/A'} in ${d.location || 'TBD'}\n\nPlease coordinate next steps.`,

    'tx_visit_demand': (d) =>
        `*Property Visit Scheduled*\n\nProperty: ${d.property_type || 'Property'} in ${d.location || 'TBD'}\nDate: ${d.date}\nTime: ${d.time}\n${d.executive_name ? `Your Realty Pandit executive: ${d.executive_name}` : ''}\n\nReply *CONFIRM* to confirm attendance.`,

    'tx_visit_supply': (d) =>
        `*Property Visit Scheduled*\n\nYour property at ${d.location || 'your listing'}\nDate: ${d.date}\nTime: ${d.time}\n\nA potential ${d.type === 'RENT' ? 'tenant' : 'buyer'} will visit. ${d.executive_name ? `${d.executive_name} from our team will be present.` : ''}\n\nPlease ensure the property is ready.`,

    'tx_visit_executive': (d) =>
        `*Visit Assigned*\n\nProperty: ${d.location || 'TBD'}\nDate: ${d.date} at ${d.time}\nBuyer: ${d.demand_name || d.demand_phone}\nSeller: ${d.supply_name || d.supply_phone}\n\nPlease be present at the property.`,

    'tx_closed_won': (d) =>
        `Congratulations! The deal for ${d.property_type || 'property'} in ${d.location || 'your area'} is closed successfully${d.price ? ` at ${d.price}` : ''}!\n\nThank you for choosing Realty Pandit. If you know anyone looking for property, we'd love to help them too!`,

    'tx_closed_lost': (d) =>
        `The inquiry for ${d.property_type || 'property'} in ${d.location || 'your area'} has been closed.\n\n${d.reason || ''}\n\nIf you'd like to explore other options in the future, just message us anytime!`,

    'tx_executive_reassigned': (d) =>
        `Hi ${d.party_name || ''}! Your Realty Pandit contact has been updated. ${d.new_executive_name} will now assist you with your property ${d.type === 'RENT' ? 'rental' : 'purchase'}. Feel free to reach out anytime!`,
};

export class NotificationAgent {
    private whatsappService: WhatsAppService;
    private emailService: EmailService;
    private voiceService: VoiceService;

    constructor() {
        this.whatsappService = new WhatsAppService();
        this.emailService = new EmailService();
        this.voiceService = new VoiceService();
    }

    /**
     * Send a notification via the specified channel.
     * Logs to Interaction table by default.
     */
    async send(payload: NotificationPayload): Promise<NotificationResult> {
        const { to, channel, log_interaction = true } = payload;

        // Quiet hours guard: block external WhatsApp sends during 9 PM – 8 AM IST
        // Internal management alerts (log_interaction: false) are exempt
        if (channel === 'whatsapp' && isQuietHours() && log_interaction) {
            const contact = await prisma.contact.findUnique({
                where: { phone_number: to },
                select: { contact_type: true },
            });
            if (contact?.contact_type !== 'MANAGEMENT') {
                logger.info(`[NotificationAgent] Quiet hours — skipping WhatsApp to external user ${to}`);
                return { success: false, channel, recipient: to, error: 'Quiet hours (9PM-8AM IST)' };
            }
        }

        // Resolve template if specified
        let message = payload.message;
        if (payload.template_name && TEMPLATES[payload.template_name]) {
            message = TEMPLATES[payload.template_name](payload.metadata || {});
        }

        logger.info(`[NotificationAgent] Sending via ${channel} to ${to}`);

        try {
            switch (channel) {
                case 'whatsapp':
                    if (payload.image_url) {
                        await this.whatsappService.sendImage(to, payload.image_url, message);
                    } else if (payload.meta_template) {
                        // Use Meta-approved template (session-aware)
                        await SessionTracker.smartSend(
                            this.whatsappService,
                            to,
                            message,
                            payload.meta_template,
                            payload.meta_params || {},
                        );
                    } else {
                        await this.whatsappService.sendText(to, message);
                    }
                    break;

                case 'email':
                    await this.emailService.sendEmail({
                        from: 'Panditji <info@realtypandit.in>',
                        to: to,
                        subject: payload.subject || 'Realty Pandit',
                        body: message,
                    }, process.env.DEFAULT_TENANT_ID || '');
                    break;

                case 'voice':
                    await this.voiceService.makeOutboundCall(to, message);
                    break;
            }

            // Log interaction
            if (log_interaction) {
                this.logInteraction(to, channel, message, 'outbound').catch(err => {
                    logger.error('[NotificationAgent] Interaction log failed:', err);
                });
            }

            return { success: true, channel, recipient: to };

        } catch (error: any) {
            logger.error(`[NotificationAgent] ${channel} delivery failed to ${to}:`, error);

            // Auto-fallback: WhatsApp fails → try email if we have an email
            if (channel === 'whatsapp' && payload.metadata?.email) {
                logger.info(`[NotificationAgent] Falling back to email for ${to}`);
                return this.send({
                    ...payload,
                    to: payload.metadata.email,
                    channel: 'email',
                    metadata: { ...payload.metadata, fallback_from: 'whatsapp' },
                });
            }

            return { success: false, channel, recipient: to, error: error.message };
        }
    }

    /**
     * Send a notification using a named template.
     */
    async sendTemplate(
        to: string,
        channel: NotificationChannel,
        templateName: string,
        data: Record<string, any>,
    ): Promise<NotificationResult> {
        if (!TEMPLATES[templateName]) {
            logger.warn(`[NotificationAgent] Template "${templateName}" not found`);
            return { success: false, channel, recipient: to, error: `Template "${templateName}" not found` };
        }

        const message = TEMPLATES[templateName](data);
        return this.send({ to, channel, message, metadata: data });
    }

    /**
     * Bulk send notifications (for campaigns/broadcasts).
     * Sends in batches with delay to avoid rate limits.
     */
    async sendBulk(payload: BulkNotificationPayload): Promise<{
        total: number;
        sent: number;
        failed: number;
        results: NotificationResult[];
    }> {
        const { recipients, message, channel, subject, batch_size = 10, delay_ms = 1000, campaign_id } = payload;
        const results: NotificationResult[] = [];
        let sent = 0;
        let failed = 0;

        logger.info(`[NotificationAgent] Bulk send: ${recipients.length} recipients via ${channel}`);

        for (let i = 0; i < recipients.length; i += batch_size) {
            const batch = recipients.slice(i, i + batch_size);

            const batchResults = await Promise.allSettled(
                batch.map(to => this.send({
                    to,
                    message,
                    channel,
                    subject,
                    metadata: { campaign_id, batch_index: Math.floor(i / batch_size) },
                })),
            );

            for (const result of batchResults) {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                    if (result.value.success) sent++;
                    else failed++;
                } else {
                    failed++;
                    results.push({ success: false, channel, recipient: 'unknown', error: result.reason?.message });
                }
            }

            // Delay between batches to avoid rate limits
            if (i + batch_size < recipients.length) {
                await new Promise(resolve => setTimeout(resolve, delay_ms));
            }
        }

        logger.info(`[NotificationAgent] Bulk send complete: ${sent} sent, ${failed} failed`);

        // Update campaign stats if campaign_id provided
        if (campaign_id) {
            this.updateCampaignStats(campaign_id, sent, failed).catch(err => {
                logger.error('[NotificationAgent] Campaign stats update failed:', err);
            });
        }

        return { total: recipients.length, sent, failed, results };
    }

    /**
     * Send to all management contacts (for alerts/reports).
     */
    async notifyAdmins(message: string, channel: NotificationChannel = 'whatsapp'): Promise<void> {
        try {
            const admins = await prisma.contact.findMany({
                where: { contact_type: 'MANAGEMENT' },
            });

            for (const admin of admins) {
                await this.send({
                    to: admin.phone_number,
                    message,
                    channel,
                    log_interaction: false,
                });
            }

            logger.info(`[NotificationAgent] Notified ${admins.length} admin(s)`);
        } catch (error) {
            logger.error('[NotificationAgent] Admin notification failed:', error);
        }
    }

    /**
     * Notify all 3 parties of a Transaction (demand + supply + executive).
     * Uses role-appropriate templates: buyer doesn't see seller's phone, and vice versa.
     */
    async notifyTransactionParties(
        transaction: {
            id: string;
            type: string;
            demand_contact_id: string;
            supply_contact_id?: string | null;
            executive_agent_id?: string | null;
            demand_location?: string | null;
            demand_property_type?: string | null;
        },
        templatePrefix: string,
        extraData?: Record<string, any>,
    ): Promise<void> {
        try {
            // Fetch party details
            const demandContact = await prisma.contact.findUnique({
                where: { phone_number: transaction.demand_contact_id },
                select: { name: true, phone_number: true },
            });

            let supplyContact: any = null;
            if (transaction.supply_contact_id) {
                supplyContact = await prisma.contact.findUnique({
                    where: { phone_number: transaction.supply_contact_id },
                    select: { name: true, phone_number: true },
                });
            }

            let executive: any = null;
            if (transaction.executive_agent_id) {
                executive = await prisma.agent.findUnique({
                    where: { id: transaction.executive_agent_id },
                    select: { name: true, phone: true },
                });
            }

            const baseData = {
                tx_id: transaction.id.substring(0, 8),
                type: transaction.type,
                location: transaction.demand_location,
                property_type: transaction.demand_property_type,
                demand_name: demandContact?.name,
                demand_phone: transaction.demand_contact_id,
                supply_name: supplyContact?.name,
                supply_phone: transaction.supply_contact_id,
                executive_name: executive?.name,
                ...extraData,
            };

            // Notify demand party (buyer/tenant)
            const demandTemplate = `${templatePrefix}_demand`;
            if (TEMPLATES[demandTemplate]) {
                await this.send({
                    to: transaction.demand_contact_id,
                    message: TEMPLATES[demandTemplate](baseData),
                    channel: 'whatsapp',
                });
            }

            // Notify supply party (seller/landlord) — only if linked
            if (transaction.supply_contact_id) {
                const supplyTemplate = `${templatePrefix}_supply`;
                if (TEMPLATES[supplyTemplate]) {
                    await this.send({
                        to: transaction.supply_contact_id,
                        message: TEMPLATES[supplyTemplate](baseData),
                        channel: 'whatsapp',
                    });
                }
            }

            // Notify internal executive — always
            if (executive?.phone) {
                const execTemplate = `${templatePrefix}_executive`;
                if (TEMPLATES[execTemplate]) {
                    await this.send({
                        to: executive.phone,
                        message: TEMPLATES[execTemplate](baseData),
                        channel: 'whatsapp',
                    });
                }
            }

            logger.info(`[NotificationAgent] Transaction parties notified: ${templatePrefix} for TX ${transaction.id.substring(0, 8)}`);
        } catch (error) {
            logger.error('[NotificationAgent] notifyTransactionParties failed:', error);
        }
    }

    /**
     * Get list of available templates.
     */
    getAvailableTemplates(): string[] {
        return Object.keys(TEMPLATES);
    }

    /**
     * Log outbound notification as an Interaction.
     */
    private async logInteraction(to: string, channel: string, content: string, direction: string): Promise<void> {
        // Check if contact exists (required for FK)
        const contact = await prisma.contact.findUnique({
            where: { phone_number: to },
            select: { tenant_id: true },
        });

        if (!contact) return; // Don't log for non-contacts (e.g., email-only)

        await prisma.interaction.create({
            data: {
                tenant_id: contact.tenant_id,
                phone_number: to,
                channel,
                direction,
                event_type: 'notification',
                content: content.substring(0, 500),
            },
        });
    }

    /**
     * Update campaign delivery stats.
     */
    private async updateCampaignStats(campaignId: string, sent: number, failed: number): Promise<void> {
        await prisma.campaign.update({
            where: { id: campaignId },
            data: {
                sent_count: { increment: sent },
                delivered: { increment: sent },
                status: 'completed',
                completed_at: new Date(),
            },
        });
    }
}
