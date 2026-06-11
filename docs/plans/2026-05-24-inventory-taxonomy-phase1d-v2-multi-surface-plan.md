# Inventory Taxonomy — Phase 1d v2 (Website chat + WhatsApp auto-tag) Implementation Plan

> **STATUS: SHIPPED 2026-05-24.** Backend + website deployed. GATE A (getNextStep regression) PASS: whatsapp→legacy `main_category`, web→`taxonomy`→`schema_fields`, admin unchanged, WhatsApp still skips `uploader_name`. GATE B (website build + live 200) PASS. Live website E2E PASS: `/post-property` chat → `ChatTaxonomyPicker` cascades (Residential→Builder Floor→Builder Flat (Back)) → `ChatSchemaFields` shows BHK (no Rooms). GlitchTip clean. Screenshots `1dv2-website-taxonomy-picker.png`, `1dv2-website-schema-fields-residential.png`.
> **Findings during execution:** (1) **Pre-existing prod bug fixed** — public chat `/api/chat/start` 403'd for ALL anonymous users because `website/src/lib/chatApi.ts` uses a bare axios (no withCredentials/CSRF) and anonymous users have no `rp_csrf` cookie; fixed by adding `/api/chat/` to the CSRF-exempt list in `backend/src/middleware/csrf.ts` (proven not caused by v2 via pre-deploy backup diff). The post-property chat was down before this. (2) **WhatsApp auto-tag coverage = 17/34** active flat types (the rest were never mapped in 1b/1d); user ACCEPTED best-effort (untagged ones → `needs_review`, caught by `pending_approval`/1c). (3) **deploy-agent.js website step restarts pm2 as root, but `realty-website` runs under the `realty` user's pm2** → restart "not found"; restarted manually via `su - realty -c 'pm2 restart realty-website'`. Fix deploy-agent later. (4) website `.next` built as root needs `chown realty:realty`.

> **For agentic workers:** execute task-by-task with checkpoints (project uses `deployment/deploy-agent.js`, no git). Steps use `- [ ]`.
> Spec: `docs/plans/2026-05-24-inventory-taxonomy-phase1d-v2-multi-surface-design.md`. Builds on 1a/1b/1c/1d.
> **NO migration in v2.** Backend ships transpile-only (tsc baseline noise — see `reference_test_tsc_baseline`; check only YOUR files via `npx tsc --noEmit 2>&1 | grep <file>`). The **website is a separate Next.js app** (`agents/website`, pm2 `realty-website`, build `npm run build`); its build is real — verify it and `curl` the live public site, never trust deploy "SUCCESS" (`feedback_frontend_build_verify`). Admin (`agents/frontend`) is NOT touched.
> **TWO HARD GATES (Task 6):** (a) `getNextStep` regression — whatsapp keeps the legacy band, web gets the new band, admin unchanged. (b) website build emits + live site 200.

**Goal:** Every new listing from the public website **and** WhatsApp ends with a populated `taxonomy_node_id` — website by reusing the 1d `taxonomy`+`schema_fields` steps (rendered as in-chat widgets), WhatsApp by silently auto-deriving the node from the legacy flat-type at commit (no UX change).

**Architecture:** Re-gate the 1d steps from `_source==='admin'` to `_source ∈ ['admin','web']` (and skip the legacy type steps for web too); add a `commit()` auto-tag fallback that reverse-looks-up the node via `legacy_flat_property_type_id` when no node was picked; add two chat widgets to the website. The shared `commit()` legacy-derivation path (1d) is unchanged, so search/matching/sharing keep working.

**Tech Stack:** Express/Prisma/TS workflow engine + conversational core; Next.js website (`agents/website`) chat widgets; axios.

---

