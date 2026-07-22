# Dashboard Redesign — Phase 4: User & Team Performance + Distribution

> **For agentic workers:** implement task-by-task; steps use `- [ ]` checkboxes. This phase is
> **full-stack** — the backend has vitest (`backend/src/__tests__/`), so pure helpers are TDD'd; the
> frontend verifies with `npm run build` + live Playwright, the pattern proven in Phases 0–3. Ships in
> three checkpointed waves (Backend → User Performance → Team Performance + Distribution).

**Goal:** Deepen User Performance (coaching signals, score composition, per-agent commission, drill) and
Team Performance (structure/distribution action, per-agent lead load, distribution-by-channel), backed
by score-component/commission exposure and a new `/distribution` endpoint.

**Architecture:** Extend `scoring.ts` to expose the 4 score components; extend `/user-performance` to
return components + targets + commission; add a role-scoped `GET /api/analytics/distribution` (per-agent
active load + unassigned count + by-channel/partner). Frontend adds the new panels on the existing clay
kit + reuses the Phase-3 leads drill (agent → their leads).

**Tech Stack:** Node/TS + Prisma/PostgreSQL (backend, vitest), React/Vite (frontend), existing clay kit,
`resolveVisibleAgentIds` scope helpers, `drillTo` (lib/drill).

**Spec:** [`docs/design/2026-07-16-dashboard-redesign-spec.md`](../design/2026-07-16-dashboard-redesign-spec.md) ·
**Phase 3:** [`docs/plans/2026-07-16-dashboard-phase3-lead-intelligence.md`](2026-07-16-dashboard-phase3-lead-intelligence.md)

---

## Scope decisions & data gaps (honest — grounded 2026-07-16)

1. **Routing METHOD (round-robin vs sub-user) is recorded NOWHERE** — the chosen `assigned_agent_id` is
   written but the method is only `logger.info`. So "Distribution by route" ships as **by acquisition
   channel** (`Contact.source`) + a **Partner** bucket (`lead_type='PARTNER_REFERRAL'`/`referral_partner_id`,
   inferable) + an **Unassigned** count. The precise RR-vs-sub-user split is **deferred** (needs a new
   `assignment_method` column at ~8 assignment sites). Panel labelled accordingly.
2. **Per-manager custom targets need a new table + settings UI** — out of scope here. Phase 4 exposes
   and renders the scorecard **vs the existing default targets** (`DEFAULT_MONTHLY_TARGETS`, already
   applied by the endpoints); custom per-manager targets are a **follow-up** (the owner's decision stands
   as direction).
3. **Speed-to-lead is not tracked** → omitted from coaching signals + scorecard (Phase 5).
4. **`leads_assigned` is a PERIOD count, not open load** — the distribution "load per agent" uses a NEW
   current-active groupBy, not `leads_assigned`.
5. **Agent-detail perf view doesn't exist** and `'agents'` isn't a `DrillEntity`. Rather than build one,
   Phase 4 drills an agent → **their leads** (`{entity:'leads', filter:{agent_id}}`, reusing the Phase-3
   leads seam + a one-line `agentFilter` seed). A dedicated agent scorecard page is a later follow-up.
6. **Role scope:** every new query uses `resolveVisibleAgentIds` + the existing scope helpers
   (super_boss=org / manager=subtree / employee=self), identical to the other analytics endpoints.

---

## File structure

- **Modify** `backend/src/services/scoring.ts` — `productivityScore` returns `components`.
- **Create** `backend/src/utils/distribution.ts` — pure `classifyRoute(contact)` (+ TDD).
- **Create** `backend/src/__tests__/distribution.test.ts` + extend `scoring.test.ts`.
- **Modify** `backend/src/routes/analytics.ts` — `/user-performance` adds `components`/`targets`/`commission`;
  add `GET /distribution`.
- **Modify** `frontend/src/api/client.ts` — add `getDistribution`.
- **Modify** `frontend/src/components/dashboard/UserPerformanceDashboard.tsx` — coaching strip, score
  composition, commission column, agent→leads drill.
- **Modify** `frontend/src/components/dashboard/TeamPerformanceDashboard.tsx` — structure action strip,
  load-per-agent panel, distribution-by-channel panel, drill.
- **Modify** `frontend/src/components/ExternalLeads.tsx` — seed `agentFilter` from `initialFilter.agent_id`.

---

# WAVE A — Backend: score components + commission + `/distribution`

## Task A1: Expose score components (TDD)

**Files:** Modify `backend/src/services/scoring.ts`; extend `backend/src/__tests__/scoring.test.ts`

- [ ] **Step 1: Read `scoring.ts`** `productivityScore` (~L63-81). It computes `leadComp/convComp/apptComp/invComp`
  then returns `{ score, category }`. Change the return to also expose the components:
