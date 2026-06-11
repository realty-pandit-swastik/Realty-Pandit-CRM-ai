# 2026-05-17 — Duplicate lead reassigned to a different team member

**Status:** ✅ SHIPPED & VERIFIED 2026-05-17. Parts A+B deployed
(`realty-backend`), Part C data-heal executed.

**Verification (prod, 2026-05-17):**
- Part A (email_lead_parser, external_leads): server-side E2E — a legacy
  `+91-…` dash contact + an email lead for the same bare number → resolved to
  the existing PK, **1 row, no duplicate**, assignment preserved. PASS.
  (`EXTERNAL_API_KEYS` empty → /external/leads not live, fix still applied.)
- Part B (ensureDealForLead): super_boss-assigned portal contact +
  `ensureDealForLead({source:'99acres'})` → assignee **unchanged** (old code
  would have round-robined to an employee). PASS.
- tsc touched-files clean (only pre-existing baseline noise); full vitest
  162/172 — identical to pre-change baseline, 0 new failures.
- Part C: backup `pg_dump` → `/root/backups/heal-dup-20260517-165847.sql`.
  First heal attempt failed atomically on an un-enumerated `leads` FK (no
  partial writes — rolled back). Re-ran enumerating **all 23 FK columns**
  referencing `contacts(phone_number)` (repoint 20, prune 3 unique-risk:
  lead_scores/conversation_sessions/partner_agents). **15 pairs healed**
  (14 dash + 1 website-bare `8076631790`); junk `4207644738` excluded (D3).
  Post-audit: `split_across_agents=1` = only the excluded junk pair; survivors
  keep their working member with merged interaction history; 0 loser rows.

**Status (original):** PLAN — investigation complete, NOT executed (ASK MODE).

**Reported:** "Same lead comes twice from different platforms. A lead already
assigned to a team member — when the CRM receives it again from another source
it goes to a *different* team member instead of staying with the original.
Find the bug, fix it, and find all leads already passed to another member."

---

## 1. Root cause — TWO mechanisms

### RC1 (dominant, evidenced): duplicate CONTACT ROWS → independent assignment
`Contact.phone_number` is the PK. Most ingestion paths normalize to
`+91XXXXXXXXXX`, but the **2026-04-13 99acres bulk import** wrote
`+91-XXXXXXXXXX` (dash) rows (the same debris as
`2026-05-17-website-phone-normalization-fix.md`). When the *same buyer*
re-enquires later via 99acres webhook / magicbricks (which normalize, no dash),
a **second contact row** is created (different PK: dash vs no-dash). Each row is
independently round-robined → **two team members for one person**.

Two ingestion paths still DON'T normalize and can keep minting new duplicates:
- `services/email_lead_parser.ts` — regex captures bare 10-digit
  `([6-9]\d{9})`, upserts on that raw value (line 31/40/55).
- `routes/external_leads.ts` — upserts on raw `req.body.phone` (no
  `normalizePhone`); guard uses `!contact.assigned_agent_id`.
All other paths normalize: magicbricks, housing, 99acres, facebook,
webhook_processor; `/public/*` fixed earlier today.

### RC2 (latent code defect): non-idempotent reassignment on re-ingest
- `services/lead_assignment.ts` `assignViaRoundRobin()` /
  `assignViaManagerRoundRobin()` advance a pointer (`last_assigned_at`) on
  **every call** → calling twice for the same person yields *different* agents.
- `services/ensure_deal.ts ensureDealForLead()` (called by 99acres, facebook,
  housing, magicbricks, `/public/lead`, `/public/lead-requirements`):
  - If contact already assigned to a **non-employee** (manager/super_boss) AND
    portal source → **overrides** via `assignViaRoundRobin()` and
    `contact.update({ assigned_agent_id })`. Fires on *every* re-ingest while
    the lead is manager-held → flips the assignee.
  - `else` branch (no `assigned_agent_id`) → round-robin + update.
- Guarded/clean paths (only assign if not already assigned): 99acres poller
  (`if (isNew)`), housing poller (`if (!finalAgentId)`), external_leads
  (`isNew = !contact.assigned_agent_id`). db.ts `$extends` only fires on
  `contact.create` (new rows) → reinforces RC1 for duplicate rows, not RC2.

RC1 is what the prod data shows; RC2 is a real defect that compounds it and
will keep flipping single rows on re-ingest if not fixed.

---

## 2. Prod audit (read-only, 2026-05-17)

By trailing-10-digit across `contacts`:
- **18** people exist as multiple contact rows.
- **15** of those are **split across different team members** (the bug).
- 3 duplicated but same agent.

