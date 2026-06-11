/**
 * Agent Dashboard API Routes
 *
 * Backend endpoints for the admin panel's agent monitoring views:
 * - System health overview
 * - Per-agent metrics
 * - Conversion funnel
 * - Agent action logs
 * - QA logs (flagged conversations)
 * - Campaign management
 *
 * All routes require JWT auth (admin/manager role).
 */

import { Router, Request, Response } from 'express';
import { PerformanceMonitor } from '../services/performance_monitor';
import { MarketingAgent } from '../agents/marketing_agent';
import { QAAgent } from '../agents/qa_agent';
import { authMiddleware } from '../middleware/auth';
import prisma from '../db';
import logger from '../utils/logger';
import { captureRouteError } from '../utils/capture';

const router = Router();
const monitor = new PerformanceMonitor();
const marketingAgent = new MarketingAgent();
const qaAgent = new QAAgent();

// All routes require authentication
router.use(authMiddleware);

// ─── System Health ────────────────────────────────────────

/**
 * GET /api/agent-dashboard/health
 * Full system health snapshot (agents, quality, security, campaigns)
 */
router.get('/health', async (req: Request, res: Response) => {
    try {
        const health = await monitor.getSystemHealth();
        res.json({ success: true, data: health });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'agent_dashboard#1' });
        logger.error('[AgentDashboard] Health check failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Agent Metrics ────────────────────────────────────────

/**
 * GET /api/agent-dashboard/metrics
 * Per-agent performance metrics for today
 */
router.get('/metrics', async (req: Request, res: Response) => {
    try {
        const metrics = await monitor.getAgentMetrics();
        res.json({ success: true, data: metrics });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'agent_dashboard#2' });
        logger.error('[AgentDashboard] Metrics failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Conversion Funnel ────────────────────────────────────

/**
 * GET /api/agent-dashboard/funnel
 * Lead lifecycle conversion funnel
 */
router.get('/funnel', async (req: Request, res: Response) => {
    try {
        const funnel = await monitor.getConversionFunnel();
        res.json({ success: true, data: funnel });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'agent_dashboard#3' });
        logger.error('[AgentDashboard] Funnel failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Agent Action Logs ────────────────────────────────────

/**
 * GET /api/agent-dashboard/logs
 * Paginated agent action log
 * Query params: agent_name, status, phone_number, limit, offset
 */
router.get('/logs', async (req: Request, res: Response) => {
    try {
        const result = await monitor.getAgentLogs({
            agent_name: req.query.agent_name as string,
            status: req.query.status as string,
            phone_number: req.query.phone_number as string,
            limit: parseInt(req.query.limit as string) || 50,
            offset: parseInt(req.query.offset as string) || 0,
        });
        res.json({ success: true, data: result.logs, total: result.total });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'agent_dashboard#4' });
        logger.error('[AgentDashboard] Logs failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── QA Logs ──────────────────────────────────────────────

/**
 * GET /api/agent-dashboard/qa-logs
 * Quality assurance logs (flagged conversations)
 * Query params: flagged_only, agent_name, limit, offset
 */
router.get('/qa-logs', async (req: Request, res: Response) => {
    try {
        const result = await monitor.getQALogs({
            flagged_only: req.query.flagged_only === 'true',
            agent_name: req.query.agent_name as string,
            limit: parseInt(req.query.limit as string) || 50,
            offset: parseInt(req.query.offset as string) || 0,
        });
        res.json({ success: true, data: result.logs, total: result.total });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'agent_dashboard#5' });
        logger.error('[AgentDashboard] QA logs failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Campaigns ────────────────────────────────────────────

/**
 * GET /api/agent-dashboard/campaigns
 * List all campaigns
 * Query params: status, limit
 */
router.get('/campaigns', async (req: Request, res: Response) => {
    try {
        const campaigns = await marketingAgent.listCampaigns(
            req.query.status as string,
            parseInt(req.query.limit as string) || 20,
        );
        res.json({ success: true, data: campaigns });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'agent_dashboard#6' });
        logger.error('[AgentDashboard] Campaigns list failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/agent-dashboard/campaigns
 * Create a new campaign
 */
router.post('/campaigns', async (req: Request, res: Response) => {
    try {
        const { name, type, channel, message, subject, audience } = req.body;

        if (!name || !message || !audience) {
            res.status(400).json({ success: false, error: 'name, message, and audience are required' });
            return;
        }

        const campaignId = await marketingAgent.createCampaign({
            name,
            type: type || 'broadcast',
            channel: channel || 'whatsapp',
            message,
            subject,
            audience,
            created_by: (req as any).agent?.id,
        });

        res.json({ success: true, data: { campaign_id: campaignId } });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'agent_dashboard#7' });
        logger.error('[AgentDashboard] Campaign creation failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/agent-dashboard/campaigns/:id/execute
 * Execute a campaign (send to audience)
 */
router.post('/campaigns/:id/execute', async (req: Request, res: Response) => {
    try {
        const result = await marketingAgent.executeCampaign(req.params.id as string);
        res.json({ success: true, data: result });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'agent_dashboard#8' });
        logger.error('[AgentDashboard] Campaign execution failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/agent-dashboard/campaigns/:id/cancel
 * Cancel a campaign
 */
router.post('/campaigns/:id/cancel', async (req: Request, res: Response) => {
    try {
        await marketingAgent.cancelCampaign(req.params.id as string);
        res.json({ success: true, message: 'Campaign cancelled' });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'agent_dashboard#9' });
        logger.error('[AgentDashboard] Campaign cancel failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/agent-dashboard/campaigns/analytics
 * Campaign analytics summary
 */
router.get('/campaigns/analytics', async (req: Request, res: Response) => {
    try {
        const analytics = await marketingAgent.getAnalytics();
        res.json({ success: true, data: analytics });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'agent_dashboard#10' });
        logger.error('[AgentDashboard] Campaign analytics failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Human Override Controls ─────────────────────────────────

/**
 * PATCH /api/agent-dashboard/qa-logs/:id/review
 * Mark a QA log as reviewed by a human
 */
router.patch('/qa-logs/:id/review', async (req: Request, res: Response) => {
    try {
        const agentName = (req as any).agent?.name || 'unknown';
        const updated = await prisma.qALog.update({
            where: { id: req.params.id as string },
            data: {
                reviewed_by: agentName,
                flagged: false, // Clear flag after review
            },
        });
        res.json({ success: true, data: updated });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'agent_dashboard#11' });
        logger.error('[AgentDashboard] QA review failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PATCH /api/agent-dashboard/qa-logs/:id/flag
 * Toggle flag on a QA log (human can flag/unflag)
 */
router.patch('/qa-logs/:id/flag', async (req: Request, res: Response) => {
    try {
        const { flagged } = req.body;
        const updated = await prisma.qALog.update({
            where: { id: req.params.id as string },
            data: { flagged: flagged !== undefined ? flagged : true },
        });
        res.json({ success: true, data: updated });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'agent_dashboard#12' });
        logger.error('[AgentDashboard] QA flag toggle failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/agent-dashboard/winning-templates
 * Get high-scoring response templates for self-improvement
 * Query params: agent_name, limit
 */
router.get('/winning-templates', async (req: Request, res: Response) => {
    try {
        const agentName = req.query.agent_name as string || '';
        const limit = parseInt(req.query.limit as string) || 10;
        const templates = await qaAgent.getWinningTemplates(agentName, limit);
        res.json({ success: true, data: templates });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'agent_dashboard#13' });
        logger.error('[AgentDashboard] Winning templates failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
