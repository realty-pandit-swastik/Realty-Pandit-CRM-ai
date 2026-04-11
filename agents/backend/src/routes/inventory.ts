
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { InventoryStateMachine } from '../workflows/inventory_machine';
import prisma from '../db';
import { sessionStore } from '../services/session/store';
import { StorageService } from '../services/storage';
import { ensureOwner } from '../services/ensure_owner';
import { authMiddleware, checkPermission } from '../middleware/auth';
import logger from '../utils/logger';
import { normalizePhone } from '../utils/phone';
import { WhatsAppService } from '../services/whatsapp';
import { notify } from '../services/notify';

const router = Router();
const stateMachine = new InventoryStateMachine();
const storageService = new StorageService();

// Multer config: memory storage (buffer), max 50MB per file (videos need more)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = [
            'image/jpeg', 'image/png', 'image/webp', 'image/avif',
            'image/heic', 'image/heif', 'image/gif', 'image/bmp',
            'video/mp4', 'video/webm', 'video/quicktime',
        ];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only images and videos (mp4, webm, mov) are allowed'));
        }
    }
});


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
            floor_number, total_floors, facing, property_age,
            // Owner info
            owner_phone, owner_name,
            // Key holder
            key_holder_type, key_holder_name, key_holder_phone,
            // Renovation
            renovated,
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

        // Upsert contact as LANDLORD
        await prisma.contact.upsert({
            where: { phone_number: phone },
            update: {
                name: owner_name || undefined,
                contact_type: 'LANDLORD',
                last_channel: 'admin',
                last_interaction: new Date(),
            },
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
            },
        });

        // Ensure Owner exists
        const ownerId = await ensureOwner(phone, tenant.id);

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
                specs: specs || null,
                features: features || null,
                status: 'active',
                media_urls: [],

                // Property details
                description: description || null,
                furnishing: furnishing || null,
                floor_number: floor_number ? parseInt(String(floor_number)) : null,
                total_floors: total_floors ? parseInt(String(total_floors)) : null,
                facing: facing || null,
                property_age: property_age || null,

                // Key holder
                key_holder_type: key_holder_type || null,
                key_holder_name: key_holder_name || null,
                key_holder_phone: key_holder_phone || null,

                // Renovation
                renovated: renovated === true || renovated === 'true',

                // Uploader
                uploaded_by_agent_id: req.agent!.id,
            },
        });

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

        logger.info(`[Inventory] Created ${inventory.id} by agent ${req.agent!.id}`);
        res.status(201).json(inventory);
    } catch (error) {
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

// GET /inventory - List inventory (role-based filtering + query filters + pagination)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const agent = req.agent!;
        const where: any = {};

        // Role-based visibility (DUAL-VISIBILITY: uploader OR reference + managed partner agents)
        if (agent.role === 'super_boss') {
            // Super boss sees ALL inventory
        } else if (agent.role === 'manager') {
            // Manager sees own/team uploads/references + managed partner agents' inventory
            const team = await prisma.agent.findMany({
                where: { reports_to_id: agent.id },
                select: { id: true },
            });
            const teamIds = [agent.id, ...team.map((a: { id: string }) => a.id)];
            const partnerOwnerIds = await getManagedPartnerOwnerIds(teamIds);
            where.OR = [
                { uploaded_by_agent_id: { in: teamIds } },
                { reference_agent_id: { in: teamIds } },
                { assigned_agent_id: { in: teamIds } },
                { shared_with_ids: { hasSome: teamIds } },
                ...(partnerOwnerIds.length > 0 ? [{ owner_id: { in: partnerOwnerIds } }] : []),
            ];
        } else {
            // Employee sees own uploads + own references + assigned + shared + managed partner agents' inventory
            const partnerOwnerIds = await getManagedPartnerOwnerIds([agent.id]);
            where.OR = [
                { uploaded_by_agent_id: agent.id },
                { reference_agent_id: agent.id },
                { assigned_agent_id: agent.id },
                { shared_with_ids: { has: agent.id } },
                ...(partnerOwnerIds.length > 0 ? [{ owner_id: { in: partnerOwnerIds } }] : []),
            ];
        }

        // Query filters
        const { intent, state, type, category, agent_id, status, search, page, limit: limitParam, bhk, location } = req.query;

        if (intent && typeof intent === 'string') where.intent = intent;
        if (status && typeof status === 'string') where.status = status;
        if (state && typeof state === 'string') where.state = { contains: state, mode: 'insensitive' };
        if (type && typeof type === 'string') where.type = { contains: type, mode: 'insensitive' };
        if (category && typeof category === 'string') where.category = { contains: category, mode: 'insensitive' };
        if (agent_id && typeof agent_id === 'string') where.uploaded_by_agent_id = agent_id;

        // BHK filter — maps to specs.bedrooms JSON field via OR across values
        if (bhk && typeof bhk === 'string') {
            const bhkValues = bhk.split(',').map(v => parseInt(v.trim(), 10)).filter(n => !isNaN(n));
            if (bhkValues.length > 0) {
                const bhkOR = bhkValues.map(b => ({ specs: { path: ['bedrooms'], equals: b } }));
                if (where.OR) {
                    where.AND = [...(where.AND || []), { OR: bhkOR }];
                } else {
                    where.OR = bhkOR;
                }
            }
        }

        // Location filter — partial match across locality, city, state, full_address
        if (location && typeof location === 'string' && location.trim()) {
            const loc = location.trim();
            const locOR = [
                { locality: { contains: loc, mode: 'insensitive' as const } },
                { city: { contains: loc, mode: 'insensitive' as const } },
                { state: { contains: loc, mode: 'insensitive' as const } },
                { full_address: { contains: loc, mode: 'insensitive' as const } },
                { apartment_name: { contains: loc, mode: 'insensitive' as const } },
            ];
            if (where.OR) {
                where.AND = [...(where.AND || []), { OR: locOR }];
                delete where.OR;
            } else {
                where.OR = locOR;
            }
        }

        if (search && typeof search === 'string' && search.trim()) {
            const q = search.trim();
            const searchOR = [
                { location: { contains: q, mode: 'insensitive' as const } },
                { locality: { contains: q, mode: 'insensitive' as const } },
                { city: { contains: q, mode: 'insensitive' as const } },
                { district: { contains: q, mode: 'insensitive' as const } },
                { description: { contains: q, mode: 'insensitive' as const } },
                { apartment_name: { contains: q, mode: 'insensitive' as const } },
                { plot_no: { contains: q, mode: 'insensitive' as const } },
                { full_address: { contains: q, mode: 'insensitive' as const } },
            ];
            // Preserve role-based visibility OR by combining with AND
            if (where.OR) {
                const visibilityOR = where.OR;
                delete where.OR;
                where.AND = [{ OR: visibilityOR }, { OR: searchOR }];
            } else {
                where.OR = searchOR;
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
                        select: { id: true, name: true, role: true },
                    },
                    reference_agent: {
                        select: { id: true, name: true, role: true },
                    },
                    assigned_agent: {
                        select: { id: true, name: true, role: true },
                    },
                    property_category: { select: { id: true, name: true, slug: true } },
                    property_sub_category: { select: { id: true, name: true, slug: true } },
                    property_type_link: { select: { id: true, name: true, slug: true } },
                    flat_property_type: { select: { id: true, name: true, slug: true, main_category: true } },
                },
            }),
            prisma.inventory.count({ where }),
        ]);

        res.json({
            data: inventory,
            total,
            page: pageNum,
            totalPages: Math.ceil(total / take),
        });
    } catch (error) {
        logger.error(error);
        res.status(500).json({ error: 'Failed to fetch inventory' });
    }
});

