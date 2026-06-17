---
name: inventory.specs is the SoT — 5 scalar columns are DROPPED from the schema
description: Phase 4 of specs unification (2026-05-28) removed furnishing/facing/property_age/total_floors/features from inventory. They live in inventory.specs JSON now keyed by canonical taxonomy FieldDefinition.key. Don't reference the dropped columns; reads via specs.*.
metadata:
  type: reference
---

After the 2026-05-28 specs unification (PROJECT_STATUS phase row), `inventory.specs`
(JSONB) is the **single source of truth** for every type-specific field. These 5
scalar columns **no longer exist in the Prisma schema or the Postgres table**:

| Dropped column | Replacement read |
|---|---|
| `inventory.furnishing` | `specs.furnishing` |
| `inventory.facing` | `specs.facing` |
| `inventory.property_age` | `specs['age-of-construction']` |
| `inventory.total_floors` | `specs.floors` (yes, key is `floors` not `total_floors`) |
| `inventory.features` `{gym:true,…}` | `specs.amenities` `["Gym",…]` (array of humanized labels, NOT slug→bool object) |

**Kept as columns** (different concepts, NOT type-specific):
- `inventory.floor_number` — universal "this property is on floor N"
- `inventory.ownership_type` — business model enum (`OWNER`/`EXTERNAL_AGENT`/`AGENT_OWNER`), distinct from taxonomy `ownership-tenure` (`Freehold`/`Leasehold`)
- `inventory.description` — long-form free text
- `inventory.apartment_name`, `flat_no`, `plot_no`, locality, city, district, state, pincode, full_address, latitude, longitude — address layer

## ⚠️ OPEN BUG — dropped cols survive as WHERE filters (GlitchTip backend #70)

The Phase-3 sweep removed `?? column` **read fallbacks** but missed **query filters** that still
reference dropped columns. A `prisma.inventory.findMany({ where: { furnishing: … } })` 500s with
`PrismaClientValidationError` (the static `tsc` check passes because `where` is typed loosely). Found
2026-06-03 as the cause of GlitchTip backend issue **#70** (10×/5h, public website furnishing filter):

| Site | Bad filter | Fix (read from specs JSONB) |
|---|---|---|
| [public.ts:106](../../agents/backend/src/routes/public.ts#L106) `where.furnishing = furnishFilter` | dropped `furnishing` | `where.specs = { path: ['furnishing'], … }` (Prisma JSON filter) |
| [public.ts:118](../../agents/backend/src/routes/public.ts#L118) `where.AND.push({ features: { path:[a], equals:true } })` | dropped `features` | match `specs.amenities` array (humanized labels), not `features` object |
| [internal_tools.ts:383](../../agents/backend/src/routes/internal_tools.ts#L383) `where.furnishing = furnishing` (AI `search_inventory` tool) | dropped `furnishing` | same specs JSON filter |

**Status: NOT YET FIXED** (own Discuss→Plan→Edit pass — diagnosed 2026-06-03, GlitchTip #70 left open).
Lesson reinforces [[feedback_prisma_column_drop_sweep]]: after a column drop, grep for the column name
in **WHERE/filter** positions too, not just read sites.

## How specs is keyed

Field keys come from `FieldDefinition.key` in the taxonomy. The 14 residential
node types use `bhk` (select 1RK..8+), the 11 commercial/institutional types use
`rooms` (integer). Bathrooms / area / area_unit are universal. Other keys seen
in prod: `balconies`, `additional-rooms`, `furnishing`, `facing`,
`age-of-construction`, `floors`, `ownership-tenure`, `road-facing`, `amenities`,
`parking`, `carpet_area`, `plot-area`, `road-width`, `sides-open`, `area-type`,
`status`.

## Reading room count (BHK / Rooms)

```ts
const rooms = specs?.bhk ?? specs?.rooms ?? specs?.bedrooms ?? specs?.bhk_count;
```
`bedrooms` and `bhk_count` are LEGACY keys still seen in pre-unification rows
(post-Phase-0 backfill covered everything, but some rows had specs.bedrooms from
the old non-taxonomy upload flow). Read with the full fallback chain to be safe.

## Reading amenities

```ts
const amenities: string[] = Array.isArray(specs?.amenities) ? specs.amenities : [];
```
The shape is **an array of humanized labels** (`["Gym", "Power Backup", …]`), NOT
the legacy `{gym: true, power_backup: true, …}` object. Old features-object
amenities-filter logic does NOT work; use `amenities.some(a => a.toLowerCase() === target.toLowerCase())`
or `new Set(amenities.map(a => a.toLowerCase()))` for set membership.

## Writing specs from PATCH `/api/inventory/:id`

The PATCH route now **deep-merges** incoming `specs` onto existing — never full-
replace. Clients that send a partial specs object don't lose unrelated keys:
```ts
// agents/backend/src/routes/inventory.ts — grep: updateData.specs = { ...existingSpecs
updateData.specs = { ...existingSpecs, ...(updateData.specs as Record<string, any>) };
```
The route also folds legacy body-level fields (`req.body.furnishing`/`facing`/
`total_floors`→`specs.floors` etc.) into `specs.*` just below the merge
(grep `bodyKey === 'total_floors'`); amenities slug→label array is set on the
`updateData.specs.amenities = labels` line. Old clients keep working without UI changes.

## Edit Inventory UI

The Specs tab has **one universal top row** (Bathrooms / Area / Area Unit) and
one dynamic "Property Details (by type)" panel below. The panel reads NodeFields
from `/public/taxonomy/nodes/:id/fields` and renders each via its `input_type`
(select / number / multiselect chips / parking_list widget / etc.). Saved
values flow through `editSchemaValues[key]` straight into `specs[key]` on save.
`TAXONOMY_RENDER_EXCLUDE = ['area', 'area_unit', 'bathrooms']` — those three only.

The hardcoded **Bedrooms** input that used to be on the Specs top row is GONE.
BHK / Rooms render in the by-type panel under the correct label per property
type. The "Amenities" tab is also GONE — amenities live in the by-type panel.

## Mobile parity

`agents/frontend/src/components/mobile/MobileInventoryEdit.tsx` mirrors the
desktop changes: same `TAXONOMY_RENDER_EXCLUDE`, same dynamic by-type render,
same merge-on-save (`{ ...item.specs, ...changes }`), no separate Amenities
section. Keep both in lock-step when touching the Edit UI.

## Migration audit trail

- Plan rows: PROJECT_STATUS 2026-05-28 "Specs unification" + "Recent deploys".
- Prisma migration: `prisma/migrations/20260528220351_drop_deprecated_inventory_columns/migration.sql`.
- Snapshots (prod): `inventory_bak_20260528153329` (pre-Phase-0), `inventory_bak_normalize_20260528162119` (pre-Phase-2.5), `/root/backups/db-pre-phase4-20260528-220241.sql.gz` (pre-column-drop full pg_dump).
- Scripts retained at `/var/www/realty-pandit/backend/_rp_specs_backfill.ts` + `_rp_specs_normalize.ts` for audit (delete once you're confident no rollback is needed).

## Related

- [[reference_taxonomy_schema_fields_renderer]] — the by-type panel + ParkingListField widget
- [[reference_add_inventory_two_renderers.md]] — InventoryModal vs AddInventory vs ChatWorkflow vs WhatsApp adapter renderers
- [[feedback_playwright_mcp_blocked]] — temp-password swap pattern used to QA each phase
