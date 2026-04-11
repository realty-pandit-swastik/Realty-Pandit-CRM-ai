/**
 * Workflow Task Service
 *
 * Guided Lead-to-Deal Workflow Engine.
 * 5-stage task chain: Qualify → Share Properties → Schedule Visit → Visit Feedback → Negotiate Deal
 * Stages 2-4 can loop when clients want more options or additional visits.
 *
 * Each stage completion:
 *  1. Marks current task as DONE
 *  2. Updates Contact lifecycle_stage
 *  3. Syncs with Deal Pipeline (Transaction status)
 *  4. Auto-creates the next stage's task
 *  5. Fires AI automation (WhatsApp follow-ups, reminders)
 *  6. Logs to Interaction audit trail
 */

import prisma from '../db';
import logger from '../utils/logger';
import { notify, NotifyRecipient } from './notify';
import { createDeal, CreateDealInput, matchPropertyToDeal } from './deal_service';
import { transitionTransaction } from './transaction_state_machine';
import { MatchingEngine } from './matching_engine';
import { ensurePartnerAgent } from './partner_auto_create';
import { TransactionStatus } from '@prisma/client';

// ── Constants ──────────────────────────────────────────────────────

export const WORKFLOW_TASK_TYPES = {
    QUALIFY_LEAD: 'QUALIFY_LEAD',
    SHARE_PROPERTIES: 'SHARE_PROPERTIES',
    SCHEDULE_VISIT: 'SCHEDULE_VISIT',
    VISIT_FEEDBACK: 'VISIT_FEEDBACK',
    NEGOTIATE_DEAL: 'NEGOTIATE_DEAL',
} as const;

export type WorkflowTaskType = typeof WORKFLOW_TASK_TYPES[keyof typeof WORKFLOW_TASK_TYPES];

const STAGE_MAP: Record<WorkflowTaskType, number> = {
    QUALIFY_LEAD: 1,
    SHARE_PROPERTIES: 2,
    SCHEDULE_VISIT: 3,
    VISIT_FEEDBACK: 4,
    NEGOTIATE_DEAL: 5,
};

const STAGE_LABELS: Record<WorkflowTaskType, string> = {
    QUALIFY_LEAD: 'Qualify Lead',
    SHARE_PROPERTIES: 'Share Properties',
    SCHEDULE_VISIT: 'Schedule Visit',
    VISIT_FEEDBACK: 'Visit Feedback',
    NEGOTIATE_DEAL: 'Negotiate Deal',
};

const STAGE_DUE_HOURS: Record<WorkflowTaskType, number> = {
    QUALIFY_LEAD: 1,
    SHARE_PROPERTIES: 24,
    SCHEDULE_VISIT: 48,
    VISIT_FEEDBACK: 4,
    NEGOTIATE_DEAL: 72,
};

const MAX_SNOOZE = 3;

// ── Internal Helper: Create any workflow task ─────────────────────

async function createWorkflowTask(params: {
    tenantId: string;
    contactPhone: string;
    assignedTo: string;
    taskType: WorkflowTaskType;
    round?: number;
    parentTaskId?: string;
    dealId?: string;
    metadata?: Record<string, any>;
}): Promise<any> {
    const {
        tenantId, contactPhone, assignedTo, taskType,
        round = 1, parentTaskId, dealId, metadata,
    } = params;

    const contact = await prisma.contact.findUnique({
        where: { phone_number: contactPhone },
        select: { name: true, phone_number: true, source: true },
    });

    const dueDate = new Date(Date.now() + STAGE_DUE_HOURS[taskType] * 60 * 60 * 1000);
    const label = STAGE_LABELS[taskType];
    const contactName = contact?.name || contactPhone;
    const roundSuffix = round > 1 ? ` (Round ${round})` : '';

    const task = await prisma.task.create({
        data: {
            title: `${label}: ${contactName}${roundSuffix}`,
            description: `Auto-created workflow task. Stage ${STAGE_MAP[taskType]} of 5.`,
            assigned_to: assignedTo,
            due_date: dueDate,
            priority: taskType === 'QUALIFY_LEAD' ? 'HIGH' : 'MEDIUM',
            status: 'TODO',
            contact_phone: contactPhone,
            tags: ['workflow', taskType.toLowerCase(), `round:${round}`],
            task_type: taskType,
            workflow_stage: STAGE_MAP[taskType],
            workflow_round: round,
            parent_task_id: parentTaskId,
            deal_id: dealId,
            stage_metadata: metadata || {},
        },
    });

    // Log interaction
    await prisma.interaction.create({
        data: {
            tenant_id: tenantId,
            phone_number: contactPhone,
            channel: 'system',
            direction: 'outbound',
            event_type: 'workflow_task_created',
            content: `Workflow task created: ${label}${roundSuffix} — assigned to agent ${assignedTo}`,
            metadata: { task_id: task.id, task_type: taskType, stage: STAGE_MAP[taskType], round },
        },
    });

    // Notify assigned agent
    const agent = await prisma.agent.findUnique({
        where: { id: assignedTo },
        select: { id: true, name: true, phone: true, email: true },
    });
    if (agent) {
        notify('workflow_task_created', [
            { id: agent.id, type: 'agent', phone: agent.phone ?? undefined, email: agent.email, name: agent.name },
        ], {
            task_id: task.id,
            stage_label: label,
            contact_name: contactName,
            contact_phone: contactPhone,
            due_date: dueDate.toISOString(),
        });
    }

    logger.info(`[WorkflowTask] Created ${taskType} task ${task.id} for ${contactPhone} (round ${round})`);
    return task;
}

