/**
 * Portal re-enquiry handler (2026-10-09) — ONE implementation for every portal poller
 * (99acres, MagicBricks, Housing), which previously each hand-rolled the same shape with
 * different failure modes.
 *
 * A repeat portal enquiry from a known contact does three things, in order:
 *
 *   1. Attribution — the enquiry belongs to the agent whose listing generated it:
 *      explicit `attributedAgentId` (sub-user email match) wins, then the harvested
 *      listing's assignee (`resolveListingOwnerAgent`), then ensureDealForLead's own
 *      round-robin fallback. An enquiry that cannot be attributed is LOUD (warn with the
 *      raw sub-user + property code) instead of silently round-robining — that silence is
 *      how fresh enquiries kept landing on the wrong member with nobody noticing.
 *
 *   2. Deal — awaited (never fire-and-forget: the 99acres swallowed failures were one live
 *      cause of "the new lead never appeared"). Same-listing repeats inside
 *      DUPLICATE_ENQUIRY_WINDOW_DAYS attach to the existing deal by design; everything else
 *      creates a fresh deal for the attributed agent. Existing assignments are never moved (RC2).
 *
 *   3. Renewal + notify — the customer re-engaged TODAY, so the contact's cycle stamps refresh
 *      (the "Added" date surfaces as today while created_at keeps first-seen history), a
 *      timeline marker names the deal, and the attributed agent is notified. Re-enquiries
 *      previously notified NOBODY, which is why listing owners never learned about them.
 */

import prisma from '../db';
import logger from '../utils/logger';
import { ensureDealForLead } from './ensure_deal';
import { recordLeadReingest, recordLeadReengaged } from './lead_reingest';
import { resolveListingOwnerAgent } from './lead_assignment';
import { stampNewLeadCycle } from '../utils/lead_cycle';
import { notify } from './notify';

export interface PortalReenquiryArgs {
    /** E.164 contact phone. Must already exist in `contacts`. */
    phone: string;
    /** Portal source: '99acres' | 'magicbricks' | 'housing'. */
    source: string;
    /** The enquired listing/property (portal property code, project, …). */
    sourceRef: string | null;
    /** Raw sub-user value from the portal payload (email/phone), for logs + timeline. */
    subUser?: string | null;
    tenantId: string;
    /** Already-resolved attribution (sub-user match), if the caller computed one. */
    attributedAgentId?: string | null;
    /** Contact display name for notifications. */
    contactName?: string | null;
}

export interface PortalReenquiryResult {
    dealId: string;
    /** True when a fresh deal was created; false when attached to the existing one. */
    created: boolean;
    /** Agent this enquiry was attributed to (null when unattributable). */
    attributedAgentId: string | null;
    /** How attribution was resolved: explicit match, listing owner, or fallback. */
    attributionMethod: 'sub_user' | 'listing_owner' | 'unattributed';
}

export async function handlePortalReenquiry(args: PortalReenquiryArgs): Promise<PortalReenquiryResult> {
    const { phone, source, sourceRef, tenantId } = args;

    // ── 1. Attribution ──────────────────────────────────────────────
    let attributedAgentId = args.attributedAgentId ?? null;
    let attributionMethod: PortalReenquiryResult['attributionMethod'] =
        attributedAgentId ? 'sub_user' : 'unattributed';
    if (!attributedAgentId && sourceRef) {
        attributedAgentId = await resolveListingOwnerAgent({ source, sourceRef, tenantId });
        if (attributedAgentId) attributionMethod = 'listing_owner';
    }
    if (!attributedAgentId) {
        // Loud on purpose: every silently-round-robined enquiry is a listing owner who never
        // learns a customer asked about THEIR listing. The sub-user/property code here is what
        // ops needs to fix the mapping (agent nine9acres_email / harvested listing).
        logger.warn(
            `[PortalReenquiry] ${source} re-enquiry from ${phone} unattributable ` +
            `(subUser="${args.subUser ?? '(none)'}", ref="${sourceRef ?? '(none)'}") — ` +
            `deal falls back to round-robin and the listing owner is NOT notified.`,
        );
    }

    // ── 2. Timeline marker (pre-existing behaviour, kept) ───────────
    await recordLeadReingest({
        phone, source, attributedAgentId, subUser: args.subUser ?? null, sourceRef,
    });

    // ── 3. Deal — awaited. A throw propagates to the caller (the poll loops isolate per
    // lead), so a failed re-enquiry can never again vanish into a fire-and-forget .catch. ──
    const deal = await ensureDealForLead({
        contactPhone: phone,
        source,
        sourceRef,
        assignedAgentId: attributedAgentId ?? undefined,
    });

    // ── 4. Renewal — the customer re-engaged today, on both paths. ──
    await stampNewLeadCycle(phone).catch((e: any) =>
        logger.warn(`[PortalReenquiry] cycle stamp failed for ${phone}: ${e?.message}`));

    const stamp = new Date().toISOString();
    if (deal.created) {
        logger.info(
            `[PortalReenquiry] ${source} re-enquiry from ${phone} → NEW deal ${deal.dealId} ` +
            `for agent ${attributedAgentId ?? '(round-robin fallback)'} (ref=${sourceRef ?? '(none)'}) at ${stamp}`,
        );
    } else {
        // Same-listing repeat inside the dedupe window: no duplicate deal, but the re-engagement
        // is real — name the attached deal on the timeline so the row visibly changes.
        await recordLeadReengaged({
            phone, source, sourceRef, dealId: deal.dealId, attributedAgentId,
        });
        logger.info(
            `[PortalReenquiry] ${source} re-enquiry from ${phone} attached to existing deal ` +
            `${deal.dealId} (ref=${sourceRef ?? '(none)'}) at ${stamp}`,
        );
    }

    // ── 5. Notify the attributed agent — re-enquiries previously notified NOBODY. ──
    if (attributedAgentId) {
        try {
            const agent = await prisma.agent.findUnique({
                where: { id: attributedAgentId },
                select: { id: true, name: true, phone: true, email: true },
            });
            if (agent) {
                const event = deal.created ? 'lead_assigned' : 'lead_reengaged';
                await notify(event, [{
                    id: agent.id, type: 'agent' as const,
                    phone: agent.phone ?? undefined, email: agent.email || undefined, name: agent.name,
                }], {
                    name: args.contactName || 'A lead', phone,
                    property_label: sourceRef || source, source,
                    deal_id: deal.dealId,
                }).catch((err: any) => logger.warn(`[PortalReenquiry] notify ${event} failed: ${(err as Error).message}`));
            }
        } catch (err) {
            logger.warn(`[PortalReenquiry] agent lookup failed for ${attributedAgentId}: ${(err as Error).message}`);
        }
    }

    return { dealId: deal.dealId, created: deal.created, attributedAgentId, attributionMethod };
}
