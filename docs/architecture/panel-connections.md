# Panel Connections - Reality Pandit

Complete architecture documentation showing how every panel, portal, and integration connects through the unified backend API.

---

## 1. System Architecture Overview

Three frontend applications, two external portals, and multiple integration channels all converge on a single Express.js backend API.

```
+---------------------------+     +---------------------------+     +---------------------------+
|    Admin Dashboard        |     |    Public Website         |     |    Agent Portal (Mobile)  |
|    React + Vite           |     |    Next.js                |     |    Android App            |
|    :5173                  |     |    :3000                  |     |                           |
+------------+--------------+     +------------+--------------+     +------------+--------------+
             |                                 |                                 |
             | JWT (Bearer)                    | Public / Cookie                  | Agent JWT
             |                                 |                                 |
             +----v----------------------------v---------------------------------v----+
             |                                                                        |
             |                    Backend API (Express.js)                             |
             |                    https://api.realtypandit.in:7071                     |
             |                                                                        |
             +----^----------------------------^---------------------------------^----+
             |                                 |                                 |
             | X-API-Key                       | Meta Cloud API                  | Builder JWT
             |                                 | Webhook                         |
+------------+--------------+     +------------+--------------+     +------------+--------------+
|  External Portals         |     |  WhatsApp Bot             |     |  Builder Portal           |
|  99Acres / MagicBricks    |     |  Meta Cloud API           |     |  OTP + JWT Auth           |
|  Housing.com              |     |  BullMQ Queue             |     |  Project Management       |
+---------------------------+     +---------------------------+     +---------------------------+
```

### Application URLs

| Application | Technology | Production URL | Dev URL |
|-------------|-----------|----------------|---------|
| Admin Dashboard | React + Vite | `https://admin.realtypandit.in` | `http://localhost:5173` |
| Public Website | Next.js | `https://realtypandit.in` | `http://localhost:3000` |
| Backend API | Express.js + Prisma | `https://api.realtypandit.in:7071` | `http://localhost:7071` |
| WhatsApp Bot | Meta Cloud API webhooks | N/A (inbound only) | N/A |
| Android App | Native | N/A | N/A |
| API Documentation | Swagger UI | `https://api.realtypandit.in:7071/api-docs` | `http://localhost:7071/api-docs` |

---

## 2. Role-Based Access Control (RBAC) Matrix

### 2.1 Internal Roles (Admin Dashboard)

| Feature Area | super_boss | manager | employee |
|-------------|-----------|---------|----------|
| Dashboard | Full access | Full access | View own stats |
| Contacts/Leads | All contacts | Own + subordinates | Own assigned only |
| Inventory | Full CRUD + Delete | Full CRUD (no delete) | View + Edit |
| Reports | All 8 categories (26 endpoints) | Team reports | Self reports only |
| Team Management | Manage all agents | Manage own team | View only |
| Settings | Full system settings | Limited | None |
| Email (Panditji AI) | Full control | No access | No access |
| Transactions | Full manage + view | Full manage + view | View only |
| Bulk Upload | Yes | Yes | No |
| Agent Dashboard | Full monitoring | Full monitoring | No access |

### 2.2 Permission Strings

Defined in `agents/backend/src/config/permissions.ts`:

```
super_boss:
  view_all_leads, assign_leads, view_reports, manage_agents, create_agents,
  manage_team, view_inventory, edit_inventory, delete_inventory,
  manage_settings, view_all_tenants, bulk_upload, manage_email,
  manage_transactions, view_transactions

manager:
  view_all_leads, assign_leads, view_reports, manage_agents, create_agents,
  manage_team, view_inventory, edit_inventory, bulk_upload,
  manage_transactions, view_transactions

employee:
  view_assigned_leads, update_lead_status, view_inventory, edit_inventory,
  view_transactions
```

### 2.3 External Roles

| Role | Portal | Auth Method | Data Masking |
|------|--------|-------------|-------------|
| Partner Agent | Agent Portal (`/agent/*`) | Phone OTP -> Agent JWT (7d) | Phone/name masked based on plan |
| Builder | Builder Portal (`/builder/*`) | Phone OTP -> Builder JWT (30d) | Phone/name masked on FREE plan |
| Website User | Public Website (`/user/*`) | Phone OTP -> User JWT | No masking (own data only) |
| External System | API Integration (`/external/*`) | X-API-Key header | N/A |

---

## 3. Data Flow Diagrams

### Flow 1: WhatsApp Message -> AI Agent -> Admin Dashboard

