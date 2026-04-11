-- CreateTable: notification_preferences
-- Stores per-agent and per-partner notification preferences
-- Owner is polymorphic: owner_type = 'agent' | 'partner', owner_id = Agent.id | PartnerAgent.id

CREATE TABLE IF NOT EXISTS "notification_preferences" (
    "id" TEXT NOT NULL,
    "owner_type" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "event_preferences" JSONB NOT NULL DEFAULT '{}',
    "quiet_hours_enabled" BOOLEAN NOT NULL DEFAULT true,
    "quiet_hours_start" TEXT NOT NULL DEFAULT '21:00',
    "quiet_hours_end" TEXT NOT NULL DEFAULT '08:00',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "notification_preferences_owner_type_owner_id_key"
    ON "notification_preferences"("owner_type", "owner_id");
