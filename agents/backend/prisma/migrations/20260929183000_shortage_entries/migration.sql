CREATE TABLE "shortage_entries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "owner_id" TEXT,
    "area" TEXT,
    "demand" JSONB NOT NULL,
    "match_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shortage_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shortage_entries_deal_id_key" ON "shortage_entries"("deal_id");
CREATE INDEX "shortage_entries_tenant_id_status_idx" ON "shortage_entries"("tenant_id", "status");
CREATE INDEX "shortage_entries_owner_id_status_idx" ON "shortage_entries"("owner_id", "status");
