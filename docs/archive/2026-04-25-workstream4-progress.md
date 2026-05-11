**Decision:** Full pipeline automation deployed to production 2026-04-25. All 6 stage KRAs wired.

**Why:** KRA specs (Stages 1–6) require per-stage AI messages, escalations, reminders, and cron-based automation.

---

## WhatsApp Template Status (as of 2026-04-26)

**Total on Meta: 84 templates**
- **76 APPROVED** — fully live
- **7 PENDING** — see below
- **3 REJECTED** — old superseded versions (`rp_partner_login_otp`, `rp_team_welcome`, `rp_team_welcome_v3`) — not in use, no impact

**New templates submitted 2026-04-26 (property cards):**
| Template | Status | Notes |
|---|---|---|
| `rp_property_card_sale_v2` | **APPROVED** ✅ | Sale properties — one-time price, structured body with emojis |
| `rp_property_card_rent_v2` | PENDING | Rent properties — per-month price |
| `rp_property_card_sale` | PENDING | v1 sale (superseded by v2, can ignore) |
| `rp_property_card_rent` | PENDING | v1 rent (superseded by v2, can ignore) |

**3 templates still PENDING from 2026-04-25:**
`rp_all_properties_shared`, `rp_visit_manager_1hr`, `rp_deal_onhold`

**19 templates had language/grammar fixes applied 2026-04-25 — RE-SUBMITTED & FIXED 2026-04-29.**
Per Puneet 2026-04-29: the 19 templates have been re-submitted to Meta and now reflect the corrected copy. No outstanding template-grammar work.
(For history: `rp_whatsapp_link`, `rp_partner_upload_nudge`, `rp_missed_call`, `rp_tx_match_buyer`, `rp_deal_status_update`, `rp_deal_query`, `rp_deal_query_answered`, `rp_new_listing`, `rp_cold_buy_nudge`, `rp_visit_confirmed_customer`, `rp_visit_reminder_24hr`, `rp_negotiation_availability`, `rp_tx_followup_negotiation`, `rp_tx_created`, `rp_tx_followup_visited`, `rp_deal_closed_lost`, `rp_appt_pending_customer`, `rp_tx_visit_reminder_2h`, `rp_partner_share_lead`.)

---

## Property Card Templates — Design Decisions (2026-04-26)

**Two templates, not one** — sale and rent have different pricing language:
- `rp_property_card_sale_v2` → shows `₹{{4}} (One-Time)`, CTA: "apna ghar aaj hi book karein"
- `rp_property_card_rent_v2` → shows `₹{{4}}/month`, CTA: "visit schedule karein aur ghar dekh lein"

**Body structure (both templates):**
```
🏡 *{{1}}* — {{2}}       ← BHK type — locality
📍 {{3}}                  ← city
💰 ₹{{4}} (One-Time/month)

✅ {{5}}                  ← furnishing / availability
🧭 {{6}}                  ← floor / facing
🏢 {{7}}                  ← top amenities

🔥/🔑 CTA line
```

**7 params mapped in `property_sharing.ts`:**
- p1 = BHK type, p2 = society/locality, p3 = city, p4 = formatted price
- p5 = furnishing or "Ready to Move/Available Now"
- p6 = floor or facing
- p7 = top 3 amenities from features array

**Template selection logic** (`services/property_sharing.ts`):
- `inv.intent === 'rent'` → `rp_property_card_rent_v2`
- otherwise → `rp_property_card_sale_v2`

**Sent test to 9958860411** — Sunny confirmed formatting looks good.

---

## Pipeline Automation — All 6 Stages Deployed

### Stage 1 NEW
- `services/lead_qualification_caller.ts` — BullMQ call cadence (immediate → 5min → 1hr → 3hr, business hours 8AM-9PM IST, max 8 attempts). `triggerOmnidimCall` stubbed.
- `deal_service.ts` — on NEW deal creation: fires `rp_buyer_lead_received_v2` + enqueues first call
- `routes/omnidim.ts` — 11 KRA outcomes wired
- Frontend: Mark as Qualified button on NEW kanban cards