```
WhatsApp User sends message
    |
    v
Meta Cloud API delivers webhook
    |
    v
POST /webhooks/whatsapp
    |-- Respond 200 IMMEDIATELY (Meta 5-second deadline)
    |-- Message ID dedup (Redis key `msg_dedup:{id}`, TTL=120s)
    |-- In-memory Set fallback if Redis unavailable
    |
    v
BullMQ Queue (whatsappInboundQueue)
    |-- jobId = messageId (natural BullMQ dedup)
    |-- Fallback: synchronous processing if Redis/BullMQ down
    |
    v
webhook_processor.processInboundMessage()
    |
    v
MessageRouter.route(contact, message, channel)
    |
    |-- 1. Security: Rate limit check (SecurityAgent)
    |-- 2. For UNKNOWN contacts: Single LLM call (classifyFull)
    |       -> Classifies contact_type + domain_intent + language
    |       -> Saves ~66% Gemini API calls vs separate calls
    |-- 3. Session management (Redis SessionStore)
    |       -> Get/create session with workflow state
    |-- 4. Domain intent classification
    |       -> PROPERTY, LEGAL, LOAN, SERVICE, APPOINTMENT, GENERAL
    |       -> Keyword shortcut for BUYER_TENANT / SELLER_LANDLORD
    |-- 5. Role context detection (DEMAND / SUPPLY / INTERNAL)
    |-- 6. Transaction-aware routing
    |
    v
Agent Selection (selectAgent):
    |-- UNKNOWN          -> ClassifierAgent (identify first)
    |-- INTERNAL         -> AdminAgent (commands, reports)
    |-- DEMAND           -> SalesAgent (default)
    |                    -> CoordinationAgent (if APPOINTMENT intent or VISIT_SCHEDULED)
    |-- SUPPLY           -> SalesAgent (SELLER_LANDLORD individual owners)
    |                    -> PartnerAgent (PARTNER_AGENT, REAL_ESTATE_BUILDER)
    |                    -> CoordinationAgent (if APPOINTMENT intent)
    |
    v
Agent.handle(context) -> AgentResponse
    |
    |-- reply_script: Text to send back to user
    |-- metadata: Contact field updates (lead_status, lifecycle_stage, etc.)
    |-- contact_type: Re-classification result (if UNKNOWN -> identified)
    |-- next_state: Session state transition
    |
    v
Post-processing:
    |-- Apply metadata updates to Contact record
    |-- Update session state
    |-- If re-classified: update contact_type in DB, reset session
    |-- Log to AgentActionLog (fire-and-forget)
    |-- QA Agent post-hook (20% sample rate, async)
    |
    v
WhatsApp response sent back via Meta Cloud API
    |
    v
Admin sees in:
    |-- Chats panel (conversation history via Interaction table)
    |-- Dashboard (updated lead counts, pipeline stats)
    |-- Contacts (updated contact_type, lead_status, lifecycle_stage)
    |-- Agent Dashboard (AgentActionLog metrics, QA flags)
```

### Flow 2: Website Lead -> Admin Dashboard

```
Website Visitor arrives at realtypandit.in
    |
    +-- Browse Properties
    |   GET /public/properties (paginated, filtered)
    |   GET /public/properties/:id (detail)
    |   GET /public/featured-properties
    |   GET /public/similar-properties/:id
    |
    +-- AI Chat (Panditji)
    |   POST /public/ai-chat
    |       -> ChatHandler.processMessage()
    |       -> Search Inventory DB by filters
    |       -> Build system prompt with property context
    |       -> Gemini AI generates response
    |       -> Detect action (request_phone / book_visit)
    |       -> Return reply + matching properties
    |
    +-- Book Visit (from AI Chat)
    |   POST /public/ai-chat/book-visit
    |       -> ChatHandler.handleBooking()
    |       -> Normalize phone, parse date/time
    |       -> Find/create Contact (source: website_chat)
    |       -> Create ScheduledVisit record
    |       -> Create Calendar Appointment
    |       -> Log Interaction
    |       -> WhatsApp notifications:
    |           1. Customer: Visit confirmation
    |           2. Assigned Agent: New lead alert
    |           3. Key Holder: Visit notification
    |           4. Management: Alert if property >= 1 Crore
    |       -> Create ConversationSession for WhatsApp continuation
    |       -> Send WhatsApp continuation invite template
    |
    +-- Contact Form
    |   POST /public/contact
    |       -> Create Contact record
    |       -> Log Interaction
    |
    +-- Lead Capture
    |   POST /public/lead
    |       -> Create/update Contact with source, page_url, user_agent
    |
    +-- Schedule Visit (Direct Form)
    |   POST /public/schedule-visit
    |       -> Create ScheduledVisit
    |
    +-- Newsletter
    |   POST /public/newsletter
    |       -> Subscribe email
    |
    +-- Post Property (Website Workflow)
    |   POST /public/post-property
    |       -> Optional Agent JWT auth
    |       -> Create Inventory record via unified workflow
    |
    +-- Project Enquiry (Builder Projects)
    |   POST /public/project-enquiry
    |       -> Create BuilderLead for project
    |
    v
Admin Dashboard sees:
    |-- Dashboard: New lead counts, source analytics
    |-- Contacts: New contacts with source='website_chat' or 'website'
    |-- Calendar: Scheduled visits with preferred date/time
    |-- Agent Dashboard: AI Chat interaction logs
```