// ── Helper: Get tenant ID from agent ──────────────────────────────

async function getTenantId(agentId: string): Promise<string> {
    const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { tenant_id: true } });
    if (!agent) throw new Error('Agent not found');
    return agent.tenant_id;
}

// ── Helper: Queue AI follow-up WhatsApp ───────────────────────────

async function queueAIFollowup(contactPhone: string, dealId: string | null, stage: string, templateName: string, delayMs: number) {
    try {
        const { scheduledJobsQueue } = await import('../queues/index');
        await scheduledJobsQueue.add('workflow-ai-followup', {
            contact_phone: contactPhone,
            deal_id: dealId,
            stage,
            template_name: templateName,
        }, {
            delay: delayMs,
            attempts: 2,
            removeOnComplete: true,
            removeOnFail: { count: 100 },
        });
    } catch (err) {
        logger.warn(`[WorkflowTask] Failed to queue AI followup: ${(err as Error).message}`);
    }
}

// ═══════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════

/**
 * Create the first "Qualify Lead" task.
 * Called by all external lead ingestion paths (99acres, webhooks, etc.)
 */
export async function createQualifyTask(params: {
    tenantId: string;
    contactPhone: string;
    assignedTo: string;
    source: string;
}): Promise<any> {
    const { tenantId, contactPhone, assignedTo, source } = params;

    // Check if a workflow task already exists for this lead
    const existing = await prisma.task.findFirst({
        where: {
            contact_phone: contactPhone,
            task_type: { not: 'GENERAL' },
            status: { not: 'DONE' },
        },
    });
    if (existing) {
        logger.debug(`[WorkflowTask] Skipping — active workflow task ${existing.id} exists for ${contactPhone}`);
        return existing;
    }

    // Set contact as UNVERIFIED
    await prisma.contact.update({
        where: { phone_number: contactPhone },
        data: { verification_status: 'UNVERIFIED' },
    });

    return createWorkflowTask({
        tenantId,
        contactPhone,
        assignedTo,
        taskType: 'QUALIFY_LEAD',
        metadata: { source },
    });
}

/**
 * Complete Stage 1: Qualify Lead
 */
