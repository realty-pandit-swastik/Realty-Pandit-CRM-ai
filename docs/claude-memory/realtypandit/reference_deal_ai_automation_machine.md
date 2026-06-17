---
name: reference_deal_ai_automation_machine
description: 2026-06-12 deal-AI WhatsApp bot overhaul — the multi-PATH inbound architecture + the 6 fixes + new pure utils. Read before debugging any bot reply.
metadata:
  type: reference
---

**2026-06-12: deal-AI "automation machine" overhaul** (45-day audit → 6 backend ships + 2 data follow-ups, all deployed). The bot is ONE brain over MULTIPLE inbound paths in `services/webhook_processor.ts` — **identify which path a message hits before debugging a "bad reply":**
1. **button short-circuit** — `property_card_reply_handler` (Call Back / Schedule Visit / Next Option, only when a card was shared with a deal) → then NEW **`template_button_router`** (Open Portal→portal link, Upload Now→inventory workflow, Talk to Coordinator→escalate, Haan-dikhao/View-Details/Yes→engage, bare Reply→invite; defers to active workflow sessions).
2. **3a calendar** — Confirm/Reschedule/Confirmed/Cancel → Appointment (needs `reminder_sent`).
3. **3a-bis frustration** (Fix C) — "call me"/anger/"talk to human" → `createLeadActionTask` + holding line.
4. **3b deal path** — active NEW/QUALIFIED deal: a short requirement msg ("1 bhk"/"vaishali"/"rent") is captured onto the DEAL + re-matched (P1, `utils/requirement_slots`); else blind `shareNextProperty`.
5. **buyer_workflow intake** — `buyer_whatsapp_adapter` → `buyer_workflow_engine.commitBuyer` (Fix A: now calls `shareNextProperty` on commit so a completed intake sends a v5 card, not a dead-end).
6. **coordination_agent** (VISIT_SCHEDULED) — Fix B: parses the free-text availability reply (`utils/visit_availability`) → `CalendarService.createPropertyVisitAppointment` (Appointment + Google Calendar + notify) → links the appointment to the deal (`transaction_id`) + notifies the inventory uploader. Fixes the "you have a visit / no visit to cancel" loop (was VISIT_SCHEDULED with 0 Appointment rows).
7. **admin_agent** (management/owner) — a greeting ("good morning"/"namaste") → `getOwnerDigest` (today's leads/hot/visits/deals-needing-action/inventory).

New pure utils (all vitest-tested): `utils/requirement_slots` (P1), `utils/budget_sanity` (Fix D re-ask-then-flag on implausible buy budget), `utils/visit_availability` (Fix B), `utils/frustration` (Fix C). Matching hygiene (Fix D): `matching_engine.findMatches` now requires `price>0` always (drop ₹0 cards); `shareNextProperty` re-asks once on an implausible buy budget then flags the assigned agent. P0 = `llm.ts` Gemini retry + never-send-raw-error / never-silent.

Plans: `docs/plans/2026-06-11-deal-ai-automation-machine.md`, `2026-06-11-p1-requirement-capture.md`, `2026-06-12-deal-ai-followups.md`. Logged in PROJECT_STATUS 2026-06-12. ⚠️ **Conversational behavior is deployed but NOT yet human-live-tested on WhatsApp** — verify on a test number before trusting. Lane: `wt/backend` ([[reference_worktree_fanout]]). Poller intent trap: [[feedback_poller_intent_budget_trap]].
