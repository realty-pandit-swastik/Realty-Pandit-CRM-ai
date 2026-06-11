# Inventory Taxonomy — Phase 1b (Backfill) Implementation Plan

**STATUS: ✅ SHIPPED & verified in prod 2026-05-24.** Backfilled **357/357 inventory** onto TaxonomyNode via `flat_property_type` (dry-run first: unmapped=0). **177 confident**, **180 flagged** `needs_taxonomy_review=true` (coarse old types — e.g. all gated apartments → "Flat" — for team refinement via 1c). Legacy columns intact (verified). Reversible (nullable FK + bool). **Task 5 (contacts) DEFERRED to Phase 2:** only 180/1765 contacts have a demand_type_slug, different vocabulary, and demand-side is re-captured against the tree in P2 — backfilling now would be 90% null/noise for zero current consumer. Script: `prisma/backfill_taxonomy.ts` (idempotent, `--dry-run`).



> **Execution:** No git. Backfill runs on prod via `ssh … npx ts-node prisma/backfill_taxonomy.ts`. **DRY-RUN first** (no writes), review counts, then APPLY. Steps use `- [ ]`. Builds on Phase 1a (SHIPPED). Spec: `docs/plans/2026-05-24-inventory-taxonomy-overhaul-phase1-design.md`.

**Goal:** Stamp every existing inventory row (and, second step, demand contacts) with a `taxonomy_node_id` on the new tree, auto-mapped from `flat_property_type` (100% populated), flagging ambiguous mappings with `needs_taxonomy_review=true`. Legacy classification columns untouched.

**Architecture:** A curated `flat_property_type.name → {leaf type name, category, confident}` map; an idempotent backfill script resolves each to its seeded `TaxonomyNode` (leaf `node_kind='TYPE'`) and sets `inventory.taxonomy_node_id` + `needs_taxonomy_review`. A `--dry-run` flag reports per-type mapped/flagged/unmapped counts without writing.

**Tech Stack:** Prisma 5 + ts-node, run over SSH against prod (reference_prod_db_script_pattern).

**Source distribution (prod, 357 active+inactive inventory; all have flat_property_type_id):** Apartment/Gated 89, Builder Floor 63, Builder Flat Front 39, Builder Flat Back 37, Land/Plot 36, Independent House/Villa 33, Commercial Shops 10, Commercial Office/Space 10, Factory 8, Commercial Land/Inst 7, Showrooms 6, Guest-House/Banquet 5, Agricultural Land 4, Industrial Lands/Plots 4, WareHouse 3, Co-working 1, Hotel/Resorts 1, Ready-to-Move Office 1.

---

## File Structure
| File | Responsibility | Action |
|---|---|---|
| `backend/prisma/backfill_taxonomy.ts` | Map flat_property_type → TaxonomyNode; dry-run + apply; idempotent | Create |

---

## Task 1: Write the backfill script

**Files:** Create `backend/prisma/backfill_taxonomy.ts`

- [ ] **Step 1: Write the script.** Paste complete:

