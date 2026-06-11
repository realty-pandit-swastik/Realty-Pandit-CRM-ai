/**
 * Task & Project Management API - Phase 3.3
 * CRUD operations for projects and tasks with Kanban board support
 */

import express, { Request, Response } from 'express';
import prisma from '../db';
import { notify } from '../services/notify';
import { captureRouteError } from '../utils/capture';

const router = express.Router();

// ===================================================================
// PROJECTS
// ===================================================================

// Get all projects
router.get('/projects', async (req: Request, res: Response) => {
  try {
    const { status, owner_id } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (owner_id) where.owner_id = owner_id;

    const projects = await prisma.workProject.findMany({
      where,
      orderBy: [
        { status: 'asc' },
        { start_date: 'desc' },
      ],
      include: {
        _count: {
          select: { tasks: true },
        },
      },
    });

    res.json({ projects, total: projects.length });
  } catch (error: any) {
        captureRouteError(error, req, { route: 'tasks#1' });
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get single project
router.get('/projects/:id', async (req: Request, res: Response) => {
  try {
    const project = await prisma.workProject.findUnique({
      where: { id: req.params.id },
      include: {
        tasks: {
          orderBy: [
            { status: 'asc' },
            { priority: 'desc' },
            { due_date: 'asc' },
          ],
        },
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
  } catch (error: any) {
        captureRouteError(error, req, { route: 'tasks#2' });
    console.error('Get project error:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// Create project
router.post('/projects', async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      status,
      start_date,
      end_date,
      owner_id,
      team_members,
    } = req.body;

    // Validation
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const project = await prisma.workProject.create({
      data: {
        name,
        description,
        status: status || 'ACTIVE',
        start_date: start_date ? new Date(start_date) : new Date(),
        end_date: end_date ? new Date(end_date) : null,
        owner_id: owner_id || (req as any).agent?.id,
        team_members: team_members || [],
      },
    });

    res.status(201).json(project);
  } catch (error: any) {
        captureRouteError(error, req, { route: 'tasks#3' });
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Update project
router.patch('/projects/:id', async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      status,
      start_date,
      end_date,
      owner_id,
      team_members,
    } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (start_date !== undefined) updateData.start_date = new Date(start_date);
    if (end_date !== undefined) updateData.end_date = end_date ? new Date(end_date) : null;
    if (owner_id !== undefined) updateData.owner_id = owner_id;
    if (team_members !== undefined) updateData.team_members = team_members;

    const project = await prisma.workProject.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json(project);
  } catch (error: any) {
        captureRouteError(error, req, { route: 'tasks#4' });
    console.error('Update project error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Delete project
router.delete('/projects/:id', async (req: Request, res: Response) => {
  try {
    await prisma.workProject.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true, message: 'Project deleted' });
  } catch (error: any) {
        captureRouteError(error, req, { route: 'tasks#5' });
    console.error('Delete project error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// ===================================================================
// TASKS
// ===================================================================

// Get all tasks (with filters for Kanban view)
router.get('/tasks', async (req: Request, res: Response) => {
  try {
    const {
      project_id,
      assigned_to,
      status,
      priority,
      contact_phone,
      tag,
      due_before,
      due_after,
      view,
    } = req.query;

    const where: any = {};
    if (project_id) where.project_id = project_id;
    if (assigned_to) where.assigned_to = assigned_to;
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (contact_phone) where.contact_phone = contact_phone;
    if (tag) where.tags = { has: tag };

    // Date range filters
    if (due_before || due_after) {
      where.due_date = {};
      if (due_before) where.due_date.lte = new Date(due_before as string);
      if (due_after) where.due_date.gte = new Date(due_after as string);
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: view === 'calendar'
        ? [{ due_date: 'asc' }]
        : [
            { status: 'asc' },
            { priority: 'desc' },
            { due_date: 'asc' },
          ],
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    res.json({ tasks, total: tasks.length });
  } catch (error: any) {
        captureRouteError(error, req, { route: 'tasks#6' });
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Get single task
router.get('/tasks/:id', async (req: Request, res: Response) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        project: true,
      },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
  } catch (error: any) {
        captureRouteError(error, req, { route: 'tasks#7' });
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// Create task
router.post('/tasks', async (req: Request, res: Response) => {
  try {
    const {
      project_id,
      title,
      description,
      assigned_to,
      due_date,
      priority,
      status,
      contact_phone,
      property_id,
      tags,
    } = req.body;

    // Validation
    if (!title || !assigned_to || !due_date) {
      return res.status(400).json({ error: 'Title, assigned_to, and due_date are required' });
    }

    // SSOT Integration: Validate contact exists
    if (contact_phone) {
      const contact = await prisma.contact.findUnique({
        where: { phone_number: contact_phone },
      });
      if (!contact) {
        return res.status(400).json({ error: 'Contact not found' });
      }
    }

    // SSOT Integration: Validate property exists
    if (property_id) {
      const property = await prisma.inventory.findUnique({
        where: { id: property_id },
      });
      if (!property) {
        return res.status(400).json({ error: 'Property not found' });
      }
    }

    const task = await prisma.task.create({
      data: {
        project_id,
        title,
        description,
        assigned_to,
        due_date: new Date(due_date),
        priority: priority || 'MEDIUM',
        status: status || 'TODO',
        contact_phone,
        property_id,
        tags: tags || [],
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // SSOT Integration: Create interaction log
    if (contact_phone) {
      const tenantId = (req as any).agent?.tenant_id;
      if (tenantId) {
        await prisma.interaction.create({
          data: {
            phone_number: contact_phone,
            tenant_id: tenantId,
            direction: 'OUTBOUND',
            channel: 'INTERNAL',
            event_type: 'task_created',
            content: `Task created: ${title}`,
            metadata: {
              task_id: task.id,
              action: 'task_created',
              priority,
              due_date,
              assigned_to,
            },
          },
        });
      }
    }

    // Notify assigned agent
    if (assigned_to) {
        const assignee = await prisma.agent.findUnique({ where: { id: assigned_to }, select: { id: true, phone: true, email: true, name: true } });
        if (assignee) {
            notify('task_assigned', [{ id: assignee.id, type: 'agent', phone: assignee.phone, email: assignee.email || undefined, name: assignee.name }], {
                title, due_date, task_id: task.id, priority,
            });
        }
    }

    res.status(201).json(task);
  } catch (error: any) {
        captureRouteError(error, req, { route: 'tasks#8' });
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task (including status updates for Kanban drag-and-drop)
router.patch('/tasks/:id', async (req: Request, res: Response) => {
  try {
    const {
      project_id,
      title,
      description,
      assigned_to,
      due_date,
      priority,
      status,
      contact_phone,
      property_id,
      tags,
    } = req.body;

    // Get existing task to check for changes
    const existingTask = await prisma.task.findUnique({
      where: { id: req.params.id },
    });

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // SSOT Integration: Validate contact exists if being changed
    if (contact_phone !== undefined && contact_phone !== existingTask.contact_phone) {
      if (contact_phone) {
        const contact = await prisma.contact.findUnique({
          where: { phone_number: contact_phone },
        });
        if (!contact) {
          return res.status(400).json({ error: 'Contact not found' });
        }
      }
    }

    // SSOT Integration: Validate property exists if being changed
    if (property_id !== undefined && property_id !== existingTask.property_id) {
      if (property_id) {
        const property = await prisma.inventory.findUnique({
          where: { id: property_id },
        });
        if (!property) {
          return res.status(400).json({ error: 'Property not found' });
        }
      }
    }

    const updateData: any = {};
    if (project_id !== undefined) updateData.project_id = project_id;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (assigned_to !== undefined) updateData.assigned_to = assigned_to;
    if (due_date !== undefined) updateData.due_date = new Date(due_date);
    if (priority !== undefined) updateData.priority = priority;

    let isTaskCompleted = false;
    if (status !== undefined) {
      updateData.status = status;
      // Mark as completed when status changes to DONE
      if (status === 'DONE' && existingTask.status !== 'DONE') {
        updateData.completed_at = new Date();
        updateData.completed_by = (req as any).agent?.id || 'system';
        isTaskCompleted = true;
      } else if (status !== 'DONE' && existingTask.status === 'DONE') {
        // Clear completion if moved back from DONE
        updateData.completed_at = null;
        updateData.completed_by = null;
      }
    }
    if (contact_phone !== undefined) updateData.contact_phone = contact_phone;
    if (property_id !== undefined) updateData.property_id = property_id;
    if (tags !== undefined) updateData.tags = tags;

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // SSOT Integration: Create interaction log for task updates
    const targetContactPhone = task.contact_phone || existingTask.contact_phone;
    if (targetContactPhone) {
      const tenantId = (req as any).agent?.tenant_id;
      if (tenantId) {
        let eventContent = '';
        let eventType = 'task_updated';

        if (isTaskCompleted) {
          eventContent = `Task completed: ${task.title}`;
          eventType = 'task_completed';
        } else if (status !== undefined && status !== existingTask.status) {
          eventContent = `Task status changed: ${existingTask.status} → ${status} for "${task.title}"`;
          eventType = 'task_status_changed';
        } else {
          eventContent = `Task updated: ${task.title}`;
        }

        await prisma.interaction.create({
          data: {
            phone_number: targetContactPhone,
            tenant_id: tenantId,
            direction: 'OUTBOUND',
            channel: 'INTERNAL',
            event_type: eventType,
            content: eventContent,
            metadata: {
              task_id: task.id,
              action: eventType,
              changes: updateData,
            },
          },
        });
      }
    }

    // Notify on task completion
    if (isTaskCompleted && existingTask.assigned_to) {
        // Notify the task creator (if different from completer)
        const agentId = (req as any).agent?.id;
        // Find who created the task — simplified: notify the assignee's manager or skip if same person
    }

    // Notify on reassignment
    if (assigned_to !== undefined && assigned_to !== existingTask.assigned_to && assigned_to) {
        const newAssignee = await prisma.agent.findUnique({ where: { id: assigned_to }, select: { id: true, phone: true, email: true, name: true } });
        if (newAssignee) {
            notify('task_assigned', [{ id: newAssignee.id, type: 'agent', phone: newAssignee.phone, email: newAssignee.email || undefined, name: newAssignee.name }], {
                title: task.title, due_date: task.due_date?.toISOString().split('T')[0], task_id: task.id, priority: task.priority,
            });
        }
    }

    res.json(task);
  } catch (error: any) {
        captureRouteError(error, req, { route: 'tasks#9' });
    console.error('Update task error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete task
router.delete('/tasks/:id', async (req: Request, res: Response) => {
  try {
    // Get task before deleting to log interaction
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await prisma.task.delete({
      where: { id: req.params.id },
    });

    // SSOT Integration: Create interaction log for task deletion
    if (task.contact_phone) {
      const tenantId = (req as any).agent?.tenant_id;
      if (tenantId) {
        await prisma.interaction.create({
          data: {
            phone_number: task.contact_phone,
            tenant_id: tenantId,
            direction: 'OUTBOUND',
            channel: 'INTERNAL',
            event_type: 'task_deleted',
            content: `Task deleted: ${task.title}`,
            metadata: {
              task_id: task.id,
              action: 'task_deleted',
              deleted_at: new Date().toISOString(),
            },
          },
        });
      }
    }

    res.json({ success: true, message: 'Task deleted' });
  } catch (error: any) {
        captureRouteError(error, req, { route: 'tasks#10' });
    console.error('Delete task error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Bulk create tasks (CSV import)
router.post('/tasks/bulk-import', async (req: Request, res: Response) => {
  try {
    const { tasks } = req.body;

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: 'Tasks array is required' });
    }

    const created: any[] = [];
    const errors: any[] = [];
    const tenantId = (req as any).agent?.tenant_id;

    for (const taskData of tasks) {
      try {
        // Validation
        if (!taskData.title || !taskData.assigned_to || !taskData.due_date) {
          errors.push({
            task: taskData,
            error: 'Title, assigned_to, and due_date are required',
          });
          continue;
        }

        // SSOT Integration: Validate contact exists
        if (taskData.contact_phone) {
          const contact = await prisma.contact.findUnique({
            where: { phone_number: taskData.contact_phone },
          });
          if (!contact) {
            errors.push({
              task: taskData,
              error: 'Contact not found',
            });
            continue;
          }
        }

        // SSOT Integration: Validate property exists
        if (taskData.property_id) {
          const property = await prisma.inventory.findUnique({
            where: { id: taskData.property_id },
          });
          if (!property) {
            errors.push({
              task: taskData,
              error: 'Property not found',
            });
            continue;
          }
        }

        const task = await prisma.task.create({
          data: {
            project_id: taskData.project_id,
            title: taskData.title,
            description: taskData.description,
            assigned_to: taskData.assigned_to,
            due_date: new Date(taskData.due_date),
            priority: taskData.priority || 'MEDIUM',
            status: taskData.status || 'TODO',
            contact_phone: taskData.contact_phone,
            property_id: taskData.property_id,
            tags: taskData.tags || [],
          },
        });

        created.push(task);

        // SSOT Integration: Create interaction log
        if (taskData.contact_phone && tenantId) {
          await prisma.interaction.create({
            data: {
              phone_number: taskData.contact_phone,
              tenant_id: tenantId,
              direction: 'OUTBOUND',
              channel: 'INTERNAL',
              event_type: 'task_created',
              content: `Task created (bulk import): ${task.title}`,
              metadata: {
                task_id: task.id,
                action: 'task_created',
                import_type: 'bulk',
              },
            },
          });
        }
      } catch (error: any) {
        errors.push({
          task: taskData,
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      created_count: created.length,
      error_count: errors.length,
      created,
      errors,
    });
  } catch (error: any) {
        captureRouteError(error, req, { route: 'tasks#11' });
    console.error('Bulk import error:', error);
    res.status(500).json({ error: 'Failed to import tasks' });
  }
});

// Get task statistics (for dashboard)
router.get('/tasks/stats/summary', async (req: Request, res: Response) => {
  try {
    const { assigned_to } = req.query;

    const where: any = {};
    if (assigned_to) where.assigned_to = assigned_to;

    const [
      total,
      todo,
      inProgress,
      done,
      blocked,
      overdue,
      highPriority,
    ] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.count({ where: { ...where, status: 'TODO' } }),
      prisma.task.count({ where: { ...where, status: 'IN_PROGRESS' } }),
      prisma.task.count({ where: { ...where, status: 'DONE' } }),
      prisma.task.count({ where: { ...where, status: 'BLOCKED' } }),
      prisma.task.count({
        where: {
          ...where,
          status: { not: 'DONE' },
          due_date: { lt: new Date() },
        },
      }),
      prisma.task.count({
        where: {
          ...where,
          priority: { in: ['HIGH', 'URGENT'] },
          status: { not: 'DONE' },
        },
      }),
    ]);

    res.json({
      total,
      by_status: {
        TODO: todo,
        IN_PROGRESS: inProgress,
        DONE: done,
        BLOCKED: blocked,
      },
      overdue,
      high_priority: highPriority,
      completion_rate: total > 0 ? ((done / total) * 100).toFixed(1) : 0,
    });
  } catch (error: any) {
        captureRouteError(error, req, { route: 'tasks#12' });
    console.error('Get task stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export default router;
