CREATE TABLE "calling_work" (
 "id" TEXT NOT NULL PRIMARY KEY, "tenant_id" TEXT NOT NULL, "contact_phone" TEXT NOT NULL,
 "deal_id" TEXT, "task_id" TEXT, "state" TEXT NOT NULL DEFAULT 'READY',
 "claimed_by" TEXT, "lease_until" TIMESTAMP(3), "dispatch_key" TEXT,
 "provider_call_id" TEXT, "transcript" TEXT, "disposition" TEXT,
 "transfer_state" TEXT, "transfer_target" TEXT, "callback_task_id" TEXT, "last_error" TEXT,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "calling_work_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
 CONSTRAINT "calling_work_contact_fkey" FOREIGN KEY ("contact_phone") REFERENCES "contacts"("phone_number") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "calling_work_tenant_id_contact_phone_key" ON "calling_work"("tenant_id", "contact_phone");
CREATE UNIQUE INDEX "calling_work_dispatch_key_key" ON "calling_work"("dispatch_key");
CREATE INDEX "calling_work_tenant_id_state_lease_until_idx" ON "calling_work"("tenant_id", "state", "lease_until");
