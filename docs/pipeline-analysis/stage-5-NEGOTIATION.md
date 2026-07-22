# Deal Pipeline — Stage 5: NEGOTIATION (close the deal)

> As-is record + errors/improvements for the NEGOTIATION stage: AI, human, resources, coordination, disconnections. Built from a 3-way code trace 2026-06-22 + grep verification. Companion to stages 1–4. Root: `agents/backend/src/` (frontend `agents/frontend/src/`).

## TL;DR — NEGOTIATION is a single-sided status holder with three structural breaks
The last active stage is meant to take a buyer + a chosen property to CLOSED_WON. In practice it is **buyer + coordinator only**, with the **owner/seller never coordinated**, **no offer/price captured anywhere**, and three structural defects that likely explain why the funnel is dead past the visit (1 NEGOTIATION, 1 CLOSED_WON lifetime):
1. **🔴 Properties are never marked sold/rented** — not on NEGOTIATION, not even on CLOSED_WON → the same property keeps being matched + shared to other buyers (double-sell + "showing sold listings").
2. **🔴 The board close path records no price/commission** — `PATCH /status` takes only `{status, reason}`; `final_price`/`commission_amount` are written only by an orphaned legacy task → every revenue report sums nulls → **₹0 revenue/commission on real won deals**.
3. **🟠 The owner/seller is invisible** — `supply_contact_id` is set at match then never messaged during negotiation, never asked to confirm price/availability, never told the deal closed.

---

## A. What happens, in time order

### AI path (Panditji) — almost entirely passive
1. **Entry:** only via `advanceVisitedDeal` (visit-outcome "Property Liked": VS→VISITED→NEGOTIATION; legacy `SELECT_PROPERTY`: →VISITED→NEGOTIATION) or manual drag / ON_HOLD revive. **No AI/webhook/cron sets NEGOTIATION.** On entry only the **buyer** is messaged (`rp_negotiation_availability`, "share your availability"); the owner gets nothing (`deal_notifications.ts:245-247`).
2. **48h nudge:** `pipeline_crons.runNegotiationNudge` (daily 9:10 IST) → one message to the **coordinator** (`rp_negotiation_nudge`, "meeting pending"). **Deduped once-per-deal-ever** (no time bound) → fires a single time, never recurring.
3. **Interaction-engine nudge:** NEGOTIATION trigger `tx_followup_negotiation` (72h silence, maxFires 3) → generic "team will handle it" holding message to the **buyer**. No price content. (Now `ai_paused`-aware after VS4-3.)
4. **Price/offer:** the bot never discusses or relays price. The VISITED "make an offer" tap escalates to a human ("a team member will call you"). The LLM prompt says "facilitate price discussion, note offers/counteroffers" — but **no tool/field/handler backs it** (`system_prompt.ts:357-360`).
5. **Exit:** **no AI/cron auto-closes.** The "humne le li / deal done" closing-signal handler is **NEW/QUALIFIED-only** (`webhook_processor.ts:431`) → can't even reach a NEGOTIATION deal; when it does fire elsewhere it only → ON_HOLD + a super_boss verify task, never CLOSED_WON. The only automated exit is `runInactivitySweep` → ON_HOLD after 14 days.

### Human path (assigned member)
1. **The NEGOTIATION card** (orange): info line `⏱️ Last activity: Nd ago · ON_HOLD in (14-N)d` (an SLA countdown, no price). Buttons: **📝 Log Update** (free-text note) + **❌ Close as Lost**. **No "Close Won" button** — to win, drag to the hidden "Won" column or use workspace StageActions.
2. **Log Update** (`LogActionModal`): presets "Offer made by buyer" / "Counter offer from owner" / "Verbal agreement reached" — but all resolve to a plain `LOGGED_NOTE` with **no numeric amount**.
3. **Close:** `PATCH /api/deals/:id/status` (`act_on_deals`) `{status, reason}` → sets `closed_at`, logs `CLOSED`, fires WhatsApp/email to coordinator+customer. **No price, no commission, no owner notification.**
4. **CLOSED_LOST shortcut** sends **no reason** (just a confirm) → doesn't write `Contact.lost_reason`, no lead-score penalty, no win-back.
5. **After CLOSED_WON only:** "₹ Record Commissions" → `DealCommissionEntry` (a separate table, `manage_deals`) + "🏠 Transfer" ownership. Note: reports read the **legacy** `Transaction.commission_amount`, not `DealCommissionEntry` → commissions recorded here don't show in reports either.

