
import { Router } from 'express';
import { LeadScoreService } from '../services/lead_score';
import { MatchingEngine, buildMatchCriteriaFromLead } from '../services/matching_engine';
import prisma from '../db';
import { normalizePhone, resolveStoredContactPhone, isPlaceholderPhone } from '../utils/phone';
import { resolveDemandSlugs } from '../utils/classification';
import { resolveTypeFilter } from '../utils/demand_taxonomy';
import { foldLegacyDemand, mergeDemandSchemaValues, bhkFromString } from '../utils/demand_canonical';
import { expandTaxonomyNodeIds } from '../utils/taxonomy_filter';
import { authMiddleware, checkPermission } from '../middleware/auth';
import { geocodeAddress } from '../utils/geocode';
import { sendBuyerConfirmationWhatsApp, sendBuyerConfirmationEmail } from '../services/lead_notifications';
import { ensurePartnerAgent } from '../services/partner_auto_create';
import { ensureDealForLead } from '../services/ensure_deal';
import { notify } from '../services/notify';
import { sendPartnerWelcomeWhatsApp } from '../services/partner_notifications';
import { syncContactName } from '../services/contact_identity';

const router = Router();
router.use(authMiddleware);
const leadScoreService = new LeadScoreService();
const matchingEngine = new MatchingEngine();

import { buildContactVisibilityFilter, buildFullContactVisibilityFilter } from '../middleware/contact_visibility';
import { captureRouteError } from '../utils/capture';
import logger from '../utils/logger';

const PRIVILEGED_ROLES = ['super_boss', 'manager'];

/**
 * Resolve a :phone route param to the ACTUAL stored Contact PK so leads written
 * in any historical format (bare 10-digit, 91-prefixed, 99acres `+91-` dash)
 * still open instead of throwing "Could Not Load Lead". Falls back to the
 * normalized form when no contact matches, so each route's own not-found 404
 * still fires. Preserves TEMP_ placeholder phones.
 * See docs/plans/2026-05-17-website-phone-normalization-fix.md
 */
async function resolvePhone(raw: string): Promise<string> {
    if (isPlaceholderPhone(raw)) return raw;  // TEMP_ / PENDING- placeholders: exact-match, never normalize
    const stored = await resolveStoredContactPhone(raw, prisma);
    return stored ?? normalizePhone(raw);
}

