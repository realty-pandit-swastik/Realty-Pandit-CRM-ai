# Deal-AI follow-ups (from the 2026-06-12 live-test diagnosis)

> Lane: `wt/backend`. Each fix: build → `tsc` (diff vs 381 baseline) → vitest where possible → commit → merge → deploy → verify (no-send harness or live test on a controlled number). Evidence-driven by the 2026-06-12 inspection of contact `+917986024171` + the 40-deal match survey.

## Evidence (this session)
- **P1 capture VERIFIED** by the no-send harness: simulated "3 bhk"/"indirapuram"/"rent" mutate the deal criteria correctly (bhk 1→3, loc→indirapuram, intent buy→rent).
- **Match survey (40 NEW/QUALIFIED AI deals): 26 would send a card, 14 return 0, 17 have implausible/missing budget.** Dominant failure = **buy deals with ₹16k–35k budgets** (rent numbers / parse errors on a BUY) → 0 matches.
- **Intake dead-ends**: `buyer_workflow_engine.commitBuyer` creates the deal then returns — no matching, no card (`buildMatchCriteria` at :375 unused).
- **Visit-menu contradiction**: deal `08766be0` is `VISIT_SCHEDULED` with **0 Appointment rows** → menu says "you have a visit" then "I don't see an active visit."
- **Frustration ignored**: "you keep talking but never call" → no escalation.

---

## FIX A — Intake completion must send a matching card (top priority)
**Problem:** completing the guided intake produces no inventory (worst outcome: full qualification → dead end).
**Files:** `workflows/buyer_workflow_engine.ts` (`commitBuyer`, ~:336-369), reuse `services/property_sharing.ts` `shareNextProperty`.
**Approach:**
- [ ] After `commitBuyer` creates/updates the deal (`transactionId` set), call `await shareNextProperty(transactionId)` — sends a v5 card or the "we'll keep looking" exhaustion template (consistent with the deal-AI path).
- [ ] **Dedup-staleness fix:** when `result.isDuplicate`, the existing deal keeps OLD criteria (observed: new 3BHK/₹2cr landed on the contact but deal stayed bhk=2/₹30-80L). On duplicate, UPDATE the existing deal's `demand_intent`/`demand_location`/`demand_budget_*`/`demand_schema_values` with the freshly committed criteria before sharing.
- [ ] **Test:** extend the no-send harness — commit criteria → assert `shareNextProperty` selects a ≥50 match (or exhaustion) for a sane-budget deal.
**Verify:** run a full intake on a controlled number → a v5 card arrives (not "team member will assist").

## FIX D — Matching hygiene: intent/budget sanity (biggest match-rate lever — 43% of deals)
**Problem:** 17/40 deals have buy-intent + rent-sized budget (₹16-35k) → 0 matches; ₹0/missing-price listings can also be emitted.
**Files:** `services/matching_engine.ts` (`buildMatchCriteriaFromLead` / `findMatches`), capture sites `agents/sales_agent.ts` `extractBuyerData` + `workflows/buyer_workflow_engine.ts`.
**Approach (decision needed — see question):**
- [ ] **Detect implausible budget**: `intent==='buy' && budget_max < ₹5L` ⇒ almost certainly a monthly-rent figure or parse error. Options: (a) treat as rent for matching, (b) re-ask the customer "Is ₹16,000 your monthly rent budget, or did you mean ₹16 lakh?", (c) flag for the assigned agent. Recommended: **(b) re-ask once, then (c) flag**.
- [ ] **Hard-filter intent** in matching: never return sale inventory to a rent-seeker or vice-versa (ties the ₹0/wrong-intent audit finding).
- [ ] **Drop ₹0 / missing-price** inventory from match results.
- [ ] One-off **repair script** (read-only first) to list the 17 bad-budget deals for the owner / re-ask flow.
**Verify:** re-run the 40-deal survey → bad-budget count falls, card-able deals rise from 26.

## FIX B — Schedule Visit must create a real Appointment (P3)
**Problem:** Schedule Visit sets deal `VISIT_SCHEDULED` but creates no `Appointment` → coordination menu contradicts itself + loops; no Calendar event; uploader/lead-manager not notified.
**Files:** `services/property_card_reply_handler.ts` (`isSchedule` branch), `agents/coordination_agent.ts` (:104-229 menu + handlers), `services/calendar.ts`, the Appointment-create service, `notify()`; `inventory.uploaded_by_agent` for the uploader.
**Approach:**
- [ ] On Schedule Visit + a captured time (`slotToScheduledAt`), **create an `Appointment`** (`contact_id`, `transaction_id`, `type=property_visit`, `scheduled_at`, `assigned_to_agent_id`) — date+time mandatory.
- [ ] Create a **Google Calendar event** on the assigned agent's calendar (`CalendarService`).
- [ ] **Notify lead manager + inventory uploader** (WhatsApp + push).
- [ ] **Reconcile the contradiction now:** in `coordination_agent`, when status is `VISIT_SCHEDULED` but no `Appointment` exists, stop looping — either re-offer scheduling or escalate; never assert a visit that has no Appointment. (Backfill/repair existing `VISIT_SCHEDULED`-without-Appointment deals.)
**Verify:** tap Schedule Visit + give a time → `Appointment` row exists, Calendar event appears, lead manager + uploader alerted; menu no longer contradicts.

## FIX C — Frustration / "call me" escalation (P4)
**Problem:** anger + repeated taps + "call karta nahi" get no human handoff.
**Files:** `services/message_router.ts` / agents, `utils/menu_loop_guard.ts`, `services/workflow_task_service.ts` (`createLeadActionTask` + `notify`).
**Approach:**
- [ ] Detect frustration/"call me"/anger/repeated-identical-tap → `createLeadActionTask(CALLBACK, HIGH)` + notify the assigned agent (this contact → Puneet).
- [ ] Wire `menu_loop_guard` so the bot never repeats the same line ≥3× — escalate instead.
**Verify:** send "call me"/anger on a controlled number → escalation task created + agent notified; no repeat-spam.

---
## Execution order (recommended)
**A → D → B → C.** A is the highest direct value + most contained; D is the biggest match-rate lever but needs the budget-handling decision; B is the most involved (Calendar + notify); C is contained. One fix per deploy, verify between (P0/P1 cadence). P1 stays live throughout.
