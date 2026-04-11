/**
 * Workflow Automation Engine - Phase 3.1
 * Event-driven automation system for triggers, conditions, and actions
 */

import prisma from '../db';
import { EventEmitter } from 'events';
const workflowEmitter = new EventEmitter();

// Supported trigger types
export enum WorkflowTrigger {
  LEAD_CREATED = 'LEAD_CREATED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  PROPERTY_ADDED = 'PROPERTY_ADDED',
  APPOINTMENT_SCHEDULED = 'APPOINTMENT_SCHEDULED',
  APPOINTMENT_COMPLETED = 'APPOINTMENT_COMPLETED',
  INTERACTION_RECEIVED = 'INTERACTION_RECEIVED',
  LIFECYCLE_STAGE_CHANGED = 'LIFECYCLE_STAGE_CHANGED',
}

// Supported action types
export enum WorkflowAction {
  ASSIGN_AGENT = 'ASSIGN_AGENT',
  SEND_WHATSAPP = 'SEND_WHATSAPP',
  SEND_EMAIL = 'SEND_EMAIL',
  CREATE_TASK = 'CREATE_TASK',
  UPDATE_STATUS = 'UPDATE_STATUS',
  SEND_VOICE_CALL = 'SEND_VOICE_CALL',
  UPDATE_FIELD = 'UPDATE_FIELD',
}

// Supported condition operators
export enum ConditionOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  CONTAINS = 'contains',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  IN = 'in',
  NOT_IN = 'not_in',
}

interface WorkflowCondition {
  field: string;
  operator: ConditionOperator;
  value: any;
}

interface WorkflowActionConfig {
  type: WorkflowAction;
  params: Record<string, any>;
}

interface TriggerEvent {
  trigger: WorkflowTrigger;
  data: Record<string, any>;
}

/**
 * Emit a workflow trigger event
 */
export const emitWorkflowTrigger = (trigger: WorkflowTrigger, data: Record<string, any>) => {
  workflowEmitter.emit('workflow-trigger', { trigger, data });
};

/**
 * Evaluate a single condition
 */
const evaluateCondition = (condition: WorkflowCondition, data: Record<string, any>): boolean => {
  const fieldValue = getNestedValue(data, condition.field);

  switch (condition.operator) {
    case ConditionOperator.EQUALS:
      return fieldValue == condition.value;

    case ConditionOperator.NOT_EQUALS:
      return fieldValue != condition.value;

    case ConditionOperator.CONTAINS:
      return String(fieldValue || '').toLowerCase().includes(String(condition.value).toLowerCase());

    case ConditionOperator.GREATER_THAN:
      return Number(fieldValue) > Number(condition.value);

    case ConditionOperator.LESS_THAN:
      return Number(fieldValue) < Number(condition.value);

    case ConditionOperator.IN:
      return Array.isArray(condition.value) && condition.value.includes(fieldValue);

    case ConditionOperator.NOT_IN:
      return Array.isArray(condition.value) && !condition.value.includes(fieldValue);

    default:
      return false;
  }
};

/**
 * Get nested object value by dot notation
 */
const getNestedValue = (obj: any, path: string): any => {
  return path.split('.').reduce((current, key) => current?.[key], obj);
};

/**
 * Evaluate all conditions (AND logic)
 */
const evaluateConditions = (conditions: WorkflowCondition[], data: Record<string, any>): boolean => {
  if (!conditions || conditions.length === 0) return true; // No conditions = always match
  return conditions.every(condition => evaluateCondition(condition, data));
};

/**
 * Execute a single action
 */
const executeAction = async (action: WorkflowActionConfig, triggerData: Record<string, any>): Promise<{ status: string; result?: any; error?: string }> => {
  try {
    switch (action.type) {
      case WorkflowAction.ASSIGN_AGENT:
        await prisma.contact.update({
          where: { phone_number: triggerData.phone_number },
          data: { assigned_to: action.params.agent_id },
        });
        return { status: 'SUCCESS', result: { assigned_to: action.params.agent_id } };

      case WorkflowAction.UPDATE_STATUS:
        await prisma.contact.update({
          where: { phone_number: triggerData.phone_number },
          data: { lead_status: action.params.status },
        });
        return { status: 'SUCCESS', result: { status: action.params.status } };

      case WorkflowAction.UPDATE_FIELD:
        const updateData: any = {};
        updateData[action.params.field] = action.params.value;
        await prisma.contact.update({
          where: { phone_number: triggerData.phone_number },
          data: updateData,
        });
        return { status: 'SUCCESS', result: updateData };

      case WorkflowAction.CREATE_TASK:
        // Create a task/followup
        await prisma.taskFollowup.create({
          data: {
            tenant_id: triggerData.tenant_id || 'default',
            phone_number: triggerData.phone_number,
            type: 'task',
            priority: action.params.priority || 'medium',
            notes: action.params.notes || 'Automated task',
            due_date: action.params.due_date ? new Date(action.params.due_date) : new Date(Date.now() + 24 * 60 * 60 * 1000),
            status: 'pending',
          },
        });
        return { status: 'SUCCESS', result: { task_created: true } };

      case WorkflowAction.SEND_WHATSAPP:
        // Queue WhatsApp message (use existing NotificationAgent logic)
        await prisma.whatsAppMessage.create({
          data: {
            tenant_id: triggerData.tenant_id || 'default',
            phone_number: triggerData.phone_number,
            direction: 'outbound',
            message: action.params.message || action.params.template || 'Automated message',
            status: 'queued',
          },
        });
        return { status: 'SUCCESS', result: { message_queued: true } };

      case WorkflowAction.SEND_EMAIL:
        // Queue email (use existing Email system)
        await prisma.email.create({
          data: {
            tenant_id: triggerData.tenant_id || 'default',
            phone_number: triggerData.phone_number,
            to: triggerData.email || action.params.to,
            subject: action.params.subject || 'Automated Email',
            body: action.params.body || '',
            status: 'queued',
            direction: 'outbound',
          },
        });
        return { status: 'SUCCESS', result: { email_queued: true } };

      default:
        return { status: 'SKIPPED', error: `Unknown action type: ${action.type}` };
    }
  } catch (error: any) {
    console.error(`Workflow action execution error:`, error);
    return { status: 'FAILED', error: error.message };
  }
};

