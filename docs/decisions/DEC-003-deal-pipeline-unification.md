# DEC-003: Deal Pipeline Unification — AI-Driven Single Workspace

## Status
Accepted — 2026-04-24

## Context

The admin panel currently exposes **two overlapping interfaces** that track the same lead-to-deal journey:

1. **My Task tab** (`LeadWorkflowPage.tsx` + `workflow_task_service.ts`) — an auto-driven 5-stage task queue that forces agents through `QUALIFY_LEAD → SHARE_PROPERTIES → SCHEDULE_VISIT → VISIT_FEEDBACK → NEGOTIATE_DEAL`, with per-stage action forms, due-date enforcement, snooze logic, and WhatsApp follow-up triggers.
2. **Deal Pipeline tab** (`DealPipeline.tsx` + `deal_service.ts`) — a Kanban view over the `Transaction` table with 8 stages (`NEW, MATCHED, VISIT_SCHEDULED, VISITED, NEGOTIATION, CLOSED_WON, CLOSED_LOST, ON_HOLD`), drag-drop movement, ownership transfer, and commission capture.

Completing a workflow task already auto-syncs the deal's pipeline stage. The two are tightly coupled under the hood but present as duplicated surfaces to the agent, causing confusion about where to work.

Simultaneously, the business is shifting to an **AI-first execution model** (AI Pandit Ji) where the AI handles outbound calls (via Omnidim), qualification, property sharing, appointment pushing, and follow-ups. Human agents are expected to step in only for visits, negotiation, and callbacks — while AI continues working in parallel.

## Decision

We adopt a **single-workspace, AI-driven execution architecture** centered on the Deal Pipeline. The workflow engine is preserved but moved to a **headless backend role**.

### 1. Single Workspace

- **Deal Pipeline is the only agent-facing UI** for lead-to-deal work.
- **My Task tab is deprecated from the UI** (removed from navigation and mobile bottom bar).
- The workflow engine (`workflow_task_service.ts`) continues to run — auto task creation, due-date tracking, stage sync, and WhatsApp triggers stay active **as backend-only machinery**.
- Agent actions, per-stage forms, priority sorting, and snooze logic are **absorbed into Deal Pipeline cards**.

### 2. Pipeline Stages (Option A — Schema Replacement)

The `TransactionStatus` enum is restructured to reflect the real business flow:

**Before:**
```
NEW → MATCHED → VISIT_SCHEDULED → VISITED → NEGOTIATION → CLOSED_WON / CLOSED_LOST / ON_HOLD
```

**After:**
```
NEW → QUALIFIED → MATCHING_APPOINTMENT → VISIT_SCHEDULED → VISITED → NEGOTIATION → CLOSED_WON / CLOSED_LOST / ON_HOLD
```

**Migration rules for existing rows:**
- `NEW` with a qualified contact → `QUALIFIED`
- `NEW` with an unqualified contact → remains `NEW`
- `MATCHED` → `MATCHING_APPOINTMENT`
- All other stages retain their current values

Every backend reference, notification, report, and UI label that hardcodes the old stage names must be updated in the same migration.

### 3. Lead Source Classification

Three lead source categories drive entry behavior:

| Source Category     | Examples                              | Entry Stage | AI Action                        |
|---------------------|---------------------------------------|-------------|----------------------------------|
| External            | 99acres, APIs, web forms, inbound WhatsApp | `NEW` (unqualified) | AI must qualify via outbound call first |
| Partner             | Partner agents, builders, brokers     | `NEW` (unqualified) | AI must qualify via outbound call first |
| Internal            | Leads added manually by team members  | `QUALIFIED` (skip qualification) | AI proceeds to property sharing / appointment push |

### 4. AI + Human Parallel Coordination

- **AI never stops.** AI continues its scheduled actions (calls, WhatsApp, reminders) regardless of whether an agent has intervened on the same lead.
- **Agent can join at any stage.** Agent actions (manual calls, notes, stage overrides) are logged but do not pause AI.
- **AI never closes a deal.** When a lead goes cold or unresponsive, AI moves it to `ON_HOLD` and WhatsApps the lead manager: "Customer not replying. Please call and reactivate. If not possible, mark as closed lost." Only humans (lead managers) can move a deal to `CLOSED_LOST`.
- **Conflict handling, retry cadences, and per-stage handoff rules are deferred** to per-stage KRA planning sessions (see Section 8).

