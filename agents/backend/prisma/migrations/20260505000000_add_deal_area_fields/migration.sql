-- Add area requirement fields to Transaction for Deal Workspace
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "demand_area_min" DOUBLE PRECISION;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "demand_area_max" DOUBLE PRECISION;
