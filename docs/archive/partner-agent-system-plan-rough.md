# Partner Agent Marketplace System - Implementation Plan

## 🎯 Project Overview
Transform Realty Pandit from internal CRM to a controlled marketplace platform where external agents can register, subscribe to packages, and list properties while maintaining ONE AI brain and ONE SSOT.

## 📋 Business Rules (Critical)
1. **Priority**: Internal inventory → ADVANCE_PRO agents → PRO agents → FREE agents
2. **Commission**: Only from FREE agents (not subscription)
3. **Data Access**: FREE agents cannot see buyer contact info (masked)
4. **Subscription Model**: Monthly recurring revenue from PRO/ADVANCE_PRO agents
5. **Listing Limits**: FREE=10, PRO=50, ADVANCE_PRO=unlimited
6. **AI Integration**: Same AI brain for all users (internal staff, external agents, buyers)

---

## Phase 1: Database & Core Architecture (5 tasks)

### TASK-055: Extend Prisma Schema for Partner Agents
**Priority**: CRITICAL
**Estimated Time**: 2 hours
**Dependencies**: None

**Deliverables**:
- Add `PartnerAgent` model with fields:
  - id, phoneNumber (unique), name, email, companyName, city
  - packageType (FREE/PRO/ADVANCE_PRO)
  - status (ACTIVE/SUSPENDED/EXPIRED/PENDING_PAYMENT)
  - listingLimit, priorityScore
  - subscriptionStart, subscriptionEnd
  - createdAt, updatedAt
- Add enums: `AgentPackage`, `AgentStatus`
- Modify `Inventory` model:
  - Add `ownerType` (INTERNAL/EXTERNAL_AGENT)
  - Add `agentOwnerId` (optional, foreign key to PartnerAgent)
  - Add `internalOwnerId` (optional, existing owner reference)
- Modify `Appointment` model:
  - Add `agentId` (optional, for external agent appointments)
  - Add `buyerInfoMasked` (boolean, for FREE agents)
- Extend `ContactType` enum: Add `EXTERNAL_AGENT`
- Create migration file

**Acceptance Criteria**:
- Schema compiles without errors
- Migration ready to apply
- All relationships properly defined
- Indexes on phoneNumber, agentOwnerId

---

### TASK-056: Create Agent Authentication System
**Priority**: CRITICAL
**Estimated Time**: 3 hours
**Dependencies**: TASK-055

**Deliverables**:
- Create `agents/backend/src/services/agent_auth.ts`:
  - `registerAgent(data)` - Create PartnerAgent record
  - `sendAgentOTP(phone)` - WhatsApp OTP for agent login
  - `verifyAgentOTP(phone, otp)` - Verify and return agent JWT
  - `generateAgentToken(agent)` - JWT with role=AGENT + packageType
- Create `agents/backend/src/middleware/agent_auth.ts`:
  - `agentAuthMiddleware` - Verify agent JWT
  - `requirePackage(package)` - Check agent subscription level
  - `checkListingLimit(agentId)` - Enforce listing limits
- Add agent token secret to env: `AGENT_JWT_SECRET`

**Acceptance Criteria**:
- Agent can register with phone number
- OTP sent via WhatsApp
- JWT token issued with agent claims
- Middleware blocks unauthorized access
- Package-based permissions enforced

---

### TASK-057: Build Agent API Routes
**Priority**: CRITICAL
**Estimated Time**: 4 hours
**Dependencies**: TASK-056

**Deliverables**:
- Create `agents/backend/src/routes/agent.ts`:
  - `POST /agent/register` - Register new agent
  - `POST /agent/login` - OTP login
  - `POST /agent/verify-otp` - Verify OTP
  - `GET /agent/profile` - Get agent profile
  - `PUT /agent/profile` - Update profile
  - `GET /agent/subscription` - Get subscription details
  - `POST /agent/inventory` - Add property
  - `PUT /agent/inventory/:id` - Edit property
  - `DELETE /agent/inventory/:id` - Remove property
  - `GET /agent/inventory` - List agent's properties
  - `GET /agent/appointments` - Get appointments (with masking for FREE)
  - `GET /agent/leads` - Get enquiries/leads
  - `GET /agent/analytics` - Dashboard stats
