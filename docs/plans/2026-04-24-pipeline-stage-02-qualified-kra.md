# Pipeline Stage 2 — QUALIFIED — KRA Plan

**Date Locked:** 2026-04-24
**Parent Decision:** [DEC-003 Deal Pipeline Unification](../decisions/DEC-003-deal-pipeline-unification.md)
**Previous Stage:** [Stage 1 — NEW](./2026-04-24-pipeline-stage-01-new-kra.md)
**Status:** Locked — ready for implementation

## Scope

Defines the behavioral spec for the **QUALIFIED** stage. A deal enters here when the customer has confirmed identity + interest (from NEW), or when a team member enters a lead manually (internal leads skip NEW entirely). AI owns this stage: show properties, book appointment. Exit = appointment confirmed → `MATCHING_APPOINTMENT`.

## Stage Owner

- **Primary:** AI Pandit Ji (property sharing via WhatsApp, follow-up calls via Omnidim)
- **Secondary:** Lead Manager (confirms visit booking, handles escalations)

## Exit Destinations

| Destination | Trigger |
|---|---|
| `MATCHING_APPOINTMENT` | Customer provides visit date/time (auto-move) |
| `ON_HOLD` | RENT lead end of month / BUY lead 3 months no response / any non-responding lead |
| `CLOSED_LOST` | **Lead manager only** — never auto-closed by AI |

---

## Area 1 — AI Behavior on Entry

**Immediate actions on deal entering QUALIFIED:**
1. Pull `Contact` record — identify missing fields (budget, location, BHK, category, etc.)
2. Run property match against active inventory using matching hierarchy (Area 2)
3. Send first property card via WhatsApp immediately (parallel to any entry WhatsApp)
4. WhatsApp lead manager: "Lead [Name] qualified — [summary of known fields + missing fields]"
5. Schedule follow-up call for 24 hours later if no Schedule Visit pressed

**Property card format (each WhatsApp message):**
- Property image
- Description (location, BHK, price, key amenities)
- 3 reply buttons: **Call back / Schedule Visit / Next Option**
- 24-hour Meta reply window active per message

**Button behaviors:**
- **Next Option** → AI sends next property card immediately
- **Call Back** → Lead manager gets WhatsApp notification to call customer (AI does not auto-call on this button)
- **Schedule Visit** → AI sends dynamic WhatsApp message capturing preferred **date + time in IST**

**No exact inventory match:** AI sends nearest matches + message "We will send you more inventories soon" + notifies lead manager "No exact match found for this lead"

---

## Area 2 — Property Matching Logic

**Matching hierarchy (exact search string order):**

| Priority | Field | Type |
|---|---|---|
| 1 | `preferred_location` | Primary filter |
| 2 | `demand_intent` (buy / rent) | Hard filter |
| 3 | `demand_main_category` (residential / commercial) | Hard filter |
| 4a | `demand_bhk` | If residential |
| 4b | `demand_type_slug` (shop, office, plot…) | If commercial |
| 5 | `budget_max` | Final filter — within max budget |

**Inventory sending rule:**
- Send ALL matching inventory one by one, no cap
- When last property is sent: message customer "We will send you more inventories soon" + WhatsApp lead manager "All matching inventory sent, no more options currently"

**Re-match rule:**
- If customer shares ANY missing data (location, intent, category, BHK, or budget) mid-conversation → **immediately re-run match** and restart property card sequence from beginning

---

## Area 3 — Visit Push Strategy

**Every property card** includes "Schedule Visit" reply button — no separate push message needed.

**If no Schedule Visit after 24 hours:**
- AI proactively calls customer to push for visit booking (8 AM – 9 PM IST)

**If customer says "I'll come later / busy":**
- AI acknowledges + follows up after **24 hours**
- If specific callback date given → AI schedules at that exact date
- If no date given → AI calls after **24 hours**

**Visit push attempts:** No hard limit — AI continues until customer books or deal moves to `ON_HOLD`

---

## Area 4 — AI → Agent Handoff Triggers

