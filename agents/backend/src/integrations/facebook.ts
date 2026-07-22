
import { Router, Request, Response } from 'express';
import prisma from '../db';
import logger from '../utils/logger';
import { normalizePhone } from '../utils/phone';
import { sendBuyerConfirmationWhatsApp, sendBuyerConfirmationEmail } from '../services/lead_notifications';
import { assignViaRoundRobin } from '../services/lead_assignment';
import { assignContact } from '../services/assign_contact';
import {
    handleInstagramComment,
    handleInstagramDM,
    handleFacebookComment,
    handleMessengerMessage,
} from '../services/social_replier';

const router = Router();

const FB_VERIFY_TOKEN = process.env.FB_WEBHOOK_VERIFY_TOKEN || 'realty_pandit_fb_verify';

/**
 * GET /webhooks/facebook/webhook
 * Webhook verification (hub.challenge handshake) — shared for Facebook + Instagram
 */
router.get('/webhook', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === FB_VERIFY_TOKEN) {
        logger.info('[Facebook] Webhook verified');
        return res.status(200).send(challenge);
    }

    logger.warn('[Facebook] Webhook verification failed');
    res.status(403).json({ error: 'Forbidden' });
});

/**
 * POST /webhooks/facebook/webhook
 * Unified webhook handler for ALL Meta platform events:
 *   - Facebook Lead Ads (leadgen)
 *   - Facebook Page comments (feed)
 *   - Facebook Messenger messages
 *   - Instagram comments
 *   - Instagram DMs
 *   - Instagram mentions
 */
router.post('/webhook', async (req: Request, res: Response) => {
    // Always respond 200 immediately (Meta retries on non-200)
    res.status(200).json({ status: 'ok' });

    try {
        const objectType = req.body?.object;
        const entries = req.body?.entry || [];

        logger.info(`[Facebook] Webhook received: object=${objectType}, entries=${entries.length}`);

        for (const entry of entries) {
            // ─── Route by object type ────────────────────────────────

            if (objectType === 'page') {
                await handlePageEntry(entry);
            } else if (objectType === 'instagram') {
                await handleInstagramEntry(entry);
            } else {
                logger.debug(`[Facebook] Unhandled object type: ${objectType}`);
            }
        }
    } catch (error) {
        logger.error('[Facebook] Webhook processing error:', error);
    }
});

// ═══════════════════════════════════════════════════════════════
// PAGE EVENTS (Lead Ads, Comments, Messenger)
// ═══════════════════════════════════════════════════════════════

async function handlePageEntry(entry: any): Promise<void> {
    // 1. Changes-based events (leadgen, feed)
    const changes = entry.changes || [];
    for (const change of changes) {
        switch (change.field) {
            case 'leadgen':
                await handleLeadgenEvent(change.value);
                break;

            case 'feed':
                await handleFeedEvent(change.value);
                break;

            default:
                logger.debug(`[Facebook] Unhandled page change field: ${change.field}`);
        }
    }

    // 2. Messaging events (Messenger)
    const messaging = entry.messaging || [];
    for (const event of messaging) {
        if (event.message?.text) {
            handleMessengerMessage({
                sender_id: event.sender?.id,
                text: event.message.text,
                message_id: event.message?.mid,
            }).catch(err => logger.error('[Facebook] Messenger handler error:', err));
        }
    }
}

// ─── Lead Ads ───────────────────────────────────────────────────