// GET /inventory/:id - Single inventory item
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const id = req.params.id as string;
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

        res.json(inventory);
    } catch (error) {
        logger.error(error);
        res.status(500).json({ error: 'Failed to fetch inventory item' });
    }
});

// PATCH /inventory/:id - Update inventory (requires edit_inventory permission)
router.patch('/:id', authMiddleware, checkPermission('edit_inventory'), async (req, res) => {
    try {
        const id = req.params.id as string;
        const existing = await prisma.inventory.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Inventory not found' });
        }

        // Allowed fields to update
        const allowedFields = [
            // Legacy + core
            'category', 'type', 'intent', 'location', 'specs', 'features',
            'price', 'price_unit', 'status', 'assigned_agent_id',
            // Classification IDs
            'category_id', 'sub_category_id', 'type_id', 'configuration_id',
            'usage_type_id', 'investment_type_id',
            // Flat property type (Redesign v2)
            'flat_property_type_id',
            // Dual pricing (Redesign v2)
            'customer_price', 'display_price',
            // Property details
            'description', 'furnishing', 'floor_number', 'total_floors',
            'facing', 'property_age',
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
            'owner_phone', 'uploader_phone',
        ];
        // Handle renovated boolean explicitly (not in allowedFields loop to avoid string coercion)
        if (req.body.renovated !== undefined) {
            updateData.renovated = req.body.renovated === true || req.body.renovated === 'true';
        }
        const updateData: any = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                if (['price', 'customer_price', 'display_price'].includes(field)) {
                    const parsed = req.body[field] !== null && req.body[field] !== '' ? parseFloat(req.body[field]) : NaN;
                    updateData[field] = isNaN(parsed) ? null : parsed;
                } else if (['latitude', 'longitude'].includes(field)) {
                    const parsed = req.body[field] !== null && req.body[field] !== '' ? parseFloat(req.body[field]) : NaN;
                    updateData[field] = isNaN(parsed) ? null : parsed;
                } else if (field === 'floor_number' || field === 'total_floors') {
                    const parsed = req.body[field] !== null ? parseInt(String(req.body[field])) : NaN;
                    updateData[field] = isNaN(parsed) ? null : parsed;
                } else {
                    updateData[field] = req.body[field];
                }
            }
        }
        // Write city to district too for backward compat
        if (updateData.city && !updateData.district) {
            updateData.district = updateData.city;
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

        // Normalize and re-link owner if owner_phone changed
        if (updateData.owner_phone) {
            const normalized = normalizePhone(updateData.owner_phone);
            if (!normalized) return res.status(400).json({ error: 'Invalid owner phone number' });
            updateData.owner_phone = normalized;
            // Ensure Owner record exists and update FK
            const tenant = await prisma.tenant.findFirst();
            if (tenant) {
                const ownerId = await ensureOwner(normalized, tenant.id);
                updateData.owner_id = ownerId;
            }
        }
        if (updateData.uploader_phone) {
            const normalized = normalizePhone(updateData.uploader_phone);
            if (!normalized) return res.status(400).json({ error: 'Invalid uploader phone number' });
            updateData.uploader_phone = normalized;
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        const updated = await prisma.inventory.update({
            where: { id },
            data: updateData,
        });

        logger.info(`[Inventory] Updated ${id} by agent ${req.agent!.id}: ${JSON.stringify(updateData)}`);

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

        res.json(updated);
    } catch (error) {
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
        logger.error('[Inventory Share] Error:', error);
        res.status(500).json({ error: 'Failed to share inventory' });
    }
});

