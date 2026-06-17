---
name: reference_demand_canonical_sot
description: Demand-side requirements (Contact/Lead/Transaction) are now stored canonically in demand_schema_values + demand_taxonomy_node_id. Mirror of inventory.specs unification. All legacy demand_bhk/main_category/category/type_slug/amenities/property_type/bedrooms columns DROPPED 2026-05-29.
metadata:
  type: reference
---

After Phase 5 of demand-side unification (2026-05-29), the buyer/tenant
requirements stack mirrors the inventory side ([[reference_inventory_specs_sot]]):

**Single source of truth on Contact/Lead/Transaction:**
- `demand_taxonomy_node_id String?` — which leaf node in the property taxonomy
  the buyer wants. Null = "any property type".
- `demand_schema_values  Json?`     — values keyed by `FieldDefinition.key`
  (same shape as `inventory.specs`). Examples: `{bhk: "2", amenities: ["Lift",
  "Power Backup"], furnishing: "Semi Furnished", "age-of-construction": "1-3 years"}`.

**Universal columns kept (apply across all property types):**
`demand_location`, `demand_budget_min/max`, `demand_budget_type`, `demand_intent`,
`demand_notes`, `demand_area_min/max`, `demand_handler_*`.

**Columns DROPPED 2026-05-29** (migration `20260529153711_drop_legacy_demand_columns`):
- Contact: `demand_bhk`, `demand_main_category`, `demand_category`,
  `demand_type_slug`, `demand_amenities`.
- Lead: `demand_bhk`, `demand_main_category`, `demand_type_slug`,
  `demand_amenities`.
- Transaction: `demand_property_type`, `demand_bedrooms`, `demand_category`,
  `demand_type_slug`, `demand_amenities`.

If you find code reading any of those, it's broken — derive from
`demand_schema_values` instead (e.g. `bhk = sv.bhk`, `amenities = sv.amenities`,
`property_type = (taxonomy node.name)`).

**Forms:** one shared `<DemandRequirementsForm>` lives at
`frontend/src/components/leads/DemandRequirementsForm.tsx` and is used by
`ExternalLeads.tsx`, `deal/RequirementsTab.tsx`, `deal/LogCallOverlay.tsx`. It
renders the 4-cascade taxonomy picker + dynamic per-type fields fetched from
`/public/taxonomy/nodes/:id/fields`.

**Matching engine** (`backend/src/services/matching_engine.ts`):
- Taxonomy node distance scoring: 12pt exact node / 8pt same sub_category /
  4pt same root / fall back to legacy `category_id`/`sub_category_id` for orphan rows.
- Canonical key-by-key compare on `demand_schema_values` vs `inventory.specs`:
  room-count (bhk/rooms) 8pt exact ±1=4pt, amenities overlap tiers 7/5/3/1pt,
  scalar eq 3pt each for `furnishing`, `facing`, `age-of-construction`,
  `ownership-tenure`, `road-facing`.

**API contracts (live as of 2026-05-29):**
- `GET /api/contacts` returns canonical fields only. The legacy keys are gone
  from the payload — anything still requesting them gets `undefined`.
- `PATCH /api/leads/:phone` and `PATCH /api/deals/:id` **deep-merge**
  `demand_schema_values` onto existing (prevents silent loss when a caller
  only sends one key). Mirror of inventory specs deep-merge.
- `GET /api/deals/:id/matched-inventory` reads `deal.demand_taxonomy_node_id`
  + `deal.demand_schema_values` (with contact fallback) and scores via the
  rewritten engine. Verified end-to-end: deal `8021f0e3` with `bhk: "2"`
  surfaces a 2BHK apartment match at score 78.75 on prod.

**Backfill / normalize history:**
- Phase 0 backfilled legacy columns → canonical (263+ rows).
- Phase 2.5 (`/tmp/_rp_demand_p25_normalize.ts`) normalized 53 stragglers:
  bhk `0`/`9..12` → `1 RK`/`8+`; amenity slugs `gym`/`club_house`/`pool` →
  `Gym`/`Club House`/`Swimming Pool` (Title Case matching the taxonomy
  options the new form pre-selects from).

**Safety nets retained:**
- `contacts_bak_demand_p25_20260529092942`, `leads_bak_demand_p25_…`,
  `transactions_bak_demand_p25_…` (pre-normalize SQL snapshots).
- `/root/backups/db-pre-demand-p5-20260529-152828.sql.gz` (pre-column-drop
  full pg_dump). Restore: `gunzip < … | psql -U realty_user reality_pandit`.

