-- Partner "revert to customer" (2026-08-10).
--
-- Staff convert leads to partner agents by accident; until now that was one-way. These two columns
-- mark a partner that has been reverted, so the Partner Agents list can hide them.
--
-- Why not a new AgentStatus enum value: status is set to SUSPENDED on revert, which the EXISTING
-- login gate (routes/agent.ts — "only ACTIVE partners may sign in", 2026-07-12) already honours, so
-- access is revoked with no new code. A separate timestamp keeps reverted partners distinguishable
-- from the 13 genuinely SUSPENDED ones, which must stay visible and manageable.
ALTER TABLE "partner_agents" ADD COLUMN IF NOT EXISTS "reverted_at" TIMESTAMP(3);
ALTER TABLE "partner_agents" ADD COLUMN IF NOT EXISTS "reverted_by" TEXT;

-- The list query filters on reverted_at IS NULL on every page load.
CREATE INDEX IF NOT EXISTS "partner_agents_reverted_at_idx" ON "partner_agents"("reverted_at");
