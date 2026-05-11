# Plan: Deal Pipeline AI–Team Coordination Layer
**File:** `precious-plotting-frost.md`
**Date:** 2026-04-28

---

## Context

The Realty Pandit deal pipeline has a fully working AI automation layer (6 stages, crons, WhatsApp templates, call cadence). The UI has a functional kanban board and deal detail modal. But there is a critical coordination gap:

1. **Team members cannot see what the AI has done** — WhatsApp messages sent, call attempts, property cards shared are all invisible in the UI
2. **AI crons fire blindly** — no awareness of team member manual actions; AI calls a lead 5 min after the coordinator already called them
3. **No manual action logging** — team member has no way to log "I called this lead", "I confirmed the visit", "I already sent a WhatsApp" so AI can adjust
4. **Missing contact info on deal** — coordinator phone, inventory owner phone, key holder phone not surfaced in UI; no quick-call capability
5. **No inventory quick-view** — when a shared property is shown, clicking it shows nothing

This plan wires the full AI–team coordination layer: both ends can see each other's actions, neither duplicates the other's work, and team members can act from the deal card with one tap.

---

## Architecture Decisions

- **`last_team_action_at`** on Transaction — crons check this before firing; if team acted recently, cron backs off by stage-specific window
- **`ai_paused`** on Transaction — explicit override; all automations skip while true
- **`TeamAction` model** — permanent log of every manual team action; feeds the timeline
- **Cron backoff rule**: each cron checks `last_team_action_at` before sending; if team acted within the backoff window, skip that automation instance
- **Inventory contacts** — owner + key_holder already on Inventory schema (`owner_phone`, `key_holder_name`, `key_holder_phone`); just not returned by API or rendered in UI
- **PropertyShare table** already exists — just needs an API endpoint and UI tab

---

## Critical Files

### Backend
- `backend/prisma/schema.prisma` — Transaction model, add 3 fields + TeamAction model
- `backend/src/routes/deals.ts` — add 2 new endpoints, update GET response
- `backend/src/services/deal_service.ts` — update `getDealById`, `getDealTimeline`
- `backend/src/services/pipeline_crons.ts` — update all 6 crons
- `backend/src/services/lead_qualification_caller.ts` — add last_team_action_at check
- `backend/src/services/property_sharing.ts` — read updated_requirements from deal notes

### Frontend
- `frontend/src/components/DealPipeline.tsx` — deal cards + action buttons (1440 lines)
- `frontend/src/components/DealDetailModal.tsx` (embedded in DealPipeline) — tabs upgrade
- `frontend/src/components/mobile/MobileLayout.tsx` — mobile card rendering

### New Frontend Components (create)
- `frontend/src/components/InventoryQuickView.tsx`
- `frontend/src/components/QuickCallStrip.tsx`
- `frontend/src/components/AIStatusBadge.tsx`
- `frontend/src/components/LogActionModal.tsx`

---

## Implementation Plan

---

### PHASE 1 — Backend Foundation
**Estimated time: 1 day**

#### Step 1.1 — Schema Migration

Add to `Transaction` model in `schema.prisma`:
```prisma
last_team_action_at  DateTime?
ai_paused            Boolean   @default(false)
```

Create new `TeamAction` model:
```prisma
model TeamAction {
  id             String   @id @default(cuid())
  tenant_id      String
  transaction_id String
  agent_id       String
  stage          String
  action_type    String   // CALLED | WHATSAPPED | CONFIRMED_VISIT |
                          // SCHEDULED_VISIT | REMINDER_GIVEN |
                          // LOGGED_NOTE | PAUSED_AI | RESUMED_AI |
                          // VISIT_RESCHEDULED | MEETING_BOOKED
  outcome        String?  // connected | no_answer | busy | qualified |
                          // scheduled | reminder_given
  notes          String?
  created_at     DateTime @default(now())

  transaction    Transaction @relation(fields: [transaction_id], references: [id])
  agent          Agent       @relation(fields: [agent_id], references: [id])
}
```

Run: `npx prisma migrate dev --name add_team_coordination_layer`

---

#### Step 1.2 — Update GET /api/deals/:id Response

In `deal_service.ts → getDealById()`, extend the Prisma include to return:
```typescript
coordinator: { select: { id, name, phone, role } },  // add phone
inventory: {
  select: {
    ...existing fields...,
    owner_phone: true,
    owner_name: true,          // if field exists, else join owner contact
    key_holder_name: true,
    key_holder_phone: true,
  }
},
```

