/**
 * Deal Service (Phase 7)
 *
 * Wraps and extends the Transaction Service with 3-role deal structure:
 * - Demand Handler: whoever brought the customer (PARTNER, TEAM_MEMBER, DIRECT)
 * - Supply Handler: whoever uploaded the property (PARTNER, TEAM_MEMBER)
 * - Coordinator: internal Agent who manages the deal (always present)
 *
 * Every deal scenario:
 * - PARTNER_INTERNAL: Partner brings customer + team has inventory
 * - PARTNER_PARTNER: Partner brings customer + different partner has inventory
 * - DIRECT_INTERNAL: Direct customer + team inventory
 */

import { TransactionStatus, TransactionLogAction, TransactionType } from '@prisma/client';
import prisma from '../db';
import { partnerDealOr } from '../utils/partner_scope';
import { assignExecutive } from './executive_assigner';
import { findExistingTransaction } from './transaction_service';
import { MatchingEngine } from './matching_engine';
import { notifyDealEvent } from './deal_notifications';
import logger from '../utils/logger';

export type DealHandlerType = 'PARTNER' | 'TEAM_MEMBER' | 'DIRECT';
export type DealScenario = 'PARTNER_INTERNAL' | 'PARTNER_PARTNER' | 'DIRECT_INTERNAL';

export interface CreateDealInput {
    tenant_id: string;
    // Demand side
    demand_contact_id: string;
    demand_handler_type: DealHandlerType;
    demand_handler_id?: string; // PartnerAgent.id or Agent.id (null for DIRECT)
    // Supply side (optional at creation, filled on match)
    supply_contact_id?: string;
    supply_handler_type?: DealHandlerType;
    supply_handler_id?: string;
    inventory_id?: string;
    // Deal type
    type: TransactionType;
    source?: string;
    // Requirements. Phase 5 (2026-05-29): legacy demand_category /
    // demand_type_slug / demand_property_type / demand_bedrooms /
    // demand_amenities removed — those values live inside
    // demand_schema_values now (canonical SoT keyed by FieldDefinition.key).
    // demand_type_slug retained transiently as a write-only shim used by the
    // Contact.property_type back-compat label at create-time.
    demand_intent?: string;
    demand_type_slug?: string;
    demand_property_type?: string;
    demand_location?: string;
    demand_budget_min?: number;
    demand_budget_max?: number;
    demand_budget_type?: string;
    demand_notes?: string;
    demand_taxonomy_node_id?: string | null;
    demand_schema_values?: Record<string, any> | null;
}

export interface DealData {
    id: string;
    type: TransactionType;
    status: TransactionStatus;
    deal_scenario: DealScenario | null;
    demand_contact_id: string;
    supply_contact_id: string | null;
    coordinator_agent_id: string | null;
    demand_handler_type: string | null;
    demand_handler_id: string | null;
    supply_handler_type: string | null;
    supply_handler_id: string | null;
    inventory_id: string | null;
    created_at: Date;
    updated_at: Date;
}

/**
 * Determine the deal scenario from handler types
 */
function determineDealScenario(
    demandType: DealHandlerType,
    supplyType?: DealHandlerType
): DealScenario {
    if (demandType === 'DIRECT') return 'DIRECT_INTERNAL';
    if (demandType === 'PARTNER' && supplyType === 'PARTNER') return 'PARTNER_PARTNER';
    return 'PARTNER_INTERNAL';
}

/**
 * Create a new deal with 3-role structure
 */
