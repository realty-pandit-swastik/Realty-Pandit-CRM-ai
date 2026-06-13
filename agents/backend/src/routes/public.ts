
import { Router } from 'express';
import prisma from '../db';
import jwt from 'jsonwebtoken';
import { validate } from '../validators';
import { contactSchema, leadSchema, leadRequirementsSchema, newsletterSchema, scheduleVisitSchema, postPropertySchema } from '../validators/public.validator';
import { MatchingEngine } from '../services/matching_engine';
import { cache } from '../middleware/cache';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import logger from '../utils/logger';
import { ensureOwner } from '../services/ensure_owner';
import { INDIAN_STATES, DISTRICTS_BY_STATE } from '../data/india_geo';
import { normalizePhone, phoneVariants, resolveStoredContactPhone } from '../utils/phone';
import { findInventoryIdsByAddress } from '../utils/inventory_search';
import { generateUniqueSlug } from '../utils/slug';
import { sendBuyerConfirmationWhatsApp, sendBuyerConfirmationEmail } from '../services/lead_notifications';
import { ensureDealForLead } from '../services/ensure_deal';
import { WhatsAppService } from '../services/whatsapp';
import crypto from 'crypto';
import { LLMService } from '../services/llm';
import { captureRouteError } from '../utils/capture';
import { slotToScheduledAt, type VisitSlot } from '../utils/visit_schedule';
import { CalendarService } from '../services/calendar';
import { foldLegacyDemand } from '../utils/demand_canonical';
import { resolveDemandTaxonomy, resolveTypeFilter } from '../utils/demand_taxonomy';
import { specsScalarFilter, specsArrayContainsFilter } from '../utils/specs_filter';
import { resolveWebsiteLeadHandler, buildDemandFromInventory } from '../utils/website_lead';
import { createLeadActionTask } from '../services/workflow_task_service';

const whatsappService = new WhatsAppService();

const llmService = new LLMService();

const calendarService = new CalendarService();

const router = Router();

// Helper: support comma-separated multi-select filter values
function multiFilter(val: any): string | { in: string[] } | undefined {
    if (!val) return undefined;
    const arr = String(val).split(',').map(v => v.trim()).filter(Boolean);
    if (arr.length === 0) return undefined;
    return arr.length === 1 ? arr[0] : { in: arr };
}

