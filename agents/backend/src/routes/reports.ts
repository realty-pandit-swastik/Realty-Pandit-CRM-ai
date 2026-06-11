/**
 * Reports API - Comprehensive reporting system with 8 categories
 * Phase 2.1 of Dashboard Enhancement Plan
 */

import express, { Request, Response } from 'express';
import prisma from '../db';
import { authMiddleware } from '../middleware/auth';
import { captureRouteError } from '../utils/capture';

const router = express.Router();

// All report endpoints require authentication
router.use(authMiddleware);

// BigInt serialization fix for $queryRaw results (BigInt cannot be JSON.stringify'd)
function serializeBigInt(rows: any[]): any[] {
    return rows.map(row => {
        const obj: any = {};
        for (const [key, value] of Object.entries(row)) {
            obj[key] = typeof value === 'bigint' ? Number(value) : value;
        }
        return obj;
    });
}

// Helper function to parse date parameters
const parseDate = (dateStr?: string): Date | undefined => {
  if (!dateStr) return undefined;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? undefined : date;
};

// ============================================================================
// 1. ACCOUNT REPORTS (Financial Tracking)
// ============================================================================

// Customer Outstanding (Sales)
router.get('/account/customer-outstanding', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const fromDate = parseDate(from as string);
    const toDate = parseDate(to as string);

    const query: any = {
      type: 'SALE',
      status: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] }, // Outstanding = not yet closed
    };
    if (fromDate || toDate) {
      query.created_at = {};
      if (fromDate) query.created_at.gte = fromDate;
      if (toDate) query.created_at.lte = toDate;
    }

    const outstanding = await prisma.transaction.findMany({
      where: query,
      include: {
        demand_contact: { select: { name: true, phone_number: true } },
        supply_contact: { select: { name: true, phone_number: true } },
        inventory: { select: { apartment_name: true, type: true, locality: true, city: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    const summary = outstanding.reduce((acc, item) => {
      const amount = item.final_price || 0;
      acc.total += amount;
      acc.count += 1;
      return acc;
    }, { total: 0, count: 0 });

    res.json({ data: outstanding, summary });
  } catch (error) {
        captureRouteError(error, req, { route: 'reports#1' });
    console.error('Customer outstanding report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Vendor Outstanding (Commissions Owed to Partner Agents)
router.get('/account/vendor-outstanding', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const fromDate = parseDate(from as string);
    const toDate = parseDate(to as string);

    const query: any = {
      status: 'CLOSED_WON',
      commission_amount: { not: null }, // Has commission to pay
      // Filter for transactions where commission hasn't been paid yet
      // (In a full implementation, you'd track commission payment separately)
    };
    if (fromDate || toDate) {
      query.created_at = {};
      if (fromDate) query.created_at.gte = fromDate;
      if (toDate) query.created_at.lte = toDate;
    }

    const outstanding = await prisma.transaction.findMany({
      where: query,
      include: {
        supply_contact: { select: { name: true, phone_number: true } },
        inventory: { select: { apartment_name: true, type: true, locality: true, city: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    const summary = outstanding.reduce((acc, item) => {
      const amount = item.commission_amount || 0;
      acc.total += amount;
      acc.count += 1;
      return acc;
    }, { total: 0, count: 0 });

    res.json({ data: outstanding, summary });
  } catch (error) {
        captureRouteError(error, req, { route: 'reports#2' });
    console.error('Vendor outstanding report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Monthly Sales by Customer
router.get('/account/monthly-sales', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const fromDate = parseDate(from as string) || new Date(new Date().setMonth(new Date().getMonth() - 6));
    const toDate = parseDate(to as string) || new Date();

    const sales = await prisma.$queryRaw<any[]>`
      SELECT
        DATE_TRUNC('month', t.created_at) as month,
        c.name as customer_name,
        c.phone_number,
        COUNT(t.id) as transaction_count,
        SUM(t.final_price) as total_amount
      FROM transactions t
      JOIN contacts c ON t.demand_contact_id = c.phone_number
      WHERE t.type = 'SALE'
        AND t.status = 'CLOSED_WON'
        AND t.created_at >= ${fromDate}
        AND t.created_at <= ${toDate}
      GROUP BY DATE_TRUNC('month', t.created_at), c.name, c.phone_number
      ORDER BY month DESC, total_amount DESC
    `;

    res.json({ data: serializeBigInt(sales) });
  } catch (error) {
        captureRouteError(error, req, { route: 'reports#3' });
    console.error('Monthly sales report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Monthly Commissions Paid to Partners
router.get('/account/monthly-purchase', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const fromDate = parseDate(from as string) || new Date(new Date().setMonth(new Date().getMonth() - 6));
    const toDate = parseDate(to as string) || new Date();

    const commissions = await prisma.$queryRaw<any[]>`
      SELECT
        DATE_TRUNC('month', t.created_at) as month,
        c.name as partner_name,
        c.phone_number,
        COUNT(t.id) as transaction_count,
        SUM(t.commission_amount) as total_amount
      FROM transactions t
      LEFT JOIN contacts c ON t.supply_contact_id = c.phone_number
      WHERE t.status = 'CLOSED_WON'
        AND t.commission_amount IS NOT NULL
        AND t.created_at >= ${fromDate}
        AND t.created_at <= ${toDate}
      GROUP BY DATE_TRUNC('month', t.created_at), c.name, c.phone_number
      ORDER BY month DESC, total_amount DESC
    `;

    res.json({ data: serializeBigInt(commissions) });
  } catch (error) {
        captureRouteError(error, req, { route: 'reports#4' });
    console.error('Monthly commissions report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ============================================================================
// 2. USER REPORTS (Agent Performance)
// ============================================================================

// User Performance
router.get('/user/performance', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const fromDate = parseDate(from as string) || new Date(new Date().setDate(new Date().getDate() - 30));
    const toDate = parseDate(to as string) || new Date();

    const performance = await prisma.$queryRaw<any[]>`
      SELECT
        a.id,
        a.name,
        a.role,
        COUNT(DISTINCT CASE WHEN c.assigned_agent_id = a.id THEN c.phone_number END) as leads_assigned,
        COUNT(DISTINCT CASE WHEN c.assigned_agent_id = a.id AND c.lead_status = 'hot' THEN c.phone_number END) as hot_leads,
        COUNT(DISTINCT CASE WHEN app.assigned_to_agent_id = a.id THEN app.id END) as appointments,
        COUNT(DISTINCT CASE WHEN t.executive_agent_id = a.id AND t.status = 'CLOSED_WON' THEN t.id END) as deals_closed,
        COALESCE(SUM(CASE WHEN t.executive_agent_id = a.id AND t.status = 'CLOSED_WON' THEN t.final_price ELSE 0 END), 0) as total_revenue
      FROM agents a
      LEFT JOIN contacts c ON c.assigned_agent_id = a.id
      LEFT JOIN appointments app ON app.assigned_to_agent_id = a.id AND app.scheduled_at >= ${fromDate} AND app.scheduled_at <= ${toDate}
      LEFT JOIN transactions t ON t.executive_agent_id = a.id AND t.created_at >= ${fromDate} AND t.created_at <= ${toDate}
      WHERE a.status = 'active'
      GROUP BY a.id, a.name, a.role
      ORDER BY total_revenue DESC, deals_closed DESC
    `;

    res.json({ data: serializeBigInt(performance) });
  } catch (error) {
        captureRouteError(error, req, { route: 'reports#5' });
    console.error('User performance report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// User Task Completion
router.get('/user/task-completion', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const fromDate = parseDate(from as string) || new Date(new Date().setDate(new Date().getDate() - 30));
    const toDate = parseDate(to as string) || new Date();

    // Proxy for tasks: appointments scheduled vs completed
    const tasks = await prisma.$queryRaw<any[]>`
      SELECT
        a.id,
        a.name,
        COUNT(CASE WHEN app.status IN ('scheduled', 'confirmed') THEN 1 END) as pending_tasks,
        COUNT(CASE WHEN app.status = 'completed' THEN 1 END) as completed_tasks,
        COUNT(CASE WHEN app.status = 'cancelled' THEN 1 END) as cancelled_tasks,
        COUNT(*) as total_tasks
      FROM agents a
      LEFT JOIN appointments app ON app.assigned_to_agent_id = a.id
        AND app.created_at >= ${fromDate}
        AND app.created_at <= ${toDate}
      WHERE a.status = 'active'
      GROUP BY a.id, a.name
      ORDER BY completed_tasks DESC
    `;

    res.json({ data: serializeBigInt(tasks) });
  } catch (error) {
        captureRouteError(error, req, { route: 'reports#6' });
    console.error('Task completion report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ============================================================================
// 3. CALL REPORTS (Communication Analytics)
// ============================================================================

// All Call Logs
router.get('/call/all-logs', async (req: Request, res: Response) => {
  try {
    const { from, to, type } = req.query;
    const fromDate = parseDate(from as string);
    const toDate = parseDate(to as string);

    const query: any = {};
    if (fromDate || toDate) {
      query.started_at = {};
      if (fromDate) query.started_at.gte = fromDate;
      if (toDate) query.started_at.lte = toDate;
    }
    if (type && type !== 'all') {
      query.direction = type;
    }

    const calls = await prisma.voiceCall.findMany({
      where: query,
      include: { contact: { select: { name: true, phone_number: true } } },
      orderBy: { started_at: 'desc' },
      take: 1000,
    });

    res.json({ data: calls, total: calls.length });
  } catch (error) {
        captureRouteError(error, req, { route: 'reports#7' });
    console.error('Call logs report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Date Wise Call Log
router.get('/call/by-date', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const fromDate = parseDate(from as string) || new Date(new Date().setDate(new Date().getDate() - 30));
    const toDate = parseDate(to as string) || new Date();

    const calls = await prisma.$queryRaw<any[]>`
      SELECT
        DATE(started_at) as call_date,
        direction,
        COUNT(*) as call_count,
        AVG(duration) as avg_duration,
        SUM(CASE WHEN call_status = 'answered' THEN 1 ELSE 0 END) as completed_calls,
        SUM(CASE WHEN call_status = 'missed' THEN 1 ELSE 0 END) as missed_calls
      FROM voice_calls
      WHERE started_at >= ${fromDate} AND started_at <= ${toDate}
      GROUP BY DATE(started_at), direction
      ORDER BY call_date DESC
    `;

    res.json({ data: serializeBigInt(calls) });
  } catch (error) {
        captureRouteError(error, req, { route: 'reports#8' });
    console.error('Date-wise call report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Month Wise Call Summary
router.get('/call/by-month', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const fromDate = parseDate(from as string) || new Date(new Date().setMonth(new Date().getMonth() - 6));
    const toDate = parseDate(to as string) || new Date();

    const calls = await prisma.$queryRaw<any[]>`
      SELECT
        DATE_TRUNC('month', started_at) as month,
        COUNT(*) as total_calls,
        SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as inbound_calls,
        SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) as outbound_calls,
        AVG(duration) as avg_duration,
        SUM(duration) as total_duration
      FROM voice_calls
      WHERE started_at >= ${fromDate} AND started_at <= ${toDate}
      GROUP BY DATE_TRUNC('month', started_at)
      ORDER BY month DESC
    `;

    res.json({ data: serializeBigInt(calls) });
  } catch (error) {
        captureRouteError(error, req, { route: 'reports#9' });
    console.error('Monthly call report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ============================================================================
// 4. LEAD REPORTS (Lead Analytics)
// ============================================================================

// All Leads
router.get('/lead/all-leads', async (req: Request, res: Response) => {
  try {
    const { from, to, status, source } = req.query;
    const fromDate = parseDate(from as string);
    const toDate = parseDate(to as string);

    const query: any = {};
    if (fromDate || toDate) {
      query.created_at = {};
      if (fromDate) query.created_at.gte = fromDate;
      if (toDate) query.created_at.lte = toDate;
    }
    if (status && status !== 'all') {
      query.lead_status = status;
    }
    if (source && source !== 'all') {
      query.source = source;
    }

    const leads = await prisma.contact.findMany({
      where: query,
      include: {
        assigned_agent: { select: { name: true } },
        lead_score: true,
      },
      orderBy: { created_at: 'desc' },
    });

    res.json({ data: leads, total: leads.length });
  } catch (error) {
        captureRouteError(error, req, { route: 'reports#10' });
    console.error('All leads report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Lead Last Contact Date With Days
router.get('/lead/last-contact', async (req: Request, res: Response) => {
  try {
    const leads = await prisma.$queryRaw<any[]>`
      SELECT
        c.phone_number,
        c.name,
        c.lead_status,
        c.source,
        MAX(i.created_at) as last_contact_date,
        EXTRACT(DAY FROM NOW() - MAX(i.created_at)) as days_since_contact
      FROM contacts c
      LEFT JOIN interactions i ON i.phone_number = c.phone_number
      WHERE c.contact_type IN ('BUYER', 'TENANT', 'LANDLORD')
      GROUP BY c.phone_number, c.name, c.lead_status, c.source
      HAVING MAX(i.created_at) IS NOT NULL
      ORDER BY days_since_contact DESC
    `;

    res.json({ data: serializeBigInt(leads) });
  } catch (error) {
        captureRouteError(error, req, { route: 'reports#11' });
    console.error('Lead last contact report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Lead Overall Summary
router.get('/lead/summary', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const fromDate = parseDate(from as string);
    const toDate = parseDate(to as string);

    const query: any = { contact_type: { in: ['BUYER', 'TENANT', 'LANDLORD'] } };
    if (fromDate || toDate) {
      query.created_at = {};
      if (fromDate) query.created_at.gte = fromDate;
      if (toDate) query.created_at.lte = toDate;
    }

    const summary = await prisma.contact.groupBy({
      by: ['lead_status', 'source'],
      where: query,
      _count: { phone_number: true },
    });

    const byStatus = await prisma.contact.groupBy({
      by: ['lead_status'],
      where: query,
      _count: { phone_number: true },
    });

    const bySource = await prisma.contact.groupBy({
      by: ['source'],
      where: query,
      _count: { phone_number: true },
    });

    res.json({
      breakdown: summary,
      by_status: byStatus,
      by_source: bySource,
    });
  } catch (error) {
        captureRouteError(error, req, { route: 'reports#12' });
    console.error('Lead summary report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Lead Cancelled Reason Analysis
router.get('/lead/cancelled-reasons', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const fromDate = parseDate(from as string);
    const toDate = parseDate(to as string);

    const query: any = { lifecycle_stage: 'CLOSED_LOST' };
    if (fromDate || toDate) {
      query.updated_at = {};
      if (fromDate) query.updated_at.gte = fromDate;
      if (toDate) query.updated_at.lte = toDate;
    }

    const cancelled = await prisma.contact.findMany({
      where: query,
      select: {
        phone_number: true,
        name: true,
        notes: true,
        lifecycle_stage: true,
        updated_at: true,
      },
    });

    // Extract cancellation reasons from notes
    const reasonCounts: Record<string, number> = {};
    cancelled.forEach(lead => {
      const reason = lead.notes || 'Not specified';
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    });

    const reasonBreakdown = Object.entries(reasonCounts).map(([reason, count]) => ({
      reason,
      count,
      percentage: ((count / cancelled.length) * 100).toFixed(1),
    }));

    res.json({
      data: cancelled,
      summary: reasonBreakdown,
      total_cancelled: cancelled.length,
    });
  } catch (error) {
        captureRouteError(error, req, { route: 'reports#13' });
    console.error('Cancelled reasons report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ============================================================================
// 5. SOLD REPORTS (Closed Deals)
// ============================================================================

// Sold By Property
router.get('/sold/by-property', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const fromDate = parseDate(from as string);
    const toDate = parseDate(to as string);

    const query: any = { status: { in: ['sold', 'rented'] } };
    if (fromDate || toDate) {
      query.updated_at = {};
      if (fromDate) query.updated_at.gte = fromDate;
      if (toDate) query.updated_at.lte = toDate;
    }

    const sold = await prisma.inventory.findMany({
      where: query,
      select: {
        id: true,
        apartment_name: true,
        type: true,
        intent: true,
        price: true,
        locality: true,
        city: true,
        status: true,
        updated_at: true,
        specs: true,
      },
      orderBy: { updated_at: 'desc' },
    });

    res.json({ data: sold, total: sold.length });
  } catch (error) {
        captureRouteError(error, req, { route: 'reports#14' });
    console.error('Sold by property report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Sold By Area
router.get('/sold/by-area', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const fromDate = parseDate(from as string);
    const toDate = parseDate(to as string);

    const query: any = { status: { in: ['sold', 'rented'] } };
    if (fromDate || toDate) {
      query.updated_at = {};
      if (fromDate) query.updated_at.gte = fromDate;
      if (toDate) query.updated_at.lte = toDate;
    }

    const byArea = await prisma.inventory.groupBy({
      by: ['locality', 'city'],
      where: query,
      _count: { id: true },
      _avg: { price: true },
    });

    res.json({ data: byArea });
  } catch (error) {
        captureRouteError(error, req, { route: 'reports#15' });
    console.error('Sold by area report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Sold By Unit Type
router.get('/sold/by-unit-type', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const fromDate = parseDate(from as string);
    const toDate = parseDate(to as string);

    const query: any = { status: { in: ['sold', 'rented'] } };
    if (fromDate || toDate) {
      query.updated_at = {};
      if (fromDate) query.updated_at.gte = fromDate;
      if (toDate) query.updated_at.lte = toDate;
    }

    const byType = await prisma.inventory.groupBy({
      by: ['type'],
      where: query,
      _count: { id: true },
      _avg: { price: true },
    });

    res.json({ data: byType });
  } catch (error) {
        captureRouteError(error, req, { route: 'reports#16' });
    console.error('Sold by unit type report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ============================================================================
// 6. VISIT REPORTS (Site Visits)
// ============================================================================

// All Site Visits
router.get('/visit/all-visits', async (req: Request, res: Response) => {
  try {
    const { from, to, status } = req.query;
    const fromDate = parseDate(from as string);
    const toDate = parseDate(to as string);

    const query: any = {};
    if (fromDate || toDate) {
      query.scheduled_at = {};
      if (fromDate) query.scheduled_at.gte = fromDate;
      if (toDate) query.scheduled_at.lte = toDate;
    }
    if (status && status !== 'all') {
      query.status = status;
    }

    const visits = await prisma.appointment.findMany({
      where: query,
      include: {
        contact: { select: { name: true, phone_number: true } },
        assigned_to_agent: { select: { name: true } },
        property: { select: { apartment_name: true, type: true, locality: true, city: true } },
      },
      orderBy: { scheduled_at: 'desc' },
    });

    res.json({ data: visits, total: visits.length });
  } catch (error) {
        captureRouteError(error, req, { route: 'reports#17' });
    console.error('All visits report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Property Visit Count
router.get('/visit/property-count', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const fromDate = parseDate(from as string);
    const toDate = parseDate(to as string);

    const query: any = {};
    if (fromDate || toDate) {
      query.scheduled_at = {};
      if (fromDate) query.scheduled_at.gte = fromDate;
      if (toDate) query.scheduled_at.lte = toDate;
    }

    const visitCounts = await prisma.appointment.groupBy({
      by: ['property_id'],
      where: query,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    // Fetch property details
    const propertyIds = visitCounts.map(v => v.property_id).filter(Boolean) as string[];
    const properties = await prisma.inventory.findMany({
      where: { id: { in: propertyIds } },
      select: { id: true, apartment_name: true, type: true, locality: true, city: true },
    });

    const data = visitCounts.map(vc => {
      const property = properties.find(p => p.id === vc.property_id);
      return {
        property_id: vc.property_id,
        property_title: property?.apartment_name || property?.type || 'Unknown',
        locality: property?.locality || '',
        city: property?.city || '',
        visit_count: vc._count.id,
      };
    });

    res.json({ data });
  } catch (error) {
        captureRouteError(error, req, { route: 'reports#18' });
    console.error('Property visit count report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ============================================================================
// 7. CUSTOMER REPORTS
// ============================================================================

// Customers Converted But Not Sold
router.get('/customer/converted-not-sold', async (req: Request, res: Response) => {
  try {
    const customers = await prisma.contact.findMany({
      where: {
        lifecycle_stage: { in: ['QUALIFIED', 'VISIT_SCHEDULED', 'VISITED', 'NEGOTIATION'] },
        contact_type: { in: ['BUYER', 'TENANT'] },
      },
      include: {
        assigned_agent: { select: { name: true } },
        lead_score: true,
      },
      orderBy: { updated_at: 'desc' },
    });

    res.json({ data: customers, total: customers.length });
  } catch (error) {
        captureRouteError(error, req, { route: 'reports#19' });
    console.error('Converted not sold report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ============================================================================
// 8. PROPERTY REPORTS (Inventory Analytics)
// ============================================================================

// All Properties
router.get('/property/all-properties', async (req: Request, res: Response) => {
  try {
    const { status, type, intent } = req.query;

    const query: any = {};
    if (status && status !== 'all') {
      query.status = status;
    }
    if (type && type !== 'all') {
      query.type = type;
    }
    if (intent && intent !== 'all') {
      query.intent = intent;
    }

    const properties = await prisma.inventory.findMany({
      where: query,
      orderBy: { created_at: 'desc' },
    });

    res.json({ data: properties, total: properties.length });
  } catch (error) {
        captureRouteError(error, req, { route: 'reports#20' });
    console.error('All properties report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Hold Properties
router.get('/property/on-hold', async (req: Request, res: Response) => {
  try {
    const properties = await prisma.inventory.findMany({
      where: { status: 'hold' },
      orderBy: { updated_at: 'desc' },
    });

    res.json({ data: properties, total: properties.length });
  } catch (error) {
        captureRouteError(error, req, { route: 'reports#21' });
    console.error('Hold properties report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Property Availability Summary
router.get('/property/availability-summary', async (req: Request, res: Response) => {
  try {
    const byStatus = await prisma.inventory.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    const byType = await prisma.inventory.groupBy({
      by: ['type'],
      _count: { id: true },
    });

    const byIntent = await prisma.inventory.groupBy({
      by: ['intent'],
      _count: { id: true },
    });

    const byLocation = await prisma.inventory.groupBy({
      by: ['city', 'locality'],
      _count: { id: true },
    });

    res.json({
      by_status: byStatus,
      by_type: byType,
      by_intent: byIntent,
      by_location: byLocation,
    });
  } catch (error) {
        captureRouteError(error, req, { route: 'reports#22' });
    console.error('Property availability summary error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

export default router;
