/**
 * Property Sharing Service — Stage 2 QUALIFIED card-by-card sharing (DEC-003 / Stage 2 KRA).
 *
 * Sends one `rp_property_card` per call, in match-score order, skipping properties
 * already shared with this deal. Tracks shares via Interaction(event_type='property_shared')
 * so the deal feed shows full sharing history without a new model.
 *
 * Trigger points:
 *   - Auto: on QUALIFIED entry (status_changed → QUALIFIED) — share first match
 *   - Manual: agent clicks "Share next property" in deal detail UI (future)
 *   - Reply-button: customer taps "Next Option" on previous card (future button-payload routing)
 */

import prisma from '../db';
import logger from '../utils/logger';
import { WhatsAppService } from './whatsapp';
import { MatchingEngine, buildMatchCriteriaFromLead } from './matching_engine';

const whatsapp = new WhatsAppService();
const EVT_PROPERTY_SHARED = 'property_shared';

/**
 * Share the next un-shared matching property for a deal via WhatsApp.
 * Returns the inventory_id shared, or null if nothing left to share.
 */
export async function shareNextProperty(dealId: string): Promise<string | null> {
    const deal = await prisma.transaction.findUnique({
        where: { id: dealId },
        include: {
            demand_contact: {
                select: {
                    phone_number: true, name: true,
                    // Classification tree IDs live on the contact, not the deal — pull
                    // them so matching uses the shared tree (A+B, 2026-05-16).
                    category_id: true, sub_category_id: true, type_id: true,
                    // Geo on the contact → precise radius matching for auto-share (2026-06-01).
                    preferred_location: true, preferred_lat: true, preferred_lng: true,
                    demand_taxonomy_node_id: true, demand_schema_values: true,
                },
            },
        },
    });
    if (!deal || !deal.demand_contact?.phone_number) {
        logger.warn(`[PropShare] Deal ${dealId} missing or has no contact phone`);
        return null;
    }

    // Already-shared inventory IDs (oldest first ordering doesn't matter — we use a Set).
    const shared = await prisma.interaction.findMany({
        where: {
            event_type: EVT_PROPERTY_SHARED,
            metadata: { path: ['deal_id'], equals: dealId },
        },
        select: { metadata: true },
    });
    const sharedIds = new Set<string>(
        shared.map((s: any) => s.metadata?.inventory_id).filter(Boolean)
    );

    // Find fresh matches using the existing engine. Phase 5 (2026-05-29):
    // legacy demand_bedrooms / demand_type_slug / demand_property_type columns
    // dropped on Transaction. Derive bhk from canonical demand_schema_values
    // and let the engine read taxonomy_node + schema_values directly.
    const engine = new MatchingEngine();
    const dealSchema = ((deal as any).demand_schema_values ?? {}) as Record<string, any>;
    const bhkRaw = dealSchema.bhk != null ? String(dealSchema.bhk) : null;
    const bhkMatch = bhkRaw?.match(/\d+/)?.[0];
    const criteria = buildMatchCriteriaFromLead({
        intent: (deal as any).demand_intent === 'rent_lease' ? 'rent'
            : (deal as any).demand_intent === 'rent' ? 'rent'
            : (deal as any).demand_intent === 'buy' ? 'buy'
            : (deal.demand_budget_max && Number(deal.demand_budget_max) < 200000) ? 'rent'
            : 'buy',
        demand_type_slug: null,
        type_id: deal.demand_contact?.type_id || null,
        sub_category_id: deal.demand_contact?.sub_category_id || null,
        category_id: deal.demand_contact?.category_id || null,
        budget_min: deal.demand_budget_min,
        budget_max: deal.demand_budget_max,
        preferred_location: deal.demand_location || (deal as any).demand_contact?.preferred_location || null,
        preferred_lat: (deal as any).demand_contact?.preferred_lat ?? null,
        preferred_lng: (deal as any).demand_contact?.preferred_lng ?? null,
        demand_bhk: bhkMatch ? parseInt(bhkMatch, 10) : null,
        demand_taxonomy_node_id: (deal as any).demand_taxonomy_node_id
            ?? (deal as any).demand_contact?.demand_taxonomy_node_id
            ?? null,
        demand_schema_values: (deal as any).demand_schema_values
            ?? (deal as any).demand_contact?.demand_schema_values
            ?? null,
    });
    const matches = await engine.findMatches(criteria, 20);

    const next = matches.find((m: any) => !sharedIds.has(m.id));
    if (!next) {
        // Dedup: if we already sent an exhausted notification for this deal in last 5 minutes,
        // skip silently (race condition between cron broadcast + manual share + inventory verify).
        const recentExhausted = await prisma.interaction.findFirst({
            where: {
                event_type: 'property_share_exhausted',
                metadata: { path: ['deal_id'], equals: dealId },
                created_at: { gte: new Date(Date.now() - 5 * 60 * 1000) },
            },
            select: { id: true },
        });
        if (recentExhausted) {
            logger.info(`[PropShare] Skipping duplicate exhausted notification for deal ${dealId} (sent in last 5min)`);
            return null;
        }

        // Exhausted — let the customer know we'll keep looking.
        try {
            await whatsapp.sendTemplate(deal.demand_contact.phone_number, 'rp_all_properties_shared', {});
            await prisma.interaction.create({
                data: {
                    tenant_id: deal.tenant_id,
                    phone_number: deal.demand_contact.phone_number,
                    channel: 'whatsapp',
                    direction: 'outbound',
                    event_type: 'property_share_exhausted',
                    content: 'All available matching properties shared',
                    metadata: { deal_id: dealId },
                },
            });
        } catch (err) {
            logger.warn(`[PropShare] rp_all_properties_shared send failed:`, err);
        }
        return null;
    }

    const inv: any = next; // MatchedProperty has flattened inventory fields
    // bhk/society are used in the interaction log below; the actual card is built + sent by
    // shareInventoryCard (category-correct v5 template + link). buildV5Card handles the
    // MatchedProperty shape (typeName ← prettifyType(type) when no flat_property_type relation).
    const beds = inv.specs?.bhk || inv.specs?.rooms || inv.specs?.bhk_count || inv.specs?.bedrooms || bhkFromSlug(inv.slug);
    const bhk = beds ? `${beds}BHK ${inv.type || 'Property'}` : (inv.type || 'Property');
    const society = inv.specs?.society_name || inv.location || 'Property';

    const sent = await shareInventoryCard(deal.demand_contact.phone_number, inv);
    if (!sent) {
        logger.error(`[PropShare] Failed to send property card for deal ${dealId} property ${inv.id}`);
        return null;
    }

    await prisma.interaction.create({
        data: {
            tenant_id: deal.tenant_id,
            phone_number: deal.demand_contact.phone_number,
            channel: 'whatsapp',
            direction: 'outbound',
            event_type: EVT_PROPERTY_SHARED,
            content: `Shared property card: ${bhk} at ${society}`,
            metadata: { deal_id: dealId, inventory_id: inv.id, match_score: (next as any).match_score },
        },
    });

    logger.info(`[PropShare] Deal ${dealId} → property ${inv.id} (${bhk} @ ${society}) shared`);
    return inv.id;
}

