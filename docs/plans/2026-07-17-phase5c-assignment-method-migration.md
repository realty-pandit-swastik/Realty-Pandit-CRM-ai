# Phase 5C — `contacts.assignment_method` persistence (data-migration SOP)

**Author:** Claude (acting as data-migration engineer) · **Date:** 2026-07-17
**Status:** ✅ SHIPPED 2026-07-17 (`v20260717c`). Owner approved the site table; adversarial-review workflow
returned **GO** (0 missed sites, 0 mislabels, no routing change from the instrumentation); live write-probe +
by_method panel verified. Column applied column-first behind a `pg_dump`.

> **Goal:** persist *how* each lead was routed to its agent, so Team Performance's distribution
> can show the real routing-method split (sub-user match vs round-robin vs uploader vs manual…)
> instead of channel inference. Discovery was done by an exhaustive 6-sweep read-only workflow;
> every delicate/low-confidence/gap site was then re-read by hand (evidence in this doc).

## 1. Objective & non-goals

- **Objective:** add nullable `contacts.assignment_method TEXT`; write it at every LIVE contact-assignment
  site with the method that actually chose the agent; surface a `by_method` panel on the distribution API.
- **Non-goals (v1, deliberate):** no historical backfill (past method is unknowable → legacy rows stay
  `NULL` = "Unknown (legacy)", panel fills forward); no column on the `Lead` table (the distribution
  panel reads `contacts`); no new writes on the "keep-same-manager" no-write branches (that would change
  routing behaviour). **Invariant: this migration changes WHICH agent is assigned at ZERO sites — it only
  records the method already being used.**

## 2. Method vocabulary (stored values)

| value | meaning |
|---|---|
| `sub_user` | matched to the listing owner via portal email/phone (99acres SubUserName, MagicBricks sub_user, Housing broker_email) — the precise, desired routing |
| `uploader` | matched to the property uploader (`inventory.uploaded_by_agent_id`) / inventory manager |
| `round_robin` | rotation (employee `assignViaRoundRobin` or manager `assignViaManagerRoundRobin`) as the default path |
| `manager_review` | a portal lead whose listing-owner match FAILED → parked on a manager to fix the mapping |
| `manual` | admin/employee explicit assign/reassign/create/transfer |
| `partner` | partner-referral routing to the partner's managing agent |
| `other` | fixed super_boss default (organic WhatsApp/voice, FB leadgen) + SLA/workflow escalation |
| `NULL` | unassigned, or a row assigned before this migration (legacy) |

## 3. Authoritative site table (verified in code)

**INSTRUMENT (21 live contact-write sites):**

| # | file:line | trigger | method | how |
|---|---|---|---|---|
| 1 | `db.ts:57` | organic WhatsApp/voice create (`$extends`) | `other` | inline stamp beside `data.assigned_agent_id = sunnyId` |
| 2 | `services/ensure_deal.ts:120` | shared portal/non-portal RR fallback | `round_robin` | helper (both RR branches are round_robin) |
| 3 | `integrations/magicbricks.ts:288` | MagicBricks /push | `sub_user`→`uploader`→`manager_review`/`round_robin` | inline cascade tracking |
| 4 | `integrations/magicbricks.ts:413` | MagicBricks legacy /webhook | `uploader`→`round_robin` | inline cascade tracking |
| 5 | `integrations/facebook.ts:221` | FB leadgen create | `other` | inline (super_boss default) |
| 6 | `integrations/facebook.ts:263` | FB RR fallback | `round_robin` | helper |
| 7 | `integrations/housing.ts:100` | Housing webhook | `round_robin` | helper |
| 8 | `integrations/99acres.ts:128` | 99acres webhook | `round_robin` | helper |
| 9 | `routes/external_leads.ts:129` | generic external API | `round_robin` | helper |
| 10 | `routes/deals.ts:531` | deal reassign → contact sync | `manual` | helper (tx) |
| 11 | `routes/leads.ts:430` | single lead reassign | `manual` | helper (tx) |
| 12 | `routes/leads.ts:540` | bulk reassign | `manual` | helper (tx) |
| 13 | `routes/leads.ts:1165` | manual/partner create (upsert CREATE) | `partner` if partner-creator else `manual`, `NULL` if no agent | inline stamp on CREATE data |
| 14 | `routes/leads.ts:1633` | assign / unassign | `manual`; `NULL` when unassigning | helper (null-safe) |
| 15 | `queues/workers/scheduled_worker.ts:624` | SLA lead-escalation | `other` | helper |
| 16 | `queues/workers/scheduled_worker.ts:689` | workflow snooze-escalation | `other` | helper |
| 17 | `services/ninety_nine_acres_poller.ts:626` | 99acres pull poller | `sub_user`→`manager_review` | inline cascade tracking |
| 18 | `services/housing_poller.ts:305` | housing pull poller | `sub_user`→`manager_review` | inline cascade tracking |
| 19 | `services/ownership_service.ts:263` | admin transfer wizard (contacts leg) | `manual` | helper (tx, updateMany-style) |
| 20 | `routes/public.ts:811` | website Schedule-Visit (new) | `uploader` / `other` | `resolveWebsiteLeadHandler` returns the method |
| 21 | `routes/public.ts:1936` | website Contact-Agent OTP (new) | `uploader` / `other` | same resolver method |

