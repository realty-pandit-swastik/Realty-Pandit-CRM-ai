/**
 * Transaction Service
 *
 * Core CRUD operations for property deal transactions.
 * Handles creation with duplicate prevention, active transaction lookup,
 * and transaction context for role detection.
 */

import { TransactionStatus, TransactionLogAction, TransactionType } from '@prisma/client';
import prisma from '../db';
import { assignExecutive } from './executive_assigner';
import { TransactionData } from '../agents/types';

// Active statuses (not closed)
const ACTIVE_STATUSES: TransactionStatus[] = [
    TransactionStatus.NEW,
    TransactionStatus.MATCHED,
    TransactionStatus.VISIT_SCHEDULED,
    TransactionStatus.VISITED,
    TransactionStatus.NEGOTIATION,
    TransactionStatus.ON_HOLD,
];

// ─── Transaction Context ──────────────────────────────────────

export interface TransactionContext {
    activeAsDemand: TransactionData[];
    activeAsSupply: TransactionData[];
    activeAsExecutive: TransactionData[];
}

/**
 * Get all active transaction contexts for a phone number.
 * Used by Role Context Detector to determine if someone is buyer/seller/internal.
 */
export async function getTransactionContext(phone: string): Promise<TransactionContext> {
    const [asDemand, asSupply] = await Promise.all([
        prisma.transaction.findMany({
            where: {
                demand_contact_id: phone,
                status: { in: ACTIVE_STATUSES },
            },
            orderBy: { updated_at: 'desc' },
        }),
        prisma.transaction.findMany({
            where: {
                supply_contact_id: phone,
                status: { in: ACTIVE_STATUSES },
            },
            orderBy: { updated_at: 'desc' },
        }),
    ]);

    // Check if this phone belongs to an agent (executive role)
    const agent = await prisma.agent.findFirst({
        where: { phone, status: 'active' },
    });

    let asExecutive: any[] = [];
    if (agent) {
        asExecutive = await prisma.transaction.findMany({
            where: {
                executive_agent_id: agent.id,
                status: { in: ACTIVE_STATUSES },
            },
            orderBy: { updated_at: 'desc' },
        });
    }

    return {
        activeAsDemand: asDemand.map(toTransactionData),
        activeAsSupply: asSupply.map(toTransactionData),
        activeAsExecutive: asExecutive.map(toTransactionData),
    };
}

// ─── Duplicate Prevention ──────────────────────────────────────

/**
 * Check if there's already an active transaction for this demand party.
 * Optionally checks specific inventory (property).
 */
export async function findExistingTransaction(
    demandPhone: string,
    inventoryId?: string
): Promise<TransactionData | null> {
    const where: any = {
        demand_contact_id: demandPhone,
        status: { in: ACTIVE_STATUSES },
    };

    if (inventoryId) {
        where.inventory_id = inventoryId;
    }

    const existing = await prisma.transaction.findFirst({
        where,
        orderBy: { updated_at: 'desc' },
    });

    return existing ? toTransactionData(existing) : null;
}

/**
 * Find all active transactions involving a phone (as demand or supply)
 */
export async function findActiveTransactions(phone: string): Promise<TransactionData[]> {
    const transactions = await prisma.transaction.findMany({
        where: {
            OR: [
                { demand_contact_id: phone },
                { supply_contact_id: phone },
            ],
            status: { in: ACTIVE_STATUSES },
        },
        orderBy: { updated_at: 'desc' },
    });

    return transactions.map(toTransactionData);
}

// ─── Create Transaction ────────────────────────────────────────

export interface CreateTransactionInput {
    tenant_id: string;
    demand_contact_id: string;
    type: TransactionType;
    source?: string;
    demand_property_type?: string;
    demand_location?: string;
    demand_budget_min?: number;
    demand_budget_max?: number;
    demand_bedrooms?: string;
    demand_notes?: string;
    supply_contact_id?: string;
    inventory_id?: string;
}

/**
 * Create a new transaction with duplicate checking and auto executive assignment.
 *
 * Returns null if a duplicate active transaction already exists.
 */
