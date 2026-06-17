---
name: AI bot not-replying to clients + WhatsApp report spam — investigation + approved plan
description: 2026-05-19. Owner reports AI ignoring clients + odd-hour report spam. Root-caused; cadence/rule decisions locked; build = reporting overhaul first, then bot fix. NOT yet built.
metadata:
  type: project
---

**Trigger (Puneet 2026-05-19):** "AI not replying clients" + getting many
critical-finding WhatsApp reports at odd hours; wants morning+evening only.

**Investigation (evidence, prod):**
- `9958860411` = Puneet's OWN number, contact_type MANAGEMENT (bot
  shouldn't AI-follow-up it = audit rule R1). The "I am currently
  experiencing high traffic" replies are the **Gemini fallback** in
  `services/llm.ts` (rate-limiter denial / circuit-breaker open / any
  Gemini error). Those were April; **last ~4000 log lines: 0 LLMService
  errors, 0 rate-limit** → model layer healthy NOW.
- Real client audit (last 4d, EXTERNAL = BUYER/TENANT/LANDLORD/UNKNOWN,
  exclude MANAGEMENT/PARTNER): only ~10 inbound, **6 got NO reply**
  (0 fallback, 0 refusal = pure silence). Misses incl. hot leads:
  "Hi Panditji! I need help finding a property", "It's my property
  detail", Sudhit (+919899047947, 99acres BUYER) "looking to purchase
  2/3 BHK builder floor Vasundhara ≤1Cr".
- Root cause: `services/webhook_processor.ts processInboundMessage` has
  ~18 early `return;` before the central router (line ~611); several
  return WITHOUT any reply (workflow/state machines, property-card
  handler, onboarding, guards). Pipeline normally always sends reply OR
  "Namaste" fallback (line ~650) — so silent cases are dropped at an
  early guard / never reach router. ALSO: when it does reply the router
  pushes a **generic property list ignoring stated locality/budget/type**
  (Sudhit got Ghaziabad ₹1.8Cr apt vs Vasundhara ≤1Cr builder-floor).
- Report engine = `services/behavior_auditor.ts` (`runBehaviorAudit`,
  BullMQ job `behavior-audit` cron `0 4 * * *` = 9:30 IST): R1–R9 over
  24h, persists `audit_reports`, sends digest + a 2nd immediate-criticals
  WhatsApp to super_boss (status 'active'). Rule volumes over ~6d:
  R2 ×107 (free-form after 24h window, Meta-reject), R4 ×8 (critical,
  inbound unreplied >10min — ~⅓ false: autoresponders/"Reply"),
  R5 ×300 (deal stuck NEW >24h — ops noise, dominates), R6 ×19, R7 ×6,
  **15 "undefined/undefined" blank findings = auditor bug**.
- Odd-hour spam sources: jobs at 2 AM `ai-boss-cycle`, 3 AM
  `qa-integrity-check`, midnight `subscription-expiry`, 8:30 `callback-
  sla-report`, 9:30 `panditji-daily-briefing`, 9 PM `daily-report`,
  PLUS real-time `utils/alerter.ts alert(CRITICAL)/alertCritical` (WA to
  ≤3 super_boss, 1/errorType/5min, ANY hour) on errors/cron-failures.

**Locked decisions (Puneet 2026-05-19):**
- Cadence: ONE consolidated digest **08:00 IST** + **20:00 IST**
  (= 02:30 & 14:30 UTC). Silence all other super_boss WhatsApps; real-time
  only for true system-down (Gemini circuit open / N consecutive AI
  fails), hard rate-limited.
- Rule scope: daily critical digest = **R4 real external clients only**
  (exclude MANAGEMENT/PARTNER + known autoresponders) **+ R2 daily**
  (kept — lost messages). R5/R6/R7 → **weekly ops summary**. Fix blank
  finding bug.
- Bot safety-net = **acknowledge + assign agent**: never end an inbound
  without a real reply OR a brief "a team member will assist you shortly"
  + create/assign follow-up task to the lead's agent. Plus context-aware
  property match (pass locality/budget/type/BHK). Plus skip third-party
  autoresponders.
- Sequencing: **reporting overhaul FIRST**, then bot fix. Each phase-by-
  phase, tsc/vitest baseline 162/172, deploy, verify, GlitchTip clean.

**✅ Workstream 1 (reporting) SHIPPED & verified 2026-05-19:**
- `utils/alerter.ts`: `alert(CRITICAL)` WhatsApps only for SYSTEM_DOWN_TYPES
  allowlist (gemini_circuit_open, db/redis down, worker_dead, …); all other
  CRITICAL log-only. Kills per-error odd-hour spam.