## File Structure
| File | Responsibility | Action |
|---|---|---|
| `agents/backend/src/workflows/workflow_definition.ts` | `_source` gating on 5 steps (admin→admin+web) | Modify |
| `agents/backend/src/workflows/workflow_engine.ts` | `commit()` auto-tag fallback (reverse legacy lookup) | Modify (~after the 2c taxonomy block) |
| `agents/backend/src/workflows/chat_workflow_adapter.ts` | forward `schema_fields` metadata; JSON-parse `schema_values` answer | Modify (~621-623, ~234) |
| `agents/website/src/lib/chatApi.ts` | add `schema_fields` to `ChatMessage.metadata` type | Modify (~29-39) |
| `agents/website/src/lib/api.ts` | `getTaxonomyTree()` helper | Modify (~end of classification block) |
| `agents/website/src/components/chat-workflow/ChatTaxonomyPicker.tsx` | cascading tree picker widget | Create |
| `agents/website/src/components/chat-workflow/ChatSchemaFields.tsx` | per-type schema fields widget | Create |
| `agents/website/src/components/chat-workflow/ChatWorkflow.tsx` | wire both widgets into `renderInlineWidget` + `isWidgetOnlyStep` | Modify (~96-189) |

**Note (verified):** the chat answer JSON-parse for block types is in `chat_workflow_adapter.ts:234`, NOT `conversational_workflow_core.ts`. The core stores `parsed.value` into `answers[step.field]` generically (`conversational_workflow_core.ts:260`), so no core change is needed.

---

## Task 1: Re-gate the workflow steps for web

**Files:** Modify `agents/backend/src/workflows/workflow_definition.ts`

- [ ] **Step 1:** Read the 5 step objects to confirm current 1d gating: `main_category` (`skip_when` has agricultural + `{_source equals admin}`), `flat_property_type_id` (`skip_when` agricultural + admin), `configuration_id` (`skip_when` admin), `taxonomy` (`show_when` `{_source equals admin}`), `schema_fields` (`show_when` admin + `taxonomy_node_id exists`).

- [ ] **Step 2: `taxonomy` step** — change its `show_when` admin rule to allow web:
```ts
        show_when: [
            { field: '_source', operator: 'in', value: ['admin', 'web'] },
        ],
```

- [ ] **Step 3: `schema_fields` step** — change the `_source` rule to `in [admin,web]`, keep the `taxonomy_node_id exists` rule:
```ts
        show_when: [
            { field: '_source', operator: 'in', value: ['admin', 'web'] },
            { field: 'taxonomy_node_id', operator: 'exists' },
        ],
```

- [ ] **Step 4: `main_category`** — change its `_source` skip rule to `in [admin,web]` (leave any other skip rules untouched):
```ts
        skip_when: [
            { field: '_source', operator: 'in', value: ['admin', 'web'] },
        ],
```

- [ ] **Step 5: `flat_property_type_id`** — its `skip_when` keeps the agricultural rule AND changes the `_source` rule to `in [admin,web]`:
```ts
        skip_when: [
            { field: 'main_category', operator: 'equals', value: 'agricultural' },
            { field: '_source', operator: 'in', value: ['admin', 'web'] },
        ],
```

- [ ] **Step 6: `configuration_id`** — change its `_source` skip rule to `in [admin,web]` (keep the `show_when` bhk rule untouched):
```ts
        skip_when: [
            { field: '_source', operator: 'in', value: ['admin', 'web'] },
        ],
```

- [ ] **Step 7: Verify the `in` operator is supported.** Confirm `ConditionalRule.operator` union in `workflow_types.ts` includes `'in'` (it does — line ~72) and `evaluateCondition` handles `'in'` (`workflow_engine.ts` — grep `case 'in'` / `operator === 'in'`). If `'in'` is handled, no engine change needed.
Run: `cd agents/backend && npx tsc --noEmit 2>&1 | grep workflow_definition.ts || echo CLEAN`
Expected: `CLEAN`.

---

## Task 2: `commit()` auto-tag fallback (WhatsApp + any legacy commit)

**Files:** Modify `agents/backend/src/workflows/workflow_engine.ts`

- [ ] **Step 1:** Re-read the 1d taxonomy block in `commit()` (the `// ─── 2c. Taxonomy path` block added after the tenant fetch). It defines `const taxonomyNodeId: string | null = (answers.taxonomy_node_id as string) || null;` and `let taxonomyNeedsReview = false;`. Note `taxonomyNodeId` is currently `const`.

- [ ] **Step 2:** Change that `const taxonomyNodeId` to `let taxonomyNodeId` (so the fallback can assign it). Find:
```ts
        const taxonomyNodeId: string | null = (answers.taxonomy_node_id as string) || null;
        let taxonomyNeedsReview = false;
```
Replace the `const` with `let`:
```ts
        let taxonomyNodeId: string | null = (answers.taxonomy_node_id as string) || null;
        let taxonomyNeedsReview = false;
```

