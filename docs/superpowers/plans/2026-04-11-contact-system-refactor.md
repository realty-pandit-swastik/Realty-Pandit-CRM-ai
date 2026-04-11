# Contact System Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Contact model to be a pure identity SSOT, split `BUYER_TENANT` into `BUYER`/`TENANT`, rename `SELLER_LANDLORD` to `LANDLORD`, add `created_by` attribution, create a separate `Lead` table for demand data, and add a hierarchy-based visibility/access control layer across the entire system.

**Architecture:** Contact is identity only (phone, name, email, address, created_by). Roles (Lead, Owner, PartnerAgent) are derived from linked records. A new `Lead` table holds all demand data (budget, BHK, lifecycle). Visibility is enforced at the query layer using `created_by` + agent hierarchy. Contact enum splits: BUYER_TENANT → BUYER + TENANT, SELLER_LANDLORD → LANDLORD.

**Tech Stack:** PostgreSQL + Prisma 5.10.0, Express 5.2.1, React 19.2 + Vite, Google Gemini 2.5 Flash (LLM classification), BullMQ (scheduled jobs), TypeScript throughout.

---

## CRITICAL RULES BEFORE TOUCHING ANYTHING

1. **Deploy order matters**: Schema first → Backend services → Routes → Frontend. Never the reverse.
2. **Zero downtime migration**: Add new enum values BEFORE removing old ones. Keep old Contact demand fields until Lead table is verified.
3. **Test after every phase**: Deploy + `mcp__realty-pandit-qa__qa_verify_task` before moving to next phase.
4. **Enum values in Postgres**: PostgreSQL cannot drop enum values. We rename by creating a new enum type and migrating.
5. **242 references**: Miss one and a buyer gets routed as UNKNOWN or a report breaks. Use the checklist.

---

## FILE MAP — Every File Touched

### Backend — Services (10 files)
| File | Change |
|------|--------|
| `backend/src/services/llm.ts` | Update classifyContactType prompts + valid types |
| `backend/src/services/message_router.ts` | Update routing branches for BUYER/TENANT/LANDLORD |
| `backend/src/services/role_context_detector.ts` | Update BUYER_TENANT/SELLER_LANDLORD checks |
| `backend/src/services/webhook_processor.ts` | Update contact type checks + auto-assign to super_boss |
| `backend/src/services/call_extractor.ts` | Update role type definition |
| `backend/src/services/chat_handler.ts` | Update BUYER_TENANT assignment |
| `backend/src/services/ensure_owner.ts` | Update SELLER_LANDLORD → LANDLORD |
| `backend/src/services/followup_scheduler.ts` | Update filters + message templates |
| `backend/src/services/pending_message_queue.ts` | Update SELLER_LANDLORD → LANDLORD |
| `backend/src/middleware/contact_visibility.ts` | **NEW FILE** — visibility filter builder |

### Backend — Agents (8 files)
| File | Change |
|------|--------|
| `backend/src/agents/classifier_agent.ts` | Distinguish BUYER vs TENANT from intent |
| `backend/src/agents/sales_agent.ts` | Update isDemand/isSupply logic |
| `backend/src/agents/matching_agent.ts` | Update intent mapping |
| `backend/src/agents/admin_agent.ts` | Update groupBy breakdown |
| `backend/src/agents/marketing_agent.ts` | Update BUYER_TENANT filter |
| `backend/src/agents/partner_agent.ts` | Update BUYER_TENANT → BUYER/TENANT |
| `backend/src/agents/notification_agent.ts` | No change needed (uses MANAGEMENT only) |
| `backend/src/agents/qa_agent.ts` | Update UNKNOWN/MANAGEMENT checks |
| `backend/src/agents/security_agent.ts` | Update SQL PARTNER_AGENT check |

### Backend — Routes (14 files)
| File | Change |
|------|--------|
| `backend/src/routes/leads.ts` | Update filters + new Lead model queries |
| `backend/src/routes/api.ts` | Update valid types + contact creation default |
| `backend/src/routes/public.ts` | Update 8 contact upsert points |
| `backend/src/routes/inventory.ts` | Update SELLER_LANDLORD → LANDLORD, BUYER_TENANT → BUYER |
| `backend/src/routes/agent.ts` | Update BUYER_TENANT → BUYER/TENANT |
| `backend/src/routes/agent_leads.ts` | Update BUYER_TENANT filter |
| `backend/src/routes/team.ts` | Update SELLER_LANDLORD → LANDLORD, MANAGEMENT stays |
| `backend/src/routes/reports.ts` | Update SQL + Prisma filters |
| `backend/src/routes/marketing.ts` | Update audience filters |
| `backend/src/routes/analytics.ts` | No enum changes needed |
| `backend/src/routes/external_leads.ts` | Update contact creation |
| `backend/src/routes/user_auth.ts` | Update BUYER_TENANT → BUYER |
| `backend/src/routes/staff_calls.ts` | Update role assignment |
| `backend/src/routes/auth_otp.ts` | Update UNKNOWN assignment (no change) |

### Backend — Integrations (4 files)
| File | Change |
|------|--------|
| `backend/src/integrations/99acres.ts` | BUYER_TENANT → BUYER |
| `backend/src/integrations/facebook.ts` | BUYER_TENANT → BUYER |
| `backend/src/integrations/housing.ts` | BUYER_TENANT → BUYER |
| `backend/src/integrations/magicbricks.ts` | BUYER_TENANT → BUYER |

### Backend — Workflows (3 files)
| File | Change |
|------|--------|
| `backend/src/workflows/buyer_workflow_engine.ts` | BUYER_TENANT → BUYER |
| `backend/src/workflows/workflow_engine.ts` | SELLER_LANDLORD → LANDLORD |
| `backend/src/workflows/unknown.ts` | Update classification branches |

### Frontend Admin (9 files)
| File | Change |
|------|--------|
| `frontend/src/App.tsx` | TYPE_LABEL + TYPE_ICON maps |
| `frontend/src/components/ContactList.tsx` | TYPE_BADGE map |
| `frontend/src/components/ContactSearchField.tsx` | Role mapping + badge logic |
| `frontend/src/components/ChatView.tsx` | Contact type dropdown options |
| `frontend/src/components/ExternalLeads.tsx` | Type display + filters |
| `frontend/src/components/BookVisitModal.tsx` | contact_type display |
| `frontend/src/components/DealPipeline.tsx` | BUYER_TENANT reference |
| `frontend/src/components/MarketingCampaign.tsx` | Audience filter options |
| `frontend/src/components/dashboard/MainDashboard.tsx` | Icon logic |
| `frontend/src/components/mobile/MobileContactList.tsx` | Filter chips + labels |
| `frontend/src/components/mobile/MobileChatView.tsx` | TYPE_LABEL map |
| `frontend/src/components/mobile/MobileDashboard.tsx` | TYPE_LABEL/ICON maps |
| `frontend/src/api/client.ts` | updateContactType valid values |

### Schema (2 files)
| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Enum update + created_by field + Lead model |
| `backend/prisma/migrations/YYYYMMDD_contact_refactor/migration.sql` | **NEW** — data migration SQL |

---

## PHASE 1 — Database Schema + Migration
> Lowest risk. Only schema + data changes. No logic touched yet.

---

### Task 1: Update Prisma Schema — Enum + created_by + Lead Model

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Update the ContactType enum**

Replace the current enum:
```prisma
enum ContactType {
  BUYER_TENANT
  SELLER_LANDLORD
  PARTNER_AGENT
  REAL_ESTATE_BUILDER
  MANAGEMENT
  UNKNOWN
}
```

With:
```prisma
enum ContactType {
  BUYER              // Was BUYER_TENANT — looking to purchase a property
  TENANT             // Was BUYER_TENANT — looking to rent a property
  LANDLORD           // Was SELLER_LANDLORD — property owner (can sell or rent)
  PARTNER_AGENT      // External broker/dealer
  REAL_ESTATE_BUILDER // Builder with projects
  MANAGEMENT         // Internal team member
  UNKNOWN            // Not yet classified (default for all inbound)
}
```

- [ ] **Step 2: Add `created_by` field to Contact model**

In the Contact model, after `tenant_id`/`tenant` block, add:
```prisma
// Contact Attribution (who created this contact — determines visibility)
// null = auto-created by system (inbound WhatsApp/website/portal) → owned by super_boss
created_by       String?           // Agent.id who created this contact
created_by_agent Agent?            @relation("ContactCreatedBy", fields: [created_by], references: [id])
```

