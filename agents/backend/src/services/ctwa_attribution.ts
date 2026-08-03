/**
 * CTWA (Click-to-WhatsApp) ad attribution + advertised-property handoff.
 *
 * Meta attaches a `referral` object to the FIRST inbound WhatsApp message after
 * someone taps a Click-to-WhatsApp ad. It carries the ad id (`source_id`) plus the
 * creative's headline/body. Two jobs here:
 *
 *  1. ATTRIBUTION — resolve ad → ad set → campaign through the Graph API and persist
 *     onto the Contact's existing meta_* columns (the same ones the Facebook lead-form
 *     path fills), so ad-sourced leads are identifiable in the admin dashboard instead
 *     of collapsing into the generic "whatsapp" source bucket.
 *
 *  2. ADVERTISED PROPERTY — an ad sells ONE specific listing, but Meta gives us nowhere
 *     to attach an inventory id to an ad. So the listing's `display_id` is encoded in the
 *     AD NAME (and, for CTW, in the pre-filled first message) and parsed back out here.
 *     That is a deliberate no-migration link. When it resolves we copy the listing's
 *     requirements onto the lead and send that exact property card — instead of the
 *     generic "a team member will assist you" that ad leads used to get.
 *
 * Deliberately additive: `contact.source` stays 'whatsapp'. Routing, round-robin and
 * distribution logic switch on that string, so attribution rides in the meta_* columns.
 *
 * Nothing here may throw into inbound message processing.
 */

import axios from 'axios';
import prisma from '../db';
import logger from '../utils/logger';
import { captureBackgroundError } from '../utils/capture';

const GRAPH_API = 'https://graph.facebook.com/v25.0';

/** e.g. RP-GZB-RES-20528 — the customer-facing listing code. */
const DISPLAY_ID_RE = /\bRP-[A-Z]{2,4}-[A-Z]{2,4}-\d{3,}\b/i;

export interface CtwaReferral {
    ctwaClid: string | null;
    adId: string | null;
    sourceType: string | null;
    headline: string | null;
    body: string | null;
    sourceUrl: string | null;
}

interface AdDetails {
    campaignId: string | null;
    adsetId: string | null;
    campaignName: string | null;
    adName: string | null;
}

const NO_AD_DETAILS: AdDetails = { campaignId: null, adsetId: null, campaignName: null, adName: null };

/**
 * Pull the CTWA referral off a raw inbound WhatsApp message. Returns null when the
 * message did not originate from an ad click — the overwhelming majority, so this
 * stays cheap on the hot path.
 */
export function extractCtwaReferral(msg: any): CtwaReferral | null {
    const ref = msg?.referral;
    if (!ref) return null;

    // Meta sends source_id as a string, and it must stay one: real ad ids
    // (e.g. 120249378156770547) exceed Number.MAX_SAFE_INTEGER, so any path that
    // turns them into a JS number silently corrupts the trailing digits.
    const adId = ref.source_id ? String(ref.source_id) : null;
    const ctwaClid = ref.ctwa_clid ? String(ref.ctwa_clid) : null;
    if (!adId && !ctwaClid) return null;

    return {
        ctwaClid,
        adId,
        sourceType: ref.source_type || null,
        headline: ref.headline || null,
        body: ref.body || null,
        sourceUrl: ref.source_url || null,
    };
}

/** First listing display_id found across the given strings, uppercased. */
export function extractDisplayId(...sources: Array<string | null | undefined>): string | null {
    for (const s of sources) {
        if (!s) continue;
        const m = String(s).match(DISPLAY_ID_RE);
        if (m) return m[0].toUpperCase();
    }
    return null;
}

/**
 * Resolve ad → ad set → campaign. Mirrors the proven lookup in
 * `integrations/facebook.ts`. Never throws — a failed lookup still leaves us with
 * the ad id, which is the part we actually need for attribution.
 */
async function fetchAdDetails(adId: string): Promise<AdDetails> {
    const accessToken = process.env.FB_ACCESS_TOKEN;
    if (!accessToken) {
        logger.warn('[CTWA] FB_ACCESS_TOKEN not set — storing ad id without campaign detail');
        return NO_AD_DETAILS;
    }
    try {
        const resp = await axios.get(`${GRAPH_API}/${adId}`, {
            params: { access_token: accessToken, fields: 'name,campaign_id,adset_id,campaign{name}' },
            timeout: 8000,
        });
        return {
            campaignId: resp.data?.campaign_id || null,
            adsetId: resp.data?.adset_id || null,
            campaignName: resp.data?.campaign?.name || null,
            adName: resp.data?.name || null,
        };
    } catch (err) {
        logger.warn(`[CTWA] Could not fetch ad details for ${adId}: ${(err as Error).message}`);
        return NO_AD_DETAILS;
    }
}

