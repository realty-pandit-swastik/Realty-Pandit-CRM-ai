---
name: reference_taxonomy_filters
description: Inventory/Leads/Deals FILTERS are taxonomy-driven (2026-06-06) — /public/taxonomy/tree + FilterTaxonomySection + taxonomy_node_ids → expandTaxonomyNodeIds; legacy classification-tree kept ONLY for the edit forms
metadata:
  type: reference
---

As of **2026-06-06**, the property-type FILTERS on Inventory, Leads, and Deal Pipeline (desktop + mobile) run on the new **TaxonomyNode tree**, not the legacy classification system.

**Wiring:**
- **Frontend:** one shared `FilterTaxonomySection` (`components/filters/FilterSheetShared.tsx`), fed by `GET /public/taxonomy/tree` (shape `{tree:[{id,name,children?}]}`). Drill-down by `node_kind` + multi-select leaf TYPE nodes + BHK chips (residential). Emits `{ nodeIds: string[], bhk: number[] }`. Used by `InventoryList`, `mobile/MobileInventoryList`, `ExternalLeads`, `DealPipeline`.
- **Params:** pages send `taxonomy_node_ids` (csv) + `bhk` (csv).
- **Backend (`utils/taxonomy_filter.ts`):** `expandTaxonomyNodeIds(ids)` → selected node(s) **+ all descendants** (cached walk of the ~76-node tree, so picking a CATEGORY matches its leaf TYPEs); `bhkSpecsFilter(vals)` → OR over the canonical `specs.bhk → rooms → bedrooms` chain (number+string). Applied: Inventory `where.taxonomy_node_id IN (...)`; Leads (`GET /api/leads/recent-external`) `where.demand_taxonomy_node_id IN (...)`; Deals (`deal_service.listDeals`) `{ demand_contact: { demand_taxonomy_node_id: { in } } }` + demand `demand_schema_values.bhk`.
- **Completeness (verified live):** `inventory.taxonomy_node_id` = **100%** (399/399), `needs_review=0` → filter directly on it. `contact.demand_taxonomy_node_id` = **~68%** (1215/1795) → leads/deals filter only the typed subset (correct — untyped leads have no type to match). TaxonomyNode `node_kind` = CATEGORY→SUBCATEGORY→GROUP→TYPE, self-referential `parent_id`.

**STILL legacy — do NOT assume removed:** `GET /public/classification-tree` + `getCategoryTree()` are kept because the **EDIT forms** (`InventoryList` edit, `mobile/MobileInventoryEdit`) still use the old PropertyCategory/SubCategory/Type tree. Only the filter-only `FilterCategorySection` + `CategorySelection` (dead) were removed.

**Verified live:** Inventory 399→332 (Residential)/40 (a TYPE node); Leads 1797→1200; Deals 653→394→185 (+2BHK); mobile drill-down works. See [[reference_inventory_classification_mapping]] (inventory.sub_category_id is a legacy id), [[project_inventory_taxonomy_overhaul]].

**Route-shadow trap (fixed 2026-06-06):** `GET /api/inventory/filter-counts` 404'd ("Inventory not found") because the static route was registered AFTER `router.get('/:id')` — Express matched "filter-counts" as an `:id`. Fix: fall through (`if (id==='filter-counts') return next()`) in the `/:id` handler. General rule: register static sibling GET routes before the `/:id` wildcard, or fall through.

**Floor filter (added 2026-06-10):** a new **`FilterFloorSection`** (shared, in `FilterSheetShared.tsx`) lets you filter Inventory by the unit's floor — chips **Ground(`0`)/1st/2nd/3rd/4th/5+** → param **`floors`** (csv of `0`–`4` + `5plus`). Backend (`routes/inventory.ts` GET) maps to `where.AND.push({ OR: [{floor_number:{in:[…]}}, {floor_number:{gte:5}}] })`. Filters the **`floor_number` COLUMN** (the unit's floor — NOT `total_floors`/`specs.floors`, which is building height), ~59% populated. Wired in both `InventoryList` + `MobileInventoryList` (state `filterFloors`, fetch deps, params, active-count, Clear All, render). Live-verified: floors=1→86, =2→38, =0→4, =5plus→53, 1+2→124. (A few junk `floor_number` values like 201/207/201308 land in the 5+ bucket — owner-corrected data per [[feedback_data_corrections_owned_by_lead_owner]].)