### 4a. Pipeline Loop (Non-Linear Flow)

The pipeline is not fully linear. The VISITED stage has three possible exits:

```
VISITED ─┬─→ VISIT_SCHEDULED   (client wants to see more properties from existing shortlist)
         ├─→ QUALIFIED          (client wants completely different properties — re-match required)
         └─→ NEGOTIATION        (client liked a property — ready to negotiate)
```

The existing `workflow_round` field in the `Task` schema tracks visit round number per deal, enabling AI to know it is handling visit #2 or #3 for the same lead.

### 5. AI Activity Logging

- Use the **existing `Interaction` table** — no new model.
- Every AI action (Omnidim call attempt, call result, WhatsApp send, template used) writes an `Interaction` row with `deal_id` and `event_type` filled in.
- Deal Pipeline cards query `Interaction` filtered by `deal_id` to render the activity panel.

### 6. Deal Card Capabilities

Each card in the Deal Pipeline must surface:

- Last AI action (call attempt / WhatsApp sent / property shared)
- Attempt count and last outcome
- Client interest signal (from AI conversation summary)
- Next action (stage-driven form or handoff button)
- Agent take-over button

Stage-based action forms (qualify form, visit date picker, visit feedback entry, negotiation outcome + final price) move from `LeadWorkflowPage` into the card's expandable detail view.

### 7. Visibility Rules

- **Agent** — sees only deals assigned to them.
- **Partner-linked agent** — sees deals from partners mapped to them.
- **Super Admin / Manager** — full visibility across all deals.
- A pipeline filter **"My Deals — Action Required"** sorts Overdue → Today → Upcoming, replicating the current My Task priority queue inside the pipeline surface.

### 8. Per-Stage KRAs (Deferred)

Per-stage responsibilities — AI retry cadence, escalation rules, KRA thresholds, specific form fields, handoff triggers — are **not locked in this decision**. Each pipeline stage gets a dedicated planning session to define:

- AI behavior (scripts, retry schedule, escalation triggers)
- Human behavior (required actions, response-time SLA)
- Stage-exit criteria
- Notification rules

Planning order: `NEW → QUALIFIED → MATCHING_APPOINTMENT → VISIT_SCHEDULED → VISITED → NEGOTIATION`.

### 9. Outbound Calling Provider

- **Omnidim** is the chosen outbound calling provider.
- Integration is scoped: a webhook receiver on our backend logs Omnidim call events into the `Interaction` table against the deal.
- Credentials and API contract will be supplied later; the integration is built stubbed-ready.

### 10. Out of Scope

- The generic **Task Board** (`TaskBoard.tsx` — Phase 3.3 project management) stays as-is. It is unrelated to the lead pipeline and not affected by this decision.

## Consequences

### Positive
- Agents work from a single surface — no tab switching, no duplicated task list.
- Stage names match real business vocabulary (`QUALIFIED` vs `MATCHED`).
- AI activity becomes first-class and visible on every deal card.
- Workflow automation, due dates, and WhatsApp triggers are preserved without the UI confusion cost.
- Foundation set for AI-first operation with agent oversight.

### Negative
- DB migration required. All stage-name references across backend, notifications, reports, and frontend need coordinated updates.
- Existing integrations or dashboards that hardcode `MATCHED` break until updated.
- Retry cadence, conflict rules, and KRA specifics are not yet defined — dependent on per-stage planning sessions.
- `LeadWorkflowPage` deletion must be timed carefully so the headless workflow engine continues receiving its triggers.

## Implementation Order

1. Backend — `TransactionStatus` enum migration + data remap
2. Backend — AI activity logging schema reuse (`Interaction` table wiring by `deal_id`)
3. Backend — qualification branching on lead intake (by source category)
4. Backend — Omnidim webhook receiver (stubbed pending credentials)
5. Frontend — Deal card redesign (AI activity panel, next-action section, embedded stage forms)
6. Frontend — "My Deals — Action Required" filter and priority sort
7. Frontend — remove My Task tab from navigation; keep route alive during transition
8. Per-stage KRA planning sessions (one stage at a time)
