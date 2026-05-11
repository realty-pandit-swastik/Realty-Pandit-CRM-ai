---
name: Leads System Complete Map
description: Full lead lifecycle, scoring algorithm, matching engine, admin panel gaps, and upgrade plan
type: project
---

# Realty Pandit — Leads System Complete Map

## Lead Sources (8 channels)
- WhatsApp inbound → webhook → ClassifierAgent
- Website AI chat → /public/ai-chat → ChatHandler
- Website forms (RequirementCapture) → /public/lead-requirements
- Schedule visit → /public/schedule-visit
- 99acres webhook → /external/99acres/webhook (API key auth)
- MagicBricks webhook → /external/magicbricks/webhook
- Housing.com webhook → /external/housing/webhook
- Manual entry → POST /api/leads (JWT auth)

## Lead = Contact Record (PK = phone_number E.164)

### Key fields
- `lead_status`: cold / warm / hot / closed / lost (auto-updated by scoring)
- `lifecycle_stage`: NEW → QUALIFIED → MATCHED → VISIT_SCHEDULED → VISITED → NEGOTIATION → CLOSED_WON / CLOSED_LOST
- `source`: website/whatsapp/voice/99acres/magicbricks/housing/manual
- `contact_type`: BUYER_TENANT / SELLER_LANDLORD / PARTNER_AGENT / MANAGEMENT / UNKNOWN
- `intent`: buy / sell / rent / commercial
- `budget_min`, `budget_max`, `demand_bhk`, `demand_main_category`, `preferred_location`
- `assigned_agent_id` — FK to Agent
- `ai_summary` — Gemini conversation summary (not shown in admin)
- `next_action_at`, `next_action_type` — follow-up scheduling
- `last_wa_inbound` — 24h WhatsApp session window

## Lead Scoring (100pt total)
| Dimension | Max | Threshold |
|-----------|-----|-----------|
| intent_score | 30 | Has explicit buy/rent/sell + type |
| engagement_score | 25 | Messages, responses, form fills |
| reliability_score | 30 | -20 per no-show |
| urgency_score | 15 | Timeline urgency |

**Auto-status:** ≥80=hot, ≥60=warm, <60=cold
**No-show:** -20 reliability; 1st=WhatsApp recovery template; 2nd+=force cold
**External portal leads start at:** 120pts (capped to 100) = warm immediately

## Matching Engine (MatchingEngine.findMatches)
Input: `{ intent, property_type, budget_min, budget_max, preferred_location, bhk }`
Scoring:
- Budget fit: 0-40pts (exact=40, proportional if out of range)
- Location: 0-30pts (exact=30, partial city word=15)
- Property type: 0-20pts
- BHK: 0-10pts (exact=10, ±1BHK=5)
- Tier bonus: INTERNAL(100) > PREMIUM(90) > PRO(70) > BASIC(50) > FREE(30) → adds up to +20pts

4-fallback strategy: exact → broaden location → city-wide → ignore budget
**FREE tier agents cannot see buyer contact info (data masking)**

## Backend Endpoints for Leads
### Internal (/api/leads - JWT)
- GET /api/leads/by-source — source count breakdown
- GET /api/leads/recent-external — table (page, limit, source, status filters)
- PATCH /api/leads/:phone/status — { lead_status, lifecycle_stage, notes }
- POST /api/leads — create manual lead
- GET /api/leads/:phone/score — score breakdown
- POST /api/leads/:phone/no-show — -20 reliability + recovery

### External (/external - API Key)
- POST /external/leads — single lead ingest
- POST /external/leads/batch — up to 50 leads at once
- GET /external/leads/status/:phone — check status

### Agent (/api/agent-leads - JWT)
- GET /api/agent-leads/buyer-leads — scoped to agent role
- GET /api/agent-leads/buyer-leads/:phone — detail + transactions
- GET /api/agent-leads/appointments — agent's appointments
- POST /api/agent-leads/appointments/:id/status — update status

### Public (no auth)
- POST /public/contact, /public/lead, /public/lead-requirements, /public/schedule-visit
- POST /public/ai-chat, /public/ai-chat/book-visit
- POST /public/auth/send-confirmation, /public/auth/verify-confirmation

## Admin Panel — Lead Views

### "Ext. Leads" view (ExternalLeads.tsx)
Shows: Source cards + table (Name, Phone, Source, Status, Intent, Location, Date)
Missing: Budget, BHK, Lifecycle, Score badge, Agent Assignment, Lead Detail

### "Chats" view (ContactList + ChatView)
Shows: All contacts with HOT/WARM/COLD scores + full interaction thread
Missing: Requirements panel, property matching, booking button

### Other views
- Calendar (appointments), Deal Pipeline (kanban for deals), Team (agent management)
- Dashboard → Lead Sources tab (pie chart, conversion analytics)

## GAPS — What Needs to Be Built

### Backend (new endpoints needed)
1. GET /api/leads/:phone — full detail (all fields + score + recent interactions)
2. POST /api/leads/:phone/match — trigger MatchingEngine, return top 5 properties
3. PATCH /api/leads/:phone/assign — set assigned_agent_id
4. PATCH /api/leads/:phone/requirements — update budget/BHK/location/lifecycle

### Admin Panel (new UI needed)
1. Lead Detail Slide-Over — click row → full profile panel
2. "Find Matches" button → matched inventory cards with scores
3. Agent assignment dropdown on lead detail
4. Budget + BHK + Score columns in table
5. Lifecycle stage dropdown
6. Editable notes
7. Book Visit inline (BookVisitModal already exists, just needs wiring)
8. Export CSV (xlsx already installed)
9. Fix totalExternal bug (excludes WhatsApp/Voice/Manual but label says "Total External")

## Available Components (already built, need wiring)
- BookVisitModal.tsx — exists in admin, not connected to ExternalLeads
- ShareToClientModal.tsx — exists, not connected
- EnrichmentPanel.tsx — exists, not connected

**Why:** Need to upgrade leads section to a proper CRM with profile, matching, and assignment
**How to apply:** When building lead upgrades, connect existing modal components rather than rebuilding them. Use xlsx library (already installed) for CSV export.
