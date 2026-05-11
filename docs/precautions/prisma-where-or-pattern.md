# Prisma `where.OR` Preservation Pattern

## The rule

When an endpoint has **role-based visibility** implemented as `where.OR = [...]` and you need to add a new filter that is also an OR (e.g. location, search, tag), you MUST preserve the original visibility OR.

This is a recurring trap in the Realty Pandit codebase because most listing endpoints (`/api/inventory`, `/api/leads`, `/api/deals`) combine visibility OR with multiple optional filters.

## The wrong pattern (silently breaks visibility)

```ts
// ❌ Deletes the role-based visibility OR
if (where.OR) {
    where.AND = [...(where.AND || []), { OR: newFilterOR }];
    delete where.OR;
}
```

Effect: managers/employees see nothing (visibility OR gone) OR see everything (depending on what AND was already there).

## The correct pattern

```ts
// ✅ Wraps both ORs inside AND
if (where.OR) {
    const visibilityOR = where.OR;
    delete where.OR;
    where.AND = [...(where.AND || []), { OR: visibilityOR }, { OR: newFilterOR }];
} else {
    where.OR = newFilterOR;
}
```

Effect: result must satisfy both ORs → visibility preserved AND new filter applied.

## Reference

- Correct example: search filter in `backend/src/routes/inventory.ts:335-355`
- Original trap (fixed 2026-05-11): location filter in `backend/src/routes/inventory.ts:317-333`
- Related: [`workflow-engine-traps.md`](workflow-engine-traps.md) (Trap 2 covers this same pattern)

## When to apply

Whenever you add a new optional filter to any listing endpoint with role-based visibility. Audit checklist on new filter PRs: "does the existing endpoint use `where.OR`? If yes, did the new filter preserve it via the AND-wrap pattern?"
