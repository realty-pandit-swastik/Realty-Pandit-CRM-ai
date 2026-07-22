# Admin Panel UI Bugs — Investigation Log (2026-07-15)

Owner is reporting admin-panel bugs one at a time; each is investigated + root-caused here.
Once the list is complete we build ONE combined plan. **No code changed yet — investigation only.**

---

## Task 1 — "Building Name" not saved on Add/Edit Inventory (Google Places)

**Symptom (owner):** team member types a building name, the Google address suggestion
pops up, they click it — the system saves only the **address**, not the **building name**.

**Root cause (CONFIRMED — frontend):** the shared address component stores the full
formatted address into the building-name field and discards the name Google already gave us.

- [`frontend/src/components/AddressFields.tsx`](../../agents/frontend/src/components/AddressFields.tsx) `onSociety()` (~line 246):
  ```ts
  apartment_name: p.full_address || p.name || value.apartment_name,
  ```
  It prefers `full_address` (Google `formatted_address` = street address, which for a
  building/POI almost never contains the building name). `p.name` (the actual establishment
  name, e.g. "Amrapali Sapphire") is only a fallback that never fires because `full_address`
  is always present.
- [`frontend/src/components/GooglePlacesInput.tsx`](../../agents/frontend/src/components/GooglePlacesInput.tsx) line 160/183/184:
  it DOES emit both `name` (establishment name) and `full_address` (formatted address) — and
  on select it overwrites the input's visible text with `full_address` (line 183), which is
  why the name visibly disappears the instant the suggestion is clicked.

**Production evidence:** of the last 25 inventory records, **10 have a raw street address in
the building-name field** instead of a name. Examples:
- `RP-GZB-RES-20784` → "Sector 5, Vaishali, Ghaziabad, Uttar Pradesh 201019, India" (no name)
- `RP-GZB-RES-20764` → "Sector 4, Vaishali, Ghaziabad, Uttar Pradesh 201019, India" (no name)
- `RP-GZB-RES-20780` → "J9Q7+72G, Aditya Mega City…" (Google plus-code prefix)

**Why it looks random:** for SOME POIs Google prepends the name to `formatted_address`
("Ramprastha Greens, …") so the name survives (buried in the full string); for most (plain
sector addresses) it doesn't, and the name is lost entirely. Coin-flip per place.

**Fix direction (for the plan):**
1. Code: in `onSociety`, prefer `p.name` for `apartment_name` (building name), keep the full
   address in the dedicated `full_address` field where it belongs. Small, contained change to
   the shared component (covers Add + Edit, desktop + mobile). Also stop overriding the input's
   visible text with `full_address` for establishment picks so the user sees the name they picked.
2. Data: ~40% of recent rows have addresses in `apartment_name` — one-time backfill to
   re-extract the name where recoverable.

Related: [[reference_address_society_and_plot_unit]].

---

## Task 2 — Inventory "Property Type" filter not narrowing results

**Symptom (owner, screenshot):** filter set to Residential → Builder Floor → **Builder Flat
(Front)** + **Independent Floor**, 2 BHK — but results still show **Builder Flat (Back)**
listings (RP-GZB-RES-20750, RP-GZB-RES-20713).

**What was ruled OUT (all verified):**
- **Data is consistent** — the two "Back" listings correctly carry the Builder Flat (Back)
  taxonomy node id (`1bef906e…`); the card label matches the stored node. Not a mistagging bug.
  All three types share parent "Builder Floor" (`1a109fbd…`): Front=`c6b5fe68…`,
  Back=`1bef906e…`, Independent=`7d0c9f55…`.
- **Backend filter is CORRECT** — verified with a live minted-token API call to
  `GET /api/inventory` on prod:
  - no filter → 100 rows (Front 32, Back 14, Indep 10)
  - `taxonomy_node_ids=Front,Indep` → **Back = 0** (Front 59, Indep 41) ✓
  - `taxonomy_node_ids=Front` → 85 rows, **all Front, Back = 0** ✓
  So when the param is sent, the backend excludes Back exactly as expected.
  ([`backend/src/routes/inventory.ts`](../../agents/backend/src/routes/inventory.ts) L453-457 +
  [`backend/src/utils/taxonomy_filter.ts`](../../agents/backend/src/utils/taxonomy_filter.ts) —
  `expandTaxonomyNodeIds` walks self+descendants only, never siblings.)
