# Inventory Taxonomy — Phase 1d (Dynamic Admin Add-Inventory) Implementation Plan

> **STATUS: SHIPPED 2026-05-24.** All 5 tasks deployed to prod. Migration `20260525000000_taxonomy_legacy_map` applied; `backfill_node_legacy` set 18/18 (0 skipped). GATE 1 (curl admin→200, dist + SW stamp `v20260525a` present) PASS. GATE 2 (regression: whatsapp/web→old `main_category`/`flat_property_type_id`; admin→new `taxonomy`/`schema_fields`) PASS. Schema differentiation verified on real prod data: residential→BHK, plot→FAR/side-opens/boundary (no BHK/rooms), Hotel→Rooms (no BHK). GlitchTip clean (no new errors). Real repo layout was `agents/backend` + `agents/frontend`. commit() refined: injects node.legacy_flat_property_type_id into answers.flat_property_type_id early so the existing classification path runs unchanged (WhatsApp/web create path byte-identical). **Two frontend renderers:** admin "+ Add Property" uses `InventoryModal.tsx` (minHeight 60), standalone uses `AddInventory.tsx` (minHeight 80) — both got the `taxonomy`+`schema_fields` cases (first deploy patched only AddInventory → admin rendered blank → fixed in 2nd frontend deploy `v20260525b`). See memory `reference_add_inventory_two_renderers`. **Playwright visual proof DONE** (super_boss JWT cookie via context.addCookies): cascading picker renders (Residential→Builder Floor→Builder Flat (Back)); residential schema shows BHK (no Rooms); commercial→Hospitality→Hotel shows Rooms (no BHK). Screenshots: `1d-taxonomy-picker.png`, `1d-schema-fields-residential.png`, `1d-schema-fields-commercial-hotel.png`. **v2 pending:** extend `taxonomy`+`schema_fields` steps to WhatsApp/web/voice.

> **For agentic workers:** execute task-by-task with checkpoints (project uses `deploy-agent.js`, no git). Steps use `- [ ]`.
> **HIGHEST-RISK PHASE** — modifies the shared workflow engine + a schema migration. Spec: `docs/plans/2026-05-24-inventory-taxonomy-phase1d-dynamic-form-design.md`. Builds on 1a/1b/1c.
> **TWO HARD GATES:** (1) verify `cd frontend && npm run build` (NOT `tsc --noEmit`) + `curl admin→200` after deploy — see `feedback_frontend_build_verify` (it caused an outage). (2) a WhatsApp/web property-onboarding run must still use the OLD steps unchanged.

**Goal:** In the ADMIN add-inventory form, pick the property type from the new 57-type taxonomy tree and render that type's fields (BHK/Rooms/FAR/…) from its `NodeField` schema, saving to `inventory.specs` + `taxonomy_node_id`, while keeping legacy classification populated so matching/search/sharing keep working. WhatsApp/web/voice unchanged in v1.