**SKIP (documented, with reason — a migration engineer does not instrument dead/irrelevant code):**

| site | reason |
|---|---|
| `services/dealer.ts:8` | dead code — repo-wide grep finds no callers |
| `services/lead_auto_engage.ts:99/108` | dead code — `createExternalLeadRecord` has zero callers |
| `services/ownership_service.ts:161/171` | dormant — tests-only; the live cascade path is `transferAssets` (#19) |
| `routes/internal_tools.ts:701` | writes `prisma.lead` only, does NOT sync the Contact → `contacts.assignment_method` N/A |
| `routes/leads.ts:1219` | `Lead`-table mirror; the paired contact upsert (#13) already carries the method |
| `services/ownership_service.ts:252` | `Lead` leg of the transfer; the contact leg (#19) is instrumented |

**GAPS (deliberate v1 decisions, documented):**
1. `keep_same_manager` is never persisted — it is universally the *absence* of a write (re-ingest guards). A
   contact keeps the method of its first real assignment. Stamping the no-write branches would change behaviour
   → deferred.
2. website-chat (`chat_handler.ts:373`, source `website_chat`) & any non-`AUTO_ASSIGN_SOURCES` organic create
   are created **unassigned** → `assignment_method` stays `NULL` (correct: no agent, no method).
3. `reassignPartner` (`routes/api.ts:1017`) updates `owning_manager_id`/`referral_partner_id` only, NOT
   `assigned_agent_id` → not a routing-method event; out of scope.

## 4. Design

- **`assignContact(phone, agentId, method, tx?)`** in `services/assign_contact.ts` — the single choke point for
  *simple* contact-agent writes: one `contact.update` setting BOTH `assigned_agent_id` and `assignment_method`.
  Accepts an optional `tx` for the `$transaction` sites (deals/leads reassign). Null agentId → also nulls method.
- **Mechanical sites** (single static method): replace the inline `contact.update({assigned_agent_id})` with
  `assignContact(...)`.
- **Delicate cascade sites** (magicbricks ×2, both pollers): keep the EXACT existing branch order; add a local
  `let method` set on the same branch that resolves `agentId`; write via `assignContact`. Routing outcome unchanged.
- **`db.ts:57`** ($extends — cannot call the helper): stamp `data.assignment_method = 'other'` where it injects `sunnyId`.
- **`leads.ts:1165`** (multi-field upsert — cannot use the helper): add `assignment_method` to the CREATE data object only
  (`partner`/`manual`, `null` if no agent); the UPDATE/attach branch omits it (keep-same).
- **`resolveWebsiteLeadHandler`**: return `handlerMethod` (`uploader` when a property/agent field matched, `other`
  when it fell through to super_boss) so `public.ts` can stamp it.

## 5. Migration (additive, idempotent, reversible)

```sql
-- prisma/migrations/20260717000000_add_contact_assignment_method/migration.sql
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "assignment_method" TEXT;
```
Schema: `assignment_method String?` on `Contact`. No index (low-cardinality; `by_method` scans the already-scoped
active set). No backfill. Fully reversible via `DROP COLUMN` / the pre-migration `pg_dump`.

## 6. Distribution API change (additive)

`GET /distribution` keeps `by_route` (channel) unchanged; adds `by_method`: select `assignment_method` over the
same active-contact set, bucket by the label map, `NULL` → `"Unknown (legacy)"`. Frontend adds a "By Routing
Method" panel beside the existing "By Channel".

## 7. Deployment order — column MUST exist before the code (reads/writes are NOT catch-guarded)

Unlike 5B (guarded reads), a Prisma `select`/`update` on a missing column throws hard, and `assignContact` runs
in the live assignment path. So the column is created FIRST:

1. **`pg_dump`** backup (gzip, retained).
2. **`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS assignment_method TEXT;`** via psql — column exists; old code
   ignores it (safe, additive). Verify with `\d contacts`.
3. **Deploy backend** — `prisma generate` picks up the column; new read/write code now has the column present.
4. **`npx prisma migrate deploy`** — applies the tracked migration (idempotent `IF NOT EXISTS` → no-op) to keep
   `_prisma_migrations` in sync.
5. **Verify** (below), then deploy frontend panel.

## 8. Verification

- **Pre:** `\d contacts` before/after ALTER; `SELECT count(*) FROM contacts WHERE assignment_method IS NOT NULL` = 0.
- **Post backend:** trigger/observe a fresh assignment on each major path where feasible; confirm the row now carries
  a method (`SELECT assignment_method, count(*) FROM contacts WHERE assignment_method IS NOT NULL GROUP BY 1`). Probe
  `/distribution` → `by_method` present, legacy bucket = the historical count.
- **Adversarial review:** a second workflow re-audits the diff for (a) any MISSED live write-site, (b) any
  mis-labelled method, (c) any behavioural change to routing — before trusting the implementation.
- **Frontend:** Playwright — Team Performance shows the new panel; console clean.

## 9. Rollback

Additive + nullable → forward-safe. To revert: redeploy the prior backend build (deploy script keeps a pre-deploy
tar) and, if desired, `ALTER TABLE contacts DROP COLUMN IF EXISTS assignment_method;` (or restore the `pg_dump`).
No data loss risk — the column starts empty and no existing column is touched.