```ts
export interface ScoreComponents { leads: number; conversion: number; appointments: number; inventory: number; }
// in productivityScore, after computing the *Comp locals (each already 0..100 or 0..1 — match existing scale):
return {
  score,
  category: categorize(score),
  components: {
    leads: Math.round(leadComp),
    conversion: Math.round(convComp),
    appointments: Math.round(apptComp),
    inventory: Math.round(invComp),
  } as ScoreComponents,
};
```
> Confirm the exact local names + whether they're 0..1 (multiply by 100) or already 0..100. Keep `score`
> and `category` byte-identical so existing callers are unaffected.

- [ ] **Step 2: Add a vitest** to `scoring.test.ts` asserting `components` sums/weights back to `score`
  (within rounding) for a known input; run `npx vitest run src/__tests__/scoring.test.ts` → green.

## Task A2: Route classifier (TDD)

**Files:** Create `backend/src/utils/distribution.ts` + `backend/src/__tests__/distribution.test.ts`

- [ ] **Step 1: Write the failing test** (`distribution.test.ts`):
```ts
import { describe, it, expect } from 'vitest';
import { classifyRoute } from '../utils/distribution';

describe('classifyRoute', () => {
  it('partner beats channel', () => {
    expect(classifyRoute({ source: '99acres', lead_type: 'PARTNER_REFERRAL', referral_partner_id: null })).toBe('Partner');
    expect(classifyRoute({ source: 'website', lead_type: null, referral_partner_id: 'p1' })).toBe('Partner');
  });
  it('maps known channels', () => {
    expect(classifyRoute({ source: '99acres' })).toBe('99acres');
    expect(classifyRoute({ source: 'magicbricks' })).toBe('MagicBricks');
    expect(classifyRoute({ source: 'whatsapp' })).toBe('WhatsApp');
    expect(classifyRoute({ source: 'manual' })).toBe('Manual');
    expect(classifyRoute({ source: null })).toBe('Other');
    expect(classifyRoute({ source: 'weird_thing' })).toBe('Other');
  });
});
```

- [ ] **Step 2: Run it, verify it fails** (`npx vitest run src/__tests__/distribution.test.ts`).

- [ ] **Step 3: Implement `distribution.ts`**:
```ts
// Pure inference of a lead's distribution route. The routing METHOD (round-robin vs sub-user match)
// is not persisted — so "route" here = Partner / acquisition-channel / Other, which IS derivable.
export interface RouteContact { source?: string | null; lead_type?: string | null; referral_partner_id?: string | null; }

const CHANNEL: Record<string, string> = {
  '99acres': '99acres', magicbricks: 'MagicBricks', housing: 'Housing', facebook: 'Facebook',
  website: 'Website', whatsapp: 'WhatsApp', voice: 'Voice', manual: 'Manual',
};

export function classifyRoute(c: RouteContact): string {
  if (c.lead_type === 'PARTNER_REFERRAL' || c.referral_partner_id) return 'Partner';
  const s = (c.source || '').toLowerCase();
  return CHANNEL[s] || 'Other';
}
```
- [ ] **Step 4: Run → green.**

## Task A3: Extend `/user-performance` (components + targets + commission)

**Files:** Modify `backend/src/routes/analytics.ts`