/**
 * Execute a workflow
 */
const executeWorkflow = async (workflow: any, triggerData: Record<string, any>) => {
  const startTime = Date.now();
  const actionsLog: any[] = [];

  try {
    // Check conditions
    const conditionsMatch = evaluateConditions(workflow.conditions as WorkflowCondition[], triggerData);

    if (!conditionsMatch) {
      await prisma.workflowExecution.create({
        data: {
          workflow_id: workflow.id,
          trigger_data: triggerData,
          status: 'SKIPPED',
          error_message: 'Conditions not met',
          actions_log: [],
          duration_ms: Date.now() - startTime,
        },
      });
      return;
    }

    // Execute actions in sequence
    const actions = workflow.actions as WorkflowActionConfig[];
    for (const action of actions) {
      const result = await executeAction(action, triggerData);
      actionsLog.push({
        type: action.type,
        params: action.params,
        ...result,
      });

      // Stop execution if action failed and is critical
      if (result.status === 'FAILED' && action.params.critical) {
        break;
      }
    }

    // Log execution
    await prisma.workflowExecution.create({
      data: {
        workflow_id: workflow.id,
        trigger_data: triggerData,
        status: 'SUCCESS',
        actions_log: actionsLog,
        duration_ms: Date.now() - startTime,
      },
    });

    console.log(`✅ Workflow executed: ${workflow.name} (${actionsLog.length} actions)`);
  } catch (error: any) {
    console.error(`❌ Workflow execution failed:`, error);
    await prisma.workflowExecution.create({
      data: {
        workflow_id: workflow.id,
        trigger_data: triggerData,
        status: 'FAILED',
        error_message: error.message,
        actions_log: actionsLog,
        duration_ms: Date.now() - startTime,
      },
    });
  }
};

/**
 * Handle workflow trigger events
 */
workflowEmitter.on('workflow-trigger', async (event: TriggerEvent) => {
  try {
    // Find matching workflows
    const workflows = await prisma.workflow.findMany({
      where: {
        trigger: event.trigger,
        enabled: true,
      },
      orderBy: [
        { priority: 'desc' },
        { created_at: 'asc' },
      ],
    });

    if (workflows.length === 0) {
      console.log(`No workflows found for trigger: ${event.trigger}`);
      return;
    }

    console.log(`🔔 Workflow trigger: ${event.trigger} (${workflows.length} workflows)`);

    // Execute workflows with delay support
    for (const workflow of workflows) {
      if (workflow.delay_minutes > 0) {
        // Schedule for later execution
        setTimeout(() => {
          executeWorkflow(workflow, event.data);
        }, workflow.delay_minutes * 60 * 1000);
        console.log(`⏰ Workflow scheduled: ${workflow.name} (delay: ${workflow.delay_minutes}m)`);
      } else {
        // Execute immediately
        executeWorkflow(workflow, event.data);
      }
    }
  } catch (error) {
    console.error('Workflow trigger handling error:', error);
  }
});

/**
 * Initialize workflow engine
 */
export const initializeWorkflowEngine = () => {
  console.log('🚀 Workflow Automation Engine initialized');

  // Set up event listeners for common triggers
  // These will be called from other parts of the application
};

/**
 * Helper functions to be called from application code
 */
export const triggerLeadCreated = (leadData: any) => {
  emitWorkflowTrigger(WorkflowTrigger.LEAD_CREATED, leadData);
};

export const triggerStatusChanged = (contactData: any, oldStatus: string, newStatus: string) => {
  emitWorkflowTrigger(WorkflowTrigger.STATUS_CHANGED, {
    ...contactData,
    old_status: oldStatus,
    new_status: newStatus,
  });
};

export const triggerPropertyAdded = (propertyData: any) => {
  emitWorkflowTrigger(WorkflowTrigger.PROPERTY_ADDED, propertyData);
};

export const triggerAppointmentScheduled = (appointmentData: any) => {
  emitWorkflowTrigger(WorkflowTrigger.APPOINTMENT_SCHEDULED, appointmentData);
};

export const triggerAppointmentCompleted = (appointmentData: any) => {
  emitWorkflowTrigger(WorkflowTrigger.APPOINTMENT_COMPLETED, appointmentData);
};

export const triggerInteractionReceived = (interactionData: any) => {
  emitWorkflowTrigger(WorkflowTrigger.INTERACTION_RECEIVED, interactionData);
};

export const triggerLifecycleStageChanged = (contactData: any, oldStage: string, newStage: string) => {
  emitWorkflowTrigger(WorkflowTrigger.LIFECYCLE_STAGE_CHANGED, {
    ...contactData,
    old_stage: oldStage,
    new_stage: newStage,
  });
};

// Export for use in other services
export default {
  initializeWorkflowEngine,
  emitWorkflowTrigger,
  triggerLeadCreated,
  triggerStatusChanged,
  triggerPropertyAdded,
  triggerAppointmentScheduled,
  triggerAppointmentCompleted,
  triggerInteractionReceived,
  triggerLifecycleStageChanged,
};
