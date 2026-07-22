# Dashboard Redesign — Phase 3: Lead Intelligence Deepening

> **For agentic workers:** implement task-by-task; steps use `- [ ]` checkboxes. **Frontend-only** —
> `getContacts()` already returns full Contact rows, so no backend/schema change. Verify with
> `npm run build` + live Playwright, the pattern proven in Phases 0–2.

**Goal:** Deepen the (already-rich) Lead Intelligence dashboard with a **Lead Action strip**
(neglected / hot-uncontacted / stagnant / unqualified-NEW), a **Demand Profile** panel (BHK / budget /
intent), and **drill-through** — which also finally wires the **leads pre-filter** so Lead-Intel *and*
the Main/Property cockpit tiles land the Ext. Leads list filtered.

**Architecture:** Extend the pure `computeLead` (leadData.ts) — widen `RawContact` to declare fields the
API already returns, add `actions` + `demandProfile` to its output — and render two new panels + a
leads `Drill` wrapper. Then add the `initialFilter` seam to `ExternalLeads` and a `leadsFilter` branch
to the `App.tsx` `onDrill` listener, mirroring the shipped Inventory drill pattern exactly.

**Tech Stack:** React/Vite, existing clay kit + `RankedBars`/`SourceDonut`/`Funnel`/`HealthBar`
(charts), `useAsyncData` (AsyncState), `drillTo` (lib/drill).

**Spec:** [`docs/design/2026-07-16-dashboard-redesign-spec.md`](../design/2026-07-16-dashboard-redesign-spec.md) ·
**Phase 2:** [`docs/plans/2026-07-16-dashboard-phase2-main-cockpit.md`](2026-07-16-dashboard-phase2-main-cockpit.md)

---

## Grounded facts (confirmed 2026-07-16)

- `GET /api/contacts` returns the **full role-scoped Contact row** (no `select`) incl. `lead_score` —
  so `last_interaction`, `stagnation_reason`/`stagnation_set_at`, `intent`, `budget_min/max`,
  `demand_schema_values`, `demand_taxonomy_node_id`, `lifecycle_stage`, `preferred_location` are all in
  the payload. `RawContact` (leadData.ts L9-22) declares only a subset — **widen it**, no new endpoint.
- **Field names (corrected):** `budget_min`/`budget_max` (NOT `demand_budget_*`), `intent` (NOT
  `demand_intent`), `preferred_location` (NOT `demand_location`), `demand_schema_values.bhk` is a
  **string** (`"1"`,`"2"`,`"1 RK"`,`"8+"`). Budget columns are Prisma `Decimal` → JSON may be a string;
  coerce with `Number(...)`.