Also add computed field `ai_status`:
```typescript
// after fetching deal:
const ai_status = deal.ai_paused ? 'paused'
  : deal.status === 'NEW' ? 'active'        // calling cadence running
  : deal.last_team_action_at &&
    (Date.now() - deal.last_team_action_at.getTime()) < 2 * 3600_000
    ? 'waiting'                               // team acted recently
  : 'active';
return { ...deal, ai_status };
```

---

#### Step 1.3 — New Endpoint: POST /api/deals/:id/log-action

In `routes/deals.ts`, add:
```
POST /api/deals/:id/log-action
Body: { action_type, outcome?, notes?, new_status? }
```

Logic:
1. Create `TeamAction` record
2. Set `Transaction.last_team_action_at = now()`
3. If `new_status` provided → call `transitionTransaction(id, new_status, agentId, 'web', { notes })`
4. If `action_type === 'PAUSED_AI'` → set `Transaction.ai_paused = true`
5. If `action_type === 'RESUMED_AI'` → set `Transaction.ai_paused = false`
6. Return updated deal

---

#### Step 1.4 — New Endpoint: GET /api/deals/:id/property-shares

In `routes/deals.ts`, add:
```
GET /api/deals/:id/property-shares
```

Query: Find all `PropertyShare` records where `client_phone = deal.demand_contact.phone_number`, include Inventory (id, title/name, location, price, type, media_urls[0], owner_phone, owner_name, key_holder_name, key_holder_phone).

Return sorted by `created_at DESC`.

---

#### Step 1.5 — New Endpoint: GET /api/inventory/:id/contacts

In `routes/inventory.ts`, add:
```
GET /api/inventory/:id/contacts
```

Returns:
```json
{
  "owner": { "name": "...", "phone": "..." },
  "key_holder": { "name": "...", "phone": "..." },
  "assigned_agent": { "name": "...", "phone": "...", "role": "..." }
}
```

---

#### Step 1.6 — Upgrade GET /api/deals/:id/timeline

In `deal_service.ts → getDealTimeline()`, merge 3 additional data sources:

1. **WhatsApp messages** — `WhatsAppMessage.findMany({ where: { phone_number: deal.demand_contact.phone_number }, orderBy: { created_at: 'asc' } })` — direction outbound = AI sent; include body (truncated 80 chars), status, template name from metadata
2. **Voice calls** — `VoiceCall.findMany({ where: { phone_number: deal.demand_contact.phone_number } })` — include call_status, duration, ai_call_summary
3. **Team actions** — `TeamAction.findMany({ where: { transaction_id: dealId } })` — include action_type, outcome, notes, agent name

Return all events sorted by `created_at` with `source` field: `'log' | 'whatsapp' | 'call' | 'query' | 'appointment' | 'team_action'`

---

#### Step 1.7 — Update Crons: Add last_team_action_at Backoff

In `pipeline_crons.ts`, for each cron add a team-action check before sending:

```typescript
// Helper (add at top of pipeline_crons.ts):
function teamActedRecently(deal: any, windowMs: number): boolean {
  if (!deal.last_team_action_at) return false;
  return (Date.now() - new Date(deal.last_team_action_at).getTime()) < windowMs;
}
```

**Per cron backoff rules:**

| Cron | Backoff Window | What it does |
|---|---|---|
| MATCHING_APPOINTMENT escalation (every 30min) | 60 min | Skip if team acted in last 60 min |
| Visit reminders (every 30min) | 2 hours | Skip 2hr reminder if team logged reminder; skip 24hr if team acted in last 2hrs |
| NEGOTIATION 48hr nudge | 48 hours | Skip if team acted in last 48hrs |
| NEGOTIATION 14-day inactivity | — | Use `MAX(updated_at, last_team_action_at)` for 14-day window |
| Cold-lead nudge | 7 days | Skip if team acted in last 7 days |
| Qualification cadence | 30 min | Delay next attempt by 30 min if team acted; stop if ai_paused |

Also add `ai_paused` check at top of every cron loop:
```typescript
if (deal.ai_paused) continue; // skip AI automation for this deal
```

---

#### Step 1.8 — Update shareNextProperty to Read Notes

In `property_sharing.ts → shareNextProperty()`, after fetching deal:
```typescript
// Read updated requirements from visit_feedback/demand_notes
const updatedLocation = deal.demand_location;
const updatedBudgetMin = deal.demand_budget_min;
const updatedBudgetMax = deal.demand_budget_max;
const updatedBedrooms = deal.demand_bedrooms;
// These are already on Transaction — just ensure visit-outcome endpoint
// writes updated_requirements back to these fields (it already does for re-match)
```