// POST /inventory/:id/share-to-client — Share property with a client via WhatsApp + generate link
router.post('/:id/share-to-client', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { client_phone, client_name } = req.body;
        if (!client_phone) return res.status(400).json({ error: 'client_phone required' });

        const normalized = normalizePhone(client_phone);
        const agent = req.agent!;

        // Fetch inventory with details for the WhatsApp message
        const inventory = await prisma.inventory.findUnique({
            where: { id },
            include: {
                flat_property_type: { select: { name: true, main_category: true } },
            }
        });
        if (!inventory) return res.status(404).json({ error: 'Property not found' });

        // Authorization: same as internal share — agent must have access to property
        let canShare = agent.role === 'super_boss'
            || inventory.uploaded_by_agent_id === agent.id
            || inventory.assigned_agent_id === agent.id
            || inventory.reference_agent_id === agent.id
            || (inventory.shared_with_ids || []).includes(agent.id);
        if (!canShare) {
            const partnerOwnerIds = await getManagedPartnerOwnerIds([agent.id]);
            if (inventory.owner_id && partnerOwnerIds.includes(inventory.owner_id)) canShare = true;
        }
        if (!canShare && agent.role === 'manager') {
            const team = await prisma.agent.findMany({ where: { reports_to_id: agent.id }, select: { id: true } });
            const teamIds = team.map((a: { id: string }) => a.id);
            canShare = teamIds.includes(inventory.uploaded_by_agent_id || '') || teamIds.includes(inventory.assigned_agent_id || '');
        }
        if (!canShare) return res.status(403).json({ error: 'Not authorized to share this property' });

        // Upsert contact as BUYER
        const existingContact = await prisma.contact.findUnique({ where: { phone_number: normalized } });
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
                source: 'manual',
                contact_type: 'BUYER',
                tenant_id: agent.tenant_id,
                last_channel: 'whatsapp',
                last_interaction: new Date(),
                created_by: req.agent?.id || null,
            }
        });

        // Check for existing share (duplicate detection)
        const existingShare = await prisma.propertyShare.findFirst({
            where: { inventory_id: inventory.id, client_phone: normalized },
            orderBy: { created_at: 'desc' },
        });
        if (existingShare) {
            return res.json({
                success: true,
                already_shared: true,
                shared_at: existingShare.created_at,
                share_id: existingShare.id,
                share_link: existingShare.property_link,
                whatsapp_sent: false,
                contact_created: false,
            });
        }

        // Generate shareable property link
        const propertyLink = inventory.display_id
            ? `https://www.realtypandit.in/properties/${inventory.display_id}`
            : `https://www.realtypandit.in/properties/${inventory.id}`;

        // Build WhatsApp message
        const agentRecord = await prisma.agent.findUnique({ where: { id: agent.id }, select: { name: true, phone: true } });
        const specs = inventory.specs as any;
        const price = inventory.display_price || inventory.price;
        const typeName = inventory.flat_property_type?.name || inventory.type?.toUpperCase() || 'Property';

        const formatPrice = (p: number): string => {
            if (p >= 10000000) return `${(p / 10000000).toFixed(1)} Cr`;
            if (p >= 100000) return `${(p / 100000).toFixed(1)} Lakh`;
            return p.toLocaleString('en-IN');
        };

        const caption = [
            `*${typeName}*`,
            `📍 ${inventory.full_address || inventory.location || 'Location available on request'}`,
            specs?.bedrooms ? `🛏️ ${specs.bedrooms} BHK` : null,
            specs?.area ? `📐 ${specs.area} ${specs.area_unit || 'sqft'}` : null,
            price ? `💰 ₹${formatPrice(Number(price))}` : null,
            '',
            `🔗 View Details: ${propertyLink}`,
            '',
            `📞 ${agentRecord?.name || 'Our Team'} | Realty Pandit`,
            agentRecord?.phone ? `Call: ${agentRecord.phone}` : null,
        ].filter(Boolean).join('\n');

        // Send via WhatsApp Business API
        let whatsappSent = false;
        try {
            const whatsapp = new WhatsAppService();
            const imageUrl = inventory.media_urls?.[0] || null;
            if (imageUrl) {
                await whatsapp.sendImage(normalized, imageUrl, caption);
            } else {
                await whatsapp.sendText(normalized, caption);
            }
            whatsappSent = true;
        } catch (err) {
            logger.error('[ShareToClient] WhatsApp send failed:', err);
        }

        // Create PropertyShare record
        const share = await prisma.propertyShare.create({
            data: {
                tenant_id: agent.tenant_id,
                inventory_id: inventory.id,
                agent_id: agent.id,
                client_phone: normalized,
                channel: 'whatsapp_api',
                property_link: propertyLink,
                whatsapp_sent: whatsappSent,
            }
        });

        // Log interaction
        await prisma.interaction.create({
            data: {
                tenant_id: agent.tenant_id,
                phone_number: normalized,
                channel: 'whatsapp',
                direction: 'outbound',
                event_type: 'property_shared',
                content: `Property shared: ${typeName} in ${inventory.location || inventory.full_address || 'N/A'}`,
                metadata: { inventory_id: inventory.id, share_id: share.id, property_link: propertyLink }
            }
        });

        logger.info(`[ShareToClient] Agent ${agent.id} shared ${id} with ${normalized}, WhatsApp: ${whatsappSent}`);
        res.json({
            success: true,
            share_link: propertyLink,
            whatsapp_sent: whatsappSent,
            share_id: share.id,
            contact_created: !existingContact,
        });
    } catch (error) {
        logger.error('[ShareToClient] Error:', error);
        res.status(500).json({ error: 'Failed to share property' });
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

        await prisma.inventory.update({
            where: { id },
            data: { assigned_agent_id: to_agent_id },
        });

        logger.info(`[Inventory] Transferred ${id} from ${agent.id} to ${to_agent_id} by ${agent.id}`);

        // Notify the receiving agent
        const fullTarget = await prisma.agent.findUnique({ where: { id: to_agent_id }, select: { id: true, phone: true, email: true, name: true } });
        if (fullTarget) {
            notify('inventory_transferred', [{ id: fullTarget.id, type: 'agent', phone: fullTarget.phone, email: fullTarget.email || undefined, name: fullTarget.name }], {
                inventory_id: id, display_id: existing.display_id, from_agent: agent.name,
                property_type: existing.type, location: existing.full_address || existing.locality,
            });
        }

        res.json({ message: 'Inventory transferred', assigned_agent_id: to_agent_id, to_agent_name: targetAgent.name });
    } catch (error) {
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
        logger.error('[TransferOwnership] Error:', error);
        res.status(500).json({ error: (error as Error).message });
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
        if (existing.status !== 'pending_approval') {
            return res.status(400).json({ error: `Cannot approve — current status is '${existing.status}'` });
        }

        await prisma.inventory.update({ where: { id }, data: { status: 'active' } });
        logger.info(`[Inventory] Approved ${id} (→ active) by agent ${req.agent!.id}`);

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

        res.json({ message: 'Inventory approved and is now live', id });
    } catch (error) {
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
        logger.error('[Inventory Reject] Error:', error);
        res.status(500).json({ error: 'Failed to reject inventory' });
    }
});