**Sweep-completion (2026-05-30) — the Phase-5 sweep MISSED several files.** `tsc --noEmit`
does not catch these (objects spread into `prisma.x.update({data})`; ts-node runs transpileOnly).
Found + fixed:
- **Throwers (legacy column WRITE → "Unknown argument" 500):** `routes/agent.ts` referred-leads
  (folded → `demand_schema_values`), `services/workflow_task_service.ts` (removed dead
  `contactUpdate.demand_bhk`), `agents/sales_agent.ts` `extractBuyerData` (was spread into
  `contact.update` → threw → **lost ALL extracted buyer data when BHK was mentioned**; now
  folds + `mergeDemandSchemaValues` onto existing).
- **Degraded reads (returned undefined, no crash):** `agents/matching_agent.ts`,
  `services/message_router.ts`, `services/new_lead_alerts.ts` → now read `demand_schema_values.bhk`
  (parseInt for the numeric forms "1 RK"/"8+"). Added `demand_schema_values` to `agents/types.ts` `ContactData`.
- **Confirmed SAFE (no change):** `partner_agent.ts` (passes dropped fields to `createDeal`, which
  writes Transaction columns EXPLICITLY — no `...input` spread — so extras are ignored),
  `services/property_sharing.ts` + `services/deal_service.ts` (local criteria/input objects).
- **STILL degraded (cosmetic, NOT fixed):** `tx.demand_property_type` reads in
  `deal_notifications`/`interaction_engine`/`notification_agent`/`deal_visibility` fall back to
  "property"/"N/A". Showing the real type needs taxonomy-node-name resolution (enhancement).
  `scripts/backfill_deal_sync.ts:26-27` has a dropped-col `select` → would throw IF re-run, but
  it is a one-off non-runtime script.

**Rule:** after dropping Prisma columns, grep the WHOLE backend for the column names (not just
routes/) — `agents/` + `services/` had stragglers where a "Phase 1 dual-write" `foldLegacyDemand`
was added but the legacy column write next to it was never removed.

**SWEEP RESOLVED (2026-05-31 fix, re-verified 2026-06-03).** A 2026-05-31 pre-flight audit had flagged
the sweep "STILL INCOMPLETE" (the 2026-05-30 audit grep was truncated with `head -40`) and listed
`buyer_workflow_engine.ts` / `ninety_nine_acres_poller.ts` / `magicbricks.ts` / `transaction_service.ts`
as still writing dropped demand columns. That was **then fixed the same day** (PROJECT_STATUS deploy
item "Demand-column-drop sweep — writers fixed", verified via exhaustive grep → zero runtime writes).
**Re-confirmed against live code 2026-06-03** — all dropped-demand-column writes are now neutralized:
- `buyer_workflow_engine.ts` contact.upsert (both update+create branches, ~L242/L274) wraps
  `demand_bhk`/`demand_amenities` inside `foldLegacyDemand({…})` → `demand_schema_values`, not bare cols.
- `services/transaction_service.ts` `createTransaction` (L174-190) and `services/deal_service.ts`
  `createDeal` (L132-160) **explicitly enumerate** their `data:` fields — never `...input` spread — so
  the legacy `demand_*` keys callers still pass (partner_agent / buyer_workflow_engine / sales_agent)
  are harmlessly ignored; `foldLegacyDemand` routes them to `demand_schema_values`.
- Remaining `demand_*` literals in the backend are interface/validator/mapper-only
  (`demand_canonical.ts`, `classification.ts`, `deals.validator.ts`, return-object mappers) — NOT
  Prisma writes. Grep-clean of runtime column writes.
