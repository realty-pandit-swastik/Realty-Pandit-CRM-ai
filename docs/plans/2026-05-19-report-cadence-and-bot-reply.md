# 2026-05-19 — Report cadence overhaul + AI bot reply fix

**Status:** ✅ W1 (reporting) + W2 (bot never-silent) + W3 (context-aware
matching) SHIPPED & verified 2026-05-19. Minor deferred: blank-finding
source bug, weekly ops digest, lead-counts in digest body, inventory.type
normalization. See [[project_bot_reply_and_report_overhaul]] for detail.

## Decisions (Puneet 2026-05-19)
- ONE consolidated digest **08:00 IST** + **20:00 IST** (02:30 / 14:30 UTC).
- No other super_boss WhatsApp; real-time only for true system-down.
- Daily digest critical = **R4 real ext clients** (skip autoresponders) **+
  R2 daily**. R5/R6/R7 → **weekly ops summary**. Fix blank-finding bug.
- Bot safety-net = **acknowledge + assign agent** (+ context-aware match,
  + autoresponder skip). Reporting FIRST, then bot.

## Workstream 1 — Reporting (phased)
- **W1-P1** `services/owner_digest.ts`: build ONE WhatsApp from latest
  `audit_reports` (R4-real + R2 + counts) + system-health + ops one-liner.
  BullMQ `owner-digest-am` (`30 2 * * *`) + `owner-digest-pm`
  (`30 14 * * *`) in `scheduled_worker.ts` + dispatch cases. Recipients =
  super_boss (role super_boss, status 'active').
- **W1-P2** Silence scattered/real-time:
  - `utils/alerter.ts`: `alert()` only sends WhatsApp when
    `level==='CRITICAL' && SYSTEM_DOWN_TYPES.has(errorType)` (allowlist:
    gemini_circuit_open, db_pool_exhausted, redis_down, worker_dead).
    Else log-only (digest picks up from logs/GlitchTip).
  - `behavior_auditor.ts`: drop `notifyCritical()`; `notifyDigest()` →
    no-op (audit still persists `audit_reports`; digest reads it).
  - `scheduled_worker.ts`: the standalone super_boss-WhatsApp jobs
    (`daily-report`, `panditji-daily-briefing`, `callback-sla-report`,
    `qa-health-report`, plus 2 AM `ai-boss-cycle` / 3 AM
    `qa-integrity-check` / midnight `subscription-expiry`): KEEP their
    non-message side-effects, REMOVE/guard the WhatsApp-to-super_boss send
    (route their summary into owner_digest instead). Inspect each dispatch
    case before editing — only silence messaging, never the data work.
- **W1-P3** `behavior_auditor.ts` rule scoping:
  - R4: add autoresponder/junk content skip (`/thank you for contacting|
    please let us know how we can help|do not reply|automated message/i`)
    + keep BUYER/TENANT/UNKNOWN-only (already there).
  - Tag R5/R6/R7 `category:'ops'`; digest's critical section excludes
    `ops`; new weekly `ops-digest` job (Mon 08:00 IST) lists them.
  - R2 stays in daily digest.
  - Fix blank-finding bug: R8/R9 (or wherever) emitting findings with
    undefined rule_id/rule_name — inspect ruleR8/ruleR9, ensure shape.
- **W1-P4** tsc + vitest 162/172 + deploy + validate: trigger AM/PM
  digest manually → exactly one consolidated WA; confirm no odd-hour /
  per-finding sends for 24h; GlitchTip clean.

## Workstream 2 — Bot reply (after W1)
- `webhook_processor.ts`: wrap `processInboundMessage` so it can NEVER end
  without (a) a real reply, or (b) ack "🙏 Got it — a team member will
  assist you shortly" + create/assign follow-up Task to the lead's
  `assigned_agent_id` (or round-robin) + notify. Audit the ~18 early
  `return;` — any that exit without a sent message route through the net.
- Context-aware match: pass contact/deal demand (locality, budget,
  bhk/type) into the property match the router uses; stop generic blasts.
- Skip third-party autoresponders inbound (no deal/no bot churn).
- Verify against the real flagged numbers (Sudhit +919899047947 etc.).

## Verify each phase
tsc (touched) · vitest 162/172 baseline · deploy · prod validate · GlitchTip.
