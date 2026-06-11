# Edit-Inventory ↔ Taxonomy Reconciliation — Implementation Plan

**Date:** 2026-05-27
**Goal:** Make the **Edit Inventory** modal (desktop `InventoryList.tsx` + mobile `MobileInventoryEdit.tsx`) consistent with the new taxonomy model the Add wizard already uses — so editing a property shows the correct per-type fields, no duplicates, and saves to the stores the rest of the app reads.

**Status:** PLAN (awaiting approval). No code yet.

---

## Why this is not "switch everything to taxonomy specs"

Investigation (2026-05-27) found the new taxonomy spec keys are **not** what consumers read:

| Concept | New taxonomy field writes | What matching / website / share actually READ |
|---|---|---|
| Amenities | `specs.amenities[]` | **`features{}`** (matching_engine `prop.features[a]===true`; website `Object.entries(features)`; share `featureList(features)`) |
| BHK | `specs.bhk` | **`specs.bedrooms`** (matching `specs.bedrooms===criteria.bhk`; share `specs.bedrooms BHK`) |
| Furnishing / Facing / Property Age | `specs.furnishing` etc. | **DB columns** `furnishing` / `facing` / `property_age` (matching_engine + share message) |
| Area / Bathrooms | (taxonomy excludes them) | `specs.area` / `specs.area_unit` / `specs.bathrooms` |

The taxonomy→consumer migration is a **later** overhaul phase (Phases 2–5) that hasn't shipped. Until it does, **the legacy stores are canonical.**

### Design decision (Option A — chosen)
Align the editor to write the **existing canonical stores**, render each concept **once**, use the taxonomy cascade for the *type*, and let the taxonomy "Property Details" render **only** the genuinely new type-specific fields that have no legacy consumer. This fixes the editor **without touching** website/matching/share.
(Option B — migrate all consumers to read taxonomy specs — is a much larger, public-site-touching effort; out of scope here, tracked separately.)

### Canonical store per field (what the editor must write)
- **Type** → `taxonomy_node_id` (+ backend derives legacy `category_id`/`sub_category_id`/`type_id`).
- **BHK** → `specs.bedrooms` (the legacy "Bedrooms" input is canonical; taxonomy `bhk` is NOT rendered).
- **Bathrooms / Area / Area Unit** → `specs.bathrooms` / `specs.area` / `specs.area_unit` (legacy Specs inputs).
- **Furnishing / Facing / Property Age / Ownership** → DB columns (Details tab inputs).
- **Amenities** → `features{}` (Amenities tab), option set aligned to the 12 taxonomy amenities.
- **New type-specific fields** (no legacy consumer) → `specs.<key>` via the taxonomy render: `balconies`, `additional-rooms`, **`parking` (parking_list)**, **`road-facing`**, `sides-open`, `far`, `plot-area`, `dimension`, `boundary-wall`, `status`, `brands`, `nozzles`, `seats`, `reception`, `pantry-canteen`, `playground`, `pre-rent-leased`, `star-rating`, `labs`, `operation-theatres`, `wards`, `conference-cabins`, `total floors` (`floors`), etc.

