# Plan — Role-Based Analytics & Performance Command Center

**Date:** 2026-06-14
**Stage:** Plan (Discuss complete). No code until Phase 0 is approved to execute.
**Source spec:** `Chat/dasboard.txt` (Lead + Inventory + User Performance dashboards)
**Driver:** Hierarchical performance visibility (Super Admin / Reporting Manager / Team Member).

> See companion analysis in chat 2026-06-14. This file is the actionable plan.

---

## Locked product decisions

1. **Sequencing:** Phase 0 (access-control fix) ships first, then Phases 1–4.
2. **Manager depth:** Full reporting **subtree** (manager-of-managers sees indirect reports), cached.
3. **New capture (all approved):** structured lost + delay reasons; property view tracking; WhatsApp daily check-in compliance; management alert engine. (Phase 3.)
4. **Freshness:** Near-real-time via materialized `metrics_daily` rollups (Phase 2); "today" reads live.

---

## What already exists (reuse — do NOT rebuild)

- **Hierarchy:** `Agent.reports_to_id` (self-ref), `subordinates[]`, roles `super_boss`/`manager`/`employee`.
- **Scoping logic:** `middleware/contact_visibility.ts#buildContactVisibilityFilter` — exactly the rules we want, but applied only to contact *lists*, not analytics.
- **RBAC:** `config/permissions.ts` (PERMISSIONS matrix + `hasPermission`), `checkPermission` middleware.
- **Attribution FKs:** `Contact.assigned_agent_id` / `created_by` / `owning_manager_id`; `Inventory.uploaded_by_agent_id` / `assigned_agent_id`; `Transaction.executive_agent_id`; `Appointment.assigned_to_agent_id`; `TaskFollowup` (status/scheduled_at/executed_at).
- **Scores partly built:** `LeadScore` (intent/engagement/reliability/urgency/total).
- **Derivable datasets:** `PropertyShare` (sharing perf), `WhatsAppMessage` (engagement), Google Calendar/Task sync (integration status), `Interaction` (activity timeline, first-touch latency).
- **Frontend:** `DashboardTabs` (5 tabs), `AdvancedAnalytics`, `ReportsView` (26+ report types w/ CSV/Excel/PDF), recharts, jspdf/xlsx/papaparse, light/dark.

## The core gap

`routes/analytics.ts` scopes **only by `tenant_id`** on all 6 endpoints → every user (incl. employees) sees org-wide leads/perf/revenue/inventory. `DashboardTabs.tsx` has **no role gating**. Endpoints use `authMiddleware` only (no `view_reports`), and `employee` lacks `view_reports` yet still reaches them.

---

## PHASE 0 — Close the access-control gap (execute first)

### 0.1 New backend primitive: `resolveVisibleAgentIds`
New file `services/analytics_scope.ts`:

```
resolveVisibleAgentIds(agentId, role, tenantId): Promise<string[] | null>
  super_boss -> null            // sentinel: no restriction
  manager    -> [self, ...full recursive subtree via reports_to_id]
  employee   -> [self]
```
- Recursive subtree: single recursive CTE (`WITH RECURSIVE`) over `agents` — one query, not N walks.
- Cache per `(tenantId, agentId)` with short TTL (e.g. 5 min) — hierarchy changes rarely.
- `null` return = skip the filter (super_boss fast path).

### 0.2 Apply scope to every analytics query
Helper `scopeWhere(field, ids)` → `ids === null ? {} : { [field]: { in: ids } }`. Per-table field map:

| Endpoint | Table | Scope field(s) |
|---|---|---|
| market-trends (leads) | contacts | `assigned_agent_id`/`created_by`/`owning_manager_id` ∈ ids |
| market-trends (visits) | appointments | `assigned_to_agent_id` ∈ ids |
| market-trends (sales) | transactions | `executive_agent_id` ∈ ids |
| user-performance | agents | restrict agent list to ids (employee sees only self row) |
| lead-sources | contacts | contact attribution ∈ ids |
| property-trends | inventory | `uploaded_by_agent_id`/`assigned_agent_id` ∈ ids |
| financial-summary | transactions | `executive_agent_id` ∈ ids |
| advanced | all of the above | per-table as above |

**Contact attribution rule** (mirrors `contact_visibility`): a contact is in-scope if `assigned_agent_id ∈ ids OR created_by ∈ ids OR owning_manager_id ∈ ids`.

### 0.3 Raw SQL note
The `$queryRaw` blocks (market-trends, advanced) need parameterized `= ANY(${ids})` clauses, or convert to Prisma aggregates. Keep `tenant_id` AND the agent-set filter (AND, not OR).

### 0.4 ⚠️ Precaution — Prisma WHERE/OR clobber
The contact attribution is an OR. When combined with date + tenant filters it MUST be `AND: [{ tenant_id }, { created_at }, { OR: [...] }]` — a bare top-level `OR` clobbers the other conditions. See `precautions/prisma-where-or-pattern.md` (this exact trap bit the location filter before).

