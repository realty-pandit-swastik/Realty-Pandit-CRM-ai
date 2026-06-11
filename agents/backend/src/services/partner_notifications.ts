/**
 * Partner Notifications Service
 * Sends WhatsApp welcome + email with T&C on partner registration
 */

import { WhatsAppService } from './whatsapp';
import { EmailService } from './email_service';
import prisma from '../db';
import logger from '../utils/logger';

const whatsappService = new WhatsAppService();
const emailService = new EmailService();

const WEBSITE_URL = process.env.WEBSITE_URL || 'https://realtypandit.in';

export async function sendPartnerWelcomeWhatsApp(
    phone: string,
    name: string,
    category: string,
    coordinatorName?: string,
    packageType?: string
): Promise<void> {
    const waPhone = phone.replace(/^\+/, '');
    const categoryLabel = category === 'COMPANY' ? 'Company Partner' : 'Individual Partner';
    const packageLabel = packageType === 'ADVANCE_PRO' ? 'Advance Pro (Unlimited)'
        : packageType === 'PRO' ? 'Pro (50 listings)' : 'Free (10 listings)';
    const coordinator = coordinatorName || 'Realty Pandit Team';

    // Try rp_partner_welcome_confirmed (rich template with header + button)
    try {
        await whatsappService.sendTemplate(waPhone, 'rp_partner_welcome_v2', {
            name,
            category: categoryLabel,
            coordinator,
            package: packageLabel
        });
        logger.info(`[PartnerNotify] Welcome confirmed template sent to ${phone}`);
        return;
    } catch (err1) {
        logger.warn(`[PartnerNotify] rp_partner_welcome_confirmed failed for ${phone}: ${(err1 as Error).message}`);
    }

    // Fallback: try rp_partner_registered (simpler template without header/button)
    try {
        await whatsappService.sendTemplate(waPhone, 'rp_partner_registered_v2', {
            name,
            category: categoryLabel,
            coordinator
        });
        logger.info(`[PartnerNotify] Welcome registered template sent to ${phone}`);
        return;
    } catch (err2) {
        logger.warn(`[PartnerNotify] rp_partner_registered failed for ${phone}: ${(err2 as Error).message}`);
    }

    // Final fallback: plain text (always works)
    logger.info(`[PartnerNotify] Using plain text welcome for ${phone}`);
    const message = [
        `*Registration Confirmed!*`,
        '',
        `Namaste *${name}*!`,
        `Your registration as a *${categoryLabel}* on Realty Pandit Partner Network is confirmed.`,
        '',
        `*Your Coordinator:* ${coordinator}`,
        `*Package:* ${packageLabel}`,
        '',
        `*Next Steps:*`,
        `1. Login to your Partner Portal`,
        `2. Upload your property inventory`,
        `3. Start receiving buyer leads`,
        '',
        `*Portal:* ${WEBSITE_URL}/agent/login`,
        `Use this WhatsApp number to receive your login OTP.`,
    ].join('\n');
    await whatsappService.sendText(waPhone, message);
}

export async function sendPartnerWelcomeEmail(
    email: string,
    name: string,
    category: string,
    coordinatorName?: string
): Promise<void> {
    const categoryLabel = category === 'COMPANY' ? 'Company Partner' : 'Individual Partner';
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) return;

    const coordinatorLine = coordinatorName
        ? `Your assigned coordinator is <strong>${coordinatorName}</strong> who will assist you with onboarding.`
        : 'Your assigned coordinator will be in touch shortly.';

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #10b981;">
                <h1 style="color: #10b981; margin: 0;">Realty Pandit</h1>
                <p style="color: #6b7280; margin: 5px 0 0;">Partner Network</p>
            </div>

            <div style="padding: 30px 0;">
                <h2 style="color: #111827;">Welcome, ${name}!</h2>
                <p style="color: #374151; line-height: 1.6;">
                    You have been successfully registered as a <strong>${categoryLabel}</strong> on the Realty Pandit platform.
                </p>
                <p style="color: #374151; line-height: 1.6;">
                    ${coordinatorLine}
                </p>

                <div style="background: #f0fdf4; border-radius: 8px; padding: 20px; margin: 20px 0;">
                    <h3 style="color: #065f46; margin-top: 0;">Getting Started</h3>
                    <ol style="color: #374151; line-height: 1.8;">
                        <li>Login to your <a href="${WEBSITE_URL}/agent/login" style="color: #10b981;">Partner Portal</a></li>
                        <li>Upload your property inventory</li>
                        <li>Start receiving buyer leads automatically</li>
                    </ol>
                </div>

                <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                    <h3 style="color: #111827; margin-top: 0;">Terms & Conditions</h3>
                    <ul style="color: #6b7280; line-height: 1.8; font-size: 13px;">
                        <li>All property listings must be accurate and up-to-date</li>
                        <li>Commission rates are determined on a per-deal basis</li>
                        <li>Partner accounts are subject to verification</li>
                        <li>Realty Pandit reserves the right to suspend accounts violating platform policies</li>
                        <li>Property data shared on the platform remains subject to privacy guidelines</li>
                        <li>Partners are responsible for maintaining valid business registrations</li>
                    </ul>
                </div>

                <p style="color: #374151; line-height: 1.6;">
                    For immediate assistance, reach out via WhatsApp.
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
        subject: 'Welcome to Realty Pandit Partner Network',
        html
    }, tenant.id);
}
