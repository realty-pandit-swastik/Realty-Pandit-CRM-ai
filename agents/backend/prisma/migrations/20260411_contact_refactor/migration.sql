-- =====================================================
-- CONTACT SYSTEM REFACTOR MIGRATION
-- 2026-04-11
-- =====================================================

-- STEP 1: Add new enum values to ContactType
-- PostgreSQL requires separate ALTER statements
ALTER TYPE "ContactType" ADD VALUE IF NOT EXISTS 'BUYER';
ALTER TYPE "ContactType" ADD VALUE IF NOT EXISTS 'TENANT';
ALTER TYPE "ContactType" ADD VALUE IF NOT EXISTS 'LANDLORD';

-- Must commit here for enum values to be visible in same session
COMMIT;
BEGIN;

-- STEP 2: Migrate BUYER_TENANT → BUYER or TENANT based on intent
UPDATE contacts
SET contact_type = CASE
  WHEN contact_type = 'BUYER_TENANT' AND intent = 'rent' THEN 'TENANT'::"ContactType"
  WHEN contact_type = 'BUYER_TENANT' THEN 'BUYER'::"ContactType"
  ELSE contact_type
END
WHERE contact_type = 'BUYER_TENANT';

-- STEP 3: Migrate SELLER_LANDLORD → LANDLORD
UPDATE contacts
SET contact_type = 'LANDLORD'::"ContactType"
WHERE contact_type = 'SELLER_LANDLORD';

-- STEP 4: Add created_by column to contacts
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS created_by TEXT;

ALTER TABLE contacts
ADD CONSTRAINT fk_contacts_created_by
FOREIGN KEY (created_by) REFERENCES agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_created_by ON contacts(created_by);

-- STEP 5: Create leads table
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  intent TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  budget_min DECIMAL,
  budget_max DECIMAL,
  demand_bhk INTEGER,
  demand_main_category TEXT,
  demand_type_slug TEXT,
  demand_budget_type TEXT,
  demand_amenities JSONB,
  area_min FLOAT,
  area_max FLOAT,
  area_unit TEXT,
  category_id TEXT,
  sub_category_id TEXT,
  type_id TEXT,
  preferred_location TEXT,
  preferred_lat FLOAT,
  preferred_lng FLOAT,
  lead_status TEXT NOT NULL DEFAULT 'cold',
  lifecycle_stage TEXT NOT NULL DEFAULT 'NEW',
  assigned_agent_id TEXT,
  created_by TEXT,
  lead_type TEXT,
  referral_partner_id TEXT,
  referral_partner_name TEXT,
  referral_partner_phone TEXT,
  verification_status TEXT,
  verification_reason TEXT,
  verification_remarks TEXT,
  verified_by TEXT,
  verified_at TIMESTAMP,
  notes TEXT,
  timeline TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (contact_phone) REFERENCES contacts(phone_number),
  FOREIGN KEY (assigned_agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_contact_phone ON leads(contact_phone);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_status ON leads(tenant_id, lead_status);
CREATE INDEX IF NOT EXISTS idx_leads_lifecycle ON leads(lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_by ON leads(created_by);
CREATE INDEX IF NOT EXISTS idx_leads_intent ON leads(intent, lead_status);

-- STEP 6: Seed Lead table from existing Contact demand fields
-- Create one Lead record per Contact that has demand data
INSERT INTO leads (
  id, tenant_id, contact_phone, intent, source,
  budget_min, budget_max, demand_bhk, demand_main_category,
  demand_type_slug, demand_budget_type, demand_amenities,
  area_min, area_max, area_unit,
  category_id, sub_category_id, type_id,
  preferred_location, preferred_lat, preferred_lng,
  lead_status, lifecycle_stage, assigned_agent_id,
  created_by, notes, created_at, updated_at
)
SELECT
  gen_random_uuid()::text,
  tenant_id,
  phone_number,
  intent,
  COALESCE(source, 'manual'),
  budget_min, budget_max, demand_bhk, demand_main_category,
  demand_type_slug, demand_budget_type, demand_amenities,
  area_min, area_max, area_unit,
  category_id, sub_category_id, type_id,
  preferred_location, preferred_lat, preferred_lng,
  COALESCE(lead_status, 'cold'),
  COALESCE(lifecycle_stage, 'NEW'),
  assigned_agent_id,
  NULL,
  notes,
  created_at,
  updated_at
FROM contacts
WHERE contact_type IN ('BUYER', 'TENANT')
  AND (intent IS NOT NULL OR budget_min IS NOT NULL OR preferred_location IS NOT NULL);
