# Inventory Taxonomy — Phase 1a (Data Foundation) Implementation Plan

**STATUS: ✅ SHIPPED & verified in prod 2026-05-24.** Migration `20260524000000_taxonomy_foundation` applied (3 tables `taxonomy_nodes`/`field_definitions`/`node_fields` + nullable `taxonomy_node_id`/`needs_taxonomy_review` on `inventory`+`contacts`; additive/non-destructive). Seeded from `prisma/data/taxonomy.seed.json` → **76 nodes / 35 fields / 706 attachments**. Read API live at `/public/taxonomy/tree` + `/public/taxonomy/nodes/:id/fields`. Verified: roots Residential(4)+Commercial(8); **BHK→residential only, Rooms→commercial (Hotel/School), never BHK on commercial**. No consumer reads it yet (additive). Next: **1b backfill** existing ~350 listings → nodes.



> **Execution:** Ships via `node deployment/deploy-agent.js backend` (NO git branches — workspace isn't git-tracked). Deploy runs only `prisma generate`, so **migration + seed are explicit SSH steps**. "Checkpoint" steps replace git commits. Steps use `- [ ]`.
>
> **Phase 1a only.** Sibling plans (own files) follow: **1b** migration/backfill of existing listings, **1c** admin editor, **1d** dynamic Add-Inventory form. Spec: `docs/plans/2026-05-24-inventory-taxonomy-overhaul-phase1-design.md`.

**Goal:** Stand up the single canonical, DB-driven property taxonomy — a self-referential `TaxonomyNode` tree + a `FieldDefinition` catalog (with **BHK and Rooms as two separate fields**) + `NodeField` per-type schema — seeded from `Chat/newtree.xlsx`, and expose a read API. (No consumer wiring yet; that's 1b–1d.)

**Architecture:** New Prisma models (`TaxonomyNode`, `FieldDefinition`, `NodeField`) + nullable `taxonomy_node_id` / `needs_taxonomy_review` on `Inventory` & `Contact`. The xlsx is converted once into a reviewed `prisma/data/taxonomy.seed.json` (deterministic, diff-able); an idempotent importer upserts it. A read API (`routes/taxonomy.ts`) serves the tree + per-type fields, mirroring the existing `routes/classification.ts`.

**Tech Stack:** Prisma 5 + Postgres, Express/TS, ts-node seed, openpyxl (one-off JSON generation).

---

## File Structure
| File | Responsibility | Action |
|---|---|---|
| `Chat/tools/gen_taxonomy_json.py` | One-off: xlsx → `taxonomy.seed.json` | Create |
| `backend/prisma/data/taxonomy.seed.json` | Reviewed canonical taxonomy data | Create (generated) |
| `backend/prisma/schema.prisma` | New models + node FKs on Inventory/Contact | Modify |
| `backend/prisma/migrations/<ts>_taxonomy_foundation/migration.sql` | Migration | Create |
| `backend/prisma/seed_taxonomy.ts` | Idempotent importer of the JSON | Create |
| `backend/src/routes/taxonomy.ts` | Read API (tree + node fields) | Create |
| `backend/src/app.ts` | Mount the taxonomy router | Modify |

---

## Task 1: Generate the canonical `taxonomy.seed.json` from the xlsx

**Files:** Create `Chat/tools/gen_taxonomy_json.py`; output `backend/prisma/data/taxonomy.seed.json`

- [ ] **Step 1: Write the generator.** It reuses the proven parse logic and applies the BHK/Rooms split (Residential→`bhk`, Commercial→`rooms`). Create `Chat/tools/gen_taxonomy_json.py`:

```python
import openpyxl, json, re, os
SRC = os.path.join(os.path.dirname(__file__), "..", "newtree.xlsx")
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "clients", "sunny-sharma", "projects",
                   "reality-pandit", "agents", "backend", "prisma", "data", "taxonomy.seed.json")
def clean(s):
    if s is None: return ""
    s=str(s).replace("\n"," ").strip().replace("Caf�","Café").replace("�","…")
    while "  " in s: s=s.replace("  "," ")
    return s.strip()
def slug(s): return re.sub(r"[^a-z0-9]+","-",s.lower()).strip("-")
wb=openpyxl.load_workbook(SRC,data_only=True); ws=wb["Sheet1"]; rows=list(ws.iter_rows(values_only=True))
hdr=rows[0]; field_cols={j:clean(hdr[j]) for j in range(4,len(hdr)) if clean(hdr[j])}
# canonical field key per spreadsheet column header
def field_key(colname):
    n=colname.lower()
    if n.startswith("bhk"): return "_rooms_or_bhk_"   # resolved per-row by category
    return slug(colname)
types=[]; top="Residential"; sub=None; grp=None
for i in range(1,len(rows)):
    r=rows[i]; c1,c2,c3=clean(r[0]),clean(r[1]),clean(r[2]); c4=clean(r[3]) if len(r)>3 else ""
    if c1.lower()=="commercial": top="Commercial"; sub=None; grp=None
    if c2: sub=c2; grp=None
    fields={}
    for j in range(4,len(r)):
        v=clean(r[j])
        if v and field_cols.get(j): fields[field_cols[j]]=v
    if c4:
        if c3: grp=c3
        types.append({"top":top,"sub":sub,"grp":grp,"type":c4,"fields":fields})
    elif c3:
        types.append({"top":top,"sub":sub,"grp":None,"type":c3,"fields":fields})
    else:
        if types and fields: types[-1]["fields"].update(fields)

# ---- build node list (unique paths) + field catalog + attachments ----
field_catalog={}   # key -> {key,label,input_type,unit}
def reg_field(key,label,input_type="text",unit=None):
    if key not in field_catalog: field_catalog[key]={"key":key,"label":label,"input_type":input_type,"unit":unit}
# explicit catalog for the two split fields + common ones
reg_field("bhk","BHK","number"); reg_field("rooms","Rooms","number")
nodes=[]; seen=set(); attachments=[]
for t in types:
    path=[t["top"],t["sub"]]+([t["grp"]] if t["grp"] else [])+[t["type"]]
    # register each ancestor node once
    for depth in range(len(path)):
        key=tuple(path[:depth+1])
        if key not in seen:
            seen.add(key)
            kind=["CATEGORY","SUBCATEGORY","GROUP","TYPE"][min(depth,3)] if len(path)==4 else \
                 ["CATEGORY","SUBCATEGORY","TYPE"][min(depth,2)]
            nodes.append({"path":list(key),"node_kind":kind})
    # attachments on the leaf type
    attach=[]
    for colname,val in t["fields"].items():
        if colname.lower().startswith("bhk"):
            key = "bhk" if t["top"]=="Residential" else "rooms"
            label = "BHK" if key=="bhk" else "Rooms"
            opts = [o.strip() for o in re.split(r"[,/]", val) if o.strip()] if t["top"]=="Residential" else None
            reg_field(key,label,"number")
            attach.append({"field":key,"required":False,"options":opts})
        else:
            key=slug(colname)
            reg_field(key, colname, "text")
            opts=[o.strip() for o in re.split(r"[,/]", val) if o.strip() and len(o.strip())<30]
            attach.append({"field":key,"required":False,"options":opts or None})
    attachments.append({"type_path":path,"fields":attach})
out={"fields":list(field_catalog.values()),"nodes":nodes,"attachments":attachments}
os.makedirs(os.path.dirname(OUT),exist_ok=True)
json.dump(out,open(OUT,"w",encoding="utf-8"),ensure_ascii=False,indent=2)
print("nodes=",len(nodes),"fields=",len(field_catalog),"types=",len(attachments),"-> ",OUT)
```

- [ ] **Step 2: Run it + sanity check.**

Run: `cd "/c/Users/Varchasv Bhardwaj/Project/Chat/tools" && python gen_taxonomy_json.py`
Expected: `nodes= ~80 fields= ~25 types= 57 -> …/prisma/data/taxonomy.seed.json`

- [ ] **Step 3: Verify the BHK/Rooms split in the JSON.**

Run: `cd backend && node -e "const d=require('./prisma/data/taxonomy.seed.json'); const flat=d.attachments.find(a=>a.type_path.join('>').includes('Flat/Apartment>Flat')); const hotel=d.attachments.find(a=>a.type_path.includes('Hotel')); console.log('flat has bhk:', flat.fields.some(f=>f.field==='bhk')); console.log('hotel has rooms:', hotel.fields.some(f=>f.field==='rooms'), '| hotel has bhk:', hotel.fields.some(f=>f.field==='bhk'));"`
Expected: `flat has bhk: true` · `hotel has rooms: true | hotel has bhk: false`

- [ ] **Step 4: Checkpoint** — JSON generated, BHK/Rooms split correct. (Commit the JSON + script into the project docs/tools.)

---

## Task 2: Prisma models + migration

**Files:** Modify `backend/prisma/schema.prisma`; Create `backend/prisma/migrations/<timestamp>_taxonomy_foundation/migration.sql`

- [ ] **Step 1: Add the three models** to `schema.prisma` (near the other classification models):

```prisma
model TaxonomyNode {
  id            String         @id @default(uuid())
  parent_id     String?
  parent        TaxonomyNode?  @relation("NodeChildren", fields: [parent_id], references: [id])
  children      TaxonomyNode[] @relation("NodeChildren")
  name          String
  slug          String
  node_kind     String         // CATEGORY | SUBCATEGORY | GROUP | TYPE
  display_order Int            @default(0)
  is_active     Boolean        @default(true)
  labels_json   Json?
  node_fields   NodeField[]
  inventory     Inventory[]
  contacts      Contact[]
  created_at    DateTime       @default(now())
  updated_at    DateTime       @updatedAt
  @@unique([parent_id, slug])
  @@index([parent_id])
  @@index([node_kind])
  @@map("taxonomy_nodes")
}

model FieldDefinition {
  id            String      @id @default(uuid())
  key           String      @unique
  label         String
  input_type    String      // number | select | multiselect | text | boolean
  options_json  Json?
  unit          String?
  display_order Int         @default(0)
  is_active     Boolean     @default(true)
  node_fields   NodeField[]
  created_at    DateTime    @default(now())
  updated_at    DateTime    @updatedAt
  @@map("field_definitions")
}

model NodeField {
  id               String          @id @default(uuid())
  taxonomy_node_id String
  node             TaxonomyNode    @relation(fields: [taxonomy_node_id], references: [id], onDelete: Cascade)
  field_id         String
  field            FieldDefinition @relation(fields: [field_id], references: [id], onDelete: Cascade)
  display_order    Int             @default(0)
  required         Boolean         @default(false)
  label_override   String?
  options_override Json?
  @@unique([taxonomy_node_id, field_id])
  @@index([taxonomy_node_id])
  @@map("node_fields")
}
```

- [ ] **Step 2: Add nullable node FK + review flag** to `Inventory` and `Contact` models (additive, non-breaking — does NOT touch existing `category_id`/`sub_category_id`/`type_id`):

In `model Inventory { … }` add:
```prisma
  taxonomy_node_id      String?
  taxonomy_node         TaxonomyNode? @relation(fields: [taxonomy_node_id], references: [id])
  needs_taxonomy_review Boolean       @default(false)
```
In `model Contact { … }` add the identical three lines.

- [ ] **Step 3: Create the migration (non-destructive, additive).** Create `backend/prisma/migrations/20260524000000_taxonomy_foundation/migration.sql`:

```sql
-- TaxonomyNode
CREATE TABLE "taxonomy_nodes" (
  "id" TEXT NOT NULL, "parent_id" TEXT, "name" TEXT NOT NULL, "slug" TEXT NOT NULL,
  "node_kind" TEXT NOT NULL, "display_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true, "labels_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "taxonomy_nodes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "taxonomy_nodes_parent_id_slug_key" ON "taxonomy_nodes"("parent_id","slug");
CREATE INDEX "taxonomy_nodes_parent_id_idx" ON "taxonomy_nodes"("parent_id");
CREATE INDEX "taxonomy_nodes_node_kind_idx" ON "taxonomy_nodes"("node_kind");
ALTER TABLE "taxonomy_nodes" ADD CONSTRAINT "taxonomy_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "taxonomy_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- FieldDefinition
CREATE TABLE "field_definitions" (
  "id" TEXT NOT NULL, "key" TEXT NOT NULL, "label" TEXT NOT NULL, "input_type" TEXT NOT NULL,
  "options_json" JSONB, "unit" TEXT, "display_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "field_definitions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "field_definitions_key_key" ON "field_definitions"("key");
-- NodeField
CREATE TABLE "node_fields" (
  "id" TEXT NOT NULL, "taxonomy_node_id" TEXT NOT NULL, "field_id" TEXT NOT NULL,
  "display_order" INTEGER NOT NULL DEFAULT 0, "required" BOOLEAN NOT NULL DEFAULT false,
  "label_override" TEXT, "options_override" JSONB,
  CONSTRAINT "node_fields_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "node_fields_taxonomy_node_id_field_id_key" ON "node_fields"("taxonomy_node_id","field_id");
CREATE INDEX "node_fields_taxonomy_node_id_idx" ON "node_fields"("taxonomy_node_id");
ALTER TABLE "node_fields" ADD CONSTRAINT "node_fields_taxonomy_node_id_fkey" FOREIGN KEY ("taxonomy_node_id") REFERENCES "taxonomy_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "node_fields" ADD CONSTRAINT "node_fields_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- node FK + review flag on inventory & contacts
ALTER TABLE "inventory" ADD COLUMN "taxonomy_node_id" TEXT, ADD COLUMN "needs_taxonomy_review" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "contacts"  ADD COLUMN "taxonomy_node_id" TEXT, ADD COLUMN "needs_taxonomy_review" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_taxonomy_node_id_fkey" FOREIGN KEY ("taxonomy_node_id") REFERENCES "taxonomy_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contacts"  ADD CONSTRAINT "contacts_taxonomy_node_id_fkey"  FOREIGN KEY ("taxonomy_node_id") REFERENCES "taxonomy_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```
(Confirm the real table names with `grep '@@map' schema.prisma` for Inventory=`inventory`, Contact=`contacts` before finalizing the SQL.)

- [ ] **Step 4: tsc + generate locally.** Run: `cd backend && npx prisma generate && npx tsc --noEmit 2>&1 | grep -iE "taxonomy|field_definition|node_field" || echo CLEAN` → CLEAN.

---

## Task 3: Idempotent seed importer

**Files:** Create `backend/prisma/seed_taxonomy.ts`

- [ ] **Step 1: Write the importer** (upsert-based, safe to re-run). Create `backend/prisma/seed_taxonomy.ts`:

```ts
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
const prisma = new PrismaClient();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function main() {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'taxonomy.seed.json'), 'utf8'));

  // 1) field catalog
  const fieldIdByKey: Record<string, string> = {};
  for (const f of data.fields) {
    const row = await prisma.fieldDefinition.upsert({
      where: { key: f.key },
      update: { label: f.label, input_type: f.input_type, unit: f.unit ?? null },
      create: { key: f.key, label: f.label, input_type: f.input_type, unit: f.unit ?? null },
    });
    fieldIdByKey[f.key] = row.id;
  }

  // 2) nodes (parents before children — data.nodes is already ancestor-ordered)
  const nodeIdByPath: Record<string, string> = {};
  for (const n of data.nodes) {
    const pathArr: string[] = n.path;
    const name = pathArr[pathArr.length - 1];
    const parentKey = pathArr.slice(0, -1).join('>');
    const parent_id = parentKey ? nodeIdByPath[parentKey] : null;
    const s = slug(name);
    const existing = await prisma.taxonomyNode.findFirst({ where: { parent_id, slug: s } });
    const row = existing
      ? await prisma.taxonomyNode.update({ where: { id: existing.id }, data: { name, node_kind: n.node_kind, is_active: true } })
      : await prisma.taxonomyNode.create({ data: { parent_id, name, slug: s, node_kind: n.node_kind } });
    nodeIdByPath[pathArr.join('>')] = row.id;
  }

  // 3) attachments (per-type fields)
  let attached = 0;
  for (const a of data.attachments) {
    const nodeId = nodeIdByPath[a.type_path.join('>')];
    if (!nodeId) continue;
    let order = 0;
    for (const fa of a.fields) {
      const fieldId = fieldIdByKey[fa.field];
      if (!fieldId) continue;
      await prisma.nodeField.upsert({
        where: { taxonomy_node_id_field_id: { taxonomy_node_id: nodeId, field_id: fieldId } },
        update: { display_order: order, options_override: fa.options ?? undefined },
        create: { taxonomy_node_id: nodeId, field_id: fieldId, display_order: order, required: !!fa.required, options_override: fa.options ?? undefined },
      });
      order++; attached++;
    }
  }
  const counts = { nodes: Object.keys(nodeIdByPath).length, fields: Object.keys(fieldIdByKey).length, attachments: attached };
  console.log('SEED_TAXONOMY_DONE', JSON.stringify(counts));
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 2: tsc.** Run: `cd backend && npx tsc --noEmit 2>&1 | grep seed_taxonomy || echo CLEAN` → CLEAN.

---

## Task 4: Read API

**Files:** Create `backend/src/routes/taxonomy.ts`; Modify `backend/src/app.ts`

- [ ] **Step 1: Write the read routes** (mirror the public read pattern in `routes/classification.ts`). Create `backend/src/routes/taxonomy.ts`:

```ts
import { Router } from 'express';
import prisma from '../db';
const router = Router();

// GET /public/taxonomy/tree — full active tree (nested)
router.get('/tree', async (_req, res) => {
  try {
    const nodes = await prisma.taxonomyNode.findMany({
      where: { is_active: true },
      orderBy: [{ display_order: 'asc' }, { name: 'asc' }],
      select: { id: true, parent_id: true, name: true, slug: true, node_kind: true },
    });
    const byId: Record<string, any> = {};
    nodes.forEach(n => (byId[n.id] = { ...n, children: [] }));
    const roots: any[] = [];
    nodes.forEach(n => (n.parent_id ? byId[n.parent_id]?.children.push(byId[n.id]) : roots.push(byId[n.id])));
    res.json({ success: true, tree: roots });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /public/taxonomy/nodes/:id/fields — per-type field schema (drives the dynamic form)
router.get('/nodes/:id/fields', async (req, res) => {
  try {
    const nf = await prisma.nodeField.findMany({
      where: { taxonomy_node_id: req.params.id },
      orderBy: { display_order: 'asc' },
      include: { field: true },
    });
    res.json({
      success: true,
      fields: nf.map(x => ({
        key: x.field.key,
        label: x.label_override || x.field.label,
        input_type: x.field.input_type,
        required: x.required,
        options: (x.options_override as any) ?? (x.field.options_json as any) ?? null,
        unit: x.field.unit,
      })),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
```

- [ ] **Step 2: Mount the router** in `backend/src/app.ts` alongside the existing public/classification mounts. Find the line mounting `classification` routes (search `classification`) and add next to it:
```ts
import taxonomyRoutes from './routes/taxonomy';
app.use('/public/taxonomy', taxonomyRoutes);
```
(Match the existing mount style/prefix used for `routes/classification.ts`.)

- [ ] **Step 3: tsc.** Run: `cd backend && npx tsc --noEmit 2>&1 | grep -E "routes/taxonomy|app.ts" || echo CLEAN` → CLEAN (ignore pre-existing baseline lines).

---

## Task 5: Deploy, migrate, seed, verify

- [ ] **Step 1: Deploy backend code.** `node deployment/deploy-agent.js backend --skip-verify` → SUCCESS.

- [ ] **Step 2: Apply migration on the server (additive, safe).** SSH and run from the backend dir:
`npx prisma migrate deploy 2>&1 | tail -8` → expect "1 migration applied" (`20260524000000_taxonomy_foundation`). (If migrate state diverges, fall back to `npx prisma db push --accept-data-loss=false`; additive only.)

- [ ] **Step 3: Run the taxonomy seed on the server.** Copy `prisma/data/taxonomy.seed.json` up (it deployed with the tar) and run:
`npx ts-node prisma/seed_taxonomy.ts 2>&1 | tail -3` → `SEED_TAXONOMY_DONE {"nodes":~80,"fields":~25,"attachments":~600}`.

- [ ] **Step 4: Verify data via the live API (read-only).** With a minted JWT or public route:
`curl -s https://api.realtypandit.in/public/taxonomy/tree | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const t=JSON.parse(d).tree;console.log('roots:',t.map(r=>r.name));})"`
Expected: `roots: [ 'Residential', 'Commercial' ]`.

- [ ] **Step 5: Verify BHK/Rooms split on real nodes (server Prisma).** Run a Node script (reference_prod_db_script_pattern) that finds the "Flat" type node and the "Hotel" type node and lists their `NodeField` keys.
Expected: Flat's fields include `bhk` and NOT `rooms`; Hotel's include `rooms` and NOT `bhk`.

- [ ] **Step 6: Checkpoint + records.** Update the design doc status; add a memory pointer. Confirm GlitchTip clean. Phase 1a done → next plan: **1b backfill**.

---

## Notes / risk
- **Additive & non-breaking:** new tables + nullable columns only; existing `category_id`/`sub_category_id`/`type_id` and all current consumers (matching/search/sharing/AI) are untouched and keep working. No consumer reads the new tree until 1b–1d.
- **Idempotent seed:** upsert-keyed on `(parent_id, slug)` / `field.key` / `(node, field)`, safe to re-run after taxonomy edits.
- **Migration is manual** (deploy doesn't auto-migrate) — Step 2 is required or the seed/API will fail on missing tables.
- Out of scope (later plans): backfilling existing inventory to nodes (1b), the admin editor (1c), and the dynamic Add-Inventory form incl. surfacing BHK/Rooms (1d).