- Mount routes in `index.ts`: `app.use('/agent', agentRoutes)`
- Add request validation with Joi/Zod
- Implement SSOT pattern: All agent actions log to Interaction table

**Acceptance Criteria**:
- All endpoints tested with Postman/Thunder Client
- FREE agents get masked buyer data
- PRO/ADVANCE_PRO agents get full buyer info
- Listing limits enforced
- Proper error handling

---

### TASK-058: Modify Matching Engine with Priority Logic
**Priority**: HIGH
**Estimated Time**: 3 hours
**Dependencies**: TASK-055

**Deliverables**:
- Modify `agents/backend/src/services/matching_engine.ts`:
  - Add priority scoring:
    - INTERNAL = 100
    - ADVANCE_PRO = 95
    - PRO = 70
    - FREE = 50
  - Update matching query: `ORDER BY priorityScore DESC, relevance DESC`
  - Mix internal + ADVANCE_PRO for paid agents
  - Return internal-only for free agent queries
- Add logic to `GET /public/properties` to respect priority
- Create `getAgentMatches(agentId, filters)` for agent searches

**Acceptance Criteria**:
- Internal properties always rank highest
- ADVANCE_PRO agents see mixed results
- PRO/FREE agents see lower priority
- Matching logic tested with sample data

---

### TASK-059: Subscription Management System
**Priority**: HIGH
**Estimated Time**: 2 hours
**Dependencies**: TASK-056

**Deliverables**:
- Create `agents/backend/src/services/subscription.ts`:
  - `checkSubscriptionStatus(agentId)` - Check if active/expired
  - `upgradePackage(agentId, newPackage)` - Upgrade agent
  - `downgradePackage(agentId)` - Downgrade to FREE
  - `renewSubscription(agentId)` - Extend subscription
  - `expireSubscription(agentId)` - Mark as expired
- Add cron job: `agents/backend/src/jobs/subscription_check.ts`:
  - Runs daily at 12 AM
  - Checks `subscriptionEnd < today`
  - Auto-downgrades to FREE
  - Sends WhatsApp notification
- Add subscription event logging to Interaction table

**Acceptance Criteria**:
- Expired agents auto-downgraded
- Notifications sent on expiry
- Upgrade/downgrade tested
- Cron job runs daily

---

## Phase 2: Agent Dashboard (Frontend) (4 tasks)

### TASK-060: Create Agent Dashboard Shell
**Priority**: HIGH
**Estimated Time**: 3 hours
**Dependencies**: TASK-057

**Deliverables**:
- Create new React app or separate route: `agents/agent-dashboard/`
- Or add to existing frontend: `agents/frontend/src/agent/`
- Create layout: `AgentLayout.tsx` with sidebar:
  - Overview
  - My Inventory
  - Appointments
  - Leads
  - Subscription
  - Profile
- Create `AgentAuthContext.tsx` for agent auth state
- Add agent login page: `agents/frontend/src/agent/Login.tsx`
- Add protected route guard: `RequireAgentAuth.tsx`

**Acceptance Criteria**:
- Agent can login with phone + OTP
- Dashboard layout renders
- Navigation works
- Auth context persists agent token

---

### TASK-061: Build Agent Inventory Management UI
**Priority**: HIGH
**Estimated Time**: 4 hours
**Dependencies**: TASK-060

**Deliverables**:
- Create `agents/frontend/src/agent/Inventory.tsx`:
  - List all agent properties (table/card view)
  - Add property button → form modal
  - Edit/Delete actions
  - Status badges (Active/Sold/Rented)
  - Listing limit indicator (e.g., "7/10 listings used")
