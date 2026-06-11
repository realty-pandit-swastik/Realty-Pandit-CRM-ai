/**
 * Omnidim Webhook Receiver — Stage 1 NEW qualification calling provider.
 *
 * Per DEC-003 Pipeline Unification: AI Pandit Ji uses Omnidim for outbound
 * qualification calls. This is the inbound webhook for call results and events.
 *
 * Status: STUB — credentials & exact payload schema TBD with Omnidim onboarding.
 * Logs every call into the Interaction table (linked by deal_id when present)
 * so call history surfaces in the deal feed without a new model.
 */

import { Router } from 'express';
import prisma from '../db';
import logger from '../utils/logger';
import { normalizePhone } from '../utils/phone';
import { notifyDealEvent } from '../services/deal_notifications';
import { captureRouteError } from '../utils/capture';

const router = Router();

// ─── POST /webhooks/omnidim — Generic event receiver ────────────────────────
//
// Expected payload shape (best guess from KRA — confirm with Omnidim):
// {
//   event: 'call_completed' | 'call_failed' | 'callback_requested' | 'qualified',
//   call_id: string,
//   phone: string,
//   deal_id?: string,
//   outcome?: 'VERIFIED' | 'CALLBACK_REQUESTED' | 'NOT_INTERESTED_NOW' | 'NO_ANSWER_MAX' | ...,
//   transcript?: string,
//   duration_sec?: number,
//   recording_url?: string,
//   metadata?: object,
// }
router.post('/', async (req, res) => {
    const payload = req.body || {};
    const event = String(payload.event || 'unknown');
    const callId = String(payload.call_id || payload.id || '');
    const phone = payload.phone ? normalizePhone(String(payload.phone)) : null;
    const dealId = payload.deal_id ? String(payload.deal_id) : null;
    const outcome = payload.outcome ? String(payload.outcome) : null;

    logger.info(`[Omnidim] event=${event} call=${callId} phone=${phone || '-'} deal=${dealId || '-'} outcome=${outcome || '-'}`);

    // TODO: signature validation once Omnidim provides webhook secret.
    // Header is likely `x-omnidim-signature`; HMAC-SHA256 of raw body w/ shared secret.

    try {
        // Resolve tenant via deal or contact lookup; fall back to first tenant.
        let tenantId: string | null = null;
        if (dealId) {
            const d = await prisma.transaction.findUnique({ where: { id: dealId }, select: { tenant_id: true } });
            tenantId = d?.tenant_id || null;
        } else if (phone) {
            const c = await prisma.contact.findUnique({ where: { phone_number: phone }, select: { tenant_id: true } });
            tenantId = c?.tenant_id || null;
        }
        if (!tenantId) {
            const t = await prisma.tenant.findFirst({ select: { id: true } });
            tenantId = t?.id || null;
        }

        if (!tenantId || !phone) {
            logger.warn(`[Omnidim] Skipping log — missing tenant_id (${tenantId}) or phone (${phone})`);
            return res.status(200).json({ received: true, logged: false });
        }

        await prisma.interaction.create({
            data: {
                tenant_id: tenantId,
                phone_number: phone,
                channel: 'voice',
                direction: 'outbound',
                event_type: `omnidim_${event}`,
                content: payload.transcript ? String(payload.transcript).slice(0, 5000) : null,
                metadata: {
                    provider: 'omnidim',
                    call_id: callId,
                    deal_id: dealId,
                    outcome,
                    duration_sec: payload.duration_sec || null,
                    recording_url: payload.recording_url || null,
                    raw: payload,
                },
            },
        });

        // Per Stage 1 KRA: 11 qualification outcomes drive different transitions.
        // VERIFIED          → QUALIFIED (AI advances stage)
        // CALLBACK_REQUESTED → stay NEW, alert lead manager (manager_alert template)
        // NOT_INTERESTED_NOW → CLOSED_LOST (polite close)
        // JUST_BROWSING     → stay NEW, lower priority
        // WRONG_NUMBER      → CLOSED_LOST + flag contact
        // DUPLICATE         → CLOSED_LOST (no auto WhatsApp)
        // SPAM              → CLOSED_LOST + flag contact (no auto WhatsApp)
        // BANKER_VALUER     → CLOSED_LOST (no auto WhatsApp)
        // PARTNER_AGENT     → CLOSED_LOST + suggest partner onboarding
        // LANGUAGE_BARRIER  → stay NEW, escalate to lead manager
        // NO_ANSWER_MAX     → CLOSED_LOST after retries exhausted
        if (dealId && outcome) {
            try {
                await applyOmnidimOutcome(dealId, outcome, payload);
            } catch (err) {
                logger.error(`[Omnidim] Failed to apply outcome ${outcome} for deal ${dealId}:`, err);
            }
        }

        return res.status(200).json({ received: true, logged: true });
    } catch (err) {
        captureRouteError(err, req, { route: 'omnidim#1' });
        logger.error('[Omnidim] Webhook handler error:', err);
        return res.status(200).json({ received: true, logged: false, error: 'logged' });
    }
});

