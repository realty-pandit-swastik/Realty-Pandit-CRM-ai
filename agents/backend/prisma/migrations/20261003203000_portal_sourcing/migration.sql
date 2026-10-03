CREATE TABLE "portal_listings" (
 "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "source" TEXT NOT NULL, "external_id" TEXT NOT NULL,
 "source_url" TEXT, "payload" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'CANDIDATE',
 "inventory_id" TEXT, "verification_task_id" TEXT, "owner_call_verified_at" TIMESTAMP(3),
 "owner_call_verified_by" TEXT, "owner_call_notes" TEXT,
 "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "portal_listings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "portal_listings_tenant_id_source_external_id_key" ON "portal_listings"("tenant_id", "source", "external_id");
CREATE UNIQUE INDEX "portal_listings_inventory_id_key" ON "portal_listings"("inventory_id");
CREATE INDEX "portal_listings_tenant_id_status_last_seen_at_idx" ON "portal_listings"("tenant_id", "status", "last_seen_at");
CREATE TABLE "portal_crawl_runs" (
 "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "source" TEXT NOT NULL, "area" TEXT NOT NULL, "target_url" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'RUNNING', "ingested_count" INTEGER NOT NULL DEFAULT 0,
 "duplicate_count" INTEGER NOT NULL DEFAULT 0, "candidate_count" INTEGER NOT NULL DEFAULT 0,
 "failure" TEXT, "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finished_at" TIMESTAMP(3),
 CONSTRAINT "portal_crawl_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "portal_crawl_runs_tenant_id_source_started_at_idx" ON "portal_crawl_runs"("tenant_id", "source", "started_at");