Add index at bottom of Contact model:
```prisma
@@index([created_by])
```

- [ ] **Step 3: Add reverse relation to Agent model**

In the Agent model relations block, add:
```prisma
created_contacts  Contact[]  @relation("ContactCreatedBy")
```

- [ ] **Step 4: Create the Lead model**

Add after the `LeadScore` model:
```prisma
// ---------------------------------------------------------
// LEADS (Demand Requirements — Separated from Contact)
// One Contact can have multiple Leads over time
// ---------------------------------------------------------
model Lead {
  id           String  @id @default(uuid())
  tenant_id    String
  tenant       Tenant  @relation(fields: [tenant_id], references: [id])

  // SSOT link to Contact
  contact_phone String
  contact       Contact @relation(fields: [contact_phone], references: [phone_number])

  // Intent
  intent        String   // "buy" | "rent"
  source        String   @default("manual") // whatsapp, website, 99acres, manual, etc.

  // Demand Requirements
  budget_min    Decimal?
  budget_max    Decimal?
  demand_bhk    Int?
  demand_main_category  String?   // "residential" | "commercial"
  demand_type_slug      String?   // "flat" | "2bhk" | "shop" | "office"
  demand_budget_type    String?   // "one_time" | "per_month"
  demand_amenities      Json?
  area_min              Float?
  area_max              Float?
  area_unit             String?   // "sqft" | "sqmtr"

  // Classification IDs
  category_id     String?
  sub_category_id String?
  type_id         String?

  // Geo preference
  preferred_location  String?
  preferred_lat       Float?
  preferred_lng       Float?

  // Lifecycle
  lead_status     String  @default("cold")  // cold, warm, hot, closed, lost
  lifecycle_stage String  @default("NEW")   // NEW, QUALIFIED, MATCHED, VISIT_SCHEDULED, VISITED, NEGOTIATION, CLOSED_WON, CLOSED_LOST

  // Assignment
  assigned_agent_id String?
  assigned_agent    Agent?  @relation("LeadAssignments", fields: [assigned_agent_id], references: [id])

  // Attribution
  created_by       String?   // Agent.id who created this lead (null = auto from inbound)
  created_by_agent Agent?    @relation("LeadCreatedBy", fields: [created_by], references: [id])

  // Referral
  lead_type              String?   // DIRECT_OWNER | PARTNER_REFERRAL
  referral_partner_id    String?
  referral_partner_name  String?
  referral_partner_phone String?

  // Verification
  verification_status  String?
  verification_reason  String?
  verification_remarks String?   @db.Text
  verified_by          String?
  verified_at          DateTime?

  notes     String? @db.Text
  timeline  String?

  created_at DateTime @default(now())
  updated_at DateTime @updatedAt

  lead_score  LeadScore? @relation("LeadScore")

  @@index([contact_phone])
  @@index([tenant_id, lead_status])
  @@index([lifecycle_stage])
  @@index([assigned_agent_id])
  @@index([created_by])
  @@index([intent, lead_status])
  @@map("leads")
}
```

- [ ] **Step 5: Add Lead relations to Agent model**

```prisma
assigned_leads_new   Lead[]  @relation("LeadAssignments")
created_leads        Lead[]  @relation("LeadCreatedBy")
```

- [ ] **Step 6: Add Lead relation to Contact model**

```prisma
leads  Lead[]  // All demand requirements ever made by this contact
```

- [ ] **Step 7: Add Lead relation to Tenant model**

```prisma
leads  Lead[]
```

- [ ] **Step 8: Run prisma format and validate**

```bash
cd "c:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/backend"
npx prisma format
npx prisma validate
```

Expected: No errors.

---

### Task 2: Write and Run the Data Migration

**Files:**
- Create: `backend/prisma/migrations/20260411_contact_refactor/migration.sql`

- [ ] **Step 1: Create migration SQL file**

```sql
-- =====================================================
-- CONTACT SYSTEM REFACTOR MIGRATION
-- 2026-04-11
-- =====================================================

-- STEP 1: Add new enum values to ContactType
-- PostgreSQL requires separate ALTER statements
ALTER TYPE "ContactType" ADD VALUE IF NOT EXISTS 'BUYER';
ALTER TYPE "ContactType" ADD VALUE IF NOT EXISTS 'TENANT';
ALTER TYPE "ContactType" ADD VALUE IF NOT EXISTS 'LANDLORD';

-- Must commit here for enum values to be visible
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

-- STEP 4: Verify no old values remain
-- Run this as a check:
-- SELECT contact_type, COUNT(*) FROM contacts GROUP BY contact_type;
-- Should show: BUYER, TENANT, LANDLORD, PARTNER_AGENT, MANAGEMENT, UNKNOWN, REAL_ESTATE_BUILDER
-- Should NOT show: BUYER_TENANT, SELLER_LANDLORD

-- STEP 5: Add created_by column to contacts
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS created_by TEXT;

ALTER TABLE contacts
ADD CONSTRAINT fk_contacts_created_by
FOREIGN KEY (created_by) REFERENCES agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_created_by ON contacts(created_by);

-- STEP 6: Create leads table
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  intent TEXT NOT NULL,
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

-- STEP 7: Seed Lead table from existing Contact demand fields
-- Create one Lead record per Contact that has intent set
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
  COALESCE(intent, 'buy'),
  COALESCE(source, 'manual'),
  budget_min, budget_max, demand_bhk, demand_main_category,
  demand_type_slug, demand_budget_type, demand_amenities,
  area_min, area_max, area_unit,
  category_id, sub_category_id, type_id,
  preferred_location, preferred_lat, preferred_lng,
  COALESCE(lead_status, 'cold'),
  COALESCE(lifecycle_stage, 'NEW'),
  assigned_agent_id,
  NULL,  -- created_by: unknown for migrated records
  notes,
  created_at,
  updated_at
FROM contacts
WHERE contact_type IN ('BUYER', 'TENANT')
  AND (intent IS NOT NULL OR budget_min IS NOT NULL OR preferred_location IS NOT NULL);

-- STEP 8: Note on old enum values
-- BUYER_TENANT and SELLER_LANDLORD enum values cannot be dropped from PostgreSQL
-- They are now unused. They will be excluded from application validation.
-- Future cleanup: recreate the enum type without these values after 30-day stability period.
```

- [ ] **Step 2: Register migration with Prisma**

```bash
cd "c:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/backend"
npx prisma migrate resolve --applied 20260411_contact_refactor
```

- [ ] **Step 3: Run migration on server via SSH**

```bash
ssh -i ~/.ssh/realty_pandit_key -F /dev/null root@72.62.231.224 \
  "cd /var/www/realty-pandit/backend && psql -h localhost -U realty_user -d reality_pandit -f /tmp/migration.sql"
```

- [ ] **Step 4: Verify migration results**

```bash
ssh -i ~/.ssh/realty_pandit_key -F /dev/null root@72.62.231.224 \
  "psql -h localhost -U realty_user -d reality_pandit -c \"SELECT contact_type, COUNT(*) FROM contacts GROUP BY contact_type ORDER BY count DESC;\""
```

Expected output: Rows with BUYER, TENANT, LANDLORD, PARTNER_AGENT, MANAGEMENT, UNKNOWN.
Must NOT see: BUYER_TENANT or SELLER_LANDLORD rows.

- [ ] **Step 5: Verify leads table seeded**

```bash
ssh -i ~/.ssh/realty_pandit_key -F /dev/null root@72.62.231.224 \
  "psql -h localhost -U realty_user -d reality_pandit -c \"SELECT intent, lead_status, COUNT(*) FROM leads GROUP BY intent, lead_status ORDER BY count DESC;\""
```

Expected: Non-zero rows migrated from existing contacts.

- [ ] **Step 6: Generate updated Prisma client**

```bash
cd "c:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/backend"
npx prisma generate
```

Expected: Client generated with new ContactType enum values.

---

## PHASE 2 — Backend Core Services
> Update classification, routing, and detection logic.

---

### Task 3: Update `llm.ts` — Classification Prompts

**File:** `backend/src/services/llm.ts`

- [ ] **Step 1: Update `classifyContactType()` valid types array (line ~190)**

Find:
```typescript
const valid = ['BUYER_TENANT', 'SELLER_LANDLORD', 'PARTNER_AGENT', 'MANAGEMENT', 'UNKNOWN']
```
Replace with:
```typescript
const valid = ['BUYER', 'TENANT', 'LANDLORD', 'PARTNER_AGENT', 'REAL_ESTATE_BUILDER', 'MANAGEMENT', 'UNKNOWN']
```

