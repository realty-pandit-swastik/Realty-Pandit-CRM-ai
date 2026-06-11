-- Migration: partner ownership (middleman model)
-- Date: 2026-04-17
-- Adds: owning_manager_id on contacts/inventory/transactions, referral_partner_id on inventory,
--       deal_commission_entries table, partner_reassignment_logs table, CommissionPartyType enum.

-- CreateEnum
CREATE TYPE "CommissionPartyType" AS ENUM ('INTERNAL_AGENT', 'PARTNER_AGENT', 'PLATFORM');

-- AlterTable: contacts
ALTER TABLE "contacts" ADD COLUMN "owning_manager_id" TEXT;
CREATE INDEX "contacts_owning_manager_id_idx" ON "contacts"("owning_manager_id");
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owning_manager_id_fkey"
    FOREIGN KEY ("owning_manager_id") REFERENCES "agents"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: inventory
ALTER TABLE "inventory" ADD COLUMN "referral_partner_id" TEXT;
ALTER TABLE "inventory" ADD COLUMN "owning_manager_id" TEXT;
CREATE INDEX "inventory_referral_partner_id_idx" ON "inventory"("referral_partner_id");
CREATE INDEX "inventory_owning_manager_id_idx" ON "inventory"("owning_manager_id");
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_referral_partner_id_fkey"
    FOREIGN KEY ("referral_partner_id") REFERENCES "partner_agents"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_owning_manager_id_fkey"
    FOREIGN KEY ("owning_manager_id") REFERENCES "agents"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: transactions
ALTER TABLE "transactions" ADD COLUMN "owning_manager_id" TEXT;
CREATE INDEX "transactions_owning_manager_id_idx" ON "transactions"("owning_manager_id");
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_owning_manager_id_fkey"
    FOREIGN KEY ("owning_manager_id") REFERENCES "agents"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: deal_commission_entries
CREATE TABLE "deal_commission_entries" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "party_type" "CommissionPartyType" NOT NULL,
    "agent_id" TEXT,
    "partner_agent_id" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "notes" TEXT,
    "entered_by_agent_id" TEXT NOT NULL,
    "entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deal_commission_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "deal_commission_entries_transaction_id_idx" ON "deal_commission_entries"("transaction_id");
CREATE INDEX "deal_commission_entries_agent_id_idx" ON "deal_commission_entries"("agent_id");
CREATE INDEX "deal_commission_entries_partner_agent_id_idx" ON "deal_commission_entries"("partner_agent_id");
ALTER TABLE "deal_commission_entries" ADD CONSTRAINT "deal_commission_entries_transaction_id_fkey"
    FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_commission_entries" ADD CONSTRAINT "deal_commission_entries_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "agents"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deal_commission_entries" ADD CONSTRAINT "deal_commission_entries_partner_agent_id_fkey"
    FOREIGN KEY ("partner_agent_id") REFERENCES "partner_agents"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deal_commission_entries" ADD CONSTRAINT "deal_commission_entries_entered_by_agent_id_fkey"
    FOREIGN KEY ("entered_by_agent_id") REFERENCES "agents"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: partner_reassignment_logs
CREATE TABLE "partner_reassignment_logs" (
    "id" TEXT NOT NULL,
    "partner_agent_id" TEXT NOT NULL,
    "from_agent_id" TEXT,
    "to_agent_id" TEXT NOT NULL,
    "performed_by_agent_id" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "partner_reassignment_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "partner_reassignment_logs_partner_agent_id_idx" ON "partner_reassignment_logs"("partner_agent_id");
CREATE INDEX "partner_reassignment_logs_to_agent_id_idx" ON "partner_reassignment_logs"("to_agent_id");
ALTER TABLE "partner_reassignment_logs" ADD CONSTRAINT "partner_reassignment_logs_partner_agent_id_fkey"
    FOREIGN KEY ("partner_agent_id") REFERENCES "partner_agents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "partner_reassignment_logs" ADD CONSTRAINT "partner_reassignment_logs_from_agent_id_fkey"
    FOREIGN KEY ("from_agent_id") REFERENCES "agents"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "partner_reassignment_logs" ADD CONSTRAINT "partner_reassignment_logs_to_agent_id_fkey"
    FOREIGN KEY ("to_agent_id") REFERENCES "agents"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "partner_reassignment_logs" ADD CONSTRAINT "partner_reassignment_logs_performed_by_agent_id_fkey"
    FOREIGN KEY ("performed_by_agent_id") REFERENCES "agents"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
