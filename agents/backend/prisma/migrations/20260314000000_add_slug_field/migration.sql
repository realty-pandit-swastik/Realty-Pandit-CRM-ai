-- AlterTable
ALTER TABLE "inventory" ADD COLUMN "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "inventory_slug_key" ON "inventory"("slug");

-- CreateIndex
CREATE INDEX "inventory_slug_idx" ON "inventory"("slug");
