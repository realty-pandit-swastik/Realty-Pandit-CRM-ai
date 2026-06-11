-- Phase 5 of demand-side unification (2026-05-29) — drop legacy demand columns
-- from contacts, leads, transactions. Their values now live inside the canonical
-- demand_schema_values JSON keyed by FieldDefinition.key, with demand_taxonomy_node_id
-- replacing the legacy classification slugs.
--
-- IRREVERSIBLE — pg_dump backup at /root/backups/db-pre-demand-p5-20260529-152828.sql.gz.
-- Pre-Phase-5 table snapshots also retained: *_bak_demand_p25_20260529092942.

-- contacts (Phase 0 backfill mapped legacy values into demand_schema_values for all rows with data)
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "demand_bhk";
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "demand_main_category";
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "demand_category";
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "demand_type_slug";
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "demand_amenities";

-- leads
ALTER TABLE "leads" DROP COLUMN IF EXISTS "demand_bhk";
ALTER TABLE "leads" DROP COLUMN IF EXISTS "demand_main_category";
ALTER TABLE "leads" DROP COLUMN IF EXISTS "demand_category";
ALTER TABLE "leads" DROP COLUMN IF EXISTS "demand_type_slug";
ALTER TABLE "leads" DROP COLUMN IF EXISTS "demand_amenities";

-- transactions
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "demand_bedrooms";
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "demand_property_type";
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "demand_category";
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "demand_type_slug";
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "demand_amenities";
