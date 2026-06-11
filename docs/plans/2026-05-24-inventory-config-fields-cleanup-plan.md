# Inventory Configuration / Dropdown Cleanup — Plan (FOR REVIEW)

> **Status: DRAFT FOR REVIEW (plan mode — nothing built/deployed).** Fixes the "messed up" add-inventory config step: garbage dropdown options + misspelled labels, wrong field types (numbers shown as "Toilets 1,2,…."), incomplete facing, duplicate Area, and step order (Address after Configuration). Builds on the Phase 1a–1d taxonomy.
>
> **Root cause (confirmed):** `Chat/tools/gen_taxonomy_json.py` imported `Chat/newtree.xlsx` verbatim — column headers became field LABELS (so the owner's header typos `Staus`/`Amenties`/`Road With` leaked in) and each cell's text was split on `,`/`/` into OPTIONS (so "Toilets 1,2,…." and "How Many Rooms" became dropdown options; `�`→`…`). Stored in `FieldDefinition.label` + `NodeField.options_override` and serving live.

---

## 1. Decisions to confirm before building (open questions)
1. **Options model:** make options **canonical per field** in `FieldDefinition.options_json` (one clean set, e.g. Facing = the 8 directions everywhere) and **clear the per-type `NodeField.options_override`** garbage so every type inherits the clean set. (The read API already falls back `options_override ?? field.options_json`.) Per-type overrides stay possible later via the 1c editor. → **Confirm: canonical-per-field, yes?**
2. **Numbers vs dropdowns:** fields like Toilets/Balconies/Floors/Nozzles/Seats/Wards/Side-Opens are **counts** — make them `number` inputs (no dropdown) instead of "1,2,…." lists. → **Confirm.**
3. **The proposed option values in §3** are my best reconstruction of your intent — **you must review/correct each one.**

---

## 2. Structural fixes (the "tree is messed up" items)
| # | Issue | Proposed fix |
|---|---|---|
| 2.1 | **Step order** — Address (step 6) comes AFTER Property Type (4) + Configuration (5). | Reorder so **Address comes before** the type/config band for admin+web. In `workflow_definition.ts`, move `address_block` ahead of `taxonomy`+`schema_fields` (or gate a reordered sequence). Note: `address_block`'s field-rules currently key off the chosen type — verify address still renders without a type selected (it has a sane fallback). |
| 2.2 | **Duplicate Area** — `schema_fields` has an **"Area"** field (values Super/Built-up/Carpet = an area *type*) AND a **"Plot Area"** field, while a dedicated **`property_area`** step also asks area+unit. | Rename the schema "Area" field → **"Area Type"** (select: Super Built-up / Built-up / Carpet); keep the dedicated `property_area` step as the numeric area+unit; make "Plot Area" a `number`+unit. So: one numeric area (the step), one area-type (schema), one plot-area (schema) — no duplication. → **Confirm split.** |
| 2.3 | **Age Of Construction** duplicates the dedicated **`construction_status`** step (both ask age). | Drop `age-of-construction` from the schema (the `construction_status` step already captures it) OR drop the step for admin. → **Confirm which wins.** |
| 2.4 | **Partner attribution** — source-partner is optional on the confirm step, so admin-added inventory often saves `referral_partner_id=null` → never shows in the partner's panel. | (Separate sub-fix) Make the source-partner selection clearer/required-when-applicable so partner-sourced listings reliably set `referral_partner_id`. Detailed separately. |

---

## 3. Corrected field catalog (REVIEW EACH ROW)
Format: `field key` — **Corrected Label** — proposed `input_type` — proposed options. Current garbage shown for context.

### 3a. Universal / residential measurement fields
| Field | Corrected Label | input_type | Proposed options / behavior | Current garbage |
|---|---|---|---|---|
| `bhk` | BHK | select | 1 RK, 1, 2, 3, 4, 5, 6, 7, 8+ | `BHk-1Rk,1,2,3,4,5` |
| `rooms` | Rooms (commercial) | number | integer | `How Many Rooms` |
| `toilets` | Bathrooms | number | integer | `Toilets 1,2,….` |
| `balconies` | Balconies | number | integer | `Balcony 1,2…` |
| `floors` | Total Floors | number | integer | `total floors , property on floor 1,2….` |
| *(new)* `floor-number` | Floor Number | number | integer (split out of the conflated "Floors") | — |
| `area` | Area Type | select | Super Built-up, Built-up, Carpet | `super, Builtup, Carpet` |
| `plot-area` | Plot Area | number+unit | number (sq.yd / sq.ft) | `Plot Area` |
| `dimension` | Plot Dimensions | text | e.g. `30 x 40` | `Dimension` |
| `road-with` | Road Width | number+unit | number (ft / m) | `Road width` |
| `facing` | Facing | select | North, South, East, West, North-East, North-West, South-East, South-West | `Facing -east /west ….` (incomplete) |
| `side-opens` | Sides Open | select | 1, 2, 3, 4 | `Side Opens 1/2/3/4` |
| `floor-allowed-to-contruction-far` | FAR (Floor Area Ratio) | number | decimal | `Floor Allowed To Contruction FAR` |

### 3b. Status / tenure / furnishing (true dropdowns)
| Field | Corrected Label | input_type | Proposed options | Current garbage |
|---|---|---|---|---|
| `staus` → `status` | Construction Status | select | Ready to Move, Under Construction | `Staus`; `Ready To move in/under Construction` |
| `furnishing` | Furnishing | select | Unfurnished, Semi-Furnished, Fully Furnished | `Unfurnished, Semi, fully` |
| `free-lease-hold` | Ownership | select | Freehold, Leasehold | `Free hold/Lease Hold` |
| `boundary-wall-yes-no` | Boundary Wall | select | Yes, No | placeholder |
| `any-contruction-yes-no` → `any-construction` | Any Construction on Plot | select | Yes, No | placeholder |
| `pre-rent-leased` | Pre-Rented / Leased | select | Vacant, Pre-Rented, Leased | placeholder |

### 3c. Multi-select lists
| Field | Corrected Label | input_type | Proposed options | Current garbage |
|---|---|---|---|---|
| `amenties` → `amenities` | Amenities | multiselect | Gym, Club House, Power Backup, Lift, Intercom, Guest House, Park, Community Hall, Mini Theater, Swimming Pool, Security, Gas Pipeline | `Amenties`; `GYM,CLUB,POWER,LIFTS,INTERCOME,…` |
| `additional-rooms` | Additional Rooms | multiselect | Pooja Room, Study, Servant Room, Store Room | `Pooja,study,servent,store` |
| `parking` | Parking | multiselect | Reserved, Common, Open, Covered | `reserved/Common, open /Covered, 1,2..` |

### 3d. Commercial / Office fields
| Field | Corrected Label | input_type | Proposed | Current garbage |
|---|---|---|---|---|
| `reception` | Reception | select | Yes, No | placeholder |
| `confernce-meeting-cabin` → `conference-cabins` | Conference / Meeting Cabins | number | integer | `Confernce/Meeting/Cabin` |
| `mini-max-seats` → `seats` | Seating Capacity | number | integer | `Max/Mini Steats` |
| `lifts` | Lifts | number | integer | placeholder |
| `pantry-cantine` → `pantry-canteen` | Pantry / Canteen | select | Yes, No | `Pantry/Cantine` |

### 3e. Hospitality / Institution / Petrol fields
| Field | Corrected Label | input_type | Proposed | Current garbage |
|---|---|---|---|---|
| `quailty-rating` → `star-rating` | Star Rating | select | 1, 2, 3, 4, 5 Star | `Quailty Rating` |
| `play-ground` | Playground | select | Yes, No | placeholder |
| `labs` | Labs | number | integer | placeholder |
| `woards` → `wards` | Wards | number | integer | `Words` |
| `operationth` → `operation-theatres` | Operation Theatres | number | integer | `Operation theatre` |
| `revenus` → `annual-revenue` | Annual Revenue | text | free text (₹) | `Revenus` |
| `nozzels` → `nozzles` | Nozzles | number | integer | `How Many Nozzels` |
| `brands` | Fuel Brands | multiselect | IOCL, BPCL, HPCL, Reliance, Nayara, Shell, Other | `Brands` |
| `age-of-construction` | Age of Construction | (see 2.3 — likely DROP, dup of construction step) | New, <1yr, 1-3, 3-5, 5-10, 10+ yrs | `Age Of Construction` |

> **Label spelling fixes** (regardless of options): `Staus`→Status, `Amenties`→Amenities, `Road With`→Road Width, `Confernce`→Conference, `Quailty`→Quality, `Contruction`→Construction, `Nozzels`→Nozzles, `Woards`→Wards, `Revenus`→Revenue, `Pantry/Cantine`→Pantry/Canteen, `Mini/Max Steats`→Seats.

---

## 4. Implementation approach (after the catalog is approved — EDIT mode)
1. **Re-seed/cleanup script** (`prisma/cleanup_field_catalog.ts`): for each of the ~35 fields, set the corrected `FieldDefinition.label`, `input_type`, and canonical `options_json`; rename keys where needed (create new key, repoint `NodeField.field_id`, retire old); then **null out `NodeField.options_override`** so every type inherits the clean canonical options (keep overrides only where a type genuinely differs). Idempotent; dry-run first.
2. **Frontend render** — confirm `InventoryModal` + `AddInventory` + website `ChatSchemaFields` already render `number`/`select`/`multiselect` by `input_type` (number→numeric input, multiselect→multi-chip). Add a `multiselect` render case if missing.
3. **Step order (2.1)** — reorder `workflow_definition.ts` so `address_block` precedes the type/config band for admin+web.
4. **Duplicate area / age (2.2, 2.3)** — apply the agreed field changes; ensure `commit()` maps Area Type / Plot Area / numeric area into `specs` without collision.
5. **Partner attribution (2.4)** — separate sub-change.
6. **Verify** — Playwright walk of admin add-inventory: every dropdown shows clean values (Bathrooms=number, Facing=8 dirs, etc.); save a dummy; assert `specs` keys are clean. Backend tsc + website build gates. Deploy backend (+ website if chat schema render changed). GlitchTip clean.

## 5. Blast radius / notes
- Mostly **DATA** changes (FieldDefinition + NodeField) — reversible, no schema migration. Existing inventories' `specs` keys (e.g. `staus`, `amenties`) stay as historically saved; only NEW saves use corrected keys. (Decide if we also backfill old specs keys — probably not needed.)
- Renaming field KEYS changes the `specs` key going forward (e.g. `amenties`→`amenities`); search/matching/AI that read specs keys must use the new keys (most don't yet — taxonomy specs aren't consumed until Phases 2–5).
- The taxonomy seed generator (`gen_taxonomy_json.py`) should later be updated so a re-run doesn't reintroduce the garbage — or we stop re-running it and treat the DB (via the 1c editor) as source of truth.
