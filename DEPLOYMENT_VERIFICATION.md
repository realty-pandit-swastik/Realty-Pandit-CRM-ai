# Inventory Redesign v2 - Deployment Verification Checklist

**Deployment Date**: 2026-02-23 17:25 IST
**Server**: 72.62.231.224 (realtypandit.in)
**Migration**: 20260223000000_inventory_redesign_v2

---

## ✅ Phase 10: Deployment Verification

### Backend Deployment
- [x] Prisma migration `inventory_redesign_v2` applied successfully
- [x] 37 FlatPropertyType records seeded (Residential: 11, Commercial: 25, Agricultural: 1)
- [x] Backend restarted (PM2 cluster mode, 2 instances)
- [x] Health check passed - DB connected, Redis connected
- [x] API endpoint accessible: https://api.realtypandit.in/health

### Website Deployment
- [x] Next.js 16 build successful (29 routes compiled, zero errors)
- [x] UploaderBlockInput component deployed (Phase 9 fix)
- [x] AddressBlockInput uses `city` field (not `district`)
- [x] Image rejection feedback implemented
- [x] Website running on PM2 (port 3000)
- [x] Public URL accessible: https://www.realtypandit.in
- [x] Status: HTTP 200 OK

### Admin Dashboard Deployment
- [x] Vite build successful (481KB bundle, zero errors)
- [x] InventoryList shows `city` field (backward compatible with `district`)
- [x] Dual pricing fields displayed (`display_price` + `customer_price`)
- [x] Ownership type badge shown
- [x] Upload source badge shown
- [x] Admin running on PM2 (port 5173)
- [x] Admin URL accessible: https://admin.realtypandit.in
- [x] Status: HTTP 200 OK

---

## 🔍 Functional Verification Checklist

### 1. Website Post-Property Wizard
- [ ] **Ownership FIRST**: Workflow starts with ownership_type selection
- [ ] **Three options visible**: Owner | External Agent | Agent Owner
- [ ] **Uploader contact**: Name + Phone + Email form renders (website users)
- [ ] **Owner contact**: Conditional on EXTERNAL_AGENT ownership type
- [ ] **Intent options**: Only 2 visible (Sell | Rent/Lease) - no separate "Lease"
- [ ] **Flat categories**: Single-level selector (no sub-categories)
  - Main Category: Residential | Commercial | Agricultural Land
  - Property Type: 37 options filtered by main category
- [ ] **City field**: Labeled "City" (not "District") in address block
- [ ] **Image moderation**: Upload feedback shows rejection reasons if images fail
- [ ] **WhatsApp confirmation**: Owner receives confirmation message after submit

### 2. Admin Dashboard Workflow
- [ ] **Admin skips uploader**: JWT-based agent identity (no uploader_contact block)
- [ ] **Dual pricing visible**: Both "Customer Price" and "Display Price" inputs shown
- [ ] **Display price optional**: For admin source only
- [ ] **Inventory list columns**:
  - Shows `city` field (backward compatible fallback to `district`)
  - Shows `display_price` as main price
  - Shows `customer_price` in detail/expand
  - Shows `ownership_type` badge (Owner/External Agent/Agent Owner)
  - Shows `upload_source` badge (website/admin/whatsapp/voice)

### 3. Public API Responses
- [ ] **`GET /public/properties`**: Returns `display_price` as `price` (NEVER `customer_price`)
- [ ] **City field**: Returns `city` in response (not just `district`)
- [ ] **Flat property type**: Includes `flat_property_type` name in response
- [ ] **`GET /public/master/flat-property-types`**: Returns all 37 types
  - Filter by `?main_category=residential` works
  - Response includes: id, name, slug, main_category, bhk_required, floor_required, plot_area_required

### 4. WhatsApp Bot Workflow
- [ ] **Ownership question FIRST**: Bot asks ownership type before anything else
- [ ] **Uploader block parsing**: "Name, Phone, Email" comma-separated input works
- [ ] **Owner block parsing**: "Owner Name, Owner Phone" comma-separated input works
- [ ] **Image moderation**: Bot rejects images with explicit content/phone numbers/addresses
- [ ] **Confirmation template**: `rp_inventory_confirmed` sent after successful submit
  - Template params: {{name}}, {{type}}, {{location}}, {{price}}, {{id}}

### 5. Database Integrity
- [ ] **FlatPropertyType table**: 37 records exist with correct mappings
  - Residential: apartment, independent_house, villa, builder_floor, farm_house, etc.
  - Commercial: office_space, retail_shop, showroom, warehouse, restaurant, etc.
  - Agricultural: agricultural_land
- [ ] **Inventory table**: New fields exist
  - `city` (nullable, indexed)
  - `customer_price` (Decimal, internal only)
  - `display_price` (Decimal, public)
  - `ownership_type` (enum: OWNER, EXTERNAL_AGENT, AGENT_OWNER)
  - `upload_source` (text)
  - `uploader_phone`, `uploader_name`, `uploader_email`
  - `flat_property_type_id` (foreign key to FlatPropertyType)
- [ ] **Data migration**: Existing inventory records migrated
  - `district` copied to `city`
  - `price` copied to both `customer_price` AND `display_price`
  - `upload_source` set to 'unknown' for old records

