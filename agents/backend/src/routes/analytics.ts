/**
 * Analytics API Routes
 *
 * Provides aggregated data for dashboard visualizations:
 * - Market Trends (time-series data)
 * - User Performance (per-agent metrics)
 * - Lead Sources (breakdown by source)
 * - Property Analytics (property-related metrics)
 * - Financial Summary (revenue, commissions)
 */

import { Router } from 'express';
import prisma from '../db';
import { authMiddleware } from '../middleware/auth';
import { captureRouteError } from '../utils/capture';
import {
  resolveVisibleAgentIds,
  scopeByAgentField,
  contactScopeOR,
  inventoryScopeOR,
  rawAgentFilter,
  rawContactFilter,
  rawInventoryFilter,
  rawContactJoinFilter,
} from '../services/analytics_scope';
import { aggregateTeams, type AgentMetrics } from '../services/team_metrics';
import { productivityScore, scaleTargets, DEFAULT_MONTHLY_TARGETS } from '../services/scoring';
import { buildAlerts } from '../services/alerts';
import { buildPropertyAnalytics } from '../services/property_analytics';
import { classifyRoute, methodLabel } from '../utils/distribution';
import { computeGci, OPEN_STAGES, COMMISSION_RATE, STAGE_PROBABILITY } from '../utils/gci';
import { computeSpeedToLead } from '../services/speed_to_lead';
import { getTargetsMap } from '../services/targets';

/** Whole days in a [start,end] range, min 1 — used to scale productivity targets. */
function rangeDays(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
}

const router = Router();

/**
 * GET /api/analytics/market-trends
 * Returns time-series data for leads, visits, and sales
 */
router.get('/market-trends', authMiddleware, async (req, res) => {
  try {
    const { from, to } = req.query;
    const tenantId = req.agent?.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    // Default to last 30 days if no date range provided
    const startDate = from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = to ? new Date(to as string) : new Date();

    // Role-based visibility scope (super_boss => null => no restriction)
    const ids = await resolveVisibleAgentIds(req.agent?.id, req.agent?.role, tenantId);

    // Get daily counts of contacts created (leads)
    const leads = await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
      SELECT DATE(created_at) as date, COUNT(*)::int as count
      FROM contacts
      WHERE tenant_id = ${tenantId}
        AND created_at >= ${startDate}
        AND created_at <= ${endDate}${rawContactFilter(ids)}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    // Get daily counts of appointments
    const visits = await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
      SELECT DATE(scheduled_at) as date, COUNT(*)::int as count
      FROM appointments
      WHERE tenant_id = ${tenantId}
        AND scheduled_at >= ${startDate}
        AND scheduled_at <= ${endDate}${rawAgentFilter('assigned_to_agent_id', ids)}
      GROUP BY DATE(scheduled_at)
      ORDER BY date ASC
    `;

    // Get daily counts of closed deals
    const sales = await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
      SELECT DATE(closed_at) as date, COUNT(*)::int as count
      FROM transactions
      WHERE tenant_id = ${tenantId}
        AND status = 'CLOSED_WON'
        AND closed_at >= ${startDate}
        AND closed_at <= ${endDate}${rawAgentFilter('executive_agent_id', ids)}
      GROUP BY DATE(closed_at)
      ORDER BY date ASC
    `;

    // Format response with consistent date keys
    const formatData = (data: Array<{ date: Date; count: bigint }>) => {
      return data.map(item => ({
        date: item.date.toISOString().split('T')[0],
        count: Number(item.count),
      }));
    };

    res.json({
      leads: formatData(leads),
      visits: formatData(visits),
      sales: formatData(sales),
    });
  } catch (error: any) {
        captureRouteError(error, req, { route: 'analytics#1' });
    console.error('Error fetching market trends:', error);
    res.status(500).json({ error: 'Failed to fetch market trends' });
  }
});

/**
 * GET /api/analytics/user-performance
 * Returns per-user metrics with targets
 */
