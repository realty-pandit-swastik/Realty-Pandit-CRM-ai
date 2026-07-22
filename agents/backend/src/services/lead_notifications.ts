/**
 * Lead Notifications Service
 * Sends WhatsApp + email confirmation to buyers on any lead creation (all sources).
 * Also provides ref token utility for property view tracking.
 */

import { WhatsAppService } from './whatsapp';
import { EmailService } from './email_service';
import prisma from '../db';
import logger from '../utils/logger';

const whatsappService = new WhatsAppService();
const emailService = new EmailService();

const WEBSITE_URL = process.env.WEBSITE_URL || 'https://realtypandit.in';

/**
 * Encode a phone number as a base64 ref token for embedding in notification links.
 * Website property pages decode this token to track which lead is viewing.
 */
export function buildRefToken(phone: string): string {
    return Buffer.from(phone).toString('base64');
}

/**
 * Send a WhatsApp confirmation to the buyer immediately after lead creation.
 * Tries template rp_buyer_lead_received first, falls back to plain text.
 * Fire-and-forget safe — never throws.
 */
export async function sendBuyerConfirmationWhatsApp(
    phone: string,
    name: string | null,
    source: string
): Promise<void> {
    const waPhone = phone.replace(/^\+/, '');
    const displayName = name || 'there';
    const refToken = buildRefToken(phone);
    const propertiesLink = `${WEBSITE_URL}/properties?ref=${refToken}`;

    // 2026-07-13: this function was already firing successfully on every intake path
    // (confirmed via winston logs \u2014 dozens/day, ~0 failures) but never logged an
    // Interaction row, so it was invisible to conversation audits and the admin timeline.
    // Both branches below now log one, tagged event_type='lead_welcome' for idempotency
    // checks elsewhere (see shareInventoryCard's welcome-burst guard).
    const logWelcomeInteraction = async (content: string) => {
        try {
            const contact = await prisma.contact.findUnique({ where: { phone_number: phone }, select: { tenant_id: true } });
            await prisma.interaction.create({
                data: {
                    tenant_id: contact?.tenant_id ?? 'default', phone_number: phone, channel: 'whatsapp',
                    direction: 'outbound', event_type: 'lead_welcome', content, metadata: { source },
                },
            });
        } catch (logErr) {
            logger.warn(`[LeadNotify] Failed to log welcome interaction for ${phone}: ${(logErr as Error).message}`);
        }
    };

    try {
        // Try Meta-approved template first (works outside 24h session window)
        await whatsappService.sendTemplate(waPhone, 'rp_buyer_lead_received', {
            name: displayName,
            link: propertiesLink,
        });
        logger.info(`[LeadNotify] Buyer confirmation template sent to ${phone}`);
        await logWelcomeInteraction(`Template: rp_buyer_lead_received (name=${displayName}, link=${propertiesLink})`);
        return;
    } catch (err1) {
        logger.warn(`[LeadNotify] rp_buyer_lead_received template failed for ${phone}: ${(err1 as Error).message}`);
    }

    // Fallback: plain text (always works within 24h session)
    try {
        const message = [
            `*Namaste ${displayName}!*`,
            '',
            `Thank you for your interest in Realty Pandit.`,
            `We have received your property enquiry and our expert Panditji will reach out to you shortly on WhatsApp.`,
            '',
            `*Explore verified properties:*`,
            propertiesLink,
            '',
            `*Schedule a visit:* ${WEBSITE_URL}/schedule-visit`,
            '',
            `\u2013 Team Realty Pandit`,
        ].join('\n');
        await whatsappService.sendText(waPhone, message);
        logger.info(`[LeadNotify] Buyer confirmation plain text sent to ${phone}`);
        await logWelcomeInteraction(message);
    } catch (err2) {
        logger.warn(`[LeadNotify] Buyer WhatsApp failed for ${phone}: ${(err2 as Error).message}`);
    }
}

/**
 * Send an email confirmation to the buyer with property links and CTA buttons.
 * Skips silently if no email provided.
 * Fire-and-forget safe — never throws.
 */
export async function sendBuyerConfirmationEmail(
    email: string,
    name: string | null
): Promise<void> {
    if (!email) return;

    try {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return;

        const { welcomeEmail } = await import('../templates/email_templates');
        const { subject, html } = welcomeEmail(name || 'there');

        await emailService.sendEmail({
            to: email,
            from: 'Realty Pandit <noreply@realtypandit.in>',
            subject,
            html,
        }, tenant.id);

        logger.info(`[LeadNotify] Buyer welcome email sent to ${email}`);
    } catch (err) {
        logger.warn(`[LeadNotify] Buyer email failed for ${email}: ${(err as Error).message}`);
    }
}