// DELETE /inventory/:id - Delete inventory (requires delete_inventory permission)
router.delete('/:id', authMiddleware, checkPermission('delete_inventory'), async (req, res) => {
    try {
        const id = req.params.id as string;

        const existing = await prisma.inventory.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Inventory not found' });
        }

        await prisma.inventory.delete({ where: { id } });

        logger.info(`[Inventory] Deleted ${id} by agent ${req.agent!.id}`);
        res.json({ message: 'Inventory deleted successfully', id });
    } catch (error) {
        logger.error('[Inventory DELETE] Error:', error);
        res.status(500).json({ error: 'Failed to delete inventory' });
    }
});

// POST /inventory/session/start
router.post('/session/start', async (req, res) => {
    try {
        const { sessionId, intent } = req.body;
        const result = await stateMachine.startSession(sessionId, intent);
        res.json(result);
    } catch (error) {
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

        const inventory = await prisma.inventory.create({
            data: {
                tenant_id: tenant.id,
                owner_id: ownerId,
                owner_phone: ownerPhone,
                category: data.category || 'residential',
                type: data.type || 'flat',
                intent: data.intent || 'sell',
                location: data.location || data.locationText || null,
                specs: {
                    bedrooms: data.bedrooms,
                    bathrooms: data.bathrooms,
                    area: data.area,
                },
                price: data.price ? parseFloat(data.price) : null,
                status: 'active',
                media_urls: [],
                uploaded_by_agent_id: uploadedByAgentId,

                // Classification IDs (from DB-driven WhatsApp flow)
                category_id: data.categoryId || undefined,
                sub_category_id: data.subCategoryId || undefined,
                type_id: data.typeId || undefined,
                configuration_id: data.configurationId || undefined,

                // Structured features (parsed from amenities text)
                features: data.features && Object.keys(data.features).length > 0 ? data.features : undefined,

                // Key holder
                key_holder_type: data.key_holder_type || undefined,
                key_holder_name: data.key_holder_name || undefined,
                key_holder_phone: data.key_holder_phone || undefined,

                // Property details (if collected via EXTRA_DETAILS)
                description: data.description || undefined,
                furnishing: data.furnishing || undefined,
                floor_number: data.floorNumber ? parseInt(data.floorNumber) : undefined,
                total_floors: data.totalFloors ? parseInt(data.totalFloors) : undefined,
                facing: data.facing || undefined,
                property_age: data.propertyAge || undefined,
            }
        });

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
        logger.error('[Inventory Commit]', error);
        res.status(500).json({ error: 'Commit failed' });
    }
});

