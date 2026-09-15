/**
 * Buyer Workflow Engine
 *
 * Extends WorkflowEngine for buyer/tenant requirement capture.
 * Overrides commit() to save buyer data to Contact + Transaction
 * instead of creating Inventory.
 *
 * Also provides:
 * - buildMatchCriteria() — converts workflow answers to MatchCriteria
 * - sanitizeProperty() — strips owner info from property cards
 * - buildSummary() — formats buyer requirements summary
 */

import prisma from '../db';
import logger from '../utils/logger';
import { WorkflowEngine } from './workflow_engine';
import { WorkflowAnswer, WorkflowSummary } from './workflow_types';
import { BUYER_WORKFLOW_STEPS } from './buyer_workflow_definition';
import { MatchCriteria, MatchedProperty } from '../services/matching_engine';
import { normalizePhone } from '../utils/phone';
import { geocodeAddress } from '../utils/geocode';
import { foldLegacyDemand, mergeDemandSchemaValues } from '../utils/demand_canonical';
import { resolveDemandTaxonomy } from '../utils/demand_taxonomy';

// ─── Property Card (sanitized for end-user consumption) ─────────────────────

export interface PropertyCardData {
    property_id: string;
    type: string;
    bhk?: string;
    location: string;
    display_price: number;
    display_price_formatted: string;
    area?: string;
    furnishing?: string;
    floor?: string;
    amenities: string[];
    images: string[];
    videos: string[];
    match_score: number;
    intent: string;
    // Google Maps link (if lat/lng available on inventory)
    maps_link?: string;
    // Optional owner info — only included for internal admin users
    owner_name?: string;
    owner_phone?: string;
}

// ─── Budget parsing helpers ─────────────────────────────────────────────────

const CURRENCY_PATTERNS = [
    { regex: /(\d+\.?\d*)\s*(crore|cr)\b/i, multiplier: 10_000_000 },
    { regex: /(\d+\.?\d*)\s*(lakh|lac|lacs)\b/i, multiplier: 100_000 },
    { regex: /(\d+\.?\d*)\s*(k|thousand)\b/i, multiplier: 1_000 },
    { regex: /(\d+)\s*(?:per\s*month|monthly|\/month|pm)\b/i, multiplier: 1 },
];

function parseBudget(text: string): { min: number; max: number } | null {
    if (!text) return null;
    const lower = text.toLowerCase().trim();

    // Range pattern: "50 lakh to 1 crore" or "50-80 lakh"
    const rangeMatch = lower.match(/(\d+\.?\d*)\s*(crore|cr|lakh|lac|lacs|k|thousand)?\s*(?:to|-|se)\s*(\d+\.?\d*)\s*(crore|cr|lakh|lac|lacs|k|thousand)?/i);
    if (rangeMatch) {
        const unit1 = rangeMatch[2] || rangeMatch[4] || 'lakh';
        const unit2 = rangeMatch[4] || unit1;
        const min = parseFloat(rangeMatch[1]) * getMultiplier(unit1);
        const max = parseFloat(rangeMatch[3]) * getMultiplier(unit2);
        return { min, max };
    }

    // Single value: "50 lakh", "1 crore", "20000/month"
    for (const { regex, multiplier } of CURRENCY_PATTERNS) {
        const m = lower.match(regex);
        if (m) {
            const val = parseFloat(m[1]) * multiplier;
            return { min: val * 0.7, max: val };
        }
    }

    // Plain number
    const plainNum = parseFloat(lower.replace(/[,\s]/g, ''));
    if (!isNaN(plainNum) && plainNum > 0) {
        return { min: plainNum * 0.7, max: plainNum };
    }

    return null;
}

function getMultiplier(unit: string): number {
    const u = unit.toLowerCase();
    if (u === 'crore' || u === 'cr') return 10_000_000;
    if (u === 'lakh' || u === 'lac' || u === 'lacs') return 100_000;
    if (u === 'k' || u === 'thousand') return 1_000;
    return 1;
}