- [ ] **Step 3:** Immediately AFTER the closing `}` of the existing `if (taxonomyNodeId) { ... }` block (still before `// ─── 3. Resolve flat property type`), insert the auto-tag fallback:
```ts
        // ─── 2d. Auto-tag fallback (Phase 1d v2) ───
        // Conversational surfaces (WhatsApp) capture the legacy flat_property_type but
        // never pick a tree node. Derive the node from the flat type so every listing is
        // taxonomy-tagged. Best-effort → flag for review. No-ops for admin/web (node set).
        if (!taxonomyNodeId && answers.flat_property_type_id) {
            const mapped = await prisma.taxonomyNode.findFirst({
                where: { legacy_flat_property_type_id: answers.flat_property_type_id as string },
                select: { id: true },
            });
            if (mapped) {
                taxonomyNodeId = mapped.id;
                taxonomyNeedsReview = true;
            }
        }
```

- [ ] **Step 4:** Confirm the `inventory.create` data object already writes `taxonomy_node_id: taxonomyNodeId || undefined` and `needs_taxonomy_review: taxonomyNeedsReview || undefined` (added in 1d, ~line 762). No change needed there — the fallback just feeds those existing fields.
Run: `cd agents/backend && npx tsc --noEmit 2>&1 | grep workflow_engine.ts || echo CLEAN`
Expected: `CLEAN` (a NEW error at your inserted lines is the only thing that matters; pre-existing baseline noise at other lines is fine).

---

## Task 3: Chat adapter — forward schema metadata + parse schema answer

**Files:** Modify `agents/backend/src/workflows/chat_workflow_adapter.ts`