/**
 * Share a specific inventory item for a deal — called from Deal Workspace.
 * Agent manually selects the property; no auto-dedup logic applied.
 */
export async function shareSpecificProperty(dealId: string, inventoryId: string): Promise<boolean> {
    const deal = await prisma.transaction.findUnique({
        where: { id: dealId },
        include: { demand_contact: { select: { phone_number: true, name: true } } },
    });
    if (!deal?.demand_contact?.phone_number) {
        logger.warn(`[PropShare] Deal ${dealId} missing or has no contact phone`);
        return false;
    }

    const inv: any = await prisma.inventory.findUnique({
        where: { id: inventoryId },
        include: { flat_property_type: true, property_type_link: true },
    });
    if (!inv) {
        logger.warn(`[PropShare] Inventory ${inventoryId} not found`);
        return false;
    }

    // typeName/bhk/society are used in the interaction log below; the actual card is built + sent
    // by shareInventoryCard (the SAME category-correct v5 template + link the Inventory share uses).
    const typeName = inv.flat_property_type?.name || inv.property_type_link?.name || prettifyType(inv.type);
    const beds = inv.specs?.bhk || inv.specs?.rooms || inv.specs?.bhk_count || inv.specs?.bedrooms || bhkFromSlug(inv.slug);
    const bhk = beds ? `${beds}BHK ${typeName}` : typeName;
    const society = inv.specs?.society_name || inv.locality || inv.city || 'Property';

    const sent = await shareInventoryCard(deal.demand_contact.phone_number, inv);
    if (!sent) {
        logger.error(`[PropShare] Failed to send specific property card for deal ${dealId} inv ${inventoryId}`);
        return false;
    }

    await prisma.interaction.create({
        data: {
            tenant_id: deal.tenant_id,
            phone_number: deal.demand_contact.phone_number,
            channel: 'whatsapp',
            direction: 'outbound',
            event_type: EVT_PROPERTY_SHARED,
            content: `Shared property card (manual): ${bhk} at ${society}`,
            metadata: { deal_id: dealId, inventory_id: inventoryId, manual: true },
        },
    });

    await prisma.transaction.update({
        where: { id: dealId },
        data: { last_team_action_at: new Date() },
    });

    logger.info(`[PropShare] Deal ${dealId} → property ${inventoryId} (${bhk} @ ${society}) shared manually`);
    return true;
}

