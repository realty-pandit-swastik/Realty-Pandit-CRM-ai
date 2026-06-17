---
name: notification_crons.ts / node-cron is the DEAD legacy path — prod uses BullMQ scheduled_worker
description: Anything wired only into initNotificationCrons()/startLegacySchedulers() never runs in production. Recurring jobs must be registered in queues/workers/scheduled_worker.ts.
metadata:
  type: feedback
---

**Trap (cost real time 2026-05-18):** `services/notification_crons.ts`
(`initNotificationCrons`, the `cron.schedule('*/5 * * * *', …)` calls) is
**only invoked by `server.ts` → `startLegacySchedulers()`**, which is the
*fallback used only when BullMQ/Redis is unavailable*. Production ALWAYS has
BullMQ up (`[Server] All BullMQ workers started successfully`; "falling back
to legacy schedulers" never logged; `[NotifCron]` has never appeared in any
prod log). ⇒ **every cron defined only in notification_crons.ts / pipeline_crons.ts
has never executed in prod.** This is why T8 self-set deal reminders silently
never fired from 2026-05-16 until fixed 2026-05-18 (see
[[reference_deal_reminder]]).

**Why:** `notification_crons.ts` reads like the live scheduler but is the
dormant twin. The ACTIVE scheduler is the BullMQ worker
`queues/workers/scheduled_worker.ts` (`startScheduledWorker()`), started on
the primary PM2 instance.

**How to apply — to add/fix any recurring/scheduled job:**
1. Put the logic in a shared, **exported** function (e.g. export it from
   notification_crons.ts so both paths can call it).
2. Register it in `scheduled_worker.ts`:
   `await scheduledJobsQueue.upsertJobScheduler('<name>', { every: ms } |
   { pattern: '<cron>' }, { name: '<name>' });` (idempotent on restart).
3. Add a `case '<name>':` in that file's job-dispatch `switch (jobName)` that
   `await import(...)`s and calls the function.
4. Deploy → BullMQ worker restart re-registers the scheduler. Verify it
   actually ran (`[ScheduledWorker] Running job: <name>` in logs + the side
   effect in DB) — do NOT trust that a node-cron in notification_crons.ts will
   fire.
5. Verifying a scheduled feature works = check the BullMQ repeatable job
   exists + the DB effect, never just "the cron code looks right".

Active scheduled jobs list lives in `scheduled_worker.ts` (≈28: 99acres-poll,
followup-check, lead-escalation, session-keepalive, …, and now
`reminder-task-alerts` every 5 min). Related: [[reference_bullmq_cleanup]],
[[reference_prod_infrastructure]].
