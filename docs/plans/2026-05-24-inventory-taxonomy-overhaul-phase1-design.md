# Design — Inventory Taxonomy Overhaul, Phase 1 (Canonical tree + dynamic Add-Inventory)

> Brainstorming output (design/spec). Phase 1 of a phased overhaul. No code yet.

## Context / why
Realty Pandit currently runs **three overlapping classification systems**, which is why classification "doesn't go in place" across upload/search/matching/sharing/AI:
1. **3-tier hierarchy** `PropertyCategory → PropertySubCategory → PropertyType` — what **matching** keys on (`sub_category_id` = only hard filter; `type_id` = scoring bonus only). Served by `routes/classification.ts` (`/public/classification-tree`).
2. **`FlatPropertyType`** (flat 38-item "v2") — what the **add-inventory workflow** actually uses (`flat_property_type_id` + 3 boolean flags `bhk_required/floor_required/plot_area_required`). Drives `AddInventory.tsx` via the server-driven workflow engine (`workflow_definition.ts`/`workflow_engine.ts`).
3. **Vestigial** `PropertyConfiguration / UsageType / InvestmentType` — stored + served by API, used by nothing.

Plus: attributes live in **ad-hoc `specs` JSON** (no per-type schema); enrichment fields (area/facing/amenities) are **hardcoded in the frontend** (`EnrichmentPanel.tsx`); the **"BHK" label is hardcoded** in sharing/matching/forms regardless of category (`property_sharing.ts`, `MatchShareTab.tsx`, `RequirementsTab.tsx`, `BookVisitModal.tsx`); and the **AI agents ignore the taxonomy** (hardcode `flat/house/plot/office/shop` + regex BHK in `sales_agent.ts`/`matching_agent.ts`).

`Chat/newtree.xlsx` (2 categories → subcategories → groups → **57 types**, each with a conditional per-type attribute set + allowed values) is the owner's source-of-truth taxonomy. This overhaul makes it the **single** canonical, DB-driven taxonomy + per-type field schema that every surface reads.