### Flow 3: External Portal Lead -> System

```
99Acres / MagicBricks / Housing.com
    |
    v
POST /external/{provider}/webhook
    |-- Provider-specific routes:
    |   /external/99acres/*
    |   /external/magicbricks/*
    |   /external/housing/*
    |
    |-- Generic external lead route:
    |   /external/* (externalLeadRoutes)
    |
    |-- Authentication: X-API-Key header validation
    |-- Rate limit: 100 requests per 15 minutes
    |
    v
Field Mapping (provider-specific):
    |-- Map provider fields -> Contact model
    |-- Normalize phone numbers
    |-- Map property types to internal taxonomy
    |
    v
Contact Upsert:
    |-- source = '{provider}' (e.g., '99acres', 'magicbricks', 'housing')
    |-- contact_type = 'BUYER_TENANT'
    |-- Preserve existing data on upsert
    |
    v
Interaction Log:
    |-- channel = '{provider}'
    |-- event_type = 'external_lead'
    |
    v
Admin sees in:
    |-- Contacts panel (filtered by source)
    |-- Dashboard (lead source analytics)
    |-- Reports: Lead source breakdown
```

### Flow 4: Agent Portal Flow

```
External Agent (Broker/Dealer)
    |
    +-- Registration
    |   POST /agent/register
    |       -> Create Contact (type: PARTNER_AGENT)
    |       -> Create PartnerAgent record
    |       -> package_type: FREE (default)
    |
    +-- Authentication
    |   POST /agent/login-otp
    |       -> Send OTP to phone (WhatsApp/SMS)
    |   POST /agent/verify-otp
    |       -> Verify OTP (MVP: fixed '1234')
    |       -> Auto-register if not exists
    |       -> Return Agent JWT (7 days, signed with AGENT_JWT_SECRET)
    |
    +-- Dashboard (Authenticated)
    |   GET /agent/dashboard
    |       -> authenticateAgent middleware
    |       -> Agent -> Owner -> Inventory lookup chain
    |       -> Return: activeListings, totalEnquiries, visitsScheduled, conversionRate
    |
    +-- Inventory
    |   GET /agent/inventory
    |       -> Agent -> Owner -> list owned Inventory items
    |
    +-- Leads (Data Masking Applied)
    |   GET /agent/leads
    |       -> PermissionEngine.getDataMaskingRules(ownerId)
    |       -> FREE plan: phone/name masked (e.g., 98XX-XXX-789)
    |       -> PAID plan: full data visible
    |
    +-- Appointments (Data Masking Applied)
    |   GET /agent/appointments
    |       -> Same masking logic as leads
    |
    +-- Close Deal
    |   POST /agent/visits/:id/close
    |       -> Mark visit as completed
    |       -> CommissionService.processDealClosure()
    |       -> Calculate and record commission
    |
    v
Admin sees in:
    |-- Partners panel: Agent registration, verification status
    |-- Commissions: Deal closure and commission records
    |-- Contacts: Partner interactions
```

### Flow 5: Builder Portal Flow

```
Builder (Real Estate Developer)
    |
    +-- Registration
    |   POST /builder/register
    |       -> Create Owner (scope: EXTERNAL, type: REAL_ESTATE_BUILDER)
    |       -> Create Contact and Subscription records
    |       -> Default plan: FREE
    |
    +-- Authentication
    |   POST /builder/login-otp
    |       -> Verify builder exists (type check)
    |   POST /builder/verify-otp
    |       -> Verify OTP (MVP: fixed '1234')
    |       -> Return Builder JWT (30 days, signed with BUILDER_JWT_SECRET)
    |       -> Token payload: { ownerId, scope, externalType, planType, phone }
    |
    +-- Profile
    |   GET /builder/me
    |       -> authenticateBuilder + requireBuilder middleware
    |       -> Return profile, subscription, permissions, stats
    |
    +-- Project Management (CRUD)
    |   POST /builder/projects          -> Create project (checks canAddProject permission)
    |   GET  /builder/projects          -> List own projects (paginated)
    |   GET  /builder/projects/:id      -> Get project detail (ownership verified)
    |   PUT  /builder/projects/:id      -> Update project
    |   PATCH /builder/projects/:id/activate -> Activate (requires: 1+ unit, 1+ image, RERA)
    |   PATCH /builder/projects/:id/pause   -> Pause project
    |
    +-- Unit Management
    |   POST /builder/projects/:id/units    -> Add unit configuration
    |   PUT  /builder/units/:id             -> Update unit
    |   DELETE /builder/units/:id           -> Soft delete (is_active=false)
    |
    +-- Media Management (Local File Storage)
    |   POST /builder/projects/:id/media    -> Upload (multer, max 10 files)
    |       Limits: IMAGE=20, VIDEO=3, FLOOR_PLAN=5, BROCHURE=5, MASTER_PLAN=2
    |   DELETE /builder/media/:id           -> Delete file + DB record
    |
    +-- Lead Management (Data Masking Applied)
    |   GET /builder/leads              -> List leads (masking on FREE plan)
    |   GET /builder/leads/:id          -> Lead detail with interaction history
    |   PATCH /builder/leads/:id/status -> Update lead status
    |
    +-- Appointments
    |   GET /builder/appointments               -> List site visits
    |   PATCH /builder/appointments/:id/status  -> Update appointment status
    |
    +-- Dashboard
    |   GET /builder/dashboard/stats
    |       -> activeProjects, totalLeads, upcomingVisits, conversions
    |       -> conversionRate calculation
    |       -> recentLeads (5 most recent, masked if FREE)
    |
    v
Public Website shows:
    |-- /public/projects (paginated listings)
    |-- /public/projects/:id (project detail)
    |-- /public/featured-projects
    |-- /public/similar-projects
    |-- /public/matches (unified resale + project search)
    |
Admin sees in:
    |-- Projects panel: All builder projects
    |-- Contacts: Builder contacts and interactions
```

