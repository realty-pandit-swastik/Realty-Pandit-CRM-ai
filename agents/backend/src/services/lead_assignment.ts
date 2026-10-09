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
 * Resolve an active agent by their personal email address.
 * Used for SubUserName-based routing from 99acres leads.
 *
 * The 99acres SubUserName field equals the Gmail of the team member whose listing received the enquiry —
 * matched here against Agent.personal_email. The lister can be an EMPLOYEE or a MANAGER (managers like
 * Ashwani also list + handle client buy/sell), so both active roles are matched — NOT employees only,
 * which used to drop a manager-lister's leads to the super_boss fallback. super_boss is intentionally
 * excluded so it stays the final fallback for genuinely-unmatched leads.
 *
 * Does NOT update last_assigned_at — the round-robin pointer is only
 * advanced when round-robin actually fires, not for direct routing.
 * Returns the agent ID, or null if no match / agent inactive.
 */
export async function resolveAgentByEmail(email: string | null | undefined): Promise<string | null> {
    if (!email?.trim()) return null;

    try {
        // Match the lister email against EITHER personal_email OR google_email — a team member's
        // portal-registered Gmail may live in google_email (their Google-connect address) rather than
        // personal_email (e.g. Bhuvneswar, Bharat). Checking both routes those leads to the originating agent.
        const agent = await prisma.agent.findFirst({
            where: {
                OR: [
                    // Dedicated 99acres portal email (manager-entered) takes precedence.
                    { nine9acres_email: { equals: email.trim(), mode: 'insensitive' } },
                    { personal_email: { equals: email.trim(), mode: 'insensitive' } },
                    { google_email: { equals: email.trim(), mode: 'insensitive' } },
                ],
                role: { in: ['employee', 'manager'] },
                status: 'active',
            },
            select: { id: true, name: true },
        });

        if (!agent) {
            logger.info(`[LeadAssign] No active employee found for SubUserName email (personal/google): ${email}`);
            return null;
        }

        logger.info(`[LeadAssign] SubUserName matched agent via email (personal/google): ${agent.name} (${agent.id})`);
        return agent.id;
    } catch (err) {
        logger.warn(`[LeadAssign] resolveAgentByEmail error for "${email}": ${(err as Error).message}`);
        return null;
    }
}

/**
 * Resolve the team member who owns the portal LISTING an enquiry came in on.
 *
 * Second link in the portal-attribution chain (after the sub-user email match): the enquiry's
 * property code (e.g. 99acres PROPERTY_CODE "S94715572") is looked up as a harvested
 * PortalListing for this tenant+source, and the linked inventory's assigned agent is returned.
 * Active employee/manager only; null when the listing was never harvested or its assignee is
 * gone — callers then fall through to round-robin, never to a wrong guess.
 */
export async function resolveListingOwnerAgent(opts: {
    source: string;
    sourceRef: string | null | undefined;
    tenantId: string;
}): Promise<string | null> {
    const ref = (opts.sourceRef || '').trim();
    if (!ref) return null;
    try {
        const listing = await prisma.portalListing.findFirst({
            where: { tenant_id: opts.tenantId, source: opts.source, external_id: ref },
            select: { inventory_id: true },
        });
        if (!listing?.inventory_id) {
            logger.info(`[LeadAssign] No harvested listing ${opts.source}:${ref} linked to inventory — listing-owner fallback missed`);
            return null;
        }
        const inv = await prisma.inventory.findUnique({
            where: { id: listing.inventory_id },
            select: { assigned_agent_id: true },
        });
        const agentId = inv?.assigned_agent_id || null;
        if (!agentId) {
            logger.info(`[LeadAssign] Harvested listing ${opts.source}:${ref} has no assigned agent`);
            return null;
        }
        const agent = await prisma.agent.findFirst({
            where: { id: agentId, role: { in: ['employee', 'manager'] }, status: 'active' },
            select: { id: true, name: true },
        });
        if (!agent) {
            logger.info(`[LeadAssign] Listing ${opts.source}:${ref} assignee ${agentId} is not an active team member`);
            return null;
        }
        logger.info(`[LeadAssign] Enquiry ${opts.source}:${ref} attributed to listing owner ${agent.name} (${agent.id})`);
        return agent.id;
    } catch (err) {
        logger.warn(`[LeadAssign] resolveListingOwnerAgent error for "${opts.source}:${ref}": ${(err as Error).message}`);
        return null;
    }
}