- [ ] **Step 1:** In the `/user-performance` per-agent map (~L199-214), thread through the new fields.
  `productivityScore(...)` now returns `components`; the route already computes `targets` via
  `scaleTargets(DEFAULT_MONTHLY_TARGETS, days)` (~L188) — include it in the response. Add per-agent
  commission by aggregating `DealCommissionEntry` (`party_type='INTERNAL_AGENT'`, group by `agent_id`,
  sum `amount`, scoped by the same visible agent ids + the date window on the deal's close):
```ts
// once, before the map — commission per agent within the window (role-scoped by agent ids):
const commRows = await prisma.dealCommissionEntry.groupBy({
  by: ['agent_id'],
  where: { party_type: 'INTERNAL_AGENT', agent_id: { in: visibleAgentIdsOrAll }, created_at: { gte: startDate, lte: endDate } },
  _sum: { amount: true },
});
const commissionByAgent = new Map(commRows.map((r) => [r.agent_id, Number(r._sum.amount) || 0]));
// …in the per-agent object, add:
components: sc.components,          // from productivityScore return
targets,                            // the scaled targets object already computed
commission: commissionByAgent.get(agent.id) || 0,
```
> Confirm the exact commission table/field names against schema (`DealCommissionEntry.agent_id`,
> `party_type`, `amount`, a date column — the Explore cited `created_at`; if it's `earned_at`/`closed_at`,
> use that). Confirm how `visibleAgentIds` is expressed in this handler (reuse the existing var).

- [ ] **Step 2: Build** — `cd agents/backend && npx tsc --noEmit` → 0 new errors (395 baseline).

## Task A4: `GET /api/analytics/distribution`

**Files:** Modify `backend/src/routes/analytics.ts`

- [ ] **Step 1: Add the route** (role-scoped like its siblings). Import `classifyRoute`:
```ts
router.get('/distribution', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.agent?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
    const ids = await resolveVisibleAgentIds(req.agent?.id, req.agent?.role, tenantId);
    const contactOR = contactScopeOR(ids);
    const withContact = (w: any) => { if (contactOR) w.AND = [...(w.AND ?? []), { OR: contactOR }]; return w; };
    const OPEN = { lifecycle_stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } };

    // Per-agent active load
    const loadRows = await prisma.contact.groupBy({
      by: ['assigned_agent_id'],
      where: withContact({ tenant_id: tenantId, ...OPEN, assigned_agent_id: { not: null } }),
      _count: { _all: true },
    });
    const agentIds = loadRows.map((r) => r.assigned_agent_id!).filter(Boolean);
    const agents = agentIds.length ? await prisma.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } }) : [];
    const nameById = new Map(agents.map((a) => [a.id, a.name]));
    const load = loadRows
      .map((r) => ({ agent_id: r.assigned_agent_id!, agent_name: nameById.get(r.assigned_agent_id!) || '—', active_leads: r._count._all }))
      .sort((a, b) => b.active_leads - a.active_leads);

    // Unassigned active leads
    const unassigned_leads = await prisma.contact.count({ where: withContact({ tenant_id: tenantId, ...OPEN, assigned_agent_id: null }) });

    // By route (channel + partner) — infer client of classifyRoute over active contacts' route fields
    const routeRows = await prisma.contact.findMany({
      where: withContact({ tenant_id: tenantId, ...OPEN }),
      select: { source: true, lead_type: true, referral_partner_id: true },
    });
    const routeMap = new Map<string, number>();
    for (const c of routeRows) { const k = classifyRoute(c); routeMap.set(k, (routeMap.get(k) || 0) + 1); }
    const by_route = Array.from(routeMap.entries()).map(([route, count]) => ({ route, count })).sort((a, b) => b.count - a.count);

    res.json({ load, unassigned_leads, by_route });
  } catch (error: any) {
    captureRouteError(error, req, { route: 'analytics#distribution' });
    res.status(500).json({ error: 'Failed to fetch distribution' });
  }
});
```
> `contactScopeOR` is already imported in analytics.ts. Confirm `Contact.lead_type`/`referral_partner_id`
> field names (Explore: schema :112/:113). The `routeRows.findMany` is a scan of active contacts — fine
> at current volumes (indexed by scope); if it grows, switch to two `groupBy`s (by `source`, and a
> partner count) and merge.

- [ ] **Step 2: Build** — `npx tsc --noEmit` → 0 new errors.
- [ ] **Step 3: Deploy backend** — `cd agents && node deployment/deploy-agent.js backend --skip-verify`.
- [ ] **Step 4: Live-probe (super_boss token / browser fetch):** `/user-performance` now returns
  `components`+`targets`+`commission` per agent; `/distribution` returns `load` (desc), `unassigned_leads`,
  `by_route`. Reconcile: `Σ load.active_leads + unassigned_leads` ≈ total active contacts; `by_route`
  counts sum to the same active total. Repeat for a manager + employee token (scope narrows, no 500s).
- [ ] **Checkpoint — Wave A shippable** (backend richer; dashboards still read old fields → no UI change).

---

# WAVE B — User Performance frontend

## Task B1: `getDistribution` wrapper + coaching strip + composition + commission + drill

**Files:** Modify `frontend/src/api/client.ts`, `UserPerformanceDashboard.tsx`, `ExternalLeads.tsx`

- [ ] **Step 1: Add the wrapper** (`client.ts`, next to `getUserPerformance`):
```ts
export const getDistribution = async (params?: { from?: string; to?: string }) => {
  const res = await client.get('/api/analytics/distribution', { params });
  return res.data;
};
```

- [ ] **Step 2: Seed `agentFilter` in ExternalLeads** (extend the Phase-3 seam, ExternalLeads L195):
  `const [agentFilter, setAgentFilter] = useState(initialFilter?.agent_id ?? '');` — so an agent→leads
  drill pre-filters to that agent.

- [ ] **Step 3: In `UserPerformanceDashboard.tsx`** — extend `PerfRow` to include
  `components?: { leads: number; conversion: number; appointments: number; inventory: number }`,
  `commission?: number`. Fetch distribution alongside the two performance calls (add to the existing
  `Promise.all`), keep `load` for the "overloaded" signal. Then:
  - Add a **Coaching Signals** strip (drillable `KpiCard`s): **Below Target** (count of rows with
    `productivity_category === 'Needs Improvement'`), **Inactive** (reuse `getManagementAlerts` →
    `inactive_agents` count — add that call), **Overloaded** (count of `load` entries with
    `active_leads > OVERLOAD_THRESHOLD`, e.g. 150). Below-Target/Overloaded drill to `{entity:'leads'}`
    (list); Inactive is informational.
  - Add a **Score Composition** card: the workforce-average of the 4 components (avg of
    `rows[].components.*`) as a `ValueBars` — shows where the team is systematically weak
    (e.g. conversion sub-score low).
  - Add a **Commission** column to the All Agents table (`formatINR(p.commission)`).
  - Wrap each agent row (or its name cell) in a leads drill: `drillTo({entity:'leads', filter:{agent_id: p.agent_id}})`.

- [ ] **Step 4: Build** — `cd agents/frontend && npm run build` → clean.
- [ ] **Step 5: Deploy frontend** (stamp `v20260716h-user-perf`) + live-verify (super_boss): coaching
  strip real; composition card renders; commission column populated; click an agent → Ext. Leads filtered
  to `agent_id`; scope holds per role. 0 console errors. **Checkpoint.**

---

# WAVE C — Team Performance + Distribution frontend

## Task C1: Structure action + load-per-agent + by-route + drill

**Files:** Modify `frontend/src/components/dashboard/TeamPerformanceDashboard.tsx`

- [ ] **Step 1:** Fetch `getDistribution(fromTo)` + `getManagementAlerts()` alongside `getTeamPerformance`.
  Then add:
  - **Structure Action** strip (drillable): **Unassigned Agents** (the `Unassigned` team's `member_count`
    from `teams`), **Unassigned Leads** (`distribution.unassigned_leads` → drill `{entity:'leads'}` — note
    the leads list's `active` toggle already shows workable leads), **Teams Off-Target** (count of `teams`
    with `team_score < 40`).
  - **Lead Load per Agent** card: `ValueBars`/`RankedBars` over `distribution.load`
    (`{label: agent_name, value: active_leads}`), top ~12 — surfaces imbalance (some agents at 300+, others
    idle). Each row drillable to that agent's leads (if using a per-row click; else the card is informational
    v1).
  - **Distribution by Channel** card: `RankedBars` over `distribution.by_route`
    (`{label: route, count}`) — Partner / 99acres / MagicBricks / WhatsApp / Website / Manual / Unassigned-as-Other,
    with a subtitle noting the RR-vs-sub-user method split is not yet tracked.