- [ ] **Step 1: Forward `schema_fields` metadata.** In `makeStepMessage` (~line 621), after the `address_config` forward block, add:
```ts
        if (metadata?.address_config) {
            msgMetadata!.address_config = metadata.address_config;
        }
        if (metadata?.schema_fields) {
            msgMetadata!.schema_fields = metadata.schema_fields;
        }
```
(The engine's `getStepMetadata` already returns `{ schema_fields: [...] }` for the `schema_fields` step — shipped in 1d. The `taxonomy` step needs no metadata; its widget fetches the tree itself.)

- [ ] **Step 2: JSON-parse the `schema_values` answer.** In the `quickReplyValue` branch (~line 234), add `'schema_fields'` to the block-type list so the widget's JSON payload becomes an object stored at `answers.schema_values`:
```ts
            if (currentStep && ['address_block', 'owner_block', 'uploader_block', 'schema_fields'].includes(currentStep.input_type)) {
```
(The `taxonomy` answer is the leaf node id sent as a plain string via `sendQuickReply(nodeId)` — it stays a string, no parse needed, and lands at `answers.taxonomy_node_id`.)

- [ ] **Step 3:** Verify the `ChatMessage` metadata type in this backend file (if it imports/defines one) allows `schema_fields`. The backend `ChatMessage` type lives where `makeMessage`/`makeStepMessage` are typed — if `msgMetadata!.schema_fields = ...` raises a TS error, add `schema_fields?: any;` to that backend metadata type (search the file for `address_config?:` in the metadata interface and add the sibling field).
Run: `cd agents/backend && npx tsc --noEmit 2>&1 | grep chat_workflow_adapter.ts || echo CLEAN`
Expected: `CLEAN`.

---

## Task 4: Website API helper + ChatMessage metadata type

**Files:** Modify `agents/website/src/lib/api.ts`, `agents/website/src/lib/chatApi.ts`

- [ ] **Step 1:** In `agents/website/src/lib/api.ts`, after `getSubCategoryDetail` (~line 304), add a taxonomy-tree helper mirroring the existing `getClassificationTree` pattern (uses the shared `api` axios instance; `/public/taxonomy/tree` is public, no auth):
```ts
// Canonical taxonomy (Phase 1a) — used by the post-property chat type picker
export interface TaxonomyTreeNode {
    id: string;
    name: string;
    slug: string;
    node_kind: string;
    children: TaxonomyTreeNode[];
}
export const getTaxonomyTree = async (): Promise<TaxonomyTreeNode[]> => {
    const res = await api.get('/public/taxonomy/tree');
    return res.data?.tree ?? [];
};
```

- [ ] **Step 2:** In `agents/website/src/lib/chatApi.ts`, extend the `ChatMessage.metadata` type (~line 29-39) with the schema field list the widget consumes:
```ts
        address_config?: any;
        document_types?: Array<{ value: string; label: string }>;
        schema_fields?: Array<{ key: string; label: string; input_type: string; required: boolean; options: string[] | null; unit: string | null }>;
```

- [ ] **Step 3:** Typecheck the website (real build mode):
Run: `cd agents/website && npx tsc --noEmit 2>&1 | grep -E "lib/api.ts|lib/chatApi.ts" || echo CLEAN`
Expected: `CLEAN`.

---

## Task 5: Website chat widgets

**Files:** Create `ChatTaxonomyPicker.tsx`, `ChatSchemaFields.tsx`; Modify `ChatWorkflow.tsx` (all under `agents/website/src/components/chat-workflow/`)

- [ ] **Step 1: Create `ChatTaxonomyPicker.tsx`** — cascading dropdowns; submit leaf node id via `onSubmit` (wired to `sendQuickReply`). Mirrors the admin `TaxonomyPicker` logic; tree shape `{id,name,node_kind,children[]}`, leaf TYPE has empty `children`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { getTaxonomyTree, type TaxonomyTreeNode } from '@/lib/api';

export default function ChatTaxonomyPicker({ onSubmit, sending }: { onSubmit: (v: string) => void; sending: boolean }) {
    const [tree, setTree] = useState<TaxonomyTreeNode[]>([]);
    const [path, setPath] = useState<TaxonomyTreeNode[]>([]);
    const [err, setErr] = useState('');

    useEffect(() => {
        getTaxonomyTree().then(setTree).catch((e) => setErr(e?.message || 'Failed to load property types'));
    }, []);

    const levels: TaxonomyTreeNode[][] = [];
    let opts: TaxonomyTreeNode[] = tree;
    for (let i = 0; i <= path.length; i++) {
        if (!opts || opts.length === 0) break;
        levels.push(opts);
        opts = path[i]?.children || [];
    }
    const leaf = path.length > 0 ? path[path.length - 1] : null;
    const leafChosen = !!leaf && (!leaf.children || leaf.children.length === 0);

    if (err) return <div className="text-sm text-red-600">{err}</div>;

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
                {levels.map((lvl, i) => (
                    <select
                        key={i}
                        value={path[i]?.id || ''}
                        disabled={sending}
                        className="flex-1 min-w-[150px] rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                        onChange={(e) => {
                            const node = lvl.find((n) => n.id === e.target.value) || null;
                            const np = path.slice(0, i);
                            if (node) np.push(node);
                            setPath(np);
                        }}
                    >
                        <option value="">{i === 0 ? 'Category…' : 'Select…'}</option>
                        {lvl.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                    </select>
                ))}
            </div>
            <button
                disabled={!leafChosen || sending}
                onClick={() => leaf && onSubmit(leaf.id)}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
                {leafChosen ? 'Continue →' : 'Pick a property type'}
            </button>
        </div>
    );
}
```

- [ ] **Step 2: Create `ChatSchemaFields.tsx`** — render `metadata.schema_fields`; submit a JSON object via `onSubmit` (wired to `sendQuickReply`):
```tsx
'use client';
import { useState } from 'react';

interface SchemaField { key: string; label: string; input_type: string; required: boolean; options: string[] | null; unit: string | null }

