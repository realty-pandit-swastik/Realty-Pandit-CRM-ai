# 2026-05-17 — Website schedule-visit not visible/actionable in CRM

**Status:** ✅ SHIPPED & VERIFIED 2026-05-17 — all phases A–G executed, backend
+ website deployed, prod E2E green.

**Verification (prod, 2026-05-17):**
- Phase A/C: 4/4 negative E2E → 400 (missing date, missing time, "flexible",
  past date). Zod v4 runtime confirmed despite @types noise.
- Phase C (Bug A/B/C): valid POST → 201; exactly **1** contact (bare PK, no
  `+91` duplicate); `ScheduledVisit.internal_handler_id` = property agent;
  `Appointment` created `assigned_to_agent_id`=agent, `scheduled_at` correct
  (afternoon→12:00 IST); lead-detail Visits API `count=1`; exactly **one**
  buyer WhatsApp (no double-send). QA fixture fully cleaned.
- Phase B: deployed website serves fresh BUILD_ID; TIME_SLOTS =
  morning/afternoon/evening only ("flexible" only in a comment); date+time
  required + forced.
- Phase D: `resolveStoredContactPhone` applied to 7 reachable handlers;
  `/project-enquiry` excluded (verified dead code — unconditional 404).
- Phase E: chat_handler + buyer_chat_workflow_adapter + buyer_whatsapp_adapter
  now require explicit date AND time; no defaults; bot asks instead.