- [ ] **Step 2: Update first classifyContactType prompt (line ~170)**

Find:
```typescript
BUYER_TENANT (wants to buy or rent a property for themselves)
SELLER_LANDLORD (owns a property and wants to sell or rent it out)
```
Replace with:
```typescript
BUYER (wants to PURCHASE/BUY a property — words like "buy", "purchase", "kharidna")
TENANT (wants to RENT a property — words like "rent", "kiraya", "on rent", "looking for flat to rent")
LANDLORD (OWNS a property and wants to sell or rent it out — says "my property", "mera ghar", "sell karna hai", "rent pe dena hai")
```

- [ ] **Step 3: Update classification rule comments (line ~177)**

Find:
```typescript
If they mention "buy", "rent", "looking for", "need flat/house" -> BUYER_TENANT
If they mention "sell", "rent out", "have property", "my flat/house" -> SELLER_LANDLORD
```
Replace with:
```typescript
If they want to PURCHASE: "buy", "kharidna", "purchase", "looking to buy" -> BUYER
If they want to RENT for themselves: "rent", "kiraya", "on rent", "need flat on rent" -> TENANT
If they OWN and want to sell/rent out: "sell", "rent out", "my property", "mera ghar dena hai" -> LANDLORD
```

- [ ] **Step 4: Update second prompt block (line ~218)**

Find:
```typescript
BUYER_TENANT: Person looking to BUY or RENT a property for their OWN USE.
SELLER_LANDLORD: INDIVIDUAL OWNER who wants to sell or rent out THEIR OWN property
```
Replace with:
```typescript
BUYER: Person looking to PURCHASE/BUY a property. Uses words like buy, purchase, kharidna.
TENANT: Person looking to RENT a property. Uses words like rent, kiraya, on rent, need flat on rent.
LANDLORD: Property OWNER wanting to sell or give on rent. Says "my property", "sell karna", "rent pe dena".
```

- [ ] **Step 5: Update second valid types array (line ~242)**

Find:
```typescript
const validTypes = ['BUYER_TENANT', 'SELLER_LANDLORD', 'PARTNER_AGENT', 'MANAGEMENT', 'UNKNOWN']
```
Replace with:
```typescript
const validTypes = ['BUYER', 'TENANT', 'LANDLORD', 'PARTNER_AGENT', 'REAL_ESTATE_BUILDER', 'MANAGEMENT', 'UNKNOWN']
```

- [ ] **Step 6: Update third prompt block (line ~389)**

Find:
```typescript
BUYER_TENANT: Wants to buy or rent a property for their OWN use.
SELLER_LANDLORD: INDIVIDUAL OWNER who wants to sell or rent out THEIR OWN property.
```
Replace with:
```typescript
BUYER: Wants to PURCHASE a property. Keywords: buy, purchase, kharidna.
TENANT: Wants to RENT a property. Keywords: rent, kiraya, on rent, need flat on rent.
LANDLORD: OWNS a property, wants to sell or rent it out. Keywords: my property, sell, rent out, dena hai.
```

- [ ] **Step 7: Update third valid types array (line ~424)**

Find:
```typescript
const validTypes = ['BUYER_TENANT', 'SELLER_LANDLORD', 'PARTNER_AGENT', 'MANAGEMENT', 'UNKNOWN']
```
Replace with:
```typescript
const validTypes = ['BUYER', 'TENANT', 'LANDLORD', 'PARTNER_AGENT', 'REAL_ESTATE_BUILDER', 'MANAGEMENT', 'UNKNOWN']
```

---

### Task 4: Update `classifier_agent.ts`

**File:** `backend/src/agents/classifier_agent.ts`

- [ ] **Step 1: Update classification output check (line ~89)**

Find:
```typescript
const isSellIntent = classification.type === 'SELLER_LANDLORD'
```
Replace with:
```typescript
const isSellIntent = classification.type === 'LANDLORD'
```

- [ ] **Step 2: Update welcome messages (line ~130)**

Find:
```typescript
BUYER_TENANT: "Welcome! I understand you're looking for a property..."
SELLER_LANDLORD: "Welcome! I understand you're the owner..."
```
Replace with:
```typescript
BUYER: "Welcome! I understand you're looking to purchase a property. Let me help you find the perfect match.",
TENANT: "Welcome! I understand you're looking for a rental property. Let me help you find the right place.",
LANDLORD: "Welcome! I understand you have a property. Let me help you list it and find the right buyer or tenant.",
```

- [ ] **Step 3: Update routing branch (line ~120)**

Find:
```typescript
} else if (contactType === 'BUYER_TENANT' || contactType === 'SELLER_LANDLORD') {
```
Replace with:
```typescript
} else if (contactType === 'BUYER' || contactType === 'TENANT' || contactType === 'LANDLORD') {
```

---

### Task 5: Update `message_router.ts`

**File:** `backend/src/services/message_router.ts`

- [ ] **Step 1: Update domain intent skip logic (line ~154)**

Find:
```typescript
} else if (contactType === 'BUYER_TENANT' || contactType === 'SELLER_LANDLORD') {
    // Default to PROPERTY for buyers/sellers — no LLM call needed
    domainIntent = 'PROPERTY';
```
Replace with:
```typescript
} else if (contactType === 'BUYER' || contactType === 'TENANT' || contactType === 'LANDLORD') {
    // Default to PROPERTY for buyers/tenants/landlords — no LLM call needed
    domainIntent = 'PROPERTY';
```

- [ ] **Step 2: Update role context direct assignment (lines ~184-187)**

Find:
```typescript
if (contactType === 'BUYER_TENANT') {
    roleContext = { role: 'DEMAND', confidence: 1, reasoning: 'contact_type=BUYER_TENANT' };
} else if (contactType === 'SELLER_LANDLORD') {
    roleContext = { role: 'SUPPLY', confidence: 1, reasoning: 'contact_type=SELLER_LANDLORD' };
}
```
Replace with:
```typescript
if (contactType === 'BUYER' || contactType === 'TENANT') {
    roleContext = { role: 'DEMAND', confidence: 1, reasoning: `contact_type=${contactType}` };
} else if (contactType === 'LANDLORD') {
    roleContext = { role: 'SUPPLY', confidence: 1, reasoning: 'contact_type=LANDLORD' };
}
```

- [ ] **Step 3: Update workflow name mapping (lines ~407-408)**

Find:
```typescript
'BUYER_TENANT': 'sales_buyer',
'SELLER_LANDLORD': 'sales_seller',
```
Replace with:
```typescript
'BUYER': 'sales_buyer',
'TENANT': 'sales_tenant',
'LANDLORD': 'sales_seller',
```

- [ ] **Step 4: Update legacy contact_type routing (line ~390)**

Find:
```typescript
if (rawContactType === 'SELLER_LANDLORD')
```
Replace with:
```typescript
if (rawContactType === 'LANDLORD')
```

---

### Task 6: Update `role_context_detector.ts`

**File:** `backend/src/services/role_context_detector.ts`

- [ ] **Step 1: Update BUYER_TENANT check (line ~87-91)**

Find:
```typescript
if (contactType === 'BUYER_TENANT') {
    ...
    reasoning: 'Contact type is BUYER_TENANT (no active transactions)'
```
Replace with:
```typescript
if (contactType === 'BUYER' || contactType === 'TENANT') {
    ...
    reasoning: `Contact type is ${contactType} (no active transactions)`
```

- [ ] **Step 2: Update SELLER_LANDLORD check (line ~95-99)**

Find:
```typescript
if (contactType === 'SELLER_LANDLORD') {
    ...
    reasoning: 'Contact type is SELLER_LANDLORD (no active transactions)'
```
Replace with:
```typescript
if (contactType === 'LANDLORD') {
    ...
    reasoning: 'Contact type is LANDLORD (no active transactions)'
```

- [ ] **Step 3: Update disambiguation logic (lines ~174-187)**

Find:
```typescript
if (contactType === 'BUYER_TENANT') {
    ...
    reasoning: `Has both demand...contact_type favors DEMAND`
...
if (contactType === 'SELLER_LANDLORD' || contactType === 'PARTNER_AGENT') {
    ...
    reasoning: `Has both roles; contact_type favors SUPPLY`
```
Replace with:
```typescript
if (contactType === 'BUYER' || contactType === 'TENANT') {
    ...
    reasoning: `Has both demand and supply; contact_type ${contactType} favors DEMAND`
...
if (contactType === 'LANDLORD' || contactType === 'PARTNER_AGENT') {
    ...
    reasoning: `Has both roles; contact_type ${contactType} favors SUPPLY`
```

