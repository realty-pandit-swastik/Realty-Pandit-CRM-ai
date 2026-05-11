# Future Skills + Tooling

> Skills or tools to consider adopting based on recurring pain points. Not blockers — just opportunities.

## Strong candidates

### Automated WhatsApp template testing
**Pain solved:** We've shipped wrong template names (e.g. `rp_tx_followup_new` instead of `rp_tx_followup_new_v2`) which silently 404 in production. Each costs hours to diagnose.
**Approach:** A CI check that compares every template name referenced in code against the live Meta API (or a periodically-refreshed cache of it). Flag references that don't resolve to APPROVED templates.

### Contract tests for the workflow engine
**Pain solved:** `/api/workflow/commit` accepts free-form `answers` and silently creates partial inventory when required fields are missing. The NULL `uploaded_by_agent_id` bug (2026-05-11) is one example — similar traps exist elsewhere.
**Approach:** A small test suite that exercises the engine with a fixed set of "answer shapes" per `source` (web/admin/whatsapp/voice) and asserts the resulting Inventory row has all expected non-null fields.

### Prisma `where` builder helpers
**Pain solved:** The `where.OR` + new filter trap (see [`../precautions/prisma-where-or-pattern.md`](../precautions/prisma-where-or-pattern.md)) is a recurring bug class. Each new filter has to remember to preserve visibility.
**Approach:** A small typed helper `addOrFilter(where, newOR)` that does the AND-wrap correctly, and refactor existing endpoints to use it. ESLint rule to flag direct `delete where.OR` afterward.

### Server-side smoke tests after each deploy
**Pain solved:** We've shipped code that compiled fine and PM2 started fine but a route was broken at runtime. Browser QA catches some of this but not most.
**Approach:** A small "list of canary GET requests" — hit every `/api/...` route with a known-good auth token and assert 200. Runs after `deploy-agent.js` succeeds. Likely 2–3 hours to build.

## Maybe / lower priority

### Storybook for admin components
Would help isolate component bugs from page-level state, but the admin frontend doesn't use Tailwind and the inline-styles + CSS-variable approach makes a Storybook setup more work than usual.

### Codified runbooks as executable scripts
Right now `runbooks/deploy.md`, `runbooks/inventory-null-agent-recovery.md` etc. are markdown. A future move would turn them into idempotent shell scripts that print their own logs. Trade-off: scripts drift from reality faster than prose. Defer.

### Realtime DB schema validator
Would catch the `phone_number` vs `phone` and `image_urls` vs `media_urls` class of bugs at PR time. The schema is in `prisma/schema.prisma`; a hook could parse it and ESLint-flag references to non-existent fields. Tractable but not urgent given the existing field-naming pain has dropped after the 2026-04-18 fixes.
