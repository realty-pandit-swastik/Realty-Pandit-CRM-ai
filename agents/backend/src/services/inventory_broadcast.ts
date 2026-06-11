/**
 * Inventory Broadcast Service — Phase 9 (DEC-003).
 *
 * When a new inventory item is set to status='verified', broadcasts it
 * to all QUALIFIED deals whose criteria match the property. Each matching
 * deal receives one property card WhatsApp (sale or rent template), logged
 * as a 'property_shared' Interaction so the timeline stays coherent with
 * the manual shareNextProperty flow.
 *
 * A 200ms inter-send delay guards against Meta rate-limit bursts.
 */

import prisma from '../db';
import logger from '../utils/logger';
import { WhatsAppService } from './whatsapp';

const whatsapp = new WhatsAppService();
const EVT_PROPERTY_SHARED = 'property_shared';
const INTER_SEND_DELAY_MS = 200;

/**
 * Broadcast a newly-verified inventory item to all QUALIFIED deals that:
 *   1. Have matching intent (buy→sell / rent→rent)
 *   2. Have budget that fits within ±30% of the inventory price
 *   3. Have not already received this specific property card
 *
 * Fires fire-and-forget from the PATCH route — errors are logged, not re-thrown.
 */
export async function broadcastInventoryToQualifiedDeals(inventoryId: string): Promise<void> {
    const inv = await prisma.inventory.findUnique({ where: { id: inventoryId } });
    if (!inv) {
        logger.warn(`[InvBroadcast] Inventory ${inventoryId} not found — skipping broadcast`);
        return;
    }

    const qualifiedDeals = await prisma.transaction.findMany({
        where: {
            tenant_id: inv.tenant_id,
            status: 'QUALIFIED',
        },
        include: {
            demand_contact: { select: { phone_number: true, name: true } },
        },
    });

    logger.info(`[InvBroadcast] Inventory ${inventoryId} — broadcasting to ${qualifiedDeals.length} QUALIFIED deals`);

    let sent = 0;
    let skipped = 0;

    for (const deal of qualifiedDeals) {
        try {
            // ai_paused lives in schema but not yet in generated Prisma client types
            if ((deal as any).ai_paused) { skipped++; continue; }

            const matched = await shouldBroadcastToDeal(inv, deal);
            if (!matched) {
                skipped++;
                continue;
            }

            const alreadyShared = await prisma.interaction.findFirst({
                where: {
                    event_type: EVT_PROPERTY_SHARED,
                    metadata: {
                        path: ['deal_id'],
                        equals: deal.id,
                    },
                },
                // Use raw query to also check inventory_id in metadata
                // Prisma JSON path filter on nested key — check both conditions
            });

            // Verify the inventory_id inside metadata matches too
            if (alreadyShared) {
                const meta: any = alreadyShared.metadata;
                if (meta?.inventory_id === inventoryId) {
                    logger.info(`[InvBroadcast] Deal ${deal.id} already received inventory ${inventoryId} — skip`);
                    skipped++;
                    continue;
                }
            }

            const phone = deal.demand_contact?.phone_number;
            if (!phone) {
                logger.warn(`[InvBroadcast] Deal ${deal.id} has no contact phone — skip`);
                skipped++;
                continue;
            }

            const params = buildCardParams(inv);
            const templateName = isRentIntent(inv.intent) ? 'rp_property_card_rent_v2' : 'rp_property_card_sale_v2';
            const API_BASE = process.env.API_BASE_URL || 'https://api.realtypandit.in';
            const DEFAULT_IMAGE = 'https://realtypandit.in/logo.png';
            const rawImageUrl: string | undefined = (inv.media_urls as string[])?.[0];
            const imageUrl = rawImageUrl
                ? (rawImageUrl.startsWith('http') ? rawImageUrl : `${API_BASE}${rawImageUrl}`)
                : DEFAULT_IMAGE;

            await whatsapp.sendTemplate(phone, templateName, params, imageUrl);

            await prisma.interaction.create({
                data: {
                    tenant_id: inv.tenant_id,
                    phone_number: phone,
                    channel: 'whatsapp',
                    direction: 'outbound',
                    event_type: EVT_PROPERTY_SHARED,
                    content: `[Broadcast] Shared property card: ${params.p1} at ${params.p2}`,
                    metadata: {
                        deal_id: deal.id,
                        inventory_id: inventoryId,
                        broadcast: true,
                    },
                },
            });

            sent++;
            logger.info(`[InvBroadcast] Sent ${templateName} to deal ${deal.id} (${phone})`);

            await delay(INTER_SEND_DELAY_MS);
        } catch (err) {
            logger.error(`[InvBroadcast] Failed for deal ${deal.id}:`, err);
        }
    }

    logger.info(`[InvBroadcast] Inventory ${inventoryId} broadcast complete — sent=${sent} skipped=${skipped}`);
}

