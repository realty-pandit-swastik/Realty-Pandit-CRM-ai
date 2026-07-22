# Plan — Inventory & Deal-Pipeline improvements (phased)

**Date:** 2026-06-26
**Method:** per phase → verify real code → implement → `tsc`/build → deploy → verify on prod → next phase.

## Phase roadmap
- **Phase 1 — Quick wins — ✅ DONE + VERIFIED 2026-06-26:** Task 1 (mobile counts) + Task 2 (text location search). Frontend-only. Verified on live admin (mobile): total "645 properties" shows always; filter chips show "Sale (587)/Rent (58)"; `location=Vaishali` narrows 645→312. Backup `/root/backups/phase1-inventory-20260626/`.
- **Phase 2 — Floor system — ✅ DONE + VERIFIED + DEPLOYED 2026-06-27:** Task 7 (named/negative floor input) + Task 6 (display-floor). Prod migration applied (`floor_label`, `display_floor`); all 3 apps deployed. Verified live (authenticated round-trips): named floor `Ground`/`floor_number=0` persists (Ground-0 falsy bug fixed), `display_floor` override saves without touching internal floor, both restore clean; admin bundle contains the new chips control; website renders. Deferred: website public capture form (`StepRenderer`) named-chip parity (text input still works).
- **Phase 3 — Add-inventory — ✅ DONE + VERIFIED + DEPLOYED 2026-06-27:** Task 4a (reuse owner contact) + 4b (clone inventory with checklist). Backend `POST /api/inventory/:id/clone` (spreads source, clears caller-listed unit fields, new display_id) + admin success-dialog buttons (same-owner re-prefill + Clone checklist → Edit). Verified live: clone round-trip copied building/specs/owner + cleared flat/floor/price + minted `RP-NOI-RES-20714` + test clone deleted (no junk); UI strings in served bundle; type-clean. No schema/website change. **Verified code (`InventoryModal.tsx` + `useWorkflow.ts`):** flow = contact→prefilling→workflow→confirm→success; `PREFILL_STEPS` (user_role/uploader_phone/uploader_name) auto-fed from `sourceContact` by the prefilling `useEffect`; `handleAddNew` = `wf.reset()`→`contact`; success dialog has Add-New / Edit-Details(`onEditInventory(id)`) / Back buttons; `wf.answers` accumulates everything, `wf.inventoryId` = the just-created id; **no clone exists**; owner_id+owner_phone are required FKs (a clone must copy the owner).
  - **4a (same owner):** add a success-dialog button **"+ Add another — same owner"** (shown when `sourceContact` set) → `handleAddNewSameOwner` keeps `sourceContact`, calls `wf.reset()`, `setPhase('prefilling')` → existing prefill effect re-feeds the owner → new add skips contact entry. Relabel existing button "Add new (different owner)". Frontend-only, reuses prefill machinery.
  - **4b (clone listing):** backend `POST /api/inventory/:id/clone` — duplicates the source row (owner copied so FK holds; building/society + classification + specs/features copied), **clears the "will differ" nullable fields** per body flags (default: `flat_no, plot_no, floor_number, floor_label, display_floor, price, customer_price, display_price`), new `display_id`, tag `cloned_from`, media NOT copied unless requested; returns `{ inventory_id }`. Frontend: success-dialog **"Clone this listing"** → small **checklist modal** (copy building+specs ✓; "I'll re-enter: Unit/Flat, Floor, Price" ✓; optional copy-photos) → call clone → `onEditInventory(cloneId)` opens Edit on the clone for contact/address/price.
