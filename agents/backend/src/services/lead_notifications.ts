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

    try {
        // Try Meta-approved template first (works outside 24h session window)
        await whatsappService.sendTemplate(waPhone, 'rp_buyer_lead_received', {
            name: displayName,
            link: propertiesLink,
        });
        logger.info(`[LeadNotify] Buyer confirmation template sent to ${phone}`);
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

        const displayName = name || 'there';

        // We can't get phone from email alone, so no ref token in email CTA
        // Use plain properties URL (the website will show best matches on its own)
        const propertiesUrl = `${WEBSITE_URL}/properties`;
        const scheduleUrl = `${WEBSITE_URL}/schedule-visit`;

        const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #ffffff;">
            <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #10b981;">
                <h1 style="color: #10b981; margin: 0;">Realty Pandit</h1>
                <p style="color: #6b7280; margin: 5px 0 0;">Your Trusted Real Estate Partner</p>
            </div>

            <div style="padding: 30px 0;">
                <h2 style="color: #111827;">Namaste, ${displayName}!</h2>
                <p style="color: #374151; line-height: 1.6;">
                    Thank you for reaching out to Realty Pandit. We have received your property enquiry and our expert <strong>Panditji</strong> will contact you on WhatsApp shortly.
                </p>

                <div style="background: #f0fdf4; border-radius: 8px; padding: 20px; margin: 24px 0; text-align: center;">
                    <p style="color: #065f46; margin: 0 0 16px; font-size: 15px;">
                        While you wait, explore verified properties that match your requirements:
                    </p>
                    <a href="${propertiesUrl}"
                       style="display: inline-block; background: #10b981; color: #ffffff; text-decoration: none;
                              padding: 12px 28px; border-radius: 6px; font-weight: bold; font-size: 15px; margin: 0 8px 8px;">
                        Check Properties
                    </a>
                    <a href="${scheduleUrl}"
                       style="display: inline-block; background: #ffffff; color: #10b981; text-decoration: none;
                              padding: 12px 28px; border-radius: 6px; font-weight: bold; font-size: 15px;
                              border: 2px solid #10b981; margin: 0 8px 8px;">
                        Schedule a Visit
                    </a>
                </div>

                <p style="color: #374151; line-height: 1.6;">
                    Our team of experts is ready to help you find the perfect property. Feel free to reply to this email or contact us on WhatsApp for immediate assistance.
                </p>
            </div>

            <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
                <p>Realty Pandit &mdash; Your Trusted Real Estate Partner</p>
                <p>${WEBSITE_URL}</p>
            </div>
        </div>
        `;

        await emailService.sendEmail({
            to: email,
            from: 'Realty Pandit <info@realtypandit.in>',
            subject: 'We received your property enquiry \u2014 Realty Pandit',
            html,
        }, tenant.id);

        logger.info(`[LeadNotify] Buyer confirmation email sent to ${email}`);
    } catch (err) {
        logger.warn(`[LeadNotify] Buyer email failed for ${email}: ${(err as Error).message}`);
    }
}
