import prisma from '../db';
import { WhatsAppService } from './whatsapp';
import { SessionTracker } from './session_tracker';
import { normalizePhone } from '../utils/phone';
import logger from '../utils/logger';

export const PROPERTY_MEDIA_CONTEXT = 'property_media:';
export type PropertyMediaItem = { type: 'image' | 'video'; url: string; caption?: string };

/** Durable per-share remainder. The approved template has already delivered the details. */
export async function queuePropertyMedia(phone: string, inventoryId: string, items: PropertyMediaItem[]): Promise<void> {
    if (!items.length) return;
    await prisma.pendingMessage.create({ data: {
        phone_number: normalizePhone(phone), context: `${PROPERTY_MEDIA_CONTEXT}${inventoryId}`,
        message: JSON.stringify(items), status: 'pending',
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000),
    } });
}

/** CAS claim prevents simultaneous inbound workers from sending the same remainder. */
export async function deliverPendingPropertyMedia(whatsapp: WhatsAppService, phone: string, inventoryId?: string): Promise<number> {
    const normalized = normalizePhone(phone);
    if (!await SessionTracker.isSessionActive(normalized)) return 0;
    const rows = await prisma.pendingMessage.findMany({ where: {
        phone_number: normalized, context: inventoryId ? `${PROPERTY_MEDIA_CONTEXT}${inventoryId}` : { startsWith: PROPERTY_MEDIA_CONTEXT },
        expires_at: { gt: new Date() },
        OR: [{ status: 'pending' }, { status: { startsWith: 'sending:' } }],
    }, orderBy: { created_at: 'asc' } });
    let delivered = 0;
    for (const row of rows) {
        if (row.status.startsWith('sending:') && Number(row.status.slice(8)) > Date.now()) continue;
        let lease = `sending:${Date.now() + 15 * 60 * 1000}`;
        const claimed = await prisma.pendingMessage.updateMany({ where: { id: row.id, status: row.status }, data: { status: lease } });
        if (!claimed.count) continue;
        try {
            const items: PropertyMediaItem[] = JSON.parse(row.message);
            while (items.length) {
                const renewed = `sending:${Date.now() + 15 * 60 * 1000}`;
                const owned = await prisma.pendingMessage.updateMany({ where: { id: row.id, status: lease }, data: { status: renewed } });
                if (!owned.count) break;
                lease = renewed;
                const item = items[0];
                await whatsapp.sendMediaStrict(normalized, item.type, item.url, item.caption);
                items.shift();
                delivered++;
                const saved = await prisma.pendingMessage.updateMany({ where: { id: row.id, status: lease }, data: {
                    message: JSON.stringify(items), status: items.length ? lease : 'sent',
                } });
                if (!saved.count) break; // A recovered worker owns the remainder now.
            }
        } catch (error) {
            await prisma.pendingMessage.updateMany({ where: { id: row.id, status: lease }, data: { status: 'pending' } });
            logger.warn('[PropertyMediaQueue] Delivery failed; remainder retained for retry', { id: row.id, error: (error as Error).message });
        }
    }
    return delivered;
}

export async function pendingPropertyMediaCount(phone: string, inventoryId: string): Promise<number> {
    const rows = await prisma.pendingMessage.findMany({ where: {
        phone_number: normalizePhone(phone), context: `${PROPERTY_MEDIA_CONTEXT}${inventoryId}`,
        expires_at: { gt: new Date() }, status: { notIn: ['sent', 'expired'] },
    }, select: { message: true } });
    return rows.reduce((sum, row) => { try { return sum + JSON.parse(row.message).length; } catch { return sum; } }, 0);
}
