# Dashboard Redesign — Phase 0 Implementation Plan

> **For agentic workers:** implement task-by-task; steps use `- [ ]` checkboxes. Follow this project's
> established verification (there is **no frontend test runner** — no vitest/jest/testing-library, no
> `test` script), so each task verifies with `npm run build` (which runs `tsc -b && vite build`) +
> live browser checks, the same pattern used to verify the 2026-07-15 shipped fixes. Do **not** add a
> test harness — that's out of scope for Phase 0.

**Goal:** Build the shared foundations for the dashboard redesign — an honest loading/error/empty
async-state kit, a drill-through helper, and date-filter consistency — and use the async-state kit to
**fix the silent "Property Analytics all-zeros" bug across all five analytics dashboards.**

**Architecture:** One shared `useAsyncData` hook + `LoadingState`/`ErrorState`/`EmptyState` components
in the existing clay kit. Every dashboard replaces its `.catch(() => null)` / `.catch(() => ({empty}))`
(which makes a failed fetch look identical to "no data") with three distinct states: loading, error
(→ retry), and empty-in-scope (→ friendly message). Plus a `drillTo()` navigation helper (foundation
for making numbers clickable in later phases) and confirming every dashboard drives off the existing
`RangeBar` date filter.

**Tech Stack:** React + TypeScript (Vite), existing `axios` client (`src/api/client.ts`), existing
clay kit (`src/components/dashboard/analytics/`). Deploy via `node deployment/deploy-agent.js frontend`.

**Spec:** [`docs/design/2026-07-16-dashboard-redesign-spec.md`](../design/2026-07-16-dashboard-redesign-spec.md)

---

## File structure

- **Create** `src/components/dashboard/analytics/AsyncState.tsx` — the shared async-state kit:
  `useAsyncData` hook + `LoadingState`, `ErrorState`, `EmptyState` components. One responsibility:
  turn a fetch into a 4-state (`loading`/`error`/`empty`/`ready`) result and render honest UI.
- **Create** `src/lib/drill.ts` — `drillTo(target)` navigation helper (foundation for clickable
  numbers). One responsibility: map a dashboard "list target" to the right route + query string.
- **Modify** the 5 dashboards in `src/components/dashboard/` to use `useAsyncData`:
  `PropertyAnalyticsDashboard.tsx`, `LeadIntelligenceDashboard.tsx`, `UserPerformanceDashboard.tsx`,
  `TeamPerformanceDashboard.tsx`, `MainDashboard.tsx`.
- **Modify** `src/components/DashboardTabs.tsx` — provide the current role + a `drillTo` callback to
  the dashboards (small).