/**
 * Send ONE inventory item to any phone (client/partner) as the v4 property-card TEMPLATE
 * (Image header + body + 3 buttons) — the SAME path the deal "Company WhatsApp" share uses.
 *
 * Reused by the Inventory page + External-Lead "Send WhatsApp" (POST /inventory/:id/share-to-client)
 * so those surfaces deliver the approved UTILITY template instead of a raw free-form sendText/sendImage
 * that Meta silently rejects outside the 24h window. Mirrors shareSpecificProperty's param build.
 *
 * `inv` is the already-fetched Inventory row (must include flat_property_type + scalar fields).
 * Returns true only if Meta accepted the card — sendPropertyCard/sendTemplate throw strictly on
 * failure (callWhatsAppAPIStrict), so the boolean is ACCURATE (unlike the old swallowed sendText).
 */
// Classify an inventory row + build the category-correct **v5** card (clickable link in body).
// Picks 1 of the 8 approved v5 templates by:
//   - residential vs commercial ← inv.category ('residential' | 'commercial' | 'agricultural');
//     agricultural land sits in the Commercial tree → treated as commercial.
//   - plot vs building ← legacy type slug / type name matching /plot|land|orchard/.
//   - sale vs rent ← inv.intent.
// Builds {{1}} (config: BHK for residential, type [+rooms] for commercial, plot label for land),
// {{4}} (area/plot-area), {{5}}/{{6}} (furnishing+feature, or facing+ownership for plots), {{7}} (link).
function buildV5Card(inv: any): { template: string; params: Record<string, string> } {
    const s = (inv.specs || {}) as Record<string, any>;
    const isRent = ['rent', 'rent_lease', 'lease'].includes(inv.intent);
    const isCommercial = String(inv.category || '').toLowerCase() !== 'residential';
    const typeStr = `${inv.type || ''} ${inv.flat_property_type?.name || ''} ${inv.property_type_link?.name || ''}`.toLowerCase();
    const isPlot = /plot|land|orchard/.test(typeStr) || String(inv.category || '').toLowerCase() === 'agricultural';

    const cat = isCommercial ? (isPlot ? 'com_plot' : 'com') : (isPlot ? 'res_plot' : 'res');
    const template = `rp_property_card_${cat}_${isRent ? 'rent' : 'sale'}_v5`;

    const typeName = inv.flat_property_type?.name || inv.property_type_link?.name || prettifyType(inv.type);
    const location = [inv.locality, inv.city].filter(Boolean).join(', ') || inv.city || inv.district || inv.full_address || 'Location on request';
    const price = formatPrice(inv.price, inv.price_unit);
    const link = `https://www.realtypandit.in/properties/${inv.display_id || inv.id}`;

    let p1: string, p4: string, p5: string, p6: string;
    if (isPlot) {
        // Plots/land: no BHK/rooms/furnishing/floor — plot area + facing/road + ownership.
        const plotArea = s['plot-area'] || s.area;
        const plotUnit = s['plot-area-unit'] || s.area_unit || 'sqyd';
        p1 = typeName || (isCommercial ? 'Commercial Land' : 'Residential Plot');
        p4 = plotArea ? `${plotArea} ${plotUnit}` : 'Area on request';
        p5 = `${s.facing || 'Open'}${s['road-facing'] === 'Yes' ? ' · Road-facing' : ''}`;
        p6 = `${s['ownership-tenure'] || 'Freehold'}${s['boundary-wall'] === 'Yes' ? ' · Boundary wall' : ''}`;
    } else if (isCommercial) {
        // Commercial building: Rooms only if present (most are area-based), area + area-type, washrooms.
        const rooms = s.rooms;
        p1 = rooms ? `${typeName} (${rooms} Rooms)` : typeName;
        p4 = s.area ? `${s.area} ${s.area_unit || 'sqft'}${s['area-type'] ? ` · ${s['area-type']}` : ''}` : 'Area on request';
        p5 = s.furnishing ? capitalize(s.furnishing) : (isRent ? 'Available Now' : 'Ready to Move');
        const baths = s.bathrooms;
        p6 = baths ? `${baths} Washroom${Number(baths) > 1 ? 's' : ''}`
            : (s.floors ? `Floor ${s.floors}` : buildAmenityLine(s.amenities));
    } else {
        // Residential building: BHK (never "rooms"), area, furnishing, floor/facing.
        const beds = s.bhk || s.bhk_count || s.bedrooms || bhkFromSlug(inv.slug);
        p1 = beds ? `${beds} BHK ${typeName}` : typeName;
        p4 = s.area ? `${s.area} ${s.area_unit || 'sqft'}` : 'Area on request';
        p5 = s.furnishing ? capitalize(s.furnishing) : (isRent ? 'Available Now' : 'Ready to Move');
        p6 = s.floors ? `Floor ${s.floors}` : (s.facing ? `${s.facing} Facing` : 'Prime Location');
    }
    return { template, params: { p1, p2: location, p3: price, p4, p5, p6, p7: link } };
}

