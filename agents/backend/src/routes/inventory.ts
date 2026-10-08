
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { InventoryStateMachine } from '../workflows/inventory_machine';
import prisma from '../db';
import { Prisma, AppointmentType, AppointmentStatus } from '@prisma/client';
import { upsertCatalogProduct, deleteCatalogProduct, syncInventoryById } from '../services/catalog_sync';
import { sessionStore } from '../services/session/store';
import { StorageService } from '../services/storage';
import { ensureOwner } from '../services/ensure_owner';
import { ensurePartnerAgent } from '../services/partner_auto_create';
import { authMiddleware, checkPermission } from '../middleware/auth';
import logger from '../utils/logger';
import { absurdPriceError } from '../utils/price_sanity';
import { ensureH264Playable } from '../utils/video_transcode';
import { normalizePhone, phoneVariants, isPlaceholderPhone } from '../utils/phone';
import { findInventoryIdsByAddress } from '../utils/inventory_search';
import { generateDisplayId } from '../utils/inventory_id';
import { getTeamIds } from '../utils/team_scope';
import { partnerOwnInventoryWhere } from '../utils/partner_scope';
import { expandTaxonomyNodeIds, bhkSpecsFilter } from '../utils/taxonomy_filter';
import { WhatsAppService } from '../services/whatsapp';
import { notify } from '../services/notify';
import { sanitizationService } from '../services/sanitization_service';
import { broadcastInventoryToQualifiedDeals } from '../services/inventory_broadcast';
import { broadcastNewInventoryToTeam } from '../services/team_inventory_broadcast';
import { resolveTypeFilter } from '../utils/demand_taxonomy';
import { bhkListFromDemand, typeNodeListFromDemand } from '../utils/demand_canonical';
import { cacheDel } from '../utils/redis';
import { HarvestError, ingestPortalListing } from '../services/portal_harvest';
import { portalIngestionAuth } from '../middleware/portal_ingestion_auth';

const router = Router();

// #9 owner railguard (2026-07-25): a team member's number must NEVER be stored as the property
// OWNER (supply contact). Matches on last-10 digits against ALL active staff (broadened from the
// old self-only edit check). Returns the staff member's name if the phone is active staff, else null.
async function activeStaffOwnerName(phone: string | null | undefined): Promise<string | null> {
    const d10 = (p: any) => (p ? String(p) : '').replace(/[^0-9]/g, '').slice(-10);
    const key = d10(phone);
    if (!key) return null;
    const staff = await prisma.agent.findMany({ where: { status: 'active' }, select: { name: true, phone: true } });
    const hit = staff.find(a => d10(a.phone) === key);
    return hit ? (hit.name || 'a team member') : null;
}
const stateMachine = new InventoryStateMachine();
const storageService = new StorageService();

// ─── Inventory media upload (photos + videos) ────────────────────────────────────────────
//
// 🔴 diskStorage, NOT memoryStorage (2026-08-11). multer buffers whole files in RAM, and this
// route accepts 20 files — at 100MB each that is 2GB against a ~2,096MB Node heap, i.e. a
// guaranteed OOM of the cluster worker. On disk it costs nothing; videos are moved into place
// and sharp reads images straight from the path.
const TMP_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'tmp');
fs.mkdirSync(TMP_UPLOAD_DIR, { recursive: true });

// Cap is 100MB, but Cloudflare Free rejects request bodies over 100MB at the EDGE, before this
// server ever sees them — so the practical ceiling users are told about is 95MB, leaving room
// for multipart overhead. Keep the two numbers in step with the frontend guard.
const MAX_UPLOAD_MB = 100;
export const ADVERTISED_MAX_UPLOAD_MB = 95;

const IMAGE_MIMES = [
    'image/jpeg', 'image/png', 'image/webp', 'image/avif',
    'image/heic', 'image/heif', 'image/gif', 'image/bmp',
];
// Formats phones actually produce: iPhone .mov, Android .mp4, budget Android .3gp, plus the
// .avi/.mkv the picker has always allowed users to choose. Non-h264 is transcoded after upload
// by ensureH264Playable, so accepting them here is safe.
const VIDEO_MIMES = [
    'video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp', 'video/3gpp2',
    'video/x-matroska', 'video/x-msvideo', 'video/x-m4v', 'video/mpeg',
];
const VIDEO_EXTS = ['.mp4', '.mov', '.webm', '.3gp', '.3g2', '.mkv', '.avi', '.m4v', '.mpeg', '.mpg'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.heic', '.heif', '.gif', '.bmp'];

const extOf = (name: string) => path.extname(name || '').toLowerCase();

/**
 * Is this a video? Decided by mimetype OR extension.
 *
 * 🔴 The extension half is load-bearing. Some Android pickers hand over a perfectly good .mp4 as
 * `application/octet-stream`; the old code keyed purely on `mimetype.startsWith('video/')`, so
 * such a file was routed to sharp as an image and the whole request 500'd. Verified on prod.
 */
export function isVideoUpload(file: { mimetype?: string; originalname?: string }): boolean {
    const mt = (file.mimetype || '').toLowerCase();
    if (mt.startsWith('video/')) return true;
    return VIDEO_EXTS.includes(extOf(file.originalname || ''));
}

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, TMP_UPLOAD_DIR),
        filename: (_req, file, cb) =>
            cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extOf(file.originalname)}`),
    }),
    limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const mt = (file.mimetype || '').toLowerCase();
        const ext = extOf(file.originalname);
        if (IMAGE_MIMES.includes(mt) || VIDEO_MIMES.includes(mt)) return cb(null, true);
        // Unknown/omitted mimetype from a phone picker — trust a known media extension instead.
        if ((!mt || mt === 'application/octet-stream') && (VIDEO_EXTS.includes(ext) || IMAGE_EXTS.includes(ext))) {
            return cb(null, true);
        }
        cb(new Error(`"${file.originalname}" is not a supported file. Please upload a photo (JPG, PNG, HEIC) or a video (MP4, MOV, WebM, 3GP, MKV, AVI).`));
    },
});

/**
 * multer wrapper that turns upload rejections into a readable 400.
 *
 * Without this the fileFilter error escapes as an unhandled error: the user sees
 * "Internal server error" with no idea what was wrong, and every rejected file fires an
 * [Alert:CRITICAL] server_5xx. (2026-08-11)
 */
const uploadMedia = (req: any, res: any, next: any) => {
    upload.array('images', 20)(req, res, (err: any) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: `That file is too large. The maximum is ${ADVERTISED_MAX_UPLOAD_MB} MB per file — for a long video, record at 1080p instead of 4K, or trim it.`,
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: 'Too many files at once. Please upload up to 20 at a time.' });
        }
        logger.warn(`[Upload] rejected: ${err.message}`);
        return res.status(400).json({ error: err.message || 'Upload failed' });
    });
};


// POST /inventory - Create single inventory record (authenticated)
router.post('/', authMiddleware, checkPermission('edit_inventory'), async (req, res) => {
    try {
        const {
            intent,
            // Classification IDs (preferred)
            category_id, sub_category_id, type_id, configuration_id,
            usage_type_id, investment_type_id,
            // Legacy fields (fallback)
            category, type,
            // Property details
            location, price, specs, features, description, furnishing,
            floor_number, floor_label, display_floor, total_floors, facing, property_age,
            // Owner info
            owner_phone, owner_name,
            // Key holder
            key_holder_type, key_holder_name, key_holder_phone,
            // Renovation
            renovated, roof_rights,
            // Pre-rented (pre-lease): for-sale property already tenanted + the current monthly rent.
            pre_rented, pre_rented_monthly_rent,
            // Commercial use (2026-07-29): a residential property also usable commercially + its type.
            commercial_use, commercial_use_type,
            // Source partner (middleman model, 2026-04-17). If the inventory came from
            // a partner agent, either pass their PartnerAgent.id or their phone (+ name).
            // If the phone is new, a PartnerAgent is auto-created and assigned to the
            // current admin user as managing_agent.
            source_partner_id, source_partner_phone, source_partner_name,
        } = req.body;

        if (!intent) {
            return res.status(400).json({ error: 'intent is required (sell, rent, lease)' });
        }
        if (!owner_phone) {
            return res.status(400).json({ error: 'owner_phone is required' });
        }

        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return res.status(500).json({ error: 'Tenant configuration missing' });

        // Normalize phone
        const phone = normalizePhone(owner_phone);
        if (!phone) return res.status(400).json({ error: 'Invalid owner phone number' });
        // #9 railguard: never store a team member as the property owner.
        const staffOwnerC = await activeStaffOwnerName(phone);
        if (staffOwnerC) return res.status(400).json({ error: `${staffOwnerC} is a team member and cannot be set as the property owner. Enter the actual owner's number.` });

        // Resolve legacy fields from classification IDs
        let legacyCategory = category;
        let legacyType = type;

        if (category_id && !legacyCategory) {
            const cat = await prisma.propertyCategory.findUnique({ where: { id: category_id } });
            if (cat) legacyCategory = cat.slug;
        }
        if (type_id && !legacyType) {
            const typ = await prisma.propertyType.findUnique({ where: { id: type_id } });
            if (typ) legacyType = typ.slug;
        }

        if (!legacyCategory) legacyCategory = 'residential';
        if (!legacyType) legacyType = 'flat';

        // Resolve source partner + owning manager (middleman model, 2026-04-17).
        // Resolved BEFORE the contact upsert so the owner contact can inherit the same
        // owning_manager_id as the inventory.
        // Priority: explicit source_partner_id > source_partner_phone (auto-create if new)
        // Owning manager: partner.managing_agent_id if partner present, else current user.
        let resolvedSourcePartnerId: string | null = source_partner_id || null;
        let owningManagerId: string | null = req.agent?.id ?? null;

        if (!resolvedSourcePartnerId && source_partner_phone) {
            try {
                const result = await ensurePartnerAgent(
                    source_partner_phone,
                    source_partner_name || '',
                    tenant.id,
                    req.agent!.id,
                );
                resolvedSourcePartnerId = result.partnerId;
            } catch (partnerErr) {
                logger.warn(`[Inventory POST] Partner auto-create failed: ${(partnerErr as Error).message}`);
            }
        }
        if (resolvedSourcePartnerId) {
            const partner = await prisma.partnerAgent.findUnique({
                where: { id: resolvedSourcePartnerId },
                select: { managing_agent_id: true },
            });
            if (partner?.managing_agent_id) {
                owningManagerId = partner.managing_agent_id;
            }
        }

        // Upsert contact as LANDLORD
        await prisma.contact.upsert({
            where: { phone_number: phone },
            update: {
                name: owner_name || undefined,
                contact_type: 'LANDLORD',
                last_channel: 'admin',
                last_interaction: new Date(),
            } as any,
            create: {
                phone_number: phone,
                name: owner_name || null,
                source: 'admin_created',
                contact_type: 'LANDLORD',
                intent,
                tenant_id: tenant.id,
                last_channel: 'admin',
                last_interaction: new Date(),
                created_by: req.agent?.id || null,
                owning_manager_id: owningManagerId,
            } as any,
        });

        // Ensure Owner exists
        const ownerId = await ensureOwner(phone, tenant.id);

        // Fold deprecated scalar fields into specs (single SoT — see Phase 1 plan).
        // furnishing/facing/property_age/total_floors/features columns no longer written.
        const mergedSpecs: Record<string, any> = (specs && typeof specs === 'object' && !Array.isArray(specs)) ? { ...specs } : {};
        if (furnishing && mergedSpecs.furnishing == null) mergedSpecs.furnishing = furnishing;
        if (facing && mergedSpecs.facing == null) mergedSpecs.facing = facing;
        if (property_age && mergedSpecs['age-of-construction'] == null) mergedSpecs['age-of-construction'] = property_age;
        if (total_floors && mergedSpecs.floors == null) mergedSpecs.floors = String(total_floors);
        if (features && typeof features === 'object' && !Array.isArray(features) && !Array.isArray(mergedSpecs.amenities)) {
            const AMENITY: Record<string, string> = { gym: 'Gym', club_house: 'Club House', power_backup: 'Power Backup', lift: 'Lift', intercom: 'Intercom', guest_house: 'Guest House', park: 'Park', community_hall: 'Community Hall', mini_theater: 'Mini Theater', swimming_pool: 'Swimming Pool', security: 'Security', gas_pipeline: 'Gas Pipeline', parking: 'Parking', garden: 'Garden', pool: 'Swimming Pool', water_supply: 'Water Supply' };
            const labels = Object.entries(features as Record<string, any>).filter(([, v]) => v).map(([k]) => AMENITY[k] || k);
            if (labels.length) mergedSpecs.amenities = labels;
        }

        // Area sanity (2026-06-11): drop non-positive area; flag implausibly-small values (likely a
        // unit mix-up, e.g. "4.5 sqm") — stored but logged, never silently rejected (owner may
        // override). This single write point covers ALL capture paths (admin add, website
        // post-property, WhatsApp workflow). Surfaced to owners via the ⚠ on cards + the report script.
        if (mergedSpecs.area != null && mergedSpecs.area !== '') {
            const areaNum = Number(mergedSpecs.area);
            if (!Number.isFinite(areaNum) || areaNum <= 0) {
                delete mergedSpecs.area;
            } else {
                const AREA_SQFT: Record<string, number> = { sqft: 1, sqm: 10.7639, sqyd: 9, acre: 43560, bigha: 27000, marla: 272.25, gaj: 9, katha: 720 };
                const sqftNorm = areaNum * (AREA_SQFT[String(mergedSpecs.area_unit || 'sqft').toLowerCase()] ?? 1);
                if (sqftNorm < 100) {
                    logger.warn(`[inventory.create] implausibly small area ${mergedSpecs.area} ${mergedSpecs.area_unit || 'sqft'} (~${Math.round(sqftNorm)} sqft) for ${legacyType || 'property'} by ${phone} — stored but flagged for review`);
                }
            }
        }

        // Guard: reject fat-fingered demand prices (e.g. ₹782 Cr on a flat); land/plots exempt.
        const createPriceErr = absurdPriceError(price ? parseFloat(String(price)) : null, legacyType);
        if (createPriceErr) return res.status(400).json({ error: createPriceErr });

        // Create inventory
        const inventory = await prisma.inventory.create({
            data: {
                tenant_id: tenant.id,
                owner_id: ownerId,
                owner_phone: phone,

                // Classification IDs
                category_id: category_id || undefined,
                sub_category_id: sub_category_id || undefined,
                type_id: type_id || undefined,
                configuration_id: configuration_id || undefined,
                usage_type_id: usage_type_id || undefined,
                investment_type_id: investment_type_id || undefined,

                // Legacy fields
                category: legacyCategory,
                type: legacyType,

                // Core
                location,
                price: price ? parseFloat(String(price)) : null,
                intent,
                specs: Object.keys(mergedSpecs).length > 0 ? mergedSpecs : null,
                status: 'active',
                media_urls: [],

                // Property details (only non-deprecated columns)
                description: description || null,
                // floor_number is a sort key — keep 0 (Ground), don't treat it as falsy. floor_label is the
                // authoritative display value for named levels; display_floor is the buyer-facing override.
                floor_number: floor_number !== undefined && floor_number !== null && floor_number !== '' ? parseInt(String(floor_number)) : null,
                floor_label: floor_label ? String(floor_label).trim() : null,
                display_floor: display_floor ? String(display_floor).trim() : null,

                // Key holder
                key_holder_type: key_holder_type || null,
                key_holder_name: key_holder_name || null,
                key_holder_phone: key_holder_phone || null,

                // Renovation
                renovated: renovated === true || renovated === 'true',
                roof_rights: roof_rights === true || roof_rights === 'true',

                // Pre-rented (pre-lease): for-sale property already tenanted + the sitting tenant's monthly rent
                pre_rented: pre_rented === true || pre_rented === 'true',
                pre_rented_monthly_rent: pre_rented_monthly_rent != null && pre_rented_monthly_rent !== ''
                    ? Number(pre_rented_monthly_rent) : null,

                // Commercial use (2026-07-29): residential property also usable commercially. Type only
                // kept when the flag is on. (UI shows this option only for residential listings.)
                commercial_use: commercial_use === true || commercial_use === 'true',
                commercial_use_type: (commercial_use === true || commercial_use === 'true') && commercial_use_type
                    ? String(commercial_use_type).toLowerCase() : null,

                // Uploader — also auto-assign to uploader if no explicit assignment
                uploaded_by_agent_id: req.agent!.id,
                assigned_agent_id: req.agent!.id,

                // Source partner + owning manager (middleman model, 2026-04-17)
                referral_partner_id: resolvedSourcePartnerId,
                owning_manager_id: owningManagerId,
            } as any,
        });

        upsertCatalogProduct(inventory).catch(e => logger.warn('[Catalog] post-create upsert failed:', e.message));

        // Log interaction
        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id,
                phone_number: phone,
                channel: 'admin',
                direction: 'inbound',
                event_type: 'inventory_created',
                content: `Property created: ${legacyType} in ${location || 'unknown'} for ${intent}`,
                metadata: { property_id: inventory.id, created_by: req.agent!.id },
            },
        });

        // T7: a fresh listing must surface on the public homepage showcase without
        // waiting out the 2-min cache TTL — bust the featured + properties caches now.
        cacheDel('cache:/public/featured*').catch(() => {});
        cacheDel('cache:/public/properties*').catch(() => {});

        // Team "new inventory" broadcast now fires CENTRALLY from the db.ts inventory.create
        // extension (covers every create path, idempotent) — no per-route call needed here. (2026-07-10)

        logger.info(`[Inventory] Created ${inventory.id} by agent ${req.agent!.id}`);
        res.status(201).json(inventory);
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#1' });
        logger.error('[Inventory POST] Error:', error);
        res.status(500).json({ error: 'Failed to create inventory' });
    }
});

// Helper: get owner IDs of partner agents managed by given agent IDs
const getManagedPartnerOwnerIds = async (agentIds: string[]): Promise<string[]> => {
    const partners = await prisma.partnerAgent.findMany({
        where: { managing_agent_id: { in: agentIds } },
        select: { phone_number: true },
    });
    if (partners.length === 0) return [];
    const owners = await prisma.owner.findMany({
        where: { contact_phone: { in: partners.map((p: { phone_number: string }) => p.phone_number) } },
        select: { id: true },
    });
    return owners.map((o: { id: string }) => o.id);
};

/**
 * PARTNER write-guard (2026-07-12). For any mutating inventory route a partner can reach, they may only
 * touch their OWN listing. Returns true when the request may proceed; sends 403 and returns false otherwise.
 * (No-op for team members — they keep their existing permission/team guards.)
 */
async function partnerMayMutateInventory(req: any, res: any, inventoryId: string): Promise<boolean> {
    const agent = req.agent;
    if (!agent || agent.role !== 'partner') return true;

    const pa = await prisma.partnerAgent.findUnique({
        where: { id: agent.id }, select: { status: true },
    });
    if (!pa || pa.status !== 'ACTIVE') {
        res.status(403).json({ error: 'Partner account is not active' });
        return false;
    }

    const inv = await prisma.inventory.findUnique({
        where: { id: inventoryId },
        select: { referral_partner_id: true, owner_phone: true, uploader_phone: true, key_holder_phone: true },
    });
    if (!inv) {
        res.status(404).json({ error: 'Inventory not found' });
        return false;
    }

    const { partnerIdsWithSubAgents, isPartnerOwnInventory } = await import('../utils/partner_scope');
    const { ids, phones } = await partnerIdsWithSubAgents(agent.id);
    if (!isPartnerOwnInventory(inv as any, ids, phones)) {
        logger.warn(`[PartnerGuard] Partner ${agent.id} blocked from mutating inventory ${inventoryId}`);
        res.status(403).json({ error: 'You can only modify your own listings.' });
        return false;
    }
    return true;
}

/**
 * POST /inventory/harvest
 * Ingest scraped / harvested listings from external portals (99acres, Magicbricks, Housing, etc.)
 * Extracts seller/owner details directly into the CRM Contact model and creates inventory with status PENDING_APPROVAL.
 * Auto-creates verification task for sourcing agents.
 */
router.post('/harvest', authMiddleware, checkPermission('edit_inventory'), harvestHandler);
router.post('/harvest/service', portalIngestionAuth, checkPermission('edit_inventory'), harvestHandler);
router.get('/harvest/candidates', authMiddleware, checkPermission('edit_inventory'), async (req: any, res) => {
    try {
        if (!['super_boss', 'manager', 'employee'].includes(req.agent?.role)) return res.status(403).json({ error: 'Internal staff required' });
        const teamIds = await getTeamIds(req.agent);
        const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
        const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit) || 25)));
        const where: any = { tenant_id: req.agent.tenant_id };
        if (req.agent.role !== 'super_boss') where.OR = teamIds.map(id => ({ payload: { path: ['_ingested_by'], equals: id } }));
        if (typeof req.query.status === 'string' && ['CANDIDATE', 'PENDING_VERIFICATION', 'OWNER_VERIFIED'].includes(req.query.status)) where.status = req.query.status;
        const [rows, total] = await Promise.all([prisma.portalListing.findMany({ where, orderBy: { last_seen_at: 'desc' }, skip: (page - 1) * limit, take: limit }), prisma.portalListing.count({ where })]);
        res.json({ rows, total, page, limit });
    } catch (error) { captureRouteError(error, req, { route: 'inventory#harvest-candidates' }); res.status(500).json({ error: 'Failed to load sourcing candidates' }); }
});


async function harvestHandler(req: any, res: any) {
    try {
        if (!['super_boss', 'manager', 'employee'].includes(req.agent?.role)) return res.status(403).json({ error: 'Internal staff required' });
        const result = await ingestPortalListing(req.body, req.agent);
        return res.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
        if (error instanceof HarvestError) return res.status(error.status).json({ error: error.message });
        captureRouteError(error, req, { route: 'inventory#harvest' });
        return res.status(500).json({ error: 'Harvest ingestion failed; retry this listing' });
    }
}

// Human-call evidence is separate from OTP verification and is recorded by scoped staff only.
router.post('/harvest/:candidateId/owner-call', authMiddleware, checkPermission('edit_inventory'), async (req: any, res) => {
    try {
        if (!['super_boss', 'manager', 'employee'].includes(req.agent?.role)) return res.status(403).json({ error: 'Internal staff required' });
        const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';
        if (req.body.owner_called !== true || notes.length < 10 || notes.length > 4000) return res.status(400).json({ error: 'Confirm human owner call and provide verification notes (10–4000 characters)' });
        const candidate = await prisma.portalListing.findFirst({ where: { id: req.params.candidateId, tenant_id: req.agent.tenant_id } });
        if (!candidate?.inventory_id) return res.status(404).json({ error: 'Harvested inventory not found' });
        const inv = await prisma.inventory.findFirst({ where: { id: candidate.inventory_id, tenant_id: req.agent.tenant_id } });
        const teamIds = await getTeamIds(req.agent);
        if (!inv || (req.agent.role !== 'super_boss' && !teamIds.includes(inv.assigned_agent_id || inv.uploaded_by_agent_id || ''))) return res.status(404).json({ error: 'Harvested inventory not found' });
        await prisma.$transaction(async tx => {
            const result = await tx.portalListing.updateMany({ where: { id: candidate.id, tenant_id: req.agent.tenant_id, owner_call_verified_at: null }, data: { owner_call_verified_at: new Date(), owner_call_verified_by: req.agent.id, owner_call_notes: notes, status: 'OWNER_VERIFIED' } });
            if (result.count && candidate.verification_task_id) await tx.task.update({ where: { id: candidate.verification_task_id }, data: { status: 'DONE', completed_at: new Date(), completed_by: req.agent.id } });
        });
        return res.json({ success: true, candidate_id: candidate.id, message: 'Owner call recorded. Complete inventory review before approval.' });
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#harvest-owner-call' });
        return res.status(500).json({ error: 'Failed to record owner verification' });
    }
});

