# LLM & AI System Architecture

> Complete documentation of the AI/LLM infrastructure powering Panditji, Realty Pandit's intelligent property assistant.

---

## Table of Contents

1. [LLM Service Architecture](#1-llm-service-architecture)
2. [LLM Methods](#2-llm-methods)
3. [Smart Caching](#3-smart-caching)
4. [Message Flow](#4-message-flow)
5. [All 14 AI Agents](#5-all-14-ai-agents)
6. [System Prompts](#6-system-prompts)
7. [AI Chat (Website)](#7-ai-chat-website)
8. [Call Intelligence](#8-call-intelligence)

---

## 1. LLM Service Architecture

**File:** `agents/backend/src/services/llm.ts` (446 lines)

### Model

- **Provider:** Google Gemini via `@google/generative-ai` SDK
- **Model:** `gemini-2.5-flash` (Paid Tier 1)
- **Initialization:** Lazy -- the model is NOT initialized in the constructor. It is created on the first call to `getModel()`, which checks for the `GEMINI_API_KEY` environment variable.

### Rate Limiter

- **Type:** Token bucket algorithm
- **Limit:** 500 RPM (requests per minute)
- **Headroom:** 50% below the paid tier cap of 1,000 RPM
- **Behavior:** Each call to `callGemini()` first calls `rateLimiter.acquire()`. If the bucket is empty, the fallback string is returned immediately instead of making an API call.
- **Refill:** Tokens refill continuously at `maxRequestsPerMinute / 60000` tokens per millisecond.

```
class RateLimiter {
    maxTokens: 500
    refillRate: 500 / 60000 = ~0.0083 tokens/ms
}
```

### Circuit Breaker

**File:** `agents/backend/src/utils/circuit_breaker.ts`

Prevents cascading failures when Gemini or WhatsApp APIs go down. Implements the classic three-state pattern:

| State | Behavior |
|---|---|
| **CLOSED** | Normal operation. Tracks consecutive failures. |
| **OPEN** | API is down. Returns fallback immediately. No API calls made. |
| **HALF_OPEN** | Testing recovery. Allows one call through. Success returns to CLOSED, failure returns to OPEN. |

**Gemini Circuit Breaker Configuration:**

| Parameter | Value |
|---|---|
| `failureThreshold` | 5 consecutive failures before opening |
| `resetTimeout` | 30,000 ms (30 seconds) before trying HALF_OPEN |
| `callTimeout` | 15,000 ms (15 seconds) per Gemini call |

**WhatsApp Circuit Breaker Configuration:**

| Parameter | Value |
|---|---|
| `failureThreshold` | 3 consecutive failures |
| `resetTimeout` | 20,000 ms (20 seconds) |
| `callTimeout` | 10,000 ms (10 seconds) |

Both circuit breakers are exported as singletons (`geminiCircuit`, `whatsappCircuit`) and shared across the entire application.

**Stats endpoint:** `getStats()` returns `{ name, state, failureCount, successCount, lastFailure }` for health check monitoring.

### Mock Mode Fallback

When `GEMINI_API_KEY` is not set:
- The model is replaced with a mock object that returns `"This is a mock AI response. Please set GEMINI_API_KEY."`
- All classification methods still function but return mock/fallback values.
- This allows development and testing without an API key.

### Internal Call Flow

Every LLM call goes through the same pipeline:

```
callGemini(prompt, fallback)
    -> rateLimiter.acquire()        // Token bucket check
    -> getModel()                   // Lazy init (first call only)
    -> geminiCircuit.call(fn, fb)   // Circuit breaker wrapper
        -> model.generateContent()  // Actual Gemini API call (with 15s timeout)
    -> return response.text()
```

---

## 2. LLM Methods

All methods are on the `LLMService` class (`agents/backend/src/services/llm.ts`).

### 2.1 `generateResponse(systemPrompt, userMessage) -> string`

Basic single-shot chat generation. Concatenates system prompt and user message into a single prompt string.

- **Prompt format:** `{systemPrompt}\n\nUser: {userMessage}\nAI:`
- **Fallback:** `"I am currently experiencing high traffic. Please try again in a moment."`
- **No caching** -- every call hits Gemini.

### 2.2 `generateResponseWithHistory(systemPrompt, userMessage, phoneNumber, historyCount=10) -> string`

Chat generation with conversation context. Fetches the last N interactions from the database (Interaction table) for the given phone number and includes them in the prompt.

- **DB Query:** `prisma.interaction.findMany({ where: { phone_number }, orderBy: { created_at: 'desc' }, take: historyCount })`
- **History format:** Each interaction formatted as `User: {content}` or `Panditji: {content}`
- **Prompt format:** `{systemPrompt}\nCONVERSATION HISTORY (last N messages):\n{history}\nUser: {userMessage}\nAI:`
- **Fallback:** If history fetch fails, falls back to `generateResponse()` (no history).
- **Default history:** 10 messages.

### 2.3 `classifyContactType(message) -> string`

Classifies the sender into one of five contact types based on message content.

- **Returns:** `BUYER_TENANT` | `SELLER_LANDLORD` | `PARTNER_AGENT` | `MANAGEMENT` | `UNKNOWN`
- **Cached:** Yes (Redis, 1 hour TTL)
- **Cache key:** `llm:classify_contact:{md5_hash_16chars}`
- **Prompt:** Instructs the LLM to reply with ONLY the category name.
- **Validation:** Response is uppercased and checked against the valid set; invalid responses default to `UNKNOWN`.

### 2.4 `classifyWithConfidence(message) -> { type, intent, confidence }`

Extended classification that includes a confidence score (0-100) and intent detection.

- **Returns:** `{ type: string, intent: string | null, confidence: number }`
- **type:** Same five categories as `classifyContactType`
- **intent:** `buy` | `rent` | `sell` | `rent_out` | `null`
- **confidence:** 0-100 (clamped)
- **Cached:** Yes (Redis, 1 hour TTL)
- **Cache key:** `llm:classify_full:{md5_hash_16chars}`
- **Key rule in prompt:** Sellers are classified as `SELLER_LANDLORD`, NOT `PARTNER_AGENT`, unless they explicitly mention being a broker/dealer/agent.

### 2.5 `classifyIntent(message) -> string`

Lightweight intent classification for known contacts.

- **Returns:** `BUYER` | `TENANT` | `SELLER` | `LANDLORD` | `OTHER`
- **Cached:** Yes (Redis, 1 hour TTL)
- **Cache key:** `llm:classify_intent:{md5_hash_16chars}`

### 2.6 `classifyDomainIntent(message) -> string`

Classifies the topic domain for multi-agent routing.

- **Returns:** `PROPERTY` | `LEGAL` | `LOAN` | `SERVICE` | `APPOINTMENT` | `GENERAL`
- **Cached:** Yes (Redis, 1 hour TTL)
- **Cache key:** `llm:domain:{md5_hash_16chars}`

### 2.7 `detectLanguage(message) -> string`

Detects the language of the user's message.

- **Returns:** `english` | `hindi` | `hinglish`
- **Cached:** Yes (Redis, 24 hour TTL -- language does not change frequently)
- **Cache key:** `llm:lang:{md5_hash_16chars}`
- **Definitions:**
  - `english` -- Written entirely in English
  - `hindi` -- Written in Devanagari script
  - `hinglish` -- Hindi words in Roman/Latin script, or mix of Hindi and English

### 2.8 `classifyFull(message) -> { contactType, domainIntent, language, confidence }`

**The most important classification method.** Consolidated 3-in-1 classification that replaces three separate LLM calls (`classifyContactType` + `classifyDomainIntent` + `detectLanguage`) with a single Gemini call. Saves 66% of API calls for UNKNOWN contacts.

- **Returns:** `{ contactType: string, domainIntent: string, language: string, confidence: number }`
- **contactType:** `BUYER_TENANT` | `SELLER_LANDLORD` | `PARTNER_AGENT` | `MANAGEMENT` | `UNKNOWN`
- **domainIntent:** `PROPERTY` | `LEGAL` | `LOAN` | `SERVICE` | `APPOINTMENT` | `GENERAL`
- **language:** `english` | `hindi` | `hinglish`
- **confidence:** 0-100 (clamped)
- **Cached:** Yes (Redis, 1 hour TTL)
- **Cache key:** `llm:classify_full_v2:{md5_hash_16chars}`
- **Fallback:** `{ contactType: 'UNKNOWN', domainIntent: 'GENERAL', language: 'english', confidence: 0 }`

---

## 3. Smart Caching

All caching uses Redis via `cacheGet(key)` / `cacheSet(key, value, ttlSeconds)` from `agents/backend/src/utils/redis.ts`.

Cache keys are generated by MD5-hashing the lowercased, trimmed message text and taking the first 16 characters:

```typescript
function hashKey(input: string): string {
    return crypto.createHash('md5').update(input.toLowerCase().trim()).digest('hex').substring(0, 16);
}
```

### Cache TTL Summary

| Method | Cache Key Pattern | TTL |
|---|---|---|
| `classifyContactType` | `llm:classify_contact:{hash}` | 1 hour (3,600s) |
| `classifyWithConfidence` | `llm:classify_full:{hash}` | 1 hour (3,600s) |
| `classifyIntent` | `llm:classify_intent:{hash}` | 1 hour (3,600s) |
| `classifyDomainIntent` | `llm:domain:{hash}` | 1 hour (3,600s) |
| `detectLanguage` | `llm:lang:{hash}` | 24 hours (86,400s) |
| `classifyFull` | `llm:classify_full_v2:{hash}` | 1 hour (3,600s) |

### Cache Behavior

- On cache HIT: Returns cached value immediately, no Gemini API call.
- On cache MISS: Calls Gemini, validates response, stores result in Redis, returns.
- JSON results (e.g., `classifyWithConfidence`, `classifyFull`) are serialized with `JSON.stringify` and deserialized with `JSON.parse` on retrieval. Parse errors trigger a fresh classification.

---

## 4. Message Flow

### WhatsApp / Voice Message Flow

```
Incoming WhatsApp/Voice Message
    |
    v
WebhookProcessor
    |-- Normalize phone number (E.164)
    |-- Find or create Contact
    |-- Log Interaction (inbound)
    |
    v
ChatHandler (Interaction Engine)
    |-- Load contact from DB
    |-- Check quiet hours (9 PM - 8 AM IST)
    |     |-- If quiet hours: queue message, don't respond
    |
    v
MessageRouter (Master Orchestrator)
    |-- Security: Rate limit check (SecurityAgent.checkRateLimit)
    |     |-- If rate limited: return "sending messages too quickly" reply
    |
    |-- Classification (for UNKNOWN contacts):
    |     |-- Call LLMService.classifyFull(message) --> 3-in-1 classification
    |     |-- Result: { contactType, domainIntent, language, confidence }
    |     |-- Store language preference in Contact record
    |
    |-- For KNOWN contacts:
    |     |-- Language detection (non-blocking, separate call, cached)
    |     |-- Domain intent:
    |     |     |-- BUYER_TENANT / SELLER_LANDLORD: default PROPERTY (keyword override for APPOINTMENT)
    |     |     |-- PARTNER_AGENT / MANAGEMENT: LLMService.classifyDomainIntent()
    |
    |-- Session Management:
    |     |-- Get or create session (Redis-backed SessionStore)
    |     |-- Track workflow state (unknown, sales_buyer, sales_seller, partner, admin)
    |
    |-- Transaction Context:
    |     |-- Detect role context: DEMAND / SUPPLY / INTERNAL
    |     |-- Find active transactions for this contact
    |
    |-- Build AgentContext:
    |     |-- contact, message, channel, session, domainIntent
    |     |-- roleContext, currentTransaction, activeTransactions
    |     |-- crossAgentData (preClassification, conversationContext)
    |
    v
Agent Selection (selectAgent)
    |-- UNKNOWN --> ClassifierAgent
    |-- Role-based routing (Transaction-aware):
    |     |-- INTERNAL --> AdminAgent
    |     |-- DEMAND + APPOINTMENT --> CoordinationAgent
    |     |-- DEMAND + VISIT_SCHEDULED --> CoordinationAgent
    |     |-- DEMAND (other) --> SalesAgent
    |     |-- SUPPLY + APPOINTMENT --> CoordinationAgent
    |     |-- SUPPLY + SELLER_LANDLORD --> SalesAgent
    |     |-- SUPPLY + PARTNER_AGENT --> PartnerAgent
    |-- Fallback legacy routing:
    |     |-- MANAGEMENT --> AdminAgent
    |     |-- PARTNER_AGENT --> PartnerAgent
    |     |-- Default --> SalesAgent
    |
    v
Selected Agent.handle(context) --> AgentResponse
    |
    v
Post-Processing (MessageRouter):
    |-- Apply metadata updates to Contact (property_type, location, budget, etc.)
    |-- Update session state
    |-- If UNKNOWN was re-classified: update Contact.contact_type, reset session
    |-- Log agent action to AgentActionLog (fire-and-forget)
    |-- QA post-hook: Sample 20% of responses for quality check (fire-and-forget)
    |
    v
Response sent back via WhatsApp / Voice / Website
```

### Website Chat Flow

```
User types message on website
    |
    v
POST /public/ai-chat
    |-- ChatHandler.processMessage(message, filters, sessionId)
    |     |-- Search properties (Prisma query with filters: city, type, budget, intent)
    |     |-- Build system prompt with property context (top 10 results)
    |     |-- LLMService.generateResponse(systemPrompt, userMessage)
    |     |-- Detect action intent (request_phone / book_visit)
    |     |-- Format top 6 properties for response
    |-- Log to Interaction table (if phone provided)
    |
    v
Response: { reply, properties[], action, sessionId }
```

---

## 5. All 14 AI Agents

All agents implement the `BaseAgent` interface defined in `agents/backend/src/agents/types.ts`:

```typescript
interface BaseAgent {
    readonly name: AgentName;
    handle(context: AgentContext): Promise<AgentResponse>;
}
```

Agents receive data through `AgentContext` and return `AgentResponse`. They do NOT access Prisma directly for reads -- data comes through the context. The Master Orchestrator (MessageRouter) handles all DB reads/writes before and after agent calls.

---

### 5.1 ClassifierAgent

**File:** `agents/backend/src/agents/classifier_agent.ts`
**Name:** `classifier`
**Purpose:** Identifies unknown contacts via AI classification with confidence scoring.

**Key Methods:**
- `handle(context)` -- Main classification flow
- `hasOwnerSignal(message)` -- Checks for ownership keywords (owner, malik, mera, my property, etc.)
- `hasAgentSignal(message)` -- Checks for broker/dealer keywords

**Flow:**
1. First checks for pre-classification data from MessageRouter's `classifyFull()` (skip LLM call if confidence >= 60)
2. If no pre-classification or low confidence, calls `LLMService.classifyWithConfidence()`
3. If confidence < 60 or type is UNKNOWN, asks a clarifying question using the identification prompt
4. For sell/rent-out intent without explicit ownership signal, asks "Are you the owner or a dealer?"
5. If explicit broker signal detected, overrides to `PARTNER_AGENT`
6. Returns acknowledgment with classified `contact_type` and `intent`

**Confidence threshold:** 60%

---

### 5.2 SalesAgent

**File:** `agents/backend/src/agents/sales_agent.ts`
**Name:** `sales`
**Purpose:** Handles both BUYER_TENANT and SELLER_LANDLORD contacts. Consolidates buyer and seller workflows into a single agent.

**States:** `INTAKE -> QUALIFICATION -> MATCHING -> NEGOTIATION`

**Key Methods:**
- `handle(context)` -- Routes to `handleBuyer()` or `handleSeller()` based on roleContext/contact_type
- `handleBuyer(context)` -- Buyer/tenant flow with data extraction, intent classification, transaction creation, and auto-matching
- `handleSeller(context)` -- Seller/landlord flow with property data collection, inventory creation, and supply-demand linking
- `extractBuyerData(msg, rawMessage, contact)` -- Regex-based extraction of budget (rent in thousands, sale in lakh/crore), location (known areas, sector patterns), property type, and BHK

**Buyer Flow Detail:**
1. INTAKE: Extract data from message, classify intent (BUYER/TENANT), create Transaction, auto-trigger MatchingAgent if enough data
2. QUALIFICATION: Continue extracting data, handle property selection ("1", "2", "3"), handle "more" results, auto-trigger matching when location OR budget available

**Seller Flow Detail:**
1. Extract property type and location from message
2. When both collected: create Owner record, create Inventory record, find matching demand transactions, link supply
3. Generate LLM response using seller system prompt with transaction context

---

### 5.3 InventoryAgent

**File:** `agents/backend/src/agents/inventory_agent.ts`
**Name:** `inventory`
**Purpose:** Handles multi-step property listing collection through a state machine.

**States:** `START -> CATEGORY -> TYPE -> SPECS -> AMENITIES -> LOCATION -> PRICE -> MEDIA -> EXTRAS -> CONFIRM -> COMMIT`

**Key Methods:**
- `handle(context)` -- Manages state machine progression
- `parseUserInput(message, currentState)` -- Converts free-text to structured payload for each state

**State Parsing:**
- `PROPERTY_CATEGORY_SELECTION` -- Detects "commercial" vs "residential"
- `PROPERTY_TYPE_SELECTION` -- Maps keywords to flat/house/plot/office/shop
- `LOCATION_COLLECTION` -- Takes raw text as location
- `PRICE_COLLECTION` -- Extracts number + unit (Lakh/Crore)

---

### 5.4 MatchingAgent

**File:** `agents/backend/src/agents/matching_agent.ts`
**Name:** `matching`
**Purpose:** Smart property matching engine. Uses subscription-priority ranking: Internal > PREMIUM > PRO > BASIC > FREE.

**Key Methods:**
- `handle(context)` -- Entry point; routes to matching, pagination, or property selection
- `buildCriteria(context)` -- Builds `MatchCriteria` from contact data + message (extracts BHK, budget, property type, location from current message)
- `runMatching(context, criteria)` -- Calls `MatchingEngine.findMatches(criteria, 3)`, formats results for WhatsApp with images
- `handleMoreResults(context, criteria)` -- Pagination ("more", "next", "aur dikhao")
- `handlePropertySelection(context, propertyNumber)` -- When user replies "1", "2", "3" to select a property
- `fetchPropertyDetails(propertyId)` -- Returns formatted property detail card

**Output:** WhatsApp-formatted property cards with images, pricing in Lakhs/Crores, and interactive prompts ("schedule visit", "more info", "back").

---

### 5.5 PartnerAgent

**File:** `agents/backend/src/agents/partner_agent.ts`
**Name:** `partner`
**Purpose:** Handles external property dealers, brokers, and agents.

**Key Methods:**
- `handle(context)` -- Main routing based on intent keywords

**Flow:**
1. Check if partner profile exists; if not, redirect to registration
2. If active inventory session exists, continue inventory collection via `InventoryStateMachine`
3. Intent detection:
   - "add property/flat/list/inventory" -- Start inventory listing
   - "visit/appointment" -- Show today's scheduled visits from DB
   - "update rent/price" -- Redirect to dashboard for security
4. Detect property vs buyer keywords to set stage (HAS_PROPERTIES / HAS_BUYERS / GENERAL)
5. Generate LLM response using partner agent system prompt with conversation history

---

### 5.6 AdminAgent

**File:** `agents/backend/src/agents/admin_agent.ts`
**Name:** `admin`
**Purpose:** Handles management commands and internal team reporting.

**Commands:**
| Command Keywords | Action |
|---|---|
| `appointment`, `booking`, `visit`, `schedule` | Show appointments summary (supports yesterday/today/tomorrow) |
| `lead`, `today` | Show leads summary (new leads, hot leads, total contacts) |
| `report`, `stats`, `summary` | Daily report (interactions, contacts, properties, type breakdown) |
| `team`, `agent`, `employee` | Team status (name, role, status, lead count) |
| `inventory`, `upload`, `add property` | Redirect to inventory upload wizard |
| `help`, `command` | Show command menu |

**Key Methods:**
- `handle(context)` -- Command routing with sender profile lookup
- `lookupSenderProfile(phone)` -- Finds Agent record by phone for personalized responses
- `getAppointmentsSummary(msg)` -- IST-aware appointment listing
- `getLeadsSummary(msg)` -- Lead counts with day offset support
- `getDailyReport(msg)` -- Full daily metrics
- `getTeamStatus()` -- Agent performance listing

All date calculations use IST (UTC+5:30). Supports natural language day references: "yesterday", "today", "tomorrow", "kal", "aaj".

---

### 5.7 CoordinationAgent

**File:** `agents/backend/src/agents/coordination_agent.ts`
**Name:** `coordination`
**Purpose:** Bridges communication between demand (buyer/tenant) and supply (seller/landlord) sides. Manages the full appointment lifecycle.

**Two Modes:**
1. **BaseAgent mode (handle):** Handles incoming appointment-related messages via message routing
2. **Programmatic API (coordinate):** Called internally by other services for appointment management

**Appointment Rules (Transaction-aware):**
- ALL appointments MUST have a `transaction_id`
- Three parties: `demand_contact_id`, `supply_contact_id`, `executive_agent_id`
- All 3 parties notified on create/confirm/reschedule/cancel

**Key Methods:**
- `handle(context)` -- Routes based on transaction status and message keywords (confirm/reschedule/cancel)
- `coordinate(request)` -- Programmatic coordination API
- `notifySeller(appointment)` -- Notify property owner about visit request
- `notifyBuyer(appointment)` -- Notify buyer about confirmation
- `confirmBothParties(appointment)` -- Send confirmation to buyer, seller, AND internal executive; update appointment status; transition Transaction to VISITED
- `handleReschedule(appointment, initiatedBy)` -- Notify other party, update status to "rescheduled"
- `handleCancel(appointment, initiatedBy)` -- Notify other party, update status to "cancelled"

**Transaction Status Responses:**
- `NEW` -- "We're still finding the right property for you"
- `MATCHED` (no supply) -- "Coordinating with the property owner"
- `MATCHED` (with supply) -- "Would you like to schedule a visit?"
- `VISIT_SCHEDULED` -- Show confirm/reschedule/cancel options
- `VISITED` -- "Make an offer / Schedule another visit / See more properties"

---

### 5.8 SecurityAgent

**File:** `agents/backend/src/agents/security_agent.ts`
**Name:** `security`
**Purpose:** Rate monitoring, anomaly detection, and data protection.

**Two Operating Modes:**

1. **MIDDLEWARE (real-time):** Called by MessageRouter before every message.
   - `checkRateLimit(phoneNumber)` -- Returns `true` if message should be blocked (>30 msgs/5min)
   - `checkLeadAccess(accessorId, contactPhone)` -- Detects bulk lead grabbing (>50 leads/hour)
   - `logAuth(success, identifier, ip)` -- Tracks login attempts

2. **CRON (hourly scan):** Background job running every 60 minutes.
   - `runAnomalyScan()` -- Checks for:
     - Failed login spikes (>5/hour)
     - Agent error spikes (>10/hour)
     - Suspended external agents still sending messages
     - Expired subscriptions still marked ACTIVE
     - High-volume external agents (>20 msgs/hour)
   - `sendSecurityAlert(alerts)` -- Sends WhatsApp alert to MANAGEMENT contact

**Background Jobs:**
- Cleanup stale trackers: every 10 minutes
- Anomaly scan: every 60 minutes
- Initial scan: 5 minutes after startup (warm-up period)

---

### 5.9 NotificationAgent

**File:** `agents/backend/src/agents/notification_agent.ts`
**Name:** `notification`
**Purpose:** Unified multi-channel notification delivery. All other agents call `NotificationAgent.send()` instead of directly using WhatsApp/Email/Voice services.

**Channels:** WhatsApp, Email, Voice

**Features:**
- Channel selection (whatsapp / email / voice)
- Auto-fallback: WhatsApp fails -> try Email (if email available in metadata)
- Quiet hours guard: blocks external WhatsApp sends during 9 PM - 8 AM IST (MANAGEMENT contacts exempt)
- Delivery logging to Interaction table
- Bulk send support for campaigns (batched with configurable delay)
- Named template system for common messages
- Meta-approved WhatsApp template support via `SessionTracker.smartSend()`
- Transaction party notification (`notifyTransactionParties`) -- sends role-appropriate messages to demand, supply, and executive

**Key Methods:**
- `send(payload)` -- Single notification delivery
- `sendTemplate(to, channel, templateName, data)` -- Template-based sending
- `sendBulk(payload)` -- Bulk delivery with batching (default: 10 per batch, 1s delay)
- `notifyAdmins(message, channel)` -- Send to all MANAGEMENT contacts
- `notifyTransactionParties(transaction, templatePrefix, extraData)` -- 3-party transaction notification

**Built-in Templates (19 total):**
- Welcome: `welcome_buyer`, `welcome_seller`
- Operations: `appointment_reminder`, `follow_up`, `new_listing_alert`
- Alerts: `security_alert`, `daily_report`
- Transaction lifecycle (12): `tx_created_demand`, `tx_created_executive`, `tx_matched_demand`, `tx_matched_supply`, `tx_matched_executive`, `tx_visit_demand`, `tx_visit_supply`, `tx_visit_executive`, `tx_closed_won`, `tx_closed_lost`, `tx_executive_reassigned`

---

### 5.10 QAAgent

**File:** `agents/backend/src/agents/qa_agent.ts`
**Name:** `qa`
**Purpose:** Quality assurance and workflow monitoring. The "brain of the brains" -- watches all other agents and makes the system smarter.

**Responsibilities:**

**A. Post-Response Quality Scoring (async, fire-and-forget)**
- Called by MessageRouter after every agent response (sampled at 20% to conserve Gemini quota)
- Uses LLM to score responses on: Relevance (0-10), Accuracy (0-10), Tone (0-10), Helpfulness (0-10)
- Detects user sentiment: positive / neutral / negative / frustrated
- Detects issue types: hallucination, wrong_info, missed_intent, rude_tone, too_generic, off_topic
- Saves results to QALog table
- **Flagging rule:** Score < 5 OR sentiment is "frustrated" -> flagged for human review
- Alerts admin via WhatsApp for flagged conversations

**B. Daily Health Report**
- Generates and sends daily metrics via WhatsApp to all MANAGEMENT contacts
- Metrics: messages today, new contacts, active properties, errors, avg quality score, flagged count, agent performance breakdown, sentiment breakdown

**C. Data Integrity Checker**
- Contacts still UNKNOWN after 24 hours
- Orphan interactions (no matching contact)
- Stale properties (active but not updated in 90+ days)
- "Hot" leads with no interaction in 7+ days
- Non-E.164 phone number formats

**D. Self-Improvement Logger (Template Library)**
- Responses scoring >= 9/10 are saved as "winning templates"
- These templates are used by the PromptEngineerAgent to improve system prompts
- `getWinningTemplates(agentName, limit)` retrieves top templates for a specific agent

---

### 5.11 MarketingAgent

**File:** `agents/backend/src/agents/marketing_agent.ts`
**Name:** `marketing`
**Purpose:** Campaign management and audience targeting.

**Campaign Types:** `broadcast` | `drip` | `launch_promo` | `follow_up`

**Key Methods:**
- `createCampaign(config)` -- Create campaign as draft or scheduled
- `executeCampaign(campaignId)` -- Build audience, send via NotificationAgent bulk, update stats
- `buildAudience(filter)` -- Segmentation by contact_type, city, property_type, budget range, lead_status, lifecycle_stage, days_inactive (max 1,000 recipients)
- `quickBroadcast(message, audience, channel, name)` -- Create + execute in one call
- `sendLaunchPromo(projectId)` -- Builder launch promotion to matching BUYER_TENANT contacts in the project's city
- `getAnalytics()` -- Campaign analytics: total campaigns, total sent, total responded, response rate, breakdown by type
- `cancelCampaign(campaignId)` -- Cancel scheduled/draft campaign

**Safety:**
- Campaign execution blocked during quiet hours (9 PM - 8 AM IST)
- Batch size: 10, with 2s delay between batches for WhatsApp rate limits
- Audience cap: 1,000 recipients per campaign

---

### 5.12 AuditAgent

**File:** `agents/backend/src/agents/audit_agent.ts`
**Name:** Part of AI Boss system (not directly routed)
**Purpose:** Analyzes the last 24 hours of bot conversations to find patterns of failure.

**Issue Categories Detected:**
1. `repeated_greeting` -- Bot says Namaste/Hello more than once
2. `language_mixing` -- Bot switches languages mid-conversation
3. `context_loss` -- Bot asks for info the user already provided
4. `no_property_search` -- Buyer shared budget/location but bot did not show properties
5. `wrong_classification` -- User was misrouted
6. `generic_response` -- Vague reply that does not move conversation forward
7. `missed_intent` -- User asked X, bot responded about Y
8. `slow_qualification` -- Too many messages (>4) before qualifying buyer
9. `no_follow_up` -- Conversation ended without a clear next step
10. `tone_issue` -- Response too formal, casual, or inappropriate

**Key Methods:**
- `runDailyAudit()` -- Full audit pipeline:
  1. Fetch QA logs, agent action logs, and all interactions from last 24h
  2. Group interactions by phone number into conversations
  3. Compute sentiment stats, agent performance breakdown, average quality score
  4. Identify flagged and low-score conversations
  5. Find winning templates (score >= 8)
  6. Sample up to 30 conversations for LLM analysis (prioritize flagged, then low-score, then random)
  7. Process in batches of 5 via `analyzeConversation()` to avoid rate limits
  8. Aggregate issues by category, sort by count
- `analyzeConversation(phone, messages, qaScore)` -- LLM-powered analysis of a single conversation

**Output:** `AuditResult` with `{ totalConversations, totalFlagged, avgQualityScore, issuesFound[], agentBreakdown, sentimentStats, winningTemplates[] }`

---

### 5.13 PromptEngineerAgent

**File:** `agents/backend/src/agents/prompt_engineer_agent.ts`
**Name:** Part of AI Boss system (not directly routed)
**Purpose:** Auto-deploys prompt improvements to the database based on audit findings.

**Safety Limits:**
- Max 3 new overrides per day (`MAX_NEW_OVERRIDES_PER_DAY`)
- Max 20 total active overrides (`MAX_TOTAL_ACTIVE_OVERRIDES`)
- Oldest overrides deactivated when limit exceeded
- Changes are prompt-only (no code changes)

**Issue Category to Prompt Key Mapping:**
| Issue Category | Prompt Key |
|---|---|
| `repeated_greeting` | `core_behavior` |
| `language_mixing` | `core_behavior` |
| `context_loss` | `core_behavior` |
| `no_property_search` | `buyer_prompt` |
| `wrong_classification` | `identification` |
| `generic_response` | `core_behavior` |
| `missed_intent` | `core_behavior` |
| `slow_qualification` | `buyer_prompt` |
| `no_follow_up` | `core_behavior` |
| `tone_issue` | `core_behavior` |

**Key Methods:**
- `processAuditReport(report, auditReportId)` -- Main pipeline:
  1. Check daily deployment limit
  2. Filter actionable issues (count >= 2), sort by severity then count
  3. For each issue: draft override via LLM, save to `PromptOverride` table
  4. Enforce max active overrides limit
- `draftOverride(issue, existingOverrides, winningTemplates)` -- Uses LLM to draft a concise 1-3 sentence rule, validated against allowed sections

**Override Sections:** `greeting_rules` | `language_rules` | `qualification_rules` | `response_format` | `classification_rules` | `context_rules` | `followup_rules`

**Runtime Effect:** Changes take effect immediately because `SystemPromptService` reads overrides from the `PromptOverride` DB table at runtime, appending them as "AI-LEARNED RULES" to system prompts.

---

### 5.14 AIBoss

**File:** `agents/backend/src/services/ai_boss.ts`
**Name:** Not an agent -- orchestrator service
**Purpose:** Self-improving bot orchestrator. Runs the nightly intelligence cycle.

**Schedule:** Daily at 2 AM IST (via cron job)

**Cycle Steps:**
1. **Conversation Audit** -- `AuditAgent.runDailyAudit()` analyzes last 24h of conversations
2. **Save Audit Report** -- Persists to `AuditReport` table (total conversations, flagged count, avg quality, issues, agent breakdown, sentiment stats)
3. **Prompt Engineer** -- `PromptEngineerAgent.processAuditReport()` auto-deploys prompt improvements (only if issues found)
4. **Email Report** -- Sends HTML email to Super Boss with:
   - Summary cards (conversations, flagged, avg score, fixes deployed)
   - Sentiment breakdown
   - Issues found (with severity, count, examples)
   - Auto-deployed fixes (section, rule, reason)
   - Agent performance table (messages, avg score, avg time)

**Reports to:** Super Boss only (via email, NOT WhatsApp). Does NOT interact with customers.

**Email Template:** Rich HTML with:
- Gradient header
- Summary cards with color coding
- Severity-colored issue rows (red=high, amber=medium, green=low)
- Fix deployment table
- Agent performance table
- Footer with cycle duration

---

## 6. System Prompts

**File:** `agents/backend/src/services/system_prompt.ts`

All system prompts are managed by the `SystemPromptService` static class. Prompts combine hardcoded base rules with dynamic DB-stored overrides.

### 6.1 Core Behavior (Shared by all agents)

Method: `SystemPromptService.getCoreBehavior(language?)`

**Identity:** "You are Panditji, the AI Property Assistant of Realty Pandit."

**Rules enforced:**
1. **Identity** -- Panditji does not own properties; connects buyers and sellers
2. **Greeting Rule (STRICT)** -- ONLY greet on the very first message. NEVER repeat Namaste/Hello in subsequent messages.
3. **Language Rule (STRICT)** -- Detect user's language, stick to it. Never switch mid-conversation. Supports English, Hindi (Devanagari), and Hinglish.
4. **Tone** -- Professional, warm, helpful, concise. Use bullet points for options. Be action-oriented.
5. **Terminology** -- RENT/LEASE intent uses "Tenants" (Kirkaya), SELL intent uses "Buyers" (Kharidar).
6. **Conversation Continuity** -- Reference previous context, never repeat questions already answered.
7. **Date & Time Awareness** -- Includes current IST date, time, yesterday, tomorrow. Always assumes IST.

**Dynamic overrides:** Loaded from `PromptOverride` table with `prompt_key = 'core_behavior'` and appended as "AI-LEARNED RULES (Auto-Improved)".

### 6.2 Buyer Prompt

Method: `SystemPromptService.getBuyerPrompt(context)` / `getBuyerPromptWithTransaction(context, transaction)`

**Context inputs:** `lead_status`, `intent`, `missing_info`, `language`

**Goal:** Qualify the lead by collecting Budget, Preferred Location, Property Type.

**Transaction-enhanced version** adds:
- Full transaction context (ID, type, status, property needed, location, budget, supply/executive status)
- Role-specific rules for DEMAND side (never reveal seller's contact)
- Status-specific next-step triggers
- Channel-specific formatting guidelines (WhatsApp: concise/bold, Voice: conversational, Web: detailed)

### 6.3 Seller Prompt

Method: `SystemPromptService.getSellerPrompt(context)` / `getSellerPromptWithTransaction(context, transaction)`

**Context inputs:** `lead_status`, `intent`, `property_type`, `preferred_location`, `price_discussed`, `language`

**Goal:** Collect property details: Type, Location, Price, Bedrooms.

**Transaction-enhanced version** adds supply-side role rules (never reveal buyer's contact).

### 6.4 Identification Prompt

Method: `SystemPromptService.getIdentificationPrompt()`

**Goal:** Determine who the unknown contact is.
- Ask one simple question: "Are you looking to buy/rent, sell/rent out, or are you a dealer?"
- CRITICAL: If sell/rent-out mentioned, MUST ask if they are the owner or a broker/dealer.

### 6.5 Partner Agent Prompt

Method: `SystemPromptService.getPartnerAgentPrompt(context)`

**Context inputs:** `stage`, `partner_type`

**Behavior by stage:**
- `ONBOARDING` -- Ask if they have properties to list or buyers to match
- `HAS_PROPERTIES` -- Help list inventory, ask for property details
- `HAS_BUYERS` -- Ask what their buyers need (type, budget, location)
- `GENERAL` -- Professional conversation, offer to help

### 6.6 Inventory Prompt

Method: `SystemPromptService.getInventoryPrompt(state)`

Generates state-specific questions for the inventory collection wizard.

### 6.7 Transaction Context Injection

Method: `SystemPromptService.getTransactionContext(transaction, roleContext)`

Adds deal awareness to any prompt. Includes:
- Transaction details (ID, type, status, property needs, budget, supply/executive status)
- Role-specific behavior rules (DEMAND / SUPPLY / INTERNAL)
- Status-specific AI trigger rules per transaction lifecycle:
  - `NEW` -- Gather requirements, trigger property search
  - `MATCHED` -- Present match, encourage visit
  - `VISIT_SCHEDULED` -- Confirm details, send reminders
  - `VISITED` -- Ask for feedback, offer next steps
  - `NEGOTIATION` -- Facilitate price discussion
  - `CLOSED_WON` -- Assist with paperwork, ask for referral after 7 days
  - `CLOSED_LOST` -- Be helpful if they return, offer new listings

### 6.8 Dynamic Override System

Method: `SystemPromptService.getOverrides(promptKey)`

- Loads active overrides from `PromptOverride` table, ordered by priority
- Appended to prompts as `--- AI-LEARNED RULES (Auto-Improved) ---`
- Fails silently -- hardcoded prompts still work if DB is down
- Override keys: `core_behavior`, `buyer_prompt`, `seller_prompt`, `identification`, `partner_prompt`

---

## 7. AI Chat (Website)

### Public Chat Endpoint

**File:** `agents/backend/src/routes/ai_chat.ts`

**Endpoint:** `POST /public/ai-chat`
- **Auth:** None required (public endpoint)
- **Input:** `{ message: string, filters?: FilterState, sessionId?: string, phone?: string }`
- **Output:** `{ success: boolean, reply: string, properties: Property[], action: string | null, sessionId: string }`

### Chat Handler

**File:** `agents/backend/src/services/chat_handler.ts`

The `ChatHandler` class powers the website AI chat experience.

**`processMessage(message, filters, sessionId)` flow:**
1. Search properties from DB based on filters (city, propertyType, budget, intent) and message keywords
2. Build a system prompt with Panditji's personality and property context (up to 10 matches)
3. Generate AI response via `LLMService.generateResponse()`
4. Detect user action intent (`request_phone` / `book_visit`)
5. Format top 6 properties for frontend display
6. Return reply, properties, action, and session ID

**Filter State:**
```typescript
interface FilterState {
    city?: string;
    propertyType?: string;
    bhk?: string;
    budget?: { min: number; max: number };
    intent?: 'buy' | 'rent' | 'lease';
}
```

**Panditji's Website Personality:**
- Warm, friendly, professional
- Uses "Namaste" occasionally
- Concise (under 100 words per response)
- Never makes up property details
- Uses Indian rupee format (Lakhs/Crores)
- When user shows interest, asks for WhatsApp number to schedule a visit

### Visit Booking

**Endpoint:** `POST /public/ai-chat/book-visit`
- **Input:** `{ phone: string, propertyId: string, message?: string, sessionId?: string }`
- **Flow:**
  1. Normalize phone to E.164
  2. Parse date/time from message using `DateTimeParser`
  3. Get property details
  4. Find or create contact (as BUYER_TENANT from website_chat source)
  5. Create `ScheduledVisit` record
  6. Create calendar appointment (if date provided)
  7. Notify 4 parties via WhatsApp:
     - **Customer** -- Visit confirmation with property details
     - **Internal Sales Agent** -- New visit notification (assigned agent or super_boss fallback)
     - **Key Handler** -- Key holder notification (for property access)
     - **Management** -- High-value property alert (>= 1 Crore)
  8. Send WhatsApp continuation invite (to continue conversation on WhatsApp)

### Cross-Channel Continuity (Feature 3)

When a website visitor provides their phone number:
- A `ConversationSession` is created linking website chat to WhatsApp
- WhatsApp continuation invite template (`rp_whatsapp_invite`) is sent
- Conversation history is logged to the Interaction table
- `loadChatHistory(phone, limit)` provides context when the user continues on WhatsApp

---

## 8. Call Intelligence

### Call Extractor

**File:** `agents/backend/src/services/call_extractor.ts`

The `CallExtractor` service uses Gemini to extract structured data from staff call transcripts.

**Extracted Fields:**

| Field | Type | Description |
|---|---|---|
| `intent` | `BUY` / `RENT` / `SELL` / `LEASE` / `OTHER` | Caller's property intent |
| `role` | `BUYER_TENANT` / `SELLER_LANDLORD` / `UNKNOWN` | Caller's role |
| `propertyType` | string | flat, house, plot, office, etc. |
| `bhk` | string | 1, 2, 3, 4, 5+, Studio |
| `location` | string | Specific area/city/locality |
| `budgetMin` / `budgetMax` | number | Budget in lakhs |
| `urgency` | `IMMEDIATE` / `WITHIN_MONTH` / `WITHIN_3_MONTHS` / `FLEXIBLE` | Timeline |
| `followUpDate` | string | YYYY-MM-DD format |
| `appointmentMentioned` | boolean | Whether a visit/meeting was discussed |
| `sentiment` | `POSITIVE` / `NEUTRAL` / `NEGATIVE` | Call sentiment |
| `summary` | string | 2-3 sentence English summary |
| `keyPoints` | string[] | Important points mentioned |
| `confidence` | number | 0.0 - 1.0 confidence score |

**Processing Pipeline:**

```
extractFromTranscript(transcript, phoneNumber?)
    |-- preprocessTranscript()
    |     |-- Remove filler words (uh, um, hmm, haan, achha, theek, matlab)
    |     |-- Normalize spaces
    |     |-- Normalize currency (crore/lakh capitalization)
    |
    |-- getContactContext(phoneNumber)
    |     |-- Fetch existing contact data for enrichment
    |     |-- Previous intent, property type, location, lead status
    |
    |-- buildExtractionPrompt()
    |     |-- Hindi/Hinglish/English support
    |     |-- Indian real estate terminology
    |     |-- Budget conversion rules (Lakh/Crore)
    |     |-- Confidence scoring guidelines
    |
    |-- LLMService.generateResponse(prompt)
    |-- parseExtractionResponse()
    |     |-- Remove markdown code blocks
    |     |-- JSON.parse()
    |     |-- Field validation
    |
    |-- validateAndScore()
          |-- Reduce confidence if key fields missing (intent=OTHER: *0.8, role=UNKNOWN: *0.9, no location: *0.9)
          |-- Increase confidence if 4+ fields present (*1.1, capped at 1.0)
```

### Call Processing Worker

**File:** `agents/backend/src/workers/call_processor.ts`

Background job processor for the transcription-to-AI-extraction pipeline.

**Processing Pipeline:**

```
UPLOADING -> PROCESSING -> TRANSCRIBED -> READY_FOR_REVIEW -> APPROVED
```

**Worker Configuration:**
| Parameter | Value |
|---|---|
| Poll interval | 5,000 ms (5 seconds) |
| Max concurrent jobs | 2 |
| Max retries | 3 |
| Timeout per job | 300,000 ms (5 minutes) |

**Job Processing Flow:**
1. Worker polls for `StaffCall` records with `status = 'PROCESSING'` and a `recording_url`
2. **Step 1 -- Transcription:** Send recording to transcription service, update status to `TRANSCRIBED`
3. **Step 2 -- AI Extraction:** Pass transcript to `CallExtractor.extractFromTranscript()`, update status to `READY_FOR_REVIEW` with extracted data and confidence score
4. **On failure:** Retry up to 3 times; after max retries, mark as `REJECTED`

**Worker Management:**
- `startCallProcessor()` -- Start the polling loop (called from `server.ts`)
- `triggerCallProcessing(callId)` -- Manually trigger processing for a specific call (added to front of queue)
- `getWorkerStatus()` -- Returns queue length, processing count, and active job details

---

## Architecture Diagram (Summary)

```
                    +------------------+
                    |   WhatsApp API   |
                    |   Website Chat   |
                    |   Voice Calls    |
                    +--------+---------+
                             |
                    +--------v---------+
                    | WebhookProcessor |
                    | / AI Chat Route  |
                    +--------+---------+
                             |
                    +--------v---------+
                    |   ChatHandler /  |
                    | InteractionEngine|
                    +--------+---------+
                             |
                    +--------v---------+
                    |  MessageRouter   |
                    | (Master Orch.)   |
                    +--------+---------+
                             |
              +--------------+---------------+
              |              |               |
     +--------v---+  +------v------+ +------v------+
     | Classifier |  |   Sales     | |   Admin     |
     |   Agent    |  |   Agent     | |   Agent     |
     +------------+  +------+------+ +-------------+
                            |
              +-------------+-------------+
              |             |             |
     +--------v---+ +------v------+ +---v----------+
     |  Matching  | | Inventory   | | Coordination |
     |   Agent    | |   Agent     | |    Agent     |
     +------------+ +-------------+ +--------------+

     +------------+ +-------------+ +--------------+
     |  Partner   | | Notification| |   Security   |
     |   Agent    | |   Agent     | |    Agent     |
     +------------+ +-------------+ +--------------+

     +------------+ +-------------+ +--------------+
     |    QA      | | Marketing   | |   AI Boss    |
     |   Agent    | |   Agent     | | (2 AM cron)  |
     +-----+------+ +-------------+ +------+-------+
           |                               |
           |         +-----------+         |
           +-------->|   Audit   |<--------+
                     |   Agent   |
                     +-----+-----+
                           |
                     +-----v-------+
                     |   Prompt    |
                     |  Engineer   |
                     |   Agent     |
                     +-------------+

                    +------------------+
                    |   LLM Service    |
                    | (Gemini 2.5 Flash)|
                    |  Rate Limiter    |
                    | Circuit Breaker  |
                    |  Redis Cache     |
                    +------------------+
```

---

## Key Design Decisions

1. **Single LLM Provider:** All AI calls go through `LLMService` which wraps Gemini 2.5 Flash. No direct Gemini calls anywhere else.

2. **3-in-1 Classification (classifyFull):** For UNKNOWN contacts, one Gemini call classifies contact type, domain intent, and language simultaneously, saving 66% of API calls.

3. **20% QA Sampling:** Only 20% of responses are sent to the QA agent for quality scoring, preventing Gemini 429 rate limit errors.

4. **Transaction-Aware Routing:** Agent selection uses role context (DEMAND/SUPPLY/INTERNAL) and transaction status, not just contact type.

5. **Self-Improving Prompts:** The AI Boss nightly cycle (AuditAgent -> PromptEngineerAgent) auto-deploys prompt improvements to the DB, taking effect immediately at runtime.

6. **Quiet Hours:** All external-facing notifications (WhatsApp to non-MANAGEMENT contacts) are blocked from 9 PM to 8 AM IST.

7. **Fire-and-Forget Patterns:** QA scoring, agent action logging, language detection, and metadata updates are all non-blocking to keep response times fast.

8. **Circuit Breaker + Rate Limiter:** Double protection against API failures. Circuit breaker prevents repeated calls to a failing API; rate limiter prevents exceeding Gemini's RPM quota.