export async function completeQualifyTask(taskId: string, params: {
    agentId: string;
    outcome: 'VERIFIED' | 'REJECTED' | 'PARTNER_AGENT';
    contactData?: {
        name?: string;
        budget_min?: number;
        budget_max?: number;
        preferred_location?: string;
        preferred_lat?: number;
        preferred_lng?: number;
        intent?: string;
        demand_bhk?: string;
        contact_type?: string;
    };
    rejectionReason?: string;
    rejectionRemarks?: string;
    partnerData?: { name?: string; partner_category?: string };
}): Promise<{ task: any; nextTask?: any; deal?: any }> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.task_type !== 'QUALIFY_LEAD') throw new Error('Invalid task');
    if (task.status === 'DONE') throw new Error('Task already completed');

    const tenantId = await getTenantId(params.agentId);
    const contactPhone = task.contact_phone!;

    // Mark task done
    await prisma.task.update({
        where: { id: taskId },
        data: { status: 'DONE', completed_at: new Date(), completed_by: params.agentId },
    });

    let nextTask: any = undefined;
    let deal: any = undefined;

    if (params.outcome === 'VERIFIED') {
        // Update contact with verified data
        const contactUpdate: any = {
            verification_status: 'VERIFIED',
            verified_by: params.agentId,
            verified_at: new Date(),
            lifecycle_stage: 'QUALIFIED',
        };
        if (params.contactData) {
            const cd = params.contactData;
            if (cd.name) contactUpdate.name = cd.name;
            if (cd.budget_min !== undefined) contactUpdate.budget_min = cd.budget_min;
            if (cd.budget_max !== undefined) contactUpdate.budget_max = cd.budget_max;
            if (cd.preferred_location) contactUpdate.preferred_location = cd.preferred_location;
            if (cd.preferred_lat !== undefined) contactUpdate.preferred_lat = cd.preferred_lat;
            if (cd.preferred_lng !== undefined) contactUpdate.preferred_lng = cd.preferred_lng;
            if (cd.intent) contactUpdate.intent = cd.intent;
            if (cd.demand_bhk) contactUpdate.demand_bhk = cd.demand_bhk;
            if (cd.contact_type) contactUpdate.contact_type = cd.contact_type;
        }
        await prisma.contact.update({ where: { phone_number: contactPhone }, data: contactUpdate });

        // Create deal
        const contact = await prisma.contact.findUnique({ where: { phone_number: contactPhone } });
        const dealInput: CreateDealInput = {
            tenant_id: tenantId,
            demand_contact_id: contactPhone,
            demand_handler_type: 'DIRECT',
            type: (contact?.intent === 'rent' ? 'RENT' : 'SALE') as any,
            source: 'admin',
            demand_intent: contact?.intent || undefined,
            demand_location: contact?.preferred_location || undefined,
            demand_budget_min: contact?.budget_min ? Number(contact.budget_min) : undefined,
            demand_budget_max: contact?.budget_max ? Number(contact.budget_max) : undefined,
            demand_bedrooms: contact?.demand_bhk || undefined,
        };
        const dealResult = await createDeal(dealInput, params.agentId, 'admin');
        deal = dealResult.deal || dealResult;
        const dealId = deal.id;

        // Run matching engine
        const engine = new MatchingEngine();
        const matches = await engine.findMatches({
            intent: contact?.intent as any,
            budget_min: contact?.budget_min ? Number(contact.budget_min) : undefined,
            budget_max: contact?.budget_max ? Number(contact.budget_max) : undefined,
            preferred_location: contact?.preferred_location || undefined,
            preferred_lat: contact?.preferred_lat || undefined,
            preferred_lng: contact?.preferred_lng || undefined,
            bhk: contact?.demand_bhk ? parseInt(contact.demand_bhk) : undefined,
        });

        // Create Stage 2 task
        nextTask = await createWorkflowTask({
            tenantId,
            contactPhone,
            assignedTo: task.assigned_to,
            taskType: 'SHARE_PROPERTIES',
            parentTaskId: taskId,
            dealId,
            metadata: { matches: matches.slice(0, 10).map((m: any) => ({ id: m.id, type: m.type, location: m.location, price: m.price, match_score: m.match_score })) },
        });

        // Update contact lifecycle
        await prisma.contact.update({ where: { phone_number: contactPhone }, data: { lifecycle_stage: 'MATCHED' } });

        // AI follow-up to client
        queueAIFollowup(contactPhone, dealId, 'QUALIFY_COMPLETE', 'rp_tx_followup_new', 30 * 60 * 1000);

    } else if (params.outcome === 'REJECTED') {
        await prisma.contact.update({
            where: { phone_number: contactPhone },
            data: {
                verification_status: 'REJECTED',
                verification_reason: params.rejectionReason,
                verification_remarks: params.rejectionRemarks,
                verified_by: params.agentId,
                verified_at: new Date(),
                lead_status: 'lost',
            },
        });
        notify('workflow_lead_lost', [], { contact_name: contactPhone, reason: params.rejectionReason });

    } else if (params.outcome === 'PARTNER_AGENT') {
        const contact = await prisma.contact.findUnique({ where: { phone_number: contactPhone } });
        await ensurePartnerAgent(
            contactPhone,
            params.partnerData?.name || contact?.name || 'Unknown',
            tenantId,
            params.agentId,
        );
        await prisma.contact.update({
            where: { phone_number: contactPhone },
            data: {
                verification_status: 'CONVERTED_PARTNER',
                contact_type: 'PARTNER_AGENT',
                verified_by: params.agentId,
                verified_at: new Date(),
            },
        });
    }

    // Log interaction
    await prisma.interaction.create({
        data: {
            tenant_id: tenantId,
            phone_number: contactPhone,
            channel: 'admin',
            direction: 'outbound',
            event_type: 'workflow_stage_completed',
            content: `Stage 1 (Qualify Lead) completed — Outcome: ${params.outcome}`,
            metadata: { task_id: taskId, outcome: params.outcome, stage: 1 },
        },
    });

    return { task, nextTask, deal };
}

/**
 * Complete Stage 2: Share Properties
 */
