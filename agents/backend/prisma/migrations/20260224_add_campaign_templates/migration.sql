-- CreateTable: Campaign Templates
CREATE TABLE "campaign_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "category" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "avg_score" DOUBLE PRECISION,
    "times_used" INTEGER NOT NULL DEFAULT 0,
    "avg_open_rate" DOUBLE PRECISION,
    "avg_reply_rate" DOUBLE PRECISION,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_templates_channel_idx" ON "campaign_templates"("channel");

-- CreateIndex
CREATE INDEX "campaign_templates_category_idx" ON "campaign_templates"("category");

-- AddColumn: Add new fields to campaigns table
ALTER TABLE "campaigns" ADD COLUMN "template_id" TEXT;
ALTER TABLE "campaigns" ADD COLUMN "recurrence_rule" TEXT;
ALTER TABLE "campaigns" ADD COLUMN "ab_test_config" JSONB;

-- CreateIndex
CREATE INDEX "campaigns_template_id_idx" ON "campaigns"("template_id");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "campaign_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
