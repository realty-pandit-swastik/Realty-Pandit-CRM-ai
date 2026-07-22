-- Portal lead-routing identifiers (2026-06-25): per-agent 99acres + MagicBricks emails
-- so portal leads route to the listing agent instead of round-robin.
-- AlterTable
ALTER TABLE "agents" ADD COLUMN "nine9acres_email" TEXT,
ADD COLUMN "magicbricks_email" TEXT;
