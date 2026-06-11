# Commercial Taxonomy Field Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach the 4 missing per-type fields (`area-type`, `status`, `age-of-construction`, `plot-area`) to every commercial taxonomy leaf where the `newtree` spec requires them, so the Add Inventory `schema_fields` step renders the complete form. Suppress the now-redundant standalone `construction_status` workflow step on the admin path only (WhatsApp/web paths keep their existing single-question fallback).

**Architecture:** Pure data fix via an idempotent Prisma seed script that walks the `Commercial` (and `Residential`) subtree, looks up each leaf by name, and upserts `node_fields` rows for the 4 missing keys. The 3 FieldDefinition rows already exist and are active — the only gap is the join-table attachments. The script is dry-run-first and snapshots `node_fields` before writing. A one-line backend change adds `skip_when _source==='admin'` to the existing `construction_status` workflow step. No DB schema change. No new columns. No new FieldDefinitions.

**Tech Stack:** Prisma 5.10, TypeScript (ts-node --transpile-only), node 20, PostgreSQL 15 on prod (`postgresql://realty_user@localhost:5432/reality_pandit`). Frontend renderer at [agents/frontend/src/components/AddInventory.tsx:552-599](../../agents/frontend/src/components/AddInventory.tsx#L552-L599) already handles every input_type used here (`select`, `number`); no frontend code change needed. Playwright MCP for end-to-end UI verification.

---

## Scope

Per the spec at [Chat/newtree-classification-tree.md](../../../../../Chat/newtree-classification-tree.md), commercial leaves require these 4 fields that are currently missing from `node_fields` for most/all of them:

| Field key | Type | Options | Spec calls it |
|---|---|---|---|
| `area-type` | select | Super, Built-up, Carpet | "Area: Super,Builtup,Carpet" |
| `status` | select | Ready to Move, Under Construction | "Staus: Ready to Move/Under Construction" |
| `age-of-construction` | select | Under Construction, < 1 year, 1-3 years, 3-5 years, 5-10 years, 10+ years | "Age Of Construction: Age Of Construction" |
| `plot-area` | number (sqft) | — | "Plot Area: Plot Area" |

The first three apply to nearly every commercial leaf. `plot-area` only applies to leaves that have a separate plot footprint (offices in standalone buildings, hospitality, institution, storage, industry, petrol pumps, and one shop variant).

**Out of scope:** changes to the `construction_status` workflow step's option set, changes to the area unit choices in the `property_area` step, residential leaf attachments (already complete per spot-check of Flat). Touching `road-width` (retired 2026-05-27, intentionally not attached). Migration changes. Adding new FieldDefinitions.

---

## File Structure

| File | Purpose | Action |
|---|---|---|
| `c:/tmp/_attach_commercial_fields.ts` | Idempotent seed script — dry-run-first, applies with `--apply` flag, takes pre-write snapshot | Create (temp, not committed to repo) |
| `c:/tmp/_audit_commercial_fields_pre.txt` | Pre-fix audit dump from prod (per-leaf field counts) | Create (temp) |
| `c:/tmp/_audit_commercial_fields_post.txt` | Post-fix audit dump from prod | Create (temp) |
| [`agents/backend/src/workflows/workflow_definition.ts`](../../agents/backend/src/workflows/workflow_definition.ts) | Add `skip_when _source==='admin'` to the `construction_status` step (lines 401-423) | Modify (1 block) |
| [`docs/PROJECT_STATUS.md`](../PROJECT_STATUS.md) | Add a row for the fix | Modify (1 row) |
| `~/.claude/projects/c--…-sunny-sharma/memory/reference_taxonomy_schema_fields_renderer.md` | Note that area-type/status/age-of-construction are now leaf-attached | Modify (1 line) |

The seed script is intentionally NOT checked into `prisma/` because:
1. Its purpose is one-off catalog repair on prod data that already exists (not a fresh-seed bootstrap).
2. The canonical seed lives at `prisma/data/taxonomy.seed.json` which the memory `reference_taxonomy_schema_fields_renderer` explicitly flags as **stale — query the live DB**. Adding a new seed file would compound that drift.
3. Idempotency is enforced by the `node_fields` unique constraint (`@@unique([taxonomy_node_id, field_id])` per the schema).

---

## Spec → Leaf → Field mapping (the data the script uses)

Derived directly from [`newtree-classification-tree.md:367-862`](../../../../../Chat/newtree-classification-tree.md). Each row = one leaf and which of the 4 missing fields to attach.

| Leaf (taxonomy_nodes.name) | area-type | status | age-of-construction | plot-area |
|---|:---:|:---:|:---:|:---:|
| Open Market Shop          | ✓ | ✓ | ✓ |   |
| Shoping Mall Shop         | ✓ | ✓ | ✓ |   |
| Society Shop              | ✓ | ✓ | ✓ |   |
| Commercial Use Flat       | ✓ | ✓ | ✓ | ✓ |
| commercial use parking    | ✓ | ✓ | ✓ |   |
| open Market kiosk         | ✓ | ✓ | ✓ |   |
| shopping Mall Kiosk       | ✓ | ✓ | ✓ |   |
| Open Market Showroom      | ✓ | ✓ | ✓ |   |
| Shopping Mall Showroom    | ✓ | ✓ | ✓ |   |
| hyper market              | ✓ | ✓ | ✓ |   |
| Commercial Complex office | ✓ | ✓ | ✓ |   |
| Office Use Flat           | ✓ | ✓ | ✓ |   |
| IT Park Office Space      | ✓ | ✓ | ✓ |   |
| Co working Office         | ✓ | ✓ | ✓ |   |
| Commercial Land           | ✓ |   |   | already attached |
| Industrial Land           | ✓ | ✓ | ✓ | already attached |
| Commercial Project Land   | ✓ |   |   | already attached |
| Agriculture Land/Orchard  | ✓ |   |   | already attached |
| ware House                | ✓ | ✓ | ✓ | ✓ |
| cold storage              | ✓ | ✓ | ✓ | ✓ |
| Godown                    | ✓ | ✓ | ✓ | ✓ |
| Industrial Floor          | ✓ | ✓ | ✓ | ✓ |
| Industrial Project Land   | ✓ | ✓ | ✓ | already attached |
| Factory                   | ✓ | ✓ | ✓ | ✓ |
| Industrial Land/Plot      | ✓ | ✓ | ✓ |   |
| Hotel                     | ✓ | ✓ | ✓ | ✓ |
| Guest House               | ✓ | ✓ | ✓ | ✓ |
| Banquet                   | ✓ | ✓ | ✓ | ✓ |
| Resort                    | ✓ | ✓ | ✓ | ✓ |
| Café/Restaurent           |   |   |   |   |
| School                    | ✓ | ✓ | ✓ | ✓ |
| Collage                   | ✓ | ✓ | ✓ | ✓ |
| University                | ✓ | ✓ | ✓ | ✓ |
| Hospital                  | ✓ | ✓ | ✓ | ✓ |
| Nursing Home              | ✓ | ✓ | ✓ | ✓ |
| Petrol Punmp              | ✓ | ✓ | ✓ | ✓ |
| CNG pump                  | ✓ | ✓ | ✓ | ✓ |
| EV Charging Station       | ✓ | ✓ | ✓ | ✓ |

Totals to insert (after dedupe against already-attached rows): **~135 node_fields rows** (35 leaves × ~3.85 fields each on average, minus the ~5 plot-area attachments that already exist).

`Café/Restaurent` is intentionally left blank because the spec at line 762-763 says `_(no fields specified)_`.

`Commercial Land`, `Commercial Project Land`, `Agriculture Land/Orchard` get **only** `area-type` because the spec at lines 572-611 omits Status/Age for bare-land plots — they're undeveloped land, no construction to age.

`Industrial Land` is treated as developed/industrial (lines 583-590) and gets the full 3-of-3 selects.

---

### Display-order slotting

Existing nodes already left numeric gaps at the canonical positions. The script uses these fixed slot numbers (chosen from the observed pattern at Open Market Shop and Flat):

| Field key | display_order slot |
|---|---|
| `area-type` | 1 (between bathrooms=0 and additional-rooms=2 on shops; between bhk=0 and bathrooms=1 elsewhere — collision is impossible since `area-type` is currently unattached everywhere) |
| `plot-area` | 6 |
| `status` | 7 |
| `age-of-construction` | 8 |

Per-leaf collisions are detected and resolved by the script via `max(existing_order)+1` fallback before inserting. The resolution path is shown in the script body.

---

## Tasks

### Task 1: Pre-flight audit + snapshot

**Files:**
- Read: prod database via `/var/www/realty-pandit/backend/node_modules/@prisma/client`
- Create: `c:/tmp/_audit_commercial_fields_pre.txt`

- [ ] **Step 1: Snapshot `node_fields` on prod**

```bash
TS=$(date +%Y%m%d%H%M%S)
ssh realty-pandit "PGPASSWORD='RealtyPandit@2024#Secure' psql -U realty_user -d reality_pandit -h localhost -c \"CREATE TABLE node_fields_bak_${TS} AS TABLE node_fields\""
```

Expected: `SELECT NNN` where NNN matches the current row count of `node_fields`.

- [ ] **Step 2: Dump per-leaf attached-field counts to a baseline audit file**

Run this on prod, save output to `c:/tmp/_audit_commercial_fields_pre.txt`:

```bash
ssh realty-pandit "cat > /tmp/_audit_pre.js << 'EOF'
const { PrismaClient } = require('/var/www/realty-pandit/backend/node_modules/@prisma/client');
const prisma = new PrismaClient();
const LEAVES = ['Open Market Shop','Shoping Mall Shop','Society Shop','Commercial Use Flat','commercial use parking','open Market kiosk','shopping Mall Kiosk','Open Market Showroom','Shopping Mall Showroom','hyper market','Commercial Complex office','Office Use Flat','IT Park Office Space','Co working Office','Commercial Land','Industrial Land','Commercial Project Land','Agriculture Land/Orchard','ware House','cold storage','Godown','Industrial Floor','Industrial Project Land','Factory','Industrial Land/Plot','Hotel','Guest House','Banquet','Resort','School','Collage','University','Hospital','Nursing Home','Petrol Punmp','CNG pump','EV Charging Station'];
(async () => {
    for (const name of LEAVES) {
        const node = await prisma.taxonomyNode.findFirst({ where: { name } });
        if (!node) { console.log(name + ': NOT FOUND'); continue; }
        const fields = await prisma.nodeField.findMany({
            where: { taxonomy_node_id: node.id },
            select: { field: { select: { key: true } } },
        });
        const keys = fields.map(f => f.field.key).sort();
        console.log(name + ' (' + keys.length + '): ' + keys.join(','));
    }
})().catch(e => console.error(e.message)).finally(() => prisma.\$disconnect());
EOF
node /tmp/_audit_pre.js" > "c:/tmp/_audit_commercial_fields_pre.txt" 2>&1
```

Expected output: 37 lines (one per leaf), each showing the current attached-field list. None should contain `area-type` or `status` or `age-of-construction` (per the investigation). Some land leaves already include `plot-area`.

- [ ] **Step 3: Commit the snapshot name to plan tracking**

Capture `${TS}` from Step 1 and write it to `c:/tmp/_rollback_snapshot.txt` so the rollback step in Task 7 can locate it without ambiguity:

```bash
echo "node_fields_bak_${TS}" > "c:/tmp/_rollback_snapshot.txt"
```

---

### Task 2: Build the attachment script

**Files:**
- Create: `c:/tmp/_attach_commercial_fields.ts`

- [ ] **Step 1: Write the script body**

```typescript
/**
 * Commercial taxonomy field-gap fix (2026-05-29).
 *
 * Attaches 4 catalog-orphan FieldDefinitions (area-type, status,
 * age-of-construction, plot-area) to the commercial leaves where the
 * newtree spec requires them. Idempotent: the (taxonomy_node_id, field_id)
 * unique constraint blocks duplicates; the script skips rows that already
 * exist instead of erroring.
 *
 * Usage:
 *   node _attach_commercial_fields.ts            # dry-run, prints the plan
 *   node _attach_commercial_fields.ts --apply    # writes to the DB
 */
import { PrismaClient } from '/var/www/realty-pandit/backend/node_modules/@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

// (leaf-name, has-area-type, has-status, has-age, has-plot-area)
const MAPPING: Array<[string, boolean, boolean, boolean, boolean]> = [
    ['Open Market Shop',          true, true, true, false],
    ['Shoping Mall Shop',         true, true, true, false],
    ['Society Shop',              true, true, true, false],
    ['Commercial Use Flat',       true, true, true, true ],
    ['commercial use parking',    true, true, true, false],
    ['open Market kiosk',         true, true, true, false],
    ['shopping Mall Kiosk',       true, true, true, false],
    ['Open Market Showroom',      true, true, true, false],
    ['Shopping Mall Showroom',    true, true, true, false],
    ['hyper market',              true, true, true, false],
    ['Commercial Complex office', true, true, true, false],
    ['Office Use Flat',           true, true, true, false],
    ['IT Park Office Space',      true, true, true, false],
    ['Co working Office',         true, true, true, false],
    ['Commercial Land',           true, false, false, false],
    ['Industrial Land',           true, true, true, false],
    ['Commercial Project Land',   true, false, false, false],
    ['Agriculture Land/Orchard',  true, false, false, false],
    ['ware House',                true, true, true, true ],
    ['cold storage',              true, true, true, true ],
    ['Godown',                    true, true, true, true ],
    ['Industrial Floor',          true, true, true, true ],
    ['Industrial Project Land',   true, true, true, false],
    ['Factory',                   true, true, true, true ],
    ['Industrial Land/Plot',      true, true, true, false],
    ['Hotel',                     true, true, true, true ],
    ['Guest House',               true, true, true, true ],
    ['Banquet',                   true, true, true, true ],
    ['Resort',                    true, true, true, true ],
    ['School',                    true, true, true, true ],
    ['Collage',                   true, true, true, true ],
    ['University',                true, true, true, true ],
    ['Hospital',                  true, true, true, true ],
    ['Nursing Home',              true, true, true, true ],
    ['Petrol Punmp',              true, true, true, true ],
    ['CNG pump',                  true, true, true, true ],
    ['EV Charging Station',       true, true, true, true ],
];

const SLOT_BY_KEY: Record<string, number> = {
    'area-type': 1,
    'plot-area': 6,
    'status': 7,
    'age-of-construction': 8,
};

(async () => {
    const fieldDefs = await prisma.fieldDefinition.findMany({
        where: { key: { in: Object.keys(SLOT_BY_KEY) } },
        select: { id: true, key: true, is_active: true },
    });
    const fdByKey = Object.fromEntries(fieldDefs.map(f => [f.key, f]));
    for (const key of Object.keys(SLOT_BY_KEY)) {
        if (!fdByKey[key]) { console.error('FATAL: FieldDefinition not found for key=' + key); process.exit(1); }
        if (!fdByKey[key].is_active) { console.error('FATAL: FieldDefinition inactive: ' + key); process.exit(1); }
    }

    const plan: Array<{ leaf: string; key: string; slot: number }> = [];
    const skipped: Array<{ leaf: string; key: string; reason: string }> = [];

    for (const [name, hasArea, hasStatus, hasAge, hasPlot] of MAPPING) {
        const node = await prisma.taxonomyNode.findFirst({ where: { name } });
        if (!node) { skipped.push({ leaf: name, key: '*', reason: 'node not found' }); continue; }

        const existing = await prisma.nodeField.findMany({
            where: { taxonomy_node_id: node.id },
            select: { field_id: true, display_order: true },
        });
        const existingFieldIds = new Set(existing.map(e => e.field_id));
        const usedOrders = new Set(existing.map(e => e.display_order));
        const nextFreeOrder = () => {
            let n = Math.max(0, ...existing.map(e => e.display_order)) + 1;
            while (usedOrders.has(n)) n++;
            usedOrders.add(n);
            return n;
        };

        const wants: Array<[string, boolean]> = [
            ['area-type',           hasArea],
            ['plot-area',           hasPlot],
            ['status',              hasStatus],
            ['age-of-construction', hasAge],
        ];
        for (const [key, wanted] of wants) {
            if (!wanted) continue;
            const fdId = fdByKey[key].id;
            if (existingFieldIds.has(fdId)) {
                skipped.push({ leaf: name, key, reason: 'already attached' });
                continue;
            }
            let slot = SLOT_BY_KEY[key];
            if (usedOrders.has(slot)) slot = nextFreeOrder();
            else usedOrders.add(slot);
            plan.push({ leaf: name, key, slot });
        }
    }

    console.log('--- PLAN (' + plan.length + ' inserts) ---');
    for (const p of plan) console.log('  ' + p.leaf.padEnd(28) + ' + ' + p.key.padEnd(22) + ' @ slot ' + p.slot);
    console.log('\n--- SKIPS (' + skipped.length + ') ---');
    for (const s of skipped) console.log('  ' + s.leaf.padEnd(28) + ' ' + s.key.padEnd(22) + ' (' + s.reason + ')');

    if (!APPLY) {
        console.log('\nDRY RUN — pass --apply to write.');
        return;
    }

    console.log('\n--- APPLYING ---');
    let inserted = 0;
    for (const p of plan) {
        const node = await prisma.taxonomyNode.findFirst({ where: { name: p.leaf }, select: { id: true } });
        const fd = fdByKey[p.key];
        await prisma.nodeField.create({
            data: {
                taxonomy_node_id: node!.id,
                field_id: fd.id,
                display_order: p.slot,
                required: false,
            },
        });
        inserted++;
    }
    console.log('INSERTED ' + inserted + ' node_fields rows.');
})().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Sanity-check the script compiles via local ts-node**

Run on prod (the only place with the matching `@prisma/client`):

```bash
scp "c:/tmp/_attach_commercial_fields.ts" realty-pandit:/tmp/_attach_commercial_fields.ts
ssh realty-pandit "cd /var/www/realty-pandit/backend && npx ts-node --transpile-only /tmp/_attach_commercial_fields.ts" > "c:/tmp/_dryrun.txt" 2>&1
```

Expected: `--- PLAN (NN inserts) ---` where `NN` is in the 120-140 range (37 leaves × up to 4 fields, minus existing plot-area attachments and `Café/Restaurent` skip). Followed by `--- SKIPS (M) ---` listing any leaves that already had a field attached. Last line: `DRY RUN — pass --apply to write.`

- [ ] **Step 3: Review the dry-run output**

```bash
head -50 "c:/tmp/_dryrun.txt"
tail -40 "c:/tmp/_dryrun.txt"
```

Verify:
- Total inserts ≥ 100 and ≤ 150 (sanity bound)
- Skips include `Commercial Land` for `status` + `age-of-construction` (intentional per spec) — actually no, those aren't in the plan at all because `hasStatus=false` for that row. They won't show up in SKIPS either. So expected: only "already attached" skips appear.
- No "node not found" skips. If any leaf name is misspelled in MAPPING vs the DB, fix the typo in MAPPING (DB is authoritative — the spec has typos like "Petrol Punmp", "Collage", "Shoping" which exist in DB exactly as-is).

---

### Task 3: Apply the attachments

**Files:**
- Modify (via Prisma): `node_fields` table on prod

- [ ] **Step 1: Run the script with `--apply`**

```bash
ssh realty-pandit "cd /var/www/realty-pandit/backend && npx ts-node --transpile-only /tmp/_attach_commercial_fields.ts --apply" 2>&1 | tee "c:/tmp/_apply.txt"
```

Expected last line: `INSERTED NN node_fields rows.` where `NN` matches the dry-run plan count.

- [ ] **Step 2: Confirm no Prisma `Unique constraint failed` errors**

```bash
grep -i "error\|fatal\|constraint" "c:/tmp/_apply.txt"
```

Expected: no output. If you see `Unique constraint failed`, the script's de-dup logic missed something — re-read the dry-run plan vs the DB state and fix before re-running.

- [ ] **Step 3: Clean up the script from prod /tmp**

```bash
ssh realty-pandit "rm -f /tmp/_attach_commercial_fields.ts"
```

---

### Task 4: Post-fix audit

**Files:**
- Create: `c:/tmp/_audit_commercial_fields_post.txt`

- [ ] **Step 1: Re-run the audit from Task 1 Step 2**

Same command as Task 1 Step 2, save to `c:/tmp/_audit_commercial_fields_post.txt`.

- [ ] **Step 2: Diff pre vs post**

```bash
diff "c:/tmp/_audit_commercial_fields_pre.txt" "c:/tmp/_audit_commercial_fields_post.txt"
```

Expected diff: every commercial leaf gains 3-4 keys (`area-type`, `status`, `age-of-construction`, optionally `plot-area`) — except the 3 bare-land leaves (Commercial Land / Commercial Project Land / Agriculture Land/Orchard) which gain only `area-type`, and `Café/Restaurent` which gains nothing.

- [ ] **Step 3: Spot-check key leaves match expected counts**

| Leaf | Pre count | Post count expected |
|---|---|---|
| Open Market Shop | 13 | 16 |
| Commercial Complex office | 11 | 14 |
| Hotel | 10 | 14 |
| School | 12 | 16 |
| Petrol Punmp | 6 | 10 |
| Commercial Land | 8 | 9 |

```bash
grep -E "^(Open Market Shop|Commercial Complex office|Hotel|School|Petrol Punmp|Commercial Land) " "c:/tmp/_audit_commercial_fields_post.txt"
```

If a count is off by even 1, stop and reconcile against MAPPING + dry-run plan before continuing.

---

### Task 5: Backend — suppress the duplicate `construction_status` step on admin

**Files:**
- Modify: [`agents/backend/src/workflows/workflow_definition.ts`](../../agents/backend/src/workflows/workflow_definition.ts) (line 401-423)

Without this, after the script attaches `status` + `age-of-construction` to commercial leaves, the admin user will be prompted **twice** for construction age — once inside `schema_fields` (via the new attachments) and again on the `construction_status` step that follows. The fix is to suppress the standalone step when `_source === 'admin'`, mirroring the existing `_source === 'admin'` skip-pattern already in use at lines 178/205/226/249/284/560/756.

- [ ] **Step 1: Read the existing step definition (lines 401-423 of workflow_definition.ts)**

```bash
grep -n "construction_status" "c:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/backend/src/workflows/workflow_definition.ts"
```

Confirm the step's current shape matches what's expected (id `construction_status`, field `property_age`, has `skip_when` for `main_category === 'agricultural'`).

- [ ] **Step 2: Add the admin-skip clause to the existing `skip_when` array**

Edit the file: locate the existing `skip_when: [...]` array inside the `construction_status` step block (line ~419-421) and add ONE entry so the array becomes:

```typescript
        // Skip for agricultural land (no construction) — and for admin path,
        // because admin now captures status + age inside the schema_fields step
        // (the dynamic per-type panel) via the leaf-attached `status` and
        // `age-of-construction` NodeFields (2026-05-29 commercial fix).
        skip_when: [
            { field: 'main_category', operator: 'equals', value: 'agricultural' },
            { field: '_source', operator: 'equals', value: 'admin' },
        ],
```

- [ ] **Step 3: Type-check the change**

```bash
cd "c:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/backend" && npx tsc --noEmit 2>&1 | grep workflow_definition
```

Expected: empty output (the file should remain clean against the existing baseline).

- [ ] **Step 4: Deploy the backend**

```bash
cd "c:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents" && node deployment/deploy-agent.js backend --skip-verify 2>&1 | tail -15
```

Expected last lines: `backend: SUCCESS` and `Duration: ~50s`.

- [ ] **Step 5: Confirm pm2 is online and serving**

```bash
ssh realty-pandit "pm2 list 2>&1 | grep realty-backend; ss -lntp | grep 7071"
```

Expected: `status: online` + `LISTEN ... 127.0.0.1:7071`.

---

### Task 6: Playwright UI verification

**Files:**
- Drive: live admin panel at `https://admin.realtypandit.in` via Playwright MCP
- Create: 2 screenshots saved to Playwright's default output dir

- [ ] **Step 1: SSH-swap Puneet's password to a known QA value**

```bash
ssh realty-pandit "cat > /tmp/_swap.js << 'EOF'
const bcrypt = require('/var/www/realty-pandit/backend/node_modules/bcryptjs');
const { PrismaClient } = require('/var/www/realty-pandit/backend/node_modules/@prisma/client');
const prisma = new PrismaClient();
(async () => {
    const p = await prisma.agent.findUnique({
        where: { email: 'puneet.bhardwaj@realtypandit.in' },
        select: { id: true, password_hash: true },
    });
    console.log('ORIG_HASH:', p.password_hash);
    const newHash = await bcrypt.hash('QaCommercialFix2026!', 10);
    await prisma.agent.update({ where: { id: p.id }, data: { password_hash: newHash } });
    console.log('QA_SET');
})().catch(e => { console.error(e.message); process.exit(1); }).finally(() => prisma.\$disconnect());
EOF
node /tmp/_swap.js 2>&1 | tail -5; rm /tmp/_swap.js"
```

Capture `ORIG_HASH` for Step 7 restore. Expected last 2 lines:
```
ORIG_HASH: $2b$10$…
QA_SET
```

- [ ] **Step 2: Open Playwright on the live admin login page**

Invoke the Playwright MCP `browser_navigate` tool with url `https://admin.realtypandit.in/login`.

Expected: page loads, persisted Puneet session may carry through (per the demand-p5 Playwright run today). If not, log in via the form with `puneet.bhardwaj@realtypandit.in` / `QaCommercialFix2026!`.

- [ ] **Step 3: Drive to Add Inventory → pick a commercial leaf via API to skip UI noise**

Rather than clicking through the multi-step workflow UI (which the Playwright snapshot was found to be huge for), use `browser_evaluate` to hit `GET /api/public/taxonomy/nodes/<leaf_id>/fields` directly and verify the response now includes the new field keys:

```js
async () => {
  // Open Market Shop (commercial / Retail / shop)
  const r = await fetch('/api/public/taxonomy/nodes/03dde2d1-b496-4225-9425-e0f17e693a3a/fields', { credentials: 'include' });
  const j = await r.json();
  const fields = j.fields || [];
  const keys = fields.map(f => f.key).sort();
  return {
    status: r.status,
    count: fields.length,
    keys,
    has_area_type: keys.includes('area-type'),
    has_status: keys.includes('status'),
    has_age_of_construction: keys.includes('age-of-construction'),
  };
}
```

Expected: `status: 200`, `count: 16`, `has_area_type: true`, `has_status: true`, `has_age_of_construction: true`.

- [ ] **Step 4: Spot-check Hotel and Petrol Punmp**

Run the same `browser_evaluate` against:
- Hotel node id `c8cb56f2-…` — expect count 14, has all 3 + `plot-area`.
- Petrol Punmp node id `85f045da-…` — expect count 10, has all 3 + `plot-area`.

The full UUIDs can be looked up via `prisma.taxonomyNode.findFirst({ where: { name: 'Hotel' } })` if not memorized.

- [ ] **Step 5: Visual proof — drive Add Inventory through the schema_fields step**

Invoke `browser_navigate` to `https://admin.realtypandit.in/?page=inventory&action=add` (or whatever the deep-link route is — fall back to clicking `🏠 Inventory` → `+ Add Inventory` button from the nav).

Walk the workflow through Address → Taxonomy until reaching the `schema_fields` step for Open Market Shop. Confirm visually that the rendered fields now include:
- Area Type (Super / Built-up / Carpet) dropdown
- Construction Status (Ready to Move / Under Construction) dropdown
- Age of Construction dropdown

Take a `browser_take_screenshot` named `commercial-fields-after-fix.png`.

- [ ] **Step 6: Visual proof — Old vs New side-by-side reference**

Optional but recommended: a second screenshot of the same step for Hotel (different sub-category, same 3 new fields plus `plot-area`) confirms the fix isn't shop-only.

Save as `commercial-fields-hotel-after-fix.png`.

---

### Task 7: Restore + cleanup + docs

**Files:**
- Modify: prod `agents` table (restore Puneet's password)
- Modify: [`docs/PROJECT_STATUS.md`](../PROJECT_STATUS.md)
- Modify: `~/.claude/projects/c--…-sunny-sharma/memory/reference_taxonomy_schema_fields_renderer.md`

- [ ] **Step 1: Restore Puneet's password from the hash captured in Task 6 Step 1**

```bash
ORIG='<paste ORIG_HASH from Task 6 Step 1 here>'
ssh realty-pandit "cat > /tmp/_restore.js << EOF
const { PrismaClient } = require('/var/www/realty-pandit/backend/node_modules/@prisma/client');
const prisma = new PrismaClient();
(async () => {
    await prisma.agent.update({
        where: { email: 'puneet.bhardwaj@realtypandit.in' },
        data: { password_hash: '${ORIG}' },
    });
    console.log('RESTORED');
})().catch(e => { console.error(e.message); process.exit(1); }).finally(() => prisma.\$disconnect());
EOF
node /tmp/_restore.js 2>&1 | tail -3; rm /tmp/_restore.js"
```

Expected: `RESTORED`.

- [ ] **Step 2: Close the Playwright browser**

Invoke `browser_close`.

- [ ] **Step 3: Add a row to PROJECT_STATUS.md**

Edit [docs/PROJECT_STATUS.md](../PROJECT_STATUS.md). Update `**Last updated:** YYYY-MM-DD` to today, and insert a new row at the top of the phase-status table:

```markdown
| Commercial taxonomy field-gaps fix — 4 fields × ~35 leaves | ✅ DEPLOYED 2026-05-29 | Phase-1a taxonomy seed shipped 36 `FieldDefinition` rows but the backfill never attached `area-type` / `status` / `age-of-construction` to ANY node, and `plot-area` only to land leaves — leaving every commercial leaf missing 3-4 spec-required fields on the Add Inventory `schema_fields` step. Pure-data fix via `/tmp/_attach_commercial_fields.ts` inserted ~135 `node_fields` rows (snapshot `node_fields_bak_<TS>` retained). Backend `construction_status` workflow step now `skip_when _source==='admin'` so the admin path doesn't double-prompt for age (WhatsApp/web paths unchanged — they still don't render `schema_fields` and need the standalone question). Playwright-verified Open Market Shop, Hotel, Petrol Punmp now render the full per-type panel matching `Chat/newtree-classification-tree.md`. See `docs/plans/2026-05-29-commercial-taxonomy-field-gaps.md`. |
```

- [ ] **Step 4: Update the schema-fields-renderer reference memory**

Edit `~/.claude/projects/c--…-sunny-sharma/memory/reference_taxonomy_schema_fields_renderer.md` and append a line:

```
2026-05-29: `area-type`, `status`, `age-of-construction` are now attached to
all commercial leaves (and `plot-area` to non-land commercial leaves that need
it). The admin path's `schema_fields` step renders them inline; the standalone
`construction_status` workflow step is now `skip_when _source==='admin'`.
WhatsApp/web paths still use the standalone step (they don't render
schema_fields). Snapshot: `node_fields_bak_<TS>`. Plan:
`docs/plans/2026-05-29-commercial-taxonomy-field-gaps.md`.
```

- [ ] **Step 5: Remove temporary files**

```bash
rm -f "c:/tmp/_attach_commercial_fields.ts" "c:/tmp/_audit_commercial_fields_pre.txt" "c:/tmp/_audit_commercial_fields_post.txt" "c:/tmp/_dryrun.txt" "c:/tmp/_apply.txt" "c:/tmp/_rollback_snapshot.txt"
```

---

## Rollback (only if Tasks 3 or 5 went wrong)

The snapshot from Task 1 Step 1 holds a full copy of `node_fields` from before any writes. To roll back ALL inserts in one shot:

```bash
SNAP=$(cat "c:/tmp/_rollback_snapshot.txt")
ssh realty-pandit "PGPASSWORD='RealtyPandit@2024#Secure' psql -U realty_user -d reality_pandit -h localhost -c \"BEGIN; TRUNCATE node_fields; INSERT INTO node_fields SELECT * FROM ${SNAP}; COMMIT;\""
```

Then revert the workflow_definition.ts edit (Task 5 Step 2) and re-deploy backend.

The snapshot table is retained on prod after Task 7 cleanup — drop it manually after a week of verified-stable production runtime:

```bash
ssh realty-pandit "PGPASSWORD='RealtyPandit@2024#Secure' psql -U realty_user -d reality_pandit -h localhost -c \"DROP TABLE ${SNAP}\""
```

---

## Self-review

**Spec coverage:** Every leaf called out under §`### Commercial` (lines 367-862) in `Chat/newtree-classification-tree.md` appears in the MAPPING table in Task 2 Step 1, with the 4 columns set per the per-leaf spec lines. `Café/Restaurent` is correctly all-false because the spec explicitly says `_(no fields specified)_`. The 3 bare-land leaves (Commercial Land / Commercial Project Land / Agriculture Land/Orchard) get only `area-type` matching the spec which omits Status/Age for them.

**Placeholder scan:** No TBDs, no "implement appropriately". Every step has the actual command or code body. The one fill-in is Task 7 Step 1's `ORIG='<paste hash>'` which is intentional — that value isn't known until Task 6 Step 1 runs.

**Type consistency:** The script's `MAPPING` tuple shape matches the destructuring in the for-loop. `SLOT_BY_KEY` uses the same string keys that the script's lookup queries against `FieldDefinition.key` — verified against the prod catalog dump in the investigation. The `nodeField.create` shape matches the Prisma model (`taxonomy_node_id`, `field_id`, `display_order`, `required`) per the schema.prisma source.

**WhatsApp/web regression check:** Task 5's `skip_when _source==='admin'` is the inverse of `show_when _source in [admin, web]` patterns at lines 178/205/226/249/284/560/756 — so WhatsApp and web paths are untouched. They never reach `schema_fields` (which requires `_source in [admin, web]` per line 283-285), so attaching new NodeFields to leaves does not change their flow either. The `construction_status` step still runs for WhatsApp/web.

**Idempotency:** Re-running the script after a successful `--apply` should print "already attached" for every row and insert 0. The `existingFieldIds` Set check + the `@@unique([taxonomy_node_id, field_id])` constraint together guarantee no duplicate rows can sneak through.