/**
 * POST /inventory/:id/partner-assign  { partner_agent_id: string | null }
 * PARTNER TEAMS (2026-07-13): a partner COMPANY OWNER assigns one of THEIR OWN listings to one of THEIR
 * OWN sub-agents. The assignee gains FULL work rights on it (isPartnerOwnInventory now matches
 * partner_assignee_id, so partnerMayMutateInventory lets them edit it) — the user chose full work rights.
 * Writes ONLY `partner_assignee_id`; `referral_partner_id` (attribution) is never touched.
 */
router.post('/:id/partner-assign', authMiddleware, async (req: any, res) => {
    try {
        const id = req.params.id as string;
        if (!(await partnerMayMutateInventory(req, res, id))) return;
        const { assertPartnerOwnerCanAssign } = await import('../utils/partner_team');
        const check = await assertPartnerOwnerCanAssign(req, res, req.body?.partner_agent_id ?? null);
        if (!check.ok) return;

        const updated = await prisma.inventory.update({
            where: { id },
            data: { partner_assignee_id: check.assigneeId },
            select: { id: true, display_id: true, partner_assignee_id: true },
        });
        logger.info(`[PartnerAssign] listing ${id} -> ${check.assigneeId ?? 'unassigned'} by partner ${req.agent.id}`);
        res.json({ success: true, ...updated });
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#partner-assign' });
        logger.error('[PartnerAssign] listing error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /inventory - List inventory (role-based filtering + query filters + pagination)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const agent = req.agent!;
        const where: any = {};

        // Visibility (2026-06-27): manager = their team, employee = own, BY DEFAULT. super_boss sees all.
        // `?all=true` ("Browse all") returns the whole catalog so agents can still match clients to any
        // property — but owner contact + exact unit (flat_no/plot_no) are redacted for listings OUTSIDE
        // the agent's team (see redactInventoryForStaff, now team-aware); pricing stays visible.
        const browseAll = req.query.all === 'true';
        // PARTNER (2026-07-12): an external partner sees the ACTIVE catalogue (so they can match their
        // clients) PLUS their own listings in any status. Everything is redacted below — no owner contact,
        // no exact address. They are never scoped by team.
        const isPartner = agent.role === 'partner';
        const teamIds = isPartner ? [] : await getTeamIds(agent); // [self] or [self, ...direct reports]
        if (isPartner) {
            const ownOr = await partnerOwnInventoryWhere(agent.id);
            where.OR = [{ status: 'active' }, ...ownOr];
        } else if (agent.role !== 'super_boss' && !browseAll) {
            const partnerOwnerIds = await getManagedPartnerOwnerIds(teamIds);
            where.OR = [
                { uploaded_by_agent_id: { in: teamIds } },
                { reference_agent_id: { in: teamIds } },
                { assigned_agent_id: { in: teamIds } },
                { shared_with_ids: { hasSome: teamIds } },
                ...(partnerOwnerIds.length > 0 ? [{ owner_id: { in: partnerOwnerIds } }] : []),
            ];
        }

        // Query filters
        const {
            intent, state, type, category, agent_id, status, search, page,
            limit: limitParam, bhk, location,
            // New filter params (v2 filter redesign)
            category_id, sub_category_id,
            // Taxonomy filter (new TaxonomyNode tree): csv of selected node ids (any level).
            taxonomy_node_ids,
            listing_source, data_source,
            lat: latParam, lng: lngParam, radius_km: radiusKmParam,
            days_in_system, days_no_visit,
            // Floor filter: csv of exact floor_numbers (0=Ground, 1, 2, …) + optional "5plus" bucket (>=5).
            floors,
        } = req.query;

        const filterLat = latParam ? parseFloat(latParam as string) : undefined;
        const filterLng = lngParam ? parseFloat(lngParam as string) : undefined;
        const filterRadiusKm = radiusKmParam ? parseFloat(radiusKmParam as string) : 2;

        if (intent && typeof intent === 'string') where.intent = intent;
        if (status && typeof status === 'string') where.status = status;
        // Contacts page: list the inventories a given owner contact provided.
        if (req.query.owner_phone) {
            const op = normalizePhone(String(req.query.owner_phone));
            if (op) where.owner_phone = op;
        }
        if (state && typeof state === 'string') where.state = { contains: state, mode: 'insensitive' };
        if (type && typeof type === 'string') where.type = { contains: type, mode: 'insensitive' };
        if (category && typeof category === 'string') where.category = { contains: category, mode: 'insensitive' };
        if (agent_id && typeof agent_id === 'string') where.uploaded_by_agent_id = agent_id;

        // BHK filter — canonical specs chain (bhk → rooms → bedrooms), number OR string. ANDed via
        // where.AND so it composes with the visibility OR and other filters. (Was: specs.bedrooms only.)
        if (bhk && typeof bhk === 'string') {
            const bhkValues = bhk.split(',').map(v => parseInt(v.trim(), 10)).filter(n => !isNaN(n));
            const bhkF = bhkSpecsFilter(bhkValues);
            if (bhkF) where.AND = [...(where.AND || []), bhkF];
        }

        // Floor filter — the unit's floor_number. Tokens: exact ints (0=Ground, 1, 2, …) + "5plus" → >=5.
        // ORed within the filter, ANDed via where.AND so it composes with visibility + other filters.
        if (floors && typeof floors === 'string' && floors.trim()) {
            const tokens = floors.split(',').map(s => s.trim()).filter(Boolean);
            const exacts = tokens.filter(t => /^-?\d+$/.test(t)).map(t => parseInt(t, 10)).filter(n => !isNaN(n));
            const hasPlus = tokens.some(t => t.toLowerCase() === '5plus');
            const floorOR: any[] = [];
            if (exacts.length) floorOR.push({ floor_number: { in: exacts } });
            if (hasPlus) floorOR.push({ floor_number: { gte: 5 } });
            if (floorOR.length) where.AND = [...(where.AND || []), { OR: floorOR }];
        }

        // Taxonomy filter (new tree): selected node id(s) → self + descendants → inventory.taxonomy_node_id IN.
        if (taxonomy_node_ids && typeof taxonomy_node_ids === 'string' && taxonomy_node_ids.trim()) {
            const ids = taxonomy_node_ids.split(',').map(s => s.trim()).filter(Boolean);
            const expanded = await expandTaxonomyNodeIds(ids);
            if (expanded.length) where.AND = [...(where.AND || []), { taxonomy_node_id: { in: expanded } }];
        }

        // Location filter — word-aware address match (tokenized; word-boundary on numbers so "Sector 4"
        // doesn't match "Sector 40"/a pincode). Narrows by matched inventory ids; address-only (no phone).
        if (location && typeof location === 'string' && location.trim()) {
            const ids = await findInventoryIdsByAddress(location.trim(), { includePhone: false });
            const visibilityOR = where.OR;
            if (visibilityOR) delete where.OR;
            where.AND = [
                ...(where.AND || []),
                ...(visibilityOR ? [{ OR: visibilityOR }] : []),
                { id: { in: ids } },
            ];
        }

        if (search && typeof search === 'string' && search.trim()) {
            // Word-aware search (2026-06-07): classify each term by shape and match accordingly across ALL
            // address columns (+ owner/key-holder names & phones). Numbers match on a WORD BOUNDARY, so
            // "Vaishali sector 4" returns ONLY Sector 4 (not Sector 5/6, a pincode, an area, or a phone with
            // a 4); a complete address incl. pincode is found; partial words ("vaish") still match.
            const ids = await findInventoryIdsByAddress(search.trim(), { includePhone: true });
            // Preserve role-based visibility OR by combining everything with AND, then narrow by matched ids.
            const visibilityOR = where.OR;
            if (visibilityOR) delete where.OR;
            where.AND = [
                ...(where.AND || []),
                ...(visibilityOR ? [{ OR: visibilityOR }] : []),
                { id: { in: ids } },
            ];
        }

        // Budget / price range filter (#3, 2026-06-28): price_min / price_max (₹) on the asking price.
        {
            const priceMin = req.query.price_min ? parseFloat(String(req.query.price_min)) : NaN;
            const priceMax = req.query.price_max ? parseFloat(String(req.query.price_max)) : NaN;
            if (!isNaN(priceMin) || !isNaN(priceMax)) {
                const priceWhere: any = {};
                if (!isNaN(priceMin)) priceWhere.gte = priceMin;
                if (!isNaN(priceMax)) priceWhere.lte = priceMax;
                where.price = priceWhere;
            }
        }

        // Size / area range filter (2026-07-24): area_min / area_max in a chosen unit.
        // specs.area is a JSON number; units are mixed (sqft/sqm/sqyd + some blank). Raw-SQL id
        // prefilter (same pattern as proximity below) gives clean numeric + unit matching. When the
        // unit is sqft we also match rows with no stored unit (154 rows) — most are sqft anyway.
        {
            const areaMin = req.query.area_min ? parseFloat(String(req.query.area_min)) : NaN;
            const areaMax = req.query.area_max ? parseFloat(String(req.query.area_max)) : NaN;
            const areaUnit = typeof req.query.area_unit === 'string' && req.query.area_unit ? String(req.query.area_unit) : 'sqft';
            if (!isNaN(areaMin) || !isNaN(areaMax)) {
                const lo = isNaN(areaMin) ? 0 : areaMin;
                const hi = isNaN(areaMax) ? Number.MAX_SAFE_INTEGER : areaMax;
                const unitCond = areaUnit === 'sqft'
                    ? `(coalesce(specs->>'area_unit','') IN ('sqft',''))`
                    : `(specs->>'area_unit' = $3)`;
                const params: any[] = [lo, hi];
                if (areaUnit !== 'sqft') params.push(areaUnit);
                const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
                    `SELECT id FROM inventory
                     WHERE specs ? 'area' AND jsonb_typeof(specs->'area')='number'
                       AND (specs->>'area')::numeric >= $1 AND (specs->>'area')::numeric <= $2
                       AND ${unitCond}`,
                    ...params,
                );
                const areaIds = rows.map(r => r.id);
                where.AND = [...(where.AND || []), { id: { in: areaIds } }];
            }
        }

        // Roof rights filter (2026-06-28): ?roof_rights=true → only listings that include roof rights.
        if (req.query.roof_rights === 'true') where.roof_rights = true;

        // Commercial-use filter (2026-07-29): residential properties also usable commercially,
        // optionally narrowed to a type (office/shop/showroom/other).
        if (req.query.commercial_use === 'true') where.commercial_use = true;
        if (req.query.commercial_use_type) where.commercial_use_type = String(req.query.commercial_use_type).toLowerCase();

        // Classification ID filters (v2)
        if (category_id && typeof category_id === 'string') {
            where.category_id = category_id;
        }
        if (sub_category_id && typeof sub_category_id === 'string') {
            where.sub_category_id = sub_category_id;
        }

        // Listing source type (ownership_type)
        if (listing_source && typeof listing_source === 'string') {
            const validSources = ['OWNER', 'EXTERNAL_AGENT', 'AGENT_OWNER'];
            if (validSources.includes(listing_source)) {
                where.ownership_type = listing_source;
            }
        }

        // Data source (upload_source)
        if (data_source && typeof data_source === 'string') {
            where.upload_source = data_source;
        }

        // Proximity filter — Haversine on latitude/longitude
        if (filterLat !== undefined && filterLng !== undefined) {
            const radius = filterRadiusKm > 0 ? filterRadiusKm : 2;
            const nearbyIds = await prisma.$queryRaw<{ id: string }[]>`
                SELECT id FROM inventory
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL
                AND (6371 * acos(
                    LEAST(1.0,
                        cos(radians(${filterLat})) * cos(radians(latitude::float))
                        * cos(radians(longitude::float) - radians(${filterLng}))
                        + sin(radians(${filterLat})) * sin(radians(latitude::float))
                    )
                )) <= ${radius}
            `;
            const ids = nearbyIds.map((r: { id: string }) => r.id);
            const proxCond = { id: { in: ids } };
            if (where.AND) where.AND.push(proxCond);
            else where.AND = [...(where.AND || []), proxCond];
        }

        // Staleness: days in system (unsold/unrented, created X+ days ago)
        if (days_in_system && typeof days_in_system === 'string') {
            const days = parseInt(days_in_system);
            if (!isNaN(days) && days > 0) {
                const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
                where.created_at = { lt: cutoff };
                if (!where.status) {
                    where.status = { notIn: ['sold', 'rented'] };
                }
            }
        }

        // Staleness: days since last showcased/visited (no Appointment in X days)
        if (days_no_visit && typeof days_no_visit === 'string') {
            const days = parseInt(days_no_visit);
            if (!isNaN(days) && days > 0) {
                const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
                const recentlyVisited = await prisma.appointment.findMany({
                    where: { property_id: { not: null }, scheduled_at: { gte: cutoff } },
                    select: { property_id: true },
                    distinct: ['property_id'],
                });
                const visitedIds = recentlyVisited
                    .map((a: { property_id: string | null }) => a.property_id)
                    .filter(Boolean) as string[];
                if (visitedIds.length > 0) {
                    const noVisitCond = { id: { notIn: visitedIds } };
                    if (where.AND) where.AND.push(noVisitCond);
                    else where.AND = [noVisitCond];
                }
            }
        }

        // Pagination
        const pageNum = Math.max(1, parseInt(String(page)) || 1);
        const take = Math.min(100, Math.max(1, parseInt(String(limitParam)) || 20));
        const skip = (pageNum - 1) * take;

        const [inventory, total] = await Promise.all([
            prisma.inventory.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip,
                take,
                include: {
                    uploaded_by_agent: {
                        select: { id: true, name: true, role: true, phone: true },
                    },
                    reference_agent: {
                        select: { id: true, name: true, role: true },
                    },
                    assigned_agent: {
                        select: { id: true, name: true, role: true, phone: true },
                    },
                    referral_partner: { select: { name: true, phone_number: true } },
                    // Owner NAME (Inventory has no owner_name column). Redacted for viewers
                    // without owner access like any other contact relation.
                    contact: { select: { name: true } },
                    property_category: { select: { id: true, name: true, slug: true } },
                    property_sub_category: { select: { id: true, name: true, slug: true } },
                    property_type_link: { select: { id: true, name: true, slug: true } },
                    flat_property_type: { select: { id: true, name: true, slug: true, main_category: true } },
                    taxonomy_node: { select: { id: true, name: true, slug: true } },
                },
            }),
            prisma.inventory.count({ where }),
        ]);

        // Phase A (2026-06-18): per-tile engagement counts — shares / website views / visits.
        // Batched (2 groupBy + 1 raw view-count) to avoid N+1; attached as `stats` on each row.
        const pageIds = inventory.map((i: { id: string }) => i.id);
        const stats: Record<string, { shares: number; views: number; visits_scheduled: number; visits_done: number }> = {};
        for (const id of pageIds) stats[id] = { shares: 0, views: 0, visits_scheduled: 0, visits_done: 0 };
        if (pageIds.length > 0) {
            const [shareGroups, visitGroups, viewRows] = await Promise.all([
                prisma.propertyShare.groupBy({ by: ['inventory_id'], where: { inventory_id: { in: pageIds } }, _count: { _all: true } }),
                prisma.appointment.groupBy({
                    by: ['property_id', 'status'],
                    where: { property_id: { in: pageIds }, type: { in: [AppointmentType.property_visit, AppointmentType.site_visit] } },
                    _count: { _all: true },
                }),
                prisma.$queryRaw<Array<{ iid: string; c: number }>>`
                    SELECT metadata->>'property_id' AS iid, COUNT(*)::int AS c
                    FROM interactions
                    WHERE event_type = 'property_view' AND metadata->>'property_id' IN (${Prisma.join(pageIds)})
                    GROUP BY metadata->>'property_id'`,
            ]);
            for (const g of shareGroups) { const k = g.inventory_id; if (k && stats[k]) stats[k].shares = g._count._all; }
            for (const g of visitGroups) {
                const pid = g.property_id;
                if (!pid || !stats[pid]) continue;
                if (g.status !== AppointmentStatus.cancelled) stats[pid].visits_scheduled += g._count._all;
                if (g.status === AppointmentStatus.completed) stats[pid].visits_done += g._count._all;
            }
            for (const r of viewRows) { if (r.iid && stats[r.iid]) stats[r.iid].views = Number(r.c); }
        }

        // PARTNER response (2026-07-12): run every row through the partner redaction — strips owner/
        // key-holder/uploader contact, source/referral fields, and the exact address (flat_no, plot_no,
        // full_address, apartment_name, lat/lng); locality/city are kept so they can still place it.
        // No `source` block at all. can_edit only on their OWN listings.
        if (isPartner) {
            const { applyRoleMaskList, viewerFromPartner } = await import('../services/permission_engine');
            const { partnerIdsWithSubAgents, isPartnerOwnInventory } = await import('../utils/partner_scope');
            const { ids, phones } = await partnerIdsWithSubAgents(agent.id);
            const ownFlags = (inventory as any[]).map(i => isPartnerOwnInventory(i, ids, phones));
            const masked = applyRoleMaskList(
                (inventory as any[]).map(i => ({ ...i, stats: stats[i.id] })),
                viewerFromPartner(agent.id),
            ) as any[];
            const partnerData = masked.map((r: any, idx: number) => ({
                ...r,
                source: null,
                mine: ownFlags[idx],
                can_edit: ownFlags[idx],
                needs_owner_fix: false,
            }));
            return res.json({ data: partnerData, total, page: pageNum, totalPages: Math.ceil(total / take) });
        }

        // Per-tile SOURCE (point 6): owner vs dealer + name (shown to all) + a phone that is gated to
        // the handling manager (assigned_agent) + super_boss. Computed from the RAW row before redaction
        // (which strips the underlying owner/dealer PII), then re-attached.
        const isSB = agent.role === 'super_boss';
        const data = inventory.map((i: any) => {
            const canSeeSourcePhone = isSB || teamIds.includes(i.assigned_agent_id) || teamIds.includes(i.uploaded_by_agent_id);
            const isDealer = i.ownership_type === 'EXTERNAL_AGENT';
            const isAgentOwner = i.ownership_type === 'AGENT_OWNER';
            // Owner NAME lives on Contact (Inventory has no owner_name column). Resolved from
            // the relation BEFORE redaction, then re-attached below alongside `source` —
            // previously this fell straight through to uploader_name, so a listing whose owner
            // differed from its uploader displayed the UPLOADER's name as the owner's.
            const contactName: string | null = i.contact?.name ?? null;
            const sourceName = (isDealer ? i.referral_partner?.name : contactName) || i.uploader_name || null;
            const sourcePhoneRaw = isDealer
                ? (i.referral_partner?.phone_number || i.uploader_phone)
                : (i.owner_phone || i.uploader_phone);
            const source = {
                type: isDealer ? 'DEALER' : (isAgentOwner ? 'AGENT_OWNER' : 'OWNER'),
                name: sourceName,
                phone: canSeeSourcePhone ? (sourcePhoneRaw || null) : null,
            };
            const redacted = sanitizationService.redactInventoryForStaff(
                { ...i, stats: stats[i.id] },
                { agentId: agent.id, isSuperBoss: isSB, teamIds },
            );
            // mine = uploaded by OR assigned to me (for the "Yours" badge);
            // can_edit = super_boss, or (manager of) the team that owns it — matches the PATCH guard.
            const mine = i.uploaded_by_agent_id === agent.id || i.assigned_agent_id === agent.id;
            const can_edit = isSB || teamIds.includes(i.assigned_agent_id) || teamIds.includes(i.uploaded_by_agent_id);
            // needs_owner_fix = the owner number equals the uploading/assigned team member's own number
            // (Part B, 2026-06-20) — flags the ~317 listings where an agent put themselves as the owner.
            const d10 = (p: any) => (p ? String(p) : '').replace(/\D/g, '').slice(-10);
            const ownerD = d10(i.owner_phone);
            // 2026-07-28: 466 staff-as-owner listings were detached to a placeholder owner
            // ("Owner To Be Entered", +910000000000/1). Keep flagging them so the "⚠ Add owner details"
            // badge stays lit until an agent enters the REAL owner. (owner-approved: flag + worklist.)
            const OWNER_PENDING_PHONES = ['+910000000000', '+910000000001'];
            const needs_owner_fix = OWNER_PENDING_PHONES.includes(i.owner_phone)
                || (!!ownerD && (ownerD === d10(i.uploaded_by_agent?.phone) || ownerD === d10(i.assigned_agent?.phone)));
            return { ...redacted, source, owner_name: contactName, mine, can_edit, needs_owner_fix };
        });

        res.json({
            data,
            total,
            page: pageNum,
            totalPages: Math.ceil(total / take),
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#2' });
        logger.error(error);
        res.status(500).json({ error: 'Failed to fetch inventory' });
    }
});

// GET /inventory/hermes-pilot - tenant-scoped, contact-free export for supervised staff review.
router.get('/hermes-pilot', authMiddleware, checkPermission('act_on_deals'), async (req, res) => {
  try {
    const agent = req.agent!;
    if (!agent.tenant_id || !['super_boss', 'manager', 'employee'].includes(agent.role)) {
      return res.status(403).json({ error: 'Staff access required' });
    }
    const page = Number(req.query.page ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) {
      return res.status(400).json({ error: 'Invalid page' });
    }
    const where: any = { tenant_id: agent.tenant_id, status: 'active' };
    if (agent.role !== 'super_boss') {
      const teamIds = await getTeamIds(agent);
      const partnerOwnerIds = await getManagedPartnerOwnerIds(teamIds);
      where.OR = [
        { uploaded_by_agent_id: { in: teamIds } },
        { reference_agent_id: { in: teamIds } },
        { assigned_agent_id: { in: teamIds } },
        { shared_with_ids: { hasSome: teamIds } },
        ...(partnerOwnerIds.length ? [{ owner_id: { in: partnerOwnerIds } }] : []),
      ];
    }
    const [data, total] = await Promise.all([
      prisma.inventory.findMany({
        where, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], skip: (page - 1) * 100, take: 100,
        select: {
          id: true, display_id: true, status: true, intent: true, category: true, type: true,
          apartment_name: true, sub_locality: true, locality: true, city: true,
          price: true, price_unit: true,
        },
      }),
      prisma.inventory.count({ where }),
    ]);
    return res.json({ scope: 'tenant_staff', data, page, totalPages: Math.max(1, Math.ceil(total / 100)) });
  } catch (error) {
    captureRouteError(error, req, { route: 'inventory#hermes-pilot' });
    return res.status(500).json({ error: 'Failed to export inventory' });
  }
});

