-- Phase 0 of demand-side unification (2026-05-29). Non-destructive: adds
-- demand_taxonomy_node_id + demand_schema_values to contacts, leads, transactions.
-- These become the new SoT for buyer/tenant requirements, mirroring the shape of
-- inventory.taxonomy_node_id + inventory.specs. Legacy columns (demand_bhk,
-- demand_bedrooms, demand_amenities, demand_type_slug, demand_main_category,
-- demand_category, demand_property_type, category_id/sub_category_id/type_id)
-- are left in place — Phase 0 only adds; Phase 5 will drop them.

ALTER TABLE "contacts"     ADD COLUMN IF NOT EXISTS "demand_taxonomy_node_id" TEXT;
ALTER TABLE "contacts"     ADD COLUMN IF NOT EXISTS "demand_schema_values"    JSONB;

ALTER TABLE "leads"        ADD COLUMN IF NOT EXISTS "demand_taxonomy_node_id" TEXT;
ALTER TABLE "leads"        ADD COLUMN IF NOT EXISTS "demand_schema_values"    JSONB;

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "demand_taxonomy_node_id" TEXT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "demand_schema_values"    JSONB;