router.get('/user-performance', authMiddleware, async (req, res) => {
  try {
    const { from, to } = req.query;
    const tenantId = req.agent?.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const startDate = from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = to ? new Date(to as string) : new Date();

    // Role-based visibility scope: an employee sees only their own row,
    // a manager their reporting subtree, super_boss all agents.
    const ids = await resolveVisibleAgentIds(req.agent?.id, req.agent?.role, tenantId);

    // Get visible agents with their performance metrics
    const agents = await prisma.agent.findMany({
      where: {
        tenant_id: tenantId,
        status: 'active',
        ...scopeByAgentField('id', ids),
      },
      select: {
        id: true,
        name: true,
        role: true,
        reports_to_id: true,
        assigned_leads: {
          where: {
            created_at: {
              gte: startDate,
              lte: endDate,
            },
          },
          select: {
            phone_number: true,
            lead_status: true,
            lifecycle_stage: true,
          },
        },
        appointments: {
          where: {
            scheduled_at: {
              gte: startDate,
              lte: endDate,
            },
          },
          select: {
            id: true,
            status: true,
          },
        },
        executive_transactions: {
          where: {
            created_at: {
              gte: startDate,
              lte: endDate,
            },
          },
          select: {
            id: true,
            status: true,
            final_price: true,
          },
        },
        uploaded_inventory: {
          where: { created_at: { gte: startDate, lte: endDate } },
          select: { id: true },
        },
      },
    });

    const days = rangeDays(startDate, endDate);
    const targets = scaleTargets(DEFAULT_MONTHLY_TARGETS, days); // default reference (top-level)
    // Per-manager targets (Phase 5B): each agent scores against their manager's targets, else defaults.
    const mgrIds = agents.map(a => (a.role === 'manager' ? a.id : a.reports_to_id)).filter(Boolean) as string[];
    const targetsMap = await getTargetsMap(tenantId, mgrIds);

    // Per-agent commission earned in the window (INTERNAL_AGENT entries; scoped to the visible agents).
    const commRows = await prisma.dealCommissionEntry.groupBy({
      by: ['agent_id'],
      where: {
        party_type: 'INTERNAL_AGENT',
        agent_id: { in: agents.map(a => a.id) },
        entered_at: { gte: startDate, lte: endDate },
      },
      _sum: { amount: true },
    });
    const commissionByAgent = new Map(commRows.map(r => [r.agent_id, Number(r._sum.amount) || 0]));

    const performance = agents.map(agent => {
      const leads_assigned = agent.assigned_leads.length;
      const appointments_completed = agent.appointments.filter(a => a.status === 'completed').length;
      const deals_closed = agent.executive_transactions.filter(t => t.status === 'CLOSED_WON').length;
      const inventory_added = agent.uploaded_inventory.length;
      const mgrId = agent.role === 'manager' ? agent.id : agent.reports_to_id;
      const agentTargets = scaleTargets(targetsMap.get(mgrId || '') ?? DEFAULT_MONTHLY_TARGETS, days);
      const { score, category, components } = productivityScore(
        { leads: leads_assigned, deals_closed, appointments_completed, inventory_added },
        agentTargets
      );
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        role: agent.role,
        leads_assigned,
        hot_leads: agent.assigned_leads.filter(l => l.lead_status === 'hot').length,
        appointments_scheduled: agent.appointments.length,
        appointments_completed,
        deals_closed,
        revenue_generated: agent.executive_transactions
          .filter(t => t.status === 'CLOSED_WON' && t.final_price)
          .reduce((sum, t) => sum + Number(t.final_price || 0), 0),
        inventory_added,
        productivity_score: score,
        productivity_category: category,
        components,
        commission: commissionByAgent.get(agent.id) || 0,
      };
    });

    res.json({ performance, targets });
  } catch (error: any) {
        captureRouteError(error, req, { route: 'analytics#2' });
    console.error('Error fetching user performance:', error);
    res.status(500).json({ error: 'Failed to fetch user performance' });
  }
});

/**
 * GET /api/analytics/distribution
 * Lead distribution: per-agent active load, unassigned count, and by-channel/partner route.
 * (The routing METHOD — round-robin vs sub-user — is not persisted; "route" = channel/partner.)
 */
