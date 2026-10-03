/**
 * ensureDealForLead — Single source of truth for auto-creating a Deal on lead intake.
 *
 * Stage rule:
 *   - createdByAgentId set                                  → QUALIFIED  (team manually entered the lead)
 *   - source='partner_portal' AND partnerHasNameAndPhone    → QUALIFIED  (partner gave full identity)
 *   - everything else                                       → NEW        (AI must call & qualify)
 *
 * Idempotency:
 *   - With `sourceRef` (a property enquiry from a portal/website): ONE CONTACT → MANY LEADS. Every
 *     enquiry about a different property/source gets its own deal. Only a repeat of the SAME
 *     (source, sourceRef) within DUPLICATE_ENQUIRY_WINDOW_DAYS (default 30; 0 = never dedup)
 *     returns the existing deal. "Contact already exists" never blocks a new deal.
 *   - Without `sourceRef` (chat, manual, recycler): if the contact already has an active deal of
 *     the same type (status NOT IN CLOSED_WON, CLOSED_LOST, ON_HOLD), that deal is returned.
 *
 * Assignment: uses assignedAgentId if provided; otherwise falls back to
 * assignViaManagerRoundRobin().
 *
 * Side-effect: NEW deals trigger scheduleQualificationCall() so the Stage 1
 * KRA cadence (or Omnidim fallback template) kicks off without callers
 * needing to wire that themselves.
 */

import prisma from '../db';
import logger from '../utils/logger';
import { TransactionStatus, TransactionType } from '@prisma/client';
import { assignViaRoundRobin, assignViaManagerRoundRobin } from './lead_assignment';
import { assignContact } from './assign_contact';
import { syncLeadStageForContact } from './lead_stage_sync';
// foldLegacyDemand import retired in Phase 5 — Contact now carries the
// canonical demand_taxonomy_node_id + demand_schema_values directly.

export interface EnsureDealArgs {
    /** Contact phone number (E.164). Must already exist in `contacts`. */
    contactPhone: string;
    /** Where the lead came from. Free-form, stored on the deal. */
    source: string;
    /** When set (admin manual entry), deal lands in QUALIFIED. */
    createdByAgentId?: string;
    /** Pre-resolved assignment (e.g. portal-email match). When unset, falls back to manager round-robin. */
    assignedAgentId?: string | null;
    /** True when the lead is a partner referral. Used for deal_scenario. */
    isPartnerReferral?: boolean;
    /** For source=partner_portal: did the partner submit name AND phone of the customer?
     *  true → QUALIFIED, false → NEW (passed to team to gather missing info). */
    partnerHasNameAndPhone?: boolean;
    /** The enquired property/listing (portal listing_id, project, inventory id). Enables per-enquiry deals. */
    sourceRef?: string | null;
    /** This enquiry's own demand; overrides the contact-level values so lead #2 isn't a copy of lead #1. */
    demand?: { intent?: string | null; location?: string | null; budgetMin?: number | null; budgetMax?: number | null };
}

export interface EnsureDealResult {
    dealId: string;
    /** True when this call created the deal; false when an existing active deal was returned. */
    created: boolean;
    status: 'NEW' | 'QUALIFIED';
}

const ACTIVE_STATUSES: TransactionStatus[] = [
    'NEW' as TransactionStatus,
    'QUALIFIED' as TransactionStatus,
    'VISIT_SCHEDULED' as TransactionStatus,
    'VISITED' as TransactionStatus,
    'NEGOTIATION' as TransactionStatus,
];

