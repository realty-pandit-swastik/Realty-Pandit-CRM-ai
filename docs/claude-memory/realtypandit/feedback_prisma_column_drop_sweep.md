---
name: feedback_prisma_column_drop_sweep
description: When dropping legacy Prisma columns, tsc --noEmit is NOT enough — PATCH routes with string-typed `allowed` arrays (`/deals/:id/requirements`, `/leads/:phone/requirements`) silently keep accepting the dropped keys and crash Prisma at runtime with 500. Grep route files for legacy column name string literals after every drop.
metadata:
  type: feedback
---

After the Phase 5 demand-column drop (2026-05-29), the backend was clean per
`tsc --noEmit` but `PATCH /api/deals/:id/requirements` and
`PATCH /api/leads/:phone/requirements` returned **500** in production. Root
cause: both routes carry a hand-maintained list of legacy column names as
string literals:

```ts
const allowed = [
    'demand_intent', 'demand_category', 'demand_type_slug', 'demand_property_type',
    'demand_bedrooms', 'demand_location', 'demand_budget_min', 'demand_budget_max',
    'demand_area_min', 'demand_area_max', 'demand_amenities', 'demand_notes',
] as const;
for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];   // ← any req.body
}
await prisma.transaction.update({ where: { id }, data: updates });  // ← BOOM
```

`req.body` is `any` from Express, the `allowed` array is `as const` strings,
and the assignment is `Record<string, any>` — Prisma's strict input types
never see the dropped keys. `tsc` happily compiles. The first PATCH from the
old form crashes with `Unknown argument 'demand_category'`.

**Why:** when you write `data: { ...updates }` where `updates` is a
`Record<string, any>` shape, TypeScript does NOT verify the keys against
Prisma's generated `Create/UpdateInput`. Only literal-object spreads (`data: { demand_category: '…' }`)
get checked. Routes that filter through allow-arrays slip past every static check.

**How to apply:**

When dropping any Prisma column, after the schema edit + migration sweep:

```bash
# tsc check (catches direct literal writes)
cd agents/backend && npx tsc --noEmit 2>&1 | grep "<column_name>"

# String grep — catches allow-arrays, body destructuring, switch cases
grep -rn "'<column_name>'\|\"<column_name>\"\|\.<column_name>" src/routes/ src/services/
```

Both. tsc alone is insufficient. Concretely the patterns to clean:

1. `const allowed = [..., 'demand_xxx', ...]` arrays in PATCH routes
2. `const { demand_xxx, ... } = req.body` destructuring (the var is just unused,
    but the next `if (demand_xxx !== undefined) updateData.demand_xxx = ...`
    crashes Prisma)
3. `dealSync.demand_xxx = ...` writeback blocks (the lead `/requirements` route
    syncs Contact changes to active Transactions and re-introduces the same trap)
4. Frontend canonical save handlers that derive legacy fields from
    `demand_schema_values` and POST them as a "courtesy" mirror — they round-trip
    back through the route's allow-list and hit the same Prisma rejection. Send
    canonical only.

For the Phase 5 fix, the routes were rewritten to:
- accept canonical universal columns in `allowed`
- accept legacy keys in the body but route them through `foldLegacyDemand()` so
   they merge into `demand_schema_values` (the canonical SoT) instead of writing
   as columns
- drop the dropped-column Contact-sync writeback

Related: [[reference_demand_canonical_sot]],
[[reference_inventory_specs_sot]] for the inventory-side mirror.
