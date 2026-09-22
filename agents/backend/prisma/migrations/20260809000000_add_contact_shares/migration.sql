-- ContactShare (2026-08-09) — a real per-person share record for LEADS.
--
-- Phase 4a of the lead-sharing work, and deliberately EXPAND-ONLY: this creates the
-- table and starts dual-writing it, but every read still goes through
-- Contact.shared_with_ids. Behaviour is unchanged and a code-only rollback is safe.
--
-- Why a table rather than a `shared_at` column on contacts: the array cannot say WHEN
-- a given person received a lead or WHO sent it, so "shared with me, newest first" is
-- unbuildable and there is no audit of who shared what. One column could only ever
-- carry one timestamp for the whole array.
--
-- Contact.shared_with_ids is intentionally NOT dropped here. It stays as a synchronised
-- mirror until 4b (reads) has run in production for a while; dropping it early makes
-- rollback impossible.
CREATE TABLE IF NOT EXISTS "contact_shares" (
    "id"           TEXT NOT NULL,
    "tenant_id"    TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "agent_id"     TEXT NOT NULL,
    "shared_by"    TEXT,
    "shared_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_shares_pkey" PRIMARY KEY ("id")
);

-- One row per (lead, recipient). Makes the dual-write an idempotent upsert and stops
-- a re-save from stacking duplicate shares.
CREATE UNIQUE INDEX IF NOT EXISTS "contact_shares_phone_number_agent_id_key"
    ON "contact_shares"("phone_number", "agent_id");

-- Serves the 4b read path ("leads shared with ME") and the 4c sort ("newest share first").
CREATE INDEX IF NOT EXISTS "contact_shares_agent_id_shared_at_idx"
    ON "contact_shares"("agent_id", "shared_at");

CREATE INDEX IF NOT EXISTS "contact_shares_tenant_id_idx"
    ON "contact_shares"("tenant_id");

-- Cascade: deleting a lead must not leave shares granting visibility to a ghost row.
-- agent_id is deliberately a bare column with NO FK, mirroring shared_with_ids and the
-- rest of the codebase (Transaction.demand_handler_id): a stale id simply stops matching
-- anyone instead of blocking an agent delete.
ALTER TABLE "contact_shares"
    ADD CONSTRAINT "contact_shares_phone_number_fkey"
    FOREIGN KEY ("phone_number") REFERENCES "contacts"("phone_number")
    ON DELETE CASCADE ON UPDATE CASCADE;
