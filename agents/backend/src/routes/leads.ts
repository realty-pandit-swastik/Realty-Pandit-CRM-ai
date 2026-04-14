
import { Router } from 'express';
import { LeadScoreService } from '../services/lead_score';
import { MatchingEngine, buildMatchCriteriaFromLead } from '../services/matching_engine';
import prisma from '../db';
import { normalizePhone } from '../utils/phone';
import { authMiddleware } from '../middleware/auth';
import { geocodeAddress } from '../utils/geocode';
import { sendBuyerConfirmationWhatsApp, sendBuyerConfirmationEmail } from '../services/lead_notifications';
import { ensurePartnerAgent } from '../services/partner_auto_create';
import { notify } from '../services/notify';
import { sendPartnerWelcomeWhatsApp } from '../services/partner_notifications';

const router = Router();
router.use(authMiddleware);
const leadScoreService = new LeadScoreService();
const matchingEngine = new MatchingEngine();

const PRIVILEGED_ROLES = ['super_boss', 'manager'];

/** Normalize phone but preserve TEMP_ placeholder phones (partner referral leads without phone) */
function resolvePhone(raw: string): string {
    if (raw.startsWith('TEMP_')) return raw;
    return normalizePhone(raw);
}

// GET /api/leads/by-source
// Groups contacts by source with counts (scoped by role)
router.get('/by-source', async (req: any, res) => {
    try {
        const isPrivileged = PRIVILEGED_ROLES.includes(req.agent.role);
        const roleWhere = isPrivileged ? {} : { assigned_agent_id: req.agent.id };

        const grouped = await prisma.contact.groupBy({
            by: ['source'],
            where: roleWhere,
            _count: true,
            orderBy: { _count: { source: 'desc' } },
        });

        const result = await Promise.all(
            grouped.map(async (g) => {
                const latest = await prisma.contact.findFirst({
                    where: { source: g.source, ...roleWhere },
                    orderBy: { created_at: 'desc' },
                    select: { created_at: true },
                });
                return {
                    source: g.source,
                    _count: g._count,
                    latest: latest?.created_at?.toISOString() || null,
                };
            })
        );

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/leads/recent-external
// Returns leads. Super boss/manager see all; employees see only their assigned leads.
router.get('/recent-external', async (req: any, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 500;
        const source = req.query.source as string | undefined;
        const status = req.query.status as string | undefined;
        const bhk = req.query.bhk as string | undefined;
        const category = req.query.category as string | undefined;
        const location = req.query.location as string | undefined;
        const agentId = req.query.agent_id as string | undefined;
        // New filter params (v2 filter redesign)
        const intent = req.query.intent as string | undefined;           // BUYER | TENANT
        const categoryId = req.query.category_id as string | undefined;
        const subCategoryId = req.query.sub_category_id as string | undefined;
        const typeId = req.query.type_id as string | undefined;
        const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
        const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
        const radiusKm = req.query.radius_km ? parseFloat(req.query.radius_km as string) : 2;
        const notContactedDays = req.query.not_contacted_days ? parseInt(req.query.not_contacted_days as string) : undefined;
        const noShowcaseDays = req.query.no_showcase_days ? parseInt(req.query.no_showcase_days as string) : undefined;

        const isPrivileged = PRIVILEGED_ROLES.includes(req.agent.role);

        const where: any = {
            contact_type: { notIn: ['LANDLORD', 'MANAGEMENT', 'PARTNER_AGENT'] },
        };

        // Role-based visibility
        if (!isPrivileged) {
            where.assigned_agent_id = req.agent.id;
        }

        // Source filter — when specified use it; when not, show all
        if (source) {
            where.source = source;
        }

        if (status) where.lead_status = status;

        // Advanced filters
        if (bhk) {
            const bhkValues = bhk.split(',').map(v => parseInt(v.trim(), 10)).filter(n => !isNaN(n));
            if (bhkValues.length > 0) where.demand_bhk = { in: bhkValues };
        }
        if (category) {
            where.property_type = { contains: category, mode: 'insensitive' };
        }
        if (location) {
            where.preferred_location = { contains: location, mode: 'insensitive' };
        }
        if (agentId) {
            where.assigned_agent_id = agentId;
        }

        // Intent filter (contact_type: BUYER or TENANT)
        if (intent === 'BUYER' || intent === 'TENANT') {
            where.contact_type = intent;
        }

        // Classification ID filters
        if (categoryId) where.category_id = categoryId;
        if (subCategoryId) where.sub_category_id = subCategoryId;
        if (typeId) where.type_id = typeId;

        // Proximity filter — Haversine on preferred_lat/preferred_lng
        if (lat !== undefined && lng !== undefined) {
            const radius = radiusKm > 0 ? radiusKm : 2;
            const nearbyPhones = await prisma.$queryRaw<{ phone_number: string }[]>`
                SELECT phone_number FROM contacts
                WHERE preferred_lat IS NOT NULL AND preferred_lng IS NOT NULL
                AND (6371 * acos(
                    LEAST(1.0,
                        cos(radians(${lat})) * cos(radians(preferred_lat::float))
                        * cos(radians(preferred_lng::float) - radians(${lng}))
                        + sin(radians(${lat})) * sin(radians(preferred_lat::float))
                    )
                )) <= ${radius}
            `;
            const nearbyPhoneList = nearbyPhones.map((r: { phone_number: string }) => r.phone_number);
            if (where.AND) {
                where.AND.push({ phone_number: { in: nearbyPhoneList } });
            } else {
                where.AND = [{ phone_number: { in: nearbyPhoneList } }];
            }
        }

        // Staleness: not contacted in X days
        if (notContactedDays && notContactedDays > 0) {
            const cutoff = new Date(Date.now() - notContactedDays * 24 * 60 * 60 * 1000);
            const cond = { OR: [{ last_interaction: null }, { last_interaction: { lt: cutoff } }] };
            if (where.AND) where.AND.push(cond);
            else where.AND = [cond];
        }

        // Staleness: no property showcased (PropertyShare) in X days
        if (noShowcaseDays && noShowcaseDays > 0) {
            const cutoff = new Date(Date.now() - noShowcaseDays * 24 * 60 * 60 * 1000);
            const recentlyShowcased = await prisma.propertyShare.findMany({
                where: { created_at: { gte: cutoff } },
                select: { client_phone: true },
                distinct: ['client_phone'],
            });
            const showcasedPhones = recentlyShowcased.map((s: { client_phone: string }) => s.client_phone);
            if (showcasedPhones.length > 0) {
                const cond = { phone_number: { notIn: showcasedPhones } };
                if (where.AND) where.AND.push(cond);
                else where.AND = [cond];
            }
        }

        const [leads, total] = await Promise.all([
            prisma.contact.findMany({
                where,
                orderBy: { created_at: 'desc' },
                take: limit,
                skip: (page - 1) * limit,
                select: {
                    phone_number: true,
                    name: true,
                    email: true,
                    source: true,
                    lead_status: true,
                    contact_type: true,
                    intent: true,
                    property_type: true,
                    preferred_location: true,
                    preferred_lat: true,
                    preferred_lng: true,
                    lifecycle_stage: true,
                    created_at: true,
                    notes: true,
                    assigned_agent_id: true,
                    budget_min: true,
                    budget_max: true,
                    demand_bhk: true,
                    category_id: true,
                    sub_category_id: true,
                    type_id: true,
                    lead_score: { select: { total_score: true } },
                    timeline: true,
                    lead_type: true,
                    referral_partner_name: true,
                    referral_partner_phone: true,
                },
            }),
            prisma.contact.count({ where }),
        ]);

        res.json({ leads, total, page, limit });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/leads/:phone/status
// Update a lead's status
router.patch('/:phone/status', async (req, res) => {
    try {
        const phone = resolvePhone(req.params.phone);
        const { lead_status, lifecycle_stage, notes } = req.body;

        const updateData: any = {};
        if (lead_status) updateData.lead_status = lead_status;
        if (lifecycle_stage) updateData.lifecycle_stage = lifecycle_stage;
        if (notes !== undefined) updateData.notes = notes;

        const contact = await prisma.contact.update({
            where: { phone_number: phone },
            data: updateData,
            select: { phone_number: true, name: true, lead_status: true, assigned_agent_id: true },
        });

        // Notify assigned agent about status change
        if (lead_status && contact.assigned_agent_id) {
            const assignedAgent = await prisma.agent.findUnique({ where: { id: contact.assigned_agent_id }, select: { id: true, phone: true, email: true, name: true } });
            if (assignedAgent) {
                notify('lead_status_changed', [{ id: assignedAgent.id, type: 'agent', phone: assignedAgent.phone, email: assignedAgent.email || undefined, name: assignedAgent.name }], {
                    name: contact.name || 'Lead', phone: contact.phone_number, new_status: lead_status,
                });
            }
        }

        res.json(contact);
    } catch (error: any) {
        if (error?.code === 'P2025') {
            return res.status(404).json({ error: 'Lead not found' });
        }
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/leads/search?q=<string>
// Universal contact search — returns contacts + partner agents matching name/phone
router.get('/search', async (req: any, res) => {
    const q = (req.query.q as string || '').trim();
    if (q.length < 2) return res.json([]);

    try {
        const isPhone = /\d{3,}/.test(q.replace(/\D/g, ''));
        const phoneDigits = q.replace(/\D/g, '');

        const [contacts, partners] = await Promise.all([
            prisma.contact.findMany({
                where: {
                    contact_type: { notIn: ['MANAGEMENT'] },
                    OR: [
                        { name: { contains: q, mode: 'insensitive' } },
                        ...(isPhone ? [{ phone_number: { contains: phoneDigits } }] : []),
                    ],
                },
                select: {
                    phone_number: true, name: true, contact_type: true,
                    lead_status: true, lead_type: true, source: true, lifecycle_stage: true,
                },
                orderBy: { updated_at: 'desc' },
                take: 10,
            }),
            prisma.partnerAgent.findMany({
                where: {
                    OR: [
                        { name: { contains: q, mode: 'insensitive' } },
                        ...(isPhone ? [{ phone_number: { contains: phoneDigits } }] : []),
                    ],
                },
                select: { phone_number: true, name: true },
                take: 5,
            }),
        ]);

        // Merge: contacts take priority; skip partner if same phone already in contacts
        const contactPhones = new Set(contacts.map((c: any) => c.phone_number));
        const partnerResults = partners
            .filter((p: any) => !contactPhones.has(p.phone_number))
            .map((p: any) => ({
                phone_number: p.phone_number, name: p.name,
                contact_type: 'PARTNER_AGENT', lead_status: null, lead_type: null,
                source: null, lifecycle_stage: null, isPartnerAgent: true,
            }));

        const contactResults = contacts.map((c: any) => ({ ...c, isPartnerAgent: false }));
        const merged = [...contactResults, ...partnerResults].slice(0, 10);
        res.json(merged);
    } catch (error: any) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /api/leads
// Create a new lead manually
// Auto-assigns to the creating agent unless they are super_boss/manager
router.post('/', async (req: any, res) => {
    try {
        const {
            name, phone, email, source, intent, property_type,
            preferred_location, preferred_lat, preferred_lng,
            category_id, sub_category_id, type_id,
            notes, assigned_agent_id,
            lead_type, referral_partner_phone, referral_partner_name,
            budget_min, budget_max, demand_bhk, timeline,
        } = req.body;

        // Partner referral leads require name; direct leads require phone
        const isPartnerReferral = lead_type === 'PARTNER_REFERRAL';

        if (!isPartnerReferral && !phone) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        if (isPartnerReferral && !name?.trim()) {
            return res.status(400).json({ error: 'Client name is required for partner referral leads' });
        }

        // Validate intent
        if (intent && !['buy', 'rent'].includes(intent)) {
            return res.status(400).json({ error: 'Intent must be "buy" or "rent"' });
        }

        // For partner referral without phone, generate a temporary placeholder
        let phoneNumber: string;
        let isTemporaryPhone = false;

        if (phone) {
            const normalized = normalizePhone(phone);
            if (!normalized) {
                return res.status(400).json({ error: 'Invalid phone number format' });
            }
            phoneNumber = normalized;
        } else {
            // Generate unique temp ID: TEMP_<timestamp>_<random>
            phoneNumber = `TEMP_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            isTemporaryPhone = true;
        }

        // Check if contact already exists (skip for temp phones)
        if (!isTemporaryPhone) {
            const existing = await prisma.contact.findUnique({
                where: { phone_number: phoneNumber },
            });

            if (existing) {
                return res.status(409).json({ error: 'Lead with this phone number already exists' });
            }
        }

        // Get tenant
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) {
            return res.status(500).json({ error: 'System not configured' });
        }

        // Auto-assign: privileged users can specify an agent; employees are auto-assigned to themselves
        const isPrivileged = PRIVILEGED_ROLES.includes(req.agent.role);
        const resolvedAgentId = isPrivileged
            ? (assigned_agent_id || null)
            : req.agent.id;

        // Partner referral: auto-create partner if not registered
        let resolvedPartnerId: string | null = null;
        let partnerWasCreated = false;
        let partnerPhone: string | null = null;

        if (lead_type === 'PARTNER_REFERRAL' && referral_partner_phone) {
            try {
                const result = await ensurePartnerAgent(
                    referral_partner_phone,
                    referral_partner_name || 'Partner Agent',
                    tenant.id,
                    req.agent.id
                );
                resolvedPartnerId = result.partnerId;
                partnerWasCreated = result.wasCreated;
                partnerPhone = result.partnerPhone;
            } catch (partnerErr) {
                // Non-fatal — log and continue without partner link
                console.warn('[Leads] Partner auto-create failed:', (partnerErr as Error).message);
            }
        }

        const contact = await prisma.contact.create({
            data: {
                phone_number: phoneNumber,
                tenant_id: tenant.id,
                name: name || null,
                email: email || null,
                source: source || 'manual',
                intent: intent || null,
                contact_type: intent === 'buy' ? 'BUYER' : intent === 'rent' ? 'TENANT' : 'UNKNOWN',
                property_type: property_type || null,
                preferred_location: preferred_location || null,
                preferred_lat: preferred_lat ? Number(preferred_lat) : null,
                preferred_lng: preferred_lng ? Number(preferred_lng) : null,
                category_id: category_id || null,
                sub_category_id: sub_category_id || null,
                type_id: type_id || null,
                notes: isTemporaryPhone ? `${notes ? notes + ' | ' : ''}[Partner referral — phone not provided yet]` : (notes || null),
                lead_status: isPartnerReferral ? 'warm' : 'cold',
                lifecycle_stage: 'NEW',
                assigned_agent_id: resolvedAgentId,
                lead_type: lead_type || null,
                referral_partner_id: resolvedPartnerId,
                referral_partner_name: referral_partner_name || null,
                referral_partner_phone: referral_partner_phone || null,
                budget_min: budget_min ? Number(budget_min) : null,
                budget_max: budget_max ? Number(budget_max) : null,
                demand_bhk: demand_bhk ? Number(demand_bhk) : null,
                timeline: timeline || null,
                created_by: req.agent?.id || null,
            },
        });

        // Notify buyer immediately (fire-and-forget) — skip if temp phone (partner referral without contact)
        if (!isTemporaryPhone) {
            sendBuyerConfirmationWhatsApp(contact.phone_number, contact.name, 'manual')
                .catch(err => console.warn('[Leads] Buyer WA failed:', (err as Error).message));
        }
        if (contact.email) {
            sendBuyerConfirmationEmail(contact.email, contact.name)
                .catch(err => console.warn('[Leads] Buyer email failed:', (err as Error).message));
        }

        // Notify newly auto-created partner (fire-and-forget)
        if (partnerWasCreated && partnerPhone) {
            sendPartnerWelcomeWhatsApp(partnerPhone, referral_partner_name || 'Partner Agent', 'INDIVIDUAL', req.agent.name)
                .catch(err => console.warn('[Leads] Partner WA failed:', (err as Error).message));
        }

        // Also write to Lead table (new normalized demand table)
        try {
            await prisma.lead.create({
                data: {
                    contact_phone: phoneNumber,
                    tenant_id: tenant.id,
                    intent: intent || null,
                    source: 'manual',
                    budget_min: budget_min ? parseFloat(budget_min) : null,
                    budget_max: budget_max ? parseFloat(budget_max) : null,
                    demand_bhk: demand_bhk ? Number(demand_bhk) : null,
                    demand_type_slug: property_type || null,
                    preferred_location: preferred_location || null,
                    preferred_lat: preferred_lat ? Number(preferred_lat) : null,
                    preferred_lng: preferred_lng ? Number(preferred_lng) : null,
                    category_id: category_id || null,
                    sub_category_id: sub_category_id || null,
                    type_id: type_id || null,
                    lead_status: isPartnerReferral ? 'warm' : 'cold',
                    lifecycle_stage: 'NEW',
                    assigned_agent_id: resolvedAgentId,
                    created_by: req.agent.id,
                    lead_type: lead_type || null,
                    referral_partner_id: resolvedPartnerId || null,
                    referral_partner_name: referral_partner_name || null,
                    referral_partner_phone: referral_partner_phone || null,
                    notes: isTemporaryPhone ? `${notes ? notes + ' | ' : ''}[Partner referral — phone not provided yet]` : (notes || null),
                    timeline: timeline || null,
                },
            });
            // Wire lead_id into lead_scores so scoring is connected to this lead
            try {
                await prisma.$executeRaw`
                    UPDATE lead_scores
                    SET lead_id = (SELECT id FROM leads WHERE contact_phone = ${phoneNumber} AND tenant_id = ${tenant.id} ORDER BY created_at DESC LIMIT 1)
                    WHERE phone_number = ${phoneNumber} AND lead_id IS NULL
                `;
            } catch (scoreErr) {
                console.warn('[leads.ts] lead_scores lead_id link failed:', (scoreErr as Error).message);
            }
        } catch (leadErr) {
            // Non-fatal: log but don't block the response
            console.error('[leads.ts] Failed to write Lead record:', leadErr);
        }

        res.status(201).json(contact);
    } catch (error: any) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ error: 'Lead with this phone number already exists' });
        }
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/leads/:phone/score
router.get('/:phone/score', async (req, res) => {
    try {
        const phone = resolvePhone(req.params.phone);
        const score = await prisma.leadScore.findUnique({
            where: { phone_number: phone },
            include: { contact: true }
        });

        if (!score) {
            return res.status(404).json({ error: 'Lead score not found' });
        }
        res.json(score);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /api/leads/:phone/no-show
router.post('/:phone/no-show', async (req, res) => {
    try {
        const phone = resolvePhone(req.params.phone);

        const contact = await prisma.contact.findUnique({ where: { phone_number: phone } });
        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        await leadScoreService.handleNoShow(phone);

        const score = await prisma.leadScore.findUnique({ where: { phone_number: phone } });
        res.json({
            status: 'success',
            message: 'No-Show recorded. Penalty applied.',
            new_score: score
        });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/leads/:phone
// Full lead detail: contact + score + recent interactions
router.get('/:phone', async (req, res) => {
    try {
        const phone = resolvePhone(req.params.phone);
        const [contact, interactions] = await Promise.all([
            prisma.contact.findUnique({
                where: { phone_number: phone },
                include: { lead_score: true },
            }),
            prisma.interaction.findMany({
                where: { phone_number: phone },
                orderBy: { created_at: 'desc' },
                take: 10,
                select: { id: true, channel: true, direction: true, event_type: true, content: true, created_at: true, metadata: true },
            }),
        ]);

        if (!contact) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        res.json({ ...contact, recent_interactions: interactions });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /api/leads/:phone/match
// Run MatchingEngine for a lead — uses Haversine if lat/lng available
router.post('/:phone/match', async (req, res) => {
    try {
        const phone = resolvePhone(req.params.phone);
        const contact = await prisma.contact.findUnique({ where: { phone_number: phone } });

        if (!contact) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        // Try Lead table first (new path)
        const latestLead = await prisma.lead.findFirst({
            where: {
                contact_phone: phone,
                lifecycle_stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
            },
            orderBy: { updated_at: 'desc' },
        });

        let criteria: any;
        if (latestLead) {
            criteria = buildMatchCriteriaFromLead(latestLead);
        } else {
            // Fallback: build from Contact fields (backward compat)
            criteria = {
                intent: contact.intent,
                property_type: contact.property_type,
                type_id: contact.type_id,
                category_id: contact.category_id,
                budget_min: contact.budget_min ? Number(contact.budget_min) : null,
                budget_max: contact.budget_max ? Number(contact.budget_max) : null,
                preferred_location: contact.preferred_location,
                preferred_lat: contact.preferred_lat,
                preferred_lng: contact.preferred_lng,
                bhk: contact.demand_bhk,
            };
        }

        const matches = await matchingEngine.findMatches(criteria, 10);

        // Advance lifecycle to MATCHED if still in early stages
        if (['NEW', 'QUALIFIED'].includes(contact.lifecycle_stage || 'NEW')) {
            await prisma.contact.update({
                where: { phone_number: phone },
                data: { lifecycle_stage: 'MATCHED' },
            });
        }

        res.json({ criteria, matches });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/leads/:phone/assign
// Assign a lead to an agent
router.patch('/:phone/assign', async (req, res) => {
    try {
        const phone = resolvePhone(req.params.phone);
        const { agent_id } = req.body;

        const contact = await prisma.contact.update({
            where: { phone_number: phone },
            data: { assigned_agent_id: agent_id || null },
            select: { phone_number: true, assigned_agent_id: true, name: true },
        });

        // Notify assigned agent
        if (agent_id) {
            const assignedAgent = await prisma.agent.findUnique({ where: { id: agent_id }, select: { id: true, phone: true, email: true, name: true } });
            if (assignedAgent) {
                notify('lead_assigned', [{ id: assignedAgent.id, type: 'agent', phone: assignedAgent.phone, email: assignedAgent.email || undefined, name: assignedAgent.name }], {
                    name: contact.name || 'Unknown', phone: contact.phone_number,
                });
            }
        }

        res.json(contact);
    } catch (error: any) {
        if (error?.code === 'P2025') {
            return res.status(404).json({ error: 'Lead not found' });
        }
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/leads/:phone/session
// Return the most recent ConversationSession answers for a lead (for admin to see what buyer said)
router.get('/:phone/session', async (req, res) => {
    try {
        const phone = resolvePhone(req.params.phone);
        const session = await prisma.conversationSession.findFirst({
            where: { phone_number: phone },
            orderBy: { updated_at: 'desc' },
            select: { workflow: true, state: true, context: true, active: true, updated_at: true },
        });
        if (!session) return res.json({ answers: null });
        const answers = (session.context as any)?.answers || null;
        res.json({ workflow: session.workflow, state: session.state, active: session.active, updated_at: session.updated_at, answers });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/leads/:phone/requirements
// Update buyer requirements including geo location and classification IDs
router.patch('/:phone/requirements', async (req, res) => {
    try {
        const phone = resolvePhone(req.params.phone);
        const {
            budget_min, budget_max, demand_bhk,
            preferred_location, preferred_lat, preferred_lng,
            category_id, sub_category_id, type_id,
            lifecycle_stage, notes, timeline, intent,
            area_min, area_max, area_unit, demand_amenities,
        } = req.body;

        const updateData: any = {};
        if (budget_min !== undefined) updateData.budget_min = budget_min ? Number(budget_min) : null;
        if (budget_max !== undefined) updateData.budget_max = budget_max ? Number(budget_max) : null;
        if (demand_bhk !== undefined) updateData.demand_bhk = demand_bhk ? Number(demand_bhk) : null;
        if (preferred_location !== undefined) updateData.preferred_location = preferred_location || null;
        if (preferred_lat !== undefined) updateData.preferred_lat = preferred_lat !== null ? Number(preferred_lat) : null;
        if (preferred_lng !== undefined) updateData.preferred_lng = preferred_lng !== null ? Number(preferred_lng) : null;
        if (category_id !== undefined) updateData.category_id = category_id || null;
        if (sub_category_id !== undefined) updateData.sub_category_id = sub_category_id || null;
        if (type_id !== undefined) updateData.type_id = type_id || null;
        if (lifecycle_stage !== undefined) updateData.lifecycle_stage = lifecycle_stage;
        if (notes !== undefined) updateData.notes = notes;
        if (timeline !== undefined) updateData.timeline = timeline || null;
        if (intent !== undefined) updateData.intent = intent || null;
        if (area_min !== undefined) updateData.area_min = area_min ? Number(area_min) : null;
        if (area_max !== undefined) updateData.area_max = area_max ? Number(area_max) : null;
        if (area_unit !== undefined) updateData.area_unit = area_unit || null;
        if (demand_amenities !== undefined) updateData.demand_amenities = demand_amenities || null;

        // Auto-geocode if location updated but lat/lng not explicitly provided
        if (preferred_location && preferred_lat === undefined && preferred_lng === undefined) {
            const geo = await geocodeAddress(preferred_location);
            if (geo) {
                updateData.preferred_lat = geo.lat;
                updateData.preferred_lng = geo.lng;
            }
        }

        const contact = await prisma.contact.update({
            where: { phone_number: phone },
            data: updateData,
        });

        res.json(contact);
    } catch (error: any) {
        if (error?.code === 'P2025') {
            return res.status(404).json({ error: 'Lead not found' });
        }
        res.status(500).json({ error: (error as Error).message });
    }
});

export default router;
