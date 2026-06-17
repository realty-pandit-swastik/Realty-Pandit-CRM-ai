---
name: Agent model uses phone not phone_number
description: Internal Agent model field is phone (nullable), NOT phone_number — every other model uses phone_number, creating a recurring bug pattern
type: feedback
---

The internal staff `Agent` model (prisma.agent) uses `phone` as the field name — NOT `phone_number`.

Every other model uses `phone_number`:
- Contact → `phone_number`
- PartnerAgent → `phone_number`
- AgentOnboardingSession → `phone_number`
- Interaction → `phone_number`

**Why:** Developers copying patterns from Contact/PartnerAgent queries naturally type `phone_number` when querying the Agent model. TypeScript doesn't always catch this at write time if `as any` casts or dynamic where-clauses are used. Prisma throws a runtime ValidationError which crashes the backend process, causing PM2 restarts.

**Bugs fixed 2026-04-18** (all in `workflow_engine.ts`):
1. `validateAgentPhone()` line ~42 — was `findUnique({ where: { phone_number } })` → fixed to `findFirst({ where: { phone: { in: phoneVariants(...) } } })`
2. Auto-detect agent by uploader phone line ~704 — same fix
3. Link inventory to internal agent by dealer phone line ~1039 — same fix

**How to apply:**
- BEFORE writing any `prisma.agent.find*` query, always use `phone` not `phone_number`
- ALWAYS use `findFirst` not `findUnique` for phone lookups (phone is not @unique on Agent)
- Use `phoneVariants()` helper: `where: { phone: { in: phoneVariants(somePhone) }, status: 'active' }`
- When auditing for this bug: `grep -rn 'prisma\.agent\.find' src/ | grep 'phone_number'`
