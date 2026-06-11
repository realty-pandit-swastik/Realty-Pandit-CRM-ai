-- Add "pre-rented" (pre-lease) fields to inventory (2026-06-10).
-- A for-sale property that already has a sitting tenant paying rent. Additive, non-destructive.
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "pre_rented" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "pre_rented_monthly_rent" DECIMAL(65,30);
