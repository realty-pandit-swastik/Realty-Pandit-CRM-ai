import prisma from '../db';
import { MatchingEngine } from './matching_engine';
import logger from '../utils/logger';

const CLOSED = ['CLOSED_WON', 'CLOSED_LOST', 'CANCELLED'];

export async function refreshDealShortage(dealId: string): Promise<void> {
    const deal = await prisma.transaction.findUnique({
        where: { id: dealId },
        include: { demand_contact: { select: {
            assigned_agent_id: true, intent: true, preferred_location: true,
            preferred_lat: true, preferred_lng: true, budget_min: true, budget_max: true,
            demand_taxonomy_node_id: true, demand_schema_values: true,
        } } },
    });
    if (!deal) return;
    if (CLOSED.includes(deal.status) || deal.inventory_id) {
        await prisma.shortageEntry.updateMany({ where: { deal_id: dealId }, data: { status: 'RESOLVED' } });
        return;
    }
    const c = deal.demand_contact;
    const area = c?.preferred_location || deal.demand_location;
    const schema = c?.demand_schema_values || deal.demand_schema_values;
    const hasSavedRequirement = !!(
        area || c?.budget_min != null || c?.budget_max != null ||
        deal.demand_budget_min != null || deal.demand_budget_max != null ||
        c?.demand_taxonomy_node_id || deal.demand_taxonomy_node_id ||
        (schema && typeof schema === 'object' && Object.keys(schema).length > 0) ||
        deal.demand_area_min != null || deal.demand_area_max != null
    );
    if (!hasSavedRequirement) {
        await prisma.shortageEntry.updateMany({ where: { deal_id: dealId }, data: { status: 'RESOLVED' } });
        return;
    }
    const demand = {
        intent: c?.intent || deal.demand_intent || 'buy',
        budget_min: c?.budget_min == null ? deal.demand_budget_min : Number(c.budget_min),
        budget_max: c?.budget_max == null ? deal.demand_budget_max : Number(c.budget_max),
        taxonomy_node_id: c?.demand_taxonomy_node_id || deal.demand_taxonomy_node_id,
        schema_values: schema,
    };
    // Three results are enough to decide whether this demand is short.
    const matches = await new MatchingEngine().findMatches({
        tenant_id: deal.tenant_id,
        intent: demand.intent,
        budget_min: demand.budget_min,
        budget_max: demand.budget_max,
        preferred_location: area,
        preferred_lat: c?.preferred_lat,
        preferred_lng: c?.preferred_lng,
        demand_taxonomy_node_id: demand.taxonomy_node_id,
        demand_schema_values: demand.schema_values as Record<string, any> | null,
        budget_hard: true,
    }, 3);
    const data = {
        tenant_id: deal.tenant_id, owner_id: deal.coordinator_agent_id || deal.executive_agent_id || c?.assigned_agent_id,
        area, demand: demand as any, match_count: matches.length,
        status: matches.length < 3 ? 'OPEN' : 'RESOLVED',
    };
    await prisma.shortageEntry.upsert({
        where: { deal_id: dealId },
        create: { deal_id: dealId, ...data },
        update: data,
    });
}

export async function refreshTenantShortages(tenantId: string): Promise<void> {
    const rows = await prisma.shortageEntry.findMany({ where: { tenant_id: tenantId }, select: { deal_id: true } });
    for (const row of rows) {
        try { await refreshDealShortage(row.deal_id); }
        catch (error) { logger.error(`[ShortageBook] refresh failed for ${row.deal_id}`, error); }
    }
}

export async function createDailySurveyTasks(now = new Date()): Promise<void> {
    const day = now.toISOString().slice(0, 10);
    const rows = await prisma.shortageEntry.findMany({ where: { status: 'OPEN', owner_id: { not: null } } });
    for (const row of rows) {
        const existing = await prisma.task.findFirst({ where: {
            deal_id: row.deal_id, task_type: 'SHORTAGE_SURVEY',
            stage_metadata: { path: ['survey_day'], equals: day },
        }, select: { id: true } });
        if (existing) continue;
        await prisma.task.create({ data: {
            title: `Survey ${row.area || 'buyer area'} for matching inventory`,
            description: `Review open demand and plan society/area stops. ${row.match_count} active matches currently.`,
            assigned_to: row.owner_id!, due_date: now, priority: 'MEDIUM', status: 'TODO',
            contact_phone: null, tags: ['shortage', 'survey'], task_type: 'SHORTAGE_SURVEY',
            deal_id: row.deal_id, stage_metadata: { survey_day: day, shortage_id: row.id, source: 'own_inventory' },
        } });
    }
}
