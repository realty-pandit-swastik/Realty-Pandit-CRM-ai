/**
 * Duplicate-enquiry timeline marker.
 *
 * ONE CONTACT → MANY LEADS: when a known contact enquires again (e.g. first 99acres, later
 * MagicBricks) the intake path now creates a NEW lead (deal) via ensureDealForLead, assigned to the
 * agent this enquiry is attributed to. The contact is no longer "shared" with that agent as a
 * substitute for a lead — manual sharing (POST /api/leads/:phone/share) is unchanged.
 *
 * This only records a `lead_regenerated` interaction so the contact timeline shows the repeat.
 */
import prisma from '../db';
import logger from '../utils/logger';

export async function recordLeadReingest(opts: {
    phone: string;
    source: string;                       // '99acres' | 'magicbricks' | 'housing' | ...
    attributedAgentId?: string | null;    // team member this enquiry is attributed to (from sub_user), if resolved
    subUser?: string | null;              // raw sub_user/email for the timeline record
    sourceRef?: string | null;            // property/listing the enquiry was about
}): Promise<void> {
    try {
        const contact = await prisma.contact.findUnique({
            where: { phone_number: opts.phone },
            select: { phone_number: true, tenant_id: true },
        });
        if (!contact) return;
        await prisma.interaction.create({
            data: {
                tenant_id: contact.tenant_id,
                phone_number: contact.phone_number,
                channel: opts.source,
                direction: 'inbound',
                event_type: 'lead_regenerated',
                content: `New enquiry from ${opts.source}${opts.sourceRef ? ` for ${opts.sourceRef}` : ''}${opts.subUser ? ` (advertised by ${opts.subUser})` : ''}`,
                metadata: { source: opts.source, source_ref: opts.sourceRef ?? null, sub_user: opts.subUser ?? null, attributed_agent_id: opts.attributedAgentId ?? null },
            },
        }).catch(() => {});
    } catch (e) {
        logger.warn(`[LeadReingest] ${opts.phone} (${opts.source}) failed: ${(e as Error).message}`);
    }
}

/**
 * Dedupe-hit marker (2026-10-09). A repeat enquiry for the SAME listing inside the dedupe
 * window attaches to the existing deal instead of spawning a duplicate — but that re-engagement
 * is still real work arriving today, so it gets its own timeline row naming the attached deal.
 * Without this the row visibly never changes and the enquiry looks lost ("same !!!").
 */
export async function recordLeadReengaged(opts: {
    phone: string;
    source: string;
    sourceRef?: string | null;
    dealId: string;
    attributedAgentId?: string | null;
}): Promise<void> {
    try {
        const contact = await prisma.contact.findUnique({
            where: { phone_number: opts.phone },
            select: { phone_number: true, tenant_id: true },
        });
        if (!contact) return;
        await prisma.interaction.create({
            data: {
                tenant_id: contact.tenant_id,
                phone_number: contact.phone_number,
                channel: opts.source,
                direction: 'inbound',
                event_type: 'lead_reengaged',
                content: `Customer enquired again via ${opts.source}${opts.sourceRef ? ` for ${opts.sourceRef}` : ''} — attached to existing deal`,
                metadata: {
                    source: opts.source, source_ref: opts.sourceRef ?? null,
                    deal_id: opts.dealId, attributed_agent_id: opts.attributedAgentId ?? null,
                },
            },
        }).catch(() => {});
    } catch (e) {
        logger.warn(`[LeadReingest] reengaged marker failed for ${opts.phone} (${opts.source}): ${(e as Error).message}`);
    }
}
