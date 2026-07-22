-- PER-MANAGER PRODUCTIVITY TARGETS (2026-07-16 - Phase 5B)
-- Additive + isolated: one new table, nothing else touched. Safe to apply BEFORE the code
-- that uses it (the currently-running Prisma client is unaffected). Mirrors the additive,
-- idempotent style of 20260713000000_partner_teams.

CREATE TABLE IF NOT EXISTS "targets" (
  "id"               TEXT NOT NULL,
  "tenant_id"        TEXT NOT NULL,
  "manager_agent_id" TEXT NOT NULL,
  "period"           TEXT NOT NULL DEFAULT 'monthly',
  "leads"            INTEGER NOT NULL DEFAULT 30,
  "appointments"     INTEGER NOT NULL DEFAULT 15,
  "inventory"        INTEGER NOT NULL DEFAULT 10,
  "conversion_rate"  DOUBLE PRECISION NOT NULL DEFAULT 0.2,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "targets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "targets_tenant_id_manager_agent_id_period_key"
  ON "targets"("tenant_id", "manager_agent_id", "period");