- **Frontend wiring looks correct on paper** — [`InventoryList.tsx`](../../agents/frontend/src/components/InventoryList.tsx)
  L297-299 refetch effect includes `filterTaxonomy`; L373 sends `taxonomy_node_ids` when
  nodeIds present; the 2026-06-10 full-page-spinner remount guard is intact (`if (loading &&
  initialLoad)`, L1020); [`FilterSheetShared.tsx`](../../agents/frontend/src/components/filters/FilterSheetShared.tsx)
  `effective()` returns leaf ids when leaves are picked.

**Conclusion: the bug is frontend runtime — the filtered result set is being overwritten in
the UI.** Leading candidate (to confirm with a browser repro at fix time):

- **Out-of-order async responses / no request sequencing.** Drilling into "Builder Floor"
  (a non-leaf) immediately sets `nodeIds=[BuilderFloor]` and fires a fetch that returns the
  WHOLE branch (Front+Back+Indep). Clicking a leaf then fires a second fetch with `nodeIds=[Front]`.
  `loadInventory` ([InventoryList.tsx](../../agents/frontend/src/components/InventoryList.tsx) L357)
  has **no AbortController / request-id guard**, so if the slower whole-branch response lands
  AFTER the leaf response, `setInventory()` overwrites the correct (leaf-filtered) list with the
  branch list — which still contains Back. Matches "Front selected, Back shows," and matches
  "every time" if the branch query is consistently slower.

**Fix direction (for the plan):** add request sequencing to `loadInventory` — an
AbortController or a monotonically-increasing request id so a stale (earlier) response can't
overwrite the latest filter's results. Confirm the exact repro in the browser first
(Playwright, super_boss) before/after.

---

---

## Task 3 — Deal reminders don't reposition the deal by next follow-up date/time

**Symptom (owner):** a team member sets a reminder / next follow-up on a deal, but the deal
does not move in the pipeline to reflect the next follow-up date/time.

**Root cause (CONFIRMED — backend + frontend):** the follow-up datetime is never stored on the
deal, and only the Kanban view sorts by it.
- **No follow-up column on the deal.** `backend/prisma/schema.prisma` `Transaction` (model @ L1753)
  has only `last_team_action_at` (L1814), `created_at`, `updated_at @updatedAt` (L1824), `closed_at`.
  There is NO `next_follow_up_at`/`reminder_at`/`next_action_at`. (`next_action_at` at L123 is on
  **Contact**, not Transaction.) The reminder datetime lives ONLY on a separate `Task.due_date`.
- **Reminder write** (`POST /api/deals/:id/reminder`, [`routes/deals.ts`](../../agents/backend/src/routes/deals.ts) L1298,
  also `services/deal_reminder.ts`): creates a `Task{task_type:'REMINDER', due_date}` (deals.ts L1344-1363)
  and the ONLY write to the deal is `transaction.update({ last_team_action_at: new Date() })` (L1380) —
  which via `@updatedAt` ALSO bumps `updated_at` to NOW.
- **Sort** ([`services/deal_service.ts`](../../agents/backend/src/services/deal_service.ts) `listDeals` L606):
  `orderBy: { updated_at: 'desc' }`. It computes a per-deal `next_reminder` (soonest open REMINDER
  `Task.due_date`, L647-682) but never orders by it.
- **Views**: only the **Kanban** view sorts by follow-up client-side
  ([`DealPipeline.tsx`](../../agents/frontend/src/components/DealPipeline.tsx) L421-424, `nextActionMs`
  = `next_reminder.due_date ?? created_at`). The **Mobile** (L811) and **desktop List** (L1334) views
  render the raw `updated_at desc` array — no follow-up sort.

**Net effect:** setting a reminder bumps `updated_at=now`, so on the DB order + Mobile + List views the
card jumps to the TOP (most-recently-touched) — the OPPOSITE of "reposition by next follow-up." Only
Kanban honors it, and only within the loaded page (`limit:500`).

**Fix direction:** either (a) add a `next_follow_up_at` datetime to `Transaction`, set it from the
reminder's `due_date`, and sort the pipeline by it (nulls last), or (b) sort all views by the already-
computed `next_reminder.due_date` (not `updated_at`) and stop bumping `updated_at` on reminder-set.
Decide with owner what the intended order is (soonest follow-up first). Related: docs reference "deal reminder".

---

## Task 2 — "False" (inflated) New-Deals count for Ravindra (Ravindra Prajapati, employee)

**Symptom (owner):** Ravindra's "new deals" count is inflated with false leads.

**Root cause (CONFIRMED via prod data):** the New-Deals count includes OLD leads resurfaced by the
daily lead-recycler + a bulk re-import, not just genuinely-new inbound.

