/**
 * Notification Preferences API
 * Manage per-agent notification settings — persisted in notification_preferences table.
 */

import express, { Request, Response } from 'express';
import prisma from '../db';
import { authMiddleware } from '../middleware/auth';
import { NotificationAgent, NotificationChannel } from '../agents/notification_agent';
import { getVapidPublicKey } from '../services/push_service';
import logger from '../utils/logger';

const router = express.Router();
const notificationAgent = new NotificationAgent();

// Default notification preferences (used when no record exists yet)
const DEFAULT_PREFERENCES = {
  whatsapp_enabled: true,
  email_enabled: true,
  voice_enabled: false,
  sms_enabled: false,
  new_lead_notification: true,
  appointment_reminder: true,
  task_due_reminder: true,
  property_match_notification: true,
  message_received_notification: true,
  call_missed_notification: true,
  quiet_hours_enabled: true,
  quiet_hours_start: '21:00',
  quiet_hours_end: '08:00',
  daily_digest_enabled: true,
  daily_digest_time: '09:00',
  instant_notifications: true,
  batch_notifications: false,
  batch_interval_minutes: 15,
  notification_sound_enabled: true,
  notification_vibration_enabled: true,
};

// ===================================================================
// GET NOTIFICATION PREFERENCES
// ===================================================================

