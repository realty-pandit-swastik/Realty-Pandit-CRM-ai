-- Pipeline Stage Unification — DEC-003 (2026-04-24)
-- Adds QUALIFIED and MATCHING_APPOINTMENT to TransactionStatus enum.
-- MATCHED is kept in the enum to avoid breaking existing rows (deprecated).
-- Adds visit outcome fields and workflow_round to transactions table.
--
-- Run order:
--   1. Apply this migration on the server
--   2. (Optional, after verifying zero MATCHED rows) run the cleanup at the bottom
--   3. Deploy updated backend code

-- ─── Step 1: Extend the TransactionStatus enum ───────────────────────────────

ALTER TYPE "TransactionStatus" ADD VALUE IF NOT EXISTS 'QUALIFIED';
ALTER TYPE "TransactionStatus" ADD VALUE IF NOT EXISTS 'MATCHING_APPOINTMENT';

-- ─── Step 2: Add new columns to transactions ─────────────────────────────────

ALTER TABLE "transactions"
    ADD COLUMN IF NOT EXISTS "visit_outcome"         TEXT,
    ADD COLUMN IF NOT EXISTS "client_interest_level" TEXT,
    ADD COLUMN IF NOT EXISTS "visit_feedback"        TEXT,
    ADD COLUMN IF NOT EXISTS "workflow_round"        INTEGER NOT NULL DEFAULT 1;

-- ─── Step 3: Data migration — move any MATCHED deals to QUALIFIED ─────────────
-- Safe to run even if no MATCHED rows exist.

UPDATE "transactions"
SET    "status" = 'QUALIFIED'
WHERE  "status" = 'MATCHED';

UPDATE "transactions"
SET    "previous_status" = 'QUALIFIED'
WHERE  "previous_status" = 'MATCHED';

UPDATE "transaction_logs"
SET    "old_status" = 'QUALIFIED'
WHERE  "old_status" = 'MATCHED';

UPDATE "transaction_logs"
SET    "new_status" = 'QUALIFIED'
WHERE  "new_status" = 'MATCHED';

-- ─── CLEANUP (run only after confirming zero MATCHED rows in all tables) ──────
-- PostgreSQL does not support DROP VALUE on enums directly.
-- To remove MATCHED later: recreate the type without it.
-- Steps when ready:
--
-- ALTER TYPE "TransactionStatus" RENAME TO "TransactionStatus_old";
-- CREATE TYPE "TransactionStatus" AS ENUM (
--     'NEW', 'QUALIFIED', 'MATCHING_APPOINTMENT',
--     'VISIT_SCHEDULED', 'VISITED', 'NEGOTIATION',
--     'CLOSED_WON', 'CLOSED_LOST', 'ON_HOLD'
-- );
-- ALTER TABLE "transactions"
--     ALTER COLUMN "status"          TYPE "TransactionStatus" USING "status"::text::"TransactionStatus",
--     ALTER COLUMN "previous_status" TYPE "TransactionStatus" USING "previous_status"::text::"TransactionStatus";
-- ALTER TABLE "transaction_logs"
--     ALTER COLUMN "old_status" TYPE "TransactionStatus" USING "old_status"::text::"TransactionStatus",
--     ALTER COLUMN "new_status" TYPE "TransactionStatus" USING "new_status"::text::"TransactionStatus";
-- DROP TYPE "TransactionStatus_old";