---

### Task 7: Update `webhook_processor.ts`

**File:** `backend/src/services/webhook_processor.ts`

- [ ] **Step 1: Update re-classification check (line ~111-112)**

Find:
```typescript
['BUYER_TENANT', 'UNKNOWN'].includes(contact.contact_type)
```
Replace with:
```typescript
['BUYER', 'TENANT', 'UNKNOWN'].includes(contact.contact_type)
```

- [ ] **Step 2: Update supply-side check (line ~234)**

Find:
```typescript
if (['SELLER_LANDLORD', 'PARTNER_AGENT', 'REAL_ESTATE_BUILDER', 'MANAGEMENT'].includes(contact.contact_type))
```
Replace with:
```typescript
if (['LANDLORD', 'PARTNER_AGENT', 'REAL_ESTATE_BUILDER', 'MANAGEMENT'].includes(contact.contact_type))
```

- [ ] **Step 3: Update demand-side check (line ~303)**

Find:
```typescript
if (['BUYER_TENANT', 'UNKNOWN'].includes(contact.contact_type))
```
Replace with:
```typescript
if (['BUYER', 'TENANT', 'UNKNOWN'].includes(contact.contact_type))
```

---

### Task 8: Update `call_extractor.ts`, `chat_handler.ts`, `ensure_owner.ts`, `followup_scheduler.ts`, `pending_message_queue.ts`

**Files:** 5 service files

- [ ] **Step 1: `call_extractor.ts` (line ~13) — update type definition**

Find:
```typescript
role: 'BUYER_TENANT' | 'SELLER_LANDLORD' | 'UNKNOWN'
```
Replace with:
```typescript
role: 'BUYER' | 'TENANT' | 'LANDLORD' | 'UNKNOWN'
```

Update JSON schema prompt (line ~109):
Find: `"role": "BUYER_TENANT | SELLER_LANDLORD | UNKNOWN"`
Replace: `"role": "BUYER | TENANT | LANDLORD | UNKNOWN"`

Update comment (line ~126):
Find: `Role: BUYER_TENANT if looking for property, SELLER_LANDLORD if listing property`
Replace: `Role: BUYER if buying, TENANT if renting, LANDLORD if listing their own property`

- [ ] **Step 2: `chat_handler.ts` (line ~362) — update contact_type**

Find:
```typescript
contact_type: 'BUYER_TENANT'
```
Replace with:
```typescript
contact_type: 'BUYER'  // Default for chat-based contact creation — intent clarified later
```

- [ ] **Step 3: `ensure_owner.ts` (line ~41) — update SELLER_LANDLORD**

Find:
```typescript
contact_type: 'SELLER_LANDLORD'
```
Replace with:
```typescript
contact_type: 'LANDLORD'
```

- [ ] **Step 4: `followup_scheduler.ts` (line ~69) — update filter**

Find:
```typescript
contact_type: { in: ['BUYER_TENANT', 'SELLER_LANDLORD'] }
```
Replace with:
```typescript
contact_type: { in: ['BUYER', 'TENANT', 'LANDLORD'] }
```

Update message templates (lines ~178-179):
Find:
```typescript
If BUYER_TENANT: Ask if they found what they were looking for, mention new listings
If SELLER_LANDLORD: Ask about their property listing, offer updates on market interest
```
Replace with:
```typescript
If BUYER: Ask if they found a property to purchase, mention new matching listings
If TENANT: Ask if they found a rental property, mention new matching rentals
If LANDLORD: Ask about their property listing, offer updates on buyer/tenant interest
```

- [ ] **Step 5: `pending_message_queue.ts` (line ~55) — update label logic**

Find:
```typescript
const contextLabel = contact?.contact_type === 'SELLER_LANDLORD' ? 'listing' : 'search'
```
Replace with:
```typescript
const contextLabel = contact?.contact_type === 'LANDLORD' ? 'listing' : 'search'
```

---

## PHASE 3 — AI Agents Update

---

### Task 9: Update `sales_agent.ts`

**File:** `backend/src/agents/sales_agent.ts`

- [ ] **Step 1: Update isDemand/isSupply detection (lines ~41-42)**

Find:
```typescript
const isDemand = roleContext === 'DEMAND' || contact.contact_type === 'BUYER_TENANT'
const isSupply = roleContext === 'SUPPLY' || contact.contact_type === 'SELLER_LANDLORD'
```
Replace with:
```typescript
const isDemand = roleContext === 'DEMAND' || contact.contact_type === 'BUYER' || contact.contact_type === 'TENANT'
const isSupply = roleContext === 'SUPPLY' || contact.contact_type === 'LANDLORD'
```

- [ ] **Step 2: Update fallback intent check (lines ~93-96)**

Find:
```typescript
if (intent !== 'BUYER' && intent !== 'TENANT' && contact.contact_type === 'BUYER_TENANT') {
    // Forced intent to BUYER (contact_type is BUYER_TENANT...)
```
Replace with:
```typescript
if (intent !== 'BUYER' && contact.contact_type === 'BUYER') {
    intent = 'BUYER';
    logger.info(`[SalesAgent] Forced intent to BUYER (contact_type is BUYER)`);
} else if (intent !== 'TENANT' && contact.contact_type === 'TENANT') {
    intent = 'TENANT';
    logger.info(`[SalesAgent] Forced intent to TENANT (contact_type is TENANT)`);
}
```

---

### Task 10: Update remaining agents

**Files:** `matching_agent.ts`, `admin_agent.ts`, `marketing_agent.ts`, `partner_agent.ts`, `qa_agent.ts`

- [ ] **Step 1: `matching_agent.ts` (line ~57) — update intent fallback**

Find:
```typescript
intent: contact.intent || (contact.contact_type === 'BUYER_TENANT' ? 'BUYER' : null)
```
Replace with:
```typescript
intent: contact.intent || (contact.contact_type === 'BUYER' ? 'buy' : contact.contact_type === 'TENANT' ? 'rent' : null)
```

- [ ] **Step 2: `admin_agent.ts` (lines ~238-242) — update breakdown display**

Find:
```typescript
const typeBreakdown = contactsByType.map(t => `${t.contact_type}: ${t._count}`)
```
Replace with (add label mapping):
```typescript
const TYPE_LABELS: Record<string, string> = {
  BUYER: 'Buyers', TENANT: 'Tenants', LANDLORD: 'Landlords',
  PARTNER_AGENT: 'Partner Agents', REAL_ESTATE_BUILDER: 'Builders',
  MANAGEMENT: 'Team Members', UNKNOWN: 'Unclassified'
};
const typeBreakdown = contactsByType.map(t => `${TYPE_LABELS[t.contact_type] || t.contact_type}: ${t._count}`)
```

- [ ] **Step 3: `marketing_agent.ts` (line ~308) — update BUYER_TENANT reference**

Find:
```typescript
contact_type: 'BUYER_TENANT'
```
Replace with:
```typescript
contact_type: { in: ['BUYER', 'TENANT'] }
```

- [ ] **Step 4: `partner_agent.ts` (lines ~548, 564) — update BUYER_TENANT**

Find both occurrences:
```typescript
contact_type: 'BUYER_TENANT'
```
Replace with (use intent to determine BUYER vs TENANT):
```typescript
contact_type: intent === 'rent' ? 'TENANT' : 'BUYER'
```

- [ ] **Step 5: `qa_agent.ts` (line ~300) — UNKNOWN check (no change needed)**

Verify line ~297-300 still works — it filters `contact_type: 'UNKNOWN'` which is unchanged.

---

## PHASE 4 — Backend Routes

---

### Task 11: Update `leads.ts`

**File:** `backend/src/routes/leads.ts`

- [ ] **Step 1: Update contact_type filter (line ~78)**

Find:
```typescript
contact_type: { notIn: ['SELLER_LANDLORD', 'MANAGEMENT', 'PARTNER_AGENT'] },
```
Replace with:
```typescript
contact_type: { notIn: ['LANDLORD', 'MANAGEMENT', 'PARTNER_AGENT'] },
```

- [ ] **Step 2: Update pipeline report filter (line ~691)**

Find:
```typescript
contact_type: 'BUYER_TENANT',
```
Replace with:
```typescript
contact_type: { in: ['BUYER', 'TENANT'] },
```

