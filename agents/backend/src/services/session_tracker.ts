/**
 * WhatsApp Session Window Tracker
 *
 * Tracks the 24-hour session window per contact. Meta's WhatsApp Business API
 * allows free-form text replies only within 24 hours of the user's last inbound
 * message. Outside this window, only pre-approved templates can be sent.
 *
 * Usage:
 *   // On every inbound WhatsApp message:
 *   await SessionTracker.markInbound(phone);
 *
 *   // Before sending an outbound message:
 *   const active = await SessionTracker.isSessionActive(phone);
 *   if (active) { sendText(...) } else { sendTemplate(...) }
 *
 *   // Or use smartSend for automatic handling:
 *   await SessionTracker.smartSend(whatsapp, phone, freeFormMsg, templateName, params);
 */

import prisma from '../db';
import { WhatsAppService } from './whatsapp';
import logger from '../utils/logger';

const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export class SessionTracker {
    /**
     * Check if we're within the 24h session window for a phone number.
     * Returns true if the user sent us a WhatsApp message within the last 24 hours.
     */
    static async isSessionActive(phone: string): Promise<boolean> {
        try {
            const contact = await prisma.contact.findUnique({
                where: { phone_number: phone },
                select: { last_wa_inbound: true },
            });

            if (!contact?.last_wa_inbound) return false;

            const elapsed = Date.now() - new Date(contact.last_wa_inbound).getTime();
            return elapsed < SESSION_WINDOW_MS;
        } catch (err) {
            logger.warn(`[SessionTracker] Error checking session for ${phone}:`, err);
            return false; // Assume expired on error (safer - will use template)
        }
    }

    /**
     * Update the last inbound WhatsApp timestamp for a contact.
     * Call this from the WhatsApp webhook handler on every inbound message.
     */
    static async markInbound(phone: string): Promise<void> {
        try {
            const r = await prisma.contact.updateMany({
                where: { phone_number: phone },
                data: { last_wa_inbound: new Date() },
            });
            // updateMany matching zero rows is NOT an error — and that silence is exactly how
            // this went unnoticed. webhook_processor fires this un-awaited at the top of the
            // pipeline, BEFORE the contact row exists, so every first-ever inbound matched
            // nothing and the stamp was lost permanently. Contact creation now sets the field
            // directly; this log exists so any remaining gap is visible. (2026-08-07)
            if (r.count === 0) {
                logger.warn(`[SessionTracker] markInbound matched 0 rows for ${phone} (contact not created yet?)`);
            }
        } catch (err) {
            // Non-critical - don't block message processing
            logger.warn(`[SessionTracker] Failed to mark inbound for ${phone}:`, err);
        }
    }

    /**
     * Smart send: automatically chooses between free-form text and Meta template
     * based on the 24h session window status.
     *
     * @param whatsapp - WhatsAppService instance
     * @param to - Phone number in E.164 format
     * @param freeFormMessage - Message to send if within session window
     * @param templateName - Meta template name to use if outside session window
     * @param templateParams - Parameters for the template
     */
    static async smartSend(
        whatsapp: WhatsAppService,
        to: string,
        freeFormMessage: string,
        templateName: string,
        templateParams: Record<string, string> = {},
    ): Promise<void> {
        const active = await this.isSessionActive(to);

        if (active) {
            logger.info(`[SessionTracker] Session active for ${to} - sending free-form text`);
            await whatsapp.sendText(to, freeFormMessage);
        } else {
            logger.info(`[SessionTracker] Session expired for ${to} - sending template "${templateName}"`);
            await whatsapp.sendTemplate(to, templateName, templateParams);
        }
    }
}
