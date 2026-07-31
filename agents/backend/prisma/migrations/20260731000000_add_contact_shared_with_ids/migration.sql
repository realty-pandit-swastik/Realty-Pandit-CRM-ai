-- Lead sharing (2026-07-31): share a lead with additional team members (mirrors inventory.shared_with_ids)
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "shared_with_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX IF NOT EXISTS "contacts_shared_with_ids_idx" ON "contacts" USING GIN ("shared_with_ids");
