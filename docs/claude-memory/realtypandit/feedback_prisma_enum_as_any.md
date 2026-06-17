---
name: Never use `as any` to bypass Prisma enum checks
description: TypeScript `as any` casts on Prisma enum columns silently compile but throw 500 at runtime. Always match the schema enum exactly or add a migration first.
metadata:
  type: feedback
---

# Rule

When writing data to a Prisma column whose type is an enum (e.g., `TransactionLogAction`, `TransactionStatus`, `ContactType`), **never use `as any` to force a string through**. Either:
1. Use one of the existing enum values exactly as spelled in `schema.prisma`, or
2. Run a Prisma migration to add the new enum value first, then deploy code that uses it.

**Why:** TypeScript erases `as any` at compile time so the build passes, but Prisma validates the value at runtime against the actual Postgres enum. Mismatched values throw `PrismaClientValidationError: Invalid value for argument '<col>'. Expected <EnumName>.` and the whole route returns 500.

**How to apply:**
- Before adding a new "audit log action" or any enum-typed value, grep `schema.prisma` for `enum <Name>` and confirm it's listed.
- If the new value semantically doesn't exist, **add a Prisma migration** before shipping the code that uses it. Don't `as any` to "make TypeScript happy".
- When reviewing a PR, search the diff for `as any` near `prisma.*.create({` or `prisma.*.update({` — that's the canonical smell.
- If you absolutely need to ship code before the migration runs (e.g., to unblock a user), pick the **closest existing enum value** and put the precise semantic in a JSON `details` field. Then plan the migration as a follow-up.

## Incident — 2026-05-14

`agents/backend/src/routes/deals.ts:278` had:
```ts
prisma.transactionLog.create({
    data: {
        action: 'REQUIREMENTS_UPDATED' as any,  // ← compiles, but Prisma rejects
        ...
    }
})
```
`TransactionLogAction` (in `prisma/schema.prisma`) only has: `CREATED, STATUS_CHANGED, EXECUTIVE_ASSIGNED, EXECUTIVE_CHANGED, APPOINTMENT_LINKED, APPOINTMENT_COMPLETED, NEGOTIATION_UPDATE, PARTY_NOTIFIED, DUPLICATE_BLOCKED, CLOSED, REOPENED, NOTE_ADDED, FOLLOWUP_SENT, OWNERSHIP_TRANSFERRED`.

Result: every "Save & Qualify Lead" submission from Log Call modal → 500, "Required: Budget Min, Timeline" inline toast was a misleading symptom (the real error was server-side `Invalid value for argument 'action'`).

Quick-fix shipped: `action: 'NEGOTIATION_UPDATE'` + `details.change_type = 'requirements'`. Proper fix pending: add `REQUIREMENTS_UPDATED` to the enum via migration so audit logs read cleanly.

**Lesson:** any time the Prisma error message says `Invalid value for argument '<x>'. Expected <SomeEnum>.` and the failing data block doesn't visibly contain `<x>`, look for a `$transaction([...])` array nearby — it's almost always a nested write being force-casted.
