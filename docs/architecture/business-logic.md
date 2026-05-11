# Reality Pandit -- Business Logic Reference

> **Source of truth** for every rule, algorithm, state machine, and scheduled job
> in the Reality Pandit backend.
>
> All references point to files under
> `agents/backend/src/` unless stated otherwise.

---

## Table of Contents

1. [Lead Scoring Algorithm](#1-lead-scoring-algorithm)
2. [Buyer Workflow](#2-buyer-workflow)
3. [Seller Workflow](#3-seller-workflow)
4. [Partner Agent Workflow](#4-partner-agent-workflow)
5. [Unknown Contact Identification Workflow](#5-unknown-contact-identification-workflow)
6. [Management Command Workflow](#6-management-command-workflow)
7. [Transaction State Machine](#7-transaction-state-machine)
8. [Inventory State Machine](#8-inventory-state-machine)
9. [Staff Call Processing Pipeline](#9-staff-call-processing-pipeline)
10. [Property Matching Algorithm (MatchingEngine)](#10-property-matching-algorithm-matchingengine)
11. [Marketplace Priority Scoring (MatchingService)](#11-marketplace-priority-scoring-matchingservice)
12. [Message Routing Logic (Master Orchestrator)](#12-message-routing-logic-master-orchestrator)
13. [Role Context Detection](#13-role-context-detection)
14. [Contact Identifier](#14-contact-identifier)
15. [Quiet Hours](#15-quiet-hours)
16. [WhatsApp Session Window Tracker](#16-whatsapp-session-window-tracker)
17. [Pending Message Queue](#17-pending-message-queue)
18. [Follow-up Scheduler](#18-follow-up-scheduler)
19. [Interaction Engine (Transaction-based Triggers)](#19-interaction-engine-transaction-based-triggers)
20. [Decision Engine](#20-decision-engine)
21. [Workflow Automation Engine](#21-workflow-automation-engine)
22. [BullMQ Job Queues and Scheduled Jobs](#22-bullmq-job-queues-and-scheduled-jobs)
23. [Commission Calculation](#23-commission-calculation)
24. [Subscription Plans and Permission Engine](#24-subscription-plans-and-permission-engine)
25. [Executive Assignment](#25-executive-assignment)
26. [AI Boss (Self-Improving Orchestrator)](#26-ai-boss-self-improving-orchestrator)
27. [QA Daily Jobs](#27-qa-daily-jobs)

---

## 1. Lead Scoring Algorithm

**File:** `services/lead_score.ts`

### Score Components and Caps

| Component     | Max Points | Description                             |
|---------------|------------|-----------------------------------------|
| Intent        | 30         | How strong the buying/selling intent is |
| Engagement    | 25         | Message frequency, responsiveness       |
| Reliability   | 30         | Visit attendance, can go negative       |
| Urgency       | 15         | Time-sensitivity of the requirement     |

### Total Score Formula

```
Total Score = intent_score + engagement_score + reliability_score + urgency_score
Clamped to range: [0, 100]
```

Each component is accumulated additively per event, capped at its individual maximum.
The total score is `Math.max(0, Math.min(100, sum_of_all_components))`.

### Lead Status Thresholds

```
if total_score >= 80 --> "hot"
if total_score >= 60 --> "warm"
otherwise            --> "cold"
```

### No-Show Handling

```
On each no-show event:
  1. reliability_score -= 20 (can go below 0)
  2. no_show_count += 1
  3. last_no_show_at = now

Recovery logic:
  - 1st no-show: Send WhatsApp template "rp_noshow_recovery" (reschedule offer)
  - 2nd+ no-show: Force lead_status = "cold" (priority downgrade)
```

---

## 2. Buyer Workflow

**File:** `workflows/buyer.ts`

### States

```
INTAKE --> QUALIFICATION --> MATCHING --> WARM
```

| State          | Entry Condition              | Action                                         |
|----------------|------------------------------|-------------------------------------------------|
| INTAKE         | lead_status = "cold"         | AI classifies intent (BUYER/TENANT)             |
| QUALIFICATION  | lead_status != "cold"        | Gather budget, location, property type, timeline|
| MATCHING       | All key fields collected      | Show matching properties, compare options       |
| WARM           | Visit scheduled / engaged    | Active engagement, visit management             |

### Logic Flow

1. **INTAKE**: If AI classifies intent as BUYER or TENANT, generate a dynamic reply asking for missing info (budget, location, type) and transition to QUALIFICATION.
2. **QUALIFICATION**: Loop that asks clarifying questions via LLM until all requirements are gathered. Uses `SystemPromptService.getBuyerPrompt()` with context about missing fields.
3. **MATCHING/WARM**: Handled by the SalesAgent and CoordinationAgent once a transaction is created.

---

## 3. Seller Workflow

**File:** `workflows/seller.ts`

### States

```
INTAKE --> PROPERTY_DETAILS --> PRICING --> ACTIVE --> MATCHED
```

### Data Collection Logic

1. **Property Type Extraction**: Keyword matching against a type map:
   ```
   flat/apartment --> "flat"
   house/villa/bungalow --> "house"
   plot/land --> "plot"
   office --> "office"
   shop --> "shop"
   ```
2. **Location Extraction**: If property type is known but location is not, and the message does not contain property keywords, the message text is treated as the location.
3. **Warm Upgrade**: When both `property_type` AND `preferred_location` are collected:
   ```
   lead_status = "warm"
   ai_summary = "Seller: {type} in {location}. Price info: {message}"
   ```
4. **AI Response**: Uses `SystemPromptService.getSellerPrompt()` with context about current lead status, intent, property type, location, and whether price has been discussed.

---

## 4. Partner Agent Workflow

**File:** `workflows/partner_agent.ts`

### Flow

```
Registration Check --> Inventory Session? --> Intent Detection --> Response
```

### Detailed Logic

1. **No Profile**: If `PartnerAgent` record does not exist, redirect to `/agent/register`.
2. **Active Inventory Session**: If a session exists and state is not `COMMIT`, continue the Inventory State Machine flow (see Section 8).
3. **Intent: Add Inventory**: Keywords `add` + (`property`|`flat`|`list`|`inventory`) start a new inventory session via `InventoryStateMachine.startSession()`.
4. **Intent: Check Visits**: Keywords `visit`|`appointment` fetch today's `ScheduledVisit` records for the partner. Displays time, name, and masked/unmasked buyer info.
5. **Intent: Update Listing**: Keywords `update` + (`rent`|`price`) redirect to dashboard `/agent/inventory` for security.
6. **Fallback: Two Modes**:
   - **HAS_PROPERTIES** mode: Partner has properties to list (property keywords detected).
   - **HAS_BUYERS** mode: Partner has buyers to match (buyer keywords detected).
   - Both modes update `partner_type` in the database and use mode-specific system prompts.
7. **General**: No specific intent detected -- generic partner LLM conversation.

---

## 5. Unknown Contact Identification Workflow

**File:** `workflows/unknown.ts`

### Confidence-Based Classification

```
Confidence Threshold = 60%

if classification.confidence < 60% OR type == "UNKNOWN":
    Ask clarifying question (do NOT mis-classify)
else:
    Update contact_type in database
    Set intent (buy/rent/sell/rent-out)
    Send type-specific acknowledgment
```

### Contact Type Acknowledgments

| Type            | Response                                                   |
|-----------------|------------------------------------------------------------|
| BUYER_TENANT    | "I understand you're looking for a property..."            |
| SELLER_LANDLORD | "I understand you have a property to sell or rent out..."  |
| PARTNER_AGENT   | "I see you're a property dealer..."                        |
| MANAGEMENT      | "Welcome, boss!"                                           |

---

## 6. Management Command Workflow

**File:** `workflows/management.ts`

### Supported Commands

| Command Pattern               | Action                                         |
|-------------------------------|-------------------------------------------------|
| `leads`, `today`              | Show new leads count, hot leads, total contacts |
| `report`, `stats`, `summary`  | Daily report: interactions, new contacts, active properties, type breakdown |
| `team`, `agent`, `employee`   | Team status: name, role, status, assigned leads |
| `help`, `command`             | Show command menu                               |
| (anything else)               | AI-generated management response                |

---

## 7. Transaction State Machine

**File:** `services/transaction_state_machine.ts`

### State Diagram

```
NEW --> MATCHED --> VISIT_SCHEDULED --> VISITED --> NEGOTIATION --> CLOSED_WON
 |        |              |                |             |
 |        |              |                |             +--> ON_HOLD
 |        |              |                +--> VISIT_SCHEDULED (re-visit)
 |        |              |                +--> ON_HOLD
 |        |              +--> ON_HOLD
 |        +--> ON_HOLD
 +--> ON_HOLD

Any active state --> CLOSED_LOST
CLOSED_LOST --> NEW (admin-only reopen)
ON_HOLD --> (any previous active state)
CLOSED_WON --> (terminal, no transitions)
```

### Valid Transitions Table

| From             | Valid Next States                                              |
|------------------|----------------------------------------------------------------|
| NEW              | MATCHED, CLOSED_LOST, ON_HOLD                                 |
| MATCHED          | VISIT_SCHEDULED, CLOSED_LOST, ON_HOLD                         |
| VISIT_SCHEDULED  | VISITED, CLOSED_LOST, ON_HOLD                                 |
| VISITED          | NEGOTIATION, VISIT_SCHEDULED (re-visit), CLOSED_LOST, ON_HOLD |
| NEGOTIATION      | CLOSED_WON, CLOSED_LOST, ON_HOLD, VISIT_SCHEDULED (re-visit)  |
| CLOSED_WON       | (none -- terminal)                                             |
| CLOSED_LOST      | NEW (admin reopen)                                             |
| ON_HOLD          | NEW, MATCHED, VISIT_SCHEDULED, VISITED, NEGOTIATION, CLOSED_LOST |

### Transition Rules

- **ON_HOLD entry**: `previous_status` saved for recovery.
- **ON_HOLD exit**: `previous_status` cleared.
- **Terminal states (CLOSED_WON, CLOSED_LOST)**: `closed_at` timestamp set.
- **Reopen (CLOSED_LOST --> NEW)**: `closed_at` and `previous_status` nullified.
- **Every transition**: Logged atomically to `TransactionLog` in a Prisma `$transaction`.
- **Log actions**: `STATUS_CHANGED`, `CLOSED`, `REOPENED` depending on context.

### Status Labels

```
NEW             --> "New Inquiry"
MATCHED         --> "Property Matched"
VISIT_SCHEDULED --> "Visit Scheduled"
VISITED         --> "Visit Completed"
NEGOTIATION     --> "In Negotiation"
CLOSED_WON      --> "Deal Closed (Won)"
CLOSED_LOST     --> "Deal Closed (Lost)"
ON_HOLD         --> "On Hold"
```

### Transaction Service (services/transaction_service.ts)

- **Duplicate Prevention**: Before creating a transaction, checks for existing active transaction with the same `demand_contact_id` (and optionally same `inventory_id`). Duplicates are logged as `DUPLICATE_BLOCKED`.
- **Auto Executive Assignment**: Every new transaction auto-assigns an internal sales executive (see Section 25).
- **Active Statuses**: NEW, MATCHED, VISIT_SCHEDULED, VISITED, NEGOTIATION, ON_HOLD.
- **Transaction Context**: Used by Role Context Detector to determine if a phone number is currently acting as demand, supply, or executive.

---

## 8. Inventory State Machine

**File:** `workflows/inventory_machine.ts`

### States

```
START
  --> PROPERTY_CATEGORY_SELECTION
    --> PROPERTY_TYPE_SELECTION
      --> PROPERTY_SPEC_COLLECTION
        --> AMENITIES_COLLECTION
          --> LOCATION_COLLECTION
            --> PRICE_COLLECTION
              --> MEDIA_COLLECTION
                --> EXTRA_DETAILS
                  --> KEY_HOLDER_COLLECTION
                    --> SUMMARY_CONFIRMATION
                      --> COMMIT
```

### Step-by-Step Details

| State                        | Collects                           | Notes                                                |
|------------------------------|------------------------------------|------------------------------------------------------|
| PROPERTY_CATEGORY_SELECTION  | Category (residential, commercial) | Fetches categories from DB, resolves by slug/name    |
| PROPERTY_TYPE_SELECTION      | Type (flat, house, plot, etc.)     | Fetches sub-categories and types from DB hierarchy   |
| PROPERTY_SPEC_COLLECTION     | Bedrooms, bathrooms, area (sqft)   | Free-text input parsed by LLM                        |
| AMENITIES_COLLECTION         | Amenities list                     | Keyword parser maps to structured features JSON      |
| LOCATION_COLLECTION          | Address, locality, city            | Free-text                                            |
| PRICE_COLLECTION             | Expected price (raw number)        | Numeric input                                        |
| MEDIA_COLLECTION             | Photos/videos or "skip"            | Optional media upload                                |
| EXTRA_DETAILS                | Furnishing, floor, facing, age     | Free-text extras                                     |
| KEY_HOLDER_COLLECTION        | Who holds the property key         | Three options: UPLOADER, OWNER, EXTERNAL             |
| SUMMARY_CONFIRMATION         | User confirms or cancels           | Displays formatted summary; YES to publish, NO to cancel |
| COMMIT                       | (Terminal)                         | Property published to inventory                      |

### Amenity Keyword Mapping

```
parking -> parking        lift/elevator -> lift
garden  -> garden         pool/swimming -> pool
gym     -> gym            security/guard -> security
power/backup/generator -> power_backup
water/borewell -> water_supply
club/clubhouse -> club_house
intercom -> intercom      gas/pipeline -> gas_pipeline
```

### Key Holder Types

```
1 / "main" / "uploader" / "mere"  --> UPLOADER
2 / "owner" / "malik"             --> OWNER
3 / "agent" / "dealer" / "aur"    --> EXTERNAL (with optional name/phone)
Default                           --> UPLOADER
```

---

## 9. Staff Call Processing Pipeline

**File:** `queues/workers/scheduled_worker.ts` (call-processor job)

### States

```
UPLOADING --> PROCESSING --> TRANSCRIBED --> READY_FOR_REVIEW --> APPROVED / REJECTED
```

### Pipeline Steps

1. **PROCESSING**: Job picks up `StaffCall` records with `status = 'PROCESSING'` and a non-null `recording_url` (max 2 per run).
2. **Transcription**: `transcriptionService.transcribeAudio()` with `language: 'auto'`.
3. **TRANSCRIBED**: Transcript text saved. Status updated to `TRANSCRIBED`.
4. **Extraction**: `callExtractor.extractFromTranscript()` runs AI extraction on the transcript.
5. **READY_FOR_REVIEW**: AI extraction and confidence score saved. Awaiting human review.
6. **APPROVED/REJECTED**: Manual review step (via admin dashboard).
7. **Failure**: On error, status set to `REJECTED` with error message in transcript field.

---

## 10. Property Matching Algorithm (MatchingEngine)

**File:** `services/matching_engine.ts`

### Match Score Calculation (0-100 points, normalized)

| Criterion      | Max Points | Scoring Method                                     |
|----------------|------------|----------------------------------------------------|
| Budget fit     | 40         | Perfect fit = 40; proportional decay for over/under|
| Location match | 30         | Exact = 30; partial city-word match = 15           |
| Property type  | 20         | Substring match = 20                               |
| BHK match      | 10         | Exact = 10; +/-1 bedroom = 5                       |

### Score Normalization

```
final_score = (raw_score / max_applicable_score) * 100
```

Only criteria that are specified by the buyer contribute to `max_applicable_score`.
If no criteria provided, base score = 50.

### Subscription Tier Bonus

Tier bonus is added as: `match_score += tier_priority * 0.2` (up to +20 points).

```
INTERNAL  = 100 priority --> +20 bonus
PREMIUM   =  90 priority --> +18 bonus
PRO       =  70 priority --> +14 bonus
BASIC     =  50 priority --> +10 bonus
FREE      =  30 priority --> +6 bonus
```

### Search Fallback Strategy (Progressive Broadening)

```
Step 1: Exact match (all criteria)
Step 2: Broaden location (remove sector/phase numbers)
Step 3: Remove location filter entirely (same city/region)
Step 4: Remove budget filter (widest search)
```

### Budget Tolerance

The database query uses a **30% tolerance** on budget:
```
price >= budget_min * 0.7   (30% below minimum)
price <= budget_max * 1.3   (30% above maximum)
```

### Location Broadening

```
"vaishali sector 4" --> "vaishali"
"DLF Phase 3"       --> "DLF"
Removes: sector, phase, block, pocket, extension + trailing numbers
```

### Data Masking

FREE-tier agents cannot see buyer contact information. `shouldMaskBuyerData()` returns `true` for external owners on FREE plan.

### WhatsApp Format

Results formatted with:
- Property type, BHK, price (Cr/Lakh for sale, /month for rent)
- Location, area, furnishing, floor
- Top 4 amenities
- Match score percentage
- Reply shortcuts: "1", "2", "3" for details; "more" for next batch; "schedule visit" to book

---

## 11. Marketplace Priority Scoring (MatchingService)

**File:** `services/matching.ts`

### Priority Hierarchy

```
Internal              = 100
Builder PREMIUM       = 100 (85 base + 15 type bonus)
Agency PRO            =  80 (70 base + 10 type bonus)
Agent PRO             =  70
Builder FREE          =  65 (50 base + 15 type bonus)
Agent BASIC           =  60 (50 base + 10 type bonus)
Agent FREE            =  50
```

### Sorting

1. **Primary**: Priority score (descending)
2. **Secondary**: `created_at` recency (newest first)
3. **Result limit**: Top 5 matches returned

Priority is calculated by `PermissionEngine.calculatePriority()` using the unified Owner model.

---

## 12. Message Routing Logic (Master Orchestrator)

**File:** `services/message_router.ts`

### Full Pipeline

```
1. Rate limit check (SecurityAgent)
2. For UNKNOWN contacts: Consolidated LLM classification
   (contact_type + domain_intent + language in ONE call)
3. For known contacts: Detect language (non-blocking, separate call)
4. Get or create session (SessionStore)
5. Classify domain intent
6. Detect role context (DEMAND / SUPPLY / INTERNAL)
7. Load active transactions
8. Build AgentContext
9. Select and route to agent
10. Apply metadata updates from agent response
11. Update session state
12. Re-classify contact if UNKNOWN was identified
13. Log agent action to audit trail
14. QA post-hook (20% sample rate for quality checks)
```

### Domain Intent Classification

| Contact Type     | Classification Method               |
|------------------|--------------------------------------|
| UNKNOWN          | From consolidated `classifyFull()` result (single LLM call) |
| BUYER_TENANT     | Default: PROPERTY (keyword check for APPOINTMENT) |
| SELLER_LANDLORD  | Default: PROPERTY (keyword check for APPOINTMENT) |
| Others           | LLM `classifyDomainIntent()` call   |

Appointment keywords: `appointment`, `schedule`, `visit`, `meeting`, `book`, `reschedule`, `cancel visit`.

### Agent Selection (Transaction-Aware)

```
UNKNOWN contacts           --> ClassifierAgent
INTERNAL role              --> AdminAgent
DEMAND + APPOINTMENT intent--> CoordinationAgent
DEMAND + VISIT_SCHEDULED   --> CoordinationAgent
DEMAND (all other)         --> SalesAgent
SUPPLY + APPOINTMENT       --> CoordinationAgent
SUPPLY + SELLER_LANDLORD   --> SalesAgent (individual owners)
SUPPLY + PARTNER/BUILDER   --> PartnerAgentHandler
Fallback                   --> SalesAgent
```

### Metadata Updates

The orchestrator writes these fields back to the contact record from agent responses:
`property_type`, `preferred_location`, `lead_status`, `ai_summary`, `intent`,
`lifecycle_stage`, `budget_min`, `budget_max`, `timeline`.

### QA Sampling

20% of responses are sent asynchronously to the QA Agent for quality scoring.
This is fire-and-forget and never blocks the user response.

---

## 13. Role Context Detection

**File:** `services/role_context_detector.ts`

### Detection Priority (5 layers)

```
1. Identity check (Agent/Owner tables)
   - Agent table match    --> INTERNAL (confidence: 0.95)
   - Owner/Builder match  --> SUPPLY   (confidence: 0.85)
   - PartnerAgent         --> fall through to transaction check

2. Active transaction check
   - Executive role only  --> INTERNAL (confidence: 0.95)
   - Demand only          --> DEMAND   (confidence: 0.9)
   - Supply only          --> SUPPLY   (confidence: 0.9)
   - Both roles           --> disambiguate by contact_type or recency (confidence: 0.6-0.7)

3. Session state check
   - Seller/listing flow  --> SUPPLY   (confidence: 0.85)
   - Buyer/search flow    --> DEMAND   (confidence: 0.85)
   - Management/admin     --> INTERNAL (confidence: 0.9)
   - Partner agent        --> SUPPLY   (confidence: 0.8)

4. Contact type fallback
   - BUYER_TENANT         --> DEMAND   (confidence: 0.7)
   - SELLER_LANDLORD      --> SUPPLY   (confidence: 0.7)
   - PARTNER_AGENT        --> SUPPLY   (confidence: 0.6)
   - MANAGEMENT           --> INTERNAL (confidence: 0.8)

5. LLM classification (last resort)
   - Prompt-based         --> DEMAND/SUPPLY/INTERNAL (confidence: 0.6)
   - On error             --> DEMAND (confidence: 0.3, safe fallback)
```

### Dual-Role Resolution

When a contact has both demand AND supply transactions:
1. Use `contact_type` to favor one side.
2. If ambiguous, most recently updated transaction wins.

---

## 14. Contact Identifier

**File:** `services/contact_identifier.ts`

### Identification Order

```
1. Agent table   (internal team) --> MANAGEMENT
2. PartnerAgent table (external dealers) --> PARTNER_AGENT
3. Owner table   (builders, type = REAL_ESTATE_BUILDER) --> REAL_ESTATE_BUILDER
4. Not found     --> null (contact remains UNKNOWN)
```

### Phone Format Handling

WhatsApp may send `919958860411` while DB stores `+919958860411`.
The identifier checks multiple variants via `phoneVariants()` to handle format mismatches.

---

## 15. Quiet Hours

**File:** `utils/quiet_hours.ts`

### Rules

```
Quiet Window: 9:00 PM - 8:00 AM IST daily (21:00 - 07:59)
Timezone:     IST (UTC+5:30)
```

### Exemptions

- **Management contacts** (super_boss, manager) are exempt from quiet hours.
  Callers must check `contact_type` before applying quiet hours.

### Behavior During Quiet Hours

- **Follow-up messages**: Skipped entirely (FollowupScheduler, InteractionEngine).
- **Decision Engine actions**: Rescheduled to 8:00 AM IST + 5 minutes buffer.
- **Pending Message Queue**: Messages queued but re-opener template deferred.
- **Subscription expiry notifications**: Deferred.

### Utility Functions

```
isQuietHours()      --> boolean (true during 21:00-07:59 IST)
msUntilQuietEnd()   --> milliseconds until 8:00 AM IST
getISTHour()        --> current hour in IST (0-23)
```

---

## 16. WhatsApp Session Window Tracker

**File:** `services/session_tracker.ts`

### Meta's 24-Hour Rule

WhatsApp Business API allows free-form text replies only within 24 hours of the user's last inbound message. Outside this window, only pre-approved templates can be sent.

### Implementation

```
SESSION_WINDOW_MS = 24 * 60 * 60 * 1000 (24 hours)

isSessionActive(phone):
  elapsed = now - contact.last_wa_inbound
  return elapsed < 24 hours

markInbound(phone):
  Update contact.last_wa_inbound = now
  (called from webhook handler on every inbound message)

smartSend(whatsapp, phone, freeFormMsg, templateName, params):
  if session active:  send free-form text
  if session expired: send Meta-approved template
```

---

## 17. Pending Message Queue

**File:** `services/pending_message_queue.ts`

### Purpose

When the AI wants to send a personalized follow-up but the 24h session window has expired:

```
1. Queue the LLM message in PendingMessage table (status: "pending")
2. Send a Meta-approved "re-opener" template (rp_reopen_session)
3. When user replies (re-opening session), deliver queued messages
4. Messages auto-expire after 48 hours if user doesn't reply
```

### Queue and Re-open Flow

```
queueAndReopen(phone, message, context):
  1. Create PendingMessage (expires_at = now + 48h)
  2. If quiet hours: skip re-opener, just queue
  3. Else: send "rp_reopen_session" template with contact name and context
     - context = "listing" for SELLER_LANDLORD, "search" for others

deliverPending(phone):
  1. Find all pending, non-expired messages for phone
  2. Send each via whatsapp.sendText()
  3. Mark as "sent"

cleanupExpired():
  Mark all expired pending messages as "expired"
  (Run periodically)
```

---

## 18. Follow-up Scheduler

**File:** `services/followup_scheduler.ts`

### Configuration

```
FOLLOWUP_HOURS       = 48 (hours of silence before triggering)
MAX_FOLLOWUPS_PER_RUN = 20
Interval             = 1 hour
```

### Target Contacts

```
WHERE:
  lead_status IN ('warm', 'hot')
  contact_type IN ('BUYER_TENANT', 'SELLER_LANDLORD')
  last_interaction < (now - 48 hours)
  NO pending whatsapp tasks exist
ORDER BY: last_interaction ASC (oldest first)
LIMIT: 20 per run
```

### Follow-up Logic

1. **Quiet hours check**: Skips entire run during 9 PM - 8 AM IST.
2. **Generate personalized message**: LLM generates 2-3 sentence follow-up based on:
   - Contact type (buyer vs seller)
   - Intent, lead status, location, property type
   - Contact name
3. **Session-aware delivery**:
   - If 24h session active: Send free-form text directly.
   - If session expired: Queue message + send re-opener template via `PendingMessageQueue`.
4. **Logging**: Interaction record created, TaskFollowup record created, `last_interaction` updated.

---

## 19. Interaction Engine (Transaction-based Triggers)

**File:** `services/interaction_engine.ts`

### Interaction Probability Matrix

For each transaction status, expected user actions and their probabilities:

| Status          | Expected Actions (with probability %)                               |
|-----------------|---------------------------------------------------------------------|
| NEW             | provide_requirements (90%), ask_about_services (5%), go_silent (5%) |
| MATCHED         | ask_property_details (60%), schedule_visit (25%), reject_match (10%), go_silent (5%) |
| VISIT_SCHEDULED | confirm_visit (50%), reschedule (25%), cancel (15%), go_silent (10%)|
| VISITED         | share_feedback (40%), negotiate_price (30%), request_more (20%), go_silent (10%) |
| NEGOTIATION     | discuss_price (45%), agree_deal (15%), walk_away (10%), request_revisit (15%), go_silent (15%) |
| CLOSED_WON      | paperwork_questions (70%), referral (20%), go_silent (10%)         |
| CLOSED_LOST     | re_engage (40%), permanent_exit (60%)                              |

### Trigger Rules

| Transaction Status | Silence Hours | Template Key                    | Max Fires | Description                    |
|--------------------|---------------|---------------------------------|-----------|--------------------------------|
| NEW                | 24h           | tx_followup_new                 | 2         | Ask for budget/location/type   |
| MATCHED            | 12h           | tx_followup_matched             | 2         | Send match summary, encourage visit |
| VISIT_SCHEDULED    | 24h           | tx_reminder_visit_day_before    | 1         | Day-before visit reminder      |
| VISIT_SCHEDULED    | 2h            | tx_reminder_visit_2h            | 1         | 2-hour visit reminder          |
| VISITED            | 48h           | tx_followup_visited             | 2         | Ask for visit feedback         |
| NEGOTIATION        | 72h           | tx_followup_negotiation         | 3         | Executive nudge deal forward   |
| CLOSED_WON         | 168h (7 days) | tx_followup_won                 | 1         | Ask for referral or review     |
| CLOSED_LOST        | 720h (30 days)| tx_followup_lost                | 1         | Re-engagement with new listings|

### Trigger Firing Conditions

```
1. Silence duration >= rule.silenceHours
2. For visit reminders: check actual appointment time instead of silence
   - Day-before: fires when visit is 20-28 hours away
   - 2h reminder: fires when visit is 1.5-3 hours away
3. Previous fires < rule.maxFires for this template
4. No follow-up sent in last 6 hours (anti-spam)
5. Not during quiet hours (9 PM - 8 AM IST)
```

### Message Delivery

- **Meta template available**: Send via `whatsapp.sendTemplate()` with mapped template name and parameters.
- **No template**: LLM-generated fallback message (within session window only).
- **Executive notification**: Assigned executive receives a WhatsApp alert about the follow-up via `SessionTracker.smartSend()`.

### Configuration

```
MAX_FOLLOWUPS_PER_RUN = 30
CHECK_INTERVAL_MS     = 3,600,000 (1 hour)
Transactions checked  = up to 100 per run (oldest updated_at first)
```

---

## 20. Decision Engine

**File:** `services/decision_engine.ts`

### Capabilities

1. **Outbound Call Trigger**: Initiates voice calls with a scripted greeting via VoiceService.
2. **Missed Call Handling**: Schedules a WhatsApp follow-up 15 minutes after a missed call:
   ```
   next_action_at = now + 15 minutes
   next_action_type = "whatsapp_missed_call"
   ```
3. **Execute Next Action**: Processes scheduled actions from the `next_action_at` field:
   - During quiet hours: Reschedule to 8:00 AM IST + 5 minute buffer.
   - `whatsapp_missed_call`: Send `rp_missed_call` template + log interaction.

---

## 21. Workflow Automation Engine

**File:** `services/workflow_engine.ts`

### Event-Driven Architecture

The engine is an event-driven automation system using Node.js `EventEmitter`.

### Supported Triggers

```
LEAD_CREATED
STATUS_CHANGED
PROPERTY_ADDED
APPOINTMENT_SCHEDULED
APPOINTMENT_COMPLETED
INTERACTION_RECEIVED
LIFECYCLE_STAGE_CHANGED
```

### Supported Actions

```
ASSIGN_AGENT       --> Update contact.assigned_to
SEND_WHATSAPP      --> Queue WhatsApp message
SEND_EMAIL         --> Queue email
CREATE_TASK        --> Create TaskFollowup
UPDATE_STATUS      --> Update contact.lead_status
SEND_VOICE_CALL    --> Trigger voice call
UPDATE_FIELD       --> Update any contact field
```

### Condition Operators

```
equals, not_equals, contains, greater_than, less_than, in, not_in
```

### Execution Flow

```
1. Trigger event emitted
2. Find all enabled workflows matching the trigger (ordered by priority)
3. For each workflow:
   a. Evaluate conditions (AND logic -- all must pass)
   b. If conditions met: execute actions sequentially
   c. If a "critical" action fails: stop execution
   d. If delay_minutes > 0: schedule via setTimeout
4. Log execution to WorkflowExecution table (SUCCESS/FAILED/SKIPPED)
```

### Helper Functions

```
triggerLeadCreated(leadData)
triggerStatusChanged(contactData, oldStatus, newStatus)
triggerPropertyAdded(propertyData)
triggerAppointmentScheduled(appointmentData)
triggerAppointmentCompleted(appointmentData)
triggerInteractionReceived(interactionData)
triggerLifecycleStageChanged(contactData, oldStage, newStage)
```

---

## 22. BullMQ Job Queues and Scheduled Jobs

### Queue Definitions (queues/index.ts)

| Queue              | Purpose                             | Retry   | Backoff        | Completed Retention | Failed Retention |
|--------------------|--------------------------------------|---------|----------------|---------------------|------------------|
| whatsapp-inbound   | Async inbound webhook processing     | 3       | Exponential 2s | Last 1,000          | Last 5,000       |
| scheduled-jobs     | Cron/repeatable jobs                 | 2       | Fixed 5s       | Last 500            | Last 1,000       |

### WhatsApp Inbound Worker (queues/workers/whatsapp_inbound.ts)

```
Concurrency:  1 (serial -- prevents session race conditions)
Rate Limit:   30 jobs per 60 seconds
On failure:   Alert if all 3 retries exhausted (DLQ)
```

### Scheduled Jobs (queues/workers/scheduled_worker.ts)

```
Concurrency:  3 (max 3 cron jobs in parallel)
```

| Job Name             | Schedule              | IST Time       | Description                                |
|----------------------|-----------------------|----------------|--------------------------------------------|
| pending-actions      | Every 60 seconds      | Continuous     | Check contacts with pending next_action_at  |
| daily-report         | Cron: `30 15 * * *`   | 9:00 PM IST   | Generate and send daily summary             |
| subscription-expiry  | Cron: `30 18 * * *`   | 12:00 AM IST  | Check and expire partner subscriptions      |
| qa-health-report     | Cron: `30 3 * * *`    | 9:00 AM IST   | AI quality health report to management      |
| qa-integrity-check   | Cron: `30 21 * * *`   | 3:00 AM IST   | Data integrity scan                         |
| ai-boss-cycle        | Cron: `30 20 * * *`   | 2:00 AM IST   | Nightly AI self-improvement orchestration   |
| followup-check       | Every 3,600,000ms     | Hourly         | Execute follow-ups for stale warm/hot leads |
| call-processor       | Every 10,000ms        | Every 10 sec   | Process pending call recordings             |
| interaction-triggers | Every 3,600,000ms     | Hourly         | Check transaction-based follow-up triggers  |
| security-scan        | Every 3,600,000ms     | Hourly         | Run anomaly detection and security checks   |

### IST to UTC Conversions

```
 2:00 AM IST = 20:30 UTC (previous day)
 3:00 AM IST = 21:30 UTC (previous day)
 9:00 AM IST =  3:30 UTC
 9:00 PM IST = 15:30 UTC
12:00 AM IST = 18:30 UTC (previous day)
```

---

## 23. Commission Calculation

**File:** `services/commission.ts`

### Commission Rules (Phase 13: Unified Owner Model)

```
FREE plan owners:           2% commission to platform
BASIC/PRO/PREMIUM plans:    No commission
```

Commission applies to ALL external owner types (agents, agencies, builders) equally.
The differentiator is the subscription plan, not the owner type.

### Deal Closure Flow

```
processDealClosure(visitId, dealValue, propertyId):
  1. Fetch property --> owner --> subscription
  2. Calculate commission:
     - If plan != FREE: return { required: false }
     - If plan == FREE: amount = dealValue * 2 / 100
  3. If commission required:
     - Create Commission record (status: PENDING)
     - Fields: owner_id, visit_id, property_id, deal_value, rate, amount
  4. Return result
```

### Commission Lifecycle

```
PENDING --> APPROVED --> PAID
```

- `markAsPaid(commissionId)`: Updates status to `PAID`, sets `paid_at` timestamp.
- `getPendingCommissions(ownerId)`: Lists all unpaid commissions for an owner.

---

## 24. Subscription Plans and Permission Engine

**File:** `services/permission_engine.ts`

### Plan Permission Matrix

| Feature               | FREE | BASIC | PRO  | PREMIUM |
|-----------------------|------|-------|------|---------|
| Listing Limit         | 10   | 25    | 50   | 999     |
| See Buyer Phone       | No   | Yes   | Yes  | Yes     |
| Add Project           | No   | No    | No   | Yes (builders only) |
| View Analytics        | No   | No    | Yes  | Yes     |
| Priority Base         | 50   | 60    | 70   | 85      |
| Data Retention (days) | 30   | 90    | 365  | 365     |
| Price (per month)     | Free | 999   | 2499 | 4999    |

### Features by Plan

```
FREE:    basic_listing, lead_notifications
BASIC:   + buyer_contact
PRO:     + analytics
PREMIUM: + priority_matching, featured_listings
```

### Priority Score Calculation

```
Internal owner (scope = INTERNAL):  always 100

External owner:
  priority = plan_base + type_bonus

Type bonuses:
  REAL_ESTATE_BUILDER  = +15
  PROPERTY_AGENT       = +10
  INDIVIDUAL_AGENT     = +0

Examples:
  Builder PREMIUM = 85 + 15 = 100
  Agency PRO      = 70 + 10 = 80
  Agent PRO       = 70 + 0  = 70
  Builder FREE    = 50 + 15 = 65
  Agent BASIC     = 60 + 0  = 60
  Agent FREE      = 50 + 0  = 50
```

### Data Masking Rules

FREE plan owners cannot see buyer data:
```
maskPhone: true   (if canSeeBuyerPhone = false)
maskEmail: true
maskName:  true
```

Masking examples:
```
+919876543210 --> +91XXXXXX210
buyer@gmail.com --> b***r@gmail.com
John Doe --> J*** D***
```

### Subscription Duration

```
FREE:         No expiry
BASIC/PRO/PREMIUM: 30 days from start
```

### Listing Limit Check

```
canAddListing(ownerId):
  1. Check owner.status == 'ACTIVE'
  2. Count active inventory listings
  3. If count >= plan limit: deny with upgrade message
  4. Otherwise: allow
```

### Project Permission (Builders Only)

```
canAddProject(ownerId):
  1. Must be REAL_ESTATE_BUILDER type
  2. Must have PREMIUM plan
  3. Otherwise: deny
```

---

## 25. Executive Assignment

**File:** `services/executive_assigner.ts`

### Algorithm (3-tier priority)

```
MAX_ACTIVE_TRANSACTIONS = 20 per agent

Step 1: Locality-based match
  - Agent.department matches transaction.demand_location (case-insensitive substring)
  - If match found: assign immediately

Step 2: Load-based (workload)
  - Sort eligible agents by active transaction count (ascending)
  - If clear winner (2+ fewer transactions than next): assign
  - Active statuses: NEW, MATCHED, VISIT_SCHEDULED, VISITED, NEGOTIATION, ON_HOLD

Step 3: Round-robin fallback
  - Among equally loaded agents, cycle through in order
  - In-memory index (resets on server restart)
```

### Eligible Agents

```
WHERE:
  tenant_id = transaction.tenant_id
  status = 'active'
  role IN ('employee', 'manager')
  (super_boss excluded from auto-assignment)
```

### Capacity Handling

```
If all agents at MAX_ACTIVE_TRANSACTIONS:
  Assign to least-busy agent anyway (no transaction is left unassigned)
```

### Manual Reassignment

```
reassignExecutive(transactionId, newAgentId, performedBy):
  1. Update transaction.executive_agent_id
  2. Log EXECUTIVE_CHANGED to TransactionLog with old/new IDs
```

---

## 26. AI Boss (Self-Improving Orchestrator)

**File:** `services/ai_boss.ts`, `cron/ai_boss_jobs.ts`

### Schedule

```
Runs daily at 2:00 AM IST
```

### Daily Cycle

```
Step 1: Conversation Audit (AuditAgent)
  - Review last 24h of conversations
  - Identify issues, sentiment patterns, quality scores
  - Break down by agent performance

Step 2: Save audit report to AuditReport table

Step 3: Prompt Engineering (PromptEngineerAgent)
  - Only runs if issues were found
  - Auto-deploys prompt improvements to the database
  - Records actions taken and deployment count

Step 4: Email report to Super Boss
  - HTML-formatted email with:
    - Summary cards (conversations, flagged, avg score, fixes deployed)
    - Sentiment breakdown (positive, neutral, negative, frustrated)
    - Issues table (severity, count, examples)
    - Auto-deployed fixes table (section, rule, reason)
    - Agent performance table (messages, avg score, avg response time)
```

### Key Principle

The AI Boss does NOT interact with customers. It reports only to the Super Boss via email and operates entirely during off-hours.

---

## 27. QA Daily Jobs

**File:** `cron/qa_daily_jobs.ts`

### Health Report

```
Schedule: 9:00 AM IST daily
Action:   QAAgent.sendDailyHealthReport()
Target:   All MANAGEMENT contacts via WhatsApp
```

### Data Integrity Check

```
Schedule: 3:00 AM IST daily
Action:   QAAgent.checkDataIntegrity()
Result:   Log issues; alert if critical
```

Both jobs use `setInterval(24h)` after initial `setTimeout` to the target IST hour, and are also registered as BullMQ repeatable jobs for persistence across restarts.

---

## Appendix: Source File Index

| File                                    | Section(s)     |
|-----------------------------------------|----------------|
| `services/lead_score.ts`               | 1              |
| `workflows/buyer.ts`                   | 2              |
| `workflows/seller.ts`                  | 3              |
| `workflows/partner_agent.ts`           | 4              |
| `workflows/unknown.ts`                 | 5              |
| `workflows/management.ts`              | 6              |
| `services/transaction_state_machine.ts`| 7              |
| `services/transaction_service.ts`      | 7              |
| `workflows/inventory_machine.ts`       | 8              |
| `queues/workers/scheduled_worker.ts`   | 9, 22          |
| `services/matching_engine.ts`          | 10             |
| `services/matching.ts`                 | 11             |
| `services/message_router.ts`           | 12             |
| `services/role_context_detector.ts`    | 13             |
| `services/contact_identifier.ts`       | 14             |
| `utils/quiet_hours.ts`                 | 15             |
| `services/session_tracker.ts`          | 16             |
| `services/pending_message_queue.ts`    | 17             |
| `services/followup_scheduler.ts`       | 18             |
| `services/interaction_engine.ts`       | 19             |
| `services/decision_engine.ts`          | 20             |
| `services/workflow_engine.ts`          | 21             |
| `queues/index.ts`                      | 22             |
| `queues/workers/whatsapp_inbound.ts`   | 22             |
| `services/commission.ts`               | 23             |
| `services/permission_engine.ts`        | 24             |
| `services/executive_assigner.ts`       | 25             |
| `services/ai_boss.ts`                  | 26             |
| `cron/ai_boss_jobs.ts`                 | 26             |
| `cron/qa_daily_jobs.ts`                | 27             |
| `services/scheduler.ts`               | 22 (legacy)    |