// POST /inventory/:id/upload - Upload property images and videos (max 20 files)
router.post('/:id/upload', upload.array('images', 20), async (req, res) => {
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
            if (file.mimetype.startsWith('video/')) {
                // Write video to disk directly (no sharp processing)
                const videoDir = path.join(process.cwd(), 'uploads', 'properties', id);
                fs.mkdirSync(videoDir, { recursive: true });
                const ext = (file.originalname.split('.').pop() || 'mp4').toLowerCase();
                const filename = `${Date.now()}-video.${ext}`;
                fs.writeFileSync(path.join(videoDir, filename), file.buffer);
                newVideoUrls.push(`/uploads/properties/${id}/${filename}`);
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
        logger.error('[Upload] Error:', error);
        res.status(500).json({ error: (error as Error).message });
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
        logger.error('[List Media] Error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// ================================================================
// ENRICHMENT ENDPOINTS (v3 - Post-save optional details)
// ================================================================

import { ENRICHMENT_STEPS, ENRICHMENT_GROUPS } from '../workflows/workflow_definition';
import { WorkflowEngine } from '../workflows/workflow_engine';

const enrichmentEngine = new WorkflowEngine(ENRICHMENT_STEPS);

/**
 * GET /inventory/:id/enrichment
 * Returns enrichment step definitions + current inventory values.
 */
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

        // Features/amenities
        if (fields.features !== undefined) {
            const featuresObj: Record<string, boolean> = {};
            if (typeof fields.features === 'object') {
                for (const [k, v] of Object.entries(fields.features)) {
                    if (v) featuresObj[k] = true;
                }
            }
            updateData.features = Object.keys(featuresObj).length > 0 ? featuresObj : undefined;
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

        if (specsChanged) {
            updateData.specs = newSpecs;
        }

        // Direct detail fields
        if (fields.furnishing !== undefined) updateData.furnishing = fields.furnishing;
        if (fields.facing !== undefined) updateData.facing = fields.facing;
        if (fields.total_floors !== undefined) updateData.total_floors = parseInt(fields.total_floors) || null;
        if (fields.property_age !== undefined) updateData.property_age = fields.property_age;
        if (fields.description !== undefined) updateData.description = fields.description;
        if (fields.lead_reference !== undefined) updateData.lead_reference = fields.lead_reference;
        if (fields.lift_available !== undefined) {
            const currentFeatures = (updateData.features || inventory.features || {}) as Record<string, boolean>;
            if (fields.lift_available === 'yes') {
                currentFeatures.lift = true;
            }
            updateData.features = currentFeatures;
        }

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
            features: updateData.features ?? inventory.features,
            bathrooms: newSpecs.bathrooms ?? currentSpecs.bathrooms,
            area: newSpecs.area ?? currentSpecs.area,
            furnishing: updateData.furnishing ?? inventory.furnishing,
            facing: updateData.facing ?? inventory.facing,
            description: updateData.description ?? inventory.description,
            photos: inventory.media_urls,
            total_floors: updateData.total_floors ?? inventory.total_floors,
            property_age: updateData.property_age ?? inventory.property_age,
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
        logger.error('[Enrichment PATCH] Error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── Document Management ─────────────────────────────────────────────────────

// Multer config for document uploads (PDF, images, Word, Excel)
const docUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (_req, file, cb) => {
        const allowed = [
            'application/pdf',
            'image/jpeg', 'image/png', 'image/webp',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF, images, Word, and Excel files are allowed'));
        }
    },
});

/**
 * POST /inventory/:id/documents
 * Upload a document and attach it to an inventory item.
 */
router.post('/:id/documents', authMiddleware, checkPermission('edit_inventory'), docUpload.single('document'), async (req, res) => {
    try {
        const inventoryId = req.params.id as string;
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
        logger.error('[Documents DELETE] Error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

export default router;
