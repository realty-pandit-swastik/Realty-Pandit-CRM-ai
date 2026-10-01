-- Per-enquiry leads: remember which property/listing a deal was created for.
-- Additive + nullable; no backfill, no lock-heavy rewrite.
ALTER TABLE "transactions" ADD COLUMN "source_ref" TEXT;
CREATE INDEX "transactions_demand_contact_id_source_source_ref_idx" ON "transactions"("demand_contact_id", "source", "source_ref");
