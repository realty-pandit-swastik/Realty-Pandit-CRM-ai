# Pipeline Stage 1 — NEW — KRA Plan

**Date Locked:** 2026-04-24
**Parent Decision:** [DEC-003 Deal Pipeline Unification](../decisions/DEC-003-deal-pipeline-unification.md)
**Status:** Locked — ready for implementation (after deferred items are resolved)

## Scope

This document defines the complete behavioral spec for the **NEW** stage of the unified Deal Pipeline. Applies to deals created from **External** sources (99acres, APIs, web forms, inbound WhatsApp) and **Partner** sources (broker, builder). **Internal** (team-entered) leads skip NEW entirely and enter at `QUALIFIED`, per DEC-003.

## Stage Owner

- **Primary:** AI Pandit Ji (outbound calling via Omnidim, WhatsApp messaging via existing Meta templates)
- **Secondary:** Lead Manager (intervenes on explicit signals listed in Area 4)

## Exit Destinations

A deal exits NEW into one of: `QUALIFIED`, `CLOSED_LOST`, `ON_HOLD`, or remains in `NEW` pending callback / human handoff.

---

## Area 1 — AI Call Cadence

| Rule | Value |
|---|---|
| First contact on lead arrival | Call + WhatsApp fire immediately in parallel |
| Business hours for calls | 8:00 AM – 9:00 PM IST |
| Lead arrives outside business hours | First call queues to 8:00 AM next day; WhatsApp fires immediately |
| No-answer retry sequence | 5 min → 1 hour (+ WhatsApp lead manager) → every 3 hours thereafter |
| Retry cadence scope | Identical for RENT and BUY deals |
| Callback requested with specific date/time | Schedule at that time + WhatsApp lead manager; retry counter resets |
| Callback requested without specific time | Retry in 2 hours + WhatsApp lead manager; retry counter resets |

### Deferred
- Max retry attempts before auto-moving to `ON_HOLD`
- Buy-lead nurture cadence after qualification window
- ON_HOLD auto-resurrection pings

---

## Area 2 — Qualification Threshold & Data Flow

### Pre-call Data Check
AI pulls the existing `Contact` record and identifies which fields are already populated from the lead source:

| Field | Typical Source |
|---|---|
| `name` | web form, partner |
| `email` | web form |
| `source` | auto-tagged |
| `demand_intent` (buy / rent) | 99acres filter |
| `demand_type_slug` (flat, 2bhk, shop…) | 99acres filter |
| `demand_main_category` (residential / commercial) | 99acres filter |
| `demand_bhk` | 99acres filter |
| `preferred_location` | 99acres filter |
| `budget_min` / `budget_max` | 99acres filter |
| `demand_budget_type` (one_time / per_month) | derived from intent |
| `demand_amenities` | rarely pre-filled |

### Qualification Threshold
**A deal moves `NEW → QUALIFIED` when the customer confirms identity + interest.** No other field is mandatory.

### Missing-Field Collection
- Happens conversationally *after* the customer confirms interest, within the same call or subsequent interactions
- Framed as customer value: "To show you the best options, can you confirm…"
- Progressive — whatever customer shares is saved; whatever they skip is re-requested later

### Refusal-to-Share Path
If customer confirms interest but refuses to share additional details:
1. Deal still transitions `NEW → QUALIFIED`
2. WhatsApp notification to lead manager: "Call [customer] to gather missing details: [list of missing fields]"
3. AI continues in parallel:
   - Shares properties via WhatsApp based on available data (broad match)
   - Keeps nudging customer: "Share your budget/location to refine matches"
4. Lead manager chasing + AI nudging run simultaneously until gaps close

---

## Area 3 — Qualification Outcomes

| Outcome | Next Stage | `lead_status` | Notes |
|---|---|---|---|
| VERIFIED | QUALIFIED | warm | Customer confirms identity + interest |
| CALLBACK_REQUESTED | NEW (stays) | cold | Reschedule per Area 1 |
| NOT_INTERESTED_NOW | ON_HOLD | cold | Dormant; eligible for future nurture |
| JUST_BROWSING | CLOSED_LOST | lost | Soft close |
| WRONG_NUMBER | CLOSED_LOST | lost | Mark contact invalid, block future calls |
| DUPLICATE | CLOSED_LOST (merge) | lost | Merge into existing deal |
| SPAM | CLOSED_LOST | lost | Flag contact, block |
| BANKER_VALUER | CLOSED_LOST | lost | Block future calls |
| PARTNER_AGENT | ON_HOLD (review flag) | — | Auto partner-record creation deferred; lead manager reviews |
| LANGUAGE_BARRIER | NEW (stays) | cold | Immediate human handoff |
| NO_ANSWER_MAX | ON_HOLD | cold | After max retries (cutoff deferred) |

