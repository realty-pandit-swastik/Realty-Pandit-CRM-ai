/**
 * Deal Service (Phase 7)
 *
 * Wraps and extends the Transaction Service with 3-role deal structure:
 * - Demand Handler: whoever brought the customer (PARTNER, TEAM_MEMBER, DIRECT)
 * - Supply Handler: whoever uploaded the property (PARTNER, TEAM_MEMBER)
 * - Coordinator: internal Agent who manages the deal (always present)
 *
 * Every deal scenario:
 * - PARTNER_INTERNAL: Partner brings customer + team has inventory
 * - PARTNER_PARTNER: Partner brings customer + different partner has inventory
 * - DIRECT_INTERNAL: Direct customer + team inventory
 */

import { TransactionStatus, TransactionLogAction, TransactionType } from '@prisma/client';
import prisma from '../db';
import { assignExecutive } from './executive_assigner';
import { findExistingTransaction } from './transaction_service';
import { MatchingEngine } from './matching_engine';
import { notifyDealEvent } from './deal_notifications';
import logger from '../utils/logger';

export type DealHandlerType = 'PARTNER' | 'TEAM_MEMBER' | 'DIRECT';
export type DealScenario = 'PARTNER_INTERNAL' | 'PARTNER_PARTNER' | 'DIRECT_INTERNAL';

export interface CreateDealInput {
    tenant_id: string;
    // Demand side
    demand_contact_id: string;
    demand_handler_type: DealHandlerType;
    demand_handler_id?: string; // PartnerAgent.id or Agent.id (null for DIRECT)
    // Supply side (optional at creation, filled on match)
    supply_contact_id?: string;
    supply_handler_type?: DealHandlerType;
    supply_handler_id?: string;
    inventory_id?: string;
    // Deal type
    type: TransactionType;
    source?: string;
    // Requirements
    demand_intent?: string;
    demand_category?: string;
    demand_type_slug?: string;
    demand_property_type?: string;
    demand_location?: string;
    demand_budget_min?: number;
    demand_budget_max?: number;
    demand_budget_type?: string;
    demand_bedrooms?: string;
    demand_notes?: string;
    demand_amenities?: any;
}

export interface DealData {
    id: string;
    type: TransactionType;
    status: TransactionStatus;
    deal_scenario: DealScenario | null;
    demand_contact_id: string;
    supply_contact_id: string | null;
    coordinator_agent_id: string | null;
    demand_handler_type: string | null;
    demand_handler_id: string | null;
    supply_handler_type: string | null;
    supply_handler_id: string | null;
    inventory_id: string | null;
    created_at: Date;
    updated_at: Date;
}

/**
 * Determine the deal scenario from handler types
 */
function determineDealScenario(
    demandType: DealHandlerType,
    supplyType?: DealHandlerType
): DealScenario {
    if (demandType === 'DIRECT') return 'DIRECT_INTERNAL';
    if (demandType === 'PARTNER' && supplyType === 'PARTNER') return 'PARTNER_PARTNER';
    return 'PARTNER_INTERNAL';
}

/**
 * Create a new deal with 3-role structure
 */