router.get('/distribution', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.agent?.tenant_id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }
    const ids = await resolveVisibleAgentIds(req.agent?.id, req.agent?.role, tenantId);
    const contactOR = contactScopeOR(ids);
    const withContact = (w: any) => {
      if (contactOR) w.AND = [...(w.AND ?? []), { OR: contactOR }];
      return w;
    };
    const OPEN = { lifecycle_stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } };

    // Per-agent active load
    const loadRows = await prisma.contact.groupBy({
      by: ['assigned_agent_id'],
      where: withContact({ tenant_id: tenantId, ...OPEN, assigned_agent_id: { not: null } }),
      _count: { _all: true },
    });
    const agentIds = loadRows.map(r => r.assigned_agent_id!).filter(Boolean);
    const agents = agentIds.length
      ? await prisma.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(agents.map(a => [a.id, a.name]));
    const load = loadRows
      .map(r => ({ agent_id: r.assigned_agent_id!, agent_name: nameById.get(r.assigned_agent_id!) || '—', active_leads: r._count._all }))
      .sort((a, b) => b.active_leads - a.active_leads);

    // Unassigned active leads
    const unassigned_leads = await prisma.contact.count({
      where: withContact({ tenant_id: tenantId, ...OPEN, assigned_agent_id: null }),
    });

    // By route (channel + partner, inferred) AND by method (the persisted assignment_method, Phase 5C) —
    // both computed over the same active-contact set in one pass. by_route stays as-is (no regression);
    // by_method is the real routing-method split, legacy/unassigned rows bucketed as "Unknown (legacy)".
    const routeRows = await prisma.contact.findMany({
      where: withContact({ tenant_id: tenantId, ...OPEN }),
      select: { source: true, lead_type: true, referral_partner_id: true, assignment_method: true },
    });
    const routeMap = new Map<string, number>();
    const methodMap = new Map<string, number>();
    for (const c of routeRows) {
      const k = classifyRoute(c);
      routeMap.set(k, (routeMap.get(k) || 0) + 1);
      const m = methodLabel(c.assignment_method);
      methodMap.set(m, (methodMap.get(m) || 0) + 1);
    }
    const by_route = Array.from(routeMap.entries())
      .map(([route, count]) => ({ route, count }))
      .sort((a, b) => b.count - a.count);
    const by_method = Array.from(methodMap.entries())
      .map(([method, count]) => ({ method, count }))
      .sort((a, b) => b.count - a.count);

    res.json({ load, unassigned_leads, by_route, by_method });
  } catch (error: any) {
    captureRouteError(error, req, { route: 'analytics#distribution' });
    console.error('Error fetching distribution:', error);
    res.status(500).json({ error: 'Failed to fetch distribution' });
  }
});

/**
 * GET /api/analytics/gci-forecast
 * DIRECTIONAL weighted-pipeline GCI estimate (Phase 5E). NOT a committed forecast — the org captures no
 * per-deal close-date / win-probability / commission rate and has only 2 closed-won deals ever, so this
 * is Σ(budget-midpoint × assumed 2% rate × assumed stage-probability) over OPEN deals; every assumption
 * is returned so the UI can surface it. Role-scoped by the deal's executive agent.
 */
router.get('/gci-forecast', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.agent?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
    const ids = await resolveVisibleAgentIds(req.agent?.id, req.agent?.role, tenantId);
    const openDeals = await prisma.transaction.findMany({
      where: { tenant_id: tenantId, status: { in: OPEN_STAGES as any }, ...scopeByAgentField('executive_agent_id', ids) },
      select: { status: true, demand_contact: { select: { budget_min: true, budget_max: true } } },
    });
    const deals = openDeals.map((d) => ({
      status: d.status as string,
      budgetMin: d.demand_contact?.budget_min != null ? Number(d.demand_contact.budget_min) : null,
      budgetMax: d.demand_contact?.budget_max != null ? Number(d.demand_contact.budget_max) : null,
    }));
    const result = computeGci(deals);
    res.json({
      ...result,
      assumptions: { commission_rate: COMMISSION_RATE, stage_probability: STAGE_PROBABILITY },
      directional: true,
      disclaimer: 'Directional estimate — weighted by ASSUMED stage-probabilities × an assumed 2% commission rate on stated buyer budgets. Not a committed forecast: deals carry no close-date, win-probability, or per-deal commission rate, and only 2 deals have closed to date.',
    });
  } catch (error: any) {
    captureRouteError(error, req, { route: 'analytics#gci-forecast' });
    console.error('Error fetching GCI forecast:', error);
    res.status(500).json({ error: 'Failed to fetch GCI forecast' });
  }
});

