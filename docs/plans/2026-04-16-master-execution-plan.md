# Realty Pandit — Master Execution Plan
## AI Lead Automation + Contact System Redesign + WhatsApp Experience

---

## Context

Realty Pandit is an AI-powered real estate platform with a WhatsApp bot (Panditji), CRM dashboard, and multi-source lead ingestion. The owner wants to replace manual employee workflows with full AI automation — from lead qualification to property matching to appointment scheduling.

This plan is derived from:
1. Full system investigation (investigation of codebase, Meta dashboard, live server)
2. Complete product vision discussed with the owner (ChatGPT transcript covering contact system, visibility rules, AI flows, WhatsApp UX, filters, notifications)
3. 10 bugs identified during investigation

### Key Principles
- Contact = SSOT (single entity, multi-role)
- Strict visibility: only owner agent + hierarchy above can see contacts
- AI handles everything employees currently do
- Reply buttons (not links) to keep 24h WhatsApp window open
- Quiet hours: 10 PM - 6 AM IST (no proactive messages, but AI replies 24x7 if customer initiates)
- IST timezone for all messaging

---

## PHASE 1: Critical Bug Fixes
**Priority: IMMEDIATE | Effort: 1-2 days**

### 1.1 Add Missing `rp_buyer_lead_received` Template
- **File:** `agents/backend/src/config/whatsapp_templates.ts`
- **Bug:** Code at `lead_notifications.ts:42` tries to send `rp_buyer_lead_received` but it doesn't exist in TEMPLATE_REGISTRY
- **Fix:** Add template to registry. This will be superseded by dynamic template engine in Phase 3, but needed now as a stopgap
- **Also:** Submit this template to Meta for approval via WhatsApp Manager

### 1.2 Fix Blank Email Validation
- **File:** `agents/backend/src/services/email_service.ts:54-55`
- **Bug:** If both `body` and `html` are undefined, email sends empty content
- **Fix:** Add validation: reject send if no body/html content. Log warning

### 1.3 Unify WhatsApp API Version
- **Files:** `agents/backend/src/services/whatsapp.ts` (v17), workflow adapters (v21), Meta dashboard (v25)
- **Fix:** Standardize all to v25.0 (latest, matches Meta dashboard webhook subscriptions)

