-- Add structured address fields to Inventory (all nullable, backward-compatible)
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "district" TEXT;
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "locality" TEXT;
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "pincode" TEXT;
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "full_address" TEXT;

-- Add composite index for geographic search
CREATE INDEX IF NOT EXISTS "inventory_state_district_idx" ON "inventory"("state", "district");

-- Create InventoryDocument model for property documents
CREATE TABLE IF NOT EXISTS "inventory_documents" (
    "id" TEXT NOT NULL,
    "inventory_id" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER,
    "uploaded_via" TEXT NOT NULL DEFAULT 'web',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_documents_pkey" PRIMARY KEY ("id")
);

-- Add foreign key and index
DO $$ BEGIN
    ALTER TABLE "inventory_documents" ADD CONSTRAINT "inventory_documents_inventory_id_fkey"
    FOREIGN KEY ("inventory_id") REFERENCES "inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "inventory_documents_inventory_id_idx" ON "inventory_documents"("inventory_id");
