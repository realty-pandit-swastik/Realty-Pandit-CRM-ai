
import { Router } from 'express';
import prisma from '../db';
import { authMiddleware, requireRole, checkPermission } from '../middleware/auth';
import { requireSuperBoss } from '../middleware/require_super_boss';
import { sendPartnerWelcomeWhatsApp, sendPartnerWelcomeEmail } from '../services/partner_notifications';
import { normalizePhone, phoneVariants } from '../utils/phone';
import { identifyContact } from '../services/contact_identifier';
import { buildFullContactVisibilityFilter } from '../middleware/contact_visibility';
import { ownershipService } from '../services/ownership_service';
import logger from '../utils/logger';
import { captureRouteError } from '../utils/capture';
import { syncContactName } from '../services/contact_identity';
import bcrypt from 'bcryptjs';

const router = Router();

// All API routes require authentication
router.use(authMiddleware);

// GET /contacts — Role-scoped via created_by: super_boss sees all, manager sees own + subordinates', employee sees own only
router.get('/contacts', async (req, res) => {
    try {
        const agentRole = req.agent!.role;
        const agentId = req.agent!.id;

        const visibilityFilter = await buildFullContactVisibilityFilter(agentId, agentRole);

        const contacts = await prisma.contact.findMany({
            where: {
                tenant_id: req.agent!.tenant_id,
                ...visibilityFilter,
            },
            orderBy: { updated_at: 'desc' },
            include: {
                lead_score: true,
                interactions: {
                    orderBy: { created_at: 'desc' },
                    take: 1
                }
            }
        });
        res.json(contacts);
    } catch (error) {
        captureRouteError(error, req, { route: 'api#1' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /contacts/directory — unified, paginated, role-scoped Contacts page (2026-06-20).
// Every contact tagged by type (Buyer/Tenant/Landlord/Partner/Builder/…), with the assigned
// manager, their inventory count (owned listings) OR demand summary, and last activity.
router.get('/contacts/directory', async (req, res) => {
    try {
        const agentRole = req.agent!.role;
        const agentId = req.agent!.id;
        const tenantId = req.agent!.tenant_id;
        const visibilityFilter = await buildFullContactVisibilityFilter(agentId, agentRole);

        const page = Math.max(1, parseInt(String(req.query.page)) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit)) || 25));
        const type = req.query.type ? String(req.query.type) : null;
        const search = req.query.search ? String(req.query.search).trim() : '';

        // AND-compose so we never clobber an OR inside the visibility filter.
        const baseAnd: any[] = [visibilityFilter];
        const where: any = { tenant_id: tenantId, AND: [...baseAnd] };
        if (type) where.AND.push({ contact_type: type });
        if (search) {
            const digits = search.replace(/\D/g, '');
            where.AND.push({
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    ...(digits ? [{ phone_number: { contains: digits } }] : []),
                ],
            });
        }

        // Type tab-counts respect visibility but NOT the type/search narrowing.
        const typeCountsRaw = await prisma.contact.groupBy({
            by: ['contact_type'],
            where: { tenant_id: tenantId, AND: [...baseAnd] },
            _count: { _all: true },
        });
        const type_counts: Record<string, number> = {};
        for (const t of typeCountsRaw) type_counts[t.contact_type || 'UNKNOWN'] = t._count._all;

        const [contacts, total] = await Promise.all([
            prisma.contact.findMany({
                where,
                orderBy: { updated_at: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    phone_number: true, name: true, email: true, contact_type: true, intent: true,
                    budget_min: true, budget_max: true, preferred_location: true,
                    lead_type: true, last_interaction: true, updated_at: true,
                    referral_partner_id: true,
                    assigned_agent: { select: { name: true } },
                },
            }),
            prisma.contact.count({ where }),
        ]);

        // Batched: how many listings each contact OWNS (owner_phone == their phone).
        const phones = contacts.map((c: { phone_number: string }) => c.phone_number);
        const invGroups = phones.length
            ? await prisma.inventory.groupBy({ by: ['owner_phone'], where: { owner_phone: { in: phones } }, _count: { _all: true } })
            : [];
        const invByPhone: Record<string, number> = {};
        for (const g of invGroups) if (g.owner_phone) invByPhone[g.owner_phone] = g._count._all;

        const data = contacts.map((c: any) => ({
            phone_number: c.phone_number,
            name: c.name,
            email: c.email || null,
            contact_type: c.contact_type || 'UNKNOWN',
            manager: c.assigned_agent?.name || null,
            last_interaction: c.last_interaction || c.updated_at,
            inventory_count: invByPhone[c.phone_number] || 0,
            // Demand returned whenever there IS a requirement signal — independent of the type tag — so
            // a contact who is BOTH a buyer and an owner shows both facets (bifurcation, 2026-06-20).
            demand: (c.intent || c.budget_min != null || c.budget_max != null || c.preferred_location)
                ? {
                    intent: c.intent || null,
                    budget_min: c.budget_min != null ? Number(c.budget_min) : null,
                    budget_max: c.budget_max != null ? Number(c.budget_max) : null,
                    location: c.preferred_location || null,
                }
                : null,
            is_partner: c.contact_type === 'PARTNER_AGENT',
        }));

        res.json({ data, total, page, totalPages: Math.ceil(total / limit), type_counts });
    } catch (error) {
        captureRouteError(error, req, { route: 'api#contacts-directory' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /contacts/:phone/interactions — Role-scoped: non-super_boss can only view their assigned contacts' interactions
router.get('/contacts/:phone/interactions', async (req, res) => {
    const { phone } = req.params;
    try {
        const agentRole = req.agent!.role;
        const agentId = req.agent!.id;

        // Access check for non-super_boss
        if (agentRole !== 'super_boss') {
            const contact = await prisma.contact.findUnique({
                where: { phone_number: phone },
                select: { assigned_agent_id: true },
            });

            if (!contact) {
                return res.status(404).json({ error: 'Contact not found' });
            }

            if (agentRole === 'employee') {
                if (contact.assigned_agent_id !== agentId) {
                    return res.status(403).json({ error: 'Access denied: contact not assigned to you' });
                }
            } else if (agentRole === 'manager') {
                const subordinates = await prisma.agent.findMany({
                    where: { reports_to_id: agentId },
                    select: { id: true },
                });
                const allowedIds = [agentId, ...subordinates.map(s => s.id)];
                if (!contact.assigned_agent_id || !allowedIds.includes(contact.assigned_agent_id)) {
                    return res.status(403).json({ error: 'Access denied: contact not in your team' });
                }
            }
        }

        const interactions = await prisma.interaction.findMany({
            where: { phone_number: phone },
            orderBy: { created_at: 'asc' }
        });
        res.json(interactions);
    } catch (error) {
        captureRouteError(error, req, { route: 'api#2' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /contacts/:phone - Update contact (e.g., manual classification)
router.patch('/contacts/:phone', async (req, res) => {
    const { phone } = req.params;
    const { contact_type } = req.body;

    const validTypes = ['BUYER', 'TENANT', 'LANDLORD', 'PARTNER_AGENT', 'REAL_ESTATE_BUILDER', 'MANAGEMENT', 'UNKNOWN'];
    if (contact_type && !validTypes.includes(contact_type)) {
        return res.status(400).json({ error: `Invalid contact_type. Must be one of: ${validTypes.join(', ')}` });
    }

    try {
        const updated = await prisma.contact.update({
            where: { phone_number: phone },
            data: { contact_type }
        });
        res.json(updated);
    } catch (error) {
        captureRouteError(error, req, { route: 'api#3' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /contacts/:phone/profile — edit a contact's name / phone / email from the Contacts page
// (2026-06-20). Name cascades via syncContactName (contacts + inventory snapshots); phone re-keys
// via the DB's ON UPDATE CASCADE FKs (deals, inventory.owner_phone, interactions, …) so the change
// reflects in the Deal Pipeline + connected inventory. Partner agents + team members are managed on
// their OWN pages and are NOT editable here.
router.patch('/contacts/:phone/profile', async (req, res) => {
    try {
        const { phone } = req.params;
        const agentRole = req.agent!.role;
        const agentId = req.agent!.id;
        const { name, new_phone, email } = req.body || {};

        const contact = await prisma.contact.findUnique({
            where: { phone_number: phone },
            select: { phone_number: true, name: true, contact_type: true, assigned_agent_id: true },
        });
        if (!contact) return res.status(404).json({ error: 'Contact not found' });

        if (contact.contact_type === 'PARTNER_AGENT' || contact.contact_type === 'MANAGEMENT') {
            return res.status(403).json({ error: `${contact.contact_type === 'PARTNER_AGENT' ? 'Partner agents' : 'Team members'} are edited on their own page, not here.` });
        }
        // Access (mirrors /contacts/:phone/interactions): employee = own, manager = team, super_boss = all.
        if (agentRole === 'employee' && contact.assigned_agent_id !== agentId) {
            return res.status(403).json({ error: 'Access denied: contact not assigned to you' });
        }
        if (agentRole === 'manager') {
            const subs = await prisma.agent.findMany({ where: { reports_to_id: agentId }, select: { id: true } });
            const ok = [agentId, ...subs.map((s: { id: string }) => s.id)];
            if (!contact.assigned_agent_id || !ok.includes(contact.assigned_agent_id)) {
                return res.status(403).json({ error: 'Access denied: contact not in your team' });
            }
        }

        let targetPhone = contact.phone_number;
        if (new_phone && String(new_phone).trim()) {
            const np = normalizePhone(String(new_phone));
            if (!np) return res.status(400).json({ error: 'Enter a valid phone number' });
            if (np !== contact.phone_number) {
                const taken = await prisma.contact.findUnique({ where: { phone_number: np }, select: { phone_number: true } });
                if (taken) return res.status(409).json({ error: 'Another contact already uses that number — merging contacts is not supported here.' });
                targetPhone = np;
            }
        }

        await prisma.$transaction(async (tx) => {
            // Re-key FIRST — the single UPDATE cascades to all 23 child FKs (deals/inventory/chats).
            if (targetPhone !== contact.phone_number) {
                await tx.$executeRaw`UPDATE contacts SET phone_number = ${targetPhone}, updated_at = now() WHERE phone_number = ${contact.phone_number}`;
            }
            if (email !== undefined) {
                await tx.contact.update({ where: { phone_number: targetPhone }, data: { email: email ? String(email).trim() : null } });
            }
            if (name !== undefined && (name || null) !== (contact.name || null)) {
                await syncContactName(tx, targetPhone, contact.name, name ? String(name).trim() : null);
            }
        });

        const updated = await prisma.contact.findUnique({ where: { phone_number: targetPhone } });
        res.json({ success: true, contact: updated, rekeyed: targetPhone !== contact.phone_number, new_phone: targetPhone });
    } catch (error) {
        captureRouteError(error, req, { route: 'api#contact-profile-edit' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /contacts/search — Quick phone lookup for Share/Book Visit modals
router.get('/contacts/search', async (req, res) => {
    try {
        const { phone } = req.query;
        if (!phone || typeof phone !== 'string' || phone.length < 4) {
            return res.status(400).json({ error: 'Phone query required (min 4 chars)' });
        }

        const variants = phoneVariants(phone);
        const contact = await prisma.contact.findFirst({
            where: { phone_number: { in: variants } },
            select: {
                phone_number: true,
                name: true,
                email: true,
                contact_type: true,
                lifecycle_stage: true,
                lead_status: true,
            }
        });

        res.json({ contact: contact || null });
    } catch (error) {
        captureRouteError(error, req, { route: 'api#4' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /contacts/identify — Combined contact lookup + role identification (for inventory modal)
router.get('/contacts/identify', async (req, res) => {
    try {
        const { phone } = req.query;
        if (!phone || typeof phone !== 'string' || phone.length < 4) {
            return res.status(400).json({ error: 'Phone query required (min 4 chars)' });
        }

        const variants = phoneVariants(phone);

        // Run contact lookup and role identification in parallel
        const [contact, identified] = await Promise.all([
            prisma.contact.findFirst({
                where: { phone_number: { in: variants } },
                select: {
                    phone_number: true,
                    name: true,
                    email: true,
                    contact_type: true,
                    lifecycle_stage: true,
                    lead_status: true,
                }
            }),
            identifyContact(phone),
        ]);

        res.json({ contact: contact || null, identified: identified || null });
    } catch (error) {
        captureRouteError(error, req, { route: 'api#5' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /contacts/recent — Recently updated contacts (for inventory modal quick-pick)
router.get('/contacts/recent', async (req, res) => {
    try {
        const limitStr = req.query.limit as string;
        const take = Math.min(parseInt(limitStr) || 10, 30);
        const tenant_id = req.agent!.tenant_id;

        const contacts = await prisma.contact.findMany({
            where: { tenant_id },
            orderBy: { updated_at: 'desc' },
            take,
            select: {
                phone_number: true,
                name: true,
                contact_type: true,
                updated_at: true,
            }
        });

        res.json(contacts);
    } catch (error) {
        captureRouteError(error, req, { route: 'api#6' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /contacts/ensure — Upsert contact by phone (for Book Visit + inventory modal)
router.post('/contacts/ensure', async (req, res) => {
    try {
        const { phone, name, contact_type: reqContactType } = req.body;
        if (!phone) return res.status(400).json({ error: 'phone required' });

        const normalized = normalizePhone(phone);
        const tenant_id = req.agent!.tenant_id;

        const contact = await prisma.contact.upsert({
            where: { phone_number: normalized },
            update: { name: name || undefined, last_interaction: new Date() },
            create: {
                phone_number: normalized,
                name: name || null,
                source: 'manual',
                contact_type: reqContactType || 'UNKNOWN',
                tenant_id,
                last_interaction: new Date(),
                created_by: req.agent?.id || null,
            }
        });

        res.json({ success: true, contact });
    } catch (error) {
        captureRouteError(error, req, { route: 'api#7' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /activity/team — Team activity feed (shares + visits), role-scoped
router.get('/activity/team', async (req, res) => {
    try {
        const { agent_id, from, to, limit: limitStr } = req.query;
        const take = Math.min(parseInt(limitStr as string) || 50, 100);
        const { role, id: userId, tenant_id } = req.agent!;

        const dateFilter: any = {};
        if (from) dateFilter.gte = new Date(from as string);
        if (to) dateFilter.lte = new Date(to as string);

        // Role-based scoping
        let agentFilter: any = {};
        if (agent_id) {
            agentFilter = { agent_id: agent_id as string };
        } else if (role === 'employee') {
            agentFilter = { agent_id: userId };
        }

        const [shares, appointments] = await Promise.all([
            prisma.propertyShare.findMany({
                where: {
                    tenant_id,
                    ...agentFilter,
                    ...(Object.keys(dateFilter).length ? { created_at: dateFilter } : {}),
                },
                include: {
                    inventory: { select: { id: true, type: true, location: true, display_id: true, media_urls: true, display_price: true, price: true } },
                    agent: { select: { id: true, name: true } },
                    contact: { select: { phone_number: true, name: true } },
                },
                orderBy: { created_at: 'desc' },
                take,
            }),
            prisma.appointment.findMany({
                where: {
                    tenant_id,
                    type: 'property_visit',
                    ...(agent_id ? { assigned_to_agent_id: agent_id as string } : role === 'employee' ? { assigned_to_agent_id: userId } : {}),
                    ...(Object.keys(dateFilter).length ? { scheduled_at: dateFilter } : {}),
                },
                include: {
                    contact: { select: { phone_number: true, name: true } },
                    property: { select: { id: true, type: true, location: true, display_id: true } },
                    assigned_to_agent: { select: { id: true, name: true } },
                },
                orderBy: { scheduled_at: 'desc' },
                take,
            }),
        ]);

        res.json({ success: true, shares, appointments });
    } catch (error) {
        captureRouteError(error, req, { route: 'api#8' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /agents - List all agents (managers and super_boss only)
router.get('/agents', requireRole('super_boss', 'manager'), async (_req, res) => {
    try {
        const agents = await prisma.agent.findMany({
            select: {
                id: true, name: true, email: true, phone: true,
                role: true, status: true,
                reports_to: { select: { name: true } },
                _count: { select: { assigned_leads: true } }
            },
            orderBy: { name: 'asc' }
        });
        res.json(agents);
    } catch (error) {
        captureRouteError(error, _req, { route: 'api#9' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /dashboard/stats - Dashboard statistics
router.get('/dashboard/stats', requireRole('super_boss', 'manager'), async (_req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [totalContacts, todayContacts, todayInteractions, activeProperties, hotLeads, contactsByType] = await Promise.all([
            prisma.contact.count(),
            prisma.contact.count({ where: { created_at: { gte: today } } }),
            prisma.interaction.count({ where: { created_at: { gte: today } } }),
            prisma.inventory.count({ where: { status: 'active' } }),
            prisma.contact.count({ where: { lead_status: 'hot' } }),
            prisma.contact.groupBy({ by: ['contact_type'], _count: true })
        ]);

        res.json({
            totalContacts, todayContacts, todayInteractions,
            activeProperties, hotLeads,
            contactsByType: contactsByType.map(t => ({
                contact_type: t.contact_type,
                _count: typeof t._count === 'number' ? t._count : (t._count as any)?._all ?? 0
            }))
        });
    } catch (error) {
        captureRouteError(error, _req, { route: 'api#10' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /leads/by-source — MOVED to routes/leads.ts (includes role-based scoping + latest date)
// GET /leads/recent-external — MOVED to routes/leads.ts (full version with pagination, filters, all fields)

// POST /api/partners - Register a new partner agent (Admin)
router.post('/partners', checkPermission('manage_agents'), async (req, res) => {
    const {
        phone_number, name, email, partner_category,
        business_name, business_address, business_lat, business_lng, registration_number,
        agency_name, partner_type, package_type
    } = req.body;

    // 2026-05-15: Business model is commission-on-sale, not subscription tiers.
    // Only name + phone_number required. Everything else optional — admin team or
    // the partner themselves can fill it later.
    if (!phone_number || !name) {
        return res.status(400).json({
            error: 'Required fields: phone_number, name'
        });
    }
    const resolvedCategory = ['INDIVIDUAL', 'COMPANY'].includes(partner_category) ? partner_category : 'INDIVIDUAL';

    const normalizedPhone = phone_number.startsWith('+') ? phone_number : `+91${phone_number.replace(/^0+/, '')}`;
    try {
        await prisma.contact.upsert({
            where: { phone_number: normalizedPhone },
            create: {
                phone_number: normalizedPhone,
                tenant_id: req.agent!.tenant_id,
                name,
                email: email || null,
                contact_type: 'PARTNER_AGENT',
                source: 'admin_created',
                created_by: req.agent?.id || null,
            },
            update: { contact_type: 'PARTNER_AGENT', name, email: email || undefined }
        });
        const partner = await prisma.partnerAgent.upsert({
            where: { phone_number: normalizedPhone },
            create: {
                phone_number: normalizedPhone,
                name,
                email: email || null,
                partner_category: resolvedCategory,
                business_name: business_name || null,
                business_address: business_address || null,
                business_lat: business_lat != null ? Number(business_lat) : null,
                business_lng: business_lng != null ? Number(business_lng) : null,
                registration_number: registration_number || null,
                managing_agent_id: req.agent!.id,
                onboarded_by_agent_id: req.agent!.id,
                onboarded_at: new Date(),
                agency_name: agency_name || null,
                partner_type: partner_type || 'BOTH',
                package_type: 'FREE',
                listing_limit: 99999,
                verified: true,
                status: 'ACTIVE',
            },
            update: {
                name,
                email: email || undefined,
                partner_category: resolvedCategory,
                business_name: business_name || undefined,
                business_address: business_address || undefined,
                business_lat: business_lat != null ? Number(business_lat) : undefined,
                business_lng: business_lng != null ? Number(business_lng) : undefined,
                registration_number: registration_number || undefined,
                agency_name: agency_name || undefined,
                partner_type: partner_type || undefined,
            }
        });

        // Create Owner record (EXTERNAL) for inventory/commission management.
        // 2026-05-15: listing_limit set to 99999 (effectively unlimited).
        const existingOwner = await prisma.owner.findUnique({ where: { contact_phone: normalizedPhone } });
        if (!existingOwner) {
            const externalType = resolvedCategory === 'COMPANY' ? 'PROPERTY_AGENT' : 'INDIVIDUAL_AGENT';
            await prisma.owner.create({
                data: {
                    contact_phone: normalizedPhone,
                    scope: 'EXTERNAL',
                    externalType: externalType,
                    status: 'ACTIVE',
                    listing_limit: 99999,
                    priority_score: 50,
                }
            });
        }

        await prisma.interaction.create({
            data: {
                tenant_id: req.agent!.tenant_id,
                phone_number: normalizedPhone,
                channel: 'admin',
                direction: 'outbound',
                event_type: 'partner_agent_registered',
                content: `Partner agent registered: ${name} (${partner_category})${business_name ? ' - ' + business_name : ''}`,
                metadata: { created_by: req.agent!.id, partner_category }
            }
        });

        // Send welcome notifications (non-blocking) — include coordinator name
        const coordinatorName = req.agent!.name;
        sendPartnerWelcomeWhatsApp(normalizedPhone, name, partner_category, coordinatorName, package_type)
            .catch(err => console.warn('[PartnerOnboarding] WhatsApp welcome failed:', err.message));
        sendPartnerWelcomeEmail(email, name, partner_category, coordinatorName)
            .catch(err => console.warn('[PartnerOnboarding] Email welcome failed:', err.message));

        res.status(201).json(partner);
    } catch (error) {
        captureRouteError(error, req, { route: 'api#11' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/partners/search?q=<name or phone> - Search partner agents for lead creation
// Accessible to ALL authenticated agents (no manage_agents permission needed)
router.get('/partners/search', async (req: any, res) => {
    try {
        const q = (req.query.q as string || '').trim();
        if (q.length < 2) {
            return res.json([]);
        }

        // Search by name (contains) or phone (starts with / contains digits)
        const isPhoneQuery = /\d{3,}/.test(q.replace(/\D/g, ''));
        const phoneDigits = q.replace(/\D/g, '');

        const partners = await prisma.partnerAgent.findMany({
            where: {
                OR: [
                    { name: { contains: q, mode: 'insensitive' } },
                    ...(isPhoneQuery ? [{ phone_number: { contains: phoneDigits } }] : []),
                ],
            },
            select: {
                id: true,
                phone_number: true,
                name: true,
                email: true,
                company_name: true,
                city: true,
                status: true,
                verified: true,
                package_type: true,
            },
            orderBy: { name: 'asc' },
            take: 10,
        });

        res.json(partners);
    } catch (error) {
        captureRouteError(error, req, { route: 'api#12' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/partners - List partner agents (visibility: super_boss=all, others=own managed)
router.get('/partners', checkPermission('manage_agents'), async (req, res) => {
    try {
        const whereClause: any = {};
        // Non-super_boss only see their managed partners
        if (req.agent!.role !== 'super_boss') {
            whereClause.managing_agent_id = req.agent!.id;
        }
        const partners = await prisma.partnerAgent.findMany({
            where: whereClause,
            orderBy: { created_at: 'desc' },
            include: {
                managing_agent: { select: { name: true, email: true } }
            }
        });
        res.json(partners);
    } catch (error) {
        captureRouteError(error, req, { route: 'api#13' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/partners/:id - Full partner detail (profile + relations + counts) for the profile page.
router.get('/partners/:id', checkPermission('manage_agents'), async (req, res) => {
    const id = req.params.id as string;
    try {
        const partner = await prisma.partnerAgent.findUnique({
            where: { id },
            include: {
                managing_agent: { select: { id: true, name: true, email: true, role: true } },
                sub_agents: { select: { id: true, name: true, phone_number: true, status: true, package_type: true } },
            },
        });
        if (!partner) return res.status(404).json({ error: 'Partner not found' });
        if (req.agent!.role !== 'super_boss' && partner.managing_agent_id !== req.agent!.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const owner = await prisma.owner.findUnique({ where: { contact_phone: partner.phone_number }, select: { id: true } });
        const [leads, listings, commissions] = await Promise.all([
            prisma.contact.count({ where: { referral_partner_id: id } }),
            owner ? prisma.inventory.count({ where: { owner_id: owner.id } }) : Promise.resolve(0),
            prisma.dealCommissionEntry.count({ where: { partner_agent_id: id } }),
        ]);
        res.json({ ...partner, _counts: { leads, listings, commissions } });
    } catch (error) {
        captureRouteError(error, req, { route: 'api#partnerDetail' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/partners/:id - Edit partner identity + business + plan fields.
// Cascades the name to the linked contact + denormalized inventory snapshots.
router.patch('/partners/:id', checkPermission('manage_agents'), async (req, res) => {
    const id = req.params.id as string;
    const { name, email, company_name, city, agency_name,
        business_name, business_address, business_lat, business_lng, registration_number,
        partner_type, partner_category, listing_limit, priority_score,
        commission_rate, subscription_start, subscription_end } = req.body || {};
    try {
        const current = await prisma.partnerAgent.findUnique({
            where: { id },
            select: { name: true, phone_number: true },
        });
        if (!current) return res.status(404).json({ error: 'Partner not found' });

        const data: any = {};
        if (email !== undefined) data.email = email || null;
        if (company_name !== undefined) data.company_name = company_name || null;
        if (agency_name !== undefined) data.agency_name = agency_name || null;
        if (city !== undefined) data.city = city || null;
        if (business_name !== undefined) data.business_name = business_name || null;
        if (business_address !== undefined) data.business_address = business_address || null;
        if (business_lat !== undefined) data.business_lat = (business_lat !== null && business_lat !== '') ? Number(business_lat) : null;
        if (business_lng !== undefined) data.business_lng = (business_lng !== null && business_lng !== '') ? Number(business_lng) : null;
        if (registration_number !== undefined) data.registration_number = registration_number || null;
        if (partner_type !== undefined) data.partner_type = partner_type || null;
        if (partner_category !== undefined) {
            const pc = String(partner_category).toUpperCase();
            if (!['INDIVIDUAL', 'COMPANY'].includes(pc)) return res.status(400).json({ error: 'Invalid partner_category (INDIVIDUAL|COMPANY)' });
            data.partner_category = pc;
        }
        if (listing_limit !== undefined && listing_limit !== null && listing_limit !== '') {
            const v = parseInt(String(listing_limit), 10);
            if (!Number.isNaN(v)) data.listing_limit = v;
        }
        if (priority_score !== undefined && priority_score !== null && priority_score !== '') {
            const v = parseInt(String(priority_score), 10);
            if (!Number.isNaN(v)) data.priority_score = v;
        }
        if (commission_rate !== undefined) {
            data.commission_rate = (commission_rate === null || commission_rate === '') ? null
                : (Number.isNaN(Number(commission_rate)) ? undefined : Number(commission_rate));
        }
        if (subscription_start !== undefined) data.subscription_start = subscription_start ? new Date(subscription_start) : null;
        if (subscription_end !== undefined) data.subscription_end = subscription_end ? new Date(subscription_end) : null;

        const newName = name !== undefined ? (String(name).trim() || null) : undefined;

        await prisma.$transaction(async (tx) => {
            if (Object.keys(data).length > 0) {
                await tx.partnerAgent.update({ where: { id }, data });
            }
            if (newName !== undefined && current.phone_number) {
                await syncContactName(tx, current.phone_number, current.name, newName);
            }
        });

        const partner = await prisma.partnerAgent.findUnique({ where: { id } });
        res.json({ success: true, partner });
    } catch (error) {
        captureRouteError(error, req, { route: 'api#partnerEdit' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/partners/:id/verify - Verify a partner agent
router.patch('/partners/:id/verify', checkPermission('manage_agents'), async (req, res) => {
    const { id } = req.params;
    try {
        const partner = await prisma.partnerAgent.update({
            where: { id },
            data: {
                verified: true,
                status: 'ACTIVE'
            }
        });

        // Also update regular agent record if linked (future proofing)
        // await prisma.agent.updateMany({ where: { phone: partner.phone_number }, ... })

        res.json({ success: true, partner });
    } catch (error) {
        captureRouteError(error, req, { route: 'api#14' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/partners/:id/status - Update partner status
router.patch('/partners/:id/status', checkPermission('manage_agents'), async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const normalized = (status as string)?.toUpperCase();

    if (!['ACTIVE', 'SUSPENDED', 'EXPIRED', 'PENDING_PAYMENT'].includes(normalized)) {
        return res.status(400).json({ error: 'Invalid status. Use: ACTIVE, SUSPENDED, EXPIRED, PENDING_PAYMENT' });
    }

    try {
        const partner = await prisma.partnerAgent.update({
            where: { id },
            data: { status: normalized as any }
        });
        res.json({ success: true, partner });
    } catch (error) {
        captureRouteError(error, req, { route: 'api#15' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/partners/:id/commission - Update partner commission rate
router.patch('/partners/:id/commission', checkPermission('manage_agents'), async (req, res) => {
    const { id } = req.params;
    const { rate } = req.body; // number

    if (typeof rate !== 'number' || rate < 0 || rate > 100) {
        return res.status(400).json({ error: 'Invalid commission rate' });
    }

    try {
        const partner = await prisma.partnerAgent.update({
            where: { id },
            data: { commission_rate: rate }
        });
        res.json({ success: true, partner });
    } catch (error) {
        captureRouteError(error, req, { route: 'api#16' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/partners/:id/category - promote a partner to COMPANY (they get "My Team") or back to INDIVIDUAL.
// TEAM ONLY — 'manage_agents' is a permission partners do NOT have, and this is not in PARTNER_ALLOWLIST.
// Self-registration always lands INDIVIDUAL by design; a partner can never self-grant team powers.
router.patch('/partners/:id/category', checkPermission('manage_agents'), async (req, res) => {
    const id = String(req.params.id);
    const { partner_category } = req.body;

    if (!['INDIVIDUAL', 'COMPANY'].includes(partner_category)) {
        return res.status(400).json({ error: 'Invalid partner_category. Use: INDIVIDUAL, COMPANY' });
    }

    try {
        const target = await prisma.partnerAgent.findUnique({
            where: { id },
            select: { id: true, name: true, parent_partner_id: true, _count: { select: { sub_agents: true } } },
        });
        if (!target) return res.status(404).json({ error: 'Partner not found' });

        // A sub-agent can never become a company owner — that would create a second level of hierarchy,
        // and partnerIdsWithSubAgents() is deliberately ONE level deep.
        if (partner_category === 'COMPANY' && target.parent_partner_id) {
            return res.status(400).json({ error: 'This partner is a team member of another partner and cannot be made a company.' });
        }
        // Demoting an owner who still has members would strand them (they'd stay visible to nobody's roster).
        if (partner_category === 'INDIVIDUAL' && target._count.sub_agents > 0) {
            return res.status(400).json({
                error: `${target.name} still has ${target._count.sub_agents} team member(s). Remove them first.`,
            });
        }

        const partner = await prisma.partnerAgent.update({ where: { id }, data: { partner_category } });
        logger.info(`[PartnerCategory] ${req.agent?.id} set ${id} (${target.name}) -> ${partner_category}`);
        res.json({ success: true, partner });
    } catch (error) {
        captureRouteError(error, req, { route: 'api#partner-category' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/partners/:id/package - Upgrade/change partner plan
router.patch('/partners/:id/package', checkPermission('manage_agents'), async (req, res) => {
    const { id } = req.params;
    const { package_type } = req.body;

    if (!['FREE', 'PRO', 'ADVANCE_PRO'].includes(package_type)) {
        return res.status(400).json({ error: 'Invalid package_type. Use: FREE, PRO, ADVANCE_PRO' });
    }

    const limitMap: Record<string, number> = { FREE: 5, PRO: 25, ADVANCE_PRO: 100 };
    const priorityMap: Record<string, number> = { FREE: 30, PRO: 60, ADVANCE_PRO: 90 };

    try {
        const partner = await prisma.partnerAgent.update({
            where: { id },
            data: {
                package_type,
                listing_limit: limitMap[package_type],
                priority_score: priorityMap[package_type],
                subscription_start: new Date(),
                subscription_end: package_type === 'FREE' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            }
        });
        // Also update owner listing_limit if exists
        try {
            const owner = await prisma.owner.findFirst({ where: { contact_phone: partner.phone_number } });
            if (owner) {
                await prisma.owner.update({
                    where: { id: owner.id },
                    data: { listing_limit: limitMap[package_type], priority_score: priorityMap[package_type] }
                });
            }
        } catch {}
        res.json({ success: true, partner });
    } catch (error) {
        captureRouteError(error, req, { route: 'api#17' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/partners/:id/inventory - View a partner's inventory (managing agent or super_boss)
router.get('/partners/:id/inventory', checkPermission('manage_agents'), async (req, res) => {
    const { id } = req.params;
    try {
        const partner = await prisma.partnerAgent.findUnique({ where: { id } });
        if (!partner) return res.status(404).json({ error: 'Partner not found' });

        // Visibility: managing agent or super_boss only
        if (req.agent!.role !== 'super_boss' && partner.managing_agent_id !== req.agent!.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const owner = await prisma.owner.findUnique({ where: { contact_phone: partner.phone_number } });
        if (!owner) return res.json([]);

        const inventory = await prisma.inventory.findMany({
            where: { owner_id: owner.id },
            orderBy: { created_at: 'desc' }
        });
        res.json(inventory);
    } catch (error) {
        captureRouteError(error, req, { route: 'api#18' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/partners/:id/leads - Contacts/deals referred by this partner.
router.get('/partners/:id/leads', checkPermission('manage_agents'), async (req, res) => {
    const id = req.params.id as string;
    try {
        const partner = await prisma.partnerAgent.findUnique({ where: { id }, select: { managing_agent_id: true } });
        if (!partner) return res.status(404).json({ error: 'Partner not found' });
        if (req.agent!.role !== 'super_boss' && partner.managing_agent_id !== req.agent!.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const leads = await prisma.contact.findMany({
            where: { referral_partner_id: id },
            orderBy: { created_at: 'desc' },
            select: {
                phone_number: true, name: true, contact_type: true, lead_status: true,
                lifecycle_stage: true, preferred_location: true, created_at: true,
                assigned_agent: { select: { name: true } },
            },
        });
        res.json(leads);
    } catch (error) {
        captureRouteError(error, req, { route: 'api#partnerLeads' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/partners/:id/commissions - Commission entries earned by this partner.
router.get('/partners/:id/commissions', checkPermission('manage_agents'), async (req, res) => {
    const id = req.params.id as string;
    try {
        const partner = await prisma.partnerAgent.findUnique({ where: { id }, select: { managing_agent_id: true } });
        if (!partner) return res.status(404).json({ error: 'Partner not found' });
        if (req.agent!.role !== 'super_boss' && partner.managing_agent_id !== req.agent!.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const entries = await prisma.dealCommissionEntry.findMany({
            where: { partner_agent_id: id },
            orderBy: { entered_at: 'desc' },
            select: { id: true, amount: true, currency: true, notes: true, entered_at: true, transaction_id: true },
        });
        const total = entries.reduce((s, e) => s + Number(e.amount), 0);
        res.json({ entries, total });
    } catch (error) {
        captureRouteError(error, req, { route: 'api#partnerCommissions' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /api/partners/:id/set-password - Admin sets the partner portal password.
router.post('/partners/:id/set-password', checkPermission('manage_agents'), async (req, res) => {
    const id = req.params.id as string;
    const { password } = req.body || {};
    if (!password || String(password).length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    try {
        const partner = await prisma.partnerAgent.findUnique({ where: { id }, select: { managing_agent_id: true } });
        if (!partner) return res.status(404).json({ error: 'Partner not found' });
        if (req.agent!.role !== 'super_boss' && partner.managing_agent_id !== req.agent!.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const hash = await bcrypt.hash(String(password), 10);
        await prisma.partnerAgent.update({ where: { id }, data: { password_hash: hash } });
        res.json({ success: true });
    } catch (error) {
        captureRouteError(error, req, { route: 'api#partnerSetPassword' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /api/partners/:id/reassign — Transfer a partner agent (and their owned inventory/contacts/
// transactions) to a different internal manager. Super_boss only.
// Body: { to_agent_id: string, reason?: string }
router.post('/partners/:id/reassign', requireSuperBoss, async (req, res) => {
    const { id } = req.params;
    const { to_agent_id, reason } = req.body as { to_agent_id?: string; reason?: string };
    if (!to_agent_id || typeof to_agent_id !== 'string') {
        return res.status(400).json({ error: 'to_agent_id is required' });
    }
    try {
        const result = await ownershipService.reassignPartner(id, to_agent_id, req.agent!.id, reason);
        logger.info(`[API] Partner ${id} reassigned by super_boss=${req.agent!.id} -> ${to_agent_id}`);
        res.json(result);
    } catch (err) {
        captureRouteError(err, req, { route: 'api#19' });
        const msg = (err as Error).message;
        const status = /not found/i.test(msg) ? 404 : 400;
        res.status(status).json({ error: msg });
    }
});

// GET /api/commissions - List all commissions with agent details (Admin only)
router.get('/commissions', checkPermission('view_reports'), async (_req, res) => {
    try {
        const commissions = await prisma.commission.findMany({
            include: {
                agent: {
                    select: { name: true, phone_number: true, agency_name: true }
                }
            },
            orderBy: { created_at: 'desc' }
        });
        res.json(commissions);
    } catch (error) {
        captureRouteError(error, _req, { route: 'api#20' });
        res.status(500).json({ error: (error as Error).message });
    }
});

export default router;
