/**
 * Template Button Router — P2 (2026-06-12).
 *
 * The audit found ~41% of quick-reply taps got a dead/looping reply. The property-card handler
 * covers Call Back / Schedule Visit / Next Option, and the webhook 3a calendar block covers
 * Confirm / Reschedule / Confirmed / Cancel. This router covers the REST so they no longer fall
 * through to the LLM and fumble:
 *   - Open Portal          → send the partner portal link (OTP is issued on login)
 *   - Upload Now           → start the inventory upload workflow
 *   - Talk to Coordinator  → escalate to the assigned coordinator (createLeadActionTask)
 *   - Haan dikhao / batao / View Details / Yes → engage (share next match, else start buyer flow)
 *   - Reply (bare)         → invite the buyer's requirement instead of fumbling
 *
 * Engagement/Reply are skipped when an inventory/buyer workflow session is active, so the router
 * never pre-empts a flow already in progress. Returns true if handled.
 */

import prisma from '../db';
import logger from '../utils/logger';
import { WhatsAppService } from './whatsapp';
import { createLeadActionTask } from './workflow_task_service';

const whatsapp = new WhatsAppService();
const PARTNER_PORTAL = 'https://realtypandit.in/agent/login';

// Engagement quick-replies from cold/re-engagement nudges (exact, lowercased button labels).
const ENGAGE = new Set([
    'haan dikhao', 'haan, dikhao', 'haan batao', 'haan, batao!', 'view details', 'yes', 'haan',
]);

export async function handleTemplateButton(msg: any, from: string): Promise<boolean> {
    const tapTitle = (msg?.interactive?.button_reply?.title || msg?.button?.text || '').toLowerCase().trim();
    const typed = (msg?.text?.body || '').toLowerCase().trim();
    // Button TAP → exact label; typed free text only matches the unambiguous partner labels.
    const title = tapTitle || typed;
    if (!title) return false;

    try {
        // ── Partner: Open Portal ──
        if (title === 'open portal') {
            await whatsapp.sendText(from, `🔗 *Partner Portal:* ${PARTNER_PORTAL}\n\nLogin karein — OTP isi WhatsApp number par aa jayega. 🙏`);
            await logBtn(from, 'open_portal');
            return true;
        }

        // ── Partner: Upload Now → start inventory upload workflow ──
        if (title === 'upload now') {
            const { WhatsAppWorkflowAdapter } = await import('../workflows/whatsapp_workflow_adapter');
            await new WhatsAppWorkflowAdapter().startSession(from);
            await logBtn(from, 'upload_now');
            return true;
        }

        // ── Partner: Talk to Coordinator → escalate ──
        if (title === 'talk to coordinator') {
            const c = await prisma.contact.findUnique({ where: { phone_number: from }, select: { tenant_id: true } });
            await createLeadActionTask({
                phone: from, action: 'CALLBACK_REQUEST', tenantId: c?.tenant_id ?? 'default',
                sourceChannel: 'whatsapp-button', rawNote: 'Partner tapped "Talk to Coordinator".',
            }).catch(() => {});
            await whatsapp.sendText(from, 'Aapke coordinator ko inform kar diya 🙏 — woh aapse jaldi connect karenge.');
            await logBtn(from, 'talk_to_coordinator');
            return true;
        }

        // ── Engagement / Reply — only when NO active workflow session (don't interrupt a flow) ──
        const isEngage = ENGAGE.has(title);
        const isReply = title === 'reply';
        if (isEngage || isReply) {
            const { BuyerWhatsAppAdapter } = await import('../workflows/buyer_whatsapp_adapter');
            const { WhatsAppWorkflowAdapter } = await import('../workflows/whatsapp_workflow_adapter');
            const [buyerSession, invSession] = await Promise.all([
                BuyerWhatsAppAdapter.loadSession(from).catch(() => null),
                WhatsAppWorkflowAdapter.loadSession(from).catch(() => null),
            ]);
            if (buyerSession || invSession) return false; // active flow handles its own reply

            if (isEngage) {
                const deal = await prisma.transaction.findFirst({
                    where: { demand_contact_id: from, status: { in: ['NEW', 'QUALIFIED'] }, ai_paused: false },
                    orderBy: { updated_at: 'desc' }, select: { id: true },
                });
                if (deal) {
                    const { shareNextProperty } = await import('./property_sharing');
                    await shareNextProperty(deal.id);
                } else {
                    await new BuyerWhatsAppAdapter().startSession(from);
                }
                await logBtn(from, 'engage');
                return true;
            }

            // bare "Reply" with nothing else in progress → invite the requirement (don't fumble)
            await whatsapp.sendText(from, 'Bataiye 🙏 — aap kya dhundh rahe hain? Jaise *"2 BHK Vaishali rent"* ya *"office Noida"*. Main turant best options bhej deta hoon.');
            await logBtn(from, 'reply_prompt');
            return true;
        }
    } catch (err) {
        logger.warn('[TemplateButtonRouter] error:', err);
        return false;
    }
    return false;
}

async function logBtn(from: string, kind: string): Promise<void> {
    try {
        const c = await prisma.contact.findUnique({ where: { phone_number: from }, select: { tenant_id: true } });
        await prisma.interaction.create({
            data: {
                tenant_id: c?.tenant_id ?? 'default', phone_number: from, channel: 'whatsapp',
                direction: 'inbound', event_type: 'template_button', content: kind,
            },
        });
    } catch { /* non-fatal */ }
}
