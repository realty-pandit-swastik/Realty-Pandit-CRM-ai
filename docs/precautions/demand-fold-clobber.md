# `foldLegacyDemand` Spread Clobbers Explicit Demand Fields

## The rule

`foldLegacyDemand(legacy)` returns an object that **always includes `demand_taxonomy_node_id`** (as `legacy.demand_taxonomy_node_id ?? null`) and `demand_schema_values`. When you spread its result into a Prisma `create`/`update`/`upsert` payload, that spread **overwrites** any field of the same name set earlier in the object literal.

So if you set `demand_taxonomy_node_id` explicitly and then spread `foldLegacyDemand({...})` **after** it without passing the node id, the spread silently nulls your value. Legacy ids (`sub_category_id`, `category_id`, `type_id`) survive only because fold does not emit them.

## The wrong pattern (silently nulls the canonical node)

```ts
// ❌ The fold spread runs LAST and rewrites demand_taxonomy_node_id back to null
const data = {
    demand_taxonomy_node_id: demandTax.demand_taxonomy_node_id ?? undefined,
    sub_category_id: demandTax.sub_category_id ?? undefined,
    ...(foldLegacyDemand({ demand_amenities: amenities ?? null }) as any), // emits demand_taxonomy_node_id: null
};
```

## The right pattern

Feed the resolved node id (and bhk/amenities) **into** the fold so it re-emits the correct value:

```ts
// ✅ fold re-writes the same good value; nothing is clobbered
...(foldLegacyDemand({
    demand_taxonomy_node_id: demandTax.demand_taxonomy_node_id,
    demand_bhk: bhk ?? null,
    demand_amenities: amenities ?? null,
}) as any),
```

(Alternatively, move the explicit `demand_taxonomy_node_id` assignment **after** the spread — but feeding fold keeps the canonical dual-write consistent and is preferred.)

## Where this bit us (2026-06-14)

The website lead-capture popup was rebuilt to send the precise `taxonomy_node_id`. The contact's `sub_category_id`/`category_id` persisted correctly but `demand_taxonomy_node_id` came back **null** on every lead. Root cause was this clobber in two upsert sites:

- `routes/public.ts` — `POST /public/lead-requirements` (update + create branches)
- `workflows/buyer_workflow_engine.ts` — buyer upsert (update + create branches)

Both had the latent bug since the Phase-1 dual-write landed; it was invisible until something actually passed a node id. Fixed by feeding `demandTax.demand_taxonomy_node_id` into `foldLegacyDemand`.

**Note:** a separate prerequisite fix was needed — `resolveDemandTaxonomy` (the function the handlers call) had no `demand_taxonomy_node_id` fast-path; only `resolveTypeFilter` did. Added a `byNodeId` branch at the top of `resolveDemandTaxonomy`. `loadMaps` caches only `node_kind: 'TYPE'` nodes, which is exactly what the website tree's leaves are, so the fast-path always hits for website-picked types.

## When to watch for it

Any new contact/lead/transaction write that sets a `demand_*` field explicitly AND spreads `foldLegacyDemand(...)`. Grep `foldLegacyDemand` before adding a demand field to such a payload, and confirm the spread is fed the value you intend to keep.
