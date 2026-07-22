# Deal Pipeline — Stage 4: VISITED (visit happened → negotiate)

> As-is record + errors/improvements for the VISITED stage: AI, human, resources, coordination, disconnections. Built from a 3-way code trace 2026-06-22 + prod verification (`canTransition`, deal-status census). Companion to stage-1-NEW / stage-2-QUALIFIED / stage-3-VISIT_SCHEDULED. Root: `agents/backend/src/`.

## TL;DR — VISITED is a vestigial pass-through, and the visit→negotiation handoff is BROKEN

**Two findings, one root.** (1) **🔴 The state machine forbids `VISIT_SCHEDULED → NEGOTIATION`** (verified on prod: `canTransition` = **false**), yet the "Submit Visit Outcome" modal lives on VISIT_SCHEDULED cards and maps **"Property Liked" → NEGOTIATION**. So the single highest-value action in the whole pipeline — *the visit went well, let's negotiate* — **throws "Invalid transition"** and the deal never advances. (2) **VISITED is the required waypoint** (`VISITED → NEGOTIATION` = true) but **nothing auto-enters VISITED** — only a manual Kanban drag or an ON_HOLD revive. The one automated writer (confirm→VISITED) was correctly removed by VS-3 yesterday; the last automatic VISITED entry was **2026-06-11**.

**The funnel proves it.** Lifetime deal census on prod (2026-06-22):
`NEW 957 → QUALIFIED 255 → VISIT_SCHEDULED 15 → VISITED 3 → NEGOTIATION 1 → CLOSED_WON 1`.
The back half barely exists — **1 deal has ever reached NEGOTIATION, 1 has ever closed-won.** A broken visit→negotiation transition is the prime suspect.

---

## A. What happens, in time order

### How a deal ENTERS VISITED (definitive, post-VS-3)
- **Only** the two generic human endpoints: `PATCH /api/deals/:id/status` and `POST /:id/log-action` (both `act_on_deals`), i.e. a **Kanban drag** into the column, or an **ON_HOLD → Revive → Visited**. The state machine only permits the inbound edge `VISIT_SCHEDULED → VISITED` (and `ON_HOLD → VISITED`).
- **No automated path enters VISITED.** The `visit-outcome` endpoint maps Liked→NEGOTIATION / Want-More→VISIT_SCHEDULED / Re-match→QUALIFIED / No-Show→VISIT_SCHEDULED — **none land on VISITED**. The post-visit cron (VS-1) prompts + creates a task but explicitly does NOT advance. VS-3 removed the confirm→VISITED auto-move.

### AI behaviour once IN VISITED
- One outbound nudge: `interaction_engine` `tx_followup_visited` — 48h silence, maxFires 2, "Aapne recently {location} visit ki thi. Kaisa laga? Aage badhna chahte hain?" **Send-only — it never changes status.** And it does **not** consult `ai_paused` (the engine checks silence/maxFires/anti-spam only) → a human-paused VISITED deal still gets the bot nudge.
- Inbound reply routes to **SalesAgent** (serves more property cards) or, for appointment-intent, a **CoordinationAgent** 3-option menu (offer / another visit / see more) that only **escalates to a human** or emits a `redirect_to:'sales'` hint. **Neither advances the deal to NEGOTIATION** or writes structured feedback.
- **No auto-advance out of VISITED anywhere.** No pipeline cron targets `status:'VISITED'`.

### Human path
- The VISITED card (`DealPipeline.tsx`) shows the info line **"🏠 Visit done — submit outcome"** but has **no Outcome button** (that button is gated to VISIT_SCHEDULED cards) and **no forward-advance button** — only generic **"❌ Close as Lost"**. Forward motion is only via **StageActions** in the Deal Workspace (Move to Negotiation / Visit-Scheduled / Qualified), or a drag.
- On entry, `deal_notifications` deliberately sends **no WhatsApp** ("internal transition — no noise") and queues **no follow-up**.

---

## B. The errors / gaps (ranked)