```ts
/**
 * Phase 1b — backfill existing inventory onto the canonical TaxonomyNode tree.
 * Source: flat_property_type (100% populated). Sets inventory.taxonomy_node_id +
 * needs_taxonomy_review. Legacy classification columns are NOT touched. Idempotent.
 *
 *   DRY RUN (no writes): npx ts-node prisma/backfill_taxonomy.ts --dry-run
 *   APPLY:               npx ts-node prisma/backfill_taxonomy.ts
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry-run');

// flat_property_type.name -> { type: leaf TYPE node name, cat: root category, confident }
const MAP: Record<string, { type: string; cat: string; confident: boolean }> = {
    'Apartment / Gated Society':   { type: 'Flat',                    cat: 'Residential', confident: false },
    'Builder Floor':               { type: 'Independent Floor',       cat: 'Residential', confident: true  },
    'Builder Flat Front Facing':   { type: 'Builder Flat (Front)',    cat: 'Residential', confident: true  },
    'Builder Flat Back Facing':    { type: 'Builder Flat (Back)',     cat: 'Residential', confident: true  },
    'Land / Plot':                 { type: 'Authority Plot',          cat: 'Residential', confident: false },
    'Independent House / Villa':   { type: 'Villa',                   cat: 'Residential', confident: false },
    'Commercial Shops':            { type: 'Open Market Shop',        cat: 'Commercial',  confident: false },
    'Commercial Office / Space':   { type: 'Commercial Complex office', cat: 'Commercial', confident: true },
    'Ready to Move Office Space':  { type: 'Commercial Complex office', cat: 'Commercial', confident: true },
    'Co-working Office Space':     { type: 'Co working Office',       cat: 'Commercial',  confident: true  },
    'Factory':                     { type: 'Factory',                 cat: 'Commercial',  confident: true  },
    'Commercial Land / Inst. Land':{ type: 'Commercial Land',         cat: 'Commercial',  confident: true  },
    'Industrial Lands / Plots':    { type: 'Industrial Land/Plot',    cat: 'Commercial',  confident: true  },
    'Commercial Showrooms':        { type: 'Open Market Showroom',    cat: 'Commercial',  confident: false },
    'Guest-House / Banquet-Halls': { type: 'Guest House',             cat: 'Commercial',  confident: false },
    'Agricultural Land':           { type: 'Agriculture Land/Orchard', cat: 'Commercial', confident: true  },
    'WareHouse':                   { type: 'ware House',              cat: 'Commercial',  confident: true  },
    'Hotel / Resorts':             { type: 'Hotel',                   cat: 'Commercial',  confident: false },
};

async function rootCategory(nodeId: string): Promise<string> {
    let cur = await prisma.taxonomyNode.findUnique({ where: { id: nodeId }, select: { name: true, parent_id: true } });
    while (cur && cur.parent_id) {
        cur = await prisma.taxonomyNode.findUnique({ where: { id: cur.parent_id }, select: { name: true, parent_id: true } });
    }
    return cur?.name ?? '';
}

async function main() {
    // Resolve each mapped leaf type name -> node id (disambiguate by root category).
    const typeNodes = await prisma.taxonomyNode.findMany({ where: { node_kind: 'TYPE' }, select: { id: true, name: true } });
    const nodeIdFor = async (typeName: string, cat: string): Promise<string | null> => {
        const cands = typeNodes.filter(n => n.name === typeName);
        for (const c of cands) { if ((await rootCategory(c.id)) === cat) return c.id; }
        return cands[0]?.id ?? null;
    };
    const resolved: Record<string, { id: string | null; confident: boolean }> = {};
    for (const [fptName, m] of Object.entries(MAP)) {
        resolved[fptName] = { id: await nodeIdFor(m.type, m.cat), confident: m.confident };
    }

    const fpts = await prisma.flatPropertyType.findMany({ select: { id: true, name: true } });
    const fptName = Object.fromEntries(fpts.map(f => [f.id, f.name]));

    const invs = await prisma.inventory.findMany({ select: { id: true, flat_property_type_id: true } });
    const stats: Record<string, { mapped: number; flagged: number }> = {};
    let unmapped = 0, willWrite = 0;
    for (const inv of invs) {
        const name = inv.flat_property_type_id ? fptName[inv.flat_property_type_id] : null;
        const r = name ? resolved[name] : undefined;
        if (!r || !r.id) { unmapped++; continue; }
        const flagged = !r.confident;
        stats[name!] = stats[name!] || { mapped: 0, flagged: 0 };
        stats[name!].mapped++; if (flagged) stats[name!].flagged++;
        willWrite++;
        if (!DRY) {
            await prisma.inventory.update({
                where: { id: inv.id },
                data: { taxonomy_node_id: r.id, needs_taxonomy_review: flagged },
            });
        }
    }
    console.log(DRY ? '--- DRY RUN (no writes) ---' : '--- APPLIED ---');
    Object.entries(stats).sort((a, b) => b[1].mapped - a[1].mapped)
        .forEach(([k, v]) => console.log(String(v.mapped).padStart(4), k, v.flagged ? `(flagged ${v.flagged})` : ''));
    console.log(`TOTAL inventory=${invs.length} willWrite=${willWrite} unmapped=${unmapped} flaggedTotal=${Object.values(stats).reduce((s, v) => s + v.flagged, 0)}`);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 2: tsc.** Run: `cd backend && npx tsc --noEmit 2>&1 | grep backfill_taxonomy || echo CLEAN` → CLEAN.

- [ ] **Step 3: Deploy** the backend so the script is on the server. Run: `node deployment/deploy-agent.js backend --skip-verify` → SUCCESS.

---

## Task 2: DRY-RUN on prod (no writes) — checkpoint

- [ ] **Step 1: Run dry-run.** `ssh … 'cd /var/www/realty-pandit/backend && npx ts-node prisma/backfill_taxonomy.ts --dry-run 2>&1 | grep -viE "dotenv|tip:"'`
Expected: per-type counts summing to ~357, `unmapped=0` (every flat type is in MAP), and a flagged total (~Apartment/Gated 89 + Land/Plot 36 + Indep House/Villa 33 + Shops 10 + Showrooms 6 + Guest/Banquet 5 + Hotel 1 ≈ 180 flagged).

- [ ] **Step 2: CHECKPOINT — review with user.** If `unmapped>0`, extend MAP for the missing flat type name and re-dry-run. Only proceed to apply once counts look right.

---

## Task 3: APPLY on prod

- [ ] **Step 1: Apply.** `ssh … 'cd /var/www/realty-pandit/backend && npx ts-node prisma/backfill_taxonomy.ts 2>&1 | grep -viE "dotenv|tip:"'`
Expected: `--- APPLIED ---` with the same counts; `willWrite` rows updated.

- [ ] **Step 2: Idempotency re-run (optional).** Re-run apply → same counts, no errors (safe to re-run).

---

## Task 4: Verify

- [ ] **Step 1: Coverage + flag counts (server Prisma).** Confirm:
  - `count(inventory where taxonomy_node_id is not null)` == count with `flat_property_type_id` (≈357).
  - `count(inventory where needs_taxonomy_review=true)` ≈ the flagged total from the dry-run.
  - **Spot-check exact:** a Factory listing → node "Factory", `needs_taxonomy_review=false`.
  - **Spot-check flagged:** an "Apartment / Gated Society" listing → node "Flat", `needs_taxonomy_review=true`.
  - Legacy columns unchanged (sanity: `category`/`type`/`sub_category_id` still populated).

- [ ] **Step 2: Update plan status + memory.** Mark 1b shipped; note flagged count for the team's review queue (surfaced in 1c/admin).

---

## Task 5 (optional, same session): Contacts demand backfill
Only if clean — many contacts lack precise demand classification. Reuse `MAP` keyed off the contact's `flat`/legacy `demand_type_slug` where it maps unambiguously; otherwise leave `taxonomy_node_id` null (demand capture is Phase 2). Dry-run first; skip if the mapping is mostly ambiguous (don't force noise). Decide after seeing the contact-side distribution.

---

## Notes / risk
- **Reversible:** only sets a nullable FK + a boolean; to undo, `UPDATE inventory SET taxonomy_node_id=NULL, needs_taxonomy_review=false`. No legacy data touched; no consumer reads `taxonomy_node_id` yet (Phases 1d/2-5).
- **Idempotent:** re-running sets the same values.
- ~180/357 will be flagged for review — expected, because the old `flat_property_type` is coarser than the 57-type tree (e.g. all gated apartments collapse to "Flat"). The team refines via the 1c editor / a "Needs review" queue.
