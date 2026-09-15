/**
 * The ONLY writer to the WhatsAppMessage table.
 *
 * WHY (2026-08-07): outbound WhatsApp was failing ~40% (131049 peaked at 369 on 08-04) and
 * there was no way to answer "which sender caused this?". Delivery-status callbacks were
 * logged and discarded (`routes/webhooks.ts`), and the `whatsapp_messages` table — which has
 * existed since the init migration — had never been written to by any code path. So failure
 * attribution meant grepping application logs and correlating by timestamp.
 *
 * Best-effort by design: a logging failure must NEVER fail a send. Every function here
 * swallows its own errors.
 *
 * ⚠ FK TRAP. `whatsapp_messages.phone_number` is a foreign key to `contacts.phone_number`.
 * A large share of proactive sends go to AGENT / coordinator phones that have no Contact row,
 * so a naive insert throws a foreign-key violation on every internal notification — which,
 * before this guard, would have turned a logging concern into broken staff alerts. We resolve
 * the contact first and skip the row when there is none; internal recipients are already
 * covered by Interaction rows.
 */

import prisma from '../db';
import logger from '../utils/logger';
import type { MetaErrorInfo } from './whatsapp_errors';

/** Status precedence — Meta delivers callbacks out of order, so status may only advance. */
const RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 9 };

export interface RecordOutboundArgs {
    to: string;
    messageType: 'text' | 'template' | 'image' | 'interactive' | 'document';
    body?: string | null;
    mediaUrl?: string | null;
    templateName?: string | null;
    sentBy?: string | null;
    waMessageId?: string | null;
    error?: MetaErrorInfo | null;
}

export async function recordOutbound(a: RecordOutboundArgs): Promise<void> {
    try {
        // FK guard — see the header note. Indexed PK lookup, so this is cheap.
        const contact = await prisma.contact.findUnique({
            where: { phone_number: a.to },
            select: { tenant_id: true },
        });
        if (!contact) return; // internal/agent number — no Contact row, nothing to attach to

        const failed = !!a.error;
        await prisma.whatsAppMessage.create({
            data: {
                tenant_id: contact.tenant_id,
                phone_number: a.to,
                wa_message_id: a.waMessageId ?? null,
                direction: 'outbound',
                message_type: a.messageType,
                body: a.body ? a.body.slice(0, 4000) : null,
                media_url: a.mediaUrl ?? null,
                status: failed ? 'failed' : 'sent',
                sent_by: a.sentBy ?? 'unknown',
                template_name: a.templateName ?? null,
                error_code: a.error?.code ?? null,
                error_title: a.error?.title || a.error?.message?.slice(0, 300) || null,
                failed_at: failed ? new Date() : null,
            },
        });
    } catch (err) {
        // Never let logging break a send. A duplicate wa_message_id (unique) or a race is fine.
        logger.warn(`[WAMessageLog] recordOutbound failed for ${a.to}: ${(err as Error).message}`);
    }
}

/**
 * Apply a Meta `value.statuses[]` callback.
 *
 * Uses updateMany so a callback for a message we never logged (pre-Phase-5 sends, or sends to
 * non-Contacts) is a silent no-op instead of a throw. The status filter enforces
 * monotonic advancement: `failed` is terminal and always wins, otherwise a status may only
 * move forward through sent → delivered → read.
 */
export async function applyStatusCallback(s: {
    id?: string; status?: string; timestamp?: string; errors?: any[];
}): Promise<void> {
    try {
        if (!s?.id || !s?.status) return;
        const status = String(s.status).toLowerCase();
        const rank = RANK[status];
        if (!rank) return;

        const lower = Object.entries(RANK).filter(([, r]) => r < rank).map(([k]) => k);
        const err = Array.isArray(s.errors) && s.errors.length ? s.errors[0] : null;
        const at = s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date();

        await prisma.whatsAppMessage.updateMany({
            where: {
                wa_message_id: s.id,
                // 'failed' overwrites anything; others only advance.
                ...(status === 'failed' ? {} : { status: { in: lower } }),
            },
            data: {
                status,
                ...(status === 'delivered' ? { delivered_at: at } : {}),
                ...(status === 'read' ? { read_at: at } : {}),
                ...(status === 'failed' ? {
                    failed_at: at,
                    error_code: typeof err?.code === 'number' ? err.code : null,
                    error_title: (err?.title || err?.message || '').slice(0, 300) || null,
                } : {}),
            },
        });
    } catch (err) {
        logger.warn(`[WAMessageLog] applyStatusCallback failed for ${s?.id}: ${(err as Error).message}`);
    }
}
