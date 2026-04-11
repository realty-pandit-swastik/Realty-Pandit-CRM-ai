/**
 * Lead Assignment Service
 * Two strategies for assigning leads to internal agents:
 *   1. Round-robin: Active employees in rotation by oldest last_assigned_at
 *   2. Property uploader: Assign to whoever uploaded the matching inventory
 */

import prisma from '../db';
import logger from '../utils/logger';

/**
 * Assign the next lead via round-robin across all active employees.
 * Picks the agent with the oldest (or null) last_assigned_at.
 * Updates their last_assigned_at immediately to advance the pointer.
 * Returns the agent ID, or null if no eligible agents found.
 */
export async function assignViaRoundRobin(): Promise<string | null> {
    try {
        // Find active employee with oldest last_assigned_at (NULLS FIRST = never-assigned goes first)
        const agent = await prisma.agent.findFirst({
            where: { role: 'employee', status: 'active' },
            orderBy: [{ last_assigned_at: { sort: 'asc', nulls: 'first' } }],
            select: { id: true, name: true },
        });

        if (!agent) {
            logger.warn('[LeadAssign] No active employees found for round-robin assignment');
            return null;
        }

        // Stamp the assignment time immediately so next call picks a different agent
        await prisma.agent.update({
            where: { id: agent.id },
            data: { last_assigned_at: new Date() },
        });

        logger.info(`[LeadAssign] Round-robin assigned to agent: ${agent.name} (${agent.id})`);
        return agent.id;
    } catch (err) {
        logger.warn(`[LeadAssign] Round-robin error: ${(err as Error).message}`);
        return null;
    }
}

/**
 * Resolve an active employee agent by their email address.
 * Used for SubUserName-based routing from 99acres leads.
 *
 * The 99acres SubUserName field equals the Gmail of the team member
 * whose listing received the enquiry — this directly maps to Agent.email.
 *
 * Does NOT update last_assigned_at — the round-robin pointer is only
 * advanced when round-robin actually fires, not for direct routing.
 * Returns the agent ID, or null if no match / agent inactive.
 */
export async function resolveAgentByEmail(email: string | null | undefined): Promise<string | null> {
    if (!email?.trim()) return null;

    try {
        const agent = await prisma.agent.findFirst({
            where: {
                personal_email: { equals: email.trim(), mode: 'insensitive' },
                role: 'employee',
                status: 'active',
            },
            select: { id: true, name: true },
        });

        if (!agent) {
            logger.info(`[LeadAssign] No active employee found for SubUserName personal_email: ${email}`);
            return null;
        }

        logger.info(`[LeadAssign] SubUserName matched agent via personal_email: ${agent.name} (${agent.id})`);
        return agent.id;
    } catch (err) {
        logger.warn(`[LeadAssign] resolveAgentByEmail error for "${email}": ${(err as Error).message}`);
        return null;
    }
}

/**
 * Get the agent who uploaded a specific inventory (property).
 * Used when an external portal lead is for a specific listing.
 * Does NOT update last_assigned_at — this agent gets a notification only,
 * they are not the CRM agent for the lead.
 * Returns uploaded_by_agent_id, or null if property not found / no uploader.
 */
export async function assignViaPropertyUploader(propertyId: string): Promise<string | null> {
    try {
        const inventory = await prisma.inventory.findUnique({
            where: { id: propertyId },
            select: { uploaded_by_agent_id: true },
        });

        if (!inventory?.uploaded_by_agent_id) {
            logger.info(`[LeadAssign] No uploader found for property ${propertyId}`);
            return null;
        }

        logger.info(`[LeadAssign] Property uploader found: agent ${inventory.uploaded_by_agent_id} for property ${propertyId}`);
        return inventory.uploaded_by_agent_id;
    } catch (err) {
        logger.warn(`[LeadAssign] Property uploader lookup error for ${propertyId}: ${(err as Error).message}`);
        return null;
    }
}
