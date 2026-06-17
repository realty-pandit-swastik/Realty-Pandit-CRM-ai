---
name: feedback-jwt-agent-shape
description: `req.agent` is the raw JWT payload — only has id, email, role, tenant_id. NO name. Fetch name from DB when needed for audit text/notifications.
metadata:
  type: feedback
---

# `req.agent.name` is always `undefined`

`authMiddleware` (agents/backend/src/middleware/auth.ts:100) does `req.agent = decoded` where `decoded` is the verified JWT payload. The token contains only `{id, email, role, tenant_id, iat, exp}`. There is no enrichment step.

**Symptoms when you forget:**
- Audit `interactions.content` like `"Lead reassigned from undefined to Pawan…"`
- WhatsApp template renders `${by_agent_name}` as `undefined`
- These DON'T crash — `undefined` interpolates silently — so the bug ships and is only caught by reading the audit row.

**Existing routes already have this latent bug** in inventory.ts:1082 and deals.ts:358 — the audit text reads "from undefined" for super_boss/manager actors too. Not introduced by you, but don't propagate the pattern.

**Why:** The JWT was designed for auth, not personalization. Adding `name` to the payload bloats every request; better to fetch on-demand when audit text actually needs it.

**How to apply:** Whenever you need `actor.name` in a route handler:

```ts
const actorRecord = await prisma.agent.findUnique({
    where: { id: req.agent.id },
    select: { name: true },
});
const actorName = actorRecord?.name || req.agent.email || 'a team member';
```

Use `actorName` in audit content, notification metadata, log lines. The metadata `actor_id` field is still the source of truth — name is human-readable diagnostic only.

## Related

- [[feedback_prisma_enum_as_any]] — another "compiles fine, silent in prod" pattern
- [[reference_deal_permissions]] — uses `req.agent.role` heavily (which IS in JWT)