export async function createDeal(
    input: CreateDealInput,
    performedBy: string,
    channel: string = 'system'
): Promise<{ deal: DealData; isDuplicate: boolean; matches: any[] }> {
    // 1. Check for duplicates
    const existing = await findExistingTransaction(
        input.demand_contact_id,
        input.inventory_id || undefined
    );

    if (existing) {
        await prisma.transactionLog.create({
            data: {
                transaction_id: existing.id,
                action: TransactionLogAction.DUPLICATE_BLOCKED,
                performed_by: performedBy,
                channel,
                details: {
                    attempted_type: input.type,
                    attempted_location: input.demand_location,
                    deal_handler_type: input.demand_handler_type,
                },
            },
        });
        return { deal: toDealData(existing), isDuplicate: true, matches: [] };
    }

    // 2. Determine scenario
    const dealScenario = determineDealScenario(
        input.demand_handler_type,
        input.supply_handler_type
    );

    // 3. Create the transaction with deal fields
    const transaction = await prisma.transaction.create({
        data: {
            tenant_id: input.tenant_id,
            demand_contact_id: input.demand_contact_id,
            supply_contact_id: input.supply_contact_id || null,
            inventory_id: input.inventory_id || null,
            type: input.type,
            status: TransactionStatus.NEW,
            source: input.source || 'system',
            // 3-Role structure
            demand_handler_type: input.demand_handler_type,
            demand_handler_id: input.demand_handler_id || null,
            supply_handler_type: input.supply_handler_type || null,
            supply_handler_id: input.supply_handler_id || null,
            deal_scenario: dealScenario,
            // Legacy requirement fields
            demand_property_type: input.demand_property_type || null,
            demand_location: input.demand_location || null,
            demand_budget_min: input.demand_budget_min || null,
            demand_budget_max: input.demand_budget_max || null,
            demand_bedrooms: input.demand_bedrooms || null,
            demand_notes: input.demand_notes || null,
            // Phase 7 extended fields
            demand_intent: input.demand_intent || null,
            demand_category: input.demand_category || null,
            demand_type_slug: input.demand_type_slug || null,
            demand_budget_type: input.demand_budget_type || null,
            demand_amenities: input.demand_amenities || undefined,
        },
    });

    // 4. Log creation
    await prisma.transactionLog.create({
        data: {
            transaction_id: transaction.id,
            action: TransactionLogAction.CREATED,
            new_status: TransactionStatus.NEW,
            performed_by: performedBy,
            channel,
            details: {
                deal_scenario: dealScenario,
                demand_handler_type: input.demand_handler_type,
                demand_handler_id: input.demand_handler_id,
                type: input.type,
                location: input.demand_location,
            },
        },
    });

    // 5. Auto-assign coordinator (reuses executive_assigner)
    try {
        const coordinator = await assignExecutive(transaction);
        if (coordinator) {
            await prisma.transaction.update({
                where: { id: transaction.id },
                data: {
                    coordinator_agent_id: coordinator.id,
                    executive_agent_id: coordinator.id, // Keep backward compat
                },
            });
            await prisma.transactionLog.create({
                data: {
                    transaction_id: transaction.id,
                    action: TransactionLogAction.EXECUTIVE_ASSIGNED,
                    performed_by: 'system',
                    channel: 'system',
                    details: {
                        coordinator_id: coordinator.id,
                        coordinator_name: coordinator.name,
                        assignment_method: 'auto',
                        role: 'coordinator',
                    },
                },
            });
            (transaction as any).coordinator_agent_id = coordinator.id;
            (transaction as any).executive_agent_id = coordinator.id;
        }
    } catch (err) {
        logger.error('[DealService] Auto-assign coordinator failed:', err);
    }

    // 6. Run matching engine if no inventory linked yet
    let matches: any[] = [];
    if (!input.inventory_id) {
        try {
            const matchingEngine = new MatchingEngine();
            matches = await matchingEngine.findMatches({
                intent: input.demand_intent === 'rent_lease' ? 'rent' : 'buy',
                property_type: input.demand_type_slug || input.demand_property_type || undefined,
                budget_min: input.demand_budget_min || undefined,
                budget_max: input.demand_budget_max || undefined,
                preferred_location: input.demand_location || undefined,
            }, 5);
        } catch (err) {
            logger.error('[DealService] Matching engine failed:', err);
        }
    }

    // 7. Notify deal created (async - don't block response)
    notifyDealEvent({ dealId: transaction.id, event: 'created' }).catch(err =>
        logger.error('[DealService] Notification failed:', err)
    );

    return { deal: toDealData(transaction), isDuplicate: false, matches };
}

/**
 * Link a property + supply handler to an existing deal
 */
export async function matchPropertyToDeal(
    dealId: string,
    inventoryId: string,
    supplyContactId: string,
    supplyHandlerType: DealHandlerType,
    supplyHandlerId: string,
    performedBy: string
): Promise<DealData> {
    // Get current deal to determine scenario
    const current = await prisma.transaction.findUnique({ where: { id: dealId } });
    if (!current) throw new Error(`Deal ${dealId} not found`);

    const newScenario = determineDealScenario(
        (current.demand_handler_type as DealHandlerType) || 'DIRECT',
        supplyHandlerType
    );

    const updated = await prisma.transaction.update({
        where: { id: dealId },
        data: {
            supply_contact_id: supplyContactId,
            inventory_id: inventoryId,
            supply_handler_type: supplyHandlerType,
            supply_handler_id: supplyHandlerId,
            deal_scenario: newScenario,
            status: TransactionStatus.MATCHED,
        },
    });

    await prisma.transactionLog.create({
        data: {
            transaction_id: dealId,
            action: TransactionLogAction.STATUS_CHANGED,
            old_status: current.status,
            new_status: TransactionStatus.MATCHED,
            performed_by: performedBy,
            channel: 'system',
            details: {
                event: 'property_matched',
                inventory_id: inventoryId,
                supply_handler_type: supplyHandlerType,
                supply_handler_id: supplyHandlerId,
                deal_scenario: newScenario,
            },
        },
    });

    // Notify property matched (async)
    notifyDealEvent({ dealId, event: 'matched' }).catch(err =>
        logger.error('[DealService] Match notification failed:', err)
    );

    return toDealData(updated);
}