/**
 * Send ONE inventory item to any phone (client/partner) as the category-correct **v5** property
 * card (Image header + body with clickable link + 3 buttons). Reused by the Inventory page +
 * External-Lead "Send WhatsApp" (POST /inventory/:id/share-to-client). Falls back to the legacy
 * v4 card if a v5 send fails. Returns true only if Meta accepted the card (sendTemplate throws
 * strictly on failure), so the boolean is ACCURATE.
 */
export async function shareInventoryCard(phone: string, inv: any): Promise<boolean> {
    const imageUrl = await pickSendableImage(inv.media_urls);
    const { template, params } = buildV5Card(inv);
    try {
        await whatsapp.sendTemplate(phone, template, params, imageUrl);
        logger.info(`[PropShare] Inventory ${inv.id} → ${phone} via ${template} (${params.p1})`);
        return true;
    } catch (e5) {
        logger.warn(`[PropShare] ${template} failed for ${inv.id} (${(e5 as Error).message}); falling back to v4 card`);
        // Resilience fallback: legacy v4/v2 card (generic labels, no link).
        try {
            const typeName = inv.flat_property_type?.name || inv.property_type_link?.name || prettifyType(inv.type);
            const beds = inv.specs?.bhk || inv.specs?.rooms || inv.specs?.bhk_count || inv.specs?.bedrooms || bhkFromSlug(inv.slug);
            const bhk = beds ? `${beds}BHK ${typeName}` : typeName;
            const society = inv.specs?.society_name || inv.locality || inv.city || 'Property';
            const city = inv.city || inv.district || 'India';
            const price = formatPrice(inv.price, inv.price_unit);
            const h1 = inv.specs?.furnishing ? capitalize(inv.specs.furnishing) : (inv.intent === 'rent' ? 'Available Now' : 'Ready to Move');
            const h2 = inv.specs?.floors ? `Floor ${inv.specs.floors}` : (inv.specs?.facing ? `${inv.specs.facing} Facing` : 'Prime Location');
            const h3 = buildAmenityLine(inv.specs?.amenities);
            await sendPropertyCard(phone, inv.intent, { p1: bhk, p2: society, p3: city, p4: price, p5: h1, p6: h2, p7: h3 }, imageUrl);
            logger.info(`[PropShare] Inventory ${inv.id} → ${phone} via v4 fallback`);
            return true;
        } catch (e4) {
            logger.error(`[PropShare] inventory card failed for ${inv.id} (v5 + v4 fallback):`, e4);
            return false;
        }
    }
}

