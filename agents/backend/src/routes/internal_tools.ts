import { Router, Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import prisma from '../db';
import { resolveCaller, canAccess, ResolvedCaller } from '../services/tool_permission';
import { phoneVariants, resolveStoredContactPhone } from '../utils/phone';
import { WhatsAppService } from '../services/whatsapp';
import { upsertCatalogProduct } from '../services/catalog_sync';
import { captureRouteError } from '../utils/capture';
import { specsScalarFilter } from '../utils/specs_filter';
import { resolveTypeFilter, resolveDemandTaxonomy } from '../utils/demand_taxonomy';
import { foldLegacyDemand } from '../utils/demand_canonical';
import { ensureDealForLead } from '../services/ensure_deal';

const router = Router();
const whatsappService = new WhatsAppService();

// Paths whose tools are customer-safe (act only on the caller's OWN WhatsApp) — a non-agent caller
// is allowed through these with a minimal guest caller, so Panditji can serve buyers on a voice call.
const PUBLIC_TOOL_PATHS = ['/search-and-show-properties', '/send-booking-flow'];

// Middleware: resolve caller from ?caller=+91xxx or body.caller → attach to req
async function resolveCallerMiddleware(req: Request, res: Response, next: NextFunction) {
    const phone = (req.query.caller || req.body?.caller) as string | undefined;
    if (!phone) {
        res.status(400).json({ ok: false, error: 'caller phone required' });
        return;
    }
    const caller = await resolveCaller(phone);
    if (!caller) {
        // Non-agent: only allowed on the customer-safe tool paths (gated again by requireTool/PUBLIC_TOOLS).
        if (PUBLIC_TOOL_PATHS.some(p => req.path.endsWith(p))) {
            (req as any).caller = { phone, role: 'guest' } as unknown as ResolvedCaller;
            return next();
        }
        res.status(403).json({ ok: false, error: 'caller not recognized' });
        return;
    }
    (req as any).caller = caller;
    next();
}

// Middleware factory: enforces permission for the named tool
function requireTool(toolName: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        const caller: ResolvedCaller = (req as any).caller;
        if (!canAccess(caller, toolName)) {
            logger.warn(`[Tools] ${caller.phone} (${caller.role}) denied access to ${toolName}`);
            res.status(403).json({ ok: false, error: 'permission denied' });
            return;
        }
        next();
    };
}

router.use(resolveCallerMiddleware);

// Tool endpoints added in subsequent tasks (4-10).

