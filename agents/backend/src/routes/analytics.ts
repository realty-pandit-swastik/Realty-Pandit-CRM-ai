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

    // Get daily counts of contacts created (leads)
    const leads = await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
      SELECT DATE(created_at) as date, COUNT(*)::int as count
      FROM contacts
      WHERE tenant_id = ${tenantId}
        AND created_at >= ${startDate}
        AND created_at <= ${endDate}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    // Get daily counts of appointments
    const visits = await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
      SELECT DATE(scheduled_at) as date, COUNT(*)::int as count
      FROM appointments
      WHERE tenant_id = ${tenantId}
        AND scheduled_at >= ${startDate}
        AND scheduled_at <= ${endDate}
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
        AND closed_at <= ${endDate}
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

    // Get all agents with their performance metrics
    const agents = await prisma.agent.findMany({
      where: {
        tenant_id: tenantId,
        status: 'active',
      },
      select: {
        id: true,
        name: true,
        role: true,
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
      },
    });

    const performance = agents.map(agent => ({
      agent_id: agent.id,
      agent_name: agent.name,
      role: agent.role,
      leads_assigned: agent.assigned_leads.length,
      hot_leads: agent.assigned_leads.filter(l => l.lead_status === 'hot').length,
      appointments_scheduled: agent.appointments.length,
      appointments_completed: agent.appointments.filter(a => a.status === 'completed').length,
      deals_closed: agent.executive_transactions.filter(t => t.status === 'CLOSED_WON').length,
      revenue_generated: agent.executive_transactions
        .filter(t => t.status === 'CLOSED_WON' && t.final_price)
        .reduce((sum, t) => sum + Number(t.final_price || 0), 0),
    }));

    res.json({ performance });
  } catch (error: any) {
    console.error('Error fetching user performance:', error);
    res.status(500).json({ error: 'Failed to fetch user performance' });
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

    // Get lead source breakdown
    const sources = await prisma.contact.groupBy({
      by: ['source'],
      where: {
        tenant_id: tenantId,
        created_at: {
          gte: startDate,
          lte: endDate,
        },
      },
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
        AND lifecycle_stage IN ('CLOSED_WON')
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

    // Property status breakdown
    const statusBreakdown = await prisma.inventory.groupBy({
      by: ['status'],
      where: {
        tenant_id: tenantId,
      },
      _count: {
        id: true,
      },
    });

    // Properties by intent
    const intentBreakdown = await prisma.inventory.groupBy({
      by: ['intent'],
      where: {
        tenant_id: tenantId,
        status: 'active',
      },
      _count: {
        id: true,
      },
    });

    // Properties by type
    const typeBreakdown = await prisma.inventory.groupBy({
      by: ['type'],
      where: {
        tenant_id: tenantId,
        status: 'active',
      },
      _count: {
        id: true,
      },
    });

    // Recent property additions
    const recentAdditions = await prisma.inventory.count({
      where: {
        tenant_id: tenantId,
        created_at: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    res.json({
      status_breakdown: statusBreakdown.map(s => ({ status: s.status, count: s._count.id })),
      intent_breakdown: intentBreakdown.map(i => ({ intent: i.intent, count: i._count.id })),
      type_breakdown: typeBreakdown.map(t => ({ type: t.type, count: t._count.id })),
      recent_additions: recentAdditions,
    });
  } catch (error: any) {
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

    // Total revenue from closed deals
    const closedDeals = await prisma.transaction.findMany({
      where: {
        tenant_id: tenantId,
        status: 'CLOSED_WON',
        closed_at: {
          gte: startDate,
          lte: endDate,
        },
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

    // Fetch leads trend
    const leadsTrend = await prisma.$queryRaw<Array<{ date: string; count: number }>>`
      SELECT DATE(created_at) as date, COUNT(*)::int as count
      FROM contacts
      WHERE created_at >= ${startDate} AND created_at <= ${endDate}
        AND tenant_id = ${tenantId}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    // Fetch conversion funnel
    const funnel = [
      { stage: 'NEW', count: await prisma.contact.count({ where: { lifecycle_stage: 'NEW', tenant_id: tenantId, created_at: { gte: startDate, lte: endDate } } }) },
      { stage: 'QUALIFIED', count: await prisma.contact.count({ where: { lifecycle_stage: 'QUALIFIED', tenant_id: tenantId, created_at: { gte: startDate, lte: endDate } } }) },
      { stage: 'VISIT_SCHEDULED', count: await prisma.contact.count({ where: { lifecycle_stage: 'VISIT_SCHEDULED', tenant_id: tenantId, created_at: { gte: startDate, lte: endDate } } }) },
      { stage: 'VISITED', count: await prisma.contact.count({ where: { lifecycle_stage: 'VISITED', tenant_id: tenantId, created_at: { gte: startDate, lte: endDate } } }) },
      { stage: 'NEGOTIATION', count: await prisma.contact.count({ where: { lifecycle_stage: 'NEGOTIATION', tenant_id: tenantId, created_at: { gte: startDate, lte: endDate } } }) },
      { stage: 'CLOSED_WON', count: await prisma.contact.count({ where: { lifecycle_stage: 'CLOSED_WON', tenant_id: tenantId, created_at: { gte: startDate, lte: endDate } } }) },
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
        AND c.tenant_id = ${tenantId}
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
      WHERE a.tenant_id = ${tenantId}
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
        AND i.tenant_id = ${tenantId}
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
        AND tenant_id = ${tenantId}
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
    console.error('Error fetching advanced analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