So the earlier "MUST finish before leads-requirements work" blocker is **cleared** — leads-requirements
work is unblocked on this axis. (Unrelated: a separate *inventory*-specs dropped-column survived as a
WHERE filter — `routes/public.ts:106` `where.furnishing` + L118 `features`, and `internal_tools.ts:383`
— which caused GlitchTip backend #70; see [[reference_inventory_specs_sot]]. Different table, separate fix.)

**CAPTURE NOW LIVE (2026-05-31) — leads get a node at intake.** `utils/demand_taxonomy.ts#resolveDemandTaxonomy({property_type|sub_category_id|type_id|category_id|bhk|amenities|...})` → `{demand_taxonomy_node_id, demand_schema_values, needs_review}`. Reuses the inventory legacy-map links on `TaxonomyNode`; `TYPE_SYNONYMS` (flat→apartment, house→villa, land→plot, godown→warehouse); aggregates nodes across flat types sharing a `legacy_type_slug` (so "builder floor" resolves); skips bare categories (residential/commercial → no leaf guess); contains-fallback for compound feed slugs (residential_plot→plot, commercial_office_space→office, retail_shop→shop); ambiguous→generic leaf (`pickGeneric`=lowest display_order then shortest name) + `needs_review`. Cache loaded once per process — call `clearDemandTaxonomyCache()` after taxonomy edits. **Wired into:** `buyer_workflow_engine.ts`, `ninety_nine_acres_poller.ts`, `magicbricks.ts`, `routes/public.ts`. **NOT wired:** voice/omnidim (low volume — follow-up).

**Backfill (2026-05-31):** contact node coverage 125→1,221 (7%→65%), deals→408/575 (71%). Sources: 77 from stored property_type, 69 from re-parsing the preserved 99acres `propertyLabel` (it survives in the `lead_capture` interaction `content`: `99acres lead: NAME — LABEL. Query: …`), and **950 via an owner-approved BHK→Flat heuristic** (residential feed lead with a BHK + no commercial hint → Flat node). **1,072 contacts carry `needs_taxonomy_review=true`** — these include the heuristic guesses; owner clears them via the Property Taxonomy UI. Backups: `db-pre-demandbackfill-20260531144425.sql.gz`, `db-pre-flatheuristic-20260531145341.sql.gz`. **Honest ceiling:** ~35% stay null — 99acres labels are price+BHK+project with no type word and often no BHK; no type signal exists in the source to honestly classify them.

**Location autocomplete + geo matching (2026-06-01).** `DemandRequirementsForm` (the shared
demand form) location field now has **Google Places autocomplete** (browser `VITE_GOOGLE_MAPS_API_KEY`)
and emits `preferred_lat`/`preferred_lng` in its `DemandPayload`. **Geo lives on the Contact**
(Transaction has NO lat/lng columns — don't add them); the deal RequirementsTab syncs lat/lng to the
contact via `updateLeadRequirements` (PATCH `/api/leads/:phone/requirements` already persists
`preferred_lat/lng`). Matching reads `deal.demand_contact.preferred_lat/lng`: `routes/deals.ts`
matched-inventory + `services/property_sharing.ts` now pass it into `buildMatchCriteriaFromLead`,
so the engine runs **Haversine radius search** (2/5/10/20 km) instead of text-only. NOTE: the backend
has **no `GOOGLE_MAPS_API_KEY`** (only Google OAuth keys) so `utils/geocode.geocodeAddress()` is a
no-op server-side — geo must be captured **client-side** (the autocomplete). If you ever want
server-side geocoding, add `GOOGLE_MAPS_API_KEY` to the backend `.env`.

**Manual "Add Lead" now captures taxonomy too (2026-05-31).** The admin Add-Lead modal
(`ExternalLeads.tsx`) used to send only legacy `category_id`/`sub_category_id`/`demand_bhk` (no
node). It now embeds the shared `<DemandRequirementsForm>` (same as the lead-edit panel) → sends
`demand_taxonomy_node_id` + `demand_schema_values`; POST `/api/leads` calls `resolveTypeFilter` to
derive+persist `sub_category_id`/`category_id`/`type_id` from the node, accepts `area_*`, and
geocodes the text location server-side. **Partner-referral leads: client name AND phone are now
OPTIONAL** (partners won't share them) — no client phone → a `PENDING-<partner>-<rand>` placeholder
contact key (`isTemporaryPhone`), attributed to the partner, buyer WhatsApp skipped; fill the real
phone later via edit. So EVERY intake path (feeds, website, bot, AND manual) now stores the node.

**MATCHING now USES the node (2026-05-31) — the capture→match gap is closed.** Capturing `demand_taxonomy_node_id` did NOT make matching work: `MatchingEngine` hard-filtered inventory on the legacy `sub_category_id`/`category_id` columns (NULL on backfilled leads) or `property_type` string-`contains` (WhatsApp bot / matching agent / website) — the node was scoring-only. So a Flat-seeker deal returned commercial results; 326/405 active node-bearing deals had no real type filter. **Keystone fix:** `utils/demand_taxonomy.ts#resolveTypeFilter({demand_taxonomy_node_id|property_type|sub_category_id|category_id})` (cached) → `{demand_taxonomy_node_id, sub_category_id, category_id, type_id}`. `MatchingEngine.findMatches` calls it FIRST (when `!criteria.sub_category_id` and any type signal present) to populate the real hard filter — so all 12 call sites benefit, including the slug-only WhatsApp/agent/website paths. The join is `node.legacy_sub_category_id` → inventory `sub_category_id` (verified 100%: all 12 active-inventory sub_categories map to a TYPE node). `resolveDemandTaxonomy` now ALSO returns `sub_category_id`/`category_id`/`type_id`; capture paths (99acres/magicbricks/website) persist them (buyer-bot already wrote them via its own category lookup). Backfilled 1,092 node-only contacts' legacy cols (1,221/1,221 node-bearing contacts now have sub_category_id). **RULE: the demand taxonomy node is the SoT for the buyer's type; legacy classification columns are DERIVED from it (via `resolveTypeFilter`), not the other way round. Any new matching/criteria path must pass the node (or a slug) and let the engine resolve — never assume `contact.sub_category_id` is populated.** Verified: deal 0162bf96 22→5 all-residential (top 100); slug flat→50 residential, plot→35 plots, office/shop→commercial. Backup `db-pre-classbackfill-20260531153933.sql.gz`.