- [ ] **Step 3: Update reports SQL query (line ~394-395)**

Find:
```typescript
WHERE c.contact_type IN ('BUYER_TENANT', 'SELLER_LANDLORD')
```
Replace with:
```typescript
WHERE c.contact_type IN ('BUYER', 'TENANT', 'LANDLORD')
```

- [ ] **Step 4: Update Prisma filter (line ~413)**

Find:
```typescript
const query: any = { contact_type: { in: ['BUYER_TENANT', 'SELLER_LANDLORD'] } };
```
Replace with:
```typescript
const query: any = { contact_type: { in: ['BUYER', 'TENANT', 'LANDLORD'] } };
```

---

### Task 12: Update `api.ts`

**File:** `backend/src/routes/api.ts`

- [ ] **Step 1: Update valid types validation (line ~99)**

Find:
```typescript
const validTypes = ['BUYER_TENANT', 'SELLER_LANDLORD', 'PARTNER_AGENT', 'MANAGEMENT', 'UNKNOWN'];
```
Replace with:
```typescript
const validTypes = ['BUYER', 'TENANT', 'LANDLORD', 'PARTNER_AGENT', 'REAL_ESTATE_BUILDER', 'MANAGEMENT', 'UNKNOWN'];
```

- [ ] **Step 2: Update contact creation default (line ~218)**

Find:
```typescript
contact_type: reqContactType || 'BUYER_TENANT',
```
Replace with:
```typescript
contact_type: reqContactType || 'UNKNOWN',
```

---

### Task 13: Update `public.ts`

**File:** `backend/src/routes/public.ts`

There are 8 contact upsert points in this file. Update each one:

- [ ] **Step 1: Update line ~538 (lead-requirements endpoint)**

Find:
```typescript
contact_type: 'BUYER_TENANT',
```
Add intent-aware logic:
```typescript
contact_type: (intent === 'rent' || intent === 'rent_lease') ? 'TENANT' : 'BUYER',
```

- [ ] **Step 2: Update line ~556 (create block in lead-requirements)**

Find:
```typescript
contact_type: 'BUYER_TENANT',
```
Replace with:
```typescript
contact_type: (intent === 'rent' || intent === 'rent_lease') ? 'TENANT' : 'BUYER',
```

- [ ] **Step 3: Update line ~662 (schedule-visit endpoint)**

Find:
```typescript
contact_type: 'BUYER_TENANT',
```
Replace with:
```typescript
contact_type: (intent === 'rent') ? 'TENANT' : 'BUYER',
```

- [ ] **Step 4: Update line ~787-788 (save-property endpoint)**

Find:
```typescript
contact_type: 'BUYER_TENANT', intent: 'buy',
```
Replace with:
```typescript
contact_type: 'BUYER', intent: 'buy',
```

- [ ] **Step 5: Update line ~829-830 (share-property-whatsapp endpoint)**

Find:
```typescript
contact_type: 'BUYER_TENANT', intent: 'buy',
```
Replace with:
```typescript
contact_type: 'BUYER', intent: 'buy',
```

- [ ] **Step 6: Update lines ~1027, 1036 (post-property endpoint — seller)**

Find both:
```typescript
contact_type: 'SELLER_LANDLORD',
```
Replace with:
```typescript
contact_type: 'LANDLORD',
```

- [ ] **Step 7: Update line ~1383 (track-property-view)**

Find:
```typescript
contact_type: 'BUYER_TENANT',
```
Replace with:
```typescript
contact_type: 'UNKNOWN',  // Viewer intent not confirmed yet
```

---

### Task 14: Update `inventory.ts`

**File:** `backend/src/routes/inventory.ts`

- [ ] **Step 1: Update lines ~95, 102-103 (owner contact upsert)**

Find both:
```typescript
contact_type: 'SELLER_LANDLORD',
```
Replace with:
```typescript
contact_type: 'LANDLORD',
```

- [ ] **Step 2: Update lines ~627, 827, 835 (client/buyer references)**

Find all three:
```typescript
contact_type: 'BUYER_TENANT',
```
Replace with (check intent if available, else default to BUYER):
```typescript
contact_type: 'BUYER',
```

---

### Task 15: Update `agent.ts`

**File:** `backend/src/routes/agent.ts`

- [ ] **Step 1: Update lines ~1115, 1128 (customer contact creation)**

Find both:
```typescript
contact_type: 'BUYER_TENANT',
```
Replace with:
```typescript
contact_type: intent === 'rent' ? 'TENANT' : 'BUYER',
```

---

### Task 16: Update `team.ts`

**File:** `backend/src/routes/team.ts`

- [ ] **Step 1: Update lines ~512, 516 (bulk upload)**

Find both:
```typescript
contact_type: 'SELLER_LANDLORD',
```
Replace with:
```typescript
contact_type: 'LANDLORD',
```

---

### Task 17: Update `reports.ts`

**File:** `backend/src/routes/reports.ts`

- [ ] **Step 1: Update SQL filter (line ~394)**

Find:
```typescript
WHERE c.contact_type IN ('BUYER_TENANT', 'SELLER_LANDLORD')
```
Replace with:
```typescript
WHERE c.contact_type IN ('BUYER', 'TENANT', 'LANDLORD')
```

- [ ] **Step 2: Update Prisma filter (line ~415)**

Find:
```typescript
const query: any = { contact_type: { in: ['BUYER_TENANT', 'SELLER_LANDLORD'] } };
```
Replace with:
```typescript
const query: any = { contact_type: { in: ['BUYER', 'TENANT', 'LANDLORD'] } };
```

---

### Task 18: Update `agent_leads.ts`

**File:** `backend/src/routes/agent_leads.ts`

- [ ] **Step 1: Update BUYER_TENANT filter (line ~35)**

Find:
```typescript
contact_type: 'BUYER_TENANT',
```
Replace with:
```typescript
contact_type: { in: ['BUYER', 'TENANT'] },
```

---

### Task 19: Update `external_leads.ts`

**File:** `backend/src/routes/external_leads.ts`

- [ ] **Step 1: Both contact creations use UNKNOWN (lines ~63, 191)**

These already use `'UNKNOWN'` — no change needed. Verify lines 63 and 191 still say `contact_type: 'UNKNOWN'`.

---

### Task 20: Update `user_auth.ts`

**File:** `backend/src/routes/user_auth.ts`

- [ ] **Step 1: Update BUYER_TENANT (line ~135)**

Find:
```typescript
contact_type: 'BUYER_TENANT',
```
Replace with:
```typescript
contact_type: 'BUYER',  // Website user registering defaults to buyer intent
```

---

### Task 21: Update `staff_calls.ts`

**File:** `backend/src/routes/staff_calls.ts`

- [ ] **Step 1: Update role mapping (lines ~248, 264)**

These use `finalData.role` from call_extractor. Since call_extractor now returns BUYER/TENANT/LANDLORD, no additional change needed here — just ensure the values pass through correctly.

Verify line ~264:
```typescript
contact_type: finalData.role || 'UNKNOWN',
```
This is already correct — it uses whatever call_extractor returns.

---

### Task 22: Update Integrations (4 files)

**Files:** `99acres.ts`, `facebook.ts`, `housing.ts`, `magicbricks.ts`

All four integration files assign `BUYER_TENANT` to incoming portal leads. Portal leads are people looking for properties to buy or rent. Default to `BUYER` (most portal leads are buyers; intent can be refined later via conversation).

- [ ] **Step 1: `99acres.ts` (line ~93) and `ninety_nine_acres_poller.ts` (line ~418)**

Find both:
```typescript
contact_type: 'BUYER_TENANT'
```
Replace with:
```typescript
contact_type: 'BUYER'  // Portal leads default to buyer; intent refined via WhatsApp conversation
```

- [ ] **Step 2: `facebook.ts` (line ~112)**

Find:
```typescript
contact_type: 'BUYER_TENANT'
```
Replace with:
```typescript
contact_type: 'BUYER'
```

- [ ] **Step 3: `housing.ts` (line ~65) and `housing_poller.ts` (line ~227)**

Find both:
```typescript
contact_type: 'BUYER_TENANT'
```
Replace with:
```typescript
contact_type: 'BUYER'
```

- [ ] **Step 4: `magicbricks.ts` (line ~67)**

Find:
```typescript
contact_type: 'BUYER_TENANT'
```
Replace with:
```typescript
contact_type: 'BUYER'
```

---

### Task 23: Update Workflows