- Create `AddPropertyForm.tsx`:
  - Multi-step form (same as internal inventory form)
  - Category, Type, Location, Price, Features
  - Submit → POST /agent/inventory
- Create `EditPropertyForm.tsx`
- Show upgrade CTA if limit reached (for FREE agents)

**Acceptance Criteria**:
- Agent can add/edit/delete properties
- Listing limit enforced on UI
- Form validation works
- Properties appear in list immediately

---

### TASK-062: Build Agent Appointments & Leads UI
**Priority**: MEDIUM
**Estimated Time**: 3 hours
**Dependencies**: TASK-060

**Deliverables**:
- Create `agents/frontend/src/agent/Appointments.tsx`:
  - List upcoming/past appointments
  - Show date, time, property, buyer info (if PRO/ADVANCE_PRO)
  - Mask buyer info for FREE agents: "Upgrade to see buyer details"
  - Appointment status badges
  - Action: Reschedule, Confirm, Cancel
- Create `agents/frontend/src/agent/Leads.tsx`:
  - List enquiries received
  - Show property, enquiry date, status
  - Buyer info masked for FREE
  - CTA: "Upgrade to contact buyer directly"

**Acceptance Criteria**:
- Appointments display correctly
- Buyer masking works for FREE agents
- PRO agents see full buyer contact
- Upgrade CTAs visible

---

### TASK-063: Build Agent Subscription & Profile Pages
**Priority**: MEDIUM
**Estimated Time**: 2 hours
**Dependencies**: TASK-060

**Deliverables**:
- Create `agents/frontend/src/agent/Subscription.tsx`:
  - Show current package, expiry date
  - Feature comparison table (FREE vs PRO vs ADVANCE_PRO)
  - Upgrade buttons
  - Payment history (if implemented)
  - Downgrade option
- Create `agents/frontend/src/agent/Profile.tsx`:
  - Edit name, email, company name, city
  - Change password/phone
  - Logout button
- Create `agents/frontend/src/agent/Overview.tsx`:
  - Dashboard cards: Total listings, Total enquiries, Total visits, Conversion rate
  - Recent activity feed
  - Quick actions

**Acceptance Criteria**:
- Subscription status visible
- Package comparison clear
- Profile editable
- Overview shows stats

---

## Phase 3: Website Integration (3 tasks)

### TASK-064: Create Agent Registration Landing Page
**Priority**: HIGH
**Estimated Time**: 3 hours
**Dependencies**: TASK-057

**Deliverables**:
- Create `agents/website/src/app/agents/page.tsx`:
  - Hero: "Join Realty Pandit Partner Network"
  - Package comparison cards (FREE, PRO, ADVANCE_PRO)
  - Feature matrix table
  - Pricing display
  - Testimonials from agents (placeholder)
  - FAQ section
  - CTA: "Register Now"
- Create `agents/website/src/app/agents/register/page.tsx`:
  - Registration form (Name, Phone, Email, Company, City)
  - Package selection dropdown
  - Terms & Conditions checkbox
  - Submit → POST /agent/register
  - OTP verification step
  - Success → Redirect to agent dashboard login
- Add dark mode support
- Mobile responsive

**Acceptance Criteria**:
- Landing page SEO optimized
- Package comparison clear
- Registration flow works end-to-end
- OTP verification functional
- Redirects to dashboard after success

---

### TASK-065: Add Agent Links to Main Website
**Priority**: LOW
**Estimated Time**: 1 hour
**Dependencies**: TASK-064

**Deliverables**:
- Add "For Agents" link to main website navbar
- Add footer section: "Partner with Us"
- Create footer links: "Agent Registration", "Agent Login", "Partner Benefits"
- Add homepage CTA section: "Are you a property dealer? Join our network"
- Update sitemap.ts to include /agents pages

**Acceptance Criteria**:
- Links visible on all pages
- Redirects to /agents landing page
- Sitemap updated

---

### TASK-066: Build Agent Login Portal Page
**Priority**: MEDIUM
**Estimated Time**: 2 hours
**Dependencies**: TASK-060