// GET /inventory/:id - Single inventory item
router.get('/:id', authMiddleware, async (req, res, next) => {
    try {
        const id = req.params.id as string;
        // Static sibling GET routes registered later (e.g. /filter-counts) collide with /:id —
        // fall through so Express reaches the real handler instead of treating it as an inventory id.
        if (id === 'filter-counts') return next();
        // Skip non-UUID params that belong to other routes
        if (id === 'session' || id === 'step' || id === 'commit') {
            return res.status(404).json({ error: 'Not found' });
        }

        const inventory = await prisma.inventory.findUnique({
            where: { id },
            include: {
                uploaded_by_agent: {
                    select: { id: true, name: true, role: true },
                },
                assigned_agent: {
                    select: { id: true, name: true, role: true, phone: true },
                },
                contact: {
                    select: { name: true, phone_number: true },
                },
                property_category: { select: { id: true, name: true, slug: true } },
                property_sub_category: { select: { id: true, name: true, slug: true } },
                property_type_link: { select: { id: true, name: true, slug: true } },
                property_configuration: { select: { id: true, name: true, slug: true } },
                usage_type: { select: { id: true, name: true, slug: true } },
                investment_type: { select: { id: true, name: true, slug: true } },
                flat_property_type: { select: { id: true, name: true, slug: true, main_category: true } },
                taxonomy_node: { select: { id: true, name: true, slug: true } },
                documents: {
                    orderBy: { created_at: 'desc' as const },
                    select: {
                        id: true, doc_type: true, title: true,
                        file_url: true, file_name: true, mime_type: true,
                        file_size: true, uploaded_via: true, created_at: true,
                    },
                },
            },
        });

        if (!inventory) {
            return res.status(404).json({ error: 'Inventory not found' });
        }

        const meDetail = req.agent!;

        // PARTNER (2026-07-12): may open an ACTIVE listing (to match their clients) or their OWN listing
        // in any status — nothing else. Response is partner-redacted (no owner contact, no exact address).
        if (meDetail.role === 'partner') {
            const { applyRoleMask, viewerFromPartner } = await import('../services/permission_engine');
            const { partnerIdsWithSubAgents, isPartnerOwnInventory } = await import('../utils/partner_scope');
            const { ids, phones } = await partnerIdsWithSubAgents(meDetail.id);
            const isOwn = isPartnerOwnInventory(inventory as any, ids, phones);
            if (!isOwn && (inventory as any).status !== 'active') {
                return res.status(403).json({ error: 'Not available' });
            }
            const maskedDetail: any = applyRoleMask(inventory as any, viewerFromPartner(meDetail.id));
            // Documents (2026-08-11): owner paperwork - title deeds, registries, NOCs. An external
            // partner never receives them, not even on their own listing. applyRoleMask strips them
            // too; this is the belt to that braces.
            delete maskedDetail.documents;
            return res.json({ ...maskedDetail, source: null, mine: isOwn, can_edit: isOwn });
        }

        const detailTeamIds = await getTeamIds(meDetail);
        const redactedDetail: any = sanitizationService.redactInventoryForStaff(inventory, {
            agentId: meDetail.id,
            isSuperBoss: meDetail.role === 'super_boss',
            teamIds: detailTeamIds,
        });
        // can_edit mirrors the PATCH guard: super_boss, or (manager of) the team that owns the listing.
        redactedDetail.can_edit = meDetail.role === 'super_boss'
            || detailTeamIds.includes(inventory.assigned_agent_id)
            || detailTeamIds.includes(inventory.uploaded_by_agent_id);
        // Documents (2026-08-11, owner-set rule): visible ONLY to the listing's own agent +
        // super_boss - the same rule mayAccessDocuments() enforces on the download/write routes.
        // Note this is deliberately NARROWER than redactInventoryForStaff, which also lets a
        // shared-with teammate through: sharing a listing does NOT share its paperwork.
        // The KEY is omitted, not set to [], so the UI can tell "none uploaded" from "not yours".
        if (!redactedDetail.can_edit) delete redactedDetail.documents;
        res.json(redactedDetail);
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#3' });
        logger.error(error);
        res.status(500).json({ error: 'Failed to fetch inventory item' });
    }
});

// POST /inventory/:id/clone — Task 4b (2026-06-27): clone a listing's building + features into a new
// one. Spreads the source row (so no column-name drift), strips identity/unique/timestamp fields,
// CLEARS the caller-specified unit-level fields (the agent re-enters them in the Edit that opens next),
// and mints a fresh display_id. Owner is always copied (required FK) but is editable in that Edit.
// Media is NOT copied unless copy_media=true.
router.post('/:id/clone', authMiddleware, checkPermission('edit_inventory'), async (req, res) => {
    try {
        const { id } = req.params;
        const agent = req.agent!;
        const { clear = [], copy_media = false } = req.body || {};

        const src = await prisma.inventory.findFirst({ where: { id, tenant_id: agent.tenant_id } });
        if (!src) return res.status(404).json({ error: 'Inventory not found' });
if (src.upload_source === 'portal_crawl') return res.status(409).json({ error: 'Use verified inventory capture to add another harvested property; harvested listings cannot be cloned' });

        // Only these (all nullable) unit-level fields may be cleared by the clone request.
        const CLEARABLE = new Set(['flat_no', 'plot_no', 'floor_number', 'floor_label', 'display_floor',
            'price', 'customer_price', 'display_price', 'latitude', 'longitude', 'full_address']);
        const clearSet = (Array.isArray(clear) ? clear : []).filter((f: string) => CLEARABLE.has(f));

        // Spread all scalar columns; drop identity/unique/derived fields so the clone gets fresh ones.
        const { id: _id, display_id: _did, slug: _slug, created_at: _c, updated_at: _u, ...rest } = src as any;
        for (const f of clearSet) rest[f] = null;
        if (!copy_media) { rest.media_urls = []; rest.media_score = 0; }
        rest.uploaded_by_agent_id = agent.id; // the cloner becomes the new uploader
        rest.status = 'active';
        rest.completion_pct = 0;
        rest.is_enriched = false;

        const displayId = await generateDisplayId(src.city || src.locality || '', String(src.category || ''));

        // __no_team_broadcast: a duplicated listing must NOT blast the team (copied details,
        // usually edited right after). Stripped before Prisma sees it by the db.ts create hook.
        const clone = await prisma.inventory.create({ data: { ...rest, display_id: displayId, __no_team_broadcast: true } as any });
        upsertCatalogProduct(clone).catch(e => logger.warn('[Catalog] post-clone upsert failed:', e.message));
        logger.info(`[inventory.clone] ${src.display_id || src.id} -> ${clone.display_id} (cleared: ${clearSet.join(',') || 'none'}) by agent ${agent.id}`);
        return res.json({ inventory_id: clone.id, display_id: clone.display_id });
    } catch (e: any) {
        logger.error('[inventory.clone] failed:', e?.message || e);
        return res.status(500).json({ error: 'Failed to clone listing' });
    }
});

// PATCH /inventory/:id - Update inventory (requires edit_inventory permission)
router.patch('/:id', authMiddleware, checkPermission('edit_inventory'), async (req, res) => {
    try {
        const id = req.params.id as string;
        // Partner write-guard: a partner may only mutate their OWN listing.
        if (!(await partnerMayMutateInventory(req, res, id))) return;
        const existing = await prisma.inventory.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Inventory not found' });
        }

        // Edit guard (point 3, 2026-06-19): inventory is VISIBLE to all staff, but only the
        // listing's ASSIGNED inventory manager or super_boss may EDIT it. (Tightened from the
        // earlier uploader/manager-of-team allowance — after a reassignment only the new assignee
        // + super_boss can edit.) This also blocks status changes (e.g. deactivate) by others.
        {
            const me = req.agent!;
            // Edit rule (2026-06-27): super_boss, OR a manager whose team owns the listing, OR the
            // assigned/uploading agent themselves. Mirrors getTeamIds (manager = self + direct reports).
            // PARTNER (2026-07-12): a partner belongs to no team, so this rule would always reject them.
            // Their ownership was already enforced above by partnerMayMutateInventory() (403 unless the
            // listing is theirs), so they are allowed through here.
            if (me.role !== 'partner') {
                const editTeamIds = await getTeamIds(me);
                const canEdit = me.role === 'super_boss'
                    || editTeamIds.includes(existing.assigned_agent_id)
                    || editTeamIds.includes(existing.uploaded_by_agent_id);
                if (!canEdit) return res.status(403).json({ error: 'You can only edit listings owned by you or your team.' });
            }
        }

        // Allowed fields to update.
        // NOTE: furnishing/facing/property_age/total_floors/features REMOVED — they now
        // live inside specs.* under canonical taxonomy keys (Phase 1 dedup, see
        // PROJECT_STATUS 2026-05-28). If a legacy client sends them in the body, we fold
        // them into specs below rather than dropping silently.
        const allowedFields = [
            // Legacy + core
            'category', 'type', 'intent', 'location', 'specs',
            'price', 'price_unit', 'status', 'assigned_agent_id',
            // Classification IDs
            'category_id', 'sub_category_id', 'type_id', 'configuration_id',
            'usage_type_id', 'investment_type_id',
            // Flat property type (Redesign v2)
            'flat_property_type_id',
            // Dual pricing (Redesign v2)
            'customer_price', 'display_price',
            // Property details (only non-deprecated columns remain)
            'description', 'floor_number', 'floor_label', 'display_floor',
            // Structured address (city + district for backward compat)
            'flat_no', 'plot_no', 'apartment_name',
            'state', 'district', 'city', 'locality', 'sub_locality', 'pincode', 'full_address',
            'latitude', 'longitude',
            // Key holder
            'key_holder_type', 'key_holder_name', 'key_holder_phone',
            'key_holder_contact_id',
            // Ownership (Redesign v2)
            'ownership_type', 'upload_source',
            // Owner/Uploader contact correction
            // uploader_name is a real Inventory column (the owner's NAME is not — it lives on
            // Contact.name and is synced below), so it is the one name field that is written here.
            'owner_phone', 'uploader_phone', 'uploader_name',
        ];
        const updateData: any = {};
        // Handle renovated boolean explicitly (not in allowedFields loop to avoid string coercion)
        if (req.body.renovated !== undefined) {
            updateData.renovated = req.body.renovated === true || req.body.renovated === 'true';
        }
        if (req.body.roof_rights !== undefined) {
            updateData.roof_rights = req.body.roof_rights === true || req.body.roof_rights === 'true';
        }
        // Pre-rented (pre-lease) — boolean flag + the sitting tenant's monthly rent (number or null).
        if (req.body.pre_rented !== undefined) {
            updateData.pre_rented = req.body.pre_rented === true || req.body.pre_rented === 'true';
        }
        if (req.body.pre_rented_monthly_rent !== undefined) {
            const r = req.body.pre_rented_monthly_rent;
            updateData.pre_rented_monthly_rent = (r === null || r === '' || isNaN(Number(r))) ? null : Number(r);
        }
        // Commercial use (2026-07-29) — flag + type (office/shop/showroom/other). Type is cleared
        // whenever the flag is off, so the two never drift out of sync.
        if (req.body.commercial_use !== undefined) {
            updateData.commercial_use = req.body.commercial_use === true || req.body.commercial_use === 'true';
        }
        if (req.body.commercial_use_type !== undefined) {
            const t = req.body.commercial_use_type;
            updateData.commercial_use_type = (t === null || t === '') ? null : String(t).toLowerCase();
        }
        if (updateData.commercial_use === false) updateData.commercial_use_type = null;
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                if (['price', 'customer_price', 'display_price'].includes(field)) {
                    const parsed = req.body[field] !== null && req.body[field] !== '' ? parseFloat(req.body[field]) : NaN;
                    updateData[field] = isNaN(parsed) ? null : parsed;
                } else if (['latitude', 'longitude'].includes(field)) {
                    const parsed = req.body[field] !== null && req.body[field] !== '' ? parseFloat(req.body[field]) : NaN;
                    updateData[field] = isNaN(parsed) ? null : parsed;
                } else if (field === 'floor_number') {
                    const parsed = req.body[field] !== null && req.body[field] !== '' ? parseInt(String(req.body[field])) : NaN;
                    updateData[field] = isNaN(parsed) ? null : parsed;
                } else if (field === 'floor_label' || field === 'display_floor') {
                    updateData[field] = req.body[field] ? String(req.body[field]).trim() : null;
                } else {
                    updateData[field] = req.body[field];
                }
            }
        }
        // Write city to district too for backward compat
        if (updateData.city && !updateData.district) {
            updateData.district = updateData.city;
        }

        // ── Specs unification (Phase 1 dedup, 2026-05-28) ────────────────────────
        // 1. If the caller sent any deprecated scalar (legacy clients), fold into specs.
        // 2. Deep-merge incoming specs onto the existing row's specs — NEVER full-replace —
        //    so a client that omits a key doesn't silently delete it.
        if (updateData.specs && typeof updateData.specs === 'object' && !Array.isArray(updateData.specs)) {
            const existingSpecs: Record<string, any> = (existing.specs && typeof existing.specs === 'object' && !Array.isArray(existing.specs))
                ? (existing.specs as Record<string, any>)
                : {};
            updateData.specs = { ...existingSpecs, ...(updateData.specs as Record<string, any>) };
        }
        const legacyToSpec: Array<[string, string]> = [
            ['furnishing', 'furnishing'], ['facing', 'facing'],
            ['property_age', 'age-of-construction'], ['total_floors', 'floors'],
        ];
        for (const [bodyKey, specKey] of legacyToSpec) {
            if (req.body[bodyKey] !== undefined && req.body[bodyKey] !== '' && req.body[bodyKey] !== null) {
                if (!updateData.specs) {
                    updateData.specs = { ...((existing.specs && typeof existing.specs === 'object' && !Array.isArray(existing.specs)) ? existing.specs : {}) };
                }
                updateData.specs[specKey] = bodyKey === 'total_floors' ? String(req.body[bodyKey]) : req.body[bodyKey];
            }
        }
        // Legacy features object → specs.amenities array
        if (req.body.features && typeof req.body.features === 'object' && !Array.isArray(req.body.features)) {
            const AMENITY: Record<string, string> = { gym: 'Gym', club_house: 'Club House', power_backup: 'Power Backup', lift: 'Lift', intercom: 'Intercom', guest_house: 'Guest House', park: 'Park', community_hall: 'Community Hall', mini_theater: 'Mini Theater', swimming_pool: 'Swimming Pool', security: 'Security', gas_pipeline: 'Gas Pipeline', parking: 'Parking', garden: 'Garden', pool: 'Swimming Pool', water_supply: 'Water Supply' };
            const labels = Object.entries(req.body.features as Record<string, any>).filter(([, v]) => v).map(([k]) => AMENITY[k] || k);
            if (labels.length) {
                if (!updateData.specs) {
                    updateData.specs = { ...((existing.specs && typeof existing.specs === 'object' && !Array.isArray(existing.specs)) ? existing.specs : {}) };
                }
                updateData.specs.amenities = labels;
            }
        }

        // Handle shared_with_ids array (not in allowedFields loop)
        if (req.body.shared_with_ids !== undefined) {
            updateData.shared_with_ids = Array.isArray(req.body.shared_with_ids) ? req.body.shared_with_ids : [];
        }

        // Clean empty strings: UUID FK fields must be null, not ""
        const uuidFields = [
            'category_id', 'sub_category_id', 'type_id', 'configuration_id',
            'usage_type_id', 'investment_type_id', 'flat_property_type_id',
            'assigned_agent_id', 'key_holder_contact_id',
        ];
        for (const f of uuidFields) {
            if (updateData[f] === '') updateData[f] = null;
        }
        // Enum fields must be null, not ""
        const enumFields = ['key_holder_type', 'ownership_type'];
        for (const f of enumFields) {
            if (updateData[f] === '') updateData[f] = null;
        }
        // Optional string fields: keep empty strings as-is (Prisma handles them fine)

        // Guard: reject fat-fingered demand prices on edit (e.g. ₹782 Cr on a flat); land/plots exempt.
        const editType = updateData.type ?? existing.type;
        for (const pf of ['price', 'customer_price', 'display_price']) {
            const e = absurdPriceError(updateData[pf], editType);
            if (e) return res.status(400).json({ error: e });
        }

        // Taxonomy (Phase 2 — 2026-05-27): the Edit Classification cascade sends taxonomy_node_id.
        // Persist it AND derive the legacy classification the rest of the app still reads
        // (matching aligns on sub_category_id; website/share read category/type slugs). Best-effort —
        // a derive failure must never block the save. Runs AFTER the allowedFields loop so it wins.
        if (req.body.taxonomy_node_id !== undefined) {
            const nodeId = req.body.taxonomy_node_id || null;
            updateData.taxonomy_node_id = nodeId;
            if (nodeId) {
                try {
                    const node = await prisma.taxonomyNode.findUnique({
                        where: { id: nodeId },
                        select: { legacy_sub_category_id: true, legacy_type_id: true, legacy_flat_property_type_id: true },
                    });
                    if (node) {
                        updateData.flat_property_type_id = node.legacy_flat_property_type_id || null;
                        updateData.type_id = node.legacy_type_id || null;
                        updateData.sub_category_id = node.legacy_sub_category_id || null;
                        if (node.legacy_sub_category_id) {
                            const sub = await prisma.propertySubCategory.findUnique({
                                where: { id: node.legacy_sub_category_id },
                                select: { slug: true, category_id: true, category: { select: { slug: true } } },
                            });
                            if (sub) {
                                updateData.category_id = sub.category_id;
                                updateData.type = sub.slug;
                                if (sub.category?.slug) updateData.category = sub.category.slug;
                            }
                        }
                        updateData.needs_taxonomy_review = !(node.legacy_sub_category_id || node.legacy_flat_property_type_id);
                    }
                } catch (e) {
                    captureRouteError(e as any, req, { route: 'inventory/patch/taxonomy-derive', nodeId });
                }
            }
        }

        // Normalize and re-link owner if owner_phone changed
        if (updateData.owner_phone) {
            const normalized = normalizePhone(updateData.owner_phone);
            if (!normalized) return res.status(400).json({ error: 'Invalid owner phone number' });
            // #9 railguard (2026-07-25): the owner must be the ACTUAL owner — never ANY active team
            // member (broadened from the self-only check of 2026-06-20; 313 rows had staff-as-owner).
            const staffOwnerE = await activeStaffOwnerName(normalized);
            if (staffOwnerE) {
                // error_code lets the Edit modal explain the rejection inline instead of
                // relying on a transient toast the user can easily miss.
                return res.status(400).json({
                    error: `${staffOwnerE} is a team member and cannot be set as the property owner. Enter the actual owner number.`,
                    error_code: 'OWNER_IS_TEAM_MEMBER',
                });
            }
            updateData.owner_phone = normalized;
            // Ensure Owner record exists and update FK
            const tenant = await prisma.tenant.findFirst();
            if (tenant) {
                const ownerId = await ensureOwner(normalized, tenant.id);
                updateData.owner_id = ownerId;
            }
            // Owner NAME is not an Inventory column — it is Contact.name. Without this the
            // "Change" action saved the new number but silently dropped the new name, so the
            // card/header kept showing the PREVIOUS owner's name against the new number
            // (ensureOwner only names 'Unknown' for contacts it has to create).
            // Mirrors what POST /inventory, /transfer and /mark-sold already do.
            const ownerName = String(req.body.owner_name ?? '').trim();
            if (ownerName) {
                await prisma.contact.update({ where: { phone_number: normalized }, data: { name: ownerName } })
                    .catch((e: any) => logger.warn(`[Inventory] owner name sync failed for ${normalized}: ${e?.message}`));
            }
            // Keep the redundant owner_contact_id FK consistent with the new owner_phone.
            if (existing.owner_contact_id) updateData.owner_contact_id = normalized;
        }
        if (updateData.uploader_phone) {
            const normalized = normalizePhone(updateData.uploader_phone);
            if (!normalized) return res.status(400).json({ error: 'Invalid uploader phone number' });
            updateData.uploader_phone = normalized;
        }

        // 2026-07-24: recompute full_address when structured address parts change.
        // full_address is denormalised and shown on cards/public views. Editing plot_no etc.
        // used to leave it stale (157 rows had a full_address not matching their plot_no).
        // Discriminator: a Google-Places pick updates full_address IN THE SAME request (so we keep
        // that rich string), whereas a manual part edit leaves full_address untouched — only then
        // do we rebuild from the merged parts. Never clobbers a freshly-picked address.
        {
            const PARTS = ['flat_no', 'plot_no', 'apartment_name', 'locality', 'sub_locality', 'city', 'district', 'state', 'pincode'];
            const structuralChanged = PARTS.some(k => updateData[k] !== undefined && String(updateData[k] ?? '') !== String((existing as any)[k] ?? ''));
            const fullAddrProvided = updateData.full_address !== undefined && String(updateData.full_address ?? '') !== String(existing.full_address ?? '');
            if (structuralChanged && !fullAddrProvided) {
                const g = (k: string) => (updateData[k] !== undefined ? updateData[k] : (existing as any)[k]);
                const city = g('city') || g('district');
                const pincode = g('pincode');
                const rebuilt = [g('flat_no'), g('plot_no'), g('apartment_name'), g('locality'), g('sub_locality'), city, g('state'), pincode ? `- ${pincode}` : '']
                    .filter(Boolean).join(', ').replace(', -', ' -');
                if (rebuilt.trim()) updateData.full_address = rebuilt;
            }
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        if (existing.upload_source === 'portal_crawl' && updateData.status === 'active') {
            const candidate = await prisma.portalListing.findFirst({ where: { inventory_id: String(id), tenant_id: req.agent!.tenant_id } });
            if (!candidate?.owner_call_verified_at) return res.status(409).json({ error: 'A recorded human owner call is required before activating harvested inventory' });
        }
        const updated = await prisma.inventory.update({
            where: { id },
            data: updateData,
        });

        logger.info(`[Inventory] Updated ${id} by agent ${req.agent!.id}: ${JSON.stringify(updateData)}`);

        upsertCatalogProduct(updated).catch(e => logger.warn('[Catalog] post-update upsert failed:', e.message));

        // Notify on status change (sold, rented, withdrawn, etc.)
        if (updateData.status && updateData.status !== existing.status) {
            const agents: string[] = [existing.uploaded_by_agent_id, existing.assigned_agent_id].filter(Boolean) as string[];
            const uniqueAgents = [...new Set(agents)].filter(aid => aid !== req.agent!.id);
            if (uniqueAgents.length > 0) {
                const agentRecords = await prisma.agent.findMany({ where: { id: { in: uniqueAgents } }, select: { id: true, phone: true, email: true, name: true } });
                notify('inventory_status_changed', agentRecords.map(a => ({ id: a.id, type: 'agent' as const, phone: a.phone, email: a.email || undefined, name: a.name })), {
                    inventory_id: id, display_id: existing.display_id, new_status: updateData.status, location: existing.full_address || existing.locality,
                });
            }
        }

        // Phase 9: broadcast newly-active inventory to all QUALIFIED deals
        if (updateData.status === 'active' && existing.status !== 'active') {
            broadcastInventoryToQualifiedDeals(id).catch(e =>
                logger.warn('[InvBroadcast] PATCH broadcast failed:', e.message)
            );
            // Phase D: alert the whole team about the newly-active listing.
            broadcastNewInventoryToTeam(String(id)).catch(e =>
                logger.warn('[TeamInvBroadcast] PATCH broadcast failed:', e.message)
            );
        }

        // Attach the resolved owner NAME (Contact.name — not a column) so the Edit modal can
        // refresh in place after saving an owner change instead of re-fetching. Only returned
        // to this caller, which already passed the owner/team edit guard.
        let ownerNameOut: string | null = null;
        if (updated.owner_phone) {
            const ownerContact = await prisma.contact
                .findUnique({ where: { phone_number: updated.owner_phone }, select: { name: true } })
                .catch(() => null);
            ownerNameOut = (ownerContact as { name?: string | null } | null)?.name ?? null;
        }
        res.json({ ...updated, owner_name: ownerNameOut });
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#4' });
        logger.error('[Inventory PATCH] Error:', error);
        res.status(500).json({ error: 'Failed to update inventory' });
    }
});

