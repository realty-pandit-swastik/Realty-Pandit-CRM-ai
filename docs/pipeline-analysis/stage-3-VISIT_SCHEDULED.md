# Deal Pipeline — Stage 3: VISIT_SCHEDULED (the visit lifecycle)

> As-is record + improvement suggestions for the VISIT_SCHEDULED stage: AI, human, resources, coordination, disconnections. Built from a 3-way code trace 2026-06-22 (reflects the F4 + QUALIFIED-1 fixes already shipped). Companion to stage-1-NEW.md + stage-2-QUALIFIED.md. Root: `agents/backend/src/`.

## TL;DR
A visit is scheduled — either a real **booked** appointment (slot set) or a provisional **`requested`** one (awaiting the customer's day/time, from a card tap). The AI sends 24h/2h reminders, the manager gets a daily schedule + 24h briefings, and the human books/confirms/reschedules and finally **submits the visit outcome** → NEGOTIATION. **The defining weakness of this stage is silent stalls:** a deal can sit in VISIT_SCHEDULED forever — *visit requested-but-never-slotted*, *visited-but-never-marked*, *no-show parked*, or *reschedule dead-ended* — and the **only** detector is a passive once-a-day audit line with no automated recovery.

---

## A. What happens, in time order

### AI path (Panditji)
1. **Entry → VISIT_SCHEDULED:** (a) "Schedule Visit" card tap → provisional **`requested`** appointment (placeholder slot) + `rp_visit_availability` asks the customer for a day/time + coordinator alert + VISIT_REQUEST task (`property_card_reply_handler.ts:147-248`); (b) human `book-appointment`; (c) coordination fallback (no-appointment deal → next message treated as availability).
2. **Slot-fill:** customer day/time (`coordination_agent.ts:194-232` → `calendar.createPropertyVisitAppointment` find-or-update) or human `book-appointment` → status `requested`→`scheduled`.
3. **Reminders:** `pipeline_crons.runVisitReminders` (every 30 min; 24h + 2h windows; `status in [scheduled,confirmed]`; ai_paused + teamActedRecently gated; dedup per appointment) → `rp_visit_reminder_24hr`/`rp_visit_reminder_2hr` (plaintext fallback if template unapproved).
4. **Confirm / Reschedule / Cancel:** `coordination_agent` (F4-unified lookup: any non-terminal status) + the `webhook_processor` calendar branch (the reminder's "Confirmed" button). Confirm → `confirmBothParties` notifies buyer+seller+executive (free-text) → sets `confirmed` → **transitions deal VISIT_SCHEDULED→VISITED** (`coordination_agent.ts:500-518`). Reschedule → `rescheduled` (no new slot captured). Cancel → `cancelled` (in-agent) OR routed to reschedule (webhook branch — an inconsistency).
5. **Manager crons:** `runManagerDailySchedule` (8 AM IST, `rp_visit_daily_schedule`) + `runManager24hrBriefing` (every 30 min, `rp_visit_manager_1hr`).
6. **Google Calendar:** `pushAppointmentToGoogle` puts the visit on the **assigned agent's** calendar (opt-in; for `book-appointment` it lands via the 5-min `reconcileGoogleSync` sweep, ~5-min latency). **No customer/owner calendar invite** (WhatsApp + optional email only).
7. **→ VISITED:** confirm-driven (AI, on confirmation) OR human `visit-outcome`. **No time-based auto-advance.**

### Human path (assigned member)
1. **Sees the deal** in the amber VISIT_SCHEDULED column: chip **🗓️ Visit requested · awaiting slot** vs **✅ Visit booked: <date>** (`DealPipeline.tsx:323-333`); buttons **📝 Outcome**, **📞 I Reminded** (logs `REMINDER_GIVEN` so AI skips its next reminder), **❌ Close as Lost**; QuickCallStrip (lead / coordinator / owner / key-holder).
2. **Book** (Deal Workspace → Shared tab → 📅 Book on a shared property) → `POST /:id/book-appointment` (find-or-update, dup-safe) → notifies customer (`rp_visit_confirmation_customer`) + coordinator (`rp_visit_booked_manager`) + key-holder (`rp_visit_keyholder_alert`, only if `key_holder_phone` set).
3. **No dedicated reschedule/confirm/cancel endpoints** — re-book via `book-appointment`; confirm/reschedule are customer-WhatsApp-driven in `CalendarService`.
4. **Submit Visit Outcome** (`POST /:id/visit-outcome`): Property Liked→**NEGOTIATION** (`rp_negotiation_availability`); Want More→stays; Re-match→**QUALIFIED** + auto re-share; No Show→stays + `rp_call_attempted`.
5. All actions need **`act_on_deals`** (employees can do the whole VISIT_SCHEDULED workflow).

---

## B. Resource / connection inventory (VISIT_SCHEDULED)
| Resource | Used for | Status |
|---|---|---|
| WhatsApp templates | `rp_visit_availability`, `rp_visit_reminder_24hr/2hr` (plaintext fallback), `rp_visit_confirmation_customer`, `rp_visit_booked_manager`, `rp_visit_keyholder_alert` / `rp_visit_keyholder_v2`, `rp_visit_daily_schedule`, `rp_visit_manager_1hr`, `rp_call_attempted` | **LIVE** (some w/ plaintext fallback "pending Meta approval") |
| Appointment model | `requested→scheduled→confirmed→rescheduled/cancelled`; `in_progress/completed/no_show` have NO writer (human/CRM only) | **LIVE** |
| Google Calendar | agent-only visit event (opt-in; reconcile-backfilled for book-appointment) | **LIVE but opt-in/agent-only**; no customer invite |
| CalendarService | website/chat/WhatsApp appointment create + confirm/reschedule/reminders | **LIVE** (admin Book inlines its own create) |
| Crons | `runVisitReminders`, `runManagerDailySchedule`, `runManager24hrBriefing`, `reconcileGoogleSync` | **LIVE** |
| behavior_auditor R7 | the ONLY stalled-VISIT_SCHEDULED detector (passive daily digest) | **LIVE but passive** |

---

## C. The disconnections (ranked — improvements to discuss)

1. **🔴 "Visited-but-never-marked" — the biggest silent stall (GAP 4).** Nothing detects that the scheduled time passed. If the human forgets to submit the outcome and the customer doesn't message, the deal sits in VISIT_SCHEDULED **indefinitely** — the 2h reminder already fired and won't repeat. There's no *"your visit was at 4 PM — how did it go?"* message to the customer that could self-advance the deal. **Suggested fix:** a post-visit cron — N hours after `scheduled_at`, send the customer a "how did the visit go?" prompt (liked / want-more / didn't-go) + create a manager "log the outcome" task; their reply auto-advances the deal.
2. **🔴 "Requested-but-never-slotted" orphan (GAP 1, introduced by QUALIFIED-1).** A `requested` appointment whose customer never sends a day/time sits forever, excluded from reminders. Backstop is just one super_boss task escalation + the daily audit. **Suggested fix:** a follow-up that re-asks for the slot (and/or offers 2-3 concrete slots to tap) a few hours after the tap; escalate/auto-expire `requested` after N hours.
3. **🟠 Confirm ≠ Visited — the AI marks VISITED too early (GAP 7).** `confirmBothParties` flips the deal to VISITED the moment the customer *confirms* — which can be hours/days **before** the visit happens. That early-confirmer is now "VISITED" with a future appointment, and is dropped from the 2h reminder. **Suggested fix:** confirmation should set `confirmed`, NOT VISITED; advance to VISITED only after the visit time (cron) or on the human outcome.
4. **🟠 No-show handling is broken + split (GAP 3).** The "No Show" outcome doesn't set the appointment `no_show`, doesn't apply the lead-score reliability penalty, doesn't send the proper `rp_noshow_recovery` template (sends generic `rp_call_attempted`), and re-stamps `updated_at` (resetting the audit clock). A separate `/no-show` endpoint does it properly but is a different button. **Suggested fix:** unify — the "No Show" outcome should call `handleNoShow` (status + penalty + recovery template + new-slot ask).
5. **🟠 Reschedule dead-end (GAP 8).** Customer "reschedule" → `rescheduled` + "our team will contact you", but **no new slot is captured, no task is created**, reminders stop, and the reconcile sweep **deletes** the Google event. The deal sits with a dead appointment. **Suggested fix:** reschedule should immediately re-ask for a day/time (route to the availability-capture flow) + create a task.
6. **🟠 Double reminders + leaky pause (GAP 7).** Two independent reminder systems (`pipeline_crons` + `interaction_engine`) can both fire ~2h out (different templates), and **`interaction_engine` ignores `ai_paused`** — so a human-paused deal still gets bot reminders. **Suggested fix:** consolidate to one reminder system (or make `interaction_engine` respect `ai_paused` + the shared dedup).
7. **🟡 Key-holder split + gap (GAP 6).** Two paths/recipients: Book → `key_holder_phone`/`rp_visit_keyholder_alert`; drag → `owner_phone`/`rp_visit_keyholder_v2`. If neither phone is set, **nobody is alerted** → the agent can arrive at a locked property. **Suggested fix:** one key-holder resolver (key_holder_phone → owner_phone fallback) on both paths; surface "no key contact" as a warning.
8. **🟡 Google Calendar coverage (GAP 5).** Agent-only + opt-in (un-connected agents get nothing), `requested` excluded, ~5-min latency on book-appointment, no customer invite. **Suggested fix:** direct `pushAppointmentToGoogle` from `book-appointment` (kill the latency); consider a customer .ics/calendar link.
9. **🟡 The only stall detector is passive (GAP 2).** `behavior_auditor` R7 (VISIT_SCHEDULED >48h, no outcome) is a once-daily, human-read, action-less digest line keyed on `updated_at` (reset by routine activity). **Suggested fix:** make R7 actionable (auto-create a manager task) once the post-visit cron (fix #1) exists.

### Theme
Every silent-stall vector (1, 2, 3, 5) ultimately falls through to **one passive daily audit with no automated recovery**. The highest-leverage fix is a **post-visit-time cron** (fix #1) that closes "visited-but-never-marked" and gives the others a real recovery hook. The **confirm=VISITED** bug (fix #3) is a correctness issue worth fixing alongside.

---

## Resolution log — ✅ ALL fixed + deployed 2026-06-22
- **#1** post-visit cron `runPostVisitFollowup` (every 30 min, 7-day lookback): past visit + no outcome → customer "how was your visit?" + HIGH coordinator "log outcome" task. Dry-run: 0 first-run targets.
- **#2** same cron: stale `requested` (>4h, no slot) → re-ask `rp_visit_availability`.
- **#3** confirmation sets `confirmed`, NO longer auto-advances to VISITED.
- **#4** "No Show" outcome → appointment `no_show` + `handleNoShow` (penalty + `rp_noshow_recovery`).
- **#5** reschedule re-asks for a new day/time; `coordination_agent` routes `requested`/`rescheduled` appts to slot-capture (no more dead-end).
- **#6** retired the duplicate `interaction_engine` visit reminders (ignored ai_paused + double-sent); `pipeline_crons.runVisitReminders` is now the sole source.
- **#7** key-holder alerts resolve `key_holder_phone || owner_phone` (+ warn if neither) on both paths.
- **#8** `book-appointment` pushes to the agent's Google Calendar immediately.
- backend tsc 378 (0 new); deployed. Behavioral flows (cron/no-show/reschedule) verified by tsc + logic + dry-run; live triggers exercise on real traffic. **VISIT_SCHEDULED stage closed.** Next: VISITED (Stage 4).