**Architecture:** Two new workflow steps (`taxonomy`, `schema_fields`) gated to `_source==='admin'`; the existing `main_category`/`flat_property_type_id`/`configuration_id` steps gated to skip for admin. Engine builds the schema-field list as step metadata (mirroring `address_config`) and, on `commit()`, sets `taxonomy_node_id` + merges schema answers into `specs` + derives legacy IDs from `TaxonomyNode.legacy_*` (populated by inverting 1b's mapping).

**Tech Stack:** Express/Prisma/TS workflow engine, React `useWorkflow`/`AddInventory.tsx`.

---

## File Structure
| File | Responsibility | Action |
|---|---|---|
| `backend/prisma/schema.prisma` | `TaxonomyNode.legacy_sub_category_id/legacy_type_id/legacy_flat_property_type_id` | Modify |
| `backend/prisma/migrations/20260525000000_taxonomy_legacy_map/migration.sql` | Migration | Create |
| `backend/prisma/backfill_node_legacy.ts` | Populate node.legacy_* by inverting 1b mapping (data-driven from existing inventory) | Create |
| `backend/src/workflows/workflow_definition.ts` | New `taxonomy` + `schema_fields` steps; `_source` gating on old type steps | Modify |
| `backend/src/workflows/workflow_engine.ts` | schema_fields metadata + commit() node→specs+legacy | Modify (~1100, ~495-635, ~747-834) |
| `frontend/src/components/AddInventory.tsx` | Render cases for `taxonomy` + `schema_fields` | Modify (~235-276) |
| `frontend/index.html` | SW bump | Modify |

---

## Task 1: Node→legacy mapping (migration + backfill)

**Files:** Modify `schema.prisma`; Create migration + `prisma/backfill_node_legacy.ts`

- [ ] **Step 1: Add columns to `TaxonomyNode`** (after `labels_json`):
```prisma
  legacy_sub_category_id      String?
  legacy_type_id              String?
  legacy_flat_property_type_id String?
```

- [ ] **Step 2: Create migration** `backend/prisma/migrations/20260525000000_taxonomy_legacy_map/migration.sql`:
```sql
ALTER TABLE "taxonomy_nodes" ADD COLUMN "legacy_sub_category_id" TEXT;
ALTER TABLE "taxonomy_nodes" ADD COLUMN "legacy_type_id" TEXT;
ALTER TABLE "taxonomy_nodes" ADD COLUMN "legacy_flat_property_type_id" TEXT;
```

- [ ] **Step 3: Create the backfill** `backend/prisma/backfill_node_legacy.ts` — data-driven: for each flat_property_type→node from 1b's MAP, set the node's legacy_flat_property_type_id, and derive legacy_sub_category_id/legacy_type_id from what existing inventory of that flat type actually uses (most common). Paste:
```ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
// Same mapping as 1b (flat_property_type.name -> leaf TYPE node name + root category).
const MAP: Record<string, { type: string; cat: string }> = {
  'Apartment / Gated Society': { type: 'Flat', cat: 'Residential' },
  'Builder Floor': { type: 'Independent Floor', cat: 'Residential' },
  'Builder Flat Front Facing': { type: 'Builder Flat (Front)', cat: 'Residential' },
  'Builder Flat Back Facing': { type: 'Builder Flat (Back)', cat: 'Residential' },
  'Land / Plot': { type: 'Authority Plot', cat: 'Residential' },
  'Independent House / Villa': { type: 'Villa', cat: 'Residential' },
  'Commercial Shops': { type: 'Open Market Shop', cat: 'Commercial' },
  'Commercial Office / Space': { type: 'Commercial Complex office', cat: 'Commercial' },
  'Ready to Move Office Space': { type: 'Commercial Complex office', cat: 'Commercial' },
  'Co-working Office Space': { type: 'Co working Office', cat: 'Commercial' },
  'Factory': { type: 'Factory', cat: 'Commercial' },
  'Commercial Land / Inst. Land': { type: 'Commercial Land', cat: 'Commercial' },
  'Industrial Lands / Plots': { type: 'Industrial Land/Plot', cat: 'Commercial' },
  'Commercial Showrooms': { type: 'Open Market Showroom', cat: 'Commercial' },
  'Guest-House / Banquet-Halls': { type: 'Guest House', cat: 'Commercial' },
  'Agricultural Land': { type: 'Agriculture Land/Orchard', cat: 'Commercial' },
  'WareHouse': { type: 'ware House', cat: 'Commercial' },
  'Hotel / Resorts': { type: 'Hotel', cat: 'Commercial' },
};
async function rootCat(id: string): Promise<string> {
  let cur = await prisma.taxonomyNode.findUnique({ where: { id }, select: { name: true, parent_id: true } });
  while (cur && cur.parent_id) cur = await prisma.taxonomyNode.findUnique({ where: { id: cur.parent_id }, select: { name: true, parent_id: true } });
  return cur?.name ?? '';
}
async function main() {
  const typeNodes = await prisma.taxonomyNode.findMany({ where: { node_kind: 'TYPE' }, select: { id: true, name: true } });
  const fpts = await prisma.flatPropertyType.findMany({ select: { id: true, name: true } });
  let set = 0;
  for (const [fptName, m] of Object.entries(MAP)) {
    const fpt = fpts.find(f => f.name === fptName); if (!fpt) continue;
    let nodeId: string | null = null;
    for (const n of typeNodes.filter(n => n.name === m.type)) { if ((await rootCat(n.id)) === m.cat) { nodeId = n.id; break; } }
    if (!nodeId) continue;
    // derive legacy sub_category_id/type_id from existing inventory of this flat type
    const inv = await prisma.inventory.findFirst({ where: { flat_property_type_id: fpt.id, sub_category_id: { not: null } }, select: { sub_category_id: true, type_id: true } });
    await prisma.taxonomyNode.update({ where: { id: nodeId }, data: {
      legacy_flat_property_type_id: fpt.id,
      legacy_sub_category_id: inv?.sub_category_id ?? undefined,
      legacy_type_id: inv?.type_id ?? undefined,
    } });
    set++;
  }
  console.log('NODE_LEGACY_BACKFILL_DONE set=' + set);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 4:** `cd backend && npx prisma generate && npx tsc --noEmit 2>&1 | grep -E "backfill_node_legacy|schema" || echo CLEAN`.

---

## Task 2: Workflow steps (`taxonomy` + `schema_fields`), admin-gated

**Files:** Modify `backend/src/workflows/workflow_definition.ts` (steps `~22-412`; `configuration_id` `~205-219`)

- [ ] **Step 1:** Read the `WorkflowStep` type (`workflow_types.ts:8-68`) and the `main_category` / `flat_property_type_id` / `configuration_id` step objects to match the exact field names.

- [ ] **Step 2:** Add `skip_when: [{ field: '_source', operator: 'equals', value: 'admin' }]` to the existing `main_category`, `flat_property_type_id`, and `configuration_id` steps (so admin skips the old type path). If a step already has `skip_when`, append this rule to the array.

- [ ] **Step 3:** Insert two NEW steps in `INVENTORY_WORKFLOW_STEPS` immediately before `address_block`:
```ts
  {
    id: 'taxonomy', group: 'property_type',
    question: 'Select the property type',
    input_type: 'taxonomy', field: 'taxonomy_node_id',
    required: true,
    show_when: [{ field: '_source', operator: 'equals', value: 'admin' }],
  },
  {
    id: 'schema_fields', group: 'property_type',
    question: 'Property details',
    input_type: 'schema_fields', field: 'schema_values',
    required: false,
    show_when: [
      { field: '_source', operator: 'equals', value: 'admin' },
      { field: 'taxonomy_node_id', operator: 'exists' },
    ],
  },
```
(Match the real `WorkflowStep` shape from Step 1 — add any required keys like `options_source: 'static'` with empty options if the type system needs them.)

- [ ] **Step 4:** `cd backend && npx tsc --noEmit 2>&1 | grep workflow_definition || echo CLEAN`.

---

## Task 3: Engine — schema_fields metadata + commit()

**Files:** Modify `backend/src/workflows/workflow_engine.ts`

- [ ] **Step 1: schema_fields metadata.** In `getStepMetadata()` (the fn that builds `address_config` for `address_block`, ~line 1100), add a branch: when `step.id === 'schema_fields'`, fetch the chosen node's fields and return them as metadata:
```ts
if (step.id === 'schema_fields') {
    const nodeId = answers.taxonomy_node_id;
    if (!nodeId) return { schema_fields: [] };
    const nf = await prisma.nodeField.findMany({
        where: { taxonomy_node_id: nodeId },
        orderBy: { display_order: 'asc' },
        include: { field: true },
    });
    return { schema_fields: nf.map(x => ({
        key: x.field.key,
        label: x.label_override || x.field.label,
        input_type: x.field.input_type,
        required: x.required,
        options: (x.options_override as any) ?? (x.field.options_json as any) ?? null,
        unit: x.field.unit,
    })) };
}
```

- [ ] **Step 2: commit() — node + specs + legacy derivation.** In `commit()` where specs/classification are built (specs ~line 620-635; flat_type→classification resolution ~line 495-575; `prisma.inventory.create` ~line 747-834), add: when `answers.taxonomy_node_id` is present, override the classification path. Insert before the `inventory.create`:
```ts
let taxonomyNodeId: string | null = answers.taxonomy_node_id || null;
let nodeLegacy: { category?: string; sub_category_id?: string | null; type_id?: string | null; flat_property_type_id?: string | null; needsReview: boolean } | null = null;
if (taxonomyNodeId) {
    const node = await prisma.taxonomyNode.findUnique({ where: { id: taxonomyNodeId },
        select: { legacy_sub_category_id: true, legacy_type_id: true, legacy_flat_property_type_id: true, parent_id: true } });
    // root ancestor → legacy category string
    let rootName = ''; let cur: any = node ? { parent_id: node.parent_id } : null;
    if (node) { let c = await prisma.taxonomyNode.findUnique({ where: { id: taxonomyNodeId }, select: { name: true, parent_id: true } });
        while (c && c.parent_id) c = await prisma.taxonomyNode.findUnique({ where: { id: c.parent_id }, select: { name: true, parent_id: true } });
        rootName = c?.name || ''; }
    nodeLegacy = {
        category: rootName.toLowerCase().includes('commercial') ? 'commercial' : 'residential',
        sub_category_id: node?.legacy_sub_category_id ?? null,
        type_id: node?.legacy_type_id ?? null,
        flat_property_type_id: node?.legacy_flat_property_type_id ?? null,
        needsReview: !node?.legacy_sub_category_id,
    };
    // merge schema_values into specs (keyed by field key)
    const sv = answers.schema_values || {};
    for (const [k, v] of Object.entries(sv)) { if (v !== undefined && v !== null && v !== '') (specs as any)[k] = v; }
}
```
Then in the `prisma.inventory.create({ data: { … } })`, add/override:
```ts
            taxonomy_node_id: taxonomyNodeId ?? undefined,
            needs_taxonomy_review: nodeLegacy?.needsReview ?? false,
            // when taxonomy chosen, prefer node-derived legacy classification:
            category: nodeLegacy?.category ?? /* existing category expr */,
            sub_category_id: nodeLegacy ? (nodeLegacy.sub_category_id ?? undefined) : /* existing */,
            type_id: nodeLegacy ? (nodeLegacy.type_id ?? undefined) : /* existing */,
            flat_property_type_id: nodeLegacy?.flat_property_type_id ?? /* existing flat_property_type_id expr */,
```
(Wire these into the EXISTING create-data object — read ~747-834 and replace the relevant fields with the conditional expressions, keeping the non-taxonomy path intact for WhatsApp/web.)

- [ ] **Step 3:** `cd backend && npx tsc --noEmit 2>&1 | grep workflow_engine || echo CLEAN`.

---

## Task 4: Frontend render — `taxonomy` + `schema_fields`

**Files:** Modify `frontend/src/components/AddInventory.tsx` (render switch `~235-276`); use `getTaxonomyTree` (already in client.ts from 1c). `metadata.schema_fields` comes from the engine.

- [ ] **Step 1:** Read the render switch (~235-276) + how `metadata`/`options`/`answerStep` flow (the `address_block` case `~274` is the closest analog — it consumes `metadata.address_config`).

- [ ] **Step 2:** Add a `taxonomy` case — a cascading picker. Render nested dropdowns from `getTaxonomyTree()` (Category → Sub → [Group] → Type); on leaf selection call the step's answer handler with the leaf node id. Provide a small `TaxonomyPicker` component in the same file:
```tsx
function TaxonomyPicker({ onPick }: { onPick: (nodeId: string) => void }) {
  const [tree, setTree] = React.useState<any[]>([]);
  const [path, setPath] = React.useState<any[]>([]); // selected node at each level
  React.useEffect(() => { getTaxonomyTree().then(d => setTree(d.tree || [])); }, []);
  const levels: any[][] = [];
  let opts = tree;
  for (let i = 0; i <= path.length; i++) { if (!opts || !opts.length) break; levels.push(opts); opts = path[i]?.children || []; }
  return (<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
    {levels.map((lvl, i) => (
      <select key={i} value={path[i]?.id || ''} onChange={e => {
        const node = lvl.find((n: any) => n.id === e.target.value);
        const np = path.slice(0, i); if (node) np.push(node); setPath(np);
        if (node && (!node.children || node.children.length === 0)) onPick(node.id); // leaf TYPE
      }} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-secondary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13 }}>
        <option value="">{i === 0 ? 'Category…' : 'Select…'}</option>
        {lvl.map((n: any) => <option key={n.id} value={n.id}>{n.name}</option>)}
      </select>
    ))}
  </div>);
}
```
Wire the case: `if (step.input_type === 'taxonomy') return <TaxonomyPicker onPick={(id) => onAnswer(id)} />;` (use the same answer-submit fn the other cases use — match the existing `answerStep`/`onAnswer` prop name in StepPanel).

- [ ] **Step 3:** Add a `schema_fields` case — render `metadata.schema_fields` as inputs, collect into an object, submit as the step answer:
```tsx
function SchemaFields({ fields, onSubmit }: { fields: any[]; onSubmit: (v: Record<string, any>) => void }) {
  const [vals, setVals] = React.useState<Record<string, any>>({});
  const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-secondary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, width: '100%', boxSizing: 'border-box' };
  return (<div>
    {fields.map((f) => (
      <div key={f.key} style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>{f.label}{f.required ? ' *' : ''}</label>
        {Array.isArray(f.options) && f.options.length
          ? <select style={inp} value={vals[f.key] || ''} onChange={e => setVals({ ...vals, [f.key]: e.target.value })}><option value="">Select…</option>{f.options.map((o: string) => <option key={o} value={o}>{o}</option>)}</select>
          : <input style={inp} type={f.input_type === 'number' ? 'number' : 'text'} value={vals[f.key] || ''} onChange={e => setVals({ ...vals, [f.key]: e.target.value })} placeholder={f.unit || ''} />}
      </div>
    ))}
    <button onClick={() => onSubmit(vals)} style={{ ...inp, width: 'auto', cursor: 'pointer', fontWeight: 700, background: 'var(--accent-primary)', color: '#fff', border: 'none' }}>Continue</button>
  </div>);
}
```
Wire: `if (step.input_type === 'schema_fields') return <SchemaFields fields={metadata?.schema_fields || []} onSubmit={(v) => onAnswer(v)} />;`

- [ ] **Step 4: BUILD-GATE (post-outage rule).** `cd frontend && npm run build` (NOT `tsc --noEmit`). Must exit 0 and emit `dist/index.html`. Fix any `tsc -b` errors before proceeding.

---

## Task 5: Deploy + verify (two hard gates)

- [ ] **Step 1:** SW bump `frontend/index.html` → `<!-- v20260525a-dynamic-inventory-form-swbust -->`.
- [ ] **Step 2:** Deploy backend; **apply migration** `ssh … 'cd /var/www/realty-pandit/backend && npx prisma migrate deploy'`; **run backfill** `npx ts-node prisma/backfill_node_legacy.ts` (expect `set≈18`).
- [ ] **Step 3:** Deploy frontend. **GATE 1:** `curl -s -o /dev/null -w "%{http_code}" https://admin.realtypandit.in/` == **200** and `ls dist/index.html` exists. (Do NOT trust deploy "SUCCESS".)
- [ ] **Step 4: GATE 2 (regression).** Server E2E: `POST /api/workflow/next-step` with `source:'whatsapp'` from `main_category` → must return `flat_property_type_id` (OLD path, unchanged). With `source:'admin'` past `main_category` → must return the `taxonomy` step (NEW path). Confirms admin-gating works + WhatsApp untouched.
- [ ] **Step 5: Admin E2E (Playwright, Chrome closed):** admin add-inventory → pick Residential▸Builder Floor▸Builder Flat (Front) → BHK shows (no Rooms); pick a Plot → FAR/Side-Opens, no BHK/Rooms; pick a Hotel → Rooms (no BHK). Complete a save → assert `inventory.taxonomy_node_id` set, `specs` has the field keys, legacy `category`/`sub_category_id` populated. Screenshot.
- [ ] **Step 6:** GlitchTip clean; update plan status + memory; note v2 = extend to WhatsApp/web/voice.

---

## Notes / risk
- **Backward-compat is the point:** taxonomy-created inventory still gets legacy `category`/`sub_category_id`/`type_id`/`flat_property_type_id` (from the node's `legacy_*`), so matching/search/sharing (still on legacy until P2–P5) keep working. If a node lacks a legacy map, `needs_taxonomy_review=true` + null sub_category_id (degrades for that one until P3).
- **Admin-gating** via `_source` keeps WhatsApp/web/voice on the proven flow — Gate 2 verifies it.
- **Build gate** is mandatory (the 2026-05-24 outage came from a masked `tsc -b` failure wiping dist).
- v2 (separate plan): extend the two new steps to WhatsApp/web/voice (render cascading tree + schema fields in the WhatsApp adapter), then retire the old flat_property_type steps.