// POST /inventory/:id/share — Share inventory with other team members
router.post('/:id/share', authMiddleware, checkPermission('share_inventory'), async (req, res) => {
    try {
        const { id } = req.params;
        const { agent_ids, action } = req.body; // action: 'add' | 'remove'
        if (!agent_ids || !Array.isArray(agent_ids) || !['add', 'remove'].includes(action)) {
            return res.status(400).json({ error: 'agent_ids (array) and action (add|remove) required' });
        }

        const existing = await prisma.inventory.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Inventory not found' });

        // Authorization: anyone who can see this inventory can share it
        const agent = req.agent!;
        let canShare = agent.role === 'super_boss'
            || existing.uploaded_by_agent_id === agent.id
            || existing.assigned_agent_id === agent.id
            || existing.reference_agent_id === agent.id
            || (existing.shared_with_ids || []).includes(agent.id);
        if (!canShare) {
            // Check managed partner agents' inventory
            const partnerOwnerIds = await getManagedPartnerOwnerIds([agent.id]);
            if (partnerOwnerIds.includes(existing.owner_id)) canShare = true;
        }
        if (!canShare && agent.role === 'manager') {
            const team = await prisma.agent.findMany({ where: { reports_to_id: agent.id }, select: { id: true } });
            const teamIds = team.map((a: { id: string }) => a.id);
            canShare = teamIds.includes(existing.uploaded_by_agent_id || '') || teamIds.includes(existing.assigned_agent_id || '');
        }
        if (!canShare) {
            return res.status(403).json({ error: 'Not authorized to share this inventory' });
        }

        let newSharedIds = [...(existing.shared_with_ids || [])];
        if (action === 'add') {
            for (const aid of agent_ids) {
                if (!newSharedIds.includes(aid)) newSharedIds.push(aid);
            }
        } else {
            newSharedIds = newSharedIds.filter((aid: string) => !agent_ids.includes(aid));
        }

        await prisma.inventory.update({ where: { id }, data: { shared_with_ids: newSharedIds } });
        logger.info(`[Inventory] Shared ${id} by ${agent.id}: ${action} ${agent_ids.join(',')}`);

        // Notify shared agents
        if (action === 'add') {
            const sharedAgents = await prisma.agent.findMany({ where: { id: { in: agent_ids } }, select: { id: true, phone: true, email: true, name: true } });
            notify('inventory_shared', sharedAgents.map(a => ({ id: a.id, type: 'agent' as const, phone: a.phone, email: a.email || undefined, name: a.name })), {
                inventory_id: id, display_id: existing.display_id, sharer_name: agent.name,
                property_type: existing.type, location: existing.full_address || existing.locality,
            });
        }

        res.json({ shared_with_ids: newSharedIds });
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#5' });
        logger.error('[Inventory Share] Error:', error);
        res.status(500).json({ error: 'Failed to share inventory' });
    }
});

// POST /inventory/share-pdf — Generate a PDF of one or more inventories.
// Body: { inventory_ids: string[], variant: 'branded' | 'brandless', partner_name?: string, partner_phone?: string }
// Streams application/pdf back to the client. Partner agents are forced into
// brandless variant server-side regardless of what they post (redaction must
// not be a frontend choice).
router.post('/share-pdf', authMiddleware, async (req: any, res) => {
    try {
        const { inventory_ids, variant, partner_name, partner_phone } = req.body || {};
        if (!Array.isArray(inventory_ids) || inventory_ids.length === 0) {
            return res.status(400).json({ error: 'inventory_ids[] required' });
        }
        if (inventory_ids.length > 20) {
            return res.status(400).json({ error: 'Max 20 inventories per PDF' });
        }

        const agent = req.agent!;
        // Role-gated variant. Partner agents can never get branded PDFs of OUR inventory.
        let effectiveVariant: 'branded' | 'brandless' = variant === 'brandless' ? 'brandless' : 'branded';
        if (agent.role === 'partner_agent') effectiveVariant = 'brandless';

        const inventories = await prisma.inventory.findMany({
            where: { id: { in: inventory_ids } },
            select: {
                id: true, display_id: true, type: true, category: true, intent: true,
                specs: true, floor_number: true,
                // features/furnishing/total_floors/facing/property_age dropped Phase 4 — read from specs.*
                flat_no: true, plot_no: true, apartment_name: true, full_address: true,
                location: true, locality: true, sub_locality: true, city: true,
                district: true, state: true, price: true, display_price: true,
                customer_price: true, price_unit: true, description: true,
                media_urls: true, owner_phone: true,
                uploaded_by_agent_id: true, assigned_agent_id: true, reference_agent_id: true,
                shared_with_ids: true, status: true,
            },
        });

        if (inventories.length === 0) return res.status(404).json({ error: 'No inventories found' });

        // Authorization: agent must have access to every requested inventory.
        // super_boss bypasses; manager allowed only for inventories owned by their team.
        if (agent.role !== 'super_boss') {
            let teamIds: string[] = [];
            if (agent.role === 'manager') {
                const team = await prisma.agent.findMany({
                    where: { reports_to_id: agent.id },
                    select: { id: true },
                });
                teamIds = team.map(t => t.id);
            }
            const allowed = inventories.every(inv => {
                if ((inv as any).status === 'active') return true;  // marketplace model (2026-06-18): any agent may share any ACTIVE listing
                const direct = inv.uploaded_by_agent_id === agent.id
                    || inv.assigned_agent_id === agent.id
                    || inv.reference_agent_id === agent.id
                    || (inv.shared_with_ids || []).includes(agent.id);
                if (direct) return true;
                if (agent.role === 'manager') {
                    return teamIds.includes(inv.uploaded_by_agent_id || '')
                        || teamIds.includes(inv.assigned_agent_id || '');
                }
                return false;
            });
            if (!allowed) {
                return res.status(403).json({ error: 'Not authorized to share one or more selected properties' });
            }
        }

        const agentRecord = effectiveVariant === 'branded'
            ? await prisma.agent.findUnique({ where: { id: agent.id }, select: { name: true, phone: true } })
            : null;

        const { generateInventoryPdfStream } = await import('../services/pdf_generator');
        const filename = `realtypandit-${effectiveVariant}-${Date.now()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        const stream = await generateInventoryPdfStream(inventories as any, {
            variant: effectiveVariant,
            partnerName: partner_name || (effectiveVariant === 'brandless' ? agentRecord?.name : undefined),
            partnerPhone: partner_phone || (effectiveVariant === 'brandless' ? agentRecord?.phone : undefined),
            agentName: effectiveVariant === 'branded' ? agentRecord?.name || undefined : undefined,
            agentPhone: effectiveVariant === 'branded' ? agentRecord?.phone || undefined : undefined,
        });

        stream.pipe(res);

        // Audit log (non-blocking)
        prisma.interaction.create({
            data: {
                tenant_id: agent.tenant_id,
                phone_number: 'system',
                channel: 'system',
                direction: 'outbound',
                event_type: 'inventory_pdf_generated',
                content: `${effectiveVariant} PDF generated for ${inventories.length} properties by ${agent.id}`,
                metadata: { inventory_ids, variant: effectiveVariant, agent_id: agent.id },
            },
        }).catch(() => {});
    } catch (err) {
        captureRouteError(err, req, { route: 'inventory#share-pdf' });
        logger.error('[Inventory share-pdf] error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to generate PDF' });
    }
});

// GET /inventory/:id/share-link — return the public shareable URL only (no WhatsApp send).
// Frontend copies this to clipboard. Same URL the WhatsApp message uses.
router.get('/:id/share-link', authMiddleware, async (req: any, res) => {
    try {
        const inv = await prisma.inventory.findUnique({
            where: { id: req.params.id },
            select: { id: true, display_id: true, slug: true, status: true },
        });
        if (!inv) return res.status(404).json({ error: 'Property not found' });
        if (inv.status !== 'active') return res.status(400).json({ error: 'Property is not active — cannot share' });
        const link = inv.slug
            ? `https://www.realtypandit.in/properties/${inv.slug}`
            : `https://www.realtypandit.in/properties/${inv.display_id || inv.id}`;
        res.json({ share_link: link, slug: inv.slug, display_id: inv.display_id });
    } catch (err) {
        captureRouteError(err, req, { route: 'inventory#share-link' });
        res.status(500).json({ error: 'Failed to build share link' });
    }
});

// Rooms parsing for the matching-clients type/rooms gate. "Studio"/"1 RK" → 0 bedrooms.
function _parseRooms(v: any): number | null {
    if (v == null) return null;
    const s = String(v).toLowerCase();
    if (/studio|1\s*rk/.test(s)) return 0;
    const m = s.match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
}
function _roomsFromSpecs(specs: any, typeName?: string | null): number | null {
    const sp = (specs && typeof specs === 'object') ? specs : {};
    const r = _parseRooms(sp.bhk ?? sp.rooms ?? sp.bhk_count ?? sp.bedrooms);
    if (r != null) return r;
    if (typeName && /studio/i.test(typeName)) return 0;
    return null;
}
// NOTE: a demand-side scalar reader (_roomsFromSchema) used to live here and was removed on
// 2026-09-28 — it read a single value out of demand_schema_values, which silently dropped every
// option but the first once a customer accepted a set. Multi-value demand now goes through
// bhkListFromDemand() (utils/demand_canonical), which understands bhk_list + the bhk→rooms chain.

// GET /inventory/:id/matching-clients — find OPEN deals whose demand GENUINELY matches this listing.
// Strict (2026-06-18): hard filters on intent + property TYPE (residential/commercial + sub-category via
// the canonical taxonomy join) + rooms/BHK + budget; leads with no resolvable type are dropped (they are
// unqualified, not matches). Contact phone is REDACTED unless the viewer is super_boss OR the lead is
// assigned to them (deal or contact) — the middleman model; the name + Share (by deal_id) still work.
router.get('/:id/matching-clients', authMiddleware, async (req: any, res) => {
    try {
        const inv = await prisma.inventory.findUnique({
            where: { id: req.params.id },
            select: {
                id: true, tenant_id: true, intent: true, price: true, display_price: true,
                locality: true, city: true, district: true, location: true, type: true,
                category_id: true, sub_category_id: true, taxonomy_node_id: true,
                flat_property_type_id: true, specs: true,
                assigned_agent: { select: { name: true } },
            },
        });
        if (!inv) return res.status(404).json({ error: 'Property not found' });

        const me = req.agent!;
        const isSuperBoss = me.role === 'super_boss';

        const invIsRent = inv.intent === 'rent' || inv.intent === 'rent_lease' || inv.intent === 'lease';
        const invPrice = inv.price ? Number(inv.price) : null;
        const invLoc = (inv.locality || inv.city || inv.district || inv.location || '').toLowerCase();

        // Listing type → canonical {category, sub_category} for a HARD type filter.
        const invType = await resolveTypeFilter({
            demand_taxonomy_node_id: inv.taxonomy_node_id,
            sub_category_id: inv.sub_category_id,
            category_id: inv.category_id,
            type_id: inv.flat_property_type_id,
        });
        const invRooms = _roomsFromSpecs(inv.specs, inv.type);

        // PARTNER (2026-07-12): a partner may ONLY match against THEIR OWN leads — never the team's or
        // another partner's. Scope the candidate demand to deals they handle or leads they referred.
        const isPartnerViewer = me.role === 'partner';
        let partnerDealWhere: any = {};
        if (isPartnerViewer) {
            const { partnerIdsWithSubAgents } = await import('../utils/partner_scope');
            const { ids } = await partnerIdsWithSubAgents(me.id);
            partnerDealWhere = {
                OR: [
                    { demand_handler_id: { in: ids } },
                    { supply_handler_id: { in: ids } },
                    { demand_contact: { referral_partner_id: { in: ids } } },
                ],
            };
        }

        const deals = await prisma.transaction.findMany({
            where: {
                tenant_id: inv.tenant_id,
                status: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
                ...partnerDealWhere,
            },
            include: {
                demand_contact: { select: { phone_number: true, name: true, assigned_agent_id: true, referral_partner_id: true, assigned_agent: { select: { name: true } } } },
            },
            take: 800,
        });

        const matches: any[] = [];
        for (const d of deals as any[]) {
            const phone = d.demand_contact?.phone_number;
            if (!phone || isPlaceholderPhone(phone)) continue;

            // 1) Intent — rent listing needs a rent/lease demand; sale needs buy. No auto-pass on a missing intent.
            const di = (d.demand_intent || '').toLowerCase();
            const dWantsRent = di === 'rent' || di === 'rent_lease' || di === 'lease';
            const dWantsBuy = di === 'buy' || di === 'sell';
            if (invIsRent && dWantsBuy) continue;
            if (!invIsRent && dWantsRent) continue;

            // 2) Type — resolve ALL of the demand's canonical types. Multi-value demand (2026-09-28)
            //    means the customer accepts several types ("Flat or Villa"), stored as
            //    demand_schema_values.type_node_list. The HARD gate is only a genuine
            //    residential↔commercial conflict, and now only when EVERY resolved type
            //    conflicts. An unresolved demand type (≈53% of leads carry a node that doesn't
            //    map to a legacy category) stays NEUTRAL, not a drop — else genuine leads like a
            //    budget-fit rent seeker get thrown away. Sub-category is a bonus; the rooms
            //    check (step 4) does the fine separation (studio vs 2 BHK).
            const dNodeIds = typeNodeListFromDemand(d.demand_schema_values, d.demand_taxonomy_node_id);
            const dTypes = (await Promise.all(
                dNodeIds.map(nid => resolveTypeFilter({ demand_taxonomy_node_id: nid }).catch(() => null)),
            )).filter(Boolean) as Array<{ category_id?: string | null; sub_category_id?: string | null }>;
            const hasType = dTypes.some(t => t.category_id || t.sub_category_id);
            const knownCatTypes = dTypes.filter(t => t.category_id);
            // residential vs commercial → drop, but only when no acceptable type is left
            if (invType.category_id && knownCatTypes.length && !knownCatTypes.some(t => t.category_id === invType.category_id)) continue;
            let typeScore = 0.6;
            if (invType.category_id && dTypes.some(t => t.category_id === invType.category_id)) typeScore = 0.85;             // same category (res/com) known
            if (invType.sub_category_id && dTypes.some(t => t.sub_category_id === invType.sub_category_id)) typeScore = 1; // exact sub-category bonus

            // 3) Budget — listing price within the deal's window (±30%) when both are known.
            const bmax = d.demand_budget_max ? Number(d.demand_budget_max) : null;
            const bmin = d.demand_budget_min ? Number(d.demand_budget_min) : null;

            // 4) Rooms/BHK — the accepted set (bhk_list when multi, else the scalar bhk/rooms).
            //    An exact member of the set scores 1; otherwise the nearest member decides whether
            //    this is a clear conflict (≥2 away → drop), matching the old single-value rule.
            const dRoomsList = bhkListFromDemand(d.demand_schema_values);

            // Qualification gate — drop leads with NO substantive relevance signal (type, budget, location
            // OR rooms). Bare intent alone (every rent seeker "wants rent") does NOT qualify. This is what
            // removes the empty/unqualified leads (no budget, no type, no location) the user flagged.
            if (!hasType && !bmax && !bmin && !d.demand_location && dRoomsList.length === 0) continue;

            let budgetScore = 0.5;
            if (invPrice && invPrice > 0) {
                if (bmax && invPrice > bmax * 1.3) continue;
                if (bmin && invPrice < bmin * 0.7) continue;
                if (bmax) budgetScore = invPrice <= bmax ? 1 : Math.max(0, 1 - (invPrice - bmax) / (bmax * 0.3));
            }

            let roomScore = 0.5;
            if (invRooms != null && dRoomsList.length > 0) {
                if (dRoomsList.includes(invRooms)) {
                    roomScore = 1; // exact hit on an accepted option
                } else {
                    const nearest = Math.min(...dRoomsList.map(r => Math.abs(invRooms - r)));
                    if (nearest >= 2) continue;
                    roomScore = 0.7;
                }
            }

            // 5) Location — soft; skip only on a clear two-sided mismatch.
            let locScore = 0.5;
            const dLoc = (d.demand_location || '').toLowerCase();
            if (dLoc && invLoc) {
                if (invLoc.includes(dLoc) || dLoc.includes(invLoc)) locScore = 1;
                else continue;
            }

            const score = Math.round((typeScore * 0.35 + budgetScore * 0.3 + roomScore * 0.2 + locScore * 0.15) * 100);

            const reasons: string[] = [invIsRent ? 'Rent' : 'Buy'];
            // Multi-value demand (2026-09-28): name the option the listing actually hit, so an agent
            // reading the match sees "2 BHK" rather than the primary value of a 2-and-3 set.
            if (invRooms != null && dRoomsList.includes(invRooms)) reasons.push(invRooms === 0 ? 'Studio' : `${invRooms} BHK`);
            if (invPrice && bmax) reasons.push('budget fit');
            if (locScore === 1) reasons.push('location match');

            // Middleman model: phone visible only to super_boss or the agent who owns the lead.
            // A PARTNER only ever reaches their OWN leads here (scoped above) — those are their own
            // referred clients, so they may see them. They can never see a team/other-partner lead.
            const owned = isPartnerViewer
                ? true
                : (isSuperBoss
                    || (d.assigned_agent_id && d.assigned_agent_id === me.id)
                    || (d.demand_contact?.assigned_agent_id && d.demand_contact.assigned_agent_id === me.id));

            matches.push({
                deal_id: d.id,
                contact_name: d.demand_contact?.name || null,
                contact_phone: owned ? phone : undefined,   // redacted unless mine / super_boss
                contact_redacted: !owned,
                // The agent who manages THIS lead (the contact's assigned agent) — shown next to each
                // match so the viewer knows who to coordinate with (esp. redacted leads).
                lead_manager: d.demand_contact?.assigned_agent?.name || null,
                demand_intent: d.demand_intent || null,
                demand_budget_min: bmin,
                demand_budget_max: bmax,
                demand_location: d.demand_location || null,
                status: d.status,
                score,
                match_reason: reasons.join(' · '),
            });
        }
        matches.sort((a, b) => b.score - a.score);
        res.json({
            matches: matches.slice(0, 30),
            total_matched: matches.length,
            inventory_manager: (inv as any).assigned_agent?.name || null,
        });
    } catch (err) {
        captureRouteError(err, req, { route: 'inventory#matching-clients' });
        res.status(500).json({ error: 'Failed to find matching clients' });
    }
});