- No backend change required for Phase 0. (Role-scope in `services/analytics_scope.ts` already returns
  the correct set per role; the bug was the frontend collapsing failures/empties to zeros, which this
  plan fixes. A backend `resolveVisibleAgentIds` hardening for genuinely-unknown roles is deferred —
  it's belt-and-suspenders once the frontend distinguishes error from empty.)

---

## Task 1: Shared async-state kit (`useAsyncData` + Loading/Error/Empty)

**Files:**
- Create: `src/components/dashboard/analytics/AsyncState.tsx`

- [ ] **Step 1: Create `AsyncState.tsx` with the full implementation**

```tsx
import React from 'react';

export type AsyncStatus = 'loading' | 'error' | 'empty' | 'ready';

/**
 * Turns a fetch into an honest 4-state result. The key fix (2026-07-16): a failed request is
 * `error` (retryable), NOT collapsed into empty/zeros. Includes a stale-response guard so a slow
 * earlier request can't overwrite a newer one (same pattern used in InventoryList.loadInventory).
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList,
  isEmpty: (data: T) => boolean,
): { status: AsyncStatus; data: T | null; reload: () => void } {
  const [status, setStatus] = React.useState<AsyncStatus>('loading');
  const [data, setData] = React.useState<T | null>(null);
  const [nonce, setNonce] = React.useState(0);
  const reqId = React.useRef(0);

  React.useEffect(() => {
    const myId = ++reqId.current;
    setStatus('loading');
    fetcher()
      .then((d) => {
        if (myId !== reqId.current) return;
        setData(d);
        setStatus(isEmpty(d) ? 'empty' : 'ready');
      })
      .catch((err) => {
        if (myId !== reqId.current) return;
        console.error('[dashboard] load failed', err);
        setStatus('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { status, data, reload: () => setNonce((n) => n + 1) };
}

const wrap: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  gap: 10, minHeight: 260, textAlign: 'center', color: 'var(--text-secondary)',
};

export const LoadingState: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div style={wrap}><div style={{ fontSize: 26 }}>⏳</div><div>{label}</div></div>
);

export const ErrorState: React.FC<{ onRetry: () => void; label?: string }> = ({
  onRetry, label = "Couldn't load this dashboard.",
}) => (
  <div style={wrap}>
    <div style={{ fontSize: 26 }}>⚠️</div>
    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 13 }}>It's a connection or session hiccup — your data is fine.</div>
    <button
      onClick={onRetry}
      style={{ marginTop: 6, padding: '8px 18px', borderRadius: 8, border: 'none',
        background: 'var(--text-link)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
    >Retry</button>
  </div>
);

export const EmptyState: React.FC<{ icon?: string; title?: string; hint?: string }> = ({
  icon = '📭', title = 'Nothing here yet', hint,
}) => (
  <div style={wrap}>
    <div style={{ fontSize: 26 }}>{icon}</div>
    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{title}</div>
    {hint && <div style={{ fontSize: 13, maxWidth: 360 }}>{hint}</div>}
  </div>
);
```

- [ ] **Step 2: Typecheck + build**

Run: `cd agents/frontend && npm run build`
Expected: PASS (0 new TS errors; `AsyncState.tsx` compiles). If it fails, fix before continuing.

- [ ] **Step 3: Commit**

```bash
git add agents/frontend/src/components/dashboard/analytics/AsyncState.tsx
git commit -m "feat(dashboard): shared async-state kit (loading/error/empty) — foundation for zeros fix"
```

---

## Task 2: Fix Property Analytics (the reported page) with the async-state kit

**Files:**
- Modify: `src/components/dashboard/PropertyAnalyticsDashboard.tsx` (fetch at L26; loading at L44)

- [ ] **Step 1: Replace the swallowing fetch with `useAsyncData`**

Find the current effect + state (around L17-34):
```tsx
const [data, setData] = useState<PropertyTrends | null>(null);
const [loading, setLoading] = useState(true);
const [range, setRange] = useState<DateRange>(defaultRange());
useEffect(() => {
  const fromTo = { from: range.from.toISOString(), to: range.to.toISOString() };
  (async () => {
    try {
      setLoading(true);
      const trends = await getPropertyTrends(fromTo).catch(() => null);
      setData(trends);
    } catch (e) { console.error('Property analytics load failed', e); }
    finally { setLoading(false); }
  })();
}, [range.from, range.to]);
```
Replace with:
```tsx
const [range, setRange] = useState<DateRange>(defaultRange());
const { status, data, reload } = useAsyncData<PropertyTrends>(
  () => getPropertyTrends({ from: range.from.toISOString(), to: range.to.toISOString() }),
  [range.from, range.to],
  (d) => !(d?.status_breakdown?.length),
);
```

- [ ] **Step 2: Add the import**

At the top with the other analytics imports:
```tsx
import { useAsyncData, LoadingState, ErrorState, EmptyState } from './analytics/AsyncState';
```

- [ ] **Step 3: Replace the loading return + add error/empty branches**

Find (L44): `if (loading) return <div style={{…}}>Loading property analytics…</div>;`
Replace with:
```tsx
if (status === 'loading') return <LoadingState label="Loading property analytics…" />;
if (status === 'error') return <ErrorState onRetry={reload} />;
if (status === 'empty') return <EmptyState icon="🏠" title="No inventory in your view yet"
  hint="As soon as listings are assigned to you (or added), they'll appear here." />;
```
(The rest of the component — which derives `totalProps` etc. from `data` — is unchanged; `data` is
non-null and non-empty by the time it renders.)

- [ ] **Step 4: Typecheck + build**

Run: `cd agents/frontend && npm run build`
Expected: PASS. Confirm no unused `loading`/`setData`/`setLoading` remain (delete them if flagged).

- [ ] **Step 5: Commit**

```bash
git add agents/frontend/src/components/dashboard/PropertyAnalyticsDashboard.tsx
git commit -m "fix(dashboard): Property Analytics shows error/empty state instead of silent zeros"
```

---

## Task 3: Fix Lead Intelligence

**Files:**
- Modify: `src/components/dashboard/LeadIntelligenceDashboard.tsx` (fetch L48-52; loading L91)

- [ ] **Step 1: Replace the swallowing Promise.all with `useAsyncData`**

The component fetches contacts (separate effect) + a `Promise.all` of perf/financial with
`.catch(() => ({…}))`. Consolidate the analytics fetch:
```tsx
import { useAsyncData, LoadingState, ErrorState, EmptyState } from './analytics/AsyncState';
// …
const { status, data, reload } = useAsyncData(
  () => Promise.all([
    getUserPerformance({ from: range.from.toISOString(), to: range.to.toISOString() }),
    getFinancialSummary({ from: range.from.toISOString(), to: range.to.toISOString() }),
    getFinancialSummary({ from: prevFrom.toISOString(), to: prevTo.toISOString() }),
  ]).then(([perf, fin, prevFin]) => ({ perf, fin, prevFin })),
  [range.from, range.to],
  (d) => !(d?.perf?.performance?.length),
);
```
Remove the old `.catch(() => ({ performance: [] }))` / `.catch(() => ({ total_revenue: 0 }))` calls —
those are exactly the silent-swallow this task removes. Read `data.perf` / `data.fin` / `data.prevFin`
downstream (rename the old variables accordingly).

- [ ] **Step 2: Replace loading return + add branches** (L91)
```tsx
if (status === 'loading') return <LoadingState label="Loading lead intelligence…" />;
if (status === 'error') return <ErrorState onRetry={reload} />;
if (status === 'empty') return <EmptyState icon="🎯" title="No lead data in your view yet"
  hint="Once leads are assigned to you, their sources, funnel and health appear here." />;
```

- [ ] **Step 3: Build** — `cd agents/frontend && npm run build` → PASS.
- [ ] **Step 4: Commit**
```bash
git add agents/frontend/src/components/dashboard/LeadIntelligenceDashboard.tsx
git commit -m "fix(dashboard): Lead Intelligence honest error/empty states"
```

---

## Task 4: Fix User Performance

**Files:**
- Modify: `src/components/dashboard/UserPerformanceDashboard.tsx` (fetch L44-47; loading L92)

- [ ] **Step 1: Replace the swallowing Promise.all**
```tsx
import { useAsyncData, LoadingState, ErrorState, EmptyState } from './analytics/AsyncState';
// …
const { status, data, reload } = useAsyncData(
  () => Promise.all([
    getUserPerformance({ from: range.from.toISOString(), to: range.to.toISOString() }),
    getUserPerformance({ from: prevFrom.toISOString(), to: prevTo.toISOString() }),
  ]).then(([cur, prev]) => ({ cur, prev })),
  [range.from, range.to],
  (d) => !(d?.cur?.performance?.length),
);
```
Remove the `.catch(() => ({ performance: [] }))` calls. Read `data.cur` / `data.prev` downstream.

- [ ] **Step 2: Loading return + branches** (L92)
```tsx
if (status === 'loading') return <LoadingState label="Loading user performance…" />;
if (status === 'error') return <ErrorState onRetry={reload} />;
if (status === 'empty') return <EmptyState icon="👥" title="No performance data yet"
  hint="Performance appears once agents in your scope have activity in this period." />;
```
- [ ] **Step 3: Build** → PASS.
- [ ] **Step 4: Commit**
```bash
git add agents/frontend/src/components/dashboard/UserPerformanceDashboard.tsx
git commit -m "fix(dashboard): User Performance honest error/empty states"
```

---

## Task 5: Fix Team Performance

**Files:**
- Modify: `src/components/dashboard/TeamPerformanceDashboard.tsx` (fetch L44; loading L84)

- [ ] **Step 1: Replace the swallowing fetch**
```tsx
import { useAsyncData, LoadingState, ErrorState, EmptyState } from './analytics/AsyncState';
// …
const { status, data, reload } = useAsyncData(
  () => getTeamPerformance({ from: range.from.toISOString(), to: range.to.toISOString() }),
  [range.from, range.to],
  (d) => !(d?.teams?.length),
);
```
Remove `.catch(() => ({ teams: [] }))`. Read `data.teams` downstream.

- [ ] **Step 2: Loading return + branches** (L84)
```tsx
if (status === 'loading') return <LoadingState label="Loading team performance…" />;
if (status === 'error') return <ErrorState onRetry={reload} />;
if (status === 'empty') return <EmptyState icon="🏆" title="No teams to show yet"
  hint="Teams appear once agents have a reporting manager set (reports_to). Most agents are currently unassigned." />;
```
- [ ] **Step 3: Build** → PASS.
- [ ] **Step 4: Commit**
```bash
git add agents/frontend/src/components/dashboard/TeamPerformanceDashboard.tsx
git commit -m "fix(dashboard): Team Performance honest error/empty states"
```

---

## Task 6: Fix Main Dashboard

**Files:**
- Modify: `src/components/dashboard/MainDashboard.tsx` (single try/catch L31-88; loading + defaults)

- [ ] **Step 1: Track an error state on the aggregate load**

MainDashboard wraps several calls (`getContacts`, `getAppointments`, `getInventory`,
`getWorkflowStats`) in one `try/catch` and defaults values to 0 on failure. Add an `error` state so a
failure shows a retry instead of a page of zeros. Add near the other `useState`:
```tsx
const [error, setError] = useState(false);
```
In the effect, set it:
```tsx
try {
  setLoading(true); setError(false);
  // …existing awaits…
} catch (e) {
  console.error('Main dashboard load failed', e);
  setError(true);
} finally { setLoading(false); }
```
(Keep the per-call `getWorkflowStats().catch(()=>{})` — a missing stats widget shouldn't blank the
whole page; that's a deliberate partial-failure, not the bug.)

- [ ] **Step 2: Render loading/error before the content**

Add the import and, right after the existing `if (loading) …` early return, add:
```tsx
import { LoadingState, ErrorState } from './analytics/AsyncState';
// …in render, replacing/augmenting the loading return:
if (loading) return <LoadingState label="Loading your dashboard…" />;
if (error) return <ErrorState onRetry={() => window.location.reload()} />;
```
(Main aggregates multiple sources and isn't a good fit for the single-fetcher hook; the local
error-state boolean is the right tool here.)

- [ ] **Step 3: Build** → PASS.
- [ ] **Step 4: Commit**
```bash
git add agents/frontend/src/components/dashboard/MainDashboard.tsx
git commit -m "fix(dashboard): Main dashboard shows retry on load failure, not zeros"
```

---

## Task 7: Drill-through helper (foundation for clickable numbers)

**Files:**
- Create: `src/lib/drill.ts`
- Modify: `src/components/DashboardTabs.tsx` (pass a `drillTo` down; L28-43 renderContent)

- [ ] **Step 1: Create `src/lib/drill.ts`**

```ts
/**
 * Foundation for "every number is clickable". A dashboard tile calls drillTo({...}) to open the
 * matching filtered list. Later phases wire this into individual tiles; Phase 0 just establishes it.
 */
export type DrillTarget =
  | { entity: 'leads'; filter?: Record<string, string> }
  | { entity: 'inventory'; filter?: Record<string, string> }
  | { entity: 'deals'; filter?: Record<string, string> }
  | { entity: 'tasks'; filter?: Record<string, string> };

const ROUTE: Record<DrillTarget['entity'], string> = {
  leads: '/external-leads',
  inventory: '/inventory',
  deals: '/deal-pipeline',
  tasks: '/tasks',
};

/** Build the target URL (does not navigate). */
export function drillUrl(t: DrillTarget): string {
  const qs = new URLSearchParams(t.filter || {}).toString();
  return ROUTE[t.entity] + (qs ? `?${qs}` : '');
}

/** Navigate to the filtered list. Uses the app's existing hash/history navigation. */
export function drillTo(t: DrillTarget): void {
  window.location.assign(drillUrl(t));
}
```
> NOTE for the implementer: confirm the four route paths above against this app's actual router
> (check how existing nav buttons in `DashboardTabs.tsx` / the sidebar navigate — e.g. `App.tsx`
> route names). If the app uses a different scheme (hash routes, a `setPage` callback), adjust
> `ROUTE` + `drillTo` to match that scheme. This is the one place to get right.

- [ ] **Step 2: Build** — `cd agents/frontend && npm run build` → PASS (pure module, compiles).
- [ ] **Step 3: Commit**
```bash
git add agents/frontend/src/lib/drill.ts
git commit -m "feat(dashboard): drillTo() helper — foundation for clickable numbers"
```

---

## Task 8: Date-filter consistency check

**Files:**
- Read/verify: all 5 dashboards; Modify only if a dashboard lacks `RangeBar`.

- [ ] **Step 1: Confirm each dashboard renders `<RangeBar range={range} onRange={setRange} />`**

`RangeBar` (from `analytics/FilterBar`) already supports Today / Yesterday / 3D / 7D / 14D / 30D /
This Month / Last Month / **Custom**. Property/Lead/User/Team already use it. Verify `MainDashboard`
has a range control; if it drives off its own date state without `RangeBar`, add:
```tsx
import { RangeBar, defaultRange, DateRange } from './analytics/FilterBar';
const [range, setRange] = useState<DateRange>(defaultRange());
// …near the top of the render:
<RangeBar range={range} onRange={setRange} />
```
and include `range.from`/`range.to` in the load effect's deps so changing the range refetches.

- [ ] **Step 2: Build** → PASS.
- [ ] **Step 3: Commit** (only if changed)
```bash
git add agents/frontend/src/components/dashboard/MainDashboard.tsx
git commit -m "feat(dashboard): consistent RangeBar date filter on Main"
```

---

## Task 9: Live verification + deploy

- [ ] **Step 1: Full build**

Run: `cd agents/frontend && npm run build`
Expected: PASS, 0 new TS errors vs baseline.

- [ ] **Step 2: Deploy frontend + PWA cache-bust**

Bump the stamp in `agents/frontend/index.html` (e.g. `<!-- v20260716a-dashboard-phase0 -->`), then:
```bash
cd agents && node deployment/deploy-agent.js frontend --skip-verify
```
Expected: `frontend deployed successfully`.

- [ ] **Step 3: Live-verify the fix (Playwright, super_boss)**

Log in at `https://admin.realtypandit.in` (super_boss 9958860411 / noteplz123). For each of the 5
dashboard tabs:
- Normal load → real numbers render (Property Analytics shows 743/727, not 0).
- **Force an error**: in DevTools, set network offline (or block `api.realtypandit.in`), click Retry
  on a tab → the tab shows the **⚠️ Error state with a Retry button**, NOT all-zeros. Restore network,
  click Retry → data returns.
- Change the date filter (Today / Yesterday / Custom) → period-scoped tiles update; totals stay.
- Screenshot before/after (error state vs data) for the record.

- [ ] **Step 4: Verify an employee (non-super_boss) no longer sees fake zeros**

Using a minted employee token or a test employee login, open Property Analytics: it must show either
their real scoped data or the **friendly EmptyState** ("No inventory in your view yet"), never a page
of silent zeros.

- [ ] **Step 5: Confirm GlitchTip stays clean** (server_health / glitchtip digest) after deploy.

- [ ] **Step 6: Final commit / status**

Update `docs/PROJECT_STATUS.md` recent-deploys with the Phase 0 ship (async-state kit + zeros fix +
drill helper + date-filter consistency), and note Phases 1-5 remain per the design spec.

---

## Self-review (against the spec)

- **Foundations covered:** date filter (Task 8 — already existed, verified), role-scope (handled via
  honest empty vs error — Tasks 2-6; backend hardening deferred, noted), drill-through (Task 7),
  honest empty/error/loading states (Tasks 1-6), component kit (Task 1). ✅
- **The reported bug** (Property Analytics zeros): fixed in Task 2, generalised to all tabs (Tasks
  3-6). ✅
- **No placeholders:** every code step shows real code; the one judgement call (drill route scheme) is
  explicitly flagged with how to resolve it. ✅
- **Type consistency:** `useAsyncData<T>` signature + `{status,data,reload}` shape is used identically
  in Tasks 2-5; `LoadingState`/`ErrorState`/`EmptyState` props match Task 1's definitions. ✅
- **Deferred (correctly, to later phases):** per-tile drill wiring, new instrumentation (speed-to-lead,
  price-median, targets, GCI forecast), and the richer role-specific panels from the mockup — those
  are Phases 1-5.