export async function createDeal(
    input: CreateDealInput,
    performedBy: string,
    channel: string = 'system'
): Promise<{ deal: DealData; isDuplicate: boolean; matches: any[] }> {
    // 1. Check for duplicates
    const existing = await findExistingTransaction(
        input.demand_contact_id,
        input.inventory_id || undefined
    );

    if (existing) {
        await prisma.transactionLog.create({
            data: {
                transaction_id: existing.id,
                action: TransactionLogAction.DUPLICATE_BLOCKED,
                performed_by: performedBy,
                channel,
                details: {
                    attempted_type: input.type,
                    attempted_location: input.demand_location,
                    deal_handler_type: input.demand_handler_type,
                },
            },
        });
        return { deal: toDealData(existing), isDuplicate: true, matches: [] };
    }

    // 2. Determine scenario
    const dealScenario = determineDealScenario(
        input.demand_handler_type,
        input.supply_handler_type
    );

    // Per DEC-003 Stage 1 KRA: Internal team-member-sourced leads skip AI
    // qualification and enter QUALIFIED. Partner referrals + external/direct
    // inbound enter NEW (AI Pandit Ji must qualify via Omnidim).
    const initialStatus = input.demand_handler_type === 'TEAM_MEMBER'
        ? TransactionStatus.QUALIFIED
        : TransactionStatus.NEW;

    // 3. Create the transaction with deal fields
    const transaction = await prisma.transaction.create({
        data: {
            tenant_id: input.tenant_id,
            demand_contact_id: input.demand_contact_id,
            supply_contact_id: input.supply_contact_id || null,
            inventory_id: input.inventory_id || null,
            type: input.type,
            status: initialStatus,
            source: input.source || 'system',
            // 3-Role structure
            demand_handler_type: input.demand_handler_type,
            demand_handler_id: input.demand_handler_id || null,
            supply_handler_type: input.supply_handler_type || null,
            supply_handler_id: input.supply_handler_id || null,
            deal_scenario: dealScenario,
            // Requirement fields. Phase 5 (2026-05-29): legacy
            // demand_property_type / demand_bedrooms / demand_category /
            // demand_type_slug / demand_amenities columns dropped — those
            // values now live inside demand_schema_values (canonical SoT).
            demand_location: input.demand_location || null,
            demand_budget_min: input.demand_budget_min || null,
            demand_budget_max: input.demand_budget_max || null,
            demand_notes: input.demand_notes || null,
            demand_intent: input.demand_intent || null,
            demand_budget_type: input.demand_budget_type || null,
            demand_taxonomy_node_id: input.demand_taxonomy_node_id ?? undefined,
            demand_schema_values: (input.demand_schema_values ?? undefined) as any,
        },
    });

    // 4. Log creation
    await prisma.transactionLog.create({
        data: {
            transaction_id: transaction.id,
            action: TransactionLogAction.CREATED,
            new_status: initialStatus,
            performed_by: performedBy,
            channel,
            details: {
                deal_scenario: dealScenario,
                demand_handler_type: input.demand_handler_type,
                demand_handler_id: input.demand_handler_id,
                type: input.type,
                location: input.demand_location,
            },
        },
    });

    // 5. Auto-assign coordinator (reuses executive_assigner)
    try {
        const coordinator = await assignExecutive(transaction);
        if (coordinator) {
            await prisma.transaction.update({
                where: { id: transaction.id },
                data: {
                    coordinator_agent_id: coordinator.id,
                    executive_agent_id: coordinator.id, // Keep backward compat
                },
            });
            await prisma.transactionLog.create({
                data: {
                    transaction_id: transaction.id,
                    action: TransactionLogAction.EXECUTIVE_ASSIGNED,
                    performed_by: 'system',
                    channel: 'system',
                    details: {
                        coordinator_id: coordinator.id,
                        coordinator_name: coordinator.name,
                        assignment_method: 'auto',
                        role: 'coordinator',
                    },
                },
            });
            (transaction as any).coordinator_agent_id = coordinator.id;
            (transaction as any).executive_agent_id = coordinator.id;
        }
    } catch (err) {
        logger.error('[DealService] Auto-assign coordinator failed:', err);
    }

    // 6. Run matching engine if no inventory linked yet
    let matches: any[] = [];
    if (!input.inventory_id) {
        try {
            const matchingEngine = new MatchingEngine();
            matches = await matchingEngine.findMatches({
                intent: input.demand_intent === 'rent_lease' ? 'rent' : 'buy',
                property_type: input.demand_type_slug || input.demand_property_type || undefined,
                budget_min: input.demand_budget_min || undefined,
                budget_max: input.demand_budget_max || undefined,
                preferred_location: input.demand_location || undefined,
            }, 5);
        } catch (err) {
            logger.error('[DealService] Matching engine failed:', err);
        }
    }

    // 7. Notify deal created (async - don't block response)
    notifyDealEvent({ dealId: transaction.id, event: 'created' }).catch(err =>
        logger.error('[DealService] Notification failed:', err)
    );

    // 8. Stage 1 NEW: fire buyer-arrival WhatsApp + schedule AI qualification call cadence.
    //    Skip for Internal (TEAM_MEMBER) — they enter QUALIFIED directly per DEC-003 KRA.
    if (initialStatus === TransactionStatus.NEW) {
        try {
            const contact = await prisma.contact.findUnique({
                where: { phone_number: input.demand_contact_id },
                select: { phone_number: true, name: true },
            });
            if (contact?.phone_number) {
                const { sendBuyerConfirmationWhatsApp } = await import('./lead_notifications');
                sendBuyerConfirmationWhatsApp(contact.phone_number, contact.name || null, input.source || 'system')
                    .catch(err => logger.warn('[DealService] Arrival WhatsApp failed:', err));

                const { scheduleQualificationCall } = await import('./lead_qualification_caller');
                scheduleQualificationCall(transaction.id, 0)
                    .catch(err => logger.warn('[DealService] Qualification call schedule failed:', err));
            }
        } catch (err) {
            logger.error('[DealService] NEW-stage automation failed:', err);
        }
    }

    return { deal: toDealData(transaction), isDuplicate: false, matches };
}

