---
name: reference_deal_match_category_fix
description: Deal matching + Match&Share now category-correct for CATEGORY-level demand (commercial no longer leaks residential; Rooms vs BHK selector)
metadata:
  type: reference
---

**2026-06-09 SHIPPED + live-verified (deal KD SINGHANIA, a Commercial category-level lead).**

Two bugs on a Commercial deal's Match & Share: (1) matcher returned **residential** results; (2) UI showed a **BHK** selector. Both fixed + deployed (backend `realty-backend`, frontend `index-khdFKhoz.js`).

**Root cause:** a deal classified ONLY at the **CATEGORY** level — its `demand_taxonomy_node_id` is the *Commercial* CATEGORY node (`be9a7de4-…`), no `legacy_sub_category_id`, contact `category_id`/`sub_category_id`/`type_id` all NULL. The matcher's hard filter only knew `sub_category_id_list → sub_category_id → category_id → (nothing)`; `resolveTypeFilter` resolves only TYPE nodes → a CATEGORY node yielded nothing → **no classification filter** → every in-budget property matched (residential included). (KD's node lives on the CONTACT; the transaction's own `demand_taxonomy_node_id` is null — endpoint falls back to contact. So KD is invisible to a transaction-node-only query and is the ONLY category-level commercial deal; the other ~10 commercial deals are TYPE-classified and never leaked.)

**Backend fix** (`services/matching_engine.ts` + `routes/deals.ts` match-counts): when `!sub_category_id && !category_id` but a `demand_taxonomy_node_id` exists, set `taxonomy_node_id_list = expandTaxonomyNodeIds([node])` (self+descendants, see [[reference_taxonomy_filters]]) and add `else if (taxonomy_node_id_list?.length) where.taxonomy_node_id = { in: … }` AFTER the category_id branch in BOTH where-builders (radius pass + searchProperties) and in the match-counts loop. TYPE-classified deals are untouched (fallback only fires when both legacy ids are absent) → no regression.

**Frontend fix** (`components/deal/MatchShareTab.tsx`): `specMode` from the demand path — leaf slug matches `/plot|land|orchard/` → **none** (hide selector); else `categoryNode.slug==='commercial'` → **Rooms**; else **BHK**. Both Rooms+BHK send the SAME `bhk_list` param (engine filters the `bhk→rooms→bedrooms` chain). Pre-fill reads `dealSV.bhk ?? dealSV.rooms`. Tree from `/public/taxonomy/tree` DOES carry `slug` (`commercial`/`residential`).

**Verified live:** KD `matched-inventory` = 49, ALL commercial-tree (showroom/office/factory/commercial-land/warehouse), **0 residential**; `match-counts` badge = 51 commercial (was counting all ~349 sell); residential deal → BHK + residential (no regression); TYPE commercial @ ₹15–20L → 0 (budget cap, precise filter intact). UI screenshots: KD → "ROOMS (PICK ONE OR MORE)" + commercial-only results.

**Note:** "Agricultural Land / Orchard" is a TYPE under **Commercial → Land** in the tree, so a few results carry a legacy `category='agricultural'` badge but ARE correctly in the commercial subtree — the tree is SoT, the legacy badge disagrees. Extends [[reference_inventory_classification_mapping]] (Match & Share redesign) and [[reference_demand_canonical_sot]].
