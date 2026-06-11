/**
 * Transaction Dashboard API Routes
 *
 * REST endpoints for managing property deal transactions:
 * - List with filters (status, executive, date, type)
 * - Full detail with logs + appointments
 * - Manual status change (state machine validated)
 * - Reassign executive
 * - Add notes
 * - Pipeline funnel view
 * - Agent's active deals
 *
 * Permissions: manage_transactions (super_boss, manager), view_transactions (employee — own only)
 */

import { Router, Request, Response } from 'express';
import { authMiddleware, checkPermission } from '../middleware/auth';
import { getTransactionById, getPipelineStats, addTransactionNote } from '../services/transaction_service';
import { transitionTransaction, canTransition, getValidNextStatuses } from '../services/transaction_state_machine';
import { reassignExecutive } from '../services/executive_assigner';
import { TransactionStatus } from '@prisma/client';
import prisma from '../db';
import logger from '../utils/logger';
import { captureRouteError } from '../utils/capture';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// ─── List Transactions ─────────────────────────────────────

/**
 * GET /api/transactions
 * List transactions with optional filters.
 * Employees see only their own deals (as executive).
 */
router.get('/', checkPermission('view_transactions'), async (req: Request, res: Response) => {
    try {
        const { status, type, executive_id, page = '1', limit = '20' } = req.query;
        const agent = (req as any).agent;
        const pageNum = parseInt(page as string) || 1;
        const limitNum = Math.min(parseInt(limit as string) || 20, 100);

        const where: any = { tenant_id: agent.tenant_id };

        // Employees can only see their own transactions
        if (agent.role === 'employee') {
            where.executive_agent_id = agent.id;
        } else if (executive_id) {
            where.executive_agent_id = executive_id as string;
        }

        if (status) where.status = status as string;
        if (type) where.type = type as string;

        const [transactions, total] = await Promise.all([
            prisma.transaction.findMany({
                where,
                include: {
                    demand_contact: { select: { phone_number: true, name: true, contact_type: true } },
                    supply_contact: { select: { phone_number: true, name: true, contact_type: true } },
                    executive_agent: { select: { id: true, name: true, department: true } },
                    inventory: { select: { id: true, type: true, location: true, price: true } },
                },
                orderBy: { updated_at: 'desc' },
                skip: (pageNum - 1) * limitNum,
                take: limitNum,
            }),
            prisma.transaction.count({ where }),
        ]);

        res.json({
            success: true,
            data: transactions,
            pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
        });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'transactions#1' });
        logger.error('[TransactionsAPI] List error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Pipeline View ─────────────────────────────────────────

/**
 * GET /api/transactions/pipeline
 * Transaction counts grouped by status (funnel view).
 */
router.get('/pipeline', checkPermission('view_transactions'), async (req: Request, res: Response) => {
    try {
        const agent = (req as any).agent;
        const pipeline = await getPipelineStats(agent.tenant_id);
        res.json({ success: true, data: pipeline });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'transactions#2' });
        logger.error('[TransactionsAPI] Pipeline error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Agent's Active Deals ──────────────────────────────────

/**
 * GET /api/transactions/executive/:agentId
 * Get active transactions for a specific executive.
 */
router.get('/executive/:agentId', checkPermission('view_transactions'), async (req: Request, res: Response) => {
    try {
        const { agentId } = req.params;
        const agent = (req as any).agent;

        // Employees can only see their own
        if (agent.role === 'employee' && agent.id !== agentId) {
            return res.status(403).json({ success: false, error: 'Can only view your own deals' });
        }

        const transactions = await prisma.transaction.findMany({
            where: {
                executive_agent_id: String(agentId),
                status: { notIn: [TransactionStatus.CLOSED_WON, TransactionStatus.CLOSED_LOST] },
            },
            include: {
                demand_contact: { select: { phone_number: true, name: true } },
                inventory: { select: { type: true, location: true, price: true } },
            },
            orderBy: { updated_at: 'desc' },
        });

        res.json({ success: true, data: transactions });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'transactions#3' });
        logger.error('[TransactionsAPI] Executive deals error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Transaction Detail ────────────────────────────────────

/**
 * GET /api/transactions/:id
 * Full transaction detail with logs and appointments.
 */
router.get('/:id', checkPermission('view_transactions'), async (req: Request, res: Response) => {
    try {
        const transaction = await getTransactionById(String(req.params.id));
        if (!transaction) {
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        // Employees can only see their own
        const agent = (req as any).agent;
        if (agent.role === 'employee' && transaction.executive_agent_id !== agent.id) {
            return res.status(403).json({ success: false, error: 'Not your transaction' });
        }

        // Include valid next statuses for UI
        const validNext = getValidNextStatuses(transaction.status);

        res.json({ success: true, data: { ...transaction, valid_next_statuses: validNext } });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'transactions#4' });
        logger.error('[TransactionsAPI] Detail error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Change Status ─────────────────────────────────────────

/**
 * PATCH /api/transactions/:id/status
 * Manual status change (state machine validated).
 */
router.patch('/:id/status', checkPermission('manage_transactions'), async (req: Request, res: Response) => {
    try {
        const { status, reason } = req.body;
        const agent = (req as any).agent;

        if (!status) {
            return res.status(400).json({ success: false, error: 'status is required' });
        }

        // Validate status is a valid TransactionStatus enum value
        if (!Object.values(TransactionStatus).includes(status)) {
            return res.status(400).json({ success: false, error: `Invalid status: ${status}` });
        }

        const updated = await transitionTransaction(
            String(req.params.id),
            status as TransactionStatus,
            agent.id,
            'admin',
            { reason, changed_by_name: agent.name },
        );

        res.json({ success: true, data: updated });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'transactions#5' });
        logger.error('[TransactionsAPI] Status change error:', error);
        const statusCode = error.message.includes('Invalid transition') ? 400 : 500;
        res.status(statusCode).json({ success: false, error: error.message });
    }
});

// ─── Reassign Executive ────────────────────────────────────

/**
 * PATCH /api/transactions/:id/reassign
 * Reassign the internal executive for a transaction.
 */
router.patch('/:id/reassign', checkPermission('manage_transactions'), async (req: Request, res: Response) => {
    try {
        const { agent_id } = req.body;
        const performer = (req as any).agent;

        if (!agent_id) {
            return res.status(400).json({ success: false, error: 'agent_id is required' });
        }

        await reassignExecutive(String(req.params.id), agent_id, performer.id);
        res.json({ success: true, message: 'Executive reassigned successfully' });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'transactions#6' });
        logger.error('[TransactionsAPI] Reassign error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Add Note ──────────────────────────────────────────────

/**
 * POST /api/transactions/:id/note
 * Add a note to a transaction (creates TransactionLog entry).
 */
router.post('/:id/note', checkPermission('view_transactions'), async (req: Request, res: Response) => {
    try {
        const { note } = req.body;
        const agent = (req as any).agent;

        if (!note || !note.trim()) {
            return res.status(400).json({ success: false, error: 'note is required' });
        }

        const log = await addTransactionNote(String(req.params.id), note.trim(), agent.id, 'admin');
        res.json({ success: true, data: log });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'transactions#7' });
        logger.error('[TransactionsAPI] Add note error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