1. **🔴 CRITICAL — visit→negotiation transition is invalid; "Property Liked" throws.** `visit-outcome` "Property Liked" → `transitionTransaction(deal.status → NEGOTIATION)`. On a VISIT_SCHEDULED deal (the state the modal runs in) `canTransition('VISIT_SCHEDULED','NEGOTIATION')` = **false** → throws → the deal stays put (outcome fields persist, status doesn't move). VISITED is the only valid gateway to NEGOTIATION but nothing routes deals through it. **This is the funnel's revenue choke.** (Pre-existing — not caused by VS-3 — but VS-3 removing the lone auto-writer of VISITED makes it more acute: now even a confirmed visit can't reach VISITED without a manual drag.)
2. **🔴 VISITED is a black hole — no stall/SLA cron.** None of the 7 pipeline crons query `status:'VISITED'`. The NEGOTIATION 14-day-inactivity→ON_HOLD safety net explicitly covers only NEGOTIATION. A deal dragged into VISITED gets at most 2 feedback nudges then goes permanently silent — no escalation, never auto-ON_HOLD.
3. **🟠 Post-visit "I'm interested" advances nothing.** Both prompts (the VS-1 cron's 👍/🔎/🚫 and `tx_followup_visited`) are send-only; the inbound parser (`webhook_processor`) has no post-visit "liked it → NEGOTIATION" branch. The warmest possible lead — someone who just visited and says "let's deal" — triggers **zero** automatic advancement; it's 100% gated on a human submitting the outcome (which itself throws, per #1).
4. **🟠 Legacy MATCHED dead-transition bug.** `workflow_task_service.completeVisitFeedbackTask` MORE_OPTIONS → `TransactionStatus.MATCHED`, but `MATCHED: []` is deprecated/empty → `canTransition` false → throws → swallowed by a bare `catch {}`. The loop-back silently fails to move the deal while still spinning a new SHARE_PROPERTIES task → deal/task-state divergence. Visit history is also split-brained (`workflow_round` on the txn vs `leadPropertyShortlist` rows), and `workflow_round` only bumps on Re-match (under-counts).
5. **🟡 `ai_paused`-blind feedback nudge** (#A above) and **no customer calendar/feedback capture** in VISITED.

---

## C. Scope of improvements (the fix — for discussion)

**Decision point:** either (a) make VISITED the *real* "visit happened" state, or (b) collapse it.

- **Recommended — (a) make VISITED real.** The `visit-outcome` endpoint should route a visited deal **VISIT_SCHEDULED → VISITED → (NEGOTIATION | QUALIFIED | VISIT_SCHEDULED)** — both hops are valid. This (i) **fixes the Liked throw**, (ii) makes "the visit physically happened" an **observable, reportable fact** so the funnel can finally measure visit→negotiation conversion, (iii) gives the post-visit cron + audit a clean state to target. **No-Show stays in VISIT_SCHEDULED** (no visit happened). Optionally, the post-visit cron advances VISIT_SCHEDULED→VISITED once the slot time passes, so VISITED reflects reality even before a human logs the outcome.
- Plus the supporting fixes: a **VISITED stall cron** (mirror NEGOTIATION→ON_HOLD), **advance on the post-visit feedback reply** (👍 → NEGOTIATION / 🔎 → re-share / 🚫 → recovery) or at minimum a guaranteed escalating human task, fix the **MATCHED dead-transition**, make `tx_followup_visited` **`ai_paused`-aware**.
- **(b) collapse** only if the team is committed to Liked→NEGOTIATION directly — then add `VISIT_SCHEDULED → NEGOTIATION` to the state machine and remove VISITED from the machine/validator/Kanban (leaving a draggable column with no owner is the current worst-of-both-worlds).

**Verified:** `canTransition` results + the deal census were pulled from prod on 2026-06-22.

---

## Resolution log

### ✅ Phase 1 — visit→negotiation unblocked (DONE + deployed + e2e-verified 2026-06-22)
`routes/deals.ts` visit-outcome now records **VISITED first** for "visit happened" outcomes that leave VISIT_SCHEDULED, then applies the onward hop:
- Property Liked → `VS→VISITED→NEGOTIATION` (was: threw)
- Re-match → `VS→VISITED→QUALIFIED` + auto-share
- Want-More → same-status no-op (unchanged); No-Show → unchanged (no visit happened, no VISITED hop)

Safe by construction: `transitionTransaction` is status+log only, same-status is a no-op → two log rows, one notification (final status), VISITED entry WhatsApp-silent. VISITED is now a **measurable** transit fact.

**Prod e2e (throwaway deal, then cleaned):** Property Liked → final status **NEGOTIATION**, log hops `VISIT_SCHEDULED→VISITED , VISITED→NEGOTIATION` ✅; the old direct `VISIT_SCHEDULED→NEGOTIATION` still throws "Invalid transition" ✅; 0 test rows left ✅. tsc 378 (0 new), deployed.

### ✅ Phase 2 — post-visit feedback loop (DONE + deployed 2026-06-22)
`webhook_processor.ts` block "3a-bis" (intercepts before the NEW/QUALIFIED pipeline block). Gated on a recent `post_visit_followup` marker + deal VISIT_SCHEDULED + not `ai_paused` + no outcome + **first reply only** (dedup via a `post_visit_feedback` marker). Human-in-the-loop (option A):
- **👍 positive** → `client_interest_level=Hot` + customer ack + HIGH "start negotiation" coordinator task + notify. Does NOT auto-advance (human clicks "Property Liked" → Phase 1 path).
- **🔎 more** → `shareNextProperty` + MEDIUM review task.
- **🚫 didn't happen** → appointment → `requested` + re-ask `rp_visit_availability` (VS-5 slot-capture) + reschedule task.
- **ambiguous** → falls through untouched (no false claim).

Classifier validated **16/16** (order: didn't-happen → more → positive, so "nahi ho payi" can't read positive). Reactive (no blast risk); tsc 378 (0 new); deployed. Exercises on live replies.

### ✅ Phase 3 — hardening (DONE + deployed + e2e-verified 2026-06-22)
- **3a — DRY helper + legacy-engine fix.** Extracted `advanceVisitedDeal()` into `transaction_state_machine.ts` (the single source of truth for "visit happened → advance": records VISITED first when leaving VISIT_SCHEDULED, idempotent, same-status no-op). Refactored the visit-outcome endpoint (Phase 1) onto it, and fixed the **legacy workflow engine** which had the same bug twice: `completeVisitFeedbackTask` MORE_OPTIONS → deprecated `MATCHED` (empty transitions → threw + swallowed → deal/task divergence) and SELECT_PROPERTY → `NEGOTIATION` direct from VISIT_SCHEDULED (threw + swallowed). Both now route via `advanceVisitedDeal` (→QUALIFIED / →NEGOTIATION). Engine confirmed **active** (`app.ts:43`, `workflow_tasks.ts:179/334`).
- **3b — pause-leak.** `interaction_engine.runTriggerCheck` now `continue`s on `ai_paused` deals (was ignoring the flag → could talk over a human takeover, incl. the VISITED nudge).
- **3c — stall backstop.** `runNegotiationInactivitySweep` → `runInactivitySweep`, now sweeps **NEGOTIATION + VISITED** (14-day inactivity → ON_HOLD); catches forgotten manual drags into VISITED (which Phase 1 otherwise made transient).

**Prod e2e** (`advanceVisitedDeal`, throwaway deals, cleaned): VS→VISITED→NEGOTIATION ✅ · VS→VISITED→QUALIFIED ✅ · VS→VS no-op (0 hops) ✅ · VISITED→NEGOTIATION direct ✅. tsc 378 (0 new). deployed.

## ✅ Stage 4 VISITED — CLOSED (Phases 1–3). Next: Stage 5 NEGOTIATION.
