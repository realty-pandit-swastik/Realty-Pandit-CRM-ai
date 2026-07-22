/**
 * Pure compute layer for the Lead Intelligence dashboard.
 *
 * The full role-scoped contact list (GET /api/contacts) is the spine. All
 * date / agent / source filtering happens here as a *narrowing* over what the
 * backend already returned for this user — it can never widen visibility.
 */

export interface RawContact {
  phone_number: string;
  name?: string | null;
  source?: string | null;
  lead_status?: string | null;
  lifecycle_stage?: string | null;
  contact_type?: string | null;
  created_at?: string | null;
  assigned_agent_id?: string | null;
  preferred_location?: string | null;
  lost_reason?: string | null;
  stagnation_reason?: string | null;
  lead_score?: { total_score?: number | null } | null;
  // Phase 3 additions — present in the /api/contacts payload (full Contact row).
  last_interaction?: string | null;
  intent?: string | null;
  budget_min?: number | string | null;
  budget_max?: number | string | null;
  demand_schema_values?: Record<string, any> | null;
  demand_taxonomy_node_id?: string | null;
}

export interface LeadFilters {
  from: Date;
  to: Date;
  agentIds: string[] | null; // null = all visible
  sources: string[] | null;  // null = all
}

// Only demand-side contacts count as "leads" (mirrors MainDashboard) — exclude
// partners, landlords, internal management.
const LEAD_TYPES = new Set(['BUYER', 'TENANT', 'UNKNOWN']);
export function isLead(c: RawContact): boolean {
  return !c.contact_type || LEAD_TYPES.has(c.contact_type);
}

const CLOSED = new Set(['CLOSED_WON', 'CLOSED_LOST']);
const LOST_STATUS = new Set(['lost', 'closed']);

