-- Phase 1a: canonical taxonomy foundation (additive, non-destructive)

-- TaxonomyNode
CREATE TABLE "taxonomy_nodes" (
  "id" TEXT NOT NULL,
  "parent_id" TEXT,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "node_kind" TEXT NOT NULL,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "labels_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "taxonomy_nodes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "taxonomy_nodes_parent_id_slug_key" ON "taxonomy_nodes"("parent_id", "slug");
CREATE INDEX "taxonomy_nodes_parent_id_idx" ON "taxonomy_nodes"("parent_id");
CREATE INDEX "taxonomy_nodes_node_kind_idx" ON "taxonomy_nodes"("node_kind");
ALTER TABLE "taxonomy_nodes" ADD CONSTRAINT "taxonomy_nodes_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "taxonomy_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FieldDefinition
CREATE TABLE "field_definitions" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "input_type" TEXT NOT NULL,
  "options_json" JSONB,
  "unit" TEXT,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "field_definitions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "field_definitions_key_key" ON "field_definitions"("key");

-- NodeField
CREATE TABLE "node_fields" (
  "id" TEXT NOT NULL,
  "taxonomy_node_id" TEXT NOT NULL,
  "field_id" TEXT NOT NULL,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "label_override" TEXT,
  "options_override" JSONB,
  CONSTRAINT "node_fields_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "node_fields_taxonomy_node_id_field_id_key" ON "node_fields"("taxonomy_node_id", "field_id");
CREATE INDEX "node_fields_taxonomy_node_id_idx" ON "node_fields"("taxonomy_node_id");
ALTER TABLE "node_fields" ADD CONSTRAINT "node_fields_taxonomy_node_id_fkey"
  FOREIGN KEY ("taxonomy_node_id") REFERENCES "taxonomy_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "node_fields" ADD CONSTRAINT "node_fields_field_id_fkey"
  FOREIGN KEY ("field_id") REFERENCES "field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Node FK + review flag on inventory & contacts (additive)
ALTER TABLE "inventory" ADD COLUMN "taxonomy_node_id" TEXT;
ALTER TABLE "inventory" ADD COLUMN "needs_taxonomy_review" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "contacts" ADD COLUMN "taxonomy_node_id" TEXT;
ALTER TABLE "contacts" ADD COLUMN "needs_taxonomy_review" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_taxonomy_node_id_fkey"
  FOREIGN KEY ("taxonomy_node_id") REFERENCES "taxonomy_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_taxonomy_node_id_fkey"
  FOREIGN KEY ("taxonomy_node_id") REFERENCES "taxonomy_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
