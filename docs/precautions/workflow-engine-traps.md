# Workflow Engine Traps

## Trap 1: Silent NULL `uploaded_by_agent_id` from `/api/workflow/commit`

**Symptom:** Inventory submitted by a logged-in agent never shows up in their (or their manager's) list. It IS created in the DB, but with `uploaded_by_agent_id = NULL` — invisible to all role-based visibility filters.

**Root cause:** `POST /api/workflow/commit` historically had no `authMiddleware`. It read JWT optionally — if the token was expired/missing, the catch block silently swallowed the error and `agentId` stayed `undefined`. Engine then wrote `uploaded_by_agent_id: agentId || undefined` → NULL.

**Why this trap exists:** The endpoint is shared by web/whatsapp/voice (which legitimately have no agent) AND admin (which must have one). The original author didn't separate the two source modes.

**Fix landed 2026-05-11** at `backend/src/routes/workflow.ts:269-285`: explicit `if (source === 'admin' && !agentId) return 401`.

**How to apply (going forward):**
- Any new endpoint that conditionally consumes a JWT MUST reject `source === 'admin'` requests when the JWT fails to verify.
- Pattern: check `source` first, then validate JWT strictly for admin, optionally for others.
- See also: [`../runbooks/inventory-null-agent-recovery.md`](../runbooks/inventory-null-agent-recovery.md) for the data backfill procedure when this trap fired in production.

---

## Trap 2: Prisma `where.OR` deletion when adding AND filters

**Symptom:** Role-based visibility filter disappears the moment a user applies a location/search filter. Either the page goes blank (managers see nothing) or it shows the entire DB (visibility OR was removed entirely).

**Root cause:** Combining `where.OR` (visibility) with a new OR clause (e.g. location) using the naive pattern below drops the original visibility OR completely:

```ts
// ❌ WRONG — deletes visibility OR
if (where.OR) {
    where.AND = [...(where.AND || []), { OR: locOR }];
    delete where.OR;
}
```

**Correct pattern (mirrors the search filter at `backend/src/routes/inventory.ts:335-355`):**

```ts
// ✅ Preserves both
if (where.OR) {
    const visibilityOR = where.OR;
    delete where.OR;
    where.AND = [...(where.AND || []), { OR: visibilityOR }, { OR: locOR }];
} else {
    where.OR = locOR;
}
```

**Fix landed 2026-05-11** at `backend/src/routes/inventory.ts:327-333` (location filter).

**How to apply:** Any new filter added to `GET /api/inventory` (or any other endpoint with role-based visibility OR) MUST follow this pattern. Reference: search filter (correct example) vs the original location filter (the trap).