export async function ensureDealForLead(args: EnsureDealArgs): Promise<EnsureDealResult> {
    const contact = await prisma.contact.findUnique({
        where: { phone_number: args.contactPhone },
    });
    if (!contact) {
        throw new Error(`ensureDealForLead: contact not found for ${args.contactPhone}`);
    }

    // Deal type from contact intent — derived up-front so the idempotency check is scoped to it.
    const intentLower = (args.demand?.intent || contact.intent || (contact as any).demand_intent || 'buy').toString().toLowerCase();
    const txType: TransactionType =
        intentLower === 'rent' || intentLower === 'rent_lease' ? ('RENT' as TransactionType) : ('SALE' as TransactionType);

    // Idempotency check — return the existing active deal of the SAME type if any. Scoping to
    // (contact, type) lets one client hold a buy (SALE) deal AND a rent (RENT) deal at once — partner
    // agents bring the same client multiple requirements. A second SALE on a SALE deal still dedups.
    const sourceRef = args.sourceRef ? String(args.sourceRef).trim() || null : null;
    const windowDays = Number(process.env.DUPLICATE_ENQUIRY_WINDOW_DAYS ?? 30);
    let existing: any = null;
    if (sourceRef) {
        if (windowDays > 0) {
            try {
                existing = await prisma.transaction.findFirst({
                    where: {
                        demand_contact_id: args.contactPhone,
                        source: args.source,
                        source_ref: sourceRef,
                        status: { in: ACTIVE_STATUSES },
                        created_at: { gte: new Date(Date.now() - windowDays * 86_400_000) },
                    },
                    orderBy: { created_at: 'desc' },
                    select: { id: true, status: true },
                });
            } catch (findErr: any) {
                if (String(findErr?.message || '').includes('source_ref')) {
                    try {
                        await (prisma as any).$executeRawUnsafe(`
                            ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "source_ref" TEXT;
                            CREATE INDEX IF NOT EXISTS "idx_transactions_source_ref" ON "transactions"("source_ref");
                        `);
                        existing = await prisma.transaction.findFirst({
                            where: {
                                demand_contact_id: args.contactPhone,
                                source: args.source,
                                source_ref: sourceRef,
                                status: { in: ACTIVE_STATUSES },
                                created_at: { gte: new Date(Date.now() - windowDays * 86_400_000) },
                            },
                            orderBy: { created_at: 'desc' },
                            select: { id: true, status: true },
                        });
                    } catch {
                        existing = null;
                    }
                } else {
                    throw findErr;
                }
            }
        } else {
            existing = null;
        }
    } else {
        existing = await prisma.transaction.findFirst({
            where: {
                demand_contact_id: args.contactPhone,
                type: txType,
                status: { in: ACTIVE_STATUSES },
            },
            orderBy: { created_at: 'desc' },
            select: { id: true, status: true },
        });
    }
    if (existing) {
        return {
            dealId: existing.id,
            created: false,
            status: existing.status as 'NEW' | 'QUALIFIED',
        };
    }

    // Stage decision
    let status: 'NEW' | 'QUALIFIED' = 'NEW';
    if (args.createdByAgentId) {
        status = 'QUALIFIED';
    } else if (args.source === 'partner_portal' && args.partnerHasNameAndPhone) {
        status = 'QUALIFIED';
    }

    // Assignment resolution — contact's assigned agent always wins; round-robin only when nobody is assigned
    let assignedAgentId = args.assignedAgentId ?? contact.assigned_agent_id ?? null;

    // RC2 fix (D1, 2026-05-17): an already-assigned contact is NEVER reassigned
    // here. Re-ingestion from another source/platform must keep the lead with
    // the team member already handling it. Round-robin runs ONLY when nobody is
    // assigned yet. The old "portal lead held by manager → round-robin to
    // employee" override was non-idempotent (advanced the RR pointer every
    // re-ingest) and flipped leads between members — removed entirely.
    // Managers reassign manually if a portal lead lands on them.
    // See docs/plans/2026-05-17-duplicate-lead-reassignment.md
    const PORTAL_SOURCES = ['99acres', 'housing', 'magicbricks', 'facebook'];
    const isPortalLead = PORTAL_SOURCES.includes(args.source);

    // A per-enquiry lead (sourceRef) on an already-owned contact with no attributed agent is routed
    // like a fresh lead — round-robin — instead of silently inheriting the contact owner. The contact
    // owner is NOT changed (no assignContact), only this lead's assignee.
    if (sourceRef && !args.assignedAgentId && contact.assigned_agent_id) {
        assignedAgentId = (isPortalLead ? await assignViaRoundRobin() : await assignViaManagerRoundRobin()) ?? contact.assigned_agent_id;
    }

    if (!assignedAgentId) {
        assignedAgentId = isPortalLead
            ? await assignViaRoundRobin()
            : await assignViaManagerRoundRobin();
        if (assignedAgentId) {
            // Both branches above are round-robin (employee pool vs manager pool) — the method is
            // 'round_robin' either way; only the agent pool differs. Phase 5C.
            await assignContact(args.contactPhone, assignedAgentId, 'round_robin');
        }
    }

    const dealScenario = args.isPartnerReferral ? 'PARTNER_INTERNAL' : 'DIRECT_INTERNAL';

    // Phase 5 (2026-05-29): legacy demand_property_type / demand_type_slug /
    // demand_bedrooms / demand_amenities / demand_category columns dropped on
    // Transaction. Canonical SoT for those values is now
    // demand_taxonomy_node_id + demand_schema_values, carried verbatim from
    // the Contact onto the Transaction.
    const canonicalNodeId: string | null = (contact as any).demand_taxonomy_node_id ?? null;
    const canonicalSchema: Record<string, any> | null =
        (contact as any).demand_schema_values ?? null;

    const dealData: any = {
        tenant_id: contact.tenant_id,
        demand_contact_id: args.contactPhone,
        type: txType,
        status: status as TransactionStatus,
        source: args.source,
        source_ref: sourceRef,
        coordinator_agent_id: assignedAgentId,
        executive_agent_id: assignedAgentId,
        deal_scenario: dealScenario,
        demand_intent: intentLower,
        demand_location: args.demand?.location ?? contact.preferred_location,
        demand_budget_min: args.demand?.budgetMin ?? (contact.budget_min ? Number(contact.budget_min) : null),
        demand_budget_max: args.demand?.budgetMax ?? (contact.budget_max ? Number(contact.budget_max) : null),
        demand_budget_type: (contact as any).demand_budget_type ?? null,
        demand_area_min: (contact as any).area_min ?? null,
        demand_area_max: (contact as any).area_max ?? null,
        demand_handler_type: 'DIRECT',
        demand_taxonomy_node_id: canonicalNodeId ?? undefined,
        demand_schema_values: (canonicalSchema ?? undefined) as any,
        ai_paused: false,
    };

    let deal: any;
    try {
        deal = await prisma.transaction.create({ data: dealData });
    } catch (createErr: any) {
        if (String(createErr?.message || '').includes('source_ref')) {
            try {
                await (prisma as any).$executeRawUnsafe(`
                    ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "source_ref" TEXT;
                    CREATE INDEX IF NOT EXISTS "idx_transactions_source_ref" ON "transactions"("source_ref");
                `);
                deal = await prisma.transaction.create({ data: dealData });
            } catch {
                delete dealData.source_ref;
                deal = await prisma.transaction.create({ data: dealData });
            }
        } else {
            throw createErr;
        }
    }
    // Deal CREATION is not a transition, so the sync hook in transitionTransaction never
    // fires here. Without this a deal born at a non-NEW status leaves its lead behind —
    // observed live 2026-08-10. Awaited, not best-effort: the contact row is guaranteed by
    // the required FK, so the only way this fails is a real fault worth surfacing.
    await syncLeadStageForContact(deal.demand_contact_id);
    try {
        const { refreshDealShortage } = await import('./shortage_book');
        await refreshDealShortage(deal.id);
    } catch (err) {
        logger.warn(`[ensureDealForLead] Shortage refresh skipped for ${deal.id}: ${(err as Error).message}`);
    }

    logger.info(`[ensureDealForLead] Created ${status} deal ${deal.id} for ${args.contactPhone} (source=${args.source}, assigned=${assignedAgentId})`);

    // Schedule AI qualification call cadence for NEW deals only — and only once per contact: a second
    // concurrent enquiry must not trigger a second AI call to the same customer.
    const otherNewDeal = status === 'NEW' && sourceRef
        ? await prisma.transaction.findFirst({
            where: { demand_contact_id: args.contactPhone, status: 'NEW' as TransactionStatus, id: { not: deal.id } },
            select: { id: true },
        })
        : null;
    if (status === 'NEW' && !otherNewDeal) {
        try {
            const { scheduleQualificationCall } = await import('./lead_qualification_caller');
            await scheduleQualificationCall(deal.id, 0);
        } catch (err) {
            logger.warn(`[ensureDealForLead] Failed to schedule qualification call for ${deal.id}: ${(err as Error).message}`);
        }
    }

    // New-lead "call within 30 min" reminder for the assigned team member (2026-05-27).
    // Creates a REMINDER task that the Google sync turns into a Calendar event + Google
    // Task (with a deep link to this deal) on the member's own account — opt-in, so it's
    // silent for members who haven't connected Google. Only on deal creation + when assigned.
    if (assignedAgentId) {
        try {
            const leadName = contact.name || args.contactPhone;
            const reminderTask = await prisma.task.create({
                data: {
                    title: `📞 Call new lead: ${leadName}`,
                    description: `New ${args.source} lead — call within 30 minutes. ${leadName} · ${args.contactPhone}`,
                    assigned_to: assignedAgentId,
                    due_date: new Date(Date.now() + 30 * 60 * 1000),
                    priority: 'HIGH',
                    status: 'TODO',
                    task_type: 'REMINDER',
                    deal_id: deal.id,
                    contact_phone: args.contactPhone,
                    tags: ['reminder', 'new-lead', 'call'],
                    stage_metadata: {
                        kind: 'new_lead_call',
                        advance_minutes: 30,
                        advance_fired: false,
                        due_fired: false,
                        source: args.source,
                    },
                } as any,
            });
            // Fire-and-forget Google Calendar + Tasks sync (no-op if member not connected).
            import('./google_sync')
                .then((m) => m.pushReminderToGoogle(reminderTask.id))
                .catch((err) => logger.error('[ensureDealForLead] google_sync hook error:', err));
        } catch (err) {
            logger.warn(`[ensureDealForLead] Failed to create new-lead call reminder for ${deal.id}: ${(err as Error).message}`);
        }
    }

    return { dealId: deal.id, created: true, status };
}