Also for non-re-match outcomes, update `VISITED → NEGOTIATION` to persist any updated requirements the team member entered.

---

### PHASE 2 — Reusable Frontend Components
**Estimated time: 4 hours**

#### Step 2.1 — AIStatusBadge Component

File: `frontend/src/components/AIStatusBadge.tsx`

Props: `status: 'active' | 'waiting' | 'paused'`

Renders:
- 🟢 **AI Active** (green dot + text) — AI automation running
- 🟡 **Waiting for team** (amber dot + text) — AI escalated, needs human action
- ⚫ **AI Paused** (grey dot + text) — team has taken over

Used on: every deal card + deal detail header

---

#### Step 2.2 — QuickCallStrip Component

File: `frontend/src/components/QuickCallStrip.tsx`

Props:
```typescript
{
  lead: { name: string; phone: string };
  coordinator?: { name: string; phone: string };
  owner?: { name: string; phone: string };
  keyHolder?: { name: string; phone: string };
  stage: TransactionStatus;
}
```

Renders collapsed by default (4 phone icons). Expands on tap to show names + [📞 Call] [💬 WA] buttons per person.

Stage-awareness: only shows owner from MATCHING_APPOINTMENT onwards; only shows key holder in VISIT_SCHEDULED.

`[📞 Call]` → `window.location.href = 'tel:' + phone`
`[💬 WA]` → `window.open('https://wa.me/' + phone)`

---

#### Step 2.3 — InventoryQuickView Component

File: `frontend/src/components/InventoryQuickView.tsx`

Props: `{ inventoryId: string; onClose: () => void }`

Fetches: `GET /api/inventory/:id` + `GET /api/inventory/:id/contacts`

Renders as slide-up panel (fixed bottom, z-50, 80vh):
- Swipe-down handle
- Photo strip (horizontal scroll, media_urls)
- Property details: BHK, area, floor, facing, furnishing, price, amenities, status badge
- Google Maps link (if coordinates/address available)
- **People Connected section:**
  - Owner: name + [📞 Call] [💬 WA]
  - Key Holder: name + [📞 Call] [💬 WA]
  - Assigned Agent: name + [📞 Call] (internal call)

Triggered by: tapping inventory name anywhere in pipeline UI.

---

#### Step 2.4 — LogActionModal Component

File: `frontend/src/components/LogActionModal.tsx`

Props: `{ deal: Deal; stage: TransactionStatus; actionType: LogActionType; onClose: () => void; onSuccess: () => void }`

Renders different form per `actionType` (see Phase 5 for per-stage detail).

Calls: `POST /api/deals/:id/log-action`

---

### PHASE 3 — Deal Card Upgrades (Both Desktop + Mobile)
**Estimated time: 4 hours**

In `DealPipeline.tsx`, update deal card rendering for both kanban (desktop) and card list (mobile):

#### Step 3.1 — Add AIStatusBadge to Card Header
Place next to status badge: `<AIStatusBadge status={deal.ai_status} />`

#### Step 3.2 — Add Stage-Specific Info Line

Replace/extend the coordinator name line with stage-aware content:

| Stage | Info line on card |
|---|---|
| NEW | `🤖 Calling... Attempt {n}/8 · Last: {outcome} ({time ago})` |
| QUALIFIED | `🏘️ {n} properties shared · Last: {property name} ({time ago})` |
| MATCHING_APPOINTMENT | `⚠️ Reminder {n}/3 · Escalates in {X} min` |
| VISIT_SCHEDULED | `📅 {date} {time} · 24hr {✅/⏳} · 2hr {✅/⏳}` |
| VISITED | `🏠 Visit done — submit outcome` |
| NEGOTIATION | `⏱️ Last activity: {X} days ago · ON_HOLD in {Y} days` |

Data comes from deal object (ai_call_attempts count from interactions, property shares count, appointment datetime).

#### Step 3.3 — Add QuickCallStrip to Bottom of Card

Below action buttons, add: `<QuickCallStrip ... stage={deal.status} />`

#### Step 3.4 — Make Shared Property Name Tappable → InventoryQuickView