// GET /api/leads/by-source
// Groups contacts by source with counts (scoped by role)
router.get('/by-source', async (req: any, res) => {
    try {
        // Visibility (2026-06-27): counts must match the list — manager = team, employee = own,
        // super_boss = all. Use the same team-aware filter instead of "manager sees everything".
        const roleWhere = buildContactVisibilityFilter(req.agent.id, req.agent.role);

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
        captureRouteError(error, req, { route: 'leads#1' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/leads/recent-external
// Returns leads. Super boss/manager see all; employees see only their assigned leads.
/**
 * PARTNER lead scoping (2026-07-12).
 * A partner may ONLY see/work the leads THEY referred (Contact.referral_partner_id), incl. their
 * company sub-agents'. Never a team lead, never another partner's.
 */
/**
 * Apply the partner lead scope by MUTATING `where` — push into `where.AND`, never assign.
 *
 * ⚠ SECURITY: the previous version RETURNED a where-fragment that the caller merged with
 * `Object.assign(where, ...)`. That sets a TOP-LEVEL `where.OR`, while every other filter in this
 * endpoint pushes into `where.AND`. The moment any filter also sets `where.OR`, one clobbers the
 * other — and if the partner scope is the one clobbered, the partner sees EVERY LEAD IN THE SYSTEM.
 * Pushing an AND-ed OR-group is the only composable form. (2026-07-13)
 */
async function applyPartnerLeadScope(req: any, where: any): Promise<void> {
    if (req.agent?.role !== 'partner') return;
    const { partnerIdsWithSubAgents, partnerLeadOr } = await import('../utils/partner_scope');
    const { ids } = await partnerIdsWithSubAgents(req.agent.id);
    where.AND = [...(where.AND || []), { OR: partnerLeadOr(ids) }];
}

/**
 * Guard for per-lead routes: 403 unless this partner REFERRED the lead or was ASSIGNED it.
 * No-op for team members.
 */
async function partnerOwnsLeadOr403(req: any, res: any, phone: string): Promise<boolean> {
    if (req.agent?.role !== 'partner') return true;
    const pa = await prisma.partnerAgent.findUnique({ where: { id: req.agent.id }, select: { status: true } });
    if (!pa || pa.status !== 'ACTIVE') {
        res.status(403).json({ error: 'Partner account is not active' });
        return false;
    }
    const { partnerIdsWithSubAgents } = await import('../utils/partner_scope');
    const { ids } = await partnerIdsWithSubAgents(req.agent.id);
    const c = await prisma.contact.findUnique({
        where: { phone_number: phone },
        select: { referral_partner_id: true, partner_assignee_id: true },
    });
    const mine = !!c && (
        (!!c.referral_partner_id && ids.includes(c.referral_partner_id))
        || (!!c.partner_assignee_id && ids.includes(c.partner_assignee_id))
    );
    if (!mine) {
        res.status(403).json({ error: 'You can only work leads that are yours.' });
        return false;
    }
    return true;
}

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
        const taxonomyNodeIds = req.query.taxonomy_node_ids as string | undefined;
        const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
        const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
        const radiusKm = req.query.radius_km ? parseFloat(req.query.radius_km as string) : 2;
        const notContactedDays = req.query.not_contacted_days ? parseInt(req.query.not_contacted_days as string) : undefined;
        const noShowcaseDays = req.query.no_showcase_days ? parseInt(req.query.no_showcase_days as string) : undefined;
        // 2026-05-13: search param wired (was previously unused, frontend filtered client-side)
        const search = (req.query.search as string | undefined)?.trim();
        // 2026-05-13: active/archived/all toggle. Default behavior excludes lost+closed so
        // the team only sees workable leads. Pass 'archived' to see lost/closed, 'all' for everything.
        const activeFilter = (req.query.active as string | undefined) || 'active';

        const visibilityFilter = buildContactVisibilityFilter(req.agent.id, req.agent.role);

        const where: any = {
            contact_type: { notIn: ['LANDLORD', 'MANAGEMENT', 'PARTNER_AGENT'] },
            // PARTNER: the team visibility filter is assigned-agent based and would always yield zero
            // for an external partner (they're not an Agent). Their scope is `referral_partner_id`,
            // applied below via partnerLeadWhere().
            ...(req.agent?.role === 'partner' ? {} : visibilityFilter),
        };

        // Source filter — when specified use it; when not, show all
        if (source) {
            where.source = source;
        }

        // Explicit status param wins over active/archived toggle
        if (status) {
            where.lead_status = status;
        } else if (activeFilter === 'active') {
            where.lead_status = { notIn: ['lost', 'closed'] };
        } else if (activeFilter === 'archived') {
            where.lead_status = { in: ['lost', 'closed'] };
        }
        // activeFilter === 'all' → no lead_status constraint

        // Search across name + phone (handles raw digits, +91 prefix, spaces, dashes)
        if (search) {
            const { extractSearchDigits, phoneVariants } = await import('../utils/phone');
            const digits = extractSearchDigits(search);
            const orClauses: any[] = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
            ];
            if (digits) {
                // Try the 3 standard variants AND a contains-on-digits fallback
                for (const variant of phoneVariants(digits)) {
                    orClauses.push({ phone_number: { contains: variant } });
                }
                orClauses.push({ phone_number: { contains: digits } });
            }
            if (where.AND) where.AND.push({ OR: orClauses });
            else where.AND = [{ OR: orClauses }];
        }

        // Advanced filters
        if (bhk) {
            // `demand_bhk` column dropped 2026-05-29 — BHK now lives in
            // demand_schema_values.bhk (string-typed: "1","2","1 RK","8+"). Filtering on the
            // dropped column 500'd the whole leads list. Match the canonical JSON path instead.
            const bhkValues = bhk.split(',').map(v => parseInt(v.trim(), 10)).filter(n => !isNaN(n));
            if (bhkValues.length > 0) {
                const bhkOr = bhkValues.map(v => ({ demand_schema_values: { path: ['bhk'], equals: String(v) } }));
                if (where.AND) where.AND.push({ OR: bhkOr });
                else where.AND = [{ OR: bhkOr }];
            }
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

        // PARTNER: only their own leads (referred by OR assigned to them / their sub-agents).
        // Mutates `where.AND` — must never Object.assign a top-level OR here (see the helper).
        await applyPartnerLeadScope(req, where);

        // Budget filter (#3, 2026-06-28): budget_min / budget_max (₹) on the lead's stated max budget.
        {
            const budgetMin = req.query.budget_min ? parseFloat(String(req.query.budget_min)) : NaN;
            const budgetMax = req.query.budget_max ? parseFloat(String(req.query.budget_max)) : NaN;
            if (!isNaN(budgetMin) || !isNaN(budgetMax)) {
                const bWhere: any = {};
                if (!isNaN(budgetMin)) bWhere.gte = budgetMin;
                if (!isNaN(budgetMax)) bWhere.lte = budgetMax;
                where.budget_max = bWhere;
            }
        }

        // Intent filter (contact_type: BUYER or TENANT)
        if (intent === 'BUYER' || intent === 'TENANT') {
            where.contact_type = intent;
        }

        // Classification ID filters (legacy)
        if (categoryId) where.category_id = categoryId;
        if (subCategoryId) where.sub_category_id = subCategoryId;
        if (typeId) where.type_id = typeId;

        // Taxonomy filter (new tree): demand contact's node IN (selected + descendants).
        if (taxonomyNodeIds && taxonomyNodeIds.trim()) {
            const expanded = await expandTaxonomyNodeIds(taxonomyNodeIds.split(',').map(s => s.trim()).filter(Boolean));
            if (expanded.length) where.demand_taxonomy_node_id = { in: expanded };
        }

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

        // Sorting (2026-07-22): this list is paginated (500 of ~4,900), so ordering MUST run
        // server-side — re-sorting the loaded page would only rank an arbitrary slice.
        // Default stays created_at desc ("latest on top"); the UI does not persist a choice,
        // so a refresh always returns here.
        const LEAD_SORTS: Record<string, (d: 'asc' | 'desc') => any> = {
            name:        d => ({ name: { sort: d, nulls: 'last' } }),
            phone:       d => ({ phone_number: d }),
            source:      d => ({ source: d }),
            status:      d => ({ lead_status: d }),
            assigned_to: d => ({ assigned_agent: { name: d } }),
            budget:      d => ({ budget_max: { sort: d, nulls: 'last' } }),
            score:       d => ({ lead_score: { total_score: d } }),
            intent:      d => ({ intent: { sort: d, nulls: 'last' } }),
            location:    d => ({ preferred_location: { sort: d, nulls: 'last' } }),
            date:        d => ({ created_at: d }),
        };
        const sortKey = String(req.query.sort || 'date');
        const sortDir: 'asc' | 'desc' = String(req.query.direction || 'desc') === 'asc' ? 'asc' : 'desc';
        const leadOrderBy = (LEAD_SORTS[sortKey] || LEAD_SORTS.date)(sortDir);

        const [leads, total] = await Promise.all([
            prisma.contact.findMany({
                where,
                orderBy: leadOrderBy,
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
                    // demand_bhk dropped Phase 5 — derive from demand_schema_values.bhk
                    demand_schema_values: true,
                    category_id: true,
                    sub_category_id: true,
                    type_id: true,
                    lead_score: { select: { total_score: true } },
                    timeline: true,
                    lead_type: true,
                    referral_partner_name: true,
                    referral_partner_phone: true,
                    // 2026-05-13: include assigned agent name so frontend can show
                    // "Assigned to: <name>" on tile + column without an extra lookup
                    assigned_agent: { select: { id: true, name: true, role: true } },
                },
            }),
            prisma.contact.count({ where }),
        ]);

        res.json({ leads, total, page, limit });
    } catch (error) {
        captureRouteError(error, req, { route: 'leads#2' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/leads/:phone/status
// Update a lead's status
router.patch('/:phone/status', async (req, res) => {
    try {
        if (!(await partnerOwnsLeadOr403(req as any, res, decodeURIComponent(req.params.phone)))) return;
        const phone = await resolvePhone(req.params.phone);
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
        captureRouteError(error, req, { route: 'leads#3' });
        if (error?.code === 'P2025') {
            return res.status(404).json({ error: 'Lead not found' });
        }
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/leads/:phone/reassign
// 2026-05-15: Lead managers (employee role) can reassign leads they currently own.
// Managers + super_boss can reassign any lead. Audit row written to interactions.
router.patch('/:phone/reassign', async (req: any, res) => {
    try {
        const phone = await resolvePhone(req.params.phone);
        const { agent_id, reason } = req.body || {};
        const actor = req.agent;

        if (!agent_id) return res.status(400).json({ error: 'agent_id is required' });
        if (agent_id === actor.id) return res.status(400).json({ error: 'Cannot reassign to yourself' });

        const targetAgent = await prisma.agent.findFirst({
            where: { id: agent_id, tenant_id: actor.tenant_id, status: 'active' },
            select: { id: true, name: true, role: true, phone: true, email: true },
        });
        if (!targetAgent) return res.status(404).json({ error: 'Target agent not found or inactive' });

        const contact = await prisma.contact.findUnique({
            where: { phone_number: phone },
            select: { phone_number: true, name: true, assigned_agent_id: true, tenant_id: true },
        });
        if (!contact) return res.status(404).json({ error: 'Lead not found' });

        // Self-reassign check: employees can only reassign leads they currently own.
        if (actor.role === 'employee' && contact.assigned_agent_id !== actor.id) {
            return res.status(403).json({ error: 'You can only reassign leads you are currently the lead manager of' });
        }

        const previousAgentId = contact.assigned_agent_id;
        const actorRecord = await prisma.agent.findUnique({ where: { id: actor.id }, select: { name: true } });
        const actorName = actorRecord?.name || actor.email || 'a team member';
        const noteText = reason || `Reassigned to ${targetAgent.name}`;
        const contactName = contact.name || phone;

        await prisma.$transaction([
            prisma.contact.update({
                where: { phone_number: phone },
                data: { assigned_agent_id: agent_id, assignment_method: 'manual', updated_at: new Date() }, // Phase 5C
            }),
            // Lead owner == deal coordinator (single source of truth). The
            // /assign endpoint already did this; /reassign must too, or the
            // deal pipeline keeps the stale coordinator after a reassign.
            // See docs/plans/2026-05-17-deal-sync-and-welcome-investigation.md
            prisma.transaction.updateMany({
                where: {
                    demand_contact_id: phone,
                    status: { notIn: ['CLOSED_WON', 'CLOSED_LOST', 'ON_HOLD'] },
                },
                data: {
                    coordinator_agent_id: agent_id,
                    executive_agent_id: agent_id,
                    updated_at: new Date(),
                },
            }),
            prisma.interaction.create({
                data: {
                    tenant_id: contact.tenant_id,
                    phone_number: phone,
                    channel: 'admin',
                    direction: 'outbound',
                    event_type: 'lead_reassigned',
                    content: `Lead reassigned from ${actorName} to ${targetAgent.name} (${targetAgent.role}). Reason: ${noteText}`,
                    metadata: {
                        from_agent_id: previousAgentId,
                        from_agent_name: actor.name,
                        to_agent_id: agent_id,
                        to_agent_name: targetAgent.name,
                        reason: noteText,
                        actor_id: actor.id,
                    },
                },
            }),
        ]);

        // Notify new owner (always) + previous owner if different from actor
        try {
            notify('lead_reassigned_to_me', [{
                id: targetAgent.id, type: 'agent' as const,
                phone: targetAgent.phone ?? undefined, email: targetAgent.email || undefined,
                name: targetAgent.name,
            }], { contact_name: contactName, contact_phone: phone, from_agent_name: actor.name, reason: noteText });

            if (previousAgentId && previousAgentId !== actor.id && previousAgentId !== targetAgent.id) {
                const prev = await prisma.agent.findUnique({
                    where: { id: previousAgentId },
                    select: { id: true, name: true, phone: true, email: true },
                });
                if (prev) {
                    notify('lead_reassigned_away', [{
                        id: prev.id, type: 'agent' as const,
                        phone: prev.phone ?? undefined, email: prev.email || undefined,
                        name: prev.name,
                    }], { contact_name: contactName, contact_phone: phone, to_agent_name: targetAgent.name, by_agent_name: actor.name, reason: noteText });
                }
            }
        } catch (notifyErr) {
            console.warn(`[Leads] notify after reassign failed: ${(notifyErr as Error).message}`);
        }

        console.info(`[Leads] ${phone} reassigned from ${actorName} to ${targetAgent.name}`);
        res.json({ success: true, new_agent: targetAgent });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'leads#reassign' });
        if (error?.code === 'P2025') return res.status(404).json({ error: 'Lead not found' });
        console.error('[Leads] Reassign error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /api/leads/bulk-reassign — reassign many leads to one agent in a single call.
// Mirrors the single /:phone/reassign logic per-lead (same employee-ownership permission
// check + audit row + deal-coordinator sync). Returns a per-lead result summary so the
// UI can show partial success. (#4 bulk reassign, 2026-06-28)
router.post('/bulk-reassign', async (req: any, res) => {
    try {
        const { phones, agent_id, reason } = req.body || {};
        const actor = req.agent;
        if (!Array.isArray(phones) || phones.length === 0) return res.status(400).json({ error: 'phones array required' });
        if (!agent_id) return res.status(400).json({ error: 'agent_id is required' });
        if (agent_id === actor.id) return res.status(400).json({ error: 'Cannot reassign to yourself' });
        if (phones.length > 500) return res.status(400).json({ error: 'Too many leads (max 500 per call)' });

        const targetAgent = await prisma.agent.findFirst({
            where: { id: agent_id, tenant_id: actor.tenant_id, status: 'active' },
            select: { id: true, name: true, role: true, phone: true, email: true },
        });
        if (!targetAgent) return res.status(404).json({ error: 'Target agent not found or inactive' });

        const actorRecord = await prisma.agent.findUnique({ where: { id: actor.id }, select: { name: true } });
        const actorName = actorRecord?.name || actor.email || 'a team member';

        const results: { phone: string; ok: boolean; error?: string }[] = [];
        for (const raw of phones) {
            try {
                const phone = await resolvePhone(String(raw));
                const contact = await prisma.contact.findUnique({
                    where: { phone_number: phone },
                    select: { phone_number: true, name: true, assigned_agent_id: true, tenant_id: true },
                });
                if (!contact) { results.push({ phone: String(raw), ok: false, error: 'Lead not found' }); continue; }
                // Same permission model as the single endpoint: employees can only reassign leads they own.
                if (actor.role === 'employee' && contact.assigned_agent_id !== actor.id) {
                    results.push({ phone, ok: false, error: 'Not your lead' }); continue;
                }
                if (contact.assigned_agent_id === agent_id) { results.push({ phone, ok: true }); continue; }
                const noteText = reason || `Bulk reassigned to ${targetAgent.name}`;
                await prisma.$transaction([
                    prisma.contact.update({ where: { phone_number: phone }, data: { assigned_agent_id: agent_id, assignment_method: 'manual', updated_at: new Date() } }), // Phase 5C
                    prisma.transaction.updateMany({
                        where: { demand_contact_id: phone, status: { notIn: ['CLOSED_WON', 'CLOSED_LOST', 'ON_HOLD'] } },
                        data: { coordinator_agent_id: agent_id, executive_agent_id: agent_id, updated_at: new Date() },
                    }),
                    prisma.interaction.create({
                        data: {
                            tenant_id: contact.tenant_id, phone_number: phone, channel: 'admin', direction: 'outbound',
                            event_type: 'lead_reassigned',
                            content: `Lead reassigned from ${actorName} to ${targetAgent.name} (${targetAgent.role}). Reason: ${noteText}`,
                            metadata: { from_agent_id: contact.assigned_agent_id, from_agent_name: actor.name, to_agent_id: agent_id, to_agent_name: targetAgent.name, reason: noteText, actor_id: actor.id, bulk: true },
                        },
                    }),
                ]);
                results.push({ phone, ok: true });
            } catch (e: any) {
                results.push({ phone: String(raw), ok: false, error: e?.message || 'failed' });
            }
        }
        const okCount = results.filter(r => r.ok).length;
        // One summary notification to the new owner (avoid N pings for a bulk action).
        try {
            if (okCount > 0) notify('lead_reassigned_to_me', [{
                id: targetAgent.id, type: 'agent' as const, phone: targetAgent.phone ?? undefined,
                email: targetAgent.email || undefined, name: targetAgent.name,
            }], { contact_name: `${okCount} leads`, contact_phone: '', from_agent_name: actor.name, reason: `Bulk reassign of ${okCount} leads` });
        } catch (notifyErr) { console.warn(`[Leads] bulk reassign notify failed: ${(notifyErr as Error).message}`); }

        console.info(`[Leads] bulk reassign: ${okCount}/${phones.length} → ${targetAgent.name} by ${actorName}`);
        res.json({ success: true, reassigned: okCount, total: phones.length, new_agent: targetAgent, results });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'leads#bulk-reassign' });
        console.error('[Leads] Bulk reassign error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /api/leads/:phone/convert-to-partner
// Convert an inbound lead whose contact IS a partner agent (dealer) into a registered
// PartnerAgent, and reframe their open deals as that partner's deals. Forward-only.
// Permission: act_on_deals (any team member who works deals). See
// docs/plans/2026-05-23-lead-to-partner-conversion-design.md
router.post('/:phone/convert-to-partner', checkPermission('act_on_deals'), async (req: any, res) => {
    try {
        const phone = await resolvePhone(req.params.phone);
        const actor = req.agent;
        const { name, partner_category, company_name } = req.body || {};
        const category: 'INDIVIDUAL' | 'COMPANY' = partner_category === 'COMPANY' ? 'COMPANY' : 'INDIVIDUAL';

        const contact = await prisma.contact.findUnique({
            where: { phone_number: phone },
            select: { phone_number: true, name: true, tenant_id: true, contact_type: true },
        });
        if (!contact) return res.status(404).json({ error: 'Lead not found' });

        // Idempotent: already a partner → no-op.
        if (contact.contact_type === 'PARTNER_AGENT') {
            const existing = await prisma.partnerAgent.findUnique({
                where: { phone_number: phone }, select: { id: true },
            });
            return res.json({ success: true, partner_id: existing?.id ?? null, reframed_deal_ids: [], already_partner: true });
        }

        const partnerName = (name || contact.name || '').trim();
        if (!partnerName) return res.status(400).json({ error: 'A name is required to register a partner agent' });

        // req.agent is a raw JWT with no `name` — fetch it for audit/notify text (feedback_jwt_agent_shape).
        const actorRecord = await prisma.agent.findUnique({ where: { id: actor.id }, select: { name: true } });
        const actorName = actorRecord?.name || actor.email || 'a team member';

        // 1) Register the partner + flip contact_type=PARTNER_AGENT (reuses ensurePartnerAgent).
        const result = await ensurePartnerAgent(phone, partnerName, contact.tenant_id, actor.id, {
            partnerCategory: category,
            companyName: company_name || null,
        });
        const partnerId = result.partnerId;

        // owning_manager cascades from the partner's managing agent.
        const partner = await prisma.partnerAgent.findUnique({
            where: { id: partnerId }, select: { managing_agent_id: true },
        });
        const owningManagerId = partner?.managing_agent_id ?? actor.id;

        // 2) Reframe the contact's OPEN deals as this partner's deals.
        const openDeals = await prisma.transaction.findMany({
            where: { demand_contact_id: phone, status: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } },
            select: { id: true },
        });
        const dealIds = openDeals.map(d => d.id);

        await prisma.$transaction([
            prisma.contact.update({
                where: { phone_number: phone },
                data: { verification_status: 'CONVERTED_PARTNER', updated_at: new Date() },
            }),
            prisma.transaction.updateMany({
                where: { id: { in: dealIds } },
                data: {
                    deal_scenario: 'PARTNER_INTERNAL',
                    demand_handler_type: 'PARTNER',
                    demand_handler_id: partnerId,
                    owning_manager_id: owningManagerId,
                    updated_at: new Date(),
                },
            }),
            prisma.interaction.create({
                data: {
                    tenant_id: contact.tenant_id,
                    phone_number: phone,
                    channel: 'admin',
                    direction: 'outbound',
                    event_type: 'converted_to_partner',
                    content: `Converted ${contact.name || phone} to Partner Agent by ${actorName}. Reframed ${dealIds.length} deal(s).`,
                    metadata: { partner_id: partnerId, deal_ids: dealIds, actor_id: actor.id, partner_category: category },
                },
            }),
        ]);

        // 3) Partner welcome WhatsApp (non-blocking; same as create-on-behalf flow).
        try {
            await sendPartnerWelcomeWhatsApp(phone, partnerName, category, actorName);
        } catch (waErr) {
            console.warn(`[Leads] partner welcome WA failed for ${phone}: ${(waErr as Error).message}`);
        }

        console.info(`[Leads] ${phone} converted to partner ${partnerId} by ${actorName}; reframed ${dealIds.length} deal(s)`);
        res.json({ success: true, partner_id: partnerId, reframed_deal_ids: dealIds });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'leads#convert-to-partner' });
        if (error?.code === 'P2025') return res.status(404).json({ error: 'Lead not found' });
        console.error('[Leads] convert-to-partner error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /api/leads/:phone/approve-partner-claim
// A partner submitted (via their portal) a lead for one of OUR existing direct clients. Approving CREDITS
// the partner — reframes the contact's open deals to that partner (same attribution as convert-to-partner)
// and clears the pending flag. Permission: same as inventory approvals (edit_inventory).
router.post('/:phone/approve-partner-claim', checkPermission('edit_inventory'), async (req: any, res) => {
    try {
        const phone = await resolvePhone(req.params.phone);
        const actor = req.agent;
        const contact = await prisma.contact.findUnique({
            where: { phone_number: phone },
            select: { phone_number: true, name: true, tenant_id: true, verification_status: true },
        });
        if (!contact) return res.status(404).json({ error: 'Lead not found' });
        if (contact.verification_status !== 'PENDING_PARTNER_CLAIM') {
            return res.status(400).json({ error: 'No pending partner claim on this lead' });
        }

        // The claiming partner is recorded on the pending-claim interaction.
        const claim = await prisma.interaction.findFirst({
            where: { phone_number: phone, event_type: 'partner_claim_pending' },
            orderBy: { created_at: 'desc' },
            select: { metadata: true },
        });
        const partnerId = (claim?.metadata as any)?.partner_id as string | undefined;
        if (!partnerId) return res.status(400).json({ error: 'Claiming partner not found for this lead' });
        const partner = await prisma.partnerAgent.findUnique({
            where: { id: partnerId }, select: { id: true, name: true, managing_agent_id: true },
        });
        if (!partner) return res.status(404).json({ error: 'Partner not found' });
        const owningManagerId = partner.managing_agent_id ?? actor.id;

        const openDeals = await prisma.transaction.findMany({
            where: { demand_contact_id: phone, status: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } },
            select: { id: true },
        });
        const dealIds = openDeals.map(d => d.id);

        await prisma.$transaction([
            prisma.contact.update({
                where: { phone_number: phone },
                data: { referral_partner_id: partnerId, verification_status: 'CONVERTED_PARTNER', updated_at: new Date() },
            }),
            prisma.transaction.updateMany({
                where: { id: { in: dealIds } },
                data: {
                    deal_scenario: 'PARTNER_INTERNAL',
                    demand_handler_type: 'PARTNER',
                    demand_handler_id: partnerId,
                    owning_manager_id: owningManagerId,
                    updated_at: new Date(),
                },
            }),
            prisma.interaction.create({
                data: {
                    tenant_id: contact.tenant_id,
                    phone_number: phone,
                    channel: 'admin',
                    direction: 'outbound',
                    event_type: 'partner_claim_approved',
                    content: `Partner claim by ${partner.name || partnerId} approved by ${actor.email || actor.id}. Credited ${dealIds.length} deal(s).`,
                    metadata: { partner_id: partnerId, deal_ids: dealIds, actor_id: actor.id },
                },
            }),
        ]);

        console.info(`[Leads] partner claim on ${phone} APPROVED → partner ${partnerId}; credited ${dealIds.length} deal(s)`);
        res.json({ success: true, partner_id: partnerId, credited_deal_ids: dealIds });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'leads#approve-partner-claim' });
        if (error?.code === 'P2025') return res.status(404).json({ error: 'Lead not found' });
        console.error('[Leads] approve-partner-claim error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /api/leads/:phone/reject-partner-claim
// Reject the partner's claim: strip partner attribution from the claimed deal (it stays a DIRECT deal —
// the client still wants a property, just not credited to the partner) and clear the pending flag.
// Permission: edit_inventory.
router.post('/:phone/reject-partner-claim', checkPermission('edit_inventory'), async (req: any, res) => {
    try {
        const phone = await resolvePhone(req.params.phone);
        const actor = req.agent;
        const { reason } = req.body || {};
        const contact = await prisma.contact.findUnique({
            where: { phone_number: phone },
            select: { phone_number: true, name: true, tenant_id: true, verification_status: true },
        });
        if (!contact) return res.status(404).json({ error: 'Lead not found' });
        if (contact.verification_status !== 'PENDING_PARTNER_CLAIM') {
            return res.status(400).json({ error: 'No pending partner claim on this lead' });
        }

        const claim = await prisma.interaction.findFirst({
            where: { phone_number: phone, event_type: 'partner_claim_pending' },
            orderBy: { created_at: 'desc' },
            select: { metadata: true },
        });
        const partnerId = (claim?.metadata as any)?.partner_id as string | undefined;
        const claimedDealId = (claim?.metadata as any)?.deal_id as string | undefined;

        const ops: any[] = [
            prisma.contact.update({
                where: { phone_number: phone },
                data: { verification_status: 'VERIFIED', updated_at: new Date() },
            }),
            prisma.interaction.create({
                data: {
                    tenant_id: contact.tenant_id,
                    phone_number: phone,
                    channel: 'admin',
                    direction: 'outbound',
                    event_type: 'partner_claim_rejected',
                    content: `Partner claim rejected by ${actor.email || actor.id}. Stays our direct client.${reason ? ' Reason: ' + reason : ''}`,
                    metadata: { partner_id: partnerId ?? null, deal_id: claimedDealId ?? null, actor_id: actor.id },
                },
            }),
        ];
        if (claimedDealId) {
            // Keep the deal but make it ours (DIRECT) — no risky cascade delete.
            ops.unshift(prisma.transaction.updateMany({
                where: { id: claimedDealId },
                data: { demand_handler_type: 'DIRECT', demand_handler_id: null, deal_scenario: 'DIRECT_INTERNAL', updated_at: new Date() },
            }));
        }
        await prisma.$transaction(ops);

        console.info(`[Leads] partner claim on ${phone} REJECTED by ${actor.email || actor.id}`);
        res.json({ success: true });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'leads#reject-partner-claim' });
        if (error?.code === 'P2025') return res.status(404).json({ error: 'Lead not found' });
        console.error('[Leads] reject-partner-claim error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/leads/pending-partner-claims — admin "Partner Approvals" queue: partners who submitted a lead
// for one of our existing direct clients, awaiting approve/reject. Permission: edit_inventory.
router.get('/pending-partner-claims', checkPermission('edit_inventory'), async (req: any, res) => {
    try {
        const contacts = await prisma.contact.findMany({
            where: { verification_status: 'PENDING_PARTNER_CLAIM' },
            select: {
                phone_number: true, name: true, intent: true, preferred_location: true,
                budget_min: true, budget_max: true, created_at: true, updated_at: true,
            },
            orderBy: { updated_at: 'desc' },
            take: 100,
        });
        const out = await Promise.all(contacts.map(async (c) => {
            const claim = await prisma.interaction.findFirst({
                where: { phone_number: c.phone_number, event_type: 'partner_claim_pending' },
                orderBy: { created_at: 'desc' },
                select: { metadata: true, created_at: true },
            });
            const partnerId = (claim?.metadata as any)?.partner_id as string | undefined;
            const partner = partnerId
                ? await prisma.partnerAgent.findUnique({ where: { id: partnerId }, select: { id: true, name: true, phone_number: true } })
                : null;
            return {
                phone_number: c.phone_number,
                name: c.name,
                intent: c.intent,
                preferred_location: c.preferred_location,
                budget_min: c.budget_min,
                budget_max: c.budget_max,
                requirement_type: (claim?.metadata as any)?.requirement_type ?? null,
                claimed_at: claim?.created_at ?? c.updated_at,
                partner: partner ? { id: partner.id, name: partner.name, phone_number: partner.phone_number } : null,
            };
        }));
        res.json(out);
    } catch (error: any) {
        captureRouteError(error, req, { route: 'leads#pending-partner-claims' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/leads/search?q=<string>
// Universal contact search — returns contacts + partner agents matching name/phone
router.get('/search', async (req: any, res) => {
    const q = (req.query.q as string || '').trim();
    if (q.length < 2) return res.json([]);

    try {
        const visibilityFilter = buildContactVisibilityFilter(req.agent.id, req.agent.role);

        const isPhone = /\d{3,}/.test(q.replace(/\D/g, ''));
        const phoneDigits = q.replace(/\D/g, '');

        // Search restriction: non-super_boss can only find contacts by exact full phone number
        const searchCondition = (req.agent.role === 'super_boss')
            ? [
                { name: { contains: q, mode: 'insensitive' as const } },
                ...(isPhone ? [{ phone_number: { contains: phoneDigits } }] : []),
            ]
            : (phoneDigits.length >= 10)
                ? [{ phone_number: { contains: phoneDigits } }]
                : [
                    { name: { contains: q, mode: 'insensitive' as const } },
                ];

        const [contacts, partners] = await Promise.all([
            prisma.contact.findMany({
                where: {
                    contact_type: { notIn: ['MANAGEMENT'] },
                    ...visibilityFilter,
                    OR: searchCondition,
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
        captureRouteError(error, req, { route: 'leads#4' });
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
            area_min, area_max, area_unit,
        } = req.body;

        const isPartnerReferral = lead_type === 'PARTNER_REFERRAL';

        // Direct (we-contacted-them) leads MUST have a real phone. PARTNER_REFERRAL leads may
        // arrive with NO client name AND NO client phone — the partner often won't share either
        // (2026-05-31, owner). Those are created against a placeholder key and attributed to the
        // partner; the real phone is filled in later.
        if (!isPartnerReferral && !phone) {
            return res.status(400).json({ error: 'Phone number is required for directly-contacted leads.' });
        }

        // Validate intent
        if (intent && !['buy', 'rent'].includes(intent)) {
            return res.status(400).json({ error: 'Intent must be "buy" or "rent"' });
        }

        // Resolve the contact key.
        let phoneNumber: string;
        let isTemporaryPhone = false;
        // When the client phone already belongs to a contact we ATTACH this as a NEW requirement to that
        // person instead of rejecting (a partner brings the same client a buy + a rent; or a known client
        // is referred). The requirement rides on its own deal (ensureDealForLead is per-(contact,type),
        // so same-type re-submits still dedup). The frontend surfaces this as "already registered → Add as
        // Direct Client". Replaces the old hard 409 that blocked multiple leads per partner/client.
        let attachToExistingContact = false;

        if (phone) {
            const normalized = normalizePhone(phone);
            if (!normalized) {
                // normalizePhone now returns '' for junk (names/partials), so this rejects values
                // like "ChiragWadhwa"/"1"/"+" that previously became broken "+junk" contact keys.
                return res.status(400).json({
                    error: isPartnerReferral
                        ? 'Enter a valid phone number, or leave it blank to attribute this lead to the partner.'
                        : 'Enter a valid 10-digit phone number.',
                });
            }
            phoneNumber = normalized;
            const existing = await prisma.contact.findUnique({ where: { phone_number: phoneNumber } });
            if (existing) {
                attachToExistingContact = true;
            }
        } else {
            // Partner referral with no client phone → unique non-dialable placeholder key.
            // The contact PK is phone_number, so we still need a unique value; it's clearly
            // marked PENDING and the lead is worked through the partner until a real number arrives.
            isTemporaryPhone = true;
            const partnerKey = String(referral_partner_phone || 'partner').replace(/[^0-9a-zA-Z]/g, '').slice(-10) || 'partner';
            phoneNumber = `PENDING-${partnerKey}-${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`;
        }

        // Get tenant
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) {
            return res.status(500).json({ error: 'System not configured' });
        }

        // Auto-assign: privileged users can specify an agent; employees are auto-assigned to themselves
        const isPrivileged = PRIVILEGED_ROLES.includes(req.agent.role);
        let resolvedAgentId = isPrivileged
            ? (assigned_agent_id || null)
            : req.agent.id;

        // Partner referral: auto-create partner if not registered
        let resolvedPartnerId: string | null = null;
        let partnerWasCreated = false;
        let partnerPhone: string | null = null;
        // Owning manager (middleman model, 2026-04-17): for partner-referred leads this
        // inherits from the partner's managing_agent_id; for direct admin-created leads it
        // defaults to the creating agent. null => super_boss fallback at permission layer.
        let owningManagerId: string | null = req.agent?.id ?? null;

        // PARTNER (2026-07-12): an external partner adding THEIR OWN lead. A PartnerAgent id is NOT an
        // Agent id — assigned_agent_id and owning_manager_id are Agent FKs, so they must resolve to the
        // partner's coordinator (who will actually work the lead). The lead is attributed to the partner
        // via referral_partner_id so it appears in THEIR list (and nowhere else).
        const isPartnerCreator = req.agent?.role === 'partner';
        if (isPartnerCreator) {
            const pa = await prisma.partnerAgent.findUnique({
                where: { id: req.agent.id }, select: { managing_agent_id: true, status: true },
            });
            if (!pa || pa.status !== 'ACTIVE') {
                return res.status(403).json({ error: 'Partner account is not active' });
            }
            const coordinatorId = pa.managing_agent_id
                || (await prisma.agent.findFirst({ where: { role: 'super_boss', status: 'active' }, select: { id: true } }))?.id
                || null;
            resolvedAgentId = coordinatorId;      // a real Agent works it
            owningManagerId = coordinatorId;
            resolvedPartnerId = req.agent.id;     // attributed to the partner
        }

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
                // Inherit owning manager from the partner's managing_agent_id
                const partner = await prisma.partnerAgent.findUnique({
                    where: { id: resolvedPartnerId },
                    select: { managing_agent_id: true },
                });
                if (partner?.managing_agent_id) {
                    owningManagerId = partner.managing_agent_id;
                }
            } catch (partnerErr) {
                // Non-fatal — log and continue without partner link
                console.warn('[Leads] Partner auto-create failed:', (partnerErr as Error).message);
            }
        }

        // Canonical denormalized partner phone to store on the lead/contact. The raw request body value
        // is un-normalized (bare 10-digit, spaces, no +91) which made the "Call partner" link dial a wrong
        // number; prefer the canonical phone ensurePartnerAgent already resolved, else normalize the raw,
        // else null (junk is not stored as a fake-dialable value). See docs/precautions phone-normalization.
        const referralPartnerPhoneStored = partnerPhone
            || (referral_partner_phone ? (normalizePhone(referral_partner_phone) || null) : null);

        // Resolve classification UUIDs → demand_* slugs so the lead's
        // requirements actually reach the Deal pipeline (deal/UI read the
        // string fields, not the IDs).
        // See docs/plans/2026-05-17-deal-sync-and-welcome-investigation.md
        const demandSlugs = await resolveDemandSlugs(prisma, { category_id, sub_category_id, type_id });

        // Demand-side unification Phase 1 (2026-05-29): also compute the canonical
        // shape (demand_taxonomy_node_id + demand_schema_values) and dual-write.
        // Pass through req.body.demand_* if the caller already speaks the new shape
        // (forward-compat for Phase 2 forms).
        const canonicalDemand = foldLegacyDemand({
            demand_bhk: demand_bhk ? Number(demand_bhk) : null,
            demand_amenities: (req.body as any).demand_amenities ?? null,
            demand_taxonomy_node_id: (req.body as any).demand_taxonomy_node_id ?? null,
            demand_schema_values: (req.body as any).demand_schema_values ?? null,
        });

        // Resolve the canonical taxonomy node + derive the legacy classification ids
        // (sub_category_id/category_id/type_id — the matching engine's hard-filter columns)
        // from whatever the caller sent: the node id (new DemandRequirementsForm), legacy ids,
        // or a property_type slug. Mirrors routes/public.ts + the feed pollers so the manual
        // path captures taxonomy identically. (2026-05-31)
        const demandTax = await resolveTypeFilter({
            demand_taxonomy_node_id: canonicalDemand.demand_taxonomy_node_id ?? (req.body as any).demand_taxonomy_node_id ?? undefined,
            property_type: property_type || undefined,
            sub_category_id: sub_category_id || undefined,
            category_id: category_id || undefined,
            type_id: type_id || undefined,
        });
        const resolvedNodeId = demandTax.demand_taxonomy_node_id ?? canonicalDemand.demand_taxonomy_node_id ?? undefined;
        const resolvedCategoryId = demandTax.category_id ?? category_id ?? null;
        const resolvedSubCategoryId = demandTax.sub_category_id ?? sub_category_id ?? null;
        const resolvedTypeId = demandTax.type_id ?? type_id ?? null;

        // Geo: the DemandRequirementsForm sends a text location (no lat/lng). Geocode it
        // server-side so proximity matching still works (the old modal captured lat/lng via
        // Google Maps; we preserve that here). Explicit lat/lng from the caller still wins.
        let geoLat: number | null = preferred_lat ? Number(preferred_lat) : null;
        let geoLng: number | null = preferred_lng ? Number(preferred_lng) : null;
        if ((geoLat == null || geoLng == null) && preferred_location) {
            try {
                const g = await geocodeAddress(String(preferred_location));
                if (g) { geoLat = g.lat; geoLng = g.lng; }
            } catch { /* non-fatal — text location still stored */ }
        }

        // Demand/requirement fields refreshed on BOTH create and attach (the contact holds the latest
        // requirement; each deal keeps its own snapshot). Classification ids are DERIVED from the resolved
        // taxonomy node (matching hard-filter columns), not raw form values. (2026-05-31)
        const demandWrite = {
            intent: intent || null,
            contact_type: (intent === 'buy' ? 'BUYER' : intent === 'rent' ? 'TENANT' : 'UNKNOWN') as any,
            property_type: property_type || null,
            preferred_location: preferred_location || null,
            preferred_lat: geoLat,
            preferred_lng: geoLng,
            category_id: resolvedCategoryId,
            sub_category_id: resolvedSubCategoryId,
            type_id: resolvedTypeId,
            area_min: area_min ? Number(area_min) : null,
            area_max: area_max ? Number(area_max) : null,
            area_unit: area_unit || null,
            budget_min: budget_min ? Number(budget_min) : null,
            budget_max: budget_max ? Number(budget_max) : null,
            // Canonical demand SoT — node + schema_values.
            demand_taxonomy_node_id: resolvedNodeId,
            demand_schema_values: canonicalDemand.demand_schema_values ?? undefined,
            timeline: timeline || null,
        };
        const notesWrite = isTemporaryPhone
            ? `${notes ? notes + ' | ' : ''}[Partner referral — phone not provided yet]`
            : (notes || null);

        // Attach a NEW requirement to an existing client. Refresh demand; PRESERVE identity, assignment,
        // status, and any existing partner attribution unless this request explicitly supplies it (so a
        // direct add doesn't wipe a partner link, and a partner add can claim a direct client). Shared by
        // the explicit-attach path AND the create's race fallback below.
        const attachData = {
            ...demandWrite,
            name: name || undefined,
            email: email || undefined,
            lead_type: (isPartnerCreator ? 'PARTNER_REFERRAL' : lead_type) || undefined,
            referral_partner_id: resolvedPartnerId ?? undefined,
            referral_partner_name: referral_partner_name || undefined,
            referral_partner_phone: referralPartnerPhoneStored ?? undefined,
            owning_manager_id: isPartnerReferral ? owningManagerId : undefined,
            updated_at: new Date(),
        };
        const contact = attachToExistingContact
            ? await prisma.contact.update({ where: { phone_number: phoneNumber }, data: attachData })
            // (GT-96, 2026-06-23) Atomic create-or-attach. A concurrent request can create this contact
            // between our findUnique (above) and here — `upsert` closes that TOCTOU race so we attach to
            // the just-created contact instead of throwing P2002 (which previously 500'd POST /api/leads).
            : await prisma.contact.upsert({
                where: { phone_number: phoneNumber },
                create: {
                    phone_number: phoneNumber,
                    tenant_id: tenant.id,
                    name: name || null,
                    email: email || null,
                    source: source || 'manual',
                    notes: notesWrite,
                    lead_status: isPartnerReferral ? 'warm' : 'cold',
                    lifecycle_stage: 'NEW',
                    assigned_agent_id: resolvedAgentId,
                    // Phase 5C — partner-creator routes to the managing agent; else admin/employee manual pick.
                    assignment_method: resolvedAgentId ? (isPartnerCreator ? 'partner' : 'manual') : undefined,
                    lead_type: (isPartnerCreator ? 'PARTNER_REFERRAL' : lead_type) || null,
                    referral_partner_id: resolvedPartnerId,
                    referral_partner_name: referral_partner_name || null,
                    referral_partner_phone: referralPartnerPhoneStored,
                    // created_by is an Agent FK — never a PartnerAgent id (partner leads use the coordinator).
                    created_by: isPartnerCreator ? (resolvedAgentId ?? null) : (req.agent?.id ?? null),
                    owning_manager_id: owningManagerId,
                    ...demandWrite,
                },
                update: attachData,
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
                    // demand_bhk + demand_type_slug dropped Phase 5 (2026-05-29).
                    // Phase 5 — canonical SoT only.
                    demand_taxonomy_node_id: resolvedNodeId,
                    demand_schema_values: canonicalDemand.demand_schema_values ?? undefined,
                    preferred_location: preferred_location || null,
                    preferred_lat: geoLat,
                    preferred_lng: geoLng,
                    category_id: resolvedCategoryId,
                    sub_category_id: resolvedSubCategoryId,
                    type_id: resolvedTypeId,
                    area_min: area_min ? Number(area_min) : null,
                    area_max: area_max ? Number(area_max) : null,
                    area_unit: area_unit || null,
                    lead_status: isPartnerReferral ? 'warm' : 'cold',
                    lifecycle_stage: 'NEW',
                    assigned_agent_id: resolvedAgentId,
                    created_by: isPartnerCreator ? (resolvedAgentId as any) : req.agent.id,
                    lead_type: lead_type || null,
                    referral_partner_id: resolvedPartnerId || null,
                    referral_partner_name: referral_partner_name || null,
                    referral_partner_phone: referralPartnerPhoneStored,
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

        // B1: auto-create QUALIFIED deal — team member touched the lead, AI skips qualification calls.
        // Captures partner referral attribution as deal_scenario=PARTNER_INTERNAL.
        ensureDealForLead({
            contactPhone: phoneNumber,
            source: 'manual',
            createdByAgentId: req.agent?.id,
            isPartnerReferral,
        }).catch((err) => {
            console.error(`[leads.ts] ensureDealForLead failed for ${phoneNumber}: ${(err as Error).message}`);
        });

        // Auto-engage: send Template C (greeting + show properties) for manually created leads
        // This is fire-and-forget — don't block the response
        import('../services/lead_auto_engage').then(({ autoEngageInternalLead }) => {
            autoEngageInternalLead(phoneNumber).catch(err =>
                console.warn('[leads.ts] Auto-engage failed:', (err as Error).message)
            );
        }).catch(() => {});

    } catch (error: any) {
        captureRouteError(error, req, { route: 'leads#5' });
        if (error?.code === 'P2002') {
            return res.status(409).json({ error: 'Lead with this phone number already exists' });
        }
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/leads/:phone/score
router.get('/:phone/score', async (req, res) => {
    try {
        const phone = await resolvePhone(req.params.phone);
        const score = await prisma.leadScore.findUnique({
            where: { phone_number: phone },
            include: { contact: true }
        });

        if (!score) {
            return res.status(404).json({ error: 'Lead score not found' });
        }
        res.json(score);
    } catch (error) {
        captureRouteError(error, req, { route: 'leads#6' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/leads/:phone/mark-lost
// 2026-05-12: dedicated lead-level lost path. Sets contact.lead_status='lost' +
// lifecycle_stage='CLOSED_LOST', clears next_action, and closes any open deals
// for this contact via the deal-pipeline state machine.
// Frees the team from having to spin up a fake deal just to mark a lead dead.
router.patch('/:phone/mark-lost', async (req, res) => {
    try {
        if (!(await partnerOwnsLeadOr403(req as any, res, decodeURIComponent(req.params.phone)))) return;
        const phone = await resolvePhone(req.params.phone);
        const { reason, note } = req.body as { reason?: string; note?: string };

        // Mandatory structured reason (dashboard spec). Keep in sync with the
        // frontend constant src/constants/lostReasons.ts. Persisted to
        // contacts.lost_reason so it feeds the Lost-Reasons analytics.
        const LOST_REASONS = [
            'Budget Issue', 'Location Issue', 'Property Mismatch', 'Not Interested',
            'Purchased Elsewhere', 'No Response', 'Wrong Number', 'Duplicate Lead',
            'Competitor Chosen', 'Other',
        ];
        if (!reason || !LOST_REASONS.includes(reason)) {
            return res.status(400).json({ error: 'A valid lost reason is required.' });
        }

        const contact = await prisma.contact.findUnique({
            where: { phone_number: phone },
            select: { phone_number: true, name: true, assigned_agent_id: true },
        });
        if (!contact) return res.status(404).json({ error: 'Contact not found' });

        // Find active deals for this contact (demand side)
        const activeDeals = await prisma.transaction.findMany({
            where: {
                demand_contact_id: phone,
                status: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
            },
            select: { id: true, status: true },
        });

        // Close each via the state machine to keep audit trail intact
        const { transitionTransaction } = await import('../services/transaction_state_machine');
        const closedDealIds: string[] = [];
        for (const deal of activeDeals) {
            try {
                await transitionTransaction(deal.id, 'CLOSED_LOST' as any, req.agent!.id, 'admin', {
                    reason: reason || 'lead_marked_lost',
                    changed_by: req.agent!.email,
                    note,
                });
                closedDealIds.push(deal.id);
            } catch (transitionErr) {
                // Skip deals where the state machine rejects the transition (e.g. already terminal)
                captureRouteError(transitionErr, req, { route: 'leads#mark-lost-deal', deal_id: deal.id });
            }
        }

        // Now flip the contact itself
        const updated = await prisma.contact.update({
            where: { phone_number: phone },
            data: {
                lead_status: 'lost',
                lifecycle_stage: 'CLOSED_LOST',
                lost_reason: reason,
                lost_at: new Date(),
                next_action_at: null,
                next_action_type: null,
            },
            select: { phone_number: true, name: true, lead_status: true, lifecycle_stage: true },
        });

        // Log an interaction so the timeline shows who closed it and why
        await prisma.interaction.create({
            data: {
                phone_number: phone,
                contact: { connect: { phone_number: phone } },
                channel: 'admin',
                direction: 'outbound',
                event_type: 'lead_marked_lost',
                content: `Lead marked lost${reason ? ` — reason: ${reason}` : ''}${note ? ` — note: ${note}` : ''}`,
                metadata: {
                    reason: reason ?? null,
                    note: note ?? null,
                    closed_deal_ids: closedDealIds,
                    performed_by_agent_id: req.agent!.id,
                    performed_by_name: req.agent!.email,
                },
            },
        }).catch(() => undefined); // non-fatal

        res.json({
            success: true,
            contact: updated,
            deals_closed: closedDealIds.length,
            closed_deal_ids: closedDealIds,
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'leads#mark-lost' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/leads/:phone/delay-reason
// 2026-06-15: structured "why is this active lead stuck" capture. Persists
// stagnation_reason + stagnation_set_at (Phase 3b columns). Non-destructive —
// does NOT change lead_status/lifecycle. Feeds the Delay-Reasons analytics.
router.patch('/:phone/delay-reason', async (req, res) => {
    try {
        if (!(await partnerOwnsLeadOr403(req as any, res, decodeURIComponent(req.params.phone)))) return;
        const phone = await resolvePhone(req.params.phone);
        const { reason, note } = req.body as { reason?: string; note?: string };

        // Keep in sync with the frontend constant src/constants/delayReasons.ts.
        const DELAY_REASONS = [
            'Client Not Responding', 'Waiting For Budget Approval', 'Waiting For Family Decision',
            'Property Not Available', 'Site Visit Pending', 'Loan Approval Pending',
            'Documentation Pending', 'Future Purchase Plan', 'Negotiation Ongoing', 'Other',
        ];
        if (!reason || !DELAY_REASONS.includes(reason)) {
            return res.status(400).json({ error: 'A valid delay reason is required.' });
        }

        const contact = await prisma.contact.findUnique({
            where: { phone_number: phone },
            select: { phone_number: true },
        });
        if (!contact) return res.status(404).json({ error: 'Contact not found' });

        const updated = await prisma.contact.update({
            where: { phone_number: phone },
            data: { stagnation_reason: reason, stagnation_set_at: new Date() },
            select: { phone_number: true, name: true, stagnation_reason: true, stagnation_set_at: true },
        });

        // Timeline entry (unchecked scalar form, incl. required tenant_id — keeps tsc clean).
        await prisma.interaction.create({
            data: {
                tenant_id: req.agent!.tenant_id,
                phone_number: phone,
                channel: 'admin',
                direction: 'outbound',
                event_type: 'delay_reason_set',
                content: `Delay reason set — ${reason}${note ? ` — note: ${note}` : ''}`,
                metadata: {
                    reason,
                    note: note ?? null,
                    performed_by_agent_id: req.agent!.id,
                    performed_by_name: req.agent!.email,
                },
            },
        }).catch(() => undefined); // non-fatal

        res.json({ success: true, contact: updated });
    } catch (error) {
        captureRouteError(error, req, { route: 'leads#delay-reason' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /api/leads/:phone/no-show
router.post('/:phone/no-show', async (req, res) => {
    try {
        const phone = await resolvePhone(req.params.phone);

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
        captureRouteError(error, req, { route: 'leads#7' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/leads/:phone
// Full lead detail: contact + score + recent interactions
router.get('/:phone', async (req, res) => {
    try {
        if (!(await partnerOwnsLeadOr403(req as any, res, decodeURIComponent(req.params.phone)))) return;
        const phone = await resolvePhone(req.params.phone);
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
        captureRouteError(error, req, { route: 'leads#8' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /api/leads/:phone/match
// Run MatchingEngine for a lead — uses Haversine if lat/lng available
/**
 * POST /api/leads/:phone/partner-assign  { partner_agent_id: string | null }
 * PARTNER TEAMS (2026-07-13): a partner COMPANY OWNER assigns one of THEIR OWN leads to one of THEIR
 * OWN sub-agents (or to themselves, or unassigns with null).
 *
 * Writes ONLY `partner_assignee_id` — `referral_partner_id` (who BROUGHT the lead, and therefore who the
 * commission belongs to) is never touched.
 *
 * CASCADE: `ensureDealForLead` auto-creates a deal per lead with the handler fields unset, so without this
 * the sub-agent would see the LEAD but not its DEAL. We mirror the assignee onto the lead's OPEN deals in
 * the same transaction. (partnerDealOr also matches via demand_contact.partner_assignee_id, so this is
 * belt-and-braces — it keeps the Deal screen's "Assigned to" column truthful.)
 */
router.post('/:phone/partner-assign', async (req: any, res) => {
    try {
        const phone = await resolvePhone(req.params.phone as string);
        // 1) the row must be theirs (this also 403s non-partners' access to the partner flow)
        if (!(await partnerOwnsLeadOr403(req, res, phone))) return;
        // 2) the caller must be an ACTIVE COMPANY OWNER and the target one of their ACTIVE sub-agents
        const { assertPartnerOwnerCanAssign } = await import('../utils/partner_team');
        const check = await assertPartnerOwnerCanAssign(req, res, req.body?.partner_agent_id ?? null);
        if (!check.ok) return;
        const assigneeId = check.assigneeId;

        const [contact] = await prisma.$transaction([
            prisma.contact.update({
                where: { phone_number: phone },
                data: { partner_assignee_id: assigneeId },
                select: { phone_number: true, partner_assignee_id: true, referral_partner_id: true },
            }),
            prisma.transaction.updateMany({
                where: {
                    demand_contact_id: phone,
                    status: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
                },
                data: { partner_assignee_id: assigneeId },
            }),
        ]);

        logger.info(`[PartnerAssign] lead ${phone} -> ${assigneeId ?? 'unassigned'} by partner ${req.agent.id}`);
        res.json({ success: true, phone_number: contact.phone_number, partner_assignee_id: contact.partner_assignee_id });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'leads#partner-assign' });
        logger.error('[PartnerAssign] lead error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/:phone/match', async (req, res) => {
    try {
        if (!(await partnerOwnsLeadOr403(req as any, res, decodeURIComponent(req.params.phone)))) return;
        const phone = await resolvePhone(req.params.phone);
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
            // Cast through `as any` — Lead's demand_schema_values comes back as Prisma's
            // JsonValue type which isn't structurally assignable to Record<string, any>.
            criteria = buildMatchCriteriaFromLead(latestLead as any);
        } else {
            // Fallback: build from Contact fields (backward compat). Phase 3 (2026-05-29):
            // also carry canonical demand_taxonomy_node_id + demand_schema_values so the
            // matching engine uses the new SoT for contacts without a Lead row.
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
                // Phase 5: legacy demand_bhk column dropped — derive bhk from
                // canonical demand_schema_values for the legacy `bhk` criterion
                // (matching engine also reads the canonical block directly below).
                bhk: (() => {
                    const sv = (contact as any).demand_schema_values as Record<string, any> | null;
                    const raw = sv?.bhk;
                    if (raw == null) return null;
                    const m = String(raw).match(/\d+/);
                    return m ? parseInt(m[0], 10) : null;
                })(),
                demand_taxonomy_node_id: (contact as any).demand_taxonomy_node_id ?? null,
                demand_schema_values: (contact as any).demand_schema_values ?? null,
            };
        }

        const matches = await matchingEngine.findMatches(criteria, 10);

        // Advance lifecycle to QUALIFIED if still in early stages
        if (['NEW'].includes(contact.lifecycle_stage || 'NEW')) {
            await prisma.contact.update({
                where: { phone_number: phone },
                data: { lifecycle_stage: 'QUALIFIED' },
            });
        }

        res.json({ criteria, matches });
    } catch (error) {
        captureRouteError(error, req, { route: 'leads#9' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/leads/:phone/assign
// Assign a lead to an agent
router.patch('/:phone/assign', async (req, res) => {
    try {
        const phone = await resolvePhone(req.params.phone);
        const { agent_id } = req.body;

        const contact = await prisma.contact.update({
            where: { phone_number: phone },
            // Phase 5C — 'manual' when assigning; clear the method when unassigning.
            data: { assigned_agent_id: agent_id || null, assignment_method: agent_id ? 'manual' : null },
            select: { phone_number: true, assigned_agent_id: true, name: true },
        });

        // Sync all active deals — lead and deal are the same entity, coordinator must match
        if (agent_id) {
            await prisma.transaction.updateMany({
                where: {
                    demand_contact_id: phone,
                    status: { notIn: ['CLOSED_WON', 'CLOSED_LOST', 'ON_HOLD'] },
                },
                data: {
                    coordinator_agent_id: agent_id,
                    executive_agent_id: agent_id,
                    updated_at: new Date(),
                },
            });
        }

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
        captureRouteError(error, req, { route: 'leads#10' });
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
        const phone = await resolvePhone(req.params.phone);
        const session = await prisma.conversationSession.findFirst({
            where: { phone_number: phone },
            orderBy: { updated_at: 'desc' },
            select: { workflow: true, state: true, context: true, active: true, updated_at: true },
        });
        if (!session) return res.json({ answers: null });
        const answers = (session.context as any)?.answers || null;
        res.json({ workflow: session.workflow, state: session.state, active: session.active, updated_at: session.updated_at, answers });
    } catch (error) {
        captureRouteError(error, req, { route: 'leads#11' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/leads/:phone — edit contact identity (name / email). Privileged.
// Cascades the name to partner_agents + denormalized inventory snapshots so a
// rename from the panel self-heals everywhere. See contact_identity.syncContactName.
router.patch('/:phone', checkPermission('edit_contact'), async (req, res) => {
    try {
        if (!(await partnerOwnsLeadOr403(req as any, res, decodeURIComponent(req.params.phone)))) return;
        const phone = await resolvePhone(req.params.phone as string);
        const { name, email } = req.body || {};
        if (name === undefined && email === undefined) {
            return res.status(400).json({ error: 'Nothing to update' });
        }
        const existing = await prisma.contact.findUnique({
            where: { phone_number: phone },
            select: { name: true },
        });
        if (!existing) return res.status(404).json({ error: 'Contact not found' });

        const newName = name !== undefined ? (String(name).trim() || null) : undefined;

        await prisma.$transaction(async (tx) => {
            if (email !== undefined) {
                await tx.contact.update({ where: { phone_number: phone }, data: { email: email || null } });
            }
            if (newName !== undefined) {
                await syncContactName(tx, phone, existing.name, newName);
            }
        });

        const updated = await prisma.contact.findUnique({
            where: { phone_number: phone },
            select: { phone_number: true, name: true, email: true, contact_type: true },
        });
        res.json({ success: true, contact: updated });
    } catch (error) {
        captureRouteError(error, req, { route: 'leads#editIdentity' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/leads/:phone/requirements
// Update buyer requirements including geo location and classification IDs
router.patch('/:phone/requirements', async (req, res) => {
    try {
        if (!(await partnerOwnsLeadOr403(req as any, res, decodeURIComponent(req.params.phone)))) return;
        const phone = await resolvePhone(req.params.phone);
        const {
            budget_min, budget_max, demand_bhk,
            preferred_location, preferred_lat, preferred_lng,
            category_id, sub_category_id, type_id,
            lifecycle_stage, notes, timeline, intent,
            area_min, area_max, area_unit, demand_amenities,
            demand_category, demand_type_slug,
        } = req.body;

        const updateData: any = {};
        if (budget_min !== undefined) updateData.budget_min = budget_min ? Number(budget_min) : null;
        if (budget_max !== undefined) updateData.budget_max = budget_max ? Number(budget_max) : null;
        // Phase 5 (2026-05-29): legacy demand_bhk / demand_amenities /
        // demand_category / demand_type_slug columns dropped from Contact.
        // foldLegacyDemand below maps them into demand_schema_values so the
        // canonical SoT still captures the data when older clients send them.
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

        // Phase 1 dual-write (2026-05-29) — fold legacy demand fields into canonical
        // schema_values; deep-merge with existing so unrelated keys aren't dropped.
        const _existingContact = await prisma.contact.findUnique({
            where: { phone_number: phone },
            select: { demand_schema_values: true, demand_taxonomy_node_id: true },
        });
        const foldedC = foldLegacyDemand({
            demand_bhk: demand_bhk !== undefined ? (demand_bhk ? Number(demand_bhk) : null) : null,
            demand_amenities: demand_amenities,
            demand_taxonomy_node_id: (req.body as any).demand_taxonomy_node_id ?? undefined,
            demand_schema_values: (req.body as any).demand_schema_values ?? undefined,
        });
        const mergedSV_C = mergeDemandSchemaValues(_existingContact?.demand_schema_values, foldedC.demand_schema_values);
        if (mergedSV_C) updateData.demand_schema_values = mergedSV_C;
        if (foldedC.demand_taxonomy_node_id !== undefined && foldedC.demand_taxonomy_node_id !== null) {
            updateData.demand_taxonomy_node_id = foldedC.demand_taxonomy_node_id;
        }

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

        // Sync requirement changes to any active deal snapshots for this contact.
        // Phase 5 (2026-05-29): legacy demand_bedrooms / demand_amenities /
        // demand_category / demand_type_slug columns dropped from Transaction.
        // Sync only surviving universal columns + the canonical schema_values block.
        const dealSync: any = {};
        if (budget_min !== undefined) dealSync.demand_budget_min = budget_min ? Number(budget_min) : null;
        if (budget_max !== undefined) dealSync.demand_budget_max = budget_max ? Number(budget_max) : null;
        if (preferred_location !== undefined) dealSync.demand_location = preferred_location || null;
        if (intent !== undefined) dealSync.demand_intent = intent || null;
        if (area_min !== undefined) dealSync.demand_area_min = area_min ? Number(area_min) : null;
        if (area_max !== undefined) dealSync.demand_area_max = area_max ? Number(area_max) : null;
        if (mergedSV_C) dealSync.demand_schema_values = mergedSV_C;
        if (foldedC.demand_taxonomy_node_id) dealSync.demand_taxonomy_node_id = foldedC.demand_taxonomy_node_id;

        if (Object.keys(dealSync).length > 0) {
            prisma.transaction.updateMany({
                where: {
                    demand_contact_id: phone,
                    status: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
                },
                data: dealSync,
            }).catch((err: Error) => console.warn('[leads] deal sync failed:', err.message));
        }

        res.json(contact);
    } catch (error: any) {
        captureRouteError(error, req, { route: 'leads#12' });
        if (error?.code === 'P2025') {
            return res.status(404).json({ error: 'Lead not found' });
        }
        res.status(500).json({ error: (error as Error).message });
    }
});

export default router;
