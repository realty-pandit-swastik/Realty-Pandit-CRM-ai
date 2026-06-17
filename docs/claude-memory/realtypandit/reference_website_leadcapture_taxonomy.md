---
name: Website lead-capture popup → canonical taxonomy (2026-06-14)
description: The public-site lead popup (and /contact) now drives off the canonical TaxonomyNode tree; the node id flows to the contact + auto-created deal. Includes the foldLegacyDemand clobber fix.
metadata:
  type: reference
---

## What shipped
The public website lead popup `RequirementCapture.tsx` (rendered by `LeadCapture.tsx`
auto-popup @15s after cookie consent, and on `/contact` via `ContactForm.tsx`) was
rebuilt to use the **canonical taxonomy** instead of hardcoded categories:
- Step 1 categories come from `getTaxonomyTree()` → `GET /public/taxonomy/tree`
  (top-level CATEGORY nodes — currently just Residential + Commercial; 2 active).
- Step 2 "Property Type" dropdown = the TYPE-leaf nodes under the chosen category
  (`leavesUnder`). All 57 tree leaves are `node_kind:'TYPE'` and 0 TYPE nodes have
  children, so the leaf picker == the TYPE picker. The chosen leaf's id is sent as
  `taxonomy_node_id`.
- Validator `leadRequirementsSchema` accepts `taxonomy_node_id` (category/type_slug now
  optional, `.refine` requires one of node-id or type_slug).

## Two bugs that were nulling the node id (fixed + live-verified)
1. **Resolver had no node-id path.** `resolveDemandTaxonomy` (what the
   `/public/lead-requirements` handler calls) only matched legacy ids + property_type
   slugs; the `byNodeId` fast-path lived only in `resolveTypeFilter`. Added a branch at
   the top of `resolveDemandTaxonomy`: if `input.demand_taxonomy_node_id` is in
   `maps.byNodeId` → use that node directly. (`loadMaps` caches `node_kind:'TYPE'` only,
   which is exactly what the website sends.)
2. **foldLegacyDemand spread clobber** — see precaution
   `docs/precautions/demand-fold-clobber.md`. The canonical dual-write spread sat after
   the explicit `demand_taxonomy_node_id` set and re-nulled it. Fixed in
   `routes/public.ts` (lead-requirements update+create) AND
   `workflows/buyer_workflow_engine.ts` (buyer upsert update+create — same latent bug in
   the bot path) by feeding `demandTax.demand_taxonomy_node_id` into `foldLegacyDemand`.

## Verified
API round-trip + a real Playwright run through the live popup: contact AND the
auto-created deal both carry the exact picked node id (Flat/Apartment `7347f07d…`),
`source: website_popup`. Backend deployed (two deploys). Frontend was already live from
the prior session. See [[reference_demand_canonical_sot]], [[reference_taxonomy_filters]],
[[reference_website_lead_routing]].