// POST /inventory/:id/share-to-client — Share property with a client via WhatsApp + generate link
router.post('/:id/share-to-client', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        let { client_phone, client_name } = req.body;
        const { deal_id } = req.body;
        // Redaction-safe path: when the client's number is hidden from this agent (a lead
        // assigned to another team member), the frontend sends deal_id instead of the phone.
        // The phone is resolved server-side and never returned — sharing still goes via company
        // WhatsApp without exposing the contact.
        if (!client_phone && deal_id) {
            const deal = await prisma.transaction.findUnique({
                where: { id: String(deal_id) },
                include: { demand_contact: { select: { phone_number: true, name: true } } },
            });
            if (!deal || deal.tenant_id !== req.agent!.tenant_id) {
                return res.status(404).json({ error: 'Deal not found' });
            }
            client_phone = deal.demand_contact?.phone_number;
            client_name = client_name || deal.demand_contact?.name || undefined;
        }
        if (!client_phone) return res.status(400).json({ error: 'client_phone or deal_id required' });

        const normalized = normalizePhone(client_phone);
        // Guard against placeholder keys (PENDING-/TEMP_) and un-normalizable junk: normalizePhone
        // returns '' for those, and a partner-referral lead's phone_number is a PENDING- placeholder.
        // Without this, we'd upsert a Contact with an empty phone_number and fire a WhatsApp send to a
        // garbage recipient (the reported "83830443903016494" bug). Defense-in-depth behind the UI gate.
        if (!normalized || isPlaceholderPhone(client_phone)) {
            return res.status(400).json({ error: 'No valid client phone to share to' });
        }
        const agent = req.agent!;

        // PARTNER (2026-07-12): an external partner sharing a property to THEIR client.
        // A PartnerAgent id is NOT an Agent id, and PropertyShare.agent_id / Contact.created_by are
        // Agent FKs — so the share is RECORDED under the partner's coordinator (managing agent), with
        // the partner captured on the contact (referral_partner_id) + the interaction metadata.
        const isPartnerShare = agent.role === 'partner';
        let actingAgentId: string | null = agent.id;
        if (isPartnerShare) {
            const pa = await prisma.partnerAgent.findUnique({
                where: { id: agent.id }, select: { managing_agent_id: true, status: true },
            });
            if (!pa || pa.status !== 'ACTIVE') return res.status(403).json({ error: 'Partner account is not active' });
            actingAgentId = pa.managing_agent_id
                || (await prisma.agent.findFirst({ where: { role: 'super_boss', status: 'active' }, select: { id: true } }))?.id
                || null;
            if (!actingAgentId) return res.status(500).json({ error: 'No coordinator available to record this share' });
        }

        // Fetch inventory with details for the WhatsApp message
        const inventory = await prisma.inventory.findUnique({
            where: { id },
            include: {
                flat_property_type: { select: { name: true, main_category: true } },
            }
        });
        if (!inventory || inventory.tenant_id !== agent.tenant_id) return res.status(404).json({ error: 'Property not found' });

        // Authorization: same as internal share — agent must have access to property
        let canShare = agent.role === 'super_boss'
            || inventory.uploaded_by_agent_id === agent.id
            || inventory.assigned_agent_id === agent.id
            || inventory.reference_agent_id === agent.id
            || (inventory.shared_with_ids || []).includes(agent.id);
        // A partner may share any ACTIVE listing, or their OWN listing in any status.
        if (isPartnerShare) {
            const { partnerIdsWithSubAgents, isPartnerOwnInventory } = await import('../utils/partner_scope');
            const { ids, phones } = await partnerIdsWithSubAgents(agent.id);
            canShare = inventory.status === 'active' || isPartnerOwnInventory(inventory as any, ids, phones);
            if (!canShare) return res.status(403).json({ error: 'Not authorized to share this property' });
        }
        if (!canShare) {
            const partnerOwnerIds = await getManagedPartnerOwnerIds([agent.id]);
            if (inventory.owner_id && partnerOwnerIds.includes(inventory.owner_id)) canShare = true;
        }
        if (!canShare && agent.role === 'manager') {
            const team = await prisma.agent.findMany({ where: { reports_to_id: agent.id }, select: { id: true } });
            const teamIds = team.map((a: { id: string }) => a.id);
            canShare = teamIds.includes(inventory.uploaded_by_agent_id || '') || teamIds.includes(inventory.assigned_agent_id || '');
        }
        // Marketplace model (2026-06-18): any agent may share any ACTIVE listing to a client (listings
        // are visible to all; the card carries no owner PII). Non-active listings stay owner/team-guarded.
        if (!canShare && inventory.status === 'active') canShare = true;
        if (!canShare) return res.status(403).json({ error: 'Not authorized to share this property' });

        const { deliverPendingPropertyMedia, pendingPropertyMediaCount } = await import('../services/property_media_queue');
        if (req.body.retry_media) {
            const prior = await prisma.propertyShare.findFirst({ where: {
                tenant_id: agent.tenant_id, inventory_id: id, client_phone: normalized, agent_id: actingAgentId!,
            } });
            if (!prior) return res.status(403).json({ error: 'No share available to retry' });
            await deliverPendingPropertyMedia(new WhatsAppService(), normalized, id);
            return res.json({ success: true, share_link: prior.property_link, whatsapp_sent: prior.whatsapp_sent,
                media_pending: await pendingPropertyMediaCount(normalized, id) });
        }

        // Upsert contact as BUYER
        const existingContact = await prisma.contact.findUnique({ where: { phone_number: normalized } });
        if (existingContact && existingContact.tenant_id !== agent.tenant_id) return res.status(403).json({ error: 'Client belongs to another tenant' });
        await prisma.contact.upsert({
            where: { phone_number: normalized },
            update: {
                name: client_name || undefined,
                last_channel: 'whatsapp',
                last_interaction: new Date()
            },
            create: {
                phone_number: normalized,
                name: client_name || null,
                source: isPartnerShare ? 'partner_referral' : 'manual',
                contact_type: 'BUYER',
                tenant_id: agent.tenant_id,
                last_channel: 'whatsapp',
                last_interaction: new Date(),
                // created_by is an Agent FK — never a PartnerAgent id. A partner's new client is
                // attributed to them via referral_partner_id (so it shows up as THEIR lead).
                created_by: isPartnerShare ? null : (req.agent?.id || null),
                ...(isPartnerShare ? {
                    lead_type: 'PARTNER_REFERRAL',
                    referral_partner_id: agent.id,
                    owning_manager_id: actingAgentId,
                } : {}),
            }
        });

        // Prior-share lookup — for an informational NOTICE only. Re-sharing is ALWAYS allowed:
        // we never block the user/system from sending the same property to the same client again
        // (a failed earlier send must be re-sendable). The UI shows "previously shared on <date>".
        const existingShare = await prisma.propertyShare.findFirst({
            where: { inventory_id: inventory.id, client_phone: normalized },
            orderBy: { created_at: 'desc' },
        });
        const previouslySharedAt = existingShare?.created_at ?? null;

        // Generate shareable property link
        const propertyLink = inventory.display_id
            ? `https://www.realtypandit.in/properties/${inventory.display_id}`
            : `https://www.realtypandit.in/properties/${inventory.id}`;

        // typeName is kept for the interaction-log content below; the actual WhatsApp messages
        // are built + sent inside sharePropertyToRecipient.
        const typeName = inventory.flat_property_type?.name || inventory.type?.toUpperCase() || 'Property';

        // Photos/videos + details text (approved card template outside the 24h window), plus the
        // brochure PDF when the sender ticked it. Same content for every recipient type.
        const { sharePropertyToRecipient, parseShareContent } = await import('../services/property_sharing');
        const content = parseShareContent(req.body.content);
        let whatsappSent = false;
        let pdfSent = false;
        try {
            ({ sent: whatsappSent, pdfSent } = await sharePropertyToRecipient(normalized, inventory, content));
        } catch (err) {
            logger.error('[ShareToClient] WhatsApp send failed:', err);
        }

        // Create PropertyShare record. agent_id is an Agent FK — for a partner share it is recorded
        // under their coordinator (actingAgentId); the partner is captured in the interaction metadata.
        const share = await prisma.propertyShare.create({
            data: {
                tenant_id: agent.tenant_id,
                inventory_id: inventory.id,
                agent_id: actingAgentId!,
                client_phone: normalized,
                channel: 'whatsapp_api',
                property_link: propertyLink,
                whatsapp_sent: whatsappSent,
            }
        });

        // 2026-07-22: without deal_id this share is invisible in the deal TIMELINE —
        // getDealTimeline filters interactions on metadata.deal_id, which silently dropped
        // 204 rows. The sibling share-batch-to-client route already resolves it; mirror that.
        let sharedDealId: string | null = null;
        try {
            const { resolveActiveDealId } = await import('../services/property_sharing');
            sharedDealId = await resolveActiveDealId(normalized);
        } catch (err) {
            logger.warn('[ShareToClient] resolveActiveDealId failed — timeline link skipped:', err);
        }

        // Log interaction
        await prisma.interaction.create({
            data: {
                tenant_id: agent.tenant_id,
                phone_number: normalized,
                channel: 'whatsapp',
                direction: 'outbound',
                event_type: 'property_shared',
                content: `Property shared: ${typeName} in ${inventory.location || inventory.full_address || 'N/A'}`
                    + (isPartnerShare ? ' (by partner agent)' : ''),
                metadata: {
                    inventory_id: inventory.id, share_id: share.id, property_link: propertyLink,
                    share_content: content, pdf_sent: pdfSent,
                    ...(sharedDealId ? { deal_id: sharedDealId } : {}),
                    ...(isPartnerShare ? { partner_agent_id: agent.id, recorded_under_agent_id: actingAgentId } : {}),
                },
            }
        });

        logger.info(`[ShareToClient] Agent ${agent.id} shared ${id} with ${normalized}, WhatsApp: ${whatsappSent}`);
        res.json({
            success: true,
            share_link: propertyLink,
            whatsapp_sent: whatsappSent,
            pdf_requested: content.pdf,
            pdf_sent: pdfSent,
            media_pending: await pendingPropertyMediaCount(normalized, id),
            // Non-blocking re-share notice: true if this property was shared to this client before.
            already_shared: !!existingShare,
            previously_shared_at: previouslySharedAt,
            share_id: share.id,
            contact_created: !existingContact,
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#6' });
        logger.error('[ShareToClient] Error:', error);
        res.status(500).json({ error: 'Failed to share property' });
    }
});

// POST /inventory/share-batch-to-client — recipient-aware multi-property share.
// Every recipient gets photos/videos + details per property (`content` from the share dialog;
// default photos+videos, no PDF) plus the brochure PDF ("k of N") when ticked. An ACTIVE
// PartnerAgent (dealer) gets the partner-watermarked brandless PDF/link. Every share is tagged
// with the recipient's deal_id so it surfaces in the deal pipeline timeline + already-shared set.
router.post('/share-batch-to-client', authMiddleware, async (req: any, res) => {
    try {
        const { inventory_ids, client_phone, client_name } = req.body || {};
        if (!Array.isArray(inventory_ids) || inventory_ids.length === 0) {
            return res.status(400).json({ error: 'inventory_ids[] required' });
        }
        if (!client_phone) return res.status(400).json({ error: 'client_phone required' });
        const normalized = normalizePhone(client_phone);
        if (!normalized || isPlaceholderPhone(client_phone)) {
            return res.status(400).json({ error: 'No valid client phone to share to' });
        }
        const agent = req.agent!;

        // Upsert contact as BUYER (mirrors /:id/share-to-client)
        const existingContact = await prisma.contact.findUnique({ where: { phone_number: normalized } });
        await prisma.contact.upsert({
            where: { phone_number: normalized },
            update: { name: client_name || undefined, last_channel: 'whatsapp', last_interaction: new Date() },
            create: {
                phone_number: normalized, name: client_name || null, source: 'manual',
                contact_type: 'BUYER', tenant_id: agent.tenant_id, last_channel: 'whatsapp',
                last_interaction: new Date(), created_by: req.agent?.id || null,
            },
        });

        const { resolveShareMode } = await import('../services/share_recognition');
        const { mode, partner } = await resolveShareMode(normalized);
        const { sharePropertyToRecipient, buildBrochureUrl, parseShareContent, resolveActiveDealId } = await import('../services/property_sharing');
        const content = parseShareContent(req.body?.content);
        const dealId = await resolveActiveDealId(normalized);

        const inventories = await prisma.inventory.findMany({
            where: { id: { in: inventory_ids } },
            include: { flat_property_type: { select: { name: true, main_category: true } } },
        });
        if (inventories.length === 0) return res.status(404).json({ error: 'No inventories found' });

        // Per-inventory authorization (mirrors share-pdf): super_boss bypass; manager → team-owned; else direct match.
        let teamIds: string[] = [];
        if (agent.role === 'manager') {
            const team = await prisma.agent.findMany({ where: { reports_to_id: agent.id }, select: { id: true } });
            teamIds = team.map((t: { id: string }) => t.id);
        }
        const canShare = (inv: any) => agent.role === 'super_boss'
            || inv.status === 'active'   // marketplace model (2026-06-18): ANY agent may share any ACTIVE listing to a client (matches /:id/share-to-client). Was the "Not authorized" bulk-share bug.
            || inv.uploaded_by_agent_id === agent.id || inv.assigned_agent_id === agent.id
            || inv.reference_agent_id === agent.id || (inv.shared_with_ids || []).includes(agent.id)
            || (agent.role === 'manager' && (teamIds.includes(inv.uploaded_by_agent_id || '') || teamIds.includes(inv.assigned_agent_id || '')));

        // Preserve the caller's order; drop any the agent can't share.
        const ordered = (inventory_ids as string[])
            .map((id) => inventories.find((i: any) => i.id === id))
            .filter((i): i is any => !!i && canShare(i));
        if (ordered.length === 0) return res.status(403).json({ error: 'Not authorized to share the selected properties' });

        const total = ordered.length;
        const results: any[] = [];
        for (let i = 0; i < ordered.length; i++) {
            const inv = ordered[i];
            let whatsappSent = false;
            let pdfSent = false;
            let pdfUrl: string | null = null;
            try {
                ({ sent: whatsappSent, pdfSent, pdfUrl } = await sharePropertyToRecipient(normalized, inv, content, { index: i, total }));
            } catch (err) {
                logger.error(`[ShareBatch] send failed for ${inv.id} (${mode}):`, err);
            }
            // Partners get the brandless brochure link (forwardable, no RP trace); clients the website link.
            const propertyLink = mode === 'dealer'
                ? (pdfUrl || await buildBrochureUrl(inv, partner))
                : `https://www.realtypandit.in/properties/${inv.display_id || inv.id}`;

            const share = await prisma.propertyShare.create({
                data: {
                    tenant_id: agent.tenant_id, inventory_id: inv.id, agent_id: agent.id,
                    client_phone: normalized, channel: pdfSent ? 'whatsapp_brochure' : 'whatsapp_api',
                    property_link: propertyLink, whatsapp_sent: whatsappSent,
                },
            });
            await prisma.interaction.create({
                data: {
                    tenant_id: agent.tenant_id, phone_number: normalized, channel: 'whatsapp',
                    direction: 'outbound', event_type: 'property_shared',
                    content: `Property shared (${mode}): ${inv.flat_property_type?.name || inv.type || 'Property'} in ${inv.locality || inv.location || 'N/A'}`,
                    metadata: { inventory_id: inv.id, share_id: share.id, property_link: propertyLink, deal_id: dealId, variant: mode, share_content: content, pdf_sent: pdfSent },
                },
            });
            results.push({ inventory_id: inv.id, whatsapp_sent: whatsappSent, pdf_sent: pdfSent, property_link: propertyLink });
        }

        logger.info(`[ShareBatch] Agent ${agent.id} shared ${results.length} props with ${normalized} as ${mode} (deal=${dealId || 'none'})`);
        res.json({ success: true, mode, deal_id: dealId, results, contact_created: !existingContact });
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#share-batch' });
        logger.error('[ShareBatch] Error:', error);
        res.status(500).json({ error: 'Failed to share properties' });
    }
});

// POST /inventory/share/add-lead — when a shared-to number isn't in our DB, add it as a lead
// from the inventory being shared. role='direct' → BUYER contact + pipeline deal; role='partner'
// → PartnerAgent + welcome + an ON-BEHALF lead/deal (PENDING- buyer, PARTNER_INTERNAL). Assigned
// to the uploader. Reuses the lead-page primitives WITHOUT touching routes/leads.ts.
router.post('/share/add-lead', authMiddleware, async (req: any, res) => {
    try {
        const { phone, name, role, inventory_id } = req.body || {};
        const agent = req.agent!;
        const normalized = normalizePhone(phone);
        if (!normalized || isPlaceholderPhone(phone)) return res.status(400).json({ error: 'Enter a valid phone number' });
        if (!['direct', 'partner'].includes(role)) return res.status(400).json({ error: 'role must be direct or partner' });

        const inv = await prisma.inventory.findUnique({
            where: { id: inventory_id },
            select: {
                id: true, intent: true, type: true, category_id: true, sub_category_id: true, type_id: true,
                taxonomy_node_id: true, specs: true, locality: true, city: true, location: true,
                display_price: true, price: true, customer_price: true, latitude: true, longitude: true,
            },
        });
        if (!inv) return res.status(404).json({ error: 'Inventory not found' });

        const { buildDemandFromInventory } = await import('../services/inventory_to_demand');
        const { ensureDealForLead } = await import('../services/ensure_deal');
        const d = buildDemandFromInventory(inv);
        const demandSchema = d.demand_bhk ? { bhk: d.demand_bhk } : undefined;

        if (role === 'partner') {
            const { ensurePartnerAgent } = await import('../services/partner_auto_create');
            const { sendPartnerWelcomeWhatsApp } = await import('../services/partner_notifications');
            const pa = await ensurePartnerAgent(normalized, name || 'Partner Agent', agent.tenant_id, agent.id);
            if (pa.wasCreated) {
                sendPartnerWelcomeWhatsApp(pa.partnerPhone, name || 'Partner Agent', 'INDIVIDUAL', agent.name)
                    .catch((e: any) => logger.warn(`[ShareAddLead] partner welcome failed: ${e.message}`));
            }
            const owningManagerId = (await prisma.partnerAgent.findUnique({ where: { id: pa.partnerId }, select: { managing_agent_id: true } }))?.managing_agent_id ?? agent.id;
            // On-behalf buyer = PENDING- placeholder (partner's client name/phone optional, added later).
            const pendingKey = `PENDING-${normalized.replace(/\D/g, '').slice(-10)}-${Date.now().toString(36)}`;
            await prisma.contact.create({
                data: {
                    phone_number: pendingKey, tenant_id: agent.tenant_id, name: null, source: 'inventory_share',
                    contact_type: 'BUYER', intent: d.intent, lead_type: 'PARTNER_REFERRAL',
                    // Denormalize the partner phone/name so the deal UI (Match & Share fallback, Call-partner)
                    // has them without a join — was missing here, causing "can't share" on partner deals. (2026-06-28)
                    referral_partner_id: pa.partnerId, referral_partner_phone: pa.partnerPhone, referral_partner_name: name || 'Partner Agent',
                    owning_manager_id: owningManagerId,
                    preferred_location: d.preferred_location, preferred_lat: d.preferred_lat, preferred_lng: d.preferred_lng,
                    budget_min: d.budget_min, budget_max: d.budget_max,
                    category_id: d.category_id, sub_category_id: d.sub_category_id, type_id: d.type_id,
                    demand_taxonomy_node_id: d.demand_taxonomy_node_id, demand_schema_values: demandSchema,
                } as any,
            });
            const deal = await ensureDealForLead({ contactPhone: pendingKey, source: 'inventory_share', createdByAgentId: agent.id, assignedAgentId: agent.id, isPartnerReferral: true });
            await prisma.transaction.update({
                where: { id: deal.dealId },
                data: { deal_scenario: 'PARTNER_INTERNAL', demand_handler_type: 'PARTNER', demand_handler_id: pa.partnerId, owning_manager_id: owningManagerId } as any,
            });
            logger.info(`[ShareAddLead] Partner ${normalized} (created=${pa.wasCreated}) + on-behalf deal ${deal.dealId} by ${agent.id}`);
            return res.json({ success: true, role, partner_id: pa.partnerId, partner_created: pa.wasCreated, deal_id: deal.dealId, contact_phone: normalized });
        }

        // direct client
        const existing = await prisma.contact.findUnique({ where: { phone_number: normalized } });
        await prisma.contact.upsert({
            where: { phone_number: normalized },
            update: {
                name: name || undefined, intent: d.intent, preferred_location: d.preferred_location,
                budget_min: d.budget_min, budget_max: d.budget_max, category_id: d.category_id,
                sub_category_id: d.sub_category_id, type_id: d.type_id, demand_taxonomy_node_id: d.demand_taxonomy_node_id,
                demand_schema_values: demandSchema,
            } as any,
            create: {
                phone_number: normalized, tenant_id: agent.tenant_id, name: name || null, source: 'inventory_share',
                contact_type: 'BUYER', intent: d.intent, preferred_location: d.preferred_location,
                preferred_lat: d.preferred_lat, preferred_lng: d.preferred_lng, budget_min: d.budget_min, budget_max: d.budget_max,
                category_id: d.category_id, sub_category_id: d.sub_category_id, type_id: d.type_id,
                demand_taxonomy_node_id: d.demand_taxonomy_node_id, demand_schema_values: demandSchema, created_by: agent.id,
            } as any,
        });
        const deal = await ensureDealForLead({ contactPhone: normalized, source: 'inventory_share', createdByAgentId: agent.id, assignedAgentId: agent.id });
        // Greet a genuinely-new direct client the same way every other intake path does
        // (2026-07-13) — was the one lead-creation path with no confirmation at all.
        if (!existing) {
            const { sendBuyerConfirmationWhatsApp } = await import('../services/lead_notifications');
            sendBuyerConfirmationWhatsApp(normalized, name || null, 'inventory_share')
                .catch((e: any) => logger.warn(`[ShareAddLead] welcome message failed: ${e.message}`));
        }
        logger.info(`[ShareAddLead] Direct ${normalized} + deal ${deal.dealId} by ${agent.id}`);
        res.json({ success: true, role, deal_id: deal.dealId, contact_created: !existing, contact_phone: normalized });
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#share-add-lead' });
        logger.error('[ShareAddLead] Error:', error);
        res.status(500).json({ error: 'Failed to add lead' });
    }
});

