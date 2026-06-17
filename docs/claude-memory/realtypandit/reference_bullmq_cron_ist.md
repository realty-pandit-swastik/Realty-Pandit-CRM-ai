---
name: reference_bullmq_cron_ist
description: prod backend runs in Asia/Calcutta — BullMQ scheduled-job cron patterns are IST hours, NOT UTC (existing scheduled_worker comments mislabel them)
metadata:
  type: reference
---

**The prod backend server runs in `Asia/Calcutta` (IST), `TZ` env unset.** BullMQ's `scheduledJobsQueue.upsertJobScheduler({ pattern })` uses cron-parser with the process's **local** timezone → **cron patterns fire at the IST hour, NOT UTC.**

The `"= X UTC"` comments in `queues/workers/scheduled_worker.ts` are **MISLABELED** — e.g. `owner-digest-am` `'30 2 * * *'` (commented "8 AM IST = 2:30 UTC") actually fires at **2:30 AM IST**. Verified 2026-06-12 via `getJobSchedulers().next` vs `new Date()` (server clock 13:13 UTC, `Intl…timeZone` = Asia/Calcutta; `'0 22 * * *'` → next 16:30 UTC = 22:00 IST).

**Rule:** write the **IST hour directly** in the pattern (9 AM IST = `'0 9 * * *'`, NOT `'30 3'`). After registering, **verify the real fire time**: `require('./dist/queues/index').scheduledJobsQueue.getJobSchedulers(0,200)` → check `.next`. The `lead-recycler` job nearly fired at 3:30 AM IST (sending customers cards at night) because of this — caught only by checking `next`. See [[feedback_legacy_cron_is_dead]] (jobs live in `scheduled_worker.ts`, not node-cron).