export async function completeShareTask(taskId: string, params: {
    agentId: string;
    shortlistedPropertyIds: string[];
}): Promise<{ task: any; nextTask?: any }> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.task_type !== 'SHARE_PROPERTIES') throw new Error('Invalid task');
    if (task.status === 'DONE') throw new Error('Task already completed');
    if (!params.shortlistedPropertyIds.length) throw new Error('At least one property must be shortlisted');

    const tenantId = await getTenantId(params.agentId);
    const contactPhone = task.contact_phone!;
    const dealId = task.deal_id;

    // Update shortlist entries to SHORTLISTED
    for (const invId of params.shortlistedPropertyIds) {
        await prisma.leadPropertyShortlist.upsert({
            where: {
                contact_phone_inventory_id_deal_id: {
                    contact_phone: contactPhone,
                    inventory_id: invId,
                    deal_id: dealId || '',
                },
            },
            update: { status: 'SHORTLISTED', shortlisted_at: new Date() },
            create: {
                tenant_id: tenantId,
                contact_phone: contactPhone,
                inventory_id: invId,
                deal_id: dealId,
                status: 'SHORTLISTED',
                shortlisted_at: new Date(),
                workflow_round: task.workflow_round,
            },
        });
    }

    // Mark task done
    await prisma.task.update({
        where: { id: taskId },
        data: { status: 'DONE', completed_at: new Date(), completed_by: params.agentId },
    });

    // Create Stage 3: Schedule Visit
    const nextTask = await createWorkflowTask({
        tenantId,
        contactPhone,
        assignedTo: task.assigned_to,
        taskType: 'SCHEDULE_VISIT',
        round: task.workflow_round,
        parentTaskId: taskId,
        dealId: dealId || undefined,
        metadata: { shortlisted_property_ids: params.shortlistedPropertyIds },
    });

    // Log interaction
    await prisma.interaction.create({
        data: {
            tenant_id: tenantId,
            phone_number: contactPhone,
            channel: 'admin',
            direction: 'outbound',
            event_type: 'workflow_stage_completed',
            content: `Stage 2 (Share Properties) completed — ${params.shortlistedPropertyIds.length} properties shortlisted (Round ${task.workflow_round})`,
            metadata: { task_id: taskId, stage: 2, round: task.workflow_round, shortlisted: params.shortlistedPropertyIds },
        },
    });

    // AI follow-up
    if (dealId) {
        queueAIFollowup(contactPhone, dealId, 'SHARE_COMPLETE', 'rp_tx_match_buyer', 0);
    }

    return { task, nextTask };
}

/**
 * Complete Stage 3: Schedule Visit
 */
export async function completeScheduleTask(taskId: string, params: {
    agentId: string;
    appointmentIds: string[];
    propertyIds: string[];
}): Promise<{ task: any; nextTask?: any }> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.task_type !== 'SCHEDULE_VISIT') throw new Error('Invalid task');
    if (task.status === 'DONE') throw new Error('Task already completed');

    const tenantId = await getTenantId(params.agentId);
    const contactPhone = task.contact_phone!;
    const dealId = task.deal_id;

    // Update shortlist to VISIT_SCHEDULED
    for (const invId of params.propertyIds) {
        await prisma.leadPropertyShortlist.updateMany({
            where: { contact_phone: contactPhone, inventory_id: invId, deal_id: dealId },
            data: { status: 'VISIT_SCHEDULED' },
        });
    }

    // Transition deal to VISIT_SCHEDULED
    if (dealId) {
        try {
            await transitionTransaction(dealId, TransactionStatus.VISIT_SCHEDULED, params.agentId, 'admin', {
                appointment_ids: params.appointmentIds,
            });
        } catch (err) {
            logger.warn(`[WorkflowTask] Deal transition to VISIT_SCHEDULED failed: ${(err as Error).message}`);
        }
    }

    // Mark task done
    await prisma.task.update({
        where: { id: taskId },
        data: { status: 'DONE', completed_at: new Date(), completed_by: params.agentId },
    });

    // Create Stage 4: Visit Feedback
    const nextTask = await createWorkflowTask({
        tenantId,
        contactPhone,
        assignedTo: task.assigned_to,
        taskType: 'VISIT_FEEDBACK',
        round: task.workflow_round,
        parentTaskId: taskId,
        dealId: dealId || undefined,
        metadata: { appointment_ids: params.appointmentIds, property_ids: params.propertyIds },
    });

    // Log interaction
    await prisma.interaction.create({
        data: {
            tenant_id: tenantId,
            phone_number: contactPhone,
            channel: 'admin',
            direction: 'outbound',
            event_type: 'workflow_stage_completed',
            content: `Stage 3 (Schedule Visit) completed — ${params.appointmentIds.length} appointments created`,
            metadata: { task_id: taskId, stage: 3, round: task.workflow_round, appointments: params.appointmentIds },
        },
    });

    // AI sends confirmation to client
    if (dealId) {
        queueAIFollowup(contactPhone, dealId, 'VISIT_SCHEDULED', 'rp_appointment_confirm', 0);
    }

    return { task, nextTask };
}