Pattern is uniform across the 15: a **2026-04-13 `+91-…` dash row with ~0
interactions** (never worked — bulk-import artifact) vs a **later `+91…`
normalized row holding ALL the real activity (2–7 interactions)** assigned to a
*different* member who actually engaged. 1 of the 15 is a junk pair
(`TEMP_…` + `+1…` manual). Dash-side FK children: **6 interaction rows**, 0
appointments / scheduled_visits / lead_scores / transactions (tasks: column is
`contact_phone`, to be confirmed). Full 15-pair list in the appendix below /
re-runnable query in §5.

Not an active widespread leak going forward (dash rows are one-time import);
the live exposure is the 2 non-normalizing paths + RC2.

---

## 3. Proposed fix (NOT executed — for approval)

### Part A — Code: stop new duplicates (low risk, chokepoint pattern)
1. `services/email_lead_parser.ts`: normalize + resolve to existing PK
   (`resolveStoredContactPhone` then `normalizePhone` fallback) before the
   contact upsert — same pattern shipped for `/public/*`.
2. `routes/external_leads.ts`: same resolve-then-upsert; keep its existing
   `!assigned_agent_id` guard.

### Part B — Code: stop reassignment of already-handled leads (RC2)
3. `ensure_deal.ts ensureDealForLead`: **never reassign a contact that already
   has `assigned_agent_id`.** Specifically:
   - Drop / hard-guard the "non-employee + portal → round-robin override" so it
     does NOT run on re-ingest. (Decision D1 — see below: remove entirely, or
     fire exactly once via an idempotent flag.)
   - Only the genuine `!assigned_agent_id` path may round-robin.
4. (Optional, defensive) make round-robin no-op if the contact already has an
   assignment — belt-and-suspenders.

### Part C — Data: heal the 15 split people (destructive — needs sign-off)
For each split pair: **survivor = the normalized `+91…` row** (holds the real
activity + the agent who actually worked it). Steps per pair, in one tx:
- Repoint dash-row children to the survivor PK: `interactions` (~6 total),
  `tasks` (verify), any of scheduled_visits/appointments/lead_scores/
  transactions/saved_properties/owners that exist (audit shows 0 except
  interactions).
- Delete the dead dash contact row.
- Leave the survivor's `assigned_agent_id` unchanged (the member actually
  working it) — matches "stay with the team member handling it".
- Junk pair (`TEMP_…`/`+1…`, 0 real activity): delete both or leave — D2.
Idempotent, dry-run + row-count diff first, off-peak, DB backup (deploy script
auto-backs up src only — take an explicit `pg_dump` of the affected rows).

### Verify
Unit/type as before; deploy backend; re-run §2 audit → `dup_people_split=0`
for the healed set; submit an email-parsed + external-leads lead with a legacy
bare contact → no new duplicate; GlitchTip clean; spot-check 3 healed leads
open with full merged history under one member.

---

## 4b. DECISIONS — RESOLVED 2026-05-17 (Puneet)
- **D1 → remove the override entirely.** `ensureDealForLead` must NEVER change
  `assigned_agent_id` on a contact that already has one. Only the genuine
  `!assigned_agent_id` path may round-robin.
- **D2 → survivor = actively-worked normalized row + keep its member.** Repoint
  dead dash-row children (interactions etc.) onto it, delete the dash contact.
- **D3 → junk pair `4207644738` excluded** (heal 14 real pairs only).
- **D4 → sequence: Part A+B code → verify+deploy → then Part C data heal.**

## 4. Decisions needed (NOT assumed)

- **D1 — `ensureDealForLead` override:** (a) **remove** the non-employee→
  round-robin override entirely (portal leads keep whatever they were first
  assigned; managers reassign manually), or (b) keep it but fire **once**
  (guard with a flag/audit so re-ingest never re-runs it). Recommend (a):
  simplest, matches "don't move an assigned lead."
- **D2 — survivor & assignee on merge:** confirm **survivor = normalized row,
  keep its current agent** (the one with the activity). Alternative: force the
  *earliest* row's agent (the 2026-04-13 import assignee) — but those were
  never worked (0 interactions); not recommended.
- **D3 — junk pair** (`4207644738`: `TEMP_…` Beenu + `+17744207644738`
  Ravindra, 2 intxns): merge onto the `+1` row, or leave as-is (out of scope)?
- **D4 — scope/sequence:** Part A+B (code, one backend deploy) first and
  verify, then Part C (data heal) as a separate gated step? Recommend yes.

## 5. Re-runnable audit query
(trailing-10-digit group, rows>1 AND distinct assigned_agent_id>1) — see
investigation transcript / §2; full 15-pair list with agents + activity was
captured 2026-05-17.