### Flow 6: Property Lifecycle (Cross-Panel)

```
Property Added (from ANY source):
    |-- Admin Dashboard: Manual add via /api/inventory
    |-- Admin Dashboard: Unified Workflow (/api/workflow/commit)
    |-- WhatsApp: Bot collects details via conversation (SalesAgent/PartnerAgent)
    |-- Website: Post Property form (/public/post-property)
    |-- Website: Unified Workflow (/api/workflow/commit)
    |-- Agent Portal: Via owner inventory link
    |-- Bulk Upload: CSV via /api/team/inventory/bulk-template
    |
    v
Inventory Table (status: active)
    |-- Fields: type, category, specs, features, location, price, intent
    |-- Classification: category_id, sub_category_id, type_id, configuration_id
    |-- Media: media_urls[], video_urls[], documents[]
    |-- Owner link: owner_id -> Owner -> Contact
    |
    v
Matching Engine:
    |-- Find contacts with matching: location, budget, property_type, intent
    |-- Website: /public/matches (unified resale + project search)
    |
    v
Lead Engagement:
    |-- Website AI Chat recommends matching properties
    |-- WhatsApp bot suggests properties to matching buyers
    |-- Admin manually assigns leads
    |
    v
Visit Scheduled:
    |-- ScheduledVisit record created
    |-- Calendar Appointment created
    |-- Notifications sent (Customer, Agent, Key Holder, Management)
    |
    v
Transaction Created:
    |-- Status flow: NEW -> MATCHED -> VISITED -> NEGOTIATION -> CLOSED_WON
    |-- Alternative: CLOSED_LOST at any stage
    |-- Commission calculated on CLOSED_WON
    |
    v
All Panels Updated:
    |-- Admin: Transaction pipeline, commission records, reports
    |-- Agent Portal: Visit completion, deal closure
    |-- Builder Portal: Lead status updates
    |-- Website: Property status changes (sold/rented -> removed from search)
```

### Flow 7: Website Chat -> WhatsApp Continuation (Cross-Channel)

```
Website Visitor uses AI Chat
    |
    v
POST /public/ai-chat
    -> ChatHandler processes, returns properties
    |
    v
Visitor provides phone number (action: book_visit)
    |
    v
POST /public/ai-chat/book-visit
    |-- Create Contact (source: website_chat)
    |-- Create ScheduledVisit
    |-- Create ConversationSession:
    |     { phone, workflow: 'buyer', state: 'PROPERTY_SEARCH',
    |       context: { source: 'website_chat', invitedToWhatsApp: true } }
    |-- Send WhatsApp template: rp_whatsapp_invite
    |-- Log Interaction (channel: whatsapp, event: continuation_invite)
    |
    v
User receives WhatsApp message, replies
    |
    v
POST /webhooks/whatsapp
    -> BullMQ queue
    -> MessageRouter.route(contact, message, 'whatsapp', conversationContext)
    |
    |-- ConversationSession detected (source: website_chat)
    |-- Session loaded with website chat context
    |-- ChatHandler.loadChatHistory() provides cross-channel context
    |-- Agent continues conversation with full history
    |
    v
Seamless conversation continues on WhatsApp
with full context from website chat session
```

---

## 4. CORS Configuration

Defined in `agents/backend/src/app.ts` (lines 69-97).

### Allowed Origins (Strict Whitelist)