/**
 * Returns true if this inventory should be broadcast to this deal.
 * Checks: intent match, budget fit, location (soft).
 */
async function shouldBroadcastToDeal(inv: any, deal: any): Promise<boolean> {
    // 1. Intent match
    const dealIntent = resolveDealIntent(deal);
    const invIsRent = isRentIntent(inv.intent);
    if (dealIntent === 'rent' && !invIsRent) return false;
    if (dealIntent === 'buy' && invIsRent) return false;

    // 2. Budget fit — inventory price must fall within ±30% of deal budget window
    const invPrice = inv.price ? Number(inv.price) : null;
    if (invPrice !== null && invPrice > 0) {
        if (deal.demand_budget_max && invPrice > Number(deal.demand_budget_max) * 1.3) return false;
        if (deal.demand_budget_min && invPrice < Number(deal.demand_budget_min) * 0.7) return false;
    }

    // 3. Location soft match — only skip if both sides have location AND they clearly differ
    if (deal.demand_location && inv.location) {
        const dealLoc = deal.demand_location.toLowerCase();
        const invLoc = (inv.city || inv.district || inv.locality || inv.location || '').toLowerCase();
        if (invLoc && dealLoc && !invLoc.includes(dealLoc) && !dealLoc.includes(invLoc)) {
            return false;
        }
    }

    return true;
}

function resolveDealIntent(deal: any): 'buy' | 'rent' {
    const di = (deal.demand_intent || '').toLowerCase();
    if (di === 'rent' || di === 'rent_lease') return 'rent';
    if (di === 'buy') return 'buy';
    // Fallback: low budget → rent
    if (deal.demand_budget_max && Number(deal.demand_budget_max) < 200000) return 'rent';
    return 'buy';
}

function isRentIntent(intent: string): boolean {
    return intent === 'rent' || intent === 'rent_lease' || intent === 'lease';
}

function buildCardParams(inv: any): Record<string, string> {
    const specs = typeof inv.specs === 'string' ? JSON.parse(inv.specs) : (inv.specs || {});
    // Room count: canonical taxonomy keys win (bhk/rooms); legacy bhk_count/bedrooms fall back.
    const rooms = specs.bhk ?? specs.rooms ?? specs.bhk_count ?? specs.bedrooms;
    const bhk = rooms ? `${rooms}BHK ${inv.type || 'Property'}` : (inv.type || 'Property');
    const society = specs.society_name || inv.locality || inv.location || 'Property';
    const city = inv.city || inv.district || 'UP';
    const price = formatPrice(inv.price, inv.price_unit);
    // specs.* is SOLE SoT (Phase 3 dedup, 2026-05-28) — column fallbacks dropped.
    const highlight1 = specs.furnishing
        ? capitalize(specs.furnishing)
        : (isRentIntent(inv.intent) ? 'Available Now' : 'Ready to Move');
    const highlight2 = inv.floor_number
        ? `${inv.floor_number} Floor`
        : (specs.facing ? `${specs.facing} Facing` : 'Prime Location');
    const highlight3 = buildAmenityLine(specs.amenities);
    return { p1: bhk, p2: society, p3: city, p4: price, p5: highlight1, p6: highlight2, p7: highlight3 };
}

function formatPrice(price: any, unit?: string | null): string {
    if (!price) return 'Price on request';
    const n = Number(price);
    if (!Number.isFinite(n) || n <= 0) return 'Price on request';
    const u = (unit || '').toLowerCase();
    if (u === 'lakh') return `${n % 1 === 0 ? n : n.toFixed(1)} Lakh`;
    if (u === 'crore') return `${n % 1 === 0 ? n : n.toFixed(2)} Cr`;
    if (u === 'thousand') return `${n.toFixed(0)}K`;
    if (n >= 1e7) return `${(n / 1e7).toFixed(1)} Cr`;
    if (n >= 1e5) return `${(n / 1e5).toFixed(1)} Lakh`;
    return `${(n / 1e3).toFixed(0)}K`;
}

function buildAmenityLine(features: any): string {
    if (!features) return 'Gated Society';
    const list: string[] = Array.isArray(features)
        ? features
        : Object.keys(features).filter(k => features[k]);
    const picks = list.slice(0, 3).map(f =>
        f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    );
    return picks.length ? picks.join(' | ') : 'Gated Society';
}

function capitalize(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
