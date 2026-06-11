# 2026-05-17 — Deal not carrying lead requirements / reassign not syncing / welcome WhatsApp

**Status:** ✅ SHIPPED & VERIFIED 2026-05-17. P1+P2+P3 code deployed
(`realty-backend`), historical data backfilled.

**Decisions (Puneet):** P1 = full snapshot+resync+backfill; P3 = lead owner
ALWAYS == deal coordinator; P2 = fix drift + investigate delivery; backfill =
audit-first.

**What shipped:**
- P1: new `utils/classification.ts resolveDemandSlugs()`; `POST /api/leads`
  now sets `demand_main_category/demand_category/demand_type_slug` from the
  classification UUIDs; `ensureDealForLead` resolves slugs as a safety net +
  snapshots `demand_area_min/max`.
- P3: `PATCH /api/leads/:phone/reassign` now also `transaction.updateMany`
  `coordinator_agent_id`+`executive_agent_id` for active deals.
- P2: 5 call sites passing literal versioned template names switched to
  logical registry keys (`scheduled_worker`, `team`, `interaction_engine`,
  `lead_qualification_caller`, `pending_message_queue`).

**Verification (prod):**
- Code: vitest 162/172 (== baseline, 0 new fails); tsc only pre-existing
  baseline noise; backend deployed.
- P1 E2E: manual lead w/ classification IDs → deal carried
  `demand_category=residential, type=bungalow, budget, 3BHK, location`. PASS.
- P3 E2E: reassign → deal `coordinator==executive==new owner` (synced=true).
  PASS.
- P2: logical keys resolve (`rp_reopen_session→v4`, `rp_team_welcome→v4`,
  `rp_buyer_lead_received→v3`). Meta: all 4 welcome templates **APPROVED**
  but **MARKETING category** (quality UNKNOWN) — see below.
- Backfill: `pg_dump` → `/root/backups/dealsync-20260517-194007.sql`;
  idempotent, NULL-only fill; 365 scanned → 11 coordinator-synced,
  44 requirement-backfilled. Post-audit: diverged=0, missing_category=0,
  missing_budget_min=0. Swati `e321a051` now full + coordinator=Bharat Bhushan.

**P2 delivery — ✅ RESOLVED 2026-05-17 (done via Graph API, not just flagged):**
Created `rp_buyer_lead_received_v4` + `rp_welcome_buyer_v5` as UTILITY
(identical bodies), Meta-APPROVED, registry repointed, deployed, verified
(logs send v4/v5; Graph = APPROVED/UTILITY). Welcomes now deliver. Original
analysis kept below.

**P2 delivery root cause (was: ACTION REQUIRED — non-code, Meta dashboard):**
`rp_buyer_lead_received_v3` / `rp_welcome_buyer_v4` are **MARKETING**
templates. WhatsApp silently does NOT deliver MARKETING templates to
recipients who have marketing messages disabled (common default in IN), even
though the API returns success ("sent" in logs ≠ delivered). These are
transactional lead acknowledgements → **re-create them as UTILITY category**
in Meta (per `docs/runbooks/meta-template-approval.md`) to restore delivery.
Code is correct; this is the remaining lever and only Puneet/Meta-admin can do
it.

## Follow-up: Bidirectional Lead⇄Deal sync (shipped 2026-05-17)

User asked that Deal-side changes also reflect on the Lead. Findings:
- **Deal reassign → Lead:** already updated `contact.assigned_agent_id`
  (`deals.ts` reassign) — but missed `executive_agent_id` and a lead-timeline
  audit row. **Fixed:** reassign now sets coordinator+executive and writes a
  `lead_reassigned` interaction (`metadata.via='deal'`).
- **Deal requirements edit → Lead:** GAP — `PATCH /deals/:id/requirements`
  only updated the Transaction. **Fixed:** now also maps `demand_*` →
  contact (`intent/demand_category/demand_type_slug/property_type/
  preferred_location/budget_min·max/area_min·max/demand_amenities/demand_bhk`)
  in the same `$transaction`. Mirror of the Lead→Deal `dealSync`. Scope:
  `demand_*` strings only (slug→category_id reverse-resolve intentionally out
  of scope per D).