| Origin | Purpose |
|--------|---------|
| `http://localhost:3001` | Local dev (alternate) |
| `http://localhost:5173` | Local dev (Admin Dashboard - Vite) |
| `http://localhost:3000` | Local dev (Website - Next.js) |
| `http://localhost:7575` | Local dev (alternate service) |
| `http://localhost:7071` | Local dev (API self-reference) |
| `https://admin.realtypandit.in` | Production Admin Dashboard |
| `http://admin.realtypandit.in` | Production Admin Dashboard (HTTP) |
| `https://realtypandit.in` | Production Website |
| `http://realtypandit.in` | Production Website (HTTP) |
| `http://72.62.231.224:5173` | Production Admin IP (direct) |
| `http://72.62.231.224:3000` | Production Website IP (direct) |

### CORS Configuration Details

```
Credentials: true
Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Allowed Headers: Content-Type, Authorization, X-API-Key
No-Origin Requests: Allowed (mobile apps, curl, server-to-server)
Override: ALLOWED_ORIGINS env variable (comma-separated)
```

---

## 5. Authentication Flows

### 5.1 Admin Dashboard (Internal Staff)

```
Source: agents/backend/src/services/auth.ts
        agents/backend/src/middleware/auth.ts
        agents/frontend/src/contexts/AuthContext.tsx
        agents/frontend/src/api/client.ts

Login Flow:
    POST /auth/login { phone, password }
        -> AuthService.loginByPhone()
        -> bcrypt.compare(password, password_hash)
        -> Check agent.status !== 'inactive'
        -> Generate JWT (24h):
            Payload: { id, email, role, tenant_id }
            Secret: JWT_SECRET
        -> Generate Refresh Token (7d):
            Payload: { id }
            Secret: JWT_SECRET
        -> Save refresh_token to Agent record
        -> Return: { token, refreshToken, agent }

Frontend Storage:
    localStorage.setItem('token', token)
    localStorage.setItem('refreshToken', refreshToken)
    axios defaults: Authorization = Bearer {token}

Session Validation:
    GET /auth/me
        -> authMiddleware: Extract Bearer token
        -> jwt.verify(token, JWT_SECRET)
        -> req.agent = { id, email, role, tenant_id }
        -> Return agent profile with permissions

Token Refresh:
    POST /auth/refresh { refreshToken }
        -> Verify refresh token
        -> Check agent.refresh_token matches
        -> Generate new JWT (24h)
        -> Return: { token }

Permission Check (Middleware):
    authMiddleware -> requireRole('super_boss', 'manager')
    authMiddleware -> checkPermission('view_all_leads')

First-Time Setup:
    POST /auth/setup { name, email, password }
        -> For initial super_boss account creation
    POST /auth/setup-password { token, password }
        -> Team member sets password via setup link
    POST /auth/resend-otp { phone }
        -> Resend setup/login OTP
```

### 5.2 Agent Portal (External Brokers)

```
Source: agents/backend/src/routes/agent.ts

Login Flow:
    POST /agent/login-otp { phone }
        -> Send OTP via WhatsApp/SMS
    POST /agent/verify-otp { phone, otp }
        -> Verify OTP (MVP: fixed '1234')
        -> Find/create PartnerAgent record
        -> Auto-register as FREE if not exists
        -> Generate Agent JWT (7 days):
            Payload: { id, phone }
            Secret: AGENT_JWT_SECRET (separate from admin JWT_SECRET)
        -> Return: { token, agent: { id, name, package } }

Auth Middleware:
    authenticateAgent: Extract Bearer token, verify with AGENT_JWT_SECRET
    req.agentId = decoded.id

Data Masking:
    PermissionEngine checks owner's plan (FREE vs PAID)
    FREE plan: maskPhone('9876543210') -> '98XX-XXX-210'
    FREE plan: maskName('Rahul Sharma') -> 'R***l S****a'
```

### 5.3 Builder Portal

```
Source: agents/backend/src/routes/builder.ts

Registration:
    POST /builder/register { name, phone, email, companyName, planType }
        -> Create Owner (scope: EXTERNAL, type: REAL_ESTATE_BUILDER)
        -> Create Contact, Subscription
        -> Default: FREE plan

Login Flow:
    POST /builder/login-otp { phone }
        -> Verify builder exists and type = REAL_ESTATE_BUILDER
    POST /builder/verify-otp { phone, otp }
        -> Verify OTP (MVP: fixed '1234')
        -> Generate Builder JWT (30 days):
            Payload: { ownerId, scope, externalType, planType, phone }
            Secret: BUILDER_JWT_SECRET (fallback: AGENT_JWT_SECRET)
        -> Return: { token, owner: { id, name, email, phone, planType, status } }

Auth Middleware (Two-Layer):
    1. authenticateBuilder: Verify JWT, extract ownerId
    2. requireBuilder: Check scope=EXTERNAL && externalType=REAL_ESTATE_BUILDER

Data Masking:
    Same PermissionEngine as Agent Portal
    FREE plan: masked phone/name/email on leads
```

### 5.4 Website User Authentication