## Decisions (Puneet, 2026-05-24)
1. **DB-driven + admin-editable** taxonomy and per-type field rules (owner can add categories / rename fields / change attachments without a developer).
2. **Single self-referential `TaxonomyNode` tree** (variable depth: Category → Subcategory → optional Group → Type) — replaces the 3-tier hierarchy AND `FlatPropertyType`; retires the 3 vestigial tables.
3. **Two separate attribute fields — `BHK` and `Rooms`** (not one labeled field). BHK attaches to Residential types; Rooms attaches to Commercial/Institution/Hospitality types; neither for Land/Plot. (This removes the residential-only BHK from commercial entirely — the bug's root cause.)
4. **Auto-map + flag** migration for the ~350 existing listings.
5. **Phased**, starting at add-inventory. **This spec = Phase 1 only.**

## Phase 1 scope
Canonical DB taxonomy + per-type field schema + admin editor + auto-map migration + a **dynamic Add-Inventory form** driven by the schema. Downstream consumers (search, matching, sharing, AI) are **later phases**; Phase 1 only makes the data **correct at the source** and stays backward-compatible so nothing breaks meanwhile.

## Data model (new, DB-editable)
- **`TaxonomyNode`** (self-referential): `id, parent_id (null=root/category), name, slug, node_kind (CATEGORY|SUBCATEGORY|GROUP|TYPE), display_order, is_active, labels_json`. The whole tree (incl. the optional "group" level like Retail→shop→Open-Market-Shop) is rows here.
- **`FieldDefinition`** (attribute catalog): `id, key (e.g. bhk, rooms, toilets, balconies, area, plot_area, furnishing, facing, floors, far, side_opens, reception, seats, nozzles, brands, amenities…), label, input_type (number|select|multiselect|text|boolean), options_json (allowed values), unit`. **`bhk` and `rooms` are two distinct entries.**
- **`NodeField`** (which fields apply to a type): `taxonomy_node_id, field_id, display_order, required, label_override?, options_override?`. This is the per-type dynamic schema (from the spreadsheet columns).
- **`Inventory` / `Contact`**: add `taxonomy_node_id` (the chosen **leaf type**); attribute values continue in `specs` JSON keyed by `FieldDefinition.key`. Category/Subcategory are derived from the node's ancestry.
- **Backward-compat during transition:** Phase 1 keeps the legacy `category_id/sub_category_id/type_id` (and `category/type` strings) **populated** — derived from the node's ancestry on write — so existing matching/search/sharing keep working until their own phases switch to reading the node. Legacy columns are retired only after the last consumer phase.

## Admin editor (new)
Admin → Property Taxonomy: tree CRUD (add/rename/reorder/activate nodes at any level); per-type field management (attach/detach `FieldDefinition`s, order, required, label/option overrides). Backed by new `routes/taxonomy.ts` (admin, `manage_*` permission) + read endpoints that supersede `routes/classification.ts`.

## Migration (auto-map + flag)
One-time importer: parse `newtree.xlsx` → seed `TaxonomyNode` + `FieldDefinition` + `NodeField`. Backfill existing inventory/contacts: map old `flat_property_type` / `category`+`type` / `sub_category_id` → nearest new leaf node (confident → set; ambiguous → set best-guess parent + `needs_taxonomy_review=true` flag surfaced in a team "Needs review" list). Keep legacy columns populated from the mapped node.

## Dynamic Add-Inventory form
The add-inventory workflow (admin `AddInventory.tsx` + WhatsApp adapter, both on the shared workflow engine) reads the **selected node's `NodeField` schema** and renders only those fields with their labels/options/required:
- Residential → **BHK**, Toilets, Balconies, Area, Furnishing, Floors, Amenities…
- Land/Plot → **no BHK/Rooms**; Plot Area, FAR, Side-Opens, Boundary Wall, Dimension…
- Office → **Rooms**, Reception, Pantry, Seats, Conference, Lifts…
- Hotel/Institution → **Rooms** (+ Beds/OPDs/Wards where defined)
- Petrol/CNG/EV → Revenue, Brands, Nozzles…
Replaces the hardcoded `EnrichmentPanel` fields + the 3 boolean flags. Values saved to `specs` keyed by field; `taxonomy_node_id` set to the leaf.

## Out of scope (later phases — for context)
- **P2** demand capture + search filters read the tree. **P3** matching engine uses the node + per-type attrs (residential→bhk, commercial→rooms; stop the BHK mislabel). **P4** sharing card labels by type. **P5** AI agents mapped to the canonical tree. Each = own spec → plan → ship. Legacy columns retired after P5.

## Verification (Phase 1)
- Seed/import: assert node counts (57 types, the category/sub/group structure) + field attachments match the sheet; spot-check a residential type has `bhk` and a commercial type has `rooms` (not bhk).
- Migration: existing listings get a `taxonomy_node_id`; low-confidence flagged; legacy columns still populated (matching/search unaffected — regression check).
- Form: pick a Flat → BHK shows; pick a Hotel → Rooms shows (no BHK); pick a Plot → neither, FAR/Side-Opens show. Save → `specs` keyed correctly + leaf node set. (Playwright once Chrome is closed; server E2E otherwise.)
- Admin editor: add a field to a type → it appears on the form without a deploy.

## Critical files (current state to build against)
- Data/seed: `backend/prisma/schema.prisma`, `prisma/seed*.ts` (current tree), `routes/classification.ts` (current tree API).
- Form: `frontend/src/components/AddInventory.tsx`, `backend/src/workflows/workflow_definition.ts` + `workflow_engine.ts`, `EnrichmentPanel.tsx`.
- Write path: `backend/src/routes/inventory.ts`.
- (Later-phase consumers, do-not-touch in P1): `services/matching_engine.ts`, `services/property_sharing.ts`, `agents/sales_agent.ts`/`matching_agent.ts`, `MatchShareTab.tsx`/`RequirementsTab.tsx`.
