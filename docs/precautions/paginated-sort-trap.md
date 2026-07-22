# Precaution — never sort a paginated list on the client

## The bug pattern

```
server:  findMany({ where, orderBy: { updated_at: 'desc' }, take: 500 })
client:  const sorted = [...rows].sort(byNextActionTime)     // ← wrong
```

This looks fine and is catastrophically wrong once the table outgrows the page size. The client can
only reorder **the rows it was given**, and *which* rows those are was decided by a completely
different ordering key on the server.

## What it cost us (Deal Pipeline, found 2026-07-22)

| | |
|---|---|
| Active deals | **3,981** |
| Rows the board fetched | **500** (`updated_at desc`) |
| Deals with a pending reminder | **3,603** |
| **…invisible on the board entirely** | **3,114 (86%)** |

`updated_at` is `@updatedAt`, so **any** write bumps it — an AI reply, a webhook, a cron. Every such
write silently changed *which* 500 deals came back. A deal a team member had set a reminder on did
not sink down the list; it **dropped off the board completely**.

Reported symptom was "the tiles are jumbled and reminders get buried", and the assumed cause was
AI-calling reordering the board. There is no AI-call sort field anywhere — AI scheduling lives in
BullMQ/Redis and never touches ordering. The real cause was this pattern.

## The rule

**If a list is paginated, capped, or lazy-loaded, its ordering MUST be decided server-side.**
Client-side sorting is only ever valid when the client provably holds *every* matching row.

Same applies to "Load more": the server must rank the full filtered set, then slice.

## How to do it instead

Whitelist the sort keys server-side and map them to `orderBy` — never interpolate a client string
into a query:

```ts
const LEAD_SORTS: Record<string, (d: 'asc'|'desc') => any> = {
    name:   d => ({ name: { sort: d, nulls: 'last' } }),
    score:  d => ({ lead_score: { total_score: d } }),   // to-one relation
    date:   d => ({ created_at: d }),
};
const orderBy = (LEAD_SORTS[req.query.sort as string] || LEAD_SORTS.date)(dir);
```

See `routes/leads.ts#recent-external` and `services/deal_service.ts#listDeals`.

### When the sort key lives in another table
Deal ordering keys off the next pending reminder, which is a `Task` row, and Prisma cannot
`orderBy` a related aggregate. Working approach that needs **no schema change and no raw SQL**:

1. `findMany({ where, select: { id, created_at } })` — all matching ids (~4k rows, cheap)
2. one batched `task.findMany({ deal_id: { in: ids }, task_type: 'REMINDER', status: 'TODO' })`
3. sort ids in JS, `slice` the page
4. `findMany({ where: { id: { in: pageIds } }, include: … })` and **re-apply the order** —
   `IN (…)` does *not* preserve it

## Gotchas

- **NULLs.** Postgres puts NULLs *first* on `DESC`. Use `{ sort, nulls: 'last' }` on nullable
  scalars. **Prisma 5.22 rejects `nulls` when ordering through a relation** — so relation-based
  columns (e.g. Score, Assigned to) still show blanks first on descending. Known limitation.
- **Flat vs grouped views.** The Deal Pipeline renders three ways (kanban / mobile / list). The
  kanban filtered by stage; the mobile and list views rendered *every fetched row*, so ON_HOLD and
  closed deals leaked into them. Apply the same visibility filter to all render paths.
- **Don't verify a sort fix from the UI alone** — page 1 looks plausible under almost any ordering.
  Assert on `total`, on page-1-vs-page-2 having **zero overlap**, and on the extremes of each key.