```
Source: agents/website/src/lib/api.ts

Login Flow:
    POST /user/login-otp { phone }
        -> Send OTP to user's phone
    POST /user/verify-otp { phone, otp }
        -> Verify OTP
        -> Return: { token, user }

Profile:
    GET /user/me (Authorization: Bearer {token})
        -> Return: user, savedSearches, scheduledVisits, recentActivity

Logout:
    POST /user/logout (Authorization: Bearer {token})
```

### 5.5 Website Chat OTP Authentication

```
Mounted at: /public/auth (authOTPRoutes)
Used for: OTP-based auth during website chat conversations
Allows anonymous chat users to verify their phone number
```

### 5.6 External Integrations

```
Authentication: X-API-Key header
Mounted at: /external/*
Validated per-request against stored API keys
Rate limited: 100 requests per 15 minutes
```

### 5.7 JWT Secret Separation

| Secret | Used By | Lifetime |
|--------|---------|----------|
| `JWT_SECRET` | Admin Dashboard (staff) | Access: 24h, Refresh: 7d |
| `AGENT_JWT_SECRET` | Agent Portal | 7 days |
| `BUILDER_JWT_SECRET` | Builder Portal (fallback: `AGENT_JWT_SECRET`) | 30 days |

---

## 6. Rate Limiting

Defined in `agents/backend/src/middleware/rate_limit.ts`. All limits are per IP, per 15-minute window.

| Limiter | Routes | Max Requests / 15min | Notes |
|---------|--------|---------------------|-------|
| `authLimiter` | `/auth/*` | 100 | Skips `/me` and `/refresh` |
| `publicLimiter` | `/public/*`, `/user/*` | 50 | Website visitors |
| `webhookLimiter` | `/webhooks/*` | 200 | WhatsApp high-traffic |
| `externalLimiter` | `/external/*` | 100 | 99Acres, MagicBricks, Housing |
| `agentLimiter` | `/agent/*`, `/builder/*` | 30 | External portals |
| `apiLimiter` | `/api/*` | 100 | Admin dashboard staff |
| `workflowLimiter` | `/api/workflow/*` | 300 | High volume: ~2 calls per step x 30+ steps |

---

## 7. Route Mounting Map

Complete route tree from `agents/backend/src/app.ts`:

### Public Routes (No Auth Required)

| Mount Path | Route Module | Rate Limiter | Purpose |
|-----------|-------------|-------------|---------|
| `/auth` | authRoutes | authLimiter | Admin login, setup, refresh |
| `/user` | userAuthRoutes | publicLimiter | Customer user auth (OTP) |
| `/webhooks` | webhookRoutes | webhookLimiter | WhatsApp + Voice webhooks |
| `/public` | publicRoutes | publicLimiter | Properties, stats, forms, leads |
| `/public` | aiChatRoutes | publicLimiter | AI Chat for property search |
| `/public/auth` | authOTPRoutes | authLimiter | Website chat OTP auth |
| `/public/master` | masterRoutes | publicLimiter | Classification tree, geo data |
| `/public` | classificationRoutes | publicLimiter | Property classification API |
| `/api/workflow` | workflowRoutes | workflowLimiter | Unified inventory workflow |

### Agent Routes (Agent JWT Auth)

| Mount Path | Route Module | Rate Limiter | Purpose |
|-----------|-------------|-------------|---------|
| `/agent` | agentRoutes | agentLimiter | Agent portal (OTP, dashboard, inventory, leads) |

### Builder Routes (Builder JWT Auth)

| Mount Path | Route Module | Rate Limiter | Purpose |
|-----------|-------------|-------------|---------|
| `/builder` | builderRoutes | agentLimiter | Builder portal (projects, units, media, leads) |

### External Integration Routes (API Key Auth)

| Mount Path | Route Module | Rate Limiter | Purpose |
|-----------|-------------|-------------|---------|
| `/external` | externalLeadRoutes | externalLimiter | Generic external lead intake |
| `/external/99acres` | nineNineAcresRoutes | externalLimiter | 99Acres integration |
| `/external/magicbricks` | magicBricksRoutes | externalLimiter | MagicBricks integration |
| `/external/housing` | housingRoutes | externalLimiter | Housing.com integration |

### Admin API Routes (JWT Auth Required)

