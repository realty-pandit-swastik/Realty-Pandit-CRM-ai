# Plan — Record every lead's requirement in the inventory taxonomy (demand capture)

**Date:** 2026-05-31
**Author:** Claude (for Puneet)
**Status:** PROPOSED — staged; not executed

## Context
Goal: capture each lead/client **requirement** in the **same taxonomy shape as inventory**
(`demand_taxonomy_node_id` + `demand_schema_values` keyed by the same `FieldDefinition.key`s as
`inventory.specs`) across **every** source (manual, 99acres, MagicBricks, WhatsApp, voice…) and on
the **deal**, so matching is a clean taxonomy-node-distance + key-by-key compare.

Audit (2026-05-31) found: the **format is aligned** and **deals already inherit** the contact's
node+schema via `services/ensure_deal.ts` (lines 129–152). But **capture is sparse** — only ~7% of
1866 contacts have a `demand_taxonomy_node_id` (99acres 4%, MagicBricks 7%, WhatsApp/voice ~2 each);
the **manual** `DemandRequirementsForm` cascade is the only path that sets it well. Cause: the
automated feeds + the buyer bot do **no taxonomy-node resolution** (they only set legacy `demand_*`
text fields — now dropped → throwing). Matching's node-distance scoring barely fires.

## Strategy
One **shared resolver** that maps whatever property signals a source has → a taxonomy node +
schema_values, called from every capture path + the backfill. Reuse the existing
`utils/classification.resolveDemandSlugs` + `utils/demand_canonical.foldLegacyDemand` + the
inventory mapping primitives (`flat_property_type.legacy_*`, `TaxonomyNode.legacy_flat_property_type_id`/
`legacy_sub_category_id`).

---

## Stage 1 — Finish the broken-writer fix (URGENT, standalone)
Stop the dropped-column writes that throw `Unknown argument` at runtime (data loss on live lead
intake). Remove the legacy `demand_*` columns from each `create/update` object; keep the
`foldLegacyDemand(...)` dual-write already beside them.

| File | Dropped columns to remove from the write |
|---|---|
| `workflows/buyer_workflow_engine.ts` (~218-219, 251-252, 308-321) | `demand_bhk`, `demand_main_category`, `demand_amenities`, `demand_property_type`, `demand_bedrooms`, `demand_category`, `demand_type_slug` |
| `services/ninety_nine_acres_poller.ts` (~455-459, 477-481) | `demand_bhk`, `demand_main_category`, `demand_category`, `demand_type_slug` |
| `integrations/magicbricks.ts` (~179-182) | `demand_bhk`, `demand_main_category`, `demand_category`, `demand_type_slug` |
| `services/transaction_service.ts` (~183, 186) | `demand_property_type`, `demand_bedrooms` |

Keep surviving columns (`property_type`, `category_id`/`sub_category_id`/`type_id`, `preferred_*`,
`budget_*`, `intent`, `area_*`). Verify: 0 `Unknown argument` in logs after deploy; a test 99acres/
WhatsApp lead saves cleanly. **This is shippable on its own and unblocks intake.**

## Stage 2 — Shared `resolveDemandTaxonomy()` util (the core)
New `utils/demand_taxonomy.ts`:
```
resolveDemandTaxonomy(input: {
  main_category?, property_type?, sub_category_id?, type_id?, category_id?,
  bhk?, amenities?, furnishing?, facing?, area?, area_unit?, ...
}) => { demand_taxonomy_node_id: string|null, demand_schema_values: object|null, needs_review: boolean }
```
Resolution order (best-effort, flag `needs_review` when fuzzy — mirrors inventory backfill):
1. If `sub_category_id`/`type_id` present → find the `TaxonomyNode` whose `legacy_sub_category_id`
   (and/or `legacy_type_id`) matches → pick the representative leaf.