/**
 * Complete Stage 4: Visit Feedback — THE LOOP DECISION POINT
 */
export async function completeVisitFeedbackTask(taskId: string, params: {
    agentId: string;
    feedback: Array<{
        inventoryId: string;
        result: 'INTERESTED' | 'NOT_INTERESTED' | 'REVISIT';
        reason?: string;
    }>;
    nextAction: 'MORE_OPTIONS' | 'ANOTHER_VISIT' | 'SELECT_PROPERTY' | 'LOST';
    selectedPropertyId?: string;
    lostReason?: string;
}): Promise<{ task: any; nextTask?: any }> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.task_type !== 'VISIT_FEEDBACK') throw new Error('Invalid task');
    if (task.status === 'DONE') throw new Error('Task already completed');

    const tenantId = await getTenantId(params.agentId);
    const contactPhone = task.contact_phone!;
    const dealId = task.deal_id;

    // Update shortlist per property feedback
    for (const fb of params.feedback) {
        const statusMap: Record<string, string> = {
            INTERESTED: 'INTERESTED',
            NOT_INTERESTED: 'REJECTED',
            REVISIT: 'REVISIT',
        };
        await prisma.leadPropertyShortlist.updateMany({
            where: { contact_phone: contactPhone, inventory_id: fb.inventoryId, deal_id: dealId },
            data: {
                status: statusMap[fb.result],
                visited_at: new Date(),
                feedback: fb.result,
                rejection_reason: fb.result === 'NOT_INTERESTED' ? fb.reason : undefined,
            },
        });
    }

    // Mark task done
    await prisma.task.update({
        where: { id: taskId },
        data: { status: 'DONE', completed_at: new Date(), completed_by: params.agentId },
    });

    let nextTask: any = undefined;

    if (params.nextAction === 'MORE_OPTIONS') {
        // LOOP BACK to Stage 2 with incremented round
        if (dealId) {
            try {
                await transitionTransaction(dealId, TransactionStatus.MATCHED, params.agentId, 'admin', { reason: 'Client wants more options' });
            } catch { /* may already be at MATCHED or VISITED, ignore */ }
        }

        // Run new matching
        const contact = await prisma.contact.findUnique({ where: { phone_number: contactPhone } });
        const engine = new MatchingEngine();
        const matches = await engine.findMatches({
            intent: contact?.intent as any,
            budget_min: contact?.budget_min ? Number(contact.budget_min) : undefined,
            budget_max: contact?.budget_max ? Number(contact.budget_max) : undefined,
            preferred_location: contact?.preferred_location || undefined,
            preferred_lat: contact?.preferred_lat || undefined,
            preferred_lng: contact?.preferred_lng || undefined,
            bhk: contact?.demand_bhk ? parseInt(contact.demand_bhk) : undefined,
        });

        nextTask = await createWorkflowTask({
            tenantId,
            contactPhone,
            assignedTo: task.assigned_to,
            taskType: 'SHARE_PROPERTIES',
            round: task.workflow_round + 1,
            parentTaskId: taskId,
            dealId: dealId || undefined,
            metadata: { matches: matches.slice(0, 10).map((m: any) => ({ id: m.id, type: m.type, location: m.location, price: m.price, match_score: m.match_score })) },
        });

        notify('workflow_loop_back', [], {
            contact_name: contactPhone,
            loop_type: 'SHARE',
            round: task.workflow_round + 1,
            task_id: nextTask.id,
        });

    } else if (params.nextAction === 'ANOTHER_VISIT') {
        // LOOP BACK to Stage 3
        if (dealId) {
            try {
                await transitionTransaction(dealId, TransactionStatus.VISIT_SCHEDULED, params.agentId, 'admin', { reason: 'Client wants another visit' });
            } catch { /* ignore if already there */ }
        }

        // Get INTERESTED + REVISIT properties for next visit
        const shortlisted = await prisma.leadPropertyShortlist.findMany({
            where: { contact_phone: contactPhone, deal_id: dealId, status: { in: ['INTERESTED', 'REVISIT', 'SHORTLISTED'] } },
            select: { inventory_id: true },
        });

        nextTask = await createWorkflowTask({
            tenantId,
            contactPhone,
            assignedTo: task.assigned_to,
            taskType: 'SCHEDULE_VISIT',
            round: task.workflow_round,
            parentTaskId: taskId,
            dealId: dealId || undefined,
            metadata: { shortlisted_property_ids: shortlisted.map(s => s.inventory_id) },
        });

        notify('workflow_loop_back', [], {
            contact_name: contactPhone,
            loop_type: 'VISIT',
            round: task.workflow_round,
            task_id: nextTask.id,
        });

    } else if (params.nextAction === 'SELECT_PROPERTY') {
        if (!params.selectedPropertyId) throw new Error('selectedPropertyId is required');

        // Mark selected property
        await prisma.leadPropertyShortlist.updateMany({
            where: { contact_phone: contactPhone, inventory_id: params.selectedPropertyId, deal_id: dealId },
            data: { status: 'SELECTED', selected_at: new Date() },
        });

        // Match property to deal + transition to NEGOTIATION
        if (dealId) {
            try {
                // Get property owner as supply contact
                const inv = await prisma.inventory.findUnique({
                    where: { id: params.selectedPropertyId },
                    select: { owner_phone: true },
                });
                await matchPropertyToDeal(dealId, params.selectedPropertyId, inv?.owner_phone || null, 'TEAM_MEMBER', params.agentId, params.agentId);
                await transitionTransaction(dealId, TransactionStatus.NEGOTIATION, params.agentId, 'admin', {
                    selected_property: params.selectedPropertyId,
                });
            } catch (err) {
                logger.warn(`[WorkflowTask] Deal transition to NEGOTIATION failed: ${(err as Error).message}`);
            }
        }

        await prisma.contact.update({ where: { phone_number: contactPhone }, data: { lifecycle_stage: 'NEGOTIATION' } });

        nextTask = await createWorkflowTask({
            tenantId,
            contactPhone,
            assignedTo: task.assigned_to,
            taskType: 'NEGOTIATE_DEAL',
            round: 1,
            parentTaskId: taskId,
            dealId: dealId || undefined,
            metadata: { selected_property_id: params.selectedPropertyId },
        });

        notify('workflow_property_selected', [], {
            contact_name: contactPhone,
            property_info: params.selectedPropertyId,
        });

        // AI follow-up for negotiation
        if (dealId) {
            queueAIFollowup(contactPhone, dealId, 'NEGOTIATION', 'rp_tx_followup_negotiation', 60 * 60 * 1000);
            // Silence check after 48h
            queueAIFollowup(contactPhone, dealId, 'SILENCE_CHECK', 'rp_tx_followup_negotiation', 48 * 60 * 60 * 1000);
        }

    } else if (params.nextAction === 'LOST') {
        // Close the deal
        if (dealId) {
            try {
                await transitionTransaction(dealId, TransactionStatus.CLOSED_LOST, params.agentId, 'admin', {
                    reason: params.lostReason || 'Client lost interest',
                });
            } catch (err) {
                logger.warn(`[WorkflowTask] Deal CLOSED_LOST transition failed: ${(err as Error).message}`);
            }
        }
        await prisma.contact.update({
            where: { phone_number: contactPhone },
            data: { lifecycle_stage: 'CLOSED_LOST', lead_status: 'lost' },
        });
        notify('workflow_lead_lost', [], { contact_name: contactPhone, reason: params.lostReason });
    }

    // Log interaction
    await prisma.interaction.create({
        data: {
            tenant_id: tenantId,
            phone_number: contactPhone,
            channel: 'admin',
            direction: 'outbound',
            event_type: 'workflow_stage_completed',
            content: `Stage 4 (Visit Feedback) completed — Action: ${params.nextAction}, Round ${task.workflow_round}`,
            metadata: {
                task_id: taskId, stage: 4, round: task.workflow_round,
                next_action: params.nextAction, feedback: params.feedback,
                selected_property: params.selectedPropertyId,
            },
        },
    });

    return { task, nextTask };
}