/**
 * Get deal by ID with full details including parties
 */
export async function getDealById(dealId: string) {
    return prisma.transaction.findUnique({
        where: { id: dealId },
        include: {
            demand_contact: { select: { phone_number: true, name: true, email: true, contact_type: true } },
            supply_contact: { select: { phone_number: true, name: true, email: true, contact_type: true } },
            executive_agent: { select: { id: true, name: true, email: true, phone: true, department: true } },
            coordinator: { select: { id: true, name: true, email: true, phone: true, department: true } },
            inventory: { select: { id: true, type: true, category: true, location: true, price: true, status: true, specs: true, media_urls: true } },
            logs: { orderBy: { created_at: 'desc' }, take: 50 },
            appointments: { orderBy: { scheduled_at: 'desc' }, take: 10 },
            queries: { orderBy: { created_at: 'desc' } },
        },
    });
}

/**
 * Get unified deal timeline (logs + queries + appointments)
 */
export async function getDealTimeline(dealId: string) {
    const [logs, queries, appointments] = await Promise.all([
        prisma.transactionLog.findMany({
            where: { transaction_id: dealId },
            orderBy: { created_at: 'desc' },
        }),
        prisma.dealQuery.findMany({
            where: { transaction_id: dealId },
            orderBy: { created_at: 'desc' },
        }),
        prisma.appointment.findMany({
            where: { transaction_id: dealId },
            orderBy: { scheduled_at: 'desc' },
        }),
    ]);

    // Merge and sort chronologically
    const timeline = [
        ...logs.map(l => ({ type: 'log' as const, id: l.id, action: l.action, details: l.details, created_at: l.created_at, performed_by: l.performed_by })),
        ...queries.map(q => ({ type: 'query' as const, id: q.id, subject: q.subject, message: q.message, status: q.status, answer: q.answer, created_at: q.created_at, raised_by_type: q.raised_by_type })),
        ...appointments.map(a => ({ type: 'appointment' as const, id: a.id, appointment_type: a.type, status: a.status, scheduled_at: a.scheduled_at, created_at: a.created_at })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return timeline;
}

/**
 * List deals with filters
 */
export async function listDeals(filters: {
    tenant_id: string;
    status?: TransactionStatus;
    deal_scenario?: DealScenario;
    coordinator_agent_id?: string;
    demand_handler_id?: string;
    supply_handler_id?: string;
    page?: number;
    limit?: number;
}) {
    const { tenant_id, status, deal_scenario, coordinator_agent_id, demand_handler_id, supply_handler_id, page = 1, limit = 20 } = filters;

    const where: any = { tenant_id };
    if (status) where.status = status;
    if (deal_scenario) where.deal_scenario = deal_scenario;
    if (coordinator_agent_id) where.coordinator_agent_id = coordinator_agent_id;
    if (demand_handler_id) where.demand_handler_id = demand_handler_id;
    if (supply_handler_id) where.supply_handler_id = supply_handler_id;

    const skip = (page - 1) * limit;

    const [deals, total] = await Promise.all([
        prisma.transaction.findMany({
            where,
            skip,
            take: limit,
            orderBy: { updated_at: 'desc' },
            include: {
                demand_contact: { select: { phone_number: true, name: true, contact_type: true } },
                supply_contact: { select: { phone_number: true, name: true } },
                coordinator: { select: { id: true, name: true, phone: true } },
                inventory: { select: { id: true, type: true, location: true, price: true, media_urls: true } },
            },
        }),
        prisma.transaction.count({ where }),
    ]);

    return {
        deals,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

/**
 * Get pipeline stats grouped by status
 */
export async function getDealPipelineStats(tenantId: string) {
    const stats = await prisma.transaction.groupBy({
        by: ['status'],
        where: { tenant_id: tenantId },
        _count: { id: true },
    });

    const pipeline: Record<string, number> = {};
    for (const s of stats) {
        pipeline[s.status] = s._count.id;
    }
    return pipeline;
}

// ─── Helper ────────────────────────────────────────────────────

function toDealData(tx: any): DealData {
    return {
        id: tx.id,
        type: tx.type,
        status: tx.status,
        deal_scenario: tx.deal_scenario || null,
        demand_contact_id: tx.demand_contact_id,
        supply_contact_id: tx.supply_contact_id,
        coordinator_agent_id: tx.coordinator_agent_id || tx.executive_agent_id,
        demand_handler_type: tx.demand_handler_type,
        demand_handler_id: tx.demand_handler_id,
        supply_handler_type: tx.supply_handler_type,
        supply_handler_id: tx.supply_handler_id,
        inventory_id: tx.inventory_id,
        created_at: tx.created_at,
        updated_at: tx.updated_at,
    };
}
