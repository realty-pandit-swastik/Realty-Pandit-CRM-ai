---
name: Add-Inventory address Society/Building rule + plot-area unit (2026-05-31)
description: How the Address-step "Society/Apartment/Building" label+required is decided per type, and the plot-area-unit taxonomy field.
metadata:
  type: reference
---

## Address "Society / Apartment / Building" field (label + required)
Driven by the shared `frontend/components/AddressFields.tsx` (used by Add wizard
`AddInventory.tsx`, edit `InventoryModal.tsx` / `InventoryList.tsx` / `mobile/MobileInventoryEdit.tsx`).

- **Label** comes from `inferAddressLayout()` → layout: commercial → **"Building Name"**, house →
  "Project / Building", plot → "Society / Colony", else → "Society / Apartment".
  `inferAddressLayout` already keyed on `mainCategory` — the bug was the **Add flow never passed it**.
- **Required** = `isSocietyRequired({ layout, mainCategory, slug })` (exported helper in AddressFields).
  Mandatory **only** for named-society residential — slug matches `/apartment|gated|studio|serviced/`
  and not `/builder/` and `mainCategory !== 'commercial'`. **Optional** for builder flat/floor,
  independent house/villa, all plots/land, all commercial, agricultural.
- **Backend**: `workflow_engine.ts getAddressRules()` now returns `main_category` on **every** return
  branch (it's in the `address_config` step metadata). All 4 `<AddressFields>` call sites pass
  `mainCategory` + `slug`. So Add AND Edit behave identically — no second code path.
- Verified (Playwright): Apartment → "Society / Apartment *" (required); Commercial showroom →
  "Building Name" (optional).

## Plot Area unit
`plot-area` is a bare `number` taxonomy field with no unit. Added FieldDefinition **`plot-area-unit`**
(`select`, options `["Sq Ft","Sq Yard (Gaj)","Sq Meter","Acre","Hectare","Bigha"]`) and attached it
(via `node_fields`) to **all 34 nodes that have `plot-area`**, display_order right after it. Pure
taxonomy DATA — the `SchemaFields` select renderer shows it automatically; value → `specs['plot-area-unit']`.
No code. Served live via `GET /public/taxonomy/nodes/:id/fields`. (Follow-up: search/matching should
read it + normalize areas.) See [[reference_taxonomy_schema_fields_renderer]].

Plan: `~/.claude/plans/iridescent-jumping-harp.md`. pg_dump `db-pre-plotunit-20260531094055.sql.gz`.
