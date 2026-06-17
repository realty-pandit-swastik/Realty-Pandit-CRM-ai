---
name: reference-matching-tree-alignment
description: Lead↔inventory matching aligned on the shared sub_category_id tier (A1+B, 2026-05-16). sub_category_id is the HARD filter; type_id is scoring-only because inventory never sets it.
metadata:
  type: reference
---

# Matching classification alignment (A1 + B, locked 2026-05-16)

## The problem
Leads/contacts/Lead-table carry `category_id` + `sub_category_id` + `type_id` (from the `/public/classification-tree` 3-tier picker). Inventory is created via the workflow engine (`src/workflows/workflow_engine.ts`, NOT `src/services/`) which maps `flat_property_types` → `category_id` + `sub_category_id` only — **`type_id` is left undefined by design**. Landmarks (grep, line numbers drift): the maps fill only category+sub (grep `answers.sub_category_id = FLAT_TYPE_TO_SUB_CATEGORY`, ~617-618); the inventory create then writes `type_id: answers.type_id || undefined` (grep `type_id: answers.type_id`, ~837) and `answers.type_id` is never populated on the flat-type path. Result: inventory `sub_category_id` 100% populated, `type_id` ~28%. The matcher previously preferred `type_id` then jumped to coarse `category_id`, ignoring the 100%-populated `sub_category_id` → matches collapsed to Residential-vs-Commercial coarseness, and any lead with `type_id` set matched **zero** inventory.

## The fix (A1 + B)
`services/matching_engine.ts`, both WHERE builders + `calculateMatchScore`:
- **`sub_category_id` is the HARD filter** (shared, 100%-populated tier). Fallback: `category_id` → legacy `property_type` string.
- **`type_id` is NOT hard-filtered** — only a scoring boost (+12 exact type, +8 exact sub_category) in `calculateMatchScore`. This avoids the typed-lead dead-end.
- `MatchCriteria` gained `sub_category_id`. `buildMatchCriteriaFromLead` passes it.
- Deals (transactions) have **no** classification id columns — only text `demand_category`. So deal-based match paths resolve ids from the **linked contact**: `property_sharing.ts` (`shareNextProperty`) and `routes/deals.ts` (matched-inventory) now `include: { demand_contact: { select:{category_id,sub_category_id,type_id} } }` and feed them into criteria.

## Why NOT full type_id alignment (A2 rejected)
Populating inventory `type_id` would need a flat_property_type→master_property_type map (doesn't cleanly exist — flat types ≈ sub-categories) + a 349-row backfill + a change to the workflow engine that **also powers the WhatsApp inventory-intake bot** (high blast radius). The tree's distinguishing tier in practice is sub_category, so A1 delivers the matching-correctness goal without that risk. The Add-Inventory **UI still uses the combined flat-type picker** (not a 3-step category→sub→type like leads) — deliberately, to protect the shared bot workflow. Data/matching are aligned; the UI tier was intentionally left.

## Verify
```
# deal whose contact has sub_category_id → returns sub-category-precise matches
curl .../api/deals/<id>/matched-inventory   # success:true, data populated
```
Pre-fix a typed-lead deal returned []; post-fix it runs the sub_category query (empty only if budget/geo legitimately exclude).

## Add-Inventory wizard relabel (2026-05-16)
`workflow_definition.ts`: `main_category` question → "Which category?"; `flat_property_type_id` question → "Which sub-category? (e.g., Apartment / Gated Society)". **Wording-only** — no flow/logic change, so the shared WhatsApp intake bot is unaffected. The step already persisted `sub_category_id` (verified: recent inventory saved Apartment / Land-Plot / Builder Floor — same `master_sub_categories` values as leads); it was just mislabelled "What type of property?" which made users think sub-category was skipped. There is no separate sub-category screen because `flat_property_type_id` *is* the sub-category step.

## Related
- [[classification_tree_final]] — the locked master tree (Structure.txt)
- [[feedback_prisma_enum_as_any]] — transactionLog enum noise seen in logs is unrelated/pre-existing
- workflow_engine.ts FLAT_TYPE_TO_SUB_CATEGORY map is the inventory→sub_category source of truth
