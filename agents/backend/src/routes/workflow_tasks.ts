/**
 * Workflow Task Routes
 *
 * Guided lead-to-deal workflow engine.
 * 5-stage task chain: Qualify → Share → Schedule Visit → Visit Feedback → Negotiate
 * All routes require JWT auth via authMiddleware.
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
    createQualifyTask,
    completeQualifyTask,
    completeShareTask,
    completeScheduleTask,
    completeVisitFeedbackTask,
    completeNegotiateTask,
    snoozeTask,
    getWorkflowQueue,
    getWorkflowChain,
    getWorkflowStats,
    getTeamWorkflowPipeline,
    getLeadShortlist,
} from '../services/workflow_task_service';
import prisma from '../db';
import logger from '../utils/logger';
import { captureRouteError } from '../utils/capture';

const router = Router();

// All routes require auth
router.use(authMiddleware);

// ── GET /my-queue — Agent's sorted task queue ───────��────────────

router.get('/my-queue', async (req: Request, res: Response) => {
    try {
        const agent = (req as any).agent;
        const tasks = await getWorkflowQueue(agent.id, agent.role);
        res.json({ tasks, total: tasks.length });
    } catch (err) {
        captureRouteError(err, req, { route: 'workflow_tasks#1' });
        logger.error('[WorkflowTasks] GET /my-queue error:', err);
        res.status(500).json({ error: 'Failed to fetch workflow queue' });
    }
});

// ── GET /stats/summary — Workflow stats by stage ─────────────────

router.get('/stats/summary', async (req: Request, res: Response) => {
    try {
        const agent = (req as any).agent;
        const agentId = (agent.role === 'super_boss' || agent.role === 'manager')
            ? (req.query.agent_id as string) || undefined
            : agent.id;
        const stats = await getWorkflowStats(agentId, agent.tenant_id);
        res.json(stats);
    } catch (err) {
        captureRouteError(err, req, { route: 'workflow_tasks#2' });
        logger.error('[WorkflowTasks] GET /stats/summary error:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ── GET /stats/team — Team pipeline (super_boss only) ────────────

router.get('/stats/team', async (req: Request, res: Response) => {
    try {
        const agent = (req as any).agent;
        if (agent.role !== 'super_boss' && agent.role !== 'manager') {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        const pipeline = await getTeamWorkflowPipeline(agent.tenant_id);
        res.json({ pipeline });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'workflow_tasks#3' });
        logger.error('[WorkflowTasks] GET /stats/team error:', err?.message || err);
        res.status(500).json({ error: 'Failed to fetch team pipeline', detail: err?.message });
    }
});

// ── GET /shortlist/:phone — Property shortlist for a lead ────────

router.get('/shortlist/:phone', async (req: Request, res: Response) => {
    try {
        const phone = decodeURIComponent(req.params.phone);
        const dealId = req.query.deal_id as string | undefined;
        const shortlist = await getLeadShortlist(phone, dealId);
        res.json({ shortlist });
    } catch (err) {
        captureRouteError(err, req, { route: 'workflow_tasks#4' });
        logger.error('[WorkflowTasks] GET /shortlist error:', err);
        res.status(500).json({ error: 'Failed to fetch shortlist' });
    }
});

// ── GET /:id — Single task with context ──────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
    try {
        const task = await prisma.task.findUnique({
            where: { id: req.params.id },
            include: {
                contact: {
                    select: {
                        phone_number: true, name: true, email: true, source: true,
                        intent: true, preferred_location: true, budget_min: true, budget_max: true,
                        lead_status: true, lifecycle_stage: true, verification_status: true,
                        demand_schema_values: true, demand_taxonomy_node_id: true,
                        preferred_lat: true, preferred_lng: true,
                        contact_type: true,
                    },
                },
            },
        });
        if (!task) return res.status(404).json({ error: 'Task not found' });

        // Fetch shortlist if deal exists
        let shortlist: any[] = [];
        if (task.deal_id && task.contact_phone) {
            shortlist = await getLeadShortlist(task.contact_phone, task.deal_id);
        }

        // Fetch deal info
        let deal = null;
        if (task.deal_id) {
            deal = await prisma.transaction.findUnique({
                where: { id: task.deal_id },
                select: { id: true, status: true, type: true, demand_location: true, demand_budget_min: true, demand_budget_max: true, inventory_id: true, final_price: true },
            });
        }

        res.json({ task, shortlist, deal });
    } catch (err) {
        captureRouteError(err, req, { route: 'workflow_tasks#5' });
        logger.error('[WorkflowTasks] GET /:id error:', err);
        res.status(500).json({ error: 'Failed to fetch task' });
    }
});

// ── GET /:id/chain — Full workflow chain ─────────────────────────

router.get('/:id/chain', async (req: Request, res: Response) => {
    try {
        const task = await prisma.task.findUnique({ where: { id: req.params.id }, select: { contact_phone: true, deal_id: true } });
        if (!task || !task.contact_phone) return res.status(404).json({ error: 'Task not found' });

        const chain = await getWorkflowChain(task.contact_phone, task.deal_id || undefined);
        res.json({ chain });
    } catch (err) {
        captureRouteError(err, req, { route: 'workflow_tasks#6' });
        logger.error('[WorkflowTasks] GET /:id/chain error:', err);
        res.status(500).json({ error: 'Failed to fetch chain' });
    }
});

// ── POST /:id/complete — Stage-specific completion ───────────────

router.post('/:id/complete', async (req: Request, res: Response) => {
    try {
        const agent = (req as any).agent;
        const taskId = req.params.id;
        const task = await prisma.task.findUnique({ where: { id: taskId } });
        if (!task) return res.status(404).json({ error: 'Task not found' });

        let result: any;

        switch (task.task_type) {
            case 'QUALIFY_LEAD':
                result = await completeQualifyTask(taskId, { agentId: agent.id, ...req.body });
                break;
            case 'SHARE_PROPERTIES':
                result = await completeShareTask(taskId, { agentId: agent.id, ...req.body });
                break;
            case 'SCHEDULE_VISIT':
                result = await completeScheduleTask(taskId, { agentId: agent.id, ...req.body });
                break;
            case 'VISIT_FEEDBACK':
                result = await completeVisitFeedbackTask(taskId, { agentId: agent.id, ...req.body });
                break;
            case 'NEGOTIATE_DEAL':
                result = await completeNegotiateTask(taskId, { agentId: agent.id, ...req.body });
                break;
            default:
                return res.status(400).json({ error: `Unknown task type: ${task.task_type}` });
        }

        res.json(result);
    } catch (err) {
        captureRouteError(err, req, { route: 'workflow_tasks#7' });
        const msg = (err as Error).message;
        logger.error(`[WorkflowTasks] POST /:id/complete error: ${msg}`);
        res.status(400).json({ error: msg });
    }
});

// ── POST /:id/snooze — Snooze a task ────────────────────────────

router.post('/:id/snooze', async (req: Request, res: Response) => {
    try {
        const agent = (req as any).agent;
        const task = await snoozeTask(req.params.id, {
            agentId: agent.id,
            reason: req.body.reason || 'No answer',
            snoozeMinutes: req.body.snooze_minutes || 60,
        });
        res.json({ task });
    } catch (err) {
        captureRouteError(err, req, { route: 'workflow_tasks#8' });
        const msg = (err as Error).message;
        logger.error(`[WorkflowTasks] POST /:id/snooze error: ${msg}`);
        res.status(400).json({ error: msg });
    }
});

// ── POST /:id/share — Share properties during Stage 2 ────────────

router.post('/:id/share', async (req: Request, res: Response) => {
    try {
        const agent = (req as any).agent;
        const { property_ids, client_phone, client_name } = req.body;
        if (!property_ids?.length) return res.status(400).json({ error: 'property_ids required' });

        const task = await prisma.task.findUnique({ where: { id: req.params.id } });
        if (!task || task.task_type !== 'SHARE_PROPERTIES') {
            return res.status(400).json({ error: 'Invalid task for sharing' });
        }

        const shareResults = [];
        for (const invId of property_ids) {
            try {
                // Call existing share-to-client endpoint logic
                const inv = await prisma.inventory.findUnique({
                    where: { id: invId },
                    select: { id: true, display_id: true, type: true, location: true, price: true },
                });
                if (!inv) continue;

                // Create PropertyShare record
                const share = await prisma.propertyShare.create({
                    data: {
                        tenant_id: agent.tenant_id,
                        inventory_id: invId,
                        agent_id: agent.id,
                        client_phone: client_phone || task.contact_phone!,
                        channel: 'whatsapp_api',
                        property_link: `https://www.realtypandit.in/properties/${inv.display_id}`,
                        whatsapp_sent: false,
                    },
                });

                // Create shortlist entry
                await prisma.leadPropertyShortlist.upsert({
                    where: {
                        contact_phone_inventory_id_deal_id: {
                            contact_phone: task.contact_phone!,
                            inventory_id: invId,
                            deal_id: task.deal_id || '',
                        },
                    },
                    update: {},
                    create: {
                        tenant_id: agent.tenant_id,
                        contact_phone: task.contact_phone!,
                        inventory_id: invId,
                        deal_id: task.deal_id,
                        status: 'SHARED',
                        property_share_id: share.id,
                        workflow_round: task.workflow_round,
                    },
                });

                shareResults.push({ inventory_id: invId, status: 'shared', share_id: share.id });
            } catch (err) {
                shareResults.push({ inventory_id: invId, status: 'failed', error: (err as Error).message });
            }
        }

        res.json({ results: shareResults });
    } catch (err) {
        captureRouteError(err, req, { route: 'workflow_tasks#9' });
        logger.error(`[WorkflowTasks] POST /:id/share error:`, err);
        res.status(500).json({ error: 'Failed to share properties' });
    }
});

// ── POST /:id/schedule-visit — Create appointment during Stage 3 ─

router.post('/:id/schedule-visit', async (req: Request, res: Response) => {
    try {
        const agent = (req as any).agent;
        const task = await prisma.task.findUnique({ where: { id: req.params.id } });
        if (!task || task.task_type !== 'SCHEDULE_VISIT') {
            return res.status(400).json({ error: 'Invalid task for scheduling' });
        }

        const { scheduled_at, duration, property_ids, title, description } = req.body;
        if (!scheduled_at || !property_ids?.length) {
            return res.status(400).json({ error: 'scheduled_at and property_ids required' });
        }

        const appointments = [];
        for (const propId of property_ids) {
            const apt = await prisma.appointment.create({
                data: {
                    tenant_id: agent.tenant_id,
                    contact_id: task.contact_phone!,
                    title: title || `Property Visit: ${task.contact_phone}`,
                    description: description || '',
                    type: 'property_visit',
                    scheduled_at: new Date(scheduled_at),
                    duration: duration || 60,
                    assigned_to_agent_id: task.assigned_to,
                    property_id: propId,
                    transaction_id: task.deal_id,
                },
            });
            appointments.push(apt);
        }

        res.json({ appointments, appointment_ids: appointments.map(a => a.id) });
    } catch (err) {
        captureRouteError(err, req, { route: 'workflow_tasks#10' });
        logger.error(`[WorkflowTasks] POST /:id/schedule-visit error:`, err);
        res.status(500).json({ error: 'Failed to schedule visit' });
    }
});

// ── POST /:id/feedback — Submit visit feedback during Stage 4 ────

router.post('/:id/feedback', async (req: Request, res: Response) => {
    try {
        const agent = (req as any).agent;
        const result = await completeVisitFeedbackTask(req.params.id, {
            agentId: agent.id,
            ...req.body,
        });
        res.json(result);
    } catch (err) {
        captureRouteError(err, req, { route: 'workflow_tasks#11' });
        const msg = (err as Error).message;
        logger.error(`[WorkflowTasks] POST /:id/feedback error: ${msg}`);
        res.status(400).json({ error: msg });
    }
});

// ── PATCH /:id/reassign — Reassign task to different agent ───────

router.patch('/:id/reassign', async (req: Request, res: Response) => {
    try {
        const agent = (req as any).agent;
        if (agent.role !== 'super_boss' && agent.role !== 'manager') {
            return res.status(403).json({ error: 'Only managers can reassign tasks' });
        }

        const { assigned_to } = req.body;
        if (!assigned_to) return res.status(400).json({ error: 'assigned_to required' });

        const task = await prisma.task.update({
            where: { id: req.params.id },
            data: { assigned_to },
        });

        // Notify new assignee
        const newAgent = await prisma.agent.findUnique({
            where: { id: assigned_to },
            select: { id: true, name: true, phone: true, email: true },
        });
        if (newAgent) {
            const { notify } = await import('../services/notify');
            notify('workflow_task_created', [
                { id: newAgent.id, type: 'agent', phone: newAgent.phone ?? undefined, email: newAgent.email, name: newAgent.name },
            ], { task_id: task.id, stage_label: task.task_type, contact_phone: task.contact_phone });
        }

        res.json({ task });
    } catch (err) {
        captureRouteError(err, req, { route: 'workflow_tasks#12' });
        logger.error(`[WorkflowTasks] PATCH /:id/reassign error:`, err);
        res.status(500).json({ error: 'Failed to reassign' });
    }
});

export default router;
