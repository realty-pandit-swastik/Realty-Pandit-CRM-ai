ALTER TABLE "tenants" ADD COLUMN "shortage_match_threshold" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_shortage_threshold_positive" CHECK ("shortage_match_threshold" BETWEEN 1 AND 100);
CREATE TABLE "shortage_refreshes" (
    "tenant_id" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_until" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    CONSTRAINT "shortage_refreshes_pkey" PRIMARY KEY ("tenant_id")
);
CREATE INDEX "shortage_refreshes_next_attempt_at_idx" ON "shortage_refreshes"("next_attempt_at");