- **Phase 4 — Deal-tile call-log redesign (Task 3) — ✅ DONE + VERIFIED + DEPLOYED 2026-06-27:** NEW-stage tile now shows 📞 Call + 6 inline outcome buttons (Interested/Callback/No-answer/Not-interested/Wrong-spam/Language); "Log My Call" + "Close as Lost" removed from NEW (other stages keep them). Not-interested + Wrong/spam now CLOSE the deal and REQUIRE a note; Callback books a Google-synced reminder (new `services/deal_reminder.ts`). Verified live: mandatory-notes → 400 (deal stays NEW); callback created a REMINDER task due at callback time (test artifacts cleaned up); bundle has new buttons, "Log My Call" gone; screenshot confirms. No schema/website change.
  **(planning notes below)**
  **Verified code:** `DealPipeline.tsx` has TWO NEW-stage renderers — mobile card (815-822 "📞 Log My Call"→`setLogCallDeal`; 870-883 "❌ Close as Lost"→`handleDispose`) and desktop kanban (1075-1078; 1132-1136); both already have a `tel:` dial link (721/977). `LogCallOverlay` (rendered once at 1308) has 6 outcomes whose **server logic already does the right transitions** (`POST /api/deals/:id/log-call`): Not-interested→close, Wrong/spam→close, No-answer→stay+AI retry, Answered→qualify form, Callback→(currently only WhatsApps manager), Language→alert. Working Google-synced reminder exists: `POST /api/deals/:id/reminder`→`pushReminderToGoogle` (Calendar+Tasks+notify before/at). **GAP:** the Callback outcome (deals.ts:1473-1489) creates NO reminder/Google push → callbacks never resurface.
  **Backend:** extract a shared `createDealReminder(dealId, agentId, remindAt, note)` (from the `/reminder` route) and call it in the **CALLBACK_REQUESTED** case so a callback books a Google-synced REMINDER (Calendar+Task+notify) that brings the deal forward; support reschedule (replace the deal's open REMINDER task).
  **Frontend (both renderers, NEW-stage only):** replace the single "Log My Call" with an inline action bar = **📞 Call** (reuse `tel:`) + the 6 outcome buttons. One-tap fire-and-POST for No-answer / Not-interested (default reason) / Wrong-spam; **Callback/⏰ Remind** → compact inline datetime → Google reminder; **Answered—interested** → opens `LogCallOverlay` pre-jumped to that outcome (new optional `initialOutcome` prop) since the qualify form is large. **Remove "Close as Lost" from NEW tiles** (Not-interested + Wrong/spam cover it); keep it on other stages. Mobile = compact 2-row layout.
  **Verify:** each outcome from the tile (one-tap closes for not-interested; callback creates a Google Calendar event + Task + notify; answered opens qualify) via authenticated Playwright + API; no schema change.

---

## PHASE 1 — verified findings + plan

**Files:** `agents/frontend/src/components/InventoryList.tsx` (desktop), `agents/frontend/src/components/mobile/MobileInventoryList.tsx` (mobile). No backend change.

### Verified facts
- Desktop already fetches `/api/inventory/filter-counts` on sheet open ([InventoryList.tsx:163-168]) → `filterCounts`; `getCount(field,value)` returns ` (N)` ([:171-177]). The API returns `total, intent, ownership_type, category, category_id, sub_category_id, bhk, data_source` (no `status`).
- **Total count on mobile** ([MobileInventoryList.tsx:312]) renders only inside the Filters button **when `activeSheetFilterCount > 0`** — hidden otherwise.
- **Mobile has NO per-filter counts** (filter sheet chips are label-only; mobile never fetches `filter-counts`).
- **Location filter** = Google-Places autocomplete + radius (`FilterLocationSection`, sets lat/lng only on picking a suggestion). The robust **text** search is wired end-to-end but orphaned: `filterLocation`→`params.location`→backend `findInventoryIdsByAddress()` — desktop has the state ([:142],[:335],[:474]) but **no input**; mobile has neither. (~31% of active inventory has no lat/lng, so the radius filter can't see them — the text search can.)

### Task 1 — make counts visible on mobile
1. **Total always visible:** add a `{totalCount} properties` line under the mobile search row (always shown).
2. **Per-filter counts in the mobile sheet:** add `filterCounts` state + fetch on `showFilterSheet` + the `getCount` helper (copied from desktop), and append `getCount(...)` to the **Purpose** (`intent`), **Listing Source** (`ownership_type`), and **Data Source** (`data_source`) chips. (Skip Status — not in the API.)

### Task 2 — working text location search (desktop + mobile)
- **Desktop:** add a labelled text input bound to the existing `filterLocation` state, placed just above `FilterLocationSection` (InventoryList.tsx:2872). Backend already filters via `params.location`.
- **Mobile:** add `filterLocation` state + text input (above `FilterLocationSection`, :902), wire `params.location` in `loadData`, add to the load `useEffect` deps, `activeSheetFilterCount`, and "Clear All".
- Keep the Google "near me (radius)" section as the secondary proximity option.

### Verify Phase 1
- `tsc -b` clean; build on server; bundle contains the new strings.
- Authenticated Playwright (mobile viewport) on `admin.realtypandit.in` → inventory page: total count visible without filters; open filter sheet → Purpose/Source/Data-Source chips show ` (N)`; type a locality in the new location box → list narrows. (Admin creds in memory `admin_credentials`.)

### Deploy Phase 1
Admin frontend: `tsc -b && vite build` on server (`/var/www/realty-pandit/frontend`), served by `serve -s dist` (pm2 `realty-admin`), picked up live; bump nothing else. Parity-check + backup both files first.

---

## PHASE 2 — Floor system (Tasks 7 + 6) — verified findings + plan

### Verified facts (real code)
- Schema: only **`floor_number Int?`** on `inventory` (no `floor_label`/`display_floor`). `total_floors` lives in `specs.floors`.
- Capture is **`<input type="number">`** in `AddressFields.tsx` (admin add/edit) + the website post-property form; commit via `workflow_engine`/`routes/inventory.ts` (create + PATCH parses `parseInt`).
- Floor is read/rendered in ~8 buyer/agent surfaces: `services/pdf_generator.ts`, `components/deal/MatchShareTab.tsx`, `services/property_sharing.ts`, `agents/partner_agent.ts`, `routes/public.ts` (list+detail), website `agent/inventory/browse` + `agent/deals/[id]/browse`. Matching engine sorts on `floor_number` (numeric).

### Design (clean — label is authoritative for display, number for sort)
- **Keep `floor_number Int?`** as the numeric SORT key (existing data unchanged; matching keeps working).
- **Add `floor_label String?`** = the authoritative DISPLAY value: a named level (`Ground`/`Upper Ground`/`Basement`/`Stilt`) or a plain number string. When floor is a plain number, `floor_label` stays null and display falls back to the number.
- **Add `display_floor String?`** (Task 6) = optional buyer-facing override; falls back to the formatted real floor.
- **Two shared helpers** (`utils/floor.ts`, mirrored in website + admin):
  - `formatFloor(floor_number, floor_label)` → `floor_label` if set, else `String(floor_number)`, else ''.
  - `getDisplayFloor(inv)` → `inv.display_floor || formatFloor(inv.floor_number, inv.floor_label)`.
- **Capture UI:** preset chips **[Basement] [Stilt] [Ground] [Upper Ground]** + a numeric stepper (allows negatives for B2/B3). Chip → sets `floor_label` + a best-effort sort `floor_number` (Basement −2, Stilt −1, Ground 0, Upper Ground 1, Nth = N). Sort collisions (UG↔1) are acceptable because **display always uses the label**.

### Steps
1. **Schema migration** `add_floor_label_display_floor` → `floor_label String?`, `display_floor String?`; `prisma generate` (em-dash strip) — prod migration.
2. **`utils/floor.ts`** (backend) + a tiny mirror in website (`src/lib/floor.ts`) and admin (`src/lib/floor.ts`).
3. **Capture (Task 7):** `AddressFields.tsx` floor input → chips + numeric; website post-property floor field same; backend create/PATCH accept `floor_label` (+ keep `floor_number`).
4. **Edit (Task 6 + 7):** admin Edit (desktop + `MobileInventoryEdit`) add a **Display Floor** text field + the new floor control; `routes/inventory.ts` PATCH allow `floor_label` + `display_floor`.
5. **Display surfaces:** route every floor render through `formatFloor`/`getDisplayFloor`: `pdf_generator`, `MatchShareTab`, `property_sharing`, `partner_agent`, `public.ts` (expose `floor_label`+`display_floor`), website browse/detail.
6. **Backfill** `floor_label` from existing `floor_number` (numeric → string) so nothing reads blank.

### Verify Phase 2
Resolver/helper unit test (`formatFloor`/`getDisplayFloor`); `tsc` clean; deploy backend+admin+website; authenticated Playwright: add a "Ground"/"Basement"/"-1" floor → shows correctly in edit, deal share, PDF, website; set a `display_floor` → buyer surfaces show the override, internal keeps the real floor.

### Deploy Phase 2
Backend (migrate deploy + generate + restart), admin (build), website (build + `sudo -u realty -H pm2 restart realty-website`). Backups + parity-checks first.

**Checkpoint:** Phase 2 opens with a prod schema migration (additive, safe) + a floor-model choice — confirm the model before migrating.

### Phase 2 — IMPLEMENTATION COMPLETE (type-clean), pre-deploy (2026-06-27)
All code written + type-checked (backend tsc: only pre-existing errors, none floor-related; admin `tsc -b --force` EXIT=0; website `tsc --noEmit` EXIT=0). **Not yet deployed.**
- **Schema/migration:** `prisma/migrations/*_add_floor_label_display_floor/migration.sql` (ALTER TABLE add `floor_label`, `display_floor` TEXT — additive, nullable). Client regenerated locally.
- **Backend:** `utils/floor.ts` (formatFloor/getDisplayFloor/parseFloorInput); capture `routes/inventory.ts` (create+PATCH) & `workflows/workflow_engine.ts` (also fixed Ground=0 falsy-drop bug); display `pdf_generator.ts`, `agents/partner_agent.ts`, `routes/public.ts` (list+detail+brochure now return the fields).
- **Admin:** `lib/floor.ts`; `AddressFields.tsx` floor = preset chips [Basement/Stilt/Ground/Upper Ground] + numeric (−1/−2) + a Display-floor override field; value-builders in `AddInventory.tsx`/`InventoryModal.tsx`; round-trip in `InventoryList.tsx` (+ inline edit clears stale label) & `MobileInventoryEdit.tsx`; `MatchShareTab.tsx` share text + `InventoryDetailView.tsx` via getDisplayFloor.
- **Website:** `lib/floor.ts`; `lib/api.ts` type; display in `PropertyDetailClient.tsx` + `PropertyListCard.tsx` via getDisplayFloor.
- **Website capture named-floor parity — ✅ DONE + DEPLOYED 2026-06-27:** `StepRenderer.tsx` floor input now has the same preset chips [Basement/Stilt/Ground/Upper Ground] + numeric (−1/−2) as admin, sending `floor_label` (+ sort `floor_number`) through the proven `workflow_engine` commit. Website rebuilt + redeployed (BUILD_ID Abt2q6CoqaAFL0givXmUa; chips in build; /post-property 200).

### Deploy plan (pending go-ahead)
1. Backup prod schema + check columns don't already exist; apply migration SQL (`ALTER TABLE inventory ADD COLUMN floor_label TEXT, ADD COLUMN display_floor TEXT;`).
2. Backfill: `UPDATE inventory SET floor_label = floor_number::text WHERE floor_number IS NOT NULL AND floor_label IS NULL;` (so existing floors keep showing).
3. Deploy backend (`deploy-agent.js backend`) → `npx prisma generate` on server → restart `realty-backend`.
4. Deploy admin (`deploy-agent.js frontend`) + bump `index.html` PWA comment.
5. Deploy website (`deploy-agent.js website`).
6. Verify (Playwright): add a Ground/Basement/−1 floor → shows right in admin edit/detail, deal share, PDF; set display_floor override → website + share show override, internal keeps real floor.
