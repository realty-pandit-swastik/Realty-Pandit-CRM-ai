-- Delivery-status persistence for whatsapp_messages.
--
-- The table has existed since the init migration (20260206170857_init_ssot_v3) but NOTHING
-- has ever written to it — contact._count.whatsapp_msgs was 0 for every contact in prod,
-- including ones with active conversations. Meanwhile delivery-status callbacks were only
-- logged, so a ~40% outbound failure rate could not be attributed to a sender.
--
-- Additive and nullable only: safe to apply on a live table, and safe to leave in place if
-- the application code is rolled back.
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "sent_by"       TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "template_name" TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "error_code"    INTEGER;
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "error_title"   TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "delivered_at"  TIMESTAMP(3);
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "read_at"       TIMESTAMP(3);
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "failed_at"     TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "whatsapp_messages_status_created_at_idx"     ON "whatsapp_messages"("status","created_at");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_error_code_created_at_idx" ON "whatsapp_messages"("error_code","created_at");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_sent_by_created_at_idx"    ON "whatsapp_messages"("sent_by","created_at");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_phone_number_created_at_idx" ON "whatsapp_messages"("phone_number","created_at");
