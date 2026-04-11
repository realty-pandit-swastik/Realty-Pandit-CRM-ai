-- AlterTable: Add display_id, completion_pct, is_enriched to inventory
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "display_id" TEXT;
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "completion_pct" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "is_enriched" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_display_id_key" ON "inventory"("display_id");
CREATE INDEX IF NOT EXISTS "inventory_display_id_idx" ON "inventory"("display_id");