async function handleLeadgenEvent(leadData: any): Promise<void> {
    const leadgenId = leadData?.leadgen_id;
    if (!leadgenId) {
        logger.warn('[Facebook] Missing leadgen_id in webhook');
        return;
    }

    const accessToken = process.env.FB_ACCESS_TOKEN;
    if (!accessToken) {
        logger.error('[Facebook] FB_ACCESS_TOKEN not set — cannot fetch lead details');
        return;
    }

    try {
        const axios = require('axios');

        // Fetch lead details
        const leadResp = await axios.get(
            `https://graph.facebook.com/v25.0/${leadgenId}`,
            { params: { access_token: accessToken } }
        );

        const lead = leadResp.data;
        const fields: Record<string, string> = {};
        for (const f of (lead.field_data || [])) {
            fields[f.name] = f.values?.[0] || '';
        }

        const name = fields.full_name || fields.name || null;
        const phone = fields.phone_number || fields.mobile || null;
        const email = fields.email || null;
        const city = fields.city || fields.location || null;
        const budget = fields.budget || null;
        const adId = leadData.ad_id || lead.ad_id || null;
        const formId = leadData.form_id || lead.form_id || null;

        const phoneNumber = normalizePhone(phone || '');
        if (!phoneNumber) {
            logger.warn(`[Facebook] Lead ${leadgenId} has no valid phone number`);
            return;
        }

        // Fetch ad details if ad_id is available (for AI context)
        let campaignName: string | null = null;
        let adCreative: string | null = null;
        let campaignId: string | null = null;
        let adsetId: string | null = null;

        if (adId) {
            try {
                const adResp = await axios.get(
                    `https://graph.facebook.com/v25.0/${adId}`,
                    {
                        params: {
                            access_token: accessToken,
                            fields: 'name,campaign_id,adset_id,campaign{name},adset{name}',
                        },
                    }
                );
                campaignName = adResp.data?.campaign?.name || null;
                campaignId = adResp.data?.campaign_id || null;
                adsetId = adResp.data?.adset_id || null;
                adCreative = adResp.data?.name || null;
                logger.info(`[Facebook] Ad details: campaign="${campaignName}", ad="${adCreative}"`);
            } catch (adErr: any) {
                logger.warn(`[Facebook] Could not fetch ad details for ${adId}: ${adErr.message}`);
            }
        }

        // Get tenant
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return;

        // Auto-assign inbound ad leads to Sunny (super_boss). Leadgen uses upsert, which
        // bypasses the prisma $extends contact.create auto-assign — so do it explicitly here.
        // Without an owner, leadgen contacts have null assigned_agent_id/created_by and are
        // hidden by buildContactVisibilityFilter (invisible in the Leads section). Mirrors
        // WhatsApp/voice-source behaviour (db.ts $extends + new_lead_alerts).
        let leadgenAssignedAgentId: string | undefined;
        try {
            const { resolveSunnyAgentId } = await import('../services/new_lead_alerts');
            leadgenAssignedAgentId = (await resolveSunnyAgentId(prisma)) || undefined;
        } catch { /* non-fatal — lead still created, just unassigned */ }

        // Upsert contact with ad tracking fields
        const contact = await prisma.contact.upsert({
            where: { phone_number: phoneNumber },
            update: {
                name: name || undefined,
                email: email || undefined,
                source: 'facebook',
                preferred_location: city || undefined,
                last_channel: 'facebook',
                last_interaction: new Date(),
                meta_ad_id: adId || undefined,
                meta_campaign_id: campaignId || undefined,
                meta_adset_id: adsetId || undefined,
                meta_campaign_name: campaignName || undefined,
                meta_ad_creative: adCreative || undefined,
                meta_form_id: formId || undefined,
            },
            create: {
                phone_number: phoneNumber,
                name,
                email,
                source: 'facebook',
                contact_type: 'BUYER',
                intent: 'buy',
                preferred_location: city,
                budget_max: budget ? parseFloat(String(budget).replace(/[^\d.]/g, '')) : null,
                tenant_id: tenant.id,
                assigned_agent_id: leadgenAssignedAgentId,
                // super_boss default so leadgen contacts aren't hidden by the visibility filter. Phase 5C.
                assignment_method: leadgenAssignedAgentId ? 'other' : undefined,
                last_channel: 'facebook',
                last_interaction: new Date(),
                lead_status: 'warm',
                meta_ad_id: adId,
                meta_campaign_id: campaignId,
                meta_adset_id: adsetId,
                meta_campaign_name: campaignName,
                meta_ad_creative: adCreative,
                meta_form_id: formId,
            }
        });

        // Log interaction
        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id,
                phone_number: phoneNumber,
                channel: 'facebook',
                direction: 'inbound',
                event_type: 'lead_capture',
                content: `Facebook Lead Ad: ${name || 'Unknown'} | Campaign: ${campaignName || 'N/A'} | City: ${city || 'N/A'}`,
                metadata: {
                    source: 'facebook',
                    leadgen_id: leadgenId,
                    form_id: formId,
                    ad_id: adId,
                    campaign_id: campaignId,
                    campaign_name: campaignName,
                    ad_creative: adCreative,
                    original_fields: fields,
                }
            }
        });

        // Assign agent
        let agentId: string | null = contact.assigned_agent_id ?? null;
        if (!agentId) {
            agentId = await assignViaRoundRobin();
            if (agentId) {
                await assignContact(phoneNumber, agentId, 'round_robin');
                const { createQualifyTask } = await import('../services/workflow_task_service');
                createQualifyTask({ tenantId: tenant.id, contactPhone: phoneNumber, assignedTo: agentId, source: 'facebook' })
                    .catch(err => logger.warn('[Facebook] Workflow task failed:', (err as Error).message));
            }
        }

        // Auto-create NEW deal so AI qualification cadence kicks in.
        const { ensureDealForLead } = await import('../services/ensure_deal');
        ensureDealForLead({ contactPhone: phoneNumber, source: 'facebook', assignedAgentId: agentId })
            .catch(err => logger.error(`[Facebook] ensureDealForLead failed for ${phoneNumber}: ${(err as Error).message}`));

        // Send conversion event (Lead)
        const { trackLeadQualified } = await import('../services/meta_conversions');
        trackLeadQualified(phoneNumber, email || undefined).catch(() => {});

        // Notify buyer (fire-and-forget)
        sendBuyerConfirmationWhatsApp(phoneNumber, name, 'facebook')
            .catch(err => logger.warn('[Facebook] Buyer WA failed:', err.message));
        if (email) {
            sendBuyerConfirmationEmail(email, name)
                .catch(err => logger.warn('[Facebook] Buyer email failed:', err.message));
        }

        logger.info(`[Facebook] Lead captured: ${phoneNumber} (${name || 'unnamed'}) from campaign "${campaignName || 'direct'}"`);

    } catch (fetchErr: any) {
        logger.error(`[Facebook] Failed to fetch lead ${leadgenId}: ${fetchErr.message}`);
    }
}