function formatPrice(amount: number): string {
    if (amount >= 10_000_000) {
        return `₹${(amount / 10_000_000).toFixed(amount % 10_000_000 === 0 ? 0 : 1)} Cr`;
    }
    if (amount >= 100_000) {
        return `₹${(amount / 100_000).toFixed(amount % 100_000 === 0 ? 0 : 1)} Lakh`;
    }
    return `₹${amount.toLocaleString('en-IN')}`;
}

// ─── Area Parser ─────────────────────────────────────────────────────────────

function parseArea(text: string): { min: number | null; max: number | null; unit: string } {
    if (!text) return { min: null, max: null, unit: 'sqft' };
    const unit = /sq\s*m|sqmtr|meter/i.test(text) ? 'sqmtr' : 'sqft';
    const nums = text.match(/\d+/g)?.map(Number) || [];
    if (nums.length >= 2) return { min: Math.min(...nums), max: Math.max(...nums), unit };
    if (nums.length === 1) return { min: Math.round(nums[0] * 0.8), max: Math.round(nums[0] * 1.2), unit };
    return { min: null, max: null, unit };
}

// ─── Category ID Lookup ──────────────────────────────────────────────────────

const PROPERTY_TYPE_TO_SLUG: Record<string, string> = {
    flat: 'flat',
    house: 'independent_house',
    villa: 'villa',
    plot: 'residential_plot',
    builder_floor: 'builder_floor',
    builder_flat: 'flat',
    office: 'commercial_office_space',
    shop: 'retail_shop',
    warehouse: 'warehouse',
    commercial_plot: 'commercial_land_plot',
    coworking: 'coworking_space',
};

async function lookupCategoryIds(mainCategory: string, propertyType: string): Promise<{
    category_id: string | null;
    sub_category_id: string | null;
    type_id: string | null;
}> {
    try {
        const typeSlug = PROPERTY_TYPE_TO_SLUG[propertyType] || propertyType;
        const cat = await prisma.propertyCategory.findFirst({ where: { slug: mainCategory, is_active: true } });
        if (!cat) return { category_id: null, sub_category_id: null, type_id: null };
        const pt = await prisma.propertyType.findFirst({
            where: { slug: typeSlug, is_active: true },
            include: { sub_category: true },
        });
        return {
            category_id: cat.id,
            sub_category_id: pt?.sub_category?.id || null,
            type_id: pt?.id || null,
        };
    } catch {
        return { category_id: null, sub_category_id: null, type_id: null };
    }
}

// ─── Engine ─────────────────────────────────────────────────────────────────

export class BuyerWorkflowEngine extends WorkflowEngine {

    constructor() {
        super(BUYER_WORKFLOW_STEPS);
    }

