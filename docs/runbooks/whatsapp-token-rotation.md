---
name: WhatsApp Token History — Breaks & Fixes
description: History of WHATSAPP_TOKEN outages, root causes, and how to regenerate
type: project
---

## Token Location
`/var/www/realty-pandit/backend/.env` → `WHATSAPP_TOKEN=...`
WABA ID: `2124684824933246` | Phone ID: `1021151161081768`

## How to verify token health
```bash
curl "https://graph.facebook.com/v17.0/me?access_token=<TOKEN>"
# Valid: {"name":"WA","id":"122109540333282130"}
# Invalid: {"error":{"code":190,...}}
```

## How to regenerate token
1. Meta Business Suite → Settings → System Users → "WA" (ID: 61588463904863)
2. Click **Generate token** → select Panditji app (ID: 1868797817103904) → set expiry Never
3. Permissions needed: `whatsapp_business_messaging`, `whatsapp_business_management` (31 total pre-selected)
4. Phone verification required: SMS sent to +91 099999 92400 (Sunny's number)
5. Update `.env` on server + `pm2 restart realty-backend --update-env`

## Outage History

### 2026-04-20 — Token from deleted app (ERROR 190)
**Root cause:** Meta app was accidentally deleted 2026-04-16. New app created but `WHATSAPP_TOKEN` in `.env` was never updated — still pointed to deleted app. Circuit breaker tripped OPEN, all outbound WhatsApp blocked.
**Symptom:** `[WhatsAppService] Client error 401` on every send. `[CircuitBreaker:whatsapp] OPEN`.
**Fix:** New token `EAAajqWYL...` generated from WA system user, `.env` updated, backend restarted.

## Circuit Breaker
The WhatsApp service has a circuit breaker. After a 401/token error it goes OPEN and blocks all sends. It auto-resets after ~5 minutes (HALF_OPEN test). If you restart the backend, it resets immediately.

**Why:** `backend/src/services/whatsapp.ts` → `CircuitBreaker` wraps all outbound calls. A 401 immediately opens the breaker (non-retryable). A 400 or 5xx uses retry + backoff.
