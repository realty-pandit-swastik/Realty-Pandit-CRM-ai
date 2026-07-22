/**
 * Central Notification Dispatch — ONE function to call from anywhere.
 *
 * Usage:
 *   import { notify } from '../services/notify';
 *   await notify('inventory_approved', [
 *     { id: agent.id, type: 'agent', phone: agent.phone, email: agent.email, name: agent.name }
 *   ], { display_id: 'RP-GZB-RES-20141', inventory_id: inv.id });
 *
 * What it does:
 * 1. Looks up event config from notification_events.ts
 * 2. For each recipient, loads their NotificationPreference
 * 3. Checks per-user quiet hours and event toggles
 * 4. Persists a Notification row (for in-app bell / history)
 * 5. Sends via enabled channels: WhatsApp, Email, Push (Phase 2)
 * 6. All sends are fire-and-forget — never blocks the caller
 */

import prisma from '../db';
import logger from '../utils/logger';
import { getEventConfig } from '../config/notification_events';
import { NotificationAgent } from '../agents/notification_agent';
import { normalizePhone } from '../utils/phone';
import { sendPushToUser } from './push_service';

const notificationAgent = new NotificationAgent();

export interface NotifyRecipient {
    id: string;           // agent ID or partner agent ID
    type: 'agent' | 'partner' | 'contact';
    phone?: string;       // for WhatsApp
    email?: string;       // for Email
    name?: string;        // for personalization
}

/**
 * Central notification dispatch.
 * Fire-and-forget — catches all errors internally.
 */
export async function notify(
    event: string,
    recipients: NotifyRecipient[],
    data: Record<string, any> = {},
): Promise<void> {
    // Run async without blocking caller
    _dispatch(event, recipients, data).catch(err => {
        logger.error(`[Notify] Dispatch failed for ${event}:`, err);
    });
}

async function _dispatch(
    event: string,
    recipients: NotifyRecipient[],
    data: Record<string, any>,
): Promise<void> {
    const config = getEventConfig(event);
    if (!config) {
        logger.warn(`[Notify] Unknown event: ${event}`);
        return;
    }

    const title = config.title(data);
    const body = config.body(data);
    const actionUrl = config.actionUrl?.(data) || undefined;

    const tenant = await prisma.tenant.findFirst();
    if (!tenant) return;

    for (const recipient of recipients) {
        try {
            // Load preferences (or use defaults)
            const prefs = await prisma.notificationPreference.findUnique({
                where: { owner_type_owner_id: { owner_type: recipient.type, owner_id: recipient.id } },
            });

            // Check per-user quiet hours
            if (prefs?.quiet_hours_enabled && isUserQuietHours(prefs.quiet_hours_start, prefs.quiet_hours_end)) {
                // During quiet hours: still persist notification (for in-app), skip WhatsApp/Push
                // Email still sends (standard practice)
                await persistNotification(tenant.id, recipient, config, title, body, data, actionUrl, []);
                if (prefs.email_enabled !== false && recipient.email) {
                    await sendEmail(recipient, title, body, data);
                }
                continue;
            }

            // Check event toggle
            const eventPrefs = (prefs?.event_preferences as Record<string, boolean>) || {};
            const prefKey = config.prefKey || config.category;
            if (eventPrefs[prefKey] === false) {
                // User explicitly disabled this event — still persist for history
                await persistNotification(tenant.id, recipient, config, title, body, data, actionUrl, []);
                continue;
            }

            // Determine which channels to send
            const channelsSent: string[] = [];

            // WhatsApp
            const waEnabled = prefs?.whatsapp_enabled !== false;
            if (waEnabled && recipient.phone && config.defaultChannels.includes('whatsapp')) {
                const waTo = normalizePhone(recipient.phone) || recipient.phone;
                const waMessage = `*${title}*\n\n${body}`;
                try {
                    if (config.waTemplate) {
                        // 2026-07-22: staff alerts bounced with 131047 once the recipient's 24h
                        // window closed. smartSend keeps the richer free-form text inside the
                        // window and switches to the approved template outside it.
                        const { SessionTracker } = await import('./session_tracker');
                        const { WhatsAppService } = await import('./whatsapp');
                        await SessionTracker.smartSend(
                            new WhatsAppService(),
                            waTo,
                            waMessage,
                            config.waTemplate.key,
                            config.waTemplate.params(data),
                        );
                    } else {
                        await notificationAgent.send({
                            to: waTo,
                            channel: 'whatsapp',
                            message: waMessage,
                            log_interaction: false, // we log our own Notification row
                        });
                    }
                    channelsSent.push('whatsapp');
                } catch (err) {
                    logger.warn(`[Notify] WhatsApp failed for ${event} to ${recipient.id}:`, err);
                }
            }

            // Email
            const emailEnabled = prefs?.email_enabled !== false;
            if (emailEnabled && recipient.email && config.defaultChannels.includes('email')) {
                try {
                    await sendEmail(recipient, title, body, data);
                    channelsSent.push('email');
                } catch (err) {
                    logger.warn(`[Notify] Email failed for ${event} to ${recipient.id}:`, err);
                }
            }

            // Push (stub — wired in Phase 2)
            if (config.defaultChannels.includes('push')) {
                try {
                    const pushSent = await sendPush(recipient, title, body, data, actionUrl);
                    if (pushSent) channelsSent.push('push');
                } catch (err) {
                    // Push not critical — ignore silently
                }
            }

            // Persist notification for in-app history
            await persistNotification(tenant.id, recipient, config, title, body, data, actionUrl, channelsSent);

        } catch (err) {
            logger.error(`[Notify] Failed for recipient ${recipient.id}:`, err);
        }
    }
}