/** Write the meta_* columns (first-touch wins) + log the click to the timeline. */
async function persistAttribution(
    phone: string,
    tenantId: string,
    referral: CtwaReferral,
    details: AdDetails,
    firstMessage?: string,
): Promise<void> {
    const existing = await prisma.contact.findUnique({
        where: { phone_number: phone },
        select: { meta_ad_id: true },
    });
    if (!existing) return;

    // First-touch wins: never let a later campaign overwrite the ad that originally
    // produced the lead. Repeat clicks are still recorded as interactions below.
    if (!existing.meta_ad_id && referral.adId) {
        await prisma.contact.update({
            where: { phone_number: phone },
            data: {
                meta_ad_id: referral.adId,
                meta_campaign_id: details.campaignId,
                meta_adset_id: details.adsetId,
                meta_campaign_name: details.campaignName,
                meta_ad_creative: details.adName || referral.headline,
            },
        });
        logger.info(`[CTWA] Attributed ${phone} → campaign "${details.campaignName || 'unknown'}" (ad ${referral.adId})`);
    }

    await prisma.interaction.create({
        data: {
            tenant_id: tenantId,
            phone_number: phone,
            channel: 'whatsapp',
            direction: 'inbound',
            event_type: 'ctwa_ad_click',
            content: `Clicked WhatsApp ad: ${referral.headline || details.adName || 'Untitled'}`
                + (details.campaignName ? ` | Campaign: ${details.campaignName}` : ''),
            metadata: {
                source: 'ctwa',
                ad_id: referral.adId,
                adset_id: details.adsetId,
                campaign_id: details.campaignId,
                campaign_name: details.campaignName,
                ad_creative: details.adName,
                headline: referral.headline,
                body: referral.body,
                source_type: referral.sourceType,
                source_url: referral.sourceUrl,
                ctwa_clid: referral.ctwaClid,
                first_message: firstMessage || null,
            },
        },
    });
}

/**
 * Full handling for an inbound message that carries a CTWA referral.
 *
 * Returns TRUE when the advertised property card was sent — the caller must then
 * return early, so the lead does NOT also get the generic greeting or the
 * List-vs-Find disambiguation (asking "list or find?" is nonsense for someone who
 * just tapped an ad for a specific flat).
 *
 * Returns FALSE when we could not identify the advertised listing; attribution has
 * still been written and the normal pipeline should continue as before.
 */