// ─── GET /webhooks/omnidim/health — Smoke test ──────────────────────────────
router.get('/health', (_req, res) => {
    res.json({ ok: true, provider: 'omnidim', stub: true });
});

// ─── Outcome → state transition map ──────────────────────────────────────────

const STAY_NEW_OUTCOMES = new Set(['CALLBACK_REQUESTED', 'JUST_BROWSING', 'LANGUAGE_BARRIER']);
const CLOSED_LOST_OUTCOMES = new Set([
    'NOT_INTERESTED_NOW',
    'WRONG_NUMBER',
    'DUPLICATE',
    'SPAM',
    'BANKER_VALUER',
    'PARTNER_AGENT',
    'NO_ANSWER_MAX',
]);

async function applyOmnidimOutcome(dealId: string, outcome: string, payload: any): Promise<void> {
    if (outcome === 'VERIFIED') {
        await prisma.transaction.update({
            where: { id: dealId },
            data: { status: 'QUALIFIED' as any, updated_at: new Date() },
        });
        await notifyDealEvent({ dealId, event: 'status_changed', newStatus: 'QUALIFIED', reason: 'AI qualified via Omnidim' });
        // Auto-share first matching property (Stage 2 KRA on-entry behaviour).
        try {
            const { shareNextProperty } = await import('../services/property_sharing');
            shareNextProperty(dealId).catch(err => logger.warn('[Omnidim] Property share failed:', err));
        } catch (err) {
            logger.warn('[Omnidim] Property share import failed:', err);
        }
        logger.info(`[Omnidim] Deal ${dealId} VERIFIED → QUALIFIED`);
        return;
    }

    if (CLOSED_LOST_OUTCOMES.has(outcome)) {
        const reasonMap: Record<string, string> = {
            NOT_INTERESTED_NOW: 'Customer not interested',
            WRONG_NUMBER: 'Wrong number',
            DUPLICATE: 'Duplicate lead',
            SPAM: 'Spam',
            BANKER_VALUER: 'Banker / valuer enquiry — not a buyer',
            PARTNER_AGENT: 'Partner agent enquiry — not an end customer',
            NO_ANSWER_MAX: 'No answer after maximum attempts',
        };
        await prisma.transaction.update({
            where: { id: dealId },
            data: { status: 'CLOSED_LOST' as any, close_reason: reasonMap[outcome], closed_at: new Date(), updated_at: new Date() },
        });
        await notifyDealEvent({ dealId, event: 'closed_lost', reason: reasonMap[outcome] });
        logger.info(`[Omnidim] Deal ${dealId} ${outcome} → CLOSED_LOST`);
        return;
    }

    if (STAY_NEW_OUTCOMES.has(outcome)) {
        // Deal stays NEW; alert the coordinator so they can take over from AI.
        const deal = await prisma.transaction.findUnique({
            where: { id: dealId },
            select: {
                // Phase 5: legacy demand_property_type column dropped. Pull the
                // taxonomy node name (root → leaf) for the human-readable summary;
                // fall back to the canonical schema's stored property_type label.
                demand_taxonomy_node_id: true,
                demand_schema_values: true,
                demand_location: true,
                demand_contact: { select: { name: true } },
                coordinator: { select: { phone: true } },
            },
        });
        if (deal?.coordinator?.phone) {
            try {
                const { WhatsAppService } = await import('../services/whatsapp');
                const whatsapp = new WhatsAppService();
                let propertyLabel = 'property';
                if (deal.demand_taxonomy_node_id) {
                    const node = await prisma.taxonomyNode.findUnique({
                        where: { id: deal.demand_taxonomy_node_id },
                        select: { name: true },
                    });
                    if (node?.name) propertyLabel = node.name;
                } else {
                    const sv = (deal.demand_schema_values ?? {}) as Record<string, any>;
                    if (typeof sv.property_type === 'string') propertyLabel = sv.property_type;
                }
                await whatsapp.sendTemplate(deal.coordinator.phone, 'rp_callback_manager_alert', {
                    name: deal.demand_contact?.name || 'Customer',
                    callback_time: outcome === 'CALLBACK_REQUESTED'
                        ? (payload.requested_callback_time || 'Requested by customer')
                        : `AI handoff (${outcome})`,
                    requirement: `${propertyLabel} in ${deal.demand_location || 'requested area'}`,
                });
            } catch (err) {
                logger.warn(`[Omnidim] Manager alert failed:`, err);
            }
        }
        logger.info(`[Omnidim] Deal ${dealId} ${outcome} — stayed NEW, manager alerted`);
        return;
    }

    logger.warn(`[Omnidim] Unrecognised outcome '${outcome}' for deal ${dealId} — no action`);
}

export default router;
