/**
 * Marketing Campaign & Template Management API - Phase 3.2
 * Template builder, audience segmentation, scheduling, analytics
 */

import express, { Request, Response } from 'express';
import prisma from '../db';
import { NotificationAgent, NotificationChannel } from '../agents/notification_agent';

const router = express.Router();
const notificationAgent = new NotificationAgent();

// ===================================================================
// CAMPAIGN TEMPLATES
// ===================================================================

// Get all templates
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const { channel, category } = req.query;

    const where: any = {};
    if (channel) where.channel = channel;
    if (category) where.category = category;

    const templates = await prisma.campaignTemplate.findMany({
      where,
      orderBy: [
        { times_used: 'desc' },
        { name: 'asc' },
      ],
    });

    res.json({ templates, total: templates.length });
  } catch (error: any) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Get single template
router.get('/templates/:id', async (req: Request, res: Response) => {
  try {
    const template = await prisma.campaignTemplate.findUnique({
      where: { id: req.params.id },
      include: {
        campaigns: {
          take: 5,
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            name: true,
            status: true,
            sent_count: true,
            delivered: true,
            responded: true,
            created_at: true,
          },
        },
      },
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template);
  } catch (error: any) {
    console.error('Get template error:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// Create template
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const {
      name,
      channel,
      category,
      subject,
      body,
      variables,
    } = req.body;

    // Validation
    if (!name || !channel || !body) {
      return res.status(400).json({ error: 'Name, channel, and body are required' });
    }

    const template = await prisma.campaignTemplate.create({
      data: {
        name,
        channel,
        category,
        subject,
        body,
        variables: variables || [],
        created_by: (req as any).agent?.id || 'system',
      },
    });

    res.status(201).json(template);
  } catch (error: any) {
    console.error('Create template error:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Update template
router.patch('/templates/:id', async (req: Request, res: Response) => {
  try {
    const {
      name,
      channel,
      category,
      subject,
      body,
      variables,
    } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (channel !== undefined) updateData.channel = channel;
    if (category !== undefined) updateData.category = category;
    if (subject !== undefined) updateData.subject = subject;
    if (body !== undefined) updateData.body = body;
    if (variables !== undefined) updateData.variables = variables;

    const template = await prisma.campaignTemplate.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json(template);
  } catch (error: any) {
    console.error('Update template error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Delete template
router.delete('/templates/:id', async (req: Request, res: Response) => {
  try {
    await prisma.campaignTemplate.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true, message: 'Template deleted' });
  } catch (error: any) {
    console.error('Delete template error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ===================================================================
// CAMPAIGNS
// ===================================================================

// Get all campaigns
router.get('/campaigns', async (req: Request, res: Response) => {
  try {
    const { status, type, channel } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (channel) where.channel = channel;

    const campaigns = await prisma.campaign.findMany({
      where,
      orderBy: [
        { created_at: 'desc' },
      ],
      include: {
        template: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    res.json({ campaigns, total: campaigns.length });
  } catch (error: any) {
    console.error('Get campaigns error:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// Get single campaign
router.get('/campaigns/:id', async (req: Request, res: Response) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: {
        template: true,
      },
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json(campaign);
  } catch (error: any) {
    console.error('Get campaign error:', error);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

// Create campaign
router.post('/campaigns', async (req: Request, res: Response) => {
  try {
    const {
      name,
      type,
      channel,
      template_id,
      audience,
      message,
      subject,
      scheduled_at,
      recurrence_rule,
      ab_test_config,
    } = req.body;

    // Validation
    if (!name || !channel) {
      return res.status(400).json({ error: 'Name and channel are required' });
    }

    if (!template_id && !message) {
      return res.status(400).json({ error: 'Either template_id or message is required' });
    }

    const campaign = await prisma.campaign.create({
      data: {
        name,
        type: type || 'broadcast',
        channel,
        template_id,
        audience: audience || {},
        message: message || '',
        subject,
        scheduled_at: scheduled_at ? new Date(scheduled_at) : null,
        recurrence_rule,
        ab_test_config,
        status: 'draft',
        created_by: (req as any).agent?.id || 'system',
      },
      include: {
        template: true,
      },
    });

    res.status(201).json(campaign);
  } catch (error: any) {
    console.error('Create campaign error:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// Update campaign
router.patch('/campaigns/:id', async (req: Request, res: Response) => {
  try {
    const {
      name,
      type,
      channel,
      template_id,
      audience,
      message,
      subject,
      scheduled_at,
      recurrence_rule,
      ab_test_config,
      status,
    } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (channel !== undefined) updateData.channel = channel;
    if (template_id !== undefined) updateData.template_id = template_id;
    if (audience !== undefined) updateData.audience = audience;
    if (message !== undefined) updateData.message = message;
    if (subject !== undefined) updateData.subject = subject;
    if (scheduled_at !== undefined) updateData.scheduled_at = scheduled_at ? new Date(scheduled_at) : null;
    if (recurrence_rule !== undefined) updateData.recurrence_rule = recurrence_rule;
    if (ab_test_config !== undefined) updateData.ab_test_config = ab_test_config;
    if (status !== undefined) updateData.status = status;

    const campaign = await prisma.campaign.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        template: true,
      },
    });

    res.json(campaign);
  } catch (error: any) {
    console.error('Update campaign error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

// Delete campaign
router.delete('/campaigns/:id', async (req: Request, res: Response) => {
  try {
    await prisma.campaign.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true, message: 'Campaign deleted' });
  } catch (error: any) {
    console.error('Delete campaign error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

// Get campaign analytics
router.get('/campaigns/:id/analytics', async (req: Request, res: Response) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const analytics = {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      sent_count: campaign.sent_count,
      delivered: campaign.delivered,
      responded: campaign.responded,
      failed_count: campaign.failed_count,
      delivery_rate: campaign.sent_count > 0 ? (campaign.delivered / campaign.sent_count) * 100 : 0,
      response_rate: campaign.delivered > 0 ? (campaign.responded / campaign.delivered) * 100 : 0,
      failure_rate: campaign.sent_count > 0 ? (campaign.failed_count / campaign.sent_count) * 100 : 0,
      scheduled_at: campaign.scheduled_at,
      completed_at: campaign.completed_at,
      duration_minutes: campaign.completed_at && campaign.scheduled_at
        ? Math.round((campaign.completed_at.getTime() - campaign.scheduled_at.getTime()) / 1000 / 60)
        : null,
    };

    res.json(analytics);
  } catch (error: any) {
    console.error('Get campaign analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Test campaign (send to specific test contacts)
router.post('/campaigns/:id/test', async (req: Request, res: Response) => {
  try {
    const { test_contacts } = req.body; // Array of phone numbers

    if (!test_contacts || !Array.isArray(test_contacts) || test_contacts.length === 0) {
      return res.status(400).json({ error: 'test_contacts array is required' });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: { template: true },
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Send test campaign via NotificationAgent
    const channel = (campaign.channel || 'whatsapp') as NotificationChannel;
    const messageBody = (campaign.template?.content || campaign.name || 'Test campaign message') as string;
    const subject = campaign.subject as string | undefined;

    const bulkResult = await notificationAgent.sendBulk({
      recipients: test_contacts,
      message: messageBody,
      channel,
      subject,
      campaign_id: campaign.id,
      batch_size: 5,
      delay_ms: 500,
    });

    res.json({
      success: true,
      message: `Test campaign sent to ${test_contacts.length} contact(s)`,
      campaign_name: campaign.name,
      test_contacts,
      delivery: { sent: bulkResult.sent, failed: bulkResult.failed },
    });
  } catch (error: any) {
    console.error('Test campaign error:', error);
    res.status(500).json({ error: 'Failed to test campaign' });
  }
});

// Launch campaign (change status to scheduled/sending)
router.post('/campaigns/:id/launch', async (req: Request, res: Response) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      return res.status(400).json({ error: 'Only draft or scheduled campaigns can be launched' });
    }

    // Count audience
    const audienceFilter = campaign.audience as any || {};
    const where: any = {};

    if (audienceFilter.contact_type) where.contact_type = audienceFilter.contact_type;
    if (audienceFilter.lead_status) where.lead_status = audienceFilter.lead_status;
    if (audienceFilter.lifecycle_stage) where.lifecycle_stage = audienceFilter.lifecycle_stage;
    if (audienceFilter.lead_source) where.lead_source = audienceFilter.lead_source;
    if (audienceFilter.assigned_to) where.assigned_to = audienceFilter.assigned_to;

    // Budget filter (if specified)
    if (audienceFilter.budget_min || audienceFilter.budget_max) {
      where.budget_max = {};
      if (audienceFilter.budget_min) where.budget_max.gte = audienceFilter.budget_min;
      if (audienceFilter.budget_max) where.budget_max.lte = audienceFilter.budget_max;
    }

    const audienceCount = await prisma.contact.count({ where });

    if (audienceCount === 0) {
      return res.status(400).json({ error: 'No contacts match the audience criteria' });
    }

    // Update campaign status
    const updated = await prisma.campaign.update({
      where: { id: req.params.id },
      data: {
        status: campaign.scheduled_at && campaign.scheduled_at > new Date() ? 'scheduled' : 'sending',
      },
    });

    // Fire-and-forget bulk send via NotificationAgent if campaign is in sending state
    if (updated.status === 'sending') {
      const campaignWithTemplate = await prisma.campaign.findUnique({
        where: { id: req.params.id },
        include: { template: true },
      });

      // Fetch audience phone numbers
      const contacts = await prisma.contact.findMany({
        where,
        select: { phone_number: true },
        take: 10000, // safety cap
      });
      const recipients = contacts.map(c => c.phone_number);
      const messageBody = (campaignWithTemplate?.template?.content || campaignWithTemplate?.name || 'Campaign message') as string;
      const channel = ((campaignWithTemplate?.channel as string) || 'whatsapp') as NotificationChannel;
      const subject = campaignWithTemplate?.subject as string | undefined;

      notificationAgent.sendBulk({
        recipients,
        message: messageBody,
        channel,
        subject,
        campaign_id: req.params.id,
        batch_size: 10,
        delay_ms: 1000,
      }).catch(err => console.error('[Marketing] Bulk send failed:', err));
    }

    res.json({
      success: true,
      message: updated.status === 'scheduled' ? 'Campaign scheduled successfully' : 'Campaign launched and sending',
      campaign: updated,
      estimated_recipients: audienceCount,
    });
  } catch (error: any) {
    console.error('Launch campaign error:', error);
    res.status(500).json({ error: 'Failed to launch campaign' });
  }
});

// Pause/Resume campaign
router.post('/campaigns/:id/toggle-pause', async (req: Request, res: Response) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const newStatus = campaign.status === 'sending' ? 'scheduled' : 'sending';

    const updated = await prisma.campaign.update({
      where: { id: req.params.id },
      data: { status: newStatus },
    });

    res.json({
      success: true,
      message: `Campaign ${newStatus === 'sending' ? 'resumed' : 'paused'}`,
      campaign: updated,
    });
  } catch (error: any) {
    console.error('Toggle campaign error:', error);
    res.status(500).json({ error: 'Failed to toggle campaign' });
  }
});

// Get audience preview (count of contacts matching criteria)
router.post('/audience/preview', async (req: Request, res: Response) => {
  try {
    const { audience } = req.body;

    const where: any = {};

    if (audience.contact_type) where.contact_type = audience.contact_type;
    if (audience.lead_status) where.lead_status = audience.lead_status;
    if (audience.lifecycle_stage) where.lifecycle_stage = audience.lifecycle_stage;
    if (audience.lead_source) where.lead_source = audience.lead_source;
    if (audience.assigned_to) where.assigned_to = audience.assigned_to;
    if (audience.intent) where.intent = audience.intent;

    // Budget filter
    if (audience.budget_min || audience.budget_max) {
      where.budget_max = {};
      if (audience.budget_min) where.budget_max.gte = audience.budget_min;
      if (audience.budget_max) where.budget_max.lte = audience.budget_max;
    }

    // Location filter
    if (audience.location) {
      where.OR = [
        { city: { contains: audience.location, mode: 'insensitive' } },
        { locality: { contains: audience.location, mode: 'insensitive' } },
      ];
    }

    const count = await prisma.contact.count({ where });

    // Get sample contacts (first 10)
    const sample = await prisma.contact.findMany({
      where,
      take: 10,
      select: {
        phone_number: true,
        name: true,
        contact_type: true,
        lead_status: true,
        city: true,
        locality: true,
      },
    });

    res.json({
      total_count: count,
      sample_contacts: sample,
      criteria: audience,
    });
  } catch (error: any) {
    console.error('Audience preview error:', error);
    res.status(500).json({ error: 'Failed to preview audience' });
  }
});

export default router;
