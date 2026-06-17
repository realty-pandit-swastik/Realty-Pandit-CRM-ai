---
name: reference-callback-routing
description: How WhatsApp callback / visit-request signals are routed to lead managers (post-2026-05-12 fix)
metadata:
  type: reference
---

# Callback / Visit Request Routing (post-2026-05-12)

Before 2026-05-12, property-card button taps and free-text callback requests
logged an `interactions` row but never produced a CRM task. Leads went cold.
The fix routes every signal into the existing task system + push pipeline.

## Entry points → one helper

All four entry points call `createLeadActionTask()` in
`agents/backend/src/services/workflow_task_service.ts`:

| Source | File | Trigger |
|---|---|---|
| WhatsApp button tap (Call Back) | `services/property_card_reply_handler.ts:~107` | `isCallback` branch |
| WhatsApp button tap (Schedule Visit) | `services/property_card_reply_handler.ts:~169` | `isSchedule` branch |
| WhatsApp free text ("call me back", "callback chahiye", "वापस कॉल") | `services/message_router.ts:~95` | regex fast-path before classifier |
| Backfill | `scripts/backfill-missed-callback-tasks.ts` | `sourceChannel: 'backfill'` |

## Task creation contract

- `task_type`: `CALLBACK_REQUEST` (15 min SLA) or `VISIT_REQUEST` (30 min SLA)
- `priority`: `HIGH` if assigned to the lead's `assigned_agent_id`; `URGENT` if no agent → super_boss fallback
- `assigned_to`: `contact.assigned_agent_id` → fallback to first active `role='super_boss'` agent (5-min cache)
- Idempotency: skips if any open task of same `task_type` for same `contact_phone` exists in last 60 min
- Side effects (inside the same call):
  - `prisma.task.create()` — the task row
  - `prisma.interaction.create()` with `event_type='lead_action_task_created'`
  - `notify('lead_action_task_created', [agent], …)` — push + WhatsApp
  - BullMQ delayed job `task-sla-check` on `scheduledJobsQueue`, fires at `due_date`

## SLA escalation

Job handler in `agents/backend/src/queues/workers/scheduled_worker.ts` under
`case 'task-sla-check'`. At T+SLA:
- If `task.status !== 'TODO'` → no-op (agent already acted)
- Else reassign to super_boss, set `priority='URGENT'`, push notify + WhatsApp via `lead_action_sla_breach` event
- Writes `interactions` row `event_type='task_sla_escalated'` for audit

Two-tier escalation:
- **T+0** — original `assigned_agent_id`
- **T+15 (callback) / T+30 (visit)** — `role='super_boss'` (Sunny Sharma)

## Monitoring

`scripts/callback-sla-report.ts` — daily guardrail. Exits non-zero if any
`property_card_*_request` interaction in the last 24h lacks a matching task.
Hook to PM2 cron at 9 AM IST. Run manually:
```
cd /var/www/realty-pandit/backend && npx ts-node --transpile-only scripts/callback-sla-report.ts
```

## Backfill script

`scripts/backfill-missed-callback-tasks.ts` — idempotent. Scans last 30 days
of `property_card_*_request` interactions; creates tasks for those without
one. Supports `--dry-run` (default) and `--execute`.

**Gotcha:** Scripts that call `createLeadActionTask` hang on exit because the
BullMQ queue connection keeps the event loop alive even after
`prisma.$disconnect()`. Wrap with `timeout 30` or add an explicit
`scheduledJobsQueue.close()` at script end. The DB writes are committed
before the hang so data is durable.

## Notification events added

In `agents/backend/src/config/notification_events.ts`:
- `lead_action_task_created` — push + WhatsApp on initial task creation
- `lead_action_sla_breach` — push + WhatsApp on auto-escalation to super_boss

Both reuse the existing `notify()` → `push_service.ts` → `notification_agent` pipeline.

## Frontend visibility

`agents/frontend/src/components/dashboard/MainDashboard.tsx` Lead Tasks chip row
includes 2 chips at the FRONT of the list (red + rose), surfacing CALLBACK_REQUEST
and VISIT_REQUEST counts ahead of the 5-stage workflow chips. Counts pulled from
`workflowStats.by_stage` — `getWorkflowStats()` in `workflow_task_service.ts:~940`
groups by `task_type` and excludes only `GENERAL`, so the new types are included
automatically with no backend change.

## Scheduled jobs (BullMQ)

Registered in `agents/backend/src/queues/workers/scheduled_worker.ts`
`startScheduledWorker()`:
- `callback-sla-report` — daily 8:30 AM IST (`pattern: '0 3 * * *'`). Compares
  signals vs tasks in last 24h; if unmatched, sends WhatsApp alert to every active
  super_boss agent via `wa.sendText()`. Handler embedded inline in `dispatchJob`.
- `task-sla-check` — delayed (not cron). One enqueued per task at creation time,
  fires at `due_date`. Auto-escalates to super_boss + URGENT + push + WhatsApp.

## Verified live (2026-05-12 / 2026-05-13)

- Backfill ran: 11 signals → 10 tasks (1 idempotency-skipped Varchasv duplicate)
- SLA escalation auto-fired ~15-30 min after creation: all 10 tasks reassigned
  from original agents to super_boss with `priority='URGENT'` ✅
- Real overnight signal arrived 2026-05-13 05:59 from `+919971024689` and
  produced a real CALLBACK_REQUEST task via the new handler — end-to-end pipeline
  works in production without backfill involvement ✅