### Language Strategy
- **Lead manager-facing** notifications (WhatsApp, dashboard): Hindi + English
- **Customer-facing** AI: speaks whichever language the customer speaks
- Practical supported language list: **gated by Omnidim voice capability** — TBD at integration time
- If customer's language not supported → LANGUAGE_BARRIER outcome → human handoff

### Deferred
- Auto partner-record creation on PARTNER_AGENT outcome
- Partner-onboarding script / partnership pitch

---

## Area 4 — AI → Agent Handoff Triggers

| Trigger | Action |
|---|---|
| No answer after 1 hour | WhatsApp lead manager |
| Callback requested (any form) | WhatsApp lead manager |
| Customer refuses to share details | WhatsApp lead manager + AI continues broad property sharing |
| Customer explicitly asks for human | Immediate WhatsApp lead manager + **AI pauses** until human calls |
| Angry / hostile customer | **Live transfer** to lead manager (Omnidim-capability-dependent; fallback: apologize politely, end call, WhatsApp lead manager) |
| Complex legal / tax / loan question | AI says "Our team member will answer that shortly" + WhatsApp lead manager |
| PARTNER_AGENT detected | ON_HOLD + WhatsApp lead manager for review |
| LANGUAGE_BARRIER | Immediate human handoff |
| Nonsense / unintelligible responses | **No handoff** — AI keeps trying normally; no escalation on gibberish alone |

### Deliberate Exception to "AI Never Stops"
When customer explicitly asks for a human, AI pauses calling activity until lead manager engages. This is the only NEW-stage case where AI yields control. All other handoffs run AI + human in parallel.

---

## Area 5 — WhatsApp Communication Flow

### 5A. Customer-Facing

| Event | Behavior |
|---|---|
| Lead arrival | Always fire (parallel to first call) — intro + inquiry reference |
| Unanswered call attempts | Send once after 1st missed call, then stop — no WhatsApp spam |
| Callback requested | Silent — no confirmation message to customer (lead manager still notified) |
| VERIFIED → QUALIFIED transition | No bridging message — QUALIFIED stage owns its own comms |
| CLOSED_LOST — polite close | JUST_BROWSING, NOT_INTERESTED_NOW |
| CLOSED_LOST — silent close | SPAM, WRONG_NUMBER, DUPLICATE, BANKER_VALUER, NO_ANSWER_MAX |
| CLOSED_LOST — no automated message | PARTNER_AGENT, LANGUAGE_BARRIER (human handles comm) |

### 5B. Lead Manager-Facing

Fires on any of: no-answer 1 hr, callback requested, refuses to share details, asks for human, angry customer, complex question, partner agent detected, language barrier, VERIFIED (completion notice).

Template payload should include: customer name/phone, current stage, AI's last action, reason for notification, recommended next action.

### Dependency
Mapping specific **Meta WhatsApp templates** (from the existing 55 approved pool) to each trigger event is a follow-up implementation task.

---

## Area 6 — Stage-Exit Rules (Manual & Signal-Driven)

| Rule | Decision |
|---|---|
| Lead manager "Mark as Qualified" button on deal card | Allowed — on click, deal jumps to QUALIFIED, AI stops qualification calls for this lead |
| Customer positive WhatsApp reply ("yes still looking") | Auto-move deal to QUALIFIED |
| Customer negative WhatsApp reply ("stop", "not interested") | Do **not** auto-close — WhatsApp lead manager to confirm first |
| ON_HOLD deal gets customer reply later | Do **not** auto-reopen — WhatsApp lead manager to decide reopen path (→ NEW or → QUALIFIED) |
| Manual Kanban drag-drop of NEW cards | Anyone with permission can drag |

---

## Deferred Items Summary

| # | Item | Blocked By |
|---|---|---|
| 1 | Max retry attempts / ON_HOLD cutoff (RENT vs BUY) | Shelf-life strategy planning |
| 2 | Buy-lead nurture cadence after qualification window | Shelf-life strategy planning |
| 3 | Omnidim live-transfer capability | Omnidim integration |
| 4 | Omnidim supported languages list | Omnidim integration |
| 5 | Auto partner-record creation on PARTNER_AGENT | Partner-onboarding flow design |
| 6 | ON_HOLD auto-resurrection pings | Nurture strategy |
| 7 | Meta template mapping per trigger event | Implementation task |
| 8 | KRA metrics (qualification rate, time-to-first-contact, etc.) | Separate metrics planning session |

## Implementation Dependencies

- Omnidim account + API credentials + webhook contract
- Mapping of the 55 approved Meta WhatsApp templates to the NEW-stage trigger events above
- `Contact` and `Transaction` schemas require **no changes** for NEW-stage logic beyond the `TransactionStatus` enum migration already specified in DEC-003
- `lead_status` enum values (cold, warm, hot, closed, lost) already exist in the schema

## Next Stage

Stage 2 — **QUALIFIED** — KRA planning scheduled for a separate session.
