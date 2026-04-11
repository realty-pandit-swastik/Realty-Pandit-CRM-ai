/*
  Warnings:

  - Added the required column `updated_at` to the `agents` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "last_login_at" TIMESTAMP(3),
ADD COLUMN     "password_hash" TEXT,
ADD COLUMN     "refresh_token" TEXT,
ADD COLUMN     "reports_to_id" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "role" SET DEFAULT 'employee';

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "contact_type" TEXT NOT NULL DEFAULT 'UNKNOWN';

-- CreateTable
CREATE TABLE "partner_agents" (
    "phone_number" TEXT NOT NULL,
    "agency_name" TEXT,
    "partner_type" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "commission_rate" DECIMAL(65,30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_agents_pkey" PRIMARY KEY ("phone_number")
);

-- CreateIndex
CREATE INDEX "contacts_contact_type_idx" ON "contacts"("contact_type");

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_reports_to_id_fkey" FOREIGN KEY ("reports_to_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_agents" ADD CONSTRAINT "partner_agents_phone_number_fkey" FOREIGN KEY ("phone_number") REFERENCES "contacts"("phone_number") ON DELETE RESTRICT ON UPDATE CASCADE;