async function persistNotification(
    tenantId: string,
    recipient: NotifyRecipient,
    config: ReturnType<typeof getEventConfig>,
    title: string,
    body: string,
    data: Record<string, any>,
    actionUrl: string | undefined,
    channelsSent: string[],
): Promise<void> {
    if (!config) return;
    try {
        await prisma.notification.create({
            data: {
                tenant_id: tenantId,
                recipient_id: recipient.id,
                recipient_type: recipient.type,
                event: config.event,
                category: config.category,
                title,
                body,
                data,
                action_url: actionUrl,
                channels_sent: channelsSent,
            },
        });
    } catch (err) {
        logger.error(`[Notify] Failed to persist notification:`, err);
    }
}

async function sendEmail(
    recipient: NotifyRecipient,
    title: string,
    body: string,
    data: Record<string, any>,
): Promise<void> {
    if (!recipient.email) return;
    await notificationAgent.send({
        to: recipient.email,
        channel: 'email',
        subject: `Realty Pandit — ${title}`,
        message: body,
        log_interaction: false,
    });
}

/**
 * Send Web Push notification to all of a recipient's subscribed devices.
 */
async function sendPush(
    recipient: NotifyRecipient,
    title: string,
    body: string,
    data: Record<string, any>,
    actionUrl?: string,
): Promise<boolean> {
    try {
        return await sendPushToUser(recipient.id, {
            title,
            body,
            action_url: actionUrl,
            notification_id: data.notification_id,
            category: data.category,
        });
    } catch {
        return false;
    }
}

/**
 * Check if current time is within user's quiet hours.
 * Uses IST (UTC+5:30) since all users are in India.
 */
function isUserQuietHours(start: string, end: string): boolean {
    const now = new Date();
    // Convert to IST
    const istOffset = 5.5 * 60; // minutes
    const istMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + istOffset) % 1440;

    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    const startMin = startH * 60 + (startM || 0);
    const endMin = endH * 60 + (endM || 0);

    if (startMin < endMin) {
        // Same day range (e.g., 09:00 - 17:00)
        return istMinutes >= startMin && istMinutes < endMin;
    } else {
        // Overnight range (e.g., 21:00 - 08:00)
        return istMinutes >= startMin || istMinutes < endMin;
    }
}
