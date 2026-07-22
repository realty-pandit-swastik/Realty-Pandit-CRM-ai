-- PARTNER TEAMS (2026-07-13)
-- A partner company's sub-agent is a PartnerAgent, NOT an Agent. Every existing "who owns this"
-- column (contacts.assigned_agent_id, transactions.coordinator_agent_id, inventory.assigned_agent_id)
-- is a hard FK to "agents", so a sub-agent id can never be stored there.
--
-- Add ONE bare, nullable, UNCONSTRAINED column per table to record which sub-agent is WORKING the row.
-- No FK - deliberately mirrors the proven transactions.demand_handler_id / supply_handler_id pattern
-- (a String that holds a PartnerAgent.id). An orphaned assignee id then simply stops matching a
-- sub-agent's scope instead of blocking a partner delete.
--
-- These are kept STRICTLY separate from the referral/handler columns, which record WHO BROUGHT the
-- business (attribution + commission) and must survive any reassignment.
--
-- Purely additive + nullable => the currently-running Prisma client is unaffected, so this migration
-- is safe to apply BEFORE the code that uses it.

ALTER TABLE "contacts"     ADD COLUMN IF NOT EXISTS "partner_assignee_id" TEXT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "partner_assignee_id" TEXT;
ALTER TABLE "inventory"    ADD COLUMN IF NOT EXISTS "partner_assignee_id" TEXT;

CREATE INDEX IF NOT EXISTS "contacts_partner_assignee_id_idx"     ON "contacts"("partner_assignee_id");
CREATE INDEX IF NOT EXISTS "transactions_partner_assignee_id_idx" ON "transactions"("partner_assignee_id");
CREATE INDEX IF NOT EXISTS "inventory_partner_assignee_id_idx"    ON "inventory"("partner_assignee_id");

-- contacts.referral_partner_id was NEVER indexed, yet it is the hot predicate of the partner lead
-- list and is traversed as a nested relation filter from the deal scope. Add it now.
CREATE INDEX IF NOT EXISTS "contacts_referral_partner_id_idx"     ON "contacts"("referral_partner_id");
