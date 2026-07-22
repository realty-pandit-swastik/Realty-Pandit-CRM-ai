
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
        inventory: {
            async create({ args, query }) {
                const data: any = args.data;
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
                return created;
            },
        },
        contact: {
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
