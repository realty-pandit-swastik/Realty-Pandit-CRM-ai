/**
 * Web Push Service — Sends browser push notifications via VAPID.
 *
 * Loads PushSubscription records for a given agent and sends to all their devices.
 * Automatically cleans up expired/invalid subscriptions (410 Gone).
 */

import webpush from 'web-push';
import prisma from '../db';
import logger from '../utils/logger';

// Configure VAPID
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@realtypandit.in';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    logger.info('[PushService] VAPID configured');
} else {
    logger.warn('[PushService] VAPID keys not configured — push notifications disabled');
}

export interface PushPayload {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    action_url?: string;
    notification_id?: string;
    category?: string;
    tag?: string;
}

/**
 * Send push notification to all devices of a given agent.
 * Returns true if at least one push was sent successfully.
 */
export async function sendPushToUser(agentId: string, payload: PushPayload): Promise<boolean> {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false;

    const subscriptions = await prisma.pushSubscription.findMany({
        where: { agent_id: agentId },
    });

    if (subscriptions.length === 0) return false;

    const pushData = JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon || '/icons/icon-192x192.png',
        badge: payload.badge || '/icons/badge-72x72.png',
        action_url: payload.action_url || '/',
        notification_id: payload.notification_id,
        category: payload.category,
        tag: payload.tag || payload.category || 'default',
    });

    let successCount = 0;
    const expiredIds: string[] = [];

    for (const sub of subscriptions) {
        try {
            await webpush.sendNotification(
                {
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.keys_p256dh,
                        auth: sub.keys_auth,
                    },
                },
                pushData,
                { TTL: 86400 }, // 24 hours
            );
            successCount++;
        } catch (err: any) {
            if (err.statusCode === 410 || err.statusCode === 404) {
                // Subscription expired or invalid — mark for cleanup
                expiredIds.push(sub.id);
                logger.info(`[PushService] Subscription expired for agent ${agentId}, cleaning up`);
            } else {
                logger.warn(`[PushService] Push failed for agent ${agentId}:`, err.statusCode || err.message);
            }
        }
    }

    // Cleanup expired subscriptions
    if (expiredIds.length > 0) {
        await prisma.pushSubscription.deleteMany({
            where: { id: { in: expiredIds } },
        }).catch(() => {});
    }

    return successCount > 0;
}

/**
 * Get VAPID public key for frontend subscription.
 */
export function getVapidPublicKey(): string {
    return VAPID_PUBLIC;
}
