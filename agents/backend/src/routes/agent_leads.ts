/**
 * Agent Leads Routes
 *
 * API routes for agents/dealers to view and manage buyer leads.
 * These routes are mounted under /api/agent-leads and require JWT auth.
 *
 * Endpoints:
 *   GET  /api/agent-leads/buyer-leads    — List buyer leads with filters
 *   GET  /api/agent-leads/buyer-leads/:id — Get single buyer lead details
 *   GET  /api/agent-leads/appointments    — List appointments for current agent
 *   POST /api/agent-leads/appointments/:id/status — Update appointment status
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { buildContactVisibilityFilter } from '../middleware/contact_visibility';
import prisma from '../db';
import logger from '../utils/logger';
import { captureRouteError } from '../utils/capture';

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/agent-leads/buyer-leads
 * List buyer/tenant leads visible to the current agent.
 * Query: ?page=1&limit=20&status=warm&intent=buy
 */
router.get('/buyer-leads', async (req: Request, res: Response) => {
    try {
        const agentId = (req as any).agent?.id;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const status = req.query.status as string | undefined;
        const intent = req.query.intent as string | undefined;

        const visibilityFilter = buildContactVisibilityFilter(agentId, (req as any).agent?.role || 'employee');

        const where: any = {
            contact_type: { in: ['BUYER', 'TENANT'] },
            ...visibilityFilter,
        };

        if (status) where.lead_status = status;
        if (intent) where.intent = intent;

        const [leads, total] = await Promise.all([
            prisma.contact.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    phone_number: true,
                    name: true,
                    email: true,
                    contact_type: true,
                    lead_status: true,
                    lead_score: true,
                    intent: true,
                    preferred_location: true,
                    demand_taxonomy_node_id: true,
                    demand_schema_values: true,
                    budget_min: true,
                    budget_max: true,
                    source: true,
                    last_channel: true,
                    last_interaction: true,
                    created_at: true,
                },
            }),
            prisma.contact.count({ where }),
        ]);

        res.json({
            leads,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (err) {
        captureRouteError(err, req, { route: 'agent_leads#1' });
        logger.error('[AgentLeads] buyer-leads error:', err);
        res.status(500).json({ error: 'Failed to fetch buyer leads' });
    }
});

/**
 * GET /api/agent-leads/buyer-leads/:phone
 * Get single buyer lead details with their transactions.
 */
router.get('/buyer-leads/:phone', async (req: Request, res: Response) => {
    try {
        const phone = req.params.phone as string;
        const contact = await prisma.contact.findUnique({
            where: { phone_number: phone },
            include: {
                demand_transactions: {
                    orderBy: { created_at: 'desc' },
                    take: 5,
                },
            },
        });

        if (!contact) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        res.json(contact);
    } catch (err) {
        captureRouteError(err, req, { route: 'agent_leads#2' });
        logger.error('[AgentLeads] buyer-lead detail error:', err);
        res.status(500).json({ error: 'Failed to fetch lead details' });
    }
});

/**
 * GET /api/agent-leads/appointments
 * List appointments for the current agent.
 * Query: ?page=1&limit=20&status=scheduled
 */
router.get('/appointments', async (req: Request, res: Response) => {
    try {
        const agentId = (req as any).agent?.id;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const status = req.query.status as string | undefined;

        const where: any = {};
        const agentRole = (req as any).agent?.role;

        if (agentRole !== 'super_boss' && agentRole !== 'manager') {
            where.assigned_to_agent_id = agentId;
        }

        if (status) where.status = status;

        const [appointments, total] = await Promise.all([
            prisma.appointment.findMany({
                where,
                orderBy: { scheduled_at: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    contact: {
                        select: { name: true, phone_number: true, email: true },
                    },
                    property: {
                        select: { id: true, type: true, locality: true, price: true },
                    },
                },
            }),
            prisma.appointment.count({ where }),
        ]);

        res.json({
            appointments,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (err) {
        captureRouteError(err, req, { route: 'agent_leads#3' });
        logger.error('[AgentLeads] appointments error:', err);
        res.status(500).json({ error: 'Failed to fetch appointments' });
    }
});

/**
 * POST /api/agent-leads/appointments/:id/status
 * Update appointment status.
 * Body: { status: 'confirmed' | 'completed' | 'cancelled' | 'no_show', notes?: string }
 */
router.post('/appointments/:id/status', async (req: Request, res: Response) => {
    try {
        const { status, notes } = req.body;
        if (!status) {
            return res.status(400).json({ error: 'status is required' });
        }

        const appointment = await prisma.appointment.update({
            where: { id: req.params.id as string },
            data: {
                status,
                notes: notes || undefined,
            },
        });

        res.json({ success: true, appointment });
    } catch (err) {
        captureRouteError(err, req, { route: 'agent_leads#4' });
        logger.error('[AgentLeads] appointment status update error:', err);
        res.status(500).json({ error: 'Failed to update appointment status' });
    }
});

export default router;