// POST /inventory/bulk-transfer — transfer many listings to one agent in a single call.
// Mirrors /:id/transfer per-listing (same authorization + audit row + notify). Returns a
// per-listing result summary for partial-success reporting. (#4 bulk reassign, 2026-06-28)
router.post('/bulk-transfer', authMiddleware, checkPermission('transfer_inventory'), async (req, res) => {
    try {
        const { ids, to_agent_id, reason } = req.body || {};
        const agent = req.agent!;
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
        if (!to_agent_id) return res.status(400).json({ error: 'to_agent_id required' });
        if (ids.length > 500) return res.status(400).json({ error: 'Too many listings (max 500 per call)' });

        const targetAgent = await prisma.agent.findUnique({ where: { id: to_agent_id }, select: { id: true, name: true, phone: true, email: true } });
        if (!targetAgent) return res.status(404).json({ error: 'Target agent not found' });
        const actorName = (await prisma.agent.findUnique({ where: { id: agent.id }, select: { name: true } }))?.name || agent.email || 'a team member';

        // Precompute the manager's team + managed-partner owners ONCE (not per listing).
        const teamIds = agent.role === 'manager'
            ? (await prisma.agent.findMany({ where: { reports_to_id: agent.id }, select: { id: true } })).map((a: { id: string }) => a.id)
            : [];
        const partnerOwnerIds = await getManagedPartnerOwnerIds([agent.id]);

        const results: { id: string; ok: boolean; error?: string }[] = [];
        for (const rawId of ids) {
            const id = String(rawId);
            try {
                const existing = await prisma.inventory.findUnique({ where: { id } });
                if (!existing) { results.push({ id, ok: false, error: 'Not found' }); continue; }
                // Same authorization as the single endpoint.
                const canTransfer = agent.role === 'super_boss'
                    || existing.uploaded_by_agent_id === agent.id
                    || existing.assigned_agent_id === agent.id
                    || existing.reference_agent_id === agent.id
                    || (existing.shared_with_ids || []).includes(agent.id)
                    || partnerOwnerIds.includes(existing.owner_id)
                    || (agent.role === 'manager' && (teamIds.includes(existing.uploaded_by_agent_id || '') || teamIds.includes(existing.assigned_agent_id || '')));
                if (!canTransfer) { results.push({ id, ok: false, error: 'Not authorized' }); continue; }
                if (existing.assigned_agent_id === to_agent_id) { results.push({ id, ok: true }); continue; }
                const noteText = reason || `Transferred to ${targetAgent.name}`;
                const auditPhone = existing.owner_phone || existing.uploader_phone || existing.key_holder_phone;
                await prisma.$transaction([
                    prisma.inventory.update({ where: { id }, data: { assigned_agent_id: to_agent_id, updated_at: new Date() } }),
                    ...(auditPhone ? [prisma.interaction.create({
                        data: {
                            tenant_id: existing.tenant_id, phone_number: auditPhone, channel: 'admin', direction: 'outbound',
                            event_type: 'inventory_transferred',
                            content: `Inventory ${existing.display_id || id.slice(0, 8)} transferred from ${actorName} to ${targetAgent.name}. Reason: ${noteText}`,
                            metadata: { inventory_id: id, display_id: existing.display_id, from_agent_id: existing.assigned_agent_id, from_agent_name: actorName, to_agent_id, to_agent_name: targetAgent.name, reason: noteText, actor_id: agent.id, bulk: true },
                        },
                    })] : []),
                ]);
                results.push({ id, ok: true });
            } catch (e: any) {
                results.push({ id, ok: false, error: e?.message || 'failed' });
            }
        }
        const okCount = results.filter(r => r.ok).length;
        try {
            if (okCount > 0) notify('inventory_transferred', [{ id: targetAgent.id, type: 'agent', phone: targetAgent.phone ?? undefined, email: targetAgent.email || undefined, name: targetAgent.name }], {
                inventory_id: '', display_id: `${okCount} listings`, from_agent: actorName, property_type: '', location: '',
            });
        } catch (notifyErr) { logger.warn(`[Inventory] bulk transfer notify failed: ${(notifyErr as Error).message}`); }

        logger.info(`[Inventory] bulk transfer: ${okCount}/${ids.length} → ${targetAgent.name} by ${actorName}`);
        res.json({ success: true, transferred: okCount, total: ids.length, new_agent: targetAgent, results });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'inventory#bulk-transfer' });
        logger.error('[Inventory] Bulk transfer error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /inventory/:id/transfer — Transfer inventory to another team member
router.post('/:id/transfer', authMiddleware, checkPermission('transfer_inventory'), async (req, res) => {
    try {
        const { id } = req.params;
        const { to_agent_id } = req.body;
        if (!to_agent_id) return res.status(400).json({ error: 'to_agent_id required' });

        const existing = await prisma.inventory.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Inventory not found' });

        // Authorization: anyone who can see this inventory can transfer it
        const agent = req.agent!;
        let canTransfer = agent.role === 'super_boss'
            || existing.uploaded_by_agent_id === agent.id
            || existing.assigned_agent_id === agent.id
            || existing.reference_agent_id === agent.id
            || (existing.shared_with_ids || []).includes(agent.id);
        if (!canTransfer) {
            // Check managed partner agents' inventory
            const partnerOwnerIds = await getManagedPartnerOwnerIds([agent.id]);
            if (partnerOwnerIds.includes(existing.owner_id)) canTransfer = true;
        }
        if (!canTransfer && agent.role === 'manager') {
            const team = await prisma.agent.findMany({ where: { reports_to_id: agent.id }, select: { id: true } });
            const teamIds = team.map((a: { id: string }) => a.id);
            canTransfer = teamIds.includes(existing.uploaded_by_agent_id || '') || teamIds.includes(existing.assigned_agent_id || '');
        }
        if (!canTransfer) {
            return res.status(403).json({ error: 'Not authorized to transfer this inventory' });
        }

        // Validate target agent exists
        const targetAgent = await prisma.agent.findUnique({ where: { id: to_agent_id }, select: { id: true, name: true } });
        if (!targetAgent) return res.status(404).json({ error: 'Target agent not found' });

        const previousAssignedId = existing.assigned_agent_id;
        const reason: string | undefined = (req.body || {}).reason;
        const noteText = reason || `Transferred to ${targetAgent.name}`;

        // 2026-05-15: Audit row written so transfer history is queryable. Lives on
        // the inventory's interactions stream (uploader_phone or owner_phone — using
        // owner_phone since that's the canonical "who is this property for" key).
        const auditPhone = existing.owner_phone || existing.uploader_phone || existing.key_holder_phone;
        await prisma.$transaction([
            prisma.inventory.update({
                where: { id },
                data: { assigned_agent_id: to_agent_id, updated_at: new Date() },
            }),
            ...(auditPhone ? [
                prisma.interaction.create({
                    data: {
                        tenant_id: existing.tenant_id,
                        phone_number: auditPhone,
                        channel: 'admin',
                        direction: 'outbound',
                        event_type: 'inventory_transferred',
                        content: `Inventory ${existing.display_id || id.slice(0,8)} transferred from ${agent.name} to ${targetAgent.name}. Reason: ${noteText}`,
                        metadata: {
                            inventory_id: id,
                            display_id: existing.display_id,
                            from_agent_id: previousAssignedId,
                            from_agent_name: agent.name,
                            to_agent_id: to_agent_id,
                            to_agent_name: targetAgent.name,
                            reason: noteText,
                            actor_id: agent.id,
                        },
                    },
                }),
            ] : []),
        ]);

        logger.info(`[Inventory] Transferred ${id} from ${agent.name} to ${targetAgent.name}`);

        // Notify new + previous handler
        const fullTarget = await prisma.agent.findUnique({ where: { id: to_agent_id }, select: { id: true, phone: true, email: true, name: true } });
        if (fullTarget) {
            notify('inventory_transferred', [{ id: fullTarget.id, type: 'agent', phone: fullTarget.phone, email: fullTarget.email || undefined, name: fullTarget.name }], {
                inventory_id: id, display_id: existing.display_id, from_agent: agent.name,
                property_type: existing.type, location: existing.full_address || existing.locality,
            });
        }
        if (previousAssignedId && previousAssignedId !== agent.id && previousAssignedId !== to_agent_id) {
            const prev = await prisma.agent.findUnique({
                where: { id: previousAssignedId },
                select: { id: true, name: true, phone: true, email: true },
            });
            if (prev) {
                notify('inventory_transferred_away', [{
                    id: prev.id, type: 'agent' as const,
                    phone: prev.phone ?? undefined, email: prev.email || undefined,
                    name: prev.name,
                }], {
                    inventory_id: id, display_id: existing.display_id, to_agent_name: targetAgent.name,
                    by_agent_name: agent.name, reason: noteText,
                    property_type: existing.type, location: existing.full_address || existing.locality,
                });
            }
        }

        res.json({ message: 'Inventory transferred', assigned_agent_id: to_agent_id, to_agent_name: targetAgent.name });
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#7' });
        logger.error('[Inventory Transfer] Error:', error);
        res.status(500).json({ error: 'Failed to transfer inventory' });
    }
});

// POST /inventory/:id/transfer-ownership
// Transfer property ownership from current owner to a new buyer contact (after deal close)
router.post('/:id/transfer-ownership', authMiddleware, checkPermission('manage_inventory'), async (req: any, res) => {
    try {
        const { id } = req.params;
        const { new_owner_phone, new_owner_name, reason, transaction_id } = req.body;

        if (!new_owner_phone) {
            return res.status(400).json({ error: 'new_owner_phone is required' });
        }

        const newPhone = normalizePhone(new_owner_phone);
        if (!newPhone) {
            return res.status(400).json({ error: 'Invalid phone number' });
        }

        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return res.status(500).json({ error: 'Tenant configuration missing' });

        const inventory = await prisma.inventory.findUnique({
            where: { id },
            include: { owner: true },
        });
        if (!inventory) return res.status(404).json({ error: 'Inventory not found' });

        const previousOwnerPhone = inventory.owner_phone;
        const previousOwnerName = (inventory.owner as any)?.name || null;

        // Upsert new owner as BUYER contact
        await prisma.contact.upsert({
            where: { phone_number: newPhone },
            update: {
                name: new_owner_name || undefined,
                contact_type: 'BUYER',
                last_channel: 'admin',
                last_interaction: new Date(),
            },
            create: {
                phone_number: newPhone,
                name: new_owner_name || null,
                source: 'admin_created',
                contact_type: 'BUYER',
                intent: 'buy',
                tenant_id: tenant.id,
                last_channel: 'admin',
                last_interaction: new Date(),
                created_by: req.agent?.id || null,
            },
        });

        // Ensure Owner record exists for new buyer
        const newOwnerId = await ensureOwner(newPhone, tenant.id);

        // Transfer inventory ownership
        const updated = await prisma.inventory.update({
            where: { id },
            data: {
                owner_phone: newPhone,
                owner_id: newOwnerId,
            },
        });

        const auditNote = [
            `Ownership transferred from ${previousOwnerName || previousOwnerPhone} (${previousOwnerPhone})`,
            `to ${new_owner_name || newPhone} (${newPhone})`,
            reason ? `Reason: ${reason}` : null,
        ].filter(Boolean).join('. ');

        const auditMeta = {
            inventory_id: id,
            previous_owner_phone: previousOwnerPhone,
            previous_owner_name: previousOwnerName,
            new_owner_phone: newPhone,
            new_owner_name: new_owner_name || null,
        };

        // Log to TransactionLog only if linked to a deal transaction
        if (transaction_id) {
            await prisma.transactionLog.create({
                data: {
                    transaction_id,
                    action: 'OWNERSHIP_TRANSFERRED',
                    performed_by: req.agent.id,
                    details: auditMeta,
                },
            });
        }

        // Always log as interaction on new owner contact
        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id,
                phone_number: newPhone,
                channel: 'admin',
                direction: 'inbound',
                event_type: 'ownership_transferred',
                content: auditNote,
                metadata: auditMeta,
            },
        });

        logger.info(`[TransferOwnership] Inventory ${id} transferred from ${previousOwnerPhone} to ${newPhone} by agent ${req.agent.id}`);
        res.json({
            success: true,
            message: `Ownership transferred to ${new_owner_name || newPhone}`,
            previous_owner_phone: previousOwnerPhone,
            new_owner_phone: newPhone,
            inventory: { id: updated.id, owner_phone: updated.owner_phone },
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#8' });
        logger.error('[TransferOwnership] Error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /inventory/:id/mark-sold — mark a listing SOLD; optionally record the new owner (buyer). (#10, 2026-07-25)
router.post('/:id/mark-sold', authMiddleware, checkPermission('edit_inventory'), async (req: any, res) => {
    try {
        const { id } = req.params;
        const { new_owner_phone, new_owner_name, final_price, reason } = req.body || {};
        const inv = await prisma.inventory.findUnique({ where: { id } });
        if (!inv) return res.status(404).json({ error: 'Inventory not found' });
        const data: any = { status: 'sold', updated_at: new Date() };
        if (new_owner_phone) {
            const newPhone = normalizePhone(new_owner_phone);
            if (!newPhone) return res.status(400).json({ error: 'Invalid new owner phone number' });
            const staff = await activeStaffOwnerName(newPhone);
            if (staff) return res.status(400).json({ error: `${staff} is a team member and cannot be set as the new owner. Enter the buyer's number.` });
            const tenant = await prisma.tenant.findFirst();
            if (!tenant) return res.status(500).json({ error: 'Tenant configuration missing' });
            await prisma.contact.upsert({
                where: { phone_number: newPhone },
                create: { phone_number: newPhone, tenant_id: tenant.id, name: new_owner_name || 'New Owner', source: 'system', contact_type: 'LANDLORD' },
                update: { name: new_owner_name || undefined },
            });
            data.owner_phone = newPhone;
            data.owner_id = await ensureOwner(newPhone, tenant.id);
            data.owner_contact_id = newPhone;
        }
        const updated = await prisma.inventory.update({ where: { id }, data });
        await prisma.interaction.create({ data: {
            tenant_id: inv.tenant_id, phone_number: updated.owner_phone, channel: 'system', direction: 'outbound',
            event_type: 'inventory_sold',
            content: `Property marked SOLD${new_owner_name ? ` — new owner ${new_owner_name}` : ''}${reason ? ` (${reason})` : ''}`,
            metadata: { property_id: id, final_price: final_price != null ? Number(final_price) : null, by_agent: req.agent!.id },
        } }).catch(() => {});
        logger.info(`[MarkSold] ${id} → sold by ${req.agent!.id}${data.owner_phone ? ` (new owner ${data.owner_phone})` : ''}`);
        res.json({ success: true, status: 'sold', new_owner_phone: data.owner_phone || null });
    } catch (e: any) {
        captureRouteError(e, req, { route: 'inventory#mark-sold' });
        logger.error('[MarkSold] Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /inventory/:id/mark-on-hold — set status on_hold + create a follow-up task for the listing agent. (#10, 2026-07-25)
router.post('/:id/mark-on-hold', authMiddleware, checkPermission('edit_inventory'), async (req: any, res) => {
    try {
        const { id } = req.params;
        const { follow_up_at, note } = req.body || {};
        const inv = await prisma.inventory.findUnique({ where: { id } });
        if (!inv) return res.status(404).json({ error: 'Inventory not found' });
        const due = follow_up_at ? new Date(follow_up_at) : new Date(Date.now() + 24 * 60 * 60 * 1000);
        if (isNaN(due.getTime())) return res.status(400).json({ error: 'Invalid follow_up_at date' });
        await prisma.inventory.update({ where: { id }, data: { status: 'on_hold', updated_at: new Date() } });
        const assignee = inv.assigned_agent_id || req.agent!.id;
        const label = inv.display_id || inv.apartment_name || inv.full_address || 'property';
        const task = await prisma.task.create({ data: {
            title: `Follow up on on-hold property ${label}`,
            description: note || null,
            assigned_to: assignee, due_date: due, priority: 'MEDIUM', status: 'TODO',
            task_type: 'GENERAL', property_id: id, tags: ['inventory', 'on-hold', 'follow-up'],
        } });
        await prisma.interaction.create({ data: {
            tenant_id: inv.tenant_id, phone_number: inv.owner_phone, channel: 'system', direction: 'outbound',
            event_type: 'inventory_on_hold',
            content: `Property marked ON HOLD — follow-up ${due.toLocaleString('en-IN')}${note ? ` (${note})` : ''}`,
            metadata: { property_id: id, task_id: task.id, by_agent: req.agent!.id },
        } }).catch(() => {});
        logger.info(`[MarkOnHold] ${id} → on_hold by ${req.agent!.id}, follow-up task ${task.id} @ ${due.toISOString()}`);
        res.json({ success: true, status: 'on_hold', task_id: task.id, due_date: due.toISOString() });
    } catch (e: any) {
        captureRouteError(e, req, { route: 'inventory#mark-on-hold' });
        logger.error('[MarkOnHold] Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /inventory/:id/approve — Approve a pending_approval inventory, notify partner via WhatsApp
router.post('/:id/approve', authMiddleware, checkPermission('edit_inventory'), async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await prisma.inventory.findUnique({
            where: { id },
            select: { id: true, status: true, display_id: true, uploader_phone: true, upload_source: true, full_address: true, location: true },
        });
        if (!existing) return res.status(404).json({ error: 'Inventory not found' });
        if (existing.upload_source === 'portal_crawl') {
            const harvested = await prisma.inventory.findFirst({ where: { id: String(id), tenant_id: req.agent!.tenant_id } });
            const teamIds = await getTeamIds(req.agent!);
            if (!harvested || (req.agent!.role !== 'super_boss' && !teamIds.includes(harvested.assigned_agent_id || harvested.uploaded_by_agent_id || ''))) return res.status(404).json({ error: 'Inventory not found' });
            const candidate = await prisma.portalListing.findFirst({ where: { inventory_id: String(id), tenant_id: req.agent!.tenant_id } });
            if (!candidate?.owner_call_verified_at) return res.status(409).json({ error: 'A recorded human owner call is required before approving harvested inventory' });
        }
        if (existing.status !== 'pending_approval') {
            return res.status(400).json({ error: `Cannot approve — current status is '${existing.status}'` });
        }

        await prisma.inventory.update({ where: { id }, data: { status: 'active' } });
        logger.info(`[Inventory] Approved ${id} (→ active) by agent ${req.agent!.id}`);

        syncInventoryById(id).catch(e => logger.warn('[Catalog] post-approve sync failed:', e.message));

        // Phase 9: broadcast newly-approved inventory to all QUALIFIED deals
        broadcastInventoryToQualifiedDeals(id).catch(e =>
            logger.warn('[InvBroadcast] Approve broadcast failed:', e.message)
        );
        // Phase D: alert the whole team about the newly-approved listing.
        broadcastNewInventoryToTeam(String(id)).catch(e =>
            logger.warn('[TeamInvBroadcast] Approve broadcast failed:', e.message)
        );

        // Notify partner agent via WhatsApp
        if (existing.uploader_phone) {
            const { WhatsAppService } = await import('../services/whatsapp');
            const wa = new WhatsAppService();
            const listingId = existing.display_id || id.substring(0, 8);
            const address = existing.full_address || existing.location || 'your property';
            await wa.sendText(
                existing.uploader_phone,
                `✅ *Your listing has been approved and is now LIVE!*\n\n` +
                `🏠 Property: ${address}\n` +
                `📋 Listing ID: *${listingId}*\n\n` +
                `Your property is now visible to buyers on Realty Pandit. 🎉\n\n` +
                `Type *upload property* to list another property.`,
            ).catch(err => logger.warn('[Inventory Approve] WhatsApp notify failed:', err));
        }

        // Notify via unified system (in-app + push for agents with admin panel access)
        if (existing.uploader_phone) {
            // Find the agent who uploaded (if internal)
            const uploaderAgent = await prisma.agent.findFirst({ where: { phone: { contains: existing.uploader_phone.replace('+91', '') } }, select: { id: true, phone: true, email: true, name: true } });
            if (uploaderAgent) {
                notify('inventory_approved', [{ id: uploaderAgent.id, type: 'agent', phone: uploaderAgent.phone, email: uploaderAgent.email || undefined, name: uploaderAgent.name }], {
                    inventory_id: id, display_id: existing.display_id, location: existing.full_address || existing.location,
                });
            }
        }

        // In-app partner-portal notification (bell) — if this listing came from a partner. (2026-07-12)
        try {
            if (existing.uploader_phone) {
                const pa = await prisma.partnerAgent.findFirst({ where: { phone_number: existing.uploader_phone }, select: { id: true } });
                if (pa) {
                    const { notifyPartnerInApp } = await import('../services/partner_inapp_notify');
                    await notifyPartnerInApp(pa.id, {
                        event: 'inventory_approved', category: 'inventory',
                        title: 'Listing approved ✅',
                        body: `Your listing ${existing.display_id || ''} is now live on Realty Pandit.`.replace(/\s+/g, ' ').trim(),
                        data: { inventory_id: id },
                    });
                }
            }
        } catch (e) { logger.warn('[Inventory Approve] partner in-app notify failed'); }

        res.json({ message: 'Inventory approved and is now live', id });
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#9' });
        logger.error('[Inventory Approve] Error:', error);
        res.status(500).json({ error: 'Failed to approve inventory' });
    }
});

// POST /inventory/:id/reject — Reject a pending_approval inventory, notify partner via WhatsApp
router.post('/:id/reject', authMiddleware, checkPermission('edit_inventory'), async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const existing = await prisma.inventory.findUnique({
            where: { id },
            select: { id: true, status: true, display_id: true, uploader_phone: true, full_address: true, location: true },
        });
        if (!existing) return res.status(404).json({ error: 'Inventory not found' });
        if (existing.status !== 'pending_approval') {
            return res.status(400).json({ error: `Cannot reject — current status is '${existing.status}'` });
        }

        await prisma.inventory.update({ where: { id }, data: { status: 'withdrawn' } });
        logger.info(`[Inventory] Rejected ${id} (→ withdrawn) by agent ${req.agent!.id}. Reason: ${reason || 'none'}`);

        deleteCatalogProduct(id).catch(e => logger.warn('[Catalog] post-reject delete failed:', e.message));

        // Notify partner agent via WhatsApp
        if (existing.uploader_phone) {
            const { WhatsAppService } = await import('../services/whatsapp');
            const wa = new WhatsAppService();
            const listingId = existing.display_id || id.substring(0, 8);
            const address = existing.full_address || existing.location || 'your property';
            const reasonLine = reason ? `\n\n📝 Reason: _${reason}_` : '';
            await wa.sendText(
                existing.uploader_phone,
                `❌ *Your listing could not be approved.*\n\n` +
                `🏠 Property: ${address}\n` +
                `📋 Listing ID: *${listingId}*${reasonLine}\n\n` +
                `Please contact your coordinator for more details or type *upload property* to submit again.`,
            ).catch(err => logger.warn('[Inventory Reject] WhatsApp notify failed:', err));
        }

        // Notify via unified system
        if (existing.uploader_phone) {
            const uploaderAgent = await prisma.agent.findFirst({ where: { phone: { contains: existing.uploader_phone.replace('+91', '') } }, select: { id: true, phone: true, email: true, name: true } });
            if (uploaderAgent) {
                notify('inventory_rejected', [{ id: uploaderAgent.id, type: 'agent', phone: uploaderAgent.phone, email: uploaderAgent.email || undefined, name: uploaderAgent.name }], {
                    inventory_id: id, display_id: existing.display_id, reason, location: existing.full_address || existing.location,
                });
            }
        }

        res.json({ message: 'Inventory rejected', id });
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#10' });
        logger.error('[Inventory Reject] Error:', error);
        res.status(500).json({ error: 'Failed to reject inventory' });
    }
});

// DELETE /inventory/:id - Soft-withdraw by default; hard-delete only when safe
// Requires delete_inventory permission. Mirrors PATCH edit guard (team ownership + partner guard).
// - If property has visits/deals -> soft withdraw (status='withdrawn'), keep history, remove from catalog
// - Else hard delete with cleanup of shares/saves/shortlists + catalog + uploads
router.delete('/:id', authMiddleware, checkPermission('delete_inventory'), async (req, res) => {
    try {
        const id = req.params.id as string;

        const existing = await prisma.inventory.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Inventory not found' });
        }

        // Partner write-guard: a partner may only mutate their OWN listing (same as PATCH)
        if (!(await partnerMayMutateInventory(req as any, res as any, id))) return;

        // Team ownership guard (same as PATCH): super_boss bypass, else must own via team
        {
            const me: any = req.agent!;
            if (me.role !== 'partner') {
                const editTeamIds = await getTeamIds(me);
                const canEdit = me.role === 'super_boss'
                    || editTeamIds.includes(existing.assigned_agent_id as string)
                    || editTeamIds.includes(existing.uploaded_by_agent_id as string);
                if (!canEdit) return res.status(403).json({ error: 'You can only delete listings owned by you or your team.' });
            }
        }

        // Already withdrawn -> treat as success (idempotent)
        if (existing.status === 'withdrawn') {
            return res.json({ message: 'Property already withdrawn', id, status: 'withdrawn', withdrawn: true });
        }

        // Check blocking relations that must never be hard-deleted (visit/deal = audit trail)
        const [visitCount, dealCount] = await Promise.all([
            prisma.appointment.count({ where: { property_id: id } }),
            prisma.transaction.count({ where: { inventory_id: id } }),
        ]);

        const hasBlockingHistory = visitCount > 0 || dealCount > 0;

        if (hasBlockingHistory) {
            // Soft-withdraw: keep row + history, hide from active catalog
            await prisma.inventory.update({
                where: { id },
                data: { status: 'withdrawn' },
            });
            deleteCatalogProduct(id).catch(e => logger.warn('[Catalog] post-withdraw delete failed:', e.message));
            cacheDel('cache:/public/featured*').catch(() => {});
            cacheDel('cache:/public/properties*').catch(() => {});
            logger.info(`[Inventory] Soft-withdrawn ${id} by agent ${(req as any).agent!.id} (visits:${visitCount} deals:${dealCount})`);
            return res.json({
                message: visitCount || dealCount
                    ? `Property has ${visitCount} visit(s) and ${dealCount} deal(s) — moved to Withdrawn instead of permanent delete. You can re-activate it later.`
                    : 'Property moved to Withdrawn',
                id,
                status: 'withdrawn',
                withdrawn: true,
                visitCount,
                dealCount,
            });
        }

        // No blocking history -> safe hard delete with cleanup of removable relations
        await prisma.$transaction(async (tx) => {
            // Removable relations without cascade (would otherwise P2003)
            await tx.propertyShare.deleteMany({ where: { inventory_id: id } });
            await tx.savedProperty.deleteMany({ where: { inventory_id: id } });
            await tx.leadPropertyShortlist.deleteMany({ where: { inventory_id: id } });
            // InventoryDocument cascades, Task SetNull, Appointment/Transaction already checked ==0
            await tx.inventory.delete({ where: { id } });
        });

        deleteCatalogProduct(id).catch(e => logger.warn('[Catalog] post-delete delete failed:', e.message));
        cacheDel('cache:/public/featured*').catch(() => {});
        cacheDel('cache:/public/properties*').catch(() => {});
        // Best-effort disk cleanup (uploads/properties/:id) - never fail the request
        try {
            const dir = path.join(process.cwd(), 'uploads', 'properties', id);
            if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
        } catch (e) {
            logger.warn(`[Inventory DELETE] disk cleanup failed for ${id}:`, e);
        }

        logger.info(`[Inventory] Hard-deleted ${id} by agent ${(req as any).agent!.id}`);
        res.json({ message: 'Inventory deleted successfully', id, status: 'deleted', withdrawn: false });
    } catch (error: any) {
        // Prisma FK violation fallback -> soft withdraw instead of 500
        if (error?.code === 'P2003' || String(error?.message || '').includes('Foreign key constraint')) {
            try {
                await prisma.inventory.update({ where: { id: req.params.id }, data: { status: 'withdrawn' } });
                deleteCatalogProduct(req.params.id).catch(() => {});
                logger.warn(`[Inventory DELETE] FK fallback soft-withdraw for ${req.params.id}`);
                return res.json({ message: 'Property has linked records — moved to Withdrawn instead of permanent delete.', id: req.params.id, status: 'withdrawn', withdrawn: true });
            } catch {}
        }
        captureRouteError(error, req, { route: 'inventory#11' });
        logger.error('[Inventory DELETE] Error:', error);
        const msg = error?.status === 403 || error?.statusCode === 403 ? error.message : 'Failed to delete inventory';
        res.status(error?.status || 500).json({ error: msg });
    }
});

// POST /inventory/session/start
router.post('/session/start', async (req, res) => {
    try {
        const { sessionId, intent } = req.body;
        const result = await stateMachine.startSession(sessionId, intent);
        res.json(result);
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#12' });
        logger.error(error);
        res.status(500).json({ error: 'Failed to start session' });
    }
});

// POST /inventory/step
router.post('/step', async (req, res) => {
    try {
        const { inventorySessionId, payload } = req.body;
        const result = await stateMachine.handleStep(inventorySessionId, payload);
        res.json(result);
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#13' });
        logger.error(error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /inventory/commit
router.post('/commit', async (req, res) => {
    try {
        const { inventorySessionId, confirmed, agentId } = req.body;
        if (!confirmed) return res.status(400).json({ error: "Context not confirmed" });

        const session = await sessionStore.getSession(inventorySessionId);
        if (!session) return res.status(404).json({ error: "Session not found" });

        logger.info("Committing Inventory to DB:", session.data);
        const data = session.data;

        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return res.status(500).json({ error: 'Tenant configuration missing' });

        // Get owner phone from session data (set by PartnerAgent/InventoryAgent)
        const ownerPhone = data.ownerPhone || inventorySessionId.replace('inv_', '');

        // Ensure Owner exists (creates Contact + Owner + Subscription if needed)
        const ownerId = await ensureOwner(ownerPhone, tenant.id);

        // Determine uploaded_by_agent_id from JWT, body, or session data
        const uploadedByAgentId = req.agent?.id || agentId || data.agentId || null;

        // Fold deprecated scalar fields into specs (single SoT). Mirror of admin POST path above.
        const chatSpecs: Record<string, any> = {};
        if (data.bedrooms != null && data.bedrooms !== '') chatSpecs.bedrooms = data.bedrooms;
        if (data.bathrooms != null && data.bathrooms !== '') chatSpecs.bathrooms = data.bathrooms;
        if (data.area != null && data.area !== '') chatSpecs.area = data.area;
        if (data.furnishing) chatSpecs.furnishing = data.furnishing;
        if (data.facing) chatSpecs.facing = data.facing;
        if (data.propertyAge) chatSpecs['age-of-construction'] = data.propertyAge;
        if (data.totalFloors) chatSpecs.floors = String(data.totalFloors);
        if (data.features && typeof data.features === 'object' && Object.keys(data.features).length > 0) {
            const AMENITY: Record<string, string> = { gym: 'Gym', club_house: 'Club House', power_backup: 'Power Backup', lift: 'Lift', intercom: 'Intercom', guest_house: 'Guest House', park: 'Park', community_hall: 'Community Hall', mini_theater: 'Mini Theater', swimming_pool: 'Swimming Pool', security: 'Security', gas_pipeline: 'Gas Pipeline', parking: 'Parking', garden: 'Garden', pool: 'Swimming Pool', water_supply: 'Water Supply' };
            const labels = Object.entries(data.features as Record<string, any>).filter(([, v]) => v).map(([k]) => AMENITY[k] || k);
            if (labels.length) chatSpecs.amenities = labels;
        }

        const inventory = await prisma.inventory.create({
            data: {
                tenant_id: tenant.id,
                owner_id: ownerId,
                owner_phone: ownerPhone,
                category: data.category || 'residential',
                type: data.type || 'flat',
                intent: data.intent || 'sell',
                location: data.location || data.locationText || null,
                specs: Object.keys(chatSpecs).length > 0 ? chatSpecs : undefined,
                price: data.price ? parseFloat(data.price) : null,
                status: 'active',
                media_urls: [],
                uploaded_by_agent_id: uploadedByAgentId,
                assigned_agent_id: uploadedByAgentId || undefined,

                // Classification IDs (from DB-driven WhatsApp flow)
                category_id: data.categoryId || undefined,
                sub_category_id: data.subCategoryId || undefined,
                type_id: data.typeId || undefined,
                configuration_id: data.configurationId || undefined,

                // Key holder
                key_holder_type: data.key_holder_type || undefined,
                key_holder_name: data.key_holder_name || undefined,
                key_holder_phone: data.key_holder_phone || undefined,

                // Property details (only non-deprecated columns)
                description: data.description || undefined,
                floor_number: data.floorNumber ? parseInt(data.floorNumber) : undefined,
            }
        });

        // Team "new inventory" broadcast now fires CENTRALLY from the db.ts inventory.create
        // extension (covers this /commit path + the wizard + bulk import + public + AI, idempotent)
        // — no per-route call needed here. (2026-07-10, supersedes the incomplete #7 2026-07-01 fix)

        // Log event
        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id,
                channel: 'whatsapp',
                direction: 'inbound',
                event_type: 'inventory_commit',
                content: `Created Inventory ID: ${inventory.id} — ${data.type || 'property'} in ${data.location || 'unknown'}`,
                phone_number: ownerPhone,
            }
        });

        // Clear inventory session
        await sessionStore.deleteSession(inventorySessionId);

        res.json({
            status: "CREATED",
            inventory_id: inventory.id,
            reply: {
                text: "✅ Aapki property successfully onboard ho gayi hai! Panditji ab iske liye buyers dhundhega.",
                language: "hinglish"
            }
        });

    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#14' });
        logger.error('[Inventory Commit]', error);
        res.status(500).json({ error: 'Commit failed' });
    }
});

// POST /inventory/:id/upload - Upload property images and videos (max 20 files)
router.post('/:id/upload', uploadMedia, async (req, res) => {
    try {
        const id = req.params.id as string;
        const files = req.files as Express.Multer.File[];

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const inventory = await prisma.inventory.findUnique({ where: { id } });
        if (!inventory) {
            return res.status(404).json({ error: 'Inventory not found' });
        }

        const imageResults = [];
        const newVideoUrls: string[] = [];

        for (const file of files) {
            if (isVideoUpload(file)) {
                // Move the already-on-disk temp file into place — no buffering, any size.
                const videoDir = path.join(process.cwd(), 'uploads', 'properties', id);
                fs.mkdirSync(videoDir, { recursive: true });
                const ext = (file.originalname.split('.').pop() || 'mp4').toLowerCase();
                const filename = `${Date.now()}-video.${ext}`;
                fs.renameSync(file.path, path.join(videoDir, filename));
                newVideoUrls.push(`/uploads/properties/${id}/${filename}`);
                // 2026-07-29: HEVC/iPhone videos don't play in Chrome/FF — transcode to H.264 in the
                // background (non-blocking; website falls back to photos until it finishes).
                void ensureH264Playable(path.join(videoDir, filename));
            } else {
                const result = await storageService.uploadImage(file, id);
                imageResults.push(result);
            }
        }

        const newImageUrls = imageResults.map(r => r.original);
        const updatedMediaUrls = [...(inventory.media_urls || []), ...newImageUrls];
        const updatedVideoUrls = [...(inventory.video_urls || []), ...newVideoUrls];
        const mediaScore = (updatedVideoUrls.length > 0 && updatedMediaUrls.length > 0) ? 2
            : (updatedMediaUrls.length > 0) ? 1 : 0;

        await prisma.inventory.update({
            where: { id },
            data: { media_urls: updatedMediaUrls, video_urls: updatedVideoUrls, media_score: mediaScore }
        });

        res.json({
            message: `${files.length} file(s) uploaded successfully (${imageResults.length} images, ${newVideoUrls.length} videos)`,
            uploaded: imageResults,
            video_urls: newVideoUrls,
            total_media: updatedMediaUrls.length,
            total_videos: updatedVideoUrls.length,
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#15' });
        logger.error('[Upload] Error:', error);
        res.status(500).json({ error: (error as Error).message });
    } finally {
        // diskStorage writes every upload to uploads/tmp first. Videos are renamed out of there,
        // but images are only READ by sharp — without this they accumulate forever. Also covers
        // the error path, where nothing was moved at all. (2026-08-11)
        for (const f of ((req.files as Express.Multer.File[]) || [])) {
            try {
                if (f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
            } catch (e) {
                logger.warn(`[Upload] temp files left behind: ${f.path} — ${(e as Error).message}`);
            }
        }
    }
});

// DELETE /inventory/:id/media/:filename - Remove a media file (image or video)
router.delete('/:id/media/:filename', async (req, res) => {
    try {
        const id = req.params.id as string;
        const filename = req.params.filename as string;

        const inventory = await prisma.inventory.findUnique({ where: { id } });
        if (!inventory) {
            return res.status(404).json({ error: 'Inventory not found' });
        }

        const isVideo = /\.(mp4|mov|webm|avi)$/i.test(filename);

        // Remove from disk
        if (isVideo) {
            const filePath = path.join(process.cwd(), 'uploads', 'properties', id, filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } else {
            await storageService.deleteMedia(id, filename);
        }

        // Update the appropriate URL array
        if (isVideo) {
            const updatedVideoUrls = (inventory.video_urls || []).filter(
                url => !url.includes(filename)
            );
            const mediaScore = (updatedVideoUrls.length > 0 && (inventory.media_urls || []).length > 0) ? 2
                : ((inventory.media_urls || []).length > 0) ? 1 : 0;
            await prisma.inventory.update({
                where: { id },
                data: { video_urls: updatedVideoUrls, media_score: mediaScore }
            });
            res.json({ message: 'Video deleted', total_videos: updatedVideoUrls.length });
        } else {
            const updatedUrls = (inventory.media_urls || []).filter(
                url => !url.includes(filename.replace(/\.(webp|jpg|jpeg|png)$/, ''))
            );
            const mediaScore = ((inventory.video_urls || []).length > 0 && updatedUrls.length > 0) ? 2
                : (updatedUrls.length > 0) ? 1 : 0;
            await prisma.inventory.update({
                where: { id },
                data: { media_urls: updatedUrls, media_score: mediaScore }
            });
            res.json({ message: 'Media deleted', total_media: updatedUrls.length });
        }
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#16' });
        logger.error('[Delete Media] Error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /inventory/:id/media - List all media for a property
router.get('/:id/media', async (req, res) => {
    try {
        const id = req.params.id as string;
        const inventory = await prisma.inventory.findUnique({
            where: { id },
            select: { media_urls: true }
        });

        if (!inventory) {
            return res.status(404).json({ error: 'Inventory not found' });
        }

        // Generate thumbnail URLs from originals
        const media = (inventory.media_urls || []).map(url => ({
            original: url,
            medium: url.replace('.webp', '_medium.webp'),
            thumbnail: url.replace('.webp', '_thumb.webp')
        }));

        res.json({ media, count: media.length });
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#17' });
        logger.error('[List Media] Error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /inventory/:id/brochure.pdf?variant=brandless&token=...&pn=&pp=
// PUBLIC, token-gated. The share recipient (or a dealer's forwarded buyer) opens
// this directly — no admin login. The HMAC token binds inventory id + variant +
// expiry, so a leaked link can't be re-pointed to another listing or variant.
router.get('/:id/brochure.pdf', async (req: any, res) => {
    try {
        const id = req.params.id as string;
        const variant: 'branded' | 'brandless' = req.query.variant === 'branded' ? 'branded' : 'brandless';
        const { verifyPdfToken } = await import('../utils/pdf_token');
        if (!verifyPdfToken(id, variant, String(req.query.token || ''))) {
            return res.status(403).send('Invalid or expired link');
        }
        const inv = await prisma.inventory.findUnique({
            where: { id },
            select: {
                id: true, display_id: true, type: true, category: true, intent: true,
                specs: true, floor_number: true,
                flat_no: true, plot_no: true, apartment_name: true, full_address: true,
                location: true, locality: true, sub_locality: true, city: true,
                district: true, state: true, price: true, display_price: true,
                customer_price: true, price_unit: true, description: true,
                media_urls: true, owner_phone: true,
            },
        });
        if (!inv) return res.status(404).send('Property not found');

        const { generateInventoryPdfStream, brochureFilename } = await import('../services/pdf_generator');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${brochureFilename(inv as any)}"`);
        (await generateInventoryPdfStream([inv as any], {
            variant,
            partnerName: req.query.pn ? String(req.query.pn) : undefined,
            partnerPhone: req.query.pp ? String(req.query.pp) : undefined,
        })).pipe(res);
    } catch (err) {
        captureRouteError(err, req, { route: 'inventory#brochure-pdf' });
        logger.error('[BrochurePdf] Error:', err);
        if (!res.headersSent) res.status(500).send('Could not generate brochure');
    }
});

// GET /inventory/:id/wa-image.jpg?src=/uploads/...&token=...
// PUBLIC, token-gated. CRM photos are stored as WebP, which WhatsApp rejects for image
// messages (JPEG/PNG only) — Meta fetches this JPEG copy instead. The token binds
// inventory id + src path + expiry (signed by property_sharing.whatsappImageUrl), so this
// can't be used to convert arbitrary files.
router.get('/:id/wa-image.jpg', async (req: any, res) => {
    try {
        const id = req.params.id as string;
        const src = String(req.query.src || '');
        const { verifyPdfToken } = await import('../utils/pdf_token');
        if (!src.startsWith('/uploads/') || src.includes('..') || !verifyPdfToken(id, `wa-jpeg:${src}`, String(req.query.token || ''))) {
            return res.status(403).send('Invalid or expired link');
        }
        const { resolveMediaPath, resizeImageForPdf } = await import('../services/pdf_generator');
        const abs = resolveMediaPath(src);
        if (!abs) return res.status(404).send('Image not found');
        const jpeg = await resizeImageForPdf(abs);
        if (typeof jpeg === 'string') return res.status(500).send('Could not convert image');
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(jpeg);
    } catch (err) {
        captureRouteError(err, req, { route: 'inventory#wa-image' });
        logger.error('[WaImage] Error:', err);
        if (!res.headersSent) res.status(500).send('Could not convert image');
    }
});

// ================================================================
// ENRICHMENT ENDPOINTS (v3 - Post-save optional details)
// ================================================================

import { ENRICHMENT_STEPS, ENRICHMENT_GROUPS } from '../workflows/workflow_definition';
import { WorkflowEngine } from '../workflows/workflow_engine';
import { captureRouteError } from '../utils/capture';

const enrichmentEngine = new WorkflowEngine(ENRICHMENT_STEPS);

/**
 * GET /inventory/:id/enrichment
 * Returns enrichment step definitions + current inventory values.
 */
// ─── GET /api/inventory/:id/contacts — Owner, key holder, assigned agent ────
router.get('/:id/contacts', authMiddleware, async (req, res) => {
    try {
        const inv = await prisma.inventory.findUnique({
            where: { id: req.params.id },
            select: {
                owner_phone: true,
                contact: { select: { name: true, phone_number: true } },
                key_holder_name: true,
                key_holder_phone: true,
                key_holder_contact: { select: { name: true, phone_number: true } },
                assigned_agent: { select: { id: true, name: true, phone: true, role: true } },
            },
        });
        if (!inv) return res.status(404).json({ success: false, error: 'Inventory not found' });

        // Privacy (2026-06-12, owner-confirmed): only super_boss + manager get the OWNER /
        // KEY-HOLDER direct contact. Everyone else coordinates through their inventory manager,
        // so we null those out server-side (the UI also hides them — defense in depth).
        const role = req.agent?.role;
        const fullAccess = role === 'super_boss' || role === 'manager';

        res.json({
            success: true,
            data: {
                owner: fullAccess ? {
                    name: inv.contact?.name ?? null,
                    phone: inv.owner_phone,
                } : null,
                key_holder: fullAccess ? {
                    name: inv.key_holder_name ?? inv.key_holder_contact?.name ?? null,
                    phone: inv.key_holder_phone ?? inv.key_holder_contact?.phone_number ?? null,
                } : null,
                assigned_agent: inv.assigned_agent ?? null,
                contact_private: !fullAccess,
            },
        });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'inventory#18' });
        logger.error('[InventoryAPI] Contacts error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/:id/enrichment', authMiddleware, async (req, res) => {
    try {
        const inventory = await prisma.inventory.findUnique({
            where: { id: req.params.id },
            include: { documents: true },
        });
        if (!inventory) {
            return res.status(404).json({ error: 'Inventory not found' });
        }

        // Map current inventory values to answer format for pre-filling
        const current: Record<string, any> = {};

        // Pricing
        if (inventory.customer_price) current.customer_price = Number(inventory.customer_price);
        if (inventory.display_price) current.display_price = Number(inventory.display_price);

        // Features/amenities
        if (inventory.features) current.features = inventory.features;

        // Specs
        const specs = (inventory.specs as Record<string, any>) || {};
        if (specs.bathrooms) current.bathrooms = specs.bathrooms;
        if (specs.area) current.area = specs.area;
        if (specs.area_unit) current.area_unit = specs.area_unit;

        // Details
        if (inventory.furnishing) current.furnishing = inventory.furnishing;
        if (inventory.facing) current.facing = inventory.facing;
        if (inventory.total_floors) current.total_floors = inventory.total_floors;
        if (inventory.property_age) current.property_age = inventory.property_age;
        if (inventory.description) current.description = inventory.description;
        if (inventory.lead_reference) current.lead_reference = inventory.lead_reference;

        // Ownership
        if (inventory.ownership_type) current.ownership_type = inventory.ownership_type;

        // Pass through classification for conditional enrichment steps
        if (inventory.flat_property_type_id) current.flat_property_type_id = inventory.flat_property_type_id;
        if (inventory.category) current.main_category = inventory.category;

        res.json({
            steps: ENRICHMENT_STEPS,
            groups: ENRICHMENT_GROUPS,
            current,
            completion_pct: inventory.completion_pct,
            display_id: inventory.display_id,
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#19' });
        logger.error('[Enrichment GET] Error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

/**
 * PATCH /inventory/:id/enrich
 * Update specific enrichment fields on an existing inventory.
 */
router.patch('/:id/enrich', authMiddleware, async (req, res) => {
    try {
        const { fields } = req.body as { fields: Record<string, any> };
        if (!fields || typeof fields !== 'object') {
            return res.status(400).json({ error: 'fields object is required' });
        }

        const inventory = await prisma.inventory.findUnique({
            where: { id: req.params.id },
        });
        if (!inventory) {
            return res.status(404).json({ error: 'Inventory not found' });
        }

        // Build update data from enrichment fields
        const updateData: Record<string, any> = {};
        const currentSpecs = (inventory.specs as Record<string, any>) || {};
        const newSpecs = { ...currentSpecs };
        let specsChanged = false;

        // Pricing
        if (fields.customer_price !== undefined) {
            updateData.customer_price = parseFloat(fields.customer_price) || null;
            updateData.price = updateData.customer_price; // Legacy
            if (!fields.display_price && !inventory.display_price) {
                updateData.display_price = updateData.customer_price;
            }
        }
        if (fields.display_price !== undefined) {
            updateData.display_price = parseFloat(fields.display_price) || null;
        }

        // Features/amenities → specs.amenities (the `features` column was dropped 2026-05-28).
        if (fields.features !== undefined) {
            let amenities: string[] = [];
            if (Array.isArray(fields.features)) {
                amenities = fields.features.filter(Boolean).map(String);
            } else if (typeof fields.features === 'object' && fields.features) {
                amenities = Object.entries(fields.features).filter(([, v]) => v).map(([k]) => k);
            }
            if (amenities.length) { newSpecs.amenities = amenities; specsChanged = true; }
        }

        // Specs fields
        if (fields.bathrooms !== undefined) {
            newSpecs.bathrooms = parseInt(fields.bathrooms);
            specsChanged = true;
        }
        if (fields.area !== undefined) {
            newSpecs.area = parseFloat(fields.area);
            specsChanged = true;
        }
        if (fields.area_unit !== undefined) {
            newSpecs.area_unit = fields.area_unit;
            specsChanged = true;
        }
        if (fields.carpet_area !== undefined) {
            newSpecs.carpet_area = parseFloat(fields.carpet_area);
            specsChanged = true;
        }
        if (fields.carpet_area_unit !== undefined) {
            newSpecs.carpet_area_unit = fields.carpet_area_unit;
            specsChanged = true;
        }

        // Direct detail fields — furnishing/facing/total_floors/property_age/features COLUMNS
        // were dropped (2026-05-28); fold into specs.* instead of writing the columns (which
        // would throw `Unknown argument`). See [[reference_inventory_specs_sot]].
        if (fields.furnishing !== undefined) { newSpecs.furnishing = fields.furnishing; specsChanged = true; }
        if (fields.facing !== undefined) { newSpecs.facing = fields.facing; specsChanged = true; }
        if (fields.total_floors !== undefined) { newSpecs.floors = parseInt(fields.total_floors) || undefined; specsChanged = true; }
        if (fields.property_age !== undefined) { newSpecs['age-of-construction'] = fields.property_age; specsChanged = true; }
        if (fields.lift_available === 'yes') {
            const amen = new Set<string>(Array.isArray(newSpecs.amenities) ? newSpecs.amenities : []);
            amen.add('Lift');
            newSpecs.amenities = Array.from(amen);
            specsChanged = true;
        }

        if (specsChanged) updateData.specs = newSpecs;

        if (fields.description !== undefined) updateData.description = fields.description;
        if (fields.lead_reference !== undefined) updateData.lead_reference = fields.lead_reference;

        // Ownership enrichment
        if (fields.ownership_type !== undefined) {
            updateData.ownership_type = fields.ownership_type;
        }

        // Calculate new completion percentage
        // Merge current inventory answers with new fields
        const mergedAnswers: Record<string, any> = {
            user_role: inventory.ownership_type || 'OWNER',
            uploader_name: inventory.uploader_name,
            uploader_phone: inventory.uploader_phone,
            intent: inventory.intent,
            main_category: inventory.category,
            flat_property_type_id: inventory.flat_property_type_id,
            configuration_id: inventory.configuration_id,
            address_block: { locality: inventory.locality, city: inventory.city },
            key_holder_type: inventory.key_holder_type,
            customer_price: updateData.customer_price ?? (inventory.customer_price ? Number(inventory.customer_price) : undefined),
            // furnishing/facing/total_floors/property_age/features live in specs.* now (cols dropped).
            features: newSpecs.amenities ?? currentSpecs.amenities,
            bathrooms: newSpecs.bathrooms ?? currentSpecs.bathrooms,
            area: newSpecs.area ?? currentSpecs.area,
            furnishing: newSpecs.furnishing ?? currentSpecs.furnishing,
            facing: newSpecs.facing ?? currentSpecs.facing,
            description: updateData.description ?? inventory.description,
            photos: inventory.media_urls,
            total_floors: newSpecs.floors ?? currentSpecs.floors,
            property_age: newSpecs['age-of-construction'] ?? currentSpecs['age-of-construction'],
        };

        // Simple completion calc
        const allFields = Object.keys(mergedAnswers);
        const filled = allFields.filter(f => {
            const v = mergedAnswers[f];
            if (v === undefined || v === null || v === '') return false;
            if (Array.isArray(v) && v.length === 0) return false;
            return true;
        }).length;
        const newCompletionPct = Math.round((filled / allFields.length) * 100);

        updateData.completion_pct = newCompletionPct;
        updateData.is_enriched = newCompletionPct > 50;
        updateData.updated_at = new Date();

        await prisma.inventory.update({
            where: { id: req.params.id },
            data: updateData,
        });

        res.json({
            success: true,
            completion_pct: newCompletionPct,
            is_enriched: updateData.is_enriched,
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#20' });
        logger.error('[Enrichment PATCH] Error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── Document Management ─────────────────────────────────────────────────────

/**
 * Document access guard (2026-08-11, owner-set rule).
 *
 * A property document - title deed, registry, NOC - may be viewed, downloaded,
 * uploaded, renamed, deleted or shared ONLY by:
 *   - super_boss, or
 *   - the listing's own agent (its assigned OR uploading agent).
 * A manager inherits their direct reports' listings because getTeamIds() returns
 * [self, ...reports]. This mirrors the PATCH /:id edit guard above - keep the two
 * in step if either changes.
 *
 * External partner agents get NOTHING here, even on their own listing: documents are
 * the owner's paperwork, not marketing material. partnerMayMutateInventory() runs
 * first on the write paths and is deliberately NOT sufficient on its own.
 *
 * Responds 403/404 and returns false when denied - same shape as
 * partnerMayMutateInventory, so each call site stays one line.
 */
async function mayAccessDocuments(req: any, res: any, inventoryId: string | string[]): Promise<boolean> {
    const me = req.agent!;
    const invId = Array.isArray(inventoryId) ? inventoryId[0] : inventoryId;
    const inv = await prisma.inventory.findUnique({
        where: { id: invId },
        select: { id: true, assigned_agent_id: true, uploaded_by_agent_id: true },
    });
    if (!inv) {
        res.status(404).json({ error: "Inventory not found" });
        return false;
    }
    if (me.role === "super_boss") return true;
    if (me.role === "partner") {
        res.status(403).json({ error: "Property documents are not available to partner agents." });
        return false;
    }
    const teamIds = await getTeamIds(me);
    const owners = [inv.assigned_agent_id, inv.uploaded_by_agent_id].filter((id): id is string => !!id);
    if (owners.some((id) => teamIds.includes(id))) return true;
    res.status(403).json({ error: "Only the property's assigned manager or a super boss can access its documents." });
    return false;
}

// Multer config for document uploads (PDF, images, Word, Excel)
const DOC_MAX_MB = 20;
const DOC_MIMES = [
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const DOC_EXTS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx', '.xls', '.xlsx'];

const docUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: DOC_MAX_MB * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const mt = (file.mimetype || '').toLowerCase();
        const ext = extOf(file.originalname);
        if (DOC_MIMES.includes(mt)) return cb(null, true);
        // Android pickers hand over a perfectly good PDF as application/octet-stream (or with
        // no mimetype at all) - trust a known document extension instead. Exactly the rule the
        // media route needed in cde4667; documents had the same bug.
        if ((!mt || mt === 'application/octet-stream') && DOC_EXTS.includes(ext)) return cb(null, true);
        cb(new Error(`"${file.originalname}" is not a supported document. Please upload a PDF, a photo (JPG, PNG, WebP), or a Word or Excel file.`));
    },
});

/**
 * multer wrapper that turns a document-upload rejection into a readable 400.
 *
 * Without it the fileFilter error escapes unhandled: the user is told "Internal server
 * error" with no idea what was wrong, and every rejected file fires a false
 * [Alert:CRITICAL] server_5xx. Same fix as uploadMedia above. (2026-08-11)
 */
const uploadDocument = (req: any, res: any, next: any) => {
    docUpload.single('document')(req, res, (err: any) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: `That document is too large. The maximum is ${DOC_MAX_MB} MB.` });
        }
        logger.warn(`[Documents] upload rejected: ${err.message}`);
        return res.status(400).json({ error: err.message || 'Upload failed' });
    });
};

/**
 * POST /inventory/:id/documents
 * Upload a document and attach it to an inventory item.
 */
router.post('/:id/documents', authMiddleware, checkPermission('edit_inventory'), uploadDocument, async (req, res) => {
    try {
        const inventoryId = req.params.id as string;
        // Partner write-guard: a partner may only mutate their OWN listing.
        if (!(await partnerMayMutateInventory(req, res, inventoryId))) return;
        if (!(await mayAccessDocuments(req, res, inventoryId))) return;
        const file = req.file;
        const { doc_type, title } = req.body;

        if (!file) {
            return res.status(400).json({ error: 'No document file provided' });
        }
        if (!doc_type) {
            return res.status(400).json({ error: 'doc_type is required' });
        }

        const inventory = await prisma.inventory.findUnique({ where: { id: inventoryId } });
        if (!inventory) {
            return res.status(404).json({ error: 'Inventory not found' });
        }

        // Save file to disk
        const docDir = path.join(process.cwd(), 'uploads', 'properties', inventoryId, 'documents');
        fs.mkdirSync(docDir, { recursive: true });
        const ext = (file.originalname.split('.').pop() || 'pdf').toLowerCase();
        const filename = `${Date.now()}-${doc_type}.${ext}`;
        fs.writeFileSync(path.join(docDir, filename), file.buffer);

        const fileUrl = `/uploads/properties/${inventoryId}/documents/${filename}`;

        // Create InventoryDocument record
        const doc = await prisma.inventoryDocument.create({
            data: {
                inventory_id: inventoryId,
                doc_type,
                title: title || file.originalname,
                file_url: fileUrl,
                file_name: file.originalname,
                mime_type: file.mimetype,
                file_size: file.size,
                uploaded_via: 'admin',
            },
        });

        // Recalculate completion_pct (documents is a scored field)
        const docCount = await prisma.inventoryDocument.count({ where: { inventory_id: inventoryId } });
        const currentPct = inventory.completion_pct || 0;
        // If docs were previously 0 and now > 0, add ~5% (1/19 fields ≈ 5.3%)
        if (docCount === 1 && currentPct > 0) {
            const newPct = Math.min(100, currentPct + 5);
            await prisma.inventory.update({
                where: { id: inventoryId },
                data: { completion_pct: newPct },
            });
        }

        logger.info(`[Documents] Uploaded ${doc.id} for inventory ${inventoryId}`);
        res.status(201).json(doc);
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#21' });
        logger.error('[Documents POST] Error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

/**
 * DELETE /inventory/:id/documents/:docId
 * Remove a document from an inventory item.
 */
router.delete('/:id/documents/:docId', authMiddleware, checkPermission('edit_inventory'), async (req, res) => {
    try {
        const { id: inventoryId, docId } = req.params;
        // Partner write-guard: a partner may only mutate their OWN listing.
        if (!(await partnerMayMutateInventory(req, res, inventoryId))) return;
        if (!(await mayAccessDocuments(req, res, inventoryId))) return;

        const doc = await prisma.inventoryDocument.findUnique({ where: { id: docId } });
        if (!doc || doc.inventory_id !== inventoryId) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Delete file from disk
        const filePath = path.join(process.cwd(), doc.file_url);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Delete record
        await prisma.inventoryDocument.delete({ where: { id: docId } });

        // Recalculate completion — if no docs left, reduce by ~5%
        const remaining = await prisma.inventoryDocument.count({ where: { inventory_id: inventoryId } });
        if (remaining === 0) {
            const inventory = await prisma.inventory.findUnique({ where: { id: inventoryId } });
            if (inventory && inventory.completion_pct > 0) {
                await prisma.inventory.update({
                    where: { id: inventoryId },
                    data: { completion_pct: Math.max(0, inventory.completion_pct - 5) },
                });
            }
        }

        logger.info(`[Documents] Deleted ${docId} from inventory ${inventoryId}`);
        res.json({ success: true });
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#22' });
        logger.error('[Documents DELETE] Error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

/**
 * PATCH /inventory/:id/documents/:docId
 * Rename a document's title/label (so the team can label docs to remember them). (2026-07-09)
 */
router.patch('/:id/documents/:docId', authMiddleware, checkPermission('edit_inventory'), async (req, res) => {
    try {
        const { id: inventoryId, docId } = req.params;
        // Partner write-guard: a partner may only mutate their OWN listing.
        if (!(await partnerMayMutateInventory(req, res, inventoryId))) return;
        if (!(await mayAccessDocuments(req, res, inventoryId))) return;
        const title = (req.body?.title ?? '').toString().trim();
        if (!title) {
            return res.status(400).json({ error: 'title is required' });
        }
        const doc = await prisma.inventoryDocument.findUnique({ where: { id: docId } });
        if (!doc || doc.inventory_id !== inventoryId) {
            return res.status(404).json({ error: 'Document not found' });
        }
        const updated = await prisma.inventoryDocument.update({
            where: { id: docId },
            data: { title },
        });
        logger.info(`[Documents] Renamed ${docId} on inventory ${inventoryId} → "${title}"`);
        res.json(updated);
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#doc-rename' });
        logger.error('[Documents PATCH] Error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

/**
 * GET /inventory/:id/documents/:docId/download
 *   ?thumb=1   serve the *_thumb.* preview instead of the original (for <img> in the tab)
 *   ?inline=1  render in the browser instead of forcing a save dialog
 *
 * The ONLY way to read a property document: the raw /uploads path is blocked in app.ts
 * because documents are owner paperwork. Same rule as every other document route -
 * super_boss or the listing's own agent.
 */
router.get('/:id/documents/:docId/download', authMiddleware, async (req, res) => {
    try {
        const { id: inventoryId, docId } = req.params;
        if (!(await mayAccessDocuments(req, res, inventoryId))) return;

        const doc = await prisma.inventoryDocument.findUnique({ where: { id: String(docId) } });
        if (!doc || doc.inventory_id !== inventoryId) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // file_url is app-relative ('/uploads/properties/<id>/documents/<file>'). Resolve it
        // and refuse anything that escapes uploads/ - the value is DB-held, but a traversal
        // here would read arbitrary server files.
        const uploadsRoot = path.resolve(process.cwd(), 'uploads');
        let abs = path.resolve(process.cwd(), String(doc.file_url).replace(/^\/+/, ''));
        const wantThumb = req.query.thumb === '1';
        if (wantThumb) {
            const t = abs.replace(/(\.[^.]+)$/, '_thumb$1');
            if (fs.existsSync(t)) abs = t;
        }
        if (abs !== uploadsRoot && !abs.startsWith(uploadsRoot + path.sep)) {
            return res.status(400).json({ error: 'Invalid document path' });
        }
        if (!fs.existsSync(abs)) {
            logger.warn(`[Documents] Record ${docId} points at a missing file: ${abs}`);
            return res.status(404).json({ error: 'File is missing on the server' });
        }

        if (wantThumb) {
            res.type(path.extname(abs) || '.jpg');
            res.setHeader('Content-Disposition', 'inline');
        } else {
            if (doc.mime_type) res.type(doc.mime_type);
            const name = String(doc.file_name || 'document');
            const disp = req.query.inline === '1' ? 'inline' : 'attachment';
            res.setHeader(
                'Content-Disposition',
                `${disp}; filename="${name.replace(/["\r\n]/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
            );
        }
        // Never let a shared cache hold owner paperwork.
        res.setHeader('Cache-Control', 'private, no-store');
        fs.createReadStream(abs).pipe(res);
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#doc-download' });
        logger.error(error);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to fetch document' });
    }
});

// GET /inventory/:id/documents/:docId/public?token=...
// PUBLIC, token-gated - the customer or dealer who was sent this document opens it with
// no admin login. The raw /uploads path is blocked, so this is the only public door, and
// the HMAC token binds the DOCUMENT id + an expiry: a forwarded link dies on its own and
// cannot be re-pointed at another document. Same scheme as the brochure PDFs above.
router.get('/:id/documents/:docId/public', async (req: any, res) => {
    try {
        const { id: inventoryId, docId } = req.params;
        const { verifyPdfToken } = await import('../utils/pdf_token');
        if (!verifyPdfToken(String(docId), 'document', String(req.query.token || ''))) {
            return res.status(403).send('This document link has expired. Please ask for a new one.');
        }
        const doc = await prisma.inventoryDocument.findUnique({ where: { id: String(docId) } });
        if (!doc || doc.inventory_id !== inventoryId) return res.status(404).send('Document not found');

        const uploadsRoot = path.resolve(process.cwd(), 'uploads');
        const abs = path.resolve(process.cwd(), String(doc.file_url).replace(/^\/+/, ''));
        if (abs !== uploadsRoot && !abs.startsWith(uploadsRoot + path.sep)) {
            return res.status(400).send('Invalid document path');
        }
        if (!fs.existsSync(abs)) return res.status(404).send('File is missing on the server');

        if (doc.mime_type) res.type(doc.mime_type);
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Cache-Control', 'private, no-store');
        fs.createReadStream(abs).pipe(res);
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#doc-public' });
        logger.error(error);
        if (!res.headersSent) res.status(500).send('Failed to fetch document');
    }
});

// POST /inventory/:id/documents/:docId/share — share ONE inventory document to a contact as a link,
// via WhatsApp (rp_document_share template, falls back to in-window text) and/or email. Gated to
// edit_inventory (inventory manager / manager / super_boss) — the roles that can edit inventory. (#8, 2026-07-09)
router.post('/:id/documents/:docId/share', authMiddleware, checkPermission('edit_inventory'), async (req, res) => {
    try {
        const { id: inventoryId, docId } = req.params;
        // Partner write-guard: a partner may only mutate their OWN listing.
        if (!(await partnerMayMutateInventory(req, res, inventoryId))) return;
        if (!(await mayAccessDocuments(req, res, inventoryId))) return;
        const agent = req.agent!;
        const phoneRaw = (req.body?.contact_phone ?? '').toString().trim();
        const email = (req.body?.email ?? '').toString().trim();
        const contactName = (req.body?.contact_name ?? '').toString().trim() || null;
        const channelsIn: string[] = Array.isArray(req.body?.channels) ? req.body.channels : [];
        // Default to sending on whichever identifier(s) were supplied.
        const wantWhatsApp = channelsIn.length ? channelsIn.includes('whatsapp') : !!phoneRaw;
        const wantEmail = channelsIn.length ? channelsIn.includes('email') : !!email;
        if (!phoneRaw && !email) return res.status(400).json({ error: 'A contact phone or email is required' });

        const doc = await prisma.inventoryDocument.findUnique({ where: { id: docId } });
        if (!doc || doc.inventory_id !== inventoryId) return res.status(404).json({ error: 'Document not found' });

        const inventory = await prisma.inventory.findUnique({
            where: { id: inventoryId },
            select: {
                id: true, display_id: true, type: true, location: true, full_address: true,
                locality: true, city: true, tenant_id: true,
            },
        });
        if (!inventory) return res.status(404).json({ error: 'Property not found' });

        // Public link — the file is served statically by the backend at /uploads/… (same URL the
        // in-app "View" button opens). file_url is stored as a leading-slash path.
        // Documents are no longer publicly readable (the raw /uploads path is blocked), so
        // share a SIGNED, EXPIRING link. 7 days is long enough for a customer to act on it and
        // short enough that an onward-forwarded link stops working. Same HMAC scheme as the
        // brochure PDFs; the token is bound to this document id, so it cannot be re-pointed.
        const { signPdfToken } = await import('../utils/pdf_token');
        const shareExp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
        const shareToken = signPdfToken(String(docId), 'document', shareExp);
        const apiBase = process.env.API_BASE_URL || 'https://api.realtypandit.in';
        const fileUrl = `${apiBase}/inventory/${inventoryId}/documents/${docId}/public?token=${shareToken}`;
        const docTitle = doc.title || doc.file_name || 'Document';
        const propertyLabel = `${inventory.type ? inventory.type.toUpperCase() + ' · ' : ''}${inventory.locality || inventory.city || inventory.location || inventory.full_address || inventory.display_id || 'Property'}`;

        let whatsappSent = false, whatsappError: string | null = null;
        if (wantWhatsApp && phoneRaw) {
            const normalized = normalizePhone(phoneRaw);
            if (!normalized || isPlaceholderPhone(phoneRaw)) {
                whatsappError = 'invalid phone';
            } else {
                const wa = new WhatsAppService();
                try {
                    await wa.sendTemplate(normalized, 'rp_document_share', { title: docTitle, property: propertyLabel, link: fileUrl });
                    whatsappSent = true;
                } catch (tErr) {
                    // Template still PENDING approval (or other Meta error) → fall back to free-form text,
                    // which delivers only inside the contact's 24h customer-service window.
                    logger.warn(`[DocShare] template send failed, trying text: ${(tErr as Error).message}`);
                    try {
                        await wa.sendText(normalized, `📄 ${docTitle}\nProperty: ${propertyLabel}\n\nView / download:\n${fileUrl}\n\n— Realty Pandit`);
                        whatsappSent = true;
                    } catch (txtErr) {
                        whatsappError = (txtErr as Error).message;
                        logger.error('[DocShare] WhatsApp text fallback failed:', txtErr);
                    }
                }
                await prisma.interaction.create({ data: {
                    tenant_id: agent.tenant_id, phone_number: normalized, channel: 'whatsapp',
                    direction: 'outbound', event_type: 'document_shared',
                    content: `Document shared: ${docTitle} (${propertyLabel})`,
                    metadata: { inventory_id: inventoryId, document_id: docId, link: fileUrl, sent: whatsappSent },
                } }).catch(() => {});
            }
        }

        let emailSent = false, emailError: string | null = null;
        if (wantEmail && email) {
            try {
                const { EmailService } = await import('../services/email_service');
                const es = new EmailService();
                const html = `<p>Namaste${contactName ? ' ' + contactName : ''},</p>
<p>A property document has been shared with you by Realty Pandit:</p>
<p><b>${docTitle}</b><br/>Property: ${propertyLabel}</p>
<p><a href="${fileUrl}">View or download the document</a></p>
<p>Reply if you have any questions.<br/>— Realty Pandit</p>`;
                const info = await es.sendEmail({
                    from: 'Realty Pandit <noreply@realtypandit.in>',
                    to: email,
                    subject: `Document shared: ${docTitle}`,
                    html,
                    senderAgentId: agent.id,
                }, agent.tenant_id);
                emailSent = !!info;
                if (!info) emailError = 'send returned empty';
                await prisma.interaction.create({ data: {
                    tenant_id: agent.tenant_id, phone_number: email, channel: 'email',
                    direction: 'outbound', event_type: 'document_shared',
                    content: `Document shared: ${docTitle} (${propertyLabel})`,
                    metadata: { inventory_id: inventoryId, document_id: docId, link: fileUrl, sent: emailSent },
                } }).catch(() => {});
            } catch (eErr) {
                emailError = (eErr as Error).message;
                logger.error('[DocShare] Email send failed:', eErr);
            }
        }

        logger.info(`[DocShare] Agent ${agent.id} shared doc ${docId} (inv ${inventoryId}) → wa:${whatsappSent} email:${emailSent}`);
        res.json({
            success: whatsappSent || emailSent,
            whatsapp_sent: whatsappSent, whatsapp_error: whatsappError,
            email_sent: emailSent, email_error: emailError,
            link: fileUrl,
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#doc-share' });
        logger.error('[Documents SHARE] Error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /inventory/filter-counts — Returns counts per filter option for the filter panel UI
// Respects the same visibility rules as the main inventory listing
router.get('/filter-counts', authMiddleware, async (req, res) => {
    try {
        const agent = req.agent!;
        const baseWhere: any = {};

        // Same visibility filtering as main listing
        if (agent.role === 'super_boss') {
            // sees all
        } else if (agent.role === 'manager') {
            const team = await prisma.agent.findMany({
                where: { reports_to_id: agent.id },
                select: { id: true },
            });
            const teamIds = [agent.id, ...team.map((a: { id: string }) => a.id)];
            const partnerOwnerIds = await getManagedPartnerOwnerIds(teamIds);
            baseWhere.OR = [
                { uploaded_by_agent_id: { in: teamIds } },
                { reference_agent_id: { in: teamIds } },
                { assigned_agent_id: { in: teamIds } },
                { shared_with_ids: { hasSome: teamIds } },
                ...(partnerOwnerIds.length > 0 ? [{ owner_id: { in: partnerOwnerIds } }] : []),
            ];
        } else {
            const partnerOwnerIds = await getManagedPartnerOwnerIds([agent.id]);
            baseWhere.OR = [
                { uploaded_by_agent_id: agent.id },
                { reference_agent_id: agent.id },
                { assigned_agent_id: agent.id },
                { shared_with_ids: { has: agent.id } },
                ...(partnerOwnerIds.length > 0 ? [{ owner_id: { in: partnerOwnerIds } }] : []),
            ];
        }

        // Run all counts in parallel
        const [
            intentCounts,
            categoryCounts,
            ownershipCounts,
            bhkCounts,
            total,
        ] = await Promise.all([
            // Intent (sale/rent)
            prisma.inventory.groupBy({
                by: ['intent'],
                where: baseWhere,
                _count: true,
            }),
            // Category (residential/commercial)
            prisma.inventory.groupBy({
                by: ['category'],
                where: baseWhere,
                _count: true,
            }),
            // Ownership type
            prisma.inventory.groupBy({
                by: ['ownership_type'],
                where: baseWhere,
                _count: true,
            }),
            // BHK — from specs JSON, need raw query
            prisma.$queryRaw<Array<{ bhk: number; count: bigint }>>`
                SELECT (specs->>'bedrooms')::int as bhk, COUNT(*) as count
                FROM inventory
                WHERE specs->>'bedrooms' IS NOT NULL
                AND (specs->>'bedrooms')::int > 0
                GROUP BY (specs->>'bedrooms')::int
                ORDER BY bhk
            `,
            // Total visible
            prisma.inventory.count({ where: baseWhere }),
        ]);

        // Fetch sub-category and category_id counts
        const [subCategoryCounts, categoryIdCounts] = await Promise.all([
            prisma.inventory.groupBy({
                by: ['sub_category_id'],
                where: { ...baseWhere, sub_category_id: { not: null } },
                _count: true,
            }),
            prisma.inventory.groupBy({
                by: ['category_id'],
                where: { ...baseWhere, category_id: { not: null } },
                _count: true,
            }),
        ]);

        // Fetch category and sub-category names for display
        const [categories, subCategories] = await Promise.all([
            prisma.propertyCategory.findMany({
                where: { is_active: true },
                select: { id: true, name: true, slug: true, display_order: true },
                orderBy: { display_order: 'asc' },
            }),
            prisma.propertySubCategory.findMany({
                where: { is_active: true },
                select: { id: true, name: true, slug: true, category_id: true, display_order: true },
                orderBy: { display_order: 'asc' },
            }),
        ]);

        res.json({
            total,
            intent: intentCounts.map((c: any) => ({ value: c.intent, count: c._count })),
            category: categoryCounts.map((c: any) => ({ value: c.category, count: c._count })),
            category_id: categoryIdCounts.map((c: any) => ({ value: c.category_id, count: c._count })),
            sub_category_id: subCategoryCounts.map((c: any) => ({ value: c.sub_category_id, count: c._count })),
            ownership_type: ownershipCounts.map((c: any) => ({ value: c.ownership_type, count: c._count })),
            bhk: bhkCounts.map((c: any) => ({ value: Number(c.bhk), count: Number(c.count) })),
            categories,
            sub_categories: subCategories,
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#23' });
        res.status(500).json({ error: (error as Error).message });
    }
});

export default router;