| Mount Path | Route Module | Rate Limiter | Purpose |
|-----------|-------------|-------------|---------|
| `/api` | apiRoutes | apiLimiter | Core API (contacts, etc.) |
| `/api/leads` | leadRoutes | apiLimiter | Lead management |
| `/api/calls` | staffCallRoutes | apiLimiter | Staff call intelligence |
| `/api/calendar` | calendarRoutes | apiLimiter | Calendar system |
| `/api/email` | emailRoutes | apiLimiter | Email system (Panditji AI) |
| `/api/team` | teamRoutes | apiLimiter | Team management + bulk upload |
| `/api/agent-dashboard` | agentDashboardRoutes | apiLimiter | Multi-agent monitoring |
| `/api/transactions` | transactionRoutes | apiLimiter | Transaction engine |
| `/api/analytics` | analyticsRoutes | apiLimiter | Dashboard visualizations |
| `/api/reports` | reportsRoutes | apiLimiter | 8 categories, 26 endpoints |
| `/api/workflows` | workflowAutomationRoutes | apiLimiter | Workflow automation (Phase 3.1) |
| `/api/marketing` | marketingRoutes | apiLimiter | Marketing campaigns (Phase 3.2) |
| `/api/notifications` | notificationsRoutes | apiLimiter | Notification preferences (Phase 4.2) |
| `/api` | tasksRoutes | apiLimiter | Tasks + Projects (Phase 3.3) |
| `/inventory` | inventoryRouter | apiLimiter | Inventory CRUD |
| `/api/inventory` | inventoryRouter | apiLimiter | Inventory CRUD (admin proxy) |

### Utility Routes

| Path | Purpose |
|------|---------|
| `/` | Secure API landing page (HTML) |
| `/health` | Health check (DB, Redis, circuits, memory, queues) |
| `/api-docs` | Swagger UI documentation |
| `/uploads/*` | Static file serving for property media |

---

## 8. Real-Time Data Sharing (Cross-Panel)

How data created in one panel appears in others.

### 8.1 Contact Record (Central Entity)

Every panel creates or reads from the same `Contact` table:

