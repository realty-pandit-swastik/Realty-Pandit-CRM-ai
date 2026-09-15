-- AlterTable
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "video_urls" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "lead_reference" TEXT;
