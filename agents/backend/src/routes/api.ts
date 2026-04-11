
import { Router } from 'express';
import prisma from '../db';
import { authMiddleware, requireRole, checkPermission } from '../middleware/auth';
import { sendPartnerWelcomeWhatsApp, sendPartnerWelcomeEmail } from '../services/partner_notifications';
import { normalizePhone, phoneVariants } from '../utils/phone';
import { identifyContact } from '../services/contact_identifier';

const router = Router();

// All API routes require authentication
router.use(authMiddleware);

// GET /contacts — Role-scoped: super_boss sees all, manager sees own + subordinates', employee sees own assigned only
router.get('/contacts', async (req, res) => {
    try {
        const agentRole = req.agent!.role;
        const agentId = req.agent!.id;

        let whereClause: any = {};

        if (agentRole === 'employee') {
            // Employee: only contacts assigned to them
            whereClause = { assigned_agent_id: agentId };
        } else if (agentRole === 'manager') {
            // Manager: contacts assigned to them OR their subordinates
            const subordinates = await prisma.agent.findMany({
                where: { reports_to_id: agentId },
                select: { id: true },
            });
            const allowedIds = [agentId, ...subordinates.map(s => s.id)];
            whereClause = { assigned_agent_id: { in: allowedIds } };
        }
        // super_boss: no filter (sees all)

        const contacts = await prisma.contact.findMany({
            where: whereClause,
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
            }
        });

        res.json({ success: true, contact });
    } catch (error) {
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
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /leads/by-source — MOVED to routes/leads.ts (includes role-based scoping + latest date)
// GET /leads/recent-external — MOVED to routes/leads.ts (full version with pagination, filters, all fields)

// POST /api/partners - Register a new partner agent (Admin)
router.post('/partners', checkPermission('manage_agents'), async (req, res) => {
    const {
        phone_number, name, email, partner_category,
        business_name, business_address, registration_number,
        agency_name, partner_type, package_type
    } = req.body;

    // Validate mandatory fields
    if (!phone_number || !name || !email || !partner_category || !business_name || !business_address) {
        return res.status(400).json({
            error: 'Required fields: phone_number, name, email, partner_category, business_name, business_address'
        });
    }
    if (!['INDIVIDUAL', 'COMPANY'].includes(partner_category)) {
        return res.status(400).json({ error: 'partner_category must be INDIVIDUAL or COMPANY' });
    }

    const normalizedPhone = phone_number.startsWith('+') ? phone_number : `+91${phone_number.replace(/^0+/, '')}`;
    try {
        await prisma.contact.upsert({
            where: { phone_number: normalizedPhone },
            create: {
                phone_number: normalizedPhone,
                tenant_id: req.agent!.tenant_id,
                name,
                email,
                contact_type: 'PARTNER_AGENT',
                source: 'admin_created'
            },
            update: { contact_type: 'PARTNER_AGENT', name, email }
        });
        const partner = await prisma.partnerAgent.upsert({
            where: { phone_number: normalizedPhone },
            create: {
                phone_number: normalizedPhone,
                name,
                email,
                partner_category: partner_category,
                business_name,
                business_address,
                registration_number,
                managing_agent_id: req.agent!.id,
                onboarded_by_agent_id: req.agent!.id,
                onboarded_at: new Date(),
                agency_name: agency_name || null,
                partner_type: partner_type || 'HAS_PROPERTIES',
                package_type: package_type || 'FREE',
                verified: true,
                status: 'ACTIVE'
            },
            update: {
                name, email,
                partner_category,
                business_name, business_address, registration_number,
                agency_name: agency_name || null,
                partner_type: partner_type || 'HAS_PROPERTIES'
            }
        });

        // Create Owner record (EXTERNAL) for inventory/commission management
        const existingOwner = await prisma.owner.findUnique({ where: { contact_phone: normalizedPhone } });
        if (!existingOwner) {
            const externalType = partner_category === 'COMPANY' ? 'PROPERTY_AGENT' : 'INDIVIDUAL_AGENT';
            await prisma.owner.create({
                data: {
                    contact_phone: normalizedPhone,
                    scope: 'EXTERNAL',
                    externalType: externalType,
                    status: 'ACTIVE',
                    listing_limit: package_type === 'ADVANCE_PRO' ? 999 : package_type === 'PRO' ? 50 : 10,
                    priority_score: 50
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
        res.status(500).json({ error: (error as Error).message });
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
        res.status(500).json({ error: (error as Error).message });
    }
});

export default router;