/**
 * Complete Stage 5: Negotiate Deal — Terminal stage
 */
export async function completeNegotiateTask(taskId: string, params: {
    agentId: string;
    outcome: 'CLOSED_WON' | 'CLOSED_LOST';
    finalPrice?: number;
    closeReason?: string;
    commissionAmount?: number;
}): Promise<{ task: any; deal?: any }> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.task_type !== 'NEGOTIATE_DEAL') throw new Error('Invalid task');
    if (task.status === 'DONE') throw new Error('Task already completed');

    const tenantId = await getTenantId(params.agentId);
    const contactPhone = task.contact_phone!;
    const dealId = task.deal_id;

    // Mark task done
    await prisma.task.update({
        where: { id: taskId },
        data: { status: 'DONE', completed_at: new Date(), completed_by: params.agentId },
    });

    // Transition deal
    if (dealId) {
        const newStatus = params.outcome === 'CLOSED_WON' ? TransactionStatus.CLOSED_WON : TransactionStatus.CLOSED_LOST;
        try {
            await transitionTransaction(dealId, newStatus, params.agentId, 'admin', {
                final_price: params.finalPrice,
                close_reason: params.closeReason,
            });
            // Update deal with final price
            if (params.outcome === 'CLOSED_WON' && params.finalPrice) {
                await prisma.transaction.update({
                    where: { id: dealId },
                    data: {
                        final_price: params.finalPrice,
                        commission_amount: params.commissionAmount,
                    },
                });
            }
        } catch (err) {
            logger.warn(`[WorkflowTask] Deal close transition failed: ${(err as Error).message}`);
        }
    }

    // Update contact
    const lifecycleStage = params.outcome === 'CLOSED_WON' ? 'CLOSED_WON' : 'CLOSED_LOST';
    const leadStatus = params.outcome === 'CLOSED_WON' ? 'closed' : 'lost';
    await prisma.contact.update({
        where: { phone_number: contactPhone },
        data: { lifecycle_stage: lifecycleStage, lead_status: leadStatus },
    });

    // Log interaction
    await prisma.interaction.create({
        data: {
            tenant_id: tenantId,
            phone_number: contactPhone,
            channel: 'admin',
            direction: 'outbound',
            event_type: 'workflow_stage_completed',
            content: `Stage 5 (Negotiate Deal) completed — ${params.outcome}${params.finalPrice ? ` at ₹${params.finalPrice}` : ''}`,
            metadata: { task_id: taskId, stage: 5, outcome: params.outcome, final_price: params.finalPrice },
        },
    });

    // Notifications
    if (params.outcome === 'CLOSED_WON') {
        const contact = await prisma.contact.findUnique({ where: { phone_number: contactPhone }, select: { name: true } });
        notify('workflow_deal_won', [], {
            contact_name: contact?.name || contactPhone,
            final_price: params.finalPrice,
        });
        if (dealId) queueAIFollowup(contactPhone, dealId, 'DEAL_WON', 'rp_tx_followup_won_v2', 0);
    } else {
        notify('workflow_lead_lost', [], { contact_name: contactPhone, reason: params.closeReason });
        if (dealId) queueAIFollowup(contactPhone, dealId, 'DEAL_LOST', 'rp_tx_followup_lost_v2', 60 * 60 * 1000);
    }

    return { task, deal: dealId ? await prisma.transaction.findUnique({ where: { id: dealId } }) : undefined };
}

