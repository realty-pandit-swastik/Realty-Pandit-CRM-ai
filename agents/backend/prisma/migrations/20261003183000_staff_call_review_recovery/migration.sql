-- Additive only. Review against live migration history before applying in production.
ALTER TABLE "staff_calls"
 ADD COLUMN "processing_attempts" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "processing_claim_token" TEXT,
 ADD COLUMN "processing_claimed_at" TIMESTAMP(3),
 ADD COLUMN "processing_error" TEXT,
 ADD COLUMN "followup_status" TEXT,
 ADD COLUMN "followup_claim_token" TEXT,
 ADD COLUMN "followup_claimed_at" TIMESTAMP(3),
 ADD COLUMN "followup_attempts" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "followup_error" TEXT,
 ADD COLUMN "followup_result" JSONB,
 ADD COLUMN "auto_share" BOOLEAN NOT NULL DEFAULT false;
-- Older extractions may have changed contacts before approval. Flag for human comparison;
-- never restore prior_values over subsequent staff edits.
UPDATE "staff_calls" SET "staff_edited_data" = COALESCE("staff_edited_data", '{}'::jsonb)
 || '{"historical_auto_save_review_required":true}'::jsonb
WHERE "status" = 'READY_FOR_REVIEW'
 AND COALESCE("staff_edited_data"->'auto_saved_fields', '{}'::jsonb) <> '{}'::jsonb;
