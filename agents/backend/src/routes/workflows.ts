/**
 * Workflow Automation API - Phase 3.1
 * CRUD operations for workflow management
 */

import express, { Request, Response } from 'express';
import prisma from '../db';
import { captureRouteError } from '../utils/capture';

const router = express.Router();

// Get all workflows
router.get('/', async (req: Request, res: Response) => {
  try {
    const { enabled, trigger } = req.query;

    const where: any = {};
    if (enabled !== undefined) where.enabled = enabled === 'true';
    if (trigger) where.trigger = trigger;

    const workflows = await prisma.workflow.findMany({
      where,
      orderBy: [
        { enabled: 'desc' },
        { priority: 'desc' },
        { name: 'asc' },
      ],
      include: {
        _count: {
          select: { executions: true },
        },
      },
    });

    res.json({ workflows, total: workflows.length });
  } catch (error: any) {
        captureRouteError(error, req, { route: 'workflows#1' });
    console.error('Get workflows error:', error);
    res.status(500).json({ error: 'Failed to fetch workflows' });
  }
});

// Get single workflow
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const workflow = await prisma.workflow.findUnique({
      where: { id: req.params.id },
      include: {
        executions: {
          take: 10,
          orderBy: { executed_at: 'desc' },
        },
      },
    });

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    res.json(workflow);
  } catch (error: any) {
        captureRouteError(error, req, { route: 'workflows#2' });
    console.error('Get workflow error:', error);
    res.status(500).json({ error: 'Failed to fetch workflow' });
  }
});

// Create workflow
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      trigger,
      conditions,
      actions,
      delay_minutes,
      priority,
      max_executions_per_day,
      enabled,
    } = req.body;

    // Validation
    if (!name || !trigger) {
      return res.status(400).json({ error: 'Name and trigger are required' });
    }

    if (!Array.isArray(actions) || actions.length === 0) {
      return res.status(400).json({ error: 'At least one action is required' });
    }

    const workflow = await prisma.workflow.create({
      data: {
        name,
        description,
        trigger,
        conditions: conditions || [],
        actions: actions || [],
        delay_minutes: delay_minutes || 0,
        priority: priority || 0,
        max_executions_per_day,
        enabled: enabled !== undefined ? enabled : true,
        created_by: (req as any).agent?.id || 'system',
      },
    });

    res.status(201).json(workflow);
  } catch (error: any) {
        captureRouteError(error, req, { route: 'workflows#3' });
    console.error('Create workflow error:', error);
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

// Update workflow
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      trigger,
      conditions,
      actions,
      delay_minutes,
      priority,
      max_executions_per_day,
      enabled,
    } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (trigger !== undefined) updateData.trigger = trigger;
    if (conditions !== undefined) updateData.conditions = conditions;
    if (actions !== undefined) updateData.actions = actions;
    if (delay_minutes !== undefined) updateData.delay_minutes = delay_minutes;
    if (priority !== undefined) updateData.priority = priority;
    if (max_executions_per_day !== undefined) updateData.max_executions_per_day = max_executions_per_day;
    if (enabled !== undefined) updateData.enabled = enabled;

    const workflow = await prisma.workflow.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json(workflow);
  } catch (error: any) {
        captureRouteError(error, req, { route: 'workflows#4' });
    console.error('Update workflow error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    res.status(500).json({ error: 'Failed to update workflow' });
  }
});

// Toggle workflow enabled status
router.post('/:id/toggle', async (req: Request, res: Response) => {
  try {
    const workflow = await prisma.workflow.findUnique({
      where: { id: req.params.id },
    });

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const updated = await prisma.workflow.update({
      where: { id: req.params.id },
      data: { enabled: !workflow.enabled },
    });

    res.json(updated);
  } catch (error: any) {
        captureRouteError(error, req, { route: 'workflows#5' });
    console.error('Toggle workflow error:', error);
    res.status(500).json({ error: 'Failed to toggle workflow' });
  }
});

// Delete workflow
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.workflow.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true, message: 'Workflow deleted' });
  } catch (error: any) {
        captureRouteError(error, req, { route: 'workflows#6' });
    console.error('Delete workflow error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    res.status(500).json({ error: 'Failed to delete workflow' });
  }
});

// Get workflow executions
router.get('/:id/executions', async (req: Request, res: Response) => {
  try {
    const { limit = '50', offset = '0', status } = req.query;

    const where: any = { workflow_id: req.params.id };
    if (status) where.status = status;

    const executions = await prisma.workflowExecution.findMany({
      where,
      orderBy: { executed_at: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    const total = await prisma.workflowExecution.count({ where });

    res.json({ executions, total });
  } catch (error: any) {
        captureRouteError(error, req, { route: 'workflows#7' });
    console.error('Get workflow executions error:', error);
    res.status(500).json({ error: 'Failed to fetch executions' });
  }
});

// Get workflow statistics
router.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const stats = await prisma.workflowExecution.groupBy({
      by: ['status'],
      where: { workflow_id: req.params.id },
      _count: { id: true },
    });

    const avgDuration = await prisma.workflowExecution.aggregate({
      where: {
        workflow_id: req.params.id,
        duration_ms: { not: null },
      },
      _avg: { duration_ms: true },
    });

    res.json({
      by_status: stats,
      avg_duration_ms: avgDuration._avg.duration_ms || 0,
    });
  } catch (error: any) {
        captureRouteError(error, req, { route: 'workflows#8' });
    console.error('Get workflow stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Test workflow (manual trigger)
router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const { test_data } = req.body;

    if (!test_data) {
      return res.status(400).json({ error: 'test_data is required' });
    }

    const workflow = await prisma.workflow.findUnique({
      where: { id: req.params.id },
    });

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    // Import workflow engine
    const workflowEngine = require('../services/workflow_engine').default;
    workflowEngine.emitWorkflowTrigger(workflow.trigger, test_data);

    res.json({
      success: true,
      message: 'Workflow test triggered',
      workflow_name: workflow.name,
    });
  } catch (error: any) {
        captureRouteError(error, req, { route: 'workflows#9' });
    console.error('Test workflow error:', error);
    res.status(500).json({ error: 'Failed to test workflow' });
  }
});

export default router;