/**
 * Snooze a task (max 3 for Stage 1, unlimited for others)
 */
export async function snoozeTask(taskId: string, params: {
    agentId: string;
    reason: string;
    snoozeMinutes?: number;
}): Promise<any> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new Error('Task not found');
    if (task.status === 'DONE') throw new Error('Cannot snooze completed task');

    const isQualifyTask = task.task_type === 'QUALIFY_LEAD';
    if (isQualifyTask && task.snooze_count >= MAX_SNOOZE) {
        throw new Error('Maximum snooze limit reached — task will be escalated');
    }

    const snoozeMs = (params.snoozeMinutes || 60) * 60 * 1000;
    const snoozedUntil = new Date(Date.now() + snoozeMs);

    const updated = await prisma.task.update({
        where: { id: taskId },
        data: {
            snooze_count: { increment: 1 },
            snoozed_until: snoozedUntil,
            due_date: snoozedUntil,
            status: 'TODO',
        },
    });

    // Queue snooze reminder
    try {
        const { scheduledJobsQueue } = await import('../queues/index');
        await scheduledJobsQueue.add('workflow-snooze-reminder', {
            task_id: taskId,
            agent_id: params.agentId,
            contact_phone: task.contact_phone,
        }, {
            delay: snoozeMs,
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: { count: 100 },
        });

        // If this was the 3rd snooze on a qualify task, queue escalation
        if (isQualifyTask && updated.snooze_count >= MAX_SNOOZE) {
            await scheduledJobsQueue.add('workflow-snooze-escalation', {
                task_id: taskId,
                agent_id: params.agentId,
                contact_phone: task.contact_phone,
            }, {
                delay: 0,
                attempts: 1,
                removeOnComplete: true,
                removeOnFail: { count: 100 },
            });
        }
    } catch (err) {
        logger.warn(`[WorkflowTask] Failed to queue snooze jobs: ${(err as Error).message}`);
    }

    logger.info(`[WorkflowTask] Task ${taskId} snoozed (${updated.snooze_count}/${isQualifyTask ? MAX_SNOOZE : '∞'}) until ${snoozedUntil.toISOString()}`);
    return updated;
}

