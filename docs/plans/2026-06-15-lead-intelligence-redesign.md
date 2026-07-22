# Lead Intelligence Dashboard — Redesign (Clay Continuation)

**Date:** 2026-06-15
**Status:** In progress — Phase A (flagship)
**Owner:** Claude (with Varchasv)
**Spec:** `Chat/dasboard.txt` (3 command centers: Lead / Inventory / User-Team)

## Why

The analytics tabs look "boring / old" for concrete reasons, not taste:

1. **Broken design tokens.** Every analytics component + the tab bar reference
   `var(--border-color)` and `var(--primary)` — **neither is defined** in
   `index.css` or `App.css` (real names: `--border-secondary`, `--accent-primary`).
   Borders + the active-tab underline render transparent → flat, unfinished cards.
2. **Stock recharts defaults.** Default pie/bars, no deltas, no sparklines, no
   themed tooltips = "the boring old pie chart and the graph".
3. **Split personality.** The home tab uses the polished clay+bento system
   (`--shadow-clay`, `--radius-clay`, gradient tiles); analytics tabs use none of it.
4. **IA mismatch.** Spec describes 3 rich command centers (~10–13 sections each);
   app has 6 thin flat tabs.

## Decisions (locked with user, 2026-06-15)

- **Visual direction:** Clay Continuation — extend the home-tab clay+bento look across
  analytics. Light + dark both first-class.
- **Build first:** Lead Intelligence command center (proof-first), then deploy so the
  user can see it live (Playwright screenshots are blocked in this env).

## Data strategy (no backend changes in Phase A)

`GET /api/contacts` returns the **full Contact model** (source, lead_status,
lifecycle_stage, created_at, assigned_agent_id, preferred_location, lost_reason, +
`lead_score`) and is already role-scoped (super_boss=org, manager=subtree,
employee=self). It is the **spine** for nearly every Lead widget.

- Date / Agent / Source filters are applied **client-side** as a *narrowing* over the
  role-scoped result — safe, can't widen beyond what the backend returned. Instant, no
  backend round-trips per filter.
- Supporting role-scoped calls: `getUserPerformance` (leaderboard productivity_score),
  `getFinancialSummary` (revenue KPI). Both accept `from`/`to`.
- Prev-period deltas: filter contacts to the previous equal-length window client-side
  (revenue delta = 2nd financial-summary call).

## Widgets → distinct clay treatments (answers "different style per function")

| Section | Treatment |
|---|---|
| KPI strip | Clay tiles: value + prev-period delta chip (▲/▼ %) + inline sparkline |
| Lead Source | Donut w/ center total + ranked quality bars (conv-rate colored) |
| Conversion funnel | Hand-built vertical funnel, drop-off % per stage |
| Lead health | Segmented hot/warm/cold bar + counts/% |
| Ageing | Color-graded urgency buckets (0-7…90+), green→red |
| Lost reasons | Ranked bars (graceful empty until capture ships) |
| Agent leaderboard | Ranked, medals, score ring, category badge |
| AI insights | Auto highlight cards (best source/agent, needs attention) |

All on a reusable clay shell (`ClayCard`) + theme-aware chart palette
(`useChartColors` via `useTheme`). Sticky `FilterBar` (date chips Today→90d, This/Last
Month, Custom · agent multi-select · source multi-select).

## Phases

- **A (now):** Fix `--border-color`/`--primary` token aliases (instant win for ALL
  tabs). Build AnalyticsKit (clay primitives) + `LeadIntelligenceDashboard`. Replace the
  `market` + `sources` tabs with one **🎯 Lead Intelligence** command center (it
  supersets both). Local prod build → deploy → user reviews live.
- **B:** Add lost-reason capture (mandatory dropdown on mark-lost) → wire lost-reason
  widget to real data; area-wise + delay-reason sections.
- **C:** Roll the clay kit across User/Team Performance + Property/Inventory; full 3-center IA.

## Files

- NEW `components/dashboard/analytics/clay.tsx` — ClayCard, KpiCard, Sparkline, palette
- NEW `components/dashboard/analytics/charts.tsx` — Donut, RankedBars, Funnel, HealthBar, AgeingBars, Leaderboard, InsightCard
- NEW `components/dashboard/analytics/FilterBar.tsx` — filter bar + date presets
- NEW `components/dashboard/analytics/leadData.ts` — pure compute (filter/KPIs/funnel/etc.)
- NEW `components/dashboard/LeadIntelligenceDashboard.tsx` — composition + fetch
- EDIT `index.css` — token aliases
- EDIT `DashboardTabs.tsx` — swap market+sources → lead-intel
- EDIT `index.html` — PWA stamp bump