When MATCHING_APPOINTMENT / VISIT_SCHEDULED / NEGOTIATION cards show inventory name, wrap in:
```tsx
<span onClick={() => setQuickViewInventoryId(deal.inventory_id)} className="underline cursor-pointer text-blue-600">
  {deal.inventory?.type} · {deal.inventory?.location}
</span>
```

---

### PHASE 4 — Deal Detail Modal Upgrades
**Estimated time: 6 hours**

#### Step 4.1 — Add "Properties Shared" Tab (new 4th tab)

Tab label: `🏘️ Shared ({count})`

Fetches: `GET /api/deals/:id/property-shares`

Renders each share as a card row:
```
[thumbnail] Supertech Eco Village
            3BHK · Noida · ₹87L
            Sent: Apr 26, 10:32 AM  ✓ Delivered
            [View Details →]         ← opens InventoryQuickView
```

---

#### Step 4.2 — Upgrade Timeline Tab

Current: shows status changes, queries, appointments only.
New: merges all 6 event types with source-specific icons:

| Source | Icon | Content |
|---|---|---|
| log | 🔁 | Status change: OLD → NEW |
| whatsapp (outbound) | 💬 | Template: `rp_buyer_lead_received_v2` · Delivered ✅ |
| whatsapp (inbound) | 📩 | Customer reply: "..." (80 chars) |
| call | 📞 | AI Call Attempt 2/8 · No Answer · 0:00 |
| team_action | 👤 | Coordinator: Called lead · Connected · "Interested, site visit discussed" |
| query | ❓ | Query: subject · status |
| appointment | 📅 | Visit scheduled: Apr 29, 11AM · Supertech Noida |

---

#### Step 4.3 — Upgrade Detail Tab

In the detail tab grid, add:

- **Coordinator row**: name + `📞 {phone}` (tappable tel: link)
- **Inventory block**: add Owner `{name} · 📞 {phone}` + Key Holder `{name} · 📞 {phone}` below property preview
- **AI Status** field: shows AIStatusBadge + "Paused by {agent name} at {time}" if paused
- **Pause/Resume AI toggle**: small switch — `ai_paused` → calls `POST /api/deals/:id/log-action { action_type: 'PAUSED_AI' | 'RESUMED_AI' }`

---

### PHASE 5 — Manual Action UI Per Stage
**Estimated time: 1 day**

Each stage gets a new action button that opens `LogActionModal` with stage-specific form.

---

#### Stage 1 — NEW: "Log My Call" Button

**New button** on deal card and detail: `[📞 Log My Call]`

Modal form:
```
Outcome: ○ No Answer  ○ Busy  ● Connected  ○ Qualified  ○ Scheduled Visit
Notes: _________________________
```

On submit → `POST /api/deals/:id/log-action`:
- `action_type: 'CALLED'`, `outcome`, `notes`
- If outcome = `qualified` → `new_status: 'QUALIFIED'`
- If outcome = `scheduled` → `new_status: 'VISIT_SCHEDULED'` (also prompt for date/time)

**AI Effect:** Sets `last_team_action_at`. Qualification cadence delays next attempt by 30 min. If outcome resolves the stage, AI calling stops (deal leaves NEW).

---

#### Stage 2 — QUALIFIED: "I Scheduled a Visit" Button

**New button**: `[📅 I Scheduled a Visit]`

Modal form:
```
Property:  [select from matched inventory dropdown]
Date:      [date picker]
Time:      [time picker]
Notes:     ___________________________
```

On submit → `POST /api/deals/:id/log-action`:
- `action_type: 'SCHEDULED_VISIT'`, `notes`
- `new_status: 'VISIT_SCHEDULED'`
- Also calls `PATCH /api/deals/:id/match` with selected inventory_id (if not already matched)

**AI Effect:** AI sends customer reminders (24hr + 2hr) and key holder notification automatically via `status_changed` hook (already wired). Cold nudge cron pauses.

---

#### Stage 3 — MATCHING_APPOINTMENT: Notes Field on Confirm Modal

**Existing** "Confirm Appointment" button already present. Extend the modal to add:

```
Visit Date:  [date picker]   Visit Time: [time picker]
Special Instructions for Key Holder:
___________________________
```

On confirm → existing `PATCH /api/deals/:id/status { status: 'VISIT_SCHEDULED' }` + `POST /api/deals/:id/log-action { action_type: 'CONFIRMED_VISIT', notes }`.

Special instructions stored in TeamAction.notes — shown on timeline, visible to coordinator.

