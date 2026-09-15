/**
 * Disambiguation Router — Phase 3 (2026-07-28).
 *
 * When a BRAND-NEW (UNKNOWN) WhatsApp contact's first message matches NEITHER a supply signal
 * (isSupplyIntent) NOR a buyer keyword, the old behaviour fell through to the AI message router,
 * which GUESSED the intent or sent a generic "how can I help?" greeting. That guessing is exactly
 * how landlords got misfiled as buyers (Nilin root cause). Instead we ask ONE deterministic
 * question with two quick-reply buttons — "List a property" vs "Find a property" — and route the
 * tap straight into the correct workflow. Deterministic > guessing.
 *
 * Two entry points:
 *   - handleDisambiguationReply(msg, from): early guard (like handleTemplateButton). If the inbound
 *     is a tap on our buttons, start the supply/demand workflow and return true.
 *   - maybeSendDisambiguation(from, contact, text): called just before the AI router, only for an
 *     UNKNOWN contact that matched neither axis and wasn't already prompted in the last 24h.
 */

import prisma from '../db';
import logger from '../utils/logger';
import { WhatsAppService } from './whatsapp';

const whatsapp = new WhatsAppService();

export const INTENT_LIST_ID = 'rp_intent_list';
export const INTENT_FIND_ID = 'rp_intent_find';

// Log an inbound disambiguation event (best-effort; never throws).
async function logDisambig(from: string, eventType: string, content: string): Promise<void> {
    try {
        const c = await prisma.contact.findUnique({ where: { phone_number: from }, select: { tenant_id: true } });
        await prisma.interaction.create({
            data: {
                tenant_id: c?.tenant_id ?? 'default', phone_number: from, channel: 'whatsapp',
                direction: 'inbound', event_type: eventType, content,
            },
        });
    } catch { /* non-fatal */ }
}

/**
 * Early guard: if the inbound is a tap on the List/Find buttons, route deterministically.
 * Returns true if handled (caller must stop the normal pipeline).
 */
export async function handleDisambiguationReply(msg: any, from: string): Promise<boolean> {
    const id = (msg?.interactive?.button_reply?.id || '').trim();
    const title = (msg?.interactive?.button_reply?.title || msg?.button?.text || '').toLowerCase().trim();

    const isList = id === INTENT_LIST_ID || title.includes('list a property') || title.includes('list property');
    const isFind = id === INTENT_FIND_ID || title.includes('find a property') || title.includes('find property');
    if (!isList && !isFind) return false;

    try {
        if (isList) {
            logger.info(`[Disambiguation] ${from} chose LIST → starting inventory (supply) workflow`);
            const { WhatsAppWorkflowAdapter } = await import('../workflows/whatsapp_workflow_adapter');
            await new WhatsAppWorkflowAdapter().startSession(from);
            await logDisambig(from, 'disambiguation_reply', 'list');
        } else {
            logger.info(`[Disambiguation] ${from} chose FIND → starting buyer (demand) workflow`);
            const { BuyerWhatsAppAdapter } = await import('../workflows/buyer_whatsapp_adapter');
            await new BuyerWhatsAppAdapter().startSession(from);
            await logDisambig(from, 'disambiguation_reply', 'find');
        }
        return true;
    } catch (err) {
        logger.error('[Disambiguation] reply routing error:', err);
        return false; // let the normal pipeline try
    }
}

/**
 * Ask the one-tap List-vs-Find question — only when it is genuinely ambiguous:
 *   - contact is UNKNOWN (a classified buyer/landlord/agent is never asked), AND
 *   - we have NOT already sent this prompt in the last 24h (so it never loops).
 * By the time this is called the message has already failed both the supply and the buyer routers,
 * so we know neither axis matched. Returns true if the prompt was sent (caller must stop and NOT
 * fall through to the AI guesser).
 */
export async function maybeSendDisambiguation(from: string, contact: { contact_type: string; tenant_id: string }, text: string): Promise<boolean> {
    if (contact.contact_type !== 'UNKNOWN') return false;

    // Don't loop: at most one disambiguation prompt per 24h per contact.
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const already = await prisma.interaction.findFirst({
        where: { phone_number: from, event_type: 'disambiguation_prompt_sent', created_at: { gte: since } },
        select: { id: true },
    });
    if (already) return false;

    const body =
        'Namaste! 🙏 Main aapki kaise madad karun?\n\n' +
        '🏠 *List a property* — apni property rent/sell karni hai\n' +
        '🔍 *Find a property* — property kharidni ya kiraye pe leni hai';

    try {
        await whatsapp.sendReplyButtons(from, body, [
            { id: INTENT_LIST_ID, title: '🏠 List a property' },
            { id: INTENT_FIND_ID, title: '🔍 Find a property' },
        ]);
        await prisma.interaction.create({
            data: {
                tenant_id: contact.tenant_id, phone_number: from, channel: 'whatsapp',
                direction: 'outbound', event_type: 'disambiguation_prompt_sent', content: text?.slice(0, 200) || '',
            },
        });
        logger.info(`[Disambiguation] Sent List-vs-Find prompt to ${from}`);
        return true;
    } catch (err) {
        logger.error('[Disambiguation] failed to send prompt:', err);
        return false; // fall through to the normal router rather than going silent
    }
}