**Verify (prod E2E):** edited requirements on a deal → contact reflected
budget/location/bhk/category; reassigned the deal → contact owner +
coordinator + executive all = new agent + lead-timeline audit row. vitest
162/172 (== baseline). Deployed `realty-backend`. Lead⇄Deal now fully
bidirectional (single source of truth).

**Status (original):** INVESTIGATION REPORT — read-only (ASK MODE). Verified
in code + Swati's live prod rows 2026-05-17.

Test subject: **Swati Sharma `+918130938817`**, deal `e321a051-6234-49e3-91b0-e1d0f9fd2992`.

---

## Problem 1 — Deal pipeline doesn't carry the lead's requirements ✅ CONFIRMED

**Prod evidence:**
- `contacts(+918130938817)`: `category_id`/`sub_category_id` SET (UUIDs), but
  `demand_category` = **NULL**, `demand_type_slug` = **NULL**,
  `budget_min` = **NULL**, `budget_max`=50000, `demand_bhk`=2,
  `timeline`=immediate, `preferred_location`=vaishali.
- `transactions(e321a051)`: `demand_category`/`demand_type_slug`/
  `demand_budget_min`/`demand_area_min`/`demand_area_max` = **NULL**;
  only `demand_bedrooms`=2BHK, `demand_location`=vaishali,
  `demand_budget_max`=50000 carried.

**Root cause (two layers):**
1. `POST /api/leads` (manual add, `routes/leads.ts:558-600`) writes the
   classification as **`category_id`/`sub_category_id`/`type_id`** on the
   contact but **never sets the string fields `demand_category` /
   `demand_sub_category` / `demand_type_slug` / `area_min/max` /
   `demand_amenities`**. (It also writes a parallel `Lead` row with
   `category_id` only.)
2. `ensureDealForLead` (`services/ensure_deal.ts:122-140`) snapshots
   `contact.demand_category` (NULL) etc. into the Transaction and **never
   snapshots `demand_sub_category`, `demand_area_min/max`, `area_unit`,
   `timeline` at all**.
3. The deal UI reads the Transaction snapshot with a contact fallback
   (`frontend/src/components/deal/RequirementsTab.tsx:50`
   `deal.demand_category || dc?.demand_category`) — **both NULL** ⇒ card shows
   "CATEGORY —", no area, no budget-min. The classification IDs the lead DID
   store are never resolved to the slug/label the deal shows.
4. The contact→deal sync that exists (`PATCH /api/leads/:phone/requirements`
   `dealSync`, `routes/leads.ts:1019-1045`) is the only thing that backfills a
   live deal — but it only fires when requirements are explicitly edited via
   that endpoint, and it also omits `demand_sub_category`. The create flow
   never triggers it.

⇒ Affects **every manually-added lead** (and any path that sets
`category_id` instead of the `demand_*` strings). The data is captured on the
lead but structurally never reaches the deal.

## Problem 2 — "AI not sending welcome WhatsApp" ⚠ PARTLY CONTRADICTED BY EVIDENCE

**Prod logs for Swati (16:10:56–58, 2026-05-17):**
- `Sending template "rp_buyer_lead_received" (meta: rp_buyer_lead_received_v3)`
  → `[LeadNotify] Buyer confirmation template sent to +918130938817` ✅
- `Sending template "rp_welcome_buyer" (meta: rp_welcome_buyer_v4)` →
  `[LeadAutoEngage] Template C sent to +918130938817 (internal lead)` ✅
- Same success today for `+919205256129`, `+919717534819`, `+919899636832`,
  `+919898982861`.

So the welcome IS being sent and **accepted by the WhatsApp API** for new
leads via the working `rp_buyer_lead_received_v3` + `rp_welcome_buyer_v4`
templates. "Sent" = Meta accepted it; it is NOT proof of delivery/read.

**Real adjacent bug found — WhatsApp template-registry drift.** Several
code-referenced templates are missing from `config/whatsapp_templates.ts`,
so those specific flows hard-fail (GlitchTip clean only because they're
caught warns):
- `rp_buyer_lead_received_v2` — `lead_qualification_caller.ts:144` fallback
  (`[QualCall] Fallback template send failed … not found in registry`,
  recurring every ~10 min).