    /**
     * Commit buyer requirements to Contact + Transaction tables.
     * Named differently from parent's commit() since the signature differs.
     */
    async commitBuyer(
        answers: WorkflowAnswer,
        source: 'web' | 'admin' | 'whatsapp' | 'voice',
        phone?: string,
    ): Promise<{ contact_phone: string; transaction_id?: string }> {
        logger.info(`[BuyerWorkflowEngine] Committing buyer from ${source}`);

        const tenant = await prisma.tenant.findFirst();
        if (!tenant) throw new Error('No tenant found');

        // Resolve phone
        let buyerPhone = normalizePhone(answers.buyer_phone as string || phone || '') || '';
        if (!buyerPhone) throw new Error('Buyer phone number is required');

        // Parse budget
        const budget = parseBudget(answers.buyer_budget as string || '');

        // Map intent
        const intent = answers.buyer_intent === 'rent_lease' ? 'rent' : 'buy';
        const demandBudgetType = intent === 'rent' ? 'per_month' : 'one_time';

        // Lookup category/sub-category/type IDs from master tables
        const categoryIds = await lookupCategoryIds(
            answers.buyer_main_category as string || 'residential',
            answers.buyer_property_type as string || '',
        );

        // Geocode buyer's location to lat/lng
        const geo = await geocodeAddress(answers.buyer_location as string || '');

        // Parse area requirement from free text like "800-1200 sqft"
        const areaParsed = parseArea(answers.buyer_area as string || '');

        // Parse amenities (multi_select returns object like { parking: true, lift: true })
        const amenities = answers.buyer_amenities && typeof answers.buyer_amenities === 'object'
            ? Object.entries(answers.buyer_amenities).filter(([, v]) => v).map(([k]) => k)
            : null;

        // Resolve the requirement into the canonical taxonomy (node + schema_values) so it
        // matches inventory key-by-key. Stage 3 — demand-taxonomy capture (2026-05-31).
        const demandTax = await resolveDemandTaxonomy({
            main_category: answers.buyer_main_category as string || undefined,
            property_type: answers.buyer_property_type as string || undefined,
            sub_category_id: categoryIds.sub_category_id || undefined,
            type_id: categoryIds.type_id || undefined,
            bhk: answers.buyer_bhk ? parseInt(answers.buyer_bhk as string, 10) : null,
            amenities: amenities?.length ? amenities : null,
        });

        // Upsert Contact
        await prisma.contact.upsert({
            where: { phone_number: buyerPhone },
            update: {
                name: answers.buyer_name as string || undefined,
                contact_type: 'BUYER',
                intent,
                property_type: answers.buyer_property_type as string || undefined,
                budget_min: budget ? budget.min : undefined,
                budget_max: budget ? budget.max : undefined,
                preferred_location: answers.buyer_location as string || undefined,
                category_id: categoryIds.category_id || undefined,
                sub_category_id: categoryIds.sub_category_id || undefined,
                type_id: categoryIds.type_id || undefined,
                demand_budget_type: demandBudgetType,
                preferred_lat: geo?.lat ?? undefined,
                preferred_lng: geo?.lng ?? undefined,
                area_min: areaParsed.min ?? undefined,
                area_max: areaParsed.max ?? undefined,
                area_unit: areaParsed.unit,
                demand_taxonomy_node_id: demandTax.demand_taxonomy_node_id ?? undefined,
                needs_taxonomy_review: demandTax.needs_review || undefined,
                // Phase 1 dual-write — canonical demand SoT (2026-05-29). Feed the resolved node id
                // so the fold spread re-writes it rather than clobbering it with null.
                ...(foldLegacyDemand({
                    demand_taxonomy_node_id: demandTax.demand_taxonomy_node_id,
                    demand_bhk: answers.buyer_bhk ? parseInt(answers.buyer_bhk as string, 10) : null,
                    demand_amenities: amenities?.length ? amenities : null,
                }) as any),
                lead_status: 'warm',
                lifecycle_stage: 'QUALIFIED',
                source: source === 'whatsapp' ? 'whatsapp' : source === 'admin' ? 'manual' : 'website',
                last_channel: source === 'whatsapp' ? 'whatsapp' : 'website',
                last_interaction: new Date(),
            },
            create: {
                phone_number: buyerPhone,
                tenant_id: tenant.id,
                name: answers.buyer_name as string || undefined,
                contact_type: 'BUYER',
                intent,
                property_type: answers.buyer_property_type as string || undefined,
                budget_min: budget ? budget.min : undefined,
                budget_max: budget ? budget.max : undefined,
                preferred_location: answers.buyer_location as string || undefined,
                category_id: categoryIds.category_id || undefined,
                sub_category_id: categoryIds.sub_category_id || undefined,
                type_id: categoryIds.type_id || undefined,
                demand_budget_type: demandBudgetType,
                preferred_lat: geo?.lat ?? undefined,
                preferred_lng: geo?.lng ?? undefined,
                area_min: areaParsed.min ?? undefined,
                area_max: areaParsed.max ?? undefined,
                area_unit: areaParsed.unit,
                demand_taxonomy_node_id: demandTax.demand_taxonomy_node_id ?? undefined,
                needs_taxonomy_review: demandTax.needs_review || undefined,
                // Phase 1 dual-write — canonical demand SoT (2026-05-29). Feed the resolved node id
                // so the fold spread re-writes it rather than clobbering it with null.
                ...(foldLegacyDemand({
                    demand_taxonomy_node_id: demandTax.demand_taxonomy_node_id,
                    demand_bhk: answers.buyer_bhk ? parseInt(answers.buyer_bhk as string, 10) : null,
                    demand_amenities: amenities?.length ? amenities : null,
                }) as any),
                lead_status: 'warm',
                lifecycle_stage: 'QUALIFIED',
                source: source === 'whatsapp' ? 'whatsapp' : source === 'admin' ? 'manual' : 'website',
                last_channel: source === 'whatsapp' ? 'whatsapp' : 'website',
                last_interaction: new Date(),
            },
        });

        // Create Deal via deal service (Phase 7 - 3-role structure with auto-coordinator + notifications)
        let transactionId: string | undefined;
        let wasDuplicate = false;
        try {
            const { createDeal } = await import('../services/deal_service');
            const { identifyContact } = await import('../services/contact_identifier');

            const txType = intent === 'rent' ? 'RENT' : 'SALE';

            // Detect if sender is a partner or team member
            let demandHandlerType: 'PARTNER' | 'TEAM_MEMBER' | 'DIRECT' = 'DIRECT';
            let demandHandlerId: string | undefined;
            const identified = await identifyContact(buyerPhone);
            if (identified?.contact_type === 'PARTNER_AGENT') {
                demandHandlerType = 'PARTNER';
                demandHandlerId = identified.source_id;
            } else if (identified?.contact_type === 'MANAGEMENT') {
                demandHandlerType = 'TEAM_MEMBER';
                demandHandlerId = identified.source_id;
            }

            // Get contact ID for deal service
            const contact = await prisma.contact.findUnique({ where: { phone_number: buyerPhone } });

            const result = await createDeal(
                {
                    tenant_id: tenant.id,
                    demand_contact_id: contact?.id || buyerPhone,
                    demand_handler_type: demandHandlerType,
                    demand_handler_id: demandHandlerId,
                    type: txType as any,
                    source,
                    demand_intent: answers.buyer_intent as string || undefined,
                    demand_category: answers.buyer_main_category as string || undefined,
                    demand_type_slug: answers.buyer_property_type as string || undefined,
                    demand_property_type: answers.buyer_property_type as string || undefined,
                    demand_location: answers.buyer_location as string || undefined,
                    demand_budget_min: budget ? budget.min : undefined,
                    demand_budget_max: budget ? budget.max : undefined,
                    demand_budget_type: intent === 'rent' ? 'per_month' : 'one_time',
                    demand_bedrooms: answers.buyer_bhk ? `${answers.buyer_bhk}BHK` : undefined,
                    // Phase 1 dual-write — pass canonical fields through to deal_service.
                    ...(foldLegacyDemand({
                        demand_bhk: answers.buyer_bhk ? parseInt(answers.buyer_bhk as string, 10) : null,
                        demand_amenities: amenities?.length ? amenities : null,
                    }) as any),
                    demand_notes: `Source: ${source}. Category: ${answers.buyer_main_category || 'not specified'}`,
                },
                'system:panditji',
                source === 'whatsapp' ? 'whatsapp' : source
            );
            transactionId = result.deal.id;

            if (result.isDuplicate) {
                wasDuplicate = true;
                logger.info(`[BuyerWorkflowEngine] Duplicate deal detected, using existing: ${transactionId}`);
            }
        } catch (txErr) {
            logger.error('[BuyerWorkflowEngine] Deal creation failed:', txErr);
        }

        // Log interaction
        try {
            await prisma.interaction.create({
                data: {
                    tenant_id: tenant.id,
                    phone_number: buyerPhone,
                    channel: source === 'whatsapp' ? 'whatsapp' : 'website',
                    direction: 'inbound',
                    event_type: 'buyer_intake_commit',
                    content: JSON.stringify({
                        intent,
                        category: answers.buyer_main_category,
                        property_type: answers.buyer_property_type,
                        bhk: answers.buyer_bhk,
                        location: answers.buyer_location,
                        budget: answers.buyer_budget,
                    }),
                },
            });
        } catch (intErr) {
            logger.error('[BuyerWorkflowEngine] Interaction log failed:', intErr);
        }

        logger.info(`[BuyerWorkflowEngine] Buyer committed: ${buyerPhone}, tx: ${transactionId}`);

        // FIX A (2026-06-12): a completed WhatsApp intake used to dead-end with no inventory — the
        // bot just acked. Now send a matching v5 card. On a DUPLICATE deal, refresh its criteria
        // first so the card reflects what the buyer just stated (observed bug: new criteria landed
        // on the contact but the deduped deal kept stale values). WhatsApp source only — website/
        // admin intakes have their own in-channel match flow.
        if (source === 'whatsapp' && transactionId) {
            try {
                if (wasDuplicate) {
                    const folded: any = foldLegacyDemand({
                        demand_bhk: answers.buyer_bhk ? parseInt(answers.buyer_bhk as string, 10) : null,
                        demand_amenities: amenities?.length ? amenities : null,
                    });
                    const existing = await prisma.transaction.findUnique({
                        where: { id: transactionId }, select: { demand_schema_values: true },
                    });
                    const refreshData: any = {
                        demand_intent: (answers.buyer_intent as string) || undefined,
                        demand_location: (answers.buyer_location as string) || undefined,
                        demand_budget_min: budget ? budget.min : undefined,
                        demand_budget_max: budget ? budget.max : undefined,
                        demand_schema_values: mergeDemandSchemaValues(existing?.demand_schema_values as any, folded.demand_schema_values),
                    };
                    await prisma.transaction.update({ where: { id: transactionId }, data: refreshData });
                    logger.info(`[BuyerWorkflowEngine] Refreshed duplicate deal ${transactionId} with fresh intake criteria`);
                }
                const { shareNextProperty } = await import('../services/property_sharing');
                await shareNextProperty(transactionId);
                logger.info(`[BuyerWorkflowEngine] Intake complete → shared matching card for deal ${transactionId}`);
            } catch (shareErr) {
                logger.error('[BuyerWorkflowEngine] Post-intake card share failed:', shareErr);
            }
        }

        return { contact_phone: buyerPhone, transaction_id: transactionId };
    }

