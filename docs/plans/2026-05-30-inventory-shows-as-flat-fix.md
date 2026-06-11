# Plan — Fix "inventory shows as flat" (taxonomy legacy-map gap)

**Date:** 2026-05-30
**Author:** Claude (for Puneet / Sunny)
**Status:** PROPOSED — not executed

## Problem

A commercial property (`RP-GZB-COM-20444`, a "Shopping Mall Showroom") displays as **"flat"**
on the inventory card. Root cause is a **data gap**, with a display amplifier:

1. **Data (root):** 37 of 57 taxonomy `TYPE` nodes have `legacy_flat_property_type_id = NULL`.
   Both write paths backfill the legacy classification *from that field*:
   - Create — `workflow_engine.ts`: when null, `flat_property_type_id`/`sub_category_id` stay
     null and `legacyType` keeps its hardcoded default **`'flat'`** (lines 542-543, else 561-564).
   - Edit — `routes/inventory.ts:677-701`: same null-guard, sets `needs_taxonomy_review=true`.
2. **Display amplifier:** the inventory card title is
   `flat_property_type?.name || property_type_link?.name || type.replace(/_/g,' ') || 'Property'`
   and **never reads `taxonomy_node.name`** — so an unmapped node falls back to the legacy
   `type` slug (`'flat'`). The inventory list/detail API doesn't even return `taxonomy_node`.

**Current impact:** 2 records mislabeled (`RP-GZB-COM-20444`, `RP-GHA-COM-20433`), both also
`sub_category_id = null` → **excluded from matching** (matcher hard-filters `sub_category_id`).
**Systemic risk:** every future create/edit onto any of the 37 unmapped nodes repeats it.

## DECISION (resolved 2026-05-30 — Puneet): create 3 proper flat types

Create `education`, `healthcare`, `petrol_pump` FlatPropertyTypes for the 8 otherwise-unmappable
nodes. Discovered specifics that make this concrete:
- **Healthcare** sub-category already exists → `master_sub_categories.healthcare` `7f70f6d1-fe46-4369-8254-03444ea54e1d`.
- **Education**: reuse existing `school_college` `f12b4f64-976c-4e17-ad8c-e355dbbe04bd` (commercial).
- **Petrol Pump**: NOT in the tree at all → also create a new `master_sub_categories` row
  (`petrol_pump`, under Commercial) since matching's `sub_category_id` needs a target.

⚠ This extends the "final" tree (Petrol Pump is genuinely new). Puneet approved; flag to Sunny.

---

## Part 1 — Data backfill (root fix; no code)

Populate `legacy_flat_property_type_id` on the 37 nodes via parent→flat-type mapping, then the
**existing** create/edit machinery becomes correct for all future listings. Mapping:

| Node (parent) | → FlatPropertyType slug |
|---|---|
| Showroom: Shopping Mall Showroom, hyper market | `commercial_showrooms` |
| shop: Shoping Mall Shop, Society Shop, Commercial Use Flat, commercial use parking | `commercial_shops` |
| Office: IT Park Office Space | `office_it_park` |
| Office: Office Use Flat | `commercial_office_space` |
| Land: Commercial Project Land | `commercial_land` |
| Land: Industrial Land; industry: Industrial Project Land | `industrial_land_plots` |
| industry: Industrial Floor | `factory` |
| storage: Godown | `warehouse` |
| storage: cold storage | `cold_storage` |
| kiosk: open Market kiosk, shopping Mall Kiosk | `kiosk` |
| Hospitality: Banquet | `guest_house_banquet` |
| Hospitality: Café/Restaurent | `restaurant` |
| Hospitality: Resort | `hotel_resorts` |
| Flat/Apartment: Duplex flat, Penthouse (Simplex), Penthouse(Duplex) | `residential_apartment` |
| Flat/Apartment: Service Apartment | `serviced_apartments` |
| Flat/Apartment: studio Apartment | `studio_apartment` |
| Independent House/Villa: House, Kothi, Banglow | `independent_house_villa` |
| Independent House/Villa: Farm House | `farm_house` |
| Land/Plot: Project Land | `residential_land_plot` |
| **Education** (School/Collage/University) | NEW `education` → sub-cat `school_college` |
| **Healthcare** (Hospital/Nursing Home) | NEW `healthcare` → sub-cat `healthcare` |
| **Petrol Pump** (Petrol Punmp/CNG/EV) | NEW `petrol_pump` → NEW sub-cat `petrol_pump` |