Ravindra has **254 NEW-status deals** (attributed via `demand_contact.assigned_agent_id`). By deal source:
| source | count | genuinely new? |
|---|---|---|
| `recycled_stock` | **107 (42%)** | ❌ recycler-resurfaced old leads |
| `recycle 2` | **51 (20%)** | ❌ bulk-import of old stock (1,502 such contacts org-wide) |
| 99acres | 85 | ✓ |
| system | 7 | ✓ |
| magicbricks | 4 | ✓ |

**158 of 254 (62%) are NOT fresh inbound.** Confirmed: 107 carry a `lead_recycled` interaction. The
creation histogram shows steady ~10–13/day clusters (Jun 13–23, Jul 09–14) — the signature of the
recycler ([`services/lead_recycler.ts`](../../agents/backend/src/services/lead_recycler.ts) L87-88:
"per active agent, recycle their 10 oldest un-converted leads" → `ensureDealForLead({source:'recycled_stock',
assignedAgentId: contact.assigned_agent_id})` L48-51 → a NEW-stage deal). Data quality is otherwise fine
(0 placeholder phones, 0 duplicates, 0 empty-requirement deals). **Org-wide: 641 of 2,507 NEW deals (26%)
are `recycled_stock`.**

**Why it reads as "false":** "New Deals" counts every NEW-status deal regardless of whether it's a fresh
inbound lead or an old lead the recycler/import re-activated — so the number balloons.

**Fix direction (needs an owner product decision):** define what "New Deals" should mean, then either
exclude `source IN ('recycled_stock','recycle 2')` (or leads with a `lead_recycled` interaction) from the
"new" metric, or split the dashboard into "New (fresh inbound)" vs "Recycled/Re-engaged." Possibly also
reconsider whether the recycler should reset a lead all the way to NEW stage. Ties into Dashboard RBAC
analytics (`services/analytics_scope.ts`, `team_metrics.ts`).

---

## Task 4 — Add "Call inventory manager" button (inventory tile + Edit modal header)

**Request (owner):** a button to call the **inventory manager** (the assigned team member for the
listing, NOT the property owner) on each inventory tile AND at the top of the Edit Inventory modal.

**Findings (feature is low-effort; data already present):**
- **Today the tile "Call" dials the source, never the manager.**
  [`InventoryList.tsx`](../../agents/frontend/src/components/InventoryList.tsx) L1701-1743: "Call"
  dropdown dials `uploader_phone` / `owner_phone` / `key_holder_phone`. The manager
  (`item.assigned_agent.name`) is shown name-only (L1688-1691), not dialable. Mobile
  ([`MobileInventoryList.tsx`](../../agents/frontend/src/components/mobile/MobileInventoryList.tsx)
  L544-545, 883-909) — same: dials source, manager name-only (L575-577).
- **Edit modal header** is inline in `InventoryList.tsx` L1970-2003 (the `editingId` modal), NOT in
  `InventoryModal.tsx` (that file is the Add workflow). "Owner:" L1980-1985, "Uploaded by:" L1986-1992.
- **Manager phone is ALREADY in the API for staff.** [`routes/inventory.ts`](../../agents/backend/src/routes/inventory.ts)
  list include L589-605 selects `assigned_agent { id, name, role, phone }` and `uploaded_by_agent {…phone}`;
  `redactInventoryForStaff` ([`services/sanitization_service.ts`](../../agents/backend/src/services/sanitization_service.ts)
  L120) **intentionally keeps** `assigned_agent` name+phone. Backend already computes `inventory_manager =
  assigned_agent?.name` (inventory.ts L1463). **No backend change needed for staff.**
- Reuse `toDialablePhone` / `isPlaceholderPhone` ([`frontend/src/lib/phone.ts`](../../agents/frontend/src/lib/phone.ts) L41-48).

**Fix direction:** add a "📞 Manager" button on the tile (near L1701) and in the Edit header (near L1986)
dialing `tel:${toDialablePhone(item.assigned_agent?.phone)}` (fallback `uploaded_by_agent?.phone`), gated on
a dialable phone. Caveats: verify the **partner viewer** path (`applyRoleMaskList`, inventory.ts L643-659)
if the button must work for partners; the frontend `item` TS type may need `assigned_agent.phone` added.

---

---

## Task 5 (owner#3) — Existing lead must keep the same lead manager on re-intake

