-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "next_action_type" TEXT;

-- CreateTable
CREATE TABLE "inventory" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "owner_phone" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "specs" JSONB,
    "features" JSONB,
    "location" TEXT,
    "price" DECIMAL(65,30),
    "price_unit" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "intent" TEXT NOT NULL,
    "media_urls" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_scores" (
    "phone_number" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "intent_score" INTEGER NOT NULL DEFAULT 0,
    "engagement_score" INTEGER NOT NULL DEFAULT 0,
    "reliability_score" INTEGER NOT NULL DEFAULT 0,
    "urgency_score" INTEGER NOT NULL DEFAULT 0,
    "total_score" INTEGER NOT NULL DEFAULT 0,
    "no_show_count" INTEGER NOT NULL DEFAULT 0,
    "last_no_show_at" TIMESTAMP(3),
    "last_updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_scores_pkey" PRIMARY KEY ("phone_number")
);

-- CreateIndex
CREATE INDEX "inventory_location_idx" ON "inventory"("location");

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_owner_phone_fkey" FOREIGN KEY ("owner_phone") REFERENCES "contacts"("phone_number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_scores" ADD CONSTRAINT "lead_scores_phone_number_fkey" FOREIGN KEY ("phone_number") REFERENCES "contacts"("phone_number") ON DELETE RESTRICT ON UPDATE CASCADE;