**Deliverables**:
- Create `agents/website/src/app/agents/login/page.tsx`:
  - Phone number input
  - Send OTP button
  - OTP input field
  - Verify & Login button
  - "Don't have an account? Register" link
  - Submit → POST /agent/login → Redirect to agent dashboard
- Add "Agent Login" link to navbar dropdown
- Separate from internal staff login

**Acceptance Criteria**:
- Agent can login from website
- OTP flow works
- Redirects to agent dashboard
- Error handling for invalid OTP

---

## Phase 4: WhatsApp Agent Workflows (3 tasks)

### TASK-067: Extend Contact Type Detection for Agents
**Priority**: CRITICAL
**Estimated Time**: 2 hours
**Dependencies**: TASK-055

**Deliverables**:
- Modify `agents/backend/src/services/identity.ts`:
  - Check if phone exists in PartnerAgent table
  - Return `contactType: EXTERNAL_AGENT` if found
  - Add agent metadata: `packageType`, `status`, `agentId`
- Update `message_router.ts`:
  - Route to agent workflow if `contactType === EXTERNAL_AGENT`
  - Create new `handleAgentMessage()` function
- Create `agents/backend/src/services/agent_system_prompt.ts`:
  - Agent-specific AI prompts
  - "You are assisting a partner agent"
  - Context: package type, listing limit, appointments

**Acceptance Criteria**:
- Agent phone numbers identified correctly
- AI knows when user is an agent
- Context passed to LLM

---

### TASK-068: Build WhatsApp Agent Workflows
**Priority**: HIGH
**Estimated Time**: 4 hours
**Dependencies**: TASK-067

**Deliverables**:
- Create `agents/backend/src/workflows/agent_workflows.ts`:
  - **Upload Inventory Workflow**:
    - Trigger: "Add property", "List 2 BHK"
    - Multi-turn conversation: Category, Type, Location, Price, Features
    - Save to Inventory with `ownerType=EXTERNAL_AGENT`, `agentOwnerId`
    - Confirm: "Property added! View in dashboard"
  - **Check Appointments**:
    - Trigger: "My appointments", "Any visits today?"
    - Query appointments for agent
    - Mask buyer info if FREE
    - Send summary
  - **Check Leads**:
    - Trigger: "Any leads?", "New enquiries?"
    - Query enquiries for agent properties
    - Return count + summary
  - **Edit Listing**:
    - Trigger: "Update price", "Change rent"
    - Ask property ID
    - Modify inventory
    - Confirm change
- Add agent welcome message on first contact:
  - "Welcome to Realty Pandit! You can upload properties via chat or dashboard."

**Acceptance Criteria**:
- Agent can upload property via WhatsApp
- Appointments fetched correctly
- Buyer info masked for FREE agents
- Edit commands work
- AI responds in agent context

---

### TASK-069: Agent Notification System
**Priority**: MEDIUM
**Estimated Time**: 2 hours
**Dependencies**: TASK-068

**Deliverables**:
- Modify appointment booking flow:
  - When buyer books appointment for external property:
    - Send WhatsApp to agent: "New site visit scheduled for [Property] at [Time]"
    - If FREE: Don't include buyer details
    - If PRO: Include buyer name + phone
  - Log notification in Interaction table
- Create lead notification:
  - When buyer enquires about agent property:
    - Send WhatsApp: "New enquiry for [Property]"
    - If PRO: Include buyer contact
- Add email notifications (optional):
  - Same logic as WhatsApp

**Acceptance Criteria**:
- Agents notified on new appointments
- Notifications respect package rules
- FREE agents don't see buyer info
- Emails sent (if enabled)

---

## Phase 5: Business Logic & Rules (3 tasks)

### TASK-070: Implement Listing Limit Enforcement
**Priority**: HIGH
**Estimated Time**: 2 hours
**Dependencies**: TASK-057

