import prisma from '../db';
import { buildFullContactVisibilityFilter } from '../middleware/contact_visibility';
import { getTeamIds } from '../utils/team_scope';
type Actor = { id: string; role: string; tenant_id: string };
/** A recognized CRM recipient must be visible before any provider or contact mutation. */
export async function mayShareWithRecipient(actor: Actor, phone: string): Promise<boolean> {
    const existing = await prisma.contact.findUnique({ where: { phone_number: phone }, select: { tenant_id: true } });
    if (!existing) return true;
    if (existing.tenant_id !== actor.tenant_id) return false;
    if (actor.role === 'partner') return true;
    const visible = await prisma.contact.findFirst({ where: { phone_number: phone, tenant_id: actor.tenant_id,
        AND: [await buildFullContactVisibilityFilter(actor.id, actor.role)] }, select: { phone_number: true } });
    if (visible) return true;
    const team = await getTeamIds(actor);
    return !!await prisma.partnerAgent.findFirst({ where: { phone_number: phone, contact: { tenant_id: actor.tenant_id },
        ...(actor.role === 'super_boss' ? {} : { managing_agent_id: { in: team } }) }, select: { id: true } });
}
