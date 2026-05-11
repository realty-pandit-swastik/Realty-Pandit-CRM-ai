# Plan: Wire WhatsApp Templates into AI Agents

## Context
All 57 WhatsApp templates are approved/pending in Meta. However:
- 17 templates were recreated under new versioned names (_v2/_v3) — the registry still uses old names, breaking those send paths
- 6 new partner flow templates exist in the registry but have zero wiring — no agent knows when/how/to whom to send them
- The deal pipeline templates are partially wired (deal_notifications.ts) but partner notifications on deal events are missing

This plan wires everything after Meta approval.

---

## Phase 1 — Update name fields in registry (prerequisite, ~15 min)

**File:** `src/config/whatsapp_templates.ts`

Update the `name:` field (the string Meta sees) for 17 templates:

| Registry key | Old name field | New name field |
|---|---|---|
| rp_whatsapp_link | rp_whatsapp_link | rp_whatsapp_link_v2 |
| rp_partner_registered | rp_partner_registered | rp_partner_registered_v2 |
| rp_partner_welcome_confirmed | rp_partner_welcome_confirmed | rp_partner_welcome_v2 |
| rp_visit_agent_notify | rp_visit_agent_notify_v2 | rp_visit_agent_notify_v3 |
| rp_missed_call | rp_missed_call | rp_missed_call_v2 |
| rp_tx_followup_new | rp_tx_followup_new | rp_tx_followup_new_v2 |
| rp_tx_followup_matched | rp_tx_followup_matched | rp_tx_followup_matched_v2 |
| rp_tx_followup_visited | rp_tx_followup_visited | rp_tx_followup_visited_v2 |
| rp_tx_followup_negotiation | rp_tx_followup_negotiation | rp_tx_followup_negotiation_v2 |
| rp_tx_created | rp_tx_created | rp_tx_created_v2 |
| rp_tx_lead_assigned | rp_tx_lead_assigned | rp_tx_lead_assigned_v2 |
| rp_tx_match_buyer | rp_tx_match_buyer | rp_tx_match_buyer_v2 |
| rp_daily_report | rp_daily_report_v2 | rp_daily_report_v3 |
| rp_welcome_buyer | rp_welcome_buyer_v2 | rp_welcome_buyer_v3 |
| rp_welcome_seller | rp_welcome_seller_v2 | rp_welcome_seller_v3 |
| rp_reopen_session | rp_reopen_session_v2 | rp_reopen_session_v3 |
| rp_buyer_lead_received | rp_buyer_lead_received | rp_buyer_lead_received_v2 |

Also add missing new templates to registry if not already present:
- `rp_partner_login_otp_v2` (AUTHENTICATION)
- `rp_team_welcome_v4` (UTILITY, 2 params: name, manager)

---

## Phase 2 — Partner upload nudge + reminder (scheduled_worker.ts, ~30 min)

**File:** `src/services/scheduled_worker.ts`

Add two new cron jobs:

### Job 1: partner-upload-nudge (runs every hour)
```
Logic:
1. Query partners WHERE created_at BETWEEN (now-25h) AND (now-23h) AND property_count = 0
2. For each: sendTemplate(partner.wa_phone, 'rp_partner_upload_nudge', { name: partner.name })
3. Mark nudge_sent_at = now to prevent re-sending
```

### Job 2: partner-upload-reminder (runs every hour)
```
Logic:
1. Query partners WHERE nudge_sent_at BETWEEN (now-73h) AND (now-71h) AND property_count = 0
2. For each: sendTemplate(partner.wa_phone, 'rp_partner_upload_reminder', { name, coordinator })
3. coordinator = partner.assigned_executive.name
```

Schema assumption: Partner model has `nudge_sent_at`, `property_count` (or join to properties table). May need a migration if `nudge_sent_at` column doesn't exist.

---

## Phase 3 — Partner match notifications (deal_notifications.ts, ~30 min)

**File:** `src/services/deal_notifications.ts`

When a deal is matched (event = 'matched'), check if the property or buyer is partner-sourced and send the appropriate template:

### rp_partner_inventory_matched — notify partner whose property was matched
```
Trigger: deal.matched event AND deal.property.source_partner_id != null
Recipient: deal.property.source_partner.wa_phone
Params: { partner_name, buyer_name, property_title, price, location }
```

### rp_partner_client_matched — notify partner whose client was matched
```
Trigger: deal.matched event AND deal.buyer.referred_by_partner_id != null
Recipient: deal.buyer.referred_by_partner.wa_phone
Params: { partner_name, buyer_name, property_title, price }
```

Both fire alongside existing deal notifications (not instead of).

---

## Phase 4 — Team welcome (admin user creation route, ~15 min)

**File:** Find the admin route that creates team members (likely `src/routes/admin.ts` or `src/services/user_service.ts`)

After successful user creation:
```
sendTemplate(newUser.wa_phone, 'rp_team_welcome_v4', {
  name: newUser.name,
  manager: createdBy.name,
})
```
Only fire if `newUser.wa_phone` is set.

---

## Phase 5 — Partner login OTP (partner auth route, ~15 min)

**File:** Find where partner portal OTP is currently sent (likely `src/routes/partner_auth.ts` or similar)

Replace/supplement the current OTP send with:
```
sendTemplate(partner.wa_phone, 'rp_partner_login_otp_v2', { otp: generatedOTP })
```
AUTHENTICATION templates send the OTP via Meta's standard "Copy code" button format.

---

## Critical Files to Touch

| File | Change |
|---|---|
| `src/config/whatsapp_templates.ts` | Update 17 name fields + add 2 new templates |
| `src/services/scheduled_worker.ts` | Add 2 cron jobs (partner upload nudge + reminder) |
| `src/services/deal_notifications.ts` | Add partner match notification logic |
| `src/routes/admin.ts` OR `src/services/user_service.ts` | Fire team welcome on user create |
| `src/routes/partner_auth.ts` OR equivalent | Fire partner login OTP |

---

## Prerequisite Check Before Starting

Wait for Meta to approve:
- `rp_team_welcome_v4` (PENDING)
- `rp_whatsapp_invite_v2` (PENDING)

Everything else is already APPROVED — can start Phase 1–5 immediately.

---

## Verification

1. **Phase 1**: Run `npx ts-node -e "import { TEMPLATE_REGISTRY } from './src/config/whatsapp_templates'; console.log(Object.keys(TEMPLATE_REGISTRY).length)"` — should show 52+
2. **Phase 2**: Manually insert a test partner with `created_at = now-24h, property_count=0` and trigger the cron job — should receive nudge on WhatsApp
3. **Phase 3**: Create a test deal, set `matched` status — partner WhatsApp should receive match notification
4. **Phase 4**: Create a new team member via admin panel — their WhatsApp should receive welcome message
5. **Phase 5**: Trigger OTP flow for partner portal — OTP should arrive with Meta's "Copy code" button