function formatPrice(price: any, unit?: string): string {
    if (!price) return 'Price on request';
    const n = Number(price);
    if (!Number.isFinite(n) || n <= 0) return 'Price on request';
    // unit='lakh'|'crore'|'thousand'|null (raw rupees)
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
    const list: string[] = Array.isArray(features) ? features : Object.keys(features).filter(k => features[k]);
    const picks = list.slice(0, 3).map(f => f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
    return picks.length ? picks.join(' | ') : 'Gated Society';
}

function capitalize(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
}

// Turn a raw type slug ("builder_floor") into a readable label ("Builder Floor").
function prettifyType(type?: string | null): string {
    if (!type) return 'Property';
    return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Most listings don't fill specs.bhk_count, but the slug encodes it ("3bhk-villa-…").
function bhkFromSlug(slug?: string | null): number | null {
    const m = (slug || '').match(/(\d+)\s*bhk/i);
    return m ? parseInt(m[1], 10) : null;
}

const API_BASE = process.env.API_BASE_URL || 'https://api.realtypandit.in';
// Brandless fallback header image used when a property has no reachable photo.
const DEFAULT_CARD_IMAGE = 'https://realtypandit.in/logo.png';

// HEAD-check (with GET fallback) that an image URL is actually fetchable as an image.
// Meta downloads the template header image at send time; if it 404s, Meta rejects the
// whole card. We must only hand Meta a URL we've confirmed resolves.
async function isReachableImage(url: string): Promise<boolean> {
    const probe = async (method: 'HEAD' | 'GET') => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        try {
            const resp = await fetch(url, { method, signal: ctrl.signal });
            return resp;
        } finally {
            clearTimeout(t);
        }
    };
    try {
        let resp = await probe('HEAD');
        if (resp.status === 405 || resp.status === 501) resp = await probe('GET'); // some servers reject HEAD
        return resp.ok && /image\//.test(resp.headers.get('content-type') || '');
    } catch {
        return false;
    }
}

// Pick the first media URL that actually resolves to an image; otherwise the brandless
// default. Prevents Meta rejecting the card because a stale/pending photo path is gone.
async function pickSendableImage(mediaUrls?: string[] | null): Promise<string> {
    const candidates = (mediaUrls || []).filter((u) => /\.(jpe?g|png|webp)$/i.test(u));
    for (const raw of candidates) {
        const url = raw.startsWith('http') ? raw : `${API_BASE}${raw}`;
        if (await isReachableImage(url)) return url;
    }
    return DEFAULT_CARD_IMAGE;
}

// Send the property card preferring the **v4** template (request-fulfillment copy, submitted to
// Meta as UTILITY so it delivers even to marketing-opted-out recipients IF Meta keeps it UTILITY);
// fall back to the approved **v2** while v4 is pending/unapproved. v4 fails fast if unavailable —
// sendWithRetry does not retry 4xx — so the fallback costs at most one quick failed call, and the
// moment Meta approves v4 it is used automatically (no redeploy needed).
async function sendPropertyCard(
    phone: string,
    intent: string | null | undefined,
    params: Record<string, string>,
    imageUrl: string,
): Promise<void> {
    const isRent = intent === 'rent';
    const preferred = isRent ? 'rp_property_card_rent_v4' : 'rp_property_card_sale_v4';
    const fallback = isRent ? 'rp_property_card_rent_v2' : 'rp_property_card_sale_v2';
    try {
        await whatsapp.sendTemplate(phone, preferred, params, imageUrl);
    } catch (ePref) {
        logger.warn(`[PropShare] ${preferred} unavailable (${(ePref as Error).message}); falling back to ${fallback}`);
        await whatsapp.sendTemplate(phone, fallback, params, imageUrl);
    }
}
