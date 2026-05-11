# Reality Pandit -- API Endpoints Reference

> Comprehensive documentation of every API endpoint in the Reality Pandit backend.
>
> **Base URL:** `https://api.realtypandit.in` (production) / `http://localhost:3001` (development)
>
> **Last updated:** 2026-02-26

---

## Table of Contents

1. [Authentication & User Management](#1-authentication--user-management)
2. [Public API (No Auth)](#2-public-api-no-auth)
3. [Contact & CRM Management](#3-contact--crm-management)
4. [Inventory / Property Management](#4-inventory--property-management)
5. [Lead Management](#5-lead-management)
6. [Transaction / Deal Management](#6-transaction--deal-management)
7. [Calendar & Appointments](#7-calendar--appointments)
8. [Communication (Email, Calls)](#8-communication-email-calls)
9. [Team & Partner Management](#9-team--partner-management)
10. [Reports & Analytics](#10-reports--analytics)
11. [Workflow & Automation](#11-workflow--automation)
12. [Marketing Campaigns](#12-marketing-campaigns)
13. [Webhooks (WhatsApp, Voice)](#13-webhooks-whatsapp-voice)
14. [External Integrations (99Acres, MagicBricks, Housing.com)](#14-external-integrations-99acres-magicbricks-housingcom)
15. [Builder Portal](#15-builder-portal)
16. [Notifications](#16-notifications)
17. [Health Check & System](#17-health-check--system)

---

## Rate Limit Groups

| Group | Limit | Window | Applies To |
|-------|-------|--------|------------|
| `authLimiter` | 100 req | 15 min | `/auth/*` |
| `publicLimiter` | 50 req | 15 min | `/user/*`, `/public/*` |
| `webhookLimiter` | 200 req | 15 min | `/webhooks/*` |
| `workflowLimiter` | 300 req | 15 min | `/api/workflow/*` |
| `agentLimiter` | 30 req | 15 min | `/agent/*`, `/builder/*` |
| `externalLimiter` | 100 req | 15 min | `/external/*` |
| `apiLimiter` | 100 req | 15 min | `/api/*` (all authenticated CRM routes) |

---

## Authentication Methods

| Method | Header | Description |
|--------|--------|-------------|
| **JWT (Admin)** | `Authorization: Bearer <token>` | Staff/agent login via `/auth/login`. Token contains `{ id, email, role, tenant_id }`. |
| **JWT (User)** | `Authorization: Bearer <token>` | End-user login via `/user/verify-otp`. Token contains `{ id, phone, type: 'user' }`. 7-day expiry. |
| **JWT (Agent Portal)** | `Authorization: Bearer <token>` | Partner agent login via `/agent/verify-otp`. Token contains `{ id, phone }`. 7-day expiry. |
| **JWT (Builder)** | `Authorization: Bearer <token>` | Builder login via `/builder/verify-otp`. Token contains `{ ownerId, scope, externalType, planType, phone }`. 30-day expiry. |
| **API Key** | `x-api-key: <key>` | External integrations (99Acres, MagicBricks, Housing.com, external leads). |
| **None** | -- | Public endpoints (property listings, classification data, health check). |

---

## 1. Authentication & User Management

**Mount:** `/auth` | **Rate Limit:** `authLimiter` (100 req/15min)
**Middleware chain:** `express.Router()` -> per-route `authMiddleware` where noted

### 1.1 Admin/Staff Authentication (`/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | None | Login with phone + password |
| POST | `/auth/register` | JWT + `create_agents` permission | Register new agent (staff member) |
| POST | `/auth/refresh` | None | Refresh an expired access token |
| GET | `/auth/me` | JWT | Get current authenticated user info with permissions |
| POST | `/auth/setup` | None | First-time system setup (creates super_boss). Only works when zero agents exist. |
| POST | `/auth/forgot-password` | None | Send OTP to WhatsApp for password reset |
| POST | `/auth/verify-reset-otp` | None | Verify OTP and set new password |
| POST | `/auth/resend-otp` | None | Resend password reset OTP |
| POST | `/auth/change-password` | JWT | Change password for logged-in user |
| GET | `/auth/validate-setup-token` | None | Check if a setup token (invite link) is valid |
| POST | `/auth/setup-password` | None | Set password using a setup token (invite link) |

#### `POST /auth/login`
- **Body:** `{ phone: string, password: string }`
- **Response:** `{ token: string, refreshToken: string, agent: { id, name, email, role } }`

#### `POST /auth/register`
- **Body:** `{ name, email, password, role?, reports_to_id? }`
- **Response:** `201 { id, name, email, role, tenant_id }`
- **Note:** Managers can only create `employee` role. Only `super_boss` can create another `super_boss`.

#### `POST /auth/refresh`
- **Body:** `{ refreshToken: string }`
- **Response:** `{ token, refreshToken }`

#### `GET /auth/me`
- **Response:** `{ id, name, email, phone, role, department, status, tenant_id, permissions[], reports_to, subordinates[] }`

#### `POST /auth/setup`
- **Body:** `{ name, email, password }`
- **Response:** `201 { token, refreshToken, agent }`

#### `POST /auth/forgot-password`
- **Body:** `{ phone: string }`
- **Response:** `{ message, remaining, method }`
- **Rate limit:** Max 3 OTPs per phone per 10-minute window.

#### `POST /auth/verify-reset-otp`
- **Body:** `{ phone, otp, newPassword }`
- **Response:** `{ message: "Password reset successfully..." }`

#### `POST /auth/change-password`
- **Body:** `{ currentPassword, newPassword }`
- **Response:** `{ success: true, message }`

#### `GET /auth/validate-setup-token`
- **Query:** `?token=<uuid>`
- **Response:** `{ valid: boolean, name?, email?, error? }`

#### `POST /auth/setup-password`
- **Body:** `{ token: string, password: string }`
- **Response:** `{ success: true, message, email }`

---

### 1.2 End-User Authentication (`/user`)

**Mount:** `/user` | **Rate Limit:** `publicLimiter` (50 req/15min)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/user/login-otp` | None | Send OTP to user's WhatsApp |
| POST | `/user/verify-otp` | None | Verify OTP, get JWT token (creates contact if new) |
| GET | `/user/me` | User JWT | Get user profile with saved searches, visits, activity |
| POST | `/user/logout` | None | Logout (client-side token removal) |

#### `POST /user/login-otp`
- **Body:** `{ phone: string }`
- **Response:** `{ success, message, phone }`

#### `POST /user/verify-otp`
- **Body:** `{ phone, otp }`
- **Response:** `{ success, token, user: { id, phone, name, email, contact_type } }`

#### `GET /user/me`
- **Response:** `{ success, user, savedSearches[], scheduledVisits[], recentActivity[] }`

---

### 1.3 Public WhatsApp Auth (`/public/auth`)

**Mount:** `/public/auth` | **Rate Limit:** `publicLimiter` (50 req/15min)
**Source file:** `auth_otp.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/public/auth/send-confirmation` | None | Send WhatsApp confirmation message; user replies "yes"/"agree" to link |
| GET | `/public/auth/check-status` | None | Poll to check if user confirmed via WhatsApp reply |

#### `POST /public/auth/send-confirmation`
- **Body:** `{ phone: string }`
- **Response:** `{ success, message }`

#### `GET /public/auth/check-status`
- **Query:** `?phone=+91XXXXXXXXXX`
- **Response:** `{ success, authenticated: boolean, expired?, message }`

---

## 2. Public API (No Auth)

**Mount:** `/public` | **Rate Limit:** `publicLimiter` (50 req/15min)
**Middleware chain:** `cache(seconds)` on read endpoints

### 2.1 Property Listings

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/public/properties` | None | Paginated, filterable property listings |
| GET | `/public/properties/:id` | None | Single property detail |
| GET | `/public/featured-properties` | None | Curated featured listings (latest 6) |
| GET | `/public/similar-properties/:id` | None | Similar properties based on type/location |
| GET | `/public/matches` | None | Unified search for resale + projects |
| GET | `/public/locations` | None | Unique locations for autocomplete |
| GET | `/public/stats` | None | Public statistics (total properties, locations, clients) |
| GET | `/public/testimonials` | None | Client testimonials |

#### `GET /public/properties`
- **Query:** `location, type, category, intent, category_id, sub_category_id, type_id, configuration_id, usage_type_id, investment_type_id, price_min, price_max, sort (price_asc|price_desc|newest), page, limit`
- **Response:** `{ properties[], pagination: { page, limit, total, totalPages } }`
- **Cache:** 300s

#### `GET /public/properties/:id`
- **Response:** Full property object with owner name, classification, address details.
- **Cache:** 300s

#### `GET /public/matches`
- **Query:** `intent, propertyType, budgetMin, budgetMax, location, configuration, city, locality`
- **Response:** `{ resale[], projects[], totalResale, totalProjects }`
- **Cache:** 180s

---

### 2.2 Builder Projects (Public)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/public/projects` | None | Builder project listings (stub -- pending migration) |
| GET | `/public/projects/:id` | None | Single project detail (stub) |
| GET | `/public/featured-projects` | None | Featured builder projects (stub) |
| GET | `/public/similar-projects` | None | Similar projects (stub) |
| POST | `/public/project-enquiry` | None | Submit project enquiry (stub) |

---

### 2.3 Lead Capture & Forms

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/public/contact` | None | Lead capture from website contact form |
| POST | `/public/lead` | None | Lead capture from popup/cookie consent |
| POST | `/public/newsletter` | None | Newsletter subscription |
| POST | `/public/schedule-visit` | None | Schedule a property site visit |
| POST | `/public/post-property` | None | Owner posts a property listing |

#### `POST /public/contact`
- **Body:** `{ name, phone, email?, message?, property_id?, intent? }`
- **Response:** `201 { success, message }`

#### `POST /public/lead`
- **Body:** `{ name?, phone?, email?, interest?, source?, page_url?, user_agent?, cookie_consent? }`
- **Response:** `201 { success, lead_id }`

#### `POST /public/newsletter`
- **Body:** `{ email, name?, source? }`
- **Response:** `201 { success, id }`

#### `POST /public/schedule-visit`
- **Body:** `{ property_id, name, phone, email?, preferred_date?, preferred_time?, message? }`
- **Response:** `201 { success, visit_id, message }`

#### `POST /public/post-property`
- **Body:** `{ intent, category?, type?, category_id?, sub_category_id?, type_id?, configuration_id?, usage_type_id?, investment_type_id?, location, price, price_unit?, specs?, features?, description?, furnishing?, owner_name, phone, email? }`
- **Response:** `201 { success, property_id, message }`

---

### 2.4 Geo Data

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/public/geo/states` | None | All Indian states and UTs |
| GET | `/public/geo/cities` | None | Cities filtered by state |
| GET | `/public/geo/districts` | None | Alias for `/geo/cities` |

#### `GET /public/geo/cities`
- **Query:** `?state=Uttar Pradesh`
- **Response:** `{ state, cities[] }`
- **Cache:** 86400s (24h)

---

### 2.5 Classification Data

**Source file:** `classification.ts` | **Mount:** `/public` (via classificationRoutes)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/public/categories` | None | All active property categories with counts |
| GET | `/public/categories/:id/subcategories` | None | Subcategories for a category |
| GET | `/public/subcategories/:id/types` | None | Property types for a subcategory |
| GET | `/public/configurations` | None | All property configurations (BHK, Office types) |
| GET | `/public/usage-types` | None | Usage types (Self-use, Investment, Rental Income) |
| GET | `/public/investment-types` | None | Investment types (Pre-launch, Under Construction, Ready to Move) |
| GET | `/public/classification-tree` | None | Complete classification tree in one call |

#### `GET /public/classification-tree`
- **Response:** `{ categories[ { ...subcategories[ { ...types[] } ] } ], configurations[], usage_types[], investment_types[] }`
- **Cache:** 3600s (1h)

---

### 2.6 Master Data (`/public/master`)

**Mount:** `/public/master` | **Source file:** `master.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/public/master/categories` | None | All categories with nested subcategories and types |
| GET | `/public/master/categories/:id/subcategories` | None | Cascading subcategories |
| GET | `/public/master/subcategories/:id/types` | None | Cascading property types |
| GET | `/public/master/subcategories/:id` | None | Single subcategory with validation rules |
| GET | `/public/master/configurations` | None | All active configurations |
| GET | `/public/master/usage-types` | None | All usage types |
| GET | `/public/master/investment-types` | None | All investment types |
| GET | `/public/master/tree` | None | Complete classification tree |
| GET | `/public/master/flat-property-types` | None | All active flat property types (from `public.ts`) |

#### `GET /public/master/flat-property-types`
- **Query:** `?main_category=residential`
- **Response:** `{ types[] }`
- **Cache:** 1800s

---

### 2.7 AI Chat

**Source file:** `ai_chat.ts` | **Mount:** `/public` (via aiChatRoutes)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/public/ai-chat` | None | Process user message with AI, return response + matching properties |
| POST | `/public/ai-chat/book-visit` | None | Book a property visit from chat |

#### `POST /public/ai-chat`
- **Body:** `{ message, filters?, sessionId?, phone? }`
- **Response:** `{ success, reply, properties[], sessionId, action? }`

#### `POST /public/ai-chat/book-visit`
- **Body:** `{ phone, propertyId, message?, sessionId? }`
- **Response:** `{ success, ... }`

---

## 3. Contact & CRM Management

**Mount:** `/api` | **Rate Limit:** `apiLimiter` (100 req/15min)
**Middleware chain:** `authMiddleware` (applied to entire router via `router.use(authMiddleware)`)
**Source file:** `api.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/contacts` | JWT | List contacts (role-scoped) |
| GET | `/api/contacts/:phone/interactions` | JWT | Get interaction history for a contact |
| PATCH | `/api/contacts/:phone` | JWT | Update contact (e.g., manual classification) |
| GET | `/api/agents` | JWT + `super_boss`/`manager` | List all agents |
| GET | `/api/dashboard/stats` | JWT + `super_boss`/`manager` | Dashboard statistics |
| GET | `/api/leads/by-source` | JWT + `super_boss`/`manager` | Leads grouped by source |
| GET | `/api/leads/recent-external` | JWT + `super_boss`/`manager` | Recent leads from external sources |

#### `GET /api/contacts`
- **Response:** `Contact[]` with `lead_score` and latest interaction.
- **Scoping:**
  - `super_boss`: sees all
  - `manager`: own + subordinates' assigned contacts
  - `employee`: only own assigned contacts

#### `PATCH /api/contacts/:phone`
- **Body:** `{ contact_type: "BUYER_TENANT" | "SELLER_LANDLORD" | "PARTNER_AGENT" | "MANAGEMENT" | "UNKNOWN" }`
- **Response:** Updated contact object

#### `GET /api/dashboard/stats`
- **Response:** `{ totalContacts, todayContacts, todayInteractions, activeProperties, hotLeads, contactsByType[] }`

---

### 3.1 Partner Agent Management (via `/api`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/partners` | JWT + `manage_agents` | Register a new partner agent |
| GET | `/api/partners` | JWT + `manage_agents` | List all partner agents |
| PATCH | `/api/partners/:id/verify` | JWT + `manage_agents` | Verify a partner agent |
| PATCH | `/api/partners/:id/status` | JWT + `manage_agents` | Update partner status (active/suspended/onboarding) |
| PATCH | `/api/partners/:id/commission` | JWT + `manage_agents` | Update partner commission rate |
| GET | `/api/commissions` | JWT + `view_reports` | List all commissions with agent details |

#### `POST /api/partners`
- **Body:** `{ phone_number, name, agency_name?, partner_type?, package_type?, commission_rate? }`
- **Response:** `201` Partner object

---

## 4. Inventory / Property Management

**Mount:** `/inventory` and `/api/inventory` (dual mount)
**Rate Limit:** `apiLimiter` (100 req/15min)
**Source file:** `inventory.ts`

### 4.1 CRUD Operations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/inventory` | JWT + `edit_inventory` | Create single inventory record |
| GET | `/inventory` | JWT | List inventory (role-based + query filters + pagination) |
| GET | `/inventory/:id` | JWT | Get single inventory item with full classification |
| PATCH | `/inventory/:id` | JWT + `edit_inventory` | Update inventory record |
| DELETE | `/inventory/:id` | JWT + `delete_inventory` | Delete inventory record |

#### `POST /inventory`
- **Body:** `{ intent, category_id?, sub_category_id?, type_id?, configuration_id?, usage_type_id?, investment_type_id?, category?, type?, location?, price?, specs?, features?, description?, furnishing?, floor_number?, total_floors?, facing?, property_age?, owner_phone, owner_name?, key_holder_type?, key_holder_name?, key_holder_phone? }`
- **Response:** `201` Inventory object

#### `GET /inventory`
- **Query:** `intent, state, type, category, agent_id, status, search, page, limit`
- **Response:** `{ data[], total, page, totalPages }`
- **Scoping:**
  - `super_boss`: sees all
  - `manager`: own + team's uploads/references
  - `employee`: own uploads + own references (dual-visibility)

#### `PATCH /inventory/:id`
- **Body:** Any combination of: `category, type, intent, location, specs, features, price, price_unit, status, category_id, sub_category_id, type_id, configuration_id, flat_property_type_id, customer_price, display_price, description, furnishing, floor_number, total_floors, facing, property_age, flat_no, plot_no, apartment_name, state, district, city, locality, pincode, full_address, key_holder_type, key_holder_name, key_holder_phone, ownership_type, upload_source`
- **Response:** Updated inventory object

---

### 4.2 Media Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/inventory/:id/upload` | None | Upload property images (max 10, max 10MB each) |
| DELETE | `/inventory/:id/media/:filename` | None | Remove a media file |
| GET | `/inventory/:id/media` | None | List all media (original, medium, thumbnail URLs) |

#### `POST /inventory/:id/upload`
- **Content-Type:** `multipart/form-data`
- **Field:** `images` (up to 10 files, jpeg/png/webp only)
- **Response:** `{ message, uploaded[], total_media }`

---

### 4.3 Inventory Session (WhatsApp Flow)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/inventory/session/start` | None | Start inventory collection session |
| POST | `/inventory/step` | None | Handle a step in inventory session |
| POST | `/inventory/commit` | None | Commit session data to create inventory record |

#### `POST /inventory/session/start`
- **Body:** `{ sessionId, intent }`
- **Response:** Session state with first step

#### `POST /inventory/commit`
- **Body:** `{ inventorySessionId, confirmed: true, agentId? }`
- **Response:** `{ status: "CREATED", inventory_id, reply }`

---

## 5. Lead Management

**Mount:** `/api` (via leadRoutes) | **Rate Limit:** `apiLimiter`
**Middleware chain:** `authMiddleware` (applied to parent `/api` router)
**Source file:** `leads.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/leads/:phone/score` | JWT | Get lead score for a contact |
| POST | `/api/leads/:phone/no-show` | JWT | Record a no-show event (applies penalty) |

#### `GET /api/leads/:phone/score`
- **Response:** LeadScore object with contact details

#### `POST /api/leads/:phone/no-show`
- **Response:** `{ status: "success", message, new_score }`

---

## 6. Transaction / Deal Management

**Mount:** `/api` (via transactionRoutes) | **Rate Limit:** `apiLimiter`
**Middleware chain:** `authMiddleware` (router-level) -> `checkPermission()` per route
**Source file:** `transactions.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/transactions` | JWT + `view_transactions` | List transactions with filters (employees see own only) |
| GET | `/api/transactions/pipeline` | JWT + `view_transactions` | Pipeline funnel view (counts by status) |
| GET | `/api/transactions/executive/:agentId` | JWT + `view_transactions` | Active deals for a specific executive |
| GET | `/api/transactions/:id` | JWT + `view_transactions` | Full transaction detail with logs + valid next statuses |
| PATCH | `/api/transactions/:id/status` | JWT + `manage_transactions` | Change transaction status (state machine validated) |
| PATCH | `/api/transactions/:id/reassign` | JWT + `manage_transactions` | Reassign the internal executive |
| POST | `/api/transactions/:id/note` | JWT + `view_transactions` | Add a note to a transaction |

#### `GET /api/transactions`
- **Query:** `status, type, executive_id, page, limit`
- **Response:** `{ success, data[], pagination: { page, limit, total, pages } }`

#### `PATCH /api/transactions/:id/status`
- **Body:** `{ status: TransactionStatus, reason? }`
- **Valid statuses:** `NEW, QUALIFIED, VISIT_SCHEDULED, VISITED, NEGOTIATION, AGREEMENT, REGISTRATION, CLOSED_WON, CLOSED_LOST`
- **Response:** Updated transaction object

#### `PATCH /api/transactions/:id/reassign`
- **Body:** `{ agent_id: string }`

---

## 7. Calendar & Appointments

**Mount:** `/api` (via calendarRoutes) | **Rate Limit:** `apiLimiter`
**Source file:** `calendar.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/calendar/appointments` | JWT | List appointments (role-scoped) |
| GET | `/api/calendar/appointments/:id` | JWT | Single appointment detail |
| POST | `/api/calendar/appointments` | JWT | Create a new appointment |
| PATCH | `/api/calendar/appointments/:id` | JWT | Update appointment (status, reschedule) |
| DELETE | `/api/calendar/appointments/:id` | JWT | Cancel/delete appointment |
| GET | `/api/calendar/summary` | JWT | Calendar summary (today, this week, pending counts) |

#### `GET /api/calendar/appointments`
- **Query:** `startDate, endDate, status, type`
- **Response:** `{ success, appointments[], count }`
- **Role scoping:** `employee` sees own; `builder`/`agent` sees property-related; `super_boss`/`manager` sees all.

#### `POST /api/calendar/appointments`
- **Body:** `{ contact_id, title, description?, type, scheduled_at, duration?, assigned_to_agent_id?, property_id?, location?, source?, channel? }`
- **Response:** `{ success, appointment, message }`

#### `PATCH /api/calendar/appointments/:id`
- **Body:** `{ status?, scheduled_at?, duration?, description?, notes?, assigned_to_agent_id? }`

---

## 8. Communication (Email, Calls)

### 8.1 Email

**Mount:** `/api` (via emailRoutes) | **Rate Limit:** `apiLimiter`
**Source file:** `email.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/email/webhook/incoming` | None (internal) | Receive incoming email (called by Postfix pipe) |
| POST | `/api/email/send` | JWT | Send email (with optional AI generation) |
| GET | `/api/email/contact/:phone` | JWT | Get emails for a contact |
| GET | `/api/email/search` | JWT | Search emails |
| GET | `/api/email/all` | JWT | Get all emails (paginated, role-scoped) |
| DELETE | `/api/email/:id` | JWT + `super_boss` | Delete email |
| POST | `/api/email/bulk-send` | JWT + `super_boss` | Bulk send emails |

#### `POST /api/email/send`
- **Body:** `{ to, from?, subject, body, html?, cc?, bcc?, generateWithAI? }`
- **Response:** `{ success, message, email }`

#### `GET /api/email/all`
- **Query:** `page, limit, direction (inbound|outbound)`
- **Response:** `{ emails[], pagination: { page, limit, total, pages } }`
- **Scoping:** `super_boss` sees all; others see only own emails.

#### `POST /api/email/bulk-send`
- **Body:** `{ recipients: string[], subject, body, html?, generateWithAI? }`
- **Response:** `{ message, results[], total, success, failed }`

---

### 8.2 Staff Calls

**Mount:** `/api` (via staffCallRoutes) | **Rate Limit:** `apiLimiter`
**Source file:** `staff_calls.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/calls/upload` | Agent JWT | Upload call recording (audio file) |
| GET | `/api/calls/:id` | Agent JWT | Get call status and AI results |
| POST | `/api/calls/:id/submit` | Agent JWT | Submit reviewed call to CRM (SSOT integration) |
| POST | `/api/calls/:id/reject` | Agent JWT | Reject and discard call recording |
| GET | `/api/calls` | Agent JWT | Get staff call history (paginated) |
| GET | `/api/calls/stats/overview` | Agent JWT | Get call statistics by status |
| GET | `/api/calls/voice-log/all` | JWT + `view_reports` | Get VoiceCall history (admin view) |

#### `POST /api/calls/upload`
- **Content-Type:** `multipart/form-data`
- **Field:** `audio` (mp3/wav/m4a/3gp/ogg, max 50MB)
- **Body fields:** `phone_number, classification?, duration?`
- **Response:** `201 { success, call_id, message }`

#### `POST /api/calls/:id/submit`
- **Body:** `{ edited_data?: object }`
- **Response:** `{ success, message }` -- Updates Contact, VoiceCall, Interaction, LeadScore in SSOT.

#### `GET /api/calls`
- **Query:** `page, limit, status, phone_number`
- **Response:** `{ calls[], pagination }`

#### `GET /api/calls/voice-log/all`
- **Query:** `status, direction, phone_number, from_date, to_date, limit`
- **Response:** `{ calls[], total }`

---

## 9. Team & Partner Management

**Mount:** `/api` (via teamRoutes) | **Rate Limit:** `apiLimiter`
**Middleware chain:** `authMiddleware` (router-level) -> `checkPermission()` per route
**Source file:** `team.ts`

### 9.1 Team Members

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/team/members` | JWT + `manage_team` | List all team members |
| GET | `/api/team/email-preview` | JWT + `manage_team` | Preview auto-generated email for a name |
| POST | `/api/team/members` | JWT + `create_agents` | Create new team member (with email provisioning + WhatsApp welcome) |
| PATCH | `/api/team/members/:id` | JWT + `manage_team` | Update member details |
| PATCH | `/api/team/members/:id/deactivate` | JWT + `manage_settings` | Deactivate or reactivate a member |
| PATCH | `/api/team/members/:id/reset-password` | JWT + `manage_team` | Reset password + send setup link via WhatsApp |
| PATCH | `/api/team/members/:id/set-password` | JWT + `manage_team` | Boss sets custom password for team member |
| POST | `/api/team/members/:id/resend-setup` | JWT + `manage_team` | Resend WhatsApp welcome with fresh setup link |
| GET | `/api/team/members-without-phone` | JWT + `manage_team` | Count active agents without phone |

#### `POST /api/team/members`
- **Body:** `{ name, phone, role?, department?, reports_to_id?, customEmail?, customPassword? }`
- **Response:** `201 { agent, setupLink, credentials: { email, tempPassword, setupLink, imapHost, imapPort, smtpHost, smtpPort } }`

### 9.2 Bulk Inventory Upload

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/team/inventory/bulk-template` | None | Download CSV template for bulk upload |
| POST | `/api/team/inventory/bulk-upload` | JWT + `bulk_upload` | Upload CSV of properties |

#### `POST /api/team/inventory/bulk-upload`
- **Content-Type:** `multipart/form-data`
- **Field:** `file` (CSV, max 10MB)
- **Response:** `{ imported, skipped, errors[], total, message }`

---

## 10. Reports & Analytics

### 10.1 Analytics

**Mount:** `/api` (via analyticsRoutes) | **Rate Limit:** `apiLimiter`
**Source file:** `analytics.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/analytics/market-trends` | JWT | Time-series data for leads, visits, sales |
| GET | `/api/analytics/user-performance` | JWT | Per-user performance metrics |
| GET | `/api/analytics/lead-sources` | JWT | Lead source breakdown with conversion rates |
| GET | `/api/analytics/property-trends` | JWT | Property analytics (status, intent, type breakdown) |
| GET | `/api/analytics/financial-summary` | JWT | Revenue, commissions, deal sizes |
| GET | `/api/analytics/advanced` | JWT | Aggregated dashboard data (trends, funnel, sources, agents, forecasts) |

#### Common Query Params (all analytics)
- `from`, `to` (date range, defaults to last 30 days)

#### `GET /api/analytics/advanced`
- **Query:** `range (7d|30d|90d|ytd|custom), start?, end?`
- **Response:** `{ data: { trends, funnel[], sources[], agents[], properties[], timeAnalysis, forecasts } }`

---

### 10.2 Reports

**Mount:** `/api` (via reportsRoutes) | **Rate Limit:** `apiLimiter`
**Source file:** `reports.ts`

#### Account Reports

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/reports/account/customer-outstanding` | JWT | Customer outstanding (sales not yet closed) |
| GET | `/api/reports/account/vendor-outstanding` | JWT | Vendor outstanding (commissions owed to partners) |
| GET | `/api/reports/account/monthly-sales` | JWT | Monthly sales by customer |
| GET | `/api/reports/account/monthly-purchase` | JWT | Monthly commissions paid to partners |

#### User Reports

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/reports/user/performance` | JWT | Agent performance (leads, appointments, deals, revenue) |
| GET | `/api/reports/user/task-completion` | JWT | Agent task completion rates |

#### Call Reports

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/reports/call/all-logs` | JWT | All call logs |
| GET | `/api/reports/call/by-date` | JWT | Date-wise call log |
| GET | `/api/reports/call/by-month` | JWT | Month-wise call summary |

#### Lead Reports

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/reports/lead/all-leads` | JWT | All leads with filters |
| GET | `/api/reports/lead/last-contact` | JWT | Lead last contact date with days since |
| GET | `/api/reports/lead/summary` | JWT | Lead summary (by status, by source) |
| GET | `/api/reports/lead/cancelled-reasons` | JWT | Lead cancellation reason analysis |

#### Sold Reports

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/reports/sold/by-property` | JWT | Sold/rented properties list |
| GET | `/api/reports/sold/by-area` | JWT | Sold properties grouped by area |
| GET | `/api/reports/sold/by-unit-type` | JWT | Sold properties grouped by type |

#### Visit Reports

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/reports/visit/all-visits` | JWT | All site visits |
| GET | `/api/reports/visit/property-count` | JWT | Visit count per property |

#### Customer Reports

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/reports/customer/converted-not-sold` | JWT | Qualified leads that haven't closed |

#### Property Reports

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/reports/property/all-properties` | JWT | All properties with filters |
| GET | `/api/reports/property/on-hold` | JWT | Hold properties |
| GET | `/api/reports/property/availability-summary` | JWT | Property availability breakdown (by status, type, intent, location) |

**Common query params for reports:** `from, to` (date range), plus report-specific filters like `status, source, type, intent`.

---

### 10.3 Agent Dashboard

**Mount:** `/api` (via agentDashboardRoutes) | **Rate Limit:** `apiLimiter`
**Middleware chain:** `authMiddleware` (router-level)
**Source file:** `agent_dashboard.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/agent-dashboard/health` | JWT | Full system health snapshot |
| GET | `/api/agent-dashboard/metrics` | JWT | Per-agent performance metrics (today) |
| GET | `/api/agent-dashboard/funnel` | JWT | Lead lifecycle conversion funnel |
| GET | `/api/agent-dashboard/logs` | JWT | Paginated agent action log |
| GET | `/api/agent-dashboard/qa-logs` | JWT | QA logs (flagged conversations) |
| GET | `/api/agent-dashboard/campaigns` | JWT | List campaigns |
| POST | `/api/agent-dashboard/campaigns` | JWT | Create a new campaign |
| POST | `/api/agent-dashboard/campaigns/:id/execute` | JWT | Execute a campaign |
| POST | `/api/agent-dashboard/campaigns/:id/cancel` | JWT | Cancel a campaign |
| GET | `/api/agent-dashboard/campaigns/analytics` | JWT | Campaign analytics summary |
| PATCH | `/api/agent-dashboard/qa-logs/:id/review` | JWT | Mark QA log as reviewed |
| PATCH | `/api/agent-dashboard/qa-logs/:id/flag` | JWT | Toggle flag on QA log |
| GET | `/api/agent-dashboard/winning-templates` | JWT | High-scoring response templates |

#### `GET /api/agent-dashboard/logs`
- **Query:** `agent_name, status, phone_number, limit, offset`
- **Response:** `{ success, data[], total }`

#### `POST /api/agent-dashboard/campaigns`
- **Body:** `{ name, type?, channel?, message, subject?, audience }`
- **Response:** `{ success, data: { campaign_id } }`

---

## 11. Workflow & Automation

### 11.1 Inventory Upload Workflow

**Mount:** `/api/workflow` | **Rate Limit:** `workflowLimiter` (300 req/15min)
**Source file:** `workflow.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/workflow/definition` | None | Full workflow step definitions + groups + document types |
| POST | `/api/workflow/next-step` | None | Get next visible step with resolved options |
| POST | `/api/workflow/previous-step` | None | Get previous visible step |
| POST | `/api/workflow/validate` | None | Validate a step's value |
| POST | `/api/workflow/options` | None | Get resolved dropdown options for a step |
| POST | `/api/workflow/visible-steps` | None | Get all visible steps for progress tracking |
| POST | `/api/workflow/summary` | None | Get human-readable summary of all answers |
| POST | `/api/workflow/commit` | None (optional JWT) | Commit workflow -- creates Contact + Owner + Inventory + Interaction |
| POST | `/api/workflow/upload-media` | JWT | Upload property images (up to 10, max 10MB each) |
| POST | `/api/workflow/upload-video` | JWT | Upload property videos (up to 3, max 50MB each) |
| POST | `/api/workflow/upload-document` | JWT | Upload document (single file, max 20MB) |

#### `POST /api/workflow/next-step`
- **Body:** `{ current_step_id: string | null, answers: {}, source? }`
- **Response:** `{ done: boolean, step?, options?, metadata? }`

#### `POST /api/workflow/commit`
- **Body:** `{ answers: {}, source: "web" | "admin" | "whatsapp" | "voice" }`
- **Response:** `201 { success, property_id, owner_id, ... }`

#### `POST /api/workflow/upload-media`
- **Content-Type:** `multipart/form-data`
- **Field:** `photos` (up to 10 images, jpeg/png/webp, max 10MB each)
- **Response:** `{ urls[], count, message }`
- **Note:** Content moderation runs asynchronously after response.

---

### 11.2 Workflow Automation (CRUD)

**Mount:** `/api` (via workflowAutomationRoutes) | **Rate Limit:** `apiLimiter`
**Middleware chain:** `authMiddleware` (from parent `/api` router)
**Source file:** `workflows.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/workflows` | JWT | List all workflows |
| GET | `/api/workflows/:id` | JWT | Get single workflow with recent executions |
| POST | `/api/workflows` | JWT | Create workflow |
| PATCH | `/api/workflows/:id` | JWT | Update workflow |
| POST | `/api/workflows/:id/toggle` | JWT | Toggle workflow enabled/disabled |
| DELETE | `/api/workflows/:id` | JWT | Delete workflow |
| GET | `/api/workflows/:id/executions` | JWT | Get workflow execution history |
| GET | `/api/workflows/:id/stats` | JWT | Get workflow statistics (by status, avg duration) |
| POST | `/api/workflows/:id/test` | JWT | Manual test trigger for a workflow |

#### `POST /api/workflows`
- **Body:** `{ name, description?, trigger, conditions?, actions[], delay_minutes?, priority?, max_executions_per_day?, enabled? }`
- **Response:** `201` Workflow object

#### `GET /api/workflows`
- **Query:** `enabled, trigger`
- **Response:** `{ workflows[], total }`

---

## 12. Marketing Campaigns

**Mount:** `/api` (via marketingRoutes) | **Rate Limit:** `apiLimiter`
**Middleware chain:** `authMiddleware` (from parent `/api` router)
**Source file:** `marketing.ts`

### 12.1 Campaign Templates

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/marketing/templates` | JWT | List all templates |
| GET | `/api/marketing/templates/:id` | JWT | Get single template with campaign usage |
| POST | `/api/marketing/templates` | JWT | Create template |
| PATCH | `/api/marketing/templates/:id` | JWT | Update template |
| DELETE | `/api/marketing/templates/:id` | JWT | Delete template |

#### `POST /api/marketing/templates`
- **Body:** `{ name, channel, category?, subject?, body, variables? }`
- **Response:** `201` Template object

### 12.2 Campaigns

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/marketing/campaigns` | JWT | List all campaigns |
| GET | `/api/marketing/campaigns/:id` | JWT | Get single campaign |
| POST | `/api/marketing/campaigns` | JWT | Create campaign |
| PATCH | `/api/marketing/campaigns/:id` | JWT | Update campaign |
| DELETE | `/api/marketing/campaigns/:id` | JWT | Delete campaign |
| GET | `/api/marketing/campaigns/:id/analytics` | JWT | Campaign analytics (delivery rate, response rate) |
| POST | `/api/marketing/campaigns/:id/test` | JWT | Send test campaign to specific contacts |
| POST | `/api/marketing/campaigns/:id/launch` | JWT | Launch campaign (draft -> sending/scheduled) |
| POST | `/api/marketing/campaigns/:id/toggle-pause` | JWT | Pause or resume a campaign |

#### `POST /api/marketing/campaigns`
- **Body:** `{ name, type?, channel, template_id?, audience?, message?, subject?, scheduled_at?, recurrence_rule?, ab_test_config? }`
- **Response:** `201` Campaign object

#### `POST /api/marketing/campaigns/:id/test`
- **Body:** `{ test_contacts: string[] }`
- **Response:** `{ success, message, campaign_name, test_contacts }`

### 12.3 Audience

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/marketing/audience/preview` | JWT | Preview audience count matching criteria |

#### `POST /api/marketing/audience/preview`
- **Body:** `{ audience: { contact_type?, lead_status?, lifecycle_stage?, lead_source?, assigned_to?, intent?, budget_min?, budget_max?, location? } }`
- **Response:** `{ total_count, sample_contacts[], criteria }`

---

## 13. Webhooks (WhatsApp, Voice)

**Mount:** `/webhooks` | **Rate Limit:** `webhookLimiter` (200 req/15min)
**Source file:** `webhooks.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/webhooks/whatsapp` | None (Meta signature) | WhatsApp incoming message webhook (async BullMQ processing) |
| GET | `/webhooks/whatsapp` | None | WhatsApp webhook verification (Meta challenge) |
| POST | `/webhooks/voice` | None | Voice call event webhook (Vapi) |

#### `POST /webhooks/whatsapp`
- **Body:** Meta WhatsApp Cloud API webhook payload
- **Response:** `200` (immediate, before processing)
- **Behavior:** Messages are deduplicated (Redis + in-memory), then queued via BullMQ for async processing. Falls back to synchronous processing if Redis/BullMQ unavailable.
- **Supported message types:** text, interactive replies, images, documents. Reactions/stickers/contacts/locations are skipped.

#### `GET /webhooks/whatsapp`
- **Query:** `hub.mode=subscribe, hub.verify_token=<token>, hub.challenge=<challenge>`
- **Response:** Returns challenge string if verify token matches `WHATSAPP_VERIFY_TOKEN`.

#### `POST /webhooks/voice`
- **Body:** Vapi call event payload
- **Response:** `200`

---

## 14. External Integrations (99Acres, MagicBricks, Housing.com)

### 14.1 Generic External Leads

**Mount:** `/external` | **Rate Limit:** `externalLimiter` (100 req/15min)
**Middleware chain:** `apiKeyAuth` (all routes require `x-api-key` header)
**Source file:** `external_leads.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/external/leads` | API Key | Generic lead ingestion from any external source |
| POST | `/external/leads/batch` | API Key | Batch lead ingestion (up to 50 at once) |
| GET | `/external/leads/status/:phone` | API Key | Check lead status by phone |

#### `POST /external/leads`
- **Body:** `{ source: "99acres"|"magicbricks"|"housing"|"website"|"manual"|"other", name?, phone, email?, property_interest?, location?, budget?, notes? }`
- **Response:** `201 { success, contact_id, contact_type, lead_status, message }`

#### `POST /external/leads/batch`
- **Body:** `{ source: string, leads: [{ phone, name?, email?, ... }] }`
- **Response:** `201 { success, failed, errors[] }`

#### `GET /external/leads/status/:phone`
- **Response:** `{ phone_number, name, contact_type, lead_status, source, last_interaction, lead_score }`

---

### 14.2 99Acres Integration

**Mount:** `/external/99acres` | **Rate Limit:** `externalLimiter`
**Middleware chain:** `apiKeyAuth`
**Source file:** `integrations/99acres.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/external/99acres/webhook` | API Key | 99acres lead webhook adapter |

#### `POST /external/99acres/webhook`
- **Body (99acres format):** `{ name, mobile, email?, project_name?, city?, locality?, budget?, requirement_type?, property_type?, bedrooms? }`
- **Response:** `201 { success, contact_id }`
- **Mapping:** `requirement_type` -> `intent`, `mobile` -> phone, `city+locality` -> location

---

### 14.3 MagicBricks Integration

**Mount:** `/external/magicbricks` | **Rate Limit:** `externalLimiter`
**Middleware chain:** `apiKeyAuth`
**Source file:** `integrations/magicbricks.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/external/magicbricks/webhook` | API Key | MagicBricks lead webhook adapter |

#### `POST /external/magicbricks/webhook`
- **Body (MagicBricks format):** `{ buyer_name, buyer_phone, buyer_email?, property_id?, city?, locality?, budget_range?, looking_for?, property_type? }`
- **Response:** `201 { success, contact_id }`
- **Mapping:** `looking_for` -> `intent`, `buyer_phone` -> phone, `budget_range` -> budget

---

### 14.4 Housing.com Integration

**Mount:** `/external/housing` | **Rate Limit:** `externalLimiter`
**Middleware chain:** `apiKeyAuth`
**Source file:** `integrations/housing.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/external/housing/webhook` | API Key | Housing.com lead webhook adapter |

#### `POST /external/housing/webhook`
- **Body (Housing.com format):** `{ lead_name, lead_phone, lead_email?, project?, location?, city?, configuration?, intent_type?, budget_min?, budget_max? }`
- **Response:** `201 { success, contact_id }`
- **Mapping:** `intent_type` -> `intent`, `lead_phone` -> phone

---

## 15. Builder Portal

**Mount:** `/builder` | **Rate Limit:** `agentLimiter` (30 req/15min)
**Middleware chain:** `authenticateBuilder` -> `requireBuilder` (per route)
**Source file:** `builder.ts`

### 15.1 Builder Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/builder/register` | None | Register new builder with owner creation |
| POST | `/builder/login-otp` | None | Send OTP to builder's phone |
| POST | `/builder/verify-otp` | None | Verify OTP and issue JWT (30-day expiry) |
| GET | `/builder/me` | Builder JWT | Get builder profile with permissions and stats |

#### `POST /builder/register`
- **Body:** `{ name, phone, email?, companyName?, planType? }`
- **Response:** `{ message, ownerId, planType }`

#### `POST /builder/verify-otp`
- **Body:** `{ phone, otp }`
- **Response:** `{ token, owner: { id, name, email, phone, planType, status } }`

---

### 15.2 Builder Projects

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/builder/projects` | Builder JWT | Create new project |
| GET | `/builder/projects` | Builder JWT | List builder's projects |
| GET | `/builder/projects/:id` | Builder JWT | Get single project with full details |
| PUT | `/builder/projects/:id` | Builder JWT | Update project details |
| PATCH | `/builder/projects/:id/activate` | Builder JWT | Activate project (DRAFT -> ACTIVE) |
| PATCH | `/builder/projects/:id/pause` | Builder JWT | Pause project (ACTIVE -> PAUSED) |

#### `POST /builder/projects`
- **Body:** `{ name, projectType, city, locality, googleMapLink?, reraNumber?, possessionDate?, projectStatus?, shortDescription, longDescription? }`
- **Response:** `201` Project object
- **Permission check:** `permissionEngine.canAddProject(ownerId)`

#### `PATCH /builder/projects/:id/activate`
- **Validation:** Must have at least 1 unit, 1 image, and RERA number.

---

### 15.3 Project Units

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/builder/projects/:projectId/units` | Builder JWT | Add unit configuration to project |
| PUT | `/builder/units/:unitId` | Builder JWT | Update unit details |
| DELETE | `/builder/units/:unitId` | Builder JWT | Soft delete unit |

#### `POST /builder/projects/:projectId/units`
- **Body:** `{ configuration, areaMin, areaMax?, areaUnit?, priceMin, priceMax?, priceUnit?, totalUnits?, availableUnits?, floorPlanUrl? }`
- **Response:** `201` Unit object

---

### 15.4 Project Media

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/builder/projects/:projectId/media` | Builder JWT | Upload project media (up to 10 files) |
| DELETE | `/builder/media/:mediaId` | Builder JWT | Delete project media |

#### `POST /builder/projects/:projectId/media`
- **Content-Type:** `multipart/form-data`
- **Field:** `files` (up to 10)
- **Body fields:** `mediaType (IMAGE|VIDEO|FLOOR_PLAN|BROCHURE|MASTER_PLAN), caption?`
- **Limits:** IMAGE: 20, VIDEO: 3, FLOOR_PLAN: 5, BROCHURE: 5, MASTER_PLAN: 2

---

### 15.5 Builder Leads

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/builder/leads` | Builder JWT | List leads for builder's projects (with data masking for FREE plan) |
| GET | `/builder/leads/:id` | Builder JWT | Get single lead with full details |
| PATCH | `/builder/leads/:id/status` | Builder JWT | Update lead status |

#### `GET /builder/leads`
- **Query:** `status, projectId, page, limit`
- **Response:** `{ leads[], total, page, limit }`
- **Note:** FREE plan users see masked phone/name/email via PermissionEngine.

---

### 15.6 Builder Appointments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/builder/appointments` | Builder JWT | List upcoming site visits |
| PATCH | `/builder/appointments/:id/status` | Builder JWT | Update appointment status |

---

### 15.7 Builder Dashboard

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/builder/dashboard/stats` | Builder JWT | Dashboard statistics (projects, leads, visits, conversions) |

#### `GET /builder/dashboard/stats`
- **Response:** `{ totalProjects, activeProjects, totalLeads, upcomingVisits, conversions, conversionRate, recentLeads[] }`

---

## 15b. Agent Portal

**Mount:** `/agent` | **Rate Limit:** `agentLimiter` (30 req/15min)
**Middleware chain:** `authenticateAgent` (per route, uses `AGENT_JWT_SECRET`)
**Source file:** `agent.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/agent/login-otp` | None | Request OTP for agent login |
| POST | `/agent/verify-otp` | None | Verify OTP and get JWT token (auto-registers if new) |
| POST | `/agent/register` | None | Register as partner agent |
| GET | `/agent/dashboard` | Agent JWT | Dashboard stats (listings, enquiries, visits) |
| GET | `/agent/inventory` | Agent JWT | List agent's inventory |
| GET | `/agent/leads` | Agent JWT | List leads with data masking (PermissionEngine) |
| GET | `/agent/appointments` | Agent JWT | List appointments with data masking |
| POST | `/agent/visits/:id/close` | Agent JWT | Close a deal (triggers commission) |

#### `POST /agent/verify-otp`
- **Body:** `{ phone, otp }` (MVP OTP: `1234`)
- **Response:** `{ token, agent: { id, name, package } }`

#### `POST /agent/visits/:id/close`
- **Body:** `{ dealValue: number }`
- **Response:** `{ success, commission }`

---

## 16. Notifications

**Mount:** `/api` (via notificationsRoutes) | **Rate Limit:** `apiLimiter`
**Source file:** `notifications.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/notifications/preferences` | JWT | Get notification preferences (returns defaults) |
| POST | `/api/notifications/preferences` | JWT | Update notification preferences |
| POST | `/api/notifications/test` | JWT | Send test notification via specified channel |

#### `GET /api/notifications/preferences`
- **Response:** `{ preferences: { whatsapp_enabled, email_enabled, voice_enabled, sms_enabled, new_lead_notification, appointment_reminder, task_due_reminder, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, daily_digest_enabled, ... } }`

#### `POST /api/notifications/test`
- **Body:** `{ channel: "whatsapp" | "email" | "sms" | "voice" }`
- **Response:** `{ success, message, channel, recipient }`

---

## 16b. Task Management

**Mount:** `/api` (via tasksRoutes) | **Rate Limit:** `apiLimiter`
**Source file:** `tasks.ts`

### Projects

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/tasks/projects` | JWT | List all work projects |
| GET | `/api/tasks/projects/:id` | JWT | Get single project with tasks |
| POST | `/api/tasks/projects` | JWT | Create project |
| PATCH | `/api/tasks/projects/:id` | JWT | Update project |
| DELETE | `/api/tasks/projects/:id` | JWT | Delete project |

### Tasks

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/tasks/tasks` | JWT | List tasks (Kanban/calendar view) |
| GET | `/api/tasks/tasks/:id` | JWT | Get single task |
| POST | `/api/tasks/tasks` | JWT | Create task |
| PATCH | `/api/tasks/tasks/:id` | JWT | Update task (Kanban drag-and-drop) |
| DELETE | `/api/tasks/tasks/:id` | JWT | Delete task |
| POST | `/api/tasks/tasks/bulk-import` | JWT | Bulk create tasks from CSV data |
| GET | `/api/tasks/tasks/stats/summary` | JWT | Task statistics for dashboard |

#### `GET /api/tasks/tasks`
- **Query:** `project_id, assigned_to, status, priority, contact_phone, tag, due_before, due_after, view (calendar)`
- **Response:** `{ tasks[], total }`

#### `POST /api/tasks/tasks`
- **Body:** `{ project_id?, title, description?, assigned_to, due_date, priority?, status?, contact_phone?, property_id?, tags? }`
- **Response:** `201` Task object

#### `GET /api/tasks/tasks/stats/summary`
- **Query:** `assigned_to?`
- **Response:** `{ total, by_status: { TODO, IN_PROGRESS, DONE, BLOCKED }, overdue, high_priority, completion_rate }`

---

## 17. Health Check & System

**Mount:** `/health`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Health check endpoint |

#### `GET /health`
- **Response:** `200 OK` (or system health JSON depending on implementation)

---

## Appendix: Route File to Mount Point Mapping

| Source File | Export Name | Mount Point |
|-------------|------------|-------------|
| `routes/auth.ts` | `authRoutes` | `/auth` |
| `routes/user_auth.ts` | `userAuthRoutes` | `/user` |
| `routes/webhooks.ts` | `webhookRoutes` | `/webhooks` |
| `routes/public.ts` | `publicRoutes` | `/public` |
| `routes/ai_chat.ts` | `aiChatRoutes` | `/public` |
| `routes/classification.ts` | `classificationRoutes` | `/public` |
| `routes/auth_otp.ts` | `authOTPRoutes` | `/public/auth` |
| `routes/master.ts` | `masterRoutes` | `/public/master` |
| `routes/workflow.ts` | `workflowRoutes` | `/api/workflow` |
| `routes/agent.ts` | `agentRoutes` | `/agent` |
| `routes/builder.ts` | `builderRoutes` | `/builder` |
| `routes/external_leads.ts` | `externalLeadRoutes` | `/external` |
| `integrations/99acres.ts` | `nineNineAcresRoutes` | `/external/99acres` |
| `integrations/magicbricks.ts` | `magicBricksRoutes` | `/external/magicbricks` |
| `integrations/housing.ts` | `housingRoutes` | `/external/housing` |
| `routes/api.ts` | `apiRoutes` | `/api` |
| `routes/leads.ts` | `leadRoutes` | `/api` |
| `routes/staff_calls.ts` | `staffCallRoutes` | `/api` |
| `routes/calendar.ts` | `calendarRoutes` | `/api` |
| `routes/email.ts` | `emailRoutes` | `/api` |
| `routes/team.ts` | `teamRoutes` | `/api` |
| `routes/agent_dashboard.ts` | `agentDashboardRoutes` | `/api` |
| `routes/transactions.ts` | `transactionRoutes` | `/api` |
| `routes/analytics.ts` | `analyticsRoutes` | `/api` |
| `routes/reports.ts` | `reportsRoutes` | `/api` |
| `routes/workflows.ts` | `workflowAutomationRoutes` | `/api` |
| `routes/marketing.ts` | `marketingRoutes` | `/api` |
| `routes/notifications.ts` | `notificationsRoutes` | `/api` |
| `routes/tasks.ts` | `tasksRoutes` | `/api` |
| `routes/inventory.ts` | `inventoryRouter` | `/inventory` and `/api/inventory` |