router.get('/preferences', authMiddleware, async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).agent?.id;

    if (!agentId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, name: true },
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Load from notification_preferences table
    const record = await (prisma as any).notificationPreference.findUnique({
      where: {
        owner_type_owner_id: {
          owner_type: 'agent',
          owner_id: agentId,
        },
      },
    });

    if (record) {
      // Merge DB fields with event_preferences JSON and defaults
      const eventPrefs = (record.event_preferences as Record<string, any>) || {};
      const preferences = {
        ...DEFAULT_PREFERENCES,
        ...eventPrefs,
        whatsapp_enabled: record.whatsapp_enabled,
        email_enabled: record.email_enabled,
        quiet_hours_enabled: record.quiet_hours_enabled,
        quiet_hours_start: record.quiet_hours_start,
        quiet_hours_end: record.quiet_hours_end,
      };
      return res.json({ preferences });
    }

    // No record yet — return defaults
    res.json({ preferences: DEFAULT_PREFERENCES });
  } catch (error: any) {
    logger.error('Error fetching notification preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// ===================================================================
// UPDATE NOTIFICATION PREFERENCES
// ===================================================================

router.post('/preferences', authMiddleware, async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).agent?.id;
    const preferences = req.body;

    if (!agentId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({ error: 'Invalid preferences format' });
    }

    // Extract DB-column fields; everything else goes into event_preferences JSON
    const {
      whatsapp_enabled = true,
      email_enabled = true,
      quiet_hours_enabled = true,
      quiet_hours_start = '21:00',
      quiet_hours_end = '08:00',
      ...eventPreferences
    } = preferences;

    await (prisma as any).notificationPreference.upsert({
      where: {
        owner_type_owner_id: {
          owner_type: 'agent',
          owner_id: agentId,
        },
      },
      update: {
        whatsapp_enabled,
        email_enabled,
        quiet_hours_enabled,
        quiet_hours_start,
        quiet_hours_end,
        event_preferences: eventPreferences,
        updated_at: new Date(),
      },
      create: {
        owner_type: 'agent',
        owner_id: agentId,
        whatsapp_enabled,
        email_enabled,
        quiet_hours_enabled,
        quiet_hours_start,
        quiet_hours_end,
        event_preferences: eventPreferences,
      },
    });

    logger.info(`[Notifications] Preferences saved for agent ${agentId}`);

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      preferences,
    });
  } catch (error: any) {
    logger.error('Error updating notification preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// ===================================================================
// TEST NOTIFICATION (Send test notification to verify settings)
// ===================================================================

router.post('/test', authMiddleware, async (req: Request, res: Response) => {
  try {
    const agentId = (req as any).agent?.id;
    const { channel } = req.body; // 'whatsapp', 'email', 'voice'

    if (!agentId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const validChannels: NotificationChannel[] = ['whatsapp', 'email', 'voice'];
    if (!channel || !validChannels.includes(channel)) {
      return res.status(400).json({ error: `channel must be one of: ${validChannels.join(', ')}` });
    }

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, name: true, phone: true, email: true },
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const recipient = channel === 'email' ? agent.email : agent.phone;
    if (!recipient) {
      return res.status(400).json({ error: `No ${channel} address found for this agent` });
    }

    const result = await notificationAgent.send({
      to: channel === 'whatsapp' ? recipient.replace(/^\+/, '') : recipient,
      channel: channel as NotificationChannel,
      message: `This is a test notification from Realty Pandit.\n\nYour ${channel} notifications are working correctly. ✅`,
      subject: 'Realty Pandit — Test Notification',
      log_interaction: false,
    });

    if (!result.success) {
      return res.status(502).json({
        success: false,
        message: `Failed to send test notification via ${channel}`,
        error: result.error,
      });
    }

    logger.info(`[Notifications] Test notification sent via ${channel} to agent ${agentId}`);

    res.json({
      success: true,
      message: `Test notification sent via ${channel}`,
      channel,
      recipient,
    });
  } catch (error: any) {
    logger.error('Error sending test notification:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

// ─── WEB PUSH SUBSCRIPTION (Phase 2) ─────────────────────────────────────────

// GET /api/notifications/push/vapid-key — Return public VAPID key
router.get('/push/vapid-key', (req: Request, res: Response) => {
    const key = getVapidPublicKey();
    if (!key) return res.status(503).json({ error: 'Push notifications not configured' });
    res.json({ publicKey: key });
});

// POST /api/notifications/push/subscribe — Save push subscription
router.post('/push/subscribe', authMiddleware, async (req: Request, res: Response) => {
    try {
        const agentId = (req as any).agent?.id;
        if (!agentId) return res.status(401).json({ error: 'Not authenticated' });

        const { endpoint, keys } = req.body;
        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return res.status(400).json({ error: 'endpoint, keys.p256dh, and keys.auth are required' });
        }

        // Upsert: same endpoint = same device
        await prisma.pushSubscription.upsert({
            where: { endpoint },
            update: {
                agent_id: agentId,
                keys_p256dh: keys.p256dh,
                keys_auth: keys.auth,
                user_agent: req.headers['user-agent'] || null,
            },
            create: {
                agent_id: agentId,
                endpoint,
                keys_p256dh: keys.p256dh,
                keys_auth: keys.auth,
                user_agent: req.headers['user-agent'] || null,
            },
        });

        logger.info(`[Push] Subscription saved for agent ${agentId}`);
        res.json({ success: true });
    } catch (error: any) {
        logger.error('Error saving push subscription:', error);
        res.status(500).json({ error: 'Failed to save subscription' });
    }
});

// DELETE /api/notifications/push/subscribe — Remove push subscription
router.delete('/push/subscribe', authMiddleware, async (req: Request, res: Response) => {
    try {
        const agentId = (req as any).agent?.id;
        const { endpoint } = req.body;

        if (endpoint) {
            await prisma.pushSubscription.deleteMany({ where: { endpoint } });
        } else {
            // Delete all subscriptions for this agent
            await prisma.pushSubscription.deleteMany({ where: { agent_id: agentId } });
        }

        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to remove subscription' });
    }
});

// ─── NOTIFICATION HISTORY (Phase 1) ──────────────────────────────────────────

// GET /api/notifications/history — Paginated notification list for logged-in agent
router.get('/history', authMiddleware, async (req: Request, res: Response) => {
    try {
        const agentId = (req as any).agent?.id;
        if (!agentId) return res.status(401).json({ error: 'Not authenticated' });

        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
        const category = req.query.category as string;

        const where: any = { recipient_id: agentId };
        if (category) where.category = category;

        const [notifications, total] = await Promise.all([
            prisma.notification.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.notification.count({ where }),
        ]);

        res.json({ data: notifications, total, page, totalPages: Math.ceil(total / limit) });
    } catch (error: any) {
        logger.error('Error fetching notification history:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// GET /api/notifications/unread-count — Count of unread notifications
router.get('/unread-count', authMiddleware, async (req: Request, res: Response) => {
    try {
        const agentId = (req as any).agent?.id;
        if (!agentId) return res.status(401).json({ error: 'Not authenticated' });

        const count = await prisma.notification.count({
            where: { recipient_id: agentId, read: false },
        });

        res.json({ count });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to count notifications' });
    }
});

// POST /api/notifications/:id/read — Mark single notification as read
router.post('/:id/read', authMiddleware, async (req: Request, res: Response) => {
    try {
        const agentId = (req as any).agent?.id;
        await prisma.notification.updateMany({
            where: { id: req.params.id, recipient_id: agentId },
            data: { read: true },
        });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to mark as read' });
    }
});

// POST /api/notifications/read-all — Mark all as read
router.post('/read-all', authMiddleware, async (req: Request, res: Response) => {
    try {
        const agentId = (req as any).agent?.id;
        await prisma.notification.updateMany({
            where: { recipient_id: agentId, read: false },
            data: { read: true },
        });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to mark all as read' });
    }
});

// POST /api/notifications/:id/click — Mark notification as clicked
router.post('/:id/click', authMiddleware, async (req: Request, res: Response) => {
    try {
        const agentId = (req as any).agent?.id;
        await prisma.notification.updateMany({
            where: { id: req.params.id, recipient_id: agentId },
            data: { read: true, clicked: true },
        });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to mark as clicked' });
    }
});

export default router;
