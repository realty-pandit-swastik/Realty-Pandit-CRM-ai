/**
 * Integration management routes.
 * Sync status, manual trigger, and history for external API integrations.
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import prisma from '../db';
import logger from '../utils/logger';
import { NinetyNineAcresPoller } from '../services/ninety_nine_acres_poller';
import { HousingPoller } from '../services/housing_poller';

const router = Router();
router.use(authMiddleware);

const poller = new NinetyNineAcresPoller();
const housingPoller = new HousingPoller();

/**
 * GET /api/integrations/sync-status
 * Returns sync status for all configured integrations.
 */
router.get('/sync-status', async (_req, res) => {
    try {
        const syncs = await prisma.integrationSync.findMany({
            orderBy: { updated_at: 'desc' },
        });

        // Add configuration status
        const integrations = [
            {
                source: '99acres',
                configured: poller.isConfigured(),
                sync: syncs.find(s => s.source === '99acres') || null,
            },
            {
                source: 'housing',
                configured: housingPoller.isConfigured(),
                sync: syncs.find(s => s.source === 'housing') || null,
            },
        ];

        res.json({ integrations });
    } catch (error) {
        logger.error('[Integrations] sync-status error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

/**
 * POST /api/integrations/99acres/sync
 * Manually trigger a 99acres sync. Restricted to super_boss and manager roles.
 */
router.post('/99acres/sync', async (req: any, res) => {
    try {
        const userRole = req.user?.role;
        if (!['super_boss', 'manager'].includes(userRole)) {
            return res.status(403).json({ error: 'Only super_boss or manager can trigger sync' });
        }

        if (!poller.isConfigured()) {
            return res.status(400).json({ error: '99acres API credentials not configured' });
        }

        // Check if already running
        const current = await poller.getSyncStatus();
        if (current?.status === 'running') {
            return res.status(409).json({ error: 'Sync already in progress' });
        }

        logger.info(`[Integrations] Manual 99acres sync triggered by ${req.user?.name || userRole}`);

        // Run poll (this may take a few seconds)
        const result = await poller.poll();

        res.json({
            success: true,
            message: `Synced ${result.fetched} leads (${result.new} new, ${result.updated} updated)`,
            ...result,
        });
    } catch (error) {
        logger.error('[Integrations] 99acres manual sync error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

/**
 * GET /api/integrations/99acres/history
 * Returns recent 99acres lead interactions (last 50).
 */
router.get('/99acres/history', async (_req, res) => {
    try {
        const interactions = await prisma.interaction.findMany({
            where: { channel: '99acres' },
            orderBy: { created_at: 'desc' },
            take: 50,
            select: {
                id: true,
                phone_number: true,
                event_type: true,
                content: true,
                metadata: true,
                created_at: true,
            },
        });

        res.json({ interactions });
    } catch (error) {
        logger.error('[Integrations] 99acres history error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

/**
 * POST /api/integrations/housing/sync
 * Manually trigger a Housing.com sync. Restricted to super_boss and manager.
 */
router.post('/housing/sync', async (req: any, res) => {
    try {
        const userRole = req.user?.role;
        if (!['super_boss', 'manager'].includes(userRole)) {
            return res.status(403).json({ error: 'Only super_boss or manager can trigger sync' });
        }

        if (!housingPoller.isConfigured()) {
            return res.status(400).json({ error: 'Housing.com API credentials not configured' });
        }

        const current = await housingPoller.getSyncStatus();
        if (current?.status === 'running') {
            return res.status(409).json({ error: 'Sync already in progress' });
        }

        logger.info(`[Integrations] Manual Housing.com sync triggered by ${req.user?.name || userRole}`);

        const result = await housingPoller.poll();

        res.json({
            success: true,
            message: `Synced ${result.fetched} leads (${result.new} new, ${result.updated} updated)`,
            ...result,
        });
    } catch (error) {
        logger.error('[Integrations] Housing.com manual sync error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

/**
 * GET /api/integrations/housing/history
 * Returns recent Housing.com lead interactions (last 50).
 */
router.get('/housing/history', async (_req, res) => {
    try {
        const interactions = await prisma.interaction.findMany({
            where: { channel: 'housing' },
            orderBy: { created_at: 'desc' },
            take: 50,
            select: {
                id: true,
                phone_number: true,
                event_type: true,
                content: true,
                metadata: true,
                created_at: true,
            },
        });

        res.json({ interactions });
    } catch (error) {
        logger.error('[Integrations] Housing.com history error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

export default router;
