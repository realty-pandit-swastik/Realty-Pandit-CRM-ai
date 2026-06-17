---
name: reference-deal-reminder
description: Team members can set a self follow-up reminder on a deal — alerted before + at the time, written to deal + lead timelines. Shipped 2026-05-16 (T8).
metadata:
  type: reference
---

> ⚠️ CORRECTION 2026-05-18: T8 as shipped **never fired in production**. The
> 5-min sweep `sendReminderTaskAlerts()` lived only in `notification_crons.ts`
> → `startLegacySchedulers()` (the BullMQ-DOWN fallback) which never runs in
> prod — see [[feedback_legacy_cron_is_dead]]. Fixed 2026-05-18:
> `sendReminderTaskAlerts` exported + registered as BullMQ repeatable job
> `reminder-task-alerts` (every 5 min) in `scheduled_worker.ts`, AND a new
> `deal_reminder_due` notification event (push **+ WhatsApp**) now sends the
> member the customer **name + phone + note** at reminder time (verified
> live on prod). Text below is the original design; "live/push" claims are
> only true from 2026-05-18.

# Self-scheduled deal reminders (T8, 2026-05-16)

A lead manager on a deal can set "call the client back at <time>". They get a push alert once BEFORE and once AT the time; the reminder is recorded in both the deal timeline and the lead timeline.

## Backend
- `POST /api/deals/:id/reminder` (gate: `act_on_deals`). Body `{ remind_at (ISO), note?, advance_minutes? (default 30) }`. Creates a `Task` (table `tasks`): `task_type='REMINDER'`, `assigned_to=caller`, `due_date=remind_at`, `priority='HIGH'`, `deal_id`, `contact_phone`, `stage_metadata={advance_minutes, advance_fired:false, due_fired:false, set_by}`. Writes `team_actions` row `action_type='REMINDER_SET'` (deal timeline) + `interactions` row `event_type='reminder_set'` (lead timeline) in one `$transaction`.
- `notification_crons.ts` → new `sendReminderTaskAlerts()` on `cron.schedule('*/5 * * * *')`. Scans REMINDER tasks status TODO/IN_PROGRESS; fires `notify('task_due_reminder', …)` once when `due - advance <= now` (advance) and once when `due <= now` (due); idempotent via `stage_metadata.{advance_fired,due_fired}` flags it persists back.

## Frontend
- `client.ts` `setDealReminder(dealId, {remind_at, note?, advance_minutes?})`.
- `deal/ReminderModal.tsx` — datetime-local + quick presets + advance dropdown + note. Uses the **contained-scroll modal layout** (pinned header/footer, scrollable middle) — same pattern as the T1 ReassignModal fix; reuse it for any new modal so it never clips on short viewports.
- Wired into `DealWorkspace.tsx` as a "⏰ Reminder" quick-action button next to Reassign.

## Reuse notes
- `Task` model already supported this (assigned_to, due_date, task_type, deal_id, contact_phone, stage_metadata). No schema change needed.
- Existing daily 9 AM `sendTaskDueReminders()` is coarse (same-day only) — the new 5-min sweep is what gives precise at/before timing.

## Related
- [[reference_deal_permissions]] — `act_on_deals` lets employees use this on their deals
- [[reference_reassign_authority]] — sibling deal action; same modal layout pattern