### 6. Backend API (Authenticated)
- [ ] **`POST /auth/change-password`**: Password change endpoint works
  - Requires: currentPassword, newPassword
  - Validates min 8 characters
- [ ] **`GET /api/workflow/master/flat-property-types`**: Dynamic dropdown works
- [ ] **`POST /api/workflow/upload-media`**: Image moderation runs
  - Approved images return URLs
  - Rejected images return `rejected` array with reasons
- [ ] **`POST /api/workflow/commit`**: Ownership-based commit works
  - OWNER: uploader IS owner
  - EXTERNAL_AGENT: owner from owner_block
  - AGENT_OWNER: uploader is both agent and owner
  - Writes dual pricing (customer_price + display_price)
  - Writes city + district (both fields for backward compat)

---

## 📊 Test Scenarios

### Scenario 1: Website User (Owner Selling)
1. Visit https://www.realtypandit.in/post-property
2. Select **"Owner"** for ownership type
3. Fill uploader contact: Name, Phone, Email
4. Select **"Sell"** intent
5. Select **"Residential"** main category
6. Select **"2 BHK Flat"** from property types
7. Fill specs: 2 bedrooms, 2 bathrooms, 1200 sqft
8. Pricing: Only see **customer_price** (no display_price for website users)
9. Address: "City" field visible (not "District")
10. Upload 3 property images
11. Submit → Verify WhatsApp confirmation received

**Expected**: Inventory created with `ownership_type=OWNER`, `upload_source='website'`, owner_id = uploader contact

### Scenario 2: External Agent (via Website)
1. Visit /post-property
2. Select **"External Agent"** for ownership type
3. Fill uploader contact (agent's details)
4. Fill owner contact (property owner's details) → SHOWS ONLY IF EXTERNAL_AGENT
5. Select **"Rent/Lease"** intent (merged option)
6. Complete workflow
7. Submit

**Expected**: Inventory created with `ownership_type=EXTERNAL_AGENT`, owner_id = owner contact, uploader_phone = agent contact, auto-registers agent as PARTNER_AGENT

### Scenario 3: Admin Adding Inventory
1. Login to https://admin.realtypandit.in
2. Navigate to Inventory → Add Property
3. Workflow starts with ownership type (NO uploader_contact block for admin)
4. Fill property details
5. Pricing section shows **BOTH** fields:
   - "Owner's Price" (customer_price) - required
   - "Website Price" (display_price) - optional
6. Submit

**Expected**: Inventory created with `upload_source='admin'`, `uploaded_by_agent_id` set to JWT agent

### Scenario 4: Verify Public API Hides Customer Price
1. Create inventory with:
   - customer_price: ₹55,00,000
   - display_price: ₹52,00,000
2. Call `GET /public/properties/{id}`
3. Verify response:
   - `price` = 52,00,000 (display_price)
   - No `customer_price` field in response

**Expected**: Customer price NEVER exposed in public endpoints

### Scenario 5: Image Moderation
1. Upload image with phone number overlay
2. Verify: Image rejected with reason "PHONE_NUMBER"
3. Upload explicit content
4. Verify: Image rejected with reason "EXPLICIT"
5. Upload property exterior photo
6. Verify: Image approved

**Expected**: Gemini Vision correctly identifies and rejects inappropriate images

---

## 🚨 Known Issues & Limitations

1. **Schema Drift**: Local `uploaded_by_agent_id` column doesn't exist in older migrations
   - Fixed in seed script to skip this check
   - Production DB already has this column from prior migrations

2. **Backward Compatibility**:
   - Old workflows still write to `district` field
   - New workflows write BOTH `city` AND `district`
   - Legacy `price` field still written (= customer_price)

3. **WhatsApp Number Placeholder**: ServiceTiles has placeholder `wa.me/919876543210`
   - Needs real number update in production config

---

## 🎯 Deployment Summary

| Component | Status | Version | Notes |
|-----------|--------|---------|-------|
| Backend API | ✅ Online | 1.0.0 | PM2 cluster (2 instances) |
| Website | ✅ Online | Next.js 16.1.6 | 29 routes compiled |
| Admin | ✅ Online | Vite 7.3.1 | 481KB bundle |
| Database | ✅ Migrated | PostgreSQL 16 | 10 migrations applied |
| FlatPropertyType | ✅ Seeded | 37 types | All categories covered |
| PM2 | ✅ Healthy | - | 4 processes online |
| Nginx | ✅ Running | - | SSL enabled |

**Live URLs**:
- Website: https://www.realtypandit.in
- API: https://api.realtypandit.in/health
- Admin: https://admin.realtypandit.in

---

## 📝 Next Steps

1. **Manual Testing**: Run all test scenarios above
2. **Data Verification**: Check production DB for correct migration
3. **User Acceptance**: Have client test post-property flow
4. **Monitor Logs**: Watch PM2 logs for any runtime errors
5. **Performance**: Monitor API response times under load
6. **WhatsApp Testing**: Verify confirmation messages are sent
7. **Image Moderation**: Test various image types to tune Gemini prompts

---

**Deployed By**: Claude Sonnet 4.5 (Inventory Redesign v2)
**Deployment Script**: `deploy-now.sh`
**Server**: root@72.62.231.224
**SSH Key**: ~/.ssh/realty_pandit_key (copied to /tmp/rp_key)
