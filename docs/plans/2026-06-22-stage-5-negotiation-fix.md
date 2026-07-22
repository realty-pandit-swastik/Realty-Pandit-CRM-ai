# Plan — Stage 5 NEGOTIATION fixes: stop double-selling, make revenue real, coordinate the owner

> Date: 2026-06-22. Owner: Claude (with Varchasv approval gates). Companion to `docs/pipeline-analysis/stage-5-NEGOTIATION.md`.
> Ordered by real-world damage: inventory lock → revenue capture → owner coordination → offer ledger / drive-to-close / loss capture.

## Why
Verified findings: (1) `inventory.status` is never set to sold/rented by the deal flow → properties under offer or already won keep being matched/shared to other buyers; (2) the Kanban close path records no `final_price`/`commission_amount` → every revenue report sums nulls → ₹0; (3) the owner/seller is never coordinated; plus no offer record, no drive-to-close, weak loss capture, immortal paused deals.

**Enabling fact:** `Inventory.status` is a plain String (no enum migration needed); `MatchingEngine.findMatches` filters `status:'active'`, so any non-`active` value is auto-excluded. `transitionTransaction` is the single chokepoint for every status change (it already loads the transaction with `inventory_id` + `type`), so inventory-sync hooked there covers ALL paths (Kanban, visit-outcome, legacy engine, crons).

---

## Phase 1 — Inventory lock (stop double-selling) ← do first
**Where:** a best-effort `syncInventoryForDealStatus(txn, newStatus)` called inside `transitionTransaction` after the status+log commit (single chokepoint → every path covered). No-ops unless `txn.inventory_id` is set.

**Logic (string statuses, no migration):**
- → **NEGOTIATION**: if `inventory.status === 'active'` → set **`under_offer`** (reserved; matcher + public listing already exclude non-active).
- → **CLOSED_WON**: set **`sold`** (deal.type SALE) / **`rented`** (RENT).
- → **CLOSED_LOST** or → **QUALIFIED** (backed out of negotiation): if `inventory.status === 'under_offer'` → release to **`active`**. Never touch `sold`/`rented`/`withdrawn` (don't override a real outcome or a manual withdraw).

**Guards/edges:** best-effort (a failed inventory update must NOT fail the deal transition — wrap in try/catch + log). Idempotent. If two deals both reach NEGOTIATION before the lock, the first reserves it; release-on-lost only from `under_offer`. Public-properties + matcher already filter `active`, so no extra exclusion code needed (verify the public endpoint filters `active`).

**Verify:** prod e2e on throwaway deal+inventory — NEGOTIATION→`under_offer`, CLOSED_WON→`sold`, CLOSED_LOST→back to `active`; confirm `findMatches` skips an `under_offer` property. Clean up.

---

## Phase 2 — Capture price + fix revenue reporting ← do second
**(a) Capture `final_price` at close.** Add a close-won step that records the agreed price. Minimal-risk approach: extend the close path (`PATCH /:id/status`) to accept an optional `final_price` (+ persist it) and add a small "Close Won" dialog in the PWA prompting for the amount (today there isn't even a Close-Won button on the card — add one or wire the StageActions "Move to Won" through the dialog).

**(b) Unify commissions so reports are real.** 🔵 DECISION:
- **(A, recommended)** keep `DealCommissionEntry` as the ledger AND mirror its running total into `Transaction.commission_amount` whenever an entry is recorded — so the existing reports (`reports.ts`, `analytics.ts`, `panditji_daily_briefing.ts`, `internal_tools.ts`) work unchanged. Lowest risk, smallest surface.
- **(B)** repoint all those reports to sum `DealCommissionEntry`. Cleaner single-source, but touches many readers + still needs `final_price` captured separately.

**Verify:** close a throwaway deal with a price + a commission entry → confirm `final_price`/`commission_amount` populate and a revenue report reflects it. Clean up.

---

## Phase 3 — Owner-side coordination ← do third
Add the missing **`supply_handler`/owner recipient branch** in `deal_notifications.ts` (the `Recipient` type already defines it) + seller templates. 🔵 DECISION on depth:
- **(A, recommended v1)** notify-only: tell the owner on NEGOTIATION entry ("a buyer is negotiating your property — our team will coordinate") and on CLOSED_WON/LOST. Makes it two-sided without a new inbound flow.
- **(B)** interactive: ask the owner to confirm price/availability + capture the reply. Bigger (new inbound handler) — defer unless wanted.

---

## Phase 4 — Offer ledger + drive-to-close + loss capture + paused backstop ← do last
- **Offer ledger.** 🔵 DECISION: a lightweight structured record of offers/counters (amount, party, at). Recommended start: a `DealOffer` rows-table (or a JSON array on Transaction) + a workspace panel showing the live spread. (The "Log Update" presets already hint at this — wire them to capture an amount.)
- **Drive-to-close.** Make `runNegotiationNudge` recurring (not once-ever) + add **value-based escalation** (high-value stalls → manager) instead of identical treatment for a ₹5Cr deal and a ₹15k rental.
- **Loss capture.** CLOSED_LOST → capture a structured reason (`Contact.lost_reason`), apply a lead-score adjustment, and schedule a win-back follow-up (the legacy `queueAIFollowup('DEAL_LOST')` exists — wire it to the shipped path).
- **Paused backstop.** `runInactivitySweep` should escalate (not silently skip) very-stale `ai_paused` deals so a paused-and-abandoned negotiation isn't immortal.

---

## Risks & guards
- Inventory sync is **best-effort** inside `transitionTransaction` — never fail a deal transition on an inventory write error.
- Don't override `sold`/`rented`/`withdrawn` on release (only `under_offer → active`).
- `final_price` capture is additive (optional param) — no break to existing closes.
- Phase 2(A) keeps reports unchanged (mirror), minimizing blast radius.
- Each phase: tsc 0-new · prod e2e on throwaway data · clean up · deploy via `mcp__realty-pandit-qa__deploy` · log to PROJECT_STATUS + stage-5 doc.

## Rollout
1. **Phase 1 (inventory lock)** — highest real-world risk, contained → verify → log → checkpoint.
2. **Phase 2 (price + revenue)** — after the commission DECISION.
3. **Phase 3 (owner coms)** — after the depth DECISION.
4. **Phase 4** — offer ledger + drive-to-close + loss + paused backstop.
