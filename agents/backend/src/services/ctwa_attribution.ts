/**
 * CTWA (Click-to-WhatsApp) ad attribution.
 *
 * Meta attaches a `referral` object to the FIRST inbound WhatsApp message after
 * someone taps a Click-to-WhatsApp ad. It carries the ad id (`source_id`) plus the
 * creative's headline/body. We resolve ad → ad set → campaign through the Graph API
 * and persist it onto the Contact's existing meta_* columns — the same ones the
 * Facebook lead-form path fills (`integrations/facebook.ts`) — so ad-sourced
 * WhatsApp leads are identifiable in the admin dashboard instead of collapsing into
 * the generic "whatsapp" source bucket.
 *
 * Deliberately additive: `contact.source` is left as 'whatsapp'. Routing, round-robin
 * and distribution logic switch on that string, so attribution rides in the meta_*
 * columns rather than changing the source.
 *
 * Fire-and-forget throughout — inbound message processing must never block on, or
 * fail because of, attribution.
 */

import axios from 'axios';
import prisma from '../db';
import logger from '../utils/logger';
import { captureBackgroundError } from '../utils/capture';

const GRAPH_API = 'https://graph.facebook.com/v25.0';

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

const NO_AD_DETAILS: AdDetails = {
    campaignId: null,
    adsetId: null,
    campaignName: null,
    adName: null,
};

/**
 * Pull the CTWA referral off a raw inbound WhatsApp message. Returns null when the
 * message did not originate from an ad click — which is the overwhelming majority,
 * so this stays cheap on the hot path.
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
            params: {
                access_token: accessToken,
                fields: 'name,campaign_id,adset_id,campaign{name}',
            },
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

/**
 * Stamp ad attribution onto a contact and log the click to their timeline.
 *
 * First-touch wins: the meta_* columns are only written when the contact has never
 * been attributed to an ad, so a later campaign can't overwrite the ad that
 * originally produced the lead. Repeat clicks are still recorded as interactions,
 * so nothing is lost.
 */
export async function attributeCtwaLead(params: {
    phone: string;
    tenantId: string;
    referral: CtwaReferral;
}): Promise<void> {
    const { phone, tenantId, referral } = params;

    try {
        const existing = await prisma.contact.findUnique({
            where: { phone_number: phone },
            select: { meta_ad_id: true },
        });
        if (!existing) return; // contact vanished mid-flight; nothing to attribute

        const details = referral.adId ? await fetchAdDetails(referral.adId) : NO_AD_DETAILS;

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
            logger.info(
                `[CTWA] Attributed ${phone} → campaign "${details.campaignName || 'unknown'}" (ad ${referral.adId})`
            );
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
                },
            },
        });
    } catch (err) {
        captureBackgroundError(err, {
            source: 'ctwa_attribution',
            phone,
            adId: referral.adId,
        });
    }
}
