-- AlterTable
ALTER TABLE "inventory" ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "inventory_latitude_longitude_idx" ON "inventory"("latitude", "longitude");
