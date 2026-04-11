-- CreateEnum (with existence check)
DO $$ BEGIN
    CREATE TYPE "InventoryOwnerType" AS ENUM ('INTERNAL', 'EXTERNAL_AGENT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "AgentPackage" AS ENUM ('FREE', 'PRO', 'ADVANCE_PRO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'PENDING_PAYMENT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable: Modify Inventory to support marketplace (with existence check)
DO $$ BEGIN
    ALTER TABLE "inventory" ADD COLUMN "owner_type" "InventoryOwnerType" NOT NULL DEFAULT 'INTERNAL';
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "inventory" ADD COLUMN "agent_owner_id" TEXT;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- AlterTable: Drop existing partner_agents table and recreate with new structure
DROP TABLE IF EXISTS "partner_agents" CASCADE;

-- CreateTable: New PartnerAgent model for marketplace
CREATE TABLE "partner_agents" (
    "id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "company_name" TEXT,
    "city" TEXT,
    "package_type" "AgentPackage" NOT NULL DEFAULT 'FREE',
    "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "listing_limit" INTEGER NOT NULL DEFAULT 10,
    "priority_score" INTEGER NOT NULL DEFAULT 50,
    "subscription_start" TIMESTAMP(3),
    "subscription_end" TIMESTAMP(3),
    "agency_name" TEXT,
    "partner_type" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "commission_rate" DECIMAL(65,30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Commission tracking for FREE agents (with existence check)
CREATE TABLE IF NOT EXISTS "commissions" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "deal_value" DECIMAL(65,30),
    "commission_rate" DECIMAL(65,30) NOT NULL DEFAULT 2.0,
    "commission_amount" DECIMAL(65,30),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add agent fields to ScheduledVisit (with existence check)
DO $$ BEGIN
    ALTER TABLE "scheduled_visits" ADD COLUMN "agent_id" TEXT;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "scheduled_visits" ADD COLUMN "buyer_info_masked" BOOLEAN NOT NULL DEFAULT false;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- CreateIndex (with existence check)
CREATE UNIQUE INDEX IF NOT EXISTS "partner_agents_phone_number_key" ON "partner_agents"("phone_number");

CREATE INDEX IF NOT EXISTS "partner_agents_phone_number_idx" ON "partner_agents"("phone_number");

CREATE INDEX IF NOT EXISTS "partner_agents_package_type_status_idx" ON "partner_agents"("package_type", "status");

CREATE INDEX IF NOT EXISTS "commissions_agent_id_status_idx" ON "commissions"("agent_id", "status");

CREATE INDEX IF NOT EXISTS "inventory_owner_type_agent_owner_id_idx" ON "inventory"("owner_type", "agent_owner_id");

CREATE INDEX IF NOT EXISTS "scheduled_visits_agent_id_idx" ON "scheduled_visits"("agent_id");

-- AddForeignKey (with existence check)
DO $$ BEGIN
    ALTER TABLE "inventory" ADD CONSTRAINT "inventory_agent_owner_id_fkey" FOREIGN KEY ("agent_owner_id") REFERENCES "partner_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "partner_agents" ADD CONSTRAINT "partner_agents_phone_number_fkey" FOREIGN KEY ("phone_number") REFERENCES "contacts"("phone_number") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "commissions" ADD CONSTRAINT "commissions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "partner_agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