/**
 * GET /api/analytics/speed-to-lead
 * Time from lead-created to the first outbound (incl. bot), computed from Interaction rows.
 */
router.get('/speed-to-lead', authMiddleware, async (req, res) => {
  try {
    const { from, to } = req.query;
    const tenantId = req.agent?.tenant_id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }
    const startDate = from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = to ? new Date(to as string) : new Date();
    const ids = await resolveVisibleAgentIds(req.agent?.id, req.agent?.role, tenantId);
    const stl = await computeSpeedToLead(tenantId, ids, startDate, endDate);
    res.json(stl);
  } catch (error: any) {
    captureRouteError(error, req, { route: 'analytics#speed-to-lead' });
    console.error('Error fetching speed-to-lead:', error);
    res.status(500).json({ error: 'Failed to fetch speed-to-lead' });
  }
});

/**
 * GET /api/analytics/lead-sources
 * Returns breakdown by lead source
 */
router.get('/lead-sources', authMiddleware, async (req, res) => {
  try {
    const { from, to } = req.query;
    const tenantId = req.agent?.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const startDate = from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = to ? new Date(to as string) : new Date();

    // Role-based visibility scope
    const ids = await resolveVisibleAgentIds(req.agent?.id, req.agent?.role, tenantId);

    // Get lead source breakdown — AND-wrap the visibility OR so it doesn't
    // clobber tenant/date filters (see precautions/prisma-where-or-pattern.md).
    const sourcesWhere: any = {
      tenant_id: tenantId,
      created_at: { gte: startDate, lte: endDate },
    };
    const srcScopeOR = contactScopeOR(ids);
    if (srcScopeOR) sourcesWhere.AND = [{ OR: srcScopeOR }];

    const sources = await prisma.contact.groupBy({
      by: ['source'],
      where: sourcesWhere,
      _count: {
        phone_number: true,
      },
    });

    const breakdown = sources.map(s => ({
      source: s.source,
      count: s._count.phone_number,
    }));

    // Get conversion rates by source
    const conversions = await prisma.$queryRaw<Array<{ source: string; converted: bigint }>>`
      SELECT source, COUNT(*)::int as converted
      FROM contacts
      WHERE tenant_id = ${tenantId}
        AND created_at >= ${startDate}
        AND created_at <= ${endDate}
        AND lifecycle_stage IN ('CLOSED_WON')${rawContactFilter(ids)}
      GROUP BY source
    `;

    const conversionMap = new Map(conversions.map(c => [c.source, Number(c.converted)]));

    const enrichedBreakdown = breakdown.map(b => ({
      ...b,
      converted: conversionMap.get(b.source) || 0,
      conversion_rate: b.count > 0 ? ((conversionMap.get(b.source) || 0) / b.count) * 100 : 0,
    }));

    res.json({ sources: enrichedBreakdown });
  } catch (error: any) {
        captureRouteError(error, req, { route: 'analytics#3' });
    console.error('Error fetching lead sources:', error);
    res.status(500).json({ error: 'Failed to fetch lead sources' });
  }
});

/**
 * GET /api/analytics/property-trends
 * Returns property-related analytics
 */