2. Else map `property_type`/slug → `FlatPropertyType` → node via `legacy_flat_property_type_id`.
3. `demand_schema_values`: fold `bhk`/`amenities`/`furnishing`/etc. through `foldLegacyDemand` +
   normalize to canonical labels (`Gym`, `1 RK`, `8+`, etc.) keyed by `FieldDefinition.key`.
Returns `null` node when nothing resolves (don't guess wildly). Pure + unit-testable.

## Stage 3 — Wire the resolver into the automated capture paths
Each path calls `resolveDemandTaxonomy(...)` and writes `demand_taxonomy_node_id` +
`demand_schema_values` (+ `needs_taxonomy_review` when fuzzy), replacing the legacy writes removed in Stage 1:
- **99acres** (`ninety_nine_acres_poller.ts`): feed `extractPropertyType` + `SLUG_MAP` result + `bhk`.
- **MagicBricks** (`integrations/magicbricks.ts`): feed mapped property type + `bhk`.
- **Buyer bot** (`workflows/buyer_workflow_engine.ts`): feed `buyer_main_category`/`buyer_property_type`/`buyer_bhk`.
- **Voice / omnidim / webhooks** (`routes/omnidim.ts`, `routes/webhooks.ts`): same.
- Deal inheritance: unchanged (`ensure_deal` already carries node+schema from the contact).
(Optional later, Stage 3b: a richer buyer-bot taxonomy cascade + `schema_fields` for demand — like the
inventory add-bot — to capture amenities/furnishing/age directly instead of only what's parseable.)

## Stage 4 — Backfill existing leads + deals
Script (dry-run → backup → apply): for each Contact lacking `demand_taxonomy_node_id`, run
`resolveDemandTaxonomy` over its surviving `property_type` + `category_id`/`sub_category_id`/`type_id`
+ existing `demand_schema_values` → set node + merge schema_values + `needs_taxonomy_review` for fuzzy.
Then sync deals: `transaction.updateMany` from each contact's new node (or rely on next `ensure_deal`).
Target: lift node coverage from ~7% toward the share of leads that have any resolvable type signal.
Owner clears `needs_taxonomy_review` via the existing Property Taxonomy UI.

## Stage 5 — Verify matching lift
- Coverage: re-run the per-source `demand_taxonomy_node_id` count (expect a large jump).
- Functional: pick 3–4 backfilled buyer deals, hit `GET /api/deals/:id/matched-inventory`, confirm
  taxonomy-distance scoring now contributes (not just legacy fallback).
- Playwright: a WhatsApp buyer + a 99acres lead → confirm the contact gets a node + schema_values.

## Files
- Stage 1: the 4 writers above (remove dropped-col writes).
- Stage 2: new `utils/demand_taxonomy.ts` (+ reuse `utils/classification.ts`, `utils/demand_canonical.ts`).
- Stage 3: the 4–6 capture paths call the resolver.
- Stage 4: one-off backfill script (prod Node/Prisma pattern, pg_dump first).

## Sequencing & risk
- **Stage 1 first, deploy alone** — stops active data loss; low risk (deletes dead writes).
- Stages 2→3 together (resolver + wiring), then Stage 4 backfill, then Stage 5 verify.
- Deploy per `feedback_prod_backend_paths` (ts-node transpile-only → `pm2 restart`; md5-parity before scp;
  no frontend build unless Stage 3b touches UI). Back up before the backfill.

## Open choices for review
1. **Ambiguity policy** — when a `sub_category_id` maps to several nodes (e.g. apartment → Flat/Duplex/
   Penthouse), pick the **generic** node + `needs_review=true` (recommended), or leave node null?
2. **Stage 3b (richer buyer-bot capture)** — in this scope now, or defer until v1 (resolve-from-parsed) ships?
3. **Backfill aggressiveness** — set node only when confident, or always-best-guess + review flag for all?

---

## OUTCOME — completed 2026-05-31

All 5 stages shipped.

- **Stage 1** (writers): 5 dropped-column writers fixed (incl. `routes/public.ts`, found via the "verify first" pass).
- **Stage 2** (resolver): `utils/demand_taxonomy.ts#resolveDemandTaxonomy()`. Reuses inventory legacy-map links; `TYPE_SYNONYMS` for loose feed strings; aggregates nodes across flat types sharing a `legacy_type_slug` (fixed "builder floor"); `CATEGORY_ONLY` skip; contains-fallback for compound feed slugs (residential_plot→plot, commercial_office_space→office, retail_shop→shop). Ambiguous→generic leaf + `needs_review`. Unit-tested against live taxonomy.
- **Stage 3** (wiring): resolver called before the contact upsert in buyer bot, 99acres poller, magicbricks, website public route. Voice/omnidim **not** wired (low volume — follow-up).
- **Stage 4** (backfill, behind 2 pg_dumps): 77 from stored property_type (+40 deals); +69 from re-parsing the preserved 99acres `propertyLabel` in interaction `content` (ground-truth); +950 contacts/294 deals via the **owner-chosen BHK→Flat heuristic** (residential feed lead with a BHK + no commercial hint → Flat node, **all `needs_taxonomy_review=true`**; 491 correctly skipped). The original `propertyLabel` survives in the `lead_capture` interaction content — useful for any future re-parse.
- **Stage 5** (verify): contact node coverage **125→1,221 (7%→65%)**, deals **→408/575 (71%)**. Deal `8021f0e3` (node "Flat") returns a scored match (78.75) via the canonical engine.

**Resolved open choices:** (1) generic-leaf + `needs_review` — adopted. (3) backfill aggressiveness — owner chose best-guess BHK→Flat heuristic + review flag (not confident-only).

**Honest ceiling:** ~35% of leads stay null because 99acres labels are *price + BHK + project name* with **no property-type word** and often no BHK — there is genuinely no type signal in the source. Real future lift = (a) owners clearing the 1,072 `needs_taxonomy_review` flags via the Taxonomy UI, (b) wiring voice/omnidim, (c) optional feed enrichment if 99acres exposes a sub-type field.

---

## FOLLOW-UP — capturing the node wasn't enough; matching had to USE it (2026-05-31)

User reported: taxonomy visible on leads/deals, but matching inventory "not working." **Root cause:** `MatchingEngine` never used `demand_taxonomy_node_id` to filter — it hard-filtered on legacy `sub_category_id`/`category_id` (NULL on the backfilled leads) or `property_type` string-`contains`. The node was scoring-only. A Flat deal returned commercial results; 326/405 active node-bearing deals had no real type filter.

Fix (no-shortcuts, all surfaces — the user's mandate):
- **Stage A (keystone):** `utils/demand_taxonomy.ts#resolveTypeFilter()` (cached) maps node id / loose slug / legacy ids → the real `sub_category_id`+`category_id`. `MatchingEngine.findMatches` normalizes criteria through it FIRST, so the type constrains results for **all 12 call sites** (deal workspace, leads, website, WhatsApp bot, matching agent, auto-share, etc.) + the tree-distance scoring (exact 12 / sub-cat 8 / category 4) actually fires. Join verified 100% (`node.legacy_sub_category_id` ↔ inventory `sub_category_id`).
- **Stage B:** `resolveDemandTaxonomy` also returns legacy ids; capture paths (99acres/magicbricks/website) persist them.
- **Stage C:** backfilled 1,092 node-only contacts' legacy cols (1,221/1,221 now have sub_category_id). Backup `db-pre-classbackfill-20260531153933.sql.gz`.
- **Stage D verified:** deal 0162bf96 22→**5 matches, all residential** (was 3 commercial), top score 100; WhatsApp `flat`→50 residential, `plot`→35 plots, `office`/`shop`→commercial-only; no zero-result regressions.

**Architectural rule going forward:** the demand taxonomy node is the SoT for buyer type; legacy classification columns are DERIVED from it via `resolveTypeFilter`. New criteria/matching paths must pass the node (or a slug) and let the engine resolve — never assume `contact.sub_category_id` is populated.
