-- Commercial use on residential inventory (2026-07-29)
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "commercial_use" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "commercial_use_type" TEXT;