router.get('/my-leads', requireTool('get_my_leads'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const stage = (req.query.stage as string) || undefined;
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '10', 10) || 10, 1), 50);

    try {
        const leads = await prisma.lead.findMany({
            where: {
                assigned_agent_id: caller.id,
                ...(stage ? { lifecycle_stage: stage } : {}),
            },
            include: { contact: { select: { name: true } } },
            orderBy: { created_at: 'desc' },
            take: limit,
        });

        res.json({
            ok: true,
            leads: leads.map((l: any) => ({
                id: l.id,
                phone: l.contact_phone,
                name: l.contact?.name ?? null,
                intent: l.intent,
                budget_min: l.budget_min,
                budget_max: l.budget_max,
                category: l.demand_main_category,
                type: l.demand_type_slug,
                stage: l.lifecycle_stage,
                created_at: l.created_at,
            })),
        });
    } catch (err) {
        captureRouteError(err, req, { route: 'internal_tools#1' });
        logger.error('[Tools] get_my_leads error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});

router.get('/my-appointments', requireTool('get_my_appointments'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const range = ((req.query.date_range as string) || 'today').toLowerCase();

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    let gte = startOfToday;
    let lte = endOfToday;

    if (range === 'week') {
        lte = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else if (range === 'upcoming') {
        gte = now;
        lte = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    }

    try {
        const appts = await prisma.appointment.findMany({
            where: {
                assigned_to_agent_id: caller.id,
                scheduled_at: { gte, lte },
            },
            include: { contact: { select: { name: true } } },
            orderBy: { scheduled_at: 'asc' },
        });

        res.json({
            ok: true,
            appointments: appts.map((a: any) => ({
                id: a.id,
                scheduled_at: a.scheduled_at,
                client_name: a.contact?.name ?? null,
                client_phone: a.contact_id,
                type: a.type,
                status: a.status,
                location: a.location,
            })),
        });
    } catch (err) {
        captureRouteError(err, req, { route: 'internal_tools#2' });
        logger.error('[Tools] get_my_appointments error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});

router.get('/my-tasks', requireTool('get_my_tasks'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const status = (req.query.status as string) || 'pending';

    try {
        const tasks = await prisma.taskFollowup.findMany({
            where: {
                status,
                contact: { assigned_agent_id: caller.id },
            },
            include: { contact: { select: { name: true } } },
            orderBy: { scheduled_at: 'asc' },
            take: 20,
        });
        res.json({
            ok: true,
            tasks: tasks.map((t: any) => ({
                id: t.id,
                type: t.task_type,
                status: t.status,
                scheduled_at: t.scheduled_at,
                client_name: t.contact?.name ?? null,
                client_phone: t.phone_number,
            })),
        });
    } catch (err) {
        captureRouteError(err, req, { route: 'internal_tools#3' });
        logger.error('[Tools] get_my_tasks error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});

router.get('/search-lead', requireTool('search_lead'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const phone = req.query.phone as string | undefined;
    const name = req.query.name as string | undefined;
    const leadId = req.query.lead_id as string | undefined;

    if (!phone && !name && !leadId) {
        res.status(400).json({ ok: false, error: 'phone, name, or lead_id required' });
        return;
    }

    const where: any = {};
    if (leadId) where.id = leadId;
    if (phone) where.contact_phone = { in: phoneVariants(phone) };
    if (name) where.contact = { name: { contains: name, mode: 'insensitive' } };

    // Phase 1: employee-scope. Manager/super_boss return all leads for now.
    if (caller.role === 'employee') {
        where.assigned_agent_id = caller.id;
    }

    try {
        const leads = await prisma.lead.findMany({
            where,
            include: { contact: { select: { name: true } } },
            orderBy: { created_at: 'desc' },
            take: 5,
        });
        res.json({
            ok: true,
            leads: leads.map((l: any) => ({
                id: l.id,
                phone: l.contact_phone,
                name: l.contact?.name ?? null,
                intent: l.intent,
                budget_min: l.budget_min,
                budget_max: l.budget_max,
                category: l.demand_main_category,
                type: l.demand_type_slug,
                stage: l.lifecycle_stage,
                assigned_agent_id: l.assigned_agent_id,
            })),
        });
    } catch (err) {
        captureRouteError(err, req, { route: 'internal_tools#4' });
        logger.error('[Tools] search_lead error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});

router.post('/schedule-callback', requireTool('schedule_callback'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const { lead_id, datetime, note } = req.body || {};

    if (!lead_id || !datetime) {
        res.status(400).json({ ok: false, error: 'lead_id and datetime required' });
        return;
    }

    try {
        const lead = await prisma.lead.findUnique({ where: { id: lead_id } });
        if (!lead) {
            res.status(404).json({ ok: false, error: 'lead not found' });
            return;
        }

        if (caller.role === 'employee' && lead.assigned_agent_id !== caller.id) {
            res.status(403).json({ ok: false, error: 'lead not assigned to you' });
            return;
        }

        const task = await prisma.taskFollowup.create({
            data: {
                tenant_id: lead.tenant_id,
                phone_number: lead.contact_phone,
                task_type: 'call',
                status: 'pending',
                scheduled_at: new Date(datetime),
            } as any,
        });

        if (note) {
            logger.info(`[Tools] schedule_callback note for task ${task.id}: ${note}`);
        }

        // 2026-05-12: Also create a CALLBACK_REQUEST task in the main tasks
        // table so the assigned agent sees it in their admin task list with
        // SLA tracking + auto-escalation. taskFollowup is the voice-bot-specific
        // record; tasks is what the admin UI renders.
        try {
            const { createLeadActionTask } = await import('../services/workflow_task_service');
            await createLeadActionTask({
                phone: lead.contact_phone,
                action: 'CALLBACK_REQUEST',
                tenantId: lead.tenant_id,
                sourceChannel: 'voice',
                rawNote: note ? `Voice bot scheduled callback for ${datetime}. Note: ${note}` : `Voice bot scheduled callback for ${datetime}`,
            });
        } catch (err) {
            logger.warn(`[Tools] schedule_callback: createLeadActionTask failed (non-blocking): ${(err as Error).message}`);
        }

        res.json({ ok: true, task_id: task.id, scheduled_at: datetime });
    } catch (err) {
        captureRouteError(err, req, { route: 'internal_tools#5' });
        logger.error('[Tools] schedule_callback error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});

router.post('/log-call-note', requireTool('log_call_note'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const { lead_id, note } = req.body || {};

    if (!lead_id || !note) {
        res.status(400).json({ ok: false, error: 'lead_id and note required' });
        return;
    }

    try {
        const lead = await prisma.lead.findUnique({ where: { id: lead_id } });
        if (!lead) {
            res.status(404).json({ ok: false, error: 'lead not found' });
            return;
        }

        if (caller.role === 'employee' && lead.assigned_agent_id !== caller.id) {
            res.status(403).json({ ok: false, error: 'lead not assigned to you' });
            return;
        }

        const interaction = await prisma.interaction.create({
            data: {
                tenant_id: lead.tenant_id,
                phone_number: lead.contact_phone,
                channel: 'voice',
                direction: 'internal',
                event_type: 'note',
                content: `[Panditji note by ${caller.name}]: ${note}`,
            } as any,
        });

        res.json({ ok: true, interaction_id: interaction.id });
    } catch (err) {
        captureRouteError(err, req, { route: 'internal_tools#6' });
        logger.error('[Tools] log_call_note error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});

router.post('/send-whatsapp', requireTool('send_on_whatsapp'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const { recipient_phone, content_type, payload } = req.body || {};

    if (!recipient_phone || !content_type || !payload) {
        res.status(400).json({ ok: false, error: 'recipient_phone, content_type, payload required' });
        return;
    }

    if (content_type !== 'text') {
        res.status(400).json({ ok: false, error: `content_type ${content_type} not supported in phase 1` });
        return;
    }

    const body = payload?.body as string | undefined;
    if (!body || body.length === 0) {
        res.status(400).json({ ok: false, error: 'payload.body required for text content' });
        return;
    }

    try {
        // WhatsAppService.sendText returns Promise<void> in production (fire-and-forget
        // with circuit breaker). Tests mock it to return a Meta-shaped response so we
        // can assert on wa_message_id. Cast to any so we can best-effort extract the id.
        const result: any = await whatsappService.sendText(recipient_phone, body);
        const waId = result?.messages?.[0]?.id ?? result?.messageId ?? null;
        logger.info(`[Tools] ${caller.name} → WA to ${recipient_phone} wa_id=${waId}`);
        res.json({ ok: true, wa_message_id: waId });
    } catch (err) {
        captureRouteError(err, req, { route: 'internal_tools#7' });
        logger.error('[Tools] send_on_whatsapp error:', err);
        res.status(500).json({ ok: false, error: 'whatsapp send failed' });
    }
});

router.get('/search-inventory', requireTool('search_inventory'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const location = (req.query.location as string)?.trim();
    const intent = (req.query.intent as string)?.trim();
    const bhk = req.query.bhk !== undefined ? parseInt(req.query.bhk as string, 10) : undefined;
    const budgetMin = req.query.budget_min !== undefined ? Number(req.query.budget_min) : undefined;
    const budgetMax = req.query.budget_max !== undefined ? Number(req.query.budget_max) : undefined;
    const propertyType = (req.query.property_type as string)?.trim();
    const furnishing = (req.query.furnishing as string)?.trim();
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '5', 10) || 5, 1), 20);

    if (!location || !intent) {
        res.status(400).json({ ok: false, error: 'location and intent required' });
        return;
    }

    const intentMap: Record<string, string | string[]> = {
        buy: 'sell',
        sell: 'sell',
        rent: ['rent', 'rent_lease', 'lease'],
    };
    const dbIntent = intentMap[intent.toLowerCase()] ?? intent.toLowerCase();

    const where: any = {
        status: 'active',
        intent: Array.isArray(dbIntent) ? { in: dbIntent } : dbIntent,
        tenant_id: caller.tenant_id,
        OR: [
            { city: { contains: location, mode: 'insensitive' } },
            { locality: { contains: location, mode: 'insensitive' } },
            { sub_locality: { contains: location, mode: 'insensitive' } },
            { location: { contains: location, mode: 'insensitive' } },
        ],
    };

    if (propertyType) where.type = propertyType;
    // furnishing column dropped 2026-05-28 — filter specs.furnishing instead (else 500s).
    if (furnishing) {
        const frag = specsScalarFilter('furnishing', [furnishing]);
        if (frag) { where.AND = where.AND || []; where.AND.push(frag); }
    }

    if (budgetMin !== undefined || budgetMax !== undefined) {
        where.display_price = {};
        if (budgetMin !== undefined) where.display_price.gte = budgetMin;
        if (budgetMax !== undefined) where.display_price.lte = budgetMax;
    }

    try {
        const items = await prisma.inventory.findMany({
            where,
            orderBy: { created_at: 'desc' },
            take: limit,
        });

        const filtered = bhk !== undefined
            ? items.filter((i: any) => i.specs?.bedrooms === bhk)
            : items;

        res.json({
            ok: true,
            count: filtered.length,
            inventory: filtered.map((i: any) => ({
                id: i.id,
                type: i.type,
                intent: i.intent,
                price: i.price,
                city: i.city,
                locality: i.locality,
                sub_locality: i.sub_locality,
                furnishing: (i.specs as any)?.furnishing ?? null,
                bedrooms: i.specs?.bedrooms ?? null,
                area: i.specs?.area ?? null,
                area_unit: i.specs?.unit ?? 'sqft',
                media_urls: i.media_urls,
            })),
        });
    } catch (err) {
        captureRouteError(err, req, { route: 'internal_tools#8' });
        logger.error('[Tools] search_inventory error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});

router.post('/schedule-site-visit', requireTool('schedule_site_visit'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const { lead_id, datetime, property_id, location } = req.body || {};

    if (!lead_id || !datetime) {
        res.status(400).json({ ok: false, error: 'lead_id and datetime required' });
        return;
    }

    try {
        const lead = await prisma.lead.findUnique({ where: { id: lead_id } });
        if (!lead) {
            res.status(404).json({ ok: false, error: 'lead not found' });
            return;
        }
        if (caller.role === 'employee' && lead.assigned_agent_id !== caller.id) {
            res.status(403).json({ ok: false, error: 'lead not assigned to you' });
            return;
        }

        const data: any = {
            tenant_id: lead.tenant_id,
            contact_id: lead.contact_phone,
            assigned_to_agent_id: lead.assigned_agent_id,
            title: 'Site visit',
            type: 'site_visit',
            status: 'scheduled',
            scheduled_at: new Date(datetime),
            source: 'voice',
            channel: 'voice',
        };
        if (location) data.location = location;
        if (property_id) data.property_id = property_id;

        const appt = await prisma.appointment.create({ data });

        res.json({ ok: true, appointment_id: appt.id, scheduled_at: datetime });
    } catch (err) {
        captureRouteError(err, req, { route: 'internal_tools#9' });
        logger.error('[Tools] schedule_site_visit error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});

router.post('/update-lead-status', requireTool('update_lead_status'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const { lead_id, stage, note } = req.body || {};

    if (!lead_id || !stage) {
        res.status(400).json({ ok: false, error: 'lead_id and stage required' });
        return;
    }

    try {
        const lead = await prisma.lead.findUnique({ where: { id: lead_id } });
        if (!lead) { res.status(404).json({ ok: false, error: 'lead not found' }); return; }
        if (caller.role === 'employee' && lead.assigned_agent_id !== caller.id) {
            res.status(403).json({ ok: false, error: 'lead not assigned to you' });
            return;
        }

        const updated = await prisma.lead.update({
            where: { id: lead_id },
            data: { lifecycle_stage: stage },
        });

        if (note) {
            try {
                await prisma.interaction.create({
                    data: {
                        tenant_id: lead.tenant_id,
                        phone_number: lead.contact_phone,
                        channel: 'voice',
                        direction: 'internal',
                        event_type: 'stage_change',
                        content: `[Panditji by ${caller.name}]: stage → ${stage}. Note: ${note}`,
                    } as any,
                });
            } catch (e) {
                logger.warn('[Tools] update_lead_status: failed to log interaction', e);
            }
        }

        res.json({ ok: true, lead_id: updated.id, stage: updated.lifecycle_stage });
    } catch (err) {
        captureRouteError(err, req, { route: 'internal_tools#10' });
        logger.error('[Tools] update_lead_status error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});

router.get('/lead-history', requireTool('get_lead_history'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const leadId = req.query.lead_id as string | undefined;
    if (!leadId) { res.status(400).json({ ok: false, error: 'lead_id required' }); return; }

    try {
        const lead = await prisma.lead.findUnique({ where: { id: leadId } });
        if (!lead) { res.status(404).json({ ok: false, error: 'lead not found' }); return; }
        if (caller.role === 'employee' && lead.assigned_agent_id !== caller.id) {
            res.status(403).json({ ok: false, error: 'lead not assigned to you' });
            return;
        }

        const history = await prisma.interaction.findMany({
            where: { phone_number: lead.contact_phone },
            orderBy: { created_at: 'desc' },
            take: 10,
        });

        res.json({
            ok: true,
            history: history.map((h: any) => ({
                id: h.id,
                channel: h.channel,
                direction: h.direction,
                event_type: h.event_type,
                content: h.content,
                created_at: h.created_at,
            })),
        });
    } catch (err) {
        captureRouteError(err, req, { route: 'internal_tools#11' });
        logger.error('[Tools] get_lead_history error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});

router.post('/mark-task-done', requireTool('mark_task_done'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const { task_id, outcome_note } = req.body || {};
    if (!task_id) { res.status(400).json({ ok: false, error: 'task_id required' }); return; }

    try {
        const task = await prisma.taskFollowup.findUnique({
            where: { id: task_id },
            include: { contact: { select: { assigned_agent_id: true, tenant_id: true, phone_number: true } } },
        });
        if (!task) { res.status(404).json({ ok: false, error: 'task not found' }); return; }

        if (caller.role === 'employee' && (task as any).contact?.assigned_agent_id !== caller.id) {
            res.status(403).json({ ok: false, error: 'task not assigned to you' });
            return;
        }

        const updated = await prisma.taskFollowup.update({
            where: { id: task_id },
            data: { status: 'completed', executed_at: new Date() },
        });

        if (outcome_note) {
            try {
                await prisma.interaction.create({
                    data: {
                        tenant_id: task.tenant_id,
                        phone_number: task.phone_number,
                        channel: 'voice',
                        direction: 'internal',
                        event_type: 'task_completed',
                        content: `[Panditji by ${caller.name}]: task ${task_id} completed. Outcome: ${outcome_note}`,
                    } as any,
                });
            } catch (e) {
                logger.warn('[Tools] mark_task_done: failed to log interaction', e);
            }
        }

        res.json({ ok: true, task_id: updated.id, status: updated.status });
    } catch (err) {
        captureRouteError(err, req, { route: 'internal_tools#12' });
        logger.error('[Tools] mark_task_done error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});

router.get('/unassigned-leads', requireTool('get_unassigned_leads'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const location = (req.query.location as string)?.trim();
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '20', 10) || 20, 1), 50);

    const where: any = {
        assigned_agent_id: null,
        tenant_id: caller.tenant_id,
    };
    if (location) where.preferred_location = { contains: location, mode: 'insensitive' };

    try {
        const leads = await prisma.lead.findMany({
            where,
            include: { contact: { select: { name: true } } },
            orderBy: { created_at: 'desc' },
            take: limit,
        });
        res.json({
            ok: true,
            leads: leads.map((l: any) => ({
                id: l.id,
                phone: l.contact_phone,
                name: l.contact?.name ?? null,
                intent: l.intent,
                preferred_location: l.preferred_location,
                budget_min: l.budget_min,
                budget_max: l.budget_max,
                category: l.demand_main_category,
                stage: l.lifecycle_stage,
                created_at: l.created_at,
            })),
        });
    } catch (err) {
        captureRouteError(err, req, { route: 'internal_tools#13' });
        logger.error('[Tools] get_unassigned_leads error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});

router.post('/reassign-lead', requireTool('reassign_lead'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const { lead_id, new_agent_id } = req.body || {};

    if (!lead_id || !new_agent_id) {
        res.status(400).json({ ok: false, error: 'lead_id and new_agent_id required' });
        return;
    }

    try {
        const lead = await prisma.lead.findUnique({ where: { id: lead_id } });
        if (!lead) { res.status(404).json({ ok: false, error: 'lead not found' }); return; }

        // Tenant scope check
        if (lead.tenant_id !== caller.tenant_id) {
            res.status(403).json({ ok: false, error: 'lead not in your tenant' });
            return;
        }

        // Manager scope: new_agent_id must be in manager's team (subordinates + self)
        if (caller.role === 'manager') {
            const team = await prisma.agent.findMany({
                where: {
                    tenant_id: caller.tenant_id,
                    status: 'active',
                    OR: [
                        { id: caller.id },
                        { reports_to_id: caller.id },
                    ],
                    AND: [{ id: new_agent_id }],
                },
                select: { id: true },
            });
            if (team.length === 0) {
                res.status(403).json({ ok: false, error: 'target agent not in your team' });
                return;
            }
        }
        // super_boss: any active agent in the tenant is fine — optional verification skipped for simplicity

        const updated = await prisma.lead.update({
            where: { id: lead_id },
            data: { assigned_agent_id: new_agent_id },
        });

        logger.info(`[Tools] ${caller.name} (${caller.role}) reassigned lead ${lead_id} → ${new_agent_id}`);

        res.json({ ok: true, lead_id: updated.id, new_agent_id: updated.assigned_agent_id });
    } catch (err) {
        captureRouteError(err, req, { route: 'internal_tools#14' });
        logger.error('[Tools] reassign_lead error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});

// Helper: resolve team member IDs for the caller's scope.
async function getTeamMemberIds(caller: ResolvedCaller): Promise<string[]> {
    if (caller.role === 'super_boss') {
        const all = await prisma.agent.findMany({
            where: { tenant_id: caller.tenant_id, status: 'active' },
            select: { id: true },
        });
        return all.map((a: any) => a.id);
    }
    // manager
    const team = await prisma.agent.findMany({
        where: {
            tenant_id: caller.tenant_id,
            status: 'active',
            OR: [{ id: caller.id }, { reports_to_id: caller.id }],
        },
        select: { id: true, name: true },
    });
    return team.map((a: any) => a.id);
}

router.get('/team-performance', requireTool('get_team_performance'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const period = ((req.query.period as string) || 'today').toLowerCase();

    // Period window
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let gte = startOfToday;
    if (period === 'week') gte = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (period === 'month') gte = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);

    try {
        // Fetch team members with names
        const teamWhere: any = {
            tenant_id: caller.tenant_id,
            status: 'active',
        };
        if (caller.role === 'manager') {
            teamWhere.OR = [{ id: caller.id }, { reports_to_id: caller.id }];
        }
        const team = await prisma.agent.findMany({
            where: teamWhere,
            select: { id: true, name: true },
        });

        const results = await Promise.all(team.map(async (a: any) => {
            const [leads, appts] = await Promise.all([
                prisma.lead.count({ where: { assigned_agent_id: a.id, created_at: { gte } } }),
                prisma.appointment.count({ where: { assigned_to_agent_id: a.id, scheduled_at: { gte } } }),
            ]);
            return {
                agent_id: a.id,
                agent_name: a.name,
                leads,
                appointments: appts,
            };
        }));

        res.json({ ok: true, period, team: results });
    } catch (err) {
        captureRouteError(err, req, { route: 'internal_tools#15' });
        logger.error('[Tools] get_team_performance error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});

router.get('/pipeline-overview', requireTool('get_pipeline_overview'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const period = ((req.query.period as string) || 'all').toLowerCase();

    const where: any = { tenant_id: caller.tenant_id };
    if (period === 'week' || period === 'month') {
        const now = new Date();
        const days = period === 'week' ? 7 : 30;
        where.created_at = { gte: new Date(now.getTime() - days * 24 * 60 * 60 * 1000) };
    }

    if (caller.role === 'manager') {
        const teamIds = await getTeamMemberIds(caller);
        where.assigned_agent_id = { in: teamIds };
    }

    try {
        const grouped = await prisma.lead.groupBy({
            by: ['lifecycle_stage'],
            where,
            _count: { id: true },
            _sum: { budget_max: true },
        });

        res.json({
            ok: true,
            period,
            stages: grouped.map((g: any) => ({
                stage: g.lifecycle_stage ?? 'unknown',
                count: g._count?.id ?? 0,
                estimated_value: g._sum?.budget_max ?? 0,
            })),
        });
    } catch (err) {
        captureRouteError(err, req, { route: 'internal_tools#16' });
        logger.error('[Tools] get_pipeline_overview error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});

router.get('/company-metrics', requireTool('get_company_metrics'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const period = ((req.query.period as string) || 'week').toLowerCase();

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let gte = startOfToday;
    if (period === 'week') gte = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (period === 'month') gte = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);

    try {
        const [newLeads, dealsClosed, dealsAgg, activeAgents] = await Promise.all([
            prisma.lead.count({ where: { tenant_id: caller.tenant_id, created_at: { gte } } }),
            (prisma as any).transaction.count({
                where: { tenant_id: caller.tenant_id, status: 'CLOSED_WON', closed_at: { gte } },
            }),
            (prisma as any).transaction.aggregate({
                where: { tenant_id: caller.tenant_id, status: 'CLOSED_WON', closed_at: { gte } },
                _sum: { final_price: true },
            }),
            prisma.agent.findMany({
                where: { tenant_id: caller.tenant_id, status: 'active' },
                select: { id: true },
            }),
        ]);

        res.json({
            ok: true,
            period,
            metrics: {
                new_leads: newLeads,
                deals_closed: dealsClosed,
                deals_closed_value: (dealsAgg as any)?._sum?.final_price ?? 0,
                active_agents: activeAgents.length,
            },
        });
    } catch (err) {
        captureRouteError(err, req, { route: 'internal_tools#17' });
        logger.error('[Tools] get_company_metrics error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});

router.get('/stuck-deals', requireTool('get_stuck_deals'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const days = Math.max(1, Math.min(60, parseInt((req.query.days as string) || '10', 10) || 10));
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const where: any = {
        tenant_id: caller.tenant_id,
        status: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
        updated_at: { lt: cutoff },
    };

    if (caller.role === 'manager') {
        const team = await prisma.agent.findMany({
            where: {
                tenant_id: caller.tenant_id,
                status: 'active',
                OR: [{ id: caller.id }, { reports_to_id: caller.id }],
            },
            select: { id: true },
        });
        where.coordinator_agent_id = { in: team.map((a: any) => a.id) };
    }

    try {
        const deals = await (prisma as any).transaction.findMany({
            where,
            orderBy: { updated_at: 'asc' },
            take: 20,
        });

        res.json({
            ok: true,
            days,
            deals: deals.map((d: any) => ({
                id: d.id,
                status: d.status,
                final_price: d.final_price,
                contact_phone: d.demand_contact_id,
                coordinator_agent_id: d.coordinator_agent_id,
                updated_at: d.updated_at,
                days_stuck: Math.floor((Date.now() - new Date(d.updated_at).getTime()) / (24 * 60 * 60 * 1000)),
            })),
        });
    } catch (err) {
        captureRouteError(err, req, { route: 'internal_tools#18' });
        logger.error('[Tools] get_stuck_deals error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});

// POST /search-and-show-properties — search inventory and send matching property cards to caller's WhatsApp
router.post('/search-and-show-properties', requireTool('search_and_show_properties'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const { city, intent, property_type, category, bhk, budget_min, budget_max, limit = 10 } = req.body;

    try {
        const where: any = { status: 'active' };
        if (city) where.city = { contains: city, mode: 'insensitive' };
        // schema intent: sell | rent | rent_lease | lease (tool sends BUY/RENT)
        if (intent) {
            const intentLower = String(intent).toLowerCase();
            where.intent = intentLower === 'buy' ? 'sell' : { in: ['rent', 'rent_lease', 'lease'] };
        }
        // Taxonomy-aligned type filter, as a UNION (never stricter than the legacy contains-match):
        // resolve the loose property_type slug → its taxonomy node, then match inventory that is EITHER
        // tagged with that node (precise) OR whose legacy `type` text contains the slug (un-backfilled
        // listings). A hard taxonomy-only AND would silently drop any listing not yet tagged → 0 results.
        if (property_type) {
            const tf = await resolveTypeFilter({ property_type });
            const typeOr: any[] = [];
            if (tf.sub_category_id) typeOr.push({ sub_category_id: tf.sub_category_id });
            if (tf.category_id) typeOr.push({ category_id: tf.category_id });
            typeOr.push({ type: { contains: property_type, mode: 'insensitive' } });
            where.OR = typeOr;
        }
        if (category) {
            where.category = { contains: category, mode: 'insensitive' };
        }
        // BHK lives in specs JSON — filter post-query on the canonical chain (bhk → rooms → bedrooms)
        const bhkFilter = bhk ? Number(bhk) : null;
        if (budget_min || budget_max) {
            where.display_price = {};
            if (budget_min) where.display_price.gte = Number(budget_min);
            if (budget_max) where.display_price.lte = Number(budget_max);
        }

        const properties = await prisma.inventory.findMany({
            where,
            take: Math.min(Number(limit), 30),
            orderBy: { created_at: 'desc' },
            select: {
                id: true, apartment_name: true, display_price: true, specs: true,
                type: true, city: true, locality: true, media_urls: true,
                description: true, intent: true, category: true, status: true,
            },
        });

        // Post-filter by BHK on the canonical specs chain (bhk → rooms → legacy bedrooms).
        // IMPORTANT: BHK is SOFT, not a hard filter. ~95% of rental specs have NO bedroom field
        // (data gap — verified in prod: 43/45 active rentals lack BHK). A hard match would drop
        // every BHK-unknown listing → 0 results → the bot sends nothing. So we keep exact matches
        // AND BHK-unknown listings (exact matches ranked first); only a KNOWN, different BHK is
        // excluded. Better to send relevant city/type/budget matches than silence.
        const bhkOf = (p: any) => {
            const s = (p.specs as any) || {};
            const raw = s.bhk ?? s.rooms ?? s.bedrooms;
            return raw != null ? parseInt(String(raw), 10) : null;
        };
        const filtered = bhkFilter
            ? properties
                .filter((p: any) => { const b = bhkOf(p); return b == null || b === bhkFilter; })
                .sort((a: any, b: any) => (bhkOf(a) === bhkFilter ? 0 : 1) - (bhkOf(b) === bhkFilter ? 0 : 1))
            : properties;

        if (filtered.length === 0) {
            return res.json({ ok: true, count: 0, message: 'Koi property nahi mili aapke criteria se. Filters change karke try karein.' });
        }

        // Ensure all matched properties exist in Meta catalog
        await Promise.all(filtered.map((p: any) => upsertCatalogProduct(p).catch(() => null)));

        const ids = filtered.map((p: any) => String(p.id));

        // Try catalog product message; fall back to text if catalog not yet indexed by Meta
        let sent = false;
        try {
            if (ids.length === 1) {
                await whatsappService.sendSingleProductMessage(
                    caller.phone,
                    'Yeh property aapke criteria se match karti hai.',
                    'Realty Pandit',
                    ids[0],
                );
            } else {
                await whatsappService.sendMultiProductMessage(
                    caller.phone,
                    'Matching Properties',
                    `${filtered.length} properties aapke criteria se match karti hain.`,
                    'Realty Pandit',
                    [{ title: 'Properties', productRetailerIds: ids }],
                );
            }
            sent = true;
        } catch (catalogErr: any) {
            logger.warn('[search-and-show-properties] Catalog MPM failed, sending text fallback:', catalogErr.message);
        }

        if (!sent) {
            // Text fallback: send property links until catalog is indexed by Meta
            const lines = filtered.slice(0, 10).map((p: any, i: number) => {
                const name = p.apartment_name || p.type || 'Property';
                const loc = [p.locality, p.city].filter(Boolean).join(', ');
                const price = p.display_price ? `₹${Number(p.display_price).toLocaleString('en-IN')}` : '';
                return `${i + 1}. ${name} in ${loc} ${price}\nhttps://www.realtypandit.in/properties/${p.id}`;
            });
            await whatsappService.sendText(
                caller.phone,
                `*${filtered.length} Properties Found:*\n\n${lines.join('\n\n')}`,
            );
        }

        // Lead capture (fire-and-forget) — a buyer who received properties on a voice call is an
        // engaged lead. Qualify them (contact + demand taxonomy) and create a deal so an agent
        // follows up. Never blocks the WhatsApp send / HTTP response; idempotent via ensureDealForLead.
        void (async () => {
            try {
                const storedPhone = (await resolveStoredContactPhone(caller.phone, prisma)) ?? caller.phone;
                const isRent = String(intent || '').toLowerCase() !== 'buy';
                const demandTax = await resolveDemandTaxonomy({
                    property_type: property_type || category || undefined,
                    main_category: category || undefined,
                    bhk: bhk ? Number(bhk) : undefined,
                });
                const demand = {
                    intent: isRent ? 'rent' : 'buy',
                    contact_type: (isRent ? 'TENANT' : 'BUYER') as any,
                    preferred_location: city || undefined,
                    budget_min: budget_min ? Number(budget_min) : undefined,
                    budget_max: budget_max ? Number(budget_max) : undefined,
                    demand_taxonomy_node_id: demandTax.demand_taxonomy_node_id ?? undefined,
                    needs_taxonomy_review: demandTax.needs_review || undefined,
                    sub_category_id: demandTax.sub_category_id ?? undefined,
                    category_id: demandTax.category_id ?? undefined,
                    type_id: demandTax.type_id ?? undefined,
                    ...(foldLegacyDemand({ demand_bhk: bhk ? Number(bhk) : null }) as any),
                    last_channel: 'voice',
                    last_interaction: new Date(),
                };
                const tenantId = caller.tenant_id ?? (await prisma.tenant.findFirst())?.id;
                await prisma.contact.upsert({
                    where: { phone_number: storedPhone },
                    update: demand,
                    create: { phone_number: storedPhone, tenant_id: tenantId!, source: 'voice', ...demand },
                });
                await ensureDealForLead({ contactPhone: storedPhone, source: 'voice' });
            } catch (capErr: any) {
                logger.warn('[search-and-show-properties] lead capture failed (non-fatal):', capErr?.message);
            }
        })();

        return res.json({ ok: true, count: filtered.length, message: `Maine aapke WhatsApp pe ${filtered.length} properties bhej di hain.` });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'internal_tools#19' });
        logger.error('[Tools] search_and_show_properties error:', err.message);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// POST /send-booking-flow — send site visit booking Flow for a specific property to caller's WhatsApp
router.post('/send-booking-flow', requireTool('send_booking_flow'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const { property_id } = req.body;

    if (!property_id) return res.status(400).json({ ok: false, error: 'property_id required' });

    const flowId = process.env.BOOKING_FLOW_ID;
    if (!flowId) return res.json({ ok: false, error: 'BOOKING_FLOW_ID not configured yet' });

    try {
        const property = await prisma.inventory.findUnique({
            where: { id: String(property_id) },
            select: { id: true, apartment_name: true, city: true },
        });
        if (!property) return res.status(404).json({ ok: false, error: 'property not found' });

        const propName = (property as any).apartment_name ?? `Property #${property.id}`;
        await whatsappService.sendFlow(
            caller.phone,
            flowId,
            `Book a site visit for: ${propName}`,
            'DATE_SCREEN',
            { property_id: String(property.id), property_name: propName },
        );

        return res.json({ ok: true, message: 'Booking form aapke WhatsApp pe bhej diya.' });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'internal_tools#20' });
        logger.error('[Tools] send_booking_flow error:', err.message);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

export { router, requireTool };
export default router;
