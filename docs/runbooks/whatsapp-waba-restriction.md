# Runbook — WhatsApp account RESTRICTED (error 131031)

A different failure from [`whatsapp-token-rotation.md`](whatsapp-token-rotation.md). The token is
**valid**, the number is **connected**, every Meta status field reads healthy — and yet **not one
message is delivered**. This runbook exists because that combination sends you hunting in the wrong
place for hours.

## Symptom

- Leads get no reply; agents get no notifications; inventory shares never arrive.
- App logs look *normal* — `[WhatsAppService] Sending to …` appears for every message, because that
  line is written **before** the API call and `sendText()` swallows failures via the circuit breaker.
- The truth is in the delivery status callbacks:

```
[WA-Delivery] FAILED → 9199xxxxxxxx: [{"code":131031,"title":"Business Account locked",
  "error_data":{"details":"Business account has been locked."}}]
```

## ⚠ The trap: Meta's status APIs lie by omission

During a full restriction, every one of these still returned **healthy**:

| Field | Value while completely blocked |
|---|---|
| `health_status.can_send_message` | `AVAILABLE` (all 4 entities) |
| `quality_rating` | `GREEN` |
| `status` | `CONNECTED` |
| WABA `account_review_status` | `APPROVED` |
| WABA `status` | `ACTIVE` |

**Never conclude WhatsApp is healthy from the Graph API alone.** The restriction only surfaces in
the *send response* (`131031`) and in WhatsApp Manager's UI banner.

## Diagnose (fastest path)

```bash
# 1. THE definitive check — are sends being rejected, and with what code?
cd /var/www/realty-pandit/backend
grep -hoE '"code":13[0-9]{4}' logs/error-$(date +%Y-%m-%d).log | sort | uniq -c | sort -rn

# 2. Count the lock specifically, per day, to date the outage
for d in 13 14 15; do echo "07-$d: $(grep -hc 131031 logs/error-2026-07-$d.log)"; done
```

Then open **WhatsApp Manager → Phone numbers**. A red **"Account restricted"** banner is the
confirmation the API will not give you.

## Error codes you may see instead

| Code | Meaning | Action |
|---|---|---|
| `131031` | **Business Account locked** — policy restriction | This runbook |
| `131049` | Not delivered "to maintain healthy ecosystem engagement" | Quality throttle; reduce marketing volume |
| `131047` | Re-engagement — >24h since the customer last replied | Send an approved **template**, not free-form |
| `131026` | Message undeliverable (recipient not on WhatsApp) | Data quality |
| `130429` | Rate limit hit | Messaging tier cap |

## Fix

1. **Stop the violating activity first.** Appealing while it continues usually fails. In our case the
   cause was automated cold-outreach; disabled via `COLD_NUDGE_ENABLED` (see
   `services/pipeline_crons.ts#runColdLeadNudge`). Verify with:
   `grep -c 'rp_cold_.*_nudge' logs/combined-<date>.log` → must be **0** for a couple of days.
2. **Business Support Home** → the WhatsApp account restriction → **Request review**. Include what
   the activity was, that it is stopped, and the date it stopped. Reviews take ~24h.
3. After approval, confirm recovery: `131031` count for the day should be **0**.

## Aftermath — expect a wave of 131047

A multi-day lock lapses **everyone's** 24-hour customer-service window, so the first day back throws
`131047` on free-form sends — including internal notifications to **your own team** (lead alerts,
reminders, digests). It self-heals as each person messages the bot again.

**Structural fix:** internal notifications should use approved UTILITY **templates**, which deliver
outside the 24h window. Free-form `sendText()` to staff is inherently unreliable.

## Outage history

### 2026-07-13 → 2026-07-22 — WABA locked, "Sending spam" (9 days)
**Cause:** automated cold-lead re-engagement (`rp_cold_buy_nudge` / `rp_cold_rent_nudge`, ~50/day to
unengaged leads). Policy issue raised 12 Jul; 30-day restriction applied 13 Jul 06:38.
**Blast radius:** every outbound message, all channels — 1,278–1,498 failures/day.
**Masking:** quality was RED at first (→`131049`) and the number's `code_verification_status` was
EXPIRED, both of which looked like the cause and were not. Re-verifying the number and the rating
recovering to GREEN changed nothing, because the account-level lock was the real block.
**Fix:** cold nudges disabled 19 Jul (verified 0/day thereafter) → review requested → approved 22 Jul.
**Confirmed:** `131031` = 166 (20 Jul), 138 (21 Jul), **0** (22 Jul); 17 inbound messages processed
and replied to the same day.
