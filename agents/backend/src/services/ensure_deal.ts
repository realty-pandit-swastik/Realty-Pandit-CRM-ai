/**
 * ensureDealForLead — Single source of truth for auto-creating a Deal on lead intake.
 *
 * Stage rule:
 *   - createdByAgentId set                                  → QUALIFIED  (team manually entered the lead)
 *   - source='partner_portal' AND partnerHasNameAndPhone    → QUALIFIED  (partner gave full identity)
 *   - everything else                                       → NEW        (AI must call & qualify)
 *
 * Idempotency: if the contact already has an active deal (status NOT IN
 * CLOSED_WON, CLOSED_LOST, ON_HOLD), this returns that deal unchanged.
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
    const intentLower = (contact.intent || (contact as any).demand_intent || 'buy').toString().toLowerCase();
    const txType: TransactionType =
        intentLower === 'rent' || intentLower === 'rent_lease' ? ('RENT' as TransactionType) : ('SALE' as TransactionType);

    // Idempotency check — return the existing active deal of the SAME type if any. Scoping to
    // (contact, type) lets one client hold a buy (SALE) deal AND a rent (RENT) deal at once — partner
    // agents bring the same client multiple requirements. A second SALE on a SALE deal still dedups.
    const existing = await prisma.transaction.findFirst({
        where: {
            demand_contact_id: args.contactPhone,
            type: txType,
            status: { in: ACTIVE_STATUSES },
        },
        orderBy: { created_at: 'desc' },
        select: { id: true, status: true },
    });
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

    if (!assignedAgentId) {
        assignedAgentId = isPortalLead
            ? await assignViaRoundRobin()
            : await assignViaManagerRoundRobin();
        if (assignedAgentId) {
            await prisma.contact.update({
                where: { phone_number: args.contactPhone },
                data: { assigned_agent_id: assignedAgentId },
            });
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

    const deal = await prisma.transaction.create({
        data: {
            tenant_id: contact.tenant_id,
            demand_contact_id: args.contactPhone,
            type: txType,
            status: status as TransactionStatus,
            source: args.source,
            coordinator_agent_id: assignedAgentId,
            executive_agent_id: assignedAgentId,
            deal_scenario: dealScenario,
            demand_intent: intentLower,
            demand_location: contact.preferred_location,
            demand_budget_min: contact.budget_min ? Number(contact.budget_min) : null,
            demand_budget_max: contact.budget_max ? Number(contact.budget_max) : null,
            demand_budget_type: (contact as any).demand_budget_type ?? null,
            demand_area_min: (contact as any).area_min ?? null,
            demand_area_max: (contact as any).area_max ?? null,
            demand_handler_type: 'DIRECT',
            demand_taxonomy_node_id: canonicalNodeId ?? undefined,
            demand_schema_values: (canonicalSchema ?? undefined) as any,
            ai_paused: false,
        },
    });

    logger.info(`[ensureDealForLead] Created ${status} deal ${deal.id} for ${args.contactPhone} (source=${args.source}, assigned=${assignedAgentId})`);

    // Schedule AI qualification call cadence for NEW deals only
    if (status === 'NEW') {
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
