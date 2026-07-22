# Website Lead-Capture → New Taxonomy Implementation Plan

> **For agentic workers:** Execute with **superpowers:executing-plans** (INLINE, phase checkpoints — per `feedback_subagent_overhead`). Steps use `- [ ]`.

**Goal:** Make the public-site lead popup (`RequirementCapture`) capture the buyer's requirement from the **canonical TaxonomyNode tree** (the same SoT inventory uses) and submit the chosen **`taxonomy_node_id`** — instead of the legacy hardcoded 3-category list + `FlatPropertyType` slug. Result: website leads land with the exact `demand_taxonomy_node_id` → match inventory precisely + enter the deal pipeline correctly classified (no lossy slug-resolution / `needs_taxonomy_review` guesswork).

**Architecture / why it's small:** the website already exposes the taxonomy (`getTaxonomyTree`, `getNodeFields` in `lib/api.ts`; used by the post-property `ChatTaxonomyPicker`), and the backend resolver **already accepts a node id** — `resolveDemandTaxonomy({ demand_taxonomy_node_id })` has a precise `byNodeId` fast-path (`utils/demand_taxonomy.ts:202`). So: (1) frontend drives the picker from the tree + sends `taxonomy_node_id`; (2) backend accepts that field + passes it to the resolver. Everything downstream (contact upsert with `demand_taxonomy_node_id`, `MatchingEngine`, `ensureDealForLead`) is unchanged.

**Tech Stack:** Next.js website (`agents/website`), Node/TS backend (`agents/backend`), Zod validator.

---

## Part 1 — Backend: accept `taxonomy_node_id` (tiny, ships first)

**Files:** `validators/public.validator.ts`, `routes/public.ts`.

- [ ] **Step 1 — Validator.** In `leadRequirementsSchema` (`public.validator.ts:79`): add `taxonomy_node_id: z.string().max(60).optional()`, and make the legacy fields optional so the new node-driven payload validates:
  - `category: z.enum([...]).optional()`
  - `type_slug: z.string().max(100).optional()`
  - add a `.refine(d => d.taxonomy_node_id || d.type_slug, 'Pick a property type')` so one of them is always present (back-compat + new).

- [ ] **Step 2 — Handler.** In `routes/public.ts` `POST /lead-requirements` (line 578): destructure `taxonomy_node_id` from the body, and pass it into the existing resolver call (line 593):

```ts
const { intent, category, type_slug, taxonomy_node_id, budget_min, budget_max, budget_type, location, name, phone, email, amenities, source } = req.body;
...
const demandTax = await resolveDemandTaxonomy({
    demand_taxonomy_node_id: taxonomy_node_id || undefined,   // precise node-id fast-path (byNodeId)
    main_category: category || undefined,
    property_type: type_slug || category || undefined,        // legacy fallback when no node id
    amenities: amenities || undefined,
});
```
  No other handler change — when `taxonomy_node_id` is set, the resolver returns that exact node + its legacy ids; the contact upsert + matching already consume `demandTax.*`.

- [ ] **Step 3 — tsc diff = 381 baseline.** Commit backend; merge + deploy backend.

---

## Part 2 — Frontend: taxonomy-driven picker in `RequirementCapture`

**Files:** `agents/website/src/components/RequirementCapture.tsx`, `agents/website/src/lib/api.ts` (type).

- [ ] **Step 1 — Type.** In `lib/api.ts`, extend `LeadRequirementsData`: add `taxonomy_node_id?: string;` and make `category`/`type_slug` optional (the node id is now the primary classifier).

- [ ] **Step 2 — Load the tree.** In `RequirementCapture`, replace the `CATEGORIES` const + the `getFlatPropertyTypes` effect with `getTaxonomyTree()` (already imported pattern — see `ChatTaxonomyPicker`). On mount, fetch the tree once.

```ts
const [tree, setTree] = useState<TaxonomyTreeNode[]>([]);
useEffect(() => { getTaxonomyTree().then(setTree).catch(() => setTree([])); }, []);
// top-level nodes = categories; their descendant LEAVES (no children) = selectable property types
const leavesUnder = (n: TaxonomyTreeNode): TaxonomyTreeNode[] =>
    n.children?.length ? n.children.flatMap(leavesUnder) : [n];
```

- [ ] **Step 3 — Step 1 (category).** Render the **top-level tree nodes** as the category cards (instead of the hardcoded 3) — keep the Home/Building/Landmark icons keyed by node slug, with a sensible default icon. Store the chosen top-level node.

- [ ] **Step 4 — Step 2 (type).** Replace the `FlatPropertyType` `<select>` with one populated from `leavesUnder(chosenCategoryNode)` — `option.value = leaf.id` (the taxonomy node id), `option.label = leaf.name`. Store `taxonomy_node_id = leaf.id`. Budget + location unchanged.

- [ ] **Step 5 — Submit.** Send `taxonomy_node_id` (+ keep `category` = chosen top-level slug and `type_slug` = leaf slug for back-compat/analytics). `canProceedStep2` now checks `taxonomy_node_id && location`.

- [ ] **Step 6 — Build + verify locally** (`npm run build` in `agents/website`), then deploy website (`deploy-agent.js website` — heed `deploy_website_realty_user_pm2` gotcha + the PWA/Next caching).

---

## Part 3 — (Optional follow-up) capture key attributes for sharper matches

- [ ] After a type is chosen, call `getNodeFields(taxonomy_node_id)` and render the 1–2 most useful **required** fields (e.g. BHK for residential) as quick selects → submit them in `amenities`/a `demand_schema_values` payload (backend already folds `amenities` via `foldLegacyDemand`; extend to accept `schema_values` if we want BHK in `demand_schema_values`). Defer unless wanted — the node id alone already fixes the misclassification.

---

## Verification
- On `realtypandit.in`, open the popup: Step 1 shows the **live taxonomy categories**; Step 2's types are the **taxonomy leaves** for that category (matches the admin/post-property options).
- Submit a test requirement (a phone you control). Confirm via DB: the new Contact has the **exact `demand_taxonomy_node_id`** picked (not `needs_taxonomy_review`), correct `sub_category_id`/`category_id`/`type_id`, and a deal was created (`ensureDealForLead`). The "X properties found" matches reflect the taxonomy node.
- Regression: a legacy client still posting `category`+`type_slug` (no node id) still works (resolver falls back).

## Skills used while executing
- **superpowers:executing-plans** — inline, phase checkpoints.
- **verify** + **playwright** — drive the live popup; confirm taxonomy-driven options + a submitted lead's `demand_taxonomy_node_id` in the DB.
- **verification-before-completion** — DB evidence + the popup screenshot before done.
- **Project runbooks** — `deploy.md` + `deploy_website_realty_user_pm2` (website deploy gotcha); GlitchTip on the changed endpoint.

## Self-review
- **Coverage:** popup now taxonomy-driven (Part 2) + backend accepts the node id precisely (Part 1); attributes optional (Part 3). ✅
- **Reuse / low-risk:** `getTaxonomyTree`/`getNodeFields` + `ChatTaxonomyPicker` pattern already on the site; resolver's `byNodeId` fast-path already exists; contact/matching/deal flow unchanged. Back-compat preserved via the optional legacy fields + resolver fallback.
- **Type consistency:** `taxonomy_node_id` added to `LeadRequirementsData`, the validator, and the handler destructure — all aligned to `resolveDemandTaxonomy({ demand_taxonomy_node_id })`.

## On completion
Update `reference_demand_canonical_sot` (or a note): the website lead popup now submits `taxonomy_node_id`; backend `/public/lead-requirements` consumes it via the resolver's node-id fast-path.
