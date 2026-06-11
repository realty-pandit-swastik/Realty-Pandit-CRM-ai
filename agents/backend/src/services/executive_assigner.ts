/**
 * Executive Assigner
 *
 * Auto-assigns an internal sales executive to every transaction.
 * Algorithm: Locality-based → Load-based → Round-robin fallback.
 *
 * Every deal MUST have an internal executive — Realty Pandit is always the middleman.
 */

import { TransactionStatus, TransactionLogAction } from '@prisma/client';
import prisma from '../db';

// Maximum active transactions per agent (configurable)
const MAX_ACTIVE_TRANSACTIONS = 20;

// Active transaction statuses for workload calculation
const ACTIVE_STATUSES: TransactionStatus[] = [
    TransactionStatus.NEW,
    TransactionStatus.QUALIFIED,
    TransactionStatus.VISIT_SCHEDULED,
    TransactionStatus.VISITED,
    TransactionStatus.NEGOTIATION,
    TransactionStatus.ON_HOLD,
];

// Round-robin index (in-memory, resets on restart)
let roundRobinIndex = 0;

/**
 * Auto-assign an internal sales executive to a transaction.
 *
 * Priority:
 * 1. Locality-based match (agent department matches transaction location)
 * 2. Load-based (agent with fewest active transactions)
 * 3. Round-robin fallback (cycle through available agents)
 */
export async function assignExecutive(
    transaction: { id: string; demand_location?: string | null; tenant_id: string }
): Promise<{ id: string; name: string } | null> {
    // Get all eligible agents (employees and managers, active)
    const eligibleAgents = await prisma.agent.findMany({
        where: {
            tenant_id: transaction.tenant_id,
            status: 'active',
            role: { in: ['employee', 'manager'] },
        },
        select: {
            id: true,
            name: true,
            department: true,
            role: true,
        },
    });

    if (eligibleAgents.length === 0) {
        console.warn('[ExecutiveAssigner] No eligible agents found for tenant:', transaction.tenant_id);
        return null;
    }

    // Get workload for each agent
    const agentWorkloads = await Promise.all(
        eligibleAgents.map(async (agent) => ({
            ...agent,
            workload: await getAgentWorkload(agent.id),
        }))
    );

    // Filter out agents at capacity
    const availableAgents = agentWorkloads.filter(a => a.workload < MAX_ACTIVE_TRANSACTIONS);

    if (availableAgents.length === 0) {
        // All agents at capacity — pick the one with least workload anyway
        const leastBusy = agentWorkloads.sort((a, b) => a.workload - b.workload)[0];
        return { id: leastBusy.id, name: leastBusy.name };
    }

    // Step 1: Try locality-based match
    if (transaction.demand_location) {
        const locationLower = transaction.demand_location.toLowerCase();
        const localityMatch = availableAgents.find(a =>
            a.department && locationLower.includes(a.department.toLowerCase())
        );
        if (localityMatch) {
            return { id: localityMatch.id, name: localityMatch.name };
        }
    }

    // Step 2: Load-based (fewest active transactions)
    const sorted = availableAgents.sort((a, b) => a.workload - b.workload);

    // If there's a clear winner (least busy by 2+ transactions), assign them
    if (sorted.length >= 2 && sorted[0].workload < sorted[1].workload) {
        return { id: sorted[0].id, name: sorted[0].name };
    }

    // Step 3: Round-robin among equally loaded agents
    const minWorkload = sorted[0].workload;
    const equallyLoaded = sorted.filter(a => a.workload === minWorkload);

    roundRobinIndex = roundRobinIndex % equallyLoaded.length;
    const assigned = equallyLoaded[roundRobinIndex];
    roundRobinIndex++;

    return { id: assigned.id, name: assigned.name };
}

/**
 * Reassign executive for a transaction (manual override by manager/admin)
 */
export async function reassignExecutive(
    transactionId: string,
    newAgentId: string,
    performedBy: string
): Promise<void> {
    const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
        select: { executive_agent_id: true },
    });

    if (!transaction) {
        throw new Error(`Transaction ${transactionId} not found`);
    }

    const newAgent = await prisma.agent.findUnique({
        where: { id: newAgentId },
        select: { id: true, name: true },
    });

    if (!newAgent) {
        throw new Error(`Agent ${newAgentId} not found`);
    }

    await prisma.$transaction([
        prisma.transaction.update({
            where: { id: transactionId },
            data: { executive_agent_id: newAgentId },
        }),
        prisma.transactionLog.create({
            data: {
                transaction_id: transactionId,
                action: TransactionLogAction.EXECUTIVE_CHANGED,
                performed_by: performedBy,
                channel: 'admin',
                details: {
                    old_executive_id: transaction.executive_agent_id,
                    new_executive_id: newAgentId,
                    new_executive_name: newAgent.name,
                },
            },
        }),
    ]);
}

/**
 * Get the number of active transactions for an agent
 */
export async function getAgentWorkload(agentId: string): Promise<number> {
    return prisma.transaction.count({
        where: {
            executive_agent_id: agentId,
            status: { in: ACTIVE_STATUSES },
        },
    });
}
