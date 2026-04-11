-- CreateTable
CREATE TABLE "website_leads" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "interest" TEXT,
    "source" TEXT NOT NULL DEFAULT 'popup',
    "page_url" TEXT,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "cookie_consent" BOOLEAN NOT NULL DEFAULT false,
    "consent_timestamp" TIMESTAMP(3),
    "converted_to_contact" BOOLEAN NOT NULL DEFAULT false,
    "contact_phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_subscribers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'website',
    "subscribed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribed_at" TIMESTAMP(3),

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_visits" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "preferred_date" TIMESTAMP(3),
    "preferred_time" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "website_leads_email_idx" ON "website_leads"("email");

-- CreateIndex
CREATE INDEX "website_leads_phone_idx" ON "website_leads"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_email_key" ON "newsletter_subscribers"("email");

-- CreateIndex
CREATE INDEX "scheduled_visits_property_id_idx" ON "scheduled_visits"("property_id");

-- CreateIndex
CREATE INDEX "scheduled_visits_phone_idx" ON "scheduled_visits"("phone");