### Part 1a — create the 3 flat types + 1 sub-category + code-map entries (do BEFORE the backfill)

1. New `master_sub_categories` row: `{ name:'Petrol Pump', slug:'petrol_pump', category_id:'a980aa06-adc5-45a9-9108-4d3bf85d2a9d' (Commercial) }` → capture its id `PETROL_SUB`.
2. New `flat_property_types` rows (mirror the `commercial_shops` shape):
   - `{ name:'Education', slug:'education', main_category:'commercial', legacy_category_slug:'commercial', legacy_type_slug:'school', is_active:true }`
   - `{ name:'Healthcare', slug:'healthcare', main_category:'commercial', legacy_category_slug:'commercial', legacy_type_slug:'hospital', is_active:true }`
   - `{ name:'Petrol Pump', slug:'petrol_pump', main_category:'commercial', legacy_category_slug:'commercial', legacy_type_slug:'petrol_pump', is_active:true }`
3. **Code** — add to `FLAT_TYPE_TO_SUB_CATEGORY` in `workflow_engine.ts` (~604, before `commercial_other`):
```ts
            'education':    'f12b4f64-976c-4e17-ad8c-e355dbbe04bd', // School / College
            'healthcare':   '7f70f6d1-fe46-4369-8254-03444ea54e1d', // Healthcare
            'petrol_pump':  '<PETROL_SUB id from step 1>',          // Petrol Pump (new)
```
   (This is the only code change in Part 1; requires `pm2 restart realty-backend`.)

**Script** (`/var/www/realty-pandit/backend`, run via the prod Node/Prisma pattern; DRY_RUN
first). Maps by exact node name; logs every assignment; backfills the 2 existing records.

```js
// _rp_fix_flat_taxonomy.js   — set DRY_RUN=false to apply
const prisma = require("./dist/db").default;
const DRY_RUN = true;
const MAP = {
  "Shopping Mall Showroom":"commercial_showrooms","hyper market":"commercial_showrooms",
  "Shoping Mall Shop":"commercial_shops","Society Shop":"commercial_shops","Commercial Use Flat":"commercial_shops","commercial use parking":"commercial_shops",
  "IT Park Office Space":"office_it_park","Office Use Flat":"commercial_office_space",
  "Commercial Project Land":"commercial_land","Industrial Land":"industrial_land_plots","Industrial Project Land":"industrial_land_plots","Industrial Floor":"factory",
  "Godown":"warehouse","cold storage":"cold_storage",
  "open Market kiosk":"kiosk","shopping Mall Kiosk":"kiosk",
  "Banquet":"guest_house_banquet","Café/Restaurent":"restaurant","Resort":"hotel_resorts",
  "Duplex flat":"residential_apartment","Penthouse (Simplex)":"residential_apartment","Penthouse(Duplex)":"residential_apartment",
  "Service Apartment":"serviced_apartments","studio Apartment":"studio_apartment",
  "House":"independent_house_villa","Kothi":"independent_house_villa","Banglow":"independent_house_villa","Farm House":"farm_house",
  "Project Land":"residential_land_plot",
  // NEW flat types (created in Part 1a)
  "School":"education","Collage":"education","University":"education",
  "Hospital":"healthcare","Nursing Home":"healthcare",
  "Petrol Punmp":"petrol_pump","CNG pump":"petrol_pump","EV Charging Station":"petrol_pump",
};
// NOTE: run Part 1a first so bySlug[] resolves education/healthcare/petrol_pump.
(async () => {
  const fpts = await prisma.flatPropertyType.findMany({ select: { id:true, slug:true } });
  const bySlug = Object.fromEntries(fpts.map(f => [f.slug, f.id]));
  const nodes = await prisma.taxonomyNode.findMany({ where: { node_kind:"TYPE", legacy_flat_property_type_id:null }, select:{ id:true, name:true } });
  let mapped = 0, unmapped = [];
  for (const n of nodes) {
    const slug = MAP[n.name];
    const fptId = slug ? bySlug[slug] : null;
    if (!fptId) { unmapped.push(n.name); continue; }
    console.log(`${n.name}  ->  ${slug}`);
    if (!DRY_RUN) await prisma.taxonomyNode.update({ where:{ id:n.id }, data:{ legacy_flat_property_type_id: fptId } });
    mapped++;
  }
  console.log(`mapped=${mapped}  unmapped=${JSON.stringify(unmapped)}  DRY_RUN=${DRY_RUN}`);

  // Re-backfill the 2 (or N) existing affected records: derive flat type from their node.
  const broken = await prisma.inventory.findMany({ where:{ flat_property_type_id:null, taxonomy_node_id:{ not:null } }, select:{ id:true, taxonomy_node_id:true } });
  for (const inv of broken) {
    const node = await prisma.taxonomyNode.findUnique({ where:{ id: inv.taxonomy_node_id }, select:{ legacy_flat_property_type_id:true, legacy_sub_category_id:true, name:true } });
    if (!node?.legacy_flat_property_type_id) continue;
    const fpt = await prisma.flatPropertyType.findUnique({ where:{ id: node.legacy_flat_property_type_id }, select:{ legacy_category_slug:true, main_category:true, legacy_type_slug:true, slug:true } });
    console.log(`inv ${inv.id}: type='${fpt.legacy_type_slug||fpt.slug}' cat='${fpt.legacy_category_slug||fpt.main_category}' sub=${node.legacy_sub_category_id}`);
    if (!DRY_RUN) await prisma.inventory.update({ where:{ id: inv.id }, data:{
      flat_property_type_id: node.legacy_flat_property_type_id,
      sub_category_id: node.legacy_sub_category_id || undefined,
      type: fpt.legacy_type_slug || fpt.slug,
      category: fpt.legacy_category_slug || fpt.main_category,
    }});
  }
  await prisma.$disconnect();
})();
```
**Safety:** `pg_dump` `taxonomy_nodes` + `inventory` first; DRY_RUN, review the printed
assignments, then `DRY_RUN=false`. No deploy/restart (data only; served live).

