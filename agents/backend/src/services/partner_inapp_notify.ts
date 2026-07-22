/**
 * Partner in-app notifications (2026-07-12) — writes a Notification row scoped to a
 * partner agent (recipient_type='partner'), surfaced by the partner portal's bell via
 * GET /agent/notifications. Fire-and-forget; never throws into the caller's write path.
 */
import prisma from '../db';
import logger from '../utils/logger';

export async function notifyPartnerInApp(partnerAgentId: string, n: {
    event: string;
    category: string;      // inventory | lead | deal | system
    title: string;
    body: string;
    data?: any;
    actionUrl?: string;
}): Promise<void> {
    try {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return;
        await prisma.notification.create({
            data: {
                tenant_id: tenant.id,
                recipient_id: partnerAgentId,
                recipient_type: 'partner',
                event: n.event,
                category: n.category,
                title: n.title,
                body: n.body,
                data: n.data ?? undefined,
                action_url: n.actionUrl ?? null,
                channels_sent: [],
            },
        });
    } catch (err) {
        logger.warn(`[PartnerInApp] notify failed for ${partnerAgentId}: ${(err as Error).message}`);
    }
}