    /**
     * Build MatchCriteria from workflow answers.
     */
    buildMatchCriteria(answers: WorkflowAnswer): MatchCriteria {
        const budget = parseBudget(answers.buyer_budget as string || '');
        const intent = answers.buyer_intent === 'rent_lease' ? 'rent' : 'buy';

        return {
            intent,
            property_type: answers.buyer_property_type as string || null,
            budget_min: budget ? budget.min : null,
            budget_max: budget ? budget.max : null,
            preferred_location: answers.buyer_location as string || null,
            bhk: answers.buyer_bhk ? parseInt(answers.buyer_bhk as string, 10) : null,
        };
    }

    /**
     * Build a human-readable summary of buyer requirements.
     */
    async buildBuyerSummary(answers: WorkflowAnswer): Promise<WorkflowSummary> {
        const summary: WorkflowSummary = {};

        if (answers.buyer_name) summary['Name'] = answers.buyer_name as string;
        if (answers.buyer_phone) summary['Phone'] = answers.buyer_phone as string;

        if (answers.buyer_intent) {
            summary['Looking to'] = answers.buyer_intent === 'buy' ? 'Purchase (Buy)' : 'Rent / Lease';
        }

        if (answers.buyer_main_category) {
            summary['Category'] = (answers.buyer_main_category as string).charAt(0).toUpperCase() +
                (answers.buyer_main_category as string).slice(1);
        }

        if (answers.buyer_property_type) {
            const typeLabels: Record<string, string> = {
                flat: 'Flat / Apartment', house: 'House / Villa', plot: 'Plot / Land',
                builder_floor: 'Builder Floor', builder_flat: 'Builder Flat',
                office: 'Office Space', shop: 'Shop / Showroom',
                warehouse: 'Warehouse', commercial_plot: 'Commercial Plot',
                coworking: 'Co-working Space',
            };
            summary['Property Type'] = typeLabels[answers.buyer_property_type as string] || answers.buyer_property_type as string;
        }

        if (answers.buyer_bhk) summary['BHK'] = `${answers.buyer_bhk} BHK`;
        if (answers.buyer_location) summary['Location'] = answers.buyer_location as string;

        if (answers.buyer_budget) {
            const budget = parseBudget(answers.buyer_budget as string);
            if (budget) {
                summary['Budget'] = `${formatPrice(budget.min)} - ${formatPrice(budget.max)}`;
            } else {
                summary['Budget'] = answers.buyer_budget as string;
            }
        }

        return summary;
    }