**AI Effect:** Escalation reminders stop (deal leaves MATCHING_APPOINTMENT). AI fires key holder + customer reminders for new visit date.

---

#### Stage 4 — VISIT_SCHEDULED: Two New Buttons

**Button 1**: `[📞 I Called to Remind]` (one-tap, no modal)
- Immediately calls `POST /api/deals/:id/log-action { action_type: 'REMINDER_GIVEN', outcome: 'reminder_given' }`
- Sets `last_team_action_at`
- AI visit reminder cron skips next reminder window for this deal

**Button 2**: `[🗓️ Reschedule Visit]`

Modal form:
```
New Date:  [date picker]
New Time:  [time picker]
Reason:    ___________________________
```

On submit → `POST /api/deals/:id/log-action { action_type: 'VISIT_RESCHEDULED', notes }` + update appointment record with new datetime.

**AI Effect:** Old reminder jobs cancelled (old appointment time superseded). New reminder cadence fires for updated date/time.

---

#### Stage 5 — VISITED: Extend Visit Outcome Modal

**Existing** visit outcome modal already captures: outcome, interest_level, feedback, updated_requirements.

**Add to existing modal:**
```
What did customer say? (AI will use this for next match)
___________________________

Updated Requirements:
  Budget:    [₹ min] — [₹ max]
  Location:  [text field]
  BHK:       [1/2/3/4/4+]
  Must-have: [text field]
```

On submit → existing `POST /api/deals/:id/visit-outcome` already accepts `updated_requirements`. Also call `POST /api/deals/:id/log-action { action_type: 'LOGGED_NOTE', notes }`.

**AI Effect:** `shareNextProperty()` already reads demand_location, demand_budget_min/max, demand_bedrooms from Transaction — visit-outcome endpoint writes these back — so next property share automatically uses updated criteria.

---

#### Stage 6 — NEGOTIATION: "Log Update" Button

**New button**: `[📝 Log Update]`

Modal form:
```
What happened?
  ○ Meeting held
  ○ Offer made by buyer
  ○ Counter offer from owner
  ○ Verbal agreement
  ○ Called / WhatsApped customer

Notes: ___________________________
```

On submit → `POST /api/deals/:id/log-action { action_type: 'MEETING_BOOKED' | 'LOGGED_NOTE', notes }`

**AI Effect:** Sets `last_team_action_at = now()`. 14-day inactivity timer resets. 48hr nudge cron skips next firing.

---

### PHASE 6 — Deploy & Verify
**Estimated time: 30 min**

1. Run Prisma migration on server: `npx prisma migrate deploy`
2. SCP updated backend files + `pm2 restart realty-backend`
3. Build frontend: `npm run build` + deploy to server
4. Manual verification checklist:
   - [ ] Open a NEW deal → see AI call attempt counter + "Log My Call" button
   - [ ] Log My Call with outcome "qualified" → deal moves to QUALIFIED, AI calling stops
   - [ ] Open QUALIFIED deal → see properties shared count, tap property → InventoryQuickView opens with owner phone
   - [ ] Tap 📞 on QuickCallStrip → phone dialer opens
   - [ ] Open VISIT_SCHEDULED deal → see visit date + reminder status
   - [ ] Tap "I Called to Remind" → timeline shows team action, next AI reminder skips
   - [ ] Open deal detail → Timeline tab shows WhatsApp messages + call attempts
   - [ ] Open deal detail → Properties Shared tab lists all cards sent
   - [ ] Pause AI toggle → ai_paused = true → crons skip deal
   - [ ] NEGOTIATION → Log Update → 14-day timer resets in DB

---

## Summary

| Phase | What | Time |
|---|---|---|
| 1 | Backend: schema + 3 new endpoints + cron backoff + timeline upgrade | 1 day |
| 2 | Frontend: 4 reusable components (AIStatusBadge, QuickCallStrip, InventoryQuickView, LogActionModal) | 4 hrs |
| 3 | Deal card upgrades: stage-aware info line + call strip + tappable inventory | 4 hrs |
| 4 | Deal detail modal: Properties Shared tab + Timeline upgrade + contact phones | 6 hrs |
| 5 | Manual action UI: Log My Call, Schedule Visit, Confirm notes, Reminder, Extended Visit Outcome, Log Update | 1 day |
| 6 | Deploy + verify | 30 min |
| **Total** | | **~3.5 days** |

All 6 KRA stages covered. AI never stops — it reads `last_team_action_at` and backs off. Team member sees everything AI did. Neither duplicates the other's work.
