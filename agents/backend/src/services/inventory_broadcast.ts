/**
 * Inventory Broadcast Service — Phase 9 (DEC-003); hardened 2026-06-22 (QUALIFIED-2).
 *
 * When a new inventory item goes active/verified, broadcast it to QUALIFIED deals it GENUINELY
 * matches. Hardening:
 *   - Relevance is verified through the SAME MatchingEngine + MIN_MATCH_SCORE as shareNextProperty,
 *     so it respects the F2 BHK hard-filter, category (res/com), budget band and geo — no more
 *     off-BHK / low-relevance "broadcast" cards (the old loose filter + legacy v2 template bypassed
 *     the F2 fixes through a side door).
 *   - The card is the canonical v5 template via shareInventoryCard (was rp_property_card_*_v2).
 *   - Dedup checks THIS inventory ↔ THIS deal (the old findFirst matched only deal_id, then compared
 *     one arbitrary row → could re-send a property the customer had already seen).
 *   - ai_paused deals are skipped (filtered in the query).
 *
 * Fires fire-and-forget from the inventory active/approve route — errors are logged, not re-thrown.
 */

import prisma from '../db';
import logger from '../utils/logger';
import { MatchingEngine, buildMatchCriteriaFromLead } from './matching_engine';
import { shareInventoryCard } from './property_sharing';

const EVT_PROPERTY_SHARED = 'property_shared';
const INTER_SEND_DELAY_MS = 200;
const MIN_MATCH_SCORE = 50; // mirror property_sharing — only broadcast genuinely-relevant matches

export async function broadcastInventoryToQualifiedDeals(inventoryId: string): Promise<void> {
    const inv = await prisma.inventory.findUnique({
        where: { id: inventoryId },
        include: { flat_property_type: true, property_type_link: true },
    });
    if (!inv) {
        logger.warn(`[InvBroadcast] Inventory ${inventoryId} not found — skipping broadcast`);
        return;
    }

    const qualifiedDeals = await prisma.transaction.findMany({
        where: { tenant_id: inv.tenant_id, status: 'QUALIFIED', ai_paused: false },
        include: {
            demand_contact: {
                select: {
                    phone_number: true, name: true, preferred_location: true,
                    preferred_lat: true, preferred_lng: true,
                    category_id: true, sub_category_id: true, type_id: true,
                    demand_taxonomy_node_id: true, demand_schema_values: true,
                },
            },
        },
    });

    logger.info(`[InvBroadcast] Inventory ${inventoryId} — evaluating ${qualifiedDeals.length} QUALIFIED deals`);
    const engine = new MatchingEngine();
    let sent = 0, skipped = 0;

    for (const deal of qualifiedDeals) {
        try {
            const phone = deal.demand_contact?.phone_number;
            if (!phone) { skipped++; continue; }

            // Dedup: has THIS inventory already been shared to THIS deal? (old code keyed only on deal_id)
            const alreadyShared = await prisma.interaction.findFirst({
                where: {
                    event_type: EVT_PROPERTY_SHARED,
                    AND: [
                        { metadata: { path: ['deal_id'], equals: deal.id } },
                        { metadata: { path: ['inventory_id'], equals: inventoryId } },
                    ],
                },
                select: { id: true },
            });
            if (alreadyShared) { skipped++; continue; }

            // Relevance: confirm THIS inventory is a genuine >=MIN_MATCH_SCORE match for the deal, via the
            // SAME engine path as shareNextProperty (so the F2 BHK filter + category + budget band apply).
            const dealSchema = ((deal as any).demand_schema_values ?? {}) as Record<string, any>;
            const bhkMatch = (dealSchema.bhk != null ? String(dealSchema.bhk) : '').match(/\d+/)?.[0];
            const criteria = buildMatchCriteriaFromLead({
                intent: deal.demand_intent === 'rent_lease' || deal.demand_intent === 'rent' ? 'rent'
                    : deal.demand_intent === 'buy' ? 'buy'
                    : (deal.demand_budget_max && Number(deal.demand_budget_max) < 200000) ? 'rent' : 'buy',
                demand_type_slug: null,
                type_id: deal.demand_contact?.type_id || null,
                sub_category_id: deal.demand_contact?.sub_category_id || null,
                category_id: deal.demand_contact?.category_id || null,
                budget_min: deal.demand_budget_min,
                budget_max: deal.demand_budget_max,
                preferred_location: deal.demand_location || deal.demand_contact?.preferred_location || null,
                preferred_lat: deal.demand_contact?.preferred_lat ?? null,
                preferred_lng: deal.demand_contact?.preferred_lng ?? null,
                demand_bhk: bhkMatch ? parseInt(bhkMatch, 10) : null,
                demand_taxonomy_node_id: (deal as any).demand_taxonomy_node_id ?? deal.demand_contact?.demand_taxonomy_node_id ?? null,
                demand_schema_values: (deal as any).demand_schema_values ?? deal.demand_contact?.demand_schema_values ?? null,
            });
            const matches = await engine.findMatches(criteria, 50);
            const hit: any = matches.find((m: any) => m.id === inventoryId);
            if (!hit || (hit.match_score ?? 0) < MIN_MATCH_SCORE) { skipped++; continue; }

            // Send the canonical v5 card (same as the main share path).
            const ok = await shareInventoryCard(phone, inv);
            if (!ok) { skipped++; continue; }

            await prisma.interaction.create({
                data: {
                    tenant_id: inv.tenant_id,
                    phone_number: phone,
                    channel: 'whatsapp',
                    direction: 'outbound',
                    event_type: EVT_PROPERTY_SHARED,
                    content: `[Broadcast] Shared property card: ${inv.display_id || inv.apartment_name || inv.type} (${hit.match_score}%)`,
                    metadata: { deal_id: deal.id, inventory_id: inventoryId, broadcast: true, match_score: hit.match_score },
                },
            });
            sent++;
            await delay(INTER_SEND_DELAY_MS);
        } catch (err) {
            logger.error(`[InvBroadcast] Failed for deal ${deal.id}:`, err);
        }
    }

    logger.info(`[InvBroadcast] Inventory ${inventoryId} broadcast complete — sent=${sent} skipped=${skipped}`);
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