- **Speed-to-lead: not tracked anywhere** → omitted (Phase 5).
- **Health uses `lead_status`** (hot/warm/cold), not `total_score` — keep as-is.
- **ExternalLeads drill gotchas:** its `status` filter maps to `where.lead_status` — so "neglected"
  must drill via **`not_contacted_days:'14'`** (→ `last_interaction < cutoff OR null`), NOT
  `status:'stale'` (which would match `lead_status='stale'` → 0 rows). "Stagnant" and "unqualified-NEW"
  have **no server filter** (stagnation / lifecycle_stage aren't leads-list params) → those tiles
  **navigate** to the leads list unfiltered (noted).
- **Drill is unbuilt for leads on both ends:** `App.tsx` `onDrill` only injects a filter for
  `inventory` (L272-275); `ExternalLeads` takes only `isMobile` (L143). Both mirror the shipped
  Inventory seam.

---

## File structure

- **Modify** `frontend/src/components/dashboard/analytics/leadData.ts` — widen `RawContact`; add
  `actions` + `demandProfile` to `LeadCompute` + `computeLead`.
- **Modify** `frontend/src/components/dashboard/LeadIntelligenceDashboard.tsx` — Lead Action strip,
  Demand Profile panel, leads `Drill` wrapper on the action tiles.
- **Modify** `frontend/src/components/ExternalLeads.tsx` — add `initialFilter?`/`onFilterConsumed?`
  props; seed the filter `useState`s.
- **Modify** `frontend/src/App.tsx` — `leadsFilter` state + `onDrill` `leads` branch + pass to both
  `<ExternalLeads>` render sites.

---

# WAVE A — Lead actions + demand profile + drill wrappers

## Task A1: Extend `leadData.ts`

**Files:** Modify `frontend/src/components/dashboard/analytics/leadData.ts`

- [ ] **Step 1: Widen `RawContact`** (L9-22) — add the fields the API already returns:

```ts
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
  // Phase 3 additions (present in the /api/contacts payload):
  last_interaction?: string | null;
  intent?: string | null;
  budget_min?: number | string | null;
  budget_max?: number | string | null;
  demand_schema_values?: Record<string, any> | null;
  demand_taxonomy_node_id?: string | null;
}
```

- [ ] **Step 2: Add the two new output types + extend `LeadCompute`** (after `HealthRow`/`Insight`, and
  inside the `LeadCompute` interface L87-112):

```ts
export interface LeadActions { neglected: number; hotUncontacted: number; stagnant: number; unqualifiedNew: number; }
export interface DemandProfile { bhk: RankRow[]; budget: RankRow[]; intent: RankRow[]; }
```
Add to `LeadCompute`: `actions: LeadActions;` and `demandProfile: DemandProfile;`

- [ ] **Step 3: Compute them** — insert before the `return` (after the `insights` block, ~L260), using
  the existing `activeScoped` (current open pipeline, agent/source-scoped):

```ts
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
```

- [ ] **Step 4: Add to the return object** (L262-286): `actions,` and `demandProfile,`.

- [ ] **Step 5: Build** — `cd agents/frontend && npm run build` → PASS (leadData is imported by the
  dashboard; a type error surfaces here).

## Task A2: Render the new panels + drill wrappers

**Files:** Modify `frontend/src/components/dashboard/LeadIntelligenceDashboard.tsx`

- [ ] **Step 1: Add imports** — `RankedBars` is already imported; add:
```tsx
import { drillTo, type DrillTarget } from '../../lib/drill';
```

- [ ] **Step 2: Add a leads `Drill` wrapper** (inside the component, after the early-return guards, near
  the other `const`s) — mirrors PropertyAnalytics but targets `leads`:
```tsx
  const Drill: React.FC<{ filter?: Record<string, string>; children: React.ReactNode }> = ({ filter, children }) => {
    const target: DrillTarget = filter ? { entity: 'leads', filter } : { entity: 'leads' };
    return (
      <div role="button" tabIndex={0} title="Open in Ext. Leads →" style={{ cursor: 'pointer' }}
        onClick={() => drillTo(target)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drillTo(target); } }}>
        {children}
      </div>
    );
  };
```

- [ ] **Step 3: Add the Lead Action strip** — directly after the AI Insights block (L124), before the
  KPI strip:
```tsx
        {/* Lead actions */}
        <div>
          <SectionLabel icon="⚡">Lead Action</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--bento-gap)' }}>
            <Drill filter={{ not_contacted_days: '14' }}><KpiCard label="Neglected" value={formatNum(c.actions.neglected)} accent="#ef4444" icon="😴" /></Drill>
            <Drill filter={{ status: 'hot', not_contacted_days: '3' }}><KpiCard label="Hot, Uncontacted" value={formatNum(c.actions.hotUncontacted)} accent="#f43f5e" icon="🔥" /></Drill>
            <Drill><KpiCard label="Stagnant" value={formatNum(c.actions.stagnant)} accent="#f59e0b" icon="🧊" /></Drill>
            <Drill><KpiCard label="Unqualified New" value={formatNum(c.actions.unqualifiedNew)} accent="#8b5cf6" icon="❓" /></Drill>
          </div>
        </div>
```
(Stagnant / Unqualified-New have no server filter → they navigate to the leads list unfiltered.)

- [ ] **Step 4: Add the Demand Profile panel** — near the Top Demand Areas card (after L170), as its own
  card. Add a small local label component at the top of the file (module scope):
```tsx
const MiniLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>{children}</p>
);
```
Then render:
```tsx
        <ClayCard title="What Buyers Want" subtitle="Demand profile of your open leads">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><MiniLabel>Preferred BHK</MiniLabel><RankedBars rows={c.demandProfile.bhk} color="#3b82f6" emptyIcon="🛏️" emptyText="No BHK preferences captured" /></div>
            <div><MiniLabel>Budget bands</MiniLabel><RankedBars rows={c.demandProfile.budget} color="#22c55e" emptyIcon="💰" emptyText="No budgets captured on open leads" /></div>
            <div><MiniLabel>Intent</MiniLabel><RankedBars rows={c.demandProfile.intent} color="#8b5cf6" emptyIcon="🎯" emptyText="No intent captured" /></div>
          </div>
        </ClayCard>
```

- [ ] **Step 5: Build** — `cd agents/frontend && npm run build` → PASS.

## Task A3: Deploy + verify Wave A

- [ ] Bump `frontend/index.html` stamp → `<!-- v20260716f-lead-intel -->`; deploy
  `node deployment/deploy-agent.js frontend --skip-verify`.
- [ ] Live (super_boss): clear SW, reload, open **Lead Intelligence** → **Lead Action** strip renders
  real counts; **What Buyers Want** shows BHK / budget / intent bars (or honest empties); existing
  panels intact; click **Neglected** → navigates to Ext. Leads (unfiltered until Wave B). 0 console
  errors. Screenshot.
- [ ] **Checkpoint — Wave A shippable.**

---

# WAVE B — Leads drill pre-filter

## Task B1: `ExternalLeads` accepts an initial filter

**Files:** Modify `frontend/src/components/ExternalLeads.tsx`

- [ ] **Step 1: Add props** (signature L143):
```tsx
export function ExternalLeads({ isMobile: isMobileProp, initialFilter, onFilterConsumed }:
  { isMobile?: boolean; initialFilter?: Record<string, string> | null; onFilterConsumed?: () => void } = {}) {
```

- [ ] **Step 2: Seed the filter `useState`s** from `initialFilter` (only keys with a clean server param):
  - `statusFilter` (L193) → `useState(initialFilter?.status ?? '')`
  - `sourceFilter` (L194) → `useState(initialFilter?.source ?? '')`
  - `notContactedDays` (L205) → `useState(initialFilter?.not_contacted_days ? Number(initialFilter.not_contacted_days) : 0)`
  - `activeFilter` (L219) → `useState<'active' | 'archived' | 'all'>((initialFilter?.active as any) || 'active')`
  (Leave the other filters at their current defaults.)

- [ ] **Step 3: One-shot consume** — add near the other effects:
```tsx
  useEffect(() => { if (initialFilter && onFilterConsumed) onFilterConsumed(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
```

- [ ] **Step 4: Build** → PASS.

## Task B2: `App.tsx` leads drill wiring

**Files:** Modify `frontend/src/App.tsx`

- [ ] **Step 1: Add `leadsFilter` state** (next to `drillFilter` L211):
```tsx
  const [leadsFilter, setLeadsFilter] = useState<Record<string, string> | null>(null);
```

- [ ] **Step 2: Extend the `onDrill` listener** (L272-275):
```tsx
  useEffect(() => onDrill(({ entity, filter }) => {
    if (entity === 'inventory') setDrillFilter(filter ?? null);
    if (entity === 'leads') setLeadsFilter(filter ?? null);
    setView(entity);
  }), []);
```

- [ ] **Step 3: Pass to both `<ExternalLeads>` sites:**
  - Desktop (`case 'leads'`, L661): `return <ExternalLeads initialFilter={leadsFilter} onFilterConsumed={() => setLeadsFilter(null)} />;`
  - Mobile (`case 'leads'`, L545): `return <MobileScrollWrapper><ExternalLeads isMobile={true} initialFilter={leadsFilter} onFilterConsumed={() => setLeadsFilter(null)} /></MobileScrollWrapper>;`

- [ ] **Step 4: Build** → PASS.

## Task B3: Deploy + verify the leads drill

- [ ] Bump stamp → `<!-- v20260716g-leads-drill -->`; deploy frontend.
- [ ] Live (super_boss): clear SW, reload, open **Lead Intelligence** → click **Neglected** → lands on
  **Ext. Leads** with the "not contacted 14d+" filter applied and the count reflecting it; click **Hot,
  Uncontacted** → Ext. Leads filtered to `lead_status=hot` + stale. Navigate away + back to Ext. Leads
  via the sidebar → filter is **cleared** (one-shot). Also confirm Main's **Neglected Leads** tile now
  pre-filters the leads list too. 0 console errors. Screenshot before/after.
- [ ] **Checkpoint — Wave B shippable.**

---

## Final verification & docs

- [ ] `cd agents/frontend && npm run build` → 0 new TS errors.
- [ ] Full live role-matrix on Lead Intelligence (super_boss / manager / employee): action strip +
  demand profile render scoped data or honest empties; drill lands the filtered leads list; existing
  panels intact; mobile + light/dark OK; ErrorState on forced failure (Phase-0 spine).
- [ ] `server_health` all-green; `glitchtip_digest` no new errors.
- [ ] Update `docs/PROJECT_STATUS.md` recent-deploys with the Phase 3 ship; mark Phase 3 done in the
  spec status line. Note the **leads pre-filter is now live** (removes one of the queued follow-ups).

---

## Self-review (against the spec's Lead Intelligence panels)

- **Lead action** (neglected, hot-uncontacted, stagnant, unqualified-NEW) → Task A1/A2. ✅
  (stagnant/unqualified navigate-only — no server filter; noted.)
- **Pulse** (new, hot, conversion, avg health, lost rate) → already present (6 KPIs); **speed-to-lead
  omitted** (Phase 5). ✅
- **Source performance / funnel / health / lost / delay reasons / demand areas / leaderboard** → already
  present, untouched. ✅
- **Demand hot zones + demand profile (bhk/budget/intent)** → areas already present; BHK/budget/intent
  added in Task A1/A2. ✅
- **Drill-through** → action tiles drill to Ext. Leads; leads pre-filter built end-to-end (Wave B),
  which also lights up the Main/Property leads-target tiles. ✅
- **Role + honest states** → inherited (getContacts spine + `useAsyncData`). ✅
- **No backend change** — all fields already in the `/api/contacts` payload. ✅
- **Type consistency:** `LeadActions`/`DemandProfile` used identically in `computeLead` output and the
  render; drill filter keys (`status`,`source`,`not_contacted_days`,`active`) match the ExternalLeads
  seeds in Task B1. ✅
- **No placeholders:** complete code throughout; the field-name + `status:'stale'` gotchas are resolved,
  not deferred.