/**
 * Resolve an active agent from a MagicBricks `sub_user` value.
 * MagicBricks sub-users arrive as `<agent's registered phone>@timesgroup.com`
 * (e.g. "7906597808@timesgroup.com" = the lister's mobile). We match the embedded
 * number against Agent.phone (E.164 +91…). Falls back to a personal_email match in
 * case a sub_user is ever an email rather than a phone. Mirrors resolveAgentByEmail
 * (99acres SubUserName routing): active employee/manager only, null if unmatched.
 */
export async function resolveAgentByMagicBricksSubUser(subUser: string | null | undefined): Promise<string | null> {
    const raw = subUser?.trim();
    if (!raw) return null;
    try {
        // Primary: explicit per-agent MagicBricks identifier set on the profile (manager-entered).
        // Holds whatever MagicBricks sends as sub_user (their MB Gmail OR <phone>@timesgroup.com), so
        // an exact match on the raw value is the most reliable route. (2026-06-25)
        const byMbField = await prisma.agent.findFirst({
            where: {
                magicbricks_email: { equals: raw, mode: 'insensitive' },
                role: { in: ['employee', 'manager'] },
                status: 'active',
            },
            select: { id: true, name: true },
        });
        if (byMbField) {
            logger.info(`[LeadAssign] MagicBricks sub_user matched agent via magicbricks_email: ${byMbField.name} (${byMbField.id})`);
            return byMbField.id;
        }
        // Secondary: the phone before the @ → match Agent.phone by its last 10 digits.
        const digits = raw.split('@')[0].replace(/\D/g, '');
        if (digits.length >= 10) {
            const last10 = digits.slice(-10);
            const agent = await prisma.agent.findFirst({
                where: {
                    phone: { contains: last10 },
                    role: { in: ['employee', 'manager'] },
                    status: 'active',
                },
                select: { id: true, name: true },
            });
            if (agent) {
                logger.info(`[LeadAssign] MagicBricks sub_user matched agent via phone: ${agent.name} (${agent.id})`);
                return agent.id;
            }
        }
        // Fallback: treat the sub_user as an email and match personal_email.
        if (raw.includes('@')) {
            const byEmail = await resolveAgentByEmail(raw);
            if (byEmail) return byEmail;
        }
        logger.info(`[LeadAssign] No active agent for MagicBricks sub_user: ${raw}`);
        return null;
    } catch (err) {
        logger.warn(`[LeadAssign] resolveAgentByMagicBricksSubUser error for "${raw}": ${(err as Error).message}`);
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

/**
 * Round-robin assignment among managers (role IN 'manager' or 'super_boss').
 * Picks the manager whose last_assigned_at is oldest (or null) and bumps it.
 * Used as the fallback when portal-email matching can't resolve an agent for
 * inbound external leads from website / WhatsApp / voice / unrecognised portal subusernames.
 *
 * Returns the agent id, or null when no active manager exists.
 */
export async function assignViaManagerRoundRobin(): Promise<string | null> {
    try {
        const next = await prisma.agent.findFirst({
            where: {
                role: { in: ['manager', 'super_boss'] },
                status: 'active',
            },
            orderBy: [
                { last_assigned_at: { sort: 'asc', nulls: 'first' } },
                { created_at: 'asc' },
            ],
            select: { id: true, name: true },
        });
        if (!next) {
            logger.warn('[LeadAssign] No active manager found for round-robin');
            return null;
        }

        await prisma.agent.update({
            where: { id: next.id },
            data: { last_assigned_at: new Date() },
        });

        logger.info(`[LeadAssign] Manager round-robin → ${next.name} (${next.id})`);
        return next.id;
    } catch (err) {
        logger.warn(`[LeadAssign] Manager round-robin error: ${(err as Error).message}`);
        return null;
    }
}
