# Dashboard Redesign — Design Spec (2026-07-16)

**Status:** Phases 0 + 1 + 2 SHIPPED 2026-07-16. Phase 0 = silent-zeros fix + shared async kit across all 5 dashboards (`v20260716a`). Phase 1 = Property Analytics full rebuild + drill-through (`v20260716b`→`c`) — see [`plans/2026-07-16-dashboard-phase1-property-analytics.md`](../plans/2026-07-16-dashboard-phase1-property-analytics.md). Phase 2 = Main → daily cockpit (Do-This-Now, Pulse w/ deltas, temperature, next-actions, activity, housekeeping, date filter; frontend-only, `v20260716d`→`e`) — see [`plans/2026-07-16-dashboard-phase2-main-cockpit.md`](../plans/2026-07-16-dashboard-phase2-main-cockpit.md). Phase 3 = Lead Intelligence deepening (Lead Action strip, "What Buyers Want" demand profile) + leads drill wired end-to-end (`v20260716f`) — see [`plans/2026-07-16-dashboard-phase3-lead-intelligence.md`](../plans/2026-07-16-dashboard-phase3-lead-intelligence.md). Phase 4 = User/Team Performance deepening + distribution (score components/commission, coaching signals, per-agent load, by-channel; full-stack, `v20260716g`→`h`) — see [`plans/2026-07-16-dashboard-phase4-user-team-distribution.md`](../plans/2026-07-16-dashboard-phase4-user-team-distribution.md). All 4 owner decisions resolved (below). **Phase 5 COMPLETE** — all sub-phases shipped (see [`plans/2026-07-16-dashboard-phase5-instrumentation.md`](../plans/2026-07-16-dashboard-phase5-instrumentation.md)): **5A speed-to-lead SHIPPED** 2026-07-16 (`v20260716i` — computed from Interaction rows, tiles on Main/Lead-Intel/User; price-vs-median was already done in Phase 1). **5B per-manager targets SHIPPED** 2026-07-17 (`v20260717a` — new `targets` table [the redesign's first prod DB migration, run behind a pg_dump], a `🎯 Monthly Targets` editor on **User Performance** gated `manage_team`, and each agent now scored against their own manager's targets [`getTargetsMap` + `scaleTargets`], falling back to defaults). **5D agent-detail scorecard SHIPPED** 2026-07-17 (`v20260717b` — a **Performance** card on each member's profile [`TeamMemberProfile.tsx`], evaluator-gated, reusing `/user-performance` + `/speed-to-lead`; score/category + deals/revenue/commission/response + the 4 score components; trend deferred). **5C routing-method persistence SHIPPED** 2026-07-17 (`v20260717c` — new `contacts.assignment_method` recorded at 21 live assignment sites via an `assignContact` helper + inline cascade tracking; a "By Routing Method" panel on Team Performance; run as a formal data-migration with exhaustive discovery + adversarial-review GO + column-first prod migration; see [`plans/2026-07-17-phase5c-assignment-method-migration.md`](../plans/2026-07-17-phase5c-assignment-method-migration.md)). **5E Pipeline Outlook SHIPPED** 2026-07-17 (`v20260717d` — owner decision resolved on data: commission ledger empty so a true GCI forecast is ungroundable, but 88% of open leads have budgets → shipped an explicitly-labelled **directional weighted-pipeline** [`Σ budget-mid × assumed 2% × assumed stage-probability`], `utils/gci.ts` + `/gci-forecast` + a "🔭 Pipeline Outlook" panel with visible assumptions; **not** presented as a committed forecast). **✅ Phase 5 — and the full 6-phase dashboard redesign — is COMPLETE.**
**Mockup (clickable, all 5 tabs):** https://claude.ai/code/artifact/cf6c4a15-4603-4dd6-adbd-3d2fb8562c62
**Investigation that started this:** [`docs/investigations/2026-07-15-admin-ui-bugs.md`](../investigations/2026-07-15-admin-ui-bugs.md) (the "Property Analytics shows zeros" report).

## Context & goals

The five admin dashboards (Main, Lead Intelligence, User Performance, Team Performance, Property
Analytics) are under-utilised: shallow snapshots, nothing clickable, no trends, a date filter that
only affects one tile, and a silent failure that renders "all zeros" that looks identical to real
data being empty (the reported bug). The owner wants them **reinvented, not replaced** — keep every
existing tile, add depth, make every number a drill-through, and make each dashboard reflect what the
person looking at it (owner / manager / agent) actually needs. Design is grounded in the real
codebase flows (lead intake → dedup → distribution → pipeline stages → scoring → lost/stagnation;
inventory add → taxonomy → media → matching → ageing) and in real-estate dashboard research
(speed-to-lead is the highest-value metric; balance leading vs lagging indicators).

## Scope

**In:** All 5 dashboards, redesigned. Role-aware (auto-detected from JWT), universal date filter
(Today / Yesterday / 3D / 7D / 30D / Custom), clickable drill-through on every metric, all existing
tiles preserved, research-backed additions, and the silent-zeros defect fixed.
**Out (this round):** Non-dashboard pages; the WhatsApp/voice bot; anything requiring a paid data
source we don't have (e.g. true market comparables).

## Cross-cutting foundations (build once, used by all 5)

1. **Universal date filter** — a shared `RangeBar` supporting Today / Yesterday / 3D / 7D / 30D /
   **Custom range**, IST-aware (reuse the existing IST midnight-to-midnight logic already correct in
   `FilterBar.tsx`). **Rule:** period-scoped metrics (new leads, additions, deals closed, activity)
   filter by `created_at`/event date; point-in-time metrics (total/active listings, pipeline, open
   leads) are NOT date-scoped. Each tile declares which it is (this ambiguity is part of why the
   current page confuses users).
2. **Role auto-detection** — already exists: `services/analytics_scope.ts#resolveVisibleAgentIds`
   returns null (super_boss = org) / subtree (manager) / [self] (employee). Frontend renders the
   role-appropriate view; supervisors keep drill-down. **Fix (ties to the zeros bug):** (a) treat all
   admin-class roles safely (don't silently self-scope an unknown role to empty); (b) never render a
   failed/empty fetch as fake zeros — see #4.
3. **Clickable drill-through** — every KPI / action tile / row links to the corresponding filtered
   list (Ext. Leads, Inventory, Deal Pipeline, Tasks) with the right query params. One shared
   `drillTo(entity, filter)` helper. In the mockup this is the toast ("↳ Opens: …").
4. **Honest empty / error / loading states** — replace the silent `getX().catch(() => null)` pattern
   (present on ALL analytics tabs) with three distinct states: **loading**, **error → "couldn't load,
   retry"**, and **empty-in-scope → "no data for your view yet"**. A glitch or an empty role-scope
   must never look like the dashboard is broken. (This is the root-cause fix for the reported bug.)
5. **Shared component kit** — ActionTile (severity stripe + count + drill), KpiCard (value + delta vs
   previous period + sparkline), Funnel, Leaderboard row, DistributionBar, Donut, EmptyState. One
   design system, light + dark, mobile-first (all already prototyped in the mockup).

## Data readiness — what's ready vs what needs new plumbing

| Metric | Source | Status |
|---|---|---|
| Lead counts, hot/warm/cold/lost | `Contact.lead_status` | ✅ exists |
| Pipeline stages / funnel | `Transaction.status` (NEW…CLOSED_WON/LOST) | ✅ exists |
| Lead health score | `LeadScore.total_score` | ✅ exists |
| Lost / stagnation reasons | `Contact.lost_reason` / `stagnation_reason` (10 each) | ✅ exists |
| Lead source + source ROI | `Contact.source` + join to deal outcome | ✅ derivable |
| Neglected / stale / SLA backlog | `Contact.last_interaction`, task due dates | ✅ exists (Alerts engine) |
| Inventory status / intent / type | `Inventory.status/intent/type/taxonomy` | ✅ exists |
| Missing photos | `Inventory.media_score = 0` | ✅ exists |
| Days on market / ageing | `Inventory.created_at` (+ visits) | ✅ derivable |
| Supply-vs-demand gap | matching_engine (demand node ↔ sub_category) counts | ✅ derivable |
| Distribution / round-robin load | `assigned_agent_id` counts; routing = ensure_deal paths | ✅ derivable |
| Agent productivity score | `services/scoring.ts` (0.30 leads+0.30 conv+0.20 appt+0.20 inv) | ✅ exists |
| Team rollups / hierarchy | `services/team_metrics.ts` + `reports_to_id` | ✅ exists |
| Commission (GCI) earned | `Transaction.commission_amount` | ✅ exists |
| **Speed-to-lead** (time to first response) | — not recorded — | 🔧 **NEW** |
| **Price vs area median** | — no median computed — | 🔧 **NEW** (derive from own listings per locality+type) |
| **Configurable targets** (per agent/team) | scoring has DEFAULT targets only | 🔧 **small add** |
| **GCI 30/60/90 forecast** | derive from open pipeline × stage-close-probability | 🔧 **new calc** |

## Per-dashboard spec

For each: the panels, their data source, role scoping, and drill target. All panels obey the
universal date filter + role scope + drill-through foundations above.

### 📊 Main Dashboard (daily cockpit)
| Panel | Source | Drill |
|---|---|---|
| State-of-business one-liner | aggregate of below | — |
| Do-This-Now tiles (callbacks now, visits ASAP, neglected, missing photos, overdue, SLA breaches) | Alerts engine (`services/alerts.ts`) + task queues + `media_score` | filtered list |
| Pulse KPIs (leads, speed-to-lead, active listings, visits, pipeline, commission) w/ deltas | contacts/transactions/inventory counts + `commission_amount` | list |
| Lead temperature bar | `Contact.lead_status` | Lead Intelligence |
| Your Day (next actions) | task queue ordered by priority/SLA | task |
| Live activity feed | recent `Interaction` / status-change events | entity |
| Housekeeping (missing price, inactive members, off-calendar, no-manager) | Alerts engine | list |
Role: Owner = org; Manager = team's; Agent = my queue/my listings.

### 🏠 Property Analytics (inventory intelligence) — includes the zeros fix
| Panel | Source | Drill |
|---|---|---|
| Needs-action (missing photos, stale 60d+, overpriced, no-matched-buyer, pending) | `media_score`, `created_at`+visits, price-vs-median (NEW), matching_engine, `status='pending_approval'` | inventory list |
| Pulse (total, active, added, % with photos, avg days-on-market, % shareable) | inventory counts + `media_score` + `created_at` + matching | list |
| **Status / Intent / Type breakdowns (EXISTING — kept)** | `/api/analytics/property-trends` (already returns these) | list |
| Supply-vs-Demand gap | matching_engine: demand nodes vs inventory sub_category | match report |
| Ageing buckets + Price positioning | `created_at` buckets; price-vs-median (NEW) | list |
| By location; Top-performing listings | `locality`; share/enquiry/visit counts per inventory | list |
Role: Owner = all stock; Manager = team's stock + per-member media health; Agent = my listings.

### 🎯 Lead Intelligence
| Panel | Source | Drill |
|---|---|---|
| Lead action (neglected, hot-uncontacted, stagnant, unqualified NEW) | `last_interaction`, `lead_status`, `stagnation`, `Transaction.status=NEW` w/o demand | list |
| Pulse (new, hot, conversion, speed-to-lead, avg health, lost rate) | contacts + LeadScore + speed-to-lead (NEW) | list |
| Source performance (real channels) | `Contact.source` × conversion | list |
| Conversion funnel (real stages) | `Transaction.status` | pipeline |
| Lead health distribution | `LeadScore.total_score` bands | list |
| Why leads die (lost reasons) / stall (stagnation) | `lost_reason` / `stagnation_reason` | list |
| Demand hot zones + demand profile | `demand_location`, `demand_schema_values` (bhk/budget/intent) | list |

### 👥 User Performance (agent scorecards)
| Panel | Source | Drill |
|---|---|---|
| Coaching signals (below target, slow responders, inactive, overloaded) | scoring + speed-to-lead (NEW) + activity + load counts | agent list |
| Workforce pulse (avg score, avg conv, avg speed, deals, active) | scoring aggregate | — |
| Leaderboard (score, leads, conv, speed, deals) | `Agent.productivity_score` (`services/scoring.ts`) | agent detail |
| Agent scorecard (4 score components + targets + commission + activity) | scoring breakdown + `commission_amount` + targets (small add) | — |
Role: Owner = all agents; Manager = team members; Agent = own scorecard + rank.

### 🏆 Team Performance (rollups + distribution)
| Panel | Source | Drill |
|---|---|---|
| Structure/distribution action (unassigned agents, unassigned leads, teams off-target) | `reports_to_id` gap, unassigned queue, `team_metrics` vs targets | list |
| Org rollup + Team leaderboard (+ Unassigned bucket) | `services/team_metrics.ts#aggregateTeams` | team detail |
| **Leads distribution / load per agent** | `assigned_agent_id` active-lead counts | agent list |
| Distribution by route (round-robin / sub-user / partner / unassigned) | ensure_deal + integration routing paths | list |
Role: Owner = all teams; Manager = own team + its load.

## Build order (phased, each shippable + verified)

- **Phase 0 — Foundations & the bug (highest priority):** shared date filter, role-scope hardening,
  honest empty/error states (kills the silent-zeros), drill-through helper, component kit. This alone
  fixes the reported bug and makes the current pages trustworthy.
- **Phase 1 — Property Analytics rebuild** (mostly existing data; fixes the buggy page first).
- **Phase 2 — Main cockpit** (Do-This-Now + pulse + your-day; reuses Alerts engine).
- **Phase 3 — Lead Intelligence** (funnel/sources/health/lost — all existing data).
- **Phase 4 — User + Team Performance + distribution** (scoring/team_metrics exist; add load view).
- **Phase 5 — New instrumentation:** speed-to-lead capture (timestamp first outbound after intake),
  price-vs-median calc, configurable targets, GCI forecast. Sequenced last because tiles can show
  "not yet tracked" until these land.

Each phase: build behind the shared kit, `tsc`/build clean, deploy, verify live per role via the
existing Playwright + minted-token pattern, keep the existing tiles working throughout.

## Verification
Per phase: (1) role-matrix check (owner/manager/employee see the right scope, never fake zeros);
(2) date-filter correctness incl. custom range and point-in-time vs period-scoped; (3) drill-through
opens the correct filtered list; (4) numbers reconcile against a direct DB/endpoint query;
(5) mobile + light/dark; (6) GlitchTip clean.

## Resolved decisions (owner, 2026-07-16)
1. **Price-vs-median → derive from our own listings.** Compute an approximate median per
   locality + property type from our own inventory (free, v1). Accuracy is bounded by our own stock;
   revisit with a paid comparables feed later. (Phase 1 / Phase 5.)
2. **Speed-to-lead → first outbound of any kind, including the bot's auto-reply.** Measure the time
   from lead-created to the first message/call out (Panditji's instant ack counts). This measures the
   customer's real wait. (Phase 5 instrumentation — timestamp first outbound after intake.)
3. **Targets → each manager sets their own team's.** Per-manager monthly targets (leads / conversions /
   deals), not owner-central. Implication: Phase 4/5 needs a small manager-facing target-setting UI, and
   `services/scoring.ts` must read a manager's set targets with the current engine defaults as the
   fallback until they're set.
4. **Distribution view → stays on the Team Performance tab** (round-robin load per agent, unassigned
   leads, routing by source), alongside team rollups + the Unassigned bucket. Not on Main. (Phase 4.)
