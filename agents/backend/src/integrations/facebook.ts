
import { Router, Request, Response } from 'express';
import prisma from '../db';
import logger from '../utils/logger';
import { normalizePhone } from '../utils/phone';
import { cacheGet, cacheSet } from '../utils/redis';
import { sendBuyerConfirmationWhatsApp, sendBuyerConfirmationEmail } from '../services/lead_notifications';
import { assignViaRoundRobin } from '../services/lead_assignment';
import { assignContact } from '../services/assign_contact';
import { socialInboundQueue } from '../queues';
import type { SocialJobData } from '../queues/workers/social_inbound';

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
/**
 * Is this messaging event our OWN outbound message coming back to us?
 *
 * 2026-08-07: IGSID 17841447875862678 is `@airealtypandit` — our own account. Meta echoes
 * messages the business sends, and nothing filtered them, so our team's replies in the IG
 * inbox were processed as inbound customer DMs (phone→lead capture included).
 *
 * ⚠ This guard is a PRECONDITION for fixing the send path. With sends working and no echo
 * filter, our own reply echoes back, the handler replies to it, that echoes back — a
 * self-reply loop against our own account.
 */
function isSelfOrEcho(event: any, selfId: string | undefined): boolean {
    if (event?.message?.is_echo) return true;                    // Meta's explicit echo flag
    if (selfId && event?.sender?.id === selfId) return true;     // belt: sender is us
    return false;
}

/**
 * Dedup on Meta's own event id. Same Redis idiom as the WhatsApp path
 * (routes/webhooks.ts:42-61) — survives restarts and works across the PM2 cluster.
 * Without this a Meta retry re-sends the reply and re-writes the CRM rows.
 */
const SOCIAL_EVENT_TTL = 600; // 10 min — Meta retries well inside this
async function isSocialEventProcessed(eventId?: string): Promise<boolean> {
    if (!eventId) return false;                                  // no id → cannot dedup, let it through
    try {
        const seen = await cacheGet(`social_dedup:${eventId}`);
        if (seen) logger.info(`[Facebook] Duplicate social event ${eventId}, skipping`);
        return !!seen;
    } catch { return false; }                                    // fail OPEN — never drop a real event
}
async function markSocialEventProcessed(eventId?: string): Promise<void> {
    if (!eventId) return;
    try { await cacheSet(`social_dedup:${eventId}`, '1', SOCIAL_EVENT_TTL); } catch { /* best-effort */ }
}

/**
 * Hand the event to the durable queue instead of calling the reply handler inline.
 *
 * Previously these were fire-and-forget `handler(...).catch(log)` calls made AFTER the 200
 * had already been sent — so a failed reply (and for months every reply failed) was gone with
 * nothing to inspect or replay, and a restart mid-flight lost it outright.
 *
 * `jobId` is Meta's own id, giving BullMQ-level dedup behind the Redis `social_dedup:` key.
 * Falls back to inline processing if the enqueue itself fails, so a Redis outage degrades to
 * today's behaviour rather than dropping the event entirely.
 */