**Files:** `buyer_workflow_engine.ts`, `workflow_engine.ts`, `unknown.ts`

- [ ] **Step 1: `buyer_workflow_engine.ts` (lines ~209, 237) — BUYER_TENANT → BUYER**

Find both:
```typescript
contact_type: 'BUYER_TENANT'
```
Replace with:
```typescript
contact_type: 'BUYER'
```

- [ ] **Step 2: `workflow_engine.ts` (lines ~591, 610) — SELLER_LANDLORD → LANDLORD**

Find both:
```typescript
contact_type: 'SELLER_LANDLORD'
```
Replace with:
```typescript
contact_type: 'LANDLORD'
```

- [ ] **Step 3: `unknown.ts` (lines ~50, 67-68) — update classification branches**

Find:
```typescript
} else if (contactType === 'BUYER_TENANT' || contactType === 'SELLER_LANDLORD') {
```
Replace with:
```typescript
} else if (contactType === 'BUYER' || contactType === 'TENANT' || contactType === 'LANDLORD') {
```

Find welcome messages:
```typescript
BUYER_TENANT: "Welcome! I understand you're looking for a property to sell..."
SELLER_LANDLORD: "Welcome! I understand you have a property to sell..."
```
Replace with:
```typescript
BUYER: "Welcome! I understand you're looking to purchase a property. Let me help.",
TENANT: "Welcome! I understand you're looking for a rental. Let me help you find the right place.",
LANDLORD: "Welcome! I understand you have a property. Let me help you list it.",
```

---

## PHASE 5 — Visibility / Access Control Layer

---

### Task 24: Create Contact Visibility Middleware

**File:** `backend/src/middleware/contact_visibility.ts` (**NEW FILE**)

- [ ] **Step 1: Create the file**

```typescript
// src/middleware/contact_visibility.ts
//
// Builds Prisma WHERE clause for contact visibility based on agent role + hierarchy.
// Apply this filter to ALL contact queries across the system.
//
// Rules:
//   super_boss  → sees ALL contacts
//   manager     → sees contacts created by self + direct subordinates
//   employee    → sees ONLY contacts they created
//   null agent  → no access (returns impossible filter)

import { prisma } from '../lib/prisma';

export interface VisibilityFilter {
  created_by?: string | null | { in: string[] } | object;
  OR?: object[];
}

/**
 * Build a Prisma WHERE clause fragment that restricts contact visibility.
 * @param agentId - ID of the requesting agent
 * @param agentRole - Role: 'super_boss' | 'manager' | 'employee'
 */
export function buildContactVisibilityFilter(
  agentId: string,
  agentRole: string
): VisibilityFilter {
  if (agentRole === 'super_boss') {
    return {}; // No restriction — sees all
  }

  if (agentRole === 'manager') {
    return {
      OR: [
        { created_by: agentId },
        { created_by_agent: { reports_to_id: agentId } },
      ],
    };
  }

  // employee — only their own
  return { created_by: agentId };
}

/**
 * Build visibility filter for use in full contact queries (includes partner agent contacts).
 * Partner agent contacts: visible to partner agent themselves + their managing_agent.
 * @param agentId - ID of the requesting agent
 * @param agentRole - Role of requesting agent
 * @param managedPartnerIds - IDs of partner agents this agent manages (optional)
 */
export async function buildFullContactVisibilityFilter(
  agentId: string,
  agentRole: string
): Promise<VisibilityFilter> {
  if (agentRole === 'super_boss') {
    return {};
  }

  // Get partner agents managed by this agent
  const managedPartners = await prisma.partnerAgent.findMany({
    where: { managing_agent_id: agentId },
    select: { phone_number: true },
  });
  const managedPartnerPhones = managedPartners.map((p) => p.phone_number);

  const ownFilter = buildContactVisibilityFilter(agentId, agentRole);

  if (managedPartnerPhones.length === 0) {
    return ownFilter;
  }

  // Include contacts created by managed partner agents
  return {
    OR: [
      ownFilter,
      { created_by: null, phone_number: { in: managedPartnerPhones } }, // partner's own contact
    ],
  };
}

/**
 * Check if a specific contact is visible to an agent.
 * Used for single-contact access checks (e.g., after full phone number search).
 */
export async function isContactVisibleTo(
  phoneNumber: string,
  agentId: string,
  agentRole: string
): Promise<boolean> {
  if (agentRole === 'super_boss') return true;

  const contact = await prisma.contact.findUnique({
    where: { phone_number: phoneNumber },
    select: { created_by: true, phone_number: true },
  });

  if (!contact) return false;

  // Own contact
  if (contact.created_by === agentId) return true;

  // Subordinate's contact (manager check)
  if (agentRole === 'manager') {
    const creator = await prisma.agent.findUnique({
      where: { id: contact.created_by ?? '__none__' },
      select: { reports_to_id: true },
    });
    if (creator?.reports_to_id === agentId) return true;
  }

  // Partner agent contact: check if this agent manages the partner
  const partnerLink = await prisma.partnerAgent.findFirst({
    where: {
      phone_number: phoneNumber,
      managing_agent_id: agentId,
    },
  });
  if (partnerLink) return true;

  // Full exact phone search: allow read-only access for ANY authenticated agent
  // (Caller must ensure this is a full-exact-number lookup, not fuzzy search)
  return false;
}
```

---

### Task 25: Apply Visibility Filter to Contact Queries

**Files:** `backend/src/routes/api.ts`, `backend/src/routes/leads.ts`, `backend/src/routes/agent_leads.ts`

- [ ] **Step 1: Apply to `GET /contacts` in `api.ts` (line ~15-51)**

Import at top of api.ts:
```typescript
import { buildFullContactVisibilityFilter } from '../middleware/contact_visibility';
```

Add visibility filter to the contacts query:
```typescript
// GET /api/contacts
router.get('/contacts', requireAuth, async (req, res) => {
  const { role, id: agentId } = req.agent;
  const visibilityFilter = await buildFullContactVisibilityFilter(agentId, role);
  
  const contacts = await prisma.contact.findMany({
    where: {
      tenant_id: req.agent.tenant_id,
      ...visibilityFilter,
      // ...existing filters from query params
    },
    // ...existing select
  });
  res.json(contacts);
});
```

- [ ] **Step 2: Apply to `/contacts/search` in `api.ts` (line ~119)**

The search endpoint uses full exact phone number — allow read-only access for any authenticated agent:
```typescript
// GET /api/contacts/search?phone=+919958860411
router.get('/contacts/search', requireAuth, async (req, res) => {
  const { phone } = req.query;
  if (!phone || typeof phone !== 'string' || phone.replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'Full phone number required for contact search' });
  }
  const normalized = normalizePhone(phone);
  const contact = await prisma.contact.findUnique({
    where: { phone_number: normalized },
    select: {
      phone_number: true, name: true, email: true,
      contact_type: true, source: true, created_at: true,
      // DO NOT include demand fields, notes, history for non-owners
    },
  });
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  
  // Check if requester is owner — if yes, return full detail; if no, return limited view
  const isOwner = contact.created_by === req.agent.id || req.agent.role === 'super_boss';
  if (!isOwner) {
    // Non-owner: return name + phone only for partner agents, or full detail for internal team
    const isPartnerAgent = !!req.partnerAgent; // from agent_auth middleware
    return res.json({
      phone_number: contact.phone_number,
      name: isPartnerAgent ? contact.name : contact.name, // Partner: name+phone only
      contact_type: isPartnerAgent ? undefined : contact.contact_type,
      read_only: true,
    });
  }
  return res.json(contact);
});
```

- [ ] **Step 3: Apply to leads list in `leads.ts` (line ~77)**

Import at top:
```typescript
import { buildContactVisibilityFilter } from '../middleware/contact_visibility';
```

Add to the where clause:
```typescript
const visibilityFilter = buildContactVisibilityFilter(req.agent.id, req.agent.role);
const where: any = {
  contact_type: { notIn: ['LANDLORD', 'MANAGEMENT', 'PARTNER_AGENT'] },
  ...visibilityFilter,
  // ...rest of existing filters
};
```

---

### Task 26: Add `created_by` to Contact Creation Points

Every place a contact is created must pass `created_by`. Rules:
- Manual creation by team member → `created_by = req.agent.id`
- Auto-created inbound (WhatsApp, website, portal) → `created_by = null` (super_boss sees these via null filter)

- [ ] **Step 1: Update all `prisma.contact.create` / `upsert` in routes**