router.get('/property-trends', authMiddleware, async (req, res) => {
  try {
    const { from, to } = req.query;
    const tenantId = req.agent?.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const startDate = from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = to ? new Date(to as string) : new Date();

    // Role-based visibility scope. AND-wrap the inventory OR onto each query so
    // it composes with the other filters (see precautions/prisma-where-or-pattern.md).
    const ids = await resolveVisibleAgentIds(req.agent?.id, req.agent?.role, tenantId);
    const invScopeOR = inventoryScopeOR(ids);
    const withInvScope = (w: any) => {
      if (invScopeOR) w.AND = [...(w.AND ?? []), { OR: invScopeOR }];
      return w;
    };

    // Property status breakdown
    const statusBreakdown = await prisma.inventory.groupBy({
      by: ['status'],
      where: withInvScope({ tenant_id: tenantId }),
      _count: {
        id: true,
      },
    });

    // Properties by intent
    const intentBreakdown = await prisma.inventory.groupBy({
      by: ['intent'],
      where: withInvScope({ tenant_id: tenantId, status: 'active' }),
      _count: {
        id: true,
      },
    });

    // Properties by type
    const typeBreakdown = await prisma.inventory.groupBy({
      by: ['type'],
      where: withInvScope({ tenant_id: tenantId, status: 'active' }),
      _count: {
        id: true,
      },
    });

    // Recent property additions
    const recentAdditions = await prisma.inventory.count({
      where: withInvScope({
        tenant_id: tenantId,
        created_at: { gte: startDate, lte: endDate },
      }),
    });

    // Rich Property Analytics panels (Phase 1) — additive; the four fields above are unchanged.
    const contactOR = contactScopeOR(ids);
    const withContactScope = (w: any) => {
      if (contactOR) w.AND = [...(w.AND ?? []), { OR: contactOR }];
      return w;
    };
    const analytics = await buildPropertyAnalytics({
      tenantId,
      from: startDate,
      to: endDate,
      withInv: withInvScope,
      withContact: withContactScope,
    });

    res.json({
      status_breakdown: statusBreakdown.map(s => ({ status: s.status, count: s._count.id })),
      intent_breakdown: intentBreakdown.map(i => ({ intent: i.intent, count: i._count.id })),
      type_breakdown: typeBreakdown.map(t => ({ type: t.type, count: t._count.id })),
      recent_additions: recentAdditions,
      ...analytics,
    });
  } catch (error: any) {
        captureRouteError(error, req, { route: 'analytics#4' });
    console.error('Error fetching property trends:', error);
    res.status(500).json({ error: 'Failed to fetch property trends' });
  }
});

/**
 * GET /api/analytics/financial-summary
 * Returns sales, revenue, and commission data
 */
router.get('/financial-summary', authMiddleware, async (req, res) => {
  try {
    const { from, to } = req.query;
    const tenantId = req.agent?.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const startDate = from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = to ? new Date(to as string) : new Date();

    // Role-based visibility scope
    const ids = await resolveVisibleAgentIds(req.agent?.id, req.agent?.role, tenantId);

    // Total revenue from closed deals (scoped to the executive agent's visibility)
    const closedDeals = await prisma.transaction.findMany({
      where: {
        tenant_id: tenantId,
        status: 'CLOSED_WON',
        closed_at: {
          gte: startDate,
          lte: endDate,
        },
        ...scopeByAgentField('executive_agent_id', ids),
      },
      select: {
        final_price: true,
        commission_amount: true,
        type: true,
      },
    });

    const totalRevenue = closedDeals.reduce((sum, d) => sum + Number(d.final_price || 0), 0);
    const totalCommission = closedDeals.reduce((sum, d) => sum + Number(d.commission_amount || 0), 0);
    const salesCount = closedDeals.filter(d => d.type === 'SALE').length;
    const rentalsCount = closedDeals.filter(d => d.type === 'RENT').length;

    // Average deal size
    const avgDealSize = closedDeals.length > 0 ? totalRevenue / closedDeals.length : 0;

    res.json({
      total_revenue: totalRevenue,
      total_commission: totalCommission,
      total_deals: closedDeals.length,
      sales_count: salesCount,
      rentals_count: rentalsCount,
      avg_deal_size: avgDealSize,
    });
  } catch (error: any) {
        captureRouteError(error, req, { route: 'analytics#5' });
    console.error('Error fetching financial summary:', error);
    res.status(500).json({ error: 'Failed to fetch financial summary' });
  }
});

// ===================================================================
// ADVANCED ANALYTICS - Aggregated Dashboard Data
// ===================================================================

