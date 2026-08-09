/**
 * Duplicate-lead re-ingest handling (2026-07-31, Tasks 2+3).
 *
 * When a lead we already have comes in AGAIN from a portal (e.g. first 99acres, later MagicBricks):
 *  - Task 3: log a `lead_regenerated` timeline interaction recording the SOURCE (+ sub_user / newly
 *    attributed agent) so the deal/lead timeline shows the repeat.
 *  - Task 2: if this source attributes the lead to a DIFFERENT team member than the current owner,
 *    SHARE the lead with them (add to Contact.shared_with_ids) — never reassign (honours the
 *    "already-assigned lead is never reassigned" rule). The owner/manager is unchanged.
 */
import prisma from '../db';
import logger from '../utils/logger';
import { addContactShare } from './contact_shares';

export async function recordLeadReingest(opts: {
    phone: string;
    source: string;                       // '99acres' | 'magicbricks' | 'housing' | ...
    attributedAgentId?: string | null;    // team member this source attributes the lead to (from sub_user), if resolved
    subUser?: string | null;              // raw sub_user/email for the timeline record
}): Promise<{ shared: boolean; sharedAgentId?: string }> {
    try {
        const contact = await prisma.contact.findUnique({
            where: { phone_number: opts.phone },
            select: { phone_number: true, tenant_id: true, assigned_agent_id: true, shared_with_ids: true },
        });
        if (!contact) return { shared: false };

        // Task 2: share with the newly-attributed agent when it differs from the owner + isn't already shared.
        let shared = false;
        let sharedAgentId: string | undefined;
        const a = opts.attributedAgentId || null;
        if (a && a !== contact.assigned_agent_id && !(contact.shared_with_ids || []).includes(a)) {
            const agent = await prisma.agent.findFirst({ where: { id: a, status: 'active' }, select: { id: true, name: true } });
            if (agent) {
                // Dual-write (2026-08-09, phase 4a) — see services/contact_shares.ts. shared_by is
                // null: the sharer here is the portal attribution, not a person.
                await prisma.$transaction(async (tx) => {
                    await tx.contact.update({
                        where: { phone_number: contact.phone_number },
                        data: { shared_with_ids: { push: agent.id } },
                    });
                    await addContactShare(tx, {
                        tenantId: contact.tenant_id,
                        phone: contact.phone_number,
                        agentId: agent.id,
                        sharedBy: null,
                    });
                });
                shared = true;
                sharedAgentId = agent.id;
                logger.info(`[LeadReingest] ${opts.phone}: shared with ${agent.name} (${agent.id}) — re-attributed via ${opts.source}`);
            }
        }

        // Task 3: timeline marker for the repeat (always, on a dup re-ingest).
        await prisma.interaction.create({
            data: {
                tenant_id: contact.tenant_id,
                phone_number: contact.phone_number,
                channel: opts.source,
                direction: 'inbound',
                event_type: 'lead_regenerated',
                content: `Lead came in again from ${opts.source}${opts.subUser ? ` (advertised by ${opts.subUser})` : ''}${shared ? ' — shared with the attributed team member' : ''}`,
                metadata: { source: opts.source, sub_user: opts.subUser ?? null, attributed_agent_id: a, shared, shared_agent_id: sharedAgentId ?? null },
            },
        }).catch(() => {});

        return { shared, sharedAgentId };
    } catch (e) {
        logger.warn(`[LeadReingest] ${opts.phone} (${opts.source}) failed: ${(e as Error).message}`);
        return { shared: false };
    }
}
