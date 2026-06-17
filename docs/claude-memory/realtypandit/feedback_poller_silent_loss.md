---
name: feedback_poller_silent_loss
description: Feed pollers (99acres, Housing) had a swallow-and-advance silent-loss bug — per-lead ingest errors caught+logged, watermark advanced anyway, poll marked success → leads fetched-then-dropped with NO alert. Cost ~3 days of 99acres leads. BOTH fixed 2026-05-31; Housing re-verified hardened in code 2026-06-03 (watermark from last_success + fail-loud + hold-on-failure + alertCritical≥3), still unconfigured.
metadata:
  type: feedback
---

**The bug pattern (silent lead loss):** poll-based lead ingesters looped over fetched
leads with `try { ingest } catch (err) { logger.error(...) }` (swallow), then advanced
the watermark / marked the sync `status:'success'` **regardless of per-lead failures**.
Result: a lead that failed to save was fetched, dropped, and skipped forever — and
because `status` stayed `success` with `consecutive_failures: 0`, monitoring NEVER
alerted. The pull API's watermark (`integration_syncs.last_success`) advanced past the
unprocessed window so the leads were unreachable on retry.

**What triggered it (2026-05):** when the legacy demand columns were dropped (2026-05-29),
the 99acres poller's `contact.upsert` threw `Unknown argument demand_bhk` on every lead →
swallowed → watermark walked forward → **~3 days of 99acres leads lost** (05-28 → 05-31).
The integration looked healthy the whole time (`status=success`, 0 failures). The real
tell was in the DB: newest 99acres contact frozen at 05-28 06:53.

**Why:** swallowed error + watermark advance past the failed window = permanent skip; and
`status=success` means no alert ever fires. Diagnosis was muddied because the column-drop
was a *later* compounding cause — the data showed loss began ~33h before that bug.

**How to apply:**
- Any poll-based ingester must **NOT advance its watermark past a window that had an ingest
  failure**. On any per-lead failure: throw → mark sync `failed`, `consecutive_failures++`,
  `last_error`, and retry that window next cycle. `alertCritical` already fires at >=3 fails.
  Loud, retrying failure beats silent loss for a revenue pipeline. (Applied to
  `ninety_nine_acres_poller.ts` lines ~298-317, deployed + verified 2026-05-31.)
- **`services/housing_poller.ts` — FIXED 2026-05-31** (was the same bug + worse: fixed
  `now-600s` window, no watermark, and it wrote non-existent `IntegrationSync` fields
  `started_at`/`completed_at`/`error` via `.update({update:…})` wrong shape). Rewritten to
  mirror 99acres: watermark from `last_success` (24h catch-up cap, 10-min first-run fallback),
  fail-loud + hold-on-failure, correct `data:{ last_success/last_error/consecutive_failures/… }`,
  `alertCritical` at ≥3, and a backoff guard added to the `housing-poll` dispatch in
  `scheduled_worker.ts`. (Still unconfigured — no Housing leads yet — but now safe to enable.)
- **Webhook sources are safer** (MagicBricks `/external/magicbricks`, Facebook
  `/webhooks/facebook`, 99acres `/webhook`, generic `external_leads`): a failed ingest
  returns HTTP 500 → surfaced/logged, sender can retry — not silently swallowed.
- **Recovery:** rewind `integration_syncs.last_success` to before the gap and re-poll with
  the fixed code (idempotent upserts). BUT the 99acres pull API returns only a **rolling
  buffer** — querying 05-26..05-28 later returned only 3 of ~20 originally saved → **old gap
  leads age out and are unrecoverable via the API**. The authoritative record is the 99acres
  **seller dashboard** (Response Manager); reconcile by phone against existing contacts.
- **99acres rate limit = 6 requests/hour.** The cron runs every 10 min = *exactly* 6/hr,
  zero headroom → any extra call (diagnostics, multi-chunk catch-up) trips
  `ERROR-0007: Limit On Maximum Number Of Requests Exceeded`. Consider easing the cron to
  ~12-15 min. Build the request XML with `version='1.0'` via `String.fromCharCode(39)` in
  SSH probes (shell-escaping mangles the quotes), and load creds via `dotenv` not hand-parsed
  `.env` (values are quoted — hand-parsing causes false `ERROR-0001` auth failures).

See [[reference_demand_canonical_sot]] (the column drop that triggered it) and
[[feedback_prisma_column_drop_sweep]] (the broader "grep the whole backend after a drop" rule).
