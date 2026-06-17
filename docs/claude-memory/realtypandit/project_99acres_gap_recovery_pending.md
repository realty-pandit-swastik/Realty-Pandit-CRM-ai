---
name: project_99acres_gap_recovery_pending
description: PENDING — 99acres lead capture broke after ~2026-05-28. Root cause is now TWO-PART: (1) all our-side poller bugs are FIXED+deployed (2026-06-01); (2) the REMAINING gap is UPSTREAM — 99acres' API delivery to the REALTY.PUNDIT2 credential collapsed ~05-28 (proven), needs 99acres support + a Response-Manager CSV export to recover.
metadata:
  type: project
---

**Update 2026-06-01 — owner reported leads ARE generating on the 99acres panel but not reaching
our admin after 28 May. Deep API probe split this into two distinct problems:**

**(1) OUR-SIDE poller bugs — ALL FIXED + DEPLOYED 2026-06-01** (`ninety_nine_acres_poller.ts`):
- **Forward-only watermark stranded leads.** After the 05-29 silent-loss bug, `last_success`
  caught up to "now", so the scheduled poll only ever queried the last few minutes and NEVER
  re-scanned the past. The API is RE-QUERYABLE by date (proven: it re-returns already-ingested
  leads — NOT deliver-once), so anything it surfaced with an earlier RcvdOn was lost forever.
  **Fix:** poll a **rolling 2-day lookback window every cycle** (`startDate = now - maxWindowMs`)
  instead of trusting the watermark. 2 days = the API max single-window = 1 request/cycle (within
  6 req/hr at the 12-min cron). Supersedes the watermark approach in [[feedback_poller_silent_loss]].
- **`queryId` always parsed as `null`.** `QueryId` is an ATTRIBUTE of `<QryDtl>` → must read
  `qryDtl['@_QueryId']`; old code read `qryDtl.QryId`/`resp['@_QueryId']` (never matched).
  **Fix:** read the attribute first. Verified against AMIT PURI's real XML → `6a1ab54165e2844a5cf88141`.
- **Re-scan idempotency.** Added a dedup guard in `ingestLead` keyed on `metadata.query_id` OR
  (phone + `received_on`) → skips already-ingested enquiries so the rolling re-scan never spams
  duplicate interactions. (Contact upsert + isNew side-effects were already idempotent.)
- Server TZ confirmed **Asia/Kolkata** → `formatDate` (local time) is correct; no TZ bug.

**(2) UPSTREAM — 99acres API delivery collapsed ~05-28 (PROVEN, not fixable by us):**
Re-querying the **known-good window 05-26→05-28** (where our DB holds ~20 saved 99acres leads)
now returns only **Resp=3**; 05-30→06-01 returns **1**. The API is returning a *fraction* of what
it used to for the *same dates* — so this is NOT just "no new leads" or rolling-buffer aging; the
**Response-API feed to the `REALTY.PUNDIT2` credential dropped across the board ~05-28.** Every
returned lead has an **empty `SubUserName`**. Likely causes: plan/package change, the credential
de-scoped, or leads routed to a sub-user this credential doesn't cover.

**What the owner/Sunny must raise with 99acres support:**
"Our Response-API user **REALTY.PUNDIT2** returns only a fraction of the leads visible in our panel
since ~28 May (≈1–3 total where the panel shows ~10/day). Please check: (a) is the Response/lead API
still fully enabled on our current plan? (b) are leads routed to a sub-user/login the API credential
doesn't cover? (c) was there a plan/API-access change around 28 May?"

**Why still pending:** the missed panel leads (05-28→now) are NOT returned by the API for this
credential, so the only way to recover them is the **99acres Response Manager CSV export**. Owner
will provide it. Do NOT keep probing the API (6 req/hr limit; protects the live poller).

**Update 2026-06-02 — recurring outage #2; email sent to 99acres.** Owner confirmed leads ARE
generating on the 99acres panel today + yesterday but not arriving. Re-probed: API returns valid
data for old windows (26–28 May) but EMPTY for 31 May→today → leads not delivered to our API
account `REALTY.PUNDIT2`. Our side fully healthy (the "scheduler stalled" scare was a UTC-vs-IST
timestamp misread — poll runs every 12 min). This mirrors the **April 2026 outage** (see
integrations.md), which **Sandeep Upadhyay fixed from 99acres' side** ("Please try now").

**EMAIL STATUS (corrected 2026-06-03):** the email to Sandeep was DRAFTED on 2026-06-02 but **NEVER
ACTUALLY SENT** — verified via Gmail: no June thread to sandeep.upadhyay@99acres.com, no matching
draft (only the April thread + a stale 2026-03-23 draft to Vishal.Singh). **ACTION STILL OPEN: the
email must be sent** to sandeep.upadhyay@99acres.com, cc Realtypandit99@gmail.com, from
info@realtypandit.in (the draft text is ready; replying on the April thread is good for continuity).
When the feed resumes, the healthy poller auto-captures (no code change needed, like April).
Contacts + April-fix history: integrations.md §99acres.

**How to apply when the export arrives:**
1. Convert the dashboard export (CSV/screenshots) → JSON array of `{ phone, name?, email?, received_on?, intent?, location? }`.
2. Run the ready script `agents/backend/scripts/recover_99acres_gap.ts` (per [[reference_prod_db_script_pattern]] — from `/var/www/realty-pandit/backend`, scp it up first):
   - DRY-RUN: `npx ts-node --transpile-only scripts/recover_99acres_gap.ts ./gap.json`
   - APPLY (after pg_dump, per [[reference_prod_db_backup]]): `APPLY=1 npx ts-node --transpile-only scripts/recover_99acres_gap.ts ./gap.json`
3. It diffs by normalized phone vs existing contacts and ingests only MISSING ones → contact (source=99acres, BUYER) + interaction + agent round-robin + NEW deal via `ensureDealForLead`. Idempotent (safe to re-run); requirement taxonomy left blank for the bot/agent to qualify.

See [[feedback_poller_silent_loss]] for the full root-cause + the fixes shipped.