- `behavior_auditor.ts`: removed notifyDigest/notifyCritical calls (still
  persists audit_reports; functions kept, `void`-referenced).
- `scheduled_worker.ts`: `daily-report`/`qa-health-report`/
  `panditji-daily-briefing` → logged no-ops; `callback-sla-report` keeps
  detection+log, WhatsApp removed; ai-boss-cycle/qa-integrity don't WA
  owner (left); subscription-expiry already no-op.
- NEW `services/owner_digest.ts` + jobs `owner-digest-am` (`30 2 * * *`
  =08:00 IST) / `owner-digest-pm` (`30 14 * * *`=20:00 IST). ONE WhatsApp
  to super_boss; reads latest behavior_auditor audit_report; shows
  R4-real (autoresponder regex AUTO dropped) + R2 (daily) + R5/6/7
  collapsed to ONE ops count; blank-finding rows filtered (`f.rule_id`).
- Verified prod: latest run 54 raw → digest shows R4-real=2,
  autoresponder-dropped=1, ops=51 collapsed, blanks hidden; jobs
  registered (worker boot log 13:51). tsc clean (touched; 592/614
  scheduled_worker = pre-existing baseline), vitest 162/172.
- Net: owner gets exactly TWO consolidated msgs/day (08:00, 20:00), no
  odd-hour/per-error/per-finding spam.
- Deferred follow-ups (low impact, digest already masks): fix blank-
  finding bug at source (R8/R9 emit undefined rule_id); dedicated weekly
  ops digest; fold daily lead counts into digest body.

**✅ Workstream 2 (bot never-silent) SHIPPED & E2E-verified 2026-05-19:**
- Verified webhook ENTRY (`routes/webhooks.ts`) is clean — only skips
  non-actionable types (reactions/stickers); all real text/media enqueued
  to BullMQ → worker → `processInboundMessage`. No client msg dropped at
  entry. So fix lives entirely in `webhook_processor.ts`.
- `webhook_processor.ts`: renamed body → `processInboundMessageInner`; new
  exported `processInboundMessage` WRAPPER (additive, exception-safe):
  (1) skip 3rd-party autoresponders (AUTORESPONDER_RE) entirely — no reply,
  no churn, no R4 noise; (2) run inner in try/catch; (3) if NO outbound
  interaction since turnStart AND no CLAIMED_EVENT_TYPES handler
  (workflow*/auth/closing) AND external contact (BUYER/TENANT/LANDLORD/
  UNKNOWN) AND text not a command (SAFETYNET_SKIP_RE) → send ack "🙏 Got
  it — a team member will assist you shortly" + log outbound + create HIGH
  CALLBACK Task assigned to contact.assigned_agent_id else super_boss.
  Also added an OUTBOUND interaction log to the closing-signal ack (was
  unlogged → made R4/safety-net detection truthful).
- E2E (fake +919000000077, cleaned up): autoresponder → 0 interactions/0
  tasks (skipped) PASS; healthy "Hi" → inner replied, net stayed silent
  (0 dup ack, 0 task) PASS = no double-message regression on hottest path.
  tsc: only pre-existing baseline err (line 129, untouched code); vitest
  162/172. Deployed.
- Live validation ongoing: grep prod logs for `[SafetyNet]` /
  "Autoresponder … skipped" on real traffic.

