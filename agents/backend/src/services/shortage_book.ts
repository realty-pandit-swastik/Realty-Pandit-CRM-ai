import prisma from '../db';
import { createHash } from 'crypto';
import { bhkListFromDemand, typeNodeListFromDemand } from '../utils/demand_canonical';
import { MatchingEngine } from './matching_engine';
import logger from '../utils/logger';

const CLOSED = ['CLOSED_WON', 'CLOSED_LOST', 'CANCELLED'];

export async function getShortageThreshold(tenantId: string): Promise<number> {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { shortage_match_threshold: true } });
    return tenant?.shortage_match_threshold || 3;
}

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
    const threshold = await getShortageThreshold(deal.tenant_id);
    const bhks = bhkListFromDemand(demand.schema_values);
    const typeNodes = typeNodeListFromDemand(demand.schema_values, demand.taxonomy_node_id);
    const { expandTaxonomyNodeIds } = await import('../utils/taxonomy_filter');
    const taxonomyNodeIds = typeNodes.length > 1 ? await expandTaxonomyNodeIds(typeNodes) : undefined;
    const matches = await new MatchingEngine().findMatches({
        tenant_id: deal.tenant_id,
        intent: demand.intent,
        budget_min: demand.budget_min,
        budget_max: demand.budget_max,
        preferred_location: area,
        preferred_lat: c?.preferred_lat,
        preferred_lng: c?.preferred_lng,
        demand_taxonomy_node_id: taxonomyNodeIds?.length ? undefined : demand.taxonomy_node_id,
        taxonomy_node_id_list: taxonomyNodeIds,
        demand_schema_values: demand.schema_values as Record<string, any> | null,
        budget_hard: true,
        strict_stock: true,
        bhk_list: bhks.length ? bhks : undefined,
        area_min: deal.demand_area_min, area_max: deal.demand_area_max, area_unit: deal.demand_area_unit,
    }, threshold);
    const data = {
        tenant_id: deal.tenant_id, owner_id: deal.coordinator_agent_id || deal.executive_agent_id || c?.assigned_agent_id,
        area, demand: demand as any, match_count: matches.length,
        status: matches.length < threshold ? 'OPEN' : 'RESOLVED',
    };
    await prisma.shortageEntry.upsert({
        where: { deal_id: dealId },
        create: { deal_id: dealId, ...data },
        update: data,
    });
}

export async function refreshTenantShortages(tenantId: string): Promise<void> {
    const rows = await prisma.transaction.findMany({ where: { tenant_id: tenantId }, select: { id: true } });
    const failed: string[] = [];
    for (const row of rows) {
        try { await refreshDealShortage(row.id); }
        catch (error) { failed.push(row.id); logger.error(`[ShortageBook] refresh failed for ${row.id}`, error); }
    }
    if (failed.length) throw new Error(`Shortage refresh failed for ${failed.length} demand(s)`);
}

export interface SurveyScope { tenant_id: string; owner_ids?: string[] }

// PostgreSQL persists refresh intent through Redis outages and process restarts.
export async function requestTenantShortageRefresh(tenantId: string): Promise<void> {
    const now = new Date();
    const next = new Date(now.getTime() + 5000);
    await prisma.shortageRefresh.upsert({ where: { tenant_id: tenantId },
        create: { tenant_id: tenantId, requested_at: now, next_attempt_at: next },
        update: { requested_at: now, next_attempt_at: next },
    });
    try {
        const { scheduledJobsQueue } = await import('../queues');
        await scheduledJobsQueue.add('shortage-refresh', { tenantId }, {
            delay: 5000, deduplication: { id: `shortage-${tenantId}`, ttl: 5000, extend: true, replace: true },
            attempts: 5, backoff: { type: 'exponential', delay: 5000 },
        });
    } catch (error) { logger.warn('[ShortageBook] queue unavailable; durable refresh pending', error); }
}

export async function processPendingShortageRefreshes(tenantId?: string, now = new Date()): Promise<void> {
    const rows = await prisma.shortageRefresh.findMany({ where: {
        ...(tenantId ? { tenant_id: tenantId } : {}), next_attempt_at: { lte: now },
        OR: [{ lease_until: null }, { lease_until: { lte: now } }],
    }, take: 50 });
    for (const row of rows) {
        const leaseUntil = new Date(now.getTime() + 15 * 60000);
        const claim = await prisma.shortageRefresh.updateMany({ where: {
            tenant_id: row.tenant_id, requested_at: row.requested_at,
            OR: [{ lease_until: null }, { lease_until: { lte: now } }],
        }, data: { lease_until: leaseUntil } });
        if (!claim.count) continue;
        try {
            await refreshTenantShortages(row.tenant_id);
            await prisma.shortageRefresh.deleteMany({ where: { tenant_id: row.tenant_id, requested_at: row.requested_at, lease_until: leaseUntil } });
            await prisma.shortageRefresh.updateMany({ where: { tenant_id: row.tenant_id, lease_until: leaseUntil }, data: { lease_until: null } });
        } catch (error) {
            await prisma.shortageRefresh.updateMany({ where: { tenant_id: row.tenant_id, lease_until: leaseUntil }, data: {
                lease_until: null, attempts: { increment: 1 }, last_error: String(error).slice(0, 1000),
                next_attempt_at: new Date(now.getTime() + Math.min(3600000, 30000 * 2 ** Math.min(row.attempts, 7))),
            } });
            logger.error('[ShortageBook] refresh recorded for retry', error);
        }
    }
}

export async function createDailySurveyTasks(now = new Date(), scope?: SurveyScope): Promise<void> {
    const day = new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
    const rows = await prisma.shortageEntry.findMany({ where: {
        status: 'OPEN', owner_id: scope?.owner_ids ? { in: scope.owner_ids } : { not: null },
        ...(scope ? { tenant_id: scope.tenant_id } : {}),
    } });
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
        const key = JSON.stringify([row.tenant_id, row.owner_id, (row.area || '').trim().toLowerCase()]);
        groups.set(key, [...(groups.get(key) || []), row]);
    }
    for (const [key, demands] of groups) {
        const row = demands[0];
        const hash = createHash('sha256').update(`${day}:${key}`).digest('hex');
        const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
        const metadata = { tenant_id: row.tenant_id, area: row.area, survey_day: day,
            shortage_ids: demands.map(d => d.id), deal_ids: demands.map(d => d.deal_id),
            demands: demands.map(d => ({ shortage_id: d.id, deal_id: d.deal_id, demand: d.demand })), source: 'own_inventory' };
        const description = `Plan society/area stops for ${demands.length} open demands. Record outcomes through tasks and inventory verification.`;
        const priority = demands.some(d => d.match_count === 0) ? 'HIGH' : 'MEDIUM';
        const dealId = demands.length === 1 ? row.deal_id : null;
        await prisma.task.upsert({ where: { id }, update: { stage_metadata: metadata, description, priority, deal_id: dealId }, create: {
            id,
            title: `Survey ${row.area || 'buyer area'} for matching inventory`,
            description,
            assigned_to: row.owner_id!, due_date: new Date(`${day}T08:30:00+05:30`),
            priority, status: 'TODO',
            contact_phone: null, tags: ['shortage', 'survey'], task_type: 'SHORTAGE_SURVEY',
            deal_id: dealId,
            stage_metadata: metadata,
        } });
    }
}