export async function handleCtwaAdLead(params: {
    phone: string;
    tenantId: string;
    referral: CtwaReferral;
    firstMessage?: string;
    /** True when THIS message created the contact. Drives inventory-manager routing:
     *  a brand-new lead goes to whoever manages the advertised listing, an existing
     *  customer keeps their agent (never reassign — see feedback_lead_assignment_dedup). */
    isNewContact?: boolean;
}): Promise<boolean> {
    const { phone, tenantId, referral, firstMessage, isNewContact } = params;

    try {
        const details = referral.adId ? await fetchAdDetails(referral.adId) : NO_AD_DETAILS;
        await persistAttribution(phone, tenantId, referral, details, firstMessage);

        // Which listing is this ad selling? Ad name first (we control it), then the
        // creative headline, then the customer's pre-filled first message.
        const displayId = extractDisplayId(details.adName, referral.headline, referral.body, firstMessage);
        if (!displayId) {
            logger.info(`[CTWA] No listing code on ad "${details.adName || referral.adId}" — normal pipeline`);
            return false;
        }

        const inv = await prisma.inventory.findFirst({
            where: { display_id: displayId },
            select: {
                id: true, display_id: true, status: true, intent: true, taxonomy_node_id: true,
                specs: true, locality: true, city: true, district: true, location: true,
                // routing: who manages this listing
                assigned_agent_id: true, owning_manager_id: true, uploaded_by_agent_id: true,
            },
        });
        if (!inv) {
            logger.warn(`[CTWA] Ad references ${displayId} but no such listing — normal pipeline`);
            return false;
        }
        if (inv.status !== 'active') {
            // Don't market a sold/withdrawn flat. Fall through so a human picks it up.
            logger.warn(`[CTWA] Advertised listing ${displayId} is '${inv.status}', not active — normal pipeline`);
            return false;
        }

        // ── Stamp the lead's requirements from the advertised listing ──────────────
        // Same helper the website enquiry path uses. Only fills what's still blank, so
        // a returning customer's real requirements are never clobbered by an ad click.
        const { buildDemandFromInventory } = await import('../utils/website_lead');
        const demand = buildDemandFromInventory(inv as any);

        const current = await prisma.contact.findUnique({
            where: { phone_number: phone },
            select: { demand_taxonomy_node_id: true, demand_schema_values: true, preferred_location: true, contact_type: true },
        });
        const patch: Record<string, any> = {};
        if (current && !current.demand_taxonomy_node_id && demand.demand_taxonomy_node_id) {
            patch.demand_taxonomy_node_id = demand.demand_taxonomy_node_id;
        }
        if (current && !current.demand_schema_values && demand.demand_schema_values) {
            patch.demand_schema_values = demand.demand_schema_values;
        }
        if (current && !current.preferred_location && demand.preferred_location) {
            patch.preferred_location = demand.preferred_location;
        }
        if (current && current.contact_type === 'UNKNOWN' && demand.contact_type) {
            patch.contact_type = demand.contact_type;
            patch.intent = demand.intent;
            patch.demand_budget_type = demand.demand_budget_type;
        }
        if (Object.keys(patch).length) {
            await prisma.contact.update({ where: { phone_number: phone }, data: patch });
            logger.info(`[CTWA] Requirements copied from ${displayId} for ${phone}: ${Object.keys(patch).join(', ')}`);
        }

        // ── Route to the inventory manager ─────────────────────────────────────────
        // Same rule the website enquiry path uses (Puneet, 2026-06-11, see
        // utils/website_lead.ts#resolveWebsiteLeadHandler): a NEW lead goes to whoever
        // manages the advertised listing — assigned_agent → owning_manager → uploader.
        // An EXISTING customer keeps their agent; re-assigning on re-ingest is the
        // non-idempotent bug called out in feedback_lead_assignment_dedup.
        // We can't call resolveWebsiteLeadHandler directly here: by this point the
        // contact always exists (the inbound pipeline just created it and the db.ts
        // $extends auto-assigned it), so its "existing → keep agent" branch would
        // always win and the listing owner would never be reached.
        let assignedAgentId: string | null = null;
        if (isNewContact) {
            const handlerId = inv.assigned_agent_id || inv.owning_manager_id || inv.uploaded_by_agent_id || null;
            if (handlerId) {
                const { assignContact } = await import('./assign_contact');
                await assignContact(phone, handlerId, 'uploader');
                assignedAgentId = handlerId;
                logger.info(`[CTWA] Routed new ad lead ${phone} to inventory manager ${handlerId} for ${displayId}`);
            }
        }

        // ── Make sure a deal exists, then send THAT property's card ────────────────
        // shareSpecificProperty needs a deal: it records the share against the deal so
        // the card's Schedule-Visit / Call-Back / Next buttons route correctly, and so
        // the same flat is never sent twice. Passing assignedAgentId keeps lead owner ==
        // deal coordinator (ensure_deal sets coordinator_agent_id + executive_agent_id
        // from it) — the invariant in feedback_lead_deal_sync_traps.
        const { ensureDealForLead } = await import('./ensure_deal');
        const { dealId } = await ensureDealForLead({
            contactPhone: phone,
            source: 'whatsapp',
            ...(assignedAgentId ? { assignedAgentId } : {}),
        });

        const { shareSpecificProperty } = await import('./property_sharing');
        const sent = await shareSpecificProperty(dealId, inv.id, null);

        if (sent) {
            logger.info(`[CTWA] Sent advertised property ${displayId} to ${phone} (deal ${dealId})`);
            return true;
        }
        logger.warn(`[CTWA] Card send failed for ${displayId} → ${phone}; falling back to normal pipeline`);
        return false;
    } catch (err) {
        captureBackgroundError(err, { source: 'ctwa_attribution.handleCtwaAdLead', phone, adId: referral.adId });
        return false;
    }
}

/**
 * Attribution-only entry point (no property handoff). Kept for callers that just want
 * the meta_* columns stamped.
 */
export async function attributeCtwaLead(params: {
    phone: string;
    tenantId: string;
    referral: CtwaReferral;
}): Promise<void> {
    const { phone, tenantId, referral } = params;
    try {
        const details = referral.adId ? await fetchAdDetails(referral.adId) : NO_AD_DETAILS;
        await persistAttribution(phone, tenantId, referral, details);
    } catch (err) {
        captureBackgroundError(err, { source: 'ctwa_attribution', phone, adId: referral.adId });
    }
}
