# Design — Inventory Taxonomy Phase 1c (Admin Editor, v1)

> Brainstorming output. Builds on 1a (taxonomy shipped) + 1b (357 listings backfilled, 180 flagged). Spec for the self-service editor. No code yet.

## Context / why
Phase 1a stood up the DB-driven taxonomy (`TaxonomyNode`/`FieldDefinition`/`NodeField`) + read API; 1b backfilled all 357 listings onto it, flagging **180 as `needs_taxonomy_review`** (coarse old types collapsed — e.g. all gated apartments → "Flat"). The owner chose a **DB-editable** taxonomy, so they need a UI to (a) clear/correct those 180 flags and (b) tune each type's field schema (e.g. fix a BHK/Rooms label, required, options). This is the realization of the "edit it yourself" decision.

## Decisions (Puneet, 2026-05-24)
1. **v1 scope = review queue + per-type field editing.** Tree is **read-only** in v1 (already seeded correctly from `newtree.xlsx`); node add/rename/reorder/delete deferred to v1.5.
2. **Permission: super_boss only** (`requireSuperBoss`, like partner-reassign) — not managers.
3. **Bulk reassign: yes** — reassign a whole flagged group (e.g. all 89 gated-apartments) to one correct type in one action.
4. Desktop-primary admin tool; reuses `PartnerManagement.tsx` patterns.

## Backend — extend `routes/taxonomy.ts` with an authed admin router
Mount an admin router at `/api/taxonomy` (auth + `requireSuperBoss` on every route). Read routes stay at `/public/taxonomy`. Each route reports errors to GlitchTip (`captureRouteError`) per project rule.
- `GET /api/taxonomy/fields` → the full `FieldDefinition` catalog (for the attach-field dropdown).
- `PATCH /api/taxonomy/nodes/:id/fields` → **set** a type's field schema: body `{ fields: [{ key, required, label_override?, options_override?, display_order }] }`. Replaces that node's `NodeField` rows (upsert present, delete removed) in a transaction.
- `GET /api/taxonomy/review-queue` → inventory with `needs_taxonomy_review=true`, **grouped by current `taxonomy_node_id`**: `[{ node_id, node_name, count, sample: [{id, title, location}] }]`.
- `PATCH /api/taxonomy/inventory/:id/node` → body `{ taxonomy_node_id }` → set node + `needs_taxonomy_review=false`. (single)
- `PATCH /api/taxonomy/review/bulk` → body `{ from_node_id, to_node_id }` → for all inventory currently on `from_node_id` AND flagged, set `taxonomy_node_id=to_node_id` + clear flag; returns count updated. (bulk group fix)

## Frontend — new `PropertyTaxonomy.tsx` admin page
Mirror `PartnerManagement.tsx`. Register: nav item in `DashboardLayout.tsx` (**show only when role === 'super_boss'**) + `case 'taxonomy'` in `App.tsx` `renderContent()` (and mobile render, super_boss-gated). Component guards with a super_boss check (Access Denied otherwise). Two tabs:
1. **Field Schema** — left: the tree (read-only, from `/public/taxonomy/tree`, expand to Type leaves). Select a Type → right: its fields (from `/public/taxonomy/nodes/:id/fields`) as editable rows (label, required toggle, options text, remove) + an "Add field" dropdown (from `GET /api/taxonomy/fields`) → **Save** calls `PATCH …/nodes/:id/fields`. This is where BHK/Rooms labels + per-type options are corrected.
2. **Needs Review (count)** — groups from `GET /api/taxonomy/review-queue` (e.g. "89 × Flat", "36 × Authority Plot"). Each group: a target-type picker (tree dropdown) + **"Reassign all N"** (→ `PATCH /api/taxonomy/review/bulk`), and an expandable list to fix individual listings (`PATCH /api/taxonomy/inventory/:id/node`). Reassigned items drop off the queue; the count updates.

Client helpers in `api/client.ts` (shared CSRF axios): `getFieldCatalog`, `updateNodeFields(id, fields)`, `getReviewQueue`, `reassignInventoryNode(id, nodeId)`, `bulkReassignReview(fromNodeId, toNodeId)`.

## Out of scope (v1c)
- Node create/rename/reorder/activate/delete (v1.5).
- The dynamic add-inventory form (Phase 1d).
- Contacts demand review (Phase 2).
- Consumers (matching/search/sharing/AI — Phases 2–5).

## Verification
- tsc clean (touched files). Deploy backend + frontend (SW bump).
- Server E2E (super_boss JWT): `GET /api/taxonomy/review-queue` returns groups summing to 180; `PATCH /review/bulk {from: Flat-node, to: <some flat-type>}` updates N and they leave the queue; `PATCH /nodes/:id/fields` changes a label and `/public/taxonomy/nodes/:id/fields` reflects it. Non-super_boss JWT → 403.
- Playwright (when Chrome closed): open Property Taxonomy as super_boss → Field Schema tab edits a label; Needs Review tab bulk-reassigns a group → count drops. Screenshot.
- GlitchTip clean.

## Files
- `backend/src/routes/taxonomy.ts` (add admin router + routes), `backend/src/app.ts` (mount `/api/taxonomy` authed).
- `frontend/src/components/PropertyTaxonomy.tsx` (new), `frontend/src/components/DashboardLayout.tsx` (nav), `frontend/src/App.tsx` (route), `frontend/src/api/client.ts` (helpers), `frontend/index.html` (SW bump).
- Permission helper: `requireSuperBoss` (existing, used by partner-reassign).
