/**
 * Deal Management Routes (Phase 7)
 *
 * Admin-facing API for the 3-role deal system.
 * All routes require JWT auth via authMiddleware.
 */

import { Router } from 'express';
import { authMiddleware, checkPermission } from '../middleware/auth';
import { validate } from '../validators';
import {
    createDealSchema,
    matchPropertySchema,
    updateDealStatusSchema,
    createDealQuerySchema,
    answerDealQuerySchema,
} from '../validators/deals.validator';
import {
    createDeal,
    matchPropertyToDeal,
    getDealById,
    getDealTimeline,
    listDeals,
    getDealPipelineStats,
} from '../services/deal_service';
import { transitionTransaction, advanceVisitedDeal, getValidNextStatuses } from '../services/transaction_state_machine';
import { notifyDealEvent } from '../services/deal_notifications';
import { notify } from '../services/notify';
import { commissionService } from '../services/commission_service';
import { createDealReminder } from '../services/deal_reminder';
import { getTeamIds } from '../utils/team_scope';
import prisma from '../db';
import logger from '../utils/logger';
import { captureRouteError } from '../utils/capture';
import { foldLegacyDemand, mergeDemandSchemaValues } from '../utils/demand_canonical';

const router = Router();
router.use(authMiddleware);

// ─── POST /api/deals — Create a new deal ─────────────────────────────────────
router.post('/', checkPermission('manage_deals'), validate(createDealSchema), async (req: any, res) => {
    try {
        const agent = req.agent;
        const result = await createDeal(
            { ...req.body, tenant_id: agent.tenant_id },
            agent.id,
            'admin'
        );

        if (result.isDuplicate) {
            return res.status(409).json({
                success: false,
                error: 'Duplicate deal detected',
                existing_deal: result.deal,
            });
        }

        // Notify coordinator about new deal (in-app)
        if (result.deal?.demand_handler_id) {
            const handler = await prisma.agent.findUnique({ where: { id: result.deal.demand_handler_id }, select: { id: true, phone: true, email: true, name: true } });
            if (handler && handler.id !== req.agent.id) {
                notify('deal_created', [{ id: handler.id, type: 'agent', phone: handler.phone || undefined, email: handler.email || undefined, name: handler.name }], {
                    deal_id: result.deal.id, customer_name: req.body.demand_name || req.body.demand_phone,
                });
            }
        }

        res.status(201).json({
            success: true,
            data: result.deal,
            matches: result.matches,
        });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'deals#1' });
        logger.error('[DealAPI] Create deal error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── GET /api/deals — List deals with filters ────────────────────────────────
/**
 * PARTNER deal guard (2026-07-13). No-op for team members. For a partner: must be ACTIVE and the deal must
 * be theirs (they/their sub-agents handle it, OR it came from a lead they referred). 403 otherwise.
 */
async function partnerOwnsDealOr403(req: any, res: any, dealId: string): Promise<boolean> {
    if (req.agent?.role !== 'partner') return true;

    const pa = await prisma.partnerAgent.findUnique({
        where: { id: req.agent.id }, select: { status: true },
    });
    if (!pa || pa.status !== 'ACTIVE') {
        res.status(403).json({ success: false, error: 'Partner account is not active' });
        return false;
    }

    const { partnerDealWhereOr } = await import('../utils/partner_scope');
    const or = await partnerDealWhereOr(req.agent.id);
    const owned = await prisma.transaction.findFirst({
        where: { id: dealId, OR: or },
        select: { id: true },
    });
    if (!owned) {
        logger.warn(`[PartnerGuard] Partner ${req.agent.id} blocked from deal ${dealId}`);
        res.status(403).json({ success: false, error: 'You can only work your own deals.' });
        return false;
    }
    return true;
}

router.get('/', async (req: any, res) => {
    try {
        const agent = req.agent;
        const { status, deal_scenario, coordinator_agent_id, demand_handler_id, supply_handler_id, min_priority, page, limit, search, hide_closed, taxonomy_node_ids, bhk, sort, direction } = req.query;

        const filters: any = { tenant_id: agent.tenant_id };
        if (status) filters.status = status;
        if (deal_scenario) filters.deal_scenario = deal_scenario;
        if (coordinator_agent_id) filters.coordinator_agent_id = coordinator_agent_id;
        if (demand_handler_id) filters.demand_handler_id = demand_handler_id;
        if (supply_handler_id) filters.supply_handler_id = supply_handler_id;
        if (min_priority !== undefined && min_priority !== '') filters.min_priority = parseInt(min_priority);
        if (page) filters.page = parseInt(page);
        if (limit) filters.limit = parseInt(limit);
        if (search && typeof search === 'string' && search.trim()) filters.search = search.trim();
        if (taxonomy_node_ids && typeof taxonomy_node_ids === 'string' && taxonomy_node_ids.trim()) filters.taxonomy_node_ids = taxonomy_node_ids.trim();
        if (bhk && typeof bhk === 'string' && bhk.trim()) filters.bhk = bhk.trim();
        // Ordering (2026-07-21): 'next_action' (default) | 'lead_date' | 'reminder_date',
        // with direction 'asc' | 'desc'. Sorting runs across the WHOLE filtered set
        // server-side — see listDeals(); the board no longer re-sorts client-side.
        if (sort && typeof sort === 'string' && sort.trim()) filters.sort = sort.trim();
        if (direction && typeof direction === 'string' && direction.trim()) filters.direction = direction.trim();
        // 2026-05-13: hide CLOSED_WON+CLOSED_LOST by default — pass hide_closed=false to see them.
        // If a specific status is requested, that wins.
        filters.hide_closed = hide_closed === undefined ? true : (hide_closed !== 'false');

        // Visibility (2026-06-27): manager = their team, employee = own, super_boss = all.
        // PARTNER (2026-07-13): not an Agent — team_ids would always match nothing. Scope to THEIR deals.
        if (agent.role === 'partner') {
            const { partnerIdsWithSubAgents } = await import('../utils/partner_scope');
            const { ids } = await partnerIdsWithSubAgents(agent.id);
            filters.partner_ids = ids;
        } else if (agent.role !== 'super_boss') {
            filters.team_ids = await getTeamIds(agent);
        }

        const result = await listDeals(filters);
        res.json({ success: true, ...result });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'deals#2' });
        logger.error('[DealAPI] List deals error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── GET /api/deals/pipeline — Pipeline stats ────────────────────────────────
router.get('/pipeline', async (req: any, res) => {
    try {
        let partnerIds: string[] | undefined;
        let teamIds: string[] | undefined;
        if (req.agent.role === 'partner') {
            const { partnerIdsWithSubAgents } = await import('../utils/partner_scope');
            partnerIds = (await partnerIdsWithSubAgents(req.agent.id)).ids;
        } else if (req.agent.role !== 'super_boss') {
            teamIds = await getTeamIds(req.agent);
        }
        const stats = await getDealPipelineStats(req.agent.tenant_id, teamIds, partnerIds);
        res.json({ success: true, data: stats });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'deals#3' });
        logger.error('[DealAPI] Pipeline stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/deals/:id/partner-assign  { partner_agent_id: string | null }
 * PARTNER TEAMS (2026-07-13): a partner COMPANY OWNER assigns one of THEIR OWN deals to one of THEIR
 * OWN sub-agents (or themselves, or unassigns). Writes ONLY `partner_assignee_id` — the handler/referral
 * fields (who BROUGHT the business → commission) are never touched.
 * Deal-level assign overrides whatever the lead-level cascade set for this one deal.
 */
router.post('/:id/partner-assign', async (req: any, res) => {
    try {
        if (!(await partnerOwnsDealOr403(req, res, req.params.id))) return;
        const { assertPartnerOwnerCanAssign } = await import('../utils/partner_team');
        const check = await assertPartnerOwnerCanAssign(req, res, req.body?.partner_agent_id ?? null);
        if (!check.ok) return;

        const updated = await prisma.transaction.update({
            where: { id: req.params.id },
            data: { partner_assignee_id: check.assigneeId },
            select: { id: true, partner_assignee_id: true },
        });
        logger.info(`[PartnerAssign] deal ${updated.id} -> ${check.assigneeId ?? 'unassigned'} by partner ${req.agent.id}`);
        res.json({ success: true, ...updated });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'deals#partner-assign' });
        logger.error('[PartnerAssign] deal error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── GET /api/deals/:id — Full deal detail ───────────────────────────────────
router.get('/:id', async (req: any, res) => {
    try {
        if (!(await partnerOwnsDealOr403(req, res, req.params.id))) return;

        const deal = await getDealById(req.params.id);
        if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });

        // Visibility (2026-06-27): non-super_boss can only open deals handled by themselves or their team.
        // PARTNER: they belong to no team, so this rule would always reject them — their ownership was
        // already enforced by partnerOwnsDealOr403 above.
        if (req.agent.role !== 'super_boss' && req.agent.role !== 'partner') {
            const teamIds = await getTeamIds(req.agent);
            if (!teamIds.includes(deal.coordinator_agent_id) && !teamIds.includes(deal.executive_agent_id)) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }
        }

        const validNext = getValidNextStatuses(deal.status);
        res.json({ success: true, data: { ...deal, valid_next_statuses: validNext } });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'deals#4' });
        logger.error('[DealAPI] Get deal error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── GET /api/deals/:id/timeline — Unified timeline ──────────────────────────
router.get('/:id/timeline', async (req: any, res) => {
    try {
        if (!(await partnerOwnsDealOr403(req, res, req.params.id))) return;
        const timeline = await getDealTimeline(req.params.id);
        res.json({ success: true, data: timeline });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'deals#5' });
        logger.error('[DealAPI] Timeline error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── PATCH /api/deals/:id/match — Link property + supply handler ─────────────
router.patch('/:id/match', checkPermission('act_on_deals'), validate(matchPropertySchema), async (req: any, res) => {
    try {
        if (!(await partnerOwnsDealOr403(req, res, req.params.id))) return;
        const { inventory_id, supply_contact_id, supply_handler_type, supply_handler_id } = req.body;
        const updated = await matchPropertyToDeal(
            req.params.id,
            inventory_id,
            supply_contact_id,
            supply_handler_type,
            supply_handler_id,
            req.agent.id
        );
        res.json({ success: true, data: updated });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'deals#6' });
        logger.error('[DealAPI] Match property error:', error);
        const code = error.message.includes('not found') ? 404 : 500;
        res.status(code).json({ success: false, error: error.message });
    }
});

// ─── PATCH /api/deals/:id/status — State machine transition ──────────────────
router.patch('/:id/status', checkPermission('act_on_deals'), validate(updateDealStatusSchema), async (req: any, res) => {
    try {
        if (!(await partnerOwnsDealOr403(req, res, req.params.id))) return;
        const { status, reason, final_price } = req.body;
        const updated = await transitionTransaction(
            req.params.id,
            status,
            req.agent.id,
            'admin',
            { reason, changed_by: req.agent.name }
        );
        // (NEG-2, 2026-06-22) Capture the agreed price at close — every revenue report reads
        // Transaction.final_price, and the board close path previously recorded none → won deals
        // reported ₹0. Best-effort; the status transition already committed.
        if (status === 'CLOSED_WON' && final_price != null) {
            await prisma.transaction.update({
                where: { id: req.params.id },
                data: { final_price },
            }).catch(err => logger.warn('[DealAPI] final_price persist failed:', err));
        }
        // (NEG-4, 2026-06-23) Loss capture — persist the structured close reason (the reports + future
        // analytics read Transaction.close_reason) and queue a 1h win-back follow-up to the buyer.
        // (No lead-score penalty: a lost deal often means "bought elsewhere", not an unreliable lead.)
        if (status === 'CLOSED_LOST') {
            if (reason) {
                await prisma.transaction.update({
                    where: { id: req.params.id }, data: { close_reason: reason },
                }).catch(err => logger.warn('[DealAPI] close_reason persist failed:', err));
            }
            const lostPhone = (updated as any).demand_contact_id;
            if (lostPhone) {
                import('../queues/index').then(({ scheduledJobsQueue }) =>
                    scheduledJobsQueue.add('workflow-ai-followup', {
                        contact_phone: lostPhone, deal_id: req.params.id,
                        stage: 'DEAL_LOST', template_name: 'rp_tx_followup_lost_v2',
                    }, { delay: 60 * 60 * 1000, attempts: 2, removeOnComplete: true, removeOnFail: { count: 100 } })
                ).catch(err => logger.warn('[DealAPI] win-back followup queue failed:', err));
            }
        }
        const validNext = getValidNextStatuses(updated.status);

        // Notify all parties about status change
        const event = status === 'CLOSED_WON' ? 'closed_won' as const
            : status === 'CLOSED_LOST' ? 'closed_lost' as const
            : 'status_changed' as const;
        notifyDealEvent({
            dealId: req.params.id, event, newStatus: status, reason,
        }).catch(err => logger.error('[DealAPI] Status notification failed:', err));

        // Stage 2 KRA: on QUALIFIED entry, auto-share the first matching property card.
        if (status === 'QUALIFIED') {
            import('../services/property_sharing').then(({ shareNextProperty }) =>
                shareNextProperty(req.params.id).catch(err =>
                    logger.warn('[DealAPI] Auto property share failed:', err))
            );
        }

        // Stage 4 KRA: on VISIT_SCHEDULED entry, notify the property's key holder.
        if (status === 'VISIT_SCHEDULED') {
            notifyKeyHolder(req.params.id).catch(err =>
                logger.warn('[DealAPI] Key holder notification failed:', err));
        }

        res.json({ success: true, data: { ...updated, valid_next_statuses: validNext } });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'deals#7' });
        logger.error('[DealAPI] Status change error:', error);
        const code = error.message.includes('Invalid transition') ? 400
            : error.message.includes('not found') ? 404 : 500;
        res.status(code).json({ success: false, error: error.message });
    }
});

// ─── POST /api/deals/:id/share-next-property — Manual property card push ────
//
// Stage 2 KRA agent override: triggers the next un-shared property card on
// demand instead of waiting for the cold-lead cron. Returns the inventory_id
// shared, or { sent: false } if nothing left to share.
router.post('/:id/share-next-property', checkPermission('act_on_deals'), async (req: any, res) => {
    try {
        if (!(await partnerOwnsDealOr403(req, res, req.params.id))) return;
        const deal = await prisma.transaction.findUnique({ where: { id: req.params.id }, select: { status: true } });
        if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });
        if (deal.status !== 'QUALIFIED') {
            return res.status(400).json({ success: false, error: `Property sharing only allowed in QUALIFIED stage (current: ${deal.status})` });
        }

        const { shareNextProperty } = await import('../services/property_sharing');
        // Human-initiated manual share — bypass the ai_paused guard (the agent is the one acting). (QUALIFIED-4)
        const inventoryId = await shareNextProperty(req.params.id, { bypassPause: true });
        res.json({ success: true, data: { sent: !!inventoryId, inventory_id: inventoryId } });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'deals#8' });
        logger.error('[DealAPI] Share next property error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── PATCH /api/deals/:id/requirements — Live-edit customer requirements ─────
router.patch('/:id/requirements', checkPermission('act_on_deals'), async (req: any, res) => {
    const { id } = req.params;
    const agent = req.agent;
    if (!(await partnerOwnsDealOr403(req, res, id))) return;
    // Phase 5 (2026-05-29): legacy demand_category / demand_type_slug /
    // demand_property_type / demand_bedrooms / demand_amenities columns
    // dropped from Transaction. Accept them in the body for back-compat but
    // do NOT write them as columns — fold into canonical demand_schema_values.
    const allowedColumns = [
        'demand_intent', 'demand_location', 'demand_budget_min', 'demand_budget_max',
        'demand_area_min', 'demand_area_max', 'demand_notes',
    ] as const;
    const legacyFoldKeys = [
        'demand_category', 'demand_type_slug', 'demand_property_type',
        'demand_bedrooms', 'demand_amenities',
    ] as const;

    try {
        const deal = await prisma.transaction.findFirst({
            where: { id, tenant_id: agent.tenant_id },
            select: { id: true, status: true, demand_contact_id: true, demand_schema_values: true, demand_taxonomy_node_id: true },
        });
        if (!deal) return res.status(404).json({ error: 'Deal not found' });

        const updates: Record<string, any> = {};
        const changes: Record<string, any> = {};
        for (const key of allowedColumns) {
            if (key in req.body) {
                updates[key] = req.body[key];
                changes[key] = req.body[key];
            }
        }
        // Capture legacy keys in change log only (not as column writes).
        for (const key of legacyFoldKeys) {
            if (key in req.body) changes[key] = req.body[key];
        }

        // Phase 5 (2026-05-29): fold any legacy-shape fields the client still
        // sends into canonical demand_schema_values. foldLegacyDemand maps
        // demand_bedrooms → schema_values.bhk, demand_amenities → schema_values.amenities.
        const foldedD = foldLegacyDemand({
            demand_bhk: null,
            demand_bedrooms: req.body.demand_bedrooms ?? null,
            demand_amenities: req.body.demand_amenities,
            demand_taxonomy_node_id: (req.body as any).demand_taxonomy_node_id ?? undefined,
            demand_schema_values: (req.body as any).demand_schema_values ?? undefined,
        });
        const mergedSV_D = mergeDemandSchemaValues(deal.demand_schema_values, foldedD.demand_schema_values);
        if (mergedSV_D) updates.demand_schema_values = mergedSV_D;
        if (foldedD.demand_taxonomy_node_id) updates.demand_taxonomy_node_id = foldedD.demand_taxonomy_node_id;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No valid fields provided' });
        }

        // Bidirectional sync: lead == deal. Mirror canonical demand fields +
        // surviving universal columns onto Contact (SSOT). Legacy column writes
        // (demand_category / demand_type_slug / demand_bhk / demand_amenities)
        // dropped Phase 5 — all that data lives in demand_schema_values now.
        const contactData: Record<string, any> = {};
        if ('demand_intent' in updates) contactData.intent = updates.demand_intent || null;
        if ('demand_property_type' in req.body) contactData.property_type = req.body.demand_property_type || null;
        if ('demand_location' in updates) contactData.preferred_location = updates.demand_location || null;
        if ('demand_budget_min' in updates) contactData.budget_min = updates.demand_budget_min != null ? Number(updates.demand_budget_min) : null;
        if ('demand_budget_max' in updates) contactData.budget_max = updates.demand_budget_max != null ? Number(updates.demand_budget_max) : null;
        if ('demand_area_min' in updates) contactData.area_min = updates.demand_area_min != null ? Number(updates.demand_area_min) : null;
        if ('demand_area_max' in updates) contactData.area_max = updates.demand_area_max != null ? Number(updates.demand_area_max) : null;
        if (mergedSV_D) contactData.demand_schema_values = mergedSV_D;
        if (foldedD.demand_taxonomy_node_id) contactData.demand_taxonomy_node_id = foldedD.demand_taxonomy_node_id;

        // 2026-05-14: was `action: 'REQUIREMENTS_UPDATED' as any` — that value is NOT
        // in the TransactionLogAction Prisma enum (see schema.prisma:enum), and the
        // `as any` cast made TypeScript skip the check. Result: every Log Call /
        // requirements edit returned 500 with "Invalid value for argument `action`".
        // Use the closest existing enum value (NEGOTIATION_UPDATE) and keep the
        // semantic info in details.change_type so reports can still distinguish.
        await prisma.$transaction([
            prisma.transaction.update({ where: { id }, data: { ...updates, updated_at: new Date() } }),
            ...(deal.demand_contact_id && Object.keys(contactData).length ? [
                prisma.contact.update({
                    where: { phone_number: deal.demand_contact_id },
                    data: { ...contactData, updated_at: new Date() },
                }),
            ] : []),
            prisma.transactionLog.create({
                data: {
                    transaction_id: id,
                    action: 'NEGOTIATION_UPDATE',
                    performed_by: agent.id,
                    channel: 'admin',
                    details: { change_type: 'requirements', changes, updated_by_name: agent.name },
                },
            }),
        ]);

        // Re-share with the NEW criteria: a matching-relevant edit (budget/location/type/BHK — not a
        // notes-only edit) should proactively surface a fresh card, not strand a broadened deal on
        // "all shared". QUALIFIED only; shareNextProperty honours ai_paused + dedup + score floor. (QUALIFIED-5a)
        const matchingChanged = [
            'demand_intent', 'demand_location', 'demand_budget_min', 'demand_budget_max',
            'demand_area_min', 'demand_area_max', 'demand_type_slug', 'demand_property_type',
            'demand_bedrooms', 'demand_amenities', 'demand_schema_values', 'demand_taxonomy_node_id',
        ].some(k => k in req.body);
        if (deal.status === 'QUALIFIED' && matchingChanged) {
            (async () => {
                try {
                    const { shareNextProperty } = await import('../services/property_sharing');
                    await shareNextProperty(id);
                } catch (e) { logger.warn('[DealAPI] post-requirements re-share failed:', (e as Error).message); }
            })();
        }

        res.json({ success: true });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'deals#9' });
        logger.error('[DealAPI] Requirements update error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── PATCH /api/deals/:id/reassign — Reassign deal coordinator + lead agent ──
// 2026-05-15: opened to all roles (act_on_deals). Lead managers (employee role)
// can reassign deals they're the current coordinator of. Managers + super_boss
// can reassign any deal. Audit row already written via team_actions.
router.patch('/:id/reassign', checkPermission('act_on_deals'), async (req: any, res) => {
    const { id } = req.params;
    const agent = req.agent;
    const { agent_id, reason } = req.body;

    if (!agent_id) return res.status(400).json({ error: 'agent_id is required' });
    if (agent_id === agent.id) return res.status(400).json({ error: 'Cannot reassign to yourself' });

    try {
        const targetAgent = await prisma.agent.findFirst({
            where: { id: agent_id, tenant_id: agent.tenant_id, status: 'active' },
            select: { id: true, name: true, role: true, phone: true, email: true },
        });
        if (!targetAgent) return res.status(404).json({ error: 'Agent not found or inactive' });

        const deal = await prisma.transaction.findFirst({
            where: { id, tenant_id: agent.tenant_id },
            select: {
                id: true, status: true, tenant_id: true,
                coordinator_agent_id: true,
                demand_contact: { select: { phone_number: true, name: true } },
            },
        });
        if (!deal) return res.status(404).json({ error: 'Deal not found' });

        // Self-reassign check: employees can only reassign deals they currently coordinate.
        // Managers + super_boss bypass this and can reassign any deal in their tenant.
        if (agent.role === 'employee' && deal.coordinator_agent_id !== agent.id) {
            return res.status(403).json({ error: 'You can only reassign deals you are currently the lead manager of' });
        }

        const previousCoordinatorId = deal.coordinator_agent_id;
        const contactPhone = deal.demand_contact?.phone_number;
        const contactName = deal.demand_contact?.name || contactPhone || 'lead';
        const noteText = reason || `Reassigned to ${targetAgent.name}`;

        await prisma.$transaction([
            prisma.transaction.update({
                where: { id },
                // lead owner == deal coordinator == executive (single source
                // of truth, both directions). See
                // docs/plans/2026-05-17-deal-sync-and-welcome-investigation.md
                data: { coordinator_agent_id: agent_id, executive_agent_id: agent_id, updated_at: new Date() },
            }),
            ...(contactPhone ? [
                prisma.contact.update({
                    where: { phone_number: contactPhone },
                    data: { assigned_agent_id: agent_id, assignment_method: 'manual' }, // Phase 5C
                }),
                prisma.interaction.create({
                    data: {
                        tenant_id: deal.tenant_id,
                        phone_number: contactPhone,
                        channel: 'admin',
                        direction: 'outbound',
                        event_type: 'lead_reassigned',
                        content: `Reassigned (via deal) from ${agent.name} to ${targetAgent.name} (${targetAgent.role}). Reason: ${noteText}`,
                        metadata: {
                            from_agent_id: previousCoordinatorId,
                            to_agent_id: agent_id,
                            to_agent_name: targetAgent.name,
                            reason: noteText,
                            actor_id: agent.id,
                            via: 'deal',
                        },
                    },
                }),
            ] : []),
            prisma.teamAction.create({
                data: {
                    tenant_id: deal.tenant_id,
                    transaction_id: id,
                    agent_id: agent.id,
                    stage: deal.status,
                    action_type: 'TRANSFER',
                    outcome: `From ${agent.name} → ${targetAgent.name} (${targetAgent.role})`,
                    notes: noteText,
                },
            }),
            prisma.transaction.update({
                where: { id },
                data: { last_team_action_at: new Date() },
            }),
        ]);

        // Notify the new coordinator (always) + the previous one (if different from actor)
        try {
            const { notify } = await import('../services/notify');
            notify('deal_reassigned_to_me', [{
                id: targetAgent.id, type: 'agent' as const,
                phone: targetAgent.phone ?? undefined, email: targetAgent.email || undefined,
                name: targetAgent.name,
            }], { deal_id: id, contact_name: contactName, from_agent_name: agent.name, reason });

            if (previousCoordinatorId && previousCoordinatorId !== agent.id && previousCoordinatorId !== targetAgent.id) {
                const prev = await prisma.agent.findUnique({
                    where: { id: previousCoordinatorId },
                    select: { id: true, name: true, phone: true, email: true },
                });
                if (prev) {
                    notify('deal_reassigned_away', [{
                        id: prev.id, type: 'agent' as const,
                        phone: prev.phone ?? undefined, email: prev.email || undefined,
                        name: prev.name,
                    }], { deal_id: id, contact_name: contactName, to_agent_name: targetAgent.name, by_agent_name: agent.name, reason });
                }
            }
        } catch (notifyErr) {
            logger.warn(`[DealAPI] notify after reassign failed: ${(notifyErr as Error).message}`);
        }

        logger.info(`[DealAPI] Deal ${id} reassigned from ${agent.name} to ${targetAgent.name}`);
        res.json({ success: true, new_coordinator: targetAgent });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'deals#10' });
        logger.error('[DealAPI] Reassign error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/deals/match-counts — quick "N matching properties" badge for pipeline tiles.
// Lightweight signal (NOT the full engine): counts active inventory matching each deal's intent +
// (resolved) sub_category + HARD budget + BHK (keeping null-BHK listings, like Match & Share).
// Ignores location/geo for speed. One inventory pull (small table) → per-deal count in memory.
router.post('/match-counts', checkPermission('act_on_deals'), async (req: any, res) => {
    const agent = req.agent;
    const { deal_ids } = req.body || {};
    if (!Array.isArray(deal_ids) || deal_ids.length === 0) return res.json({ success: true, data: {} });
    try {
        const deals = await prisma.transaction.findMany({
            where: { id: { in: deal_ids.slice(0, 500) }, tenant_id: agent.tenant_id },
            select: {
                id: true, demand_intent: true, demand_budget_min: true, demand_budget_max: true,
                demand_taxonomy_node_id: true, demand_schema_values: true,
                demand_contact: { select: { sub_category_id: true, demand_taxonomy_node_id: true } },
            },
        });
        const inv = await prisma.inventory.findMany({
            where: { status: 'active' },
            select: { intent: true, sub_category_id: true, taxonomy_node_id: true, price: true, specs: true },
        });
        const { resolveTypeFilter } = await import('../utils/demand_taxonomy');
        const { expandTaxonomyNodeIds } = await import('../utils/taxonomy_filter');
        const { toInventoryIntent } = await import('../services/matching_engine');
        const bhkInt = (specs: any): number | null => {
            const r = specs?.bhk ?? specs?.rooms ?? specs?.bedrooms ?? specs?.bhk_count;
            if (typeof r === 'number') return r;
            if (typeof r === 'string') { const n = parseInt(r.toLowerCase().replace('rk', '').replace('+', '').trim(), 10); return Number.isNaN(n) ? null : n; }
            return null;
        };
        const subCatCache = new Map<string, string | null>();
        const nodeSetCache = new Map<string, Set<string>>();
        const out: Record<string, number> = {};
        for (const d of deals) {
            let subCat: string | null = (d as any).demand_contact?.sub_category_id || null;
            // When no precise sub-category resolves (the demand is only at CATEGORY level), constrain by the
            // demand node expanded to self + descendants → inventory.taxonomy_node_id ∈ set (mirrors the engine
            // so a "Commercial" deal's badge counts commercial inventory only).
            let allowedNodes: Set<string> | null = null;
            const node = (d as any).demand_taxonomy_node_id ?? (d as any).demand_contact?.demand_taxonomy_node_id ?? null;
            if (!subCat && node) {
                if (subCatCache.has(node)) subCat = subCatCache.get(node)!;
                else {
                    try { subCat = (await resolveTypeFilter({ demand_taxonomy_node_id: node })).sub_category_id; }
                    catch { subCat = null; }
                    subCatCache.set(node, subCat);
                }
            }
            if (!subCat && node) {
                if (nodeSetCache.has(node)) allowedNodes = nodeSetCache.get(node)!;
                else {
                    try { allowedNodes = new Set(await expandTaxonomyNodeIds([node])); }
                    catch { allowedNodes = null; }
                    if (allowedNodes) nodeSetCache.set(node, allowedNodes);
                }
            }
            const wantIntent = d.demand_intent ? toInventoryIntent(d.demand_intent) : null;
            const bmin = d.demand_budget_min != null ? Number(d.demand_budget_min) : null;
            const bmax = d.demand_budget_max != null ? Number(d.demand_budget_max) : null;
            const dsv = (d.demand_schema_values ?? {}) as any;
            const wantBhk = (() => {
                const v = dsv.bhk;
                if (typeof v === 'number') return v;
                if (typeof v === 'string') { const n = parseInt(String(v).replace(/\D/g, ''), 10); return Number.isNaN(n) ? null : n; }
                return null;
            })();
            let count = 0;
            for (const p of inv) {
                if (wantIntent && p.intent !== wantIntent) continue;
                if (subCat) { if (p.sub_category_id !== subCat) continue; }
                else if (allowedNodes) { if (!p.taxonomy_node_id || !allowedNodes.has(p.taxonomy_node_id)) continue; }
                const price = p.price != null ? Number(p.price) : null;
                if (price != null && bmin != null && price < bmin) continue;
                if (price != null && bmax != null && price > bmax) continue;
                if (wantBhk != null) { const b = bhkInt(p.specs); if (b != null && b !== wantBhk) continue; }
                count++;
            }
            out[d.id] = count;
        }
        res.json({ success: true, data: out });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'deals#match-counts' });
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/deals/:id/matched-inventory — Property matches for deal workspace
router.get('/:id/matched-inventory', checkPermission('act_on_deals'), async (req: any, res) => {
    const { id } = req.params;
    const agent = req.agent;
    if (!(await partnerOwnsDealOr403(req, res, id))) return;
    const {
        intent, category, type_slug, bedrooms, location,
        budget_min, budget_max, area_min, area_max,
        // Deal Match & Share multi-select + controls (2026-06-01):
        bhk_list,       // comma-separated BHK ints, e.g. "2,3"
        type_node_list, // comma-separated TYPE-level taxonomy node ids (the "Type" chips) →
                        // resolved to legacy sub_category_ids (inventory's 100%-populated tier)
        radius_km,      // pin geo search to one radius
        roof_rights,    // 2026-06-28: only listings that include roof rights
    } = req.query as Record<string, string>;

    try {
        const deal = await prisma.transaction.findFirst({
            where: { id, tenant_id: agent.tenant_id },
            include: {
                // Classification IDs live on the contact, not the deal — needed so
                // matching uses the shared tree (A+B, 2026-05-16). Phase 3 demand-side
                // unification (2026-05-29): also pull canonical demand_taxonomy_node_id +
                // demand_schema_values from both the deal and the contact so the matching
                // engine can compare specs vs demand_schema_values key-by-key.
                demand_contact: { select: {
                    category_id: true, sub_category_id: true, type_id: true,
                    demand_taxonomy_node_id: true, demand_schema_values: true,
                    // #5 (2026-07-01): matching now reads demand CONTACT-first (the SSOT) — need
                    // budget + intent from the contact too, not just the (stale) deal snapshot.
                    budget_min: true, budget_max: true, intent: true,
                    // Geo lives on the Contact (Transaction has no lat/lng) — needed so the
                    // matching engine can do precise radius search for the deal. (2026-06-01)
                    preferred_location: true, preferred_lat: true, preferred_lng: true,
                } },
            },
        });
        if (!deal) return res.status(404).json({ error: 'Deal not found' });

        const sharedInteractions = await prisma.interaction.findMany({
            where: {
                event_type: 'property_shared',
                metadata: { path: ['deal_id'], equals: id },
            },
            select: { metadata: true },
        });
        const alreadySharedIds = new Set<string>(
            sharedInteractions.map((s: any) => s.metadata?.inventory_id).filter(Boolean)
        );

        const { MatchingEngine, buildMatchCriteriaFromLead } = await import('../services/matching_engine');
        const engine = new MatchingEngine();
        // Phase 5 (demand canonical): legacy demand_bedrooms / demand_type_slug /
        // demand_property_type columns dropped from Transaction. Derive bhk from
        // canonical demand_schema_values.bhk on the deal or contact; fall back to
        // the explicit `bedrooms` override from the request.
        // #5 (2026-07-01): the Contact is the demand SSOT (kept current on every edit + qualify);
        // the Transaction snapshot can be stale/incomplete (e.g. bhk missing) and was producing wrong
        // matches. Read demand CONTACT-first, fall back to the deal snapshot. Explicit query params
        // (budget/location/bhk_list/type_node_list below) still override everything.
        const dc = ((deal as any).demand_contact || {}) as Record<string, any>;
        const canonicalDemand = (dc.demand_schema_values
            ?? (deal as any).demand_schema_values
            ?? {}) as Record<string, any>;
        const bhkRaw = bedrooms || canonicalDemand.bhk || canonicalDemand['bhk'] || null;
        const bhkNum = typeof bhkRaw === 'string' ? bhkRaw.match(/\d+/)?.[0] : (bhkRaw != null ? String(bhkRaw) : undefined);
        const criteria = buildMatchCriteriaFromLead({
            intent: (intent || dc.intent || deal.demand_intent || 'buy') as 'buy' | 'rent',
            demand_type_slug: type_slug || null,
            type_id: dc.type_id || null,
            sub_category_id: dc.sub_category_id || null,
            category_id: dc.category_id || null,
            budget_min: budget_min ? parseFloat(budget_min) : (dc.budget_min != null ? Number(dc.budget_min) : (deal.demand_budget_min ?? null)),
            budget_max: budget_max ? parseFloat(budget_max) : (dc.budget_max != null ? Number(dc.budget_max) : (deal.demand_budget_max ?? null)),
            // If `location` is PRESENT in the query (even empty) the caller is explicit — empty means
            // "no location filter" (clears a typo'd text location). Otherwise fall back to the contact's
            // location (SSOT), then the deal snapshot.
            preferred_location: location !== undefined
                ? (location || null)
                : (dc.preferred_location || deal.demand_location || null),
            // Geo from the contact (SSOT) → enables Haversine radius search instead of text-only. (2026-06-01)
            preferred_lat: dc.preferred_lat ?? null,
            preferred_lng: dc.preferred_lng ?? null,
            demand_bhk: bhkNum ? parseInt(bhkNum, 10) : null,
            // Canonical demand — CONTACT-first (SSOT), fall back to the deal snapshot.
            demand_taxonomy_node_id: dc.demand_taxonomy_node_id
                ?? (deal as any).demand_taxonomy_node_id
                ?? null,
            demand_schema_values: dc.demand_schema_values
                ?? (deal as any).demand_schema_values
                ?? null,
        });

        // Override area criteria if provided
        if (area_min) criteria.area_min = parseFloat(area_min);
        if (area_max) criteria.area_max = parseFloat(area_max);
        if (!area_min && (deal as any).demand_area_min) criteria.area_min = (deal as any).demand_area_min;
        if (!area_max && (deal as any).demand_area_max) criteria.area_max = (deal as any).demand_area_max;

        // ── Match & Share controls (2026-06-01) ───────────────────────────────────
        // Budget is a HARD cap from this surface (no ±30% band). BHK + Type are OR
        // multi-selects; the agent can also pin a radius. All additive — absent params
        // leave the deal's stored requirement as the default.
        (criteria as any).budget_hard = true;
        const bhkList = (bhk_list || '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => !Number.isNaN(n));
        if (bhkList.length) criteria.bhk_list = bhkList;
        if (radius_km) criteria.radius_km = parseFloat(radius_km);
        // Resolve the picked TYPE-level node ids → legacy sub_category_ids (inventory's
        // 100%-populated tier; legacy_sub_category_id lives on TYPE nodes and equals
        // inventory.sub_category_id). resolveTypeFilter maps one node → its legacy ids; loop + dedupe.
        const typeNodeIds = (type_node_list || '').split(',').map(s => s.trim()).filter(Boolean);
        if (typeNodeIds.length) {
            const { resolveTypeFilter } = await import('../utils/demand_taxonomy');
            const resolved = await Promise.all(
                typeNodeIds.map(nid => resolveTypeFilter({ demand_taxonomy_node_id: nid }).catch(() => null)),
            );
            const subCatIds = [...new Set(resolved.map(r => r?.sub_category_id).filter((x): x is string => !!x))];
            if (subCatIds.length) criteria.sub_category_id_list = subCatIds;
        }

        const matches = await engine.findMatches(criteria, 50);
        // Roof-rights filter (2026-06-28): narrow the matched set to listings that include
        // roof rights. Post-filter by id so the matching engine stays untouched.
        let matchList = matches;
        if (roof_rights === 'true' && matches.length) {
            const ids = matches.map((m: any) => m.id);
            const rr = await prisma.inventory.findMany({ where: { id: { in: ids }, roof_rights: true }, select: { id: true } });
            const rrSet = new Set(rr.map((r: any) => r.id));
            matchList = matches.filter((m: any) => rrSet.has(m.id));
        }
        const results = matchList.map((m: any) => ({
            ...m,
            already_shared: alreadySharedIds.has(m.id),
        }));
        results.sort((a: any, b: any) => Number(a.already_shared) - Number(b.already_shared));

        res.json({ success: true, data: results });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'deals#11' });
        logger.error('[DealAPI] Matched inventory error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/deals/:id/share-properties — Manual multi-select share from workspace
router.post('/:id/share-properties', checkPermission('act_on_deals'), async (req: any, res) => {
    const { id } = req.params;
    const agent = req.agent;
    if (!(await partnerOwnsDealOr403(req, res, id))) return;
    const { inventory_ids } = req.body || {};
    if (!Array.isArray(inventory_ids) || inventory_ids.length === 0) {
        return res.status(400).json({ error: 'inventory_ids array required' });
    }

    try {
        const deal = await prisma.transaction.findFirst({
            where: { id, tenant_id: agent.tenant_id },
            select: { id: true },
        });
        if (!deal) return res.status(404).json({ error: 'Deal not found' });

        const { shareSpecificProperty } = await import('../services/property_sharing');
        const results: { inventory_id: string; sent: boolean }[] = [];
        for (const invId of inventory_ids) {
            const sent = await shareSpecificProperty(id, invId);
            results.push({ inventory_id: invId, sent });
        }

        res.json({ success: true, data: results });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'deals#12' });
        logger.error('[DealAPI] Share properties error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/deals/:id/book-appointment — Book visit, move to VISIT_SCHEDULED
router.post('/:id/book-appointment', checkPermission('act_on_deals'), async (req: any, res) => {
    const { id } = req.params;
    const agent = req.agent;
    if (!(await partnerOwnsDealOr403(req, res, id))) return;
    const { inventory_id, date, time } = req.body || {};

    if (!inventory_id || !date || !time) {
        return res.status(400).json({ error: 'inventory_id, date, and time are required' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    }
    if (!/^\d{2}:\d{2}$/.test(time)) {
        return res.status(400).json({ error: 'time must be HH:MM' });
    }

    try {
        const deal = await prisma.transaction.findFirst({
            where: { id, tenant_id: agent.tenant_id },
            include: {
                demand_contact: { select: { phone_number: true, name: true } },
                coordinator: { select: { id: true, name: true, phone: true } },
            },
        });
        if (!deal) return res.status(404).json({ error: 'Deal not found' });

        const inv: any = await prisma.inventory.findUnique({
            where: { id: inventory_id },
            include: { flat_property_type: { select: { name: true } }, property_type_link: { select: { name: true } } },
        });
        if (!inv) return res.status(404).json({ error: 'Inventory not found' });

        const scheduledAt = new Date(`${date}T${time}:00+05:30`);

        // Pin inventory on deal + log team action
        await prisma.transaction.update({
            where: { id },
            data: { inventory_id, updated_at: new Date(), last_team_action_at: new Date() },
        });

        // Transition to VISIT_SCHEDULED
        await transitionTransaction(
            id,
            'VISIT_SCHEDULED' as any,
            agent.id,
            'admin',
            { inventory_id, visit_date: date, visit_time: time, booked_by: agent.name }
        );

        // Create OR slot-fill the appointment — if the deal already has an open appointment (the
        // provisional 'requested' one from a card tap, or a prior booking), update THAT row instead
        // of creating a duplicate (which would double the reminder chains). (QUALIFIED-1, 2026-06-22)
        const apptData = {
            title: `Property Visit — ${inv.flat_property_type?.name || inv.property_type_link?.name || inv.type || 'Property'}`,
            type: 'property_visit' as const,
            scheduled_at: scheduledAt,
            property_id: inventory_id,
            assigned_to_agent_id: deal.coordinator?.id || null,
            status: 'scheduled' as const,
            source: 'admin',
            channel: 'whatsapp',
        };
        const openAppt = await prisma.appointment.findFirst({
            where: { transaction_id: id, status: { notIn: ['cancelled', 'completed', 'no_show'] } },
            orderBy: { created_at: 'desc' }, select: { id: true },
        });
        const appointment = openAppt
            ? await prisma.appointment.update({ where: { id: openAppt.id }, data: apptData })
            : await prisma.appointment.create({
                data: { ...apptData, contact_id: deal.demand_contact!.phone_number!, transaction_id: id, tenant_id: deal.tenant_id },
            });

        // Notify customer + coordinator + key holder
        const { notifyAppointmentBooked } = await import('../services/deal_notifications');
        await notifyAppointmentBooked({
            deal: deal as any, inv, appointment, visitDate: date, visitTime: time, bookedByName: agent.name,
        });

        // Push to the assigned agent's Google Calendar immediately instead of waiting up to ~5 min for
        // the reconcile sweep. Opt-in (only if the agent connected Google) + best-effort. (VS-8, 2026-06-22)
        import('../services/google_sync').then(({ pushAppointmentToGoogle }) =>
            pushAppointmentToGoogle(appointment.id).catch(() => {})
        ).catch(() => {});

        res.json({ success: true, appointment_id: appointment.id });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'deals#13' });
        logger.error('[DealAPI] book-appointment error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/deals/:id/visit-outcome — Lead manager submits visit outcome ─
//
// Per Stage 5 KRA. Body: { outcome, interest_level?, feedback?, updated_requirements?, notes? }
// outcome ∈ { 'Property Liked', 'Want More Properties', 'Re-match Required', 'No Show' }
// Drives state transition + side-effects (auto-share for Re-match, reschedule WhatsApp on No Show).
router.post('/:id/visit-outcome', checkPermission('act_on_deals'), async (req: any, res) => {
    try {
        if (!(await partnerOwnsDealOr403(req, res, req.params.id))) return;
        const { outcome, interest_level, feedback, updated_requirements, notes } = req.body || {};
        if (!outcome) return res.status(400).json({ success: false, error: 'outcome is required' });

        const deal = await prisma.transaction.findUnique({
            where: { id: req.params.id },
            include: { demand_contact: true },
        });
        if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });

        // Persist outcome fields + updated requirements on the deal (for all outcomes,
        // so shareNextProperty always uses the latest criteria the team member entered).
        const reqUpdates: any = {};
        if (updated_requirements) {
            if (updated_requirements.budget_min != null) reqUpdates.demand_budget_min = updated_requirements.budget_min;
            if (updated_requirements.budget_max != null) reqUpdates.demand_budget_max = updated_requirements.budget_max;
            if (updated_requirements.location) reqUpdates.demand_location = updated_requirements.location;
            if (updated_requirements.bedrooms) reqUpdates.demand_bedrooms = updated_requirements.bedrooms;
        }
        await prisma.transaction.update({
            where: { id: req.params.id },
            data: {
                visit_outcome: outcome,
                client_interest_level: interest_level || null,
                visit_feedback: feedback || null,
                last_team_action_at: new Date(),
                ...reqUpdates,
                updated_at: new Date(),
            },
        });

        // Map outcome → next status per KRA
        let nextStatus: string | null = null;
        switch (outcome) {
            case 'Property Liked':
                nextStatus = 'NEGOTIATION'; break;
            case 'Want More Properties':
                nextStatus = 'VISIT_SCHEDULED'; break;
            case 'Re-match Required':
                nextStatus = 'QUALIFIED';
                // Stage 5 KRA: auto-update Contact requirements if customer's needs changed
                if (updated_requirements && deal.demand_contact?.phone_number) {
                    try {
                        const updates: any = {};
                        if (updated_requirements.budget_min) updates.budget_min = updated_requirements.budget_min;
                        if (updated_requirements.budget_max) updates.budget_max = updated_requirements.budget_max;
                        if (updated_requirements.location) updates.preferred_location = updated_requirements.location;
                        // Phase 5: legacy demand_bhk column dropped; bedrooms are now
                        // merged into demand_schema_values.bhk (canonical).
                        if (updated_requirements.bedrooms) {
                            const existing = ((deal.demand_contact as any)?.demand_schema_values
                                ?? {}) as Record<string, any>;
                            updates.demand_schema_values = {
                                ...existing,
                                bhk: String(updated_requirements.bedrooms),
                            };
                        }
                        if (Object.keys(updates).length > 0) {
                            await prisma.contact.update({
                                where: { phone_number: deal.demand_contact.phone_number },
                                data: updates,
                            });
                        }
                        // Mirror the new requirements onto the deal too. Legacy
                        // demand_bedrooms column dropped — merge into canonical
                        // demand_schema_values on the transaction instead.
                        const dealSchema = ((deal as any).demand_schema_values
                            ?? {}) as Record<string, any>;
                        const nextDealSchema = updated_requirements.bedrooms
                            ? { ...dealSchema, bhk: String(updated_requirements.bedrooms) }
                            : dealSchema;
                        await prisma.transaction.update({
                            where: { id: req.params.id },
                            data: {
                                demand_budget_min: updated_requirements.budget_min ?? deal.demand_budget_min,
                                demand_budget_max: updated_requirements.budget_max ?? deal.demand_budget_max,
                                demand_location: updated_requirements.location ?? deal.demand_location,
                                demand_schema_values: nextDealSchema,
                                workflow_round: { increment: 1 },
                            },
                        });
                    } catch (err) {
                        logger.warn('[DealAPI] Re-match contact update failed:', err);
                    }
                }
                break;
            case 'No Show':
                nextStatus = 'VISIT_SCHEDULED'; // stays here so a re-book can happen
                if (deal.demand_contact?.phone_number) {
                    // (VS-4, 2026-06-22) Mark the appointment no_show (was left 'scheduled' with a past
                    // time → it would otherwise still look like a live visit + dodge the audit clock).
                    try {
                        const noShowAppt = await prisma.appointment.findFirst({
                            where: { transaction_id: req.params.id, status: { notIn: ['cancelled', 'completed', 'no_show'] } },
                            orderBy: { scheduled_at: 'desc' }, select: { id: true },
                        });
                        if (noShowAppt) await prisma.appointment.update({ where: { id: noShowAppt.id }, data: { status: 'no_show' } });
                    } catch (err) { logger.warn('[DealAPI] No-show appointment update failed:', err); }
                    // Proper no-show handling: reliability penalty + the dedicated rp_noshow_recovery
                    // reschedule template (and cold-downgrade on a repeat) — replaces the generic
                    // rp_call_attempted that didn't record the no-show. (VS-4)
                    try {
                        const { LeadScoreService } = await import('../services/lead_score');
                        await new LeadScoreService().handleNoShow(deal.demand_contact.phone_number);
                    } catch (err) { logger.warn('[DealAPI] handleNoShow failed:', err); }
                }
                break;
            default:
                return res.status(400).json({ success: false, error: `Unknown outcome: ${outcome}` });
        }

        // (VS4-1/VS4-3, 2026-06-22) Advance through VISITED for the "visit happened" outcomes — the
        // ONLY valid gateway to NEGOTIATION (canTransition VISIT_SCHEDULED→NEGOTIATION is false) and a
        // measurable funnel fact. advanceVisitedDeal records VISITED first when leaving VISIT_SCHEDULED,
        // then transitions onward; No-Show/Want-More resolve to a same-status no-op (no false "visited").
        // We notify once, for the final status.
        if (nextStatus) {
            try {
                const finalStatus = await advanceVisitedDeal(req.params.id, nextStatus as any, req.agent.id, 'admin',
                    { reason: `Visit outcome: ${outcome}`, notes });
                if (finalStatus !== deal.status) {
                    const event = 'status_changed' as const;
                    notifyDealEvent({ dealId: req.params.id, event, newStatus: nextStatus, reason: `Visit outcome: ${outcome}` })
                        .catch(err => logger.warn('[DealAPI] visit-outcome notification failed:', err));
                    // Re-match auto-shares first new property
                    if (nextStatus === 'QUALIFIED') {
                        import('../services/property_sharing').then(({ shareNextProperty }) =>
                            shareNextProperty(req.params.id).catch(err =>
                                logger.warn('[DealAPI] Re-match property share failed:', err))
                        );
                    }
                }
            } catch (err: any) {
        captureRouteError(err, req, { route: 'deals#14' });
                logger.error('[DealAPI] Visit outcome transition failed:', err);
                return res.status(400).json({ success: false, error: err.message });
            }
        }

        res.json({ success: true, data: { outcome, next_status: nextStatus } });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'deals#15' });
        logger.error('[DealAPI] Visit outcome error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── POST /api/deals/:id/query — Raise a query ──────────────────────────────
router.post('/:id/query', validate(createDealQuerySchema), async (req: any, res) => {
    try {
        if (!(await partnerOwnsDealOr403(req, res, req.params.id))) return;
        const deal = await prisma.transaction.findUnique({ where: { id: req.params.id } });
        if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });

        const query = await prisma.dealQuery.create({
            data: {
                transaction_id: req.params.id,
                raised_by_type: 'coordinator',
                raised_by_id: req.agent.id,
                subject: req.body.subject,
                message: req.body.message,
                status: 'OPEN',
            },
        });

        // Notify about new query
        notifyDealEvent({
            dealId: req.params.id, event: 'query_raised', querySubject: req.body.subject,
        }).catch(err => logger.error('[DealAPI] Query notification failed:', err));

        res.status(201).json({ success: true, data: query });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'deals#16' });
        logger.error('[DealAPI] Create query error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── PATCH /api/deals/:id/query/:qid — Answer a query ───────────────────────
router.patch('/:id/query/:qid', checkPermission('act_on_deals'), validate(answerDealQuerySchema), async (req: any, res) => {
    try {
        const query = await prisma.dealQuery.findFirst({
            where: { id: req.params.qid, transaction_id: req.params.id },
        });
        if (!query) return res.status(404).json({ success: false, error: 'Query not found' });

        const updated = await prisma.dealQuery.update({
            where: { id: req.params.qid },
            data: {
                answer: req.body.answer,
                answered_by_id: req.agent.id,
                answered_at: new Date(),
                status: 'ANSWERED',
            },
        });

        // Notify query raiser that their question was answered
        notifyDealEvent({
            dealId: req.params.id, event: 'query_answered',
            querySubject: query.subject, queryAnswer: req.body.answer,
            queryRaisedById: query.raised_by_id,
        }).catch(err => logger.error('[DealAPI] Answer notification failed:', err));

        res.json({ success: true, data: updated });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'deals#17' });
        logger.error('[DealAPI] Answer query error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── GET /api/deals/:id/queries — List queries for a deal ───────────────────
router.get('/:id/queries', async (req: any, res) => {
    try {
        if (!(await partnerOwnsDealOr403(req, res, req.params.id))) return;
        const queries = await prisma.dealQuery.findMany({
            where: { transaction_id: req.params.id },
            orderBy: { created_at: 'desc' },
        });
        res.json({ success: true, data: queries });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'deals#18' });
        logger.error('[DealAPI] List queries error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Commission entries (2026-04-17 middleman model) ───────────────────────
//
// Manual post-deal capture. No rigid split enforced — each party records what
// they earned; we sum the pool. See services/commission_service.ts.

// POST /api/deals/:id/commission-entries — record one party's earned commission
// Body: { partyType: 'INTERNAL_AGENT'|'PARTNER_AGENT'|'PLATFORM',
//         agentId?, partnerAgentId?, amount, currency?, notes? }
router.post('/:id/commission-entries', checkPermission('manage_deals'), async (req: any, res) => {
    try {
        const user = req.agent!;
        const entry = await commissionService.recordEntry(req.params.id, {
            partyType: req.body.partyType,
            agentId: req.body.agentId,
            partnerAgentId: req.body.partnerAgentId,
            amount: req.body.amount,
            currency: req.body.currency,
            notes: req.body.notes,
            enteredBy: user.id,
        });
        res.json({ success: true, data: entry });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'deals#19' });
        const status = /not found/i.test(err.message) ? 404 : 400;
        res.status(status).json({ success: false, error: err.message });
    }
});

// GET /api/deals/:id/commission-entries — summary: total + per-party + entries list
router.get('/:id/commission-entries', checkPermission('manage_deals'), async (req: any, res) => {
    try {
        const summary = await commissionService.summarize(req.params.id);
        // Prisma.Decimal serializes to string by default; cast to string for clarity.
        res.json({
            success: true,
            data: {
                total: summary.total.toFixed(2),
                by_party: {
                    INTERNAL_AGENT: summary.byParty.INTERNAL_AGENT.toFixed(2),
                    PARTNER_AGENT: summary.byParty.PARTNER_AGENT.toFixed(2),
                    PLATFORM: summary.byParty.PLATFORM.toFixed(2),
                },
                entries: summary.entries,
            },
        });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'deals#20' });
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── POST /api/deals/:id/log-action — Team member logs a manual action ───────
// Creates a TeamAction record, sets last_team_action_at, optionally transitions stage.
// Body: { action_type, outcome?, notes?, new_status? }
router.post('/:id/log-action', checkPermission('act_on_deals'), async (req: any, res) => {
    try {
        if (!(await partnerOwnsDealOr403(req, res, req.params.id))) return;
        const agent = req.agent!;
        const { action_type, outcome, notes, new_status } = req.body;

        if (!action_type) return res.status(400).json({ success: false, error: 'action_type is required' });

        const deal = await prisma.transaction.findUnique({ where: { id: req.params.id } });
        if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });

        // Create TeamAction record
        await prisma.teamAction.create({
            data: {
                tenant_id: deal.tenant_id,
                transaction_id: req.params.id,
                agent_id: agent.id,
                stage: deal.status,
                action_type,
                outcome: outcome ?? null,
                notes: notes ?? null,
            },
        });

        // Update last_team_action_at and handle ai_paused toggle
        const updateData: any = { last_team_action_at: new Date() };
        if (action_type === 'PAUSED_AI') updateData.ai_paused = true;
        if (action_type === 'RESUMED_AI') updateData.ai_paused = false;

        // 2026-07-24: a human "not interested" outcome must CLOSE the deal at ANY stage + pause AI.
        // Previously this only happened via /log-call for NEW deals; a "Not interested" logged from
        // DealWorkspace (log-action, free-text outcome) on a QUALIFIED+ deal did nothing, so the deal
        // stayed on the board AI-active. Audit found 29 such stuck deals (28 still AI-active).
        const TERMINAL = ['CLOSED_LOST', 'CLOSED_WON'];
        const isNotInterestedOutcome = typeof outcome === 'string' && /\bnot\s*interested\b/i.test(outcome);
        const willCloseNotInterested = isNotInterestedOutcome && !new_status && !TERMINAL.includes(deal.status);
        if (willCloseNotInterested) updateData.ai_paused = true;

        await prisma.transaction.update({ where: { id: req.params.id }, data: updateData });

        // Optionally transition stage
        if (new_status) {
            const { transitionTransaction } = await import('../services/transaction_state_machine');
            await transitionTransaction(req.params.id, new_status, agent.id, 'web', { notes, action_type });
        } else if (willCloseNotInterested) {
            const { transitionTransaction } = await import('../services/transaction_state_machine');
            await transitionTransaction(req.params.id, 'CLOSED_LOST' as any, agent.id, 'web', {
                notes: (notes && String(notes).trim()) || `Marked not interested by ${agent.name}`,
                action_type,
            });
            // Mirror onto the contact so Lost-Reasons analytics + opt-out semantics stay consistent.
            if (deal.demand_contact_id) {
                await prisma.contact.update({
                    where: { phone_number: deal.demand_contact_id },
                    data: { lost_reason: 'NOT_INTERESTED', lost_at: new Date() },
                }).catch(() => {});
            }
        }

        const updated = await getDealById(req.params.id);
        logger.info(`[DealAPI] Team action logged: ${action_type} on deal ${req.params.id} by ${agent.name}`);
        res.json({ success: true, data: updated });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'deals#21' });
        logger.error('[DealAPI] Log action error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── POST /api/deals/:id/reminder — team member sets a self follow-up reminder ─
// Body: { remind_at (ISO), note, advance_minutes? }. Creates a REMINDER Task
// assigned to the caller, notified once before + once at the time (T8), and
// records the reminder in BOTH the deal timeline and the lead timeline.
router.post('/:id/reminder', checkPermission('act_on_deals'), async (req: any, res) => {
    try {
        if (!(await partnerOwnsDealOr403(req, res, req.params.id))) return;
        const agent = req.agent!;
        const id = req.params.id;
        const { remind_at, note, advance_minutes, reason } = req.body || {};

        if (!remind_at) return res.status(400).json({ success: false, error: 'remind_at is required' });
        const due = new Date(remind_at);
        if (isNaN(due.getTime())) return res.status(400).json({ success: false, error: 'remind_at is not a valid date' });
        if (due.getTime() < Date.now() - 60 * 1000) {
            return res.status(400).json({ success: false, error: 'remind_at must be in the future' });
        }
        const advanceMin = Number(advance_minutes) > 0 ? Math.min(Number(advance_minutes), 24 * 60) : 30;

        const deal = await prisma.transaction.findFirst({
            where: { id, tenant_id: agent.tenant_id },
            select: {
                id: true, status: true, tenant_id: true,
                demand_contact: { select: { phone_number: true, name: true } },
            },
        });
        if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });

        const contactPhone = deal.demand_contact?.phone_number || null;
        const contactName = deal.demand_contact?.name || contactPhone || 'the client';
        const whenStr = due.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
        const title = `Follow-up: ${contactName}`;
        const reminderNote = (note && String(note).trim()) || `Reminder to follow up with ${contactName}`;

        // #3 (2026-07-01): supersede any prior OPEN reminder on this deal so the tile's "Next follow-up"
        // shows only the newly-set one and old/overdue reminders stop firing. (This route creates the
        // task inline rather than via createDealReminder, so the supersede must live here too.)
        const priorOpenReminders = await prisma.task.findMany({
            where: { deal_id: id, task_type: 'REMINDER', status: 'TODO' },
            select: { id: true },
        });
        if (priorOpenReminders.length) {
            const gsync = await import('../services/google_sync');
            for (const t of priorOpenReminders) { await gsync.cancelReminderGoogle(t.id).catch(() => {}); }
            await prisma.task.updateMany({
                where: { id: { in: priorOpenReminders.map(t => t.id) } },
                data: { status: 'DONE', completed_at: new Date() },
            });
        }

        const task = await prisma.task.create({
            data: {
                title,
                description: reminderNote,
                assigned_to: agent.id,
                due_date: due,
                priority: 'HIGH',
                status: 'TODO',
                task_type: 'REMINDER',
                deal_id: id,
                ...(contactPhone ? { contact_phone: contactPhone } : {}),
                tags: ['reminder', 'follow-up'],
                stage_metadata: {
                    advance_minutes: advanceMin,
                    advance_fired: false,
                    due_fired: false,
                    set_by: agent.id,
                },
            } as any,
        });

        const timelineText = `⏰ Reminder set by ${agent.name || 'team member'} for ${whenStr} (alert ${advanceMin} min before). Note: ${reminderNote}`;

        await prisma.$transaction([
            // Deal timeline
            prisma.teamAction.create({
                data: {
                    tenant_id: deal.tenant_id,
                    transaction_id: id,
                    agent_id: agent.id,
                    stage: deal.status,
                    action_type: 'REMINDER_SET',
                    outcome: `Reminder for ${whenStr}`,
                    notes: reminderNote,
                },
            }),
            prisma.transaction.update({ where: { id }, data: { last_team_action_at: new Date() } }),
            // Lead timeline
            ...(contactPhone ? [
                prisma.interaction.create({
                    data: {
                        tenant_id: deal.tenant_id,
                        phone_number: contactPhone,
                        channel: 'admin',
                        direction: 'outbound',
                        event_type: 'reminder_set',
                        content: timelineText,
                        metadata: {
                            task_id: task.id, deal_id: id, remind_at: due.toISOString(),
                            advance_minutes: advanceMin, set_by: agent.id, set_by_name: agent.name,
                        },
                    },
                }),
            ] : []),
        ]);

        // Deal-workflow QUALIFIED (2026-06-29): if this reminder is being set because the customer
        // did not answer, also log a NO_ANSWER call-outcome interaction — same shape the NEW-stage
        // log-call writes — so the derived no_answer_count + the N=4 escalation gate work in any
        // stage (the Reminder button is the only no-answer entry point in QUALIFIED).
        if (reason === 'NO_ANSWER' && contactPhone) {
            await prisma.interaction.create({
                data: {
                    tenant_id: deal.tenant_id,
                    phone_number: contactPhone,
                    channel: 'voice',
                    direction: 'outbound',
                    event_type: 'human_call_outcome',
                    content: `Human call by ${agent.name || 'team'}: NO_ANSWER${note ? ' — ' + String(note).trim() : ''}`,
                    metadata: { deal_id: id, outcome: 'NO_ANSWER', performed_by: agent.id, reason: 'NO_ANSWER', via: 'reminder' },
                },
            }).catch((e: any) => logger.warn(`[DealAPI] reminder no-answer log failed: ${e?.message}`));
        }

        logger.info(`[DealAPI] Reminder task ${task.id} set on deal ${id} by ${agent.id} for ${due.toISOString()}`);

        // P2: also push to the member's own Google Calendar + Tasks if they
        // connected Google (opt-in, idempotent). Fire-and-forget — never
        // blocks or fails the reminder response.
        import('../services/google_sync')
            .then(m => m.pushReminderToGoogle(task.id))
            .catch(err => logger.error('[DealAPI] google_sync hook error:', err));

        res.json({ success: true, data: { task_id: task.id, remind_at: due.toISOString(), advance_minutes: advanceMin } });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'deals#reminder' });
        logger.error('[DealAPI] Set reminder error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── GET /api/deals/:id/property-shares — All properties shared for this deal ─
router.get('/:id/property-shares', async (req: any, res) => {
    try {
        if (!(await partnerOwnsDealOr403(req, res, req.params.id))) return;
        const deal = await prisma.transaction.findUnique({
            where: { id: req.params.id },
            select: { demand_contact_id: true },
        });
        if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });

        // 2026-07-22: shares are recorded in TWO ledgers and this endpoint only ever read one.
        // Every deal-workspace / AI share writes an Interaction(property_shared) — 2,102 rows —
        // while property_shares holds just 421, so 1,076 of the 1,123 deals that HAVE shares
        // rendered an empty tab. Read both, union them, de-duplicated.
        const INV_SELECT = {
            id: true, type: true, category: true, location: true,
            price: true, display_price: true, display_id: true,
            apartment_name: true, locality: true, city: true,
            media_urls: true, specs: true,
            owner_phone: true,
            contact: { select: { name: true } },
            key_holder_name: true, key_holder_phone: true,
            taxonomy_node: { select: { name: true } },
            flat_property_type: { select: { name: true } },
        };

        const [legacyShares, shareInteractions] = await Promise.all([
            prisma.propertyShare.findMany({
                where: { client_phone: deal.demand_contact_id },
                include: { inventory: { select: INV_SELECT } },
                orderBy: { created_at: 'desc' },
            }),
            prisma.interaction.findMany({
                where: {
                    event_type: 'property_shared',
                    OR: [
                        { metadata: { path: ['deal_id'], equals: req.params.id } },
                        ...(deal.demand_contact_id ? [{ phone_number: deal.demand_contact_id }] : []),
                    ],
                },
                select: { id: true, created_at: true, channel: true, metadata: true },
                orderBy: { created_at: 'desc' },
            }),
        ]);

        // Hydrate the inventory the interaction ledger points at (metadata.inventory_id).
        const invIds = Array.from(new Set(
            shareInteractions.map(i => (i.metadata as any)?.inventory_id).filter(Boolean)
        )) as string[];
        const invRows = invIds.length
            ? await prisma.inventory.findMany({ where: { id: { in: invIds } }, select: INV_SELECT })
            : [];
        const invById: Record<string, any> = {};
        for (const iv of invRows) invById[iv.id] = iv;

        // De-dup: the two inventory.ts share routes write BOTH ledgers, so the same send would
        // otherwise appear twice. Same inventory inside a 2-minute window = one event.
        // property_shares wins when both exist — it carries property_link / whatsapp_sent / clicked.
        const shareKey = (invId: string, ts: any) => `${invId}|${Math.floor(new Date(ts).getTime() / 120000)}`;
        const merged = new Map<string, any>();
        for (const s of legacyShares) {
            merged.set(shareKey(s.inventory_id, s.created_at), { ...s, source: 'property_share' });
        }
        for (const it of shareInteractions) {
            const invId = (it.metadata as any)?.inventory_id;
            if (!invId) continue;
            const k = shareKey(invId, it.created_at);
            if (merged.has(k)) continue;
            merged.set(k, {
                id: it.id,
                inventory_id: invId,
                client_phone: deal.demand_contact_id,
                channel: it.channel || 'whatsapp',
                created_at: it.created_at,
                property_link: (it.metadata as any)?.property_link ?? null,
                whatsapp_sent: true,
                link_clicked: false,
                inventory: invById[invId] || null,
                source: 'interaction',
            });
        }

        const shares = Array.from(merged.values())
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        res.json({ success: true, data: shares });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'deals#22' });
        logger.error('[DealAPI] Property shares error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Stage 4 helper: notify key holder when visit gets scheduled ────────────
async function notifyKeyHolder(dealId: string): Promise<void> {
    const deal = await prisma.transaction.findUnique({
        where: { id: dealId },
        include: {
            demand_contact: { select: { name: true } },
            inventory: { select: { type: true, location: true, owner_phone: true, key_holder_phone: true, full_address: true } },
            appointments: { orderBy: { scheduled_at: 'desc' }, take: 1 },
        },
    });
    // VS-7: prefer the dedicated key-holder phone, fall back to the owner's. (was owner-only)
    if (!deal?.inventory) {
        logger.info(`[DealAPI] Key holder notification skipped — no inventory for deal ${dealId}`);
        return;
    }
    const keyPhone = deal.inventory.key_holder_phone || deal.inventory.owner_phone;
    if (!keyPhone) {
        logger.warn(`[DealAPI] Key holder notification skipped — no key_holder_phone OR owner_phone for deal ${dealId} (access must be arranged)`);
        return;
    }

    const appt = deal.appointments[0];
    if (!appt) {
        logger.info(`[DealAPI] Key holder notification skipped — no appointment for deal ${dealId}`);
        return;
    }

    const date = appt.scheduled_at.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
    const time = appt.scheduled_at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

    const { WhatsAppService } = await import('../services/whatsapp');
    const whatsapp = new WhatsAppService();
    await whatsapp.sendTemplate(keyPhone, 'rp_visit_keyholder_v2', {
        property: deal.inventory.type || 'Property',
        address: deal.inventory.full_address || deal.inventory.location || 'Location TBD',
        visitor_name: deal.demand_contact?.name || 'Customer',
        date,
        time,
    });
    await prisma.interaction.create({
        data: {
            tenant_id: deal.tenant_id,
            phone_number: deal.inventory.owner_phone,
            channel: 'whatsapp',
            direction: 'outbound',
            event_type: 'pipeline_keyholder_notification',
            content: `Key holder notified for visit on ${date} ${time}`,
            metadata: { deal_id: dealId, appointment_id: appt.id, property_id: (deal.inventory as any).id },
        },
    });
    logger.info(`[DealAPI] Key holder ${deal.inventory.owner_phone} notified for deal ${dealId}`);
}

// ─── POST /api/deals/:id/log-call — Stage 1 NEW: human-logged call outcome ─
// All 6 outcomes route through this single endpoint. Required input: { outcome, payload }.
// ANSWERED_INTERESTED requires payload.requirements with all 8 mandatory fields →
// Contact updated + deal moves NEW→QUALIFIED. Other outcomes per Stage 1 KRA.
const VALID_LOG_CALL_OUTCOMES = [
    'ANSWERED_INTERESTED',
    'NOT_INTERESTED',
    'NO_ANSWER',
    'CALLBACK_REQUESTED',
    'WRONG_OR_SPAM',
    'LANGUAGE_BARRIER',
    'CLOSED_UNREACHABLE', // deal-workflow (2026-06-29): close after repeated no-answers, stamping the count
] as const;

router.post('/:id/log-call', checkPermission('act_on_deals'), async (req: any, res) => {
    try {
        if (!(await partnerOwnsDealOr403(req, res, req.params.id))) return;
        const dealId = req.params.id;
        const { outcome, payload = {} } = req.body || {};

        if (!VALID_LOG_CALL_OUTCOMES.includes(outcome)) {
            return res.status(400).json({ success: false, error: `Unknown outcome: ${outcome}` });
        }

        const deal = await prisma.transaction.findUnique({
            where: { id: dealId },
            include: { demand_contact: { select: { phone_number: true, name: true, tenant_id: true } } },
        });
        if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });
        if (!deal.demand_contact?.phone_number) {
            return res.status(400).json({ success: false, error: 'Deal has no demand contact' });
        }
        if (deal.status !== 'NEW') {
            return res.status(409).json({ success: false, error: `Deal is in ${deal.status}, log-call only valid in NEW` });
        }

        const phone = deal.demand_contact.phone_number;
        const performedBy = req.agent?.id || 'system:human';
        const performerName = req.agent?.name || 'team';

        switch (outcome) {
            case 'ANSWERED_INTERESTED': {
                const r = payload.requirements || {};
                // Phase 5: legacy demand_main_category / demand_type_slug / demand_bhk
                // / demand_amenities columns dropped. Required fields are now the
                // universal ones — taxonomy + per-type fields are validated by the
                // frontend taxonomy picker and carried in demand_schema_values.
                const requiredFields = ['intent', 'budget_min', 'budget_max',
                                         'preferred_location', 'timeline'];
                for (const f of requiredFields) {
                    if (r[f] === undefined || r[f] === null || r[f] === '') {
                        return res.status(400).json({ success: false, error: `Missing required field: ${f}` });
                    }
                }
                // Canonical demand block from the Log-Call form (sent alongside
                // legacy `requirements` by LogCallOverlay during Phase 4 cutover).
                const demandNodeId: string | null = (payload as any).demand_taxonomy_node_id ?? null;
                const demandSchema: Record<string, any> | null =
                    (payload as any).demand_schema_values ?? null;

                await prisma.contact.update({
                    where: { phone_number: phone },
                    data: {
                        intent: r.intent,
                        property_type: r.demand_type_slug || null,
                        budget_min: r.budget_min,
                        budget_max: r.budget_max,
                        preferred_location: r.preferred_location,
                        timeline: r.timeline,
                        area_min: r.area_min ?? null,
                        area_max: r.area_max ?? null,
                        area_unit: r.area_unit ?? null,
                        ...(demandNodeId !== null ? { demand_taxonomy_node_id: demandNodeId } : {}),
                        ...(demandSchema !== null ? { demand_schema_values: demandSchema } : {}),
                        lead_status: 'warm',
                    },
                });
                // #4 (2026-07-01): keep the DEAL's own demand snapshot in sync with the edited
                // requirements. matched-inventory reads deal-snapshot-first (deals.ts ~689-694), so
                // without this the Match & Share matched the pre-qualify (stale) demand. Mirror the
                // contact write above onto the transaction's demand_* columns.
                const dealDemand: Record<string, any> = {
                    demand_intent: r.intent ?? undefined,
                    demand_budget_min: (r.budget_min != null && r.budget_min !== '') ? Number(r.budget_min) : undefined,
                    demand_budget_max: (r.budget_max != null && r.budget_max !== '') ? Number(r.budget_max) : undefined,
                    demand_location: r.preferred_location ?? undefined,
                };
                if (demandNodeId !== null) dealDemand.demand_taxonomy_node_id = demandNodeId;
                const mergedDealSV = mergeDemandSchemaValues((deal as any).demand_schema_values, demandSchema);
                if (mergedDealSV) dealDemand.demand_schema_values = mergedDealSV;
                await prisma.transaction.update({ where: { id: dealId }, data: dealDemand });
                await transitionTransaction(dealId, 'QUALIFIED' as any, performedBy, 'admin', {
                    notes: `Lead qualified by ${performerName} after call`,
                });
                break;
            }

            case 'NOT_INTERESTED': {
                // Phase 4 (2026-06-27): "Not interested" now ALWAYS closes the deal (CLOSED_LOST) and
                // drops it off the board — and a note is MANDATORY so the reason is captured. (The
                // "not now, maybe later" case is handled by the Callback/Remind action instead.)
                const notes = String(payload.notes || '').trim();
                if (!notes) {
                    return res.status(400).json({ success: false, error: 'Please add a note explaining why before closing this deal as not interested.' });
                }
                await transitionTransaction(dealId, 'CLOSED_LOST' as any, performedBy, 'admin', {
                    notes: `Customer not interested: ${notes}`,
                });
                break;
            }

            case 'NO_ANSWER': {
                // Stays NEW; AI cadence continues from existing schedulers (runs alongside, per the
                // workflow design). Deal-workflow (2026-06-29): if the member set a "call again" time,
                // book a Google-synced reminder so the deal resurfaces for them at that time.
                if (payload.remind_at) {
                    const remindAt = new Date(payload.remind_at);
                    if (!isNaN(remindAt.getTime())) {
                        await createDealReminder({
                            dealId, tenantId: deal.tenant_id, dealStatus: deal.status,
                            agentId: performedBy, agentName: performerName,
                            contactPhone: phone, contactName: deal.demand_contact.name,
                            remindAt, note: String(payload.notes || '').trim() || `Call ${deal.demand_contact.name || phone} again`,
                            actionType: 'CALLBACK_SCHEDULED',
                        }).catch(err => logger.error('[log-call] no-answer reminder failed:', err));
                    }
                }
                break;
            }

            case 'CALLBACK_REQUESTED': {
                if (!payload.callback_at) {
                    return res.status(400).json({ success: false, error: 'callback_at required' });
                }
                const callbackAt = new Date(payload.callback_at);
                if (isNaN(callbackAt.getTime())) {
                    return res.status(400).json({ success: false, error: 'callback_at is not a valid date' });
                }
                // Phase 4 (2026-06-27): book a Google-synced follow-up reminder so the callback actually
                // resurfaces the deal — agent's Google Calendar + Tasks + in-app notify (before + at).
                await createDealReminder({
                    dealId,
                    tenantId: deal.tenant_id,
                    dealStatus: deal.status,
                    agentId: performedBy,
                    agentName: performerName,
                    contactPhone: phone,
                    contactName: deal.demand_contact.name,
                    remindAt: callbackAt,
                    note: String(payload.notes || '').trim() || `Callback requested by ${deal.demand_contact.name || phone}`,
                    actionType: 'CALLBACK_SCHEDULED',
                }).catch(err => logger.error('[log-call] callback reminder failed:', err));

                const { WhatsAppService } = await import('../services/whatsapp');
                const wa = new WhatsAppService();
                const mgr = await prisma.agent.findFirst({
                    where: { role: 'super_boss', status: 'active' },
                    select: { phone: true },
                });
                if (mgr?.phone) {
                    wa.sendText(
                        mgr.phone,
                        `📅 Callback scheduled for ${deal.demand_contact.name || phone} at ${new Date(payload.callback_at).toLocaleString('en-IN')}`
                    ).catch(() => {});
                }
                break;
            }

            case 'WRONG_OR_SPAM': {
                const reason = payload.reason || 'WRONG_NUMBER';
                // Phase 4 (2026-06-27): a closing outcome — note is MANDATORY.
                const wsNotes = String(payload.notes || '').trim();
                if (!wsNotes) {
                    return res.status(400).json({ success: false, error: 'Please add a note before closing this deal.' });
                }
                const closedReasons = ['WRONG_NUMBER', 'SPAM', 'BANKER_VALUER', 'DUPLICATE'];
                const nextStatus = closedReasons.includes(reason) ? 'CLOSED_LOST' : 'ON_HOLD';
                await transitionTransaction(dealId, nextStatus as any, performedBy, 'admin', {
                    notes: `Marked as ${reason} by ${performerName}. ${wsNotes}`,
                });
                if (reason === 'WRONG_NUMBER' || reason === 'SPAM') {
                    await prisma.contact.update({ where: { phone_number: phone }, data: { lead_status: 'lost' } }).catch(() => {});
                }
                break;
            }

            case 'LANGUAGE_BARRIER': {
                const { WhatsAppService } = await import('../services/whatsapp');
                const wa = new WhatsAppService();
                const mgr = await prisma.agent.findFirst({
                    where: { role: 'super_boss', status: 'active' },
                    select: { phone: true },
                });
                if (mgr?.phone) {
                    wa.sendText(
                        mgr.phone,
                        `🌐 Language barrier: ${deal.demand_contact.name || phone} speaks ${payload.language || 'unknown'}. Please assign a multilingual agent.`
                    ).catch(() => {});
                }
                break;
            }

            case 'CLOSED_UNREACHABLE': {
                // Deal-workflow (2026-06-29): closing after repeated no-answers. Stamp how many
                // no-answer calls were logged on THIS deal into the close note (count is derived).
                const naCount = await prisma.interaction.count({
                    where: {
                        phone_number: phone,
                        event_type: 'human_call_outcome',
                        AND: [
                            { metadata: { path: ['outcome'], equals: 'NO_ANSWER' } },
                            { metadata: { path: ['deal_id'], equals: dealId } },
                        ],
                    },
                });
                await transitionTransaction(dealId, 'CLOSED_LOST' as any, performedBy, 'admin', {
                    notes: `Closed — unreachable after ${naCount} no-answer call${naCount === 1 ? '' : 's'} by ${performerName}.${payload.notes ? ' ' + String(payload.notes).trim() : ''}`,
                });
                break;
            }
        }

        // Always log the human call outcome as an interaction
        await prisma.interaction.create({
            data: {
                tenant_id: deal.demand_contact.tenant_id || deal.tenant_id,
                phone_number: phone,
                channel: 'voice',
                direction: 'outbound',
                event_type: 'human_call_outcome',
                content: `Human call by ${performerName}: ${outcome}${payload.notes ? ' — ' + payload.notes : ''}`,
                metadata: { deal_id: dealId, outcome, performed_by: performedBy, ...payload },
            },
        });

        // Log the call as a TeamAction too, so the pipeline tile's "last action" line shows it
        // (CALL_LOGGED → "📞 Called (<outcome>)"). Only when a real agent performed it — the
        // agent_id is an FK and drives the tile's "who" + timestamp. (2026-07-09)
        if (req.agent?.id) {
            await prisma.teamAction.create({
                data: {
                    tenant_id: deal.demand_contact.tenant_id || deal.tenant_id,
                    transaction_id: dealId,
                    agent_id: req.agent.id,
                    stage: deal.status,            // the stage the call was logged in (NEW)
                    action_type: 'CALL_LOGGED',
                    outcome,
                    notes: payload.notes ?? null,
                },
            }).catch((e: any) => logger.warn('[log-call] teamAction write failed:', e?.message));
        }

        // Mark team action timestamp so AI back-off rule fires
        await prisma.transaction.update({
            where: { id: dealId },
            data: { last_team_action_at: new Date() },
        }).catch(() => {});

        logger.info(`[DealAPI] log-call: ${outcome} on deal ${dealId} by ${performerName}`);
        return res.json({ success: true, outcome });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'deals#23' });
        logger.error('[DealAPI] log-call error:', error);
        return res.status(500).json({ success: false, error: error.message || 'log-call failed' });
    }
});

export default router;
