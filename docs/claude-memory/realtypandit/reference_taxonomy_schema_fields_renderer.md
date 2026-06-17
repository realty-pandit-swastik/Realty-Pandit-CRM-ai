---
name: Add-inventory "Configuration" step = DB-driven schema fields (SchemaFields renderer); seed JSON is STALE
description: How the per-type Configuration fields (parking, road, BHK, etc.) are defined + rendered, why the seed file lies, and the parking_list/road-facing change.
metadata:
  type: reference
---

The admin Add/Edit-Inventory **"Configuration" / "Property details" step** (`input_type: 'schema_fields'`, step 6) renders the chosen taxonomy node's per-type fields. It's **100% DB-driven** — NOT hardcoded in the frontend, NOT from the seed file.

**Data model (live DB is source of truth):**
- `field_definitions` (FieldDefinition): `key`, `label`, `input_type` (`number|select|multiselect|text|boolean|parking_list`), `options_json`, `unit`, `is_active`.
- `node_fields` (NodeField): attaches a field to a `TaxonomyNode` with `display_order`, `required`, `label_override`, `options_override`. Unique `[taxonomy_node_id, field_id]` (Prisma input `taxonomy_node_id_field_id`).
- Engine: **`src/workflows/workflow_engine.ts`** (the ~1,400-line engine — NOT the ~320-line `src/services/workflow_engine.ts`; grep both, take the long one). Landmarks (line numbers drift — grep the snippet):
  - `getStepMetadata` → grep `if (step.input_type === 'schema_fields')`: maps each NodeField → `{key: field.key, label: label_override||field.label, input_type, options: options_override??field.options_json, unit}`.
  - commit specs-build → grep `Build specs JSON`: writes each `answers.schema_values` entry to `specs[key]` (schema_values wins over legacy furnishing/facing/age folds).
  - Served live at `GET /public/taxonomy/nodes/:id/fields` → grep `nodes/:id/fields` in `routes/taxonomy.ts`; admins edit via `PATCH /api/taxonomy/nodes/:id/fields` (replace-set) — **a field-definition/node-field change shows up immediately, no deploy.**

**The renderer — `SchemaFields` (DUPLICATED in `AddInventory.tsx` AND `InventoryModal.tsx`, ~same code):** widget chosen by input_type →
- `multiselect` + options → tap-many chips
- has options & NOT multiselect (`select`) → dropdown
- else → `<input>` (number if input_type==='number', else text)
- `parking_list` → custom `ParkingListField` component (shared, `components/ParkingListField.tsx`)
A new custom `input_type` must get a branch in BOTH SchemaFields copies (see [[reference_add_inventory_two_renderers]]).

**TRAP: `prisma/data/taxonomy.seed.json` is STALE** — it diverged badly from the live DB (the DB was edited via the Phase 1c taxonomy editor). Live keys ≠ seed keys: live has `road-width`/`amenities`/`ownership-tenure`; the seed had `road-with`/`amenties`/`free-lease-hold` with junk placeholder options (`"Covered 1"`, `"2.."`). **Always query `field_definitions`/`node_fields` for the truth; never reason from the seed.**

**2026-05-27 change (shipped, data + 1 widget, no backend change):** per Puneet — parking restructured + road width replaced.
- `parking`: `multiselect` → custom **`parking_list`** (repeatable entries, each `{allocation: Reserved|Common, type: Covered|Open}` as tap-one chips + "+ Add parking"; both optional; stored `specs.parking = [{allocation,type},…]`, count = #entries). Kept on its 40 nodes.
- New `road-facing` (`select` Yes/No) **replaced** numeric `road-width` on all 40 nodes (user wanted "is it road-aligned?" Yes/No everywhere, not a width). `road-width` detached + `is_active=false`.
- 2 existing inventory `specs.parking` values migrated to the new array shape (only 2 of 369 had any parking data). Backup tables `field_definitions_bak_*`/`node_fields_bak_*`. Visual-verified via Playwright.

**2026-05-29 — commercial field-gaps fix.** Phase-1a seed shipped `area-type` / `status` / `age-of-construction` as FieldDefinitions but the backfill attached them to **0 nodes** (and `plot-area` only to land leaves) — so every commercial leaf was missing 3-4 spec-required dropdowns in the `schema_fields` step. Pure-data fix inserted **123 `node_fields` rows** across 35 commercial leaves (e.g. Open Market Shop 13→16, Hotel 10→14, Petrol Punmp 6→10, Commercial Land 8→9). Snapshot retained: `node_fields_bak_20260529202512` (538 rows). The standalone `construction_status` workflow step (Stage 10 in `workflow_definition.ts`) is now `skip_when _source==='admin'` to avoid a double-prompt — admin captures Status + Age inside the schema_fields per-type panel; WhatsApp/web paths still hit the standalone radio because they don't render `schema_fields`. Bare-land leaves (Commercial Land / Commercial Project Land / Agriculture Land/Orchard) intentionally got `area-type` only — spec omits Status/Age for them. Plan: `docs/plans/2026-05-29-commercial-taxonomy-field-gaps.md`.
