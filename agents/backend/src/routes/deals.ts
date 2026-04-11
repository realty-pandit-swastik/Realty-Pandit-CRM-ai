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
import { transitionTransaction, getValidNextStatuses } from '../services/transaction_state_machine';
import { notifyDealEvent } from '../services/deal_notifications';
import { notify } from '../services/notify';
import prisma from '../db';
import logger from '../utils/logger';

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
                notify('deal_created', [{ id: handler.id, type: 'agent', phone: handler.phone, email: handler.email || undefined, name: handler.name }], {
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
        logger.error('[DealAPI] Create deal error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── GET /api/deals — List deals with filters ────────────────────────────────
router.get('/', async (req: any, res) => {
    try {
        const agent = req.agent;
        const { status, deal_scenario, coordinator_agent_id, demand_handler_id, supply_handler_id, page, limit } = req.query;

        const filters: any = { tenant_id: agent.tenant_id };
        if (status) filters.status = status;
        if (deal_scenario) filters.deal_scenario = deal_scenario;
        if (coordinator_agent_id) filters.coordinator_agent_id = coordinator_agent_id;
        if (demand_handler_id) filters.demand_handler_id = demand_handler_id;
        if (supply_handler_id) filters.supply_handler_id = supply_handler_id;
        if (page) filters.page = parseInt(page);
        if (limit) filters.limit = parseInt(limit);

        // Employees only see their own deals
        if (agent.role === 'employee') {
            filters.coordinator_agent_id = agent.id;
        }

        const result = await listDeals(filters);
        res.json({ success: true, ...result });
    } catch (error: any) {
        logger.error('[DealAPI] List deals error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── GET /api/deals/pipeline — Pipeline stats ────────────────────────────────
router.get('/pipeline', async (req: any, res) => {
    try {
        const stats = await getDealPipelineStats(req.agent.tenant_id);
        res.json({ success: true, data: stats });
    } catch (error: any) {
        logger.error('[DealAPI] Pipeline stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── GET /api/deals/:id — Full deal detail ───────────────────────────────────
router.get('/:id', async (req: any, res) => {
    try {
        const deal = await getDealById(req.params.id);
        if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });

        // Employees only see own deals
        if (req.agent.role === 'employee' && deal.coordinator_agent_id !== req.agent.id && deal.executive_agent_id !== req.agent.id) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        const validNext = getValidNextStatuses(deal.status);
        res.json({ success: true, data: { ...deal, valid_next_statuses: validNext } });
    } catch (error: any) {
        logger.error('[DealAPI] Get deal error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── GET /api/deals/:id/timeline — Unified timeline ──────────────────────────
router.get('/:id/timeline', async (req: any, res) => {
    try {
        const timeline = await getDealTimeline(req.params.id);
        res.json({ success: true, data: timeline });
    } catch (error: any) {
        logger.error('[DealAPI] Timeline error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── PATCH /api/deals/:id/match — Link property + supply handler ─────────────
router.patch('/:id/match', checkPermission('manage_deals'), validate(matchPropertySchema), async (req: any, res) => {
    try {
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
        logger.error('[DealAPI] Match property error:', error);
        const code = error.message.includes('not found') ? 404 : 500;
        res.status(code).json({ success: false, error: error.message });
    }
});

// ─── PATCH /api/deals/:id/status — State machine transition ──────────────────
router.patch('/:id/status', checkPermission('manage_deals'), validate(updateDealStatusSchema), async (req: any, res) => {
    try {
        const { status, reason } = req.body;
        const updated = await transitionTransaction(
            req.params.id,
            status,
            req.agent.id,
            'admin',
            { reason, changed_by: req.agent.name }
        );
        const validNext = getValidNextStatuses(updated.status);

        // Notify all parties about status change
        const event = status === 'CLOSED_WON' ? 'closed_won' as const
            : status === 'CLOSED_LOST' ? 'closed_lost' as const
            : 'status_changed' as const;
        notifyDealEvent({
            dealId: req.params.id, event, newStatus: status, reason,
        }).catch(err => logger.error('[DealAPI] Status notification failed:', err));

        res.json({ success: true, data: { ...updated, valid_next_statuses: validNext } });
    } catch (error: any) {
        logger.error('[DealAPI] Status change error:', error);
        const code = error.message.includes('Invalid transition') ? 400
            : error.message.includes('not found') ? 404 : 500;
        res.status(code).json({ success: false, error: error.message });
    }
});

// ─── POST /api/deals/:id/query — Raise a query ──────────────────────────────
router.post('/:id/query', validate(createDealQuerySchema), async (req: any, res) => {
    try {
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
        logger.error('[DealAPI] Create query error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── PATCH /api/deals/:id/query/:qid — Answer a query ───────────────────────
router.patch('/:id/query/:qid', checkPermission('manage_deals'), validate(answerDealQuerySchema), async (req: any, res) => {
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
        logger.error('[DealAPI] Answer query error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── GET /api/deals/:id/queries — List queries for a deal ───────────────────
router.get('/:id/queries', async (req: any, res) => {
    try {
        const queries = await prisma.dealQuery.findMany({
            where: { transaction_id: req.params.id },
            orderBy: { created_at: 'desc' },
        });
        res.json({ success: true, data: queries });
    } catch (error: any) {
        logger.error('[DealAPI] List queries error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