router.get('/advanced', authMiddleware, async (req, res) => {
  try {
    const { range = '30d', start, end } = req.query;

    // Calculate date range
    let startDate: Date;
    let endDate: Date = new Date();

    if (range === 'custom' && start && end) {
      startDate = new Date(start as string);
      endDate = new Date(end as string);
    } else {
      const days = range === '7d' ? 7 : range === '90d' ? 90 : range === 'ytd' ? 365 : 30;
      startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    }

    // Get tenant_id from authenticated agent
    const tenantId = req.agent?.tenant_id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    // Role-based visibility scope
    const ids = await resolveVisibleAgentIds(req.agent?.id, req.agent?.role, tenantId);
    const funnelScopeOR = contactScopeOR(ids);
    const funnelWhere = (stage: string) => {
      const w: any = { lifecycle_stage: stage, tenant_id: tenantId, created_at: { gte: startDate, lte: endDate } };
      if (funnelScopeOR) w.AND = [{ OR: funnelScopeOR }];
      return w;
    };

    // Fetch leads trend
    const leadsTrend = await prisma.$queryRaw<Array<{ date: string; count: number }>>`
      SELECT DATE(created_at) as date, COUNT(*)::int as count
      FROM contacts
      WHERE created_at >= ${startDate} AND created_at <= ${endDate}
        AND tenant_id = ${tenantId}${rawContactFilter(ids)}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    // Fetch conversion funnel
    const funnel = [
      { stage: 'NEW', count: await prisma.contact.count({ where: funnelWhere('NEW') }) },
      { stage: 'QUALIFIED', count: await prisma.contact.count({ where: funnelWhere('QUALIFIED') }) },
      { stage: 'VISIT_SCHEDULED', count: await prisma.contact.count({ where: funnelWhere('VISIT_SCHEDULED') }) },
      { stage: 'VISITED', count: await prisma.contact.count({ where: funnelWhere('VISITED') }) },
      { stage: 'NEGOTIATION', count: await prisma.contact.count({ where: funnelWhere('NEGOTIATION') }) },
      { stage: 'CLOSED_WON', count: await prisma.contact.count({ where: funnelWhere('CLOSED_WON') }) },
    ];

    // Calculate conversion rates
    const funnelWithRates = funnel.map((item, idx) => ({
      ...item,
      conversion_rate: idx > 0 && funnel[idx - 1].count > 0
        ? ((item.count / funnel[idx - 1].count) * 100).toFixed(1)
        : 100
    }));

    // Fetch source breakdown
    const sources = await prisma.$queryRaw<Array<{ source: string; leads: number; revenue: number }>>`
      SELECT
        c.source,
        COUNT(c.phone_number)::int as leads,
        COALESCE(SUM(t.final_price), 0)::float as revenue
      FROM contacts c
      LEFT JOIN transactions t ON (t.demand_contact_id = c.phone_number OR t.supply_contact_id = c.phone_number)
        AND t.type = 'SALE'
        AND t.status = 'CLOSED_WON'
      WHERE c.created_at >= ${startDate} AND c.created_at <= ${endDate}
        AND c.tenant_id = ${tenantId}${rawContactFilter(ids, 'c')}
      GROUP BY c.source
      ORDER BY leads DESC
      LIMIT 10
    `;

    const sourcesWithROI = sources.map(s => ({
      ...s,
      roi: s.revenue > 0 ? ((s.revenue / (s.leads * 100)) * 100).toFixed(1) : 0
    }));

    // Fetch agent performance
    const agents = await prisma.$queryRaw<Array<{ name: string; leads: number; conversions: number; revenue: number }>>`
      SELECT
        a.name,
        COUNT(DISTINCT c.phone_number)::int as leads,
        COUNT(DISTINCT CASE WHEN c.lifecycle_stage = 'CLOSED_WON' THEN c.phone_number END)::int as conversions,
        COALESCE(SUM(t.final_price), 0)::float as revenue
      FROM agents a
      LEFT JOIN contacts c ON c.assigned_agent_id = a.id
        AND c.created_at >= ${startDate} AND c.created_at <= ${endDate}
        AND c.tenant_id = ${tenantId}
      LEFT JOIN transactions t ON t.executive_agent_id = a.id
        AND t.type = 'SALE'
        AND t.status = 'CLOSED_WON'
      WHERE a.tenant_id = ${tenantId}${rawAgentFilter('a.id', ids)}
      GROUP BY a.id, a.name
      ORDER BY revenue DESC
      LIMIT 10
    `;

    // Property analytics
    const properties = await prisma.$queryRaw<Array<{ type: string; views: number; inquiries: number; sold: number }>>`
      SELECT
        i.type,
        0 as views,
        COUNT(DISTINCT t.demand_contact_id)::int as inquiries,
        COUNT(DISTINCT CASE WHEN t.type = 'SALE' AND t.status = 'CLOSED_WON' THEN t.id END)::int as sold
      FROM inventory i
      LEFT JOIN transactions t ON t.inventory_id = i.id
      WHERE i.created_at >= ${startDate}
        AND i.tenant_id = ${tenantId}${rawInventoryFilter(ids, 'i')}
      GROUP BY i.type
      ORDER BY inquiries DESC
    `;

    // Time analysis - hourly activity
    const hourlyActivity = await prisma.$queryRaw<Array<{ hour: number; activity: number }>>`
      SELECT
        EXTRACT(HOUR FROM created_at)::int as hour,
        COUNT(*)::int as activity
      FROM interactions
      WHERE created_at >= ${startDate} AND created_at <= ${endDate}
        AND tenant_id = ${tenantId}${rawContactJoinFilter(ids, tenantId)}
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour ASC
    `;

    res.json({
      data: {
        trends: {
          leads: leadsTrend.map((item, idx) => ({
            ...item,
            change: idx > 0 ? ((item.count - leadsTrend[idx - 1].count) / leadsTrend[idx - 1].count * 100).toFixed(1) : 0
          })),
          revenue: [], // Can be populated from transactions
          conversions: []
        },
        funnel: funnelWithRates,
        sources: sourcesWithROI,
        agents,
        properties,
        timeAnalysis: {
          hourly: hourlyActivity,
          daily: [],
          monthly: []
        },
        forecasts: {
          leads_next_month: Math.floor(leadsTrend.reduce((sum, item) => sum + item.count, 0) / leadsTrend.length * 1.1),
          revenue_next_month: 0,
          confidence: 75
        }
      }
    });
  } catch (error: any) {
        captureRouteError(error, req, { route: 'analytics#6' });
    console.error('Error fetching advanced analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

/**
 * GET /api/analytics/team-performance
 * Phase 1 — Team Performance dashboard.
 *   super_boss -> one rollup per team (manager + their direct reports), org-wide.
 *   manager    -> their own reporting subtree, rolled into team(s).
 *   employee   -> 403 (no team view; handled by hiding the tab on the client too).
 */
router.get('/team-performance', authMiddleware, async (req, res) => {
  try {
    const { from, to } = req.query;
    const tenantId = req.agent?.tenant_id;
    const role = req.agent?.role;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }
    if (role !== 'super_boss' && role !== 'manager') {
      return res.status(403).json({ error: 'Team performance is available to managers and admins only' });
    }

    const startDate = from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = to ? new Date(to as string) : new Date();

    const ids = await resolveVisibleAgentIds(req.agent?.id, role, tenantId);

    const agents = await prisma.agent.findMany({
      where: {
        tenant_id: tenantId,
        status: 'active',
        ...scopeByAgentField('id', ids),
      },
      select: {
        id: true,
        name: true,
        role: true,
        reports_to_id: true,
        assigned_leads: {
          where: { created_at: { gte: startDate, lte: endDate } },
          select: { lead_status: true },
        },
        appointments: {
          where: { scheduled_at: { gte: startDate, lte: endDate } },
          select: { status: true },
        },
        executive_transactions: {
          where: { created_at: { gte: startDate, lte: endDate } },
          select: { status: true, final_price: true },
        },
        uploaded_inventory: {
          where: { created_at: { gte: startDate, lte: endDate } },
          select: { id: true },
        },
      },
    });

    const targets = scaleTargets(DEFAULT_MONTHLY_TARGETS, rangeDays(startDate, endDate));

    const metrics: AgentMetrics[] = agents.map((a) => {
      const leads = a.assigned_leads.length;
      const appointments_completed = a.appointments.filter((ap) => ap.status === 'completed').length;
      const deals_closed = a.executive_transactions.filter((t) => t.status === 'CLOSED_WON').length;
      const inventory_added = a.uploaded_inventory.length;
      return {
        id: a.id,
        name: a.name,
        role: a.role,
        reports_to_id: a.reports_to_id ?? null,
        leads,
        hot_leads: a.assigned_leads.filter((l) => l.lead_status === 'hot').length,
        appointments: a.appointments.length,
        appointments_completed,
        deals_closed,
        revenue: a.executive_transactions
          .filter((t) => t.status === 'CLOSED_WON' && t.final_price)
          .reduce((sum, t) => sum + Number(t.final_price || 0), 0),
        inventory_added,
        productivity: productivityScore({ leads, deals_closed, appointments_completed, inventory_added }, targets).score,
      };
    });

    res.json({
      teams: aggregateTeams(metrics),
      scope: role === 'super_boss' ? 'org' : 'team',
    });
  } catch (error: any) {
    captureRouteError(error, req, { route: 'analytics#team-performance' });
    console.error('Error fetching team performance:', error);
    res.status(500).json({ error: 'Failed to fetch team performance' });
  }
});

/**
 * GET /api/analytics/alerts
 * Phase 3 — Management Alerts engine. Role-scoped, read-only (no schema change).
 * Surfaces inactive members, neglected leads, listings missing price/photos, and
 * members without Google Calendar connected.
 */
router.get('/alerts', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.agent?.tenant_id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const RECENT_DAYS = 7;
    const STALE_DAYS = 14;
    const recentSince = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
    const staleBefore = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

    const ids = await resolveVisibleAgentIds(req.agent?.id, req.agent?.role, tenantId);

    // Visible agents + their recent activity (for inactivity + integration checks)
    const agents = await prisma.agent.findMany({
      where: { tenant_id: tenantId, status: 'active', ...scopeByAgentField('id', ids) },
      select: {
        id: true,
        name: true,
        google_connected_at: true,
        assigned_leads: { where: { created_at: { gte: recentSince } }, select: { phone_number: true } },
        appointments: { where: { scheduled_at: { gte: recentSince } }, select: { id: true } },
        uploaded_inventory: { where: { created_at: { gte: recentSince } }, select: { id: true } },
      },
    });
    const inactiveAgents = agents
      .filter((a) => a.assigned_leads.length + a.appointments.length + a.uploaded_inventory.length === 0)
      .map((a) => a.name);
    const googleNotConnected = agents.filter((a) => !a.google_connected_at).map((a) => a.name);

    // Inventory quality gaps (AND-wrap the scope OR per prisma-where-or-pattern)
    const invScopeOR = inventoryScopeOR(ids);
    const withInvScope = (w: any) => {
      if (invScopeOR) w.AND = [...(w.AND ?? []), { OR: invScopeOR }];
      return w;
    };
    const [inventoryMissingPhotos, inventoryMissingPrice] = await Promise.all([
      prisma.inventory.count({ where: withInvScope({ tenant_id: tenantId, status: 'active', media_urls: { isEmpty: true } }) }),
      prisma.inventory.count({ where: withInvScope({ tenant_id: tenantId, status: 'active', price: null }) }),
    ]);

    // Neglected active leads — two ORs (scope + last_interaction), both AND-wrapped.
    const staleWhere: any = {
      tenant_id: tenantId,
      lifecycle_stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
      lead_status: { notIn: ['lost', 'closed'] },
      AND: [{ OR: [{ last_interaction: { lt: staleBefore } }, { last_interaction: null }] }],
    };
    const cOr = contactScopeOR(ids);
    if (cOr) staleWhere.AND.push({ OR: cOr });
    const staleLeads = await prisma.contact.count({ where: staleWhere });

    const alerts = buildAlerts({
      inactiveAgents,
      inventoryMissingPhotos,
      inventoryMissingPrice,
      staleLeads,
      googleNotConnected,
      recentDays: RECENT_DAYS,
      staleDays: STALE_DAYS,
    });

    res.json({ alerts });
  } catch (error: any) {
    captureRouteError(error, req, { route: 'analytics#alerts' });
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

export default router;