### Stage 2 QUALIFIED
- `services/property_sharing.ts` — `shareNextProperty(dealId)` now uses `rp_property_card_sale_v2` / `rp_property_card_rent_v2` based on inventory intent
- Cold-lead nudge cron: daily 10:20 IST — RENT weekends only, BUY weekly then monthly
- Frontend: Share Next Property button on QUALIFIED cards

### Stage 3 MATCHING_APPOINTMENT
- Escalation cron every 30min: 3 reminders to coordinator (1hr cadence) → escalate to super_boss after 3 misses

### Stage 4 VISIT_SCHEDULED
- Visit reminders cron every 30min: 24hr + 2hr windows → `rp_visit_reminder_24hr` / `rp_visit_reminder_2hr`
- Key holder notified via `rp_visit_keyholder_v2` on VISIT_SCHEDULED entry
- Lead manager 8AM daily schedule cron (02:30 UTC)
- 24hr briefing cron (every 30min on :15/:45)

### Stage 5 VISITED
- `POST /api/deals/:id/visit-outcome` — 4 outcomes: Property Liked→NEGOTIATION, Want More→VISIT_SCHEDULED, Re-match→QUALIFIED+auto-share, No Show→VISIT_SCHEDULED+reschedule WhatsApp

### Stage 6 NEGOTIATION
- Entry WhatsApp `rp_negotiation_availability` wired via status_changed routing
- 48hr no-meeting nudge cron: daily 9:10 IST
- 14-day inactivity → ON_HOLD cron: daily 9:15 IST

---

## Existing Leads Problem (Discovered 2026-04-25)

**799 buyer contacts in DB, only 12 have deals.** 790 contacts have no deal — AI has never touched them. 762 of 790 are "warm" status.

**Root cause:** Deal creation was always manual. No auto-conversion on lead intake.

**Decision NOT yet made:** Do not backfill blindly — 762 WhatsApp messages + BullMQ jobs firing simultaneously is risky (spam risk, stale leads). Recommended approach:
1. Auto-wire new lead intake → deal creation (fix `routes/leads.ts`) so no future lead is missed
2. Controlled backfill of recent leads (last 30 days) or give Sunny a bulk-select UI
3. Sunny manually decides for older leads

**This fix has NOT been implemented yet. Pending Sunny's approval.**

---

## Phase 9 — Inventory Broadcast (COMPLETE ✅ 2026-04-27)

**What's built and deployed:**
- `services/inventory_broadcast.ts` — `broadcastInventoryToQualifiedDeals(inventoryId)`: finds all QUALIFIED deals, filters by intent/budget/location/BHK, sends `rp_property_card_sale_v2` or `rp_property_card_rent_v2`, logs Interaction, 200ms delay between sends
- `routes/inventory.ts` PATCH hook — fires fire-and-forget broadcast when `status → 'verified'`
- Both backend workers restarted, online (restarts=135)

**All 83 templates APPROVED on Meta as of 2026-04-27** (3 rejected = old superseded versions, no impact)

---

## Phase 10 — Daily Digest (BLOCKED)

Explicitly "TO BE DISCUSSED." Sunny needs to define: contents, recipients, delivery channel. Not started.

---

## Cron Schedule (all in `pipeline_crons.ts`)
- `*/30 * * * *` — MATCHING_APPOINTMENT escalation
- `*/30 * * * *` — Visit reminders (24hr + 2hr windows)
- `15,45 * * * *` — Manager 24hr briefing per visit
- `30 2 * * *` (8AM IST) — Manager daily schedule
- `40 3 * * *` (9:10 IST) — NEGOTIATION 48hr nudge
- `45 3 * * *` (9:15 IST) — NEGOTIATION 14-day inactivity sweep
- `50 4 * * *` (10:20 IST) — Cold-lead nudge

## Owner Action Items Remaining
1. Omnidim webhook secret + payload schema (for HMAC validation)
2. Decide lead backfill approach (auto-wire new leads + bulk migrate existing?) — 790 contacts, no deals
3. Phase 10 — daily digest contents, recipients, channel
4. ISP (iForce/Mylink) block recurs — email sent to jamil65403169@gmail.com + chetan.chauhan0910@gmail.com (2026-04-27)