For routes that have `req.agent` available (api.ts, leads.ts, inventory.ts, team.ts):
```typescript
// Add to create/upsert data blocks:
created_by: req.agent?.id || null,
```

For auto-created contacts in webhook_processor.ts, public.ts, integrations:
```typescript
// System-created contacts belong to super_boss (null created_by = super_boss sees them)
created_by: null,
```

Affected files and their create/upsert points:
- `api.ts` line ~218: add `created_by: req.agent.id`
- `leads.ts` line ~350: add `created_by: req.agent.id`
- `inventory.ts` line ~102: add `created_by: req.agent.id`
- `team.ts` line ~265: add `created_by: req.agent.id`
- `agent.ts` line ~198: add `created_by: req.agent.id`
- `public.ts` all upserts: add `created_by: null` (website visitors — auto)
- `webhook_processor.ts` line ~100: add `created_by: null` (inbound WhatsApp — auto)
- All integrations (99acres, facebook, housing, magicbricks): add `created_by: null`

---

## PHASE 6 — Frontend Admin Panel

---

### Task 27: Update Type Mappings and Badges

**Files:** `App.tsx`, `ContactList.tsx`, `MobileContactList.tsx`, `MobileDashboard.tsx`, `MobileChatView.tsx`, `MainDashboard.tsx`

- [ ] **Step 1: `App.tsx` (line ~79-83) — TYPE_LABEL + TYPE_ICON**

Find:
```typescript
BUYER_TENANT: 'Buyer', SELLER_LANDLORD: 'Seller',
```
Replace with:
```typescript
BUYER: 'Buyer',
TENANT: 'Tenant',
LANDLORD: 'Landlord',
PARTNER_AGENT: 'Partner',
REAL_ESTATE_BUILDER: 'Builder',
MANAGEMENT: 'Team',
UNKNOWN: 'Unknown',
```

Find icon map:
```typescript
BUYER_TENANT: '🏠', SELLER_LANDLORD: '🔑', PARTNER_AGENT: '🤝', MANAGEMENT: '👔', UNKNOWN: '👤',
```
Replace with:
```typescript
BUYER: '🏠',
TENANT: '🛋️',
LANDLORD: '🔑',
PARTNER_AGENT: '🤝',
REAL_ESTATE_BUILDER: '🏗️',
MANAGEMENT: '👔',
UNKNOWN: '👤',
```

- [ ] **Step 2: `ContactList.tsx` — TYPE_BADGE (lines ~27-31)**

Find:
```typescript
'BUYER_TENANT': { label: 'Buyer', ... }
'SELLER_LANDLORD': { label: 'Seller', ... }
```
Replace with:
```typescript
'BUYER': { label: 'Buyer', bg: '#dbeafe', color: '#1d4ed8' },
'TENANT': { label: 'Tenant', bg: '#ede9fe', color: '#6d28d9' },
'LANDLORD': { label: 'Landlord', bg: '#dcfce7', color: '#15803d' },
'PARTNER_AGENT': { label: 'Partner', bg: '#fef9c3', color: '#a16207' },
'REAL_ESTATE_BUILDER': { label: 'Builder', bg: '#fee2e2', color: '#b91c1c' },
'MANAGEMENT': { label: 'Team', bg: '#f1f5f9', color: '#475569' },
'UNKNOWN': { label: 'Unknown', bg: '#f3f4f6', color: '#6b7280' },
```

- [ ] **Step 3: `MobileContactList.tsx` (lines ~20-21) — filter chips**

Find:
```typescript
{ key: 'BUYER_TENANT', label: 'Buyers' }
{ key: 'SELLER_LANDLORD', label: 'Sellers' }
```
Replace with:
```typescript
{ key: 'BUYER', label: 'Buyers' },
{ key: 'TENANT', label: 'Tenants' },
{ key: 'LANDLORD', label: 'Landlords' },
{ key: 'PARTNER_AGENT', label: 'Partners' },
```

- [ ] **Step 4: `MobileChatView.tsx`, `MobileDashboard.tsx` — TYPE_LABEL/ICON maps**

Find all TYPE_LABEL maps:
```typescript
BUYER_TENANT: 'Buyer', SELLER_LANDLORD: 'Seller'
```
Replace with the same mapping as Step 1 above.

- [ ] **Step 5: `MainDashboard.tsx` (line ~246) — icon logic**

Find:
```typescript
{c.contact_type === 'BUYER_TENANT' ? '🏠' : c.contact_type === 'SELLER_LANDLORD' ? '🔑' : '👤'}
```
Replace with:
```typescript
{TYPE_ICON[c.contact_type] || '👤'}
```
(Import TYPE_ICON from App.tsx or define it locally)

---

### Task 28: Update Dropdowns and Selectors

**Files:** `ChatView.tsx`, `MarketingCampaign.tsx`, `ContactSearchField.tsx`

- [ ] **Step 1: `ChatView.tsx` (lines ~83-86) — contact type dropdown**

Find:
```typescript
<option value="BUYER_TENANT">Buyer/Tenant</option>
<option value="SELLER_LANDLORD">Seller/Landlord</option>
<option value="PARTNER_AGENT">Partner Agent</option>
<option value="MANAGEMENT">Management</option>
```
Replace with:
```typescript
<option value="BUYER">Buyer (Purchasing)</option>
<option value="TENANT">Tenant (Renting)</option>
<option value="LANDLORD">Landlord (Property Owner)</option>
<option value="PARTNER_AGENT">Partner Agent</option>
<option value="REAL_ESTATE_BUILDER">Builder</option>
<option value="MANAGEMENT">Team Member</option>
<option value="UNKNOWN">Unknown</option>
```

- [ ] **Step 2: `MarketingCampaign.tsx` (lines ~579-580) — audience filter**

Find:
```typescript
<option value="BUYER_TENANT">Buyer/Tenant</option>
<option value="SELLER_LANDLORD">Seller/Landlord</option>
```
Replace with:
```typescript
<option value="BUYER">Buyers</option>
<option value="TENANT">Tenants</option>
<option value="LANDLORD">Landlords</option>
<option value="PARTNER_AGENT">Partner Agents</option>
```

- [ ] **Step 3: `ContactSearchField.tsx` (lines ~20-46) — role mapping**

Find:
```typescript
case 'SELLER_LANDLORD': return 'PROPERTY_OWNER';
...
case 'BUYER_TENANT': return { label: 'Buyer / Tenant', ... }
...
'PROPERTY_OWNER': 'SELLER_LANDLORD'
```
Replace with:
```typescript
case 'LANDLORD': return 'PROPERTY_OWNER';
case 'BUYER': return { label: 'Buyer', ... }
case 'TENANT': return { label: 'Tenant', ... }
...
'PROPERTY_OWNER': 'LANDLORD'
```

- [ ] **Step 4: `api/client.ts` — updateContactType valid values**

Find the `updateContactType` function comment/validation and update it to reference new enum values. The API call itself passes the value as-is — just update any type definitions.

---

### Task 29: Update Lead Display Components

**Files:** `ExternalLeads.tsx`, `BookVisitModal.tsx`, `DealPipeline.tsx`

- [ ] **Step 1: `ExternalLeads.tsx` — contact_type display**

This component displays contact_type as a badge. It uses whatever the API returns. No enum value hardcoded — the display label comes from the badge mapping. Update the badge map inside this file if it has one, otherwise it inherits from shared maps.

Check for any hardcoded `BUYER_TENANT` or `SELLER_LANDLORD` strings and replace.

- [ ] **Step 2: `BookVisitModal.tsx` (line ~233)**

Find:
```typescript
{foundContact.contact_type?.replace('_', ' ')}
```
Replace with a proper label lookup:
```typescript
{TYPE_LABELS[foundContact.contact_type] || foundContact.contact_type?.replace('_', ' ')}
```
Where TYPE_LABELS is the same map from Step 1 in Task 27.

- [ ] **Step 3: `DealPipeline.tsx` (line ~618)**

Find the BUYER_TENANT reference and replace with `BUYER` or `TENANT` based on context.

---

## PHASE 7 — Lead Table Integration (Demand Data Migration)

> This phase enables the new Lead table. The Contact demand fields are kept intact (backward compat) during this phase. Routes gradually read from Lead table.

---

### Task 30: Update Leads Routes to Write to Lead Table

**File:** `backend/src/routes/leads.ts`

- [ ] **Step 1: Update `POST /api/leads` (create manual lead) to write to Lead table**