// ═══════════════════════════════════════════════════════════════════
// QUERY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Get agent's workflow task queue — sorted: overdue → due today → upcoming
 */
export async function getWorkflowQueue(agentId: string, role: string): Promise<any[]> {
    const where: any = {
        task_type: { not: 'GENERAL' },
        status: { not: 'DONE' },
        OR: [
            { snoozed_until: null },
            { snoozed_until: { lte: new Date() } },
        ],
    };
    if (role !== 'super_boss' && role !== 'manager') {
        where.assigned_to = agentId;
    }

    return prisma.task.findMany({
        where,
        include: {
            contact: {
                select: {
                    phone_number: true, name: true, email: true, source: true,
                    intent: true, preferred_location: true, budget_min: true, budget_max: true,
                    lead_status: true, lifecycle_stage: true, verification_status: true,
                    demand_bhk: true,
                },
            },
        },
        orderBy: [{ due_date: 'asc' }],
    });
}

/**
 * Get full workflow chain for a lead's deal
 */
export async function getWorkflowChain(contactPhone: string, dealId?: string): Promise<any[]> {
    const where: any = {
        contact_phone: contactPhone,
        task_type: { not: 'GENERAL' },
    };
    if (dealId) where.deal_id = dealId;

    return prisma.task.findMany({
        where,
        orderBy: [{ created_at: 'asc' }],
        include: {
            contact: { select: { name: true, phone_number: true } },
        },
    });
}

/**
 * Get workflow stats (by stage, completion rates)
 */
export async function getWorkflowStats(agentId?: string, tenantId?: string): Promise<any> {
    const baseWhere: any = { task_type: { not: 'GENERAL' } };
    if (agentId) baseWhere.assigned_to = agentId;

    const [total, byType, byStatus, overdue, completedToday] = await Promise.all([
        prisma.task.count({ where: baseWhere }),
        prisma.task.groupBy({ by: ['task_type'], where: baseWhere, _count: true }),
        prisma.task.groupBy({ by: ['status'], where: baseWhere, _count: true }),
        prisma.task.count({ where: { ...baseWhere, status: { not: 'DONE' }, due_date: { lt: new Date() } } }),
        prisma.task.count({
            where: {
                ...baseWhere,
                status: 'DONE',
                completed_at: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            },
        }),
    ]);

    return {
        total,
        by_stage: byType.reduce((acc: any, item: any) => {
            acc[item.task_type] = typeof item._count === 'number' ? item._count : item._count?._all || 0;
            return acc;
        }, {}),
        by_status: byStatus.reduce((acc: any, item: any) => {
            acc[item.status] = typeof item._count === 'number' ? item._count : item._count?._all || 0;
            return acc;
        }, {}),
        overdue,
        completed_today: completedToday,
    };
}

/**
 * Get team workflow pipeline (super boss view)
 */
export async function getTeamWorkflowPipeline(tenantId: string): Promise<any[]> {
    const agents = await prisma.agent.findMany({
        where: { tenant_id: tenantId, status: 'active' },
        select: { id: true, name: true, role: true },
    });

    const pipeline = [];
    for (const agent of agents) {
        const tasks = await prisma.task.groupBy({
            by: ['task_type', 'status'],
            where: { assigned_to: agent.id, task_type: { not: 'GENERAL' } },
            _count: true,
        });

        const overdue = await prisma.task.count({
            where: { assigned_to: agent.id, task_type: { not: 'GENERAL' }, status: { not: 'DONE' }, due_date: { lt: new Date() } },
        });

        const completedToday = await prisma.task.count({
            where: {
                assigned_to: agent.id, task_type: { not: 'GENERAL' }, status: 'DONE',
                completed_at: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            },
        });

        pipeline.push({
            agent_id: agent.id,
            agent_name: agent.name,
            agent_role: agent.role,
            tasks: tasks.map((t: any) => ({ task_type: t.task_type, status: t.status, count: typeof t._count === 'number' ? t._count : t._count?._all || 0 })),
            overdue,
            completed_today: completedToday,
        });
    }

    return pipeline;
}

/**
 * Get property shortlist for a lead
 */
export async function getLeadShortlist(contactPhone: string, dealId?: string): Promise<any[]> {
    const where: any = { contact_phone: contactPhone };
    if (dealId) where.deal_id = dealId;

    return prisma.leadPropertyShortlist.findMany({
        where,
        include: {
            inventory: {
                select: {
                    id: true, display_id: true, type: true, category: true,
                    location: true, price: true, specs: true, media_urls: true,
                    status: true,
                },
            },
        },
        orderBy: [{ created_at: 'desc' }],
    });
}
