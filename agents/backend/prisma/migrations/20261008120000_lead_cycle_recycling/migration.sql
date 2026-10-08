-- Lead-cycle renewal (2026-10-08): allow a lost lead to be recycled into a NEW sales cycle.
--
-- Design constraints (deliberately narrow so nothing existing is rewritten):
--   * created_at is NEVER overwritten: first-seen date, age metrics, reports and the audit
--     trail must keep pointing at the original enquiry.
--   * recycled_at is NULLABLE with no backfill -> it records provenance only.
--   * cycle_start_at carries the CURRENT cycle (== created_at until recycled). It is a DEFAULT
--     column, which is metadata-only in Postgres 11+ (no table rewrite, no backfill), and it is
--     denormalised on purpose: `COALESCE(recycled_at, created_at)` cannot be expressed in a
--     Prisma orderBy, and a NULL recycled_at sorts FIRST in Postgres, which would put every
--     never-recycled lead ahead of every renewed one.
--   * lead_cycle defaults to 1 (the original enquiry) and only increments on a recycle.
--
-- ⚠ ORDER MATTERS. `ADD COLUMN ... NOT NULL DEFAULT CURRENT_TIMESTAMP` does NOT leave existing rows
-- empty — Postgres logically applies the volatile default to EVERY existing row, so all legacy
-- leads would come back with cycle_start_at = migration time and jump to the top of the newest-first
-- sort as if they were added today. So: add nullable → backfill from created_at → only then set the
-- NOT NULL default, which is metadata-only and therefore cheap for existing rows.
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "recycled_at" TIMESTAMP(3);
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "cycle_start_at" TIMESTAMP(3);
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "lead_cycle" INTEGER;

-- Backfill: the current cycle of a lead that was never recycled IS its first-seen date.
UPDATE "contacts" SET "cycle_start_at" = "created_at" WHERE "cycle_start_at" IS NULL;
UPDATE "contacts" SET "lead_cycle" = 1 WHERE "lead_cycle" IS NULL;

ALTER TABLE "contacts" ALTER COLUMN "cycle_start_at" SET NOT NULL;
ALTER TABLE "contacts" ALTER COLUMN "cycle_start_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "contacts" ALTER COLUMN "lead_cycle" SET NOT NULL;
ALTER TABLE "contacts" ALTER COLUMN "lead_cycle" SET DEFAULT 1;

-- Stage filter + work-queue ordering read the current cycle.
CREATE INDEX IF NOT EXISTS "contacts_cycle_start_at_idx" ON "contacts"("cycle_start_at");
CREATE INDEX IF NOT EXISTS "contacts_recycled_at_idx" ON "contacts"("recycled_at");