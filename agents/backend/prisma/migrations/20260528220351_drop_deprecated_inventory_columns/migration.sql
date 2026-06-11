-- Phase 4 of specs unification (2026-05-28) — drop the 5 deprecated scalar columns
-- on `inventory`. Their values now live inside `inventory.specs` JSON under canonical
-- taxonomy keys (specs.furnishing, specs.facing, specs['age-of-construction'],
-- specs.floors, specs.amenities). Pre-migration data was backfilled (Phase 0),
-- normalized (Phase 2.5), and code was migrated to read pure specs in Phase 3.
-- IRREVERSIBLE — full DB backup at /root/backups/db-pre-phase4-20260528-220241.sql.gz.

ALTER TABLE "inventory" DROP COLUMN IF EXISTS "furnishing";
ALTER TABLE "inventory" DROP COLUMN IF EXISTS "facing";
ALTER TABLE "inventory" DROP COLUMN IF EXISTS "property_age";
ALTER TABLE "inventory" DROP COLUMN IF EXISTS "total_floors";
ALTER TABLE "inventory" DROP COLUMN IF EXISTS "features";