export function isConverted(c: RawContact): boolean {
  return c.lifecycle_stage === 'CLOSED_WON';
}
export function isLost(c: RawContact): boolean {
  return (c.lead_status != null && LOST_STATUS.has(c.lead_status)) || c.lifecycle_stage === 'CLOSED_LOST';
}
export function isActive(c: RawContact): boolean {
  const stageClosed = c.lifecycle_stage != null && CLOSED.has(c.lifecycle_stage);
  const statusLost = c.lead_status != null && LOST_STATUS.has(c.lead_status);
  return !stageClosed && !statusLost;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const parseDate = (s?: string | null): Date | null => {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

// ── Funnel stages (match backend lifecycle_stage values) ──────────────────────
export const FUNNEL_STAGES: Array<{ key: string; label: string }> = [
  { key: 'NEW', label: 'New' },
  { key: 'QUALIFIED', label: 'Qualified' },
  { key: 'VISIT_SCHEDULED', label: 'Visit Scheduled' },
  { key: 'VISITED', label: 'Visited' },
  { key: 'NEGOTIATION', label: 'Negotiation' },
  { key: 'CLOSED_WON', label: 'Converted' },
];

export const AGE_BUCKETS = ['0–7d', '8–15d', '16–30d', '31–60d', '61–90d', '90d+'];
function ageBucket(days: number): string {
  if (days <= 7) return '0–7d';
  if (days <= 15) return '8–15d';
  if (days <= 30) return '16–30d';
  if (days <= 60) return '31–60d';
  if (days <= 90) return '61–90d';
  return '90d+';
}

export interface SourceRow { source: string; count: number; converted: number; lost: number; conversionRate: number; }
export interface RankRow { label: string; count: number; }
export interface FunnelRow { label: string; count: number; dropFromPrev: number | null; ofTop: number; }
export interface AgeRow { label: string; count: number; }
export interface HealthRow { hot: number; warm: number; cold: number; total: number; }
export interface Insight { kind: string; icon: string; title: string; detail: string; tone: 'good' | 'warn' | 'info'; }
export interface LeadActions { neglected: number; hotUncontacted: number; stagnant: number; unqualifiedNew: number; }
export interface DemandProfile { bhk: RankRow[]; budget: RankRow[]; intent: RankRow[]; }

export interface LeadCompute {
  totalLeads: number;
  activeLeads: number;
  convertedLeads: number;
  lostLeads: number;
  hotLeads: number;
  conversionRate: number;
  // deltas vs previous equal-length window (percentage points or % change)
  d_total: number | null;
  d_active: number | null;
  d_converted: number | null;
  d_lost: number | null;
  d_hot: number | null;
  d_conv: number | null;
  dailyLeads: number[];
  sources: SourceRow[];
  funnel: FunnelRow[];
  ageing: AgeRow[];
  health: HealthRow;
  lostReasons: RankRow[];
  delayReasons: RankRow[];
  areas: RankRow[];
  insights: Insight[];
  hasLostReasonData: boolean;
  hasDelayReasonData: boolean;
  actions: LeadActions;
  demandProfile: DemandProfile;
}

function matchesAgentSource(c: RawContact, f: LeadFilters): boolean {
  if (f.agentIds && !(c.assigned_agent_id && f.agentIds.includes(c.assigned_agent_id))) return false;
  if (f.sources && !f.sources.includes(c.source || 'Unknown')) return false;
  return true;
}

function inWindow(c: RawContact, from: Date, to: Date): boolean {
  const d = parseDate(c.created_at);
  return !!d && d >= from && d <= to;
}

function basicCounts(set: RawContact[]) {
  const total = set.length;
  const converted = set.filter(isConverted).length;
  const lost = set.filter(isLost).length;
  const active = set.filter(isActive).length;
  const hot = set.filter((c) => c.lead_status === 'hot').length;
  return { total, converted, lost, active, hot, conv: total ? (converted / total) * 100 : 0 };
}

function deltaPct(cur: number, prev: number): number | null {
  if (!prev) return cur > 0 ? 100 : null;
  return ((cur - prev) / prev) * 100;
}

export function computeLead(all: RawContact[], f: LeadFilters): LeadCompute {
  const leads = all.filter(isLead);

  // Agent/source-scoped universe (date-independent — used for current-state widgets)
  const scoped = leads.filter((c) => matchesAgentSource(c, f));

  // Current window + previous equal-length window (for deltas / acquisition widgets)
  const inRange = scoped.filter((c) => inWindow(c, f.from, f.to));
  const span = f.to.getTime() - f.from.getTime();
  const prevFrom = new Date(f.from.getTime() - span);
  const prevTo = new Date(f.from.getTime() - 1);
  const inPrev = scoped.filter((c) => inWindow(c, prevFrom, prevTo));

  const cur = basicCounts(inRange);
  const prev = basicCounts(inPrev);

  // Daily leads series across the window (for sparkline)
  const days = Math.max(1, Math.round(span / 86400000));
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    buckets.set(dayKey(new Date(f.from.getTime() + i * 86400000)), 0);
  }
  inRange.forEach((c) => {
    const d = parseDate(c.created_at);
    if (!d) return;
    const k = dayKey(d);
    if (buckets.has(k)) buckets.set(k, (buckets.get(k) || 0) + 1);
  });
  const dailyLeads = Array.from(buckets.values());

  // Sources (within window)
  const srcMap = new Map<string, { count: number; converted: number; lost: number }>();
  inRange.forEach((c) => {
    const s = c.source || 'Unknown';
    const e = srcMap.get(s) || { count: 0, converted: 0, lost: 0 };
    e.count++;
    if (isConverted(c)) e.converted++;
    if (isLost(c)) e.lost++;
    srcMap.set(s, e);
  });
  const sources: SourceRow[] = Array.from(srcMap.entries())
    .map(([source, v]) => ({ source, ...v, conversionRate: v.count ? (v.converted / v.count) * 100 : 0 }))
    .sort((a, b) => b.count - a.count);

  // Funnel (current-stage snapshot, within window)
  const stageCount = new Map<string, number>();
  inRange.forEach((c) => {
    if (c.lifecycle_stage) stageCount.set(c.lifecycle_stage, (stageCount.get(c.lifecycle_stage) || 0) + 1);
  });
  const rawFunnel = FUNNEL_STAGES.map((s) => ({ label: s.label, count: stageCount.get(s.key) || 0 }));
  const top = Math.max(rawFunnel[0]?.count || 0, 1);
  const funnel: FunnelRow[] = rawFunnel.map((s, i) => ({
    label: s.label,
    count: s.count,
    ofTop: (s.count / top) * 100,
    dropFromPrev: i === 0 ? null : (rawFunnel[i - 1].count ? ((rawFunnel[i - 1].count - s.count) / rawFunnel[i - 1].count) * 100 : null),
  }));

  // Ageing — current OPEN leads, regardless of date filter
  const activeScoped = scoped.filter(isActive);
  const ageMap = new Map<string, number>(AGE_BUCKETS.map((b) => [b, 0]));
  const now = Date.now();
  activeScoped.forEach((c) => {
    const d = parseDate(c.created_at);
    if (!d) return;
    const days2 = Math.floor((now - d.getTime()) / 86400000);
    const b = ageBucket(days2);
    ageMap.set(b, (ageMap.get(b) || 0) + 1);
  });
  const ageing: AgeRow[] = AGE_BUCKETS.map((label) => ({ label, count: ageMap.get(label) || 0 }));

  // Lead health — current open leads by lead_status
  const health: HealthRow = {
    hot: activeScoped.filter((c) => c.lead_status === 'hot').length,
    warm: activeScoped.filter((c) => c.lead_status === 'warm').length,
    cold: activeScoped.filter((c) => c.lead_status === 'cold').length,
    total: 0,
  };
  health.total = health.hot + health.warm + health.cold;

  // Lost reasons (within window) — empty until capture ships
  const lostMap = new Map<string, number>();
  inRange.filter(isLost).forEach((c) => {
    if (c.lost_reason) lostMap.set(c.lost_reason, (lostMap.get(c.lost_reason) || 0) + 1);
  });
  const lostReasons: RankRow[] = Array.from(lostMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // Delay reasons — current OPEN leads grouped by stagnation_reason (date-independent,
  // describes the current stuck pipeline). Empty until the delay-reason capture is used.
  const delayMap = new Map<string, number>();
  activeScoped.forEach((c) => {
    if (c.stagnation_reason) delayMap.set(c.stagnation_reason, (delayMap.get(c.stagnation_reason) || 0) + 1);
  });
  const delayReasons: RankRow[] = Array.from(delayMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // Areas (within window) by preferred_location
  const areaMap = new Map<string, number>();
  inRange.forEach((c) => {
    const a = (c.preferred_location || '').trim();
    if (a) areaMap.set(a, (areaMap.get(a) || 0) + 1);
  });
  const areas: RankRow[] = Array.from(areaMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // AI insights
  const insights: Insight[] = [];
  const bestSource = [...sources].filter((s) => s.count >= 3).sort((a, b) => b.conversionRate - a.conversionRate)[0];
  if (bestSource) insights.push({ kind: 'best_source', icon: '🎯', tone: 'good', title: 'Best converting source', detail: `${bestSource.source} — ${bestSource.conversionRate.toFixed(0)}% conversion (${bestSource.count} leads)` });
  const topVolume = sources[0];
  if (topVolume) insights.push({ kind: 'top_source', icon: '📈', tone: 'info', title: 'Highest volume source', detail: `${topVolume.source} brought ${topVolume.count} leads this period` });
  const stale = ageing.find((a) => a.label === '90d+');
  if (stale && stale.count > 0) insights.push({ kind: 'stale', icon: '⏳', tone: 'warn', title: 'Ageing pipeline', detail: `${stale.count} active leads are older than 90 days — at risk of going cold` });
  if (topVolume) {
    const topArea = areas[0];
    if (topArea) insights.push({ kind: 'area', icon: '📍', tone: 'info', title: 'Top demand area', detail: `${topArea.label} — ${topArea.count} leads` });
  }

  // ── Lead actions (current open pipeline) ──
  const nowMs2 = Date.now();
  const staleBy = (c: RawContact, ms: number) => {
    const li = parseDate(c.last_interaction);
    return !li || (nowMs2 - li.getTime()) > ms;
  };
  const hasDemand = (c: RawContact) =>
    !!(c.demand_taxonomy_node_id || Number(c.budget_min) || Number(c.budget_max) ||
      (c.demand_schema_values && Object.keys(c.demand_schema_values).length > 0));
  const actions: LeadActions = {
    neglected: activeScoped.filter((c) => staleBy(c, 14 * 86400000)).length,
    hotUncontacted: activeScoped.filter((c) => c.lead_status === 'hot' && staleBy(c, 3 * 86400000)).length,
    stagnant: activeScoped.filter((c) => !!c.stagnation_reason).length,
    unqualifiedNew: activeScoped.filter((c) => c.lifecycle_stage === 'NEW' && !hasDemand(c)).length,
  };

  // ── Demand profile (what open leads want) ──
  const bhkMap = new Map<string, number>();
  const intentMap = new Map<string, number>();
  const budgetMap = new Map<string, number>();
  const BUDGET_ORDER = ['< ₹50 L', '₹50 L–1 Cr', '₹1–2 Cr', '₹2–5 Cr', '₹5 Cr+'];
  const budgetBand = (n: number): string | null => {
    if (!n || n <= 0) return null;
    if (n < 5e6) return '< ₹50 L';
    if (n < 1e7) return '₹50 L–1 Cr';
    if (n < 2e7) return '₹1–2 Cr';
    if (n < 5e7) return '₹2–5 Cr';
    return '₹5 Cr+';
  };
  activeScoped.forEach((c) => {
    const bhk = c.demand_schema_values?.bhk;
    if (bhk) bhkMap.set(String(bhk), (bhkMap.get(String(bhk)) || 0) + 1);
    if (c.intent) intentMap.set(c.intent, (intentMap.get(c.intent) || 0) + 1);
    const band = budgetBand(Number(c.budget_max) || Number(c.budget_min) || 0);
    if (band) budgetMap.set(band, (budgetMap.get(band) || 0) + 1);
  });
  const demandProfile: DemandProfile = {
    bhk: Array.from(bhkMap.entries()).map(([label, count]) => ({ label: `${label} BHK`, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    budget: BUDGET_ORDER.map((label) => ({ label, count: budgetMap.get(label) || 0 })).filter((r) => r.count > 0),
    intent: Array.from(intentMap.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
  };

  return {
    totalLeads: cur.total,
    activeLeads: cur.active,
    convertedLeads: cur.converted,
    lostLeads: cur.lost,
    hotLeads: cur.hot,
    conversionRate: cur.conv,
    d_total: deltaPct(cur.total, prev.total),
    d_active: deltaPct(cur.active, prev.active),
    d_converted: deltaPct(cur.converted, prev.converted),
    d_lost: deltaPct(cur.lost, prev.lost),
    d_hot: deltaPct(cur.hot, prev.hot),
    d_conv: cur.conv - prev.conv, // percentage-point change
    dailyLeads,
    sources,
    funnel,
    ageing,
    health,
    lostReasons,
    delayReasons,
    areas,
    insights,
    hasLostReasonData: lostReasons.length > 0,
    hasDelayReasonData: delayReasons.length > 0,
    actions,
    demandProfile,
  };
}
