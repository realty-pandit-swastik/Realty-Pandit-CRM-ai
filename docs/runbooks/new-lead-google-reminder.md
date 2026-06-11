# Runbook — New-lead → Google Calendar + Task reminder (with deal deep link)

**Shipped:** 2026-05-27. **Status:** LIVE.

## What it does

When a lead becomes a Deal and is assigned to a team member, that member's **own**
Google Calendar and Google Tasks get a "call the new lead within 30 minutes" reminder.
The reminder carries a **deep link to that exact deal** so the member taps through
straight to it — no searching by name/phone.

- **Calendar event** at the 30-min deadline, with two pop-ups: one at assignment time
  (`advance_minutes` before due) and one at the deadline (`minutes: 0`).
- **Google Task** due same day (Tasks API is date-only — time is ignored by Google).
- Both the event description and the task notes end with:
  `👉 Open the deal: https://admin.realtypandit.in/?deal=<dealId>`

**Opt-in:** silent for members who haven't connected Google (no refresh token) or who
turned sync off (`google_sync_enabled = false`). As of ship date, 9/9 active members
are connected.

## How it works (code path)

1. `services/ensure_deal.ts` — on **deal creation** (not re-ingest), if `assignedAgentId`
   is set, it creates a `REMINDER` Task: `due_date = now + 30 min`, `priority HIGH`,
   `deal_id` set, `stage_metadata.kind = 'new_lead_call'`, `advance_minutes = 30`.
   Then fire-and-forget `import('./google_sync').pushReminderToGoogle(task.id)`.
2. `services/google_sync.ts` → `pushReminderToGoogle(taskId)`:
   - Skips silently unless the assigned agent has `google_refresh_token` + sync enabled.
   - Builds a shared `descLines` array (used for BOTH event description and task notes)
     whose last line is the per-deal deep link (`?deal=<deal_id>`; generic panel link if
     the task has no `deal_id`).
   - `summary` = `📞 New lead — call <name>` when `kind === 'new_lead_call'`, else
     `⏰ Follow up: <name>` (so the deep link now rides on **all** reminder syncs too).
   - Inserts (or patches) the Calendar event + Google Task, then stores
     `google_event_id` / `google_task_id` back into `stage_metadata` → **idempotent**
     (a re-run patches instead of duplicating; a 404 means the member deleted it in
     Google, so it recreates).
3. Frontend (admin PWA): `App.tsx` parses `?deal=<id>` from the URL, sets the Deal
   Pipeline view + `deepLinkDealId`, and strips the param via `replaceState`.
   `DealPipeline.tsx` accepts `initialDealId` and, on mount, `getDeal(initialDealId)` →
   opens that deal's detail. Wired in all 4 render spots (desktop + mobile).

## Source coverage

Fires for the **8 sources that flow through `ensureDealForLead`**: 99acres, housing,
magicbricks, facebook, partner_portal, website chat, WhatsApp, admin manual entry.

**NOT covered (deferred):** Voice, AI-chat, OTP signup — these create leads without
calling `ensureDealForLead`, so no reminder is generated. Wiring them is a separate task.

## How to test (without spamming a real member)

Target a connected agent's OWN account, create a throwaway lead, verify, then delete
**everything** (Google event + task + CRM task + deal + contact). Pattern used at ship:

- Use `createdByAgentId = assignedAgentId = <agent>` so the deal lands `QUALIFIED`
  (this **skips** `scheduleQualificationCall`, avoiding a real outbound AI call to the
  fake number) while still firing the reminder block.
- Let the real fire-and-forget push run; poll `Task.stage_metadata` for
  `google_event_id` / `google_task_id` to confirm it landed.
- Fetch the event/task via `getAuthedClient(agent.google_refresh_token)` to confirm
  the summary wording + `?deal=<id>` deep link.
- Cleanup: `events.delete` + `tasks.delete` (by stored ids), then delete the CRM task,
  the `transaction` (deal), and the test `contact`. Run the script from **inside**
  `backend/` (module + tsconfig resolution); remove the `.ts` afterwards so it isn't
  swept into the next `tsc` build.

## Gotchas

- `ADMIN_PANEL_URL` env (server `.env`) must have **no trailing slash** — the link is
  `${ADMIN_PANEL_URL}/?deal=<id>`. Current value: `https://admin.realtypandit.in` ✓.
- The admin frontend **is** the PWA (service worker + manifest) — `admin.realtypandit.in`
  is the team-member app, so the deep link is correct.
- The Google push is **fire-and-forget** — a slow/failed push never blocks deal creation;
  errors go to GlitchTip via `captureBackgroundError` (`source: google_sync#pushReminderToGoogle`).
- Dead refresh token → `handleDeadToken` clears the link + nudges the member to reconnect.