// GET /public/properties - Paginated, filterable property listings (supports hierarchical classification)
router.get('/properties', cache(300), async (req, res) => {
    const {
        location, type, category, intent,
        category_id, sub_category_id, type_id, configuration_id,
        taxonomy_node_id,
        usage_type_id, investment_type_id,
        price_min, price_max, sort,
        furnishing, ownership_type, amenities,
        bhk, rooms, facing, age,
        page = '1', limit = '12'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, parseInt(limit as string));
    const skip = (pageNum - 1) * limitNum;

    const where: any = { status: 'active' };

    if (location) {
        // Word-aware address match (reuses the admin inventory matcher): tokenized, word-boundary on numbers
        // so "Sector 4" ≠ "Sector 5"/a pincode, and searches ALL address columns incl. sub_locality. Strip the
        // Google formatted-address cruft (trailing ", India" + 6-digit pincode) that would over-constrain to
        // zero; fall back to the raw value if stripping empties it (a deliberate pincode-only search still works).
        const raw = String(location).trim();
        const cleaned = raw.replace(/,?\s*\bindia\b\s*$/i, '').replace(/\b\d{6}\b/g, ' ').replace(/\s{2,}/g, ' ').trim() || raw;
        const ids = await findInventoryIdsByAddress(cleaned, { includePhone: false });
        where.AND = where.AND || [];
        where.AND.push({ id: { in: ids } });
    }
    if (intent) where.intent = intent as string;

    // Hierarchical classification filters — support multi-select (comma-separated)
    const catFilter = multiFilter(category_id);
    if (catFilter) {
        // Look up slugs for the selected category IDs so we can also match legacy category field
        const catIds = typeof catFilter === 'string' ? [catFilter] : catFilter.in;
        const cats = await prisma.propertyCategory.findMany({
            where: { id: { in: catIds } },
            select: { slug: true }
        });
        const slugs = cats.map((c: any) => c.slug);

        // Match either hierarchical category_id OR legacy category field (for un-migrated properties)
        where.AND = where.AND || [];
        where.AND.push({
            OR: [
                { category_id: catFilter },
                ...(slugs.length > 0 ? [{ category_id: null, category: { in: slugs, mode: 'insensitive' } }] : [])
            ]
        });
    }
    const subCatFilter = multiFilter(sub_category_id);
    if (subCatFilter) where.sub_category_id = subCatFilter;
    // Canonical taxonomy filter: resolve node id(s) → the legacy sub_category_id that joins 1:1
    // to inventory (reuses MatchingEngine's resolveTypeFilter). Overrides any legacy sub_cat above.
    const nodeIds = String(taxonomy_node_id ?? '').split(',').map(s => s.trim()).filter(Boolean);
    if (nodeIds.length) {
        const resolved = await Promise.all(nodeIds.map(id => resolveTypeFilter({ demand_taxonomy_node_id: id })));
        const subIds = Array.from(new Set(resolved.map(r => r.sub_category_id).filter(Boolean))) as string[];
        if (subIds.length) where.sub_category_id = subIds.length === 1 ? subIds[0] : { in: subIds };
    }
    // type_id is only ~26% populated on inventory — a hard filter silently dropped ~74% of valid
    // rows (2026-06-04). No longer hard-filtered; rely on the node → sub_category_id join above.
    const configFilter = multiFilter(configuration_id);
    if (configFilter) where.configuration_id = configFilter;
    const usageFilter = multiFilter(usage_type_id);
    if (usageFilter) where.usage_type_id = usageFilter;
    const investFilter = multiFilter(investment_type_id);
    if (investFilter) where.investment_type_id = investFilter;

    // Furnishing filter (multi-select) — reads specs.furnishing; the `furnishing` column was
    // dropped 2026-05-28 (specs unification). Filtering it directly 500'd (GlitchTip #70).
    const furnishVals = String(furnishing ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const furnishFrag = specsScalarFilter('furnishing', furnishVals);
    if (furnishFrag) { where.AND = where.AND || []; where.AND.push(furnishFrag); }

    // Ownership type filter (multi-select: OWNER, EXTERNAL_AGENT, AGENT_OWNER) — kept column
    const ownerFilter = multiFilter(ownership_type);
    if (ownerFilter) where.ownership_type = ownerFilter;

    // Amenities filter (multi-select) — reads the specs.amenities array; the `features` column
    // was dropped 2026-05-28. AND semantics: a listing must contain every selected amenity.
    const amenityVals = String(amenities ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const amenityClauses = specsArrayContainsFilter('amenities', amenityVals);
    if (amenityClauses.length) { where.AND = where.AND || []; where.AND.push(...amenityClauses); }

    // Per-type scalar specs filters (specs.* keyed by FieldDefinition.key). bhk/facing are stored
    // strings; the variant-matching in specsScalarFilter absorbs slug↔label casing differences.
    const specFilters: Array<[unknown, string]> = [
        [bhk, 'bhk'], [rooms, 'rooms'], [facing, 'facing'], [age, 'age-of-construction'],
    ];
    for (const [raw, key] of specFilters) {
        const vals = String(raw ?? '').split(',').map(s => s.trim()).filter(Boolean);
        const frag = specsScalarFilter(key, vals);
        if (frag) { where.AND = where.AND || []; where.AND.push(frag); }
    }

    // Legacy filters (backward compatibility)
    if (type && !type_id) where.type = type as string;
    if (category && !category_id) where.category = category as string;

    if (price_min || price_max) {
        where.price = {};
        if (price_min) where.price.gte = parseFloat(price_min as string);
        if (price_max) where.price.lte = parseFloat(price_max as string);
    }

    // 2026-05-13: previously default sort was media_score DESC, which pushed every fresh
    // upload (media_score=0 at create time) to the bottom of the listing page. 265 of 336
    // active inventories had media_score=0 — users complained website never refreshed.
    // Recency now wins; media_score is the tiebreaker for same-day uploads.
    let orderBy: any = [{ created_at: 'desc' }, { media_score: 'desc' }];
    if (sort === 'price_asc') orderBy = { price: 'asc' };
    else if (sort === 'price_desc') orderBy = { price: 'desc' };
    else if (sort === 'newest') orderBy = [{ created_at: 'desc' }, { media_score: 'desc' }];
    else if (sort === 'media_score') orderBy = [{ media_score: 'desc' }, { created_at: 'desc' }];

    try {
        const [properties, total] = await Promise.all([
            prisma.inventory.findMany({
                where, orderBy, skip, take: limitNum,
                select: {
                    id: true, slug: true, category: true, type: true, specs: true,
                    location: true, price: true, price_unit: true, status: true,
                    intent: true, media_urls: true, created_at: true,
                    display_price: true, city: true, district: true, locality: true,
                    floor_number: true,
                    // features/furnishing/total_floors dropped Phase 4 — read from specs.*
                    apartment_name: true, is_enriched: true, ownership_type: true, renovated: true,
                    pre_rented: true, pre_rented_monthly_rent: true,
                    sub_locality: true,
                    flat_property_type: { select: { name: true, main_category: true } },
                    taxonomy_node: { select: { id: true, name: true, slug: true } },
                    needs_taxonomy_review: true,
                    contact: { select: { name: true } },
                    assigned_agent: { select: { name: true } },
                    uploaded_by_agent: { select: { name: true } },
                    _count: { select: { saved_properties: true } },
                }
            }),
            prisma.inventory.count({ where })
        ]);

        // Map: use display_price as price (never expose customer_price), prefer city over district
        const mapped = properties.map((p: any) => ({
            ...p,
            price: p.display_price || p.price,
            city: p.city || p.district,
            // Privacy: never expose the team member's or owner's name publicly — the
            // OTP-gated "Contact Agent" reveal is the only way to surface a real contact.
            owner_name: null,
            listed_by: 'Realty Pandit',
            save_count: p._count?.saved_properties || 0,
            display_price: undefined,
            district: undefined,
            contact: undefined,
            assigned_agent: undefined,
            uploaded_by_agent: undefined,
            _count: undefined,
        }));

        res.json({
            properties: mapped,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'public#1' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /public/properties/:id - Single property detail with classification
// Accepts: UUID, RP-* display_id, or SEO slug
router.get('/properties/:id', cache(300), async (req, res) => {
    try {
        const identifier = req.params.id;
        const isDisplayId = /^RP-/.test(identifier);
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

        let where: any;
        if (isDisplayId) {
            where = { display_id: identifier };
        } else if (isUUID) {
            where = { id: identifier };
        } else {
            // Treat as slug. Every slug ends in the property id's last segment (…-<12hex>), so also
            // accept a match on that suffix — this keeps OLD/typo'd slugs resolving after a slug is
            // corrected (e.g. a fixed location) instead of 404-ing, and consolidates to the canonical.
            const suffix = identifier.match(/-([0-9a-f]{12})$/i)?.[1];
            where = suffix ? { OR: [{ slug: identifier }, { id: { endsWith: suffix } }] } : { slug: identifier };
        }

        const property = await prisma.inventory.findFirst({
            where,
            select: {
                id: true, slug: true, display_id: true, category: true, type: true, specs: true,
                location: true, price: true, price_unit: true, status: true,
                intent: true, media_urls: true, video_urls: true, created_at: true, updated_at: true,
                owner_phone: true, tenant_id: true,
                display_price: true, city: true, district: true,
                description: true, floor_number: true,
                // features/furnishing/total_floors/facing/property_age dropped Phase 4 — read from specs.*
                locality: true, sub_locality: true, state: true, pincode: true, apartment_name: true,
                latitude: true, longitude: true, renovated: true,
                pre_rented: true, pre_rented_monthly_rent: true,
                flat_property_type: { select: { name: true, main_category: true } },
                taxonomy_node: { select: { id: true, name: true, slug: true } },
                needs_taxonomy_review: true,
                contact: { select: { name: true } },
                assigned_agent: { select: { name: true, phone: true } },
                uploaded_by_agent: { select: { name: true, phone: true } },
            }
        });

        if (!property) {
            return res.status(404).json({ error: 'Property not found' });
        }

        res.json({
            ...property,
            price: property.display_price || property.price,
            city: property.city || property.district,
            // Privacy: don't expose the team member's/owner's name or the agent's phone
            // publicly — the OTP-gated "Contact Agent" reveal is the only path to a real contact.
            owner_name: 'Owner',
            listed_by: 'Realty Pandit',
            listed_by_phone: null,
            display_price: undefined,
            district: undefined,
            contact: undefined,
            assigned_agent: undefined,
            uploaded_by_agent: undefined,
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'public#2' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /public/featured-properties - Curated featured listings
router.get('/featured-properties', cache(120), async (_req, res) => {
    try {
        // 2026-05-16 (T7): showcase must reflect NEW inventory. Previously ordered by
        // media_score desc which pinned the same well-photographed older listings and
        // never surfaced fresh ones. Now: newest-first among listings that have media
        // (carousel needs images), media_score only as a tiebreaker. Cache 120s + an
        // explicit bust on inventory create so a new listing appears within ~minutes.
        const properties = await prisma.inventory.findMany({
            where: { status: 'active', media_urls: { isEmpty: false } },
            orderBy: [{ created_at: 'desc' }, { media_score: 'desc' }],
            take: 12,
            select: {
                // features dropped Phase 4 — read from specs.amenities
                id: true, slug: true, category: true, type: true, specs: true,
                location: true, price: true, price_unit: true, status: true,
                intent: true, media_urls: true, created_at: true,
                display_price: true, city: true, district: true, locality: true,
                apartment_name: true, sub_locality: true,
                flat_property_type: { select: { name: true, main_category: true } },
                taxonomy_node: { select: { id: true, name: true, slug: true } },
            }
        });
        const mapped = properties.map((p: any) => ({
            ...p,
            price: p.display_price || p.price,
            city: p.city || p.district,
            display_price: undefined,
            district: undefined,
        }));
        res.json({ properties: mapped });
    } catch (error) {
        captureRouteError(error, _req, { route: 'public#3' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /public/similar-properties/:id - Similar properties (uses classification hierarchy for better matching)
router.get('/similar-properties/:id', cache(600), async (req, res) => {
    try {
        const property = await prisma.inventory.findUnique({
            where: { id: req.params.id },
            select: { category: true, type: true, location: true, intent: true, category_id: true, sub_category_id: true, type_id: true, taxonomy_node_id: true }
        });

        if (!property) return res.status(404).json({ error: 'Property not found' });

        // Build similarity criteria - prefer the taxonomy node, then classification hierarchy, then legacy
        const orConditions: any[] = [];
        if (property.taxonomy_node_id) {
            orConditions.push({ taxonomy_node_id: property.taxonomy_node_id });
        }
        if (property.sub_category_id) {
            orConditions.push({ sub_category_id: property.sub_category_id });
        } else if (property.category && property.type) {
            orConditions.push({ category: property.category, type: property.type });
        }
        if (property.location) {
            orConditions.push({ location: { contains: property.location.split(',')[0], mode: 'insensitive' } });
        }

        const similar = await prisma.inventory.findMany({
            where: {
                status: 'active',
                id: { not: req.params.id },
                OR: orConditions.length > 0 ? orConditions : undefined
            },
            take: 4,
            orderBy: [{ media_score: 'desc' }, { created_at: 'desc' }],
            select: {
                // features dropped Phase 4 — read from specs.amenities
                id: true, slug: true, category: true, type: true, specs: true,
                location: true, price: true, price_unit: true, status: true,
                intent: true, media_urls: true, created_at: true,
                city: true, district: true, locality: true,
                taxonomy_node: { select: { id: true, name: true, slug: true } },
            }
        });
        res.json({ properties: similar });
    } catch (error) {
        captureRouteError(error, req, { route: 'public#4' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /public/locations - Unique locations for autocomplete
router.get('/locations', cache(1800), async (_req, res) => {
    try {
        const locations = await prisma.inventory.groupBy({
            by: ['location'],
            where: { status: 'active', location: { not: null } },
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } }
        });
        res.json({
            locations: locations
                .filter(l => l.location)
                .map(l => ({ name: l.location!, count: l._count.id }))
        });
    } catch (error) {
        captureRouteError(error, _req, { route: 'public#5' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /public/stats - Public statistics
router.get('/stats', cache(600), async (_req, res) => {
    try {
        const [totalProperties, locations, totalContacts] = await Promise.all([
            prisma.inventory.count({ where: { status: 'active' } }),
            prisma.inventory.groupBy({ by: ['location'], where: { status: 'active', location: { not: null } } }),
            prisma.contact.count()
        ]);

        res.json({
            totalProperties,
            totalLocations: locations.length,
            totalClients: totalContacts
        });
    } catch (error) {
        captureRouteError(error, _req, { route: 'public#6' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /public/testimonials - Client testimonials (hardcoded for now, can be moved to DB later)
router.get('/testimonials', cache(3600), async (_req, res) => {
    const testimonials = [
        { id: '1', name: 'Rajesh Kumar', location: 'Noida', rating: 5, text: 'Panditji helped me find the perfect 3BHK in Sector 150. The AI assistant understood exactly what I needed and suggested properties within my budget. Closed the deal in just 2 weeks!', date: '2025-01-10' },
        { id: '2', name: 'Priya Sharma', location: 'Gurgaon', rating: 5, text: 'As a first-time buyer, I was overwhelmed. Realty Pandit made the entire process smooth — from property search to documentation. Highly recommend their services!', date: '2025-01-05' },
        { id: '3', name: 'Amit Patel', location: 'Mumbai', rating: 5, text: 'Sold my flat in Powai through Realty Pandit. Their AI-powered valuation was spot on, and I got the best price. The WhatsApp support is incredibly convenient.', date: '2024-12-28' },
        { id: '4', name: 'Sneha Reddy', location: 'Bangalore', rating: 4, text: 'Found a great rental in Indiranagar through Panditji. Zero brokerage and verified listings — exactly as promised. Will use again when my lease is up.', date: '2024-12-20' },
        { id: '5', name: 'Vikram Singh', location: 'Delhi', rating: 5, text: 'The commercial property search was exceptional. Panditji understood my requirements for office space in CP and shortlisted exactly what I needed. Professional service!', date: '2024-12-15' },
        { id: '6', name: 'Anita Joshi', location: 'Pune', rating: 5, text: 'Best real estate experience I have had. The legal assistance for documentation was invaluable. Everything was transparent and hassle-free.', date: '2024-12-10' },
    ];
    res.json({ testimonials });
});

// POST /public/contact - Lead capture from website contact form
router.post('/contact', validate(contactSchema), async (req, res) => {
    const { name, email, message, property_id, intent } = req.body;

    try {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) {
            return res.status(500).json({ error: 'System not configured' });
        }

        // Resolve to the actual stored contact PK so a legacy bare/dash-stored
        // contact is matched, not duplicated by the normalized phone.
        const phone = (await resolveStoredContactPhone(req.body.phone, prisma)) ?? req.body.phone;

        // Upsert contact
        const contact = await prisma.contact.upsert({
            where: { phone_number: phone },
            update: { name, email, last_channel: 'website', last_interaction: new Date() },
            create: {
                phone_number: phone,
                name,
                email,
                source: 'website',
                contact_type: 'BUYER',
                intent: intent || null,
                tenant_id: tenant.id,
                last_channel: 'website',
                last_interaction: new Date()
            }
        });

        // Log interaction
        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id,
                phone_number: phone,
                channel: 'website',
                direction: 'inbound',
                event_type: 'form_submit',
                content: message || `Website inquiry${property_id ? ` for property ${property_id}` : ''}`,
                metadata: property_id ? { property_id } : undefined
            }
        });

        // Notify buyer immediately (fire-and-forget)
        sendBuyerConfirmationWhatsApp(phone, name || null, 'website')
            .catch(err => logger.warn('[Public/contact] Buyer WA failed:', err.message));
        if (email) {
            sendBuyerConfirmationEmail(email, name || null)
                .catch(err => logger.warn('[Public/contact] Buyer email failed:', err.message));
        }

        res.status(201).json({ success: true, message: 'Panditji will contact you on WhatsApp shortly!' });
    } catch (error) {
        captureRouteError(error, req, { route: 'public#7' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /public/lead - Lead capture from popup/cookie consent (SSOT)
router.post('/lead', validate(leadSchema), async (req, res) => {
    const { name, phone, email, interest, source, page_url, user_agent, cookie_consent } = req.body;

    if (!phone && !email) {
        return res.status(400).json({ error: 'At least phone or email is required' });
    }

    try {
        // Resolve to the actual stored contact PK so a legacy bare/dash-stored
        // contact is matched, not duplicated by the normalized phone.
        const storedPhone = phone ? ((await resolveStoredContactPhone(phone, prisma)) ?? phone) : null;

        // Store in WebsiteLead for tracking (tracking row, no Contact FK)
        const lead = await prisma.websiteLead.create({
            data: {
                name: name || null,
                phone: phone || null,
                email: email || null,
                interest: interest || null,
                source: source || 'popup',
                page_url: page_url || null,
                user_agent: user_agent || null,
                cookie_consent: cookie_consent || false,
                consent_timestamp: cookie_consent ? new Date() : null
            }
        });

        // Also upsert into Contact SSOT if phone provided
        if (phone) {
            const tenant = await prisma.tenant.findFirst();
            if (tenant) {
                await prisma.contact.upsert({
                    where: { phone_number: storedPhone! },
                    update: {
                        name: name || undefined,
                        email: email || undefined,
                        last_channel: 'website',
                        last_interaction: new Date(),
                        intent: interest === 'browse' ? null : interest || null
                    },
                    create: {
                        phone_number: storedPhone!,
                        name: name || null,
                        email: email || null,
                        source: 'website',
                        contact_type: (interest === 'rent' || interest === 'rent_lease') ? 'TENANT' : 'BUYER',
                        intent: interest === 'browse' ? null : interest || null,
                        tenant_id: tenant.id,
                        last_channel: 'website',
                        last_interaction: new Date()
                    }
                });

                // Log interaction
                await prisma.interaction.create({
                    data: {
                        tenant_id: tenant.id,
                        phone_number: storedPhone!,
                        channel: 'website',
                        direction: 'inbound',
                        event_type: 'lead_capture',
                        content: `Lead captured via ${source || 'popup'}. Interest: ${interest || 'not specified'}`,
                        metadata: { lead_id: lead.id, source, interest, page_url }
                    }
                });
            }
        }

        // Notify buyer immediately if phone was provided (fire-and-forget)
        if (phone && storedPhone) {
            sendBuyerConfirmationWhatsApp(storedPhone, name || null, source || 'website')
                .catch(err => logger.warn('[Public/lead] Buyer WA failed:', err.message));

            // B1: auto-create NEW deal so AI qualification cadence kicks in.
            ensureDealForLead({
                contactPhone: storedPhone,
                source: 'website',
            }).catch(err => logger.error(`[Public/lead] ensureDealForLead failed: ${(err as Error).message}`));
        }

        res.status(201).json({ success: true, lead_id: lead.id });
    } catch (error) {
        captureRouteError(error, req, { route: 'public#8' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /public/lead-requirements - PHASE 7: Standardized lead capture with instant matching
// Flow: intent → category → type → budget → location → show matching properties
router.post('/lead-requirements', validate(leadRequirementsSchema), async (req, res) => {
    const {
        intent, category, type_slug, taxonomy_node_id, budget_min, budget_max, budget_type,
        location, name, phone, email, amenities, source
    } = req.body;

    try {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) {
            return res.status(500).json({ error: 'System not configured' });
        }

        // Resolve the requirement into the canonical taxonomy node up-front so BOTH the no-phone
        // and main branches can pass it to the matching engine (previously resolved only after
        // the no-phone early-return, so instant matches ignored the taxonomy node entirely).
        const demandTax = await resolveDemandTaxonomy({
            demand_taxonomy_node_id: taxonomy_node_id || undefined,  // precise node-id fast-path (byNodeId)
            main_category: category || undefined,
            property_type: type_slug || category || undefined,        // legacy fallback when no node id
            amenities: amenities || undefined,
        });

        // Determine contact phone — required for SSOT
        if (!phone) {
            // No phone → just run matching without creating contact
            const matchingEngine = new MatchingEngine();
            const matches = await matchingEngine.findMatches({
                intent: intent === 'rent_lease' ? 'rent' : 'buy',
                property_type: type_slug,
                demand_taxonomy_node_id: demandTax.demand_taxonomy_node_id ?? undefined,
                sub_category_id: demandTax.sub_category_id ?? undefined,
                category_id: demandTax.category_id ?? undefined,
                demand_schema_values: demandTax.demand_schema_values ?? undefined,
                budget_min: budget_min || undefined,
                budget_max: budget_max || undefined,
                preferred_location: location,
            }, 10);

            return res.json({
                success: true,
                contact_created: false,
                matches,
                message: 'Provide your phone number to save requirements and get personalized updates.'
            });
        }

        // Resolve to the actual stored contact PK so a legacy bare/dash-stored
        // contact is matched, not duplicated by the normalized phone.
        const storedPhone = (await resolveStoredContactPhone(phone, prisma)) ?? phone;

        // Upsert Contact SSOT with full requirements
        const contact = await prisma.contact.upsert({
            where: { phone_number: storedPhone },
            update: {
                name: name || undefined,
                email: email || undefined,
                intent: intent === 'rent_lease' ? 'rent' : 'buy',
                contact_type: (intent === 'rent' || intent === 'rent_lease') ? 'TENANT' : 'BUYER',
                demand_budget_type: budget_type || (intent === 'buy' ? 'one_time' : 'per_month'),
                demand_taxonomy_node_id: demandTax.demand_taxonomy_node_id ?? undefined,
                needs_taxonomy_review: demandTax.needs_review || undefined,
                // Persist legacy classification from the resolved node (2026-05-31).
                sub_category_id: demandTax.sub_category_id ?? undefined,
                category_id: demandTax.category_id ?? undefined,
                type_id: demandTax.type_id ?? undefined,
                // Phase 1 dual-write — canonical demand SoT.
                ...(foldLegacyDemand({ demand_amenities: amenities ?? null }) as any),
                budget_min: budget_min || undefined,
                budget_max: budget_max || undefined,
                preferred_location: location,
                last_channel: 'website',
                last_interaction: new Date(),
            },
            create: {
                phone_number: storedPhone,
                tenant_id: tenant.id,
                name: name || null,
                email: email || null,
                source: source || 'website',
                contact_type: (intent === 'rent' || intent === 'rent_lease') ? 'TENANT' : 'BUYER',
                intent: intent === 'rent_lease' ? 'rent' : 'buy',
                demand_budget_type: budget_type || (intent === 'buy' ? 'one_time' : 'per_month'),
                demand_taxonomy_node_id: demandTax.demand_taxonomy_node_id ?? undefined,
                needs_taxonomy_review: demandTax.needs_review || undefined,
                // Persist legacy classification from the resolved node (2026-05-31).
                sub_category_id: demandTax.sub_category_id ?? undefined,
                category_id: demandTax.category_id ?? undefined,
                type_id: demandTax.type_id ?? undefined,
                // Phase 1 dual-write — canonical demand SoT.
                ...(foldLegacyDemand({ demand_amenities: amenities ?? null }) as any),
                budget_min: budget_min || undefined,
                budget_max: budget_max || undefined,
                preferred_location: location,
                last_channel: 'website',
                last_interaction: new Date(),
            }
        });

        // Log interaction
        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id,
                phone_number: storedPhone,
                channel: 'website',
                direction: 'inbound',
                event_type: 'lead_requirements',
                content: `Lead requirements: ${intent} ${category} ${type_slug} in ${location}, budget ${budget_min || '?'}-${budget_max || '?'} (${budget_type || 'not specified'})`,
                metadata: { intent, category, type_slug, budget_min, budget_max, budget_type, location, amenities, source }
            }
        });

        // Run matching engine — pass the resolved taxonomy node so it hard-filters by type
        // (node → sub_category_id) and scores on demand_schema_values, not just a loose string.
        const matchingEngine = new MatchingEngine();
        const matches = await matchingEngine.findMatches({
            intent: intent === 'rent_lease' ? 'rent' : 'buy',
            property_type: type_slug,
            demand_taxonomy_node_id: demandTax.demand_taxonomy_node_id ?? undefined,
            sub_category_id: demandTax.sub_category_id ?? undefined,
            category_id: demandTax.category_id ?? undefined,
            demand_schema_values: demandTax.demand_schema_values ?? undefined,
            budget_min: budget_min || undefined,
            budget_max: budget_max || undefined,
            preferred_location: location,
        }, 10);

        // Notify buyer immediately (fire-and-forget)
        sendBuyerConfirmationWhatsApp(storedPhone, name || null, 'website')
            .catch(err => logger.warn('[Public/lead-requirements] Buyer WA failed:', err.message));
        if (email) {
            sendBuyerConfirmationEmail(email, name || null)
                .catch(err => logger.warn('[Public/lead-requirements] Buyer email failed:', err.message));
        }

        // B1: auto-create NEW deal so AI qualification cadence kicks in.
        ensureDealForLead({
            contactPhone: storedPhone,
            source: 'website',
        }).catch(err => logger.error(`[Public/lead-requirements] ensureDealForLead failed: ${(err as Error).message}`));

        res.status(201).json({
            success: true,
            contact_created: true,
            contact_phone: storedPhone,
            matches,
            total_matches: matches.length,
            message: matches.length > 0
                ? `Found ${matches.length} matching properties! Panditji will contact you on WhatsApp.`
                : 'Requirements saved! Panditji will notify you when matching properties are available.'
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'public#9' });
        logger.error('Lead requirements error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /public/newsletter - Newsletter subscription (SSOT)
router.post('/newsletter', validate(newsletterSchema), async (req, res) => {
    const { email, name, source } = req.body;

    try {
        const subscriber = await prisma.newsletterSubscriber.upsert({
            where: { email },
            update: { status: 'active', name: name || undefined },
            create: {
                email,
                name: name || null,
                source: source || 'website',
                status: 'active'
            }
        });

        res.status(201).json({ success: true, id: subscriber.id });
    } catch (error) {
        captureRouteError(error, req, { route: 'public#10' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /public/schedule-visit - Schedule a property site visit (SSOT)
router.post('/schedule-visit', validate(scheduleVisitSchema), async (req, res) => {
    const { property_id, name, email, preferred_date, message } = req.body;
    // phone is normalized to +91… by scheduleVisitSchema.phoneField; slot is
    // validated to morning|afternoon|evening by scheduleVisitSchema.
    const phone: string = req.body.phone;
    const preferred_time = req.body.preferred_time as VisitSlot;

    try {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return res.status(500).json({ error: 'Tenant not found' });

        // One property lookup — drives lead routing + requirement capture below.
        const property = await prisma.inventory.findUnique({
            where: { id: property_id },
            select: {
                assigned_agent_id: true, owning_manager_id: true, uploaded_by_agent_id: true,
                intent: true, taxonomy_node_id: true, specs: true,
                locality: true, city: true, district: true, location: true,
            },
        });

        // Route the lead: EXISTING → their agent; NEW → the inventory manager (assigned
        // agent → owning manager → uploader → super_boss). resolveStoredContactPhone is
        // applied inside so a legacy bare/dash-stored contact is matched, not duplicated.
        const { storedPhone, isNew, handlerId } = await resolveWebsiteLeadHandler(phone, property || { assigned_agent_id: null, owning_manager_id: null, uploaded_by_agent_id: null });

        // Upsert contact FIRST (contact_id is required for ScheduledVisit). A NEW lead is
        // OWNED by the handler (visible in CRM/PWA) + gets a requirement mirroring the
        // inventory it enquired on; an EXISTING lead is preserved (agent + requirement).
        await prisma.contact.upsert({
            where: { phone_number: storedPhone },
            update: {
                name,
                email: email || undefined,
                last_channel: 'website',
                last_interaction: new Date()
            },
            create: {
                phone_number: storedPhone,
                name,
                email: email || null,
                source: 'website',
                tenant_id: tenant.id,
                last_channel: 'website',
                last_interaction: new Date(),
                assigned_agent_id: handlerId,
                owning_manager_id: handlerId,
                ...(property ? buildDemandFromInventory(property) : { contact_type: 'BUYER', intent: 'buy' }),
            }
        });

        const visit = await prisma.scheduledVisit.create({
            data: {
                contact_id: storedPhone,
                property_id,
                name,
                phone: storedPhone,
                email: email || null,
                preferred_date: new Date(`${preferred_date}T00:00:00Z`),
                preferred_time,
                message: message || null,
                source: 'website_form',
                status: 'pending',
                // Internal staff coordinating this visit — the resolved handler
                // (existing customer's agent, else the inventory manager). agent_id
                // stays for true external agents only.
                internal_handler_id: handlerId,
            }
        });

        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id,
                phone_number: storedPhone,
                channel: 'website',
                direction: 'inbound',
                event_type: 'schedule_visit',
                content: `Scheduled site visit for property ${property_id}`,
                metadata: { visit_id: visit.id, property_id, preferred_date, preferred_time }
            }
        });

        // Create the canonical Appointment so the visit is visible/actionable
        // in the CRM (lead-detail Visits tab + employee calendar). This also
        // sends the single buyer WhatsApp + seller/superboss/lead-agent
        // notifications — same path the website-chat flow uses, so we no
        // longer send the bespoke buyer/agent WhatsApp here (avoids doubles).
        try {
            const scheduled_at = slotToScheduledAt(preferred_date, preferred_time);
            await calendarService.createPropertyVisitAppointment({
                contact_id: storedPhone,
                property_id,
                scheduled_at,
                source: 'website_form',
                assigned_to_agent_id: handlerId ?? undefined,
            });
        } catch (calErr) {
            // Booking is already persisted; surface to GlitchTip, don't fail.
            captureRouteError(calErr, req, { route: 'public#11:appointment' });
            logger.error('[Public/schedule-visit] Appointment creation failed:', (calErr as Error).message);
        }

        // Email confirmation is not covered by the calendar service (WA only).
        if (email) {
            sendBuyerConfirmationEmail(email, name || null)
                .catch(err => logger.warn('[Public/schedule-visit] Buyer email failed:', err.message));
        }

        res.status(201).json({ success: true, visit_id: visit.id, message: 'Visit scheduled! Panditji will confirm on WhatsApp.' });
    } catch (error) {
        captureRouteError(error, req, { route: 'public#11' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /public/track-property-view
// Track when a known lead (identified by ref token) views a property detail page on the website
router.post('/track-property-view', async (req, res) => {
    const { ref, property_id } = req.body;

    if (!ref || !property_id) {
        return res.status(400).json({ error: 'ref and property_id are required' });
    }

    try {
        // Decode base64 phone token
        const phone = Buffer.from(ref, 'base64').toString('utf8');
        const normalizedPhone = normalizePhone(phone);
        if (!normalizedPhone) {
            return res.json({ success: true }); // Silent — invalid token, don't reveal
        }

        // Verify contact exists (known leads only — silent 200 if unknown)
        const contact = await prisma.contact.findUnique({
            where: { phone_number: normalizedPhone },
            select: { phone_number: true, tenant_id: true },
        });

        if (!contact) {
            return res.json({ success: true });
        }

        // Log property view as interaction
        await prisma.interaction.create({
            data: {
                tenant_id: contact.tenant_id,
                phone_number: normalizedPhone,
                channel: 'website',
                direction: 'inbound',
                event_type: 'property_view',
                content: `Lead viewed property ${property_id}`,
                metadata: { property_id, ref_token: ref },
            },
        });

        res.json({ success: true });
    } catch (error) {
        captureRouteError(error, req, { route: 'public#12' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /public/save-property - Save/favorite a property (creates contact + saved link)
router.post('/save-property', async (req, res) => {
    const { name, property_id } = req.body;
    // Normalize to E.164 so the contact PK is openable in admin (no validate() on this route)
    const phone = normalizePhone(req.body.phone || '');
    if (!phone || !/^\+91[6-9]\d{9}$/.test(phone) || !property_id) {
        return res.status(400).json({ error: 'valid phone and property_id are required' });
    }

    try {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return res.status(500).json({ error: 'Tenant not found' });

        // Resolve to the actual stored contact PK so a legacy bare/dash-stored
        // contact is matched, not duplicated by the normalized phone.
        const storedPhone = (await resolveStoredContactPhone(phone, prisma)) ?? phone;

        await prisma.contact.upsert({
            where: { phone_number: storedPhone },
            update: { name: name || undefined, last_channel: 'website', last_interaction: new Date() },
            create: {
                phone_number: storedPhone, name: name || null, source: 'website',
                contact_type: 'BUYER', intent: 'buy',
                tenant_id: tenant.id, last_channel: 'website', last_interaction: new Date()
            }
        });

        // Upsert to prevent duplicates (unique constraint on contact_id + inventory_id)
        const saved = await prisma.savedProperty.upsert({
            where: { contact_id_inventory_id: { contact_id: storedPhone, inventory_id: property_id } },
            update: {},
            create: { tenant_id: tenant.id, contact_id: storedPhone, inventory_id: property_id, source: 'website' }
        });

        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id, phone_number: storedPhone, channel: 'website',
                direction: 'inbound', event_type: 'property_saved',
                content: `Saved property ${property_id} to favorites`,
                metadata: { property_id, saved_id: saved.id }
            }
        });

        res.status(201).json({ success: true, saved_id: saved.id });
    } catch (error) {
        captureRouteError(error, req, { route: 'public#13' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /public/share-property-whatsapp - Share property details via WhatsApp + auto-save
router.post('/share-property-whatsapp', async (req, res) => {
    const { name, property_id } = req.body;
    // Normalize to E.164 so the contact PK is openable in admin (no validate() on this route)
    const phone = normalizePhone(req.body.phone || '');
    if (!phone || !/^\+91[6-9]\d{9}$/.test(phone) || !name || !property_id) {
        return res.status(400).json({ error: 'valid phone, name, and property_id are required' });
    }

    try {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return res.status(500).json({ error: 'Tenant not found' });

        // Resolve to the actual stored contact PK so a legacy bare/dash-stored
        // contact is matched, not duplicated by the normalized phone.
        // (phone stays normalized E.164 for the outbound WhatsApp send.)
        const storedPhone = (await resolveStoredContactPhone(phone, prisma)) ?? phone;

        // Upsert contact
        await prisma.contact.upsert({
            where: { phone_number: storedPhone },
            update: { name, last_channel: 'website', last_interaction: new Date() },
            create: {
                phone_number: storedPhone, name, source: 'website',
                contact_type: 'BUYER', intent: 'buy',
                tenant_id: tenant.id, last_channel: 'website', last_interaction: new Date()
            }
        });

        // Fetch property details for the WhatsApp message
        const property = await prisma.inventory.findUnique({
            where: { id: property_id },
            select: {
                id: true, slug: true, apartment_name: true, type: true, price: true,
                price_unit: true, display_price: true, locality: true, city: true,
                district: true, specs: true, intent: true
            }
        });
        if (!property) return res.status(404).json({ error: 'Property not found' });

        const title = [property.apartment_name, property.type?.replace(/_/g, ' ')].filter(Boolean).join(' - ') || 'Property';
        const location = [property.locality, property.city || property.district].filter(Boolean).join(', ');
        const price = property.display_price || property.price;
        const priceText = price ? `₹${price} ${property.price_unit || ''}`.trim() : 'Price on request';
        const link = `https://www.realtypandit.in/properties/${property.slug || property.id}`;
        const specs: any = property.specs || {};
        const specsText = [specs.bedrooms ? `${specs.bedrooms} BHK` : '', specs.area ? `${specs.area} sqft` : ''].filter(Boolean).join(' | ');

        const message = `🏠 *${title}*\n📍 ${location}\n💰 ${priceText}${specsText ? `\n📐 ${specsText}` : ''}\n🔗 ${link}\n\nShared via Realty Pandit`;

        // Send WhatsApp message via service
        try {
            const { default: WhatsAppService } = await import('../services/whatsapp');
            const wa = new WhatsAppService();
            await wa.sendText(phone, message);
        } catch (waErr) {
            logger.warn('WhatsApp send failed for share-property', { phone, error: (waErr as Error).message });
        }

        // Auto-save as favorite
        await prisma.savedProperty.upsert({
            where: { contact_id_inventory_id: { contact_id: storedPhone, inventory_id: property_id } },
            update: {},
            create: { tenant_id: tenant.id, contact_id: storedPhone, inventory_id: property_id, source: 'whatsapp' }
        });

        // Log interaction
        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id, phone_number: storedPhone, channel: 'website',
                direction: 'inbound', event_type: 'property_shared',
                content: `Shared property ${property_id} via WhatsApp`,
                metadata: { property_id, channel: 'whatsapp' }
            }
        });

        res.json({ success: true, message: 'Property details sent to your WhatsApp!' });
    } catch (error) {
        captureRouteError(error, req, { route: 'public#14' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /public/nearby-landmarks/:propertyId - Fetch nearby landmarks via Google Places
router.get('/nearby-landmarks/:propertyId', cache(3600), async (req, res) => {
    try {
        const property = await prisma.inventory.findUnique({
            where: { id: req.params.propertyId },
            select: { latitude: true, longitude: true }
        });

        if (!property?.latitude || !property?.longitude) {
            return res.json({ landmarks: [] });
        }

        const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;
        if (!GOOGLE_KEY) return res.json({ landmarks: [] });

        const types = ['school', 'hospital', 'shopping_mall', 'transit_station', 'park'];
        const landmarks: { name: string; type: string; distance_km: number; lat?: number; lng?: number }[] = [];

        for (const placeType of types) {
            try {
                const response = await fetch(
                    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${property.latitude},${property.longitude}&radius=3000&type=${placeType}&key=${GOOGLE_KEY}`
                );
                const data = await response.json() as any;
                const places = (data.results || []).slice(0, 3);
                for (const place of places) {
                    const lat2 = place.geometry?.location?.lat;
                    const lng2 = place.geometry?.location?.lng;
                    let distKm = 0;
                    if (lat2 && lng2) {
                        const R = 6371;
                        const dLat = (lat2 - property.latitude) * Math.PI / 180;
                        const dLon = (lng2 - property.longitude) * Math.PI / 180;
                        const a = Math.sin(dLat / 2) ** 2 + Math.cos(property.latitude * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
                        distKm = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
                    }
                    landmarks.push({ name: place.name, type: placeType, distance_km: distKm, lat: lat2 || undefined, lng: lng2 || undefined });
                }
            } catch {
                // Skip failed place type
            }
        }

        res.json({ landmarks });
    } catch (error) {
        captureRouteError(error, req, { route: 'public#15' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /public/properties/:id/ai-description - AI-generated property description
router.get('/properties/:id/ai-description', cache(300), async (req, res) => {
    try {
        const { id } = req.params;

        const property = await prisma.inventory.findFirst({
            where: {
                OR: [
                    { id },
                    { display_id: id },
                    { slug: id },
                ]
            },
            select: {
                id: true,
                type: true,
                category: true,
                location: true,
                city: true,
                locality: true,
                price: true,
                price_unit: true,
                intent: true,
                specs: true,
                // features/furnishing/facing/property_age/total_floors dropped Phase 4 — read from specs.*
                description: true,
                apartment_name: true,
                floor_number: true,
                property_configuration: { select: { name: true } },
            }
        });

        if (!property) {
            return res.status(404).json({ description: null });
        }

        const lang = (req.query.lang === 'hindi' ? 'hindi' : 'english') as 'english' | 'hindi';

        const description = await llmService.generatePropertyDescription(property.id, {
            type: property.property_configuration?.name || property.type,
            category: property.category,
            location: property.location,
            city: property.city,
            locality: property.locality,
            price: property.price,
            price_unit: property.price_unit,
            intent: property.intent,
            // Phase 4 dedup (2026-05-28): legacy keys preserved in the shape sent to the
            // description generator, sourced from specs.* (canonical SoT).
            specs: property.specs,
            features: (property.specs as any)?.amenities ?? null,
            furnishing: (property.specs as any)?.furnishing ?? null,
            facing: (property.specs as any)?.facing ?? null,
            property_age: (property.specs as any)?.['age-of-construction'] ?? null,
            description: property.description,
            apartment_name: property.apartment_name,
            floor_number: property.floor_number,
            total_floors: (property.specs as any)?.floors ?? null,
        }, lang);

        res.json({ description: description || null });
    } catch (error) {
        captureRouteError(error, req, { route: 'public#16' });
        logger.error('[Public] AI description error:', error);
        res.json({ description: null });
    }
});

// POST /public/post-property - Owner posts property listing
router.post('/post-property', validate(postPropertySchema), async (req, res) => {
    const {
        intent,
        category, type, // Legacy fields
        category_id, sub_category_id, type_id, configuration_id, // Classification hierarchy
        usage_type_id, investment_type_id, // Usage & investment classification
        location, price, price_unit, specs, features, description, furnishing, owner_name, email
    } = req.body;

    try {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) {
            return res.status(500).json({ error: 'System not configured' });
        }

        // Resolve to the actual stored contact PK so a legacy bare/dash-stored
        // contact is matched, not duplicated by the normalized phone.
        const phone = (await resolveStoredContactPhone(req.body.phone, prisma)) ?? req.body.phone;

        // Upsert contact as LANDLORD
        const contact = await prisma.contact.upsert({
            where: { phone_number: phone },
            update: {
                name: owner_name || undefined,
                email: email || undefined,
                contact_type: 'LANDLORD',
                last_channel: 'website',
                last_interaction: new Date()
            },
            create: {
                phone_number: phone,
                name: owner_name || null,
                email: email || null,
                source: 'website',
                contact_type: 'LANDLORD',
                intent: intent,
                tenant_id: tenant.id,
                last_channel: 'website',
                last_interaction: new Date()
            }
        });

        // Check if posted by an external agent (optional Bearer token)
        let agentId: string | null = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                const decoded: any = jwt.verify(token, process.env.AGENT_JWT_SECRET!);
                if (decoded && decoded.id) {
                    agentId = decoded.id;
                    logger.info(`Property posted by agent: ${agentId}`);
                }
            } catch (err) {
                logger.warn('Invalid agent token ignored during property post');
            }
        }

        // Auto-detect agent by phone number if no JWT token
        if (!agentId && phone) {
            const normalizedPhone = normalizePhone(phone);
            const variants = phoneVariants(phone);
            const matchedAgent = await prisma.agent.findFirst({
                where: {
                    tenant_id: tenant.id,
                    status: 'active',
                    phone_number: { in: variants },
                },
                select: { id: true, name: true },
            });
            if (matchedAgent) {
                agentId = matchedAgent.id;
                logger.info(`Property auto-linked to agent ${matchedAgent.name} (${matchedAgent.id}) by phone ${normalizedPhone}`);
            }
        }

        // RESOLVE LEGACY FIELDS FROM IDs (Backward Compatibility)
        let legacyCategory = category;
        let legacyType = type;

        // If new IDs provided, fetch slugs
        if (category_id) {
            const cat = await prisma.propertyCategory.findUnique({ where: { id: category_id } });
            if (cat) legacyCategory = cat.slug;
        }
        if (type_id) {
            const typ = await prisma.propertyType.findUnique({ where: { id: type_id } });
            if (typ) legacyType = typ.slug;
        }

        // Fallback defaults if still missing
        if (!legacyCategory) legacyCategory = 'residential';
        if (!legacyType) legacyType = 'flat';

        // DYNAMIC VALIDATION BASED ON VALIDATION_RULES
        if (sub_category_id) {
            const subCategory = await prisma.propertySubCategory.findUnique({
                where: { id: sub_category_id },
                select: { validation_rules: true }
            });

            if (subCategory && subCategory.validation_rules) {
                const rules = subCategory.validation_rules as Record<string, any>;

                // Check required fields based on rules
                if (rules.bhk_required && !configuration_id) {
                    return res.status(400).json({ error: 'Configuration (BHK) is required for this property type' });
                }
                if (rules.builtup_area_required && !specs?.area) {
                    return res.status(400).json({ error: 'Built-up area is required for this property type' });
                }
                if (rules.plot_area_required && !specs?.area) {
                    return res.status(400).json({ error: 'Plot area is required for this property type' });
                }
                if (rules.floor_required && !specs?.floor) {
                    return res.status(400).json({ error: 'Floor number is required for this property type' });
                }
            }
        }

        // Ensure Owner exists for this phone (creates if needed)
        const ownerId = await ensureOwner(phone, tenant.id);

        // If posted by an external agent, update owner scope
        if (agentId) {
            await prisma.owner.update({
                where: { id: ownerId },
                data: { scope: 'EXTERNAL' },
            }).catch(() => {}); // non-blocking
        }

        // Create inventory record
        const property = await prisma.inventory.create({
            data: {
                tenant_id: tenant.id,
                owner_id: ownerId,
                owner_phone: phone,

                // New Classification
                category_id: category_id || undefined,
                sub_category_id: sub_category_id || undefined,
                type_id: type_id || undefined,
                configuration_id: configuration_id || undefined,
                usage_type_id: usage_type_id || undefined,
                investment_type_id: investment_type_id || undefined,

                // Legacy Field Mapping
                category: legacyCategory,
                type: legacyType,

                location,
                price: parseFloat(String(price)),
                price_unit: price_unit || 'Lakh',
                intent,
                specs: {
                    ...specs,
                    description: description || undefined,
                    furnishing: furnishing || undefined,
                    // `features` column dropped 2026-05-28 → amenities live in specs.amenities (array of labels).
                    ...(Array.isArray(features) && features.length ? { amenities: features } : {}),
                },
                status: 'active',
                media_urls: [],

                // Agent & uploader info
                uploaded_by_agent_id: agentId || undefined,
                upload_source: 'website',
                uploader_name: owner_name || undefined,
                uploader_phone: phone,
            }
        });

        // Generate SEO slug for the property
        try {
            const slug = await generateUniqueSlug({
                id: property.id,
                type: legacyType,
                category: legacyCategory,
                specs: specs || {},
                intent,
                location,
            });
            await prisma.inventory.update({ where: { id: property.id }, data: { slug } });
        } catch (slugErr) {
            logger.warn('Failed to generate slug for property', { id: property.id, error: slugErr });
        }

        // Log interaction
        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id,
                phone_number: phone,
                channel: 'website',
                direction: 'inbound',
                event_type: 'property_posted',
                content: `Property posted: ${legacyType} in ${location} for ${intent} at ${price} ${price_unit || 'Lakh'}`,
                metadata: { property_id: property.id }
            }
        });

        // Invalidate property cache
        await cacheDel('cache:/public/properties*');
        await cacheDel('cache:/public/featured*');

        res.status(201).json({ success: true, property_id: property.id, message: 'Property submitted! Panditji will verify and list it within 24 hours.' });
    } catch (error) {
        captureRouteError(error, req, { route: 'public#17' });
        logger.error('Post Property Error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// =============================================
// TASK-119: UNIFIED MATCHING (RESALE + PROJECTS)
// =============================================

// GET /public/matches - Unified search for both resale properties and new projects
router.get('/matches', cache(180), async (req, res) => {
    const {
        intent, propertyType, budgetMin, budgetMax, location,
        configuration, city, locality
    } = req.query;

    try {
        let inventoryMatches: any[] = [];
        let projectMatches: any[] = [];

        // Fetch resale inventory matches
        const inventoryWhere: any = { status: 'active' };
        if (intent) inventoryWhere.intent = intent as string;
        if (propertyType) inventoryWhere.type = { contains: propertyType as string, mode: 'insensitive' };
        if (location) inventoryWhere.location = { contains: location as string, mode: 'insensitive' };
        if (budgetMin || budgetMax) {
            inventoryWhere.price = {};
            if (budgetMin) inventoryWhere.price.gte = parseFloat(budgetMin as string);
            if (budgetMax) inventoryWhere.price.lte = parseFloat(budgetMax as string);
        }

        inventoryMatches = await prisma.inventory.findMany({
            where: inventoryWhere,
            take: 10,
            orderBy: [{ media_score: 'desc' }, { created_at: 'desc' }],
            select: {
                id: true, category: true, type: true, specs: true,
                // features dropped Phase 4 — read from specs.amenities
                location: true, price: true, price_unit: true, status: true,
                intent: true, media_urls: true, created_at: true,
                // owner_phone removed 2026-06-04 — was leaking to unauthenticated /matches callers.
                taxonomy_node: { select: { id: true, name: true, slug: true } },
            }
        });

        // Fetch new project matches (only for buy intent)
        // NOTE: Projects table not yet migrated to DB - skipped until migration is run
        if (false && (intent === 'buy' || !intent)) {
            const projectWhere: any = { status: 'ACTIVE' };

            if (city) projectWhere.city = { contains: city as string, mode: 'insensitive' };
            if (locality) projectWhere.locality = { contains: locality as string, mode: 'insensitive' };
            if (location) {
                projectWhere.OR = [
                    { city: { contains: location as string, mode: 'insensitive' } },
                    { locality: { contains: location as string, mode: 'insensitive' } }
                ];
            }

            if (budgetMin || budgetMax || configuration) {
                projectWhere.units = {
                    some: {
                        is_active: true,
                        ...(configuration && { configuration: configuration as string }),
                        ...(budgetMin && { price_min: { gte: parseFloat(budgetMin as string) } }),
                        ...(budgetMax && { price_max: { lte: parseFloat(budgetMax as string) } })
                    }
                };
            }

            projectMatches = await prisma.project.findMany({
                where: projectWhere,
                take: 10,
                orderBy: { created_at: 'desc' },
                include: {
                    owner: {
                        include: {
                            subscription: true,
                            contact: { select: { name: true } }
                        }
                    },
                    units: {
                        where: { is_active: true },
                        take: 3
                    },
                    media: {
                        where: { media_type: 'IMAGE' },
                        take: 1
                    }
                }
            });
        }

        // Add type discriminator for frontend
        const inventoryWithType = inventoryMatches.map(item => ({ ...item, matchType: 'inventory' }));
        const projectsWithType = projectMatches.map(item => ({ ...item, matchType: 'project' }));

        res.json({
            resale: inventoryWithType.slice(0, 5),
            projects: projectsWithType.slice(0, 5),
            totalResale: inventoryMatches.length,
            totalProjects: projectMatches.length
        });

    } catch (error) {
        captureRouteError(error, req, { route: 'public#18' });
        logger.error('Unified matching error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// =============================================
// PHASE 15: BUILDER PROJECT ENDPOINTS
// =============================================

// GET /public/projects - Builder project listings
// NOTE: Projects table not yet migrated to DB — returns empty until migration is run
router.get('/projects', cache(300), async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page as string || '1'));
    const limit = Math.min(50, parseInt(req.query.limit as string || '12'));
    res.json({
        projects: [],
        pagination: { page, limit, total: 0, totalPages: 0 }
    });
});

// GET /public/projects/:id - Single project detail
// NOTE: Projects table not yet migrated to DB
router.get('/projects/:id', cache(60), async (req, res) => {
    res.status(404).json({ error: 'Project not found' });
});

// GET /public/featured-projects - Featured builder projects for homepage
// NOTE: Projects table not yet migrated to DB — returns empty array until migration is run
router.get('/featured-projects', cache(600), async (req, res) => {
    res.json([]);
});

// GET /public/similar-projects - Similar projects based on city/type
// NOTE: Projects table not yet migrated to DB — returns empty array until migration is run
router.get('/similar-projects', cache(300), async (req, res) => {
    res.json([]);
});

// POST /public/project-enquiry - Submit project enquiry (creates BuilderLead)
// NOTE: Projects table not yet migrated to DB
router.post('/project-enquiry', validate(leadSchema), async (req, res) => {
    return res.status(404).json({ error: 'Project not found or not active' });

    const { name, phone, email, projectId, configuration, message } = req.body;

    try {
        // Validate project exists and is active
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { id: true, status: true, name: true }
        });

        if (!project || project.status !== 'ACTIVE') {
            return res.status(404).json({ error: 'Project not found or not active' });
        }

        // Get tenant
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) {
            return res.status(500).json({ error: 'Tenant configuration missing' });
        }

        // SSOT: Contact creation/update
        let contact = await prisma.contact.findUnique({
            where: { phone_number: phone }
        });

        if (!contact) {
            contact = await prisma.contact.create({
                data: {
                    phone_number: phone,
                    tenant_id: tenant.id,
                    name: name,
                    email: email,
                    contact_type: 'BUYER',
                    source: 'website_project_enquiry'
                }
            });
        } else {
            // Update existing contact with latest info
            await prisma.contact.update({
                where: { phone_number: phone },
                data: {
                    name: name || contact.name,
                    email: email || contact.email
                }
            });
        }

        // Create BuilderLead
        const lead = await prisma.builderLead.create({
            data: {
                project_id: projectId,
                contact_phone: phone,
                source: 'website',
                configuration: configuration || null,
                status: 'NEW'
            }
        });

        // Log interaction
        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id,
                phone_number: phone,
                channel: 'website',
                direction: 'inbound',
                event_type: 'project_enquiry',
                content: message || `Enquired about ${project.name}${configuration ? ` (${configuration})` : ''}`,
                metadata: {
                    project_id: projectId,
                    lead_id: lead.id,
                    configuration: configuration
                }
            }
        });

        // Invalidate project cache
        await cacheDel('cache:/public/projects*');

        res.status(201).json({
            success: true,
            lead_id: lead.id,
            message: 'Enquiry submitted successfully! Our team will contact you soon.'
        });

    } catch (error) {
        captureRouteError(error, req, { route: 'public#19' });
        logger.error('Project enquiry error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// =============================================
// GEO DATA ENDPOINTS (Indian States & Cities)
// =============================================

// GET /public/geo/states — All Indian states and UTs
router.get('/geo/states', cache(86400), async (_req, res) => {
    res.json({ states: INDIAN_STATES });
});

// GET /public/geo/cities?state=Uttar Pradesh — Cities filtered by state name
router.get('/geo/cities', cache(86400), async (req, res) => {
    const stateName = req.query.state as string;
    if (!stateName) {
        return res.status(400).json({ error: 'state query parameter is required' });
    }

    const stateEntry = INDIAN_STATES.find(
        s => s.name === stateName || s.code === stateName.toUpperCase()
    );

    if (!stateEntry) {
        return res.status(404).json({ error: `State not found: ${stateName}` });
    }

    const cities = DISTRICTS_BY_STATE[stateEntry.code] || [];
    res.json({ state: stateEntry.name, cities });
});

// GET /public/geo/districts — Alias for /geo/cities (backward compat)
router.get('/geo/districts', cache(86400), async (req, res) => {
    const stateName = req.query.state as string;
    if (!stateName) {
        return res.status(400).json({ error: 'state query parameter is required' });
    }

    const stateEntry = INDIAN_STATES.find(
        s => s.name === stateName || s.code === stateName.toUpperCase()
    );

    if (!stateEntry) {
        return res.status(404).json({ error: `State not found: ${stateName}` });
    }

    const districts = DISTRICTS_BY_STATE[stateEntry.code] || [];
    res.json({ state: stateEntry.name, districts });
});

// =============================================
// MASTER DATA ENDPOINTS
// =============================================

// GET /public/master/flat-property-types — All active flat property types
router.get('/master/flat-property-types', cache(1800), async (req, res) => {
    const { main_category } = req.query;

    try {
        const where: any = { is_active: true };
        if (main_category) where.main_category = main_category as string;

        const types = await prisma.flatPropertyType.findMany({
            where,
            orderBy: { display_order: 'asc' },
            select: {
                id: true,
                name: true,
                slug: true,
                main_category: true,
                icon: true,
                display_order: true,
                bhk_required: true,
                floor_required: true,
                plot_area_required: true,
            },
        });

        res.json({ types });
    } catch (error) {
        captureRouteError(error, req, { route: 'public#20' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /public/agents — List active partner agents (for public marketplace page)
router.get('/agents', cache(120), async (req, res) => {
    try {
        const { city, category, plan, page = '1', limit = '20' } = req.query as Record<string, string>;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(50, parseInt(limit) || 20);
        const skip = (pageNum - 1) * limitNum;

        const where: any = { status: 'ACTIVE', verified: true };
        if (city) where.city = { contains: city, mode: 'insensitive' };
        if (category) where.partner_category = category.toUpperCase();
        if (plan) where.package_type = plan.toUpperCase();

        const [agents, total] = await Promise.all([
            prisma.partnerAgent.findMany({
                where,
                skip,
                take: limitNum,
                select: {
                    id: true,
                    name: true,
                    business_name: true,
                    company_name: true,
                    city: true,
                    partner_category: true,
                    package_type: true,
                    verified: true,
                    priority_score: true,
                    created_at: true,
                },
            }),
            prisma.partnerAgent.count({ where }),
        ]);

        // Sort by plan priority: ADVANCE_PRO > PRO > FREE, then by priority_score desc
        const planPriority: Record<string, number> = { ADVANCE_PRO: 0, PRO: 1, FREE: 2 };
        agents.sort((a, b) => {
            const planDiff = (planPriority[a.package_type] ?? 2) - (planPriority[b.package_type] ?? 2);
            if (planDiff !== 0) return planDiff;
            return (b.priority_score ?? 50) - (a.priority_score ?? 50);
        });

        res.json({
            agents,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'public#21' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /public/agents/:id — Public agent profile
router.get('/agents/:id', cache(120), async (req, res) => {
    try {
        const agent = await prisma.partnerAgent.findFirst({
            where: { id: req.params.id, status: 'ACTIVE', verified: true },
            select: {
                id: true,
                name: true,
                business_name: true,
                company_name: true,
                city: true,
                partner_category: true,
                package_type: true,
                verified: true,
                priority_score: true,
                created_at: true,
                // phone_number intentionally excluded — protect privacy
            },
        });

        if (!agent) return res.status(404).json({ error: 'Agent not found' });

        // Count their active listings via Owner (linked by contact_phone = phone_number)
        let listingCount = 0;
        try {
            const partnerFull = await prisma.partnerAgent.findUnique({
                where: { id: agent.id },
                select: { phone_number: true },
            });
            if (partnerFull) {
                const owner = await prisma.owner.findFirst({ where: { contact_phone: partnerFull.phone_number } });
                if (owner) {
                    listingCount = await prisma.inventory.count({ where: { owner_id: owner.id, status: 'active' } });
                }
            }
        } catch {}

        res.json({ agent: { ...agent, listing_count: listingCount } });
    } catch (error) {
        captureRouteError(error, req, { route: 'public#22' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /public/properties/:id/request-otp
// Sends a 6-digit OTP to the buyer's WhatsApp to verify before revealing agent contact
router.post('/properties/:id/request-otp', async (req, res) => {
    const { id } = req.params;
    const { phone } = req.body;

    if (!phone) return res.status(400).json({ error: 'phone is required' });

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return res.status(400).json({ error: 'Invalid phone number' });

    // Rate limit: max 3 OTP requests per phone per hour
    const rateLimitKey = `otp_rate:${normalizedPhone}:${id}`;
    const rateCount = await cacheGet(rateLimitKey);
    if (rateCount && parseInt(rateCount) >= 3) {
        return res.status(429).json({ error: 'Too many OTP requests. Please try again later.' });
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpKey = `phone_reveal_otp:${normalizedPhone}:${id}`;

    // Store OTP in Redis with 10-minute TTL
    await cacheSet(otpKey, JSON.stringify({ otp, attempts: 0 }), 600);

    // Increment rate limit counter (TTL = 1 hour)
    await cacheSet(rateLimitKey, String(parseInt(rateCount || '0') + 1), 3600);

    // Send OTP via WhatsApp
    const waPhone = normalizedPhone.replace(/^\+?91/, '');
    const message = `Your Realty Pandit verification code is *${otp}*. Valid for 10 minutes. Do not share this code.`;

    try {
        await whatsappService.sendText(`91${waPhone}`, message);
        res.json({ success: true, message: 'OTP sent to your WhatsApp', expires_in: 600 });
    } catch (err) {
        captureRouteError(err, req, { route: 'public#23' });
        logger.error('[Public/request-otp] WhatsApp send failed:', (err as Error).message);
        res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
    }
});

// POST /public/properties/:id/verify-otp
// Verifies the OTP and returns the assigned internal agent's contact details
router.post('/properties/:id/verify-otp', async (req, res) => {
    const { id } = req.params;
    const { phone, otp } = req.body;

    if (!phone || !otp) return res.status(400).json({ error: 'phone and otp are required' });

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return res.status(400).json({ error: 'Invalid phone number' });

    // Rate limit: max 5 failed OTP attempts per IP per hour
    const ipRateLimitKey = `otp_attempts:${req.ip}:${id}`;
    const ipAttempts = await cacheGet(ipRateLimitKey);
    if (ipAttempts && parseInt(ipAttempts) >= 5) {
        return res.status(429).json({ error: 'Too many failed attempts. Please try again later.' });
    }

    const otpKey = `phone_reveal_otp:${normalizedPhone}:${id}`;
    const stored = await cacheGet(otpKey);

    if (!stored) {
        return res.status(400).json({ error: 'OTP expired or not found. Please request a new one.' });
    }

    let otpData: { otp: string; attempts: number };
    try {
        otpData = JSON.parse(stored);
    } catch {
        return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
    }

    if (otpData.attempts >= 3) {
        await cacheDel(otpKey);
        return res.status(400).json({ error: 'Too many invalid attempts. Please request a new OTP.' });
    }

    if (otpData.otp !== otp.toString()) {
        // Increment failed attempts
        otpData.attempts += 1;
        await cacheSet(otpKey, JSON.stringify(otpData), 600);
        // Track per-IP failures
        await cacheSet(ipRateLimitKey, String(parseInt(ipAttempts || '0') + 1), 3600);
        const remaining = 3 - otpData.attempts;
        return res.status(400).json({ error: `Invalid OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` });
    }

    // OTP matched — delete it (single use)
    await cacheDel(otpKey);

    let agentName = 'Realty Pandit Team';
    let agentPhone = '+918178491914'; // Fallback: Realty Pandit main number

    try {
        const tenant = await prisma.tenant.findFirst();
        // Inventory routing + requirement fields.
        const inventory = await prisma.inventory.findUnique({
            where: { id },
            select: {
                assigned_agent_id: true, owning_manager_id: true, uploaded_by_agent_id: true,
                intent: true, taxonomy_node_id: true, specs: true,
                locality: true, city: true, district: true, location: true,
            },
        });

        // Route: EXISTING → their agent; NEW → the inventory manager.
        const { storedPhone, handlerId } = await resolveWebsiteLeadHandler(
            normalizedPhone,
            inventory || { assigned_agent_id: null, owning_manager_id: null, uploaded_by_agent_id: null }
        );

        // Capture + OWN the lead so the buyer who reveals the number is never lost.
        // NEW → assigned to the handler + a requirement mirroring the inventory; EXISTING preserved.
        if (tenant) {
            await prisma.contact.upsert({
                where: { phone_number: storedPhone },
                update: { last_channel: 'website', last_interaction: new Date() },
                create: {
                    phone_number: storedPhone,
                    source: 'website',
                    tenant_id: tenant.id,
                    last_channel: 'website',
                    last_interaction: new Date(),
                    assigned_agent_id: handlerId,
                    owning_manager_id: handlerId,
                    ...(inventory ? buildDemandFromInventory(inventory) : { contact_type: 'BUYER', intent: 'buy' }),
                },
            });
        }

        // Reveal the HANDLER's contact (existing → their agent; new → inventory manager).
        if (handlerId) {
            const handler = await prisma.agent.findUnique({ where: { id: handlerId }, select: { name: true, phone: true } });
            if (handler?.phone) { agentName = handler.name; agentPhone = handler.phone; }
        }

        if (tenant) {
            await prisma.interaction.create({
                data: {
                    tenant_id: tenant.id,
                    phone_number: storedPhone,
                    channel: 'website',
                    direction: 'inbound',
                    event_type: 'phone_reveal',
                    content: `Buyer revealed agent contact for property ${id}`,
                    metadata: { property_id: id, agent_name: agentName },
                },
            });

            // Callback lead-action task for the handler (push + 15-min SLA escalation) so the
            // request lands in their PWA Tasks and never slips. Fire-and-forget; never throws.
            createLeadActionTask({
                phone: storedPhone,
                action: 'CALLBACK_REQUEST',
                tenantId: tenant.id,
                propertyId: id,
                sourceChannel: 'website',
                rawNote: 'Buyer requested agent contact (Contact Agent) on the website',
            }).catch(err => logger.warn('[Public/verify-otp] callback task failed:', (err as Error).message));
        }
    } catch (err) {
        logger.warn('[Public/verify-otp] Agent lookup/capture failed:', (err as Error).message);
        // Continue with fallback — don't fail the request
    }

    res.json({ agent_name: agentName, phone: agentPhone });
});

export default router;
