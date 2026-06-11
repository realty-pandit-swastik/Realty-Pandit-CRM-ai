-- Phase 1d: legacy classification map on TaxonomyNode (back-compat for add-inventory commit).
-- Nullable, additive, non-breaking. Populated by prisma/backfill_node_legacy.ts.
ALTER TABLE "taxonomy_nodes" ADD COLUMN "legacy_sub_category_id" TEXT;
ALTER TABLE "taxonomy_nodes" ADD COLUMN "legacy_type_id" TEXT;
ALTER TABLE "taxonomy_nodes" ADD COLUMN "legacy_flat_property_type_id" TEXT;
