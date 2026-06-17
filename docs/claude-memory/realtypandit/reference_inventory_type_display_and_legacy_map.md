---
name: Inventory type display + taxonomy legacy-map backfill (the "shows as flat" fix, 2026-05-30)
description: Why commercial inventory showed as "flat", the 37-node legacy-map backfill, the 3 new flat types, and that the card title now reads taxonomy_node.name first.
metadata:
  type: reference
---

## The bug (fixed 2026-05-30)
Commercial listings displayed as **"flat"** on the inventory card. Two causes:
1. **Data:** 37 of 57 taxonomy `TYPE` nodes had `legacy_flat_property_type_id = NULL`. Both
   create (`workflows/workflow_engine.ts`) and edit (`routes/inventory.ts`) backfill the legacy
   classification FROM that field — when null, `flat_property_type_id`/`sub_category_id` stayed
   NULL and legacy `type` kept its **hardcoded `'flat'` default** (`workflow_engine.ts` ~line 543).
2. **Display:** the card title chain read `flat_property_type?.name || property_type_link?.name ||
   type` and **never `taxonomy_node.name`**; the inventory list/detail API didn't even return it.

## The fix
- **Backfilled all 37 nodes** `legacy_flat_property_type_id` + `legacy_sub_category_id` (parent→flat-type map).
- **Created 3 new FlatPropertyTypes** (⚠ extends the locked tree; Puneet-approved 2026-05-30):
  `education` (→ sub-cat `school_college`), `healthcare` (→ `healthcare`), `petrol_pump`
  (→ **new** `master_sub_categories.petrol_pump` `713e3337-2809-441b-899b-e125b2f2795a`).
  Added all 3 to `FLAT_TYPE_TO_SUB_CATEGORY` in `workflow_engine.ts`.
- **API:** added `taxonomy_node {id,name,slug}` to the inventory list + detail includes (`routes/inventory.ts`).
- **Card title now prefers `item.taxonomy_node?.name`** — `InventoryList.tsx` (title + avatar) and
  `mobile/MobileInventoryList.tsx` (card + avatar + detail-sheet). Use this chain going forward:
  `taxonomy_node?.name || flat_property_type?.name || property_type_link?.name || type`.
- **Safety net:** `workflow_engine.ts` else-branch now sets `legacyType = node.slug` when a node has
  no flat-type map, so an unmapped node can never persist `'flat'` again.

Result: `RP-GZB-COM-20444` shows "Shopping Mall Showroom", matching restored (`sub_category_id`
populated). pg_dump `db-pre-flatfix-20260530143642.sql.gz`. Screenshot-verified.
Plan: `docs/plans/2026-05-30-inventory-shows-as-flat-fix.md`. Related: [[reference_matching_tree_alignment]],
[[feedback_inventory_no_classification_relation]].

## 2026-05-31 taxonomy data cleanup (pure data, no code)
- **21 TYPE-node `name`s re-spelled** (slugs UNCHANGED, nothing added/removed): Petrol Punmp→Petrol
  Pump, Banglow→Bungalow, Collage→College, Shoping Mall Shop→Shopping Mall Shop, hyper market→
  Hypermarket, ware House→Warehouse, Cooprative→Cooperative, cold storage→Cold Storage, studio/
  shopping/open-Market casing, Penthouse(Duplex)→Penthouse (Duplex), Industrial Land/Plot &
  Agriculture→Agricultural Land / Orchard, etc. **Node names are customer-visible** (card reads
  `taxonomy_node.name`) — so spelling matters. (Note: live `taxonomy_nodes` names ≠ the locked
  Structure.txt tree; renames fixed spelling only, never structure.)
- **6 unclassified inventory** (`taxonomy_node_id` NULL) → classified to a generic node via
  `flat_property_type_id` + `needs_taxonomy_review=true`. Now 0 unclassified.
- **3 residential-plot nodes** (Colonizer/Cooperative-Society/Kachchi) given
  `legacy_sub_category_id`=Land/Plot `925e5302…` (fixes their Edit-Classification path). Now 0
  TYPE nodes without sub-cat.
- Backup `db-pre-taxcleanup-20260531124622.sql.gz`. Plan: `docs/plans/2026-05-31-inventory-taxonomy-data-cleanup.md`.