---

## B. Resource / connection inventory (NEGOTIATION)
| Resource | Used for | Status |
|---|---|---|
| WhatsApp templates | `rp_negotiation_availability` (buyer entry), `rp_negotiation_nudge` (coordinator 48h), `rp_tx_followup_negotiation_v3` (buyer 72h), `rp_tx_deal_closed_v2` / `rp_deal_closed_lost` (close), `rp_deal_onhold` | LIVE (no seller-side negotiation template exists) |
| `rp_negotiation_inactive` | defined but **unused** (the sweep notifies via `rp_deal_onhold`) | orphaned |
| `Transaction.final_price` / `commission_amount` | read by all revenue reports; written **only** by legacy `completeNegotiateTask` | **broken on the shipped close path** |
| `DealCommissionEntry` table | live commission ledger via the post-close dialog | LIVE but **not read by reports.ts** |
| `Inventory.status` (active/sold/rented/withdrawn) | matcher filters `active`; never set to sold/rented by the deal flow | **never locked on deal** |
| Crons | `runNegotiationNudge` (once-ever), `runInactivitySweep` (14d→ON_HOLD) | LIVE |

---

## C. The errors / gaps (ranked)

1. **🔴 CRITICAL — property never marked unavailable → double-sell.** Nothing sets `inventory.status` to `sold`/`rented` on NEGOTIATION or CLOSED_WON (verified: the only writers are manual admin / owner-subscription `withdrawn`). `MatchingEngine` filters only `status:'active'` and share-dedup is **per-deal**, so a property under offer — or already won — is still matched + shared + cold-nudged to other buyers. Real broker embarrassment + simultaneous negotiations on one flat.
2. **🔴 CRITICAL — board close records no price/commission → ₹0 revenue.** `PATCH /:id/status` takes only `{status, reason}`; `final_price`/`commission_amount` are written only by the orphaned legacy `completeNegotiateTask` (not created by the shipped visit-outcome path). Every revenue/commission report (`reports.ts`, `analytics.ts`, `panditji_daily_briefing.ts`, `internal_tools.ts`) sums these nulls → **₹0 reported on genuinely won deals**. Plus a second split: post-close commissions go to `DealCommissionEntry`, which those reports don't read.
3. **🟠 HIGH — owner/seller never coordinated.** `supply_contact_id` is set at match then never used in NEGOTIATION: no entry notification, no "will you accept ₹X / still available?", no close notification. The `'supply_handler'` recipient type exists but is never instantiated. A two-sided negotiation is run entirely single-sided.
4. **🟠 HIGH — no offer/counter-offer record.** No offer amount / counter / ask-spread / agreed-price field anywhere. "NEGOTIATION" is a label over a black box — a manager can't see where any deal stands or report on stuck spreads. (The "Offer made" preset stores only free text.)
5. **🟠 — nothing drives a negotiation to conclusion.** One once-ever 48h coordinator nudge, then a 14-day drift to ON_HOLD. No value-based escalation (a ₹5Cr deal and a ₹15k rental get identical treatment), no scheduled negotiation call, no recurring push.
6. **🟡 — CLOSED_LOST loss intelligence thrown away.** The board "Close as Lost" captures no reason, doesn't set the structured `Contact.lost_reason`, applies no lead-score adjustment, and schedules no win-back.
7. **🟡 — paused deals are immortal.** `runInactivitySweep` skips `ai_paused` deals, so a human-paused-then-abandoned negotiation never gets the ON_HOLD backstop.

---

## D. Scope of improvements (for discussion — NOT yet built)
- **#1 Inventory lock (highest priority):** on NEGOTIATION entry mark the property `under_offer`/reserved (and exclude reserved from the matcher); on CLOSED_WON mark `sold`/`rented`; on CLOSED_LOST / back-to-QUALIFIED release it. Stops double-selling + showing sold listings. (May need an `under_offer` inventory status or a reserved flag.)
- **#2 Capture price + unify commissions:** make the close flow record `final_price` (a close dialog with the agreed amount) and either write the legacy scalars OR repoint reports at `DealCommissionEntry` — so revenue reports are real. Decide on ONE commission representation.
- **#3 Owner-side coordination:** seller templates + recipients (price/availability confirm on entry, close notification) so negotiation is genuinely two-sided.
- **#4 Offer ledger:** a structured offer/counter-offer record (amount, party, timestamp) surfaced in the workspace, so a manager sees the live spread.
- **#5 Drive-to-close:** recurring nudge + value-based escalation; **#6** structured loss capture + lead-score + win-back; **#7** ON_HOLD backstop for paused-and-stale deals.