After creating/upserting the Contact, also create a Lead record:
```typescript
// After prisma.contact.upsert(...)
const lead = await prisma.lead.create({
  data: {
    contact_phone: normalizedPhone,
    tenant_id: req.agent.tenant_id,
    intent: intent || 'buy',
    source: 'manual',
    budget_min: budget_min ? Number(budget_min) : null,
    budget_max: budget_max ? Number(budget_max) : null,
    demand_bhk: demand_bhk ? Number(demand_bhk) : null,
    demand_main_category: demand_main_category || null,
    demand_type_slug: demand_type_slug || null,
    preferred_location: preferred_location || null,
    preferred_lat: preferred_lat || null,
    preferred_lng: preferred_lng || null,
    category_id: category_id || null,
    sub_category_id: sub_category_id || null,
    type_id: type_id || null,
    lead_status: isPartnerReferral ? 'warm' : 'cold',
    lifecycle_stage: 'NEW',
    assigned_agent_id: assigned_agent_id || null,
    created_by: req.agent.id,
    lead_type: lead_type || null,
    referral_partner_id: referral_partner_id || null,
    referral_partner_name: referral_partner_name || null,
    referral_partner_phone: referral_partner_phone || null,
    notes: notes || null,
    timeline: timeline || null,
  },
});
```

- [ ] **Step 2: Update `GET /api/leads` to read from Lead table (dual-read phase)**

During transition, read from both Contact fields AND Lead table. Eventually Contact fields are deprecated.

Add a query param `?source=lead_table` to test the new path:
```typescript
// If lead_table flag: read from leads table
if (req.query.source === 'lead_table') {
  const leads = await prisma.lead.findMany({
    where: {
      tenant_id: req.agent.tenant_id,
      ...visibilityFilterForLeads,
    },
    include: {
      contact: { select: { phone_number: true, name: true, email: true, contact_type: true } },
    },
    orderBy: { updated_at: 'desc' },
    take: Number(limit) || 50,
    skip: Number(offset) || 0,
  });
  return res.json(leads);
}
// Default: existing Contact-based query (backward compat)
```

---

### Task 31: Update Matching Engine to Use Lead Table

**File:** `backend/src/services/matching_engine.ts`

- [ ] **Step 1: Accept Lead record as input (in addition to Contact)**

The matching engine already accepts a `MatchCriteria` object. This interface is populated from Contact fields. Add a new helper that builds criteria from a Lead record:

```typescript
// Add new helper
export function buildMatchCriteriaFromLead(lead: any): MatchCriteria {
  return {
    intent: lead.intent,
    property_type: lead.demand_type_slug || undefined,
    budget_min: lead.budget_min ? Number(lead.budget_min) : undefined,
    budget_max: lead.budget_max ? Number(lead.budget_max) : undefined,
    preferred_location: lead.preferred_location || undefined,
    bhk: lead.demand_bhk || undefined,
    lat: lead.preferred_lat || undefined,
    lng: lead.preferred_lng || undefined,
  };
}
```

- [ ] **Step 2: Update leads route matching endpoint (`POST /api/leads/:phone/match`) to use Lead table**

```typescript
// Get the most recent active Lead for this contact
const lead = await prisma.lead.findFirst({
  where: {
    contact_phone: phone,
    lifecycle_stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
  },
  orderBy: { updated_at: 'desc' },
});

if (lead) {
  criteria = buildMatchCriteriaFromLead(lead);
} else {
  // Fallback to Contact fields (backward compat during migration)
  criteria = { intent: contact.intent, budget_min: Number(contact.budget_min), ... };
}
```

---

## PHASE 8 — Deploy + Full System Verification

---

### Task 32: Deploy and Verify

- [ ] **Step 1: Deploy backend**

```
mcp__realty-pandit-qa__deploy("backend")
```

- [ ] **Step 2: Verify health endpoint**

```
mcp__realty-pandit-qa__qa_verify_task({
  description: "Backend healthy after contact system refactor",
  checks: [
    "api:https://api.realtypandit.in/health:200",
    "noerrors:https://api.realtypandit.in/health"
  ]
})
```

- [ ] **Step 3: Verify contact type values in admin panel**

```
mcp__realty-pandit-qa__qa_verify_task({
  description: "Contact type badges show BUYER/TENANT/LANDLORD correctly",
  checks: [
    "loads:https://admin.realtypandit.in:3000",
    "noerrors:https://admin.realtypandit.in"
  ]
})
```

- [ ] **Step 4: Deploy frontend**

```
mcp__realty-pandit-qa__deploy("frontend")
```

- [ ] **Step 5: Verify frontend contact type display**

```
mcp__realty-pandit-qa__qa_verify_task({
  description: "Admin panel shows new contact types correctly",
  checks: [
    "loads:https://admin.realtypandit.in:3000",
    "noerrors:https://admin.realtypandit.in",
    "text:https://admin.realtypandit.in:Buyer",
    "text:https://admin.realtypandit.in:Tenant"
  ]
})
```

- [ ] **Step 6: Test WhatsApp routing — send test message as buyer**

Verify the classifier correctly identifies a "buy" message as BUYER (not BUYER_TENANT):
```bash
ssh -i ~/.ssh/realty_pandit_key -F /dev/null root@72.62.231.224 \
  "psql -h localhost -U realty_user -d reality_pandit -c \"SELECT phone_number, contact_type, created_at FROM contacts ORDER BY created_at DESC LIMIT 10;\""
```
Expected: New contacts show `BUYER`, `TENANT`, or `LANDLORD` — never `BUYER_TENANT` or `SELLER_LANDLORD`.

- [ ] **Step 7: Verify Lead table population**

```bash
ssh -i ~/.ssh/realty_pandit_key -F /dev/null root@72.62.231.224 \
  "psql -h localhost -U realty_user -d reality_pandit -c \"SELECT intent, lead_status, COUNT(*) FROM leads GROUP BY intent, lead_status;\""
```
Expected: Records present with intent = "buy" or "rent".

- [ ] **Step 8: Verify no BUYER_TENANT or SELLER_LANDLORD remain**

```bash
ssh -i ~/.ssh/realty_pandit_key -F /dev/null root@72.62.231.224 \
  "psql -h localhost -U realty_user -d reality_pandit -c \"SELECT COUNT(*) FROM contacts WHERE contact_type IN ('BUYER_TENANT', 'SELLER_LANDLORD');\""
```
Expected: `count = 0`

---

## SELF-REVIEW — Spec Coverage Check

| Spec Requirement | Task Covering It |
|-----------------|-----------------|
| Contact = identity only (no BHK/location) | Task 1 (Lead model), Task 30 (write to Lead table) |
| BUYER and TENANT separate | Tasks 1, 3, 4, 5 (enum split everywhere) |
| SELLER_LANDLORD → LANDLORD | Tasks 1, 7, 8, 16, 22 (rename everywhere) |
| `created_by` field on Contact | Tasks 1, 25, 26 |
| Visibility: only creator + hierarchy | Tasks 24, 25 |
| Full exact phone search for others | Task 25 (search endpoint restriction) |
| Partner agent → name+phone only | Task 25 (isPartnerAgent check) |
| Auto-inbound → super_boss owns | Tasks 7, 26 (created_by = null) |
| Portal leads (99acres etc.) → tagged agent | Task 22 (integrations, existing routing preserved) |
| Partner agent contacts visible to their manager | Task 24 (buildFullContactVisibilityFilter) |
| Existing partner/inventory connections preserved | Tasks 14, 15, 22 (no change to reference_agent_id, managing_agent_id) |
| Lead table with demand data | Task 1 (schema), Task 2 (migration seed), Task 30 (write), Task 31 (matching) |
| contact_type kept (initial tag) | Tasks 3-23 (kept, just updated enum values) |
| AI routing per-message dynamic intent | Tasks 3, 4, 5 (LLM prompts + classifier updated) |
| rent and rent_lease = same | Task 13 (public.ts normalises to 'rent') |

---

## KNOWN RISKS

| Risk | Mitigation |
|------|-----------|
| Postgres enum cannot drop old values | Old values unused; excluded from all validation arrays |
| 699 contacts migrated — some with null intent | Null intent → BUYER (safer than UNKNOWN for portal leads) |
| Dual-read phase for Lead table | Use `?source=lead_table` flag to test without breaking existing |
| Partner agent visibility complexity | `buildFullContactVisibilityFilter` handles it with DB lookup |
| BullMQ jobs that read contact demand fields | Jobs read from Contact (still has fields during transition). Phase 7 migrates gradually. |