### 1.4 Fix TEMP Phone Placeholder
- **File:** `agents/backend/src/routes/leads.ts`
- **Bug:** Generates `TEMP_<timestamp>_<random>` for leads without phone — these can never be contacted
- **Fix:** Require phone number for lead creation. If missing, flag as incomplete lead (don't create TEMP contact)

---

## PHASE 2: Contact System Redesign (RBAC + Visibility)
**Priority: HIGH | Effort: 5-7 days**

### 2.1 Schema Changes
- **File:** `agents/backend/prisma/schema.prisma`
- Add `owner_user_id` field to Contact model (references Agent table)
- Ensure Lead table has all demand fields (budget_min, budget_max, preferred_location, bhk, property_type) — move any demand data OUT of Contact

### 2.2 Visibility Middleware
- **New file:** `agents/backend/src/middleware/visibility.ts`
- Create middleware that filters all queries based on:
  - `owner_user_id === current_user.id` (own contacts)
  - OR `current_user.role === 'super_boss'` (sees everything)
  - OR `current_user.role === 'manager'` AND contact is owned by their subordinate
- No lateral visibility between employees
- Apply to: leads, inventory, contacts, search, chat

### 2.3 Search Restriction
- **Files:** All search endpoints in routes/
- Default: contacts do NOT appear in search results for unauthorized users
- Exception: exact full phone number match returns the contact (controlled access)
- No fuzzy search, no partial match, no autocomplete for unauthorized users

### 2.4 Inventory Visibility
- Link to Contact visibility: if you can't see the Contact, you can't see their Inventory
- Inventory owner phone number NOT visible to lead owner's clients
- Only lead owner + super_boss see client contact details

### 2.5 Migration Script
- Backfill `owner_user_id` for existing contacts using `assigned_agent_id` from leads
- Contacts without assignment → assign to super_boss

### Critical Files:
- `prisma/schema.prisma` (schema changes)
- `src/middleware/visibility.ts` (new)
- `src/config/permissions.ts` (already has RBAC matrix)
- All route files that query contacts/leads/inventory

---

## PHASE 3: AI Lead Qualification Pipeline
**Priority: HIGH | Effort: 7-10 days**

### 3.1 Dynamic First Message Engine
- **New file:** `agents/backend/src/services/lead_qualifier.ts`
- On lead arrival, AI checks what data is known vs unknown:
  - Known fields: name, intent (buy/rent/sell), category (residential/commercial), type (flat/plot), BHK, budget, location
  - For each combination of known/unknown → select appropriate template
- Smart inference: if BHK is known → auto-assume Residential
- Never ask redundant questions
- Approximately 5-10 template variations needed

### 3.2 Step-by-Step Qualification Flow
- **Modify:** `agents/backend/src/services/webhook_processor.ts`
- Qualification steps (in order):
  1. Genuine inquiry? (auto-detect from source data)
  2. Self or agent? (buying for themselves or acting as dealer)
  3. Intent: Buy / Rent (Rent = Lease, same thing)
  4. Category: Residential / Commercial
  5. Sub-type: Flat / Villa / Plot / Shop / Office etc.
  6. Configuration: BHK (only for applicable types)
  7. Budget: Total (buy) or Monthly rent (rent)
  8. Location: Via Google Maps location sharing
- Each step uses WhatsApp **reply buttons** or **list messages**
- AI skips steps where data is already known

### 3.3 Session State Management
- Track qualification progress per contact in database or Redis
- Store: current_step, collected_data, last_property_shown, session_start_time

### 3.4 24-Hour Window Keep-Alive System
- **New service:** `agents/backend/src/services/session_keeper.ts`
- BullMQ scheduled job: check all active sessions
- At 22 hours since last customer message → send keep-alive message
- Message format: Contextual (e.g., "Good morning! Are you available to schedule a visit today?") with reply button
- **Timing rules:**
  - Never send before 6 AM IST
  - Never send after 10 PM IST
  - If 22h mark falls in quiet hours → schedule for 7 AM next day
- If customer replies → 24h window resets
- If no reply → session expires, use approved template for next contact

### 3.5 Quiet Hours Enforcement
- **Modify:** `agents/backend/src/services/decision_engine.ts`
- Proactive/marketing messages: BLOCKED between 10 PM - 6 AM IST
- Customer-initiated replies: ALLOWED 24x7
- Decision: check `message.direction` — if inbound, always respond; if outbound/proactive, check time

### Critical Files:
- `src/services/lead_qualifier.ts` (new)
- `src/services/session_keeper.ts` (new)
- `src/services/webhook_processor.ts` (modify buyer workflow)
- `src/services/decision_engine.ts` (quiet hours)
- `src/config/whatsapp_templates.ts` (new dynamic templates)
- `src/queues/workers/` (scheduled jobs)

---

## PHASE 4: WhatsApp Interactive Property Experience
**Priority: HIGH | Effort: 5-7 days**

### 4.1 Rich Property Cards
- **Modify:** `agents/backend/src/services/whatsapp.ts`
- Each property shown as: Image (header) + Text (body with type, price, location, specs) + 3 Reply Buttons:
  1. "Schedule Appointment"
  2. "Request Callback"
  3. "Next Property"
- Use WhatsApp Interactive Message API (type: "button")
- NO "Like" button (removed per owner's instruction)

### 4.2 Property Tracking
- AI tracks which properties have been shown to each contact
- `last_shown_inventory_ids` stored in session/Redis
- "Next Property" always fetches next matching, unshown property
- If no more matches → show nearby/closest matches + notify assigned agent

### 4.3 Interactive Appointment Booking
- When "Schedule Appointment" clicked:
  - Send List Message with available dates (next 5-7 days)
  - On date selection → send List Message with time slots (Morning 9-12, Afternoon 12-4, Evening 4-7)
  - On time selection → Confirmation message with reply button
- Use WhatsApp List Messages (up to 10 options)

### 4.4 Callback Flow
- When "Request Callback" clicked:
  - AI acknowledges: "Callback request registered! Our team will call you shortly."
  - Notification to **super_boss**: "Callback requested by [name] for [property]"
  - Notification to **assigned lead owner**: "Call [client name] - they want a callback about [property]"
  - Also ask: "Would you like to see more properties?" (keeps conversation going)

### 4.5 Google Maps Location Integration
- **Modify:** `agents/backend/src/services/chat_handler.ts`
- When asking for location: send message with "Share Location" prompt
- Parse received location coordinates
- Match against inventory using Google Maps API (already have key)
- Also: when showing properties, include Google Maps link to property location

### Critical Files:
- `src/services/whatsapp.ts` (interactive messages)
- `src/services/chat_handler.ts` (property display + Maps)
- `src/services/webhook_processor.ts` (button response handling)
- `src/services/matching.ts` (nearby matches logic)

---

## PHASE 5: Notification System
**Priority: MEDIUM-HIGH | Effort: 3-5 days**

### 5.1 Appointment Notifications
- When appointment is confirmed:
  - **Lead owner (assigned agent):** Full context — client name, phone, property, date/time (WhatsApp + Push + In-app)
  - **Inventory owner:** "A client will visit your property at [time]. Please be available." NO client phone number (WhatsApp + Push)
  - **Super boss:** Summary notification (WhatsApp + In-app)

### 5.2 Callback Notifications
- **Super boss:** "Callback registered — [client] wants callback about [property]"
- **Assigned agent:** "Call [client name] at [phone] — callback request for [property]"

### 5.3 No-Match Notifications
- When AI can't find matching inventory:
  - Show nearby/closest matches to client
  - Notify assigned agent: "Lead [name] has requirements we can't match: [details]. Please review manually."

### 5.4 Push Notifications (PWA)
- **File:** Already have VAPID keys in .env.production
- Implement service worker push for: appointments, callbacks, new leads assigned, escalations
- Use existing PWA infrastructure

### 5.5 Escalation Notifications
- Already partially implemented in `scheduled_worker.ts`
- Enhance: if agent doesn't act on callback within 15 min → escalate to super_boss

### Critical Files:
- `src/services/lead_notifications.ts` (expand)
- `src/routes/agent.ts` (notification endpoints, already has super_boss logic)
- `src/queues/workers/scheduled_worker.ts` (escalation, already exists)
- Frontend PWA service worker

---

## PHASE 6: Email Redesign
**Priority: MEDIUM | Effort: 2-3 days**

### 6.1 HTML Email Templates
- Light-themed, professional design
- Panditji logo at top
- Social links footer (Instagram @airealtypandit, Facebook Realty Pandit)
- Templates needed:
  1. Welcome email (with client portal creation CTA)
  2. Property sharing email (image + details + CTA buttons)
  3. Appointment confirmation email
  4. Follow-up email

### 6.2 Email + WhatsApp Sync
- When inventory is shared on WhatsApp → also send via email (if email exists)
- When team member shares inventory from dashboard → send on both channels

### Critical Files:
- `src/services/email_service.ts`
- `src/services/lead_notifications.ts`
- New HTML template files

---

## PHASE 7: Instagram/Facebook Comment + DM System
**Priority: MEDIUM | Effort: 7-10 days**

### 7.1 Webhook Handlers
- **New file:** `agents/backend/src/routes/instagram_webhooks.ts`
- Handle: comments on posts, DMs, mentions
- **Modify:** `agents/backend/src/integrations/facebook.ts`
- Handle: page comments, Messenger DMs

### 7.2 AI Reply Pipeline
- Route Instagram/Facebook comments through existing AI (Panditji)
- For comments: detect if property inquiry → reply with invite to WhatsApp/DM
- For DMs: similar flow to WhatsApp buyer workflow

### 7.3 Database Models
- Add `Comment` model: platform, post_id, comment_id, text, author, sentiment, reply_text
- Add `SocialInteraction` tracking

### 7.4 Moderation
- AI filters spam/irrelevant comments
- Auto-reply to genuine inquiries
- Flag negative comments for human review

### Critical Files:
- `src/routes/instagram_webhooks.ts` (new)
- `src/integrations/facebook.ts` (expand)
- `src/services/webhook_processor.ts` (add social channel routing)
- `prisma/schema.prisma` (new models)

---

## PHASE 8: Inventory Filter System
**Priority: MEDIUM | Effort: 3-5 days**

### 8.1 Filter Tree (Backend API)
```
Location (Google Maps synced) — TOP PRIORITY
├── Listing Source (Direct Owner / Partner Agent / Internal Agent / Builder)
├── Purpose (Sale / Rent)
├── Category
│   ├── Residential → Flat (1/2/3/4+ BHK, Studio), Villa, Builder Floor, Plot
│   └── Commercial → Shop, Office, Showroom, Warehouse, Industrial
├── Agent Filter (My Inventory / My Team / Select Agent)
├── Data Source (WhatsApp / Website / Manual / API / Bulk Import)
└── Additional: Budget Range, Area, Furnishing, Availability, Status
```

### 8.2 Same Structure for Upload AND Search
- Category/sub-category tree used during inventory upload = same tree used in filters
- Consistent UX

### 8.3 Agent Filter Respects Visibility
- "My Inventory" → only current user's
- "My Team" → only if manager/super_boss
- "Select Agent" → dropdown of agents under current user's hierarchy

### Critical Files:
- `src/routes/inventory.ts` or `src/routes/public.ts` (filter endpoints)
- `src/services/matching.ts` (filter logic)
- Frontend filter components

---

## PHASE 9: Auto Template System
**Priority: LOW-MEDIUM | Effort: 3-4 days**

### 9.1 Template Generation
- When new inventory is uploaded → auto-generate WhatsApp template
- Template includes: property image (header), description (body), 3 buttons
- Submit to Meta via WhatsApp Business Management API

### 9.2 Approval Queue
- Track template status: pending → approved → active
- Only send template messages with approved templates
- Fallback: if template not yet approved, use generic approved template or wait for session window

### Critical Files:
- `src/services/whatsapp.ts` (template creation API)
- `src/config/whatsapp_templates.ts` (registry management)
- New queue worker for template submission

---

## PHASE 10: Daily Digest (TO BE DISCUSSED)
- Parked for later discussion with owner
- Will include: today's appointments, pending follow-ups, new leads count, team performance

---

## Execution Order Summary

| Phase | What | Effort | Dependencies |
|-------|------|--------|-------------|
| 1 | Critical Bug Fixes | 1-2 days | None |
| 2 | Contact RBAC + Visibility | 5-7 days | None |
| 3 | AI Lead Qualification Pipeline | 7-10 days | Phase 1 (templates) |
| 4 | WhatsApp Interactive Experience | 5-7 days | Phase 3 (qualification data) |
| 5 | Notification System | 3-5 days | Phase 4 (appointments) |
| 6 | Email Redesign | 2-3 days | Can run parallel to Phase 4-5 |
| 7 | Instagram/Facebook Integration | 7-10 days | Phase 3 (AI pipeline) |
| 8 | Inventory Filters | 3-5 days | Phase 2 (visibility) |
| 9 | Auto Template System | 3-4 days | Phase 4 (property cards) |
| 10 | Daily Digest | TBD | Phase 5 (notifications) |

**Total estimated effort: ~45-60 days**

---

## Verification Strategy

### Per Phase:
- Phase 1: Send test WhatsApp message, verify template works, send email with empty body (should reject)
- Phase 2: Log in as employee, verify can't see other employee's contacts. Log in as super_boss, verify full visibility
- Phase 3: Send test lead via 99acres webhook, verify AI qualification flow triggers, check 24h keep-alive scheduling
- Phase 4: Trigger property search, verify interactive buttons render, test appointment booking flow end-to-end
- Phase 5: Book appointment, verify notifications arrive on WhatsApp + push for all stakeholders
- Phase 6: Trigger welcome email, verify HTML renders correctly in Gmail/Outlook
- Phase 7: Post comment on Instagram, verify webhook fires and AI replies
- Phase 8: Apply filters in dashboard, verify results match criteria and respect visibility
- Phase 9: Upload inventory, verify template submitted to Meta, check approval status

### End-to-End Test:
1. Create lead from 99acres
2. AI sends dynamic first message on WhatsApp
3. User replies → qualification flow completes
4. Properties shown with interactive buttons
5. User books appointment
6. Notifications sent to agent, inventory owner, super boss
7. Email confirmation sent
8. 24h keep-alive scheduled
9. All visible only to authorized users