- [ ] **Step 2: Build** → clean.
- [ ] **Step 3: Deploy** (stamp `v20260716i-team-distribution`) + live-verify (super_boss): structure
  strip real (unassigned agents ≈ the known ~29; unassigned leads count); load bars show real per-agent
  spread; by-channel bars reconcile; drill unassigned-leads → Ext. Leads. Manager sees own-team scope.
  0 console errors. **Checkpoint.**

---

## Final verification & docs

- [ ] `cd agents/backend && npx vitest run` → new distribution + scoring-component tests green, baseline
  intact; `npx tsc --noEmit` 0 new; `cd agents/frontend && npm run build` clean.
- [ ] Full role-matrix (super_boss / manager / employee) on both dashboards: new panels render scoped data
  or honest empties; agent→leads and unassigned→leads drills land filtered; numbers reconcile against a
  direct probe; mobile + light/dark OK.
- [ ] `server_health` all-green; `glitchtip_digest` no new errors.
- [ ] Update `docs/PROJECT_STATUS.md` + spec status with the Phase 4 ship; explicitly record the two
  deferred items (routing-method column, per-manager custom-target storage/UI) as the remaining
  distribution/targets follow-ups.

---

## Self-review (against the spec's User + Team panels)

- **User: coaching signals** (below-target, inactive, overloaded; **speed omitted → Phase 5**) → Task B1. ✅
- **User: workforce pulse** — already present (Team Totals KPIs). ✅
- **User: leaderboard** — already present; **commission column + agent→leads drill added**. ✅
- **User: agent scorecard (4 components + targets + commission)** → components exposed (Wave A) + Score
  Composition card + commission column (Task B1); **per-agent detail page deferred** (drill goes to the
  agent's leads instead), **custom targets deferred** (defaults shown). ✅ (partial, noted)
- **Team: structure/distribution action** (unassigned agents/leads, teams off-target) → Task C1. ✅
- **Team: org rollup + team leaderboard (+ Unassigned)** — already present, untouched. ✅
- **Team: leads distribution / load per agent** → `/distribution` + Task C1. ✅
- **Team: distribution by route** → by-channel + partner + unassigned (method split **deferred**, gap
  stated). ✅ (partial, noted)
- **Role scope + honest states** → inherited. ✅
- **No placeholders:** pure helpers TDD'd; the two "confirm exact field name" notes (commission table
  columns, scoring local names) are the only lookups, resolved at execution against the real files. ✅