- Phase F: backend online, website online (realty-user PM2), GlitchTip clean
  (only pre-existing 5-day-old recurring AxiosError #8, unrelated).
- Phase G (Q1a): Hitesh's `e0640411` → Appointment created (idempotent),
  contact `9873333182`, agent Hardiq, 2026-05-17 **09:00 IST** morning,
  status scheduled; CRM Visits API `count=1`. ⚠ Visual screenshot NOT
  captured — Playwright MCP cannot launch (user's Chrome profile already
  running); verified via the exact backend endpoint the Visits tab renders.
- Test suites: my targeted suites 31/32 (1 = pre-existing unrelated
  `loginSchema`); full-suite failures all in untouched subsystems.

**Status (original):** PLAN — for review, NOT executed (ASK MODE). No
assumptions; every claim below verified in code/DB on 2026-05-17.

**Trigger:** Lead 9873333182 (Hitesh) "tried to book schedule visit but it
failed." Booking actually succeeded technically; the visit is invisible/
unactionable in the CRM.

---

## 1. Verified findings

### Timeline (lead 9873333182, IST = DB-UTC + 5:30)
- `10:15:49` `POST /public/schedule-visit` → **201**. Created: contact
  `9873333182`, `scheduled_visits` row `e0640411…`, interaction. Buyer WA
  confirmation sent; property agent **Hardiq (+919217151405)** got the
  "New Visit Request" WA (combined log line 10606). The booking did NOT fail.
- `11:33–11:34` admin opens lead → `GET /api/leads/9873333182` → **404**
  ("Could Not Load Lead" — fixed & deployed earlier today, separate plan
  `2026-05-17-website-phone-normalization-fix.md`).
- `12:59`+ post-fix → `200`; `13:50` admin reassigned lead to Savikant.

### Why it "failed" operationally — three concrete code facts

**Bug B (primary): website-form visits are written to a table the CRM never
reads.**
- `POST /public/schedule-visit` (`routes/public.ts:704`) creates ONLY a
  `ScheduledVisit` row. It does **not** create an `Appointment`.
- The website **chat** path does both: `services/chat_handler.ts:378` creates
  the `ScheduledVisit` *and then* calls
  `calendarService.createFromChat()` (`chat_handler.ts:~398`) which creates an
  `Appointment`. The form path is missing this second step — verified
  asymmetry.
- The lead-detail "Visits" tab reads ONLY `Appointment`:
  `frontend/src/components/ExternalLeads.tsx:583` →
  `GET /api/calendar/appointments?contact_id=<phone>` →
  `routes/calendar.ts:73 prisma.appointment.findMany` (model `Appointment`,
  table `appointments`). It never queries `scheduled_visits`.
  (`ExternalLeads.tsx:1619-1656` renders `leadAppointments` only.)
- DB confirms: `appointments` rows for Hitesh = **0**;
  `scheduled_visits` row exists. ⇒ structurally invisible on the lead.

**Bug A (secondary): `ScheduledVisit.agent_id` is null for website_form.**
- `routes/public.ts:704-717` create block sets no `agent_id` /
  `internal_handler_id`. DB: all 3 `website_form` rows have `agent_id = NULL`.
- Schema (`prisma/schema.prisma:1125-1126`): `agent_id` = "If property belongs
  to **external** agent"; `internal_handler_id` = "Assigned **internal** staff".
- The only readers of `ScheduledVisit.agent_id` are the **partner-agent
  portal** (`routes/agent.ts:453,897,1092`, `agents/partner_agent.ts`,
  `workflows/partner_agent.ts`) — keyed by the *external/partner* agent id.
  No internal CRM screen reads `scheduled_visits` at all.
- ⇒ For internally-assigned properties the correct field is
  `internal_handler_id`, not `agent_id`. This is mostly cosmetic for internal
  CRM once Bug B is fixed (Appointment carries the assignment), but matters for
  data correctness and any future scheduled_visits view.

**Bug C (regression risk introduced today): duplicate contacts for
legacy bare-stored numbers via any `/public/*` form.**
- After today's normalization deploy, `scheduleVisitSchema.phone` is
  `phoneField` → `req.body.phone` is `+91…`.
- `routes/public.ts:683` `prisma.contact.upsert({ where:{ phone_number: phone
  }})` with `phone = +919873333182`. Hitesh's existing contact PK is bare
  `9873333182` ⇒ no match ⇒ **upsert CREATES a duplicate contact**
  `+919873333182`, and the new ScheduledVisit/Appointment would point at the
  duplicate while the leads list still shows the old row.
- Same pattern in the other 7 `/public/*` upserts
  (`routes/public.ts:395,467,558,818,861,1062,1414`).
- 121 legacy bare/dash contacts exist (prev. plan) — every one is exposed to
  this if that person uses a website form again.

### Supporting facts (verified, constrain the fix)
- `calendarService.createFromChat({contact_id, property_id, scheduled_at,
  source, sessionId})` (`services/calendar.ts:254`): looks up property, sets
  `assigned_to_agent_id = property.assigned_agent_id`, `type='property_visit'`,
  `status='scheduled'`, fetches tenant, creates `Appointment`, then
  `sendAppointmentReminder` (WA to buyer via `rp_appointment_confirm`/text),
  `coordinate notify_seller`, `notifySuperBoss`, `notifyLeadAgent`.
  **Requires non-null `scheduled_at: Date`.**
- `Appointment` required fields: `contact_id` (FK→`Contact.phone_number`),
  `title`, `type` (`AppointmentType`), `scheduled_at` (DateTime, non-null),
  `tenant_id`. `AppointmentStatus` enum: scheduled|confirmed|in_progress|
  completed|cancelled|rescheduled|no_show.
- Website form input: `preferred_date` nullable; `preferred_time` free text —
  DB shows `"10:00"`, `"afternoon"`, `""`, NULL. Hitesh: date 2026-05-17,
  time empty.
- `GET /api/calendar/appointments` filters `contact_id` by **exact** match
  plus role filter (employee → `assigned_to_agent_id = userId`; super_boss →
  no extra filter). Frontend passes `contact_id = lead.phone_number` (the
  raw stored PK, e.g. `9873333182`). ⇒ the Appointment's `contact_id` MUST
  equal the stored Contact PK exactly.
- Duplicate-notification risk: current handler already sends buyer WA
  (`sendBuyerConfirmationWhatsApp`) + property-agent WA. `createFromChat`
  ALSO WAs the buyer (`sendAppointmentReminder`) + seller + superboss + lead
  agent. Naively adding it ⇒ buyer gets 2 WAs, agent notified twice.
- Hitesh contact `assigned_agent_id = 503ebb67… (Savikant)`; property
  `2dd91d71` `assigned_agent_id = bb853ef0… (Hardiq)`. `createFromChat`
  assigns the Appointment to the **property** agent (Hardiq) and separately
  notifies the lead agent if different — both get visibility.
- 3 orphaned `website_form` `scheduled_visits` (agent_id null, no Appointment):
  | id | contact_id | property_id | date | time |
  |----|-----------|-------------|------|------|
  | 780d9ee0 | +919999999999 (test) | cd30bddc | 2026-04-15 | 10:00 |
  | 3ed881c1 | +918851404256 | 8128ee39 | 2026-04-19 | afternoon |
  | e0640411 | 9873333182 (Hitesh) | 2dd91d71 | 2026-05-17 | (none) |

---

## 2b. DECISIONS — RESOLVED 2026-05-17 (per Puneet)

- **D1 → date & time are MANDATORY everywhere a client schedules.** Verified
  the gap exists at 3 layers (all client-facing):
  1. Website form `website/src/components/property-detail/ScheduleVisitForm.tsx`
     — `handleSubmit` blocks only on name+phone (line 42); date input is NOT
     `required`; `preferred_time` defaults to `'flexible'`; posts
     `preferred_date: form.preferred_date || undefined`.
  2. Backend `scheduleVisitSchema` — `preferred_date`/`preferred_time` are
     `z.string().optional()`. No enforcement; that is why Hitesh's row has an
     empty time.
  3. Website/WhatsApp chat `services/chat_handler.ts:377` — creates the
     ScheduledVisit unconditionally; only creates the Appointment
     `if (parsedDateTime.date)` (line 397). If NLP didn't get a date, a vague
     visit is stored with no firm date/time and no CRM Appointment. Same in
     `workflows/buyer_chat_workflow_adapter.ts:336`,
     `buyer_whatsapp_adapter.ts:537`.
  **Resolution:** enforce mandatory date + time at ALL three layers. Time slot
  set becomes `morning | afternoon | evening` (drop `flexible`); slot →
  concrete `scheduled_at` (IST, using the slot window start shown in the UI):
  morning→09:00, afternoon→12:00, evening→16:00. Deterministic — no placeholder
  needed. Chat must ASK the client for date+time and not create a visit until
  both are captured.
- **D2 → D2a:** form mirrors chat — keep `ScheduledVisit`, additionally create
  the `Appointment` via the calendar service.
- **D3 → D3b:** fix the duplicate-contact risk in ALL 8 `/public/*` upserts
  (`routes/public.ts:395,467,558,683,818,861,1062,1414`) in this change.
- **D4 → YES:** set `ScheduledVisit.internal_handler_id` =
  property's `assigned_agent_id`.
- **D5 → NOT selected (backfill excluded).** ⚠ Consequence: Hitesh's existing
  orphaned visit `e0640411` (and `3ed881c1`) stay invisible in the CRM and
  have invalid/empty time under the new rule. Open question Q1 below.

### Q1 — RESOLVED → Q1a: create the Appointment for Hitesh ONLY
One-off (Phase G): create the missing `Appointment` for `e0640411`
(contact `9873333182`, property `2dd91d71`, `assigned_to_agent_id` = property
agent Hardiq `bb853ef0…`, `type=property_visit`, `source=website_form`,
`status=scheduled`, `scheduled_at` = 2026-05-17 morning slot → 09:00 IST since
the row's time is empty, tenant from `tenant.findFirst`). Idempotent: skip if
an Appointment for that contact+property+date already exists. Do NOT touch
`3ed881c1` or the `+919999999999` test row.

## 2. Original open decisions (superseded by 2b)

- **D1 `scheduled_at` derivation.** `Appointment.scheduled_at` is mandatory;
  website `preferred_time` is unreliable free text. Options:
  - **D1a (recommended):** `scheduled_at` = `preferred_date` at a default
    11:00 IST; parse `preferred_time` only if it matches `HH:MM`; if
    `preferred_date` is null, use today+1 09:00 IST as placeholder and set
    `status='scheduled'` (team re-confirms — they already call to confirm).
  - **D1b:** if `preferred_date` null, do NOT create an Appointment (visit
    stays only in scheduled_visits, still invisible). Not recommended.
- **D2 Bug B approach.**
  - **D2a (recommended):** form path mirrors chat path — create
    `ScheduledVisit` (unchanged, for partner/buyer-auth compatibility) **and**
    call the calendar service to create the `Appointment`. Consistent with
    existing chat code; fixes lead-detail + employee calendar at once.
  - **D2b:** leave write alone; change lead-detail + add a backend endpoint to
    also read `scheduled_visits`. More surface area, doesn't fix employee
    calendar, diverges from chat pattern.
- **D3 Bug C scope.** Fix the contact upsert to resolve an existing contact
  via `resolveStoredContactPhone` before upserting:
  - **D3a (recommended):** fix only `/public/schedule-visit` now (tied to this
    incident), file a follow-up for the other 7 `/public/*` upserts.
  - **D3b:** fix all 8 `/public/*` upserts in this change (larger blast
    radius, more testing, but closes the dup risk fully).
- **D4 Bug A field.** Set `ScheduledVisit.internal_handler_id =
  property.assigned_agent_id` for internally-owned properties (leave `agent_id`
  for true external-agent properties). Confirm: do you want this now
  (low-risk, 1 line) or deferred since Appointment already carries assignment?
- **D5 Backfill.** Create Appointments for the orphaned real visits. Skip
  `+919999999999` (test). Confirm `+918851404256` contact exists first.
  Hitesh → Appointment(contact_id=`9873333182`, prop `2dd91d71`,
  assigned Hardiq, scheduled_at per D1, status `scheduled`).

---

## 3. Proposed implementation (per resolved decisions D1, D2a, D3b, D4; D5 excluded; Q1 pending)

Shared helper (new, pure, unit-tested) in `utils/` :
`slotToScheduledAt(preferredDateISO: string, slot: 'morning'|'afternoon'|'evening'): Date`
→ IST date at 09:00 / 12:00 / 16:00 respectively, returned as UTC Date.
Single source of truth used by the form handler, the chat path, and tests.

### Phase A — Backend validator hardening (`validators/public.validator.ts`)
- `scheduleVisitSchema`: `preferred_date` → **required**, ISO date,
  refined to be within `today … today+30` (mirror the form's `max`).
  `preferred_time` → **required** `z.enum(['morning','afternoon','evening'])`.
  Invalid/missing ⇒ 400 (authoritative gate even if a client bypasses the UI).

### Phase B — Website form (`website/src/components/property-detail/ScheduleVisitForm.tsx`)
- `TIME_SLOTS`: remove `flexible`. `preferred_time` initial state = `''`
  (no default) so a choice is forced.
- Date `<input type="date">`: add `required`; keep `min=todayStr max=maxDateStr`.
- `handleSubmit`: also block when `!form.preferred_date || !form.preferred_time`
  (inline error text). Remove the `|| undefined` — always send both.
- This is a **website (Next.js) deploy** — `deploy-agent.js website`. No PWA
  service-worker concern (website app); confirm no caching of the form bundle.

### Phase C — Write fix in `POST /public/schedule-visit` (`routes/public.ts:674-760`)
1. **Bug C:** `const storedPhone = (await resolveStoredContactPhone(
   req.body.phone, prisma)) ?? phone;` — use `storedPhone` for the contact
   upsert `where` and for `contact_id`/`phone`/`phone_number` throughout, so
   legacy bare-stored contacts (e.g. Hitesh) are matched, not duplicated.
2. One `inventory.findUnique({ where:{id:property_id}, select:{
   assigned_agent_id:true, ... }})`; reuse for steps 3-5.
3. **Bug A / D4:** `ScheduledVisit.create` … add `internal_handler_id =
   inventory.assigned_agent_id`.
4. `scheduled_at = slotToScheduledAt(preferred_date, preferred_time)`
   (guaranteed present after Phase A).
5. **Bug B / D2a:** after `ScheduledVisit.create`, create the Appointment via
   the calendar service. Rename `calendarService.createFromChat` →
   `createPropertyVisitAppointment` (neutral; 4 callers:
   `chat_handler.ts:400`, `buyer_chat_workflow_adapter.ts:336`,
   `buyer_whatsapp_adapter.ts:537`, + new form caller — all updated in this
   change). Call with `source='website_form'`, `scheduled_at` from step 4.
6. **Avoid double notifications:** delete the handler's bespoke
   `sendBuyerConfirmationWhatsApp` + manual property-agent WA block
   (`public.ts:~731-753`); the calendar service already WAs buyer
   (`sendAppointmentReminder`) + seller + superboss + lead-agent — identical to
   the chat path, which does not double-send. Net: exactly one buyer WA.
7. Keep `201 {success, visit_id}` shape (website form depends on it).
8. GlitchTip wrap; no silent catches (project rule).

### Phase D — Bug C across the other `/public/*` upserts (D3b) — EXEC NOTE
**Verified deviation:** `/project-enquiry` (`routes/public.ts:1422`) has an
**unconditional `return res.status(404)` as its first statement** (line 1423) —
the entire contact create/update body below is dead, unreachable code. It
creates no contacts ⇒ zero duplicate-contact risk. Applying the guard to dead
code adds risk for no benefit, so it is **excluded**. Net: guard applied to the
7 reachable contact-writing handlers (contact, lead, lead-requirements,
save-property, share-property-whatsapp, post-property + schedule-visit from
Phase C). `resolveStoredContactPhone` usage in public.ts = 7 (verified).

### Phase D (original) — Bug C across the other 7 `/public/*` upserts (D3b)
Apply the same `resolveStoredContactPhone` "resolve-then-upsert" guard to
`routes/public.ts:395,467,558,818,861,1062,1414`. `/save-property` &
`/share-property-whatsapp` (no `validate()`) already normalize inline (today's
deploy) — add the resolve step there too. Mechanical, one pattern; covered by
targeted prod E2E per endpoint.

### Phase E — Client-facing chat enforcement (`services/chat_handler.ts` + adapters)
- Do NOT create a `ScheduledVisit` until BOTH a date and a time are captured.
  If `parsedDateTime` lacks date or time (or low confidence), the bot asks the
  client for the missing piece and returns — no row created.
- Once both present: create ScheduledVisit + Appointment (already does the
  latter via the renamed method). Same rule in the two buyer adapters.
- Scope note: agent/internal paths (`agent.ts:1480`, `partner_agent.ts:471`,
  `deals.ts`, `internal_tools.ts`, `webhooks.ts`, `workflow_tasks.ts`,
  manual `calendar.ts` POST) are staff-driven — NOT in this client-facing
  mandate; left unchanged.

### Phase F — Verify
1. Unit: `slotToScheduledAt` (all 3 slots, IST→UTC, DST-free India).
2. Local: validators + calendar tests; `npx tsc` emits (pre-existing strict
   noise only — same bar as today's deploy).
3. Deploy backend (`deploy-agent.js backend`) + website
   (`deploy-agent.js website`).
4. Prod E2E (admin token):
   - Website form with a **legacy bare** contact → NO duplicate contact;
     `scheduled_visits` row (with `internal_handler_id`); `appointments` row
     (`assigned_to_agent_id` = property agent); lead-detail Visits tab shows
     it; exactly ONE buyer WA.
   - Form missing date or time → 400 (backend) and blocked in UI.
   - One other `/public/*` form with a bare contact → no duplicate (D3b spot
     check).
   - Chat "schedule a visit" without a date → bot asks, no row created.
5. GlitchTip digest clean post-deploy.

### Phase G — Hitesh one-off (Q1a), after Phases A–F verified
Idempotent script: create the single `Appointment` for `e0640411` as specified
in Q1 above. Then open Hitesh's lead in admin → confirm the visit shows in the
Visits tab → screenshot before/after (visual proof per project rule).

### Rollback
Backend Phase C/D/E additive or swap → revert by redeploying prior build.
Website Phase B → redeploy prior website build. No destructive DB changes
(unless Q1c backfill — separate idempotent script, removable by id).

### Rollback
- Phase A is additive + a notification-block swap; revert = redeploy prior
  build. Phase B backfill rows are tagged `source='website_form'` and
  removable by id if needed.

## 4. Risks
| Risk | Mitigation |
|---|---|
| Double buyer WA | Remove handler's manual WA, rely on calendar service (matches chat path) |
| Slot→time mismatch vs client expectation | Map to UI-shown window start (9/12/16 IST); team still confirms by call (existing process) |
| Dup contact for legacy bare numbers | Bug C fix via `resolveStoredContactPhone`, ALL 8 `/public/*` (D3b) |
| `createPropertyVisitAppointment` rename breaks callers | 4 callers, all updated + tested in same change |
| Website form deploy / stale bundle | `deploy-agent.js website`; verify fresh bundle, form is Next.js (no SW) |
| Chat "ask for date/time" loop UX | Bot asks once per missing field; existing session state carries answers |
| Hitesh's existing visit stays invisible | Q1 decision (a/b/c) — not auto-included since D5 unselected |
| Broadened scope (3 layers + 8 upserts + chat) | Phased; each phase independently verifiable; backend/website deploy separable |
