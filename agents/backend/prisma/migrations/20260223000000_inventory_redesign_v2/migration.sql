-- CreateEnum for OwnershipType
DO $$ BEGIN
    CREATE TYPE "OwnershipType" AS ENUM ('OWNER', 'EXTERNAL_AGENT', 'AGENT_OWNER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable flat_property_types
CREATE TABLE IF NOT EXISTS "flat_property_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "main_category" TEXT NOT NULL,
    "icon" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "bhk_required" BOOLEAN NOT NULL DEFAULT false,
    "floor_required" BOOLEAN NOT NULL DEFAULT false,
    "plot_area_required" BOOLEAN NOT NULL DEFAULT false,
    "legacy_category_slug" TEXT,
    "legacy_type_slug" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flat_property_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "flat_property_types_slug_key" ON "flat_property_types"("slug");

-- Add new fields to inventory table
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "customer_price" DECIMAL(15,2);
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "display_price" DECIMAL(15,2);
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "upload_source" TEXT;
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "ownership_type" "OwnershipType";
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "uploader_phone" TEXT;
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "uploader_name" TEXT;
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "uploader_email" TEXT;
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "flat_property_type_id" TEXT;

-- Add foreign key for flat_property_type_id
DO $$ BEGIN
    ALTER TABLE "inventory" ADD CONSTRAINT "inventory_flat_property_type_id_fkey"
    FOREIGN KEY ("flat_property_type_id") REFERENCES "flat_property_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Create index on city
CREATE INDEX IF NOT EXISTS "inventory_city_idx" ON "inventory"("city");

-- Create index on flat_property_type_id
CREATE INDEX IF NOT EXISTS "inventory_flat_property_type_id_idx" ON "inventory"("flat_property_type_id");

-- Migrate existing data: copy district to city
UPDATE "inventory" SET "city" = "district" WHERE "city" IS NULL AND "district" IS NOT NULL;

-- Migrate existing data: copy price to customer_price and display_price
UPDATE "inventory" SET "customer_price" = "price" WHERE "customer_price" IS NULL AND "price" IS NOT NULL;
UPDATE "inventory" SET "display_price" = "price" WHERE "display_price" IS NULL AND "price" IS NOT NULL;

-- Set upload_source for existing records (default to 'unknown')
UPDATE "inventory" SET "upload_source" = 'unknown' WHERE "upload_source" IS NULL;
