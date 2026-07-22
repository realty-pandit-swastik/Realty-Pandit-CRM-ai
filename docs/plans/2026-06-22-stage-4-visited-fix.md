# Plan — Stage 4 VISITED fix: unblock visit→negotiation + make VISITED a real, measurable state

> Date: 2026-06-22. Owner: Claude (with Varchasv approval gates). Companion to `docs/pipeline-analysis/stage-4-VISITED.md`.
> Goal: fix the revenue-blocking transition first, then make VISITED a clean transit fact, then close the post-visit warm-lead loop.

## Why
Verified on prod: `canTransition('VISIT_SCHEDULED','NEGOTIATION')` = **false**, but the "Submit Visit Outcome" modal (on VISIT_SCHEDULED cards) maps **Property Liked → NEGOTIATION** → it **throws**, so the deal never advances. `VISITED→NEGOTIATION` is valid (the required gateway) but nothing routes deals through VISITED. Funnel census: NEW 957 → QUALIFIED 255 → VISIT_SCHEDULED 15 → VISITED 3 → NEGOTIATION 1 → CLOSED_WON 1 (the back half is dead).

Confirmed mechanic: `transitionTransaction` is status-update + one `TransactionLog` row only — **no notifications/side-effects**, and same-status is a no-op. So a two-hop is safe (two log rows = clean funnel record; the endpoint still notifies once, for the final status; VISITED entry is WhatsApp-silent by design).

---

## Phase 1 — CRITICAL: route the visit-outcome through VISITED (small, contained, unblocks revenue)
**File:** `routes/deals.ts` — the `visit-outcome` endpoint transition block (~944-958).

**Change:** before the onward transition, if the deal is in VISIT_SCHEDULED and the outcome means the visit physically happened, record VISITED first:
```ts
const visitHappened = ['Property Liked','Want More Properties','Re-match Required'].includes(outcome);
let currentStatus = deal.status;
if (visitHappened && currentStatus === 'VISIT_SCHEDULED') {
    await transitionTransaction(req.params.id, 'VISITED' as any, req.agent.id, 'admin', { reason: `Visit completed (${outcome})` });
    currentStatus = 'VISITED';
}
if (nextStatus && nextStatus !== currentStatus) {
    await transitionTransaction(req.params.id, nextStatus as any, req.agent.id, 'admin', { reason: `Visit outcome: ${outcome}`, notes });
    notifyDealEvent({ ... newStatus: nextStatus ... });
    if (nextStatus === 'QUALIFIED') shareNextProperty(...); // unchanged
}
```
**Resulting paths (all valid, verified):**
- Property Liked → VS→VISITED→NEGOTIATION ✅ (was: throw)
- Re-match → VS→VISITED→QUALIFIED ✅ + auto-share (unchanged)
- Want More → VS→VISITED→VISIT_SCHEDULED ✅ (now records the visit; was a silent no-op)
- No Show → stays VISIT_SCHEDULED, `handleNoShow` (unchanged; **no VISITED hop** — no visit happened)
- Already-in-VISITED (legacy/manual drag) → skips the hop, does VISITED→onward ✅

**Verify:** `tsc` 0-new → deploy → **prod e2e on a throwaway deal**: create a VISIT_SCHEDULED test deal → `POST /visit-outcome {outcome:'Property Liked'}` → assert status=NEGOTIATION + two `TransactionLog` rows (VS→VISITED, VISITED→NEGOTIATION) → delete the test deal. Then log to PROJECT_STATUS + stage-4 doc.

---

## Phase 2 — close the post-visit feedback loop (capture the warm lead)
Today the VS-1 cron asks the customer *"visit kaisi rahi? 👍 Pasand aayi / 🔎 Aur options / 🚫 Nahi ho payi"* (while the deal is VISIT_SCHEDULED) but **the reply does nothing**.

**Change:** add an inbound branch (exact site to confirm at execution — likely `webhook_processor` before generic routing, or `coordination_agent`), gated on a recent `post_visit_followup` marker interaction, that parses the reply:
- 👍 positive → set `client_interest_level=high` + create a **HIGH "start negotiation" coordinator task** + notify. *(see DECISION)*
- 🔎 more → `shareNextProperty` (more cards).
- 🚫 didn't happen → `handleNoShow` / re-ask a slot.

**🔵 DECISION (needs your call):** on a 👍 reply, do we
- **(A, recommended)** keep human-in-the-loop — record interest + raise a HIGH task + notify, and the human clicks "Property Liked" (now fixed) to move to NEGOTIATION; **or**
- **(B)** auto-advance the deal VS→VISITED→NEGOTIATION on the 👍 itself (faster, but a mis-tap could jump a deal into the money stage with no human check).

**Verify:** dry-run the matcher on sample replies; deploy; watch one real post-visit reply on prod.

---

## Phase 3 — hardening (lower priority; Phase 1 makes VISITED transient, so little rests there)
- **`tx_followup_visited` → respect `ai_paused`** (leak fix; low effort).
- **VISITED stall backstop** — a deal resting in VISITED > N days (only manual drags now) → escalate / ON_HOLD, mirroring the NEGOTIATION→ON_HOLD sweep. Low priority because Phase 1 means deals pass *through* VISITED; mainly cleans the 3 legacy stuck deals.
- **MATCHED dead-transition** — `workflow_task_service` MORE_OPTIONS → `MATCHED` (deprecated/empty) throws + is swallowed. **PENDING:** verify the legacy workflow engine is actually active in prod; if so, repoint to a valid target (QUALIFIED/VISIT_SCHEDULED).

---

## Risks & guards
- **Double-notify:** avoided — one `notifyDealEvent` (final status); VISITED entry is WhatsApp-silent.
- **No-Show:** correctly excluded from the VISITED hop (no visit happened) → no false "visited" record.
- **Partial two-hop failure:** if VS→VISITED succeeds but the onward hop fails (shouldn't — both valid), the deal rests in VISITED (a valid state) and the human can retry; no corruption.
- **Mis-tap (Phase 2):** mitigated by the human-in-the-loop default (option A).
- **Legacy VISITED deals (3):** untouched by Phase 1; their outcome now advances correctly, or Phase 3 cleans them.

## Rollout order
1. **Phase 1** (revenue unblock) → verify on prod → log. ← do first
2. **Phase 2** after the 👍 decision.
3. **Phase 3** opportunistically.

## Verification discipline (project norms)
tsc 0-new per batch · dry-run any customer-messaging change · deploy via `mcp__realty-pandit-qa__deploy` · prod e2e on throwaway data · clean up test data · log to PROJECT_STATUS.md + stage-4-VISITED.md.