**Owner's requirement:** when a lead arrives from any source, detect if the phone already exists; if it
does, record only the new requirement and KEEP the same lead manager (do not reassign).

**Verdict: ALREADY FULLY ENFORCED — not a bug.** Confirmed in code across every automated intake path AND
in production data.

- **Code — every path preserves `assigned_agent_id` for an existing contact; round-robin fires only when
  nobody is assigned yet** (deliberate 2026-05-17 RC2/D1 fix, see docs "feedback_lead_assignment_dedup"):
  - `services/ensure_deal.ts` L100-123: `assignedAgentId = args ?? contact.assigned_agent_id ?? null`;
    round-robin + the `contact.update({assigned_agent_id})` are BOTH inside `if (!assignedAgentId)`.
    Existing active deal per (contact,type) returned unchanged (L83-89).
  - `webhook_processor.ts` existing-contact branch updates only `contact_type/name/email`, never assignment.
  - `integrations/99acres.ts` L122-131, `magicbricks.ts` (existing → early "Lead already exist" return),
    `housing.ts` L94-95, `facebook.ts` L257-258, `ninety_nine_acres_poller.ts` (all routing inside
    `if(isNew)`), `housing_poller.ts` L292-311, `routes/public.ts` (website upserts omit `assigned_agent_id`),
    `routes/leads.ts` manual (attach payload deliberately OMITS `assigned_agent_id`, L1134-1150),
    `external_leads.ts` L124-129 — all gate assignment on "contact is new."
  - **Requirement merge**: new requirement recorded on the existing contact (deep-merge of
    `demand_schema_values` / `demand_taxonomy_node_id`); a genuinely different intent (buy vs rent) opens a
    second deal whose coordinator/executive = the preserved agent.
- **Data — zero manager drift**: only 6 contacts have 2+ deals; NONE span more than one `owning_manager_id`.

**One nuance to raise with owner (not a violation of the core rule):** attaching a **PARTNER_REFERRAL**
requirement to an existing contact overwrites `owning_manager_id` (the middleman "owning manager") at
`routes/leads.ts:1146`, while `assigned_agent_id` (the lead manager) is still preserved. Also, explicit
manual `/assign` + `/reassign` endpoints change ownership by design (admin action, not intake).

**Fix direction:** nothing required for the core rule — it works. Optionally: confirm the partner-referral
`owning_manager_id` behavior is intended, and (if desired) surface a "new requirement added" note on the
existing lead so the team sees re-enquiries.

---

## Status — ALL investigated; 4 SHIPPED 2026-07-15, 2 owner-dropped

| # | Owner item | Verdict | Outcome |
|---|---|---|---|
| Filter | type filter shows wrong types | frontend race (no request sequencing); backend verified OK | ✅ **SHIPPED** — request-id guard on `loadInventory` (desktop + mobile). Live-verified: Builder Flat (Front) → 90 results, all Front, 0 Back. |
| Building name | Google name not saved | `onSociety` stored address over `p.name` | ✅ **SHIPPED** — prefer `p.name`; `GooglePlacesInput` shows the name for establishment picks. Backfill: 19 rows recovered a real building name, 28 flagged `needs_taxonomy_review`, full address preserved in `full_address`. Snapshot `inventory-pre-namebackfill-20260715180651.dump`. |
| owner#1 | reminder doesn't reposition deal | no follow-up column; List/Mobile sorted by `updated_at` | ✅ **SHIPPED** — List + Mobile now use the same soonest/overdue-first `next_reminder` sort as Kanban (`sortedDeals` in `DealPipeline.tsx`). Owner chose soonest-first (act-now queue). Frontend-only, no schema change. |
| owner#2 | Ravindra false new-deal count | 62% recycled_stock + recycle-2 old leads | ⛔ **DROPPED by owner** (recycler/definition matter). |
| owner#3 | keep same lead manager | ALREADY ENFORCED (data-verified, 0 drift) | ⛔ **DROPPED by owner** (already working). |
| owner#4 | call inventory manager button | `assigned_agent.phone` already in API | ✅ **SHIPPED** — "☎ Manager" button on tile + Edit header + mobile. Live-verified dialing the assigned manager. |

**Deploy:** frontend `v20260715a-admin-ui-fixes`; tsc 0 / build clean; server_health all-green.
**Live-verified via Playwright (super_boss):** filter fix + call-manager button screenshotted. Building-name
forward fix + deal sort are deployed and code-verified (a live building-name walkthrough via the Google
picker is available on request). Plan: `~/.claude/plans/shimmying-giggling-marble.md`.
