---
name: reference_inventory_classification_mapping
description: How inventory classification maps to the new taxonomy — inventory.sub_category_id is a LEGACY id equal to a TYPE-node's legacy_sub_category_id (NOT a taxonomy node id, NOT a SUBCATEGORY). type_id is only ~26% populated. Critical for any matching/filter work.
metadata:
  type: reference
---

Realty Pandit inventory classification vs the new taxonomy (verified 2026-06-01, prod):

- **`inventory.sub_category_id` is a LEGACY master id, NOT a taxonomy_nodes.id.** Joining
  `inventory.sub_category_id → taxonomy_nodes.id` returns 0 rows. It is 100% populated on active inventory.
- **The legacy↔taxonomy bridge lives on TYPE nodes only:** `taxonomy_nodes.legacy_sub_category_id` is
  populated on all 57 TYPE nodes and **equals `inventory.sub_category_id`**. CATEGORY/SUBCATEGORY/GROUP
  nodes have NO legacy ids (0/12 subcats). So resolving a SUBCATEGORY node → legacy id returns null.
- **`inventory.type_id` is only ~26% populated** (98/375 active) — NEVER use it as a hard filter; you'll
  hide ~74% of listings. (matching_engine already warns: "inventory never sets it".)
- Multiple TYPE nodes can share one legacy id: e.g. Flat / Duplex Flat / Penthouse all →
  `67036368-a350-423d-a410-18f3c6742efd` (the "Flat/Apartment" legacy bucket). Independent Floor →
  `810703de...`, Builder Flat (Front) → `162fa699...`, (Back) → `82a4baa0...`.
- New-taxonomy structure: CATEGORY (Residential/Commercial) → SUBCATEGORY (Flat/Apartment, Builder Floor,
  Independent House/Villa, Land/Plot) → TYPE (Flat, Studio Apartment, Villa, …). A deal's demand node is a
  TYPE node (e.g. "Flat").

**How to filter inventory by "type" correctly:** take the user's selected TYPE node ids →
`resolveTypeFilter({ demand_taxonomy_node_id })` (utils/demand_taxonomy.ts:190) → collect+dedupe the
returned `sub_category_id`s → `where.sub_category_id IN (...)`. This is what the deal Match & Share
multi-select does (see [[reference_demand_canonical_sot]]). `resolveTypeFilter` maps ONE node → one legacy
id set; loop for arrays.

**Inventory location reality:** active inventory is mostly Ghaziabad (232), Meerut, Greater Noida, Noida,
Vaishali, Indirapuram. Brittle free-text locations (e.g. a typo'd "Kaushsmbi") text-match nothing → 0
results. Geo radius (Haversine, contact.preferred_lat/lng) is the robust path; deals without a map pin
need the location text cleared to match. The matched-inventory endpoint treats a PRESENT-but-empty
`location` query param as "no location filter" (absent = fall back to the deal's stored location).
