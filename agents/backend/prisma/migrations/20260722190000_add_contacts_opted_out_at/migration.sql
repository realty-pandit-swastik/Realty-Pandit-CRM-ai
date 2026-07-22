-- Consent flag, separate from the sales-outcome lost_reason.
-- Applied to production by hand (column-first) on 2026-07-22 before the code deploy;
-- this file exists so migration state matches the database.
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "opted_out_at" TIMESTAMP(3);