/**
 * Link a property + supply handler to an existing deal
 */
export async function matchPropertyToDeal(
    dealId: string,
    inventoryId: string,
    supplyContactId: string,
    supplyHandlerType: DealHandlerType,
    supplyHandlerId: string,
    performedBy: string
): Promise<DealData> {
    // Get current deal to determine scenario
    const current = await prisma.transaction.findUnique({ where: { id: dealId } });
    if (!current) throw new Error(`Deal ${dealId} not found`);

    const newScenario = determineDealScenario(
        (current.demand_handler_type as DealHandlerType) || 'DIRECT',
        supplyHandlerType
    );

    const updated = await prisma.transaction.update({
        where: { id: dealId },
        data: {
            supply_contact_id: supplyContactId,
            inventory_id: inventoryId,
            supply_handler_type: supplyHandlerType,
            supply_handler_id: supplyHandlerId,
            deal_scenario: newScenario,
            status: TransactionStatus.QUALIFIED,
        },
    });

    await prisma.transactionLog.create({
        data: {
            transaction_id: dealId,
            action: TransactionLogAction.STATUS_CHANGED,
            old_status: current.status,
            new_status: TransactionStatus.QUALIFIED,
            performed_by: performedBy,
            channel: 'system',
            details: {
                event: 'property_matched',
                inventory_id: inventoryId,
                supply_handler_type: supplyHandlerType,
                supply_handler_id: supplyHandlerId,
                deal_scenario: newScenario,
            },
        },
    });

    // Notify property matched (async)
    notifyDealEvent({ dealId, event: 'matched' }).catch(err =>
        logger.error('[DealService] Match notification failed:', err)
    );

    return toDealData(updated);
}

/**
 * Get deal by ID with full details including parties
 */
export async function getDealById(dealId: string) {
    const deal = await prisma.transaction.findUnique({
        where: { id: dealId },
        include: {
            demand_contact: { select: { phone_number: true, name: true, email: true, contact_type: true, demand_taxonomy_node_id: true, demand_schema_values: true, budget_min: true, budget_max: true, area_min: true, area_max: true, intent: true, preferred_location: true, referral_partner_id: true, referral_partner_name: true, referral_partner_phone: true } },
            supply_contact: { select: { phone_number: true, name: true, email: true, contact_type: true } },
            executive_agent: { select: { id: true, name: true, email: true, phone: true, department: true } },
            coordinator: { select: { id: true, name: true, email: true, phone: true, department: true } },
            inventory: {
                select: {
                    id: true, type: true, category: true, location: true, price: true,
                    status: true, specs: true, media_urls: true,
                    owner_phone: true,
                    contact: { select: { name: true, phone_number: true } },
                    key_holder_name: true, key_holder_phone: true,
                    key_holder_contact: { select: { name: true, phone_number: true } },
                    assigned_agent: { select: { id: true, name: true, phone: true } },
                },
            },
            logs: { orderBy: { created_at: 'desc' }, take: 50 },
            appointments: { orderBy: { scheduled_at: 'desc' }, take: 10 },
            queries: { orderBy: { created_at: 'desc' } },
        },
    });
    if (!deal) return null;

    // Compute ai_status based on paused flag and last team action recency
    const twoHoursMs = 2 * 60 * 60 * 1000;
    const ai_status: 'active' | 'waiting' | 'paused' = deal.ai_paused
        ? 'paused'
        : deal.last_team_action_at && (Date.now() - deal.last_team_action_at.getTime()) < twoHoursMs
            ? 'waiting'
            : 'active';

    return { ...deal, ai_status };
}

