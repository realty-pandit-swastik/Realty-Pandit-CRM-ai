-- Additive; browser sessions and existing tables retain their contracts.
CREATE TABLE "mobile_sessions" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "device_name" TEXT NOT NULL,
    "refresh_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refreshed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    CONSTRAINT "mobile_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mobile_sessions_agent_id_fkey" FOREIGN KEY ("agent_id")
      REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "mobile_sessions_agent_id_revoked_at_idx" ON "mobile_sessions"("agent_id", "revoked_at");
CREATE INDEX "mobile_sessions_expires_at_idx" ON "mobile_sessions"("expires_at");