**Deliverables**:
- Add validation in `POST /agent/inventory`:
  - Check agent's current active listings
  - Compare with `agent.listingLimit`
  - If exceeded: Return error "Listing limit reached. Upgrade to add more."
- Add to WhatsApp upload workflow:
  - Check limit before starting conversation
  - Suggest upgrade if limit reached
- Add soft delete for inventory:
  - Agent can deactivate old listings to free up slots
  - Don't count inactive listings toward limit

**Acceptance Criteria**:
- FREE agents limited to 10 listings
- PRO agents limited to 50
- ADVANCE_PRO unlimited
- Clear error messages
- WhatsApp suggests upgrade

---

### TASK-071: Build Lead Routing & Priority System
**Priority**: CRITICAL
**Estimated Time**: 3 hours
**Dependencies**: TASK-058

**Deliverables**:
- Modify buyer search flow:
  - When buyer searches properties:
    - Fetch internal + external matches
    - Apply priority scoring
    - Sort results
    - Return top matches
  - If agent searches (PRO/ADVANCE_PRO):
    - Return internal inventory (limited access)
    - Filter based on package permissions
- Create `agents/backend/src/services/lead_distribution.ts`:
  - `distributeEnquiry(buyerId, propertyId)`:
    - Check property owner
    - If internal → Notify internal team
    - If external → Notify agent
    - Log lead assignment
- Add lead scoring logic:
  - Track conversion rates per agent
  - Adjust `priorityScore` based on performance

**Acceptance Criteria**:
- Internal properties shown first
- ADVANCE_PRO agents see mixed results
- PRO agents get limited internal access
- FREE agents see only their own
- Lead routing tested

---

### TASK-072: Commission Tracking System (FREE Agents Only)
**Priority**: MEDIUM
**Estimated Time**: 2 hours
**Dependencies**: TASK-071

**Deliverables**:
- Create `Commission` model in Prisma:
  - id, agentId, appointmentId, amount, status, paidAt
- Add commission calculation:
  - When FREE agent property gets booked:
    - Calculate commission (e.g., 2% of deal value)
    - Create Commission record with status=PENDING
  - Admin dashboard shows pending commissions
  - Mark as PAID when transferred
- Add commission report for agents:
  - GET /agent/commissions
  - Show pending + paid amounts
- No commission for PRO/ADVANCE_PRO (subscription model)

**Acceptance Criteria**:
- Commission calculated for FREE agents
- Admin can see pending commissions
- Agent can view commission history
- PRO agents exempt from commission

---

## Phase 6: Admin Features (2 tasks)

### TASK-073: Agent Management in Admin Dashboard
**Priority**: MEDIUM
**Estimated Time**: 3 hours
**Dependencies**: TASK-060

**Deliverables**:
- Create `agents/frontend/src/pages/AgentManagement.tsx`:
  - List all partner agents (table view)
  - Filters: Package type, Status, City
  - Search by name/phone
  - Actions: Suspend, Activate, Upgrade, Downgrade
  - View agent profile modal
  - View agent inventory list
- Add API endpoints:
  - GET /admin/agents (list all)
  - PUT /admin/agents/:id/status (suspend/activate)
  - PUT /admin/agents/:id/package (upgrade/downgrade)
  - GET /admin/agents/:id/stats (agent analytics)
- Add to sidebar: "Partner Agents"

**Acceptance Criteria**:
- Admin can see all agents
- Suspend/activate works
- Upgrade/downgrade manual override
- Analytics visible

---

### TASK-074: Agent Analytics & Reporting
**Priority**: LOW
**Estimated Time**: 2 hours
**Dependencies**: TASK-073

**Deliverables**:
- Create `agents/frontend/src/pages/AgentAnalytics.tsx`:
  - Charts: Total agents by package
  - Revenue from subscriptions
  - Conversion rates by agent
  - Top performing agents
  - Commission owed (FREE agents)
- Add filters: Date range, City, Package type
- Export to CSV
- Add API: GET /admin/analytics/agents