| Trigger | Action |
|---|---|
| Customer asks for human | Immediate WhatsApp lead manager + AI pauses |
| Angry / hostile customer | Live transfer (Omnidim-dependent; fallback: apologize + end + WhatsApp lead manager) |
| Property-specific question (amenities, floor, etc.) | AI answers from inventory fields first; if data not available → "Come visit and experience it. Our team will also call you" + WhatsApp lead manager |
| Customer asks for price negotiation | AI: "We invite you to our office for a meeting with all parties" → push to schedule office visit |
| RENT lead — cold (Thu/Fri/Sat/Sun window passes with no response) | WhatsApp lead manager + continue weekly weekend chase |
| BUY lead — cold (weekly/monthly follow-up ignored) | Continue schedule; escalate to ON_HOLD after 3 months |
| Complex legal / financial question | AI defers + WhatsApp lead manager |
| Lead manager confirms visit date | Lead manager notified immediately on booking + reminder 24 hrs before visit |

---

## Area 5 — Call + WhatsApp Cadence

| Rule | Value |
|---|---|
| Business hours for calls | 8 AM – 9 PM IST |
| Follow-up call if no Schedule Visit | After 24 hours from last property sent |
| RENT cold lead follow-up | WhatsApp **+ call** every Thu, Fri, Sat, Sun until last day of month |
| BUY cold lead — Month 1 | **WhatsApp only** once a week; call only if customer responds to WhatsApp |
| BUY cold lead — Month 2+ | **WhatsApp only** once a month; call only if customer responds |

---

## Area 6 — Stage-Exit Rules

| Trigger | Next Stage |
|---|---|
| Customer provides visit date/time via dynamic WhatsApp | → `MATCHING_APPOINTMENT` (auto-move) |
| Lead manager confirms appointment | → `VISIT_SCHEDULED` |
| Customer requests negotiation meeting + date/time | → `MATCHING_APPOINTMENT` (negotiation context flagged) |
| RENT lead — end of month, no response | → `ON_HOLD` + WhatsApp lead manager |
| BUY lead — 3 months no response | → `ON_HOLD` + WhatsApp lead manager |
| Any non-responding lead | → `ON_HOLD` + WhatsApp lead manager: "Customer not replying. Please call and reactivate. If not possible, mark as closed lost." |
| Customer says not interested | → `ON_HOLD` (NOT_INTERESTED_NOW) — lead manager must confirm CLOSED_LOST |
| Lead manager manual drag | Allowed — anyone with permission |

**Critical rule (applies all stages):**
> AI never moves a deal to `CLOSED_LOST`. Only lead managers can do that. AI's job = `ON_HOLD` + notify.

---

## Pipeline Loop (Discovered During Stage 2 Planning)

The pipeline is **not linear**. VISITED has 3 exit paths:

```
VISITED ─┬─→ VISIT_SCHEDULED   (client wants to see more properties — same shortlist)
         ├─→ QUALIFIED          (client wants completely different properties re-matched)
         └─→ NEGOTIATION        (client liked a property)
```

The `workflow_round` field in the existing schema tracks visit round number per deal. AI uses this to know it is on visit #2 or #3 for the same lead.

---

## Deferred Items

| # | Item |
|---|---|
| 1 | Meta template mapping — which of 55 approved templates fire per trigger event |
| 2 | RENT ON_HOLD → what happens after lead manager reactivates (does it go back to QUALIFIED or elsewhere?) |
| 3 | BUY ON_HOLD after 3 months → monthly WhatsApp nudge cadence while in ON_HOLD |
| 4 | KRA metrics (property-to-visit conversion rate, time-in-QUALIFIED, etc.) |
| 5 | Commercial subcategory matching depth |

## Implementation Dependencies

- Omnidim: outbound call capability for 24hr follow-up + weekend rent chases
- Meta WhatsApp: dynamic message with reply buttons (already in approved template pool)
- Dynamic date/time capture via WhatsApp interactive message
- `workflow_round` field already in schema — used for visit loop tracking
- Inventory fields (amenities, floor, lift, gas pipeline) must be consistently populated for AI to answer property questions

## Next Stage

Stage 3 — **MATCHING_APPOINTMENT** — brief intermediate stage between appointment requested and visit confirmed.