**Taxonomy-render EXCLUDE list** (rendered by their dedicated legacy inputs instead, to kill duplication): `bhk`, `bedrooms`, `bathrooms`, `area`, `area_unit`, `carpet_area`, `furnishing`, `facing`, `age-of-construction`, `ownership-tenure`, `amenities`. (Currently only the first 5 are excluded — [InventoryList.tsx:526](../../agents/frontend/src/components/InventoryList.tsx#L526).)

---

## Phase 1 — Parking widget in both editors (safe, isolated)

**Files:** `frontend/src/components/InventoryList.tsx`, `frontend/src/components/mobile/MobileInventoryEdit.tsx`

- [ ] Import the existing shared `ParkingListField` into both files.
- [ ] In each file's taxonomy-field renderer (InventoryList ~line 1980; the equivalent block in MobileInventoryEdit), add a FIRST branch: `f.input_type === 'parking_list' ? <ParkingListField value={editSchemaValues[f.key]} onChange={v => setEditSchemaValues({...editSchemaValues,[f.key]:v})} /> : …`.
- [ ] Confirm prefill: `ParkingListField.normalizeParking` already coerces the stored array; the load path (`editSchemaValues` from `specs[key]`) feeds it.
- [ ] Build gate (`npm run build`), SW stamp bump, deploy admin frontend, Playwright-verify Parking renders the "+ Add parking" widget in Edit (desktop) for a flat.

**No backend/data change.** Fixes the broken text box.

---

## Phase 2 — Classification tab → taxonomy cascade (frontend + backend)

**Backend file:** `backend/src/routes/inventory.ts` (PATCH `/:id`, ~line 555)
- [ ] Add `taxonomy_node_id` to `allowedFields`.
- [ ] When `taxonomy_node_id` is provided: load the node; derive + set legacy `category_id`/`sub_category_id`/`type_id` (and `category`/`type` slugs, `flat_property_type_id`) from the node's `legacy_sub_category_id`/`legacy_type_id`/`legacy_flat_property_type_id` + root-ancestor category (mirror the Add-commit derivation in `workflow_engine.ts`); set `needs_taxonomy_review=false` when a legacy map exists.
- [ ] Keep treating `''`→`null` for the UUID FKs.
- [ ] GlitchTip-wrap the new derivation (no silent catch).

**Frontend files:** both editors
- [ ] Replace the 6 legacy `<select>`s in the Classification tab with a Category→SubCategory→Type cascade sourced from the taxonomy tree (`getTaxonomyTree`, same data the Add wizard's picker uses). Selecting the leaf TYPE sets `editData.taxonomy_node_id`.
- [ ] On type change, call `getNodeFields(newNodeId)` and refresh `editNodeFields`/`editSchemaValues` (re-prefill from current specs) so Property Details matches the new type.
- [ ] Remove Configuration / Usage Type / Investment Type inputs. (DB columns remain, untouched.)
- [ ] Send `taxonomy_node_id` in the save payload.
- [ ] Verify: edit a property, change type, confirm `taxonomy_node_id` + derived legacy persist and Property Details refreshes.

---

## Phase 3 — De-duplicate Details/Specs

**Files:** both editors
- [ ] Extend the taxonomy-render EXCLUDE list (see above) so `furnishing`, `facing`, `age-of-construction`, `ownership-tenure`, `bhk`, `amenities` no longer double-render in "Property Details (by type)".
- [ ] Keep the dedicated legacy inputs as the single capture for those concepts (Details tab: Furnishing/Property Age/Facing/Ownership — write columns; Specs tab: Bedrooms→`specs.bedrooms`, Bathrooms, Area). Remove any now-duplicated input.
- [ ] Map the taxonomy `age-of-construction` option labels ↔ the Details `property_age` enum values so they agree.
- [ ] Verify: each concept appears exactly once; saving writes the canonical store (spot-check a saved row's columns + specs).

**Noted pre-existing gap (out of scope, flag to user):** the Add wizard may store `furnishing`/`facing`/`bhk` into `specs.*` but not the columns/`specs.bedrooms` that consumers read → wizard-added inventory can be invisible to matching for those fields. Fixing the Add commit's write-through is a separate task.

---

## Phase 4 — Amenities aligned on `features{}`

**Files:** both editors (+ confirm option parity)
- [ ] Keep the Amenities tab as the single amenities capture, writing `features{}` (what matching + website read).
- [ ] Align the editor `AMENITIES_LIST` option set + keys with the 12 taxonomy amenities (Gym, Club House, Power Backup, Lift, Intercom, Guest House, Park, Community Hall, Mini Theater, Swimming Pool, Security, Gas Pipeline), using the snake_case keys the website prettifies.
- [ ] Ensure the taxonomy `amenities` field stays in the EXCLUDE list (Phase 3) so amenities don't double-render in Specs.
- [ ] (Optional forward-compat) also mirror the selection into `specs.amenities[]` on save — only if cheap; canonical stays `features{}`.
- [ ] Verify: amenities chosen in Edit show on the website property page + count toward matching.

---

## Cross-cutting
- **Mobile parity:** every change lands in BOTH `InventoryList.tsx` and `MobileInventoryEdit.tsx` (separate renderers, per [[reference_add_inventory_two_renderers]]).
- **Deploy:** Phase 1 = frontend only. Phase 2 = backend + frontend. Phases 3–4 = frontend only.
- **Verify each phase** via `npm run build` + Playwright on the Edit modal (desktop) and a spot DB read of a saved row.
- **No destructive data migration** — this is UI/route alignment; existing rows already carry `taxonomy_node_id` (363/369).

## Out of scope (separate, tracked)
- Migrating website/matching/share consumers to read taxonomy `specs.*` instead of `features{}`/`specs.bedrooms`/columns (Option B / taxonomy Phases 2–5).
- Fixing the Add wizard's column/specs write-through gaps for furnishing/facing/bhk.
- The 6 inventory rows with no `taxonomy_node_id`.
</content>