**Acceptance Criteria**:
- Charts render correctly
- Data accurate
- Export works
- Admin insights visible

---

## Phase 7: Payment Integration (Optional/Future) (2 tasks)

### TASK-075: Razorpay/Stripe Integration for Subscriptions
**Priority**: LOW (Future)
**Estimated Time**: 4 hours
**Dependencies**: TASK-059

**Deliverables**:
- Add payment gateway SDK (Razorpay for India)
- Create payment routes:
  - POST /agent/payment/create-order (for PRO/ADVANCE_PRO)
  - POST /agent/payment/verify (webhook)
- Update subscription on successful payment
- Send payment confirmation via WhatsApp
- Add payment history table

**Acceptance Criteria**:
- Agent can pay online
- Subscription activated on payment
- Webhook verified
- Payment history visible

---

### TASK-076: Auto-Renewal & Payment Reminders
**Priority**: LOW (Future)
**Estimated Time**: 2 hours
**Dependencies**: TASK-075

**Deliverables**:
- Add auto-renewal option (checkbox during payment)
- Store payment method token
- Cron job: Charge before expiry (3 days prior)
- Send WhatsApp reminder: "Subscription expiring in 3 days"
- On failure: Notify agent + downgrade to FREE

**Acceptance Criteria**:
- Auto-renewal works
- Reminders sent
- Downgrade on failure
- Agent notified

---

## Implementation Summary

**Total Tasks**: 22 tasks across 7 phases

**Priority Breakdown**:
- CRITICAL: 4 tasks (Database, Auth, Matching, WhatsApp detection)
- HIGH: 8 tasks (APIs, Dashboard, Registration, Workflows)
- MEDIUM: 7 tasks (Appointments UI, Notifications, Commissions, Admin)
- LOW: 3 tasks (Analytics, Payments - Future)

**Estimated Timeline**:
- Phase 1 (Database & Core): 2-3 days
- Phase 2 (Agent Dashboard): 3-4 days
- Phase 3 (Website): 2 days
- Phase 4 (WhatsApp): 2-3 days
- Phase 5 (Business Logic): 2 days
- Phase 6 (Admin): 2 days
- Phase 7 (Payments): Future

**Total Estimated Time**: ~15-18 days (full-time development)

---

## Critical Dependencies

```
TASK-055 (Schema) ──> TASK-056 (Auth) ──> TASK-057 (APIs)
                 └──> TASK-058 (Matching)
                 └──> TASK-067 (WhatsApp Detection)

TASK-057 ──> TASK-060 (Dashboard Shell) ──> TASK-061, 062, 063 (Dashboard Pages)
        └──> TASK-064 (Registration Page)

TASK-067 ──> TASK-068 (WhatsApp Workflows) ──> TASK-069 (Notifications)

TASK-058 ──> TASK-071 (Lead Routing) ──> TASK-072 (Commissions)
```

**START WITH**: TASK-055 (Schema) - This unblocks everything else.

---

## Key Technical Decisions

1. **Single SSOT**: All data in one database, role-based access
2. **Single AI Brain**: Same message_router.ts, branch on contactType
3. **Priority Scoring**: Integer-based ranking (100=internal, 95=advance_pro, 70=pro, 50=free)
4. **Data Masking**: API-level masking for FREE agents, not DB-level
5. **Subscription Model**: Time-based (subscriptionEnd date), cron auto-downgrade
6. **WhatsApp First**: Agent can do everything via WhatsApp, dashboard is optional UI
7. **Package Permissions**: Enforced at API middleware level (`requirePackage()`)

---

## Next Steps

1. Review and approve this plan
2. Start with TASK-055 (Database Schema)
3. Apply Prisma migration
4. Build incrementally phase by phase
5. Test each phase before moving to next

Would you like me to:
1. Start implementing Phase 1 (Database)?
2. Create detailed API specifications?
3. Design database schema diagrams?
4. Build agent dashboard mockups?