// ─── Page Feed (Comments) ───────────────────────────────────────

async function handleFeedEvent(value: any): Promise<void> {
    // Only handle new comments (not edits/deletes)
    if (value.item !== 'comment' || value.verb !== 'add') return;

    // Don't reply to our own comments
    const pageId = process.env.FB_PAGE_ID;
    if (value.from?.id === pageId) return;

    handleFacebookComment({
        comment_id: value.comment_id,
        post_id: value.post_id,
        text: value.message || '',
        from: { id: value.from?.id, name: value.from?.name || 'User' },
    }).catch(err => logger.error('[Facebook] Comment handler error:', err));
}

// ═══════════════════════════════════════════════════════════════
// INSTAGRAM EVENTS (Comments, DMs, Mentions)
// ═══════════════════════════════════════════════════════════════

async function handleInstagramEntry(entry: any): Promise<void> {
    // 1. Changes-based events (comments, mentions)
    const changes = entry.changes || [];
    for (const change of changes) {
        switch (change.field) {
            case 'comments':
                await handleInstagramCommentEvent(change.value);
                break;

            case 'mentions':
                // Mention = someone @mentioned us — treat like a comment
                logger.info(`[Instagram] Mention received on media ${change.value?.media_id}`);
                // Could fetch the comment and reply, but for now just log
                break;

            default:
                logger.debug(`[Instagram] Unhandled change field: ${change.field}`);
        }
    }

    // 2. Messaging events (Instagram DMs)
    const messaging = entry.messaging || [];
    for (const event of messaging) {
        if (event.message?.text) {
            handleInstagramDM({
                sender_id: event.sender?.id,
                text: event.message.text,
                message_id: event.message?.mid,
            }).catch(err => logger.error('[Instagram] DM handler error:', err));
        }
    }
}

async function handleInstagramCommentEvent(value: any): Promise<void> {
    if (!value.id || !value.text) return;

    // Don't reply to our own comments
    const igAccountId = process.env.IG_BUSINESS_ACCOUNT_ID;
    if (value.from?.id === igAccountId) return;

    handleInstagramComment({
        comment_id: value.id,
        text: value.text,
        from: {
            id: value.from?.id || '',
            username: value.from?.username || 'user',
        },
        media_id: value.media?.id || '',
        ad_id: value.media?.ad_id || undefined,
        ad_title: value.media?.ad_title || undefined,
    }).catch(err => logger.error('[Instagram] Comment handler error:', err));
}

export default router;
