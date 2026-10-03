
import { PrismaClient } from '@prisma/client';

const basePrisma = new PrismaClient({
    log: process.env.NODE_ENV === 'production'
        ? ['error', 'warn']
        : ['query', 'error', 'warn'],
});

// 2026-05-13: Safety net — Inventory had 99 orphan rows (no assigned_agent_id)
// because 5+ ingestion paths (admin form, partner upload, public/api, AI sales agent,
// workflow engine, team bulk import) wrote uploaded_by_agent_id but forgot
// assigned_agent_id. A single Prisma client extension guarantees every new
// inventory record falls back to its uploader, even from future code paths.
// Bypass intentionally only when caller passes explicit assigned_agent_id (including null).
//
// 2026-05-14: Same pattern for Contact: WhatsApp-source new contacts auto-route
// to "Sunny" (super_boss) when caller didn't set assigned_agent_id. AND every
// new demand-side contact (BUYER/TENANT/UNKNOWN) fires a WhatsApp + push alert
// to Sunny and the assigned agent. Both via fire-and-forget so the write stays fast.
const prisma = basePrisma.$extends({
    query: {
        transaction: {
            async create({ args, query }) {
                const created: any = await query(args);
                if (created?.tenant_id) import('./services/shortage_book')
                    .then(({ requestTenantShortageRefresh }) => requestTenantShortageRefresh(created.tenant_id))
                    .catch(error => console.error('[ShortageBook] refresh request failed', error));
                return created;
            },
            async update({ args, query }) {
                const updated: any = await query(args);
                if (updated?.tenant_id) import('./services/shortage_book')
                    .then(({ requestTenantShortageRefresh }) => requestTenantShortageRefresh(updated.tenant_id))
                    .catch(error => console.error('[ShortageBook] refresh request failed', error));
                return updated;
            },
        },
        inventory: {
            async create({ args, query }) {
                const data: any = args.data;
                if (data && !data.display_id) {
                    const { generateDisplayId } = await import('./utils/inventory_id');
                    data.display_id = await generateDisplayId(data.city || data.locality || data.district || '', data.category || 'residential');
                }
                if (data && data.assigned_agent_id === undefined && data.uploaded_by_agent_id) {
                    data.assigned_agent_id = data.uploaded_by_agent_id;
                }
                // 2026-07-10: internal skip-flag (clone/duplicate) — strip BEFORE Prisma sees it.
                const skipTeamBroadcast = !!(data && data.__no_team_broadcast);
                if (data) delete data.__no_team_broadcast;
                const created: any = await query(args);
                // Central "new inventory → notify EVERY staff member" hook. Fires for ALL create
                // paths (wizard, CSV/bulk import, public, AI sales agent, direct API, any future
                // path) so the trigger can never be forgotten per-route again. Idempotent +
                // active-only + excludes the uploader inside broadcastNewInventoryToTeam.
                // Fire-and-forget — never blocks the write. (pending→active transitions are still
                // handled by the explicit calls in routes/inventory.ts PATCH + approve.)
                if (created && created.status === 'active' && !skipTeamBroadcast) {
                    try {
                        const { broadcastNewInventoryToTeam } = await import('./services/team_inventory_broadcast');
                        broadcastNewInventoryToTeam(created.id).catch(() => {});
                    } catch { /* ignore — never block the create */ }
                }
                if (created?.tenant_id) {
                    import('./services/shortage_book').then(({ requestTenantShortageRefresh }) =>
                        requestTenantShortageRefresh(created.tenant_id)).catch(error => console.error('[ShortageBook] refresh request failed', error));
                }
                return created;
            },
            async createMany({ args, query }) {
                const { generateDisplayId } = await import('./utils/inventory_id');
                for (const data of (Array.isArray(args.data) ? args.data : [args.data]) as any[]) {
                    if (!data.display_id) data.display_id = await generateDisplayId(data.city || data.locality || data.district || '', data.category || 'residential');
                    if (data.assigned_agent_id === undefined && data.uploaded_by_agent_id) data.assigned_agent_id = data.uploaded_by_agent_id;
                }
                const result = await query(args);
                if (result?.count) for (const tenantId of new Set((Array.isArray(args.data) ? args.data : [args.data]).map((row: any) => row.tenant_id).filter(Boolean))) {
                    import('./services/shortage_book').then(({ requestTenantShortageRefresh }) => requestTenantShortageRefresh(tenantId as string))
                        .catch(error => console.error('[ShortageBook] refresh request failed', error));
                }
                return result;
            },
            async upsert({ args, query }) {
                const data: any = args.create;
                if (!data.display_id) {
                    const { generateDisplayId } = await import('./utils/inventory_id');
                    data.display_id = await generateDisplayId(data.city || data.locality || data.district || '', data.category || 'residential');
                }
                if (data.assigned_agent_id === undefined && data.uploaded_by_agent_id) data.assigned_agent_id = data.uploaded_by_agent_id;
                const updated: any = await query(args);
                if (updated?.tenant_id) import('./services/shortage_book').then(({ requestTenantShortageRefresh }) => requestTenantShortageRefresh(updated.tenant_id))
                    .catch(error => console.error('[ShortageBook] refresh request failed', error));
                return updated;
            },
            async update({ args, query }) {
                const updated: any = await query(args);
                const changed = args.data as Record<string, unknown>;
                if (updated?.tenant_id && ['status', 'price', 'customer_price', 'intent', 'location', 'locality', 'sub_locality', 'city', 'specs', 'taxonomy_node_id'].some(key => key in changed)) {
                    import('./services/shortage_book').then(({ requestTenantShortageRefresh }) =>
                        requestTenantShortageRefresh(updated.tenant_id)).catch(error => console.error('[ShortageBook] refresh request failed', error));
                }
                return updated;
            },
            async updateMany({ args, query }) {
                const changed = args.data as Record<string, unknown>;
                const relevant = ['status', 'price', 'customer_price', 'intent', 'location', 'locality', 'sub_locality', 'city', 'specs', 'taxonomy_node_id'].some(key => key in changed);
                const tenants = relevant ? await basePrisma.inventory.findMany({ where: args.where, distinct: ['tenant_id'], select: { tenant_id: true } }) : [];
                const result = await query(args);
                if (result.count) for (const { tenant_id } of tenants) {
                    import('./services/shortage_book').then(({ requestTenantShortageRefresh }) =>
                        requestTenantShortageRefresh(tenant_id)).catch(error => console.error('[ShortageBook] refresh request failed', error));
                }
                return result;
            },
            async delete({ args, query }) {
                const deleted: any = await query(args);
                if (deleted?.status === 'active' && deleted.tenant_id) {
                    import('./services/shortage_book').then(({ requestTenantShortageRefresh }) =>
                        requestTenantShortageRefresh(deleted.tenant_id)).catch(error => console.error('[ShortageBook] refresh request failed', error));
                }
                return deleted;
            },
        },
        contact: {
            async update({ args, query }) {
                const updated: any = await query(args);
                const changed = args.data as Record<string, unknown>;
                if (updated?.tenant_id && Object.keys(changed).some(key =>
                    key.startsWith('demand_') || ['intent', 'preferred_location', 'preferred_lat', 'preferred_lng', 'budget_min', 'budget_max', 'assigned_agent_id'].includes(key))) {
                    import('./services/shortage_book')
                        .then(({ requestTenantShortageRefresh }) => requestTenantShortageRefresh(updated.tenant_id))
                        .catch(error => console.error('[ShortageBook] refresh request failed', error));
                }
                return updated;
            },
            async create({ args, query }) {
                const data: any = args.data;
                // 1. Auto-assign WhatsApp/voice-source contacts to Sunny when caller didn't pick someone
                if (data && data.assigned_agent_id === undefined && data.source) {
                    try {
                        const { shouldAutoAssignToSunny, resolveSunnyAgentId } = await import('./services/new_lead_alerts');
                        if (shouldAutoAssignToSunny(data.source)) {
                            const sunnyId = await resolveSunnyAgentId(basePrisma);
                            // Fixed super_boss default for organic WhatsApp/voice contacts. Phase 5C:
                            // record the routing method inline (this is the $extends itself, so it
                            // cannot call the assignContact helper).
                            if (sunnyId) { data.assigned_agent_id = sunnyId; data.assignment_method = 'other'; }
                        }
                    } catch { /* ignore — don't block the create */ }
                }
                const created: any = await query(args);
                // 2. Fire-and-forget new-lead alerts (WhatsApp + push). Never await.
                try {
                    const { fireNewLeadAlerts } = await import('./services/new_lead_alerts');
                    fireNewLeadAlerts(basePrisma, created).catch(() => {});
                } catch { /* ignore */ }
                return created;
            },
        },
    },
}) as unknown as PrismaClient;

export default prisma;