**✅ Workstream 3 (context-aware matching) SHIPPED & E2E-verified
2026-05-19:** root cause = 3 duplicate weak requirement parsers;
`SalesAgent.extractBuyerData` recognised neither "builder/independent
floor" (type→null→generic mix) nor captured BHK (regex parsed then
discarded); `matching_agent.buildCriteria` bhk regex `/(\d)\s*bhk/`
(no /i, no "2/3", no "bedroom") and never used persisted demand_bhk.
Fixes: (a) extractBuyerData typeMap += builder floor/independent
floor/builder flat/duplex/penthouse/studio/independent house/farmhouse/
warehouse/godown (multi-word first); (b) extractBuyerData now captures
BHK count → `data.demand_bhk` (Contact.demand_bhk Int? already existed);
(c) matching_agent bhk regex → `/(\d)\s*\/?\s*(\d)?\s*(?:bhk|bedroom|
bed)\b/i` + falls back to `contact.demand_bhk`; (d) added
`demand_bhk?:number|null` to `ContactData` (agents/types.ts) +
`message_router.toContactData` so it carries across turns. E2E vs
Sudhit's exact msg: property_type=flat, demand_bhk=2, loc=vasundhara,
budget=₹1Cr (phone digits didn't corrupt budget); cross-turn carry
bhk=2; "2/3 BHK" → bhk=2. tsc clean, vitest 162/172, deployed.
NOTE: inventory.type values are inconsistent (APARTMENT vs flat vs
BUILDER_FLAT) and matching uses `type contains property_type` — a
separate data-normalisation issue, not addressed here.

**🔒 Security/reliability self-audit + FIX 2026-05-19:** the first alerter
gate used a `SYSTEM_DOWN_TYPES` allowlist whose names matched NO real
`alertCritical()` errorType in the codebase → it silently suppressed ALL
real-time outage pages (server crash `uncaught_exception`/
`unhandled_rejection`, `server_5xx`, `whatsapp_job_failed` = bot can't
reply, `99acres_auth_failed` = lead loss) and those aren't in the digest
either → a 2 AM outage would go unnoticed till 08:00. FIXED: allowlist
renamed `REALTIME_CRITICAL_TYPES` and set to the actual emitted types
(uncaught_exception, unhandled_rejection, server_5xx, whatsapp_job_failed,
99acres_auth_failed) + reserved infra names; cooldown (1/type/5min) still
caps volume. Deployed. SecurityAgent anomaly alerts were NEVER affected —
they use their own `sendSecurityAlert` → WhatsApp to MANAGEMENT contact,
not alert()/alertCritical (untouched, still real-time). Mailbox-password
endpoint injection already hardened+E2E-tested earlier. No SQL/shell
injection introduced in W1/W2/W3 (Prisma params; regexes bounded, no ReDoS).

**🔴 CRITICAL loop FIXED 2026-05-19 (pre-existing, NOT from W1/W2/W3):**
Contact +917986024171 (VISIT_SCHEDULED) stuck in infinite loop — every
reply ("Hello"/"1"/"2"/"3") got the SAME "You have a property visit
scheduled. 1.Confirm 2.Reschedule 3.Cancel" menu. Root cause:
`agents/coordination_agent.ts handle()` only parsed WORD keywords
(confirm/yes/haan, reschedule/badlo, cancel/nahi); the menu instructs
"reply 1/2/3" but NO numeric handler → numeric replies fell to the
default → menu re-sent forever. Verified NOT caused by my changes
(coordination_agent untouched; W2 safety-net can't fire since the bot IS
replying = the menu). FIX: before the keyword checks, when
`currentTransaction.status==='VISIT_SCHEDULED'` map `^(1|2|3)\b` →
handleConfirm/Reschedule/Cancel. tsc clean, vitest 162/172, deployed,
E2E-verified. **✅ SAME-CLASS RISK NOW FULLY FIXED & SHIPPED 2026-05-19**
(plan `docs/plans/2026-05-19-menu-loop-shared-parser.md`, executed inline):
- `src/utils/menu_choice.ts` `parseMenuChoice()` — shared parser ("3",
  "3.", "*2*", "option 1" → 1-9; rejects sentences like "I want 2 bhk").
  VIST_SCHEDULED refactored onto it.
- `src/utils/menu_loop_guard.ts` — `lastOutboundWasSameMenu()` +
  `escalateStuckMenu()` (HIGH CALLBACK task + human-handoff reply, fails
  open, never throws). Universal circuit breaker: any status menu that
  would re-send the SAME text it just sent → escalate instead of loop
  (covers future menus too).
- `coordination_agent.ts`: VIST_SCHEDULED + VISITED both parse numeric
  AND word intents; VISITED 1=offer/2=another-visit/3=see-more →
  contextual reply + (1/2) human handoff, (3) redirect_to:sales; both
  guarded by the breaker.
- `webhook_processor.ts` calendar fast-path: accepts `cancel` + numeric
  via `parseMenuChoice` (no `calendarService.cancelAppointment` → cancel
  routed to `requestReschedule`/human flow).
- Tests: menu_choice 4, menu_loop_guard 3, coordination_menu 5,
  webhook_calendar 2 (vitest 176/10/186 — baseline 10 unchanged).
  Deployed; prod E2E green; GlitchTip clean. KEY GOTCHA: `tasks`
  table has `tasks_contact_phone_fkey` — task.create needs a real
  Contact (escalateStuckMenu catches the FK error & still replies).

**Minor DEFERRED (documented, low impact):** W1 source blank-finding bug
(R8/R9 undefined rule_id — digest already hides); dedicated weekly ops
digest; fold daily lead counts into digest body.

**Status: W1 + W2 core SHIPPED & verified. Plan doc:
`docs/plans/2026-05-19-report-cadence-and-bot-reply.md`.**