export async function createTransaction(
    input: CreateTransactionInput,
    performedBy: string,
    channel: string = 'whatsapp'
): Promise<{ transaction: TransactionData; isDuplicate: false } | { transaction: TransactionData; isDuplicate: true }> {
    // 1. Check for duplicates
    const existing = await findExistingTransaction(
        input.demand_contact_id,
        input.inventory_id || undefined
    );

    if (existing) {
        // Log the duplicate attempt
        await prisma.transactionLog.create({
            data: {
                transaction_id: existing.id,
                action: TransactionLogAction.DUPLICATE_BLOCKED,
                performed_by: performedBy,
                channel,
                details: {
                    attempted_type: input.type,
                    attempted_location: input.demand_location,
                },
            },
        });
        return { transaction: existing, isDuplicate: true };
    }

    // 2. Create the transaction
    const transaction = await prisma.transaction.create({
        data: {
            tenant_id: input.tenant_id,
            demand_contact_id: input.demand_contact_id,
            supply_contact_id: input.supply_contact_id || null,
            inventory_id: input.inventory_id || null,
            type: input.type,
            status: TransactionStatus.NEW,
            source: input.source || 'whatsapp',
            demand_property_type: input.demand_property_type || null,
            demand_location: input.demand_location || null,
            demand_budget_min: input.demand_budget_min || null,
            demand_budget_max: input.demand_budget_max || null,
            demand_bedrooms: input.demand_bedrooms || null,
            demand_notes: input.demand_notes || null,
        },
    });

    // 3. Log creation
    await prisma.transactionLog.create({
        data: {
            transaction_id: transaction.id,
            action: TransactionLogAction.CREATED,
            new_status: TransactionStatus.NEW,
            performed_by: performedBy,
            channel,
            details: {
                type: input.type,
                location: input.demand_location,
                budget: input.demand_budget_min && input.demand_budget_max
                    ? `${input.demand_budget_min}-${input.demand_budget_max}`
                    : null,
            },
        },
    });

    // 4. Auto-assign executive
    try {
        const executive = await assignExecutive(transaction);
        if (executive) {
            await prisma.transaction.update({
                where: { id: transaction.id },
                data: { executive_agent_id: executive.id },
            });
            await prisma.transactionLog.create({
                data: {
                    transaction_id: transaction.id,
                    action: TransactionLogAction.EXECUTIVE_ASSIGNED,
                    performed_by: 'system',
                    channel: 'system',
                    details: {
                        executive_id: executive.id,
                        executive_name: executive.name,
                        assignment_method: 'auto',
                    },
                },
            });
            // Update the transaction data with executive
            (transaction as any).executive_agent_id = executive.id;
        }
    } catch (err) {
        console.error('[TransactionService] Auto-assign executive failed:', err);
        // Non-blocking — transaction still created
    }

    return { transaction: toTransactionData(transaction), isDuplicate: false };
}

// ─── Update Transaction ────────────────────────────────────────

/**
 * Link supply party and/or inventory to an existing transaction (for MATCHED status)
 */
export async function linkSupplyToTransaction(
    transactionId: string,
    supplyContactId: string,
    inventoryId: string,
    performedBy: string
): Promise<TransactionData> {
    const updated = await prisma.transaction.update({
        where: { id: transactionId },
        data: {
            supply_contact_id: supplyContactId,
            inventory_id: inventoryId,
        },
    });

    await prisma.transactionLog.create({
        data: {
            transaction_id: transactionId,
            action: TransactionLogAction.STATUS_CHANGED,
            performed_by: performedBy,
            channel: 'system',
            details: {
                supply_contact_id: supplyContactId,
                inventory_id: inventoryId,
                event: 'supply_linked',
            },
        },
    });

    return toTransactionData(updated);
}

/**
 * Get a single transaction by ID with full details
 */
export async function getTransactionById(transactionId: string) {
    return prisma.transaction.findUnique({
        where: { id: transactionId },
        include: {
            demand_contact: { select: { phone_number: true, name: true, email: true, contact_type: true } },
            supply_contact: { select: { phone_number: true, name: true, email: true, contact_type: true } },
            executive_agent: { select: { id: true, name: true, email: true, phone: true, department: true } },
            inventory: { select: { id: true, type: true, location: true, price: true, status: true, specs: true } },
            logs: { orderBy: { created_at: 'desc' }, take: 20 },
            appointments: { orderBy: { scheduled_at: 'desc' }, take: 10 },
        },
    });
}

/**
 * Add a note to a transaction
 */
export async function addTransactionNote(
    transactionId: string,
    note: string,
    performedBy: string,
    channel: string = 'system'
) {
    return prisma.transactionLog.create({
        data: {
            transaction_id: transactionId,
            action: TransactionLogAction.NOTE_ADDED,
            performed_by: performedBy,
            channel,
            details: { note },
        },
    });
}

// ─── Pipeline Stats ────────────────────────────────────────────

/**
 * Get transaction counts by status (for pipeline/funnel view)
 */
export async function getPipelineStats(tenantId: string) {
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

function toTransactionData(tx: any): TransactionData {
    return {
        id: tx.id,
        type: tx.type,
        status: tx.status,
        demand_contact_id: tx.demand_contact_id,
        supply_contact_id: tx.supply_contact_id,
        executive_agent_id: tx.executive_agent_id,
        inventory_id: tx.inventory_id,
        demand_property_type: tx.demand_property_type,
        demand_location: tx.demand_location,
        demand_budget_min: tx.demand_budget_min,
        demand_budget_max: tx.demand_budget_max,
        demand_bedrooms: tx.demand_bedrooms,
        demand_notes: tx.demand_notes,
        final_price: tx.final_price,
        source: tx.source,
        created_at: tx.created_at,
        updated_at: tx.updated_at,
    };
}