async function enqueueSocial(data: SocialJobData, eventId?: string): Promise<void> {
    try {
        await socialInboundQueue.add('social-event', data, eventId ? { jobId: eventId } : {});
        logger.info(`[Facebook] Queued ${data.kind}${eventId ? ` (${eventId})` : ''}`);
    } catch (err) {
        logger.error(`[Facebook] Enqueue failed for ${data.kind}, processing inline: ${(err as Error).message}`);
        const { runSocialJobInline } = await import('../queues/workers/social_inbound');
        runSocialJobInline(data).catch(e => logger.error('[Facebook] Inline fallback failed:', e));
    }
}

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
        if (!event.message?.text) continue;
        if (isSelfOrEcho(event, process.env.FB_PAGE_ID)) continue;
        if (await isSocialEventProcessed(event.message?.mid)) continue;
        await markSocialEventProcessed(event.message?.mid);

        await enqueueSocial({
            kind: 'fb_dm',
            sender_id: event.sender?.id,
            text: event.message.text,
            message_id: event.message?.mid,
        }, event.message?.mid);
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
        // Which listing is this ad selling? The display_id is encoded in the AD NAME —
        // the same no-migration link the CTWA path uses — and adCreative already holds
        // the ad name, so this costs no extra Graph call.
        let advertised: any = null;
        let advertisedDemand: Record<string, any> = {};
        try {
            const { extractDisplayId, alertUnresolvedAdListing } = await import('../services/ctwa_attribution');
            const displayId = extractDisplayId(adCreative, campaignName);
            if (displayId) {
                advertised = await prisma.inventory.findFirst({
                    where: { display_id: displayId },
                    select: {
                        id: true, display_id: true, status: true, intent: true, taxonomy_node_id: true,
                        specs: true, locality: true, city: true, district: true, location: true,
                        assigned_agent_id: true, owning_manager_id: true, uploaded_by_agent_id: true,
                    },
                });
                if (!advertised || advertised.status !== 'active') {
                    alertUnresolvedAdListing({
                        source: 'leadgen', phone: phoneNumber, adId, adName: adCreative, displayId,
                        reason: advertised ? `listing status is '${advertised.status}', not active` : 'display_id does not match any listing',
                    });
                    advertised = null;
                } else {
                    const { buildDemandFromInventory } = await import('../utils/website_lead');
                    advertisedDemand = buildDemandFromInventory(advertised);
                }
            } else if (adId) {
                alertUnresolvedAdListing({
                    source: 'leadgen', phone: phoneNumber, adId, adName: adCreative, displayId: null,
                    reason: 'no display_id in ad name',
                });
            }
        } catch (err) { logger.warn('[Facebook] advertised-listing resolve failed:', (err as Error).message); }

        // Route to the manager of the advertised listing when we know it; otherwise keep
        // the previous super_boss default. Leadgen uses upsert, which bypasses the db.ts
        // $extends auto-assign, so an owner MUST be set here or the contact is hidden by
        // buildContactVisibilityFilter. Existing contacts are never reassigned (upsert
        // only writes assigned_agent_id in the create branch).
        let leadgenAssignedAgentId: string | undefined;
        let leadgenAssignMethod: any = 'other';
        if (advertised) {
            leadgenAssignedAgentId = advertised.assigned_agent_id || advertised.owning_manager_id || advertised.uploaded_by_agent_id || undefined;
            if (leadgenAssignedAgentId) {
                leadgenAssignMethod = 'uploader';
                logger.info(`[Facebook] Routing lead ${phoneNumber} to inventory manager ${leadgenAssignedAgentId} for ${advertised.display_id}`);
            }
        }
        if (!leadgenAssignedAgentId) {
            try {
                const { resolveSunnyAgentId } = await import('../services/new_lead_alerts');
                leadgenAssignedAgentId = (await resolveSunnyAgentId(prisma)) || undefined;
            } catch { /* non-fatal — lead still created, just unassigned */ }
        }

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
                assignment_method: leadgenAssignedAgentId ? leadgenAssignMethod : undefined,
                last_channel: 'facebook',
                last_interaction: new Date(),
                lead_status: 'warm',
                // Requirements inherited from the advertised listing (same helper the website
                // enquiry path uses) so the lead is instantly matchable. Spread AFTER the
                // hardcoded BUYER/buy defaults so a rental listing correctly yields TENANT/rent.
                ...advertisedDemand,
                // ...but the customer's own city from the form still wins over the listing's.
                ...(city ? { preferred_location: city } : {}),
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
        ensureDealForLead({ contactPhone: phoneNumber, source: 'facebook', sourceRef: adId || formId || null, assignedAgentId: agentId })
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

    if (await isSocialEventProcessed(value.comment_id)) return;
    await markSocialEventProcessed(value.comment_id);

    await enqueueSocial({
        kind: 'fb_comment',
        comment_id: value.comment_id,
        post_id: value.post_id,
        text: value.message || '',
        from: { id: value.from?.id, name: value.from?.name || 'User' },
    }, value.comment_id);
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
        if (!event.message?.text) continue;
        if (isSelfOrEcho(event, process.env.IG_BUSINESS_ACCOUNT_ID)) continue;
        if (await isSocialEventProcessed(event.message?.mid)) continue;
        await markSocialEventProcessed(event.message?.mid);

        await enqueueSocial({
            kind: 'ig_dm',
            sender_id: event.sender?.id,
            text: event.message.text,
            message_id: event.message?.mid,
        }, event.message?.mid);
    }
}

async function handleInstagramCommentEvent(value: any): Promise<void> {
    if (!value.id || !value.text) return;

    // Only NEW comments. The FB side has always checked this (handleFeedEvent); the IG side
    // did not, so a comment EDIT — which still carries id+text — triggered a fresh reply.
    // Meta omits `verb` on some IG comment payloads, so only reject an explicit non-add.
    if (value.verb && value.verb !== 'add') return;

    // Don't reply to our own comments
    const igAccountId = process.env.IG_BUSINESS_ACCOUNT_ID;
    if (value.from?.id === igAccountId) return;

    if (await isSocialEventProcessed(value.id)) return;
    await markSocialEventProcessed(value.id);

    await enqueueSocial({
        kind: 'ig_comment',
        comment_id: value.id,
        text: value.text,
        from: {
            id: value.from?.id || '',
            username: value.from?.username || 'user',
        },
        media_id: value.media?.id || '',
        ad_id: value.media?.ad_id || undefined,
        ad_title: value.media?.ad_title || undefined,
    }, value.id);
}

export default router;
