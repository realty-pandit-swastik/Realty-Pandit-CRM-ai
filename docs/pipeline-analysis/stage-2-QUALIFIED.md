# Deal Pipeline — Stage 2: QUALIFIED (match → share → get to a visit)

> As-is record of the QUALIFIED stage: what the AI and the human do, the resources, the coordination, and the disconnections. Built from a full code trace 2026-06-22 (3 parallel investigations, file:line-verified). Companion to `stage-1-NEW.md`. Codebase root: `agents/backend/src/` (frontend `agents/frontend/src/`).

## TL;DR
Once a deal is **QUALIFIED** (requirement captured, customer interested), the job is: **match inventory → share property cards → get the customer to a visit.** The AI auto-shares category-correct v5 cards (dedup'd, score-floored) and handles card-button taps; the human reviews matches in the Deal Workspace, shares manually, and books the visit. The single most fragile point is the **"Schedule Visit" handoff** — the deal flips to VISIT_SCHEDULED but **no Appointment is created** unless a human books it, so the highest-intent customer can silently fall through.

---

## A. What happens, in time order

### AI path (Panditji)
1. **Auto-share first card.** `shareNextProperty(dealId)` (`property_sharing.ts:91`) fires from 6 triggers: status→QUALIFIED (`routes/deals.ts:201`), WhatsApp auto-qualify (`webhook_processor.ts:512`), the 3b.3 anti-spam path (only on new-criteria/"more", F2), MatchingAgent (`matching_agent.ts:40`), voice qualify (`omnidim.ts:142`), buyer-workflow/recycler. **No QUALIFIED-entry cron — auto-share is always reactive.**
2. **Inside `shareNextProperty`:** load deal+contact criteria → **budget-sanity** re-ask if implausible → build **dedup set** (`property_shared` interactions) → `findMatches(criteria, 20)` → **MIN_MATCH_SCORE = 50** floor → send v5 card → log `property_shared`. Exhausted → template `rp_all_properties_shared`.
3. **Matching** (`matching_engine.ts:202`): hard filters = active · **price>0** · intent · sub_category/category (type) · budget **±30%** · geo **radius escalation 2→5→10→20km** · **BHK hard-filter (F2)**; scoring = budget(35)/location(25)/type(15)/taxonomy-distance(12)/bhk(8)/amenities(7)/scalars/area + **tier bonus** (INTERNAL>PREMIUM>…>FREE).
4. **Card buttons** (`property_card_reply_handler.ts`): **Next Option** → next card; **Call Back** → coordinator alert (`rp_callback_manager_alert`) + CALLBACK task; **Schedule Visit** → transition VISIT_SCHEDULED + `rp_visit_availability` + coordinator alert + VISIT_REQUEST task — **creates NO Appointment**.
5. **Cold-lead nudge cron** (`pipeline_crons.ts:192`, daily 10:20 IST): QUALIFIED >7d, `ai_paused:false`, skip if `teamActedRecently(7d)` → `rp_cold_buy_nudge`/`rp_cold_rent_nudge`.

### Human path (assigned member)
1. **Sees the deal** in the QUALIFIED column (`DealPipeline.tsx`): "🏠 N matches" badge, "Searching for match" / "🏘️ Matched: …", AI-status badge. Opens **Deal Workspace** — tabs: **Detail · Match & Share · Shared · WhatsApp Chat · Timeline**.
2. **Match & Share** (`MatchShareTab.tsx`): `GET /api/deals/:id/matched-inventory` (budget = **hard cap**, `already_shared` flagged, un-shared first) → multi-select → **Company WhatsApp** (`POST /:id/share-properties` → `shareSpecificProperty` → v5 template, **no score floor**) or **Personal WhatsApp** (`wa.me`, client-side, **no log**). "➕ Broaden" relaxes one axis. Card button **"📤 Share Property"** = `POST /:id/share-next-property` (`shareNextProperty`, score floor 50).
3. **Book a visit** (`POST /api/deals/:id/book-appointment`): pins inventory, → VISIT_SCHEDULED, **creates a REAL Appointment**, notifies customer (`rp_visit_confirmation_customer`) + coordinator (`rp_visit_booked_manager`) + key-holder (`rp_visit_keyholder_alert`, only if `key_holder_phone` set). **No Google Calendar event for the visit.**
4. **Edit Requirements** (`PATCH /:id/requirements`): writes deal + mirrors to Contact (SSOT) + logs `NEGOTIATION_UPDATE`; **does NOT itself re-run matching**.
5. **Workflow SHARE_PROPERTIES task** (stage 2, **24h SLA**, MEDIUM, notify on create): completed via `/workflow-tasks/:id/complete` → auto-creates the Stage-3 SCHEDULE_VISIT task.

All day-to-day QUALIFIED actions need **`act_on_deals`**; only deal-create + commissions need `manage_deals`. Inventory→client share is `authMiddleware` (any agent — marketplace).

---

## B. Resource / connection inventory (QUALIFIED)
| Resource | Service | Used for | Status |
|---|---|---|---|
| WhatsApp Cloud API v25.0 | `whatsapp.ts` | v5 cards + visit/keyholder/manager notifs + cold nudges | **LIVE** (mocked in dev) |
| v5 card templates | `config/whatsapp_templates.ts` | 8× `rp_property_card_{res\|com}{_plot}_{sale\|rent}_v5` (image + link + 3 buttons), v4/v2 fallback | **LIVE** (approved UTILITY) |
| Matching engine | `matching_engine.ts` | findMatches (top 20 auto / 50 UI), geo radius, F2 BHK filter | **LIVE** in-process |
| Postgres/Prisma | — | Transaction, Contact (demand SSOT), Inventory, **Appointment**, Interaction (share dedup), Task, LeadPropertyShortlist | **LIVE** |
| Google Calendar/Tasks | `google_sync.ts` | **reminders only** (opt-in per agent) — **NOT** the visit booking | LIVE, opt-in |
| Meta Product Catalog | `whatsapp.ts` | catalog send path (not the card path) | LIVE, env |
| Image-reachability fetch | `property_sharing.ts` | HEAD/GET probe before Meta send | LIVE |

---

## C. Coordination signals at QUALIFIED
`ai_paused` (hard pause) · `last_team_action_at` (soft back-off) · the shared **`property_shared`** ledger (dedup) · the SHARE_PROPERTIES task. The gaps are where one actor writes a signal the other doesn't read.

---

## D. The disconnections (ranked — for discussion)

1. **🔴 The visit handoff is the most fragile point (GAP 3).** "Schedule Visit" tap → deal flips to **VISIT_SCHEDULED but creates NO Appointment** (it waits for a human to book in the CRM). If the human ignores the 30-min VISIT_REQUEST task, the visit **silently evaporates** — every Stage-4 reminder/briefing is appointment-driven, so the customer gets no reminder and the manager no schedule line. The board shows "VISIT_SCHEDULED" but nothing is booked. Also: `book-appointment` has **no duplicate guard** → two bookings = duplicate reminder chains; and **no state distinguishes "visit requested" vs "visit booked."**
2. **🔴 New-inventory broadcast re-spams + bypasses the F2 fixes (GAP 5b).** `broadcastInventoryToQualifiedDeals` (`inventory_broadcast.ts`) has a **broken dedup** (`findFirst` with no `inventory_id` filter/order → can resend an already-shared property) AND uses the **legacy v2 template with no BHK hard-filter and no score floor** — re-introducing the off-BHK / low-relevance card-spam that F2 just closed, through a side door.
3. **🟠 The 7-day cold nudge fires on actively-engaged deals (GAP 4).** It keys on `updated_at` + `last_team_action_at`, but **AI auto-shares and plain customer replies advance neither** (only a captured *new requirement* bumps the transaction). So a deal where the bot is steadily sharing and the customer keeps tapping "Next Option" for 7+ days still gets *"do you still want a property?"* — reads as the company not paying attention.
4. **🟠 `ai_paused` is leaky — no single share chokepoint (GAP 1/2).** `shareNextProperty` (including the **"Next Option" card button**) **never checks `ai_paused`**. A human pauses the AI to take over a hot deal; the customer taps Next Option → the bot fires another card over the human. Manual share also doesn't check `ai_paused`.
5. **🟡 SHARE_PROPERTIES has a 24h SLA but no escalation (GAP 6).** Unlike CALLBACK/VISIT tasks (real breach job → super_boss), the Stage-2 task only sets a due date + dashboard count. If the human never shares, **nothing escalates** — the deal stalls silently until the (flawed) 7-day cold nudge.
6. **🟡 Editing requirements doesn't re-share (GAP 5a).** After "all properties shared", a human broadening budget/location does **not** re-match or re-engage the customer — the deal sits until a cron or the customer pokes it. (Contrast: the visit-outcome "Re-match" path *does* auto-share.)

**Mitigation already present:** the Match & Share UI flags `already_shared` + sorts un-shared first, so a human *looking at the screen* won't manually re-send a duplicate.

### Suggested fix priority
1. **Visit handoff (GAP 3)** — make "Schedule Visit" create a provisional Appointment (or a clear "visit requested" sub-state) + a duplicate-booking guard; this protects the highest-intent customers.
2. **New-inventory broadcast (GAP 5b)** — fix the dedup + route it through the same BHK-filter + score-floor + v5 path as `shareNextProperty`.
3. **Cold-nudge freshness (GAP 4)** — treat AI shares / customer replies as "activity" so engaged deals aren't nudged.
4. **`ai_paused` chokepoint (GAP 1/2)** — enforce the pause inside `shareNextProperty` (one place) so human takeover is honored everywhere.
5. **SHARE_PROPERTIES SLA (GAP 6)** + **re-share on requirements edit (GAP 5a)**.

---

## Resolution log
- **2026-06-22 — #1 (visit handoff, GAP 3): ✅ DONE + deployed + e2e-verified.** New `AppointmentStatus.requested`; "Schedule Visit" tap creates a provisional `requested` appointment (dup-guarded); customer day/time + human `book-appointment` both **find-or-update** the open appointment (one row, no double-book); slot-fill flips it to `scheduled` → reminders then fire. `requested` excluded from reminder/schedule crons by their existing status filter. ⏳ Board requested-vs-booked chip = frontend follow-up. See PROJECT_STATUS.
- **2026-06-22 — #2 (broadcast re-spam, GAP 5b): ✅ DONE + deployed.** `inventory_broadcast` rewritten: dedup on this-inventory↔this-deal, relevance via the same MatchingEngine + MIN_MATCH_SCORE(50) (F2 BHK + category + budget honoured), v5 card, skips `ai_paused`.
- **2026-06-22 — #3/#4/#5 + board chip: ✅ DONE + deployed.** #4 (GAP 1/2) `ai_paused` enforced inside `shareNextProperty` (one chokepoint; human share passes `bypassPause`) — verified paused→null on prod. #3 (GAP 4) cold nudge skips deals with a recent AI share or customer reply. #5a (GAP 5a) requirements edit re-shares (matching fields only). #5b (GAP 6) SHARE_PROPERTIES schedules a `task-sla-check` → super_boss escalation. Board chip: deal-list includes the latest non-terminal appointment → "🗓️ Visit requested · awaiting slot" vs "✅ Visit booked".
- **✅ QUALIFIED stage fully closed (#1–#5 + chip).** Next: VISIT_SCHEDULED / VISITED (Stage 3-4).
