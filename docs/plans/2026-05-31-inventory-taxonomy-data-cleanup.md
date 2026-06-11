# Plan — Inventory taxonomy data cleanup (3 caveats)

**Date:** 2026-05-31
**Author:** Claude (for Puneet)
**Status:** PROPOSED — not executed (plan only)

## Context
Pre-flight audit before mirroring the canonical format to the demand/leads side found 3 data
integrity gaps on the **inventory taxonomy** (no functional bug, but they pollute matching +
are now customer-visible). Fix these first so the taxonomy is clean to mirror. **All three are
pure DATA changes — no code, no deploy** (taxonomy is served live via
`GET /public/taxonomy/...`; the renderer + matching read the DB directly). pg_dump first.

---

## Part 1 — Classify the 6 unclassified inventory (`taxonomy_node_id = NULL`)

All 6 have a `flat_property_type_id` → so each maps to a sensible **generic** taxonomy TYPE node
(mirrors the Phase-1b auto-map+flag approach: set `taxonomy_node_id` + `needs_taxonomy_review=true`
so the owner can refine the exact leaf in the Property Taxonomy review UI).

| display_id | type | → taxonomy node (generic) | node id |
|---|---|---|---|
| RP-GZB-RES-20426 | plot | Land/Plot | `b9582242-0289-49d6-b5d0-4c450a074e08` |
| RP-MEE-COM-20427 | office | Office Use Flat | `a07350e3-b3cf-4a21-a443-8b20f72ae97d` |
| RP-GZB-RES-20428 | villa | Villa | `da4edc73-86e6-4692-93c2-1a31a0b36608` |
| RP-GZB-RES-20430 | builder_flat | Builder Flat (Front) | `c6b5fe68-030a-4842-9f30-86248c58398a` |
| RP-MEE-RES-20429 | apartment | Flat | `7347f07d-1527-459a-8f58-db8e552fe9c0` |
| RP-GZB-RES-20431 (pending) | apartment | Flat | `7347f07d-1527-459a-8f58-db8e552fe9c0` |

**Mechanism:** map by `flat_property_type_id` → primary node, generically:
`a3677c3e→Flat`, `36e02e1c→Villa`, `03608ab7→Land/Plot`, `d86c26dd→Builder Flat (Front)`,
`7c34dd6d→Office Use Flat`. Script does `inventory.update({ taxonomy_node_id, needs_taxonomy_review:true })`.
These 6 already have `flat_property_type_id`+`sub_category_id`+`specs`, so display/matching already
work; this just attaches the canonical node so they aren't "any type" in taxonomy-distance matching.

---

## Part 2 — Backfill `legacy_sub_category_id` on 3 plot nodes

These 3 residential-plot TYPE nodes have `legacy_flat_property_type_id` set but
`legacy_sub_category_id = NULL` (so the **Edit-Classification** path can't derive sub-category for
them — create path is fine because it uses the `FLAT_TYPE_TO_SUB_CATEGORY` map). All map to flat
type `residential_land_plot` → sub-category **Land / Plot** `925e5302-82b9-438f-b154-54f639c1dd3f`:

- Colonizer Plot `2908cd6d…`
- Cooprative Society Plot `f1487a81…`
- Kachchi colony plot `763c324d…`

Script: `taxonomyNode.update({ legacy_sub_category_id: '925e5302-…' })` for the 3.

---

## Part 3 — Fix node-name typos / inconsistent casing (display-only)

These TYPE node `name`s have typos or inconsistent casing and are **now customer-visible** (the
inventory card reads `taxonomy_node.name`, and the Add/Edit dropdowns list them). Rename `name`
only — **keep `slug` unchanged** (slug is the stable key used in URLs/back-compat; nothing keys
display off `name` except the card text and the `getAddressRules` plot/land regex, which these
edits don't disturb since they keep the words Plot/Land/etc).

| Current name | → Proposed name |
|---|---|
| Banglow | Bungalow |
| Café/Restaurent | Café / Restaurant |
| Co working Office | Co-working Office |
| Collage | College |
| Commercial Complex office | Commercial Complex Office |
| Cooprative Society Plot | Co-operative Society Plot |
| Duplex flat | Duplex Flat |
| Kachchi colony plot | Kachchi Colony Plot |
| Penthouse(Duplex) | Penthouse (Duplex) |
| Petrol Punmp | Petrol Pump |
| Shoping Mall Shop | Shopping Mall Shop |
| cold storage | Cold Storage |
| commercial use parking | Commercial Use Parking |
| hyper market | Hypermarket |
| open Market kiosk | Open Market Kiosk |
| shopping Mall Kiosk | Shopping Mall Kiosk |
| studio Apartment | Studio Apartment |
| ware House | Warehouse |

Optional (slash spacing, not typos — confirm if you want them normalized too):
`Industrial Land/Plot → Industrial Land / Plot`, `Agriculture Land/Orchard → Agriculture Land / Orchard`.

Names left as-is (correct): Villa, Hospital, Nursing Home, School, University, Hotel, Resort,
Banquet, Guest House, Factory, Godown, Kothi (legit Hindi term), Authority Plot, Project Land,
Commercial/Industrial Land, Open Market Shop/Showroom, IT Park Office Space, Service Apartment,
Independent Floor, Builder Flat (Front/Back), EV Charging Station, CNG pump→**CNG Pump** (add).

Script: an explicit `{ slug: newName }` map → `taxonomyNode.updateMany({ where:{slug}, data:{name} })`,
idempotent, logs each rename. DRY-RUN prints the before/after for your review first.

---

## Execution order & safety
1. `pg_dump -t taxonomy_nodes -t inventory` → `/root/backups/db-pre-taxcleanup-<ts>.sql.gz`.
2. Part 3 rename (DRY-RUN → review → apply). 3. Part 2 (3 nodes). 4. Part 1 (6 records).
   All via the prod Node/Prisma pattern (`require("./dist/db")`). No `pm2 restart`, no build — data only.

## Verification
- **Part 1:** `inventory.count({ where:{ taxonomy_node_id:null } })` → **0**.
- **Part 2:** the 3 plot nodes now have `legacy_sub_category_id = 925e5302…`; open one in Edit →
  Classification and confirm sub-category resolves.
- **Part 3:** `GET /public/taxonomy/tree` shows corrected names; hard-refresh admin → Add-Inventory
  type dropdown + an affected inventory card (e.g. a "Petrol Pump") shows the fixed spelling.
  Playwright screenshot of the cleaned dropdown/card.

## Open review items (need your confirmation before apply)
1. **Rename spellings** — confirm the Part 3 table (esp. Bungalow, Hypermarket, Warehouse, Café /
   Restaurant, Co-operative). Adjust any you'd word differently.
2. **Orphan node choices (Part 1)** — the 6 get a *generic* node (Flat/Villa/Land-Plot/etc.) + a
   review flag. OK, or do you want to hand-pick exact leaves for any?
3. Optional slash-normalization (Industrial Land / Plot, Agriculture Land / Orchard) — include or skip?

## Out of scope (note)
`needs_taxonomy_review = 177` is a soft review flag (auto-tagged legacy records that display fine),
cleared by the owner via the existing Property Taxonomy → Needs Review UI — not part of this cleanup.
