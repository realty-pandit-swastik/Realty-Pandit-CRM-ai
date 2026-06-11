/**
 * Panditji daily briefing — 9 AM IST WhatsApp text message to every active super_boss.
 * Scheduled via BullMQ (see scheduled_worker.ts).
 */

import prisma from '../db';
import logger from '../utils/logger';
import { WhatsAppService } from './whatsapp';

const whatsapp = new WhatsAppService();

function formatINR(amount: number | null | undefined): string {
    const n = Number(amount ?? 0);
    if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(1)} Cr`;
    if (n >= 100_000) return `${(n / 100_000).toFixed(1)} L`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return String(Math.round(n));
}

export async function sendPanditjiDailyBriefing(): Promise<void> {
    logger.info('[PanditjiBriefing] Starting daily briefing job');

    const superBosses = await prisma.agent.findMany({
        where: { role: 'super_boss', status: 'active', phone: { not: null } },
        select: { id: true, name: true, phone: true, tenant_id: true },
    });

    if (superBosses.length === 0) {
        logger.info('[PanditjiBriefing] No active super_boss users; skipping');
        return;
    }

    // Group by tenant so metrics are tenant-scoped
    const byTenant = new Map<string, typeof superBosses>();
    for (const sb of superBosses) {
        const arr = byTenant.get(sb.tenant_id) ?? [];
        arr.push(sb);
        byTenant.set(sb.tenant_id, arr);
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    for (const [tenantId, recipients] of byTenant.entries()) {
        try {
            const [newLeadsYday, dealsClosedYday, dealsValYday, unassignedLeads, stuckDeals, topPerformer] = await Promise.all([
                prisma.lead.count({
                    where: { tenant_id: tenantId, created_at: { gte: startOfYesterday, lt: startOfToday } },
                }),
                (prisma as any).transaction.count({
                    where: { tenant_id: tenantId, status: 'CLOSED_WON', closed_at: { gte: startOfYesterday, lt: startOfToday } },
                }),
                (prisma as any).transaction.aggregate({
                    where: { tenant_id: tenantId, status: 'CLOSED_WON', closed_at: { gte: startOfYesterday, lt: startOfToday } },
                    _sum: { final_price: true },
                }),
                prisma.lead.count({ where: { tenant_id: tenantId, assigned_agent_id: null } }),
                (prisma as any).transaction.count({
                    where: {
                        tenant_id: tenantId,
                        status: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
                        updated_at: { lt: tenDaysAgo },
                    },
                }),
                (prisma.lead.groupBy as any)({
                    by: ['assigned_agent_id'],
                    where: {
                        tenant_id: tenantId,
                        created_at: { gte: startOfYesterday, lt: startOfToday },
                        assigned_agent_id: { not: null },
                    },
                    _count: { id: true },
                    orderBy: { _count: { id: 'desc' } },
                    take: 1,
                }),
            ]);

            let topPerformerName = '—';
            if (Array.isArray(topPerformer) && topPerformer.length > 0 && topPerformer[0].assigned_agent_id) {
                const a = await prisma.agent.findUnique({
                    where: { id: topPerformer[0].assigned_agent_id as string },
                    select: { name: true },
                });
                if (a?.name) topPerformerName = `${a.name} (${topPerformer[0]._count.id} leads)`;
            }

            const dealsValue = (dealsValYday as any)?._sum?.final_price ?? 0;

            const body = [
                '🌅 Panditji Daily Briefing',
                `Good Morning! Here's yesterday's snapshot:`,
                '',
                `📥 New leads: ${newLeadsYday}`,
                `✅ Deals closed: ${dealsClosedYday} (₹${formatINR(dealsValue)})`,
                `🏆 Top performer: ${topPerformerName}`,
                `📋 Unassigned leads pending: ${unassignedLeads}`,
                `⚠️  Stuck deals (>10 days): ${stuckDeals}`,
                '',
                'Call Panditji anytime for details.',
            ].join('\n');

            for (const sb of recipients) {
                if (!sb.phone) continue;
                try {
                    await whatsapp.sendText(sb.phone, body);
                    logger.info(`[PanditjiBriefing] Sent to ${sb.name} (${sb.phone})`);
                } catch (err) {
                    logger.error(`[PanditjiBriefing] Failed to send to ${sb.phone}:`, err);
                }
            }
        } catch (err) {
            logger.error(`[PanditjiBriefing] tenant ${tenantId} failed:`, err);
        }
    }

    logger.info('[PanditjiBriefing] Daily briefing job complete');
}