| Source Panel | Creates Contact Via | contact_type | source Field |
|-------------|-------------------|-------------|-------------|
| WhatsApp Bot | Webhook processor | UNKNOWN (then classified) | whatsapp |
| Website AI Chat | POST /public/ai-chat/book-visit | BUYER_TENANT | website_chat |
| Website Form | POST /public/contact | BUYER_TENANT | website |
| Website Lead | POST /public/lead | BUYER_TENANT | website |
| Agent Portal | POST /agent/register | PARTNER_AGENT | agent_registration / agent_portal_auto_reg |
| Builder Portal | POST /builder/register | (via Owner) | builder_portal |
| External Portal | POST /external/* | BUYER_TENANT | 99acres / magicbricks / housing |
| Admin Dashboard | POST /api/contacts | Any | admin |

### 8.2 Interaction Log (Shared Timeline)

All channels log to the same `Interaction` table:

| Channel Value | Source | Event Types |
|--------------|--------|-------------|
| whatsapp | WhatsApp Bot | message, response, continuation_invite |
| website_chat | Website AI Chat | ai_chat, schedule_visit |
| website | Website Forms | contact_form, lead_form |
| builder_portal | Builder Portal | status_update |
| admin | Admin Dashboard | manual_note, assignment |
| phone | Staff Calls | call_log |
| email | Email System | email_sent, email_received |

### 8.3 Inventory (Shared Property Pool)

Properties are visible across panels based on status:

| Panel | Can See | Can Create | Can Edit | Can Delete |
|-------|---------|-----------|---------|-----------|
| Admin Dashboard | All properties | Yes (workflow or direct) | Yes | super_boss only |
| Public Website | Active properties only | Via post-property form | No | No |
| WhatsApp Bot | Active (for search/recommendation) | Via conversation flow | No | No |
| Agent Portal | Own properties only | Via owner link | No | No |
| Builder Portal | Own projects only | Via project CRUD | Own only | Own only (soft) |

### 8.4 Notifications (Cross-Channel)

When a visit is booked from ANY source, notifications fan out:

```
Visit Booked
    |
    +-> Customer: WhatsApp confirmation
    +-> Assigned Agent: WhatsApp template (rp_visit_agent_notify)
    +-> Key Holder: WhatsApp template (rp_visit_keyholder)
    +-> Management: WhatsApp alert (if property >= 1 Crore) (rp_visit_mgmt_alert)
    +-> Calendar: Appointment record created
    +-> Admin Dashboard: Visible in Calendar and Visits panels
```

---

## 9. AI Agent Architecture

### 9.1 Agent Registry (MessageRouter)

```
ClassifierAgent  -> Identifies UNKNOWN contacts (single LLM call)
SalesAgent       -> Handles BUYER_TENANT and SELLER_LANDLORD conversations
PartnerAgent     -> Handles PARTNER_AGENT and REAL_ESTATE_BUILDER conversations
AdminAgent       -> Handles MANAGEMENT / INTERNAL commands and reports
CoordinationAgent -> Manages appointments, visit scheduling, calendar
QAAgent          -> Post-response quality check (20% sample, async)
SecurityAgent    -> Rate limiting, suspicious activity detection
```

### 9.2 LLM Usage Optimization

| Scenario | LLM Calls | Strategy |
|----------|----------|----------|
| UNKNOWN contact message | 1 | classifyFull() - single call for type + intent + language |
| BUYER_TENANT message | 0-1 | Skip domain classification (default: PROPERTY), keyword check for APPOINTMENT |
| SELLER_LANDLORD message | 0-1 | Same as buyer, default PROPERTY |
| Known contact with language | 0 | Language already stored, no detectLanguage call |
| QA check | 0.2 avg | Only 20% of responses sampled |

---

## 10. Infrastructure Dependencies

```
PostgreSQL (Prisma ORM)
    |-- All persistent data: Contacts, Inventory, Interactions, Agents, etc.
    |-- Health check: SELECT 1

Redis
    |-- Session store (SessionStore)
    |-- Message dedup (msg_dedup:{id}, TTL=120s)
    |-- Cache layer (cacheGet/cacheSet)
    |-- BullMQ queue backend

BullMQ (Redis-backed)
    |-- whatsappInboundQueue: Async message processing
    |-- Natural dedup via jobId = messageId

Gemini AI (Google)
    |-- LLM for classification, response generation, QA
    |-- Circuit breaker: geminiCircuit

Meta Cloud API (WhatsApp)
    |-- Inbound: Webhooks at POST /webhooks/whatsapp
    |-- Outbound: sendText(), sendTemplate()
    |-- Circuit breaker: whatsappCircuit
    |-- Templates: rp_visit_agent_notify, rp_visit_keyholder,
    |              rp_visit_mgmt_alert, rp_whatsapp_invite

Vapi (Voice)
    |-- Inbound: Webhooks at POST /webhooks/voice
    |-- VoiceService handles call events
```

---

## 11. Security Layers

```
Layer 1: CORS Whitelist
    -> Only allowed origins can make requests
    -> Credentials required for cookie/auth headers

Layer 2: Helmet.js
    -> Content-Security-Policy headers
    -> Cross-Origin-Resource-Policy: cross-origin

Layer 3: Rate Limiting
    -> Per-route rate limits (see Section 6)
    -> Separate limits for auth, public, webhook, external, agent, API

Layer 4: Authentication
    -> JWT verification on all /api/* routes
    -> Agent JWT on /agent/* routes
    -> Builder JWT on /builder/* routes
    -> API Key on /external/* routes

Layer 5: Authorization (RBAC)
    -> requireRole() middleware for role checks
    -> checkPermission() middleware for fine-grained permissions
    -> Permission matrix in config/permissions.ts

Layer 6: Data Masking
    -> PermissionEngine masks phone/name/email for FREE plan external users
    -> Agent and Builder portals apply masking based on owner's plan

Layer 7: AI Security
    -> SecurityAgent rate-limits per phone number
    -> Suspicious activity logging
    -> QA Agent flags low-quality or inappropriate responses

Layer 8: Input Validation
    -> express-validator schemas on all mutation routes
    -> Request body size limit: 10MB
    -> File upload limits per media type

Layer 9: Infrastructure
    -> trust proxy: loopback
    -> Response compression
    -> Circuit breakers on external services (Gemini, WhatsApp)
```

---

## 12. Environment Variables Required

| Variable | Used By | Purpose |
|----------|---------|---------|
| `JWT_SECRET` | Admin auth | Sign/verify admin JWT tokens |
| `AGENT_JWT_SECRET` | Agent auth | Sign/verify agent JWT tokens |
| `BUILDER_JWT_SECRET` | Builder auth | Sign/verify builder JWT tokens (fallback: AGENT_JWT_SECRET) |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verification | Meta webhook subscription verification |
| `ALLOWED_ORIGINS` | CORS | Override default origin whitelist (comma-separated) |
| `VITE_API_BASE_URL` | Frontend | Admin dashboard API base URL |
| `NEXT_PUBLIC_API_URL` | Website | Next.js API base URL |
| `NODE_ENV` | App | production / development (affects caching, static files) |
| `NODE_APP_INSTANCE` | PM2 | Cluster instance identifier |

---

## 13. Key Source Files Reference

| File | Purpose |
|------|---------|
| `agents/backend/src/app.ts` | Route mounting, CORS, middleware stack |
| `agents/backend/src/middleware/auth.ts` | JWT auth + RBAC middleware |
| `agents/backend/src/middleware/rate_limit.ts` | Rate limiting configuration |
| `agents/backend/src/config/permissions.ts` | RBAC permission matrix |
| `agents/backend/src/services/auth.ts` | AuthService (login, register, JWT) |
| `agents/backend/src/services/message_router.ts` | Master Orchestrator (AI agent routing) |
| `agents/backend/src/services/chat_handler.ts` | Website AI Chat + Visit Booking |
| `agents/backend/src/routes/webhooks.ts` | WhatsApp + Voice webhooks |
| `agents/backend/src/routes/agent.ts` | Agent portal routes |
| `agents/backend/src/routes/builder.ts` | Builder portal routes |
| `agents/frontend/src/contexts/AuthContext.tsx` | Frontend auth state management |
| `agents/frontend/src/api/client.ts` | Frontend API client (axios) |
| `agents/website/src/lib/api.ts` | Website API client (axios) |
