# Pipeline Stage 4 — VISIT_SCHEDULED — KRA Plan

**Date Locked:** 2026-04-24
**Parent Decision:** [DEC-003 Deal Pipeline Unification](../decisions/DEC-003-deal-pipeline-unification.md)
**Previous Stage:** [Stage 3 — MATCHING_APPOINTMENT](./2026-04-24-pipeline-stage-03-matching-appointment-kra.md)
**Status:** Locked — ready for implementation

## Scope

Appointment is officially confirmed. Customer has date, time, and Google Maps location. AI's job is coordination and reminders — ensuring neither customer nor lead manager misses the visit. All visit outcomes are submitted by the lead manager in the pipeline UI.

## Stage Owner

- **AI:** Sends reminders to customer, lead manager, and key holder. Monitors confirmation responses.
- **Lead Manager:** Attends visit, submits outcome in pipeline UI. Takes over on no-show.
- **Key Holder:** Must be available at property or arrange key delivery.

## Core Rule — Human Submits All Visit Outcomes

**Lead manager owns all visit outcomes. AI does not auto-detect or auto-close visits.**

Lead manager submits one of these in the pipeline:

| Submission | Next Stage |
|---|---|
| No Show | → `VISIT_SCHEDULED` (AI sends customer reschedule WhatsApp) |
| Visit Complete — Property Liked | → `NEGOTIATION` |
| Visit Complete — Want More Properties (same shortlist) | → `VISIT_SCHEDULED` |
| Visit Complete — Re-match Required | → `QUALIFIED` |

---

## Area 1 — Customer Reminder Sequence

| Reminder | Timing | Content |
|---|---|---|
| Reminder 1 | 24 hours before | "Your visit is tomorrow at [time]. See you there!" + **"Confirmed" reply button** |
| Reminder 2 | 2 hours before | "Your visit is in 2 hours at [time]!" + **"Confirmed" reply button** + **Google Maps location link** |

**When customer taps "Confirmed":**
- AI logs confirmation
- Fresh 24-hour Meta session window opens
- Lead manager notified: "Customer confirmed attendance"

**Google Maps location** is pulled from the specific inventory being visited (stored at upload time). Included only in the 2-hour reminder.

---

## Area 2 — Lead Manager Prep

| Timing | What AI Sends |
|---|---|
| 8 AM on visit day | Consolidated daily schedule: all visits of the day in one WhatsApp |
| 24 hours before each visit | WhatsApp briefing: customer name, property address, visit time, requirements (BHK, budget, location) + brief AI summary (last interaction + interest level) |
| 1 hour before each visit | WhatsApp reminder: visit details recap |

---

## Area 3 — Key Holder Notification

Fires when appointment is confirmed (from MATCHING_APPOINTMENT). Repeated as reminder in VISIT_SCHEDULED.

**WhatsApp to key holder:**
> "We have a client visit scheduled for [property] on [date] at [time]. Please be ready at the property OR arrange to send keys to our office."

**Reply buttons:**

| Button | Action |
|---|---|
| ✅ "I'll be there" | AI logs response, lead manager notified |
| 🔑 "Sending keys to office" | AI logs response, lead manager notified to arrange key collection |
| 📅 "Need to reschedule" | Lead manager notified to coordinate new time |
| (No response) | Lead manager notified to follow up with key holder directly |

---

## Area 4 — No-Show Handling

### Customer No-Show
- Lead manager marks "No Show" in pipeline
- Deal moves back to `VISIT_SCHEDULED`
- AI automatically sends customer WhatsApp: "We missed you today! Would you like to reschedule your visit?" → reschedule flow restarts

### Lead Manager No-Show Tracking
- Lead manager no-shows are tracked in the system
- After **3 lead manager no-shows** on any deals → AI notifies super admin
- Day-to-day lead manager accountability is managed offline

---

## Area 5 — Stage-Exit Rules

| Trigger | Next Stage |
|---|---|
| Lead manager submits "Visit Complete — Property Liked" | → `NEGOTIATION` |
| Lead manager submits "Visit Complete — Want More Properties" | → `VISIT_SCHEDULED` (new visit from existing shortlist) |
| Lead manager submits "Visit Complete — Re-match Required" | → `QUALIFIED` (full property re-match) |
| Lead manager submits "No Show" | → `VISIT_SCHEDULED` + AI sends customer reschedule WhatsApp |
| Deal goes cold / no visit happens | → `ON_HOLD` + lead manager notified |
| Manual drag | → Allowed (anyone with permission) |

---

## Deferred Items

| # | Item |
|---|---|
| 1 | Meta template mapping for all VISIT_SCHEDULED WhatsApp events |
| 2 | Google Maps link format (coordinates vs stored URL) — verify inventory schema field |
| 3 | What happens if property is removed from inventory before the visit date |
| 4 | Maximum reschedule attempts before moving to ON_HOLD |
| 5 | KRA metrics (show-up rate, visit-to-negotiation conversion, etc.) |

## Next Stage

Stage 5 — **VISITED** — lead manager submits visit outcome, AI follows up post-visit based on client decision.