    /**
     * Sanitize a MatchedProperty for end-user consumption.
     * Strips: owner_phone, owner_name, customer_price.
     * Uses display_price (or falls back to price).
     */
    sanitizeProperty(property: MatchedProperty & { display_price?: number }, includeOwnerInfo = false): PropertyCardData {
        const price = property.display_price || property.price || 0;
        const specs = property.specs || {};

        // Filter media to images/videos only (no documents)
        const images = (property.media_urls || []).filter(url =>
            /\.(jpg|jpeg|png|webp|avif|gif|bmp)$/i.test(url),
        );
        const videos = (property.media_urls || []).filter(url =>
            /\.(mp4|webm|mov|avi)$/i.test(url),
        );

        // Build amenities list — Phase 4 dedup (2026-05-28): specs.amenities is SoT.
        const amenities: string[] = Array.isArray((specs as any).amenities)
            ? ((specs as any).amenities as string[]).map(a => String(a))
            : [];

        // BHK string — canonical taxonomy keys first
        const _rooms = (specs as any).bhk ?? (specs as any).rooms ?? specs.bedrooms ?? (specs as any).bhk_count;
        const bhk = _rooms ? `${_rooms} BHK` : undefined;

        // Floor string — total_floors lives in specs.floors now
        let floor: string | undefined;
        if (property.floor_number) {
            const _totalFloors = (specs as any).floors;
            floor = _totalFloors
                ? `${property.floor_number}/${_totalFloors}`
                : `${property.floor_number}`;
        }

        const card: PropertyCardData = {
            property_id: property.id,
            type: property.type || 'Property',
            bhk,
            location: property.location || 'Location not specified',
            display_price: price,
            display_price_formatted: formatPrice(price),
            area: specs.area ? `${specs.area} ${specs.area_unit || 'sqft'}` : undefined,
            furnishing: (specs as any).furnishing || undefined,
            floor,
            amenities: amenities.slice(0, 4),
            images,
            videos,
            match_score: property.match_score,
            intent: property.intent,
            maps_link: (property.latitude && property.longitude)
                ? `https://maps.google.com/?q=${property.latitude},${property.longitude}`
                : undefined,
        };

        // Include owner info only for internal admin users
        if (includeOwnerInfo) {
            card.owner_name = property.owner_name || undefined;
            card.owner_phone = property.owner_phone || undefined;
        }

        return card;
    }
}
