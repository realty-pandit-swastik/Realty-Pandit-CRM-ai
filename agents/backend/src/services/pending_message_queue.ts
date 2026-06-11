/**
 * Pending Message Queue - For LLM-generated messages awaiting session re-open.
 *
 * When the AI wants to send a personalized follow-up message but the 24h session
 * window has expired, we:
 * 1. Send a Meta-approved "re-opener" template (rp_reopen_session)
 * 2. Queue the LLM message in the PendingMessage table
 * 3. When the user replies (re-opening the session), deliver the queued message
 *
 * Messages auto-expire after 48h if the user doesn't reply.
 */

import prisma from '../db';
import { WhatsAppService } from './whatsapp';
import { isQuietHours } from '../utils/quiet_hours';
import logger from '../utils/logger';

const PENDING_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours

export class PendingMessageQueue {
    /**
     * Queue a message for delivery when user re-opens the session.
     * Also sends the re-opener template immediately.
     */
    static async queueAndReopen(
        whatsapp: WhatsAppService,
        phone: string,
        message: string,
        context: string = 'followup',
    ): Promise<void> {
        try {
            // 1. Always queue the message (regardless of quiet hours)
            await prisma.pendingMessage.create({
                data: {
                    phone_number: phone,
                    message,
                    context,
                    status: 'pending',
                    expires_at: new Date(Date.now() + PENDING_EXPIRY_MS),
                },
            });

            // 2. Don't send re-opener template during quiet hours (9PM-8AM IST)
            if (isQuietHours()) {
                logger.info(`[PendingQueue] Quiet hours — queued message for ${phone}, re-opener deferred`);
                return;
            }

            // 3. Send the re-opener template
            const contact = await prisma.contact.findUnique({
                where: { phone_number: phone },
                select: { name: true, contact_type: true },
            });

            const contextLabel = contact?.contact_type === 'LANDLORD' ? 'listing' : 'search';

            await whatsapp.sendTemplate(phone, 'rp_reopen_session', {
                name: contact?.name || '',
                context: contextLabel,
            });

            logger.info(`[PendingQueue] Queued message + sent re-opener to ${phone}`);
        } catch (err) {
            logger.error(`[PendingQueue] Failed to queue message for ${phone}:`, err);
        }
    }

    /**
     * Deliver any pending messages for a phone number.
     * Call this from the webhook handler when an inbound message arrives.
     */
    static async deliverPending(
        whatsapp: WhatsAppService,
        phone: string,
    ): Promise<number> {
        try {
            const pending = await prisma.pendingMessage.findMany({
                where: {
                    phone_number: phone,
                    status: 'pending',
                    expires_at: { gt: new Date() },
                },
                orderBy: { created_at: 'asc' },
            });

            if (pending.length === 0) return 0;

            let delivered = 0;
            for (const msg of pending) {
                try {
                    await whatsapp.sendText(phone, msg.message);
                    await prisma.pendingMessage.update({
                        where: { id: msg.id },
                        data: { status: 'sent' },
                    });
                    delivered++;
                } catch {
                    // Skip failed deliveries
                }
            }

            logger.info(`[PendingQueue] Delivered ${delivered}/${pending.length} pending messages to ${phone}`);
            return delivered;
        } catch (err) {
            logger.error(`[PendingQueue] Failed to deliver pending for ${phone}:`, err);
            return 0;
        }
    }

    /**
     * Clean up expired pending messages.
     * Run periodically (e.g., every hour).
     */
    static async cleanupExpired(): Promise<number> {
        try {
            const result = await prisma.pendingMessage.updateMany({
                where: {
                    status: 'pending',
                    expires_at: { lt: new Date() },
                },
                data: { status: 'expired' },
            });
            if (result.count > 0) {
                logger.info(`[PendingQueue] Expired ${result.count} pending messages`);
            }
            return result.count;
        } catch (err) {
            logger.error(`[PendingQueue] Cleanup failed:`, err);
            return 0;
        }
    }
}