/**
 * Get unified deal timeline (logs + queries + appointments)
 */
export async function getDealTimeline(dealId: string) {
    const deal = await prisma.transaction.findUnique({
        where: { id: dealId },
        select: { demand_contact_id: true },
    });

    const contactPhone = deal?.demand_contact_id;

    const [logs, queries, appointments, teamActions, waMessages, voiceCalls, interactions, contact] = await Promise.all([
        prisma.transactionLog.findMany({
            where: { transaction_id: dealId },
            orderBy: { created_at: 'desc' },
        }),
        prisma.dealQuery.findMany({
            where: { transaction_id: dealId },
            orderBy: { created_at: 'desc' },
        }),
        prisma.appointment.findMany({
            where: { transaction_id: dealId },
            orderBy: { scheduled_at: 'desc' },
        }),
        prisma.teamAction.findMany({
            where: { transaction_id: dealId },
            include: { agent: { select: { name: true, role: true } } },
            orderBy: { created_at: 'desc' },
        }),
        contactPhone ? prisma.whatsAppMessage.findMany({
            where: { phone_number: contactPhone },
            orderBy: { created_at: 'desc' },
            take: 100,
        }) : Promise.resolve([]),
        contactPhone ? prisma.voiceCall.findMany({
            where: { phone_number: contactPhone },
            orderBy: { started_at: 'desc' },
            take: 50,
        }) : Promise.resolve([]),
        prisma.interaction.findMany({
            where: { metadata: { path: ['deal_id'], equals: dealId } },
            orderBy: { created_at: 'desc' },
            take: 100,
        }),
        contactPhone ? prisma.contact.findUnique({
            where: { phone_number: contactPhone },
            select: {
                source: true, name: true, intent: true, property_type: true,
                budget_min: true, budget_max: true, preferred_location: true,
                notes: true, created_at: true, created_by: true,
                meta_campaign_name: true, referral_partner_name: true,
            },
        }) : Promise.resolve(null),
    ]);

    // Resolve performed_by (phone numbers, agent IDs) to display names
    const performedByValues = [...new Set(logs.map(l => l.performed_by).filter(Boolean))] as string[];
    const [contactsByPhone, agentsById] = performedByValues.length
        ? await Promise.all([
            prisma.contact.findMany({
                where: { phone_number: { in: performedByValues } },
                select: { phone_number: true, name: true },
            }),
            prisma.agent.findMany({
                where: { id: { in: performedByValues } },
                select: { id: true, name: true },
            }),
        ])
        : [[], []];
    const contactNameMap = new Map((contactsByPhone as any[]).map(c => [c.phone_number, c.name]));
    const agentNameMap = new Map((agentsById as any[]).map(a => [a.id, a.name]));

    function resolvePerformedBy(pb: string | null | undefined): string | null {
        if (!pb) return null;
        if (agentNameMap.has(pb)) return agentNameMap.get(pb)!;
        if (contactNameMap.has(pb)) return contactNameMap.get(pb) || 'Customer';
        if (/^\+?\d{10,13}$/.test(pb.replace(/\s/g, ''))) return 'Customer';
        return pb;
    }

    const timeline = [
        ...logs.map(l => ({
            source: 'log' as const, id: l.id,
            action: l.action, old_status: l.old_status, new_status: l.new_status,
            details: l.details, performed_by: resolvePerformedBy(l.performed_by), channel: l.channel,
            created_at: l.created_at,
        })),
        ...queries.map(q => ({
            source: 'query' as const, id: q.id,
            subject: q.subject, message: q.message, status: q.status,
            answer: q.answer, raised_by_type: q.raised_by_type,
            created_at: q.created_at,
        })),
        ...appointments.map(a => ({
            source: 'appointment' as const, id: a.id,
            appointment_type: a.type, status: a.status, scheduled_at: a.scheduled_at,
            created_at: a.created_at,
        })),
        ...teamActions.map(t => ({
            source: 'team_action' as const, id: t.id,
            action_type: t.action_type, outcome: t.outcome, notes: t.notes,
            stage: t.stage, agent_name: t.agent?.name, agent_role: t.agent?.role,
            created_at: t.created_at,
        })),
        ...waMessages.map(m => ({
            source: 'whatsapp' as const, id: m.id,
            direction: m.direction, body: m.body ? m.body.substring(0, 100) : null,
            message_type: m.message_type, status: m.status,
            template_name: (m as any).template_name ?? null,
            created_at: m.created_at,
        })),
        ...voiceCalls.map(c => ({
            source: 'call' as const, id: c.id,
            direction: c.direction, call_status: c.call_status,
            duration: c.duration, ai_call_summary: c.ai_call_summary,
            created_at: c.started_at,
        })),
        ...interactions.map((i: any) => ({
            source: 'interaction' as const, id: i.id,
            event_type: i.event_type, direction: i.direction, channel: i.channel,
            content: i.content, metadata: i.metadata,
            created_at: i.created_at,
        })),
        // Synthetic lead-origin event — always the oldest entry in the timeline
        ...(contact ? [{
            source: 'lead_origin' as const,
            id: `origin-${dealId}`,
            lead_source: contact.source || 'manual',
            contact_name: contact.name || null,
            intent: contact.intent || null,
            property_type: contact.property_type || null,
            budget_min: contact.budget_min ? Number(contact.budget_min) : null,
            budget_max: contact.budget_max ? Number(contact.budget_max) : null,
            preferred_location: contact.preferred_location || null,
            notes: contact.notes || null,
            meta_campaign_name: contact.meta_campaign_name || null,
            referral_partner_name: contact.referral_partner_name || null,
            created_at: contact.created_at,
        }] : []),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return timeline;
}

/**
 * List deals with filters
 */
export async function listDeals(filters: {
    tenant_id: string;
    status?: TransactionStatus;
    deal_scenario?: DealScenario;
    coordinator_agent_id?: string;
    /** Visibility scope (2026-06-27): restrict to deals where coordinator OR executive ∈ team_ids
     *  (manager = self + direct reports, employee = [self]). Omitted for super_boss (sees all). */
    team_ids?: string[];
    /** PARTNER scope (2026-07-13): an external partner is NOT an Agent, so team_ids never matches.
     *  Restrict instead to deals they handle OR deals from leads they referred (incl. sub-agents). */
    partner_ids?: string[];
    demand_handler_id?: string;
    supply_handler_id?: string;
    min_priority?: number;
    page?: number;
    limit?: number;
    search?: string;
    taxonomy_node_ids?: string;
    bhk?: string;
    hide_closed?: boolean;
    /** Ordering (2026-07-21): 'next_action' (default) | 'lead_date' | 'reminder_date' */
    sort?: string;
    /** 'asc' | 'desc' — omitted falls back to the per-key default */
    direction?: string;
}) {
    const { tenant_id, status, deal_scenario, coordinator_agent_id, team_ids, partner_ids, demand_handler_id, supply_handler_id, min_priority, page = 1, limit = 20, search, taxonomy_node_ids, bhk, hide_closed, sort, direction } = filters;

    const where: any = { tenant_id };
    if (status) {
        where.status = status;
    } else if (hide_closed && !(search && String(search).trim())) {
        // 2026-05-13: kanban columns already segment stages, but CLOSED_WON +
        // CLOSED_LOST are clutter for daily work. Hide by default; reveal via toggle.
        // #2 (2026-07-01): when the user is SEARCHING, DON'T hide Won/Lost — otherwise a search
        // for a past (esp. Won) client returns nothing. Search spans all stages.
        // 2026-07-21: ON_HOLD added — it was only dropped from the kanban COLUMN list
        // client-side, so 145 on-hold deals still leaked into the mobile + list views.
        where.status = { notIn: ['CLOSED_WON', 'CLOSED_LOST', 'ON_HOLD'] };
    }
    if (deal_scenario) where.deal_scenario = deal_scenario;
    if (coordinator_agent_id) where.coordinator_agent_id = coordinator_agent_id;
    // Team-scoped visibility: the deal is handled by this agent or someone on their team.
    if (team_ids && team_ids.length) {
        where.AND = [...(where.AND || []), { OR: [
            { coordinator_agent_id: { in: team_ids } },
            { executive_agent_id: { in: team_ids } },
        ] }];
    }
    // PARTNER scope: their own deals only. Uses the SAME OR-builder as the per-deal guard
    // (partnerOwnsDealOr403) — never hand-copy it, or the list and the guard drift apart.
    if (partner_ids && partner_ids.length) {
        where.AND = [...(where.AND || []), { OR: partnerDealOr(partner_ids) }];
    }
    if (demand_handler_id) where.demand_handler_id = demand_handler_id;
    if (supply_handler_id) where.supply_handler_id = supply_handler_id;
    if (min_priority !== undefined && !Number.isNaN(min_priority)) where.priority = { gte: min_priority };

    // 2026-05-13: search was previously a no-op (frontend sent it, backend ignored).
    // Match against demand_contact.name + demand_contact.phone_number (3 variants)
    // and supply_contact for completeness.
    if (search && search.trim()) {
        // Tokenized multi-term search (2026-06-06): each term must match the contact (name / phone /
        // preferred area) OR the linked property's address — in any word order/punctuation. Adds
        // address search to deals (previously name+phone only) so "Vaishali", "Ganga tower Ghaziabad"
        // etc. find the deal whether the property is linked or only a preferred_location is set.
        const { extractSearchDigits, phoneVariants } = await import('../utils/phone');
        const terms = search.trim().split(/[\s,]+/).map(t => t.trim()).filter(Boolean);
        const termGroups = terms.map(term => {
            const ic = (field: string) => ({ [field]: { contains: term, mode: 'insensitive' as const } });
            const phoneOr: any[] = [];
            const digits = extractSearchDigits(term);
            if (digits) for (const v of [...phoneVariants(digits), digits]) phoneOr.push({ phone_number: { contains: v } });
            return {
                OR: [
                    { demand_contact: { OR: [ic('name'), ic('preferred_location'), ...phoneOr] } },
                    { supply_contact: { OR: [ic('name'), ...phoneOr] } },
                    { inventory: { OR: ['location', 'locality', 'city', 'district', 'apartment_name', 'full_address'].map(ic) } },
                ],
            };
        });
        where.AND = [...(where.AND || []), ...termGroups];
    }

    // Taxonomy filter (new tree): the deal's demand contact node IN (selected + descendants).
    if (taxonomy_node_ids && taxonomy_node_ids.trim()) {
        const { expandTaxonomyNodeIds } = await import('../utils/taxonomy_filter');
        const expanded = await expandTaxonomyNodeIds(taxonomy_node_ids.split(',').map(s => s.trim()).filter(Boolean));
        if (expanded.length) where.AND = [...(where.AND || []), { demand_contact: { demand_taxonomy_node_id: { in: expanded } } }];
    }

    // BHK filter — demand BHK lives in demand_contact.demand_schema_values.bhk (string-typed).
    if (bhk && bhk.trim()) {
        const bhkValues = bhk.split(',').map(v => parseInt(v.trim(), 10)).filter(n => !isNaN(n));
        if (bhkValues.length) {
            where.AND = [...(where.AND || []), {
                demand_contact: { OR: bhkValues.map(v => ({ demand_schema_values: { path: ['bhk'], equals: String(v) } })) },
            }];
        }
    }

    const skip = (page - 1) * limit;

    // ─── Server-side ordering (2026-07-21) ──────────────────────────────────────
    // Was: orderBy updated_at desc + take(limit). With ~4k active deals and the board
    // requesting 500, ANY write (AI reply, webhook, cron) bumped updated_at and changed
    // WHICH rows came back — 3,114 of 3,603 deals holding a pending reminder (86%) never
    // appeared on the board at all. Order across the WHOLE filtered set, then page.
    //   next_action (default) — overdue → soonest upcoming → no-reminder (newest lead first)
    //   lead_date             — created_at (default newest first)
    //   reminder_date         — pending reminder due_date; no-reminder deals always LAST
    const allRows = await prisma.transaction.findMany({ where, select: { id: true, created_at: true } });
    const total = allRows.length;
    const allIds = allRows.map(r => r.id);
    const createdMs: Record<string, number> = {};
    for (const r of allRows) createdMs[r.id] = r.created_at ? r.created_at.getTime() : 0;

    // Next PENDING reminder per deal across the whole filtered set — this drives the order.
    // (Same query shape as the old per-page fetch, just widened to every matching deal.)
    const allReminders = allIds.length ? await prisma.task.findMany({
        where: { deal_id: { in: allIds }, task_type: 'REMINDER', status: 'TODO' },
        select: { deal_id: true, due_date: true, description: true },
        orderBy: { due_date: 'asc' },
    }) : [];
    const reminderByDeal: Record<string, { due_date: Date | null; description: string | null }> = {};
    for (const t of allReminders) {
        if (t.deal_id && !reminderByDeal[t.deal_id]) reminderByDeal[t.deal_id] = { due_date: t.due_date, description: t.description };
    }
    const remMs = (id: string): number | null => {
        const d = reminderByDeal[id]?.due_date;
        return d ? new Date(d as any).getTime() : null;
    };

    const rawDir = direction === 'asc' ? 1 : direction === 'desc' ? -1 : 0;
    const orderedIds = [...allIds];
    if (sort === 'lead_date') {
        const d = rawDir === 0 ? -1 : rawDir; // default: newest lead first
        orderedIds.sort((a, b) => (createdMs[a] - createdMs[b]) * d);
    } else if (sort === 'reminder_date') {
        const d = rawDir === 0 ? 1 : rawDir; // default: oldest / most-overdue reminder first
        orderedIds.sort((a, b) => {
            const ra = remMs(a), rb = remMs(b);
            if (ra === null && rb === null) return createdMs[b] - createdMs[a];
            if (ra === null) return 1;  // no pending reminder always sinks, both directions
            if (rb === null) return -1;
            return (ra - rb) * d;
        });
    } else {
        // next_action (default): overdue first, then soonest upcoming, then no-reminder newest-first
        orderedIds.sort((a, b) => {
            const ra = remMs(a), rb = remMs(b);
            if (ra !== null && rb !== null) return ra - rb;
            if (ra !== null) return -1;
            if (rb !== null) return 1;
            return createdMs[b] - createdMs[a];
        });
    }

    const pageIds = orderedIds.slice(skip, skip + limit);

    const rawUnordered = pageIds.length ? await prisma.transaction.findMany({
        where: { id: { in: pageIds } },
        include: {
            demand_contact: {
                select: {
                    phone_number: true, name: true, contact_type: true,
                    // Phase 5: legacy demand_main_category / demand_category /
                    // demand_type_slug / demand_amenities / demand_bhk dropped.
                    // Canonical SoT is taxonomy_node_id + schema_values.
                    demand_taxonomy_node_id: true, demand_schema_values: true,
                    area_min: true, area_max: true, area_unit: true,
                    timeline: true, budget_min: true, budget_max: true,
                    category_id: true, sub_category_id: true, type_id: true,
                    intent: true, preferred_location: true,
                    referral_partner_id: true, referral_partner_name: true, referral_partner_phone: true,
                },
            },
            supply_contact: { select: { phone_number: true, name: true } },
            coordinator: { select: { id: true, name: true, phone: true } },
            inventory: { select: { id: true, type: true, location: true, price: true, media_urls: true } },
            // Latest non-terminal appointment → powers the board "visit requested vs booked" chip (QUALIFIED-1).
            appointments: {
                where: { status: { notIn: ['cancelled', 'completed', 'no_show'] } },
                orderBy: { scheduled_at: 'desc' }, take: 1,
                select: { status: true, scheduled_at: true },
            },
            // Latest human action → powers the tile's "last team action" line (2026-06-26).
            team_actions: {
                take: 1,
                orderBy: { created_at: 'desc' },
                select: { action_type: true, outcome: true, created_at: true, agent: { select: { name: true } } },
            },
        },
    }) : [];
    // findMany({ id: { in: … } }) does NOT preserve order — re-apply the computed ranking.
    const dealById: Record<string, any> = {};
    for (const d of rawUnordered) dealById[d.id] = d;
    const rawDeals = pageIds.map(id => dealById[id]).filter(Boolean);

    // Derived no-answer count per deal (gates Close/Reassign at N=4). Page-scoped, batched.
    const pageDemandPhones = rawDeals.map(d => d.demand_contact?.phone_number).filter(Boolean) as string[];
    const noAnswerInteractions = pageDemandPhones.length ? await prisma.interaction.findMany({
        where: {
            phone_number: { in: pageDemandPhones },
            event_type: 'human_call_outcome',
            metadata: { path: ['outcome'], equals: 'NO_ANSWER' },
        },
        select: { metadata: true },
    }) : [];
    const noAnswerByDeal: Record<string, number> = {};
    for (const it of noAnswerInteractions) {
        const did = (it.metadata as any)?.deal_id;
        if (did) noAnswerByDeal[did] = (noAnswerByDeal[did] || 0) + 1;
    }

    const twoHoursMs = 2 * 60 * 60 * 1000;
    const deals = rawDeals.map(deal => {
        const ai_status: 'active' | 'waiting' | 'paused' = deal.ai_paused
            ? 'paused'
            : deal.last_team_action_at && (Date.now() - deal.last_team_action_at.getTime()) < twoHoursMs
            ? 'waiting'
            : 'active';
        return {
            ...deal,
            ai_status,
            next_reminder: reminderByDeal[deal.id] || null,
            no_answer_count: noAnswerByDeal[deal.id] || 0,
        };
    });

    return {
        deals,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

/**
 * Get pipeline stats grouped by status
 */
export async function getDealPipelineStats(tenantId: string, teamIds?: string[], partnerIds?: string[]) {
    const where: any = { tenant_id: tenantId };
    // PARTNER scope (2026-07-13): partners aren't Agents, so teamIds never matches — scope the column
    // counts to THEIR deals, using the shared OR-builder (single source of truth).
    if (partnerIds && partnerIds.length) {
        where.OR = partnerDealOr(partnerIds);
    } else if (teamIds && teamIds.length) {
        // Visibility (2026-06-27): scope the column counts to the agent's team (omit for super_boss).
        where.OR = [
            { coordinator_agent_id: { in: teamIds } },
            { executive_agent_id: { in: teamIds } },
        ];
    }
    const stats = await prisma.transaction.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
    });

    const pipeline: Record<string, number> = {};
    for (const s of stats) {
        pipeline[s.status] = s._count.id;
    }
    return pipeline;
}

// ─── Helper ────────────────────────────────────────────────────

function toDealData(tx: any): DealData {
    return {
        id: tx.id,
        type: tx.type,
        status: tx.status,
        deal_scenario: tx.deal_scenario || null,
        demand_contact_id: tx.demand_contact_id,
        supply_contact_id: tx.supply_contact_id,
        coordinator_agent_id: tx.coordinator_agent_id || tx.executive_agent_id,
        demand_handler_type: tx.demand_handler_type,
        demand_handler_id: tx.demand_handler_id,
        supply_handler_type: tx.supply_handler_type,
        supply_handler_id: tx.supply_handler_id,
        inventory_id: tx.inventory_id,
        created_at: tx.created_at,
        updated_at: tx.updated_at,
    };
}
