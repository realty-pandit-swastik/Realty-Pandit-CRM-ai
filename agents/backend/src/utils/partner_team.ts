/**
 * Partner TEAM helpers (2026-07-13).
 *
 * A partner COMPANY runs its own team of sub-agents (PartnerAgent rows with parent_partner_id = owner).
 * Only an ACTIVE **company owner** may manage that team or assign work within it. A sub-agent can log in
 * and work what they're given, but can never manage the team or assign anything.
 *
 * Pairs with utils/partner_scope.ts (who can SEE what) — this file is who can DO what.
 */
import prisma from '../db';
import logger from './logger';

export interface PartnerCaller {
    id: string;
    isOwner: boolean;
    partner_category: string | null;
    parent_partner_id: string | null;
    managing_agent_id: string | null;
}

/** Load the calling partner. Returns null if the caller isn't a partner or isn't ACTIVE. */
export async function loadActivePartner(req: any): Promise<PartnerCaller | null> {
    if (req?.agent?.role !== 'partner') return null;
    const p = await prisma.partnerAgent.findUnique({
        where: { id: req.agent.id },
        select: {
            id: true, status: true, partner_category: true,
            parent_partner_id: true, managing_agent_id: true,
        },
    });
    if (!p || p.status !== 'ACTIVE') return null;
    return {
        id: p.id,
        // OWNER = a COMPANY partner with no parent. This single definition is what keeps a sub-agent
        // (always created as INDIVIDUAL + parent set) from ever managing a team or assigning work.
        isOwner: p.partner_category === 'COMPANY' && !p.parent_partner_id,
        partner_category: p.partner_category,
        parent_partner_id: p.parent_partner_id,
        managing_agent_id: p.managing_agent_id,
    };
}

/**
 * 403s unless the caller is an ACTIVE COMPANY OWNER. Use on every team-management route.
 * Returns the caller on success, null after having already sent the 403.
 */
export async function requirePartnerOwner(req: any, res: any): Promise<PartnerCaller | null> {
    const caller = await loadActivePartner(req);
    if (!caller) {
        res.status(403).json({ error: 'Partner account is not active.' });
        return null;
    }
    if (!caller.isOwner) {
        res.status(403).json({ error: 'Only company partner owners can manage a team.' });
        return null;
    }
    return caller;
}

/**
 * Validate an assignment target for an ACTIVE COMPANY OWNER.
 *
 * Order matters — every failure is a 403 with a NON-ENUMERATING message, so an owner can never probe
 * for the existence of ids belonging to other partners.
 *   1. caller must be an ACTIVE COMPANY OWNER  → kills sub-agent-assigns, INDIVIDUAL-assigns, suspended-assigns
 *   2. null            → unassign, allowed
 *   3. target === self → the owner claims the row for themselves, allowed
 *   4. otherwise       → target must be THEIR OWN, ACTIVE sub-agent
 *
 * Row ownership itself is enforced separately by the entity's existing guard
 * (partnerOwnsLeadOr403 / partnerOwnsDealOr403 / partnerMayMutateInventory), which must run FIRST.
 */
export async function assertPartnerOwnerCanAssign(
    req: any, res: any, targetPartnerId: string | null,
): Promise<{ ok: true; assigneeId: string | null } | { ok: false }> {
    const caller = await requirePartnerOwner(req, res);
    if (!caller) return { ok: false };

    if (targetPartnerId === null || targetPartnerId === undefined || targetPartnerId === '') {
        return { ok: true, assigneeId: null };           // unassign
    }
    if (targetPartnerId === caller.id) {
        return { ok: true, assigneeId: caller.id };      // owner takes it themselves
    }

    const target = await prisma.partnerAgent.findUnique({
        where: { id: String(targetPartnerId) },
        select: { id: true, status: true, parent_partner_id: true },
    });
    // Same message whether the id doesn't exist, belongs to another partner, or is suspended.
    if (!target || target.parent_partner_id !== caller.id || target.status !== 'ACTIVE') {
        logger.warn(`[PartnerTeam] Partner ${caller.id} tried to assign to non-member ${targetPartnerId}`);
        res.status(403).json({ error: 'That person is not an active member of your team.' });
        return { ok: false };
    }
    return { ok: true, assigneeId: target.id };
}
