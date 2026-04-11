/**
 * OTP Sender — Dual-channel delivery (WhatsApp + Email)
 * Attempts both channels independently and returns result.
 */

import { WhatsAppService } from './whatsapp';
import { emailService } from './email_service';
import { buildOtpEmailHtml } from './otp_email';
import prisma from '../db';
import logger from '../utils/logger';

interface OtpSendResult {
    whatsappSent: boolean;
    emailSent: boolean;
    anyDelivered: boolean;
    message: string;
}

const whatsappService = new WhatsAppService();

export async function sendOtp(params: {
    phone: string;
    email: string | null | undefined;
    otp: string;
    purpose: 'login' | 'password_reset';
    validMinutes: number;
}): Promise<OtpSendResult> {
    const { phone, email, otp, purpose, validMinutes } = params;
    const waPhone = phone.replace(/^\+/, '');

    const purposeLabel = purpose === 'login' ? 'Agent login' : 'Password reset';

    const waBody = purpose === 'login'
        ? `Your Realty Pandit Agent login code is: *${otp}*\n\nValid for ${validMinutes} minutes. Do not share this code.`
        : `Your Realty Pandit password reset OTP is: *${otp}*\n\nValid for ${validMinutes} minutes. Do not share this with anyone.`;

    let whatsappSent = false;
    let emailSent = false;

    // 1. Attempt WhatsApp (primary)
    try {
        await whatsappService.sendTextStrict(waPhone, waBody);
        whatsappSent = true;
    } catch (err) {
        logger.error(`[OtpSender] WhatsApp failed for ${phone}: ${(err as Error).message}`);
    }

    // 2. Attempt email (secondary) — only if email address exists
    if (email) {
        try {
            const tenant = await prisma.tenant.findFirst();
            if (tenant) {
                const html = buildOtpEmailHtml(otp, `${purposeLabel} verification`, validMinutes);
                await emailService.sendEmail({
                    from: 'Realty Pandit <noreply@realtypandit.in>',
                    to: email,
                    subject: `${otp} is your Realty Pandit ${purposeLabel} OTP`,
                    html,
                }, tenant.id);
                emailSent = true;
            }
        } catch (err) {
            logger.error(`[OtpSender] Email failed for ${email}: ${(err as Error).message}`);
        }
    }

    // 3. Build user-facing message
    const anyDelivered = whatsappSent || emailSent;
    let message: string;
    if (whatsappSent && emailSent) {
        message = 'OTP sent to your WhatsApp and email.';
    } else if (whatsappSent) {
        message = 'OTP sent to your WhatsApp.';
    } else if (emailSent) {
        message = 'OTP sent to your email. (WhatsApp delivery failed)';
    } else {
        message = 'Failed to send OTP. Please try again.';
    }

    logger.info(`[OtpSender] ${phone} — wa:${whatsappSent} email:${emailSent} (${purpose})`);
    return { whatsappSent, emailSent, anyDelivered, message };
}