### 0.5 Permissions / route guards
- Keep analytics reachable by all authenticated agents, but **scoped**. Do not gate analytics on `view_reports` (employees lack it). Org-wide-only widgets (if any) gate on role === super_boss.
- Drive scope from the hierarchy resolver, **not** the coarse `view_all_leads` flag (manager has it but must stay team-limited).

### 0.6 Frontend
- `DashboardTabs.tsx`: gate tabs by role. Employee: Overview + Leads + Inventory + **My Performance** (self). Manager: + Team Performance + Leaderboards (team). Super_boss: all + org User Performance.
- Agent/User filter dropdown auto-limited to the IDs the role may see (backend already enforces; UI must not offer out-of-scope agents).
- Add an employee **"My Performance"** self view (reuse UserPerformanceDashboard scoped to self).

### 0.7 Edge cases
- `null`/unauthenticated agent → empty set (no data), never all.
- Partner-referred contacts: respect `owning_manager_id` (inherits partner's `managing_agent_id`).
- Deals attribution: prefer `executive_agent_id`; fall back to demand/supply contact's agent if exec null.
- Pre-Apr-2026 contacts with null `created_by`: covered by `assigned_agent_id`.

### 0.8 Verification (per project discipline — browser proof)
- Role matrix test: log in as super_boss, a manager, and one of their employees; confirm each dashboard shows the correct subset (counts must differ and reconcile: sum of team ⊆ org).
- Playwright screenshots before/after for each role (per visual-proof rule).
- Confirm an employee canNOT see another team's data via the agent filter or direct API call (test the endpoint with an employee JWT).

---

## PHASE 1 — Team Performance dashboard + leaderboards
- New `Team Performance` section (manager + super_boss): team lead count, conversion rate, inventory added, productivity/follow-up/appointment scores.
- Leaderboards (team-scoped for managers, org for super_boss): top/bottom performers, sortable by deals/revenue/leads (your screenshot already has the sort chips).
- Teams = implicit (manager + subtree). Formal `Team` table deferred unless org-chart ≠ reporting-chart.

## PHASE 2 — Scoring engines + `metrics_daily` rollups
- `metrics_daily` table (agent_id, date, leads_added, contacted, followups_done/missed, appts_*, conversions, revenue, inventory_added, completeness_avg, shares, wa_checkin, productivity_score).
- Cron refresh (reuse existing cron infra); "today" reads live, history reads rollup.
- Implement formulas: Productivity, Follow-Up Discipline, Lead Health (map onto `LeadScore`), Inventory Quality (taxonomy NodeField required-field completeness), Team score.
- Add composite indexes: `(tenant_id, assigned_agent_id, created_at)`, `(tenant_id, lifecycle_stage, created_at)`, `(uploaded_by_agent_id, created_at)`.

## PHASE 3 — New capture (all approved)
Schema migrations (additive):
- `Contact.lost_reason` (enum-backed) + `lost_at`; mandatory dropdown on close-as-lost flow.
- `Contact.stagnation_reason` + `stagnation_set_at`; prompt on long-pending active leads.
- New `PropertyView` table (`inventory_id`, `viewer`, `channel`, `created_at`) + wire view events (website/admin/share opens).
- WhatsApp daily check-in compliance: derive consecutive-active/missed-days from `WhatsAppMessage` per agent; store in `metrics_daily`.
- Management alert engine: low-activity user, missing photos/price, Calendar/Tasks not connected → alert cards + (optional) digest.

## PHASE 4 — Advanced
- Area/locality heatmap (group by geo-derived locality, not raw `preferred_location` text) + Google Maps (already integrated).
- Demand-gap analysis (reuse matching engine): top unmet demand configurations for sourcing.
- SLA analytics (% leads contacted within 15/30-min SLA — infra already exists), first-touch latency, zero-match active-deal detector.
- KPI previous-period deltas everywhere; export polish.

---

## Schema migrations summary (all additive, none destructive)
| Phase | Change |
|---|---|
| 2 | `metrics_daily` table + 3 composite indexes |
| 3 | `Contact.lost_reason`, `lost_at`, `stagnation_reason`, `stagnation_set_at`; new `PropertyView` table |

## Checkpoints (per `feedback_subagent_overhead` — inline exec w/ phase boundaries)
- After Phase 0 backend resolver: unit-test the role matrix before touching endpoints.
- After Phase 0 endpoints: API-level role test (3 JWTs) before frontend.
- After Phase 0 frontend: Playwright screenshots per role; reconcile counts.
- Each phase = its own Discuss→Plan→Execute pass with a PROJECT_STATUS update on deploy.

## Open items / to confirm before Phase 3
- Exact lost-reason and delay-reason enum values (use dasboard.txt lists as default).
- Whether "view" counts website public views, admin opens, or both.
- Named teams (Sales/Telecalling) needed, or implicit reporting-line teams sufficient.
