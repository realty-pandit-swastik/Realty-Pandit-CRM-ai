# Design — Inventory Taxonomy Phase 1d (Dynamic Add-Inventory Form, v1 admin)

> Brainstorming output. Builds on 1a (taxonomy + read API) / 1b (backfill) / 1c (editor). **Highest blast-radius phase** — touches the shared workflow engine. No code yet.

## Context / why
The add-inventory flow is a **single server-driven workflow engine** (`workflow_definition.ts` + `workflow_engine.ts` + frontend `useWorkflow` + `AddInventory.tsx`) shared by **admin + website + WhatsApp + voice**. Today the type is `flat_property_type_id` (38 flat types) + 3 boolean flags, and enrichment fields are hardcoded (`EnrichmentPanel`). The goal of 1d: when adding inventory, pick the property type from the **new 57-type taxonomy tree** and have the form render **only that type's fields** (BHK residential, Rooms commercial/institution/hospitality, FAR/Side-Opens/Boundary-Wall for plots, Reception/Seats for offices, Nozzles/Brands for petrol) from the per-type `NodeField` schema (shipped 1a), saving into `inventory.specs` + setting `inventory.taxonomy_node_id`.

## Decisions (Puneet, 2026-05-24)
1. **Replace the type picker with the new 57-type tree** (not keep-old-and-map).
2. **Integration = schema-driven steps in the workflow engine** (mirrors the existing `address_block` metadata pattern), so it works through the same engine the other surfaces use later.
3. **Rollout = admin-first**: platform-gate the new steps to `source==='admin'`; WhatsApp/website/voice stay on the **current** flow untouched in v1. Extend later (v2).
4. **`commit()` keeps the legacy classification populated** (derive from the node) so matching/search/sharing keep working until Phases 2–5 — non-negotiable backward-compat.

## Architecture
**Two new workflow steps**, platform-gated to admin via `show_when: [{ field:'_source', operator:'equals', value:'admin' }]`; the existing `main_category`/`flat_property_type_id`/`configuration_id` steps get `skip_when: _source==='admin'` so admin uses the new pair and other surfaces are unchanged:
- **`taxonomy` step** (`input_type:'taxonomy'`, field `taxonomy_node_id`): a cascading picker Category → Sub → [Group] → Type sourced from `/public/taxonomy/tree`; the answer is the chosen **leaf TYPE node id**. New render case in `AddInventory.tsx` (nested dropdowns from the tree).
- **`schema_fields` step** (`input_type:'schema_fields'`, field `schema_values`): engine `getStepMetadata` fetches `NodeField` for the chosen `taxonomy_node_id` (same place `address_config` is built) and returns the field list; new render case renders each field by `input_type` (number/select/text) with label/options/required; answers collected into `answers.schema_values = { [fieldKey]: value }`.

**`commit()` changes** (`workflow_engine.ts`): when `taxonomy_node_id` is present →
- set `inventory.taxonomy_node_id`;
- merge `answers.schema_values` into `specs` (keyed by field key; e.g. `bhk`/`rooms`/`area`/`facing`…);
- **derive legacy classification** from the node so existing consumers keep working: `category` from the root ancestor (Residential/Commercial → residential/commercial), and `sub_category_id`/`type_id`/`flat_property_type_id` via a **node→legacy mapping**. To supply that mapping, add nullable `legacy_sub_category_id` / `legacy_type_id` / `legacy_flat_property_type_id` columns to `TaxonomyNode`, populated by a one-time migration that inverts 1b's mapping (flat_property_type→node). If a node has no legacy mapping, set `category` + leave sub_category_id null + `needs_taxonomy_review=true` (matching degrades gracefully for that one until P3).

**Frontend** (`AddInventory.tsx` + a small `TaxonomyPicker`/`SchemaFields` render): two new `input_type` cases; everything else (address, price, media, confirm) unchanged.

## Out of scope (v1)
- WhatsApp/website/voice surfaces (v2 — extend the new steps to them after admin is proven).
- The hardcoded `EnrichmentPanel` (leave as-is; schema fields cover the per-type attributes in the main flow).
- Node CRUD (1c v1.5); consumers reading the node (P2–P5).

## Risk & verification (this is the high-blast-radius phase)
- **Build safety (post-outage rule):** verify `cd frontend && npm run build` (NOT just `tsc --noEmit`) and confirm `dist/index.html` + `curl admin → 200` after deploy (`feedback_frontend_build_verify`).
- **Regression — other surfaces:** confirm a WhatsApp/website property-onboarding run still uses the OLD steps and is unaffected (the new steps are `_source==='admin'`-gated). This is the top risk.
- **Admin E2E:** open admin add-inventory → pick a type from the new tree (e.g. Residential▸Builder Floor▸Builder Flat (Front)) → the dynamic fields show (BHK present, no Rooms) → save → assert `inventory.taxonomy_node_id` set, `specs` keyed by field, and legacy `category`/`sub_category_id` populated (so it still matches).
- **Plot/commercial check:** pick a Plot → no BHK/Rooms, FAR/Side-Opens show; pick a Hotel → Rooms (no BHK).
- GlitchTip clean.

## Files (anticipated)
- `backend/src/workflows/workflow_definition.ts` (new steps + gate existing ones by `_source`), `workflow_engine.ts` (schema_fields metadata + commit node→specs + legacy derivation), `routes/workflow.ts` (serve node fields for the step if not already).
- `backend/prisma/schema.prisma` + migration (TaxonomyNode legacy_* columns) + a backfill to populate them (invert 1b mapping).
- `frontend/src/components/AddInventory.tsx` (+ small `TaxonomyPicker`/`SchemaFields` render), `frontend/src/hooks/useWorkflow.ts` (if needed for the new step types).
- `frontend/index.html` SW bump.

## Note on sequencing
This phase modifies the shared workflow engine + a schema migration; it is the riskiest of the overhaul. Recommend executing it deliberately (not rushed), with the regression check on WhatsApp/web as a hard gate before/after deploy.
