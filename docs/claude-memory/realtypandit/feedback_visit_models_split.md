---
name: ScheduledVisit vs Appointment — CRM only reads Appointment
description: Website-form visits must create an Appointment (not just ScheduledVisit) or they're invisible in the CRM lead-detail Visits tab + employee calendar.
metadata:
  type: feedback
---

Two parallel visit models exist. The internal CRM (lead-detail "Visits" tab →
`GET /api/calendar/appointments?contact_id=`, employee calendar, reminders,
deal linkage) reads **`Appointment`** ONLY. `ScheduledVisit` is read only by
the partner-agent portal + buyer self-auth view.

Any client-facing visit booking MUST create an `Appointment` (via
`CalendarService.createPropertyVisitAppointment` — formerly `createFromChat`,
kept as a deprecated alias) or it is invisible/unactionable for staff even
though the booking "succeeded". Website **chat** always did this; the website
**form** (`/public/schedule-visit`) did NOT until 2026-05-17 — that asymmetry
was the "client booked but it failed" bug.

**Why:** `Appointment.scheduled_at` is mandatory, so date+time are mandatory
for every client booking (no "flexible"/defaults). Slot→time:
`utils/visit_schedule.ts slotToScheduledAt` — morning 09:00 / afternoon 12:00
/ evening 16:00 IST (IST=UTC+5:30, no DST).

**How to apply:**
- New visit entry point → create the Appointment, set
  `assigned_to_agent_id`/`internal_handler_id` = property's `assigned_agent_id`.
- Don't add a second buyer WhatsApp — the calendar service already sends
  buyer + seller + superboss + lead-agent (the chat pattern). Bespoke
  buyer/agent WA in the handler = double-send.
- Enforce date+time at validator + form + chat/adapters (all 3 layers).
- Server scripts: run from `/var/www/realty-pandit/backend` and
  `require("./dist/db")` (NOT `/tmp` + ts-node — module resolution fails).
  Avoid nested SSH single-quote timestamp literals → use Prisma/node.

Shipped 2026-05-17. Detail: `docs/plans/2026-05-17-website-visit-not-visible-in-crm.md`.
Related: [[feedback_phone_normalization]] (resolveStoredContactPhone dup-guard
now on all 7 reachable /public/* upserts).