**Verified:** inventory-status writers + `final_price`/`commission_amount` readers/writers grep-confirmed on 2026-06-22; funnel census (1 NEGOTIATION / 1 CLOSED_WON) from the Stage-4 prod pull.

---

## Resolution log

### ✅ Phase 1 — inventory lock (DONE + deployed + e2e-verified 2026-06-22)
Best-effort inventory-sync inside `transitionTransaction` (single chokepoint): → NEGOTIATION reserves a still-`active` property as **`under_offer`**; → CLOSED_WON → **`sold`/`rented`** (by deal.type); → CLOSED_LOST / back-to-QUALIFIED **releases** `under_offer`→`active` (never overrides sold/rented/withdrawn). `Inventory.status` is a plain string (no migration); the matcher + all public-listing queries filter `active`, so reserved/sold properties auto-drop from both. **Prod e2e** (throwaway, cleaned): NEGOTIATION→under_offer (excluded from active pool ✅), CLOSED_WON→sold ✅, CLOSED_LOST→active ✅, QUALIFIED-backout→active ✅. tsc 378 (0 new). **Gap #1 closed.**

### ✅ Phase 2 — capture price + fix revenue reporting (DONE + deployed + verified 2026-06-23)
Decision A implemented. **Backend:** `PATCH /:id/status` accepts + persists `final_price` on CLOSED_WON (validator extended); `commissionService.recordEntry` mirrors the running `DealCommissionEntry` total into the legacy `Transaction.commission_amount` the revenue reports read. **Frontend:** new `CloseWonDialog` (price input) wired into a ✅ Close Won card button (mobile+desktop), Stage Actions "Move to Won", and drag-to-Won. **Verified:** backend prod e2e (mirror 50k→50000, +30k→80000, final_price persists; cleaned); tsc -b + vite build clean; before/after live screenshots (no button → ✅ Close Won + price dialog) via a throwaway deal, cleaned. Gap #2 closed. (PWA SW: one refresh needed to load the new bundle.)

### ✅ Phase 3 — owner-side coordination (CODE DONE + deployed 2026-06-23; ⏳ awaiting Meta approval)
`deal_notifications.ts`: added a `supply_handler` recipient + seller-template branch. Owner notified on NEGOTIATION entry (`rp_negotiation_seller`) + CLOSED_WON (`rp_deal_closed_seller`); CLOSED_LOST sends nothing (NEG-1 lock returns inventory to active). WhatsApp-only (seller email gated off); best-effort (per-recipient catch isolates failures). Two templates registered + **submitted to Meta — status PENDING** (ids 1653327765938698, 1069686372061759). tsc 378 (0 new), deployed. **Delivery starts on Meta approval**; e2e deferred to post-approval. Gap #3 closed (pending approval).

### ✅ Phase 4a — loss capture + drive-to-close + paused backstop (DONE + deployed + verified 2026-06-23)
- **Loss capture** (`routes/deals.ts`): CLOSED_LOST persists `close_reason` + queues a 1h win-back (`rp_tx_followup_lost_v2`). No lead-score penalty (lost ≠ unreliable).
- **Drive-to-close** (`runNegotiationNudge`): nudge is now **recurring** (48h-bounded dedup, was once-ever) + **value escalation** (≥₹1 Cr stuck 3+ cycles → super_boss ping).
- **Paused backstop** (`runInactivitySweep`): paused + 21-day-idle deals escalate to the coordinator (HIGH task, deduped) — closes the "immortal paused deal" gap.
- Verified on prod: close_reason persists; paused query valid (matched 1 real stale-paused deal); cleaned. tsc 378 (0 new), deployed. Gaps #5/#6/#7 closed.

### ⏳ Phase 4b — offer/counter-offer ledger (DEFERRED to its own session)
A structured offer/counter record (amount, party, timestamp) + workspace UI — a real data+frontend feature; gap #4 remains open until then.