- `rp_reopen_session_v3` — `[SessionKeepAlive] Failed … not found in registry`.
- `rp_team_welcome_v4` — `[Team] WhatsApp welcome failed … not found`.

**Conclusion:** The buyer welcome on lead intake works in code and is
API-accepted. If buyers genuinely aren't receiving it, the cause is most
likely Meta-side (template quality/pause, recipient opt-in, the bot number's
messaging tier/delivery) — needs a Meta-dashboard check
(`docs/runbooks/meta-template-approval.md`), NOT a code "it isn't sent" fix.
The registry-drift failures are a separate genuine defect worth fixing.
→ Needs user confirmation: are buyers seeing NOTHING, or is this an
assumption? (D-P2 below.)

## Problem 3 — Reassigning the lead doesn't move the deal ✅ CONFIRMED

**Prod evidence:** `contacts.assigned_agent_id` = `3fe6561c…` (**Bharat
Bhushan**, the reassign target ✓) but `transactions.coordinator_agent_id` =
`executive_agent_id` = `503ebb67…` (**Savikant / Sunny**, the original from
deal creation ✗). Deal card "COORDINATOR Savikant Sharma" = stale.

**Root cause:** there are two endpoints:
- `PATCH /api/leads/:phone/**assign**` (`routes/leads.ts:917-927`) — DOES
  `transaction.updateMany` → `coordinator_agent_id`/`executive_agent_id` for
  active deals. ✅
- `PATCH /api/leads/:phone/**reassign**` (`routes/leads.ts:304-388`, the
  admin **Reassign** button per `reference_reassign_authority`) — updates
  `contact.assigned_agent_id` + writes an audit interaction + notifies; its
  `$transaction([...])` and tail contain **no `transaction.update`**. ⇒ the
  linked deal's coordinator is never synced.

⇒ Every lead reassigned via the Reassign button keeps its deal with the old
coordinator. (`ensureDealForLead` also can't help — it's idempotent and
returns the existing deal untouched.)

---

## Proposed fixes (NOT executed — for approval)

- **P1:** (a) In `ensureDealForLead`, snapshot the full demand set incl.
  `demand_sub_category`, `demand_area_min/max`, `area_unit`, `timeline`, and
  **resolve `category_id`→`demand_category`/`demand_type_slug`** (or have
  `POST /api/leads` populate the `demand_*` strings on the contact like
  `/public/lead-requirements` does). (b) Add `demand_sub_category` to the
  `/requirements` `dealSync`. (c) One-time backfill of existing active deals
  from their contact/lead (same shape as the 2026-05-07 sync backfill).
- **P3:** Make `PATCH /:phone/reassign` also `transaction.updateMany`
  `coordinator_agent_id`+`executive_agent_id` for active deals (mirror the
  `/assign` block) — single source of truth: lead owner == deal coordinator.
  Backfill: re-sync coordinator from contact.assigned_agent_id for active
  deals where they diverge (Swati + others).
- **P2:** Fix template-registry drift (register/repoint
  `rp_buyer_lead_received_v2`, `rp_reopen_session_v3`, `rp_team_welcome_v4`
  or update callers to the live names). Separately, verify Meta template
  status/delivery for `rp_buyer_lead_received_v3` / `rp_welcome_buyer_v4`
  per the meta-template-approval runbook. Confirm the actual user-visible
  symptom first.

## Decisions needed
- **D-P1:** Fix at `ensureDealForLead` snapshot + a contact→deal resync on
  requirement change (recommended, robust), or only patch the manual-add path?
  Also confirm: resolve `category_id`→slug via the classification tree, vs
  populate `demand_*` strings on write?
- **D-P3:** Confirm "lead owner always == deal coordinator" is the desired
  invariant (then reassign syncs the deal). Any case where they should differ?
- **D-P2:** Are buyers receiving NO welcome at all (then it's Meta-side —
  needs dashboard access), or is the concern the registry-drift failures?
- **Backfill scope:** how many existing deals diverge (coordinator≠lead owner;
  demand_* null while contact/lead has them) — quantify before fixing data?