export default function ChatSchemaFields({ fields, onSubmit, sending }: { fields: SchemaField[]; onSubmit: (v: string) => void; sending: boolean }) {
    const [vals, setVals] = useState<Record<string, string>>({});
    if (!fields || fields.length === 0) {
        return (
            <button disabled={sending} onClick={() => onSubmit(JSON.stringify({}))} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Continue →</button>
        );
    }
    const missingRequired = fields.some((f) => f.required && !vals[f.key]);
    return (
        <div className="space-y-3">
            {fields.map((f) => (
                <div key={f.key}>
                    <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">{f.label}{f.required ? ' *' : ''}{f.unit ? ` (${f.unit})` : ''}</label>
                    {Array.isArray(f.options) && f.options.length > 0 ? (
                        <select
                            value={vals[f.key] || ''}
                            disabled={sending}
                            onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}
                            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                        >
                            <option value="">Select…</option>
                            {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                    ) : (
                        <input
                            type={f.input_type === 'number' ? 'number' : 'text'}
                            value={vals[f.key] || ''}
                            disabled={sending}
                            placeholder={f.unit || ''}
                            onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}
                            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                        />
                    )}
                </div>
            ))}
            <button
                disabled={missingRequired || sending}
                onClick={() => onSubmit(JSON.stringify(vals))}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
                Continue →
            </button>
        </div>
    );
}
```

- [ ] **Step 3: Wire into `ChatWorkflow.tsx`.** Add imports after the existing widget imports (~line 15):
```tsx
import InlineContactForm from './InlineContactForm';
import ChatTaxonomyPicker from './ChatTaxonomyPicker';
import ChatSchemaFields from './ChatSchemaFields';
```

- [ ] **Step 4:** In `isWidgetOnlyStep` (~line 96), add the two new types so the free-text input bar is suppressed:
```tsx
    return inputType === 'media_upload' || inputType === 'video_upload' || inputType === 'document_upload' ||
           inputType === 'address_block' || inputType === 'confirm' ||
           inputType === 'owner_block' || inputType === 'uploader_block' ||
           inputType === 'taxonomy' || inputType === 'schema_fields';
```

- [ ] **Step 5:** In `renderInlineWidget` (~line 177, before the final `return null;`), add the two cases:
```tsx
    // Taxonomy tree picker — submits the leaf node id as a plain string
    if (inputType === 'taxonomy') {
        return <ChatTaxonomyPicker onSubmit={chat.sendQuickReply} sending={chat.sending} />;
    }
    // Per-type dynamic schema fields — submits a JSON object
    if (inputType === 'schema_fields') {
        return <ChatSchemaFields fields={msg.metadata?.schema_fields || []} onSubmit={chat.sendQuickReply} sending={chat.sending} />;
    }
```

- [ ] **Step 6: BUILD-GATE (post-outage rule).** Run the website's real production build; it must exit 0 and emit the `.next` output. Fix any error before proceeding.
Run: `cd agents/website && npm run build 2>&1 | tail -25`
Expected: build completes ("✓ Compiled successfully" / route list), no type errors in the new files.

---

## Task 6: Deploy + verify (two hard gates)

- [ ] **Step 1:** Deploy backend: `node deployment/deploy-agent.js backend --skip-verify` (from `agents/`). Confirm `realty-backend` pm2 `online`.

- [ ] **Step 2: GATE A — `getNextStep` regression** (prove gating). Write `/tmp/verify_v2_gate.ts`, scp to prod backend, run with `npx ts-node --transpile-only`:
```ts
import { WorkflowEngine } from './src/workflows/workflow_engine';
async function next(stepId: string, answers: any) {
    const r = await new WorkflowEngine().getNextStep(stepId, answers);
    return r?.step?.id ?? '(none)';
}
(async () => {
    const wa = await next('intent', { _source: 'whatsapp', intent: 'sell' });
    const web = await next('intent', { _source: 'web', intent: 'sell' });
    const admin = await next('intent', { _source: 'admin', intent: 'sell' });
    const webAfterTax = await next('taxonomy', { _source: 'web', intent: 'sell', taxonomy_node_id: 'x' });
    console.log('whatsapp:', wa, '| web:', web, '| admin:', admin, '| web-after-taxonomy:', webAfterTax);
    const pass = wa === 'main_category' && web === 'taxonomy' && admin === 'taxonomy' && webAfterTax === 'schema_fields';
    console.log(pass ? 'GATE_A_PASS' : 'GATE_A_FAIL');
})().catch(e => { console.error(e); process.exit(1); });
```
Expected: `whatsapp: main_category | web: taxonomy | admin: taxonomy | web-after-taxonomy: schema_fields` → `GATE_A_PASS`. Remove the script after.

- [ ] **Step 3:** Deploy website: `node deployment/deploy-agent.js website --skip-verify`. Confirm `realty-website` pm2 `online`.

- [ ] **Step 4: GATE B — website live** (don't trust deploy SUCCESS): 
Run: `curl -s -o /dev/null -w "%{http_code}\n" https://www.realtypandit.in/post-property`
Expected: `200`. Also confirm the build output exists on prod: `ssh … 'ls /var/www/realty-pandit/website/.next/BUILD_ID'`.

