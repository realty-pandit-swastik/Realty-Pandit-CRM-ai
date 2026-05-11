# Pipeline Stage 3 — MATCHING_APPOINTMENT — KRA Plan

**Date Locked:** 2026-04-24
**Parent Decision:** [DEC-003 Deal Pipeline Unification](../decisions/DEC-003-deal-pipeline-unification.md)
**Previous Stage:** [Stage 2 — QUALIFIED](./2026-04-24-pipeline-stage-02-qualified-kra.md)
**Status:** Locked — ready for implementation

## Scope

Brief coordination stage. Customer has provided a preferred visit date/time (captured via dynamic WhatsApp in QUALIFIED). Appointment must be **confirmed by the lead manager** before it becomes official. Exit = lead manager confirms → `VISIT_SCHEDULED`.

## Stage Owner

- **AI:** Holds the appointment request, sends notifications, follows up if lead manager or customer goes silent
- **Lead Manager:** Must confirm (or reschedule) within SLA

## Exit Destinations

| Destination | Trigger |
|---|---|
| `VISIT_SCHEDULED` | Lead manager confirms the appointment |
| `MATCHING_APPOINTMENT` (restart) | Customer reschedules — new date/time captured |
| `QUALIFIED` | Customer cancels and refuses to reschedule |
| `ON_HOLD` | Customer and lead manager both unreachable |

---

## Area 1 — On Entry to MATCHING_APPOINTMENT

**Fires immediately on entry:**

| Recipient | Message |
|---|---|
| Lead Manager | WhatsApp: "New appointment requested by [Name] for [date/time] at [property]. Please confirm." |
| Customer | WhatsApp: "Your appointment is being confirmed. We'll notify you shortly." |

**Lead manager confirmation SLA:** 1 hour

**If no confirmation after 1 hour:** AI re-pings lead manager
**Maximum reminders:** 3 reminders → then escalate to super admin / manager

---

## Area 2 — Customer Reschedule / Cancellation

| Scenario | Action |
|---|---|
| Customer wants to reschedule | AI sends new dynamic WhatsApp to capture new date/time → stays in MATCHING_APPOINTMENT → lead manager re-notified with updated time |
| Customer cancels visit | AI asks "Would another time work?" — one rescue attempt. If customer doesn't confirm new date/time → deal moves back to `QUALIFIED` + notify lead manager |
| Customer silent after confirmation WhatsApp | Step 1: AI sends WhatsApp reminder by end of business day (9 PM IST) → Step 2: If still silent, AI calls next morning at 8 AM → Step 3: If still no reply, AI notifies lead manager to take over |

---

## Area 3 — Stage-Exit Rules

| Trigger | Next Stage | Customer Action |
|---|---|---|
| Lead manager confirms | → `VISIT_SCHEDULED` | AI sends confirmation WhatsApp with Google Maps location |
| Customer reschedules + new date given | → stays in `MATCHING_APPOINTMENT` | Restart confirmation flow |
| Customer cancels / refuses reschedule | → `QUALIFIED` | AI resumes property sharing; lead manager notified |
| Customer + lead manager both unreachable | → `ON_HOLD` | Lead manager decides reactivation |
| Manual drag | → allowed | Anyone with permission |

---

## Location Rule (Critical Implementation Detail)

Every inventory item has a **Google location** captured at upload time (stored in the inventory database). When lead manager confirms the appointment:

> AI sends customer WhatsApp: "Your visit is confirmed for [date/time]. Here's the property location: [Google Maps link]"

The Google Maps link is pulled from the specific inventory being visited. This is **automatically included** in every confirmation message — no manual step needed.

**Implementation dependency:** Verify the exact Google location field name in the inventory schema (likely `latitude`/`longitude` or a stored Maps URL) and confirm Google Maps deep-link generation at implementation time.

---

## Deferred Items

| # | Item |
|---|---|
| 1 | Exact Google location field name in inventory schema |
| 2 | Google Maps link format (coordinates vs place URL vs short link) |
| 3 | Meta template mapping for all MATCHING_APPOINTMENT WhatsApp events |
| 4 | What happens if the property being visited is removed from inventory before visit date |

## Next Stage

Stage 4 — **VISIT_SCHEDULED** — AI coordinates with team member and lead so the appointment is not missed.