## Part 2 — Backend API: expose `taxonomy_node`

`routes/inventory.ts` — add to BOTH the list include (~486) and the detail include (~529),
right after the `flat_property_type` line:
```ts
                    flat_property_type: { select: { id: true, name: true, slug: true, main_category: true } },
                    taxonomy_node: { select: { id: true, name: true, slug: true } },
```

## Part 3 — Frontend: prefer `taxonomy_node.name` in the card title

Put `taxonomy_node?.name` first in the title chain and avatar initial.

`components/InventoryList.tsx`:
- L1368 avatar: `{(item.taxonomy_node?.name || item.flat_property_type?.name || item.type || 'P')[0].toUpperCase()}`
- L1378 title: `{item.taxonomy_node?.name || item.flat_property_type?.name || item.property_type_link?.name || item.type?.replace(/_/g, ' ') || 'Property'}`

`components/mobile/MobileInventoryList.tsx` (same change, 3 spots):
- L219 avatar, L243 card title, L379 detail-sheet title — prepend `item.taxonomy_node?.name ||`
  (use `activeSheetItem.taxonomy_node?.name ||` on L379).

## Part 4 (optional) — Backend safety net

So a future unmapped node can never persist `type='flat'`:
- `workflow_engine.ts` else branch (~561-564): when no flat type, set
  `legacyType = node?.slug || legacyType` (derive from the taxonomy node instead of the default).
- `routes/inventory.ts` edit cascade (~701): same idea when `legacy_flat_property_type_id` null.

(Part 1 makes this rarely needed, but it closes the gap for newly-added nodes.)

## Matching
Part 1 populates `sub_category_id` on the 2 records → they re-enter the matcher's hard-filtered
results. Verify: `GET /api/deals/<id>/matched-inventory` for a matching commercial demand.

## Verify
- After Part 1 dry-run: printed mapping correct; 0 unmapped (or only the DECISION group if you
  defer it).
- After apply: `RP-GZB-COM-20444` row → `flat_property_type_id`/`sub_category_id` set,
  `type='showroom'`-ish, card shows "Commercial Showrooms" / "Shopping Mall Showroom".
- After Parts 2-3 deploy: build frontend (`npm run build`), backend restart not required for
  the include change? — it IS (ts-node serves `src`, restart `realty-backend`). Hard-refresh PWA.

## Deploy notes
- Server NOT git-tracked — edit/build on server. Backend include change → `pm2 restart realty-backend`.
  Frontend → `npm run build`. Part 1 is data-only.
- Verify md5 parity of the 3 code files before scp (as with the names deploy).