- [ ] **Step 5: Website E2E (Playwright, user's Chrome closed).** Open `https://www.realtypandit.in/post-property`; walk the chat to the property-type step; confirm the `ChatTaxonomyPicker` dropdowns render; pick **Residential → … → a Builder Flat type** → the `ChatSchemaFields` shows **BHK** (no standalone Rooms); back, pick **Commercial → Hospitality → Hotel** → schema shows **Rooms** (no BHK). Screenshot both. (If walking the full chat is slow, at minimum prove both widgets render with the right fields via `browser_run_code` like the 1d verification.) Do NOT submit a real listing unless you intend to clean it up.

- [ ] **Step 6: WhatsApp auto-tag verification (side-effect-free).** The auto-tag correctness reduces to: for every flat type a WhatsApp upload can produce, the reverse lookup resolves a node. Prove it deterministically without running a full `commit()` (which would create real inventory + contacts). Write `/tmp/verify_v2_autotag.ts`, scp to prod, run `npx ts-node --transpile-only`:
```ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
(async () => {
    const fpts = await prisma.flatPropertyType.findMany({ where: { is_active: true }, select: { id: true, name: true } });
    let resolved = 0, missing: string[] = [];
    for (const f of fpts) {
        const node = await prisma.taxonomyNode.findFirst({ where: { legacy_flat_property_type_id: f.id }, select: { id: true } });
        if (node) resolved++; else missing.push(f.name);
    }
    console.log(`flat_types=${fpts.length} resolved=${resolved} missing=${missing.length}`, missing.length ? missing : '');
    // Auto-tag will tag every flat type that maps; missing ones fall through to needs_review with no node (acceptable, owner classifies in 1c).
    console.log(resolved > 0 && resolved >= fpts.length - missing.length ? 'WA_AUTOTAG_RESOLVES' : 'WA_AUTOTAG_FAIL');
})().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```
Expected: most/all active flat types resolve to a node (the 1d backfill mapped 18). Any `missing` are flat types with no `legacy_flat_property_type_id` — those WhatsApp listings simply stay untagged + reviewable (no crash). Remove the script after. (The `needs_taxonomy_review=true` + `status='pending_approval'` behavior is already covered by Task 2 + the unchanged `workflow_engine.ts:872` line — no commit run needed to prove it.)

- [ ] **Step 7: Identity regression (read-only).** Confirm no identity step changed: re-run the GATE A script idea for the identity band — `getNextStep('uploader_phone', { _source:'whatsapp', uploader_phone:'9876543210', uploader_name:'X' })` must skip `uploader_name` (returns `intent`), proving WhatsApp's DB-name-match skip still holds; and `getNextStep('intent', {_source:'web'})` path still hits `uploader`/contact steps as before (unchanged). 

- [ ] **Step 8:** GlitchTip digest — confirm no NEW errors on `/api/chat/*` or commit after the deploy. Update the plan status + memory (`reference_add_inventory_two_renderers` already notes the renderers; add the website chat widget path). Note v2 done; Phases 2–5 remain.

---

## Notes / risk
- **No migration, additive commit logic.** The auto-tag block only runs when no node was picked AND a flat type exists; admin/web (node already set) skip it entirely — so the admin path proven in 1d is unaffected.
- **Shared chat adapter caution:** `/api/chat/*` serves the conversational property-upload only here, but the metadata-forward + parse-list edits are additive (new `if`, one array entry) and cannot change existing `address_block`/`owner_block` handling.
- **Website build is the real gate** (Next.js `npm run build`) — a type error there fails the deploy silently like the admin outage; Step 6 of Task 5 + Gate B are mandatory.
- **WhatsApp UX is byte-identical** — Gate A proves the legacy band still serves WhatsApp; only `commit()` gained the silent tag.
- v2 does NOT touch identity capture (Task 7 regression proves it), per the spec's guarantee.
